# Backend Services Overview

## Introduction

The ControlZebra backend is built with Go and provides services that are exposed to the React frontend via Wails v3 bindings. All services are designed for simplicity and reliability, targeting non-technical users in industrial automation.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Wails Application                      │
│  ┌─────────────────────────────────────────────────────┐│
│  │                    main.go                          ││
│  │  - Application initialization                       ││
│  │  - Service registration                             ││
│  │  - Menu setup                                       ││
│  │  - Event emission                                   ││
│  └─────────────────────────────────────────────────────┘│
│                          │                              │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────────┐│
│  │                   Services Layer                    ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌───────────────┐ ││
│  │  │ GitService  │ │ Settings    │ │ FileSystem    │ ││
│  │  │             │ │ Service     │ │ Service       │ ││
│  │  └──────┬──────┘ └──────┬──────┘ └───────────────┘ ││
│  │         │               │                          ││
│  │         ▼               ▼                          ││
│  │  ┌─────────────────────────────────────────────┐   ││
│  │  │              CommandRunner                   │   ││
│  │  │  - Executes shell commands with timeout     │   ││
│  │  │  - Captures stdout/stderr                   │   ││
│  │  └─────────────────────────────────────────────┘   ││
│  │                                                     ││
│  │  ┌───────────────┐                                 ││
│  │  │ FileDialog    │ ← Uses Wails Dialog API         ││
│  │  │ Service       │                                 ││
│  │  └───────────────┘                                 ││
│  └─────────────────────────────────────────────────────┘│
│                          │                              │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────────┐│
│  │             External CLI Tools                      ││
│  │  ┌─────┐  ┌─────┐  ┌──────┐                        ││
│  │  │ git │  │ gh  │  │ glab │   (future)             ││
│  │  └─────┘  └─────┘  └──────┘                        ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Services Summary

| Service | Purpose | Documentation |
|---------|---------|---------------|
| [GitService](GitService.md) | Git operations via CLI | Repo detection, status, commits, sync |
| [GitHubService](GitHubService.md) | GitHub CLI operations | Auth, repo list/clone/create |
| [SettingsService](SettingsService.md) | App preferences & git config | Theme, last repo, user profile |
| [FileSystemService](FileSystemService.md) | File operations | Directory listing, file opening |
| [FileDialogService](FileDialogService.md) | Native dialogs | Folder selection |
| [CommandRunner](CommandRunner.md) | Command execution | Timeout support, output capture |

## Service Registration

Services are registered in `main.go`:

```go
app := application.New(application.Options{
    Name:        "control-zebra",
    Description: "ControlZebra",
    Services: []application.Service{
        application.NewService(services.NewGitService()),
        application.NewService(services.NewLFSService()),
        application.NewService(services.NewGitHubService()),
        application.NewService(services.NewSettingsService()),
        application.NewService(services.NewFileSystemService()),
        application.NewService(fileDialogService),
    },
    // ...
})
```

## Frontend Bindings

After services are registered, Wails generates TypeScript bindings in `frontend/bindings/`. To regenerate:

```bash
wails3 generate bindings -ts -clean=true
```

Frontend usage:

```typescript
import { DetectRepo, Status, CommitAll } from '../bindings/controlzebra/gitservice';

// All service methods are available as async functions
const info = await DetectRepo('/path/to/repo');
if (info.isRepo) {
    const status = await Status(info.path);
    if (status.hasChanges) {
        const result = await CommitAll(info.path, 'Update configs');
    }
}
```

## Design Principles

1. **CLI-First**: Use external CLI tools (git, gh, glab) rather than Go libraries for compatibility and reliability

2. **User-Friendly Errors**: All error messages are written for non-technical users

3. **Timeout Protection**: All external commands have a 30-second default timeout

4. **Structured Results**: Operations return structured results with `Success`, `Error`, and relevant data

5. **No Exceptions**: Go doesn't have exceptions; errors are returned as values

## Testing

See [Testing.md](Testing.md) for comprehensive testing documentation.

Quick test command:
```bash
go test ./services/... -v
```

## Adding a New Service

1. Create `services/myservice.go` with a struct and methods
2. Create `services/myservice_test.go` with tests
3. Register in `main.go` under `Services: []application.Service{}`
4. Run `wails3 generate bindings -ts -clean=true`
5. Import in frontend from `frontend/bindings/controlzebra/myservice`
6. Add documentation in `docs/technical/MyService.md`

## Common Patterns

### OperationResult

Used for operations that succeed or fail:

```go
type OperationResult struct {
    Success bool   `json:"success"`
    Message string `json:"message"`
    Error   string `json:"error,omitempty"`
}
```

### Error Handling

Services return structured results instead of Go errors:

```go
// Good - structured result for frontend
func (g *GitService) CommitAll(repoPath string, message string) OperationResult {
    if message == "" {
        return OperationResult{
            Success: false,
            Error:   "Commit message is required",
        }
    }
    // ...
}

// Also valid - Go error for internal use
func (g *GitService) GetRecentCommits(repoPath string, limit int) ([]CommitInfo, error) {
    // ...
}
```

### Helper Functions

Common utilities in service files:

```go
// trimOutput removes whitespace from command output
func trimOutput(s string) string {
    return strings.TrimSpace(s)
}

// getErrorMessage extracts error from CommandResult
func getErrorMessage(result CommandResult) string {
    if result.Stderr != "" {
        return result.Stderr
    }
    return result.Error
}
```
