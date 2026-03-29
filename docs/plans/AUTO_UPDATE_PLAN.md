# Auto-Update Plan — ControlZebra Desktop (Sidecar Architecture)

This document describes how to implement automatic updates for ControlZebra using an **updater sidecar** — a small, separate Go binary that manages update checks, downloads, and binary replacement. It is written for senior engineers and covers every concept, file, and decision involved.

For Windows installed builds, this document is no longer the source of truth for the apply step. Windows now follows [WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_PLAN.md](./WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_PLAN.md) and [WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_IMPLEMENTATION_PLAN.md](./WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_IMPLEMENTATION_PLAN.md), which replace raw binary swap with sidecar-orchestrated silent NSIS installer handoff under `%LOCALAPPDATA%\Programs\ControlZebra`.

---

## Table of Contents

1. [Why a Sidecar?](#why-a-sidecar)
2. [How Auto-Updates Work (Concepts)](#how-auto-updates-work-concepts)
3. [What We Have Today](#what-we-have-today)
4. [Implementation Steps](#implementation-steps)
   - Phase 1: Version Injection (Build Pipeline) ✅
   - Phase 2: Sidecar Binary (`cmd/updater/`) ✅
   - Phase 3: Backend — UpdaterService (Go Service) ✅
   - Phase 4: Frontend — Update Checker UI ✅
   - Phase 5: Menu Integration ✅
   - Phase 6: Update Manifest & Hosting
   - Phase 7: Build Pipeline — Sidecar Packaging ✅
   - Phase 8: Security (Checksums & Signatures) ✅
   - Phase 9: Delta Updates (Optional, Future)
5. [File Changes Summary](#file-changes-summary)
6. [Testing Strategy](#testing-strategy)
7. [Open Questions / Decisions Needed](#open-questions--decisions-needed)

---

## Why a Sidecar?

The original plan assumed a built-in Wails v3 Updater Service (`application.CreateUpdaterService`). **That API does not exist** in our current dependency (`wails/v3 v3.0.0-alpha.54`) or any released Wails version. It is documented on the v3 alpha docs site as aspirational/planned, with a draft PR (#4820) that has not been merged.

Instead of:
- ❌ Waiting for an unknown timeline for the Wails updater API
- ❌ Adding a heavy Go library dependency to the main app binary
- ❌ Trying to replace our own binary while it's running (OS locks, permission issues)

We use a **sidecar updater**: a separate small executable shipped alongside the main app.

### Why This Pattern?

| Concern | Sidecar Solution |
|---------|-----------------|
| **Can't replace a running binary** (especially on Windows) | The sidecar replaces the *main app* binary while the main app is shut down |
| **Wails has no updater API** | We don't need one — the sidecar is plain Go, no Wails dependency |
| **Windows file locking** | The main app exits first, then the sidecar (which is never locked) does the swap |
| **Crash recovery** | If the sidecar crashes mid-update, the old binary is still intact (we swap atomically) |
| **Future-proof** | If Wails ships an official updater, we can migrate gradually; the sidecar is decoupled |
| **Minimal main app changes** | The main app only needs an `UpdaterService` that talks to the sidecar via stdin/stdout |
| **Easy cross-compilation** | The sidecar is pure Go (`CGO_ENABLED=0`) — trivial to build for all platforms |

### Real-World Precedent

This is the same pattern used by:
- **VS Code** — `code` launches a separate update process
- **Electron's autoUpdater** — uses a helper process (`Squirrel` on Windows)
- **Sparkle** (macOS) — runs update logic in a helper XPC service
- **Chrome** — `GoogleSoftwareUpdate` runs as a separate daemon

---

## How Auto-Updates Work (Concepts)

```
┌──────────────────────┐                        ┌────────────────────────┐
│  ControlZebra (main) │                        │  Update Server (CDN)   │
│                      │                        │                        │
│  UpdaterService (Go) │──── spawns ──────────▶ │                        │
│     ▲                │                        │  update.json (manifest)│
│     │ JSON over      │                        │  binaries (.tar.gz/zip)│
│     │ stdin/stdout   │                        └────────────────────────┘
│     ▼                │                                    ▲
│  cz-updater (sidecar)│────── HTTPS GET ──────────────────┘
│                      │
└──────────────────────┘
```

### The Flow

1. **Main app starts** → `UpdaterService.CheckForUpdate()` is called (after 5s delay, or from Help menu).
2. **UpdaterService spawns the sidecar** (`cz-updater check`) and reads JSON from its stdout.
3. **Sidecar fetches `update.json`** from the update server, compares versions, returns result.
4. **If update available** → frontend shows a notification/modal with release notes.
5. **User clicks "Download & Install"** → `UpdaterService.DownloadAndApply()` is called.
6. **UpdaterService spawns the sidecar** (`cz-updater download`) with the download URL.
7. **Sidecar downloads** the new binary, verifies checksum, stages it in a temp directory.
8. **UpdaterService spawns the sidecar** (`cz-updater apply`) as a **detached process**.
9. **Main app quits gracefully** (saves state, closes repo).
10. **Sidecar waits for main app to exit** (polls PID), then:
    - Renames old binary to `control-zebra.old` (backup)
    - Moves new binary into place
    - Launches the new binary
    - Cleans up `control-zebra.old`
    - Exits

### Key Terms

| Term | Meaning |
|------|---------|
| **Sidecar** | A small helper binary (`cz-updater`) shipped alongside the main app. It handles all update I/O and binary replacement. ~2-3 MB compiled, no CGO. |
| **Manifest** | The `update.json` file hosted on your server. Lists the latest version, platform-specific download URLs, checksums, and release notes. |
| **Atomic swap** | Renaming the new binary into place in a single OS call. If the rename fails, the old binary is untouched. |
| **Checksum** | A SHA-256 hash of the binary. The sidecar re-hashes the download and compares. Mismatch → download rejected. |
| **Signature** | An Ed25519 cryptographic signature of the manifest. Proves the manifest came from us, not a MITM attacker. |
| **Detached process** | A child process that continues running after the parent (main app) exits. Required for the `apply` step. |

---

## What We Have Today

### Version String — Out of Sync

| Location | Current Value | Purpose |
|----------|---------------|---------|
| `build/config.yml` → `info.version` | `0.0.1` | Wails build metadata (Windows `.exe` properties, macOS `Info.plist`) |
| `main.go` → About dialog HTML | `0.2.0` | Displayed to users in Help → About |

**Phase 1 fixes this** by establishing a single source of truth injected at build time.

### Build Pipeline

- `Taskfile.yml` delegates to platform-specific Taskfiles in `build/{darwin,windows,linux}/`.
- macOS: builds binary → wraps in `.app` bundle → ad-hoc code signs.
- Windows: builds `.exe` → generates `.syso` resources → NSIS or MSIX packaging.
- Production builds already use `-ldflags="-w -s"`. We'll append the version string injection here.

### Service Pattern

All backend services follow the same pattern:
1. Go struct in `services/` with methods
2. Registered in `main.go` via `application.NewService()`
3. Auto-generates frontend bindings in `frontend/bindings/`
4. Frontend imports and calls methods directly

The `UpdaterService` will follow this exact pattern — it's "just another service."

### `cmd/` Directory

Currently **empty**. This is where the sidecar's `main.go` will live (`cmd/updater/main.go`), following standard Go project layout conventions.

### Frontend

- React + Vite + Tailwind + MUI icons
- `@wailsio/runtime` for Wails events (`Events.On`, `Events.Emit`)
- Sonner toast library already installed for notifications
- Bindings auto-generated in `frontend/bindings/` — never edited manually

---

## Implementation Steps

### Phase 1: Version Injection (Build Pipeline) ✅ COMPLETE

**Goal:** Establish a single source of truth for the app version and inject it at build time.

**Why first:** Zero external dependencies. Fixes the version inconsistency. Required by all later phases.

**Estimated time:** ~1 hour

#### Step 1.1: Add Version Variable to `main.go`

At the top of `main.go`, add a build-time variable:

```go
// Version is set at build time via -ldflags "-X main.Version=x.y.z"
// Defaults to "0.0.0-dev" for local development builds.
var Version = "0.0.0-dev"
```

This will be overridden during CI/release builds with:
```bash
go build -ldflags="-X main.Version=0.1.0" .
```

#### Step 1.2: Use `Version` in the About Dialog

Replace the hardcoded `"Version 0.2.0"` string in the About dialog HTML with the `Version` variable:

```go
// Before:
aboutWindow.SetHTML(`... <div class="version">Version 0.2.0</div> ...`)

// After:
aboutHTML := fmt.Sprintf(`... <div class="version">Version %s</div> ...`, Version)
aboutWindow.SetHTML(aboutHTML)
```

#### Step 1.3: Add `APP_VERSION` to Root Taskfile

In `Taskfile.yml`, add the `APP_VERSION` variable:

```yaml
vars:
  APP_NAME: "control-zebra"
  APP_VERSION: '{{.APP_VERSION | default "0.0.0-dev"}}'
  BIN_DIR: "bin"
```

#### Step 1.4: Inject Version via `-ldflags` in Platform Taskfiles

For each platform's **production** `BUILD_FLAGS`, append `-X main.Version={{.APP_VERSION}}`:

**macOS** (`build/darwin/Taskfile.yml`):
```yaml
# Before (production):
BUILD_FLAGS: '{{if eq .DEV "true"}}-buildvcs=false -gcflags=all="-l"{{else}}-tags production -trimpath -buildvcs=false -ldflags="-w -s"{{end}}'

# After:
BUILD_FLAGS: '{{if eq .DEV "true"}}-buildvcs=false -gcflags=all="-l"{{else}}-tags production -trimpath -buildvcs=false -ldflags="-w -s -X main.Version={{.APP_VERSION}}"{{end}}'
```

**Windows** (`build/windows/Taskfile.yml`):
```yaml
# Before:
BUILD_FLAGS: '{{if eq .DEV "true"}}-buildvcs=false -gcflags=all="-l"{{else}}-tags production -trimpath -buildvcs=false -ldflags="-w -s -H windowsgui"{{end}}'

# After:
BUILD_FLAGS: '{{if eq .DEV "true"}}-buildvcs=false -gcflags=all="-l"{{else}}-tags production -trimpath -buildvcs=false -ldflags="-w -s -H windowsgui -X main.Version={{.APP_VERSION}}"{{end}}'
```

**Linux** (`build/linux/Taskfile.yml`): Same pattern as macOS.

Now release builds are versioned: `APP_VERSION=0.1.0 task build`

#### Step 1.5: Sync `build/config.yml`

Update `build/config.yml` → `info.version` to match the current logical version. This affects Windows `.exe` file properties and macOS `Info.plist`. For now, manually sync it before releases. (Future: a Taskfile target that patches it automatically.)

---

### Phase 2: Sidecar Binary (`cmd/updater/`) ✅ COMPLETE

**Goal:** Create a standalone Go binary that handles update checking, downloading, and binary replacement.

**Why a separate binary?** The sidecar has zero Wails dependency, zero CGO dependency, and can trivially cross-compile. It's testable in isolation. And critically, it can outlive the main app process to perform the binary swap.

**Estimated time:** ~4 hours

#### Step 2.1: Directory Structure

```
cmd/
  updater/
    main.go          # CLI entry point — subcommand dispatch
    checker.go       # Fetches manifest, compares versions
    downloader.go    # Downloads binary with progress, verifies checksum
    applier.go       # Stages new binary, waits for main app exit, swaps, relaunches
    manifest.go      # Manifest JSON types + parsing
    version.go       # Semantic version comparison
    version_test.go  # Unit tests for version comparison
```

#### Step 2.2: Subcommands

The sidecar uses simple subcommands via `os.Args` (no framework needed):

| Command | Purpose | Output (JSON to stdout) |
|---------|---------|------------------------|
| `cz-updater check --url <manifest-url> --current <version> --os <os> --arch <arch>` | Check if update is available | `{"available": true/false, "version": "...", "releaseNotes": "...", "downloadURL": "...", "size": N, "checksum": "sha256:..."}` |
| `cz-updater download --url <download-url> --checksum <sha256:...> --output <dir>` | Download + verify binary | Progress lines: `{"progress": {"downloaded": N, "total": T, "percent": P}}` then final: `{"success": true, "path": "..."}` |
| `cz-updater apply --staged <path> --target <path> --pid <pid> --launch` | Replace binary + relaunch | Writes to log file (main app has exited by this point) |
| `cz-updater version` | Print sidecar version | Plain text version string |

#### Step 2.3: `check` Subcommand

```
1. HTTP GET <manifest-url>/update.json (30s timeout)
2. Parse JSON into UpdateManifest struct
3. Find platform entry matching --os + --arch (e.g., "darwin-arm64")
4. Compare --current version against manifest version (semver)
5. If manifest.version > current:
     stdout: {"available": true, "version": "0.1.0", "releaseNotes": "...", ...}
     exit 0
6. Else:
     stdout: {"available": false, "currentVersion": "0.1.0"}
     exit 0
7. On any error:
     stderr: error message
     exit 1
```

#### Step 2.4: `download` Subcommand

```
1. Create staging directory: <output>/cz-update-staging/
2. HTTP GET <download-url> with streaming
3. Write to staging file while computing SHA-256 hash incrementally
4. Emit progress JSON lines to stdout every ~500ms:
     {"progress": {"downloaded": 5242880, "total": 15728640, "percent": 33.3}}
5. When download finishes, compare computed hash with --checksum
6. If match:
     stdout: {"success": true, "path": "<staging-dir>/control-zebra"}
     exit 0
7. If mismatch:
     stdout: {"success": false, "error": "checksum mismatch: expected abc... got def..."}
     exit 1
```

#### Step 2.5: `apply` Subcommand

This is the critical phase. The main app spawns this as a **detached process** then quits.

**On macOS/Linux:**
```
1. Verify --staged file exists and is a valid executable
2. Wait for process --pid to exit (poll every 500ms, timeout 30s)
3. Rename --target → --target.old  (backup)
4. Move --staged → --target  (atomic on same filesystem)
5. chmod +x --target
6. If --launch: exec() the new binary (replaces the sidecar process)
7. On next launch, the main app cleans up *.old files if they exist
```

**On Windows:**
```
1. Verify --staged file exists
2. Wait for process --pid to exit (poll every 500ms, timeout 30s)
3. Rename --target → --target.old  (Windows allows rename of unlocked .exe)
4. Copy --staged → --target  (copy, not rename, in case of cross-drive)
5. If --launch: os.StartProcess() the new binary (detached)
6. Clean up --target.old
7. Clean up staging directory
8. Exit
```

**Safety guarantees:**
- If step 3 fails (old binary still locked): abort, user still has a working app.
- If step 4 fails (disk full, permissions): rename `.old` back to original, user still has a working app.
- The `.old` backup is cleaned up on next successful launch (belt and suspenders).
- All errors are logged to a file: `<temp>/cz-updater.log`

#### Step 2.6: Manifest Types

```go
type UpdateManifest struct {
    Version      string                      `json:"version"`
    ReleaseDate  string                      `json:"releaseDate"`
    ReleaseNotes string                      `json:"releaseNotes"`
    Platforms    map[string]PlatformArtifact  `json:"platforms"`
    MinVersion   string                      `json:"minimumVersion,omitempty"`
    Mandatory    bool                        `json:"mandatory,omitempty"`
}

type PlatformArtifact struct {
    URL      string `json:"url"`
    Size     int64  `json:"size"`
    Checksum string `json:"checksum"` // "sha256:<hex>"
}
```

Platform keys: `darwin-arm64`, `darwin-amd64`, `windows-amd64`, `linux-amd64`, `linux-arm64`.

#### Step 2.7: Version Comparison

Simple semver comparison (~30 lines of Go, no external library):

```go
// CompareVersions returns -1, 0, or 1.
// Strips leading "v", splits on ".", compares major/minor/patch as integers.
// Pre-release tags (e.g., "0.1.0-beta.1") are treated as less than release ("0.1.0").
func CompareVersions(a, b string) int
```

---

### Phase 3: Backend — UpdaterService (Go Service) ✅ COMPLETE

**Goal:** Create a Wails-exposed Go service that spawns the sidecar and exposes results to the frontend.

**Estimated time:** ~2 hours

#### Step 3.1: Service Struct

**New file:** `services/updater_service.go`

```go
type UpdaterService struct {
    runner         *CommandRunner
    currentVersion string
    updateURL      string
    sidecarPath    string
    app            *application.Application
}

type UpdateInfo struct {
    Version      string `json:"version"`
    ReleaseNotes string `json:"releaseNotes"`
    DownloadURL  string `json:"downloadURL"`
    Size         int64  `json:"size"`
    Checksum     string `json:"checksum"`
}

func NewUpdaterService(version, updateURL string) *UpdaterService {
    return &UpdaterService{
        runner:         NewCommandRunner(),
        currentVersion: version,
        updateURL:      updateURL,
    }
}

func (u *UpdaterService) SetApp(app *application.Application) {
    u.app = app
    u.sidecarPath = u.resolveSidecarPath()
}
```

#### Step 3.2: Sidecar Path Resolution

The sidecar binary lives next to the main app binary:

```go
func (u *UpdaterService) resolveSidecarPath() string {
    exe, _ := os.Executable()
    exe, _ = filepath.EvalSymlinks(exe) // Resolve symlinks
    dir := filepath.Dir(exe)

    name := "cz-updater"
    if runtime.GOOS == "windows" {
        name = "cz-updater.exe"
    }
    return filepath.Join(dir, name)
}
```

On macOS, the main binary is at `.app/Contents/MacOS/control-zebra`, so the sidecar goes at `.app/Contents/MacOS/cz-updater`.

#### Step 3.3: Exposed Methods (Frontend-Callable)

```go
// GetCurrentVersion returns the app's compiled version string.
func (u *UpdaterService) GetCurrentVersion() string

// CheckForUpdate spawns `cz-updater check` and returns update info.
// Returns nil if no update is available.
func (u *UpdaterService) CheckForUpdate() (*UpdateInfo, error)

// DownloadUpdate spawns `cz-updater download`, streaming progress events.
// Returns the path to the staged binary on success.
func (u *UpdaterService) DownloadUpdate(downloadURL, checksum string) (string, error)

// ApplyUpdate spawns `cz-updater apply` as a detached process, then the app should quit.
func (u *UpdaterService) ApplyUpdate(stagedPath string) error

// DownloadAndApply is a convenience that does download then apply.
func (u *UpdaterService) DownloadAndApply(downloadURL, checksum string) error
```

#### Step 3.4: Spawning the Sidecar — Check

```go
func (u *UpdaterService) CheckForUpdate() (*UpdateInfo, error) {
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    cmd := exec.CommandContext(ctx, u.sidecarPath,
        "check",
        "--url", u.updateURL,
        "--current", u.currentVersion,
        "--os", runtime.GOOS,
        "--arch", runtime.GOARCH,
    )

    output, err := cmd.Output()
    if err != nil {
        return nil, fmt.Errorf("update check failed: %w", err)
    }

    var result struct {
        Available    bool   `json:"available"`
        Version      string `json:"version"`
        ReleaseNotes string `json:"releaseNotes"`
        DownloadURL  string `json:"downloadURL"`
        Size         int64  `json:"size"`
        Checksum     string `json:"checksum"`
    }
    if err := json.Unmarshal(output, &result); err != nil {
        return nil, fmt.Errorf("invalid updater response: %w", err)
    }

    if !result.Available {
        return nil, nil
    }

    return &UpdateInfo{
        Version:      result.Version,
        ReleaseNotes: result.ReleaseNotes,
        DownloadURL:  result.DownloadURL,
        Size:         result.Size,
        Checksum:     result.Checksum,
    }, nil
}
```

#### Step 3.5: Streaming Download Progress

For `DownloadUpdate`, read stdout line-by-line and emit Wails events for the frontend progress bar:

```go
func (u *UpdaterService) DownloadUpdate(downloadURL, checksum string) (string, error) {
    cmd := exec.Command(u.sidecarPath,
        "download",
        "--url", downloadURL,
        "--checksum", checksum,
    )

    stdout, _ := cmd.StdoutPipe()
    if err := cmd.Start(); err != nil {
        return "", fmt.Errorf("failed to start download: %w", err)
    }

    scanner := bufio.NewScanner(stdout)
    var lastLine string
    for scanner.Scan() {
        line := scanner.Text()
        lastLine = line

        // Try to parse as progress event and forward to frontend
        var msg map[string]interface{}
        if json.Unmarshal([]byte(line), &msg) == nil {
            if progress, ok := msg["progress"]; ok {
                u.app.Event.Emit("updater:progress", progress)
            }
        }
    }

    if err := cmd.Wait(); err != nil {
        return "", fmt.Errorf("download failed: %w", err)
    }

    // Parse final line as result
    var result struct {
        Success bool   `json:"success"`
        Path    string `json:"path"`
        Error   string `json:"error"`
    }
    if err := json.Unmarshal([]byte(lastLine), &result); err != nil {
        return "", fmt.Errorf("invalid download result: %w", err)
    }

    if !result.Success {
        return "", fmt.Errorf("download failed: %s", result.Error)
    }
    return result.Path, nil
}
```

#### Step 3.6: Apply Update (Detached Sidecar)

The `apply` command must **outlive** the main app. We spawn it as a detached process:

```go
func (u *UpdaterService) ApplyUpdate(stagedPath string) error {
    exe, _ := os.Executable()
    exe, _ = filepath.EvalSymlinks(exe)

    cmd := exec.Command(u.sidecarPath,
        "apply",
        "--staged", stagedPath,
        "--target", exe,
        "--pid", fmt.Sprintf("%d", os.Getpid()),
        "--launch",
    )

    // Detach so the process survives after we exit
    cmd.SysProcAttr = detachedProcessAttr() // Platform-specific, see below
    cmd.Stdout = nil
    cmd.Stderr = nil

    if err := cmd.Start(); err != nil {
        return fmt.Errorf("failed to start updater apply: %w", err)
    }

    // Release so Go doesn't wait for it
    cmd.Process.Release()
    return nil
    // The frontend should now call app.Quit()
}
```

#### Step 3.7: Platform-Specific Detach

**`services/updater_service_unix.go`** (build tag: `//go:build !windows`):
```go
func detachedProcessAttr() *syscall.SysProcAttr {
    return &syscall.SysProcAttr{Setsid: true}
}
```

**`services/updater_service_windows.go`** (build tag: `//go:build windows`):
```go
func detachedProcessAttr() *syscall.SysProcAttr {
    return &syscall.SysProcAttr{CreationFlags: 0x00000008} // CREATE_NO_WINDOW
}
```

#### Step 3.8: Register in `main.go`

```go
updaterService := services.NewUpdaterService(Version, "https://releases.controlzebra.com/desktop/stable/")

// Add to Services slice:
application.NewService(updaterService),

// After app creation:
updaterService.SetApp(app)
```

Then run `task common:generate:bindings` to auto-generate frontend bindings.

---

### Phase 4: Frontend — Update Checker UI ✅ COMPLETE

**Goal:** Show users when an update is available and let them download + install.

**Estimated time:** ~4 hours

#### Step 4.1: Create the Update Hook

**New file:** `frontend/src/hooks/useUpdateChecker.ts`

Responsibilities:
1. Check for updates on mount (after 5s delay so startup isn't slowed)
2. Expose state: `updateInfo`, `isChecking`, `isDownloading`, `progress`, `error`
3. Expose actions: `checkForUpdates()`, `downloadAndInstall()`, `dismiss()`
4. Listen to `updater:progress` events from the backend for download progress
5. Listen to `updater:manual-check` event from the Help menu

Imports:
- Auto-generated updater bindings from `frontend/bindings/controlzebra/updaterservice`
- `Events` from `@wailsio/runtime`

#### Step 4.2: Create the Update UI Component

**New file:** `frontend/src/components/common/UpdateChecker.tsx`

Follow existing UI patterns:
- Dark theme Tailwind classes (`bg-gray-800/50`, `text-gray-400`, etc.)
- MUI icons with `ICON_SIZES` constant
- Sonner toasts for notifications

**Two-part UI:**

1. **Toast notification** — appears when update is available (non-blocking):
   > "ControlZebra v0.1.0 is available. [View Details]"

2. **Modal dialog** — shown when user clicks "View Details" or from Help menu:
   - Version number + release notes (markdown rendered)
   - Download size
   - Progress bar during download
   - "Download & Install" / "Remind Me Later" buttons
   - "Restarting…" state after apply

**State machine:**
```
[Idle] → [Checking...] → [Update Available] → [Downloading (progress)] → [Applying...] → [Restarting...]
                       ↘ [Up to Date]
                       ↘ [Error] → [Retry]
```

#### Step 4.3: Mount the Component

Add `<UpdateChecker />` to `App.tsx` at the app level:

```tsx
function App() {
  return (
    <RepoProvider>
      <AppLayout />
      <UpdateChecker />  {/* Renders toasts/modals, invisible by default */}
    </RepoProvider>
  );
}
```

---

### Phase 5: Menu Integration ✅ COMPLETE

**Goal:** Add "Check for Updates…" to the Help menu.

**Estimated time:** ~30 minutes

**File to edit:** `main.go`

In the Help menu section (before the About item / separator):

```go
helpMenu.Add("Check for Updates...").OnClick(func(ctx *application.Context) {
    app.Event.Emit("updater:manual-check", "")
})
helpMenu.AddSeparator()
```

The frontend `useUpdateChecker` hook listens for `updater:manual-check` and triggers `checkForUpdates()`, showing results via the same UI.

---

### Phase 6: Update Manifest & Hosting ✅ COMPLETE

**Goal:** Define the manifest format and choose hosting.

**Estimated time:** ~2 hours

**Decisions made:**
- **Hosting:** GitHub Releases (binaries) + GitHub Pages (manifest) on `ControlZebra/controlzebra-releases` repo, CNAME to `releases.controlzebra.com`
- **Artifact format:** Raw binaries (no archives) — sidecar downloads and stages directly
- **Release tooling:** Manual script (`scripts/create-release.sh`) — CI workflow deferred to later
- **First version:** `0.1.0` as baseline for auto-update
- **Manifest URL:** `https://controlzebra.github.io/controlzebra-releases/desktop/beta/update.json`
- **Env override:** `CZ_UPDATE_URL` env var for local testing

#### Step 6.1: Manifest Format

```json
{
  "version": "0.1.0",
  "releaseDate": "2026-03-01T00:00:00Z",
  "releaseNotes": "## What's New in v0.1.0\n\n- Conflict resolution UI\n- Protected branch warnings\n- LFS file indicators\n- Performance improvements",
  "platforms": {
    "darwin-arm64": {
      "url": "https://releases.controlzebra.com/desktop/stable/control-zebra-0.1.0-darwin-arm64.tar.gz",
      "size": 15728640,
      "checksum": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    "darwin-amd64": {
      "url": "https://releases.controlzebra.com/desktop/stable/control-zebra-0.1.0-darwin-amd64.tar.gz",
      "size": 16777216,
      "checksum": "sha256:..."
    },
    "windows-amd64": {
      "url": "https://releases.controlzebra.com/desktop/stable/control-zebra-0.1.0-windows-amd64.zip",
      "size": 14680064,
      "checksum": "sha256:..."
    },
    "linux-amd64": {
      "url": "https://releases.controlzebra.com/desktop/stable/control-zebra-0.1.0-linux-amd64.tar.gz",
      "size": 13631488,
      "checksum": "sha256:..."
    }
  },
  "minimumVersion": "0.1.0",
  "mandatory": false
}
```

#### Step 6.2: Platform Keys

| User's Machine | Platform Key |
|----------------|--------------|
| macOS Apple Silicon (M1/M2/M3/M4) | `darwin-arm64` |
| macOS Intel | `darwin-amd64` |
| Windows 64-bit | `windows-amd64` |
| Linux 64-bit | `linux-amd64` |
| Linux ARM (Raspberry Pi, etc.) | `linux-arm64` |

Primary target is **Windows** (`windows-amd64`). macOS entries are for development.

#### Step 6.3: Hosting — GitHub Releases (Recommended for v1)

Use GitHub Releases on the existing `ControlZebra/controlzebra-releases` repo:

```
https://releases.controlzebra.com/desktop/
├── stable/
│   ├── update.json                                    ← manifest
│   ├── control-zebra-0.1.0-windows-amd64.zip         ← Windows binary
│   ├── control-zebra-0.1.0-darwin-arm64.tar.gz        ← macOS ARM
│   └── control-zebra-0.1.0-darwin-amd64.tar.gz        ← macOS Intel
└── beta/                                              ← future
    └── update.json
```

Options for serving:
1. **GitHub Pages** with CNAME to `releases.controlzebra.com` — free, easy
2. **Cloudflare R2** — cheap, fast CDN, S3-compatible API
3. **Cloudflare Pages** serving from the releases repo — zero-config CDN

#### Step 6.4: CORS

The sidecar makes HTTP requests directly from Go's `net/http` (not from a browser), so **CORS is not a concern**. This is a key advantage of the sidecar approach.

---

### Phase 7: Build Pipeline — Sidecar Packaging

**Goal:** Build the sidecar and include it in the app distribution.

**Estimated time:** ~1 hour

#### Step 7.1: Add Sidecar Build Task

In `Taskfile.yml` (root):

```yaml
tasks:
  build:updater:
    summary: Builds the updater sidecar binary
    cmds:
      - go build -trimpath -ldflags="-w -s -X main.Version={{.APP_VERSION}}" -o {{.BIN_DIR}}/cz-updater{{exeExt}} ./cmd/updater
    env:
      GOOS: '{{OS}}'
      GOARCH: '{{ARCH}}'
      CGO_ENABLED: '0'   # Pure Go — no CGO needed, trivial cross-compilation
```

`CGO_ENABLED=0` is important — it means the sidecar builds instantly for any platform without Docker or cross-compilation toolchains.

#### Step 7.2: Include Sidecar in macOS `.app` Bundle

In `build/darwin/Taskfile.yml`, update `create:app:bundle`:

```yaml
create:app:bundle:
  cmds:
    - mkdir -p {{.BIN_DIR}}/{{.APP_NAME}}.app/Contents/{MacOS,Resources}
    - cp build/darwin/icons.icns {{.BIN_DIR}}/{{.APP_NAME}}.app/Contents/Resources
    - cp {{.BIN_DIR}}/{{.APP_NAME}} {{.BIN_DIR}}/{{.APP_NAME}}.app/Contents/MacOS
    - cp {{.BIN_DIR}}/cz-updater {{.BIN_DIR}}/{{.APP_NAME}}.app/Contents/MacOS    # ← NEW
    - cp build/darwin/Info.plist {{.BIN_DIR}}/{{.APP_NAME}}.app/Contents
    # ... codesign
```

Also update the `run` task similarly for dev mode.

#### Step 7.3: Include Sidecar in Windows NSIS Installer

Update `build/windows/nsis/project.nsi` to include `cz-updater.exe` in the installation directory.

#### Step 7.4: Make Platform Builds Depend on Sidecar

Update each platform's `build` task to depend on `build:updater`:

```yaml
build:
  deps:
    - task: build:updater
  cmds:
    - task: build:native
```

---

### Phase 8: Security (Checksums & Signatures) ✅ COMPLETE

**Estimated time:** ~1 hour

#### Step 8.1: Checksum Verification (Built into Sidecar) ✅

Already implemented in Phase 2's `download` subcommand — the sidecar computes SHA-256 while streaming the download and rejects mismatches. No additional setup.

#### Step 8.2: Signature Verification ✅

Ed25519 manifest signing and verification is fully implemented:

**New files:**
- `cmd/updater/signature.go` — `VerifyManifestSignature()`, `FetchSignature()`, `SignManifest()` functions using Go's `crypto/ed25519`
- `cmd/updater/signature_test.go` — 20 tests covering valid signatures, tampered manifests, wrong keys, bad encodings, HTTP fetching, and end-to-end sign→serve→verify
- `scripts/signing/main.go` — Standalone Go tool with `keygen`, `sign`, and `verify` subcommands

**Modified files:**
- `cmd/updater/main.go` — Added `PublicKey` build-time variable (compiled via `-ldflags "-X main.PublicKey=<base64>"`)
- `cmd/updater/manifest.go` — Split into `FetchManifestRaw()` + `ParseManifest()` + `FetchManifestWithVerification()`
- `cmd/updater/checker.go` — Added `--public-key` flag; uses `FetchManifestWithVerification()` which verifies before parsing
- `services/updater_service.go` — Added `publicKey` field; passes `--public-key` to sidecar; supports `CZ_SIGNING_PUBLIC_KEY` env override
- `Taskfile.yml` — Added `SIGNING_PUBLIC_KEY` variable; injected into sidecar build via `-X main.PublicKey`
- `scripts/create-release.sh` — Added `--sign` / `--signing-key` flags; signs manifest after generation

**Verification behavior:**
- If `PublicKey` is compiled in (production): verification is mandatory, unsigned/tampered manifests are rejected
- If `PublicKey` is empty (dev builds): verification is skipped, backward compatible
- `--public-key` CLI flag overrides the compiled-in key (for testing)

**Key generation and signing workflow:**
```bash
# One-time: generate key pair
go run ./scripts/signing/ keygen

# Store public key in Taskfile.yml (SIGNING_PUBLIC_KEY)
# Store private key in GitHub Actions secrets (UPDATE_SIGNING_KEY)

# During release: sign the manifest
./scripts/create-release.sh -v 0.1.0 -n "Release notes" --sign
# Or with explicit key:
go run ./scripts/signing/ sign --key "$CZ_SIGNING_KEY" --file release/0.1.0/update.json

# Verify before publishing:
go run ./scripts/signing/ verify --key "$SIGNING_PUBLIC_KEY" --file release/0.1.0/update.json --sig release/0.1.0/update.json.sig
```

---

### Phase 9: Delta Updates (Optional, Future)

Not needed for v1. Same concept — use `bsdiff` to generate patches from old→new binary, add a `patches` array to the manifest, sidecar tries patch first and falls back to full download. Full binary for ControlZebra is ~15-30 MB; delta patches would be ~100-500 KB.

---

## File Changes Summary

| File | Change | Phase |
|------|--------|-------|
| **`main.go`** | Add `Version` var, use in About dialog, register `UpdaterService`, add Help menu item | 1, 3, 5 |
| **`Taskfile.yml`** (root) | Add `APP_VERSION` var, add `build:updater` task | 1, 7 |
| **`build/config.yml`** | Sync `info.version` with release | 1 |
| **`build/darwin/Taskfile.yml`** | Add `-X main.Version` to ldflags, include `cz-updater` in `.app` bundle | 1, 7 |
| **`build/windows/Taskfile.yml`** | Add `-X main.Version` to ldflags | 1 |
| **`build/linux/Taskfile.yml`** | Add `-X main.Version` to ldflags | 1 |
| **`cmd/updater/main.go`** | **New** — sidecar CLI entry point | 2 |
| **`cmd/updater/checker.go`** | **New** — manifest fetch + version comparison | 2 |
| **`cmd/updater/downloader.go`** | **New** — streaming download + checksum verification | 2 |
| **`cmd/updater/applier.go`** | **New** — binary swap + relaunch logic | 2 |
| **`cmd/updater/manifest.go`** | **New** — manifest types | 2 |
| **`cmd/updater/version.go`** | **New** — semver comparison | 2 |
| **`cmd/updater/version_test.go`** | **New** — version comparison tests | 2 |
| **`services/updater_service.go`** | **New** — Wails-exposed service, spawns sidecar | 3 |
| **`services/updater_service_unix.go`** | **New** — Unix detached process attr (build tag) | 3 |
| **`services/updater_service_windows.go`** | **New** — Windows detached process attr (build tag) | 3 |
| **`frontend/src/hooks/useUpdateChecker.ts`** | **New** — update logic hook | 4 |
| **`frontend/src/components/common/UpdateChecker.tsx`** | **New** — update UI component | 4 |
| **`frontend/src/App.tsx`** | Mount `<UpdateChecker />` | 4 |
| **`frontend/bindings/`** | **Auto-generated** — updater service bindings | 3 |
| **`cmd/updater/signature.go`** | **New** — Ed25519 verification, signature fetching, signing | 8 |
| **`cmd/updater/signature_test.go`** | **New** — 20 signature verification tests | 8 |
| **`scripts/signing/main.go`** | **New** — keygen/sign/verify CLI tool for releases | 8 |

---

## Testing Strategy

### Local Testing Setup

1. **Build the sidecar:** `go build -o bin/cz-updater ./cmd/updater`
2. **Create a test manifest** at `test-updates/update.json` with a version higher than current.
3. **Serve locally:** `node scripts/serve-static.js 8080 test-updates`
4. **Configure update URL** to `http://localhost:8080/` during development.

### Test Cases

| Test | Expected Behavior |
|------|-------------------|
| **No update available** | Manifest version ≤ current → `CheckForUpdate()` returns nil |
| **Update available** | Manifest version > current → UI shows notification |
| **Download success** | Binary downloads, checksum matches → staged path returned |
| **Download checksum mismatch** | Wrong checksum → download rejected, error shown |
| **Download URL 404** | Sidecar returns error → UI shows error with retry |
| **Apply success** | Old binary backed up → new binary in place → app relaunches |
| **Apply failure (binary locked)** | Windows file lock → error, old binary untouched |
| **Sidecar not found** | `UpdaterService` returns graceful error, app still works |
| **Manifest server unreachable** | 30s timeout → error, no crash |
| **Signature verification fail** | Tampered manifest → sidecar rejects, error returned |
| **Help menu "Check for Updates"** | Triggers manual check, shows result in UI |

### Sidecar Unit Tests

The sidecar can be tested independently — no Wails required:

```bash
go test ./cmd/updater/... -v
```

Test `check`, `download`, and version comparison with `net/http/httptest` mock servers.

### Integration Test Script

```bash
# Build both binaries
go build -o bin/control-zebra .
go build -o bin/cz-updater ./cmd/updater

# Test check command directly
./bin/cz-updater check --url http://localhost:8080/ --current 0.2.0 --os darwin --arch arm64

# Test download command directly
./bin/cz-updater download --url http://localhost:8080/control-zebra-0.1.0-darwin-arm64.tar.gz \
  --checksum sha256:abc123...
```

### Per-Platform Verification

| Check | macOS | Windows | Linux |
|-------|-------|---------|-------|
| Sidecar found next to main binary | ✅ `.app/Contents/MacOS/cz-updater` | ✅ same dir as `.exe` | ✅ same dir |
| Update check works | ✅ | ✅ | ✅ |
| Download + checksum | ✅ | ✅ | ✅ |
| Binary swap works | ✅ | ✅ (file locking safe) | ✅ |
| App relaunches | ✅ (needs code signing) | ✅ (may trigger SmartScreen) | ✅ |
| Progress bar works | ✅ | ✅ | ✅ |
| Sidecar cross-compiles | ✅ (CGO_ENABLED=0) | ✅ | ✅ |

---

## Open Questions / Decisions Needed

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **Where do we host updates?** | GitHub Releases + Pages, Cloudflare R2, S3, self-hosted | ✅ **GitHub Releases + Pages** — binaries as Release assets, manifest on Pages. |
| 2 | **What is the update URL?** | `https://releases.controlzebra.com/desktop/stable/`, GitHub Pages URL | ✅ **`https://releases.controlzebra.com/desktop/stable/`** — CNAME to GitHub Pages. |
| 3 | **Signature verification in v1?** | Yes (more secure, more setup), No (checksums only) | ✅ **Yes** — Ed25519 manifest signatures implemented. Industrial users, supply chain security matters. |
| 4 | **First auto-update version?** | Current is `0.0.1` / `0.2.0` (inconsistent) | ✅ **`0.1.0`** — version injection fixed in Phase 1. |
| 5 | **Beta channel?** | Yes (two manifests), No (stable only) | Stable only for v1. |
| 6 | **Mandatory updates?** | Always optional, sometimes mandatory | Always optional. Reserve mandatory for critical security fixes. |
| 7 | **Windows admin privileges?** | Needed if in `Program Files` | NSIS should install to `%LOCALAPPDATA%\Programs\ControlZebra` for a user-writable, non-elevated path. |

---

## Implementation Priority

```
Phase 1 (Version Injection)    ██████████  ~1 hour    — ✅ COMPLETE
Phase 2 (Sidecar Binary)       ██████████  ~4 hours   — ✅ COMPLETE
Phase 7 (Sidecar Packaging)    ██████████  ~1 hour    — ✅ COMPLETE
Phase 3 (UpdaterService)       ██████████  ~2 hours   — ✅ COMPLETE
Phase 5 (Menu Integration)     ██████████  ~30 min    — ✅ COMPLETE
Phase 4 (Frontend UI)          ██████████  ~4 hours   — ✅ COMPLETE
Phase 6 (Manifest & Hosting)   ██████████  ~2 hours   — ✅ COMPLETE
Phase 8 (Security)             ██████████  ~1 hour    — ✅ COMPLETE
Phase 9 (Delta Updates)        ░░░░░░░░░░  Future     — Not needed for v1
```

**Suggested order:** Phase 1 → Phase 2 → Phase 7 → Phase 3 → Phase 5 → Phase 4 → Phase 6 → Phase 8

Phase 1 is the quickest win and fixes a real bug. Phase 2 (sidecar) has zero external dependencies — it's pure Go, no Wails, no CGO, fully testable in isolation. Phase 7 ensures the sidecar ships alongside the main app. Phase 3 wires the sidecar to the main app as a standard Wails service. Phase 5 is a 30-minute addition. Phase 4 builds the frontend UI using auto-generated bindings. Phases 6 and 8 are blocked on hosting/security decisions and can happen in parallel.

**Total estimated effort:** ~16 hours across all phases (excluding future Phase 9).
