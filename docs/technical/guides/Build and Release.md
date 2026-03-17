# Build and Release

> Build, package, sign, and distribute ControlZebra Desktop.

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| Go 1.26+ | Backend compilation | [go.dev](https://go.dev) |
| Node.js 20+ | Frontend build | [nodejs.org](https://nodejs.org) |
| Wails v3 CLI | Desktop framework | `go install github.com/wailsapp/wails/v3/cmd/wails3@latest` |
| Task | Build orchestration | `brew install go-task` or [taskfile.dev](https://taskfile.dev) |

## Development Commands

```bash
# Start development mode (hot reload, Vite on port 9245)
task dev

# Build for current OS (production)
task build

# Package for distribution
task package

# Regenerate TypeScript bindings after Go changes
task common:generate:bindings

# Build the auto-updater sidecar
task build:updater

# Run backend tests
go test ./services/... -v

# Run backend tests with coverage
go test ./services/... -coverprofile=coverage.out && go tool cover -html=coverage.out

# Run frontend tests
cd frontend && npm test

# Frontend lint
cd frontend && npm run lint
```

## Build Process

### Development Mode (`task dev`)

1. Wails builds Go backend (`wails3 build DEV=true`)
2. Vite dev server starts (`cd frontend && npm run dev`) — port 9245
3. Wails dev mode connects frontend to Go backend
4. Hot reload: Go changes → rebuild; frontend changes → HMR

### Production Build (`task build`)

1. Frontend build: `cd frontend && npm run build` (Vite production build)
2. Go build: `go build -ldflags "-X main.Version=v0.13.0-beta" -o bin/control-zebra`
3. Assets embedded in binary

### Package (`task package`)

Platform-specific packaging:

**macOS:**
- Output: `.app` bundle
- Codesigning with Developer ID
- DMG creation for distribution
- Notarization via `xcrun notarytool`

**Windows:**
- Output: NSIS installer (`.exe`)
- Includes: main app + `cz-updater.exe` + WebView2 bootstrapper
- Optional: code signing with certificate

## Version Management

Version defined in `build/config.yml`:
```yaml
version: "v0.13.0-beta"
```

Injected at compile time:
```bash
go build -ldflags "-X main.Version=v0.13.0-beta"
```

Accessible in Go via `main.Version` variable, passed to frontend via settings.

## Binding Generation

After any change to Go service exported methods:

```bash
task common:generate:bindings
# or
wails3 generate bindings -ts -clean=true
```

This regenerates `frontend/bindings/controlzebra/services/*.ts`. **Never edit these files manually.**

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_PUBLIC_POSTHOG_KEY` | PostHog analytics API key | — |
| `VITE_PUBLIC_POSTHOG_HOST` | PostHog API host | — |
| `VITE_SUPABASE_URL` | Supabase project URL | — |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | — |
| `CZ_PORTABLE_GIT_URL` | Override MinGit download URL | GitHub releases |
| `CZ_PORTABLE_GH_URL` | Override gh download URL | GitHub releases |
| `CZ_PORTABLE_LFS_URL` | Override git-lfs download URL | GitHub releases |

## CI/CD Considerations

- **Never commit** `.env` files or API keys
- Auto-updater checks GitHub releases for new versions
- Release artifacts: DMG (macOS), NSIS installer (Windows)
- Version tagged in git and `build/config.yml`

## Project Dependencies

### Go (go.mod)
- `github.com/wailsapp/wails/v3` — Desktop framework
- `github.com/fsnotify/fsnotify` — Filesystem watching
- `github.com/zalando/go-keyring` — OS keychain access
- `github.com/nicholasgasior/goimgdiff` — Image comparison

### Frontend (package.json)
- `react`, `react-dom` — UI framework
- `@wailsio/runtime` — Wails frontend runtime
- `@radix-ui/*` — Headless UI primitives
- `@tanstack/react-virtual` — List virtualization
- `lucide-react` — Icons
- `sonner` — Toast notifications
- `react-diff-view` — Diff rendering
- `react-pdf` — PDF viewer
- `online-3d-viewer` — 3D model viewer
- `posthog-js` — Analytics
- `@supabase/supabase-js` — Auth
- `ladder-visualizer` — L5X viewer (local link)

---

**Related:** [[Architecture Overview]] | [[Auto-Updater]] | [[Testing Guide]]
