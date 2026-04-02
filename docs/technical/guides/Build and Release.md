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

# Refresh Wails-generated version metadata after changing build/config.yml
task common:update:build-assets

# Build the Windows NSIS installer used for releases
DISABLE_AUTO_UPDATE=true task windows:create:nsis:installer ARCH=amd64

# Collect the Windows installer byte size and SHA-256 for update manifests
stat -f "%z" bin/control-zebra-amd64-installer.exe
shasum -a 256 bin/control-zebra-amd64-installer.exe

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
2. Go build: `go build -ldflags "-X main.Version=<version>" -o bin/control-zebra`
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

## Manual Windows Release Workflow

This is the current production release path used for customer builds.

### 1. Bump the app version

Update `build/config.yml`:

```yaml
version: "v<version>"
```

Examples:
- config version: `v0.0.2`
- GitHub release tag: `v0.0.2`
- manifest version: `0.0.2`

### 2. Refresh Wails build assets

Run:

```bash
task common:update:build-assets
```

This updates version-stamped platform files such as Windows manifests and platform plist files.

Important: re-check `build/windows/nsis/wails_tools.nsh` after this step. The generated file can switch the installer from the current per-user model to admin/HKLM settings. Unless there is an explicit product decision to change installer scope, keep:

- `REQUEST_EXECUTION_LEVEL "user"`
- uninstall registry keys under `HKCU`

### 3. Build the Windows NSIS installer

Run:

```bash
DISABLE_AUTO_UPDATE=true task windows:create:nsis:installer ARCH=amd64
```

Expected output:

```text
bin/control-zebra-amd64-installer.exe
```

### 4. Collect artifact metadata

Run:

```bash
stat -f "%z" bin/control-zebra-amd64-installer.exe
shasum -a 256 bin/control-zebra-amd64-installer.exe
```

Use those exact values in the updater manifests.

### 5. Update the release feed repo

The updater manifest lives in the sibling `controlzebra-releases` repository, not this repo.

Update both files:

- `../controlzebra-releases/desktop/stable/update.json`
- `../controlzebra-releases/desktop/beta/update.json`

Keep them identical until the desktop app stops defaulting to the `beta` channel.

Manifest rules:

- `version` is plain semver, for example `0.0.2`
- the GitHub release tag is `v0.0.2`
- `platforms.windows-amd64.url` must point to the NSIS installer asset
- `size` must be the installer byte size
- `checksum` must be `sha256:<hash>`

Example:

```json
{
	"version": "0.0.2",
	"releaseDate": "2026-04-01T00:00:00Z",
	"releaseNotes": "ControlZebra 0.0.2 includes guided Git workflows, visual L5X and PDF diffs, history, merge review, and GitHub publish support.",
	"platforms": {
		"windows-amd64": {
			"url": "https://github.com/ControlZebra/controlzebra-releases/releases/download/v0.0.2/control-zebra-amd64-installer.exe",
			"size": 10331957,
			"checksum": "sha256:cc487849901b2fe9050f6a691931c7cfa9aba60a8847b2b4572ef3377c009bf2"
		}
	}
}
```

### 6. Publish the GitHub release

Upload this installer to the GitHub release tagged `v<version>`:

```text
bin/control-zebra-amd64-installer.exe
```

If manifest signing is enabled, publish matching `update.json.sig` files beside both manifests.

## Version Management

Version defined in `build/config.yml`:
```yaml
version: "v<version>"
```

Injected at compile time:
```bash
go build -ldflags "-X main.Version=v0.0.2"
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
- Auto-updater reads the GitHub Pages-backed manifest feed in the `controlzebra-releases` repo, and those manifests point to GitHub release assets
- Release artifacts: DMG (macOS), NSIS installer (Windows)
- Windows release feed currently requires both `desktop/stable/update.json` and `desktop/beta/update.json`
- Version must stay aligned across the git tag, `build/config.yml`, and updater manifests

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
