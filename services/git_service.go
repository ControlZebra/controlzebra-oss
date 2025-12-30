package services

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// GitService provides git operations via CLI
type GitService struct {
	runner *CommandRunner
}

// NewGitService creates a new GitService instance
func NewGitService() *GitService {
	return &GitService{
		runner: NewCommandRunner(),
	}
}

// RepoInfo contains basic information about a git repository
type RepoInfo struct {
	Path     string `json:"path"`
	IsRepo   bool   `json:"isRepo"`
	Branch   string `json:"branch"`
	HasError bool   `json:"hasError"`
	Error    string `json:"error,omitempty"`
}

// DetectRepo checks if the given path is a git repository
func (g *GitService) DetectRepo(path string) RepoInfo {
	result := RepoInfo{
		Path:   path,
		IsRepo: false,
	}

	// Check if path exists
	info, err := os.Stat(path)
	if err != nil {
		result.HasError = true
		result.Error = "Path does not exist"
		return result
	}

	if !info.IsDir() {
		result.HasError = true
		result.Error = "Path is not a directory"
		return result
	}

	// Check if .git folder exists (quick check)
	gitPath := filepath.Join(path, ".git")
	if _, err := os.Stat(gitPath); os.IsNotExist(err) {
		// .git doesn't exist - not a repo
		return result
	}

	// Verify it's a valid git repo using git rev-parse
	cmdResult := g.runner.RunGit(path, "rev-parse", "--is-inside-work-tree")
	if !cmdResult.Success {
		result.HasError = true
		result.Error = "Not a valid git repository"
		return result
	}

	result.IsRepo = true

	// Get current branch
	branchResult := g.runner.RunGit(path, "branch", "--show-current")
	if branchResult.Success {
		result.Branch = trimOutput(branchResult.Stdout)
	}

	return result
}

// trimOutput removes leading/trailing whitespace from command output
func trimOutput(s string) string {
	return strings.TrimSpace(s)
}

// FileStatus represents the status of a changed file
type FileStatus struct {
	Path   string `json:"path"`
	Name   string `json:"name"`
	Status string `json:"status"` // "added", "modified", "deleted", "renamed", "untracked"
}

// RepoStatus contains the current state of a repository
type RepoStatus struct {
	Branch       string       `json:"branch"`
	Ahead        int          `json:"ahead"`
	Behind       int          `json:"behind"`
	ChangedFiles []FileStatus `json:"changedFiles"`
	HasChanges   bool         `json:"hasChanges"`
	HasError     bool         `json:"hasError"`
	Error        string       `json:"error,omitempty"`
}

// Status returns the current status of the repository
func (g *GitService) Status(repoPath string) RepoStatus {
	result := RepoStatus{
		ChangedFiles: []FileStatus{},
	}

	// Get current branch
	branchResult := g.runner.RunGit(repoPath, "branch", "--show-current")
	if branchResult.Success {
		result.Branch = trimOutput(branchResult.Stdout)
	} else {
		// Maybe in detached HEAD state
		result.Branch = "HEAD"
	}

	// Get ahead/behind counts
	aheadBehind := g.runner.RunGit(repoPath, "rev-list", "--left-right", "--count", "@{u}...HEAD")
	if aheadBehind.Success {
		parts := strings.Fields(trimOutput(aheadBehind.Stdout))
		if len(parts) == 2 {
			// First is behind (upstream ahead), second is ahead (local ahead)
			if n, err := strconv.Atoi(parts[0]); err == nil {
				result.Behind = n
			}
			if n, err := strconv.Atoi(parts[1]); err == nil {
				result.Ahead = n
			}
		}
	}

	// Get changed files using git status --porcelain
	statusResult := g.runner.RunGit(repoPath, "status", "--porcelain")
	if !statusResult.Success {
		result.HasError = true
		result.Error = "Failed to get git status"
		return result
	}

	lines := strings.Split(statusResult.Stdout, "\n")
	for _, line := range lines {
		if len(line) < 3 {
			continue
		}

		// Porcelain format: XY filename
		// X = index status, Y = worktree status
		xy := line[:2]
		filePath := strings.TrimSpace(line[3:])

		// Handle renamed files (format: "R  old -> new")
		if strings.Contains(filePath, " -> ") {
			parts := strings.Split(filePath, " -> ")
			if len(parts) == 2 {
				filePath = parts[1]
			}
		}

		status := parseGitStatus(xy)
		if status != "" {
			result.ChangedFiles = append(result.ChangedFiles, FileStatus{
				Path:   filePath,
				Name:   filepath.Base(filePath),
				Status: status,
			})
		}
	}

	result.HasChanges = len(result.ChangedFiles) > 0
	return result
}

// parseGitStatus converts git status codes to human-readable status
func parseGitStatus(xy string) string {
	// Handle untracked files
	if xy == "??" {
		return "untracked"
	}

	// Check index (staged) and worktree (unstaged) status
	x := xy[0]
	y := xy[1]

	// Prefer worktree status if present, otherwise use index status
	switch {
	case y == 'M' || x == 'M':
		return "modified"
	case y == 'D' || x == 'D':
		return "deleted"
	case y == 'A' || x == 'A':
		return "added"
	case x == 'R':
		return "renamed"
	case y == '?' || x == '?':
		return "untracked"
	default:
		return "modified" // Default to modified for any other status
	}
}

// OperationResult represents the result of a git operation
type OperationResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
}

// CommitAll stages all changes and commits with the given message
func (g *GitService) CommitAll(repoPath string, message string) OperationResult {
	if message == "" {
		return OperationResult{
			Success: false,
			Error:   "Commit message is required",
		}
	}

	// First, check if there are any changes
	status := g.Status(repoPath)
	if !status.HasChanges {
		return OperationResult{
			Success: false,
			Error:   "No changes to commit",
		}
	}

	// Stage all changes
	addResult := g.runner.RunGit(repoPath, "add", ".")
	if !addResult.Success {
		return OperationResult{
			Success: false,
			Error:   "Failed to stage changes: " + addResult.Stderr,
		}
	}

	// Commit
	commitResult := g.runner.RunGit(repoPath, "commit", "-m", message)
	if !commitResult.Success {
		return OperationResult{
			Success: false,
			Error:   "Failed to commit: " + commitResult.Stderr,
		}
	}

	return OperationResult{
		Success: true,
		Message: "Changes saved successfully",
	}
}

// getErrorMessage extracts error message from command result
func getErrorMessage(result CommandResult) string {
	if result.Stderr != "" {
		return result.Stderr
	}
	return result.Error
}

// Pull fetches and merges changes from the remote
func (g *GitService) Pull(repoPath string) OperationResult {
	result := g.runner.RunGit(repoPath, "pull")
	if !result.Success {
		return OperationResult{
			Success: false,
			Error:   "Failed to sync: " + getErrorMessage(result),
		}
	}

	message := trimOutput(result.Stdout)
	if message == "" {
		message = "Already up to date"
	}

	return OperationResult{
		Success: true,
		Message: message,
	}
}

// Push pushes local commits to the remote
func (g *GitService) Push(repoPath string) OperationResult {
	result := g.runner.RunGit(repoPath, "push")
	if !result.Success {
		errMsg := getErrorMessage(result)
		// Check for common push errors
		if strings.Contains(errMsg, "no upstream") || strings.Contains(errMsg, "has no upstream") {
			return OperationResult{
				Success: false,
				Error:   "No remote branch configured. Please set up a remote first.",
			}
		}
		return OperationResult{
			Success: false,
			Error:   "Failed to share: " + errMsg,
		}
	}

	return OperationResult{
		Success: true,
		Message: "Changes shared successfully",
	}
}

// Sync performs a git pull --rebase followed by git push
func (g *GitService) Sync(repoPath string) OperationResult {
	// First, pull with rebase
	pullResult := g.runner.RunGit(repoPath, "pull", "--rebase")
	if !pullResult.Success {
		errMsg := getErrorMessage(pullResult)
		// Check for common errors
		if strings.Contains(errMsg, "no tracking information") || strings.Contains(errMsg, "no upstream") {
			return OperationResult{
				Success: false,
				Error:   "No remote branch configured. Please set up a remote first.",
			}
		}
		if strings.Contains(errMsg, "CONFLICT") || strings.Contains(errMsg, "conflict") {
			return OperationResult{
				Success: false,
				Error:   "Merge conflict detected. Please resolve conflicts manually.",
			}
		}
		return OperationResult{
			Success: false,
			Error:   "Failed to sync (pull): " + errMsg,
		}
	}

	// Then push
	pushResult := g.runner.RunGit(repoPath, "push")
	if !pushResult.Success {
		errMsg := getErrorMessage(pushResult)
		// Check for common push errors
		if strings.Contains(errMsg, "no upstream") || strings.Contains(errMsg, "has no upstream") {
			return OperationResult{
				Success: false,
				Error:   "No remote branch configured. Please set up a remote first.",
			}
		}
		if strings.Contains(errMsg, "rejected") {
			return OperationResult{
				Success: false,
				Error:   "Push rejected. Remote has changes. Please sync again.",
			}
		}
		return OperationResult{
			Success: false,
			Error:   "Failed to sync (push): " + errMsg,
		}
	}

	message := trimOutput(pullResult.Stdout)
	if message == "" || message == "Already up to date." {
		message = "Synced successfully"
	}

	return OperationResult{
		Success: true,
		Message: message,
	}
}

// CommitInfo represents a single commit
type CommitInfo struct {
	Hash         string `json:"hash"`
	ShortHash    string `json:"shortHash"`
	Message      string `json:"message"`
	Author       string `json:"author"`
	AuthorEmail  string `json:"authorEmail"`
	Date         string `json:"date"`
	RelativeDate string `json:"relativeDate"`
}

// GetRecentCommits returns recent commits from the repository
func (g *GitService) GetRecentCommits(repoPath string, limit int) ([]CommitInfo, error) {
	if limit <= 0 {
		limit = 20
	}

	// Format: hash|short_hash|message|author|email|date|relative_date
	format := "%H|%h|%s|%an|%ae|%ci|%cr"
	result := g.runner.RunGit(repoPath, "log", "-n", strconv.Itoa(limit), "--pretty=format:"+format)
	if !result.Success {
		return nil, fmt.Errorf("failed to get commits: %s", result.Stderr)
	}

	commits := []CommitInfo{}
	lines := strings.Split(result.Stdout, "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, "|", 7)
		if len(parts) < 7 {
			continue
		}

		commits = append(commits, CommitInfo{
			Hash:         parts[0],
			ShortHash:    parts[1],
			Message:      parts[2],
			Author:       parts[3],
			AuthorEmail:  parts[4],
			Date:         parts[5],
			RelativeDate: parts[6],
		})
	}

	return commits, nil
}
