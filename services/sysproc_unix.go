//go:build !windows

package services

import "syscall"

// hideWindowAttr is a no-op on non-Windows platforms.
// On macOS and Linux there is no console window to hide, so we return nil
// and the exec.Cmd uses its default process attributes.
func hideWindowAttr() *syscall.SysProcAttr {
	return nil
}
