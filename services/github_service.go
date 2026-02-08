// Package services provides backend functionality for the ControlZebra application.
// This file contains the GitHubService which wraps GitHub CLI (gh) operations.
package services

import (
	"bufio"
	"context"
	"encoding/json"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// GitHubService provides GitHub CLI (gh) operations
type GitHubService struct {
	runner *CommandRunner

	// Auth process tracking
	authMu      sync.Mutex
	authCmd     *exec.Cmd
	authCancel  context.CancelFunc
	authStarted bool
}

// NewGitHubService creates a new GitHubService instance
func NewGitHubService() *GitHubService {
	return &GitHubService{
		runner: NewCommandRunner(),
	}
}

// ============================================================================
// Types
// ============================================================================

// GitHubAuthStatus represents the authentication status for GitHub
type GitHubAuthStatus struct {
	LoggedIn    bool   `json:"loggedIn"`
	Username    string `json:"username,omitempty"`
	AccountType string `json:"accountType,omitempty"` // "user" or "org"
	Protocol    string `json:"protocol,omitempty"`    // "https" or "ssh"
	Host        string `json:"host,omitempty"`        // e.g., "github.com"
	Token       string `json:"token,omitempty"`       // Masked or partial token
	Scopes      string `json:"scopes,omitempty"`      // Token scopes
	Error       string `json:"error,omitempty"`
}

// GitHubRepo represents a GitHub repository
type GitHubRepo struct {
	Name            string `json:"name"`
	FullName        string `json:"fullName"` // owner/repo format
	Description     string `json:"description"`
	URL             string `json:"url"`
	SSHURL          string `json:"sshUrl"`
	CloneURL        string `json:"cloneUrl"`
	Private         bool   `json:"private"`
	Fork            bool   `json:"fork"`
	Archived        bool   `json:"archived"`
	DefaultBranch   string `json:"defaultBranch"`
	Language        string `json:"language"`
	StargazersCount int    `json:"stargazersCount"`
	ForksCount      int    `json:"forksCount"`
	UpdatedAt       string `json:"updatedAt"`
	CreatedAt       string `json:"createdAt"`
}

// GitHubRepoListResult represents the result of listing repositories
type GitHubRepoListResult struct {
	Success bool         `json:"success"`
	Repos   []GitHubRepo `json:"repos"`
	Error   string       `json:"error,omitempty"`
}

// GitHubAuthResult represents the result of an auth operation
type GitHubAuthResult struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

// GitHubDeviceFlowResult represents the device flow authentication state
type GitHubDeviceFlowResult struct {
	Success         bool   `json:"success"`
	UserCode        string `json:"userCode,omitempty"`        // The one-time code user needs to enter
	VerificationURL string `json:"verificationUrl,omitempty"` // URL to visit for authentication
	Error           string `json:"error,omitempty"`
}

// GitHubRepoCreateOptions contains options for creating a new repository
type GitHubRepoCreateOptions struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Private     bool   `json:"private"`
	Clone       bool   `json:"clone"`     // Clone the repo after creation
	ClonePath   string `json:"clonePath"` // Path to clone to (if Clone is true)
	AddReadme   bool   `json:"addReadme"` // Initialize with README
	GitIgnore   string `json:"gitIgnore"` // .gitignore template name
	License     string `json:"license"`   // License template name
}

// GitHubRepoCreateResult represents the result of creating a repository
type GitHubRepoCreateResult struct {
	Success  bool       `json:"success"`
	Repo     GitHubRepo `json:"repo,omitempty"`
	CloneDir string     `json:"cloneDir,omitempty"` // Local path if cloned
	Error    string     `json:"error,omitempty"`
}

// GitHubCloneResult represents the result of cloning a repository
type GitHubCloneResult struct {
	Success  bool   `json:"success"`
	CloneDir string `json:"cloneDir,omitempty"` // Local path where repo was cloned
	Error    string `json:"error,omitempty"`
}

// GitHubOrganization represents a GitHub organization
type GitHubOrganization struct {
	Login       string `json:"login"`       // Organization slug/name
	Name        string `json:"name"`        // Display name
	Description string `json:"description"` // Organization description
}

// GitHubOrganizationsResult represents the result of listing organizations
type GitHubOrganizationsResult struct {
	Success       bool                 `json:"success"`
	Username      string               `json:"username"`      // The authenticated user's username
	Organizations []GitHubOrganization `json:"organizations"` // Organizations the user belongs to
	Error         string               `json:"error,omitempty"`
}

// ============================================================================
// CLI Detection
// ============================================================================

// IsGHInstalled checks if the GitHub CLI (gh) is installed and available
func (g *GitHubService) IsGHInstalled() bool {
	result := g.runner.Run("", GhPath(), "--version")
	return result.Success
}

// GetGHVersion returns the installed GitHub CLI version
func (g *GitHubService) GetGHVersion() string {
	result := g.runner.Run("", GhPath(), "--version")
	if !result.Success {
		return ""
	}
	// Output format: "gh version 2.40.1 (2024-01-01)"
	lines := strings.Split(result.Stdout, "\n")
	if len(lines) > 0 {
		return strings.TrimSpace(lines[0])
	}
	return ""
}

// ============================================================================
// Authentication
// ============================================================================

// AuthLogin initiates the GitHub authentication flow using device code.
// This runs the gh auth login command and waits for completion.
// The flow shows a code that the user must enter in their browser.
func (g *GitHubService) AuthLogin() GitHubAuthResult {
	// Use device flow (no --web flag) to get the verification code
	// We need a longer timeout for auth since user interaction is involved
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, GhPath(), "auth", "login", "--hostname", "github.com", "--git-protocol", "https")

	// We need to handle the interactive prompts
	// The gh CLI will output the verification code to stderr
	output, err := cmd.CombinedOutput()

	if err != nil {
		outputStr := string(output)
		// Check if it's a context timeout
		if ctx.Err() == context.DeadlineExceeded {
			return GitHubAuthResult{
				Success: false,
				Error:   "Authentication timed out. Please try again.",
			}
		}
		return GitHubAuthResult{
			Success: false,
			Error:   getErrorFromOutput(outputStr, err),
		}
	}

	return GitHubAuthResult{
		Success: true,
		Message: "Authentication successful",
	}
}

// AuthLoginStart initiates the device code authentication flow.
// Returns the user code and verification URL for the user to complete auth in browser.
// After calling this, call AuthLoginComplete to wait for the auth to finish.
// The gh CLI process will continue running in the background until the user completes auth.
func (g *GitHubService) AuthLoginStart() GitHubDeviceFlowResult {
	// Cancel any existing auth process first (hold lock briefly)
	g.authMu.Lock()
	if g.authCancel != nil {
		g.authCancel()
		g.authCancel = nil
	}
	if g.authCmd != nil && g.authCmd.Process != nil {
		g.authCmd.Process.Kill()
		g.authCmd = nil
	}
	g.authStarted = false
	g.authMu.Unlock()

	// Create a context with a 10-minute timeout (user needs time to authenticate)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)

	// Use --web flag to make it open browser, but we'll capture the code first
	cmd := exec.CommandContext(ctx, GhPath(), "auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web")

	// Create pipes for stdout and stderr
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return GitHubDeviceFlowResult{
			Success: false,
			Error:   "Failed to create stderr pipe: " + err.Error(),
		}
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return GitHubDeviceFlowResult{
			Success: false,
			Error:   "Failed to start authentication: " + err.Error(),
		}
	}

	// Store the cmd and cancel function so the process can continue running
	g.authMu.Lock()
	g.authCmd = cmd
	g.authCancel = cancel
	g.authStarted = true
	g.authMu.Unlock()

	// Read stderr for the device code
	// The output format is:
	// ! First copy your one-time code: XXXX-XXXX
	// Press Enter to open github.com in your browser...
	var userCode string
	verificationURL := "https://github.com/login/device"

	scanner := bufio.NewScanner(stderr)
	codePattern := regexp.MustCompile(`code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})`)

	// Read lines until we find the code (with a short timeout for reading)
	codeChan := make(chan string, 1)
	go func() {
		defer close(codeChan)
		for scanner.Scan() {
			line := scanner.Text()
			if matches := codePattern.FindStringSubmatch(line); len(matches) > 1 {
				codeChan <- matches[1]
				return
			}
		}
		// Check for scanner errors
		if scanner.Err() != nil {
			codeChan <- ""
			return
		}
		codeChan <- ""
	}()

	// Wait for the code with a 30-second timeout
	select {
	case userCode = <-codeChan:
	case <-time.After(30 * time.Second):
		userCode = ""
	}

	if userCode == "" {
		// Clean up if we couldn't get the code
		cancel()
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		g.authMu.Lock()
		g.authCmd = nil
		g.authCancel = nil
		g.authStarted = false
		g.authMu.Unlock()
		return GitHubDeviceFlowResult{
			Success: false,
			Error:   "Could not retrieve verification code from GitHub CLI",
		}
	}

	// Let the command continue running in background - it will complete when user authenticates
	go func() {
		cmd.Wait()
		// Clean up after completion
		g.authMu.Lock()
		if g.authCmd == cmd {
			g.authCmd = nil
			g.authCancel = nil
			g.authStarted = false
		}
		g.authMu.Unlock()
	}()

	return GitHubDeviceFlowResult{
		Success:         true,
		UserCode:        userCode,
		VerificationURL: verificationURL,
	}
}

// AuthLoginComplete checks if the device flow authentication has completed.
// This should be called after AuthLoginStart and after the user has entered the code.
// It polls the auth status to detect successful authentication.
func (g *GitHubService) AuthLoginComplete() GitHubAuthResult {
	// Give the gh process a moment to complete the token exchange
	// after the user authenticates in the browser
	const maxAttempts = 5
	const pollInterval = 500 * time.Millisecond

	for i := 0; i < maxAttempts; i++ {
		time.Sleep(pollInterval)

		status := g.AuthStatus()
		if status.LoggedIn {
			// Clean up the auth process references
			g.authMu.Lock()
			// Save references before clearing to avoid race
			cancelFn := g.authCancel
			g.authCancel = nil
			g.authCmd = nil
			g.authStarted = false
			g.authMu.Unlock()

			// Cancel outside of lock to avoid holding lock during cancel
			if cancelFn != nil {
				cancelFn()
			}

			return GitHubAuthResult{
				Success: true,
				Message: "Authentication successful",
			}
		}
	}

	return GitHubAuthResult{
		Success: false,
		Error:   "Authentication not completed. Please enter the code in your browser and try again.",
	}
}

// AuthLoginCancel cancels an in-progress device flow authentication
func (g *GitHubService) AuthLoginCancel() GitHubAuthResult {
	g.authMu.Lock()
	// Save references before clearing
	cancelFn := g.authCancel
	cmd := g.authCmd
	g.authCancel = nil
	g.authCmd = nil
	g.authStarted = false
	g.authMu.Unlock()

	// Perform cleanup operations outside of lock
	if cancelFn != nil {
		cancelFn()
	}
	if cmd != nil && cmd.Process != nil {
		cmd.Process.Kill()
	}

	return GitHubAuthResult{
		Success: true,
		Message: "Authentication cancelled",
	}
}

// getErrorFromOutput extracts a user-friendly error message from command output
func getErrorFromOutput(output string, err error) string {
	output = strings.TrimSpace(output)
	if output != "" {
		// Look for error messages in the output
		lines := strings.Split(output, "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(strings.ToLower(line), "error:") {
				// Remove "error:" or "Error:" prefix and trim spaces
				errMsg := line[6:] // len("error:") == 6
				return strings.TrimSpace(errMsg)
			}
		}
		// Return last non-empty line as error
		for i := len(lines) - 1; i >= 0; i-- {
			if strings.TrimSpace(lines[i]) != "" {
				return strings.TrimSpace(lines[i])
			}
		}
	}
	if err != nil {
		return err.Error()
	}
	return "Authentication failed"
}

// AuthLogout logs out of GitHub CLI
func (g *GitHubService) AuthLogout() GitHubAuthResult {
	// The gh CLI requires confirmation when logging out
	// We pipe "y\n" to stdin to confirm the logout
	result := g.runner.RunWithStdin("", "y\n", GhPath(), "auth", "logout", "--hostname", "github.com")
	if !result.Success {
		// Check if the error is because no account is logged in
		if strings.Contains(result.Stderr, "not logged in") || strings.Contains(result.Stderr, "no accounts") {
			return GitHubAuthResult{
				Success: true,
				Message: "Already logged out",
			}
		}
		return GitHubAuthResult{
			Success: false,
			Error:   getGHErrorMessage(result),
		}
	}

	return GitHubAuthResult{
		Success: true,
		Message: "Logged out successfully",
	}
}

// AuthStatus checks the current authentication status
func (g *GitHubService) AuthStatus() GitHubAuthStatus {
	result := g.runner.Run("", GhPath(), "auth", "status")

	status := GitHubAuthStatus{
		LoggedIn: result.Success,
		Host:     "github.com",
	}

	if !result.Success {
		// Check if it's a "not logged in" error vs other errors
		errMsg := result.Stderr
		if strings.Contains(errMsg, "not logged in") || strings.Contains(errMsg, "no oauth token") {
			status.Error = "Not logged in to GitHub"
		} else {
			status.Error = getGHErrorMessage(result)
		}
		return status
	}

	// Parse the output to extract user info
	// Output format varies but typically includes:
	// ✓ Logged in to github.com account username (keyring)
	// - Active account: true
	// - Git operations protocol: https
	// - Token: gho_****
	// - Token scopes: gist, read:org, repo, workflow
	output := result.Stdout + result.Stderr // gh prints to stderr for status

	// Extract username
	if idx := strings.Index(output, "account "); idx != -1 {
		afterAccount := output[idx+8:]
		if spaceIdx := strings.IndexAny(afterAccount, " ()\n"); spaceIdx != -1 {
			status.Username = strings.TrimSpace(afterAccount[:spaceIdx])
		}
	}

	// Extract protocol
	if strings.Contains(output, "protocol: https") {
		status.Protocol = "https"
	} else if strings.Contains(output, "protocol: ssh") {
		status.Protocol = "ssh"
	}

	// Extract token (masked)
	if idx := strings.Index(output, "Token: "); idx != -1 {
		afterToken := output[idx+7:]
		if nlIdx := strings.Index(afterToken, "\n"); nlIdx != -1 {
			status.Token = strings.TrimSpace(afterToken[:nlIdx])
		}
	}

	// Extract scopes
	if idx := strings.Index(output, "Token scopes: "); idx != -1 {
		afterScopes := output[idx+14:]
		if nlIdx := strings.Index(afterScopes, "\n"); nlIdx != -1 {
			status.Scopes = strings.TrimSpace(afterScopes[:nlIdx])
		} else {
			status.Scopes = strings.TrimSpace(afterScopes)
		}
	}

	return status
}

// ListUserOrganizations returns the authenticated user's username and their organizations
// This is used for the "publish to GitHub" form to allow users to choose the repo owner
func (g *GitHubService) ListUserOrganizations() GitHubOrganizationsResult {
	// First get the authenticated username
	authStatus := g.AuthStatus()
	if !authStatus.LoggedIn {
		return GitHubOrganizationsResult{
			Success: false,
			Error:   "Not logged in to GitHub",
		}
	}

	// Get user's organizations using gh api
	result := g.runner.Run("", GhPath(), "api", "user/orgs", "--jq", ".[].login")

	orgs := []GitHubOrganization{}
	if result.Success && result.Stdout != "" {
		// Parse organization logins (one per line)
		lines := strings.Split(strings.TrimSpace(result.Stdout), "\n")
		for _, line := range lines {
			login := strings.TrimSpace(line)
			if login != "" {
				orgs = append(orgs, GitHubOrganization{
					Login: login,
					Name:  login, // Use login as name for simplicity
				})
			}
		}
	}
	// Note: If result is not successful, we still return success with empty orgs list
	// since the user might not have any organizations

	return GitHubOrganizationsResult{
		Success:       true,
		Username:      authStatus.Username,
		Organizations: orgs,
	}
}

// ============================================================================
// Repository Listing
// ============================================================================

// RepoList lists repositories for the authenticated user
// limit: maximum number of repos to return (default 30, max 100)
// visibility: "public", "private", or empty for all
func (g *GitHubService) RepoList(limit int, visibility string) GitHubRepoListResult {
	if limit <= 0 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}

	args := []string{
		"repo", "list",
		"--json", "name,nameWithOwner,description,url,sshUrl,isPrivate,isFork,isArchived,defaultBranchRef,primaryLanguage,stargazerCount,forkCount,updatedAt,createdAt",
		"--limit", strings.TrimSpace(string(rune(limit))),
	}

	// Fix: properly convert limit to string
	args = []string{
		"repo", "list",
		"--json", "name,nameWithOwner,description,url,sshUrl,isPrivate,isFork,isArchived,defaultBranchRef,primaryLanguage,stargazerCount,forkCount,updatedAt,createdAt",
		"--limit", formatInt(limit),
	}

	if visibility == "public" || visibility == "private" {
		args = append(args, "--visibility", visibility)
	}

	result := g.runner.Run("", GhPath(), args...)
	if !result.Success {
		return GitHubRepoListResult{
			Success: false,
			Error:   getGHErrorMessage(result),
		}
	}

	// Parse JSON output
	var rawRepos []map[string]interface{}
	if err := json.Unmarshal([]byte(result.Stdout), &rawRepos); err != nil {
		return GitHubRepoListResult{
			Success: false,
			Error:   "Failed to parse repository list: " + err.Error(),
		}
	}

	repos := make([]GitHubRepo, 0, len(rawRepos))
	for _, raw := range rawRepos {
		repo := GitHubRepo{
			Name:        getString(raw, "name"),
			FullName:    getString(raw, "nameWithOwner"),
			Description: getString(raw, "description"),
			URL:         getString(raw, "url"),
			SSHURL:      getString(raw, "sshUrl"),
			Private:     getBool(raw, "isPrivate"),
			Fork:        getBool(raw, "isFork"),
			Archived:    getBool(raw, "isArchived"),
			UpdatedAt:   getString(raw, "updatedAt"),
			CreatedAt:   getString(raw, "createdAt"),
		}

		// Handle nested objects
		if defaultBranch, ok := raw["defaultBranchRef"].(map[string]interface{}); ok {
			repo.DefaultBranch = getString(defaultBranch, "name")
		}
		if lang, ok := raw["primaryLanguage"].(map[string]interface{}); ok {
			repo.Language = getString(lang, "name")
		}
		if stars, ok := raw["stargazerCount"].(float64); ok {
			repo.StargazersCount = int(stars)
		}
		if forks, ok := raw["forkCount"].(float64); ok {
			repo.ForksCount = int(forks)
		}

		repos = append(repos, repo)
	}

	return GitHubRepoListResult{
		Success: true,
		Repos:   repos,
	}
}

// RepoListForOrg lists repositories for a specific organization
func (g *GitHubService) RepoListForOrg(org string, limit int) GitHubRepoListResult {
	if org == "" {
		return GitHubRepoListResult{
			Success: false,
			Error:   "Organization name is required",
		}
	}

	if limit <= 0 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}

	args := []string{
		"repo", "list", org,
		"--json", "name,nameWithOwner,description,url,sshUrl,isPrivate,isFork,isArchived,defaultBranchRef,primaryLanguage,stargazerCount,forkCount,updatedAt,createdAt",
		"--limit", formatInt(limit),
	}

	result := g.runner.Run("", GhPath(), args...)
	if !result.Success {
		return GitHubRepoListResult{
			Success: false,
			Error:   getGHErrorMessage(result),
		}
	}

	// Parse JSON output (same as RepoList)
	var rawRepos []map[string]interface{}
	if err := json.Unmarshal([]byte(result.Stdout), &rawRepos); err != nil {
		return GitHubRepoListResult{
			Success: false,
			Error:   "Failed to parse repository list: " + err.Error(),
		}
	}

	repos := make([]GitHubRepo, 0, len(rawRepos))
	for _, raw := range rawRepos {
		repo := GitHubRepo{
			Name:        getString(raw, "name"),
			FullName:    getString(raw, "nameWithOwner"),
			Description: getString(raw, "description"),
			URL:         getString(raw, "url"),
			SSHURL:      getString(raw, "sshUrl"),
			Private:     getBool(raw, "isPrivate"),
			Fork:        getBool(raw, "isFork"),
			Archived:    getBool(raw, "isArchived"),
			UpdatedAt:   getString(raw, "updatedAt"),
			CreatedAt:   getString(raw, "createdAt"),
		}

		if defaultBranch, ok := raw["defaultBranchRef"].(map[string]interface{}); ok {
			repo.DefaultBranch = getString(defaultBranch, "name")
		}
		if lang, ok := raw["primaryLanguage"].(map[string]interface{}); ok {
			repo.Language = getString(lang, "name")
		}
		if stars, ok := raw["stargazerCount"].(float64); ok {
			repo.StargazersCount = int(stars)
		}
		if forks, ok := raw["forkCount"].(float64); ok {
			repo.ForksCount = int(forks)
		}

		repos = append(repos, repo)
	}

	return GitHubRepoListResult{
		Success: true,
		Repos:   repos,
	}
}

// ============================================================================
// Repository Clone
// ============================================================================

// RepoClone clones a GitHub repository to the specified directory
// repo: repository in "owner/repo" format or full URL
// destPath: local directory to clone into (will be created)
func (g *GitHubService) RepoClone(repo string, destPath string) GitHubCloneResult {
	if repo == "" {
		return GitHubCloneResult{
			Success: false,
			Error:   "Repository name or URL is required",
		}
	}

	args := []string{"repo", "clone", repo}
	if destPath != "" {
		args = append(args, destPath)
	}

	result := g.runner.Run("", GhPath(), args...)
	if !result.Success {
		return GitHubCloneResult{
			Success: false,
			Error:   getGHErrorMessage(result),
		}
	}

	// Determine the actual clone directory
	cloneDir := destPath
	if cloneDir == "" {
		// gh clones to a folder named after the repo
		parts := strings.Split(repo, "/")
		if len(parts) > 0 {
			cloneDir = parts[len(parts)-1]
			// Remove .git suffix if present
			cloneDir = strings.TrimSuffix(cloneDir, ".git")
		}
	}

	return GitHubCloneResult{
		Success:  true,
		CloneDir: cloneDir,
	}
}

// ============================================================================
// Repository Create
// ============================================================================

// RepoCreate creates a new repository on GitHub
func (g *GitHubService) RepoCreate(options GitHubRepoCreateOptions) GitHubRepoCreateResult {
	if options.Name == "" {
		return GitHubRepoCreateResult{
			Success: false,
			Error:   "Repository name is required",
		}
	}

	args := []string{"repo", "create", options.Name}

	// Visibility
	if options.Private {
		args = append(args, "--private")
	} else {
		args = append(args, "--public")
	}

	// Description
	if options.Description != "" {
		args = append(args, "--description", options.Description)
	}

	// Clone after creation
	if options.Clone {
		args = append(args, "--clone")
	}

	// Add README
	if options.AddReadme {
		args = append(args, "--add-readme")
	}

	// .gitignore template
	if options.GitIgnore != "" {
		args = append(args, "--gitignore", options.GitIgnore)
	}

	// License template
	if options.License != "" {
		args = append(args, "--license", options.License)
	}

	// Run in clone path if specified
	workDir := ""
	if options.Clone && options.ClonePath != "" {
		workDir = options.ClonePath
	}

	result := g.runner.Run(workDir, GhPath(), args...)
	if !result.Success {
		return GitHubRepoCreateResult{
			Success: false,
			Error:   getGHErrorMessage(result),
		}
	}

	// Parse the created repository info
	// gh repo create outputs the URL of the created repo
	output := strings.TrimSpace(result.Stdout)
	repoURL := ""
	if strings.Contains(output, "github.com") {
		repoURL = output
	}

	createResult := GitHubRepoCreateResult{
		Success: true,
		Repo: GitHubRepo{
			Name:    options.Name,
			URL:     repoURL,
			Private: options.Private,
		},
	}

	if options.Clone {
		createResult.CloneDir = options.Name
		if options.ClonePath != "" {
			createResult.CloneDir = options.ClonePath + "/" + options.Name
		}
	}

	return createResult
}

// RepoCreateFromLocal creates a new GitHub repository from an existing local repository
// localPath: path to the local git repository
// name: name for the new GitHub repository (optional, defaults to folder name)
// description: repository description
// private: whether the repository should be private
// owner: the owner for the repository (username or organization login). If empty, defaults to authenticated user.
func (g *GitHubService) RepoCreateFromLocal(localPath string, name string, description string, private bool, owner string) GitHubRepoCreateResult {
	if localPath == "" {
		return GitHubRepoCreateResult{
			Success: false,
			Error:   "Local repository path is required",
		}
	}

	// Sanitize inputs to prevent command injection
	// GitHub usernames/org names: alphanumeric, hyphens only (no leading hyphen)
	// Repo names: alphanumeric, hyphens, underscores, periods
	if owner != "" && !isValidGitHubOwner(owner) {
		return GitHubRepoCreateResult{
			Success: false,
			Error:   "Invalid owner name: must contain only alphanumeric characters and hyphens",
		}
	}
	if name != "" && !isValidGitHubRepoName(name) {
		return GitHubRepoCreateResult{
			Success: false,
			Error:   "Invalid repository name: must contain only alphanumeric characters, hyphens, underscores, and periods",
		}
	}

	args := []string{"repo", "create"}

	// Construct the repository name with owner if specified
	repoIdentifier := name
	if owner != "" && name != "" {
		repoIdentifier = owner + "/" + name
	}

	if repoIdentifier != "" {
		args = append(args, repoIdentifier)
	}

	args = append(args, "--source", localPath)

	if private {
		args = append(args, "--private")
	} else {
		args = append(args, "--public")
	}

	if description != "" {
		args = append(args, "--description", description)
	}

	// Push after creating
	args = append(args, "--push")

	result := g.runner.Run(localPath, GhPath(), args...)
	if !result.Success {
		return GitHubRepoCreateResult{
			Success: false,
			Error:   getGHErrorMessage(result),
		}
	}

	// Construct the full name for the result
	fullName := name
	if owner != "" && name != "" {
		fullName = owner + "/" + name
	}

	return GitHubRepoCreateResult{
		Success: true,
		Repo: GitHubRepo{
			Name:     name,
			FullName: fullName,
			Private:  private,
		},
	}
}

// ============================================================================
// Helper Functions
// ============================================================================

// getGHErrorMessage extracts the most informative error message from a gh command result
func getGHErrorMessage(result CommandResult) string {
	// gh typically outputs errors to stderr
	if result.Stderr != "" {
		// Clean up common prefixes
		errMsg := result.Stderr
		errMsg = strings.TrimPrefix(errMsg, "error: ")
		errMsg = strings.TrimPrefix(errMsg, "Error: ")
		return strings.TrimSpace(errMsg)
	}
	if result.Error != "" {
		return result.Error
	}
	return "Unknown error"
}

// getString safely extracts a string from a map
func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// getBool safely extracts a bool from a map
func getBool(m map[string]interface{}, key string) bool {
	if v, ok := m[key].(bool); ok {
		return v
	}
	return false
}

// formatInt converts an int to a string
func formatInt(n int) string {
	return strconv.Itoa(n)
}

// isValidGitHubOwner validates a GitHub username or organization name
// GitHub usernames: alphanumeric and hyphens, cannot start with hyphen, max 39 chars
func isValidGitHubOwner(owner string) bool {
	if len(owner) == 0 || len(owner) > 39 {
		return false
	}
	if owner[0] == '-' {
		return false
	}
	validOwnerPattern := regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9-]*$`)
	return validOwnerPattern.MatchString(owner)
}

// isValidGitHubRepoName validates a GitHub repository name
// Repo names: alphanumeric, hyphens, underscores, periods, max 100 chars
func isValidGitHubRepoName(name string) bool {
	if len(name) == 0 || len(name) > 100 {
		return false
	}
	validRepoPattern := regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)
	return validRepoPattern.MatchString(name)
}
