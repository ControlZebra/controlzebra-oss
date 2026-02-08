//go:build windows

package services

import "syscall"

// hideWindowAttr returns a SysProcAttr that prevents a console window from
// flashing on Windows when spawning child processes (git, gh, etc.).
// On Windows GUI apps every exec.Command for a console binary would otherwise
// briefly pop up a black cmd window.
func hideWindowAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}
