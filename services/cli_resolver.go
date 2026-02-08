// Package services provides backend functionality for the ControlZebra application.
// This file contains the CLI resolver which locates bundled git & gh binaries
// shipped inside the app bundle (macOS) or install directory (Windows),
// falling back to the system PATH when no bundled copy is found.
package services

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
)

var (
	resolvedGit string
	resolvedGh  string
	resolveOnce sync.Once
)

// resolveCLIPaths runs once on first call and caches the resolved paths.
// Resolution order:
//  1. Bundled binary relative to the running executable.
//  2. System PATH lookup via exec.LookPath.
//  3. Bare command name ("git" / "gh") so exec.Command does its own lookup.
func resolveCLIPaths() {
	resolveOnce.Do(func() {
		execPath, err := os.Executable()
		if err != nil {
			log.Printf("[cli_resolver] could not determine executable path: %v", err)
			return
		}

		// Resolve symlinks so we get the real location inside the .app / install dir
		execPath, err = filepath.EvalSymlinks(execPath)
		if err != nil {
			log.Printf("[cli_resolver] could not resolve symlinks: %v", err)
			return
		}

		execDir := filepath.Dir(execPath)

		switch runtime.GOOS {
		case "darwin":
			// macOS .app bundle layout:
			//   Contents/MacOS/control-zebra        ← execDir
			//   Contents/Resources/git/bin/git
			//   Contents/Resources/gh/bin/gh
			resourcesDir := filepath.Join(execDir, "..", "Resources")
			tryResolve(&resolvedGit, filepath.Join(resourcesDir, "git", "bin", "git"))
			tryResolve(&resolvedGh, filepath.Join(resourcesDir, "gh", "bin", "gh"))

		case "windows":
			// Windows NSIS install layout:
			//   <install dir>/control-zebra.exe      ← execDir
			//   <install dir>/git/cmd/git.exe
			//   <install dir>/gh/gh.exe
			tryResolve(&resolvedGit, filepath.Join(execDir, "git", "cmd", "git.exe"))
			tryResolve(&resolvedGh, filepath.Join(execDir, "gh", "gh.exe"))
		}

		// Fall back to system PATH
		if resolvedGit == "" {
			if p, err := exec.LookPath("git"); err == nil {
				resolvedGit = p
			}
		}
		if resolvedGh == "" {
			if p, err := exec.LookPath("gh"); err == nil {
				resolvedGh = p
			}
		}

		log.Printf("[cli_resolver] git → %s", cliLabel(resolvedGit, "git"))
		log.Printf("[cli_resolver] gh  → %s", cliLabel(resolvedGh, "gh"))
	})
}

// GitPath returns the absolute path to the git binary (bundled or system).
// If neither is found it returns the bare "git" string so exec.Command
// performs its own PATH lookup (and produces a clear error on failure).
func GitPath() string {
	resolveCLIPaths()
	if resolvedGit != "" {
		return resolvedGit
	}
	return "git"
}

// GhPath returns the absolute path to the gh CLI binary (bundled or system).
func GhPath() string {
	resolveCLIPaths()
	if resolvedGh != "" {
		return resolvedGh
	}
	return "gh"
}

// ---------- helpers ----------

func tryResolve(target *string, candidate string) {
	if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
		*target = candidate
	}
}

func cliLabel(resolved, fallback string) string {
	if resolved != "" {
		return resolved
	}
	return fallback + " (PATH)"
}
