# FileWatcherService

> `services/file_watcher_service.go` — ~291 lines. Filesystem monitoring with event batching.

## Overview

FileWatcherService watches the open repository's directory for file changes using `fsnotify`. It batches rapid filesystem events (editor saves, build outputs) into a single notification with a 300ms debounce.

## Constructor

```go
func NewFileWatcherService() *FileWatcherService {
    return &FileWatcherService{
        batchDelay:   300 * time.Millisecond,
        pendingBatch: make(map[string]FileChangeEvent),
    }
}
```

Requires `SetApp()` for event emission.

## Key Methods

| Method | Purpose |
|--------|---------|
| `Watch(repoPath)` | Start watching a directory |
| `Unwatch()` | Stop watching current directory |
| `IsWatching()` | Check if actively watching |

## Watch Strategy

- Watches **root directory + immediate subdirectories** (1 level deep for performance)
- Skips: `.git`, `node_modules`, hidden directories, editor swap files (`*.swp`, `#*`)
- **Auto-adds** newly created subdirectories to watch list
- **Auto-removes** deleted subdirectories from watch list

## Event Batching

Filesystem operations often generate multiple events in rapid succession (rename = delete + create, editor save = write + rename). The service coalesces these:

```
Event received → Added to pendingBatch map (keyed by path)
  → Reset 300ms timer
  → After 300ms quiet period → Emit batch as "file-changes" event
```

## Emitted Event

```go
type FileChangeEvent struct {
    Path      string `json:"path"`      // File path relative to repo root
    EventType string `json:"eventType"` // "create", "write", "remove", "rename"
    IsDir     bool   `json:"isDir"`
    Timestamp int64  `json:"timestamp"` // Unix milliseconds
}
```

Event name: `"file-changes"` — emits array of `FileChangeEvent`.

## Frontend Consumption

The frontend's [[Context Providers#RepoContext|RepoContext]] subscribes to `file-changes` events:

```tsx
Events.On("file-changes", () => {
    // Trigger git status refresh
    refreshStatus();
});
```

This is the **primary** state sync mechanism. See [[State Management]] for the full sync strategy.

## Lifecycle

```
Repo opened → Watch(repoPath)
  → Creates fsnotify.Watcher
  → Starts event loop goroutine
  → Starts batch flush goroutine
  
Repo closed → Unwatch()
  → Stops goroutines
  → Closes fsnotify.Watcher

Repo changed → Unwatch() + Watch(newPath)
```

---

**Related:** [[State Management]] | [[Event System]] | [[Context Providers]]
