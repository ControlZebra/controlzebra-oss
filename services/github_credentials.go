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

	// Migrate stale shell helpers even when sign-in needs recovery. Leaving them
	// installed would keep Git invoking an obsolete bundled gh path.
	removeGhCredentialHelpers(runner)

	// Only attempt setup when gh is authenticated.
	authStatus := runner.Run("", GhPath(), "auth", "status", "--hostname", githubHost)
	if !authStatus.Success {
		return false
	}

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

// removeGhCredentialHelpers removes generic and URL-specific global helpers
// invoking gh. A reset belonging only to removed helpers must also be removed
// so Git can fall back to the inherited credential store. Other helper chains,
// including their reset entries and ordering, are preserved.
func removeGhCredentialHelpers(runner *CommandRunner) {
	result := runner.Run("", GitPath(), "config", "--global", "--null", "--get-regexp", `^credential(\..*)?\.helper$`)
	if !result.Success {
		return
	}

	// Git's NUL-delimited format separates each key from its value with a
	// newline. Do not trim values: --fixed-value needs their exact contents.
	helpersByKey := make(map[string][]string)
	for _, entry := range strings.Split(result.Stdout, "\x00") {
		key, value, ok := strings.Cut(entry, "\n")
		if ok {
			helpersByKey[key] = append(helpersByKey[key], value)
		}
	}
	for key, helpers := range helpersByKey {
		ghHelpers := make(map[string]struct{})
		hasOtherHelper := false
		hasReset := false
		for _, helper := range helpers {
			if strings.Contains(helper, "auth git-credential") {
				ghHelpers[helper] = struct{}{}
			} else if helper == "" {
				hasReset = true
			} else {
				hasOtherHelper = true
			}
		}
		if len(ghHelpers) == 0 {
			continue
		}
		for helper := range ghHelpers {
			// Literal matching handles Windows backslashes, regex characters,
			// and duplicate entries without affecting unrelated helpers.
			runner.Run("", GitPath(), "config", "--global", "--fixed-value", "--unset-all", key, helper)
		}
		if hasReset && !hasOtherHelper {
			runner.Run("", GitPath(), "config", "--global", "--fixed-value", "--unset-all", key, "")
		}
	}
}

func ensureWindowsCredentialHelper(runner *CommandRunner) {
	// Resolve search roots once instead of per-helper to avoid repeated
	// git --exec-path subprocess spawns.
	searchRoots := credentialHelperSearchRoots(runner)

	result := runner.Run("", GitPath(), "config", "--global", "--null", "--get-all", "credential.helper")
	if result.Success {
		hasSupportedHelper := false
		for _, helper := range strings.Split(strings.TrimSuffix(result.Stdout, "\x00"), "\x00") {
			if helper == "" {
				hasSupportedHelper = false // Git resets all preceding helpers.
			} else if isSupportedWindowsCredentialHelper(helper, searchRoots) {
				hasSupportedHelper = true
			}
		}
		if hasSupportedHelper {
			return
		}
	}

	// Append an available store without replacing unrelated user helpers.
	for _, helper := range []string{"manager", "manager-core", "wincred"} {
		if !isSupportedWindowsCredentialHelper(helper, searchRoots) {
			continue
		}
		if setResult := runner.Run("", GitPath(), "config", "--global", "--add", "credential.helper", helper); setResult.Success {
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
