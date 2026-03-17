# Release Process

> How we version, build, package, and distribute ControlZebra.

## Versioning

We use **semantic versioning** with a beta suffix:

```
v<major>.<minor>.<patch>-beta
```

- **Major:** Breaking changes or major milestones (v1 → v2)
- **Minor:** New features (v0.12.0 → v0.13.0)
- **Patch:** Bug fixes (v0.13.0 → v0.13.1)

Current version is defined in `build/config.yml`:

```yaml
info:
  version: "v0.13.0-beta"
```

## Release Checklist

### 1. Prepare

```
□ All PRs for this release merged to main
□ Version bumped in build/config.yml
□ RELEASE_NOTES.md updated with changes
□ Backend tests pass: go test ./services/... -v
□ Frontend checks pass: cd frontend && npm run ci:guards && npm test
□ Manual smoke test on macOS
□ Manual smoke test on Windows (if possible)
```

### 2. Build

```bash
# Build for current OS
task build

# Package for distribution
task package

# Build updater sidecar
task build:updater
```

For cross-platform builds:

```bash
# Windows from macOS (requires Docker)
task windows:build

# Build updater for specific target
task build:updater:cross TARGET_OS=windows TARGET_ARCH=amd64
```

### 3. Package & Sign

See [[Build and Release]] for detailed build, code signing, and notarization instructions.

**macOS:**
- Build produces `.app` bundle
- Must be signed with Apple Developer certificate
- Must be notarized for distribution

**Windows:**
- Build produces `.exe` installer
- Code signing via certificate

### 4. Distribute

Releases are published to the `controlzebra-releases` repository:

```
controlzebra-releases/
  metadata/
    changelog.md          # Version history
  installation.md         # Install instructions
```

### 5. Auto-Updater

The [[Auto-Updater]] system handles in-app updates:

1. App checks release manifest at startup
2. Manifest includes version, download URL, checksum, and Ed25519 signature
3. Sidecar binary (`cz-updater`) downloads and applies the update
4. User restarts the app to complete

Release manifest must be signed with the Ed25519 private key. The public key is embedded at build time via `SIGNING_PUBLIC_KEY` build variable.

## Supported Platforms

| Platform | Architecture | Build Method |
|---|---|---|
| macOS | arm64 (Apple Silicon) | Native build |
| macOS | amd64 (Intel) | Native or cross-compile |
| Windows | amd64 | Docker cross-compile or native |

## Version History

Version history is tracked in two places:

- `RELEASE_NOTES.md` — Detailed per-version changelog in the main repo
- `controlzebra-releases/metadata/changelog.md` — Public-facing changelog

## Hotfix Process

For critical production fixes:

1. Branch from `main`: `fix/critical-description`
2. Apply minimal fix
3. Test thoroughly
4. Merge to `main`
5. Bump patch version (e.g., v0.13.0 → v0.13.1)
6. Build, sign, distribute immediately
7. Update release manifest for auto-updater

---

**Related:** [[Build and Release]] | [[Auto-Updater]] | [[Development Workflow]]
