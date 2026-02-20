package services

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const githubHost = "github.com"

// isGitHubHTTPSRemoteURL returns true when the remote points to GitHub over HTTPS.
func isGitHubHTTPSRemoteURL(remoteURL string) bool {
	remoteURL = strings.ToLower(strings.TrimSpace(remoteURL))
	if remoteURL == "" {
		return false
	}
	if !strings.Contains(remoteURL, githubHost) {
		return false
	}
	return strings.HasPrefix(remoteURL, "https://") || strings.HasPrefix(remoteURL, "http://")
}

// configureGitHubHTTPSCredentials configures non-interactive GitHub HTTPS auth
// without using gh's runtime credential helper shell hook. On Windows this avoids
// potential console flashes from grandchild helper processes.
func configureGitHubHTTPSCredentials(runner *CommandRunner) bool {
	if runner == nil {
		return false
	}

	// Only attempt setup when gh is authenticated.
	authStatus := runner.Run("", GhPath(), "auth", "status", "--hostname", githubHost)
	if !authStatus.Success {
		return false
	}

	// Remove gh shell-based credential helpers. We deliberately avoid
	// `gh auth setup-git` to prevent helper subprocess flashes.
	removeGhCredentialHelpers(runner)

	tokenResult := runner.Run("", GhPath(), "auth", "token", "--hostname", githubHost)
	if !tokenResult.Success {
		return false
	}

	token := strings.TrimSpace(tokenResult.Stdout)
	if token == "" {
		return false
	}

	if runtime.GOOS == "windows" {
		ensureWindowsCredentialHelper(runner)
	}

	credentialInput := "protocol=https\nhost=" + githubHost + "\nusername=x-access-token\npassword=" + token + "\n\n"
	approveResult := runner.RunWithStdin("", credentialInput, GitPath(), "credential", "approve")
	return approveResult.Success
}

// removeGhCredentialHelpers removes all credential.helper entries that invoke
// `gh auth git-credential` so git does not spawn gh as a helper process.
func removeGhCredentialHelpers(runner *CommandRunner) {
	result := runner.Run("", GitPath(), "config", "--global", "--get-all", "credential.helper")
	if !result.Success {
		return
	}

	for _, line := range strings.Split(result.Stdout, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if !strings.Contains(line, "auth git-credential") {
			continue
		}
		runner.Run("", GitPath(), "config", "--global", "--unset", "credential.helper", line)
	}
}

func ensureWindowsCredentialHelper(runner *CommandRunner) {
	// Resolve search roots once instead of per-helper to avoid repeated
	// git --exec-path subprocess spawns.
	searchRoots := credentialHelperSearchRoots(runner)

	result := runner.Run("", GitPath(), "config", "--global", "--get-all", "credential.helper")
	if result.Success {
		for _, line := range strings.Split(result.Stdout, "\n") {
			helper := strings.ToLower(strings.TrimSpace(line))
			if helper == "" || strings.Contains(helper, "auth git-credential") {
				continue
			}
			if isSupportedWindowsCredentialHelper(helper, searchRoots) {
				return
			}
			runner.Run("", GitPath(), "config", "--global", "--unset", "credential.helper", line)
		}
	}

	// Best effort fallback chain for Git for Windows variants.
	for _, helper := range []string{"manager", "manager-core", "wincred"} {
		if !isSupportedWindowsCredentialHelper(helper, searchRoots) {
			continue
		}
		if setResult := runner.Run("", GitPath(), "config", "--global", "credential.helper", helper); setResult.Success {
			return
		}
	}
}

// credentialHelperSearchRoots returns the directories where credential helper
// executables may reside. Resolved once per ensureWindowsCredentialHelper call.
func credentialHelperSearchRoots(runner *CommandRunner) []string {
	var roots []string
	execPathResult := runner.Run("", GitPath(), "--exec-path")
	if execPathResult.Success {
		if p := strings.TrimSpace(execPathResult.Stdout); p != "" {
			roots = append(roots, p)
		}
	}
	if gitDir := filepath.Dir(GitPath()); gitDir != "" {
		roots = append(roots, gitDir)
	}
	return roots
}

// isSupportedWindowsCredentialHelper returns true when the named helper is a
// known Git for Windows credential helper whose executable can be located in
// searchRoots. When searchRoots is empty (i.e. git --exec-path failed), all
// known helpers are assumed valid to avoid breaking a working configuration.
func isSupportedWindowsCredentialHelper(helper string, searchRoots []string) bool {
	helper = strings.ToLower(strings.TrimSpace(helper))
	if helper == "" {
		return false
	}

	if helper != "manager" && helper != "manager-core" && helper != "wincred" {
		return false
	}

	// When we cannot determine search paths, assume all known helpers
	// are available rather than arbitrarily rejecting some.
	if len(searchRoots) == 0 {
		return true
	}

	fileCandidates := []string{
		"git-credential-" + helper,
		"git-credential-" + helper + ".exe",
		"git-credential-" + helper + ".cmd",
		"git-credential-" + helper + ".bat",
	}

	for _, root := range searchRoots {
		for _, candidate := range fileCandidates {
			if _, err := os.Stat(filepath.Join(root, candidate)); err == nil {
				return true
			}
		}
	}

	return false
}
