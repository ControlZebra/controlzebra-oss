//go:build windows

package main

import (
	"syscall"
)

const (
	processQueryLimitedInformation = 0x1000
	stillActiveExitCode            = 259 // STILL_ACTIVE
)

// isProcessRunningPlatform checks process liveness on Windows by opening a
// process handle and reading its exit code.
func isProcessRunningPlatform(pid int) bool {
	if pid <= 0 {
		return false
	}

	h, err := syscall.OpenProcess(processQueryLimitedInformation, false, uint32(pid))
	if err != nil {
		return false
	}
	defer syscall.CloseHandle(h)

	var exitCode uint32
	if err := syscall.GetExitCodeProcess(h, &exitCode); err != nil {
		return false
	}

	return exitCode == stillActiveExitCode
}
