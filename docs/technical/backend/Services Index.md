# Services Index

> All 13 registered backend services. Each service has its own detailed page linked below.

## Registered Services

| # | Service | File | Lines | Purpose | Emits Events? |
|---|---------|------|-------|---------|---------------|
| 1 | [[GitService]] | `services/git_service.go` | ~5,185 | Core git: status, commit, branches, merge, conflicts, stash, diff, reset, cherry-pick, revert, bisect, lock files | No |
| 2 | [[LFSService]] | `services/lfs_service.go` | ~889 | Git LFS: track/untrack, locks, fetch/pull/push, prune, presets, large file detection | No |
| 3 | [[GitHubService]] | `services/github_service.go` | ~1,184 | GitHub CLI wrapper: device-flow auth, repo CRUD, clone, org listing | No |
| 4 | [[ImageDiffService]] | `services/image_diff_service.go` | ~327 | Pixel-level image comparison between git revisions | No |
| 5 | [[SettingsService]] | `services/settings_service.go` | ~354 | App settings (theme, last repo), recent folders, git identity | No |
| 6 | [[FileSystemService]] | `services/filesystem_service.go` | ~734 | Directory listing, file reading (text/base64), open file/URL, clipboard, trash | No |
| 7 | [[FileDialogService]] | `services/file_dialog_service.go` | ~67 | Native OS folder picker dialog | No |
| 8 | [[ProgressService]] | `services/progress_service.go` | ~411 | Git operations with progress streaming | Yes (`git-progress`) |
| 9 | [[RepositorySettingsService]] | `services/repository_settings_service.go` | ~1,578 | Per-repo config, background tasks, diagnostics, recovery, gitignore templates | Yes (`background-task-completed`) |
| 10 | [[FileWatcherService]] | `services/file_watcher_service.go` | ~291 | Filesystem watcher (fsnotify) with 300ms debounce | Yes (`file-changes`) |
| 11 | [[AuthService]] | `services/auth_service.go` | ~95 | Supabase session persistence via OS keychain | No |
| 12 | [[DebugService]] | `services/debug_service.go` | ~67 | Runtime debug logging facade (toggle, export) | Yes (`debug:new-log`) |
| 13 | [[LocalBinService]] | `services/local_bin_service.go` | ~505 | Windows portable CLI toolchain download | Yes (`local-bin:progress`) |
| 14 | [[ConflictQueueService]] | `services/conflict_queue_service.go` | ~230 | Authoritative queue of conflicted files for the open repository | Yes (`conflictQueue:changed`) |

## Infrastructure (Not Registered, But Critical)

| File | Purpose | Docs |
|------|---------|------|
| `services/runner.go` | [[CommandRunner]] — All CLI execution, timeout, debug logging | [[CommandRunner]] |
| `services/cli_resolver.go` | [[CLI Resolver]] — Resolves git/gh/lfs binary paths | [[CLI Resolver]] |
| `services/data_paths.go` | [[Data Paths]] — XDG-compliant storage layout + migration | [[Data Paths]] |
| `services/debug_logger.go` | [[Debug Logger]] — Thread-safe ring-buffer singleton | [[Debug Logger]] |
| `services/repo_events.go` | RepoEventBus — In-process repository mutation events | [[ConflictQueueService]] |
| `services/conflict_queue_classifier.go` | Conflict classification (kind, file kind, eligibility) | [[ConflictQueueService]] |
| `services/local_bin_paths.go` | Platform-specific portable tool storage paths | — |
| `services/sysproc_windows.go` | Windows: hides console windows | — |
| `services/sysproc_unix.go` | Unix: process group attributes | — |
| `services/github_credentials.go` | GitHub credential helpers | — |

## Dependency Graph

```
main.go
  └── 13 Services (each instantiated with NewXxxService())
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

## Adding a New Service

See [[Adding a New Service]] for the step-by-step guide.
