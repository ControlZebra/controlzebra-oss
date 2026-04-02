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
- Current release process targets the per-user install path; do not silently switch the installer to machine-wide scope during release prep
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

## Release Channel

Current manifest contract:

- canonical manifest: `../controlzebra-releases/desktop/stable/update.json`
- compatibility alias: `../controlzebra-releases/desktop/beta/update.json`
- keep both manifests identical until the desktop app stops defaulting to the `beta` channel
- manifest `version` is plain semver such as `0.0.2`
- GitHub release tags remain `v0.0.2`
- Windows updater support currently targets `windows-amd64`

## Release Preparation Checklist

1. Bump `build/config.yml` to `v<version>`.
2. Run `task common:update:build-assets`.
3. Verify `build/windows/nsis/wails_tools.nsh` still preserves the intended per-user install scope.
4. Build `bin/control-zebra-amd64-installer.exe` with `DISABLE_AUTO_UPDATE=true task windows:create:nsis:installer ARCH=amd64`.
5. Compute installer size and SHA-256.
6. Update both release manifests in `controlzebra-releases`.
7. Upload the installer to the GitHub release tagged `v<version>`.
8. Publish `update.json.sig` files when manifest signing is enabled.

See also: `docs/technical/archive/AUTO_UPDATE_TESTING.md` for testing procedures.

---

**Related:** [[Build and Release]] | [[Architecture Overview]]
