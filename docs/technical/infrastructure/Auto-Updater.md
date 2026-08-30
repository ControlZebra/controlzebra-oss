# Auto-Updater

> `cmd/updater/` — Sidecar binary (`cz-updater`) for self-updating the application.

## Overview

ControlZebra uses a sidecar-based auto-update system. A separate binary (`cz-updater`) handles downloading, verifying, and applying updates — because the main app can't replace itself while running.

## Architecture

```
Main App (ControlZebra)
  │
  ├── Fetches channel manifest from GitHub Pages-backed update feed
  ├── Downloads installer referenced by the manifest
  ├── Launches cz-updater sidecar
  └── Exits
  
cz-updater (sidecar)
  │
  ├── Waits for main app to exit
  ├── Verifies update integrity
  ├── Replaces application files
  ├── Launches updated main app
  └── Exits
```

## Update Flow

1. **Check:** Main app periodically fetches the update channel manifest (`stable` or `beta`)
2. **Compare:** Manifest semver is compared against the installed app version
3. **Download:** The Windows NSIS installer referenced by the manifest is downloaded to a temp directory
3. **Handoff:** Main app launches `cz-updater` with update metadata, then exits
4. **Apply:** `cz-updater` waits for main app process to terminate
5. **Replace:** Sidecar swaps application files
6. **Restart:** Sidecar launches the updated application
7. **Cleanup:** Old files and temp downloads removed

## Build

```bash
task build:updater
```

The sidecar binary is placed alongside the main application.

## Platform Specifics

### Windows
- NSIS installer includes `cz-updater.exe`
- Update replaces files in `%LOCALAPPDATA%\Programs\ControlZebra\`
- Release manifests must point to the NSIS installer asset, not the raw app executable

### macOS
- `cz-updater` bundled in `.app/Contents/Resources/`
- Update replaces the `.app` bundle
- Codesigning re-applied after update

## Version Metadata

Current version defined in `build/config.yml`:
```yaml
version: "v<version>"
```

Injected at compile time via `-ldflags`:
```bash
go build -ldflags "-X main.Version=v0.0.2"
```

## Update contract

The updater reads a channel manifest containing a semantic version, supported
platforms, artifact URLs, sizes, and checksums. Windows updates target the NSIS
installer rather than the raw application executable. Signature verification
uses the public key configured at build time.

## Testing

Run the existing sidecar and service tests:

```bash
go test ./cmd/updater/... ./services/...
```

Use isolated test artifacts when exercising downloads or installation. Never
replace a live update feed as part of local testing.

**Related:** [Build and Release](../guides/Build%20and%20Release.md) | [Architecture Overview](../architecture/Architecture%20Overview.md)
