//go:build !windows

package main

import "fmt"

func runApplyWindowsInstallerPlatform(opts windowsInstallerApplyOptions) error {
	return fmt.Errorf("apply-windows-installer is supported on Windows only")
}
