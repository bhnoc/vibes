//go:build windows

package capture

import (
	"log"
	"os"
	"os/exec"
	"strconv"
)

// Windows equivalents of the POSIX process-group handling in procgroup_unix.go.
//
// Windows has no process groups in the POSIX sense and no signals, so the shapes
// match but the mechanisms differ: the job of "do not leave a descendant running"
// falls to taskkill's tree mode, and "ask nicely first" has no equivalent at all.

// setProcessGroup is a no-op. Windows offers job objects for the same purpose,
// which would be a heavier dependency than the probe path needs; killProcessTree
// below covers the descendant case instead.
func setProcessGroup(cmd *exec.Cmd) {}

// killProcessGroup terminates the process and everything it spawned. taskkill /T
// walks the child tree, which is the closest available analogue to signalling a
// process group.
func killProcessGroup(pid int) {
	if pid <= 0 {
		return
	}
	if err := exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(pid)).Run(); err != nil {
		log.Printf("⚠️ preflight: failed to kill probe process tree %d: %v", pid, err)
	}
}

// terminateProcess kills outright: Windows has no SIGTERM, and os.Process.Signal
// rejects everything except Kill. dumpcap therefore loses the chance to flush,
// which is why the caller still waits for the file to settle afterwards.
func terminateProcess(p *os.Process) error {
	return p.Kill()
}
