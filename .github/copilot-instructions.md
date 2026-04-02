# ControlZebra - Copilot Instructions

## Project Overview

ControlZebra is a simplified desktop Git client targeting **non-technical users** in industrial automation (PLC, HMI, actuator configs). Built with **Wails v3** (Go 1.26 backend + React 18/TypeScript/Vite frontend). **Primary target: Windows**, with macOS support.

**Current Status (March 2026):**
- **App Version:** v0.13.0-beta
- **Wails:** v3.0.0-alpha.69
- v1 MVP: ✅ Complete (repo open, commit, sync, push)
- v2 Core: ✅ Complete (history, diffs, branching, undo/discard, stash, protected branches, conflict resolution, LFS, merge workflows, file viewers, debug logging, image/PDF/3D/L5X diff, auto-updater)
- v2 Frontend: 🔄 In progress (polish, UX refinement)
- v3 (Planned): Industrial file diffing (structured diff for proprietary binary formats)
- v4 (Planned): ControlZebra accounts + collaboration features

See [docs/plans/summary/PLANS_SUMMARY.md](../docs/plans/summary/PLANS_SUMMARY.md) for implementation status and [docs/product/ROADMAP.md](../docs/product/ROADMAP.md) for the product roadmap.

---

## Engineer Instructions

**Role**: You are a senior developer. Your task is to create secure, efficient, reliable, and fast code for a product used by non-technical people. Every change should make git simpler, not more complex.

### Core Principles

1. **Understand Before Building**
   - Read existing code before writing new code
   - Search `services/*.go` for backend methods and `frontend/src/` for UI components
   - Check `frontend/bindings/controlzebra/services/` for available auto-generated bindings
   - The backend likely already has the method you need — wire it to the frontend

2. **No Redundant Logic**
   - Reuse `CommandRunner` (all CLI execution), `OperationResult` (mutation returns), and existing service patterns
   - Don't recreate what exists in context providers (`RepoContext`, `LayoutContext`, `AuthContext`)
   - Frontend bindings are auto-generated — check `frontend/bindings/` before assuming a method doesn't exist

3. **Don't Over-Abstract**
   - Solve the immediate problem cleanly
   - Add abstraction only when you see concrete repetition (rule of three)
   - Prefer simple, readable code over clever patterns

4. **User-First Design**
   - This is a non-technical Git client. User-facing labels must avoid Git jargon
   - Map Git operations to plain-English labels: "Save Changes" not "commit", "Sync" not "pull"
   - Always provide clear error messages and recovery paths

5. **Teaching Mode**
   - After completing a task, explain what you did and why
   - Reference specific files so the developer can learn from the implementation

### Before You Code

```
1. What does the user actually need? (the underlying goal, not just what they said)
2. Does this already exist in the codebase?
3. What's the minimal change to achieve this?
4. What existing patterns should I follow?
```

### Key Files to Check First

| Area | Check These Files |
|------|------------------|
| Git operations | `services/git_service.go` (5,185 lines, 115+ methods) |
| LFS operations | `services/lfs_service.go` (889 lines) |
| GitHub integration | `services/github_service.go` (1,184 lines) |
| Per-repo settings & recovery | `services/repository_settings_service.go` (1,578 lines) |
| App settings | `services/settings_service.go` (354 lines) |
| CLI execution engine | `services/runner.go` (422 lines, `CommandRunner`) |
| CLI binary resolution | `services/cli_resolver.go` (bundled → PATH → fallback) |
| Build & release workflow | `build/config.yml`, `build/windows/Taskfile.yml`, `docs/technical/guides/Build and Release.md`, `docs/technical/infrastructure/Auto-Updater.md` |
| Data paths & migration | `services/data_paths.go` |
| Frontend git state | `frontend/src/context/RepoContext.tsx` (3,052 lines) |
| Frontend UI state | `frontend/src/context/LayoutContext.tsx` (365 lines) |
| Frontend auth state | `frontend/src/context/AuthContext.tsx` (188 lines) |
| UI layout shell | `frontend/src/components/layout/AppLayout.tsx` |
| Constants & view IDs | `frontend/src/constants/index.ts` |
| Viewer system | `frontend/src/lib/viewers.ts` + `viewers-builtin.ts` |

---

## Architecture

### Backend (Go)

- **Entry point:** `main.go` — Wails app initialization, 13 service registrations, event listeners, application menu, window config
- **Module:** `controlzebra` (go.mod)
- **Service pattern:** Go structs with exported methods, registered via `application.NewService()`, auto-exposed to frontend as TypeScript bindings
- **CLI-first principle:** All git/gh operations use `os/exec` via `CommandRunner`. Do NOT use go-git or any Go git library directly
- **Return pattern:** Mutation operations return `OperationResult{Success, Message, Error}`; queries return typed structs
- **Default timeout:** 30 seconds for CLI commands (configurable per-call via context)

### CLI Tool Resolution (`cli_resolver.go`)

The app resolves CLI tools in this priority order:
1. **Bundled** — `.app/Contents/Resources/` (macOS) or `%LOCALAPPDATA%\ControlZebra\tools\bin` (Windows portable)
2. **System PATH** — `exec.LookPath`
3. **Common install paths** (Windows fallback: Program Files, scoop, etc.)
4. **Bare command name** — lets OS do final lookup

**CLI tools used:**
- `git` — Core version control operations
- `gh` — GitHub CLI for auth, repos, clone, create
- `git-lfs` — Large File Storage operations

On **Windows**, the `LocalBinService` auto-downloads portable MinGit + gh + git-lfs if the user doesn't have git installed.

### Frontend (React 18 + TypeScript + Vite)

- **Location:** `frontend/src/`
- **Language:** TypeScript (`.tsx`/`.ts`) throughout — no `.jsx` in production code
- **Styling:** **Tailwind CSS v4** (primary) + **Radix UI** headless primitives + **shadcn-style** component variants (`cva`, `clsx`, `tailwind-merge`)
- **Icons:** **lucide-react** (v0.562) with 4 sizes defined in `ICON_SIZES`: `{ xs: 14, sm: 16, md: 20, lg: 28 }`
- **State management:** 3 React Contexts: `RepoContext` (git state machine), `LayoutContext` (UI state), `AuthContext` (Supabase session)
- **Notifications:** `sonner` toasts
- **Virtualization:** `@tanstack/react-virtual` for large lists (commit history, file lists)
- **Analytics:** PostHog (via `posthog-js`)
- **Auth:** Supabase (`@supabase/supabase-js`) with OS keychain session persistence
- **Linked package:** `ladder-visualizer` (PLC L5X file viewer) linked via `file:../../ladder-visualizer`

**No MUI.** The project migrated fully to Radix + Tailwind + shadcn-style primitives.

### Layout Structure (VS Code-like)

```
AppLayout
├── TopBar              (app header, branch switcher, actions)
├── ActivityBar          (left icon nav: Explorer, History, Merge, Settings, etc.)
├── Sidebar              (view content based on active nav item)
│   └── Views: ExplorerView, HistoryView, MergeChangesView, RepoSettingsView,
│              SettingsView, ProfileView, DebugView, WelcomeView, LoginView
├── MainArea             (primary content area with tabs)
│   └── Pages: ExplorerPage, HistoryPage, MergeChangesPage, RepoSettingsPage,
│              SettingsPage, ProfilePage, DebugPage, WelcomePage
│   └── ExplorerPage sub-screens: AllSyncedScreen, CommitScreen, MergeRequestScreen, ReadyToPushScreen
│   └── Welcome sub-pages: RecentProjectsPage, NewProjectPage, CloneProjectPage, OpenFolderPage
└── StatusBar            (bottom status info)
```

### File Viewer System (Registry-Based)

The app has a pluggable viewer system for opening files in the main area:

| Viewer | File Types | Lazy? |
|--------|-----------|-------|
| `TextViewer` | Code, config, text files | No |
| `ImageViewer` | PNG, JPG, GIF, WebP, BMP, SVG | No |
| `PDFViewer` | PDF | Yes (react-pdf) |
| `Model3DViewer` | STL, OBJ, STEP, 3MF, etc. | Yes (online-3d-viewer) |
| `L5XViewer` | Rockwell L5X/L5K files | Yes (ladder-visualizer) |
| `UnsupportedViewer` | Fallback for unknown types | No |

**Diff viewers:** `TextDiffViewer`, `ImageDiffViewer`, `PDFDiffViewer`, `Model3DDiffViewer`, `L5XLayoutDiffViewer`

**Registry:** `frontend/src/lib/viewers.ts` — `registerViewer()` / `getViewerForFile()`
**Built-in registrations:** `frontend/src/lib/viewers-builtin.ts`
**Add new viewers:** See `docs/technical/DeveloperGuide_Viewer.md`

### Wails Bindings

- Auto-generated in `frontend/bindings/` — **never edit manually**
- Regenerate with: `wails3 generate bindings -ts -clean=true` or `task common:generate:bindings`
- **Import path:** `import { MethodName } from '../../bindings/controlzebra/services/servicename'`
- **Models:** `import { TypeName } from '../../bindings/controlzebra/services/models'`
- All 13 services generate bindings in `frontend/bindings/controlzebra/services/`

### Event System

| Event | Direction | Purpose |
|-------|-----------|---------|
| `folder-selected` | Backend → Frontend | Repo opened via File menu |
| `folder-closed` | Backend → Frontend | Repo closed via File menu |
| `file-changes` | Backend → Frontend | FileWatcherService detected filesystem changes |
| `git-progress` | Backend → Frontend | ProgressService streaming git operation progress |
| `local-bin:progress` | Backend → Frontend | LocalBinService portable tool download progress |
| `file:reveal-in-finder` | Backend → Frontend | File menu action |
| `file:open-in-terminal` | Backend → Frontend | File menu action |
| `background-task-completed` | Backend → Frontend | RepositorySettingsService background task finished |

### State Sync Strategy

1. **Primary:** `FileWatcherService` (fsnotify) watches repo directory, 300ms debounce, emits `file-changes`
2. **Fallback:** 30-second polling interval from frontend
3. **Immediate:** Manual refresh after every git operation

---

## Development Commands

```bash
# Development mode with hot reload (Vite on port 9245)
task dev

# Build for current OS (production)
task build

# Package for distribution
task package

# Regenerate bindings after Go service changes
task common:generate:bindings

# Build the auto-updater sidecar
task build:updater

# Run backend tests
go test ./services/... -v

# Run backend tests with coverage
go test ./services/... -coverprofile=coverage.out && go tool cover -html=coverage.out

# Run frontend tests
cd frontend && npm test

# Refresh version-stamped Wails build assets after changing build/config.yml
task common:update:build-assets

# Build the Windows NSIS installer used by the updater feed
DISABLE_AUTO_UPDATE=true task windows:create:nsis:installer ARCH=amd64
```

## Release Workflow

### Windows Manual Release (Current Production Path)

1. Bump `info.version` in `build/config.yml` to `v<version>`.
2. Run `task common:update:build-assets` so Wails refreshes version-stamped platform files.
3. Immediately inspect `build/windows/nsis/wails_tools.nsh` after that refresh. Keep the current per-user installer behavior (`REQUEST_EXECUTION_LEVEL "user"` and uninstall keys under `HKCU`) unless the product explicitly decides to move to machine-wide installs.
4. Build the release installer with `DISABLE_AUTO_UPDATE=true task windows:create:nsis:installer ARCH=amd64`.
5. Compute installer metadata from `bin/control-zebra-amd64-installer.exe`:
  - byte size: `stat -f "%z" bin/control-zebra-amd64-installer.exe`
  - checksum: `shasum -a 256 bin/control-zebra-amd64-installer.exe`
6. Update the release feed in the sibling `controlzebra-releases` repo:
  - canonical manifest: `../controlzebra-releases/desktop/stable/update.json`
  - compatibility alias: `../controlzebra-releases/desktop/beta/update.json`
7. Keep both manifests identical until the desktop app stops defaulting to the `beta` channel.
8. Manifest contract:
  - `version` is plain semver like `0.0.2`
  - GitHub release tag stays `v0.0.2`
  - Windows asset URL must point at the NSIS installer, not the raw `.exe`
9. Upload `bin/control-zebra-amd64-installer.exe` to the GitHub release tagged `v<version>`.
10. If manifest signing is enabled, publish matching `update.json.sig` files for both channels.

---

## Key Conventions

### Adding a New Go Service

1. Create `services/myservice.go` with struct, constructor (`NewMyService()`), and exported methods
2. Register in `main.go` under `Services: []application.Service{}` using `application.NewService()`
3. If the service needs to emit events, add `app *application.App` field and `SetApp()` method, then call it after `app := application.New(...)` in main.go
4. Run `task dev` — bindings auto-regenerate
5. Import in frontend: `import { Method } from '../../bindings/controlzebra/services/myservice'`

### Adding a Frontend View

1. Define view ID in `frontend/src/constants/index.ts` under `VIEWS`
2. Create sidebar view component in `components/layout/views/MyView.tsx`
3. Create main area page component in `components/layout/pages/MyPage.tsx`
4. Register in the `VIEW_REGISTRY` in `components/layout/pages/index.ts`
5. Export from `views/index.ts`
6. Add nav item in `ActivityBar.tsx`

### UI Guidelines

- **Icons:** Use `lucide-react` exclusively. Size via `ICON_SIZES` constant: `<SomeIcon size={ICON_SIZES.md} />`
- **Components:** Use shadcn-style primitives from `components/ui/` (Button, Input, Select, Card, etc.)
- **Styling:** Tailwind CSS v4. Follow existing patterns: `bg-gray-800/50`, `text-gray-400`, `hover:bg-gray-700/50`
- **Theme classes:** `text-theme-primary`, `bg-theme-surface`, etc. for theme-aware styling
- **Performance:** Wrap components with `memo()`, handlers with `useCallback`, derived state with `useMemo`
- **Toasts:** Use `sonner` for notifications (success, error, info)
- **Modals:** Use the shared modal primitives from `frontend/src/shared/ui`, not bespoke wrappers
- **Modal classes:** `AlertDialog` for confirmations, `Dialog` for workflow/forms, `BlockingDialog` for long-running operational flows
- **Modal contract:** Prefer `open` + `onOpenChange`; use `initialFocusRef` when the first focus target matters
- **Modal rule:** No component outside `frontend/src/shared/ui` should render its own fullscreen modal wrapper or portal unless there is a documented exception

### Git Operation Labels (User-Facing)

| User Label | Git Operation | Implementation |
|------------|---------------|----------------|
| "Save Changes" | `git add . && git commit -m "..."` | `GitService.CommitAll()` |
| "Sync" | `git pull --no-rebase && git push` | `GitService.Sync()` or `ProgressService.SyncWithProgress()` |
| "Share" / "Push" | `git push` | `GitService.Push()` or `ProgressService.PushWithProgress()` |
| "Rewind" | `git reset --soft HEAD~1` | `GitService.ResetSoftHead()` |
| "Discard All" | `git restore . && git restore --staged .` | `GitService.DiscardAll()` |
| "Merge" | `git merge --squash` (default) | `GitService.StartMergeWithOptions()` |
| "Connect to GitHub" | `gh auth login` (device flow) | `GitHubService.AuthLoginStart()` |

### Git Workflow Decisions

- **Merge strategy:** `--no-rebase` (merge-only, no rebase for simplicity)
- **Default merge type:** Squash merge (`isSquashMerge: true`) for linear history
- **Conflict resolution:** Per-file with 3 options: Keep Mine (`--ours`), Keep Theirs (`--theirs`), Keep Both (exports both versions with `_COPY_<timestamp>` suffix)
- **Stuck state recovery:** Handles merge, cherry-pick, revert, AM, bisect states with abort/continue/skip options
- **Protected branches:** Configurable per-repo with warn/require-confirmation options

---

## Testing

- **Backend:** Go's `testing` package, test files in `services/*_test.go`
  - 39+ tests across GitService, SettingsService, FileSystemService, CommandRunner, LFSService, etc.
  - Helpers: `createTestRepo(t)` / `cleanupTestRepo(t, path)` for temp git repos
  - Table-driven tests, error case testing, `t.Skip()` for missing CLI tools
- **Frontend:** Vitest for React component testing (`frontend/vitest.config.ts`)
- **Run backend:** `go test ./services/... -v`
- **Run frontend:** `cd frontend && npm test`

---

## All Backend Services (13 registered)

| # | Service | File | Lines | Purpose |
|---|---------|------|-------|---------|
| 1 | `GitService` | `services/git_service.go` | 5,185 | Core git: status, commit, branches, merge, conflicts, stash, diff, reset, cherry-pick, revert, bisect, lock files (115+ methods) |
| 2 | `LFSService` | `services/lfs_service.go` | 889 | Git LFS: track/untrack patterns, locks, fetch/pull/push, prune, preset patterns, large file detection |
| 3 | `GitHubService` | `services/github_service.go` | 1,184 | GitHub CLI wrapper: device-flow auth, repo list/clone/create, org listing |
| 4 | `ImageDiffService` | `services/image_diff_service.go` | 327 | Pixel-level image comparison between git revisions (PNG, JPG, GIF, WebP, BMP, TIFF) |
| 5 | `SettingsService` | `services/settings_service.go` | 354 | App settings (theme, last repo), recent folders, git user profile (local/global) |
| 6 | `FileSystemService` | `services/filesystem_service.go` | 734 | Directory listing, file reading (text/base64), open file/URL, reveal in Finder, clipboard, trash |
| 7 | `FileDialogService` | `services/file_dialog_service.go` | 67 | Native OS folder picker dialog |
| 8 | `ProgressService` | `services/progress_service.go` | 411 | Git operations with progress streaming (parses stderr, emits `git-progress` events) |
| 9 | `RepositorySettingsService` | `services/repository_settings_service.go` | 1,578 | Per-repo config, background tasks (auto-fetch 5min, LFS fetch 10min, maintenance 30min), diagnostics, recovery tools, gitignore templates |
| 10 | `FileWatcherService` | `services/file_watcher_service.go` | 291 | Filesystem watcher (fsnotify) with 300ms debounce, emits `file-changes` events |
| 11 | `AuthService` | `services/auth_service.go` | 95 | Supabase session persistence via OS keychain (go-keyring) |
| 12 | `DebugService` | `services/debug_service.go` | 67 | Runtime debug logging facade (ring-buffer, toggle on/off, export to JSON) |
| 13 | `LocalBinService` | `services/local_bin_service.go` | 505 | Portable CLI toolchain download for Windows (MinGit 2.48.1, gh 2.71.2, git-lfs 3.7.1) |

### Infrastructure (not registered as services, but critical)

| File | Purpose |
|------|---------|
| `services/runner.go` | `CommandRunner` — all CLI execution, timeout, debug logging, Windows env sanitization |
| `services/cli_resolver.go` | Resolves git/gh/lfs binary paths: bundled → PATH → fallback. Cached via `sync.Once` |
| `services/data_paths.go` | XDG-compliant data layout, startup migration from legacy `control-zebra` → `ControlZebra` dirs |
| `services/debug_logger.go` | Thread-safe ring-buffer logger singleton, categories (command/method/event/error/lifecycle) |
| `services/local_bin_paths.go` | Platform-specific paths for portable tool storage |
| `services/sysproc_windows.go` / `sysproc_unix.go` | Platform-specific process group attributes (hides console windows on Windows) |
| `services/github_credentials.go` | GitHub credential helpers |

---

## Key Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| `RepoContext` | `context/RepoContext.tsx` (3,052 lines) | Full git state machine: repo, status, commits, diffs, branches, merge/conflicts, stash, GitHub integration |
| `LayoutContext` | `context/LayoutContext.tsx` (365 lines) | UI state: active view, sidebar, explorer tabs, theme (light/dark/system) |
| `AuthContext` | `context/AuthContext.tsx` (188 lines) | Supabase session, login/logout, keychain persistence |
| `AppLayout` | `components/layout/AppLayout.tsx` | Root layout: TopBar + ActivityBar + Sidebar + MainArea + StatusBar |
| `DiffViewer` | `components/common/DiffViewer.tsx` | Unified/split diff rendering (react-diff-view) |
| `BranchModal` | `components/layout/BranchModal.tsx` | Branch switching/creation modal |
| `CommitList` | `components/common/CommitList.tsx` | Virtualized commit history list |
| `GitGraph` | `components/common/GitGraph.tsx` | Visual git commit graph |
| `SimpleFileBrowser` | `components/common/SimpleFileBrowser.tsx` | Directory tree file browser |
| `RepoSwitcher` | `components/common/RepoSwitcher.tsx` | Project/repo switching UI |
| `RecoveryBanner` | `components/common/RecoveryBanner.tsx` | Stuck state detection and recovery UI |
| `ProjectCreationStepper` | `components/common/ProjectCreationStepper.tsx` | New project wizard |
| `LFSAutoTrackModal` | `components/common/LFSAutoTrackModal.tsx` | Auto-detect LFS-worthy files before commit |
| `PublishToCloudModal` | `components/common/PublishToCloudModal.tsx` | Publish local repo to GitHub |
| `GitHubDeviceFlowModal` | `components/common/GitHubDeviceFlowModal.tsx` | GitHub device auth flow UI |

### UI Primitives (`components/ui/`)

Shadcn-style Radix-based primitives. Always use these instead of raw HTML or building custom patterns:
`AlertDialog`, `Badge`, `Button`, `ButtonGroup`, `Card`, `ContextMenu`, `DropdownMenu`, `Input`, `Label`, `Popover`, `Progress`, `ProgressModal`, `Select`, `Sonner`, `Switch`, `Table`, `Textarea`, `Tooltip`, `UndoLastSaveDialog`

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useWindowSize` | Responsive breakpoints, auto-collapse sidebar detection |
| `useLfsAutoTrackBeforeSave` | Intercepts commit flow to detect LFS-worthy files, shows modal |
| `useLoginTheme` | Theme cycling for pre-auth screens |

---

## Data Storage Paths

| Data Class | Windows | macOS |
|------------|---------|-------|
| **Config (roaming)** | `%APPDATA%\ControlZebra\config\` | `~/.config/ControlZebra/config/` |
| **Settings file** | `…\config\settings.json` | `…/config/settings.json` |
| **Repo settings** | `…\config\repositories\` | `…/config/repositories/` |
| **Local data** | `%LOCALAPPDATA%\ControlZebra\` | `~/Library/Caches/ControlZebra/` |
| **Logs** | `…\ControlZebra\logs\` | `…/ControlZebra/logs/` |
| **Portable tools** | `…\ControlZebra\tools\bin\` | N/A (uses system) |

---

## File Structure

```
main.go                     # Wails app entry, 13 services, menu, events, window config
go.mod                      # Module: controlzebra, Go 1.26, Wails alpha.69
Taskfile.yml                # Build orchestration (dev, build, package, updater)
build/
  config.yml                # App identity: ControlZebra v0.13.0-beta
  Taskfile.yml              # Common build tasks (bindings, frontend, icons)
cmd/
  updater/                  # Auto-updater sidecar binary (cz-updater)
services/
  git_service.go            # Core git operations (5,185 lines, 115+ methods)
  github_service.go         # GitHub CLI wrapper (1,184 lines)
  lfs_service.go            # Git LFS operations (889 lines)
  repository_settings_service.go  # Per-repo config, background tasks, diagnostics (1,578 lines)
  settings_service.go       # App settings, recent folders, git profile
  filesystem_service.go     # File ops, directory listing, open/reveal
  file_dialog_service.go    # Native folder picker
  file_watcher_service.go   # Filesystem watcher (fsnotify + debounce)
  progress_service.go       # Git progress streaming
  auth_service.go           # Supabase session keychain persistence
  debug_service.go          # Debug logging facade
  image_diff_service.go     # Pixel-level image diff
  local_bin_service.go      # Portable CLI toolchain (Windows)
  runner.go                 # CommandRunner (CLI execution engine)
  cli_resolver.go           # Binary path resolution (bundled → PATH → fallback)
  data_paths.go             # XDG data layout + legacy migration
  debug_logger.go           # Ring-buffer debug logger
frontend/
  src/
    App.tsx                 # Root component
    main.tsx                # Entry point (PostHog, Supabase, providers)
    context/                # 3 Contexts: RepoContext, LayoutContext, AuthContext
    constants/index.ts      # VIEWS, ICON_SIZES, FILE_STATUS, PROJECT_STATES, etc.
    hooks/                  # useWindowSize, useLfsAutoTrackBeforeSave, useLoginTheme
    lib/                    # Utilities: viewers, analytics, supabaseClient, gitHelpers
      viewers.ts            # Viewer registry (registerViewer, getViewerForFile)
      viewers-builtin.ts    # Built-in viewer registrations
    components/
      common/               # Shared: DiffViewer, CommitList, GitGraph, Spinner, etc.
      layout/               # VS Code-like shell
        AppLayout.tsx        # Root layout
        TopBar.tsx           # Header bar
        ActivityBar.tsx      # Left icon navigation
        Sidebar.tsx          # View content panel
        MainArea.tsx         # Primary content with tabs
        StatusBar.tsx        # Bottom status bar
        BranchModal.tsx      # Branch operations modal
        views/               # Sidebar views (Explorer, History, MergeChanges, Settings, etc.)
        pages/               # Main area pages (Explorer, History, Settings, Welcome, etc.)
          explorer/          # AllSyncedScreen, CommitScreen, ReadyToPushScreen
          merge/             # MergeReviewDiffModal
          settings/          # GeneralSettings, GitConfigForm, LFSGroupsSettings
          repo-settings/     # RepoSettingsPage
          welcome/           # RecentProjects, NewProject, CloneProject, OpenFolder
        sidebar-panels/      # ExplorerStatusPanel, SidebarCommitPanel
      ui/                    # shadcn-style Radix primitives (Button, Card, Input, Select, etc.)
      viewers/               # File viewer components + diff viewers
        TextViewer.tsx, ImageViewer.tsx, PDFViewer.tsx, Model3DViewer.tsx
        L5XViewer.tsx, UnsupportedViewer.tsx, ViewerHeader.tsx
        TextDiffViewer.tsx, ImageDiffViewer.tsx, PDFDiffViewer.tsx, Model3DDiffViewer.tsx
        l5x/                 # L5X viewer sub-components
        l5x-layout-diff/     # L5X layout diff viewer sub-components
  bindings/                  # Auto-generated Wails bindings (DO NOT EDIT)
    controlzebra/services/   # TypeScript bindings for all 13 services + models.ts
docs/
  plans/                     # Implementation plans and specs
  product/                   # ROADMAP.md
  technical/                 # Service docs, build guide, workflows, testing
scripts/                     # Build scripts, CLI dependency download
```

---

## Technical Documentation Reference

| Document | Purpose |
|----------|---------|
| `docs/technical/Services.md` | Backend architecture overview |
| `docs/technical/GitService.md` | Core git service (v1 scope — actual service is much larger) |
| `docs/technical/GIT_WORKFLOWS.md` | **Most comprehensive** — all git workflows with decision trees (1,042 lines) |
| `docs/technical/Frontend.md` | Frontend architecture (note: some details outdated re: icons/framework) |
| `docs/technical/CommandRunner.md` | CLI execution engine internals |
| `docs/technical/SettingsService.md` | Settings and git user config |
| `docs/technical/GitHubService.md` | GitHub CLI wrapper |
| `docs/technical/RepositorySettingsService.md` | Per-repo config, background tasks, diagnostics |
| `docs/technical/FileSystemService.md` | File system operations |
| `docs/technical/FileDialogService.md` | Native folder picker |
| `docs/technical/DeveloperGuide_Viewer.md` | How to add new file type viewers |
| `docs/technical/BUILD_GUIDE.md` | Build, package, sign, distribute (678 lines) |
| `docs/technical/DataPolicy.md` | Data storage layout and migration |
| `docs/technical/Testing.md` | Backend testing guide and patterns |
| `docs/technical/ReactBundlingFix.md` | Post-mortem: React duplicate instance crash fix |
