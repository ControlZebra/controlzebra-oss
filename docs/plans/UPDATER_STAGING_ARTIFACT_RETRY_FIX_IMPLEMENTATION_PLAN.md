# Updater Staging Artifact Retry And Auto-Download Support Implementation Plan

Status: Partially implemented  
Last updated: 2026-03-31

## Implementation Status

Completed in this pass:

1. [x] Workstream 1: Reintroduce per-run staging isolation
2. [x] Workstream 2: Keep finalization local to the run-owned directory
3. [x] Workstream 3: Add reusable staged-artifact state for auto-download
4. [x] Workstream 4: Managed cleanup and stale directory hygiene
5. [x] Workstream 5: Auto-download orchestration and setting contract
6. [x] Workstream 6: Regression coverage

Implemented code paths:

1. `cmd/updater/downloader.go` now creates unique managed staging directories under `ControlZebra/updates/cz-update-staging-*`
2. Downloader stale cleanup now removes only managed staging directories older than the age threshold
3. Finalization remains a local rename from `.part` to the final asset path inside the run-owned staging directory
4. `services/updater_service.go` now persists reusable staged-artifact metadata in a dedicated updater state file
5. `services/updater_service.go` now auto-starts background downloads after a successful update check when the setting is enabled
6. Manual update start now reuses a matching staged artifact or joins an in-flight matching download
7. Apply-side cleanup now clears the staged-artifact state record after successful handoff
8. `services/settings_service.go` now persists a default-on `autoDownloadUpdates` setting
9. `frontend/src/features/settings/components/GeneralSettings.tsx` now exposes the auto-download toggle in Settings
10. `services/updater_service.go` now returns `readyToInstall` when the latest manifest matches a reusable staged artifact
11. `frontend/src/context/UpdateContext.tsx` now runs the shared app update check and tracks background download progress
12. `frontend/src/widgets/layout/TopBar.tsx` and `frontend/src/features/settings/components/GeneralSettings.tsx` now surface update availability, progress, and ready-to-install state

Still remaining from this plan:

1. [ ] Run the manual validation checklist end to end against real update artifacts

## Purpose

This document defines the implementation plan for fixing retry failures in the sidecar downloader when a previously staged update artifact already exists and for extending that staging model to support app-managed auto-download.

The current downloader behavior in [cmd/updater/downloader.go](../../cmd/updater/downloader.go) stages downloads into a shared managed directory, derives a deterministic artifact filename from the release URL, and finalizes the staged file with a non-overwriting rename. On Windows, that can fail when the destination already exists.

The goal of this plan is to restore retry-safe staging semantics, make staged artifacts reusable by the app update flow, and support default-on background downloads without expanding the updater into a shared cache manager.

## Problem Summary

The regression is caused by three downloader implementation details working together:

1. `createStagingDir` now returns a fixed shared directory under `ControlZebra/updates`
2. `downloadWithProgress` derives the final staged artifact name directly from the release URL
3. Finalization uses `os.Rename(partialPath, stagedPath)`

That means the next attempt to download the same artifact can fail if any earlier attempt leaves the destination behind.

That limitation matters more now because auto-download changes the updater contract from a one-shot user-initiated download into a normal background activity. The current plan is too narrow for that broader flow because it does not define:

1. When the app should auto-download after detecting an available update
2. How the app should reuse an already verified staged artifact
3. How updater-owned staged files should be tracked between background and manual update paths

Examples:

1. A prior successful download was never cleaned up because apply did not run
2. A previous run was interrupted after finalization but before cleanup
3. Two quick retries target the same version and asset path
4. A stale staged file remains in the shared updates directory from an older session
5. A background auto-download succeeds, but a later manual apply attempt cannot safely tell whether the staged artifact is still valid to reuse

Observed impact:

1. Windows retries can fail with a finalize error instead of replacing the stale artifact
2. Shared staging accumulates stale files that are not owned by a single run anymore
3. The updates directory becomes a low-value contention point for repeated attempts
4. The app has no clear contract for default-on auto-download, staged artifact reuse, or stale background download recovery

## Decision Summary

### Primary decision

Restore per-run staging isolation for downloads and make verified staged artifacts reusable by the app update flow.

Instead of staging the final artifact directly in a fixed shared directory, each download run should create a unique managed staging directory and keep both the partial file and the finalized artifact inside that directory. The app-level updater flow should then treat the resulting staged artifact as reusable state when it still matches the latest manifest response.

### Concrete design

1. Keep the managed root under `ControlZebra/updates`
2. Create a unique per-run staging directory under that root, such as `cz-update-staging-*`
3. Download into `<staging-dir>/<asset-name>.part`
4. Verify checksum before finalization
5. Finalize with rename inside the same per-run directory
6. Return the fully qualified staged artifact path from that per-run directory
7. Persist lightweight staged-artifact metadata so the updater service can verify whether an existing staged file still matches the current manifest
8. Start background download automatically after a successful update check when auto-download is enabled and the app is in an allowed state
9. Reuse the staged artifact for a later manual apply attempt only when the manifest version, download URL, checksum, and file existence still match
10. Keep apply-side cleanup responsible for removing the entire staging directory after success or explicit cleanup

This preserves the current updater contract while removing the stale-destination failure mode.

### Explicit decisions for this plan

1. Auto-download starts immediately after the app detects a newer version, subject to the enabled setting and app-state gating
2. Auto-download is enabled by default and exposed as a user setting that can disable future background downloads
3. Background download may run any time the app is open and sufficiently idle for update work
4. Downloader-side stale staging cleanup will run before every new download
5. Stale cleanup will use an age-based threshold only
6. Per-run staging will remain under the managed `ControlZebra/updates` root with unique subdirectories
7. A later manual update attempt should reuse an existing staged artifact when it still matches the latest manifest response
8. Failed or abandoned auto-downloads should retry automatically using the same stale-cleanup safeguards
9. Explicit prevention of overlapping downloads is still out of scope for this plan

## Why This Design

### Benefits

1. Fixes the root cause rather than adding overwrite logic on top of a shared destination
2. Removes Windows overwrite semantics from the downloader finalize step
3. Makes retries and repeated downloads independent of each other
4. Keeps ownership simple because one run owns one staging directory
5. Works for both Windows installer payloads and non-Windows binary payloads
6. Aligns with existing apply-side cleanup, which already recognizes managed update staging directories
7. Gives the updater service a safe reuse contract for auto-download instead of forcing a redownload before apply
8. Keeps background and manual update flows on one staging model instead of introducing separate caches

### Why not keep a shared final artifact path

We could download into a temporary file and only move it into the shared updates directory after verification, but that still leaves a collision point at finalization time unless we also add:

1. Explicit destination replacement logic
2. Locking or single-writer coordination
3. Shared-cache cleanup rules and ownership semantics

That is unnecessary complexity for the current updater design. The updater does not require a reusable artifact cache; it requires a reliable staged file for one apply flow.

## Scope

### In scope

1. Downloader staging directory creation in [cmd/updater/downloader.go](../../cmd/updater/downloader.go)
2. Retry-safe staged artifact finalization for repeated downloads of the same asset
3. Managed staging cleanup improvements for stale downloader directories
4. Update service logic for background auto-download, staged-artifact reuse, and retry scheduling in [services/updater_service.go](../../services/updater_service.go)
5. App settings and UI contract for enabling or disabling auto-download
6. Regression tests covering retries, stale files, interrupted runs, and staged-artifact reuse
7. Age-based stale-directory cleanup before a new download begins

### Out of scope

1. Resumable downloads
2. Shared cross-run artifact caching
3. Delta update transport
4. Broad redesign of the updater manifest format or sidecar apply contract
5. Reworking the Windows installer-handoff model
6. Fine-grained scheduler heuristics beyond a simple "app open and idle enough" gate
7. Explicit overlapping-download coordination, locking, or cancellation policy
8. Cross-link edits to the broader updater planning documents

## Existing Behavior To Change

### Current downloader flow

1. `createStagingDir` returns a fixed directory under `ControlZebra/updates`
2. `downloadWithProgress` computes a deterministic `stagedPath` from the asset URL
3. The download writes to `stagedPath + ".part"`
4. On success, the downloader renames the partial file to the deterministic final path
5. The app currently downloads only inside the immediate update-start flow and does not define a reusable staged-artifact contract

### Required behavioral change

1. `createStagingDir` should create a unique subdirectory for each run
2. The deterministic asset filename should remain only inside that run-owned directory
3. Finalization should stay as an intra-directory rename, not a move onto a shared path
4. The caller should treat the returned path as opaque and run-scoped
5. The updater service should persist enough metadata to validate whether a staged artifact still matches the latest manifest response
6. Auto-download should begin after a successful update check when the setting is enabled and the app is in an allowed state
7. A later manual update attempt should reuse the staged artifact when validation succeeds and redownload only when validation fails
8. Managed stale-directory cleanup should run before the new staging directory is created

## File Touchpoints

### Primary implementation

1. [cmd/updater/downloader.go](../../cmd/updater/downloader.go)
2. [services/updater_service.go](../../services/updater_service.go)

### Existing cleanup behavior to verify

1. [cmd/updater/applier.go](../../cmd/updater/applier.go)
2. [cmd/updater/apply_windows_installer_windows.go](../../cmd/updater/apply_windows_installer_windows.go)

### Settings and frontend contract to verify

1. [services/settings_service.go](../../services/settings_service.go)
2. [frontend/src/features/settings/components/GeneralSettings.tsx](../../frontend/src/features/settings/components/GeneralSettings.tsx)

### Related planning context

1. [docs/plans/AUTO_UPDATE_PLAN.md](./AUTO_UPDATE_PLAN.md)
2. [docs/plans/WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_PLAN.md](./WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_PLAN.md)
3. [docs/plans/WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_IMPLEMENTATION_PLAN.md](./WINDOWS_LOCALAPPDATA_INSTALL_AND_SIDECAR_UPDATE_IMPLEMENTATION_PLAN.md)

## Implementation Workstreams

## Workstream 1: Reintroduce per-run staging isolation

Status: Completed

### Goal

Ensure every download run owns a unique managed staging directory.

### Required changes

1. Update `createStagingDir` to create the managed root under `ControlZebra/updates` if needed
2. Replace the fixed-directory return value with a unique child directory created by `os.MkdirTemp`
3. Use a stable prefix such as `cz-update-staging-` so cleanup logic remains explicit and auditable
4. Keep permissions and parent path behavior consistent with current updater expectations

### Design notes

1. The managed root should remain easy to inspect on disk for support purposes
2. The run-specific directory name should not depend on the release URL
3. The unique directory should be created before the HTTP request begins so ownership is clear from the start of the run
4. The managed root remains the correct location because it keeps updater-owned artifacts discoverable for support and cleanup

### Acceptance criteria

1. Two downloads of the same asset produce different staging directories
2. A stale finalized artifact from a previous run cannot block a later run
3. The returned staged path still points to a predictable asset filename within the unique directory

Implementation result:

1. `createStagingDir` now creates `ControlZebra/updates` and then allocates a unique `cz-update-staging-*` child directory with `os.MkdirTemp`
2. Repeated downloads of the same asset now stage into distinct directories and no longer collide on finalize
3. Focused downloader tests cover unique directory creation and same-asset retry success

## Workstream 2: Keep finalization local to the run-owned directory

Status: Completed

### Goal

Finalize only within the per-run staging directory and avoid shared-destination replacement logic.

### Required changes

1. Keep the asset filename resolution logic based on the final download URL
2. Continue downloading to `<asset>.part`
3. Continue checksum verification before finalization
4. Keep the finalize step as a rename from `.part` to the final asset path inside the same run-owned directory

### Design notes

1. This preserves the current happy-path behavior while removing the retry collision
2. No Windows-specific overwrite helper should be needed in the downloader if the final destination is no longer shared

### Acceptance criteria

1. The finalize path does not target a previously shared artifact path
2. Retrying the same version after a prior success does not fail at finalize time

Implementation result:

1. The downloader still writes `<asset>.part` and renames it to the final asset path only within the run-owned staging directory
2. Asset filename derivation now uses the final URL path safely, with a fallback name when needed
3. Retry coverage for sequential downloads of the same URL is in place and passing

## Workstream 3: Add reusable staged-artifact state for auto-download

Status: Completed

### Goal

Let the updater service distinguish between a fresh manifest hit that can reuse an existing staged artifact and one that requires a new download.

### Required changes

1. Add lightweight staged-artifact metadata owned by the updater flow, including at minimum the channel, version, download URL, checksum, staged path, and download timestamp
2. Store that metadata in an updater-owned location so it can survive beyond the immediate download call
3. Validate both metadata and file existence before reusing a staged artifact
4. Treat the staged path as reusable only when the latest manifest response matches the stored version, download URL, and checksum
5. Clear the staged-artifact record after a successful apply or when cleanup removes the underlying staging directory

### Design notes

1. The metadata should stay small and auditable; this is not a general download history feature
2. Reuse is a manifest-match decision, not a filename-match shortcut
3. If validation fails, the updater service should discard the stale record and start a new download

### Acceptance criteria

1. A later manual update attempt can reuse a verified staged artifact without redownloading when the manifest still matches
2. A changed checksum, URL, or missing staged file forces a new download
3. Successful apply clears the reusable staged-artifact record

Implementation result:

1. The updater service now stores channel, version, URL, checksum, staged path, and download timestamp in a dedicated updater state file
2. Reuse validation now requires a manifest match plus staged file existence
3. Apply-side handoff now receives the updater state-file path and clears the record after successful cleanup

## Workstream 4: Managed cleanup and stale directory hygiene

Status: Completed

### Goal

Prevent the managed updates root from accumulating stale run directories indefinitely.

### Required changes

1. Verify apply-side cleanup continues removing the run-owned staging directory after successful apply
2. Add downloader-side best-effort cleanup of stale managed staging directories before every new run
3. Restrict cleanup to directories that match the managed naming convention under `ControlZebra/updates`
4. Remove stale `.part` files only within managed run directories that are already considered abandoned
5. Use an age-based threshold only to decide whether a managed staging directory is stale

### Design notes

1. Cleanup should be opportunistic and non-fatal
2. The downloader must never delete arbitrary sibling directories under the temp root
3. Time-based cleanup is sufficient; this does not need a lock manager
4. Cleanup should run before the new staging directory is created so old state is reduced before a retry starts
5. Cleanup should not attempt to reason about concurrent active downloads because overlapping-download coordination is intentionally out of scope

### Acceptance criteria

1. Managed staging directories do not grow unbounded across repeated update attempts
2. Cleanup failures are logged or ignored safely and do not fail a valid download
3. A stale directory newer than the configured age threshold is preserved

Implementation result:

1. Downloader-side cleanup now runs before staging directory creation and removes only managed `cz-update-staging-*` directories older than 72 hours
2. Apply-side cleanup still removes the run-owned staging directory after successful handoff
3. Cleanup remains best-effort and does not fail valid downloads

## Workstream 5: Auto-download orchestration and setting contract

Status: Completed for backend and settings contract

### Goal

Define how the app starts, retries, and disables background downloads without changing the sidecar into a scheduler.

### Required changes

1. Extend the updater service to separate update check, background download, and apply initiation concerns
2. Add an app setting for auto-download that defaults to enabled and is exposed to the user in Settings
3. Start background download immediately after a successful update check when the setting is enabled and the app is in an allowed state
4. Reuse a matching staged artifact when the user later starts the update manually
5. Retry failed or abandoned auto-downloads on the next eligible update check, using the same stale-directory cleanup protections

### Design notes

1. The service should own the policy decision; the sidecar should remain a focused check/download/apply tool
2. "Idle enough" should stay simple in the first pass and avoid a complex scheduler
3. The UI should make it clear that downloads can happen automatically and that the setting can disable future background downloads

### Acceptance criteria

1. Auto-download can be disabled from app settings
2. When enabled, a newly detected update can download in the background without user action
3. A later manual update action reuses the staged artifact when valid instead of downloading again
4. A failed background download is retried on a later eligible check rather than requiring an immediate manual restart of the flow

Implementation result:

1. `autoDownloadUpdates` now defaults to enabled and is exposed in General Settings
2. `CheckForUpdate` now starts background download immediately after a successful update check when the setting is enabled
3. `StartUpdate` now reuses a matching staged artifact or joins an in-flight matching download instead of redownloading
4. The service re-attempts download work on later eligible checks because failed downloads do not persist a reusable staged-artifact record

Implementation result:

1. The first update entry surface now lives in Settings and the top bar
2. The frontend can distinguish between “update available” and “ready to install” from the shared updater state
3. Startup update checks now feed the same frontend state used by manual update actions

## Workstream 6: Regression coverage

Status: Completed

### Goal

Add direct tests for the stale-artifact and retry scenarios that caused this regression.

### Required tests

1. `createStagingDir` returns a unique run directory under the managed updates root
2. Two sequential downloads of the same URL succeed and return distinct staged paths
3. A stale finalized artifact from a previous run does not block a new download of the same asset
4. A stale partial file from a previous run does not block a new download
5. Checksum mismatch cleans up the partial file and does not leave a finalized artifact
6. Best-effort stale-directory cleanup does not delete the current run directory
7. Pre-download stale cleanup removes managed staging directories older than the threshold
8. Pre-download stale cleanup preserves managed staging directories newer than the threshold
9. A staged-artifact metadata record is reused only when the latest manifest response still matches
10. A manual apply attempt after background download reuses the staged artifact instead of redownloading
11. Disabling auto-download suppresses background download while preserving manual update capability
12. A failed background download is retried on a later eligible check

### Suggested approach

1. Use `httptest.Server` to serve a deterministic artifact payload
2. Use temp roots in tests so managed updater directories are fully isolated
3. Assert both file existence and returned staged paths
4. Favor table-driven coverage for repeated retry scenarios
5. Set directory modification times explicitly in tests to exercise the age threshold behavior

Implemented coverage in this pass:

1. `createStagingDir` unique managed-directory behavior
2. Same-URL sequential download retries producing distinct staged paths
3. Checksum mismatch cleanup for partial files
4. Age-based stale managed-directory cleanup, including preserving newer directories
5. Staged-artifact mismatch invalidation in updater state
6. Auto-download enabled and disabled service behavior
7. Failed background download retry on a later eligible check
8. Reusable staged-artifact readiness surfaced through `CheckForUpdate`

## Proposed Order Of Implementation

1. Update staging directory creation to return a unique run-owned directory
2. Add pre-download age-based stale managed-directory cleanup
3. Add reusable staged-artifact metadata and updater-service validation logic
4. Add auto-download setting and updater-service orchestration rules
5. Add downloader and service tests for retries, staged-artifact reuse, and cleanup thresholds
6. Validate apply-side cleanup still recognizes the new directory naming convention
7. Run updater package tests and Windows-target build validation

## Validation Plan

Validation status:

1. [x] Focused `go test ./cmd/updater` coverage for the downloader retry and cleanup changes
2. [x] Focused `go test ./services` coverage for updater-state reuse and auto-download settings behavior
3. [x] `GOOS=windows GOARCH=amd64 go build ./cmd/updater`
4. [ ] Manual validation checklist against real update artifacts

### Automated validation

1. Run `go test ./cmd/updater -v`
2. Run focused updater-service tests that cover auto-download setting behavior and staged-artifact reuse
3. Add focused downloader tests that cover retry and stale-file cases
4. Run `GOOS=windows GOARCH=amd64 go build ./cmd/updater`

### Manual validation

1. Download the same update twice in a row without applying it and confirm both succeed
2. Leave a staged artifact behind intentionally and retry the same update
3. Interrupt a download, then retry the same artifact
4. On Windows, verify the failure mode no longer surfaces as a finalize rename error when the same asset is retried
5. Seed an old managed staging directory, start a new download, and verify the old directory is removed before the new run proceeds
6. Enable auto-download, detect a newer version, and confirm the update package downloads in the background without manual start
7. After background download completes, start the update manually and confirm the existing staged artifact is reused
8. Disable auto-download and confirm update checks no longer start background downloads
9. Force a failed background download, run a later eligible check, and confirm the download is retried with stale cleanup

## Risks And Mitigations

### Risk: cleanup deletes the wrong directory

Mitigation:

1. Scope cleanup to `ControlZebra/updates`
2. Require the managed `cz-update-staging-` prefix
3. Keep cleanup best-effort and non-fatal

### Risk: apply logic assumes a fixed shared updates directory

Mitigation:

1. Verify all apply paths derive cleanup from the returned staged file path rather than from a hardcoded location
2. Confirm `isManagedUpdateStagingDir` accepts the new run-owned directory layout

### Risk: background downloads create opaque state the app cannot explain to users

Mitigation:

1. Persist lightweight staged-artifact metadata that the updater service can inspect and clear deterministically
2. Expose an explicit auto-download setting and plain-English status messaging in the UI
3. Reuse staged artifacts only after manifest validation, never by filename alone

### Risk: too much reliance on temp-root cleanup by the OS

Mitigation:

1. Keep explicit managed-root cleanup in the app flow
2. Add opportunistic stale-directory removal in the downloader

### Risk: age-based cleanup removes a directory that still matters to an operator or test flow

Mitigation:

1. Use a conservative default age threshold
2. Scope cleanup to the managed `cz-update-staging-` directories only
3. Run cleanup before a new download only, not continuously in the background

## Resolved Assumptions

1. Downloader-side stale-directory cleanup runs before every new download
2. Stale cleanup uses an age-based threshold only
3. Managed per-run staging stays under `ControlZebra/updates`
4. Auto-download is enabled by default but user-configurable
5. The updater service owns background download policy and staged-artifact reuse decisions
6. Matching version, URL, checksum, and file existence are all required before staged-artifact reuse
7. This plan still does not add explicit overlapping-download coordination

## Recommendation

Implement the minimal safe fix first:

1. Reintroduce per-run staging directories under the managed updates root
2. Keep finalization local to that run-owned directory
3. Add reusable staged-artifact metadata owned by the updater service
4. Add default-on auto-download with a user setting to disable it
5. Add age-based stale-directory cleanup and regression tests for repeated downloads, staged-artifact reuse, and cleanup thresholds

That delivers the correctness fix and the app-level auto-download support without turning the updater downloader into a shared artifact cache with overwrite and locking complexity.

## Next Steps

1. Run the manual validation checklist against hosted or local real update artifacts, especially the background-download then manual-apply reuse path
2. Smoke-check the new top-bar and Settings update surfaces against a real staged artifact so the ready-to-install state reads clearly for operators