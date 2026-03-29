# Startup Error Screen Gating Implementation Plan

Status: Proposed  
Last updated: 2026-03-29

## Purpose

This document translates the product requirements in [STARTUP_ERROR_SCREEN_GATING_REQUIREMENTS.md](./STARTUP_ERROR_SCREEN_GATING_REQUIREMENTS.md) into an engineering implementation plan for ControlZebra Desktop.

The target outcome is a startup failure flow that:

1. Only shows a blocking startup failure screen when the renderer genuinely failed to become usable
2. Shows rich raw diagnostics in development, not in production
3. Suppresses known benign startup warnings from triggering a production failure state
4. Preserves enough diagnostic detail for support and repeated-failure triage

## Summary

Today the desktop frontend uses a raw inline HTML overlay in `frontend/index.html` that flips into a crash-like state on any early `window.onerror`, any early `window.onunhandledrejection`, or a fixed 5 second empty-root timeout.

That implementation is too coarse for production. It treats observation as proof of failure.

The recommended implementation is a two-pass delivery:

1. Pass 1: replace the current direct overlay trigger with a startup guard that classifies events, suppresses known benign warnings, and only marks startup as failed in production if the shell never becomes usable
2. Pass 2: replace the production-facing raw overlay with a restrained ControlZebra startup failure screen that offers recovery and diagnostics actions while keeping technical details hidden by default

This plan keeps the immediate fix pragmatic while creating a clean seam for future startup diagnostics work.

## Current Implementation Audit

### Current behavior

The current startup failure logic lives directly in [frontend/index.html](../../frontend/index.html).

Current behavior:

1. Any early `window.onerror` calls `showErr(...)`
2. Any early `window.onunhandledrejection` calls `showErr(...)`
3. A 5 second timer checks whether `#root` is still empty and calls `showErr(...)`
4. `showErr(...)` displays a full-screen raw overlay and changes the document title to `CZ_ERROR: ...`

This means the current implementation has no concept of:

1. Development versus production behavior
2. Fatal versus benign startup issues
3. Successful shell mount after an earlier warning
4. Hidden-by-default diagnostics for end users

### Existing implementation seams to reuse

The implementation should reuse these existing seams instead of inventing parallel infrastructure:

1. [frontend/src/app/main.tsx](../../frontend/src/app/main.tsx) already fails fast when `#root` is missing
2. [frontend/src/app/App.tsx](../../frontend/src/app/App.tsx) is the earliest stable React shell seam for signaling that the app is usable
3. [services/debug_service.go](../../services/debug_service.go) already exposes log export and runtime log access to the frontend
4. [services/settings_service.go](../../services/settings_service.go) already exposes data locations, including the logs directory
5. [services/filesystem_service.go](../../services/filesystem_service.go) already exposes clipboard and reveal/open actions that can support a production diagnostics path
6. [services/debug_logger.go](../../services/debug_logger.go) already provides the durable local log/export mechanism the startup flow should feed into

## Product And Technical Decisions

### Decision 1: Keep startup guarding outside the main React tree

The app still needs protection for pre-React failures, so startup guarding cannot live only inside React error boundaries.

Decision:

1. Keep a minimal bootstrap guard active before React mounts
2. Move most logic out of raw inline HTML string handling and into a dedicated startup module loaded before the main app render path
3. Keep `frontend/index.html` as a thin host, not the long-term home of failure classification logic

### Decision 2: Treat startup as a state machine, not a single event

The key product bug is that a single early error is treated as confirmed startup failure.

Decision:

Model startup with explicit states:

1. `booting`
2. `mounted-shell`
3. `fatal-before-mount`
4. `fatal-timeout`
5. `completed-with-suppressed-issues`

This state model lets the app observe warnings without implying product failure.

### Decision 3: Production failure UI must be gated by shell usability

A production failure screen should appear only if the app still cannot present a usable shell after classification and timeout verification.

Decision:

1. Errors collected before mount are evidence, not automatic failure
2. Production fallback renders only if the app remains unmounted or explicitly enters a fatal state
3. Once the shell reports readiness, the startup guard must stop escalating to the blocking startup screen

### Decision 4: Keep the benign-warning allowlist intentionally narrow

Decision:

1. Start with a short classifier list containing only verified non-fatal warnings
2. Initially include known `ResizeObserver` loop warnings if they are confirmed non-fatal in packaged builds
3. Suppress display, not logging
4. Require explicit review before adding any new allowlist entry

### Decision 5: Diagnostics capture should reuse existing logging infrastructure

Decision:

1. Do not build a second startup-only log store unless required by a hard bridge limitation
2. Add a focused frontend-to-backend logging path for startup diagnostics into the existing debug logger stack
3. Preserve original raw error payloads internally even when the user sees simplified copy

## Scope

### In scope

1. Pre-React startup event capture and classification
2. Environment gating for startup diagnostics
3. Production-only startup failure screen behavior
4. Mount timeout refinement
5. Known-warning suppression
6. Local diagnostic capture and support-friendly error references
7. Development and QA validation paths for bootstrap failures

### Out of scope

1. General post-startup runtime error handling
2. Full app-wide error boundary redesign
3. Backend process crash reporting outside the renderer boot flow
4. Telemetry product decisions beyond preserving a future hook

## File Touchpoints

### Existing files expected to change

1. [frontend/index.html](../../frontend/index.html)
2. [frontend/src/app/main.tsx](../../frontend/src/app/main.tsx)
3. [frontend/src/app/App.tsx](../../frontend/src/app/App.tsx)
4. [services/debug_service.go](../../services/debug_service.go)
5. [services/settings_service.go](../../services/settings_service.go) only if a cleaner diagnostics contract is needed
6. [services/filesystem_service.go](../../services/filesystem_service.go) only if existing reveal/open behavior is insufficient for the production fallback actions

### New frontend files recommended

1. `frontend/src/app/startup/startupGuard.ts`
2. `frontend/src/app/startup/startupClassifier.ts`
3. `frontend/src/app/startup/benignWarnings.ts`
4. `frontend/src/app/startup/startupFailureScreen.ts`
5. `frontend/src/app/startup/types.ts`
6. `frontend/src/app/startup/__tests__/...`

### Optional new backend file

If the existing services produce an awkward pre-React diagnostics seam, add a minimal dedicated service:

1. `services/startup_service.go`

This should only be introduced if extending `DebugService` and reusing `SettingsService` plus `FileSystemService` becomes too fragmented for the startup bootstrap layer.

## Delivery Strategy

## Pass 1: Correctness gating

Goal:

Stop benign or recoverable startup issues from showing a production crash screen.

Primary outcome:

Production fallback becomes stateful and classification-driven rather than event-driven.

## Pass 2: User-safe production experience

Goal:

Replace the raw production overlay with a restrained startup failure experience that matches ControlZebra's product tone.

Primary outcome:

Users get clear recovery guidance and optional diagnostics without being dropped into a browser crash dump.

Pass 1 should land first even if Pass 2 follows shortly after. That sequence delivers the highest-value behavior correction with the smallest immediate risk.

## Workstream 1: Startup Guard Foundation

Priority: P0  
Complexity: Medium

### Goal

Replace the direct overlay trigger model with a reusable startup guard that records startup events, classifies them, and owns escalation behavior.

### Implementation

1. Introduce a startup guard module that is loaded before normal app render work begins
2. Move event normalization out of the raw inline script in [frontend/index.html](../../frontend/index.html)
3. Capture these startup event sources:
   - `window.onerror`
   - `window.onunhandledrejection`
   - mount timeout checks
   - explicit bootstrap exceptions such as missing root element
4. Normalize each event into a shared shape such as:

```ts
type StartupIssue = {
  id: string;
  timestamp: string;
  source: 'onerror' | 'unhandledrejection' | 'mount-timeout' | 'bootstrap';
  severity: 'suppressed' | 'observed' | 'fatal';
  category: string;
  message: string;
  stack?: string;
  sourceUrl?: string;
  line?: number;
  column?: number;
  visibleToUser: boolean;
};
```

5. Track boot lifecycle state in one place instead of letting each event mutate the DOM directly
6. Preserve multi-error collection for development builds

### Deliverables

1. Shared startup issue type definitions
2. Startup issue collector and in-memory store
3. DOM-safe fallback rendering hooks
4. A single startup guard entry point used by the boot flow

### Acceptance criteria

1. Startup events are collected without immediately implying fatal failure
2. The DOM is no longer mutated directly by each global error callback
3. Development still has a path to rich multi-error startup diagnostics

## Workstream 2: Failure Classification And Suppression

Priority: P0  
Complexity: Medium

### Goal

Separate genuine startup failure from benign startup noise.

### Implementation

1. Add a dedicated classifier module for startup issues
2. Define three outcomes:
   - `suppressed`
   - `observed`
   - `fatal`
3. Start with a narrow benign-warning matcher list in a separate file so the policy is reviewable
4. Match benign warnings by verified message fingerprints, not broad string fragments that could hide real failures
5. Explicitly classify these cases as fatal:
   - missing root element
   - unrecoverable bootstrap exception before render begins
   - mount timeout where the shell still has not reported readiness
6. Explicitly classify these cases as suppressed or observed only:
   - verified `ResizeObserver` loop warnings
   - non-blocking telemetry exceptions
   - early errors from optional features that do not block shell readiness

### Design rules

1. The allowlist must live in code with comments explaining why each entry is safe
2. Every suppressed issue should still be eligible for internal logging
3. Suppressed issues must not change the document title or trigger blocking UI

### Acceptance criteria

1. Known benign warnings do not trigger production fallback
2. Recoverable startup issues do not trigger production fallback if the shell mounts
3. Fatal bootstrap failures still produce a reliable failure state

## Workstream 3: Explicit App-Ready Signal

Priority: P0  
Complexity: Low

### Goal

Give the startup guard a reliable signal that the renderer actually became usable.

### Why this matters

The current timeout only checks whether the root is empty. That is too weak. React may be rendering slowly, replacing markup, or showing an initial loading state while still being healthy.

### Implementation

1. Add an explicit shell-ready signal from React after the app reaches its first usable UI state
2. Emit the signal from the earliest stable seam in [frontend/src/app/App.tsx](../../frontend/src/app/App.tsx)
3. Accept either of these implementations:
   - dispatch a custom event such as `window.dispatchEvent(new CustomEvent('cz:app-shell-ready'))`
   - set a stable DOM marker such as `document.documentElement.dataset.czAppReady = 'true'`
4. The startup guard should stop escalation once this signal is received
5. The timeout check should verify both:
   - no explicit ready signal received
   - the shell is still not usable

### Recommended usability threshold

Treat the app as ready when one of these is true:

1. The auth gate has progressed beyond the initial loading spinner into a usable screen
2. The main layout is mounted
3. A dedicated startup-ready component explicitly reports boot completion

### Acceptance criteria

1. Startup timeout does not fire if the app becomes usable before the threshold
2. Early warnings do not produce a failure screen after readiness is confirmed
3. The guard has a deterministic source of truth for startup completion

## Workstream 4: Production Startup Failure Screen

Priority: P1  
Complexity: Medium

### Goal

Replace the current raw overlay with a restrained production failure screen that fits ControlZebra.

### UI direction

The production screen should feel like a utility app state, not a developer crash dump.

Required traits:

1. Plain-English title and body copy
2. Restrained styling aligned with the rest of the app
3. Clear primary recovery action first
4. Technical details hidden behind an explicit reveal
5. Keyboard-accessible controls and readable hierarchy

### Recommended production copy

Title:

`ControlZebra couldn't finish starting`

Body:

`The app ran into a problem before it could open normally.`

`Try restarting ControlZebra. If this keeps happening, open diagnostics and share them with support.`

### Recommended actions

1. `Try again`
2. `Open diagnostics`
3. `Copy error reference`
4. `Technical details`

### Action behavior

1. `Try again` should use the lightest safe restart path available:
   - first choice: a true app restart or reload contract if available through Wails
   - fallback: `window.location.reload()` for renderer-only retry during early implementation
2. `Open diagnostics` should reveal the logs or diagnostics directory using existing backend file-system capabilities
3. `Copy error reference` should copy a stable support-friendly identifier plus version/context summary
4. `Technical details` should expand the hidden raw diagnostic payload without being visible by default

### Acceptance criteria

1. Production failure UI no longer shows raw stack traces or source URLs by default
2. The default state explains what happened and what to do next in plain English
3. The screen offers both recovery and diagnostics paths

## Workstream 5: Diagnostic Capture And Support Contract

Priority: P1  
Complexity: Medium

### Goal

Persist startup diagnostics locally even when the user only sees simplified UI.

### Implementation

1. Extend the existing debug logging surface with a focused startup diagnostic write path
2. Record these fields when available:
   - app version
   - build mode
   - OS and runtime context
   - startup issue category
   - raw message
   - stack trace and source location
   - classifier result
   - whether the issue was shown to the user
   - boot session id or failure reference id
3. Reuse [services/debug_service.go](../../services/debug_service.go) and [services/debug_logger.go](../../services/debug_logger.go) for persistence and export
4. Reuse [services/settings_service.go](../../services/settings_service.go) for data-location discovery
5. Reuse [services/filesystem_service.go](../../services/filesystem_service.go) for reveal/open/copy actions where possible
6. If the frontend cannot reach the backend logger before fatal display, queue issues in memory and flush them as soon as the bridge is available
7. If the bridge never becomes available, still generate a support-friendly failure reference for the screen and log to the browser console as a last-resort development signal

### Recommended API shape

This can be implemented either by extending `DebugService` or by adding a minimal dedicated startup service.

If extending `DebugService`, add a method similar to:

```go
type StartupDiagnosticRecord struct {
    SessionID      string `json:"sessionId"`
    BuildType      string `json:"buildType"`
    AppVersion     string `json:"appVersion"`
    Source         string `json:"source"`
    Category       string `json:"category"`
    Message        string `json:"message"`
    Stack          string `json:"stack,omitempty"`
    SourceURL      string `json:"sourceUrl,omitempty"`
    Line           int    `json:"line,omitempty"`
    Column         int    `json:"column,omitempty"`
    Classification string `json:"classification"`
    UserVisible    bool   `json:"userVisible"`
}

func (d *DebugService) RecordStartupDiagnostic(record StartupDiagnosticRecord) error
```

### Acceptance criteria

1. The app preserves raw startup diagnostics internally even when user copy is simplified
2. Support can distinguish suppressed warnings from visible fatal startup failures
3. The production screen can copy a stable reference without exposing raw implementation detail by default

## Workstream 6: Timeout Refinement

Priority: P0  
Complexity: Low

### Goal

Eliminate false-positive timeout failures on slower machines.

### Implementation

1. Replace the current hardcoded 5 second fatal timer with a conservative timeout policy
2. Evaluate timeout only if no app-ready signal has been observed
3. At timeout, perform a final usability check before declaring fatal failure
4. Keep the threshold configurable in code, not duplicated across HTML and app logic
5. Default to a more conservative threshold than 5 seconds for packaged production builds unless testing proves a shorter value is safe

### Recommendation

Start with:

1. Development timeout: short enough to keep feedback fast
2. Production timeout: materially more conservative, validated against lower-end Windows machines before release

### Acceptance criteria

1. Slow but successful startup no longer shows a failure screen
2. True never-mounted startup failures still transition into a fatal state

## Workstream 7: Development And QA Debug Experience

Priority: P1  
Complexity: Low

### Goal

Preserve rich startup diagnostics for engineers without shipping that experience to end users.

### Implementation

1. Keep a development-mode diagnostic overlay or equivalent detailed startup panel
2. Allow multiple collected startup issues to be rendered together in development
3. Add a small set of explicit failure injection hooks for QA, guarded to development only
4. Validate these scenarios:
   - missing root element
   - thrown bootstrap exception before React render
   - suppressed benign warning followed by successful shell mount
   - mount timeout with no shell-ready signal
   - early non-fatal warning followed by successful app readiness

### Acceptance criteria

1. Developers still get immediate raw diagnostics during local debugging
2. QA can reliably exercise startup failure paths without editing production logic each time

## Testing Plan

### Automated tests

1. Add unit tests for startup issue classification
2. Add unit tests for known-warning suppression
3. Add jsdom-style tests for startup guard state transitions and timeout behavior
4. Add tests for the production failure screen action availability and technical-details disclosure
5. Add Go tests for any new debug-service startup diagnostic API

### Manual validation

1. Validate development behavior in `task dev`
2. Validate packaged production behavior in a desktop build, not only in Vite dev mode
3. Confirm suppressed warnings do not change title or visual state in production
4. Confirm logs or exported diagnostics contain the original raw issue payload
5. Confirm retry behavior does not trap the app in a stale failed DOM state

## Recommended Implementation Sequence

1. Extract the current inline error logic into a startup guard module while keeping behavior equivalent
2. Add startup issue normalization and classifier logic
3. Add the app-ready signal from React
4. Change timeout behavior to depend on shell readiness, not only empty root
5. Gate raw overlay behavior to development builds only
6. Add the production startup failure screen with hidden technical details
7. Add backend startup diagnostic persistence and screen actions for diagnostics access and copyable references
8. Validate in packaged builds and tune timeout thresholds based on real startup timing data

## Risks And Mitigations

### Risk: production fallback cannot reach Wails bindings early enough

Mitigation:

1. Keep the first phase focused on correct gating even if diagnostics actions are temporarily limited
2. Queue startup diagnostics until the bridge is ready
3. Use `window.location.reload()` as the initial retry path if true app restart is not yet available

### Risk: allowlist grows too broad and hides real failures

Mitigation:

1. Keep the allowlist in a dedicated reviewed file
2. Require exact-message or tightly scoped matching
3. Log every suppressed issue for auditability

### Risk: shell-ready signal fires too early

Mitigation:

1. Define a concrete readiness threshold tied to the first usable UI state
2. Avoid signaling readiness from raw `createRoot(...)` setup alone
3. Prefer a post-commit signal from [frontend/src/app/App.tsx](../../frontend/src/app/App.tsx)

### Risk: timeout threshold still produces false positives on Windows

Mitigation:

1. Validate against packaged Windows builds before finalizing the threshold
2. Keep the threshold centralized and configurable
3. Treat timeout as fatal only after a final usability check fails

## Exit Criteria

This plan is complete when all of the following are true:

1. Development builds still surface rich startup diagnostics
2. Production builds do not show raw developer-style startup overlays by default
3. Known benign warnings do not trigger the production startup failure screen
4. Recoverable early startup issues do not trigger the production startup failure screen if the shell becomes usable
5. Genuine pre-mount fatal failures produce a plain-English failure screen
6. Technical details are hidden by default in production
7. Underlying startup diagnostics are still captured locally with visibility/classification metadata
8. The document title and visual state no longer imply product failure for suppressed warnings alone

## Recommended Next Step

Implement Pass 1 first as a focused behavior-correction change in the frontend bootstrap layer. That delivers the main product fix quickly and reduces the chance of shipping another false-positive startup crash screen while the richer production fallback UI is being completed.