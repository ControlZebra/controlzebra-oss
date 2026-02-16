package services

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const localBinAppDirName = "ControlZebra"

func localToolsRootPath() string {
	if runtime.GOOS == "windows" {
		if localAppData := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); localAppData != "" {
			return filepath.Join(localAppData, localBinAppDirName)
		}
		if home, err := os.UserHomeDir(); err == nil && strings.TrimSpace(home) != "" {
			return filepath.Join(home, "AppData", "Local", localBinAppDirName)
		}
	}

	if configDir, err := os.UserConfigDir(); err == nil && strings.TrimSpace(configDir) != "" {
		return filepath.Join(configDir, strings.ToLower(localBinAppDirName))
	}

	return filepath.Join(".", strings.ToLower(localBinAppDirName))
}

// LocalBinRootPath returns the managed user-level bin directory.
// On Windows this resolves to: %LOCALAPPDATA%\ControlZebra\bin
func LocalBinRootPath() string {
	return filepath.Join(localToolsRootPath(), "bin")
}

func localManagedGitPathCandidates() []string {
	root := LocalBinRootPath()
	return []string{
		filepath.Join(root, "git", "cmd", "git.exe"),
		filepath.Join(root, "git", "bin", "git.exe"),
	}
}

func localManagedGhPathCandidates() []string {
	root := LocalBinRootPath()
	return []string{
		filepath.Join(root, "gh.exe"),
		filepath.Join(root, "gh", "bin", "gh.exe"),
		filepath.Join(root, "gh", "gh.exe"),
	}
}

func localManagedLfsPathCandidates() []string {
	root := LocalBinRootPath()
	return []string{
		filepath.Join(root, "git-lfs.exe"),
		filepath.Join(root, "git", "mingw64", "bin", "git-lfs.exe"),
		filepath.Join(root, "git", "bin", "git-lfs.exe"),
	}
}

// localManagedPathPrepends returns candidate directories that should be prepended
// to PATH for child processes so local portable binaries are always discoverable.
func localManagedPathPrepends() []string {
	root := LocalBinRootPath()
	return []string{
		root,
		filepath.Join(root, "git", "cmd"),
		filepath.Join(root, "git", "bin"),
		filepath.Join(root, "git", "mingw64", "bin"),
		filepath.Join(root, "git", "clangarm64", "bin"),
		filepath.Join(root, "git", "usr", "bin"),
		filepath.Join(root, "gh", "bin"),
		filepath.Join(root, "gh"),
	}
}
