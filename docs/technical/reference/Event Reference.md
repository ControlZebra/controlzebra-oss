# Event Reference

> Complete catalog of Wails events used in the application.

## Backend → Frontend Events

| Event Name | Payload Type | Emitter | Subscriber | Purpose |
|------------|-------------|---------|------------|---------|
| `folder-selected` | `string` (path) | `main.go` (File menu) | RepoContext | User opened repo via menu |
| `folder-closed` | `string` | `main.go` (File menu) | RepoContext | User closed repo via menu |
| `file-changes` | `FileChangeEvent[]` | FileWatcherService | RepoContext | Filesystem changes detected |
| `git-progress` | `GitProgress` | ProgressService | ProgressModal | Git operation progress |
| `local-bin:progress` | `LocalBinProgress` | LocalBinService | Welcome/Setup UI | Tool download progress |
| `file:reveal-in-finder` | — | `main.go` (File menu) | AppLayout | Menu action |
| `file:open-in-terminal` | — | `main.go` (File menu) | AppLayout | Menu action |
| `background-task-completed` | `BackgroundTaskStatus` | RepositorySettingsService | RepoSettingsPage | Background task finished |
| `debug:new-log` | `LogEntry` | DebugLogger | DebugPage | New debug log entry |
| `conflictQueue:changed` | `ConflictQueueSnapshot` | ConflictQueueService | Conflict queue UI | Full snapshot of files still needing a conflict decision |

## Payload Types

### FileChangeEvent
```go
type FileChangeEvent struct {
    Path      string `json:"path"`
    EventType string `json:"eventType"` // "create", "write", "remove", "rename"
    IsDir     bool   `json:"isDir"`
    Timestamp int64  `json:"timestamp"`
}
```

### GitProgress
```go
type GitProgress struct {
    Operation  string `json:"operation"`  // "push", "pull", "clone", "fetch"
    Phase      string `json:"phase"`      // "Counting objects", "Compressing", etc.
    Percent    int    `json:"percent"`
    Current    int    `json:"current"`
    Total      int    `json:"total"`
    BytesTotal string `json:"bytesTotal"`
    Done       bool   `json:"done"`
    Error      string `json:"error"`
}
```

### LocalBinProgress
```go
type LocalBinProgress struct {
    Tool    string `json:"tool"`     // "git", "gh", "git-lfs"
    Phase   string `json:"phase"`    // "downloading", "extracting", "complete"
    Percent int    `json:"percent"`
    Error   string `json:"error"`
}
```

### BackgroundTaskStatus
```go
type BackgroundTaskStatus struct {
    TaskType   string          `json:"taskType"`
    IsRunning  bool            `json:"isRunning"`
    LastRun    *time.Time      `json:"lastRun"`
    LastResult *OperationResult `json:"lastResult"`
    NextRun    *time.Time      `json:"nextRun"`
    RunCount   int             `json:"runCount"`
    ErrorCount int             `json:"errorCount"`
}
```

### ConflictQueueSnapshot
```go
type ConflictQueueSnapshot struct {
    RepoPath   string               `json:"repoPath"`
    Generation uint64               `json:"generation"` // strictly increasing
    Entries    []ConflictQueueEntry `json:"entries"`    // sorted by path
    ScannedAt  int64                `json:"scannedAt"`  // Unix milliseconds
    Error      string               `json:"error,omitempty"`
}

type ConflictQueueEntry struct {
    Path             string `json:"path"`
    Kind             string `json:"kind"`     // both-modified, both-added, deleted-by-us, …
    FileKind         string `json:"fileKind"` // text, l5x, image, binary, submodule, symlink
    Eligibility      string `json:"eligibility"` // eligible | ineligible
    IneligibleReason string `json:"ineligibleReason,omitempty"`
    SizeBytes        int64  `json:"sizeBytes"`
    HasBase          bool   `json:"hasBase"`
    HasOurs          bool   `json:"hasOurs"`
    HasTheirs        bool   `json:"hasTheirs"`
}
```

See [[ConflictQueueService]] for the full contract.

## Subscribing (Frontend)

```tsx
import { Events } from '@wailsio/runtime';

useEffect(() => {
    const unsubscribe = Events.On("event-name", (event) => {
        const data = event.data;
        // Handle event
    });
    return () => unsubscribe();
}, []);
```

## Emitting (Backend)

```go
s.app.Event.Emit("event-name", payload)
```

---

**Related:** [[Event System]] | [[State Management]]
