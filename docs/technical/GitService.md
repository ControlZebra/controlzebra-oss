# GitService Documentation

## Overview
`GitService` provides a simple Go interface for core Git operations, designed for use in the Rewind Logic desktop app. All operations shell out to the `git` CLI and are safe for non-technical users.

## Methods

### DetectRepo(path string) RepoInfo
Checks if the given path is a valid Git repository.
- **Input:** Absolute path to a directory
- **Output:**
  - `IsRepo`: true if valid repo
  - `Branch`: current branch name
  - `HasError`, `Error`: error info if not a repo or path is invalid

### Status(repoPath string) RepoStatus
Returns the current status of the repository.
- **Input:** Path to a Git repo
- **Output:**
  - `Branch`: current branch
  - `Ahead`, `Behind`: sync status vs remote
  - `ChangedFiles`: list of changed files (added, modified, deleted, untracked)
  - `HasChanges`: true if there are changes

### CommitAll(repoPath string, message string) OperationResult
Stages all changes and commits with the provided message.
- **Input:** Repo path, commit message
- **Output:**
  - `Success`: true if commit succeeded
  - `Error`: error message if failed

### Pull(repoPath string) OperationResult
Fetches and merges changes from the remote.
- **Input:** Repo path
- **Output:**
  - `Success`: true if pull succeeded
  - `Message`: output from git
  - `Error`: error message if failed

### Push(repoPath string) OperationResult
Pushes local commits to the remote.
- **Input:** Repo path
- **Output:**
  - `Success`: true if push succeeded
  - `Error`: error message if failed

### GetRecentCommits(repoPath string, limit int) ([]CommitInfo, error)
Returns recent commits from the repository.
- **Input:** Repo path, number of commits to return
- **Output:** List of commits with hash, message, author, date

## Models
- **RepoInfo**: Path, IsRepo, Branch, HasError, Error
- **RepoStatus**: Branch, Ahead, Behind, ChangedFiles, HasChanges, HasError, Error
- **FileStatus**: Path, Name, Status
- **OperationResult**: Success, Message, Error
- **CommitInfo**: Hash, ShortHash, Message, Author, AuthorEmail, Date, RelativeDate

## Usage Example
```go
svc := NewGitService()
info := svc.DetectRepo("/path/to/repo")
if info.IsRepo {
    status := svc.Status(info.Path)
    if status.HasChanges {
        result := svc.CommitAll(info.Path, "Update configs")
        if result.Success {
            svc.Push(info.Path)
        }
    }
}
```

## Notes
- All operations are performed using the system `git` CLI.
- Errors are returned in a user-friendly format.
- Designed for safe, minimal workflows for industrial automation users.
