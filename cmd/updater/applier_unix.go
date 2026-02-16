//go:build !windows

package main

import (
	"os"
	"syscall"
)

// isProcessRunningPlatform checks process liveness on Unix platforms via
// signal 0 (existence/permission check without delivering a signal).
func isProcessRunningPlatform(pid int) bool {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	err = proc.Signal(syscall.Signal(0))
	return err == nil
}
