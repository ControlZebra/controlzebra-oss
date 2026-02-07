# Auto-Update Feature — Testing Guide

This document explains how to test the ControlZebra auto-update feature end-to-end during development. It covers the sidecar binary, the backend `UpdaterService`, the frontend UI, and the manifest/signing pipeline.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Unit Tests](#unit-tests)
4. [Testing the Sidecar Directly (CLI)](#testing-the-sidecar-directly-cli)
5. [Testing with a Local Update Server](#testing-with-a-local-update-server)
6. [Testing the Frontend UI](#testing-the-frontend-ui)
7. [Testing the Full Flow (Download + Apply)](#testing-the-full-flow-download--apply)
8. [Testing Signature Verification](#testing-signature-verification)
9. [Environment Variable Overrides](#environment-variable-overrides)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌────────────────────────────┐          ┌───────────────────────────┐
│  ControlZebra (main app)   │          │  Update Server (local or  │
│                            │          │  GitHub Pages CDN)        │
│  UpdaterService (Go)       │          │                           │
│     ▲                      │          │  update.json (manifest)   │
│     │ JSON over            │          │  update.json.sig          │
│     │ stdin/stdout         │          │  platform binaries        │
│     ▼                      │          └───────────────────────────┘
│  cz-updater (sidecar)     │──HTTPS GET──────────▲
│                            │
│  Frontend (React)          │
│     useUpdateChecker hook  │
│     UpdateChecker component│
└────────────────────────────┘
```

The auto-update system has three layers:
1. **Sidecar binary** (`cz-updater`) — standalone Go CLI that checks, downloads, and applies updates
2. **Backend service** (`UpdaterService`) — Wails-exposed Go service that spawns the sidecar and forwards results to the frontend
3. **Frontend UI** (`UpdateChecker`) — React component with toast notifications and a modal dialog

---

## Prerequisites

### Build the sidecar

```bash
# Build just the sidecar (pure Go, no CGO)
task build:updater

# Or build everything (app + sidecar)
task build
```

The sidecar binary is output to `bin/cz-updater`. In dev mode (`task dev`), it's also copied into the `.app` bundle at `bin/control-zebra.dev.app/Contents/MacOS/cz-updater`.

### Tools needed

- **Go 1.24+** — for building and running tests
- **Python 3** — used by `scripts/create-release.sh` to generate manifests
- **`gh` CLI** — only if testing GitHub Releases upload (`--upload` flag)
- **`task`** (go-task) — task runner (`brew install go-task`)

---

## Unit Tests

### Version comparison tests

Tests for semver parsing and comparison logic:

```bash
go test ./cmd/updater/ -run TestParseVersion -v
go test ./cmd/updater/ -run TestCompareVersions -v
go test ./cmd/updater/ -run TestIsNewer -v
```

Covers: valid/invalid formats, pre-release ordering, major/minor/patch precedence, dev version handling.

### Signature verification tests

Tests for Ed25519 manifest signing and verification:

```bash
go test ./cmd/updater/ -run TestVerifyManifestSignature -v
go test ./cmd/updater/ -run TestSignManifest -v
go test ./cmd/updater/ -run TestFetchSignature -v
go test ./cmd/updater/ -run TestEndToEnd -v
```

Covers: valid signatures, tampered manifests, wrong keys, bad encodings, HTTP fetching, full sign→serve→verify round-trips.

### Run all updater tests at once

```bash
go test ./cmd/updater/... -v
```

---

## Testing the Sidecar Directly (CLI)

The sidecar is a standalone binary with four subcommands. You can test each independently without running the main app.

### Step 1: Create a test manifest

Create a directory and manifest file:

```bash
mkdir -p test-updates
```

Create `test-updates/update.json`:

```json
{
  "version": "99.0.0",
  "releaseDate": "2026-02-07T00:00:00Z",
  "releaseNotes": "## Test Release\n\n- This is a test update\n- For local development testing only",
  "platforms": {
    "darwin-arm64": {
      "url": "http://localhost:8091/control-zebra-99.0.0-darwin-arm64",
      "size": 15728640,
      "checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
    },
    "darwin-amd64": {
      "url": "http://localhost:8091/control-zebra-99.0.0-darwin-amd64",
      "size": 16777216,
      "checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
    },
    "windows-amd64": {
      "url": "http://localhost:8091/control-zebra-99.0.0-windows-amd64.exe",
      "size": 14680064,
      "checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
    },
    "linux-amd64": {
      "url": "http://localhost:8091/control-zebra-99.0.0-linux-amd64",
      "size": 13631488,
      "checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
    }
  },
  "minimumVersion": "0.0.1",
  "mandatory": false
}
```

### Step 2: Start a local HTTP server

```bash
cd test-updates && python3 -m http.server 8091
```

Keep this running in a separate terminal.

### Step 3: Test the `check` subcommand

**Update available** (current version is older than manifest):

```bash
./bin/cz-updater check \
  --url http://localhost:8091/ \
  --current 0.0.0-dev \
  --os darwin \
  --arch arm64
```

Expected output (JSON):
```json
{
  "available": true,
  "version": "99.0.0",
  "releaseNotes": "## Test Release\n\n- This is a test update...",
  "downloadURL": "http://localhost:8091/control-zebra-99.0.0-darwin-arm64",
  "size": 15728640,
  "checksum": "sha256:0000..."
}
```

**Already up to date** (current version matches or exceeds manifest):

```bash
./bin/cz-updater check \
  --url http://localhost:8091/ \
  --current 99.0.0 \
  --os darwin \
  --arch arm64
```

Expected output:
```json
{"available": false, "currentVersion": "99.0.0"}
```

### Step 4: Test the `download` subcommand

First, create a fake binary to serve and compute its checksum:

```bash
# Create a fake update binary
echo "fake-update-binary-content" > test-updates/control-zebra-99.0.0-darwin-arm64

# Compute SHA-256 checksum
shasum -a 256 test-updates/control-zebra-99.0.0-darwin-arm64
```

Update the manifest's checksum field with the real hash, then test:

```bash
./bin/cz-updater download \
  --url http://localhost:8091/control-zebra-99.0.0-darwin-arm64 \
  --checksum "sha256:<paste-actual-hash-here>"
```

Expected: progress JSON lines followed by a success result with a staged file path.

**Test checksum mismatch:**

```bash
./bin/cz-updater download \
  --url http://localhost:8091/control-zebra-99.0.0-darwin-arm64 \
  --checksum "sha256:0000000000000000000000000000000000000000000000000000000000000000"
```

Expected: error about checksum mismatch, exit code 1.

### Step 5: Test the `version` subcommand

```bash
./bin/cz-updater version
```

Expected: prints the compiled version string (e.g., `cz-updater 0.0.0-dev`).

### Step 6: Test the `apply` subcommand (⚠️ careful)

> **Warning:** The `apply` command replaces a binary on disk. Only test this with a copy, never with your actual development binary.

```bash
# Create a dummy "old" binary
cp ./bin/cz-updater /tmp/test-target-binary

# Create a dummy "new" binary
echo "new-version" > /tmp/test-staged-binary
chmod +x /tmp/test-staged-binary

# Apply (without --launch so it doesn't try to execute the dummy)
./bin/cz-updater apply \
  --staged /tmp/test-staged-binary \
  --target /tmp/test-target-binary \
  --pid 99999
```

Expected: the target binary is replaced, backup `.old` file created, log written to temp directory.

---

## Testing with a Local Update Server

This tests the full `UpdaterService` → sidecar → server flow through the running app.

### Step 1: Set the update URL environment variable

```bash
export CZ_UPDATE_URL=http://localhost:8091/
```

### Step 2: Start the local server

```bash
cd test-updates && python3 -m http.server 8091
```

### Step 3: Run the app in dev mode

```bash
task dev
```

Or if using the environment variable:

```bash
CZ_UPDATE_URL=http://localhost:8091/ task dev
```

### Step 4: Trigger an update check

- **Automatic:** The app checks for updates 8 seconds after launch
- **Manual:** Go to **Help → Check for Updates…** in the menu bar

### What to verify

| Scenario | Expected Behavior |
|----------|-------------------|
| Manifest has newer version | Toast notification appears: "Update available: v99.0.0", modal shows release notes |
| Manifest has same/older version | "You're up to date" message appears briefly |
| Server is down | Error state with retry button, app continues to work |
| Manifest returns 404 | Graceful error, no crash |
| Invalid manifest JSON | Error message displayed |

---

## Testing the Frontend UI

The update UI has several states. Here's how to trigger and verify each:

### State: Checking

Triggered automatically on app launch (8s delay) or via Help → Check for Updates. Shows a spinner with "Checking for updates…" text in the modal.

### State: Update Available

Requires a manifest with a higher version than the current app version. Shows:
- Sonner toast notification (12s auto-dismiss) with "View Details" action
- Modal with version badge, release notes, file size, "Download & Install" button

### State: Downloading

Click "Download & Install" when an update is available. Shows:
- Progress bar with bytes downloaded / total / percentage
- The modal cannot be dismissed during download

### State: Applying / Restarting

After download completes, the app shows "Installing update…" then "Restarting ControlZebra…" before quitting and relaunching.

### State: Error

Trigger by pointing to a dead server or invalid manifest. Shows:
- Error message with details
- "Retry" and "Dismiss" buttons

### State: Up to Date

Trigger by setting `--current` to a version ≥ the manifest version (or use default dev version with a manifest that has a lower version). Shows a green checkmark "You're up to date" that auto-dismisses after 4 seconds.

### Mandatory Update Testing

Set `"mandatory": true` in the manifest. The modal should:
- Show a "Required" badge
- Not be dismissible (no close button, no backdrop click)
- Only the "Download & Install" button is available

---

## Testing the Full Flow (Download + Apply)

This tests the complete update cycle including binary replacement and app relaunch.

### Step 1: Build a "new version" binary

```bash
# Build the current app as "new version"
APP_VERSION=99.0.0 task build
```

### Step 2: Create a proper release artifact

Use the release script to generate a manifest with correct checksums:

```bash
# Copy the built binary to where the script expects it
mkdir -p release-test
cp bin/control-zebra release-test/control-zebra-99.0.0-darwin-arm64

# Generate manifest with correct checksums
./scripts/create-release.sh \
  -v 99.0.0 \
  -n "Test update release" \
  -d release-test \
  --channel beta
```

This creates `release-test/99.0.0/update.json` with correct SHA-256 checksums.

### Step 3: Serve the release locally

```bash
cd release-test/99.0.0 && python3 -m http.server 8091
```

### Step 4: Run the app and trigger the update

```bash
CZ_UPDATE_URL=http://localhost:8091/ task dev
```

Then use Help → Check for Updates, click "Download & Install", and verify:
1. Download progress bar fills up
2. "Installing update…" appears
3. App quits
4. Sidecar swaps the binary
5. App relaunches with the new version

---

## Testing Signature Verification

Ed25519 manifest signatures are verified when a public key is compiled into the sidecar. In dev builds (no key), verification is skipped.

### Generate a test key pair

```bash
go run ./scripts/signing/ keygen
```

This prints a base64-encoded public key and private key. Save both.

### Sign a manifest

```bash
go run ./scripts/signing/ sign \
  --key "<base64-private-key>" \
  --file test-updates/update.json
```

This creates `test-updates/update.json.sig`.

### Verify a manifest

```bash
go run ./scripts/signing/ verify \
  --key "<base64-public-key>" \
  --file test-updates/update.json \
  --sig test-updates/update.json.sig
```

### Test with the sidecar

```bash
./bin/cz-updater check \
  --url http://localhost:8091/ \
  --current 0.0.0-dev \
  --os darwin \
  --arch arm64 \
  --public-key "<base64-public-key>"
```

Expected: succeeds if the `.sig` file is present and valid.

### Test tampered manifest rejection

1. Sign the manifest as above
2. Edit `update.json` (change any field)
3. Run the check with `--public-key`
4. Expected: sidecar rejects with signature verification error

### Build with embedded public key

For production-like testing, compile the public key into the sidecar:

```bash
SIGNING_PUBLIC_KEY="<base64-public-key>" task build:updater
```

Now the sidecar enforces signature verification without needing `--public-key` at runtime.

---

## Environment Variable Overrides

These override compile-time defaults during development:

| Variable | Purpose | Example |
|----------|---------|---------|
| `CZ_UPDATE_URL` | Override the update manifest base URL | `http://localhost:8091/` |
| `CZ_SIGNING_PUBLIC_KEY` | Override the compiled-in Ed25519 public key | `<base64-key>` |
| `CZ_SIGNING_KEY` | Private key for signing (used by release script) | `<base64-key>` |

### Using with `task dev`

```bash
CZ_UPDATE_URL=http://localhost:8091/ task dev
```

### Using with a direct binary run

```bash
CZ_UPDATE_URL=http://localhost:8091/ ./bin/control-zebra.dev.app/Contents/MacOS/control-zebra
```

---

## Troubleshooting

### "Sidecar not found" error

The `UpdaterService` looks for the sidecar binary in three locations (in order):
1. Same directory as the main executable (production path)
2. `bin/cz-updater` relative to the working directory (dev fallback)
3. `cz-updater` on the system PATH

Check the dev server logs for the resolved path:
```
[UpdaterService] sidecar path resolved: /path/to/cz-updater
```

If the sidecar wasn't built, run `task build:updater`.

### Update check returns nothing / silent failure

1. Verify the local server is running: `curl http://localhost:8091/update.json`
2. Check the manifest JSON is valid: `python3 -m json.tool test-updates/update.json`
3. Ensure the platform key matches your machine (e.g., `darwin-arm64` for Apple Silicon)
4. Run the sidecar directly to see stderr output: `./bin/cz-updater check --url ... 2>&1`

### Download fails with checksum mismatch

The SHA-256 checksum in the manifest must match the actual file being served. Recompute:

```bash
shasum -a 256 test-updates/control-zebra-99.0.0-darwin-arm64
```

Update the manifest `checksum` field to `sha256:<hash>`.

### App doesn't relaunch after apply

- On macOS, the `.app` bundle must be code-signed (even ad-hoc): `codesign --force --deep --sign - bin/control-zebra.dev.app`
- Check the sidecar log at `/tmp/cz-updater.log` for errors
- The sidecar waits up to 30 seconds for the main app PID to exit. If the app hangs, the apply will time out.

### Signature verification fails unexpectedly

1. Ensure the `.sig` file is next to the manifest on the server (`update.json.sig`)
2. Verify the key pair matches: `go run ./scripts/signing/ verify --key <pub> --file <manifest> --sig <sig>`
3. In dev builds without a compiled public key, verification is automatically skipped. Use `--public-key` flag on the sidecar to test explicitly.

### Wails event issues

The frontend listens for these Wails events:
- `updater:progress` — download progress updates from the backend
- `updater:manual-check` — emitted from Help → Check for Updates menu item

If the UI isn't responding, check the browser dev console (right-click → Inspect in the Wails webview) for JavaScript errors.

---

## Quick Reference: CLI Cheat Sheet

```bash
# Build everything
task build:updater && task build

# Run unit tests
go test ./cmd/updater/... -v

# Start local update server
cd test-updates && python3 -m http.server 8091

# Test check (update available)
./bin/cz-updater check --url http://localhost:8091/ --current 0.0.0-dev --os darwin --arch arm64

# Test check (up to date)
./bin/cz-updater check --url http://localhost:8091/ --current 99.0.0 --os darwin --arch arm64

# Test download
./bin/cz-updater download --url http://localhost:8091/some-binary --checksum sha256:<hash>

# Generate signing keys
go run ./scripts/signing/ keygen

# Sign a manifest
go run ./scripts/signing/ sign --key <private-key> --file update.json

# Run app with local update server
CZ_UPDATE_URL=http://localhost:8091/ task dev
```
