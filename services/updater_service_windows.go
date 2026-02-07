//go:build windows

package services

import "syscall"

// detachedProcessAttr returns the SysProcAttr that makes the sidecar process
// survive after the main app exits. On Windows, CREATE_NO_WINDOW (0x08000000)
// prevents a console window from flashing, and CREATE_NEW_PROCESS_GROUP
// (0x00000200) detaches it from the parent's console group.
func detachedProcessAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		CreationFlags: 0x08000000 | 0x00000200, // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
	}
}
