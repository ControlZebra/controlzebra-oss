package main

import (
	"path/filepath"
	"testing"
)

func TestResolveWindowsInstallDir(t *testing.T) {
	getenv := func(key string) string {
		switch key {
		case "LOCALAPPDATA":
			return `C:\Users\Tester\AppData\Local`
		case "USERPROFILE":
			return `C:\Users\Tester`
		default:
			return ""
		}
	}

	override := filepath.Clean(`D:\Apps\ControlZebra`)
	if got := resolveWindowsInstallDir(override, getenv); got != override {
		t.Fatalf("resolveWindowsInstallDir explicit override = %q", got)
	}

	want := filepath.Join(`C:\Users\Tester\AppData\Local`, "Programs", "ControlZebra")
	if got := resolveWindowsInstallDir("", getenv); got != want {
		t.Fatalf("resolveWindowsInstallDir default = %q", got)
	}
}

func TestResolveWindowsInstalledExecutablePath(t *testing.T) {
	installDir := filepath.Join(`C:\Users\Tester\AppData\Local`, "Programs", "ControlZebra")
	got := resolveWindowsInstalledExecutablePath(installDir)
	want := filepath.Join(installDir, "control-zebra.exe")
	if got != want {
		t.Fatalf("resolveWindowsInstalledExecutablePath = %q, want %q", got, want)
	}
}
