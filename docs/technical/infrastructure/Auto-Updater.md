# Auto-Updater

> `cmd/updater/` — Sidecar binary (`cz-updater`) for self-updating the application.

## Overview

ControlZebra uses a sidecar-based auto-update system. A separate binary (`cz-updater`) handles downloading, verifying, and applying updates — because the main app can't replace itself while running.

## Architecture

```
Main App (ControlZebra)
  │
  ├── Checks for updates (GitHub releases API)
  ├── Downloads update package
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

1. **Check:** Main app periodically checks GitHub releases for newer version
2. **Download:** Update package downloaded to temp directory
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
- UAC elevation may be required for Program Files installations

### macOS
- `cz-updater` bundled in `.app/Contents/Resources/`
- Update replaces the `.app` bundle
- Codesigning re-applied after update

## Version Metadata

Current version defined in `build/config.yml`:
```yaml
version: "v0.13.0-beta"
```

Injected at compile time via `-ldflags`:
```bash
go build -ldflags "-X main.Version=v0.13.0-beta"
```

## Release Channel

Currently using a single `beta` channel. Version tags follow semver with `-beta` suffix.

See also: `docs/technical/archive/AUTO_UPDATE_TESTING.md` for testing procedures.

---

**Related:** [[Build and Release]] | [[Architecture Overview]]
