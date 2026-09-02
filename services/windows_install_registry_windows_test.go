//go:build windows

package services

import (
	"fmt"
	"os"
	"testing"
	"time"
)

func TestSyncWindowsInstallRegistryVersionMissingKeyIsNoOp(t *testing.T) {
	missingPath := fmt.Sprintf(`%s-TestMissing-%d-%d`, windowsUninstallRegistryPath, os.Getpid(), time.Now().UnixNano())
	if err := syncWindowsInstallRegistryVersion(missingPath, "1.2.3"); err != nil {
		t.Fatalf("syncWindowsInstallRegistryVersion() error = %v", err)
	}
}
