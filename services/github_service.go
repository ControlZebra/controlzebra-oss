// Package services provides backend functionality for the ControlZebra application.
// This file contains the GitHubService which wraps GitHub CLI (gh) operations.
package services

import (
	"encoding/json"
	"strconv"
	"strings"
)

// GitHubService provides GitHub CLI (gh) operations
type GitHubService struct {
	runner *CommandRunner
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
	FullName        string `json:"fullName"`        // owner/repo format
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

// GitHubRepoCreateOptions contains options for creating a new repository
type GitHubRepoCreateOptions struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Private     bool   `json:"private"`
	Clone       bool   `json:"clone"`       // Clone the repo after creation
	ClonePath   string `json:"clonePath"`   // Path to clone to (if Clone is true)
	AddReadme   bool   `json:"addReadme"`   // Initialize with README
	GitIgnore   string `json:"gitIgnore"`   // .gitignore template name
	License     string `json:"license"`     // License template name
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

// ============================================================================
// CLI Detection
// ============================================================================

// IsGHInstalled checks if the GitHub CLI (gh) is installed and available
func (g *GitHubService) IsGHInstalled() bool {
	result := g.runner.Run("", "gh", "--version")
	return result.Success
}

// GetGHVersion returns the installed GitHub CLI version
func (g *GitHubService) GetGHVersion() string {
	result := g.runner.Run("", "gh", "--version")
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

// AuthLogin initiates the GitHub authentication flow.
// This opens a browser for the user to authenticate.
// Returns immediately after starting the auth flow - the actual auth happens
// in the browser and the CLI handles the callback.
func (g *GitHubService) AuthLogin() GitHubAuthResult {
	// Use web-based auth flow which is more user-friendly
	result := g.runner.Run("", "gh", "auth", "login", "--web")
	if !result.Success {
		return GitHubAuthResult{
			Success: false,
			Error:   getGHErrorMessage(result),
		}
	}

	return GitHubAuthResult{
		Success: true,
		Message: "Authentication successful",
	}
}

// AuthLogout logs out of GitHub CLI
func (g *GitHubService) AuthLogout() GitHubAuthResult {
	result := g.runner.Run("", "gh", "auth", "logout", "--hostname", "github.com")
	if !result.Success {
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
	result := g.runner.Run("", "gh", "auth", "status")

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

	result := g.runner.Run("", "gh", args...)
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

	result := g.runner.Run("", "gh", args...)
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

	result := g.runner.Run("", "gh", args...)
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

	result := g.runner.Run(workDir, "gh", args...)
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
// private: whether the repository should be private
func (g *GitHubService) RepoCreateFromLocal(localPath string, name string, description string, private bool) GitHubRepoCreateResult {
	if localPath == "" {
		return GitHubRepoCreateResult{
			Success: false,
			Error:   "Local repository path is required",
		}
	}

	args := []string{"repo", "create"}

	if name != "" {
		args = append(args, name)
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

	result := g.runner.Run(localPath, "gh", args...)
	if !result.Success {
		return GitHubRepoCreateResult{
			Success: false,
			Error:   getGHErrorMessage(result),
		}
	}

	return GitHubRepoCreateResult{
		Success: true,
		Repo: GitHubRepo{
			Name:    name,
			Private: private,
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
