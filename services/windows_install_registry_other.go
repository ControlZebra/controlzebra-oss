//go:build !windows

package services

// SyncWindowsInstallRegistryVersion is a no-op on non-Windows platforms.
func SyncWindowsInstallRegistryVersion(string) error {
	return nil
}
