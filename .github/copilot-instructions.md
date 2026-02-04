# ControlZebra - Copilot Instructions

## Project Overview
ControlZebra is a simplified desktop Git client targeting non-technical users in industrial automation (PLC, HMI, actuator configs). Built with **Wails v3** (Go backend + React/Vite frontend). **Primary target: Windows**.

**Current Status (January 2026):**
- v1 MVP: ✅ Complete (repo open, commit, sync, push)
- v2 Core: ✅ Complete (history, diffs, branching, undo/discard)
- v2 Backend: ✅ Complete (stash, protected branches, conflict resolution, LFS)
- v2 Frontend: 🔄 In Progress (conflict UI, protected branch warnings, LFS indicators)

See [docs/product/REVISION_PLAN.md](../docs/product/REVISION_PLAN.md) for detailed implementation status.

---

## Engineer Instructions

**Role**: You are a senior developer. Your task is to create secure, efficient, reliable, and fast code.

### Workflow Principles

1. **Analyze Before Implementing**
   - Read existing code in the codebase before writing new code
   - Understand existing patterns, utilities, and abstractions
   - Check if similar functionality already exists that can be reused or extended

2. **Avoid Double Work**
   - Search for existing implementations before creating new ones
   - Use `grep_search` or `semantic_search` to find related code
   - Check `services/*.go` for backend methods and `frontend/src/` for UI components
   - The backend likely already has the method you need—wire it to the frontend

3. **No Redundant Logic**
   - Reuse existing utilities: `CommandRunner`, `OperationResult`, service patterns
   - Don't recreate what exists in context providers (`RepoContext`, `LayoutContext`)
   - Frontend bindings are auto-generated—check `frontend/bindings/` before assuming a method doesn't exist

4. **Don't Over-Abstract**
   - Solve the immediate problem cleanly
   - Avoid premature generalization
   - Add abstraction only when you see concrete repetition (rule of three)
   - Prefer simple, readable code over clever patterns

5. **Teaching Mode**
   - After completing a task, explain what you did and why
   - Teach the user the approach, patterns used, and trade-offs considered
   - Reference specific files and line numbers so they can learn from the implementation

### Before You Code

```
1. What does the user actually need? (not what they said, but the underlying goal)
2. Does this already exist in the codebase?
3. What's the minimal change to achieve this?
4. What existing patterns should I follow?
```

### Key Files to Check First

| Area | Check These Files |
|------|------------------|
| Git operations | `services/git_service.go` (2000+ lines, comprehensive) |
| LFS operations | `services/lfs_service.go` |
| Settings/config | `services/settings_service.go` |
| Frontend state | `frontend/src/context/RepoContext.jsx` |
| UI layout | `frontend/src/components/layout/` |
| Constants | `frontend/src/constants/index.js` |

---

## Architecture

### Backend (Go)
- Entry point: [main.go](../main.go) - Wails app initialization, window config, event emission
- Services are Go structs exposed to frontend via `application.NewService()`
- Example: [greetservice.go](../greetservice.go) - methods become callable from JS
- **Git operations**: Execute CLI tools via Go's `os/exec` - do NOT use go-git library

### CLI Tool Dependencies
The app wraps these CLI tools (must be installed on user's system):
- `git` - Core version control operations
- `gh` - GitHub CLI for authentication, PRs, issues
- `glab` - GitLab CLI for GitLab-specific workflows

When implementing git features, shell out to these CLIs rather than using Go libraries.

### Frontend (React + Vite)
- Location: `frontend/src/`
- UI Framework: **MUI + Tailwind CSS v4** (hybrid approach)
- State management: React Context in `frontend/src/context/`
- Component structure follows VS Code-like layout:
  - `components/layout/` - AppLayout, ActivityBar, Sidebar, MainArea, BottomPanel, StatusBar
  - `components/layout/views/` - ChangesView, HistoryView, SettingsView, ProfileView

### Wails Bindings
- Auto-generated in `frontend/bindings/` - **never edit manually**
- Regenerate with: `wails3 generate bindings -ts -clean=true`
- Import Go service methods: `import { Greet } from '../bindings/controlzebra/greetservice'`

## Development Commands

```bash
# Development mode with hot reload
task dev

# Build for current OS
task build

# Package for distribution
task package

# Regenerate bindings after Go service changes
task common:generate:bindings
```

## Key Conventions

### Adding a New Go Service
1. Create `myservice.go` with struct and methods
2. Register in [main.go](../main.go) under `Services: []application.Service{}`
3. Run `task dev` - bindings auto-regenerate
4. Import in frontend from `frontend/bindings/controlzebra/myservice`

### Frontend Views Pattern
- Define view ID in [constants/index.js](../frontend/src/constants/index.js) under `VIEWS`
- Create component in `components/layout/views/MyView.jsx`
- Export from `views/index.js`
- Add to `VIEW_CONFIG` in [Sidebar.jsx](../frontend/src/components/layout/Sidebar.jsx)
- Add nav item in [ActivityBar.jsx](../frontend/src/components/layout/ActivityBar.jsx)

### UI Guidelines
- Use MUI icons with consistent sizing via `ICON_SIZES` constant
- Follow existing Tailwind patterns: `bg-gray-800/50`, `text-gray-400`, `hover:bg-gray-700/50`
- Wrap components with `memo()` for performance
- Use `useCallback`/`useMemo` for handlers and derived state

### Git Operations (Planned)
Map user-friendly labels to git commands per README:
| Label | Git Command |
|-------|-------------|
| "Save Changes" | `git add . && git commit` |
| "Sync" | `git pull` |
| "Share" | `git push` |
| "Connect Account" | `gh auth login` / `glab auth login` |

## Testing
- Backend: Go's `testing` package, tests in `services/*_test.go`
- Run tests: `go test ./services/... -v`
- Frontend: Vitest available for React component testing
- Integration: CLI tool wrappers tested with mock approaches

## Existing Backend Services

| Service | File | Purpose |
|---------|------|---------|
| `GitService` | `services/git_service.go` | All git operations (status, commit, diff, branches, stash, conflicts) |
| `LFSService` | `services/lfs_service.go` | Git LFS (track, lock, patterns) |
| `SettingsService` | `services/settings_service.go` | App settings, git config, LFS groups |
| `FileSystemService` | `services/filesystem_service.go` | Directory listing, file operations |
| `FileDialogService` | `services/file_dialog_service.go` | Native folder picker dialogs |
| `TerminalService` | `services/terminal_service.go` | Terminal integration |
| `ProgressService` | `services/progress_service.go` | Operation progress events |

## Existing Frontend Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `RepoContext` | `context/RepoContext.jsx` | Git state, commits, diffs, branches |
| `LayoutContext` | `context/LayoutContext.jsx` | UI state (sidebar, panels, theme) |
| `DiffViewer` | `components/common/DiffViewer.jsx` | Side-by-side diff rendering |
| `BranchModal` | `components/layout/BranchModal.jsx` | Branch switching/creation |
| `ChangesView` | `components/layout/views/ChangesView.jsx` | File changes list |
| `HistoryView` | `components/layout/views/HistoryView.jsx` | Commit history |
| `LFSGroupsSettings` | `components/layout/pages/settings/LFSGroupsSettings.jsx` | Custom LFS patterns |

## Setup Notes
- The `go.mod` module name is `controlzebra`
- Ensure `git`, `gh`, and `glab` CLIs are available in PATH for development

## File Structure Quick Reference
```
main.go              # Wails app entry, window config
services/            # Backend services (exposed to frontend)
  git_service.go     # Core git operations (2000+ lines)
  lfs_service.go     # Git LFS operations
  settings_service.go
  runner.go          # CommandRunner utility
frontend/
  src/
    context/         # React contexts (RepoContext, LayoutContext)
    constants/       # Shared constants (VIEWS, ICON_SIZES)
    components/
      common/        # Shared components (DiffViewer, Spinner)
      layout/        # Main UI structure
        views/       # Sidebar content views
        pages/       # MainArea content pages
        bottom-panels/
      ui/            # shadcn-style primitives
  bindings/          # Auto-generated Wails bindings (DO NOT EDIT)
docs/
  product/           # Product specs (REVISION_PLAN.md, ROADMAP.md)
  technical/         # Technical docs (GitService.md, Services.md)
build/
  Taskfile.yml       # Build tasks
  config.yml         # Wails project config
```
