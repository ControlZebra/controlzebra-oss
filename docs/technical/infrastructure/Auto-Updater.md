# Auto-Updater

> Wails v3 built-in updater, coordinated by `services/app_update_service.go`.

## Overview

ControlZebra uses Wails' built-in updater with its GitHub Releases provider.
There is no separately built or packaged updater sidecar. Production
Windows/amd64 builds check the public
`ControlZebra/controlzebra-releases` repository; development builds and other
platforms treat update requests as a no-op.

## Update flow

1. On application startup, `AppUpdateService` silently checks for an update and
   schedules another check every six hours.
2. A user can also start a check from General Settings. Manual checks open the
   Wails updater window even when the installed version is current.
3. The GitHub provider reads the latest non-prerelease release and compares its
   `v<semver>` tag with the version embedded in the running executable.
4. Wails selects the first release asset whose name contains both `windows` and
   `amd64`. Installer and checksum assets are ignored during selection.
5. The provider loads the sibling `SHA256SUMS` asset and finds the line for the
   selected payload.
6. Wails downloads the payload, verifies its SHA-256 digest, starts its update
   helper, exits the app, replaces the executable, and relaunches ControlZebra.
7. On the next launch, ControlZebra synchronizes the installed-app registry
   version with the newly embedded version.

Manual and background checks are serialized so they cannot run competing
update state machines. Background network failures are logged and do not
interrupt the user.

## Build and packaging

The updater is compiled into the main Wails application. Build and package the
application normally:

```bash
APP_VERSION=0.3.1 task windows:build ARCH=amd64 DEV=false
task windows:package ARCH=amd64
```

The NSIS installer remains the first-install artifact and installs per user. It
does not contain `cz-updater.exe`.

## GitHub Release contract

Each stable release used by the updater must be published to
`ControlZebra/controlzebra-releases` with all of the following:

- A tag named `v<semver>`, such as `v0.3.1`.
- The raw, production Windows executable named
  `control-zebra-<semver>-windows-amd64.exe`.
- A checksum asset named exactly `SHA256SUMS`.
- A `SHA256SUMS` line in standard `sha256sum` format for the raw executable:

```text
<64-character SHA-256 digest>  control-zebra-0.3.1-windows-amd64.exe
```

The NSIS installer may be uploaded as
`control-zebra-amd64-installer.exe` on the same release. Wails skips installer
assets and updates with the raw executable, so both artifacts must be signed
for production distribution.

Stage these assets with:

```bash
./scripts/create-release.sh --version 0.3.1 --notes @CHANGELOG.md
```

Add `--upload` to create the GitHub Release with the GitHub CLI. Versions with a
prerelease suffix are published as prereleases and are intentionally ignored by
the production updater.

## Version metadata

`APP_VERSION` is injected into `main.Version` at build time. Release builds must
use the same semantic version as the Git tag and payload filename. A leading
`v` is accepted and normalized by `AppUpdateService`, but the release script
expects the version without it.

## Verification

Run the updater coordinator tests and validate a staged release with disposable
files:

```bash
go test ./services/...
bash scripts/create-release.test.sh
```

Before publishing, confirm the raw executable is a production Windows/amd64
build, both Windows artifacts carry valid Authenticode signatures, the checksum
matches the raw executable, and the release is in the repository configured in
`main.go`.

**Related:** [Build and Release](../guides/Build%20and%20Release.md) | [Architecture Overview](../architecture/Architecture%20Overview.md)
