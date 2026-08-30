# Services Index

> Registered backend services and the detailed documentation available for each one.

## Registered Services

| # | Service | File | Lines | Purpose | Emits Events? |
|---|---------|------|-------|---------|---------------|
| 1 | [GitService](services/GitService.md) | `services/git_service.go` | ~5,185 | Core git: status, commit, branches, merge, conflicts, stash, diff, reset, cherry-pick, revert, bisect, lock files | No |
| 2 | [LFSService](services/LFSService.md) | `services/lfs_service.go` | ~889 | Git LFS: track/untrack, locks, fetch/pull/push, prune, presets, large file detection | No |
| 3 | [GitHubService](services/GitHubService.md) | `services/github_service.go` | ~1,184 | GitHub CLI wrapper: device-flow auth, repo CRUD, clone, org listing | No |
| 4 | [ImageDiffService](services/Other%20Services.md#imagediffservice) | `services/image_diff_service.go` | ~327 | Pixel-level image comparison between git revisions | No |
| 5 | [SettingsService](services/SettingsService.md) | `services/settings_service.go` | ~354 | App settings (theme, last repo), recent folders, git identity | No |
| 6 | [FileSystemService](services/FileSystemService.md) | `services/filesystem_service.go` | ~734 | Directory listing, file reading (text/base64), open file/URL, clipboard, trash | No |
| 7 | [FileDialogService](services/Other%20Services.md#filedialogservice) | `services/file_dialog_service.go` | ~67 | Native OS folder picker dialog | No |
| 8 | [ProgressService](services/ProgressService.md) | `services/progress_service.go` | ~411 | Git operations with progress streaming | Yes (`git-progress`) |
| 9 | [RepositorySettingsService](services/RepositorySettingsService.md) | `services/repository_settings_service.go` | ~1,578 | Per-repo config, background tasks, diagnostics, recovery, gitignore templates | Yes (`background-task-completed`) |
| 10 | [FileWatcherService](services/FileWatcherService.md) | `services/file_watcher_service.go` | ~291 | Filesystem watcher (fsnotify) with 300ms debounce | Yes (`file-changes`) |
| 11 | [AuthService](services/Other%20Services.md#authservice) | `services/auth_service.go` | ~95 | Supabase session persistence via OS keychain | No |
| 12 | [DebugService](services/Other%20Services.md#debugservice) | `services/debug_service.go` | ~67 | Runtime debug logging facade (toggle, export) | Yes (`debug:new-log`) |
| 13 | [LocalBinService](services/Other%20Services.md#localbinservice) | `services/local_bin_service.go` | ~505 | Windows portable CLI toolchain download | Yes (`local-bin:progress`) |
| 14 | [ConflictQueueService](services/ConflictQueueService.md) | `services/conflict_queue_service.go` | ~230 | Authoritative queue of conflicted files for the open repository | Yes (`conflictQueue:changed`) |
| 15 | [IntegrationSessionService](services/IntegrationSessionService.md) | `services/integration_session_service.go` | ~650 | Isolated integration readiness, conflict decisions, and guarded Finish | Yes (`integrationSession:changed`, `integrationSession:conflicts`) |

## Infrastructure (Not Registered, But Critical)

| File | Purpose | Docs |
|------|---------|------|
| `services/runner.go` | [CommandRunner](../infrastructure/CommandRunner.md) — All CLI execution, timeout, debug logging | [CommandRunner](../infrastructure/CommandRunner.md) |
| `services/cli_resolver.go` | [CLI Resolver](../infrastructure/CLI%20Resolver.md) — Resolves git/gh/lfs binary paths | [CLI Resolver](../infrastructure/CLI%20Resolver.md) |
| `services/data_paths.go` | [Data Paths](../infrastructure/Data%20Paths.md) — XDG-compliant storage layout + migration | [Data Paths](../infrastructure/Data%20Paths.md) |
| `services/debug_logger.go` | [Debug Logger](../infrastructure/Debug%20Logger.md) — Thread-safe ring-buffer singleton | [Debug Logger](../infrastructure/Debug%20Logger.md) |
| `services/repo_events.go` | RepoEventBus — In-process repository mutation events | [ConflictQueueService](services/ConflictQueueService.md) |
| `services/conflict_queue_classifier.go` | Conflict classification (kind, file kind, eligibility) | [ConflictQueueService](services/ConflictQueueService.md) |
| `services/local_bin_paths.go` | Platform-specific portable tool storage paths | — |
| `services/sysproc_windows.go` | Windows: hides console windows | — |
| `services/sysproc_unix.go` | Unix: process group attributes | — |
| `services/github_credentials.go` | GitHub credential helpers | — |

## Dependency Graph

```
main.go
      └── Registered services (each instantiated with NewXxxService())
        └── CommandRunner (shared CLI executor)
              └── CLI Resolver (cached binary paths)
              └── Debug Logger (optional logging)
        └── Data Paths (storage locations)
```

Most services only depend on `CommandRunner`. Special dependencies:
- `SettingsService` reads/writes to `DataLocations` paths
- `RepositorySettingsService` uses `DataLocations` for per-repo config storage
- `ProgressService` wraps `GitService` methods with progress streaming
- `LocalBinService` uses `CLI Resolver` + `DataLocations` for tool management
- `IntegrationSessionService` uses `GitService` conflict helpers, `RepoEventBus`, and the shared repository coordinator

## Adding a New Service

See [Adding a New Service](../guides/Adding%20a%20New%20Service.md) for the step-by-step guide.
