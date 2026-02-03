# GitHubService Documentation

## Overview

`GitHubService` wraps the GitHub CLI (`gh`) to provide GitHub authentication and repository workflows for ControlZebra. It is designed for non-technical users, so errors are returned as friendly strings and the API exposes simple, predictable results.

## Architecture

```
GitHubService
    └── CommandRunner (runner.go)
            └── Executes gh CLI commands with timeout support
```

## Dependencies

- Requires the `gh` CLI to be installed and available in PATH.
- All operations run through `CommandRunner` with the default timeout.

## Methods

### IsGHInstalled() bool

Checks whether the GitHub CLI is available.

- **Output:** `true` if `gh` is found and runs successfully, otherwise `false`.

### GetGHVersion() string

Returns the first line of `gh --version` output (e.g., `"gh version 2.40.1 (...)"`).

- **Output:** Version string, or empty if not installed.

### AuthLogin() GitHubAuthResult

Starts the interactive, web-based GitHub authentication flow using `gh auth login --web`.

- **Output:** `GitHubAuthResult` with `Success` and `Message` or `Error`.

### AuthLogout() GitHubAuthResult

Logs out of GitHub for `github.com` using `gh auth logout`.

- **Output:** `GitHubAuthResult` with `Success` and `Message` or `Error`.

### AuthStatus() GitHubAuthStatus

Checks the current authentication status.

- **Output:** `GitHubAuthStatus` containing:
  - `LoggedIn`, `Username`, `Protocol`, `Host`, `Token` (masked), `Scopes`, and `Error`.

### RepoList(limit int, visibility string) GitHubRepoListResult

Lists repositories for the authenticated user.

- **Input:**
  - `limit`: Max results (default 30, max 100).
  - `visibility`: `"public"`, `"private"`, or empty for all.
- **Output:** `GitHubRepoListResult` with `Repos` or `Error`.

### RepoListForOrg(org string, limit int) GitHubRepoListResult

Lists repositories for a specific organization.

- **Input:**
  - `org`: Organization name (required).
  - `limit`: Max results (default 30, max 100).
- **Output:** `GitHubRepoListResult` with `Repos` or `Error`.

### RepoClone(repo string, destPath string) GitHubCloneResult

Clones a repository using `gh repo clone`.

- **Input:**
  - `repo`: `owner/repo` or full URL.
  - `destPath`: Optional local folder to clone into.
- **Output:** `GitHubCloneResult` with `CloneDir` or `Error`.

### RepoCreate(options GitHubRepoCreateOptions) GitHubRepoCreateResult

Creates a new GitHub repository.

- **Input:** `GitHubRepoCreateOptions` (name required).
- **Output:** `GitHubRepoCreateResult` with `Repo` info, optional `CloneDir`, or `Error`.

### RepoCreateFromLocal(localPath, name, description string, private bool) GitHubRepoCreateResult

Creates a new GitHub repository from an existing local repository using `gh repo create --source`.

- **Input:**
  - `localPath`: Local repo path (required).
  - `name`: Optional repo name (defaults to folder name in `gh`).
  - `description`: Optional description.
  - `private`: Whether the repo should be private.
- **Output:** `GitHubRepoCreateResult` with `Repo` info or `Error`.

## Data Models

### GitHubAuthStatus
```go
type GitHubAuthStatus struct {
    LoggedIn    bool   `json:"loggedIn"`
    Username    string `json:"username,omitempty"`
    AccountType string `json:"accountType,omitempty"`
    Protocol    string `json:"protocol,omitempty"`
    Host        string `json:"host,omitempty"`
    Token       string `json:"token,omitempty"`
    Scopes      string `json:"scopes,omitempty"`
    Error       string `json:"error,omitempty"`
}
```

### GitHubAuthResult
```go
type GitHubAuthResult struct {
    Success bool   `json:"success"`
    Message string `json:"message,omitempty"`
    Error   string `json:"error,omitempty"`
}
```

### GitHubRepo
```go
type GitHubRepo struct {
    Name            string `json:"name"`
    FullName        string `json:"fullName"`
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
```

### GitHubRepoListResult
```go
type GitHubRepoListResult struct {
    Success bool         `json:"success"`
    Repos   []GitHubRepo `json:"repos"`
    Error   string       `json:"error,omitempty"`
}
```

### GitHubRepoCreateOptions
```go
type GitHubRepoCreateOptions struct {
    Name        string `json:"name"`
    Description string `json:"description,omitempty"`
    Private     bool   `json:"private"`
    Clone       bool   `json:"clone"`
    ClonePath   string `json:"clonePath"`
    AddReadme   bool   `json:"addReadme"`
    GitIgnore   string `json:"gitIgnore"`
    License     string `json:"license"`
}
```

### GitHubRepoCreateResult
```go
type GitHubRepoCreateResult struct {
    Success  bool       `json:"success"`
    Repo     GitHubRepo `json:"repo,omitempty"`
    CloneDir string     `json:"cloneDir,omitempty"`
    Error    string     `json:"error,omitempty"`
}
```

### GitHubCloneResult
```go
type GitHubCloneResult struct {
    Success  bool   `json:"success"`
    CloneDir string `json:"cloneDir,omitempty"`
    Error    string `json:"error,omitempty"`
}
```

## Usage Example

```go
svc := NewGitHubService()

if !svc.IsGHInstalled() {
    log.Println("GitHub CLI is not installed")
    return
}

status := svc.AuthStatus()
if !status.LoggedIn {
    login := svc.AuthLogin()
    if !login.Success {
        log.Printf("Login failed: %s", login.Error)
        return
    }
}

repos := svc.RepoList(20, "private")
if repos.Success {
    for _, r := range repos.Repos {
        log.Printf("%s (%s)", r.FullName, r.URL)
    }
}
```

## Implementation Notes

- All operations shell out to `gh` via `CommandRunner`.
- Repo listing uses JSON output for reliable parsing.
- Auth status output is parsed from `gh auth status` (which prints to stderr).
- `AuthLoginWithToken()` currently returns a guidance error until stdin piping is supported.
