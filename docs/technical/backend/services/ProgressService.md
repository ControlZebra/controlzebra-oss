# ProgressService

> `services/progress_service.go` — ~411 lines. Git operations with real-time progress streaming.

## Overview

ProgressService wraps long-running git operations (push, pull, sync, clone) with real-time progress parsing. It reads git's stderr output line-by-line and emits `git-progress` events to the frontend for UI updates.

## Constructor

```go
func NewProgressService() *ProgressService {
    return &ProgressService{
        runner: NewCommandRunner(),
    }
}
```

Requires `SetApp()` for event emission.

## Methods

| Method | Wraps | Progress Source |
|--------|-------|----------------|
| `PushWithProgress(repoPath)` | `git push --progress` | stderr |
| `PullWithProgress(repoPath)` | `git pull --no-rebase --progress` | stderr |
| `SyncWithProgress(repoPath)` | Pull + Push with progress | stderr |
| `CloneWithProgress(url, destPath)` | `git clone --progress` | stderr |
| `FetchWithProgress(repoPath)` | `git fetch --all --progress` | stderr |

## Progress Event

```go
type GitProgress struct {
    Operation  string  `json:"operation"`   // "push", "pull", "clone", "fetch"
    Phase      string  `json:"phase"`       // "Counting objects", "Compressing", "Writing objects"
    Percent    int     `json:"percent"`     // 0-100
    Current    int     `json:"current"`     // Objects processed
    Total      int     `json:"total"`       // Total objects
    BytesTotal string  `json:"bytesTotal"`  // Transfer size
    Done       bool    `json:"done"`        // Operation complete
    Error      string  `json:"error"`       // Error message if failed
}
```

Emitted as: `app.Event.Emit("git-progress", progressData)`

## Progress Parsing

Git writes progress to stderr in formats like:
```
Counting objects: 100% (42/42), done.
Compressing objects: 100% (35/35), done.
Writing objects: 100% (42/42), 12.34 MiB | 5.67 MiB/s, done.
```

ProgressService parses these lines with regex to extract phase, percent, and byte counts.

## Frontend Integration

The frontend subscribes to progress events and displays a `ProgressModal`:

```tsx
// In RepoContext
useEffect(() => {
  const unsubscribe = Events.On("git-progress", (event) => {
    setProgress(event.data);
  });
  return unsubscribe;
}, []);
```

The `ProgressModal` component shows:
- Operation name (e.g., "Syncing...")
- Progress bar with percentage
- Phase description
- Transfer size info
- Auto-dismisses on completion

---

**Related:** [[GitService]] (non-progress versions) | [[Event System]] | [[Context Providers]]
