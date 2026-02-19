package services

import (
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
	result := runner.Run("", GitPath(), "config", "--global", "--get-all", "credential.helper")
	if result.Success {
		for _, line := range strings.Split(result.Stdout, "\n") {
			helper := strings.ToLower(strings.TrimSpace(line))
			if helper == "" || strings.Contains(helper, "auth git-credential") {
				continue
			}
			if helper == "manager" || helper == "manager-core" || helper == "wincred" || strings.Contains(helper, "manager") {
				return
			}
		}
	}

	// Best effort fallback chain for Git for Windows variants.
	for _, helper := range []string{"manager-core", "manager", "wincred"} {
		if setResult := runner.Run("", GitPath(), "config", "--global", "credential.helper", helper); setResult.Success {
			return
		}
	}
}
