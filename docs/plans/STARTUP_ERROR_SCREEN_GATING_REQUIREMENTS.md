# Startup Error Screen Gating Requirements

Status: Proposed  
Last updated: 2026-03-29

## Purpose

Define the product requirements for ControlZebra's startup error handling so the application only shows a startup error screen when the app has genuinely failed to boot, while avoiding developer-style raw error output for non-technical production users.

This requirement exists because the current bootstrap behavior in `frontend/index.html` can surface low-level browser and runtime messages as a full-screen startup failure, even when the app itself is still usable.

## Problem statement

Today the desktop app installs a global startup-time error overlay directly in `frontend/index.html`.

Current behavior:

1. Any early `window.onerror` event can trigger a full-screen startup error overlay
2. Any early `window.onunhandledrejection` can trigger the same overlay
3. A fixed timeout shows the same overlay if React has not mounted quickly enough
4. The overlay shows raw technical details intended for engineers, not end users

This creates several product problems:

1. Non-technical users can see browser-internal or framework-level messages they cannot act on
2. Benign warnings can look like hard product failures
3. The startup experience becomes inconsistent with the rest of ControlZebra's simple, user-first UX
4. The app can lose user trust by presenting diagnostics as if they were product messaging

## Product goal

ControlZebra should provide a startup failure experience that is:

1. Safe for non-technical production users
2. Accurate about whether the app truly failed to start
3. Useful for support and diagnostics
4. More detailed in development builds than in production builds

## Primary user need

When ControlZebra cannot start, the user needs a clear answer to three questions:

1. Did the app actually fail to start?
2. What should I do next?
3. How can support diagnose the problem if it keeps happening?

The user does not need to see raw stack traces, browser messages, source URLs, or implementation details unless they explicitly choose to reveal technical diagnostics.

## Users and stakeholders

### Primary users

1. Operators, technicians, and engineers using ControlZebra as a simplified Git desktop app
2. Non-technical or semi-technical users who need recovery guidance, not browser diagnostics

### Secondary users

1. Internal support staff troubleshooting startup failures
2. Developers working in local development or QA environments

## Scope

This requirement covers:

1. The pre-React and early-startup error experience in the desktop frontend
2. Gating behavior by environment and error type
3. The user-facing production startup failure screen
4. Technical detail handling and diagnostic capture

This requirement does not cover:

1. In-app error boundaries after the shell has mounted successfully
2. Backend crash handling outside the renderer boot flow
3. General runtime notification strategy after startup completes

## Definitions

### Startup error screen

A blocking full-window fallback UI shown before the normal app shell becomes usable.

### Genuine startup failure

A condition where the application cannot present a usable root shell or cannot complete required bootstrap work to the point that the user can begin using the app.

### Benign startup warning

A warning or recoverable client-side error that may be emitted during startup but does not prevent the app from mounting and becoming usable.

Examples include browser layout warnings, recoverable render retries, and diagnostics that do not leave the app in a broken startup state.

## High-level requirement

ControlZebra must gate the startup error screen so that:

1. Development builds can show rich technical startup diagnostics
2. Production builds show a minimal, user-safe startup failure UI only for genuine startup failures
3. Known benign warnings must not trigger the production startup failure screen
4. Detailed diagnostics must still be captured for logs and support workflows

## User stories

### Production user

1. As a production user, if ControlZebra starts successfully, I should never see a developer-style startup error screen
2. As a production user, if ControlZebra fails before it can open the main app UI, I should see a simple explanation and recovery actions
3. As a production user, I should not be shown raw stack traces, `window.onerror` messages, source URLs, or browser-internal warning text by default
4. As a production user, if the failure is transient or recoverable, I should be guided to retry rather than left with technical noise

### Support user

1. As support, I need enough diagnostic context captured to determine why startup failed
2. As support, I need a stable way to distinguish real startup failures from benign warnings

### Developer or QA user

1. As a developer, I want rich startup diagnostics during development so I can quickly identify boot failures
2. As a QA user, I may need access to technical details to validate failure modes without shipping those details to production users by default

## Required behavior

## Requirement 1: Environment gating

The startup diagnostic experience must differ by environment.

### Development behavior

In development or explicitly enabled debug builds:

1. The app may show a detailed startup error overlay
2. The overlay may include stack traces, source locations, error categories, and raw messages
3. The overlay may aggregate multiple startup-time errors for debugging

### Production behavior

In packaged production builds:

1. The app must not show a raw developer-style overlay by default
2. The app may show a production startup failure screen only when the app is not usable
3. The production screen must use plain-English copy and user recovery guidance
4. Technical detail must be hidden by default

## Requirement 2: Failure classification

The system must distinguish between genuine startup failures and benign startup warnings.

### Genuine startup failures that may show the production fallback

Examples include:

1. The root element cannot be found
2. The initial application bundle fails to execute
3. React never mounts and the app remains unusable after the startup threshold
4. A required bootstrap module throws an unrecoverable error before the app shell is interactive
5. A fatal initialization dependency prevents the shell from loading at all

### Benign or non-fatal startup issues that must not show the production fallback

Examples include:

1. Known browser warnings such as `ResizeObserver` loop warnings
2. Recoverable rendering warnings
3. Non-blocking telemetry failures
4. Errors from features that do not prevent the shell from mounting
5. Transient warnings that occur before mount but do not leave the app unusable

## Requirement 3: Production UX

When a genuine startup failure occurs in production, the startup failure screen must:

1. Explain in plain English that ControlZebra could not finish starting
2. Avoid Git jargon and implementation jargon
3. Offer at least one immediate recovery action
4. Offer a path to diagnostics without forcing technical information on the user
5. Preserve the app's restrained, utility-first visual language

### Required production copy outcomes

The user-facing message must communicate:

1. The app could not complete startup
2. Restarting the app is the first recommended action
3. If the issue repeats, the user can open diagnostics or contact support

### Required production actions

The production screen should support the following actions where platform capabilities allow:

1. Retry startup or restart app
2. Open logs or diagnostics folder
3. Copy a support-friendly error reference
4. Reveal technical details only behind an explicit user action

## Requirement 4: Technical details handling

Technical detail visibility must be intentionally gated.

### Production

1. Stack traces must be hidden by default
2. Raw browser messages must be hidden by default
3. Source URLs and line numbers must be hidden by default
4. If technical details are available, they must be behind an explicit reveal control such as `Technical details`

### Development

1. Technical details may be shown immediately
2. Multi-error aggregation is allowed
3. Raw startup diagnostics are allowed

## Requirement 5: Diagnostic capture

Even when the production UI is simplified, diagnostics must still be captured.

The startup failure handling flow must support:

1. Logging the underlying startup error details locally
2. Tagging the error as a startup failure versus a benign ignored warning
3. Recording enough context to correlate repeated failures
4. Preserving the original raw error internally even if the user-facing text is simplified

Diagnostic fields should include when available:

1. Build type and version
2. OS and runtime context
3. Error category
4. Original message
5. Stack trace or source location
6. Whether the error was user-visible or internally suppressed

## Requirement 6: Mount timeout behavior

The current timeout-based fallback behavior must be refined.

Requirements:

1. A startup timeout must not be treated as fatal unless the root shell is still unusable
2. Timeout logic should verify that the app truly failed to mount, not merely that rendering was delayed
3. The timeout threshold must be conservative enough to avoid false positives on slower machines
4. Production timeout messaging must remain user-safe and plain English

## Requirement 7: Known-warning suppression

The system must support a small allowlist of known benign browser or platform warnings that should never trigger the production startup failure screen.

Requirements:

1. The allowlist must be intentionally narrow
2. The allowlist must only contain warnings that are verified to be non-fatal
3. Suppressed warnings may still be logged internally
4. Suppressed warnings must not change the document title or visual state to imply startup failure

## Requirement 8: Visual and interaction guidelines

If shown in production, the startup failure screen must feel like part of ControlZebra rather than a developer crash dump.

Requirements:

1. Use restrained UI styling consistent with the rest of the app
2. Prioritize legibility and actionability over dramatic error presentation
3. Keep the layout simple and centered on recovery
4. Avoid dense blocks of technical text in the default state

## Requirement 9: Accessibility and usability

The production startup failure screen must:

1. Be keyboard accessible
2. Have clear heading hierarchy
3. Provide sufficient color contrast
4. Present actions in a predictable order
5. Keep user-facing language understandable for non-technical users

## Non-functional requirements

1. Startup failure detection must not materially slow normal app startup
2. Production gating must be deterministic across packaged builds
3. Diagnostic capture must not depend on the user manually copying the screen
4. The startup failure flow must avoid creating secondary errors when the main app has not mounted

## Out of scope

1. Replacing all runtime error handling across the app
2. Designing a full support workflow or ticketing integration
3. Automatically recovering from all startup failures
4. Showing per-feature error states after the main shell is already running

## Acceptance criteria

1. In development, startup-time JavaScript bootstrap failures show a detailed diagnostic overlay
2. In production, known benign warnings do not show a startup failure screen
3. In production, recoverable startup-time warnings do not show a startup failure screen if the shell mounts successfully
4. In production, a genuine pre-mount fatal error shows a plain-English startup failure screen
5. In production, the failure screen does not show stack traces or source URLs by default
6. In production, the failure flow offers a recovery path and a diagnostics path
7. Internal logs preserve the underlying technical failure details regardless of what the user sees
8. The app no longer presents browser-internal warnings as if they were confirmed app crashes

## Example production copy direction

### Title

ControlZebra couldn't finish starting

### Body

The app ran into a problem before it could open normally.

Try restarting ControlZebra. If this keeps happening, open diagnostics and share them with support.

### Actions

1. Restart app
2. Open diagnostics
3. Technical details

## Open implementation questions

1. Should production use a dedicated HTML fallback screen or a minimal pre-React shell component?
2. Should `Technical details` be visible in all production builds or only in beta/debug-flavored builds?
3. Should diagnostics be written only locally, or also sent through telemetry when enabled?
4. What startup timeout threshold is appropriate for lower-end Windows machines?

## Delivery recommendation

Implement this in two passes:

1. Gate the current startup overlay by environment and suppress known benign warnings in production
2. Replace the raw production overlay with a proper user-safe startup failure screen and diagnostic actions

This keeps the short-term implementation pragmatic while moving the product toward a production-appropriate startup failure experience.