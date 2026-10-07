package services

import (
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const githubHost = "github.com"
const githubCredentialHelperKey = "credential.https://github.com.helper"

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
// using a credential store on Windows and a resolved gh fallback on other
// platforms. Windows avoids console flashes from grandchild helper processes.
func configureGitHubHTTPSCredentials(runner *CommandRunner) bool {
	if runner == nil {
		return false
	}

	// Prepare a usable replacement before removing the previous credential
	// source. Migration still runs when sign-in itself needs recovery.
	keepHelper, ok := prepareGitHubCredentialHelper(runner, runtime.GOOS == "windows")
	if !ok {
		return false
	}
	removeGhCredentialHelpersExcept(runner, keepHelper)

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

	credentialInput := "protocol=https\nhost=" + githubHost + "\nusername=x-access-token\npassword=" + token + "\n\n"
	approveResult := runner.RunWithStdin("", credentialInput, GitPath(), "credential", "approve")
	return approveResult.Success
}

// removeGhCredentialHelpers removes only github.com-specific global helpers
// invoking gh. Shared and other hosts' helpers may still supply credentials to
// other applications and must remain unchanged.
func removeGhCredentialHelpers(runner *CommandRunner) {
	removeGhCredentialHelpersExcept(runner, "")
}

func removeGhCredentialHelpersExcept(runner *CommandRunner, keepHelper string) {
	helpersByKey, ok := globalCredentialHelpers(runner)
	if !ok {
		return
	}
	sharedGhHelper := false
	for _, helper := range activeCredentialHelpers(helpersByKey["credential.helper"]) {
		sharedGhHelper = sharedGhHelper || strings.Contains(helper, "auth git-credential")
	}
	for key, helpers := range helpersByKey {
		if !isGitHubCredentialHelperKey(key) {
			continue
		}
		ghHelpers := make(map[string]struct{})
		hasOtherHelper := false
		hasReset := false
		for _, helper := range helpers {
			if strings.Contains(helper, "auth git-credential") {
				if helper != keepHelper {
					ghHelpers[helper] = struct{}{}
				}
			} else if helper == "" {
				hasReset = true
				hasOtherHelper = false // Earlier helpers were disabled by this reset.
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
		// A reset must remain when it shields github.com from a shared gh
		// helper. Otherwise restore inheritance if no unrelated helper remains
		// active after the last reset.
		if hasReset && !hasOtherHelper && !sharedGhHelper {
			runner.Run("", GitPath(), "config", "--global", "--fixed-value", "--unset-all", key, "")
		}
	}
}

func globalCredentialHelpers(runner *CommandRunner) (map[string][]string, bool) {
	result := runner.Run("", GitPath(), "config", "--global", "--null", "--get-regexp", `^credential(\..*)?\.helper$`)
	if !result.Success && result.ExitCode != 1 {
		return nil, false
	}
	helpersByKey := make(map[string][]string)
	// NUL separates records; the first newline separates each key and value.
	// Preserve exact values for literal removal, including whitespace.
	for _, entry := range strings.Split(result.Stdout, "\x00") {
		if key, value, ok := strings.Cut(entry, "\n"); ok {
			helpersByKey[key] = append(helpersByKey[key], value)
		}
	}
	return helpersByKey, true
}

func isGitHubCredentialHelperKey(key string) bool {
	if key == "credential.helper" {
		return false
	}
	credentialURL := strings.TrimSuffix(strings.TrimPrefix(key, "credential."), ".helper")
	u, err := url.Parse(credentialURL)
	return err == nil && strings.EqualFold(u.Hostname(), githubHost) && (u.Scheme == "https" || u.Scheme == "http")
}

func activeCredentialHelpers(helpers []string) []string {
	var active []string
	for _, helper := range helpers {
		if helper == "" {
			active = nil
		} else {
			active = append(active, helper)
		}
	}
	return active
}

// prepareGitHubCredentialHelper provisions a replacement before cleanup. It
// changes only github.com's chain, retaining shared stores and custom helpers.
func prepareGitHubCredentialHelper(runner *CommandRunner, windows bool) (string, bool) {
	helpersByKey, ok := globalCredentialHelpers(runner)
	if !ok {
		return "", false
	}
	combined := append(append([]string{}, helpersByKey["credential.helper"]...), helpersByKey[githubCredentialHelperKey]...)
	active := activeCredentialHelpers(combined)
	keepHelper := ""
	fallback := ""
	if windows {
		roots := credentialHelperSearchRoots(runner)
		for _, helper := range append(append([]string{}, active...), "manager", "manager-core", "wincred") {
			if isSupportedWindowsCredentialHelper(helper, roots) {
				fallback = helper
				break
			}
		}
		if fallback == "" {
			return "", false
		}
	} else {
		if !runner.Run("", GhPath(), "--version").Success {
			return "", false
		}
		fallback = "!'" + strings.ReplaceAll(GhPath(), "'", "'\\''") + "' auth git-credential"
		keepHelper = fallback
	}

	// A shared gh helper must remain for other hosts. If it is still active
	// for github.com, add a scoped reset and copy the surviving custom stores
	// after it so only github.com bypasses that shared command.
	sharedGhHelper := false
	for _, helper := range activeCredentialHelpers(helpersByKey["credential.helper"]) {
		sharedGhHelper = sharedGhHelper || (strings.Contains(helper, "auth git-credential") && helper != keepHelper)
	}
	for _, helper := range helpersByKey[githubCredentialHelperKey] {
		if helper == "" {
			sharedGhHelper = false
		}
	}
	toAdd := []string{}
	if sharedGhHelper {
		toAdd = append(toAdd, "")
		for _, helper := range active {
			if !strings.Contains(helper, "auth git-credential") || helper == keepHelper {
				toAdd = append(toAdd, helper)
			}
		}
	}
	hasFallback := false
	for _, helper := range active {
		hasFallback = hasFallback || helper == fallback
	}
	if !hasFallback {
		toAdd = append(toAdd, fallback)
	}
	for _, helper := range toAdd {
		if !runner.Run("", GitPath(), "config", "--global", "--add", githubCredentialHelperKey, helper).Success {
			return "", false
		}
	}
	return keepHelper, true
}

// credentialHelperSearchRoots returns the directories where credential helper
// executables may reside. Resolved once per migration.
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
// searchRoots. Migration must not assume an unlocated replacement is usable.
func isSupportedWindowsCredentialHelper(helper string, searchRoots []string) bool {
	helper = strings.ToLower(strings.TrimSpace(helper))
	if helper == "" {
		return false
	}

	if helper != "manager" && helper != "manager-core" && helper != "wincred" {
		return false
	}

	fileCandidates := []string{
		"git-credential-" + helper,
		"git-credential-" + helper + ".exe",
		"git-credential-" + helper + ".cmd",
		"git-credential-" + helper + ".bat",
	}

	for _, root := range searchRoots {
		for _, candidate := range fileCandidates {
			if info, err := os.Stat(filepath.Join(root, candidate)); err == nil && !info.IsDir() {
				return true
			}
		}
	}

	return false
}
