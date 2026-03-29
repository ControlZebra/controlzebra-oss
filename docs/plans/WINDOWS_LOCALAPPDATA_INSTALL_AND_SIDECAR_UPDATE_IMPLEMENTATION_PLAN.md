# Windows LocalAppData Install And Sidecar Update Implementation Plan

Status: Proposed  
Last updated: 2026-03-29

## Purpose

This document translates the high-level direction in [WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_PLAN.md](./WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_PLAN.md) into an engineering implementation plan for ControlZebra Desktop.

The target outcome is a Windows release model that:

1. Installs per-user without administrator elevation
2. Lives under `%LOCALAPPDATA%\Programs\ControlZebra`
3. Updates through the existing `cz-updater` sidecar
4. Applies updates by launching a signed silent NSIS installer, not by swapping the main `.exe` in place

This plan assumes there is no public Windows install base that must be migrated from `Program Files`.

## Decision Summary

### Product and packaging decisions

1. Windows installed builds will use a per-user install root: `%LOCALAPPDATA%\Programs\ControlZebra`
2. NSIS execution level will be `user`, not `admin`
3. Uninstall metadata, shortcuts, and file associations will be current-user scoped
4. ControlZebra will remain an installed Windows app, not a portable-only app

### Updater decisions

1. The main app will expose update actions through a new `UpdateService`
2. The existing `cz-updater` sidecar will remain the update worker
3. The manifest format in [cmd/updater/manifest.go](../../cmd/updater/manifest.go) will remain the source of truth
4. Windows updates will download the signed NSIS installer artifact and launch it with `/S`
5. The current `cz-updater apply` binary-swap flow will remain for non-Windows targets; Windows installed builds will use a separate installer-handoff path
6. The sidecar will wait for installer completion, verify the installed executable exists, and relaunch that executable directly from the expected install path
7. The normal Windows update path will rely on the installer's default target path and will not pass `/D=`
8. The first public Windows release will not support a separate machine-wide enterprise update mode
9. If install succeeds but relaunch fails, the sidecar will log the failure and the app UX should direct the user to reopen ControlZebra manually

## Why a separate Windows installer-handoff path is required

The current sidecar already supports:

1. Manifest fetch and signature verification
2. Platform-specific artifact selection
3. Download with progress and checksum validation
4. Raw binary replacement through `cz-updater apply`

That last step is the wrong abstraction for Windows installed builds. It assumes the staged artifact is the replacement executable and that the update operation is a file move into the live app path. For Windows installed builds, the correct unit of update is the signed installer because the installer also owns:

1. App files beyond the main executable
2. Uninstaller creation and registry metadata
3. Shortcut creation and cleanup
4. WebView2 bootstrap behavior and future packaging hooks

To keep responsibilities clear:

1. `cz-updater check` stays as-is
2. `cz-updater download` stays as-is, but downloads installer payloads for Windows
3. A new Windows-specific sidecar subcommand should launch the silent installer after the main app exits
4. The existing `apply` path should not be repurposed to sometimes mean raw binary swap and sometimes mean installer execution

## Scope

### In scope

1. NSIS packaging changes for per-user install
2. New backend update service in the main app
3. Windows sidecar support for installer-based apply
4. Frontend update UI and progress wiring
5. Release manifest and packaging alignment
6. QA coverage for fresh install, reinstall, update, and uninstall

### Out of scope

1. Delta patching
2. Background mandatory auto-install without user initiation
3. Migration logic from machine-wide legacy installs
4. macOS updater redesign
5. Portable ZIP update behavior

## Existing code and file touchpoints

### Packaging

1. [build/windows/nsis/project.nsi](../../build/windows/nsis/project.nsi)
2. [build/windows/nsis/wails_tools.nsh](../../build/windows/nsis/wails_tools.nsh)
3. [build/windows/Taskfile.yml](../../build/windows/Taskfile.yml)

### Main app backend

1. [main.go](../../main.go)
2. [services/progress_service.go](../../services/progress_service.go)
3. [services/settings_service.go](../../services/settings_service.go)
4. [services/debug_logger.go](../../services/debug_logger.go)
5. New files under `services/` for update orchestration

### Sidecar updater

1. [cmd/updater/main.go](../../cmd/updater/main.go)
2. [cmd/updater/checker.go](../../cmd/updater/checker.go)
3. [cmd/updater/downloader.go](../../cmd/updater/downloader.go)
4. [cmd/updater/applier.go](../../cmd/updater/applier.go)
5. [cmd/updater/applier_windows.go](../../cmd/updater/applier_windows.go)
6. [cmd/updater/manifest.go](../../cmd/updater/manifest.go)

### Frontend

1. `frontend/bindings/controlzebra/services/updateservice` after binding generation
2. [frontend/src/context/RepoContext.tsx](../../frontend/src/context/RepoContext.tsx) or a dedicated app-level update context if that produces a cleaner seam
3. Layout shell surfaces such as top bar, settings, or a dedicated update dialog

### Release operations

1. [docs/plans/WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_PLAN.md](./WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_PLAN.md)
2. [docs/plans/WINDOWS_BETA_RELEASE_RUNBOOK.md](./WINDOWS_BETA_RELEASE_RUNBOOK.md)
3. `controlzebra-releases` manifest generation and artifact publishing flow

## Implementation workstreams

## Workstream 1: NSIS per-user install foundation

### Goal

Make the installer run entirely in current-user scope and install into `%LOCALAPPDATA%\Programs\ControlZebra`.

### Required changes

1. In [build/windows/nsis/project.nsi](../../build/windows/nsis/project.nsi), change `InstallDir` from `$PROGRAMFILES64\...` to `$LOCALAPPDATA\Programs\ControlZebra`
2. In [build/windows/nsis/wails_tools.nsh](../../build/windows/nsis/wails_tools.nsh), change the default `REQUEST_EXECUTION_LEVEL` from `admin` to `user`
3. In [build/windows/nsis/wails_tools.nsh](../../build/windows/nsis/wails_tools.nsh), change uninstall registry writes from `HKLM` to `HKCU`
4. Confirm `wails.setShellContext` continues to use `current` when execution level is `user`
5. Verify desktop and Start Menu shortcuts remain current-user only
6. Verify file association and custom protocol writes remain `SHELL_CONTEXT`-scoped and therefore current-user only

### Design notes

1. Keep install files in `%LOCALAPPDATA%\Programs\ControlZebra`
2. Keep app data where it already belongs: roaming config under `%APPDATA%\ControlZebra`, local cache/logs/tools under `%LOCALAPPDATA%\ControlZebra`
3. Do not collapse install files and data files into the same root

### Acceptance criteria

1. Fresh install does not trigger UAC on a standard Windows user account
2. Installed files land in `%LOCALAPPDATA%\Programs\ControlZebra`
3. Add/Remove Programs metadata is visible for the current user via `HKCU`
4. Uninstall removes app files without requiring elevation
5. Reinstall and upgrade over the same install path succeed without manual cleanup

## Workstream 2: Main-app update service

### Goal

Add a first-class backend service that owns update checking, state shaping for the frontend, and sidecar orchestration.

### New backend surface

Create a new service:

1. `services/update_service.go`
2. Optional `services/update_service_windows.go`
3. Optional `services/update_service_other.go` for non-Windows stubs or future expansion

Register the service in [main.go](../../main.go) with the other Wails services and give it the app reference through `SetApp`.

### Proposed methods

```go
type UpdateCheckResult struct {
    Available      bool   `json:"available"`
    Version        string `json:"version,omitempty"`
    ReleaseNotes   string `json:"releaseNotes,omitempty"`
    DownloadURL    string `json:"downloadURL,omitempty"`
    Size           int64  `json:"size,omitempty"`
    Checksum       string `json:"checksum,omitempty"`
    ReleaseDate    string `json:"releaseDate,omitempty"`
    Mandatory      bool   `json:"mandatory,omitempty"`
    CurrentVersion string `json:"currentVersion,omitempty"`
}

type StartUpdateOptions struct {
    Channel string `json:"channel"`
}

func NewUpdateService() *UpdateService
func (u *UpdateService) SetApp(app *application.App)
func (u *UpdateService) CheckForUpdate(channel string) (UpdateCheckResult, error)
func (u *UpdateService) StartUpdate(options StartUpdateOptions) error
```

### Responsibilities

1. Resolve the manifest base URL for the selected channel
2. Pass the current app version, OS, and arch into the sidecar check flow
3. Return a stable typed result to the frontend
4. Start and supervise the sidecar download and installer-handoff process
5. Emit update progress events through Wails v3 app events
6. Log failures through the existing debug logger

### Design choices

1. Keep the update logic in a service, not in `main.go`
2. Reuse the sidecar for network and checksum work instead of duplicating manifest parsing in both binaries
3. Keep channel resolution in the app so environments can be configured centrally later

## Workstream 3: Sidecar installer-handoff flow for Windows

### Goal

Extend `cz-updater` so Windows installed builds can download an installer, wait for the main process to exit, launch the installer silently, and exit.

### New command surface

Add a new subcommand instead of overloading `apply`:

```text
cz-updater apply-windows-installer \
  --installer <path> \
  --pid <pid> \
  --install-dir <path> \
  --log <path>
```

Recommended flags:

1. `--installer`: downloaded NSIS installer path
2. `--pid`: ControlZebra PID to wait on
3. `--install-dir`: final install path, passed only if we need explicit `/D=` control
4. `--log`: sidecar log path

### Sidecar behavior

1. Validate the installer path exists and is non-empty
2. Wait for the main app PID to exit
3. Launch the installer with `/S`
4. Pass `/D=<install-dir>` only if the script requires explicit override; otherwise rely on installer default path
5. Wait for the installer process to finish and capture its exit result in the sidecar log
6. Verify the installed executable exists at the expected target path
7. Relaunch the installed app from that path
8. Exit after successful relaunch or after logging a terminal failure

### Relaunch rule

For Windows silent update flow, the sidecar is the single owner of post-install relaunch.

The installer should remain responsible for file replacement and install-state mutation. The sidecar should remain responsible for:

1. Waiting for the main app to terminate
2. Starting the installer in silent mode
3. Waiting for installer completion
4. Verifying the installed executable exists where expected
5. Launching the updated app

This avoids depending on NSIS finish-page behavior that only exists in interactive installs and gives one process a testable success criterion.

### Why a new command is preferred

1. `apply` currently means raw binary replacement and backup restore
2. The installer-handoff flow has different inputs, safety checks, and failure semantics
3. Keeping distinct commands avoids platform-specific branching that becomes hard to reason about later

### Required file changes

1. Update [cmd/updater/main.go](../../cmd/updater/main.go) command list and usage text
2. Add a Windows-focused command file such as `cmd/updater/apply_windows_installer.go`
3. Reuse process liveness helpers from [cmd/updater/applier.go](../../cmd/updater/applier.go) and [cmd/updater/applier_windows.go](../../cmd/updater/applier_windows.go)
4. Keep [cmd/updater/downloader.go](../../cmd/updater/downloader.go) as the download stage, with only path naming adjustments if needed
5. Add installer-process wait, exit-code logging, target-path verification, and relaunch logic to the Windows installer handoff path

### Download staging rules

Use a stable temp location:

1. `%TEMP%\ControlZebra\updates\control-zebra-amd64-installer.exe`
2. `%TEMP%\ControlZebra\updates\control-zebra-arm64-installer.exe`

Download to `*.part`, verify checksum, then rename to final staged name.

## Workstream 4: Progress events and frontend contract

### Goal

Provide a UI-safe progress model that the frontend can render without parsing sidecar stdout directly.

### Event name

Register and emit a dedicated event:

1. `app-update:progress`

### Event payload

```go
type AppUpdateProgress struct {
    OperationID string `json:"operationId"`
    Phase       string `json:"phase"`
    Percent     int    `json:"percent"`
    Downloaded  int64  `json:"downloaded"`
    Total       int64  `json:"total"`
    Message     string `json:"message"`
    IsComplete  bool   `json:"isComplete"`
    Success     bool   `json:"success"`
    Error       string `json:"error,omitempty"`
}
```

### Phase vocabulary

1. `checking`
2. `downloading`
3. `verifying`
4. `waiting-for-exit`
5. `launching-installer`
6. `installing`
7. `relaunching`
8. `done`
9. `error`

### Frontend responsibilities

1. Show update availability in a controlled app surface
2. Let the user explicitly start the update
3. Render download progress and status messaging
4. Prevent duplicate update starts while an update is already active
5. Tell the user the app will close and reopen if the update succeeds
6. Handle failure states with plain-English recovery text

### Recommended UI location

Start with one user-initiated entry point in Settings or the top bar account/help area. Do not ship multiple independent update entry points in the first pass.

## Workstream 5: Release and manifest alignment

### Goal

Ensure the release repository and packaging outputs match the new installer-based Windows update path.

### Required changes

1. Keep Windows manifest entries pointing at installer artifacts, not unpacked binaries
2. Ensure `windows-amd64` and `windows-arm64` artifact names remain stable
3. Ensure checksums in `update.json` are for the installer files
4. Keep `update.json.sig` generation aligned with the manifest bytes actually served
5. Update runbooks to document per-user install expectations and silent update verification steps

### Operational requirement

One channel must map to one install model. Do not mix `Program Files` and `LocalAppData` installers within the same supported Windows update channel.

## Workstream 6: Testing and validation

### Automated tests

#### Sidecar

1. Add tests for new `apply-windows-installer` flag parsing and validation
2. Add tests for checksum-verified installer downloads with staged file naming
3. Add tests for channel-to-platform artifact selection
4. Keep signature verification tests green

#### Main app

1. Add unit tests for `UpdateService` channel resolution and sidecar command construction
2. Add tests for progress parsing and event emission mapping
3. Add tests for error shaping returned to the frontend

### Manual Windows smoke matrix

1. Fresh install on standard user account
2. Reinstall same version over existing install
3. Upgrade from version `N` to `N+1` through in-app update
4. Failed download recovery
5. Checksum mismatch recovery
6. Sidecar launch failure recovery
7. Uninstall with and without user-data cleanup option
8. WebView2 bootstrap behavior on clean machine profile
9. Install and update on both `windows-amd64` and `windows-arm64`
10. Installer returns non-zero exit code and the app is not relaunched
11. Installer succeeds but target executable is missing or unexpected

### Release gate

Do not enable the in-app update UI for Windows broadly until the following all pass:

1. Signed installer install
2. Signed manifest verification
3. Silent installer handoff from sidecar
4. Relaunch and version verification after update
5. Uninstall and reinstall after update
6. Failure logging is sufficient to diagnose installer exit-code and post-install relaunch failures

## Execution phases

## Phase 0: Align decisions and docs

1. Confirm the final install root is `%LOCALAPPDATA%\Programs\ControlZebra`
2. Update conflicting docs so packaging, runbooks, and release repo all use the same path
3. Confirm whether `/D=` override support is required or whether installer default is sufficient

Exit criteria:

1. One approved Windows install root
2. One approved updater command shape
3. Updated plan docs reflect the same design

## Phase 1: Packaging foundation

1. Change NSIS install root and execution level
2. Move uninstall registry writes to `HKCU`
3. Build signed test installers for amd64 and arm64
4. Validate fresh install, reinstall, uninstall

Exit criteria:

1. Per-user installer works without UAC
2. Installed app runs correctly from `%LOCALAPPDATA%\Programs\ControlZebra`

## Phase 2: Backend and sidecar wiring

1. Add `UpdateService`
2. Add sidecar Windows installer-handoff command
3. Wire progress events from service to frontend
4. Keep existing non-Windows updater flows intact
5. Implement installer completion wait and relaunch verification inside the sidecar

Exit criteria:

1. App can check for updates
2. App can download installer
3. App exits and hands off to silent installer successfully
4. Updated app relaunches only after successful installer completion

## Phase 3: Frontend UX

1. Add update availability UI
2. Add progress and failure UI
3. Add user-facing copy for shutdown and restart expectations

Exit criteria:

1. Non-technical user can complete an update with one explicit action
2. Error states explain what happened and what to do next

## Phase 4: Release pipeline and beta rollout

1. Update release runbook and manifest generation assumptions
2. Publish beta installers and signed manifests
3. Run end-to-end update smoke tests against hosted artifacts
4. Enable Windows in-app update only after beta validation

Exit criteria:

1. Hosted beta artifacts update a real installed build end to end
2. Rollback instructions are documented and tested

## Risks and mitigations

### Risk: silent installer still triggers elevation

Mitigation:

1. Force NSIS execution level to `user`
2. Keep install target under `%LOCALAPPDATA%\Programs\ControlZebra`
3. Validate on standard-user Windows accounts, not only admin developer machines

### Risk: sidecar command semantics drift across platforms

Mitigation:

1. Keep raw binary swap and Windows installer handoff as distinct commands
2. Add tests for command construction and help text

### Risk: stale or conflicting install roots across docs and scripts

Mitigation:

1. Normalize every Windows plan and runbook to the same path before rollout
2. Treat path mismatches as release blockers

### Risk: updater launches installer before the app fully exits

Mitigation:

1. Keep PID wait logic in the sidecar
2. Emit `waiting-for-exit` before handoff
3. Validate with intentionally slow shutdown cases

### Risk: silent install completes but the app never comes back

Mitigation:

1. Make the sidecar, not NSIS finish-page UI, the owner of relaunch
2. Verify the target executable exists before launch attempt
3. Log installer exit code and relaunch outcome to a deterministic sidecar log path

### Risk: download tampering or manifest spoofing

Mitigation:

1. Keep Ed25519 manifest signature verification enabled in release builds
2. Verify installer SHA-256 after download and before handoff
3. Reject oversized or malformed manifests

## Deliverables

1. Per-user Windows NSIS installer
2. New `UpdateService` with generated Wails bindings
3. `cz-updater apply-windows-installer` subcommand
4. Frontend update UI and progress handling
5. Updated release/runbook documentation
6. Windows smoke-test checklist and pass record
7. Documented relaunch contract for silent Windows updates

## Recommended implementation order

1. Land NSIS per-user install changes first
2. Land sidecar Windows installer-handoff support second
3. Land main-app `UpdateService` third
4. Land frontend UX last, after the backend flow works end to end

This sequence keeps the highest-risk platform behavior changes testable before UI polish work begins.