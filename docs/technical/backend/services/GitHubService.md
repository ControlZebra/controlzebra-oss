# GitHubService

> `services/github_service.go` — ~1,184 lines. GitHub CLI (`gh`) wrapper for authentication and repository management.

## Overview

GitHubService wraps the `gh` CLI to provide GitHub integration without requiring users to understand git remotes, SSH keys, or personal access tokens. Uses GitHub's device flow for zero-friction authentication.

## Constructor

```go
func NewGitHubService() *GitHubService {
    return &GitHubService{
        runner: NewCommandRunner(),
    }
}
```

## Authentication — Device Flow

The device flow lets users authenticate by visiting a URL and entering a code, rather than pasting tokens:

```
Frontend calls AuthLoginStart()
  → gh auth login --web (starts device flow)
  → Returns DeviceFlowResponse{UserCode, VerificationURI}
  → User opens URL, enters code in browser
  → Frontend polls AuthLoginStatus() until complete
  → gh auth status confirms login
```

### Auth Methods
| Method | Purpose |
|--------|---------|
| `AuthLoginStart()` | Start device flow, return code + URL |
| `AuthLoginStatus()` | Check if user completed browser auth |
| `AuthLogout()` | Sign out of GitHub CLI |
| `GetAuthStatus()` | Check current auth state (logged in, account, scopes) |
| `GetAuthToken()` | Get the current auth token (for API calls) |

### Key Types
```go
type DeviceFlowResponse struct {
    UserCode        string `json:"userCode"`
    VerificationURI string `json:"verificationURI"`
}

type AuthStatus struct {
    IsLoggedIn bool   `json:"isLoggedIn"`
    Username   string `json:"username"`
    Protocol   string `json:"protocol"`   // "https" or "ssh"
    Scopes     string `json:"scopes"`
}
```

## Repository Operations

### List / Search
| Method | `gh` Command | Purpose |
|--------|-------------|---------|
| `ListRepos(limit)` | `gh repo list --limit N --json ...` | List user's repos |
| `ListOrgRepos(org, limit)` | `gh repo list <org> --limit N` | List org repos |
| `SearchRepos(query)` | `gh repo list --json ... \| filter` | Search/filter repos |

### Create / Clone
| Method | `gh` Command | Purpose |
|--------|-------------|---------|
| `CreateRepo(name, visibility, desc)` | `gh repo create <name> --private/--public` | Create new GitHub repo |
| `CloneRepo(repoURL, destPath)` | `gh repo clone <url> <path>` | Clone repo to local |
| `ForkRepo(repoURL)` | `gh repo fork <url>` | Fork a repository |

### Organizations
| Method | `gh` Command | Purpose |
|--------|-------------|---------|
| `ListOrgs()` | `gh org list` | List user's organizations |

### Repository Info
| Method | Purpose |
|--------|---------|
| `GetRepoInfo(repoPath)` | Get remote repo details (name, owner, visibility, URL) |
| `IsGitHubRepo(repoPath)` | Check if remote is a GitHub URL |

## Key Types

```go
type GitHubRepo struct {
    Name        string `json:"name"`
    FullName    string `json:"fullName"`    // "owner/name"
    Description string `json:"description"`
    IsPrivate   bool   `json:"isPrivate"`
    CloneURL    string `json:"cloneUrl"`
    SSHURL      string `json:"sshUrl"`
    UpdatedAt   string `json:"updatedAt"`
    Owner       string `json:"owner"`
}

type GitHubOrg struct {
    Login       string `json:"login"`
    Description string `json:"description"`
}
```

## Frontend Integration

The primary frontend touchpoints:
- **GitHubDeviceFlowModal** — Guides user through auth flow
- **CloneProjectPage** — Lists repos, allows cloning
- **PublishToCloudModal** — Creates GitHub repo from local project
- **WelcomeView** — Shows "Connect to GitHub" CTA if not authenticated

See [[Welcome Feature]] and [[Explorer Feature]] for frontend details.

---

**Related:** [[AuthService]] (Supabase, separate from GitHub) | [[CLI Resolver]] (gh binary resolution)
