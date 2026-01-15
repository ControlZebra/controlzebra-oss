# RepositorySettingsService

The `RepositorySettingsService` manages repository-level configuration and automatic background tasks for each repository opened in Rewind Logic.

## Overview

This service provides:
1. **Per-repository settings persistence** - Settings are stored per-repo in the user's config directory
2. **Automatic background tasks** - Scheduled git operations that run periodically
3. **Repository-level git configuration** - Wrapper around `git config --local`
4. **Protected branch settings** - Configure which branches should be protected

## Background Tasks

The service runs three background tasks automatically when a repository is opened:

| Task | Default Interval | Command | Purpose |
|------|-----------------|---------|---------|
| **Fetch All** | 5 minutes | `git fetch --all --prune --tags` | Sync branch pointers (metadata only) |
| **LFS Fetch** | 10 minutes | `git lfs fetch --recent` | Download LFS binaries for recent work |
| **Maintenance** | 30 minutes | `git maintenance run --task=commit-graph` | Optimize local database |

### Why These Intervals?

- **5 minutes for fetch**: Industry standard for IDEs (VS Code, JetBrains use 5-10 min). Keeps branch list fresh without excessive network activity.
- **10 minutes for LFS fetch**: LFS downloads are heavier, so less frequent. Still ensures recent binaries are available.
- **30 minutes for maintenance**: Optimization tasks can be CPU-intensive. 30 min balances performance with responsiveness.

## Data Structures

### RepositorySettings

```go
type RepositorySettings struct {
    RepoPath            string                   // Absolute path to the repository
    RepoID              string                   // Unique ID (SHA256 hash of path)
    
    FetchTask           BackgroundTaskConfig     // Fetch task configuration
    LFSFetchTask        BackgroundTaskConfig     // LFS fetch task configuration
    MaintenanceTask     BackgroundTaskConfig     // Maintenance task configuration
    
    FetchSettings       FetchSettings            // Detailed fetch options
    LFSSettings         LFSSettings              // LFS-specific settings
    MaintenanceSettings MaintenanceSettings      // Maintenance task options
    ProtectedBranches   ProtectedBranchSettings  // Branch protection rules
    
    CreatedAt           time.Time
    UpdatedAt           time.Time
}
```

### BackgroundTaskConfig

```go
type BackgroundTaskConfig struct {
    Enabled         bool   // Whether the task should run
    IntervalMinutes int    // How often to run (in minutes)
}
```

### FetchSettings

```go
type FetchSettings struct {
    FetchAllRemotes    bool  // --all flag
    PruneStaleBranches bool  // --prune flag
    FetchTags          bool  // --tags flag
}
```

### LFSSettings

```go
type LFSSettings struct {
    AutoFetch       bool  // Enable automatic LFS fetch
    FetchRecentDays int   // Days to consider "recent" (default: 7)
    AutoPrune       bool  // Auto-prune old LFS objects
    PruneKeepDays   int   // Days to keep before pruning (default: 30)
}
```

### MaintenanceSettings

```go
type MaintenanceSettings struct {
    CommitGraph  bool  // commit-graph task (default: true)
    PackRefs     bool  // pack-refs task (default: false, slow)
    LooseObjects bool  // loose-objects task (default: false, slow)
}
```

### ProtectedBranchSettings

```go
type ProtectedBranchSettings struct {
    ProtectedBranches   []string  // Branch names to protect
    WarnOnDirectCommit  bool      // Show warning when committing
    RequireConfirmation bool      // Require confirmation dialog
}
```

## API Methods

### Settings Management

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `GetSettings` | `repoPath` | `RepositorySettings, error` | Get settings for a repo (creates defaults if none) |
| `SaveSettings` | `settings` | `OperationResult` | Save complete settings object |
| `ResetToDefaults` | `repoPath` | `OperationResult` | Reset all settings to defaults |
| `DeleteSettings` | `repoPath` | `OperationResult` | Remove settings for a repo |

### Update Individual Settings

| Method | Parameters | Returns |
|--------|------------|---------|
| `UpdateBackgroundTask` | `repoPath, taskType, config` | `OperationResult` |
| `UpdateFetchSettings` | `repoPath, fetchSettings` | `OperationResult` |
| `UpdateLFSSettings` | `repoPath, lfsSettings` | `OperationResult` |
| `UpdateMaintenanceSettings` | `repoPath, maintenanceSettings` | `OperationResult` |
| `UpdateProtectedBranches` | `repoPath, protectedBranches` | `OperationResult` |

### Background Task Control

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `StartBackgroundTasks` | `repoPath` | `OperationResult` | Start all enabled tasks |
| `StopBackgroundTasks` | `repoPath` | `OperationResult` | Stop all running tasks |
| `RestartBackgroundTasks` | `repoPath` | `OperationResult` | Restart with current settings |
| `RunTaskNow` | `repoPath, taskType` | `OperationResult` | Run a specific task immediately |
| `GetTaskStatuses` | - | `map[TaskType]Status` | Get status of all tasks |

### Git Configuration

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `GetRemotes` | `repoPath` | `[]GitRemoteInfo, error` | List all remotes |
| `GetGitConfig` | `repoPath, key` | `string, error` | Get a local config value |
| `SetGitConfig` | `repoPath, key, value` | `OperationResult` | Set a local config value |
| `UnsetGitConfig` | `repoPath, key` | `OperationResult` | Remove a local config value |
| `GetAllGitConfigs` | `repoPath` | `map[string]string, error` | Get all local configs |

## Storage

Settings are stored in the user's config directory:
- **macOS**: `~/Library/Application Support/rewind-logic/repositories/<repo_id>.json`
- **Windows**: `%APPDATA%\rewind-logic\repositories\<repo_id>.json`
- **Linux**: `~/.config/rewind-logic/repositories/<repo_id>.json`

The `repo_id` is a SHA256 hash (first 16 hex chars) of the absolute repo path.

## Events

The service emits events that the frontend can listen to:

| Event | Payload | Description |
|-------|---------|-------------|
| `background-task-completed` | `{taskType, repoPath, success, message, error}` | Fired when a background task completes |

## Usage from Frontend

```javascript
import { 
    GetSettings, 
    UpdateBackgroundTask, 
    StartBackgroundTasks,
    RunTaskNow 
} from '../bindings/changeme/repositorysettingsservice';

// Get current settings
const settings = await GetSettings('/path/to/repo');

// Update fetch interval
await UpdateBackgroundTask('/path/to/repo', 'fetch_all', {
    enabled: true,
    intervalMinutes: 10
});

// Start background tasks when repo is opened
await StartBackgroundTasks('/path/to/repo');

// Manually trigger a fetch
await RunTaskNow('/path/to/repo', 'fetch_all');
```

## Integration with RepoContext

The frontend should call `StartBackgroundTasks()` when a repository is opened and `StopBackgroundTasks()` when it's closed:

```javascript
// In RepoContext.jsx
useEffect(() => {
    if (repoPath) {
        StartBackgroundTasks(repoPath);
    }
    return () => {
        if (repoPath) {
            StopBackgroundTasks(repoPath);
        }
    };
}, [repoPath]);
```

## Recovery Options for Common Git Errors

The service provides comprehensive recovery options to help users fix common Git problems without using the command line.

### Diagnostics

| Method | Description |
|--------|-------------|
| `DiagnoseRepository(repoPath)` | Returns a `RecoveryDiagnostics` object with issues and suggestions |

The diagnostics check for:
- Invalid/corrupted repository
- Merge conflicts in progress
- Rebase in progress
- Cherry-pick in progress
- Detached HEAD state
- Stale lock files blocking operations
- Uncommitted changes
- Unpushed commits
- Corrupted objects

### Recovery Methods

#### Abort Operations

| Method | Description |
|--------|-------------|
| `AbortMerge(repoPath)` | Abort an in-progress merge |
| `AbortRebase(repoPath)` | Abort an in-progress rebase |
| `AbortCherryPick(repoPath)` | Abort an in-progress cherry-pick |

#### Fix Lock Issues

| Method | Description |
|--------|-------------|
| `RemoveStaleLocks(repoPath)` | Remove stale `.lock` files blocking Git |

#### Recover from Detached HEAD

| Method | Parameters | Description |
|--------|------------|-------------|
| `RecoverFromDetachedHead` | `repoPath, newBranchName, switchToExisting` | Create new branch or switch to existing |

#### Recover Lost Work

| Method | Description |
|--------|-------------|
| `GetReflog(repoPath, limit)` | Get reflog entries to find lost commits |
| `RecoverToReflogEntry(repoPath, hash, createBranch, branchName)` | Recover to a specific reflog entry |

#### Reset Operations

| Method | Parameters | Description |
|--------|------------|-------------|
| `ResetHard(repoPath, ref, confirm)` | Hard reset (requires confirmation) |
| `StashAndReset(repoPath, ref, message)` | Stash changes first, then reset |

#### Repair Repository

| Method | Description |
|--------|-------------|
| `RepairRepository(repoPath)` | Run fsck, gc, prune, repack to fix corruption |

#### Credential & Remote Issues

| Method | Description |
|--------|-------------|
| `ClearCredentialCache(repoPath)` | Clear cached credentials |
| `FixRemoteURL(repoPath, remoteName, newURL)` | Update remote URL |
| `RecreateRemote(repoPath, remoteName, url)` | Remove and re-add a remote |
| `SetUpstreamBranch(repoPath, remoteBranch)` | Set tracking branch |

### RecoveryDiagnostics Structure

```go
type RecoveryDiagnostics struct {
    IsValidRepo             bool     // Is this a valid git repo?
    HasMergeConflict        bool     // Merge in progress?
    HasRebaseInProgress     bool     // Rebase in progress?
    HasCherryPickInProgress bool     // Cherry-pick in progress?
    IsDetachedHead          bool     // HEAD detached?
    CurrentBranch           string   // Current branch name
    HasStaleLocks           bool     // Lock files present?
    StaleLockFiles          []string // List of lock files
    HasUncommittedChanges   bool     // Uncommitted work?
    UnpushedCommits         int      // Count of unpushed commits
    HasCorruptedObjects     bool     // Corruption detected?
    Issues                  []string // Human-readable issue descriptions
    Suggestions             []string // Suggested recovery actions
}
```

### Frontend Usage Example

```javascript
import { 
    DiagnoseRepository, 
    RemoveStaleLocks,
    AbortMerge,
    RecoverFromDetachedHead,
    RepairRepository
} from '../bindings/changeme/services/repositorysettingsservice';

// Diagnose issues
const diag = await DiagnoseRepository('/path/to/repo');

if (diag.hasStaleLocks) {
    await RemoveStaleLocks('/path/to/repo');
}

if (diag.hasMergeConflict) {
    // Show user option to abort or resolve
    await AbortMerge('/path/to/repo');
}

if (diag.isDetachedHead) {
    // Create recovery branch
    await RecoverFromDetachedHead('/path/to/repo', 'my-work', '');
}

if (diag.hasCorruptedObjects) {
    await RepairRepository('/path/to/repo');
}
```

## Future Considerations

Settings that could be added in future versions:

1. **Commit Settings**
   - Default commit message template
   - Auto-sign commits with GPG

2. **Pull/Push Settings**
   - Rebase vs merge on pull
   - Push tags automatically

3. **Diff Settings**
   - Ignore whitespace
   - Context lines

4. **Notification Settings**
   - Alert on fetch results
   - Alert on merge conflicts detected

5. **Performance Settings**
   - Large file threshold
   - History limit for logs
