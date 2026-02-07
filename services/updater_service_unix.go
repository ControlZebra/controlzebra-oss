//go:build !windows

package services

import "syscall"

// detachedProcessAttr returns the SysProcAttr that makes the sidecar process
// survive after the main app exits. On Unix (macOS, Linux), we create a new
// session with Setsid so the child is fully detached from this process group.
func detachedProcessAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		Setsid: true,
	}
}
