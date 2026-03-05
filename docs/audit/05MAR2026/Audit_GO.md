# ControlZebra Backend Audit (Go/Wails v3)

**Date:** 05 Mar 2026  
**Auditor Role:** Senior Go + Wails v3 Architecture Review  
**Scope:** Concurrency, Go↔JS bridge safety, error handling, resource lifecycle/performance  
**Target:** `ControlZebra-Desktop` backend (`main.go`, `services/*.go`)

---

## Executive Summary

This audit identified several **high-priority concurrency and bridge-contract risks** in the Wails v3 backend. The most important findings are:

1. **File watcher lifecycle race risk** during watcher restart/stop.
2. **Progress streaming race risk** due to goroutines writing shared buffers without synchronization.
3. **Background task scheduler state model issues** (not repo-scoped, potential stale goroutines across repo switches).
4. **Weakly typed Go↔JS payloads** in selected exported APIs/events (`map[string]interface{}`), reducing interop safety.

The codebase otherwise shows solid fundamentals:
- Widespread use of `OperationResult` for frontend-friendly mutation responses.
- Good use of `context.WithTimeout` in command runner paths.
- Strong resource handling in most file/network operations (`defer Close()` is generally correct).

---

## Methodology

### Code Reviewed
- `main.go`
- `services/file_watcher_service.go`
- `services/progress_service.go`
- `services/repository_settings_service.go`
- `services/runner.go`
- `services/debug_logger.go`
- `services/settings_service.go`
- `services/local_bin_service.go`
- `services/git_service.go`
- `services/cli_resolver.go`
- `services/data_paths.go`

### Validation Run
- `go test ./services/...` ✅ pass
- `go test -race ./services -run 'TestFileWatcher|TestRepositorySettings|TestSettings|TestDebugLogger'` ✅ exit 0

> Note: targeted race run exited clean, but several race risks are still present by inspection in code paths that are timing-dependent and may not be covered by current tests.

---

## Findings (Prioritized)

## F1 — File watcher lifecycle race/panic risk (High)

**Area:** Concurrency + lifecycle management  
**Files:**
- `services/file_watcher_service.go`

### Evidence
- `WatchDirectory()` replaces/closes `f.watcher` under `f.mu`.
- `StopWatching()` closes and nils `f.watcher` under `f.mu`.
- `eventLoop()` and `handleEvent()` access `f.watcher` without consistently synchronizing around lifecycle transitions.
- `handleEvent()` may call `f.watcher.Add(event.Name)` while another goroutine closes/nils the watcher.

### Risk
- Potential data race and nil dereference under rapid start/stop/reopen cycles.
- Could manifest as intermittent panic or missed file events.

### Recommendation
- Capture watcher instance once in loop (`watcher := f.watcher`) and use that local immutable reference per loop.
- Introduce a closed/stopped channel or generation token to invalidate old loops.
- Ensure all `Add`/`Close`/event reads operate against a consistent watcher reference.

---

## F2 — Progress service buffer race during streamed git ops (High)

**Area:** Concurrency + Go↔JS progress bridge  
**Files:**
- `services/progress_service.go`

### Evidence
- `runGitWithProgress()` spawns two goroutines (stdout/stderr readers) writing to shared `strings.Builder` values.
- Function returns after `cmd.Wait()` but does not synchronize reader goroutine completion with a `WaitGroup`.
- Builders are not thread-safe for unsynchronized concurrent access.

### Risk
- Data races and partial/corrupted stderr/stdout assembly.
- Frontend may receive incorrect error messages/progress detail under load.

### Recommendation
- Replace builders with synchronized buffers or channel-based aggregation.
- Add `sync.WaitGroup` to wait for both reader goroutines before constructing/returning `CommandResult`.
- Optionally move to a single scanner goroutine per stream with explicit mutex-protected append.

---

## F3 — Repository background task model not repo-scoped (High)

**Area:** Concurrency correctness + scheduler architecture  
**Files:**
- `services/repository_settings_service.go`

### Evidence
- `taskStatuses` map key is only `BackgroundTaskType`, not `(repoPath, taskType)`.
- `activeRepo` read occurs outside lock in `UpdateBackgroundTask()`.
- `StartBackgroundTasks()` only cancels tasks for the same `repoPath`; switching repos can leave prior repo tasks running unless stop is explicitly called.

### Risk
- Cross-repo state contamination in status reporting.
- Hard-to-debug stale task goroutines.
- Potential race on `activeRepo` and inconsistent behavior during rapid repo switching.

### Recommendation
- Refactor state keying to repo-scoped map: `map[string]map[BackgroundTaskType]*BackgroundTaskStatus`.
- Guard **all** reads/writes of `activeRepo` with mutex (`RLock`/`Lock`).
- On `StartBackgroundTasks(newRepo)`, cancel any currently active repo tasks first, then start new tasks.

---

## F4 — Global lock serializes all progress operations (Medium)

**Area:** Performance/throughput  
**Files:**
- `services/progress_service.go`

### Evidence
- Public progress methods (`SyncWithProgress`, `PullWithProgress`, `PushWithProgress`) take `p.mu.Lock()` for full operation duration.
- Each operation may block for network duration (up to minutes).

### Risk
- Artificial serialization of independent operations.
- Increased latency and reduced responsiveness if multiple bridge calls overlap.

### Recommendation
- Narrow lock scope to shared mutable state only (or remove if no mutable state except `app` pointer).
- Use operation-level isolation keyed by `operationID` if dedupe/guarding is required.

---

## F5 — Weakly typed Go↔JS payload contracts (Medium)

**Area:** Wails binding safety / interop maintainability  
**Files:**
- `services/git_service.go` (`GetBisectState`)
- `services/repository_settings_service.go` (`background-task-completed` event payload)

### Evidence
- Exposed API returns/uses `map[string]interface{}` for bridge payloads.
- Event payload for task completion uses dynamic map values.

### Risk
- Type drift between Go and TypeScript without compile-time contract checks.
- Higher chance of runtime frontend failures after backend changes.

### Recommendation
- Replace dynamic maps with explicit structs:
  - `BisectStateInfo`
  - `BackgroundTaskCompletedEvent`
- Keep JSON field tags stable and regenerate bindings.

---

## F6 — Event naming inconsistency risk (Medium)

**Area:** Bridge/event-system robustness  
**Files:**
- `main.go`
- `services/file_watcher_service.go`
- frontend listeners in `frontend/src/**`

### Evidence
- `main.go` registers `file-changes` event, while watcher emits `files-changed`.
- Frontend currently listens to `files-changed`.

### Risk
- Increases maintenance risk and confusion.
- Easy source of regressions during refactors.

### Recommendation
- Standardize one canonical event name and remove stale alias/registration.
- Define event constants in one place (Go and frontend bindings/const mirror).

---

## F7 — Dialog error semantics are lossy (Low-Medium)

**Area:** Error handling contract quality  
**Files:**
- `services/file_dialog_service.go`

### Evidence
- `OpenFolderDialog()` treats dialog error and user cancel identically (`Selected: false`), discarding real errors.

### Risk
- Frontend cannot distinguish intentional cancel from actual native dialog failure.

### Recommendation
- Return explicit error detail when `PromptForSingleSelection()` fails.
- Keep cancel as a separate non-error code path.

---

## F8 — Long-lived goroutine lifecycle in `main.go` (Low)

**Area:** Resource lifecycle cleanliness  
**Files:**
- `main.go`

### Evidence
- perpetual `go func(){ for { emit time; sleep } }()` loop emits every second with no cancellation hook.

### Risk
- Low practical risk because process exit terminates goroutine, but not ideal lifecycle hygiene.

### Recommendation
- Tie to application lifecycle with a cancellable context or stop channel on app shutdown.

---

## Positive Observations

- `CommandRunner` uses timeout-bound contexts (`Run`, `RunWithContext`, `RunGitRaw`) and wraps command execution consistently.
- Sensitive-value redaction patterns exist in `DebugLogger`.
- Most file/network resources are correctly closed (`defer` usage in local-bin install/download and IO paths is strong).
- Mutation-return pattern (`OperationResult`) is consistent and frontend-friendly.

---

## Remediation Plan (Suggested Order)

### Phase 1 — Safety Hotfixes (Immediate)
1. Fix `FileWatcherService` watcher lifecycle synchronization.
2. Fix `ProgressService.runGitWithProgress` goroutine synchronization and buffer safety.
3. Lock all `activeRepo` access in `RepositorySettingsService`.

### Phase 2 — Correctness & Bridge Hardening
4. Refactor background task status storage to repo-scoped keys.
5. Replace dynamic bridge payload maps with typed structs and regenerate bindings.
6. Standardize event names and remove stale registrations.

### Phase 3 — Performance & UX Robustness
7. Reduce global `ProgressService` lock scope.
8. Improve dialog error-vs-cancel signaling.
9. Add lifecycle cancellation for non-essential perpetual goroutines.

---

## Suggested Test Additions

- Concurrency tests for rapid `WatchDirectory`/`StopWatching` cycles.
- Unit/integration tests for `runGitWithProgress()` ensuring full stdout/stderr capture and no races under `-race`.
- Scheduler tests for repo switch behavior (ensure old repo tasks are cancelled).
- Contract tests for typed event payloads to catch bridge regressions.

---

## Final Assessment

The backend is generally well-structured and production-oriented, but **concurrency hygiene around long-lived goroutines and shared state** needs tightening to meet high-confidence desktop reliability goals. Addressing the top three findings (F1-F3) will materially reduce crash/race risk and improve bridge predictability in real-world usage.
