# Windows LocalAppData Install And Sidecar Update Plan

This document defines a high-level plan to set ControlZebra's Windows install target to per-user `LocalAppData` before launch, and to add a sidecar-based self-update flow that works without administrator elevation.

It is intentionally high level. The goal is to align product, packaging, and updater direction before implementation details are finalized.

## Why This Change

Today the Windows installer is configured for an elevated, machine-wide install:

- [build/windows/nsis/project.nsi](../../build/windows/nsis/project.nsi) installs to `$PROGRAMFILES64\ControlZebra\ControlZebra`
- [build/windows/nsis/wails_tools.nsh](../../build/windows/nsis/wails_tools.nsh) defaults `REQUEST_EXECUTION_LEVEL` to `admin`

That choice makes self-updating harder because the app cannot update itself silently without administrator rights.

Because the app has not launched yet, there is no legacy Windows install base to preserve. That allows us to choose the correct default now instead of carrying a migration burden later.

Moving to a per-user install under `LocalAppData` changes the tradeoff:

1. No elevation required for install or update
2. Predictable per-user install path
3. Better fit for non-technical users on unmanaged PCs
4. Cleaner foundation for silent self-updates

## Recommended End State

Adopt this Windows model:

1. Install ControlZebra per-user under `%LOCALAPPDATA%\Programs\ControlZebra`
2. Run the NSIS installer at user level, not admin level
3. Keep ControlZebra as an installed app, not a portable-only app
4. Use a sidecar updater to coordinate the update flow
5. On Windows, let the sidecar download and launch a new silent installer rather than directly replacing app files in place

This keeps the user experience close to standard desktop apps while avoiding `Program Files` permission friction.

## Non-Goals

This plan does not attempt to:

1. Replace the macOS updater design
2. Introduce delta patching
3. Define the full manifest schema in detail
4. Change the portable ZIP distribution story, if one exists later

## Track 1: Move Windows Install Location

### Objective

Set Windows packaging to use per-user install in `LocalAppData` as the initial public release default.

### High-Level Changes

1. Change NSIS default install directory from `Program Files` to a per-user path
2. Change NSIS execution level from `admin` to `user`
3. Change uninstall registry writes from `HKLM` to `HKCU`
4. Keep shortcuts, uninstall metadata, and file associations scoped to the current user
5. Verify WebView2 bootstrapper behavior still works in user install mode

### Proposed Target Path

Recommended install root:

- `%LOCALAPPDATA%\Programs\ControlZebra`

This matches the common Windows pattern used by self-updating per-user apps.

### Files Likely Affected

1. [build/windows/nsis/project.nsi](../../build/windows/nsis/project.nsi)
2. [build/windows/nsis/wails_tools.nsh](../../build/windows/nsis/wails_tools.nsh)
3. [build/windows/Taskfile.yml](../../build/windows/Taskfile.yml)
4. [docs/plans/WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_IMPLEMENTATION_PLAN.md](./WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_IMPLEMENTATION_PLAN.md)
5. [docs/plans/WINDOWS_BETA_RELEASE_RUNBOOK.md](./WINDOWS_BETA_RELEASE_RUNBOOK.md)

### Launch Assumption

There is no legacy Windows installation base yet.

That means:

1. No migration flow is required
2. No dual-path upgrade logic is required
3. No `Program Files` compatibility path is required for initial release
4. The first public Windows installer should ship with `LocalAppData` as the default and only install target

## Track 2: Add Sidecar-Based Self-Update

### Objective

Allow the app to update itself without requiring users to manually download new installers.

### Recommended Windows Update Model

For installed Windows builds, the sidecar should orchestrate updates, but the payload should remain the signed NSIS installer.

Recommended flow:

1. Main app checks the hosted update manifest
2. Main app asks the sidecar to download the correct installer into `%TEMP%`
3. Sidecar verifies checksum and signature inputs
4. Main app exits cleanly
5. Sidecar launches the installer with `/S`
6. Sidecar waits for the installer to complete and checks for success
7. Installer updates the existing `LocalAppData` installation
8. Sidecar relaunches the installed app and exits

### Relaunch Ownership

For Windows silent installs, the sidecar should own post-install relaunch.

Reasoning:

1. The current NSIS script exposes app launch through the interactive finish page, which does not define behavior for silent `/S` installs
2. A single owner for handoff, completion detection, and relaunch is easier to test than splitting responsibility between the installer and the app
3. The sidecar already owns process shutdown sequencing, so it is the correct place to wait for installer completion and start the updated app
4. This also gives the sidecar one final place to report a failed install or missing target binary in logs

That means Windows update completion should be defined as:

1. Main app exits
2. Sidecar starts silent installer
3. Sidecar waits for installer exit code
4. Sidecar verifies the installed executable exists at the expected path
5. Sidecar launches the updated app

### Why Use Installer Payload Instead Of Direct EXE Swap

Directly replacing a single `.exe` works best for truly portable apps. ControlZebra is better treated as an installed app because it has:

1. Installer-managed shortcuts and uninstall metadata
2. WebView2 runtime bootstrapping expectations
3. Potential future side files, helper binaries, or packaging metadata
4. A need for reliable upgrade and rollback behavior

For that reason, the sidecar should be the update coordinator, not a brittle raw file replacer for Windows installed builds.

### Sidecar Responsibilities

1. Fetch and validate manifest data
2. Choose the correct artifact for `windows-amd64` or `windows-arm64`
3. Download the installer to a temporary directory
4. Report progress back to the frontend through a dedicated event channel
5. Wait for the main app to shut down
6. Launch the installer silently
7. Wait for installer completion and validate success
8. Relaunch the installed app
9. Exit after successful relaunch or after logging a terminal failure

### Main App Responsibilities

1. Surface update availability in the UI
2. Let the user start the update explicitly
3. Save state before shutdown
4. Exit cleanly when the sidecar is ready to install
5. Tell the user the app will close and reopen if the update succeeds
6. Handle pre-handoff failure states and recovery messaging

### Files Likely Affected

1. [cmd/updater](../../cmd/updater)
2. [main.go](../../main.go)
3. [services](../../services)
4. [frontend](../../frontend)
5. [docs/plans/AUTO_UPDATE_PLAN.md](./AUTO_UPDATE_PLAN.md)
6. [docs/plans/WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_IMPLEMENTATION_PLAN.md](./WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_IMPLEMENTATION_PLAN.md)

## Combined Delivery Plan

### Phase A: Packaging Foundation

1. Move installer default path to `LocalAppData`
2. Switch installer execution level to `user`
3. Update uninstall registry ownership and shortcut scope
4. Verify clean install, reinstall, uninstall, and downgrade behavior

### Phase B: Sidecar Update Service

1. Finalize backend update service contract
2. Finalize update progress event contract
3. Implement manifest check and download orchestration
4. Launch silent installer through the sidecar after app shutdown
5. Wait for installer completion and relaunch the app from the installed location

### Phase C: Release Operations

1. Update Windows release packaging and naming expectations
2. Keep release manifest generation aligned with the release repo
3. Document signing, verification, and rollback procedures
4. Add smoke-test steps for fresh install and in-place update scenarios within the `LocalAppData` model

## Approved Decisions

The following decisions are approved for the active Windows release plan:

1. The sidecar will relaunch the installed executable directly from the expected install path under `%LOCALAPPDATA%\Programs\ControlZebra`
2. The sidecar will wait for the Windows installer to finish and will treat a failed installer result as update failure
3. The updater flow will rely on the installer's default target path and will not pass `/D=` in the normal path
4. The first public Windows release will support only the per-user `LocalAppData` install model; machine-wide enterprise mode is deferred
5. If install succeeds but relaunch fails, the sidecar should log the failure and the product should guide the user to reopen the app manually

## Recommendation

The lowest-risk path is:

1. Keep Windows as an installed app, not a raw self-replacing EXE
2. Move the install target to `%LOCALAPPDATA%\Programs\ControlZebra`
3. Use a sidecar updater for orchestration only
4. Let the signed NSIS installer perform the actual file replacement
5. Make this the initial Windows release model so no legacy migration path is needed

That gives ControlZebra a reliable self-update path without the permission and file-locking problems that come with `Program Files` installs or in-process executable replacement.