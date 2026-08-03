// backend/internal/capture/dumpcap_manager.go
package capture

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// preflightCaptureTimeout bounds the real-capture preflight probe (see
// Preflight). dumpcap is asked to autostop after 1s (-a duration:1); this is
// a hard ceiling in case it doesn't for some reason.
const preflightCaptureTimeout = 5 * time.Second

type DumpcapManagerConfig struct {
	Binary             string // default "dumpcap"
	Iface              string
	OutputDir          string
	FileSizeMB         int // per ring file, default 500
	RingFiles          int // ring length, default 20
	BufferMB           int // dumpcap -B, default 1024 (BH-2025-proven)
	RestartBackoffBase time.Duration
	// HealthyResetDuration is how long a child must stay alive for its death
	// to no longer compound the restart backoff (T5-backoff spec: "reset
	// after 60s healthy"). Default 60s. Exposed here (rather than hardcoded)
	// so tests can inject a short threshold instead of waiting a real 60s.
	HealthyResetDuration time.Duration
}

// syncStderr is a concurrency-safe io.Writer used to capture a child's
// stderr. It is written to by a background copy goroutine (see
// launchLocked/supervise) while supervise may concurrently read it to build
// an error message, so all access is mutex-guarded.
type syncStderr struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (s *syncStderr) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.buf.Write(p)
}

func (s *syncStderr) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.buf.String()
}

type DumpcapManagerStatus struct {
	Running   bool
	PID       int
	Restarts  int
	LastError string
}

// errManagerStopping is returned by launchLocked (and thus may surface from
// Start) when a launch is skipped because Stop has already been called. It
// is not a real failure — see the DumpcapManager doc comment ("stopping
// race") — so callers such as supervise's restart path must not treat it as
// a supervision failure.
var errManagerStopping = errors.New("dumpcap manager is stopping")

// DumpcapManager launches and supervises a dumpcap child process, restarting
// it with backoff if it dies unexpectedly, and shutting it down cleanly on
// Stop.
//
// # Single waiter
//
// The process is reaped exactly once, by the supervise goroutine, via
// cmd.Process.Wait() (not cmd.Wait() — see "stderr capture" below for why).
// Stop never waits on the process itself; it synchronizes with supervise via
// waitDone (closed by supervise right after the wait call returns), since
// only one goroutine may ever wait on a given *os.Process.
//
// # Stopping race (Finding 1)
//
// supervise's restart path re-acquires m.mu twice after leaving its backoff
// select (once to bump restarts, once inside launchLocked to start the new
// child) — a window in which a concurrent Stop() could otherwise slip past
// unnoticed and let a new child spawn after Stop() already declared the
// manager stopped, leaking an orphan process. launchLocked closes this
// window by checking m.stopping as the first thing it does under m.mu
// (which it holds for its entire body): since Stop() also mutates
// stopping/cmd only under m.mu, whichever of the two wins the lock
// determines the outcome, and in both orderings no child is spawned after a
// completed Stop().
//
// # stderr capture (Finding 4)
//
// supervise reaps via cmd.Process.Wait() rather than cmd.Wait() because
// cmd.Wait() additionally blocks until the pipes feeding cmd.Stdout/Stderr
// see EOF, which does not happen until every process holding the write end
// exits — including grandchildren that inherited the fd (e.g. a child shell
// backgrounding a long-lived process). A dumpcap child that outlives its
// immediate parent via such a descendant would otherwise wedge Stop() until
// that descendant exits (observed directly: a test fixture forking `sleep
// 60` made Stop() take a full 60s under the naive cmd.Wait() approach).
//
// Bypassing cmd.Wait() means we own the stderr pipe ourselves (via
// cmd.StderrPipe(), drained by our own goroutine into a syncStderr) rather
// than letting Cmd manage it. After cmd.Process.Wait() returns, supervise
// gives that drain goroutine a short bounded window (stderrDrainGrace) to
// finish copying — in the overwhelmingly common case the child's own exit
// closes its fd 2 (the pipe's write end) and EOF follows within
// microseconds, so this window makes capture deterministic in practice.
// The wait is bounded, not unconditional, specifically so a descendant that
// inherited fd 2 cannot reintroduce the same hang cmd.Wait() had: if the
// window elapses, supervise proceeds with whatever was captured so far
// (forcing the drain goroutine to unblock by closing the pipe reader),
// accepting a truncated message only in that rare pathological case.
type DumpcapManager struct {
	cfg      DumpcapManagerConfig
	mu       sync.Mutex
	cmd      *exec.Cmd
	waitDone chan struct{} // closed by supervise after cmd.Process.Wait() returns, for this launch
	stopping bool
	stopped  bool // guards Stop() so a second call is a safe no-op (Finding 2)
	restarts int
	// consecutiveRestarts drives the exponential backoff (T5-backoff spec
	// deviation fix). Unlike restarts (the monotonic lifetime counter
	// reported by Status()), this resets to 0 whenever the child that just
	// died had been running for >= cfg.HealthyResetDuration — so a capture
	// that's been healthy for a while doesn't inherit a maxed-out backoff
	// from restarts months earlier in the process's lifetime.
	consecutiveRestarts int
	launchTime          time.Time // when the current/most recent child was started
	lastErr             string
	stopCh              chan struct{}
}

func NewDumpcapManager(cfg DumpcapManagerConfig) *DumpcapManager {
	if cfg.Binary == "" {
		cfg.Binary = "dumpcap"
	}
	if cfg.FileSizeMB <= 0 {
		cfg.FileSizeMB = 500
	}
	// RingFiles: >0 caps the ring at N files (oldest overwritten); ==0 means
	// retain-all (rotate by size, never delete — for archival captures);
	// <0 is treated as "unset" and gets the default cap.
	if cfg.RingFiles < 0 {
		cfg.RingFiles = 20
	}
	if cfg.BufferMB <= 0 {
		cfg.BufferMB = 1024
	}
	if cfg.RestartBackoffBase <= 0 {
		cfg.RestartBackoffBase = time.Second
	}
	if cfg.HealthyResetDuration <= 0 {
		cfg.HealthyResetDuration = 60 * time.Second
	}
	return &DumpcapManager{cfg: cfg, stopCh: make(chan struct{})}
}

func dumpcapArgs(cfg DumpcapManagerConfig) []string {
	out := filepath.Join(cfg.OutputDir, fmt.Sprintf("vibes_%s.pcap", cfg.Iface))
	args := []string{
		"-i", cfg.Iface,
		"-P",
		"-B", fmt.Sprintf("%d", cfg.BufferMB),
		"-b", fmt.Sprintf("filesize:%d", cfg.FileSizeMB*1024), // dumpcap unit: KB
	}
	// Cap the ring only when RingFiles > 0. RingFiles == 0 → retain all files
	// (rotate by size, never wrap) for archival captures.
	if cfg.RingFiles > 0 {
		args = append(args, "-b", fmt.Sprintf("files:%d", cfg.RingFiles))
	}
	args = append(args, "-w", out)
	return args
}

func preflightAdvice(goos string) string {
	switch goos {
	case "darwin":
		return "On macOS install ChmodBPF (bundled with Wireshark: 'Install ChmodBPF' package) or run the backend with sudo."
	default:
		return "On Linux grant capture rights: sudo setcap cap_net_raw,cap_net_admin=eip $(which dumpcap) — or run the backend with sudo."
	}
}

// Preflight verifies dumpcap can actually capture on the configured
// interface. This deliberately does NOT use `dumpcap -D` (list interfaces):
// enumerating interfaces does not require the same permission as opening one
// for capture (e.g. on macOS, `-D` succeeds without ChmodBPF; only actually
// reading from /dev/bpf* requires it), so a `-D`-only probe can pass while
// the real, supervised capture launch fails — invisibly, since Start()
// already returned success by the time that failure surfaces. Instead this
// runs a real, bounded capture attempt (autostop after 1 packet or 1 second,
// output discarded) so a permission failure is caught synchronously, before
// Start() ever returns. Failure is actionable, never silent.
//
// If no interface is configured, there is nothing to capture-probe against,
// so this falls back to the enumerate-only check.
func (m *DumpcapManager) Preflight() error {
	if m.cfg.Iface == "" {
		return m.preflightEnumerate()
	}

	ctx, cancel := context.WithTimeout(context.Background(), preflightCaptureTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, m.cfg.Binary, "-i", m.cfg.Iface, "-c", "1", "-a", "duration:1", "-w", "-")
	// Make the probe its own process-group leader (pgid == its own pid) so
	// that on the timeout path below we can kill the *whole* group, not just
	// this direct child. exec.CommandContext's default on-cancel behavior
	// only Kill()s the direct child — a descendant that forked (e.g. a shell
	// wrapper backgrounding a long-lived process) would survive that,
	// reparented to init/launchd: exactly the orphaned-process failure mode
	// the graceful-shutdown fix (main.go's SIGINT/SIGTERM handler) exists to
	// prevent for the supervised launch. Without this, the "still running at
	// the hard ceiling" pass branch below could leak such an orphan every
	// time it's taken.
	setProcessGroup(cmd)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	cmd.Stdout = io.Discard

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("dumpcap preflight failed: could not start probe: %v. %s", err, preflightAdvice(runtime.GOOS))
	}
	var pgid int
	if cmd.Process != nil {
		// Setpgid:true above guarantees pgid == the child's own pid.
		pgid = cmd.Process.Pid
	}

	// Wait on its own goroutine rather than a synchronous cmd.Run()/cmd.Wait():
	// cmd.Wait() additionally blocks until stdout/stderr see EOF, which does
	// not happen until every process holding the write end exits — including
	// a descendant that inherited the fd (the exact "stderr capture" gotcha
	// documented on DumpcapManager above, for the same reason). Waiting on a
	// goroutine lets the ctx.Done() branch below return promptly at the hard
	// ceiling even if such a descendant is still holding stdio open.
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	var runErr error
	select {
	case runErr = <-done:
		// Process (and everything holding its stdio open) exited on its own;
		// nothing left running in its group to clean up.
	case <-ctx.Done():
		// Hard ceiling hit. Explicitly kill the whole process group — do not
		// rely on exec.CommandContext's default kill, which only reaches the
		// direct child (see the SysProcAttr comment above) and would leave
		// any forked descendant as a live orphan.
		killProcessGroup(pgid)
		// Give the wait goroutine a brief grace period to reap the direct
		// child now that it (and its group) have been signaled, so no
		// zombie is left behind; proceed regardless of whether it finishes
		// in time — surviving to the ceiling at all already means it got
		// past any permission check, so there's nothing further to learn
		// from stderr here.
		select {
		case <-done:
		case <-time.After(500 * time.Millisecond):
		}
		return nil
	}

	detail := strings.TrimSpace(stderr.String())
	if runErr == nil || strings.Contains(detail, "0 packets") || strings.Contains(detail, "packets captured") {
		// Clean exit, or dumpcap got far enough to print a capture summary —
		// either way it was reading from the interface, so permissions are OK.
		return nil
	}

	if detail == "" {
		detail = runErr.Error()
	}
	return fmt.Errorf("dumpcap preflight failed: %s. %s", detail, preflightAdvice(runtime.GOOS))
}

// setProcessGroup, killProcessGroup and terminateProcess are platform-specific;
// see procgroup_unix.go and procgroup_windows.go. Preflight's timeout path uses
// them to guarantee no descendant of the probe process survives as an orphan.

// preflightEnumerate is the fallback probe used only when no interface is
// configured (so a real capture attempt isn't possible). It only confirms
// dumpcap exists and can enumerate interfaces — weaker than the real-capture
// probe in Preflight, see its doc comment.
func (m *DumpcapManager) preflightEnumerate() error {
	cmd := exec.Command(m.cfg.Binary, "-D")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = err.Error()
		}
		return fmt.Errorf("dumpcap preflight failed: %s. %s", detail, preflightAdvice(runtime.GOOS))
	}
	return nil
}

func (m *DumpcapManager) Start() error {
	if err := m.Preflight(); err != nil {
		return err
	}
	if err := os.MkdirAll(m.cfg.OutputDir, 0755); err != nil {
		return fmt.Errorf("cannot create dumpcap output dir: %w", err)
	}
	if err := m.launchLocked(); err != nil {
		// launchLocked only ever returns nil once m.cmd is set (see its doc
		// comment: every other path returns a non-nil error), so there is no
		// nil-cmd case to guard against here.
		return err
	}
	m.mu.Lock()
	pid := m.cmd.Process.Pid
	m.mu.Unlock()
	log.Printf("✅ dumpcap launched (pid %d): %s %s", pid, m.cfg.Binary, strings.Join(dumpcapArgs(m.cfg), " "))
	return nil
}

// stderrDrainGrace bounds how long supervise waits, after reaping the
// process, for the stderr-drain goroutine to finish copying — see the
// "stderr capture" section of the DumpcapManager doc comment.
const stderrDrainGrace = 200 * time.Millisecond

// launchLocked either starts a new child and sets m.cmd, returning nil, or
// leaves m.cmd exactly as it found it (nil on first launch, nil again if a
// restart's cmd.Start() failed — see Finding 3 below) and returns a non-nil
// error. Callers can therefore rely on "err == nil" implying "m.cmd is the
// newly started process".
func (m *DumpcapManager) launchLocked() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.stopping {
		// Finding 1: Stop() won the race for m.mu — do not spawn a child
		// that nothing will ever signal to stop.
		return errManagerStopping
	}
	cmd := exec.Command(m.cfg.Binary, dumpcapArgs(m.cfg)...)
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create dumpcap stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		// Finding 3: clear m.cmd (it may still be pointing at the previous,
		// already-dead process during a restart) so Status() does not keep
		// reporting Running=true with a stale PID after a failed restart.
		m.cmd = nil
		m.waitDone = nil
		m.lastErr = fmt.Sprintf("dumpcap failed to start: %v", err)
		log.Printf("❌ %s", m.lastErr)
		return fmt.Errorf("failed to start dumpcap: %w", err)
	}
	stderr := &syncStderr{}
	copyDone := make(chan struct{})
	go func() {
		io.Copy(stderr, stderrPipe)
		close(copyDone)
	}()
	m.cmd = cmd
	m.launchTime = time.Now()
	waitDone := make(chan struct{})
	m.waitDone = waitDone
	go m.supervise(cmd, stderr, waitDone, stderrPipe, copyDone)
	return nil
}

// supervise is the single waiter for cmd: it owns cmd.Process.Wait() for the
// entire lifetime of this launch's process and closes waitDone once Wait
// returns, which is how Stop learns the process has exited without itself
// waiting on it (that would race with this goroutine's call). See the
// DumpcapManager doc comment for the full rationale, including why this is
// cmd.Process.Wait() and not cmd.Wait().
func (m *DumpcapManager) supervise(cmd *exec.Cmd, stderr *syncStderr, waitDone chan struct{}, stderrPipe io.ReadCloser, copyDone chan struct{}) {
	// Note: unlike cmd.Wait(), the error returned by cmd.Process.Wait() does
	// NOT reflect a non-zero exit code or termination by signal — it is only
	// non-nil on a wait4(2) syscall failure. Exit status must be read from
	// the returned *os.ProcessState instead (this is exactly what
	// cmd.Wait()/exec.ExitError does internally).
	ps, waitErr := cmd.Process.Wait()
	close(waitDone)

	// Bounded wait for the stderr-drain goroutine — see "stderr capture" on
	// the DumpcapManager doc comment. Deterministic in the normal case,
	// bounded (not hung) in the pathological one.
	select {
	case <-copyDone:
	case <-time.After(stderrDrainGrace):
	}
	stderrPipe.Close() // release our read end; also unblocks a still-running drain goroutine

	m.mu.Lock()
	stopping := m.stopping
	// T5-backoff: if the child that just died had been running for at least
	// HealthyResetDuration, treat it as having recovered — reset the
	// consecutive-restart counter before computing this death's backoff, so
	// a long-lived capture doesn't inherit a maxed-out (up to 30s) backoff
	// from a burst of restarts long in the past. m.restarts (the monotonic
	// lifetime counter reported by Status()) is untouched.
	if !m.launchTime.IsZero() && time.Since(m.launchTime) >= m.cfg.HealthyResetDuration {
		m.consecutiveRestarts = 0
	}
	switch {
	case waitErr != nil:
		m.lastErr = fmt.Sprintf("dumpcap wait failed: %v", waitErr)
	case ps == nil || !ps.Success():
		m.lastErr = fmt.Sprintf("dumpcap exited: %v — stderr: %s", ps, strings.TrimSpace(stderr.String()))
	default:
		m.lastErr = "dumpcap exited cleanly"
	}
	consecutiveRestarts := m.consecutiveRestarts
	m.mu.Unlock()
	if stopping {
		return
	}
	backoff := m.cfg.RestartBackoffBase * (1 << uint(minInt(consecutiveRestarts, 5)))
	if backoff > 30*time.Second {
		backoff = 30 * time.Second
	}
	log.Printf("❌ %s — restarting in %s", m.lastErr, backoff)
	select {
	case <-m.stopCh:
		return
	case <-time.After(backoff):
	}
	m.mu.Lock()
	m.restarts++
	m.consecutiveRestarts++
	m.mu.Unlock()
	if err := m.launchLocked(); err != nil && !errors.Is(err, errManagerStopping) {
		log.Printf("❌ dumpcap restart failed: %v", err)
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (m *DumpcapManager) Stop() {
	m.mu.Lock()
	if m.stopped {
		// Finding 2: a second Stop() is a safe no-op rather than a double
		// close(m.stopCh) panic.
		m.mu.Unlock()
		return
	}
	m.stopped = true
	m.stopping = true
	cmd := m.cmd
	waitDone := m.waitDone
	m.mu.Unlock()
	close(m.stopCh)
	if cmd == nil || cmd.Process == nil {
		return
	}
	if err := terminateProcess(cmd.Process); err != nil {
		log.Printf("⚠️ dumpcap terminate signal failed (pid %d): %v", cmd.Process.Pid, err)
	}
	if waitDone != nil {
		select {
		case <-waitDone:
		case <-time.After(3 * time.Second):
			if err := cmd.Process.Kill(); err != nil {
				// Finding 5: Kill() can fail (e.g. the process reaped itself
				// between our timeout firing and the call landing). Don't
				// assume waitDone will now close promptly — bound the final
				// wait too, so Stop() always returns.
				log.Printf("⚠️ dumpcap kill failed (pid %d, may already be gone): %v", cmd.Process.Pid, err)
			}
			select {
			case <-waitDone:
			case <-time.After(3 * time.Second):
				log.Printf("⚠️ dumpcap did not report exited within the final grace period — giving up waiting")
			}
		}
	}
	log.Printf("🛑 dumpcap stopped")
}

func (m *DumpcapManager) Status() DumpcapManagerStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := DumpcapManagerStatus{Restarts: m.restarts, LastError: m.lastErr}
	if m.cmd != nil && m.cmd.Process != nil && !m.stopping {
		s.Running = true
		s.PID = m.cmd.Process.Pid
	}
	return s
}
