// backend/internal/capture/dumpcap_manager_test.go
//
// POSIX-only: these tests assert process-group semantics (signalling a whole
// group, probing liveness with signal 0) that Windows does not have. The manager
// itself builds and runs on Windows via procgroup_windows.go.
//go:build !windows

package capture

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestDumpcapArgs(t *testing.T) {
	cfg := DumpcapManagerConfig{
		Iface: "en0", OutputDir: "/data/pcaps",
		FileSizeMB: 500, RingFiles: 20, BufferMB: 1024,
	}
	args := dumpcapArgs(cfg)
	joined := strings.Join(args, " ")
	for _, want := range []string{
		"-i en0", "-P", "-B 1024",
		"-b filesize:512000", // 500 MB in KB — dumpcap's filesize unit is KB
		"-b files:20",
		"-w /data/pcaps/vibes_en0.pcap",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("args missing %q in %q", want, joined)
		}
	}

	// RingFiles == 0 → retain-all: rotate by size, no files: cap.
	retain := dumpcapArgs(DumpcapManagerConfig{
		Iface: "ens3np0", OutputDir: "/data/bhusa2026",
		FileSizeMB: 2000, RingFiles: 0, BufferMB: 1024,
	})
	rj := strings.Join(retain, " ")
	if !strings.Contains(rj, "-b filesize:2048000") {
		t.Errorf("retain-all missing size rotation in %q", rj)
	}
	if strings.Contains(rj, "files:") {
		t.Errorf("retain-all must NOT cap the ring (no files:), got %q", rj)
	}
}

func TestPreflightAdvice(t *testing.T) {
	if !strings.Contains(preflightAdvice("darwin"), "ChmodBPF") {
		t.Error("darwin advice must mention ChmodBPF")
	}
	linux := preflightAdvice("linux")
	if !strings.Contains(linux, "setcap") && !strings.Contains(linux, "sudo") {
		t.Error("linux advice must mention setcap or sudo")
	}
}

// fakeScript writes an executable shell script and returns its path.
func fakeScript(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "fake-dumpcap")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body+"\n"), 0755); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestManagerPreflightFailure(t *testing.T) {
	bin := fakeScript(t, `echo "no permission" >&2; exit 2`)
	m := NewDumpcapManager(DumpcapManagerConfig{Binary: bin, Iface: "x", OutputDir: t.TempDir()})
	err := m.Preflight()
	if err == nil {
		t.Fatal("expected preflight error")
	}
	if !strings.Contains(err.Error(), "no permission") {
		t.Errorf("error should include child stderr, got: %v", err)
	}
}

// TestPreflightRealCaptureRejectsPermissionError exercises the actual
// capture-probe path (Iface set, so Preflight runs the real-capture-attempt
// branch, not the -D-only enumerate fallback). A script that mimics
// dumpcap's real behavior when it can enumerate interfaces fine (so a -D
// probe would have wrongly passed) but fails to actually open the device for
// capture must make Preflight fail, quoting the permission error.
func TestPreflightRealCaptureRejectsPermissionError(t *testing.T) {
	bin := fakeScript(t, `if [ "$1" = "-i" ]; then echo "dumpcap: You do not have permission to capture on device" >&2; exit 1; fi; echo "1. lo"; exit 0`)
	m := NewDumpcapManager(DumpcapManagerConfig{Binary: bin, Iface: "en0", OutputDir: t.TempDir()})
	err := m.Preflight()
	if err == nil {
		t.Fatal("expected preflight error for a permission-denied capture attempt")
	}
	if !strings.Contains(err.Error(), "permission") {
		t.Errorf("error should surface the permission-denied stderr, got: %v", err)
	}
	if !strings.Contains(err.Error(), "ChmodBPF") && !strings.Contains(err.Error(), "setcap") {
		t.Errorf("error should include platform-specific preflight advice, got: %v", err)
	}
}

// TestPreflightRealCapturePassesWhenStillRunningAtTimeout covers the safety
// net for a probe that outlives the hard ceiling (dumpcap's own -a
// duration:1 should stop it well before this, but if it doesn't, that means
// it got past the permission check and is actively reading from the
// interface, so it must count as a pass, not a hang or a false failure) AND
// that no descendant process survives the timeout as an orphan.
//
// The fake script forks a real *descendant* `sleep 60` (backgrounded, pid
// recorded to a file) distinct from the script's own direct process, which
// also keeps running past the hard ceiling. exec.CommandContext's default
// on-cancel behavior only Kill()s the direct child — a naive fix would pass
// this test's err/elapsed assertions while still leaking the backgrounded
// descendant as an orphan (reparented to init/launchd), exactly the failure
// mode the process-group kill exists to close. The final poll loop is what
// actually catches that: it fails unless the whole group, including the
// descendant, was killed.
func TestPreflightRealCapturePassesWhenStillRunningAtTimeout(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "descendant.pid")
	bin := fakeScript(t, fmt.Sprintf(`if [ "$1" = "-i" ]; then
  sleep 60 &
  echo $! > %q
  sleep 60
fi
echo "1. lo"
exit 0`, pidFile))
	m := NewDumpcapManager(DumpcapManagerConfig{Binary: bin, Iface: "en0", OutputDir: t.TempDir()})
	start := time.Now()
	err := m.Preflight()
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("expected preflight to pass when the probe is still running at the hard timeout, got: %v", err)
	}
	if elapsed < 4*time.Second {
		t.Errorf("expected preflight to wait out the ~%s hard timeout before passing, only took %s", preflightCaptureTimeout, elapsed)
	}

	pidBytes, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatalf("fake script did not record its descendant pid: %v", err)
	}
	descendantPID, err := strconv.Atoi(strings.TrimSpace(string(pidBytes)))
	if err != nil {
		t.Fatalf("bad descendant pid recorded in %s: %q: %v", pidFile, string(pidBytes), err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for {
		killErr := syscall.Kill(descendantPID, 0)
		if killErr == syscall.ESRCH {
			return // descendant reaped along with the rest of its process group — no orphan left behind
		}
		if time.Now().After(deadline) {
			t.Fatalf("descendant pid %d still alive 2s after Preflight returned — process-group kill did not reach it, orphan leaked", descendantPID)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestManagerRestartsOnDeath(t *testing.T) {
	// The capture-preflight probe (args: -i <iface> -c 1 ...) succeeds; the
	// real supervised launch (args: -i <iface> -P ...) dies immediately.
	bin := fakeScript(t, `if [ "$3" = "-c" ]; then echo "1. lo"; exit 0; fi; echo "boom" >&2; exit 1`)
	m := NewDumpcapManager(DumpcapManagerConfig{
		Binary: bin, Iface: "lo", OutputDir: t.TempDir(),
		RestartBackoffBase: 10 * time.Millisecond,
	})
	if err := m.Start(); err != nil {
		t.Fatal(err)
	}
	defer m.Stop()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if m.Status().Restarts >= 2 {
			return // supervised restart works
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("expected >=2 restarts, got %d", m.Status().Restarts)
}

func TestManagerStopKillsChild(t *testing.T) {
	bin := fakeScript(t, `if [ "$3" = "-c" ]; then exit 0; fi; sleep 60`)
	m := NewDumpcapManager(DumpcapManagerConfig{
		Binary: bin, Iface: "lo", OutputDir: t.TempDir(),
		RestartBackoffBase: 10 * time.Millisecond,
	})
	if err := m.Start(); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	pid := m.Status().PID
	if pid <= 0 {
		t.Fatal("expected live child PID")
	}
	m.Stop()
	time.Sleep(200 * time.Millisecond)
	if m.Status().Running {
		t.Fatal("manager still running after Stop")
	}
	// Signal 0 probes existence without actually signaling; ESRCH means the
	// child (and, since it was the process group leader / direct child, its
	// process) is gone. This is deterministic, unlike os.Process.Signal with
	// a nil signal.
	err := syscall.Kill(pid, 0)
	if err != syscall.ESRCH {
		t.Fatalf("expected child pid %d to be gone (ESRCH), got err=%v", pid, err)
	}
}

// countLaunches counts newline-delimited entries appended to path by the
// fake script, treating a missing file as zero launches so far.
func countLaunches(t *testing.T, path string) int {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return 0
		}
		t.Fatal(err)
	}
	if len(data) == 0 {
		return 0
	}
	return len(strings.Split(strings.TrimRight(string(data), "\n"), "\n"))
}

// Finding 1: a restart racing with Stop() must never spawn a new child.
// Without the m.stopping check inside launchLocked (taken under the same
// mutex Stop() uses), a restart whose backoff timer fires concurrently with
// Stop() can slip past the stopCh check in supervise's select and launch an
// orphan that nothing will ever signal to stop.
func TestManagerStopDuringBackoffDoesNotSpawnOrphan(t *testing.T) {
	countFile := filepath.Join(t.TempDir(), "launches")
	bin := fakeScript(t, fmt.Sprintf(`if [ "$3" = "-c" ]; then exit 0; fi; echo x >> %q; exit 1`, countFile))
	m := NewDumpcapManager(DumpcapManagerConfig{
		Binary: bin, Iface: "lo", OutputDir: t.TempDir(),
		RestartBackoffBase: 100 * time.Millisecond,
	})
	if err := m.Start(); err != nil {
		t.Fatal(err)
	}
	// The first launch dies almost instantly and enters its 100ms backoff.
	// Call Stop() close to when that backoff would fire, to exercise the
	// race window described above as tightly as a test reasonably can.
	time.Sleep(90 * time.Millisecond)
	m.Stop()
	countAtStop := countLaunches(t, countFile)
	// If the fix were absent, a racing restart would fire within roughly
	// one more backoff period; wait well past that and confirm no growth.
	time.Sleep(500 * time.Millisecond)
	countAfter := countLaunches(t, countFile)
	if countAfter != countAtStop {
		t.Fatalf("child spawned after Stop() returned: %d launches at Stop, %d after waiting (orphan leaked)", countAtStop, countAfter)
	}
	if m.Status().Running {
		t.Fatal("manager reports Running after Stop()")
	}
}

// Finding 2: a second Stop() call must be a safe no-op, not a panic from a
// double close(m.stopCh).
func TestManagerDoubleStopDoesNotPanic(t *testing.T) {
	bin := fakeScript(t, `if [ "$3" = "-c" ]; then exit 0; fi; sleep 60`)
	m := NewDumpcapManager(DumpcapManagerConfig{
		Binary: bin, Iface: "lo", OutputDir: t.TempDir(),
		RestartBackoffBase: 10 * time.Millisecond,
	})
	if err := m.Start(); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)
	m.Stop()
	m.Stop() // must not panic
	if m.Status().Running {
		t.Fatal("manager reports Running after Stop()")
	}
}

// Finding 3: if a supervised restart's cmd.Start() itself fails (as opposed
// to the child starting and later dying), Status() must not keep reporting
// Running=true against the previous, already-dead process — and LastError
// must explain why.
func TestManagerStatusReflectsFailedRestart(t *testing.T) {
	bin := fakeScript(t, `if [ "$3" = "-c" ]; then exit 0; fi; exit 1`)
	m := NewDumpcapManager(DumpcapManagerConfig{
		Binary: bin, Iface: "lo", OutputDir: t.TempDir(),
		RestartBackoffBase: 50 * time.Millisecond,
	})
	if err := m.Start(); err != nil {
		t.Fatal(err)
	}
	defer m.Stop()
	// Let the first child die and start its backoff, then make the binary
	// non-executable so the pending restart's cmd.Start() itself fails.
	time.Sleep(20 * time.Millisecond)
	if err := os.Chmod(bin, 0644); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		s := m.Status()
		if !s.Running && strings.Contains(s.LastError, "failed to start") {
			return // Status correctly reflects the failed restart
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("expected Status to report a failed restart, got %+v", m.Status())
}

// T5-backoff: the restart backoff must reset after a child has been healthy
// (alive) for >= HealthyResetDuration, rather than compounding forever off
// the monotonic lifetime restart count. Launches 1 and 2 die immediately
// (compounding the consecutive-restart counter); launch 3 lives past the
// injected short HealthyResetDuration before dying, which must reset the
// counter, so the delay before launch 4 collapses back down near the base
// backoff instead of continuing to grow.
func TestManagerBackoffResetsAfterHealthyChild(t *testing.T) {
	countFile := filepath.Join(t.TempDir(), "launches")
	bin := fakeScript(t, fmt.Sprintf(`if [ "$3" = "-c" ]; then echo "1. lo"; exit 0; fi
echo x >> %q
n=$(wc -l < %q)
if [ "$n" -ge 3 ]; then
  sleep 0.2
fi
exit 1`, countFile, countFile))
	m := NewDumpcapManager(DumpcapManagerConfig{
		Binary: bin, Iface: "lo", OutputDir: t.TempDir(),
		RestartBackoffBase:   40 * time.Millisecond,
		HealthyResetDuration: 150 * time.Millisecond,
	})
	if err := m.Start(); err != nil {
		t.Fatal(err)
	}
	defer m.Stop()

	// Poll the launches file and stamp a wall-clock time the first moment
	// each new launch is observed, so we can measure inter-launch delays
	// without relying on the (BSD date has no portable sub-second) shell.
	var timestamps []time.Time
	seen := 0
	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) && len(timestamps) < 4 {
		n := countLaunches(t, countFile)
		for seen < n {
			timestamps = append(timestamps, time.Now())
			seen++
		}
		time.Sleep(2 * time.Millisecond)
	}
	if len(timestamps) < 4 {
		t.Fatalf("expected 4 launches within the deadline, observed %d", len(timestamps))
	}

	delta34 := timestamps[3].Sub(timestamps[2])
	t.Logf("inter-launch deltas: 1->2=%s 2->3=%s 3->4=%s",
		timestamps[1].Sub(timestamps[0]), timestamps[2].Sub(timestamps[1]), delta34)

	// Launch 3 lived ~200ms (its sleep) before dying, past the 150ms
	// HealthyResetDuration, so it must reset consecutiveRestarts to 0 before
	// the backoff for launch 4 is computed. Without the fix,
	// consecutiveRestarts would still be 2 at that point (from launches 1
	// and 2 dying immediately), giving a backoff of base*2^2=160ms on top of
	// the 200ms sleep — delta34 >= ~360ms. With the fix it collapses to
	// base*2^0=40ms on top of the 200ms sleep — delta34 ~= 240ms.
	if delta34 >= 320*time.Millisecond {
		t.Fatalf("delta34 = %s, want < 320ms — backoff did not reset after a healthy (>=150ms-lived) child", delta34)
	}
	if delta34 < 150*time.Millisecond {
		t.Fatalf("delta34 = %s, suspiciously low — launch 3 should have lived ~200ms before its backoff-delayed successor", delta34)
	}
}

// Finding 4: stderr from a dying child must be captured in full, not
// truncated by a race between supervise reading it and the background copy
// goroutine still writing it.
func TestManagerCapturesFullStderrOnRestart(t *testing.T) {
	bin := fakeScript(t, `if [ "$3" = "-c" ]; then exit 0; fi; echo "boom with full detail attached" >&2; exit 1`)
	m := NewDumpcapManager(DumpcapManagerConfig{
		Binary: bin, Iface: "lo", OutputDir: t.TempDir(),
		RestartBackoffBase: 10 * time.Millisecond,
	})
	if err := m.Start(); err != nil {
		t.Fatal(err)
	}
	defer m.Stop()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(m.Status().LastError, "boom with full detail attached") {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("expected LastError to contain full stderr, got %q", m.Status().LastError)
}
