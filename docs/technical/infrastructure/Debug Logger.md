# Debug Logger

> `services/debug_logger.go` — Thread-safe ring-buffer logging singleton.

## Overview

The debug logger provides runtime logging that can be toggled on/off with near-zero performance cost when disabled. It uses a circular buffer to store the most recent 5,000 entries, automatically redacts sensitive data, and supports live streaming to the frontend.

## Singleton Access

```go
var globalLogger *DebugLogger
var globalLoggerOnce sync.Once

func GetDebugLogger() *DebugLogger {
    globalLoggerOnce.Do(func() {
        globalLogger = &DebugLogger{
            entries: make([]LogEntry, defaultMaxEntries),
            maxSize: defaultMaxEntries,  // 5000
        }
    })
    return globalLogger
}
```

## LogEntry Structure

```go
type LogEntry struct {
    ID        int64       `json:"id"`        // Unique, monotonic
    Timestamp time.Time   `json:"timestamp"`
    Level     LogLevel    `json:"level"`     // info, warn, error, debug
    Category  LogCategory `json:"category"`  // see below
    Source    string      `json:"source"`    // e.g., "GitService.Commit"
    Message   string      `json:"message"`   // Human-readable
    Details   LogDetails  `json:"details"`   // Structured data
    Duration  int64       `json:"duration"`  // Milliseconds
}

type LogDetails struct {
    Command  string   `json:"command,omitempty"`
    Args     []string `json:"args,omitempty"`
    Stdout   string   `json:"stdout,omitempty"`   // Truncated to 2048 chars
    Stderr   string   `json:"stderr,omitempty"`
    ExitCode int      `json:"exitCode,omitempty"`
}
```

## Log Categories

| Category | Used For | Example |
|----------|---------|---------|
| `command` | CLI executions | `git status`, `gh auth status` |
| `method` | Service method calls | `GitService.CommitAll` |
| `event` | Wails event emissions | `file-changes` emitted |
| `error` | Caught errors | Parse failure, timeout |
| `lifecycle` | App start/stop | Service initialization |

## Key Behaviors

### Atomic Toggle
```go
// Near-zero cost check when disabled
if !logger.enabled.Load() {
    return
}
```

Uses `atomic.Bool` — no mutex overhead for the common case.

### Ring Buffer
```
Entries: [0] [1] [2] ... [4999]
                    ↑ head
When head reaches 4999, wraps to 0 (overwrites oldest)
```

### Sensitive Data Redaction

Automatically masks:
- GitHub PATs: `ghp_xxxx` → `ghp_****`
- URL passwords: `https://user:pass@host` → `https://user:****@host`
- Auth tokens in args

### Export

`ExportLogs()` writes all entries to a timestamped JSON file in the logs directory:
```
<LogsDir>/debug-logs-2026-03-17T10-30-00.json
```

Auto-cleanup: exports older than 7 days are deleted on each export.

### Live Streaming

When `SetApp()` is called, new log entries are emitted as events:
```go
s.app.Event.Emit("debug:new-log", entry)
```

The frontend [[Debug Feature|DebugPage]] subscribes to these for real-time log display.

## Usage in Services

```go
// Log a method call
GetDebugLogger().LogMethod("GitService.CommitAll", "Committing all changes")

// Log a CLI command (done automatically by CommandRunner)
GetDebugLogger().LogCommand("CommandRunner", LogDetails{
    Command: "git", Args: []string{"commit", "-m", "msg"},
    ...
})
```

---

**Related:** [[DebugService]] (frontend facade) | [[CommandRunner]] (auto-logs commands)
