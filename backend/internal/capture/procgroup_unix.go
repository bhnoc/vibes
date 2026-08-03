//go:build !windows

package capture

import (
	"log"
	"os"
	"os/exec"
	"syscall"
)

// Process-group control for the dumpcap probe and the supervised capture.
//
// Split out per platform because Setpgid and Kill(-pgid) are POSIX-only, and
// referencing them unguarded meant the whole backend would not compile on
// Windows — including the parts that have nothing to do with dumpcap.

// setProcessGroup makes the child its own process-group leader (pgid == its own
// pid) so the timeout path can signal the entire group rather than only the
// direct child. A descendant that forked would otherwise survive, reparented to
// init, which is the orphan the graceful-shutdown handling exists to prevent.
func setProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// killProcessGroup SIGKILLs an entire process group (a negative pid signals the
// group rather than one process). A no-op if pgid is invalid or the group has
// already gone (ESRCH).
func killProcessGroup(pgid int) {
	if pgid <= 0 {
		return
	}
	if err := syscall.Kill(-pgid, syscall.SIGKILL); err != nil && err != syscall.ESRCH {
		log.Printf("⚠️ preflight: failed to kill probe process group %d: %v", pgid, err)
	}
}

// terminateProcess asks for a graceful exit, so dumpcap gets the chance to
// flush and close its current capture file before it is killed outright.
func terminateProcess(p *os.Process) error {
	return p.Signal(syscall.SIGTERM)
}
