# Windows NSIS Silent Auto-Update Plan

This plan defines a Windows-only update path for ControlZebra that downloads the latest signed NSIS installer, launches it silently with `/S`, and exits the running app immediately so the installer can replace the existing installation.

This plan also changes the Windows installation target from `Program Files` to a per-user AppData location so silent self-updates do not require administrator elevation.

It is intentionally scoped to the current ControlZebra architecture:

- Wails v3 app, service-first backend registration in [main.go](../../main.go)
- Existing signed release metadata in [WINDOWS_BETA_RELEASE_RUNBOOK.md](./WINDOWS_BETA_RELEASE_RUNBOOK.md)
- Existing Windows NSIS packaging in [build/windows/Taskfile.yml](../../build/windows/Taskfile.yml)
- Existing updater manifest/signature conventions in [cmd/updater/manifest.go](../../cmd/updater/manifest.go)

## Goal

Provide a professional Windows update flow similar to Brave/Electron:

1. Check a remote manifest for a newer version.
2. Download the matching signed NSIS installer into `%TEMP%`.
3. Emit progress updates to the frontend during download.
4. Launch the installer with `/S`.
5. Exit the running ControlZebra process immediately so the installer can overwrite files cleanly.

## Recommendation

Within ControlZebra, implement this as a new backend service, not as ad hoc logic in `main.go`.

Why:

- The app already exposes functionality through registered services, not an `App` struct binding.
- Services already hold the Wails app reference for event emission, which is the exact pattern used by [services/progress_service.go](../../services/progress_service.go).
- This keeps the Windows updater isolated and testable.

If you need a literal `App.StartUpdate()` API for compatibility with Wails v2 examples, use a thin wrapper that delegates to the service. In this repo, the primary backend entrypoint should be `UpdateService.StartUpdate()`.

## Proposed Backend Surface

Add a new service:

- `services/update_service.go`
- Optional Windows-only helpers in `services/update_service_windows.go`

Register it in [main.go](../../main.go) like the other services.

### Methods

```go
type UpdateService struct {
    app *application.App
}

func NewUpdateService() *UpdateService
func (u *UpdateService) SetApp(app *application.App)

func (u *UpdateService) CheckForUpdate(channel string) (UpdateCheckResult, error)
func (u *UpdateService) StartUpdate(channel string) error
```

### Wails Binding Shape

Frontend usage should be service-based:

```ts
import { CheckForUpdate, StartUpdate } from '../../bindings/controlzebra/services/updateservice'
```

If you insist on an app-style wrapper, the equivalent conceptual API is:

```go
func (a *App) StartUpdate() error {
    return a.updateService.StartUpdate("beta")
}
```

That wrapper is optional in this codebase.

## Manifest Contract

Reuse the existing hosted manifest pattern already described in [WINDOWS_BETA_RELEASE_RUNBOOK.md](./WINDOWS_BETA_RELEASE_RUNBOOK.md).

Recommended URL for beta:

- `https://controlzebra.github.io/controlzebra-releases/desktop/beta/update.json`

Expected fields:

```json
{
  "version": "v0.14.0-beta",
  "releaseDate": "2026-03-23T18:00:00Z",
  "releaseNotes": "...",
  "platforms": {
    "windows-amd64": {
      "url": "https://controlzebra.github.io/controlzebra-releases/releases/download/v0.14.0-beta/control-zebra-amd64-installer.exe",
      "size": 123456789,
      "checksum": "sha256:<hex>"
    },
    "windows-arm64": {
      "url": "https://controlzebra.github.io/controlzebra-releases/releases/download/v0.14.0-beta/control-zebra-arm64-installer.exe",
      "size": 123456789,
      "checksum": "sha256:<hex>"
    }
  },
  "mandatory": false
}
```

This keeps Windows aligned with the existing release repo and avoids inventing a second manifest format.

## Security Requirements

### HTTP Client

Use an explicit `http.Client` with a timeout and a hardened transport:

```go
client := &http.Client{
    Timeout: 2 * time.Minute,
    Transport: &http.Transport{
        Proxy: http.ProxyFromEnvironment,
        ForceAttemptHTTP2: true,
        TLSHandshakeTimeout: 10 * time.Second,
        ResponseHeaderTimeout: 30 * time.Second,
        ExpectContinueTimeout: 1 * time.Second,
        IdleConnTimeout: 90 * time.Second,
    },
}
```

Also:

- Fetch the manifest with `context.WithTimeout`.
- Reject non-`200 OK` responses.
- Limit manifest size before JSON decode.
- Verify checksum after download.
- Keep manifest signature verification enabled using the existing signed-manifest approach where practical.

### Download Location

Write the installer to a dedicated temp location:

- `%TEMP%\ControlZebra\updates\control-zebra-amd64-installer.exe`
- `%TEMP%\ControlZebra\updates\control-zebra-arm64-installer.exe`

Download to a temporary `.part` file first, then rename after checksum validation.

## Event Contract

Use a dedicated frontend event instead of reusing `git-progress`.

Recommended event name:

- `app-update:progress`

Recommended payload:

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

Phases:

- `checking`
- `downloading`
- `verifying`
- `launching-installer`
- `done`
- `error`

In Wails v3, emit via the app reference:

```go
u.app.Event.Emit("app-update:progress", payload)
```

Note on API naming:

- Wails v2 examples typically use `runtime.EventsEmit(ctx, ...)`.
- ControlZebra is on Wails v3 and should use `app.Event.Emit(...)` like the other services.

## Download And Silent Install Flow

### Phase 1: Check

`CheckForUpdate(channel)` should:

1. Resolve the manifest URL from channel.
2. Download and parse the manifest.
3. Select `windows-amd64` or `windows-arm64` using `runtime.GOOS` and `runtime.GOARCH`.
4. Compare `main.Version` against the manifest version.
5. Return the download URL, version, checksum, size, and release notes.

### Phase 2: Download

`StartUpdate(channel)` should:

1. Re-run `CheckForUpdate(channel)` to avoid acting on stale UI state.
2. Create the temp directory under `%TEMP%`.
3. Stream the installer download to disk.
4. Emit `app-update:progress` updates every 250-500ms.
5. Verify SHA-256 against the manifest checksum.
6. Emit a `verifying` event.

### Phase 3: Launch NSIS Silently

Launch the downloaded installer with the case-sensitive NSIS silent flag:

```go
cmd := exec.Command(installerPath, "/S")
err := cmd.Start()
```

Important details:

- `/S` must be uppercase.
- Do not wait on the installer with `cmd.Run()` or `cmd.Wait()`.
- The goal is handoff, not supervision.
- The installer itself must be signed.

If you later need to force an install directory, NSIS supports `/D=<path>`, but it must be the final argument and should only be used if the installer script is built for that scenario.

### Phase 4: Exit Immediately

After `cmd.Start()` succeeds, terminate the current app process immediately:

```go
if err := cmd.Start(); err != nil {
    return fmt.Errorf("start installer: %w", err)
}

go func() {
    time.Sleep(200 * time.Millisecond)
    os.Exit(0)
}()

return nil
```

The short delay is practical in Wails so the final event and RPC response have a chance to flush. The important behavior is still immediate process termination after the installer is launched.

If you want maximum determinism, emit a final `launching-installer` event before `cmd.Start()`, then call `os.Exit(0)` directly after the `Start()` success path.

## Install Root Change

This plan now treats per-user installation as a requirement for the Windows NSIS updater flow.

Current state:

- [build/windows/nsis/project.nsi](../../build/windows/nsis/project.nsi) currently defaults to `InstallDir "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"`.

Required change:

- Move the default install root to `%LocalAppData%`.
- Use a deterministic per-user path such as `%LocalAppData%\ControlZebra` or `%LocalAppData%\ControlZebra\ControlZebra`.
- Keep application data and installer payload location separate from roaming profile data.

Recommended target:

- `%LocalAppData%\ControlZebra`

Reasoning:

- `%LocalAppData%` is the correct Windows location for per-user application binaries and caches.
- Roaming `%AppData%` should not carry a desktop app installation payload across domain logins.
- This eliminates the most common UAC prompt during updates.
- It matches the self-update behavior expected from modern consumer desktop apps.

NSIS packaging changes to include in implementation:

1. Update `InstallDir` in [build/windows/nsis/project.nsi](../../build/windows/nsis/project.nsi).
2. Verify the installer writes uninstall metadata for the per-user install scope.
3. Confirm shortcut creation and upgrade detection still work when installed per-user.
4. Validate that a silent reinstall reuses the existing `%LocalAppData%` path without extra arguments.

## UAC And Permissions

This is the hard constraint on Windows:

- If ControlZebra is installed under `C:\Program Files`, the NSIS installer will generally require elevation to replace files there.
- Launching the installer with `/S` does not suppress the Windows UAC prompt.
- Silent install only suppresses installer UI, not the operating system elevation dialog.

### What This Means

Two deployment models exist, but this plan standardizes on the first one:

1. Per-user install
    - Install under `%LocalAppData%`.
    - No admin prompt for normal updates.
    - Required for ControlZebra silent self-update.

2. Machine-wide install
    - Install under `C:\Program Files`.
    - Expect UAC on update.
    - Not the target model for this updater strategy.

### Recommendation For ControlZebra

For ControlZebra, change the Windows NSIS installer to a per-user `%LocalAppData%` install root.

If the product ever needs a separate machine-wide installer for managed enterprise installs, treat that as a separate packaging mode with different update expectations.

If ControlZebra remains in `Program Files` before that packaging change lands, document the behavior clearly:

- The app downloads the update silently.
- Windows may still ask for administrator approval before installation proceeds.
- That prompt is expected and unavoidable without a privileged helper service, scheduled task, or enterprise deployment tooling.

That extra infrastructure is out of scope for this plan.

## ControlZebra-Specific File Changes

### 1. Add Service

Add:

- `services/update_service.go`

Responsibilities:

- Manifest fetch and version comparison
- Installer download with checksum verification
- Progress event emission
- Silent installer launch and process exit handoff

### 2. Update NSIS Install Directory

Update [build/windows/nsis/project.nsi](../../build/windows/nsis/project.nsi):

- Replace the default `Program Files` install root with `%LocalAppData%`.
- Keep the path stable across upgrades.
- Verify uninstall cleanup still targets the per-user location.

### 3. Register Service

Update [main.go](../../main.go):

- Create `updateService := services.NewUpdateService()`
- Add `application.NewService(updateService)` to the registered services
- Call `updateService.SetApp(app)` after the app is created

### 4. Register Event Type

In [main.go](../../main.go), register the event payload type so bindings stay explicit:

```go
application.RegisterEvent[services.AppUpdateProgress]("app-update:progress")
```

### 5. Frontend Trigger

Use the generated bindings to call:

- `CheckForUpdate("beta")`
- `StartUpdate("beta")`

The frontend should listen for `app-update:progress` and show:

- Checking
- Downloading percent
- Verifying
- Restarting to update

The UI must assume the app will terminate once the installer handoff succeeds.

## Suggested Go Structure

```go
type UpdateCheckResult struct {
    Available    bool   `json:"available"`
    Version      string `json:"version,omitempty"`
    ReleaseNotes string `json:"releaseNotes,omitempty"`
    DownloadURL  string `json:"downloadURL,omitempty"`
    Checksum     string `json:"checksum,omitempty"`
    Size         int64  `json:"size,omitempty"`
    Mandatory    bool   `json:"mandatory,omitempty"`
}

func (u *UpdateService) StartUpdate(channel string) error {
    result, err := u.CheckForUpdate(channel)
    if err != nil {
        u.emitError("checking", err)
        return err
    }
    if !result.Available {
        return nil
    }

    installerPath, err := u.downloadInstaller(result)
    if err != nil {
        u.emitError("downloading", err)
        return err
    }

    u.emitProgress(AppUpdateProgress{
        Phase: "launching-installer",
        Percent: 100,
        Message: "Restarting to install the update...",
    })

    cmd := exec.Command(installerPath, "/S")
    if err := cmd.Start(); err != nil {
        u.emitError("launching-installer", err)
        return err
    }

    go func() {
        time.Sleep(200 * time.Millisecond)
        os.Exit(0)
    }()

    return nil
}
```

## NSIS Expectations

The updater flow assumes the generated installer already supports:

- silent mode via `/S`
- clean replacement of the existing app files
- reusing the prior install directory
- signed installer artifacts

Validate the generated NSIS project under [build/windows/nsis](../../build/windows/nsis) for:

- `RequestExecutionLevel`
- default install root
- upgrade/uninstall behavior
- whether silent installs relaunch automatically or only complete installation

For this plan, the expected outcome is:

- per-user install root under `%LocalAppData%`
- no required elevation for standard update installs
- silent reinstall over the existing per-user app location

If the installer does not relaunch the app on success, that is acceptable for v1 of this flow. The product can instruct the user to reopen ControlZebra after update completion, or the NSIS script can be enhanced later.

## Testing Plan

### Unit Tests

Add tests for:

- manifest parse failures
- version comparison behavior
- checksum mismatch handling
- temp file cleanup on failed download
- installer command construction on Windows

### Manual Test Matrix

1. `%LocalAppData%` install, non-admin user
2. existing `Program Files` install upgraded into new per-user packaging path
3. checksum mismatch
4. manifest 404
5. network timeout
6. installer launch failure
7. repeat install over existing `%LocalAppData%` install

### Expected Outcomes

- Per-user `%LocalAppData%` installs update without installer UI.
- Legacy `Program Files` installs may still show UAC until those users are migrated to the per-user installer path.
- The app exits immediately after handoff.
- No `file in use` errors occur because the running process is terminated before overwrite.

## Implementation Order

1. Change NSIS `InstallDir` from `Program Files` to `%LocalAppData%`.
2. Add `UpdateService` backend and event type.
3. Implement manifest fetch using the existing release repo contract.
4. Implement download-to-temp with checksum validation.
5. Implement silent NSIS launch with `exec.Command(installerPath, "/S")`.
6. Add immediate `os.Exit(0)` handoff.
7. Add frontend progress listener and update CTA.
8. Validate per-user install behavior and legacy `Program Files` migration behavior.
9. Document release/operator expectations in the Windows runbook.

## Final Decision Summary

- Use the existing `update.json` release manifest hosted from `controlzebra-releases`.
- Download the signed Windows NSIS installer, not a raw app binary.
- Expose the flow through a new Wails backend service in ControlZebra.
- Emit a dedicated `app-update:progress` event during download.
- Launch the installer with `/S`.
- Exit the app immediately after launch so the installer can replace files.
- Change Windows installs to `%LocalAppData%` so silent self-update works without routine UAC prompts.
- Treat any future `Program Files` installer as a separate enterprise/distribution mode, not the default self-updating channel.