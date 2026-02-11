# Debug Logging Plan

**Author:** Senior Developer  
**Date:** February 12, 2026  
**Status:** Draft  
**Priority:** High — Observability is critical for diagnosing issues in a desktop app wrapping CLI tools

---

## 1. Motivation

ControlZebra wraps `git`, `gh`, and `glab` CLI tools via Go's `os/exec`. Today, there is **zero runtime visibility** into:

- Which service methods are called and when
- What CLI commands are executed, their arguments, duration, and exit codes
- Errors that occur but are silently returned to the frontend
- Event emission flow between backend and frontend

The only logging is ~12 `log.Println` calls in `cli_resolver.go` and `updater_service.go`. Every other service silently returns `OperationResult`/`CommandResult` structs. When users report bugs, we have no logs to diagnose them.

This plan adds a **structured debug logging system** with a dedicated **Debug view** in the Activity Bar, including an **enable/disable toggle** to control logging at runtime.

---

## 2. Goals

| Goal | Description |
|------|-------------|
| **Log every method call** | Every exported Go service method invocation is recorded with args, duration, and result |
| **Log every CLI command** | Every `CommandRunner` execution is logged with command, args, working dir, duration, exit code, stdout/stderr |
| **Catch and log errors** | All errors (command failures, Go panics, service errors) are captured in the log |
| **In-app Debug view** | A new Activity Bar view to browse, search, filter, and export logs |
| **Enable/disable at runtime** | A toggle button to turn logging on/off without restarting the app |
| **Minimal performance impact** | When disabled, logging adds near-zero overhead; when enabled, uses buffered in-memory ring buffer |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ ActivityBar  │  │  DebugView   │  │ Debug Toggle  │  │
│  │ (Bug icon)  │──│ Log viewer,  │  │ (StatusBar)   │  │
│  │             │  │ filters,     │  │               │  │
│  │             │  │ search,      │  │               │  │
│  │             │  │ export       │  │               │  │
│  └─────────────┘  └──────┬───────┘  └───────┬───────┘  │
│                          │                   │          │
│                    Wails Bindings + Events    │          │
└──────────────────────────┼───────────────────┼──────────┘
                           │                   │
┌──────────────────────────┼───────────────────┼──────────┐
│                     Backend (Go)             │          │
│                          │                   │          │
│  ┌───────────────────────▼───────────────────▼───────┐  │
│  │               DebugService                        │  │
│  │  - SetEnabled(bool)                               │  │
│  │  - GetLogs(filter) → []LogEntry                   │  │
│  │  - ClearLogs()                                    │  │
│  │  - ExportLogs() → string (file path)              │  │
│  │  - GetStats() → DebugStats                        │  │
│  └───────────────────────┬───────────────────────────┘  │
│                          │                               │
│  ┌───────────────────────▼───────────────────────────┐  │
│  │               DebugLogger (singleton)              │  │
│  │  - Ring buffer (max 5000 entries)                 │  │
│  │  - Thread-safe (sync.RWMutex)                     │  │
│  │  - Enabled/disabled flag (atomic)                 │  │
│  │  - Emits "debug:new-log" events to frontend       │  │
│  └───────────┬─────────────────────┬─────────────────┘  │
│              │                     │                     │
│  ┌───────────▼─────────┐  ┌───────▼──────────────────┐  │
│  │   CommandRunner      │  │   Service Method         │  │
│  │   (instrumented)     │  │   Interceptors           │  │
│  │   Logs every Run*()  │  │   Log method entry/exit  │  │
│  └─────────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Backend Implementation

### 4.1 LogEntry Struct

**File:** `services/debug_logger.go`

```go
type LogLevel string

const (
    LogLevelInfo  LogLevel = "info"
    LogLevelWarn  LogLevel = "warn"
    LogLevelError LogLevel = "error"
    LogLevelDebug LogLevel = "debug"
)

type LogCategory string

const (
    LogCategoryCommand    LogCategory = "command"     // CLI command execution
    LogCategoryMethod     LogCategory = "method"      // Service method call
    LogCategoryEvent      LogCategory = "event"       // Wails event emission
    LogCategoryError      LogCategory = "error"       // Caught error
    LogCategoryLifecycle  LogCategory = "lifecycle"   // App start/stop, service init
)

type LogEntry struct {
    ID        int64       `json:"id"`
    Timestamp time.Time   `json:"timestamp"`
    Level     LogLevel    `json:"level"`
    Category  LogCategory `json:"category"`
    Source    string      `json:"source"`    // e.g., "GitService.Commit", "CommandRunner.RunGit"
    Message   string      `json:"message"`   // Human-readable summary
    Details   LogDetails  `json:"details"`   // Structured data
    Duration  int64       `json:"duration"`  // Milliseconds, -1 if not applicable
}

type LogDetails struct {
    // For command logs
    Command   string   `json:"command,omitempty"`   // e.g., "git"
    Args      []string `json:"args,omitempty"`      // e.g., ["commit", "-m", "fix bug"]
    WorkDir   string   `json:"workDir,omitempty"`
    ExitCode  int      `json:"exitCode,omitempty"`
    Stdout    string   `json:"stdout,omitempty"`    // Truncated to 2KB
    Stderr    string   `json:"stderr,omitempty"`    // Truncated to 2KB

    // For method logs
    Method    string      `json:"method,omitempty"`
    Input     interface{} `json:"input,omitempty"`   // Serialized method arguments
    Output    interface{} `json:"output,omitempty"`  // Serialized return value (truncated)

    // For error logs
    Error     string `json:"error,omitempty"`
    Stack     string `json:"stack,omitempty"`
}
```

### 4.2 DebugLogger (Singleton Ring Buffer)

**File:** `services/debug_logger.go`

```go
type DebugLogger struct {
    mu       sync.RWMutex
    enabled  atomic.Bool
    entries  []LogEntry       // Ring buffer
    maxSize  int              // Default: 5000
    nextID   atomic.Int64
    head     int              // Write position
    count    int              // Current entry count
    app      *application.App // For event emission
    
    // Stats
    totalCommands atomic.Int64
    totalErrors   atomic.Int64
    totalMethods  atomic.Int64
}
```

**Key methods:**
- `Log(level, category, source, message, details, duration)` — Adds entry to ring buffer, emits `"debug:new-log"` event if frontend is listening
- `SetEnabled(bool)` — Atomic toggle, logs its own state change
- `IsEnabled() bool` — Atomic read, zero-cost check
- `GetEntries(filter LogFilter) []LogEntry` — Filtered read with pagination
- `Clear()` — Resets buffer
- `Export() (string, error)` — Writes all entries to a timestamped JSON file in `~/.config/control-zebra/logs/`
- `GetStats() DebugStats` — Returns counts, error rate, most-called methods

**Singleton pattern:**
```go
var (
    globalLogger     *DebugLogger
    globalLoggerOnce sync.Once
)

func GetDebugLogger() *DebugLogger {
    globalLoggerOnce.Do(func() {
        globalLogger = &DebugLogger{
            entries: make([]LogEntry, 5000),
            maxSize: 5000,
        }
    })
    return globalLogger
}
```

### 4.3 Instrumented CommandRunner

**File:** `services/runner.go` (modify existing)

The `CommandRunner` is the single chokepoint for all CLI execution. Instrument it by wrapping each `Run*` method:

```go
func (r *CommandRunner) Run(workDir string, name string, args ...string) CommandResult {
    logger := GetDebugLogger()
    start := time.Now()
    
    // Execute as before
    ctx, cancel := context.WithTimeout(context.Background(), r.Timeout)
    defer cancel()
    result := r.runInternal(ctx, workDir, name, args...)
    
    // Log if enabled
    if logger.IsEnabled() {
        duration := time.Since(start).Milliseconds()
        level := LogLevelInfo
        if !result.Success {
            level = LogLevelError
        }
        logger.Log(level, LogCategoryCommand, "CommandRunner.Run", 
            fmt.Sprintf("%s %s → exit %d (%dms)", name, strings.Join(args, " "), result.ExitCode, duration),
            LogDetails{
                Command:  name,
                Args:     args,
                WorkDir:  workDir,
                ExitCode: result.ExitCode,
                Stdout:   truncate(result.Stdout, 2048),
                Stderr:   truncate(result.Stderr, 2048),
                Error:    result.Error,
            },
            duration,
        )
    }
    
    return result
}
```

**Same pattern applied to:** `RunWithContext`, `RunGit`, `RunGitRaw`, `RunGh`, `RunWithStdin`, `RunWithContextAndStdin`

> **Note:** The `IsEnabled()` check is an atomic bool read — effectively free when disabled.

### 4.4 Service Method Logging Helper

Rather than adding logging boilerplate to every single service method (there are 100+ methods across all services), use a lightweight helper pattern:

**File:** `services/debug_logger.go`

```go
// LogMethod logs a service method call. Returns a finish function to log completion.
// Usage:
//   done := LogMethod("GitService.Commit", map[string]interface{}{"message": msg})
//   defer done(result, err)
func LogMethod(source string, input interface{}) func(output interface{}, err error) {
    logger := GetDebugLogger()
    if !logger.IsEnabled() {
        return func(interface{}, error) {} // no-op
    }
    
    start := time.Now()
    logger.Log(LogLevelDebug, LogCategoryMethod, source,
        fmt.Sprintf("→ %s called", source),
        LogDetails{Method: source, Input: input},
        -1,
    )
    
    return func(output interface{}, err error) {
        duration := time.Since(start).Milliseconds()
        level := LogLevelInfo
        errStr := ""
        if err != nil {
            level = LogLevelError
            errStr = err.Error()
        }
        logger.Log(level, LogCategoryMethod, source,
            fmt.Sprintf("← %s completed (%dms)", source, duration),
            LogDetails{Method: source, Output: output, Error: errStr},
            duration,
        )
    }
}
```

**Usage in services (add incrementally to key methods first):**

```go
func (g *GitService) Commit(repoPath, message string) OperationResult {
    done := LogMethod("GitService.Commit", map[string]interface{}{
        "repoPath": repoPath, "message": message,
    })
    
    // ... existing implementation ...
    
    defer done(result, err)
    return result
}
```

### 4.5 DebugService (Wails-exposed)

**File:** `services/debug_service.go`

```go
type DebugService struct {
    logger *DebugLogger
}

type LogFilter struct {
    Level    string `json:"level,omitempty"`    // Filter by level
    Category string `json:"category,omitempty"` // Filter by category
    Source   string `json:"source,omitempty"`   // Filter by source (partial match)
    Search   string `json:"search,omitempty"`   // Full-text search in message
    Limit    int    `json:"limit,omitempty"`    // Max entries to return (default 200)
    Offset   int    `json:"offset,omitempty"`   // Pagination offset
    Since    int64  `json:"since,omitempty"`    // Unix ms timestamp — entries after this
}

type DebugStats struct {
    Enabled       bool  `json:"enabled"`
    TotalEntries  int   `json:"totalEntries"`
    TotalCommands int64 `json:"totalCommands"`
    TotalMethods  int64 `json:"totalMethods"`
    TotalErrors   int64 `json:"totalErrors"`
    BufferUsage   int   `json:"bufferUsage"`   // percentage
}

// Exposed methods (become Wails bindings):
func (d *DebugService) IsEnabled() bool
func (d *DebugService) SetEnabled(enabled bool)
func (d *DebugService) GetLogs(filter LogFilter) []LogEntry
func (d *DebugService) ClearLogs()
func (d *DebugService) ExportLogs() string          // Returns file path
func (d *DebugService) GetStats() DebugStats
func (d *DebugService) GetLogByID(id int64) *LogEntry
```

### 4.6 Registration in main.go

```go
// In main.go, add to services list:
debugService := services.NewDebugService()

// In application.Options.Services:
application.NewService(debugService),

// After app creation:
services.GetDebugLogger().SetApp(app)
```

### 4.7 Log File Export

When `ExportLogs()` is called:
1. Write all current buffer entries as pretty-printed JSON to `~/.config/control-zebra/logs/debug-YYYY-MM-DD-HHMMSS.json`
2. Return the file path so the frontend can show it / open it
3. Automatically clean up exports older than 7 days on app startup

---

## 5. Frontend Implementation

### 5.1 Add DEBUG View Constant

**File:** `frontend/src/constants/index.js`

```js
export const VIEWS = {
  EXPLORER: 'explorer',
  HISTORY: 'history',
  MERGE_CHANGES: 'merge-changes',
  REPO_SETTINGS: 'repo-settings',
  SETTINGS: 'settings',
  PROFILE: 'profile',
  DEBUG: 'debug',           // ← NEW
} as const;
```

### 5.2 Add to ActivityBar

**File:** `frontend/src/components/layout/ActivityBar.tsx`

```tsx
import { Bug } from 'lucide-react';  // Debug icon

// Add to BOTTOM_NAV_ITEMS (above Settings):
const BOTTOM_NAV_ITEMS: NavItem[] = [
  { id: VIEWS.PROFILE, Icon: UserCircle, label: 'Profile', requiresGit: false },
  { id: VIEWS.DEBUG, Icon: Bug, label: 'Debug Logs', requiresGit: false },     // ← NEW
  { id: VIEWS.SETTINGS, Icon: Settings, label: 'Settings', requiresGit: false },
];
```

### 5.3 DebugView Component

**File:** `frontend/src/components/layout/views/DebugView.tsx`

The DebugView is the main UI for the debugging tool. It consists of:

#### Layout Structure

```
┌─────────────────────────────────────────┐
│ Debug Logs                    [●] Enable│  ← Header with enable/disable toggle
├─────────────────────────────────────────┤
│ 🔍 Search logs...                       │  ← Search bar
├────────┬────────┬──────────┬────────────┤
│  All   │Command │ Method   │  Error     │  ← Category filter tabs
├────────┴────────┴──────────┴────────────┤
│ ▼ 14:32:05.123  INFO  command           │
│   git commit -m "fix" → exit 0 (45ms)  │  ← Log entry (expandable)
│ ▼ 14:32:05.100  DEBUG method            │
│   GitService.Commit called              │
│ ▶ 14:32:04.980  ERROR command           │  ← Collapsed entry
│   git push → exit 1 (2300ms)           │
│ ...                                     │
├─────────────────────────────────────────┤
│ 1,247 entries │ 45 errors │ [Export]    │  ← Stats footer with export button
│               │           │ [Clear]     │
└─────────────────────────────────────────┘
```

#### Key Sub-components

| Component | Purpose |
|-----------|---------|
| `DebugToggle` | Toggle switch to enable/disable logging. Calls `DebugService.SetEnabled()`. Shows green dot when active. |
| `LogEntryRow` | Single log entry. Expandable to show full details (stdout, stderr, args, duration). Color-coded by level. |
| `LogFilter` | Category tabs + level dropdown + search input. Managed via local state, passed to `GetLogs()`. |
| `StatsBar` | Footer showing total entries, error count, buffer usage. Auto-refreshes. |
| `ExportButton` | Calls `ExportLogs()`, shows toast with file path, offers "Reveal in Finder/Explorer". |

#### Real-time Updates

- Listen for `"debug:new-log"` Wails event
- Append new entries to local state (virtualized list for performance)
- Auto-scroll to bottom when user is at the bottom (like a terminal)
- Pause auto-scroll if user scrolls up (show "Jump to latest" button)

#### Log Entry Display

```
TIMESTAMP    LEVEL    CATEGORY    MESSAGE                          DURATION
14:32:05     INFO     command     git commit -m "fix" → exit 0    45ms
14:32:04     ERROR    command     git push origin main → exit 1   2300ms
14:32:04     DEBUG    method      GitService.Commit called         —
14:32:03     INFO     method      GitService.GetStatus completed   12ms
```

**Color coding:**
- `INFO` → default gray text
- `WARN` → amber/yellow text
- `ERROR` → red text  
- `DEBUG` → dim gray text

**Expandable details (click to expand):**
```
▼ 14:32:04  ERROR  command  git push origin main → exit 1  (2300ms)
  ┌─────────────────────────────────────────────────┐
  │ Command:   git push origin main                  │
  │ WorkDir:   /Users/user/projects/my-plc           │
  │ Exit Code: 1                                     │
  │ Duration:  2300ms                                 │
  │                                                   │
  │ Stderr:                                           │
  │ fatal: Could not read from remote repository.     │
  │ Please make sure you have the correct access      │
  │ rights and the repository exists.                 │
  └─────────────────────────────────────────────────┘
```

### 5.4 Register in Sidebar VIEW_CONFIG

**File:** `frontend/src/components/layout/Sidebar.tsx`

```tsx
import { DebugView } from './views';

const VIEW_CONFIG: Record<ViewType, ViewConfig> = {
  // ... existing views ...
  [VIEWS.DEBUG]: { title: 'Debug Logs', Component: DebugView },
};
```

### 5.5 Add to Views Barrel Export

**File:** `frontend/src/components/layout/views/index.ts`

```ts
export { default as DebugView } from './DebugView';
```

### 5.6 StatusBar Debug Indicator (Optional Enhancement)

Add a small indicator in the StatusBar that shows logging state:
- 🟢 `Debug: ON` (clickable, toggles off)
- ⚫ `Debug: OFF` (clickable, toggles on)

This gives quick visibility without opening the Debug view.

---

## 6. Implementation Phases

### Phase 1: Core Logger + CommandRunner Instrumentation (Backend)
**Estimated effort:** 1 day  
**Files to create/modify:**

| Action | File | Description |
|--------|------|-------------|
| CREATE | `services/debug_logger.go` | `DebugLogger` singleton, `LogEntry` types, ring buffer, `LogMethod` helper |
| CREATE | `services/debug_logger_test.go` | Unit tests for ring buffer, filtering, thread safety |
| CREATE | `services/debug_service.go` | `DebugService` struct exposed to Wails |
| CREATE | `services/debug_service_test.go` | Unit tests for service methods |
| MODIFY | `services/runner.go` | Add logging hooks to all `Run*`/`RunGit*`/`RunGh*` methods |
| MODIFY | `main.go` | Register `DebugService`, set app reference on logger |

**Deliverable:** Every CLI command executed by the app is logged in memory when debugging is enabled.

### Phase 2: Service Method Logging (Backend)
**Estimated effort:** 1 day  
**Files to modify:**

| Action | File | Description |
|--------|------|-------------|
| MODIFY | `services/git_service.go` | Add `LogMethod()` calls to key methods (~30 most-used) |
| MODIFY | `services/lfs_service.go` | Add `LogMethod()` calls to LFS operations |
| MODIFY | `services/settings_service.go` | Add `LogMethod()` calls to settings operations |
| MODIFY | `services/github_service.go` | Add `LogMethod()` calls to GitHub operations |
| MODIFY | `services/auth_service.go` | Add `LogMethod()` calls to auth operations |
| MODIFY | `services/filesystem_service.go` | Add `LogMethod()` calls to file operations |

**Deliverable:** All important service method calls are logged with inputs, outputs, duration, and errors.

**Priority methods to instrument first (highest diagnostic value):**
1. `GitService`: `Commit`, `Push`, `Pull`, `GetStatus`, `SwitchBranch`, `CreateBranch`, `Merge`, `Stash*`, `ResolveConflict`
2. `LFSService`: `Track`, `Untrack`, `Lock`, `Unlock`, `Pull`
3. `GitHubService`: `CreatePR`, `ListPRs`, `AuthStatus`
4. `SettingsService`: `SaveSettings`, `GetSettings`
5. `AuthService`: `Login`, `Logout`, `GetAuthStatus`

### Phase 3: Debug View UI (Frontend)
**Estimated effort:** 2 days  
**Files to create/modify:**

| Action | File | Description |
|--------|------|-------------|
| MODIFY | `frontend/src/constants/index.js` | Add `DEBUG` to `VIEWS` |
| CREATE | `frontend/src/components/layout/views/DebugView.tsx` | Main debug view component |
| CREATE | `frontend/src/components/layout/views/debug/LogEntryRow.tsx` | Individual log entry component |
| CREATE | `frontend/src/components/layout/views/debug/DebugToggle.tsx` | Enable/disable toggle component |
| CREATE | `frontend/src/components/layout/views/debug/LogFilterBar.tsx` | Search + category filter tabs |
| CREATE | `frontend/src/components/layout/views/debug/StatsBar.tsx` | Footer stats + export/clear buttons |
| MODIFY | `frontend/src/components/layout/views/index.ts` | Export `DebugView` |
| MODIFY | `frontend/src/components/layout/ActivityBar.tsx` | Add Debug nav item with Bug icon |
| MODIFY | `frontend/src/components/layout/Sidebar.tsx` | Add `DEBUG` to `VIEW_CONFIG` |

**Deliverable:** Fully functional debug log viewer in the sidebar with real-time log streaming, filtering, search, and export.

### Phase 4: Polish & StatusBar Indicator (Frontend)
**Estimated effort:** 0.5 day  
**Files to modify:**

| Action | File | Description |
|--------|------|-------------|
| MODIFY | `frontend/src/components/layout/StatusBar.tsx` | Add debug on/off indicator |
| MODIFY | `frontend/src/components/layout/views/DebugView.tsx` | Add virtualized scrolling for performance |

**Deliverable:** StatusBar quick-toggle, performance optimized for large log volumes.

---

## 7. Data Flow

### Enabling Debug Logging
```
User clicks toggle → DebugView calls DebugService.SetEnabled(true)
                    → Go: DebugLogger.enabled.Store(true)
                    → Go: logs "Debug logging enabled" as first entry
                    → Wails event "debug:state-changed" emitted
                    → Frontend updates toggle state + StatusBar indicator
```

### Command Execution Logging
```
Frontend calls GitService.Commit("msg")
  → Go: LogMethod("GitService.Commit", {...}) records start time
  → Go: CommandRunner.RunGit("commit", "-m", "msg")
    → Go: logger.IsEnabled() → true
    → Go: executes command, measures duration
    → Go: logger.Log(INFO, command, "CommandRunner.RunGit", ...)
    → Go: emits "debug:new-log" event with LogEntry
    → Frontend: receives event, appends to log list, auto-scrolls
  → Go: LogMethod done() records completion
  → Go: logger.Log(INFO, method, "GitService.Commit", ...)
  → Go: emits "debug:new-log" event
  → Frontend: receives event, appends to log list
```

### Exporting Logs
```
User clicks Export → DebugView calls DebugService.ExportLogs()
                   → Go: writes JSON to ~/.config/control-zebra/logs/debug-2026-02-12-143205.json
                   → Go: returns file path
                   → Frontend: shows toast "Logs exported to /path/to/file" with "Open" button
                   → User clicks Open → FileSystemService.RevealInFileManager(path)
```

---

## 8. Performance Considerations

| Concern | Mitigation |
|---------|------------|
| **Logging overhead when disabled** | `IsEnabled()` uses `atomic.Bool` — single CPU instruction, no lock |
| **Logging overhead when enabled** | Ring buffer with pre-allocated memory, mutex only on write |
| **Large stdout/stderr** | Truncate to 2KB per field in log entries |
| **Frontend rendering many entries** | Virtual scrolling (react-window or native CSS `content-visibility`) |
| **Memory usage** | 5000-entry ring buffer ≈ 5–10MB max depending on content |
| **Event flooding** | Debounce `"debug:new-log"` events — batch into 100ms windows |
| **Export file size** | JSON export with optional gzip compression |

---

## 9. Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Sensitive data in logs** | Sanitize: redact tokens from `gh auth` commands, redact passwords from remote URLs |
| **Log file access** | Export directory uses OS-standard config dir with user-only permissions |
| **Memory disclosure** | Ring buffer overwrites old entries — no unbounded growth |
| **Default state** | **Logging is OFF by default** — must be explicitly enabled |

**Sanitization rules:**
- Redact any string matching `ghp_*`, `glpat-*`, `gho_*` (GitHub/GitLab tokens)
- Redact password portions of URLs: `https://user:TOKEN@github.com` → `https://user:***@github.com`
- Never log the full content of files being committed

---

## 10. Testing Strategy

| Layer | Test | Type |
|-------|------|------|
| `DebugLogger` | Ring buffer wrapping, thread safety, filtering | Unit test (`debug_logger_test.go`) |
| `DebugLogger` | Enable/disable toggle, atomic safety | Unit test |
| `DebugLogger` | Log export file format, cleanup | Unit test |
| `CommandRunner` | Logging is called on Run, not called when disabled | Unit test (`runner_test.go`) |
| `DebugService` | All exposed methods return correct data | Unit test (`debug_service_test.go`) |
| `DebugView` | Renders log entries, filter works, toggle works | Vitest + React Testing Library |
| `Integration` | Enable logging → run git command → verify log entry appears | Manual E2E test |

---

## 11. Future Enhancements (Post-MVP)

| Enhancement | Description |
|-------------|-------------|
| **Persistent logging** | Write logs to disk in real-time (rotated, max 50MB) for crash diagnostics |
| **Log levels in settings** | Let user choose minimum log level (DEBUG vs INFO vs ERROR only) |
| **Frontend error boundary logging** | Catch React errors and log them to the debug service |
| **Network request logging** | Log Wails binding call round-trip times from the frontend side |
| **Crash report bundling** | Auto-package last 1000 log entries into crash reports |
| **Remote diagnostics** | Optional opt-in to send anonymized logs to PostHog for support |
| **Performance profiling** | Track method call frequency and p50/p95/p99 durations |
| **Log streaming to file** | "Record session" mode that writes everything to a file in real-time |

---

## 12. File Inventory Summary

### New Files (7)

| File | Type | Purpose |
|------|------|---------|
| `services/debug_logger.go` | Go | Core logging engine — ring buffer, types, singleton, helper functions |
| `services/debug_logger_test.go` | Go | Unit tests for logger |
| `services/debug_service.go` | Go | Wails-exposed service for frontend to control and read logs |
| `services/debug_service_test.go` | Go | Unit tests for debug service |
| `frontend/src/components/layout/views/DebugView.tsx` | React | Main debug view container |
| `frontend/src/components/layout/views/debug/LogEntryRow.tsx` | React | Expandable log row component |
| `frontend/src/components/layout/views/debug/DebugToggle.tsx` | React | Enable/disable toggle component |
| `frontend/src/components/layout/views/debug/LogFilterBar.tsx` | React | Search + category filter tabs |
| `frontend/src/components/layout/views/debug/StatsBar.tsx` | React | Stats footer + export/clear |

### Modified Files (8)

| File | Change |
|------|--------|
| `services/runner.go` | Add logging hooks to all Run methods |
| `services/git_service.go` | Add `LogMethod()` to ~30 key methods |
| `services/lfs_service.go` | Add `LogMethod()` to LFS methods |
| `services/settings_service.go` | Add `LogMethod()` to settings methods |
| `services/github_service.go` | Add `LogMethod()` to GitHub methods |
| `main.go` | Register `DebugService`, init logger with app ref |
| `frontend/src/constants/index.js` | Add `DEBUG` view constant |
| `frontend/src/components/layout/ActivityBar.tsx` | Add Debug nav item |
| `frontend/src/components/layout/Sidebar.tsx` | Add `DEBUG` to VIEW_CONFIG |
| `frontend/src/components/layout/views/index.ts` | Export `DebugView` |

---

## 13. Dependencies

- **No new Go dependencies.** Uses only `sync`, `sync/atomic`, `time`, `encoding/json`, `os`, `path/filepath` from stdlib.
- **No new npm dependencies required.** Uses existing MUI + Tailwind + Lucide icons. Virtual scrolling can be done with CSS `content-visibility: auto` to avoid adding `react-window`.

---

## 14. Acceptance Criteria

- [ ] Logging is **OFF by default** — zero performance impact until enabled
- [ ] When enabled, **every CLI command** (`git`, `gh`, `glab`) is logged with command, args, working dir, exit code, duration, and truncated stdout/stderr
- [ ] When enabled, **every key service method** call is logged with inputs, output, duration, and errors
- [ ] **Errors are highlighted** in red in the Debug view and can be filtered to show errors only
- [ ] Debug view is accessible via the **Activity Bar** (Bug icon, bottom section)
- [ ] **Enable/disable toggle** is prominently placed in the Debug view header
- [ ] Logs can be **searched** by text and **filtered** by category (command/method/error)
- [ ] Logs can be **exported** to a JSON file for sharing with support
- [ ] Logs can be **cleared** with a single action
- [ ] Ring buffer **does not exceed 5000 entries** — old entries are overwritten
- [ ] No sensitive data (tokens, passwords) appears in log entries
