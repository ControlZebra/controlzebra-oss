# Auto-Update Plan — ControlZebra Desktop

This document describes how to implement automatic updates for ControlZebra using the built-in **Wails v3 Updater Service**. It is written for junior engineers and covers every concept, file, and decision involved.

---

## Table of Contents

1. [How Auto-Updates Work (Concepts)](#how-auto-updates-work-concepts)
2. [What We Have Today](#what-we-have-today)
3. [What We Need Before Starting](#what-we-need-before-starting)
4. [Implementation Steps](#implementation-steps)
   - Phase 1: Backend — Register the Updater Service
   - Phase 2: Frontend — Update Checker UI
   - Phase 3: Menu Integration
   - Phase 4: Update Manifest & Hosting
   - Phase 5: Build Pipeline Changes
   - Phase 6: Security (Checksums & Signatures)
   - Phase 7: Delta Updates (Optional, Future)
5. [File Changes Summary](#file-changes-summary)
6. [Testing Strategy](#testing-strategy)
7. [Open Questions / Decisions Needed](#open-questions--decisions-needed)

---

## How Auto-Updates Work (Concepts)

If you've never built an auto-updater before, here's the mental model:

```
┌──────────────────┐         HTTPS GET           ┌──────────────────────┐
│  ControlZebra    │ ──────────────────────────▶  │  Update Server       │
│  (user's machine)│                              │  (static file host)  │
│                  │  ◀─── update.json ─────────  │                      │
│  current: 0.2.0  │                              │  latest:  0.3.0      │
│                  │  ◀─── binary download ─────  │  binary artifacts     │
└──────────────────┘                              └──────────────────────┘
```

1. **The app knows its own version** — a string like `"0.2.0"` compiled into the binary.
2. **A manifest file (`update.json`) lives on a server** — it declares the latest version, download URLs, checksums, and optional release notes.
3. **The app periodically fetches `update.json`** and compares versions. If the server version is newer, it tells the user.
4. **The user clicks "Download & Install"** — the app downloads the new binary, verifies its checksum, replaces itself, and restarts.

Wails v3 wraps all of this into a single **Updater Service** (`application.CreateUpdaterService`). You register it like any other service and the framework gives you:

- Backend methods: `CheckForUpdate`, `DownloadUpdate`, `ApplyUpdate`, `DownloadAndApply`
- Frontend bindings auto-generated just like `GitService`, `SettingsService`, etc.
- Progress events (`updater:progress`) for download progress bars
- Automatic checksum verification and optional signature verification

### Key Terms

| Term | Meaning |
|------|---------|
| **Manifest** | The `update.json` file hosted on your server. It lists the latest version, platform-specific download URLs, checksums, and release notes. |
| **Channel** | A release track like `stable`, `beta`, or `canary`. Each channel has its own manifest. |
| **Delta update / Patch** | Instead of downloading the full binary (~15-30 MB), download only the diff (~50-500 KB) between the old and new version. Uses the `bsdiff` algorithm. |
| **Checksum** | A SHA-256 hash of the binary. The app re-hashes the download and compares. If they don't match, the download is rejected (protects against corruption or tampering). |
| **Signature** | An Ed25519 cryptographic signature of the manifest. Proves the manifest was created by us, not a man-in-the-middle attacker. |

---

## What We Have Today

Before implementing, you need to know the current state of the codebase:

### Version String

There are currently **two version numbers that are out of sync** — this must be fixed first:

| Location | Current Value | Purpose |
|----------|---------------|---------|
| `build/config.yml` → `info.version` | `0.0.1` | Used by Wails build system for app metadata (Windows `.exe` properties, macOS `Info.plist`) |
| `main.go` → About dialog HTML | `0.2.0` | Displayed to users in the Help → About window |

**Action needed:** We need a **single source of truth** for the version. The updater compares the version it was initialized with against the manifest. If these don't match, updates will either never trigger or trigger incorrectly.

### Build Pipeline

- **Taskfile.yml** at the root delegates to platform-specific Taskfiles in `build/darwin/`, `build/windows/`, `build/linux/`.
- macOS: builds a native binary, wraps it in a `.app` bundle, ad-hoc code signs.
- Windows: builds an `.exe`, generates `.syso` resources, supports NSIS and MSIX packaging.
- The build already uses `-ldflags` for production builds (e.g., `-ldflags="-w -s"` on macOS). We can inject the version string here.

### Service Registration

In `main.go`, services are registered in the `application.Options.Services` slice:

```go
Services: []application.Service{
    application.NewService(services.NewGitService()),
    application.NewService(services.NewLFSService()),
    // ... other services
},
```

The updater service will be added to this same list.

### Menu System

The Help menu in `main.go` already has "Documentation" and "Report Issue" items. We'll add a "Check for Updates…" item here.

### Frontend

- React + Vite + Tailwind + MUI icons
- Uses `@wailsio/runtime` for Wails events (`Events.On`, `Events.Emit`)
- Bindings are auto-generated in `frontend/bindings/` — never edited manually
- The Sonner toast library (`sonner`) is already installed for notifications

---

## What We Need Before Starting

These are **decisions and infrastructure** that must be in place before writing any code. Bring these to the team lead:

### 1. Update Server URL

We need a URL where `update.json` and binary artifacts will be hosted. Options:

| Option | Pros | Cons |
|--------|------|------|
| **GitHub Releases** | Free, already using GitHub, release notes built-in | Need a script to generate `update.json` from release assets |
| **Cloudflare R2** | Cheap, fast CDN, S3-compatible API | Need to set up bucket + upload automation |
| **Amazon S3 + CloudFront** | Industry standard, scalable | More complex setup, costs money |
| **Self-hosted (controlzebra.com/updates/)** | Full control, simple | Need to manage uptime |

**Recommendation:** Start with **GitHub Releases** since we already use GitHub. The CI/CD pipeline creates a release, attaches binaries, and a script generates the `update.json` manifest and uploads it to a known URL (e.g., `https://releases.controlzebra.com/desktop/stable/update.json` or a raw GitHub URL).

### 2. Version Strategy

We need to decide:
- **Semantic versioning format:** `MAJOR.MINOR.PATCH` (e.g., `0.3.0`) — the updater does version comparison.
- **Where the version lives:** Recommend `build/config.yml` as the source of truth, injected into the Go binary via `-ldflags` at build time.

### 3. Code Signing

Auto-updates on macOS **require proper code signing** (not just ad-hoc). Without it:
- macOS Gatekeeper will block the updated app from running.
- The app won't restart after applying an update.

On Windows, unsigned binaries trigger SmartScreen warnings.

**Required:**
- An Apple Developer ID certificate (for macOS distribution)
- A Windows code signing certificate (EV or standard)
- These are configured in `build/darwin/Taskfile.yml` (`SIGN_IDENTITY`) and `build/windows/Taskfile.yml` (`SIGN_CERTIFICATE`)

### 4. Ed25519 Key Pair (for Signature Verification)

If we want to prevent man-in-the-middle attacks on the update manifest:

```bash
# Generate once, store private key SECURELY (CI secrets, not in repo)
openssl genpkey -algorithm Ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
```

The **public key** gets embedded in the app binary. The **private key** is used in CI to sign `update.json` before upload. Never commit the private key.

### 5. Minimum Wails Version

The updater API (`application.CreateUpdaterService`) is available in Wails v3. Our current dependency is:

```
github.com/wailsapp/wails/v3 v3.0.0-alpha.54
```

**Verify** that `CreateUpdaterService` exists in this alpha version. If not, we may need to update `go.mod` to a newer alpha. Check the Wails v3 changelog or try importing it — the compiler will tell you immediately.

---

## Implementation Steps

### Phase 1: Backend — Register the Updater Service

**Goal:** Add the Wails updater service to `main.go` so it starts checking for updates.

**File to edit:** `main.go`

#### Step 1.1: Add a Version Variable

Add a build-time version variable at the top of `main.go`:

```go
// Version is set at build time via -ldflags
var Version = "0.0.0-dev"
```

This will be overridden during CI builds with:
```bash
go build -ldflags="-X main.Version=0.3.0" ...
```

#### Step 1.2: Create the Updater Service

In the `main()` function, before creating the `application.New(...)`, create the updater:

```go
import (
    "time"
    // ... existing imports
)

func main() {
    // ... existing service creation ...

    // Create the updater service
    updater, err := application.CreateUpdaterService(
        Version,
        application.WithUpdateURL("https://releases.controlzebra.com/desktop/stable/"),
        application.WithCheckInterval(6 * time.Hour),  // Check every 6 hours in background
        application.WithChannel("stable"),
    )
    if err != nil {
        log.Printf("Warning: could not initialize updater: %v", err)
        // Don't fatal — app should still work without auto-update
    }

    app := application.New(application.Options{
        // ... existing options ...
        Services: []application.Service{
            // ... existing services ...
            application.NewService(updater), // Add this
        },
    })
    // ...
}
```

**Important:** If `CreateUpdaterService` fails (e.g., invalid URL), we log a warning but **do not crash the app**. The updater is a nice-to-have, not a hard requirement.

#### Step 1.3: Handle Nil Updater

If the updater creation fails, you'll have a `nil` updater being passed to `NewService`. Guard against this:

```go
services := []application.Service{
    application.NewService(services.NewGitService()),
    application.NewService(services.NewLFSService()),
    // ... other services ...
}

if updater != nil {
    services = append(services, application.NewService(updater))
}

app := application.New(application.Options{
    Services: services,
    // ...
})
```

#### Step 1.4: Regenerate Bindings

After modifying `main.go`, run:

```bash
task common:generate:bindings
```

This will create new binding files in `frontend/bindings/` for the updater service methods (`CheckForUpdate`, `DownloadAndApply`, etc.).

---

### Phase 2: Frontend — Update Checker UI

**Goal:** Show users when an update is available and let them download + install it.

**New files to create:**
- `frontend/src/components/common/UpdateChecker.tsx`
- `frontend/src/hooks/useUpdateChecker.ts`

#### Step 2.1: Create the Update Hook

Create `frontend/src/hooks/useUpdateChecker.ts`:

This hook encapsulates all update logic so any component can use it.

```typescript
// Hook responsibilities:
// 1. Check for updates on mount (after 5-second delay to not slow startup)
// 2. Expose: updateInfo, isChecking, isDownloading, progress, error
// 3. Expose: checkForUpdates(), downloadAndInstall(), dismiss()
// 4. Listen to 'updater:progress' events from Wails
```

Key things to import:
- The auto-generated updater bindings from `frontend/bindings/` (exact path determined after Phase 1.4)
- `Events` from `@wailsio/runtime` for progress events

#### Step 2.2: Create the Update UI Component

Create `frontend/src/components/common/UpdateChecker.tsx`:

This should match ControlZebra's existing UI patterns:
- Use Tailwind classes consistent with the dark theme (`bg-gray-800/50`, `text-gray-400`, etc.)
- Use Lucide icons (already installed: `lucide-react`)
- Use Sonner toasts for non-intrusive notifications

**Two UI approaches (pick one):**

| Approach | When to Use |
|----------|-------------|
| **Toast notification** | Non-blocking. A toast appears: "Update v0.3.0 available" with an "Update" button. Best for non-mandatory updates. |
| **Modal dialog** | Blocking. A centered modal with release notes, download size, and "Download & Install" / "Skip" buttons. Best for mandatory updates or major versions. |

**Recommendation:** Use **toast for the initial notification**, then open a **modal** if the user clicks "Learn More." This is the least intrusive flow.

**States to handle in the component:**

```
[Idle] → [Checking...] → [Update Available] → [Downloading (with progress)] → [Restarting...]
                      ↘ [Up to Date]
                      ↘ [Error] → [Retry]
```

#### Step 2.3: Mount the Component

Add `<UpdateChecker />` to `frontend/src/App.tsx` — it should render at the app level since it's global:

```tsx
function App(): JSX.Element {
  return (
    <RepoProvider>
      <AppLayout />
      <UpdateChecker />  {/* Renders toasts/modals, no visible element by default */}
    </RepoProvider>
  );
}
```

---

### Phase 3: Menu Integration

**Goal:** Add a "Check for Updates…" menu item to the Help menu so users can manually trigger a check.

**File to edit:** `main.go`

In the Help menu section (around line 150 of `main.go`), add before the About item:

```go
helpMenu.Add("Check for Updates...").OnClick(func(ctx *application.Context) {
    if updater == nil {
        return
    }
    // Emit an event to the frontend to trigger the check UI
    app.Event.Emit("updater:manual-check", "")
})
helpMenu.AddSeparator()
```

On the frontend side, listen for this event in `useUpdateChecker`:

```typescript
Events.On('updater:manual-check', () => {
    checkForUpdates();  // Triggers the same flow as automatic check
});
```

This way the Go menu triggers the React UI, keeping all update display logic in one place.

---

### Phase 4: Update Manifest & Hosting

**Goal:** Create and host the `update.json` file that the updater fetches.

#### Step 4.1: Manifest Format

Create the manifest for each release. Here's what ControlZebra's `update.json` should look like:

```json
{
  "version": "0.3.0",
  "release_date": "2026-03-01T00:00:00Z",
  "release_notes": "## What's New in v0.3.0\n\n- Conflict resolution UI\n- Protected branch warnings\n- LFS file indicators\n- Bug fixes and performance improvements",
  "platforms": {
    "macos-arm64": {
      "url": "https://releases.controlzebra.com/desktop/stable/control-zebra-0.3.0-macos-arm64.tar.gz",
      "size": 15728640,
      "checksum": "sha256:<hash-here>"
    },
    "macos-amd64": {
      "url": "https://releases.controlzebra.com/desktop/stable/control-zebra-0.3.0-macos-amd64.tar.gz",
      "size": 16777216,
      "checksum": "sha256:<hash-here>"
    },
    "windows-amd64": {
      "url": "https://releases.controlzebra.com/desktop/stable/control-zebra-0.3.0-windows-amd64.zip",
      "size": 14680064,
      "checksum": "sha256:<hash-here>"
    },
    "linux-amd64": {
      "url": "https://releases.controlzebra.com/desktop/stable/control-zebra-0.3.0-linux-amd64.tar.gz",
      "size": 13631488,
      "checksum": "sha256:<hash-here>"
    }
  },
  "minimum_version": "0.1.0",
  "mandatory": false
}
```

#### Step 4.2: Platform Keys

The updater uses these keys to find the right download for the user's OS + architecture:

| User's Machine | Platform Key |
|---------------|--------------|
| macOS Apple Silicon (M1/M2/M3/M4) | `macos-arm64` |
| macOS Intel | `macos-amd64` |
| Windows 64-bit | `windows-amd64` |
| Linux 64-bit | `linux-amd64` |
| Linux ARM (e.g., Raspberry Pi) | `linux-arm64` |

Our primary target is **Windows**, so `windows-amd64` is the must-have. macOS entries are for development.

#### Step 4.3: Hosting Setup

**Option A: GitHub Releases (Recommended for v1)**

Directory on your server or CDN:
```
https://releases.controlzebra.com/desktop/
├── stable/
│   ├── update.json                                    ← manifest
│   ├── control-zebra-0.3.0-windows-amd64.zip         ← Windows binary
│   ├── control-zebra-0.3.0-macos-arm64.tar.gz        ← macOS ARM binary
│   └── control-zebra-0.3.0-macos-amd64.tar.gz        ← macOS Intel binary
└── beta/                                              ← future beta channel
    └── update.json
```

If using GitHub Releases directly, the update URL could point to a raw GitHub URL or a GitHub Pages site that serves the manifest.

#### Step 4.4: CORS Configuration

If the update server is on a different domain than `wails.localhost` (the Wails dev server), you need CORS headers:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET"],
      "AllowedHeaders": ["*"]
    }
  ]
}
```

**Note:** The Wails updater makes requests from the **Go backend**, not the browser, so CORS may not apply. Verify this during testing.

---

### Phase 5: Build Pipeline Changes

**Goal:** Inject the version string at build time and package artifacts for upload.

#### Step 5.1: Inject Version via ldflags

**Files to edit:** `build/darwin/Taskfile.yml`, `build/windows/Taskfile.yml`, `build/linux/Taskfile.yml`

In each platform's `BUILD_FLAGS` variable, add the version injection. For example, in the macOS production build:

```yaml
# Before:
BUILD_FLAGS: '-tags production -trimpath -buildvcs=false -ldflags="-w -s"'

# After:
BUILD_FLAGS: '-tags production -trimpath -buildvcs=false -ldflags="-w -s -X main.Version={{.APP_VERSION}}"'
```

And define `APP_VERSION` in the root `Taskfile.yml`:

```yaml
vars:
  APP_NAME: "control-zebra"
  APP_VERSION: '{{.APP_VERSION | default "0.0.0-dev"}}'
  BIN_DIR: "bin"
```

Now you can build with a specific version:
```bash
APP_VERSION=0.3.0 task build
```

#### Step 5.2: Sync Version in config.yml

Update `build/config.yml` to also use the version variable, or at minimum keep it in sync manually before each release. The `info.version` field affects Windows `.exe` file properties and macOS `Info.plist`.

#### Step 5.3: CI/CD Release Script (Future)

Create a script (e.g., `scripts/release.sh` or a GitHub Actions workflow) that:

1. Takes a version number as input
2. Builds for all platforms (`task darwin:build`, `task windows:build`, `task linux:build`)
3. Computes SHA-256 checksums for each binary
4. Generates `update.json` with the correct URLs, sizes, and checksums
5. Uploads binaries + manifest to the update server
6. Optionally signs the manifest with Ed25519

This is a separate task and does not need to be done in the initial implementation.

---

### Phase 6: Security (Checksums & Signatures)

#### Step 6.1: Checksum Verification (Built-in, Free)

The Wails updater **automatically** verifies SHA-256 checksums listed in `update.json`. You don't need to write any code for this. Just ensure the checksums in the manifest are correct.

To generate checksums during the build:
```bash
shasum -a 256 control-zebra-0.3.0-windows-amd64.zip
# Output: e3b0c44298fc1c14... control-zebra-0.3.0-windows-amd64.zip
```

Put this in the manifest as: `"checksum": "sha256:e3b0c44298fc1c14..."`

#### Step 6.2: Signature Verification (Optional, Recommended for Production)

For additional security, sign the manifest:

**One-time setup:**
```bash
openssl genpkey -algorithm Ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem

# Extract base64 public key for embedding in code
cat public.pem
```

**Each release:**
```bash
openssl pkeyutl -sign -inkey private.pem -in update.json -out update.json.sig
```

**In `main.go`:**
```go
updater, err := application.CreateUpdaterService(
    Version,
    application.WithUpdateURL("https://releases.controlzebra.com/desktop/stable/"),
    application.WithCheckInterval(6 * time.Hour),
    application.WithRequireSignature(true),
    application.WithPublicKey("MCowBQYDK2VwAyEA..."), // Base64 public key
)
```

**Store the private key in:** GitHub Actions secrets (e.g., `UPDATE_SIGNING_KEY`). NEVER commit it to the repo.

---

### Phase 7: Delta Updates (Optional, Future)

Delta updates reduce download size dramatically (full binary ~15 MB → patch ~100 KB). This is a **nice-to-have for later** — not needed for the initial implementation.

**How it works:**
1. You keep binaries from previous versions.
2. For each new release, generate patches: `bsdiff old-binary new-binary patch.bsdiff`
3. Add patch info to `update.json` under the `patches` array for each platform.
4. The updater tries the patch first. If it fails, it falls back to the full download.

**Prerequisites:**
- `bsdiff` tool installed in CI (`brew install bsdiff` on macOS, `apt-get install bsdiff` on Ubuntu)
- Storage for old binaries (keep the last 3-5 versions)

---

## File Changes Summary

| File | Change | Phase |
|------|--------|-------|
| `main.go` | Add `Version` variable, create updater service, add to services list, add menu item | 1, 3 |
| `build/config.yml` | Keep `info.version` in sync with release version | 5 |
| `build/darwin/Taskfile.yml` | Add `-X main.Version={{.APP_VERSION}}` to `BUILD_FLAGS` | 5 |
| `build/windows/Taskfile.yml` | Add `-X main.Version={{.APP_VERSION}}` to `BUILD_FLAGS` | 5 |
| `build/linux/Taskfile.yml` | Add `-X main.Version={{.APP_VERSION}}` to `BUILD_FLAGS` | 5 |
| `Taskfile.yml` (root) | Add `APP_VERSION` variable | 5 |
| `frontend/src/hooks/useUpdateChecker.ts` | **New file** — update logic hook | 2 |
| `frontend/src/components/common/UpdateChecker.tsx` | **New file** — update UI component | 2 |
| `frontend/src/App.tsx` | Mount `<UpdateChecker />` | 2 |
| `frontend/bindings/` | **Auto-generated** — updater bindings appear after `task common:generate:bindings` | 1 |

---

## Testing Strategy

### Local Testing

1. **Without a real server:** Set the update URL to a local server (`http://localhost:8080/`) and serve a test `update.json`:
   ```bash
   # Create a test update.json with a version higher than current
   # Serve it locally
   cd test-updates/ && python3 -m http.server 8080
   ```

2. **Test "no update available":** Set the manifest version to the same as (or lower than) the current app version. `CheckForUpdate` should return `null`.

3. **Test "update available":** Set the manifest version higher. The UI should show the toast/modal.

4. **Test download failure:** Point the download URL to a non-existent file. The error state should appear gracefully.

5. **Test checksum mismatch:** Put a wrong checksum in the manifest. The download should be rejected.

### What to Verify Per Platform

| Check | macOS | Windows | Linux |
|-------|-------|---------|-------|
| Update detected | ✅ | ✅ | ✅ |
| Download completes | ✅ | ✅ | ✅ |
| Checksum verified | ✅ | ✅ | ✅ |
| App restarts after update | ✅ (requires code signing) | ✅ (may trigger SmartScreen) | ✅ (check file permissions) |
| Progress bar works | ✅ | ✅ | ✅ |
| "Skip" dismisses update | ✅ | ✅ | ✅ |
| Menu "Check for Updates" works | ✅ | ✅ | ✅ |

---

## Open Questions / Decisions Needed

Before implementation can begin, the following decisions must be made by the team:

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **Where do we host updates?** | GitHub Releases, Cloudflare R2, S3, self-hosted | GitHub Releases for v1, migrate to R2 later |
| 2 | **What is the update URL?** | `https://releases.controlzebra.com/desktop/stable/`, `https://raw.githubusercontent.com/...`, etc. | Needs domain/CDN decision |
| 3 | **Do we need signature verification in v1?** | Yes (more secure, more setup), No (checksums only) | Yes — our users are in industrial environments, supply chain security matters |
| 4 | **What version are we shipping first with auto-update?** | Current is `0.0.1` / `0.2.0` (inconsistent) | Fix to `0.3.0` as the first auto-update-enabled release |
| 5 | **Do we support a beta channel?** | Yes (two manifests), No (stable only) | Stable only for now, add beta later |
| 6 | **Should updates be mandatory?** | Always optional, sometimes mandatory, configurable | Always optional with a "remind me later" option; reserve mandatory for critical security fixes |
| 7 | **Do we need admin/elevated privileges for Windows updates?** | The Wails updater replaces the binary in-place — if installed in `Program Files`, yes | Test with both portable and installed modes |
| 8 | **Does `CreateUpdaterService` exist in `wails/v3 v3.0.0-alpha.54`?** | Check the API | Must verify before starting; may need `go get -u` |

---

## Implementation Priority

```
Phase 1 (Backend)     ████████░░  ~2 hours   — Blocked on: Decision #2 (URL), Decision #8 (API check)
Phase 2 (Frontend)    ████████░░  ~4 hours   — Blocked on: Phase 1 (need bindings)
Phase 3 (Menu)        ██░░░░░░░░  ~30 min    — Blocked on: Phase 1
Phase 4 (Manifest)    ██████░░░░  ~2 hours   — Blocked on: Decision #1, #2 (hosting)
Phase 5 (Build)       ████░░░░░░  ~1 hour    — Can start independently
Phase 6 (Security)    ████░░░░░░  ~1 hour    — Blocked on: Decision #3 (signatures)
Phase 7 (Delta)       ░░░░░░░░░░  Future     — Not needed for v1
```

**Suggested order:** Phase 5 → Phase 1 → Phase 3 → Phase 2 → Phase 4 → Phase 6

Start with Phase 5 (build pipeline version injection) because it has no external dependencies and fixes the version inconsistency. Then Phase 1 (backend) once the update URL is decided. Phases 2-3 can be developed in parallel with a mock local server while Phase 4 (real hosting) is being set up.
