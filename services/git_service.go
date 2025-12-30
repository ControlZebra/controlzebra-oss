// Package services provides backend functionality for the Rewind Logic application.
// This file contains the GitService which wraps git CLI operations.
package services

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// Pre-compiled regular expressions for performance
var (
	// Matches git version string: "git version 2.39.0"
	gitVersionRegex = regexp.MustCompile(`git version (\d+)\.(\d+)\.?(\d*)`)
	// Matches diff hunk header: @@ -1,5 +1,7 @@
	hunkHeaderRegex = regexp.MustCompile(`@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)
	// Matches rename with braces: dir/{old => new}.txt
	renameWithBracesRegex = regexp.MustCompile(`(.*)?\{(.*) => (.*)\}(.*)`)
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

// getErrorMessage extracts the most informative error message from a command result.
func getErrorMessage(result CommandResult) string {
	if result.Stderr != "" {
		return result.Stderr
	}
	return result.Error
}

// ============================================================================
// Helper Functions - Operation Results & Common Checks
// ============================================================================

// failedOp creates a failed OperationResult with the given error message.
func failedOp(errMsg string) OperationResult {
	return OperationResult{Success: false, Error: errMsg}
}

// successOp creates a successful OperationResult with the given message.
func successOp(msg string) OperationResult {
	return OperationResult{Success: true, Message: msg}
}

// requireConfirmation returns an error if confirm is false.
// Used for destructive operations that need explicit user confirmation.
func requireConfirmation(confirm bool) error {
	if !confirm {
		return fmt.Errorf("this operation requires confirmation. Set confirm=true to proceed")
	}
	return nil
}

// requireCleanWorkingTree returns an error if the repo has uncommitted changes.
func (g *GitService) requireCleanWorkingTree(repoPath string) error {
	status := g.Status(repoPath)
	if status.HasChanges {
		return fmt.Errorf("you have uncommitted changes. Please save or discard your changes first")
	}
	return nil
}

// restoreFiles restores file(s) to HEAD state using git restore (2.23+) or git checkout.
// Pass "." to restore all files, or a specific path for a single file.
func (g *GitService) restoreFiles(repoPath string, pathSpec string) error {
	if g.SupportsRestore() {
		// Git 2.23+: use git restore
		result := g.runner.RunGit(repoPath, "restore", "--", pathSpec)
		if !result.Success {
			return fmt.Errorf("%s", getErrorMessage(result))
		}
		// Also unstage any staged changes
		g.runner.RunGit(repoPath, "restore", "--staged", "--", pathSpec)
	} else {
		// Older git: use checkout
		result := g.runner.RunGit(repoPath, "checkout", "--", pathSpec)
		if !result.Success {
			return fmt.Errorf("%s", getErrorMessage(result))
		}
		// Also unstage any staged changes
		g.runner.RunGit(repoPath, "reset", "HEAD", "--", pathSpec)
	}
	return nil
}

// pluralize returns singular if n==1, otherwise returns singular+"s".
func pluralize(singular string, n int) string {
	if n == 1 {
		return singular
	}
	return singular + "s"
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

// ============================================================================
// v2 Types and Methods - History, Diffs, Branches, Recovery
// ============================================================================

// DiffHunk represents a single hunk in a diff
type DiffHunk struct {
	OldStart int        `json:"oldStart"` // Starting line in old file
	OldCount int        `json:"oldCount"` // Number of lines in old file
	NewStart int        `json:"newStart"` // Starting line in new file
	NewCount int        `json:"newCount"` // Number of lines in new file
	Header   string     `json:"header"`   // The @@ header line
	Lines    []DiffLine `json:"lines"`    // Lines in this hunk
}

// DiffLine represents a single line in a diff
type DiffLine struct {
	Type    string `json:"type"`    // "context", "add", "delete"
	Content string `json:"content"` // Line content (without +/- prefix)
	OldLine int    `json:"oldLine"` // Line number in old file (0 if added)
	NewLine int    `json:"newLine"` // Line number in new file (0 if deleted)
}

// FileDiff represents the diff for a single file
type FileDiff struct {
	Path     string     `json:"path"`
	OldPath  string     `json:"oldPath,omitempty"` // For renames
	Status   string     `json:"status"`            // "added", "modified", "deleted", "renamed"
	Binary   bool       `json:"binary"`            // True if binary file
	Hunks    []DiffHunk `json:"hunks"`
	HasError bool       `json:"hasError"`
	Error    string     `json:"error,omitempty"`
}

// CommitDetail contains detailed information about a single commit
type CommitDetail struct {
	Hash         string           `json:"hash"`
	ShortHash    string           `json:"shortHash"`
	Message      string           `json:"message"`
	Body         string           `json:"body,omitempty"` // Full commit message body
	Author       string           `json:"author"`
	AuthorEmail  string           `json:"authorEmail"`
	Date         string           `json:"date"`
	RelativeDate string           `json:"relativeDate"`
	ParentHashes []string         `json:"parentHashes"`
	Files        []CommitFileInfo `json:"files"` // Files changed in this commit
	Stats        CommitStats      `json:"stats"` // Overall stats
	HasError     bool             `json:"hasError"`
	Error        string           `json:"error,omitempty"`
}

// CommitFileInfo represents a file changed in a commit
type CommitFileInfo struct {
	Path      string `json:"path"`
	OldPath   string `json:"oldPath,omitempty"` // For renames
	Status    string `json:"status"`            // "added", "modified", "deleted", "renamed"
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

// CommitStats contains overall statistics for a commit
type CommitStats struct {
	FilesChanged int `json:"filesChanged"`
	Additions    int `json:"additions"`
	Deletions    int `json:"deletions"`
}

// BranchInfo represents a git branch
type BranchInfo struct {
	Name      string `json:"name"`
	IsCurrent bool   `json:"isCurrent"`
	IsRemote  bool   `json:"isRemote"`
	Upstream  string `json:"upstream,omitempty"` // Remote tracking branch
}

// BranchList contains all branches in a repository
type BranchList struct {
	Current  string       `json:"current"`
	Local    []BranchInfo `json:"local"`
	Remote   []BranchInfo `json:"remote"`
	HasError bool         `json:"hasError"`
	Error    string       `json:"error,omitempty"`
}

// GitVersion represents parsed git version
type GitVersion struct {
	Major int
	Minor int
	Patch int
}

// GetGitVersion returns the installed git version.
// Used to determine feature compatibility (e.g., git restore requires 2.23+).
func (g *GitService) GetGitVersion() (*GitVersion, error) {
	result := g.runner.RunGit(".", "--version")
	if !result.Success {
		return nil, fmt.Errorf("failed to get git version: %s", result.Error)
	}

	output := trimOutput(result.Stdout)
	matches := gitVersionRegex.FindStringSubmatch(output)
	if len(matches) < 3 {
		return nil, fmt.Errorf("unable to parse git version: %s", output)
	}

	major, _ := strconv.Atoi(matches[1])
	minor, _ := strconv.Atoi(matches[2])
	patch := 0
	if len(matches) > 3 && matches[3] != "" {
		patch, _ = strconv.Atoi(matches[3])
	}

	return &GitVersion{Major: major, Minor: minor, Patch: patch}, nil
}

// SupportsRestore returns true if git version supports 'git restore' (2.23+)
func (g *GitService) SupportsRestore() bool {
	version, err := g.GetGitVersion()
	if err != nil {
		return false
	}
	// git restore was introduced in Git 2.23
	return version.Major > 2 || (version.Major == 2 && version.Minor >= 23)
}

// ShowCommit returns detailed information about a specific commit
func (g *GitService) ShowCommit(repoPath string, hash string) CommitDetail {
	result := CommitDetail{}

	if hash == "" {
		result.HasError = true
		result.Error = "Commit hash is required"
		return result
	}

	// Get commit metadata
	// Format: hash|short_hash|message|body|author|email|date|relative_date|parents
	format := "%H|%h|%s|%b|%an|%ae|%ci|%cr|%P"
	showResult := g.runner.RunGit(repoPath, "show", "-s", "--pretty=format:"+format, hash)
	if !showResult.Success {
		result.HasError = true
		result.Error = "Commit not found: " + hash
		return result
	}

	parts := strings.SplitN(trimOutput(showResult.Stdout), "|", 9)
	if len(parts) < 9 {
		result.HasError = true
		result.Error = "Failed to parse commit data"
		return result
	}

	result.Hash = parts[0]
	result.ShortHash = parts[1]
	result.Message = parts[2]
	result.Body = strings.TrimSpace(parts[3])
	result.Author = parts[4]
	result.AuthorEmail = parts[5]
	result.Date = parts[6]
	result.RelativeDate = parts[7]
	if parts[8] != "" {
		result.ParentHashes = strings.Fields(parts[8])
	}

	// Get list of files changed with stats using --numstat
	statsResult := g.runner.RunGit(repoPath, "show", "--numstat", "--pretty=format:", hash)
	if statsResult.Success {
		result.Files = g.parseNumstat(statsResult.Stdout)
	}

	// Get name-status for accurate status detection
	nameStatusResult := g.runner.RunGit(repoPath, "show", "--name-status", "--pretty=format:", hash)
	if nameStatusResult.Success {
		statusMap := g.parseNameStatus(nameStatusResult.Stdout)
		for i := range result.Files {
			if status, ok := statusMap[result.Files[i].Path]; ok {
				result.Files[i].Status = status
			}
		}
	}

	// Calculate overall stats
	for _, f := range result.Files {
		result.Stats.FilesChanged++
		result.Stats.Additions += f.Additions
		result.Stats.Deletions += f.Deletions
	}

	return result
}

// parseNumstat parses git show --numstat output into a list of file changes.
// Format per line: additions<tab>deletions<tab>filepath
func (g *GitService) parseNumstat(output string) []CommitFileInfo {
	files := []CommitFileInfo{}
	lines := strings.Split(output, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) < 3 {
			continue
		}

		additions := 0
		deletions := 0
		// Binary files show "-" for additions/deletions
		if parts[0] != "-" {
			additions, _ = strconv.Atoi(parts[0])
		}
		if parts[1] != "-" {
			deletions, _ = strconv.Atoi(parts[1])
		}

		// Handle renamed files: "old => new" or "{old => new}"
		path := strings.Join(parts[2:], " ")
		oldPath := ""
		if strings.Contains(path, " => ") {
			// Handle rename format
			path, oldPath = parseRenamePath(path)
		}

		files = append(files, CommitFileInfo{
			Path:      path,
			OldPath:   oldPath,
			Additions: additions,
			Deletions: deletions,
			Status:    "modified", // Will be updated from name-status
		})
	}

	return files
}

// parseRenamePath handles git's rename path format.
// Supports formats: "old => new", "{dir/old => dir/new}", "dir/{old => new}".
func parseRenamePath(path string) (newPath, oldPath string) {
	if strings.Contains(path, "{") {
		// Complex rename with common prefix/suffix
		matches := renameWithBracesRegex.FindStringSubmatch(path)
		if len(matches) == 5 {
			prefix, oldPart, newPart, suffix := matches[1], matches[2], matches[3], matches[4]
			return prefix + newPart + suffix, prefix + oldPart + suffix
		}
	}

	// Simple rename: "old => new"
	if parts := strings.Split(path, " => "); len(parts) == 2 {
		return strings.TrimSpace(parts[1]), strings.TrimSpace(parts[0])
	}

	return path, ""
}

// parseNameStatus parses git show --name-status output
func (g *GitService) parseNameStatus(output string) map[string]string {
	statusMap := make(map[string]string)
	lines := strings.Split(output, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}

		statusCode := parts[0]
		path := parts[len(parts)-1] // Last part is the path (or new path for renames)

		status := "modified"
		switch {
		case strings.HasPrefix(statusCode, "A"):
			status = "added"
		case strings.HasPrefix(statusCode, "D"):
			status = "deleted"
		case strings.HasPrefix(statusCode, "R"):
			status = "renamed"
		case strings.HasPrefix(statusCode, "M"):
			status = "modified"
		case strings.HasPrefix(statusCode, "C"):
			status = "copied"
		}

		statusMap[path] = status
	}

	return statusMap
}

// DiffWorking returns the diff of a file in the working tree vs HEAD
func (g *GitService) DiffWorking(repoPath string, filePath string) FileDiff {
	result := FileDiff{
		Path:  filePath,
		Hunks: []DiffHunk{},
	}

	// Check if file exists
	fullPath := filepath.Join(repoPath, filePath)
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		// File was deleted
		result.Status = "deleted"
	}

	// Get the diff
	diffResult := g.runner.RunGit(repoPath, "diff", "--", filePath)
	if !diffResult.Success {
		// Try diff for untracked files (compare with /dev/null)
		diffResult = g.runner.RunGit(repoPath, "diff", "--no-index", "/dev/null", filePath)
		if !diffResult.Success && diffResult.ExitCode != 1 {
			result.HasError = true
			result.Error = "Failed to get diff: " + diffResult.Stderr
			return result
		}
		result.Status = "added"
	}

	// Also try staged diff
	if diffResult.Stdout == "" {
		stagedResult := g.runner.RunGit(repoPath, "diff", "--cached", "--", filePath)
		if stagedResult.Success && stagedResult.Stdout != "" {
			diffResult = stagedResult
		}
	}

	if diffResult.Stdout == "" {
		// No changes in working tree, might be untracked
		statusResult := g.runner.RunGit(repoPath, "status", "--porcelain", "--", filePath)
		if statusResult.Success && strings.HasPrefix(statusResult.Stdout, "??") {
			// Untracked file - show as new file
			result.Status = "added"
			content, err := os.ReadFile(fullPath)
			if err == nil {
				result.Hunks = g.createAddedFileHunks(string(content))
			}
			return result
		}
		return result
	}

	return g.parseDiffOutput(diffResult.Stdout, filePath)
}

// createAddedFileHunks creates hunks for a newly added file
func (g *GitService) createAddedFileHunks(content string) []DiffHunk {
	lines := strings.Split(content, "\n")
	diffLines := []DiffLine{}

	for i, line := range lines {
		diffLines = append(diffLines, DiffLine{
			Type:    "add",
			Content: line,
			OldLine: 0,
			NewLine: i + 1,
		})
	}

	return []DiffHunk{{
		OldStart: 0,
		OldCount: 0,
		NewStart: 1,
		NewCount: len(lines),
		Header:   fmt.Sprintf("@@ -0,0 +1,%d @@", len(lines)),
		Lines:    diffLines,
	}}
}

// DiffCommits returns the diff between two commits for a specific file (or all files if path is empty)
func (g *GitService) DiffCommits(repoPath string, fromHash string, toHash string, filePath string) FileDiff {
	result := FileDiff{
		Path:  filePath,
		Hunks: []DiffHunk{},
	}

	if fromHash == "" || toHash == "" {
		result.HasError = true
		result.Error = "Both commit hashes are required"
		return result
	}

	args := []string{"diff", fromHash, toHash}
	if filePath != "" {
		args = append(args, "--", filePath)
	}

	diffResult := g.runner.RunGit(repoPath, args...)
	if !diffResult.Success {
		result.HasError = true
		result.Error = "Failed to get diff: " + diffResult.Stderr
		return result
	}

	if diffResult.Stdout == "" {
		return result // No changes
	}

	return g.parseDiffOutput(diffResult.Stdout, filePath)
}

// DiffCommitFile returns the diff for a specific file in a commit compared to its parent
func (g *GitService) DiffCommitFile(repoPath string, hash string, filePath string) FileDiff {
	result := FileDiff{
		Path:  filePath,
		Hunks: []DiffHunk{},
	}

	if hash == "" {
		result.HasError = true
		result.Error = "Commit hash is required"
		return result
	}

	// Use git show to get the diff for this file in the commit
	args := []string{"show", "--pretty=format:", hash, "--", filePath}
	diffResult := g.runner.RunGit(repoPath, args...)
	if !diffResult.Success {
		result.HasError = true
		result.Error = "Failed to get diff: " + diffResult.Stderr
		return result
	}

	if diffResult.Stdout == "" {
		return result // No changes
	}

	return g.parseDiffOutput(diffResult.Stdout, filePath)
}

// parseDiffOutput parses unified diff output into structured format
func (g *GitService) parseDiffOutput(output string, defaultPath string) FileDiff {
	result := FileDiff{
		Path:   defaultPath,
		Hunks:  []DiffHunk{},
		Status: "modified",
	}

	lines := strings.Split(output, "\n")
	var currentHunk *DiffHunk
	oldLineNum := 0
	newLineNum := 0

	for _, line := range lines {
		// Check for binary file
		if strings.HasPrefix(line, "Binary files") {
			result.Binary = true
			continue
		}

		// Parse file paths from diff header
		if strings.HasPrefix(line, "--- a/") {
			result.OldPath = strings.TrimPrefix(line, "--- a/")
			continue
		}
		if strings.HasPrefix(line, "+++ b/") {
			result.Path = strings.TrimPrefix(line, "+++ b/")
			continue
		}
		if strings.HasPrefix(line, "--- /dev/null") {
			result.Status = "added"
			continue
		}
		if strings.HasPrefix(line, "+++ /dev/null") {
			result.Status = "deleted"
			continue
		}

		// Parse hunk header: @@ -old_start,old_count +new_start,new_count @@
		if strings.HasPrefix(line, "@@") {
			if currentHunk != nil {
				result.Hunks = append(result.Hunks, *currentHunk)
			}

			hunk := parseHunkHeader(line)
			currentHunk = &hunk
			oldLineNum = hunk.OldStart
			newLineNum = hunk.NewStart
			continue
		}

		// Skip diff metadata lines
		if strings.HasPrefix(line, "diff --git") ||
			strings.HasPrefix(line, "index ") ||
			strings.HasPrefix(line, "new file mode") ||
			strings.HasPrefix(line, "deleted file mode") ||
			strings.HasPrefix(line, "old mode") ||
			strings.HasPrefix(line, "new mode") ||
			strings.HasPrefix(line, "similarity index") ||
			strings.HasPrefix(line, "rename from") ||
			strings.HasPrefix(line, "rename to") {
			continue
		}

		// Parse diff content lines
		if currentHunk != nil {
			if strings.HasPrefix(line, "+") {
				currentHunk.Lines = append(currentHunk.Lines, DiffLine{
					Type:    "add",
					Content: strings.TrimPrefix(line, "+"),
					OldLine: 0,
					NewLine: newLineNum,
				})
				newLineNum++
			} else if strings.HasPrefix(line, "-") {
				currentHunk.Lines = append(currentHunk.Lines, DiffLine{
					Type:    "delete",
					Content: strings.TrimPrefix(line, "-"),
					OldLine: oldLineNum,
					NewLine: 0,
				})
				oldLineNum++
			} else if strings.HasPrefix(line, " ") || line == "" {
				// Context line
				content := line
				if strings.HasPrefix(line, " ") {
					content = strings.TrimPrefix(line, " ")
				}
				currentHunk.Lines = append(currentHunk.Lines, DiffLine{
					Type:    "context",
					Content: content,
					OldLine: oldLineNum,
					NewLine: newLineNum,
				})
				oldLineNum++
				newLineNum++
			}
		}
	}

	// Don't forget the last hunk
	if currentHunk != nil {
		result.Hunks = append(result.Hunks, *currentHunk)
	}

	return result
}

// parseHunkHeader parses unified diff hunk header.
// Format: @@ -old_start,old_count +new_start,new_count @@ optional context
func parseHunkHeader(line string) DiffHunk {
	hunk := DiffHunk{
		Header: line,
		Lines:  []DiffLine{},
	}

	matches := hunkHeaderRegex.FindStringSubmatch(line)
	if len(matches) >= 4 {
		hunk.OldStart, _ = strconv.Atoi(matches[1])
		hunk.OldCount = parseCountOrDefault(matches[2], 1)
		hunk.NewStart, _ = strconv.Atoi(matches[3])
		if len(matches) > 4 {
			hunk.NewCount = parseCountOrDefault(matches[4], 1)
		} else {
			hunk.NewCount = 1
		}
	}

	return hunk
}

// parseCountOrDefault parses a string to int, returning defaultVal if empty or invalid.
func parseCountOrDefault(s string, defaultVal int) int {
	if s == "" {
		return defaultVal
	}
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return defaultVal
}

// Branches returns all branches in the repository
func (g *GitService) Branches(repoPath string) BranchList {
	result := BranchList{
		Local:  []BranchInfo{},
		Remote: []BranchInfo{},
	}

	// Get current branch
	currentResult := g.runner.RunGit(repoPath, "branch", "--show-current")
	if currentResult.Success {
		result.Current = trimOutput(currentResult.Stdout)
	}

	// Get local branches with upstream info
	localResult := g.runner.RunGit(repoPath, "branch", "-vv")
	if !localResult.Success {
		result.HasError = true
		result.Error = "Failed to get branches: " + localResult.Stderr
		return result
	}

	lines := strings.Split(localResult.Stdout, "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}

		branch := BranchInfo{}
		branch.IsCurrent = strings.HasPrefix(line, "*")

		// Remove the * prefix and trim
		line = strings.TrimPrefix(line, "*")
		line = strings.TrimSpace(line)

		// Parse branch name (first word)
		parts := strings.Fields(line)
		if len(parts) == 0 {
			continue
		}
		branch.Name = parts[0]

		// Look for upstream in brackets [origin/main] or [origin/main: ahead 1]
		if idx := strings.Index(line, "["); idx != -1 {
			endIdx := strings.Index(line[idx:], "]")
			if endIdx != -1 {
				upstream := line[idx+1 : idx+endIdx]
				// Remove status info (: ahead, : behind, etc.)
				if colonIdx := strings.Index(upstream, ":"); colonIdx != -1 {
					upstream = upstream[:colonIdx]
				}
				branch.Upstream = upstream
			}
		}

		result.Local = append(result.Local, branch)
	}

	// Get remote branches
	remoteResult := g.runner.RunGit(repoPath, "branch", "-r")
	if remoteResult.Success {
		lines := strings.Split(remoteResult.Stdout, "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.Contains(line, "->") {
				continue // Skip HEAD references like origin/HEAD -> origin/main
			}

			result.Remote = append(result.Remote, BranchInfo{
				Name:     line,
				IsRemote: true,
			})
		}
	}

	return result
}

// CheckoutBranch switches to an existing branch.
// Fails if there are uncommitted changes to prevent accidental loss.
func (g *GitService) CheckoutBranch(repoPath string, branchName string) OperationResult {
	if branchName == "" {
		return failedOp("Branch name is required")
	}

	if err := g.requireCleanWorkingTree(repoPath); err != nil {
		return failedOp(err.Error())
	}

	result := g.runner.RunGit(repoPath, "checkout", branchName)
	if !result.Success {
		errMsg := getErrorMessage(result)
		if strings.Contains(errMsg, "did not match any") {
			return failedOp(fmt.Sprintf("Branch '%s' does not exist", branchName))
		}
		return failedOp("Failed to switch branch: " + errMsg)
	}

	return successOp(fmt.Sprintf("Switched to branch '%s'", branchName))
}

// CreateBranchAndCheckout creates a new branch and switches to it.
// Fails if there are uncommitted changes or if the branch name is invalid.
func (g *GitService) CreateBranchAndCheckout(repoPath string, branchName string) OperationResult {
	if branchName == "" {
		return failedOp("Branch name is required")
	}

	if err := g.requireCleanWorkingTree(repoPath); err != nil {
		return failedOp(err.Error())
	}

	// Validate branch name (git's ref naming rules)
	if strings.ContainsAny(branchName, " \t\n~^:?*[\\") {
		return failedOp("Invalid branch name. Branch names cannot contain spaces or special characters like ~ ^ : ? * [ \\")
	}

	result := g.runner.RunGit(repoPath, "checkout", "-b", branchName)
	if !result.Success {
		errMsg := getErrorMessage(result)
		if strings.Contains(errMsg, "already exists") {
			return failedOp(fmt.Sprintf("Branch '%s' already exists", branchName))
		}
		return failedOp("Failed to create branch: " + errMsg)
	}

	return successOp(fmt.Sprintf("Created and switched to new branch '%s'", branchName))
}

// ResetSoftHead undoes the last n commits, keeping changes staged.
// This is the "Undo Last Save" feature - changes remain in the working directory.
// Requires confirm=true as a safety measure for destructive operations.
func (g *GitService) ResetSoftHead(repoPath string, n int, confirm bool) OperationResult {
	if err := requireConfirmation(confirm); err != nil {
		return failedOp(err.Error())
	}

	if n <= 0 {
		return failedOp("Number of commits to undo must be greater than 0")
	}

	// Verify sufficient commit history exists
	commits, err := g.GetRecentCommits(repoPath, n+1)
	if err != nil || len(commits) < n {
		return failedOp(fmt.Sprintf("Cannot undo %d commit(s). Not enough commits in history.", n))
	}

	result := g.runner.RunGit(repoPath, "reset", "--soft", fmt.Sprintf("HEAD~%d", n))
	if !result.Success {
		return failedOp("Failed to undo commits: " + getErrorMessage(result))
	}

	plural := pluralize("commit", n)
	return successOp(fmt.Sprintf("Undid last %d %s. Your changes are still staged.", n, plural))
}

// DiscardAll discards all uncommitted changes in the working directory.
// This includes modified files, staged changes, and untracked files.
// Requires confirm=true as a safety measure for destructive operations.
func (g *GitService) DiscardAll(repoPath string, confirm bool) OperationResult {
	if err := requireConfirmation(confirm); err != nil {
		return failedOp(err.Error())
	}

	status := g.Status(repoPath)
	if !status.HasChanges {
		return failedOp("No changes to discard")
	}

	// Restore tracked files to HEAD state
	if err := g.restoreFiles(repoPath, "."); err != nil {
		return failedOp("Failed to discard changes: " + err.Error())
	}

	// Clean untracked files (but not ignored files)
	g.runner.RunGit(repoPath, "clean", "-fd")

	return successOp("All changes have been discarded")
}

// DiscardFile discards changes to a specific file.
// For untracked files, the file is deleted. For tracked files, changes are reverted to HEAD.
// Requires confirm=true as a safety measure for destructive operations.
func (g *GitService) DiscardFile(repoPath string, filePath string, confirm bool) OperationResult {
	if err := requireConfirmation(confirm); err != nil {
		return failedOp(err.Error())
	}

	if filePath == "" {
		return failedOp("File path is required")
	}

	// Check if file has changes
	statusResult := g.runner.RunGit(repoPath, "status", "--porcelain", "--", filePath)
	if !statusResult.Success || trimOutput(statusResult.Stdout) == "" {
		return failedOp("File has no changes to discard")
	}

	// Handle untracked files by deleting them
	if len(statusResult.Stdout) >= 2 && statusResult.Stdout[:2] == "??" {
		fullPath := filepath.Join(repoPath, filePath)
		if err := os.Remove(fullPath); err != nil {
			return failedOp("Failed to remove untracked file: " + err.Error())
		}
		return successOp(fmt.Sprintf("Removed untracked file '%s'", filePath))
	}

	// Restore tracked file to HEAD state
	if err := g.restoreFiles(repoPath, filePath); err != nil {
		return failedOp("Failed to discard changes: " + err.Error())
	}

	return successOp(fmt.Sprintf("Discarded changes to '%s'", filePath))
}
