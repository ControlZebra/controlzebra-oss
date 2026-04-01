package main

import (
	"os"
	"path/filepath"
	"strings"
)

const controlZebraWindowsExecutableName = "control-zebra.exe"

func resolveWindowsInstallDir(override string, getenv func(string) string) string {
	if trimmed := strings.TrimSpace(override); trimmed != "" {
		return trimmed
	}

	localAppData := strings.TrimSpace(getenv("LOCALAPPDATA"))
	if localAppData != "" {
		return filepath.Join(localAppData, "Programs", "ControlZebra")
	}

	userProfile := strings.TrimSpace(getenv("USERPROFILE"))
	if userProfile != "" {
		return filepath.Join(userProfile, "AppData", "Local", "Programs", "ControlZebra")
	}

	home, err := os.UserHomeDir()
	if err == nil && strings.TrimSpace(home) != "" {
		return filepath.Join(home, "AppData", "Local", "Programs", "ControlZebra")
	}

	return filepath.Join(".", "ControlZebra")
}

func resolveWindowsInstalledExecutablePath(installDir string) string {
	return filepath.Join(installDir, controlZebraWindowsExecutableName)
}
