# Rewind Logic - Copilot Instructions

## Project Overview
Rewind Logic is a simplified desktop Git client targeting non-technical users in industrial automation (PLC, HMI, actuator configs). Built with **Wails v3** (Go backend + React/Vite frontend). **Primary target: Windows**.

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
- Regenerate with: `wails3 generate bindings -clean=true`
- Import Go service methods: `import { Greet } from '../bindings/changeme/greetservice'`

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
4. Import in frontend from `frontend/bindings/changeme/myservice`

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
- **TODO**: Establish testing conventions
- Backend: Use Go's `testing` package, place tests in `*_test.go` files
- Frontend: Consider Vitest for React component testing
- Integration: Test CLI tool wrappers with mock/stub approaches

## Setup Notes
- Update `go.mod` module name from `changeme` to your actual module path
- Ensure `git`, `gh`, and `glab` CLIs are available in PATH for development

## File Structure Quick Reference
```
main.go              # Wails app entry, window config
*service.go          # Backend services (exposed to frontend)
frontend/
  src/
    context/         # React context (LayoutContext)
    constants/       # Shared constants (VIEWS, ICON_SIZES)
    components/
      layout/        # Main UI structure
        views/       # Sidebar content views
  bindings/          # Auto-generated Wails bindings (DO NOT EDIT)
build/
  Taskfile.yml       # Build tasks
  config.yml         # Wails project config
```
