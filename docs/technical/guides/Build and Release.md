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
task build:updater       # Build the update sidecar
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

Update verification uses a public key; public verification keys are not secrets.
See [Auto-Updater](../infrastructure/Auto-Updater.md) for the updater's technical contract. Maintainer release
operations are managed outside the public source repository.

## Verify the build

```bash
go test ./services/... ./cmd/updater/...
python3 scripts/check-publication.py
cd frontend
npm run ci:guards
npm test
npm run build
```

Before distributing a package, also smoke-test installation and startup on the
target operating system. A frontend build alone does not validate installation.

**Related:** [Development Setup](../../onboarding/Development%20Setup.md) | [Architecture Overview](../architecture/Architecture%20Overview.md) | [Testing Guide](Testing%20Guide.md)
