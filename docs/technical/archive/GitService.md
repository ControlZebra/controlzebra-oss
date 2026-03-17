# GitService Documentation

## Overview

`GitService` provides a simple Go interface for core Git operations, designed for use in the ControlZebra desktop app. All operations shell out to the `git` CLI (rather than using a Go git library) for reliability and compatibility. Designed for safe, minimal workflows for industrial automation users.

## Architecture

```
GitService
    └── CommandRunner (runner.go)
            └── Executes git CLI commands with timeout support
```

## Methods

### DetectRepo(path string) RepoInfo

Checks if the given path is a valid Git repository.

- **Input:** Absolute path to a directory
- **Output:** `RepoInfo` struct containing:
  - `Path`: The checked path
  - `IsRepo`: `true` if valid git repository
  - `Branch`: Current branch name (if repo is valid)
  - `HasError`: `true` if an error occurred
  - `Error`: Error message (if any)

**Example:**
```go
svc := NewGitService()
info := svc.DetectRepo("/path/to/project")
if info.IsRepo {
    fmt.Printf("On branch: %s\n", info.Branch)
}
```

### Status(repoPath string) RepoStatus

Returns the current status of the repository including changed files.

- **Input:** Path to a Git repository
- **Output:** `RepoStatus` struct containing:
  - `Branch`: Current branch name
  - `Ahead`: Number of commits ahead of remote
  - `Behind`: Number of commits behind remote
  - `ChangedFiles`: Slice of `FileStatus` (path, name, status)
  - `HasChanges`: `true` if there are uncommitted changes
  - `HasError`: `true` if an error occurred
  - `Error`: Error message (if any)

**File Status Values:**
- `"untracked"` - New file not yet added to git
- `"modified"` - Existing file with changes
- `"deleted"` - File removed from working directory
- `"added"` - File staged for first commit
- `"renamed"` - File renamed

### CommitAll(repoPath string, message string) OperationResult

Stages all changes (`git add .`) and commits with the provided message.

- **Input:** Repository path, commit message (required, non-empty)
- **Output:** `OperationResult` with success/error status
- **Validates:** Message is not empty, changes exist

### Pull(repoPath string) OperationResult

Fetches and merges changes from the remote tracking branch.

- **Input:** Repository path
- **Output:** `OperationResult` with pull status message

### Push(repoPath string) OperationResult

Pushes local commits to the remote repository.

- **Input:** Repository path
- **Output:** `OperationResult` with success/error status
- **Error Handling:** Detects "no upstream" errors and provides user-friendly message

### Sync(repoPath string) OperationResult

Performs a combined pull (with rebase) and push operation for a seamless sync experience.

- **Input:** Repository path
- **Output:** `OperationResult` with sync status
- **Error Handling:** 
  - Detects merge conflicts
  - Handles missing upstream branch
  - Reports push rejections

### GetRecentCommits(repoPath string, limit int) ([]CommitInfo, error)

Returns recent commits from the repository history.

- **Input:** Repository path, maximum number of commits (defaults to 20 if ≤0)
- **Output:** Slice of `CommitInfo` or error
- **CommitInfo fields:** Hash, ShortHash, Message, Author, AuthorEmail, Date, RelativeDate

## Data Models

### RepoInfo
```go
type RepoInfo struct {
    Path     string `json:"path"`
    IsRepo   bool   `json:"isRepo"`
    Branch   string `json:"branch"`
    HasError bool   `json:"hasError"`
    Error    string `json:"error,omitempty"`
}
```

### RepoStatus
```go
type RepoStatus struct {
    Branch       string       `json:"branch"`
    Ahead        int          `json:"ahead"`
    Behind       int          `json:"behind"`
    ChangedFiles []FileStatus `json:"changedFiles"`
    HasChanges   bool         `json:"hasChanges"`
    HasError     bool         `json:"hasError"`
    Error        string       `json:"error,omitempty"`
}
```

### FileStatus
```go
type FileStatus struct {
    Path   string `json:"path"`
    Name   string `json:"name"`
    Status string `json:"status"`
}
```

### OperationResult
```go
type OperationResult struct {
    Success bool   `json:"success"`
    Message string `json:"message"`
    Error   string `json:"error,omitempty"`
}
```

### CommitInfo
```go
type CommitInfo struct {
    Hash         string `json:"hash"`
    ShortHash    string `json:"shortHash"`
    Message      string `json:"message"`
    Author       string `json:"author"`
    AuthorEmail  string `json:"authorEmail"`
    Date         string `json:"date"`
    RelativeDate string `json:"relativeDate"`
}
```

## Usage Example

```go
svc := NewGitService()

// Check if directory is a git repo
info := svc.DetectRepo("/path/to/repo")
if !info.IsRepo {
    fmt.Println("Not a git repository")
    return
}

// Check for changes
status := svc.Status(info.Path)
if status.HasChanges {
    fmt.Printf("Found %d changed files\n", len(status.ChangedFiles))
    
    // Commit all changes
    result := svc.CommitAll(info.Path, "Update configuration files")
    if result.Success {
        // Push to remote
        pushResult := svc.Push(info.Path)
        if !pushResult.Success {
            fmt.Printf("Push failed: %s\n", pushResult.Error)
        }
    }
}

// Get recent history
commits, err := svc.GetRecentCommits(info.Path, 10)
if err == nil {
    for _, c := range commits {
        fmt.Printf("%s: %s (%s)\n", c.ShortHash, c.Message, c.RelativeDate)
    }
}
```

## Implementation Notes

- All operations use the system `git` CLI via `CommandRunner`
- Commands have a 30-second default timeout
- Errors are returned in user-friendly format (suitable for non-technical users)
- Git status parsing uses porcelain format for reliable parsing
- Branch detection handles detached HEAD state gracefully
