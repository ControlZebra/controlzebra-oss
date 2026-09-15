# Build and Release

> Build and package a local ControlZebra desktop application.

## Prerequisites

Use Go 1.26 or newer, Node.js 20 or newer, npm, Git, Task, and the Wails CLI
version pinned in `go.mod`. Native builds also require the platform tooling
described by [Wails](https://v3.wails.io/getting-started/installation/).

The frontend currently depends on a sibling `ladder-visualizer` checkout through
`file:../../ladder-visualizer`. It must be available and built before installing
the frontend. This repository is not yet a standalone source distribution.
See [Development Setup](../../onboarding/Development%20Setup.md) for the required directory layout.

## Local configuration

Copy `frontend/.env.example` to `frontend/.env.local` only if you need optional
account or analytics integrations. Use your own project values. Missing account
configuration disables account sign-in; never put server secrets in `VITE_*`
variables because these are embedded in the desktop frontend.

## Build and package

Run from the repository root:

```bash
task dev                 # Start the development application
task build               # Build for the current platform
task package             # Package for the current platform
```

Build outputs belong in `bin/`; they must not be committed. Required files under
`build/` are source-controlled templates and assets, not disposable build output.

Platform tasks are defined in `build/darwin/Taskfile.yml`,
`build/windows/Taskfile.yml`, and `build/linux/Taskfile.yml`. Cross-compilation
requires the appropriate toolchain and, for configured Docker tasks, Docker.

## Bindings and metadata

After an exported Go service interface changes:

```bash
task common:generate:bindings
```

Never hand-edit generated bindings. Application identity and version come from
`build/config.yml`. Refresh generated packaging metadata when that configuration
changes with `task common:update:build-assets`, then review the resulting diff.

## Signing

Distribution may require platform signing and notarization. Use your own signing
identity and private credential storage. Keep signing material, certificates
containing private keys, and passwords out of Git. The existing signing scripts
and platform tasks describe their configuration inputs.

Windows x64 updates use the Wails GitHub provider and a `SHA256SUMS` release asset.
The application executable and NSIS installer must both have valid, timestamped
Authenticode signatures before checksums are generated.
See [Auto-Updater](../infrastructure/Auto-Updater.md) for the updater's technical contract. Maintainer release
operations are managed outside the public source repository.

## Verify the build

```bash
go build ./...
go test . ./services/...
python3 scripts/check-publication.py
cd frontend
npm run ci:guards
npm test
npm run build
```

Before distributing a package, also smoke-test installation and startup on the
target operating system. A frontend build alone does not validate installation.

**Related:** [Development Setup](../../onboarding/Development%20Setup.md) | [Architecture Overview](../architecture/Architecture%20Overview.md) | [Testing Guide](Testing%20Guide.md)

## Windows x64 release preparation

Use the native Windows build tasks for updater-enabled releases. The Docker
Windows build is outside this updater scope and does not supply its production
tag or embedded version.

Build the executable and NSIS installer with the same version. After updating
`build/config.yml`, regenerate metadata and reapply the per-user NSIS execution
level, taskkill, license, install directory, and optional user-data removal
customizations. `APP_VERSION` controls the embedded Go version; generated NSIS
metadata must also match the release.

Stage and sign `bin/control-zebra-windows-amd64.exe` and
`bin/control-zebra-amd64-installer.exe`. Build the installer from the signed app
executable, then sign the installer. Avoid rebuilding the executable after signing.

From Git Bash on Windows, with Windows PowerShell available:

```bash
scripts/create-release.sh --version 1.2.3 --notes @release-notes.md
scripts/create-release.sh --version 1.2.3 --validate-only
# Once the release tag exists on GitHub and the artifacts are ready to publish:
scripts/create-release.sh --version 1.2.3 --validate-only --upload --notes @release-notes.md
```

The output is `release/1.2.3/` with the two executables and `SHA256SUMS`.
Preparation refuses existing output to avoid overwriting reviewed artifacts.
Validation rejects missing files, unexpected names, invalid signatures, missing
timestamps, and checksum mismatches. Development self-signed bypass settings do
not apply. Release publication targets `ControlZebra/controlzebra-oss`.


The native Windows build generates `bin/windows-info-<arch>.json` from the
source metadata template using `APP_VERSION`. This keeps the executable's
Windows file version aligned with the Go version and NSIS metadata without
editing generated source templates. For example, `APP_VERSION=0.0.2` produces
numeric file version `0.0.2.0` and product version `0.0.2`.

Run `node --test scripts/generate-windows-version-info.test.mjs` to check this
metadata generation, including development versions and invalid inputs.
