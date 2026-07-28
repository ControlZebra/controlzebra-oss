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

## Change Requests

GitHubService also owns the Change Requests feature (GitHub pull requests, surfaced to users as "Change Requests"). See the [Change Requests Implementation Plan](../../../plans/Change%20Requests%20Implementation%20Plan.md) for the full contract.

### Create Flow Methods
| Method | `gh` / `git` Command | Purpose |
|--------|----------------------|---------|
| `ListChangeRequestTargets(repoPath)` | `GetChangeRequestRepository` + `OriginRemoteBranches` | Origin branches a request may target, with the default marked. Symbolic `origin/HEAD` is excluded. |
| `FindOpenChangeRequestForBranch(repoPath, source)` | `gh pr list --head <source> --state open --limit 1 --json ...` | Deterministic duplicate lookup. Cross-repository (fork) results are skipped. |
| `CreateChangeRequest(repoPath, options)` | `gh pr create --base <target> --head <source> ...` | Opens exactly one request after every preflight check passes. |

### Create Safety Contract

`CreateChangeRequest` never pushes implicitly and never retries. In order:

1. Validate title, source, and target; reject when source equals target or the repository default branch.
2. Acquire the backend per-repository lock (`lockChangeRequestRepo`) so `RepositorySettingsService` Go timers cannot advance the branch mid-create.
3. Re-verify the synced-branch rule with `verifyBranchSyncedForChangeRequest` — clean tree and index, an `origin/<branch>` upstream, and a local `HEAD` OID equal to the `ls-remote origin` OID. The origin OID is read without mutating any local ref.
4. Run `FindOpenChangeRequestForBranch`; a match returns `duplicate_request` routed to the existing request.
5. On a create-time duplicate race (HTTP 422 or GitHub's "already exists" message), re-run the lookup and route to the discovered request. Never retry `gh pr create`.

All failures carry a stable `GitHubChangeRequestErrorCode` (never a raw CLI string) plus a user-safe `error` message. `extractChangeRequestURL` and `changeRequestNumberFromURL` parse `gh`'s success output; the created number is used to reload full detail via `GetChangeRequest`.

### gh CLI Field Contract

Decode `gh --json` output into the internal `changeRequestJSON` struct before mapping to exported types, so GitHub's field spelling and nullability stay isolated from the Wails contract. `changeRequestListJSONFields` / `changeRequestDetailJSONFields` are the single field sets used across list, detail, and lookup calls — keep them in sync when adding a field.

### Generated Bindings

`CreateChangeRequest`, `FindOpenChangeRequestForBranch`, `ListChangeRequestTargets`, and the `GitHub*ChangeRequest*` result models are exposed to the frontend through generated bindings. After changing any exported signature or model, regenerate with `task common:generate:bindings` (never edit `frontend/bindings/` by hand). The frontend consumes them through `RepoContext` actions (`checkChangeRequestCreateEligibility`, `loadChangeRequestTargets`, `findOpenChangeRequestForBranch`, `createChangeRequest`) so layout navigation stays out of the repo state machine.

### Diff-Ref Assumptions

Created requests reuse the same snapshot-ref pipeline as browsing: the viewer compares immutable local ref names (merge-base `baseRef`..`headRef`), not raw OIDs, so specialized viewers behave identically to merge review. See `services/change_request_snapshot.go`.

See [[Welcome Feature]] and the Reviews feature (`frontend/src/features/reviews/`) for frontend details.

---

**Related:** [[AuthService]] (Supabase, separate from GitHub) | [[CLI Resolver]] (gh binary resolution)
