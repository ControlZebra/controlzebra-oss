# Frontend Audit — Wails v3 (TypeScript/JavaScript)

**Date:** March 5, 2026  
**Auditor Role:** Senior Frontend Architect (Wails v3 / Go-frontend IPC)  
**Target:** `ControlZebra-Desktop/frontend`

---

## Executive Summary

The frontend architecture is generally solid and follows modern React + Wails v3 practices, with correct event subscription cleanup in most areas and strong use of lazy loading for heavy viewer modules.

Primary risks are not correctness bugs, but **efficiency and scaling risks**:

1. **Redundant IPC polling** where event-driven updates already exist.
2. **Potential overlapping interval calls** (no in-flight guard), which can amplify IPC load under slow backend responses.
3. **High payload IPC paths** (base64 file transfer for PDF/3D/image viewers and diffs), which can stress memory and latency.
4. **Large production bundles** despite existing lazy loading.
5. **URL opening hardening gaps** before calling runtime browser APIs.

---

## Scope

This audit focused on:

- Runtime usage (`@wailsio/runtime`) for events/window/browser interactions
- Frontend-to-backend IPC call frequency and payload pressure
- Frontend state synchronization strategy versus backend event model
- Build output size and dependency impact on desktop binary/runtime footprint

---

## 1) Runtime Usage (Wails v3)

### Outcome

Runtime usage is **mostly correct** and consistent with Wails v3 eventing patterns.

### Evidence

- Event subscriptions with cleanup observed in:
  - `frontend/src/context/RepoContext.tsx`
  - `frontend/src/components/ui/progress-modal.tsx`
  - `frontend/src/components/layout/pages/DebugPage.tsx`
  - `frontend/src/components/common/SimpleFileBrowser.tsx`
  - `frontend/src/components/viewers/*`
- Browser runtime API usage observed in:
  - `frontend/src/components/common/GitHubDeviceFlowModal.tsx`
  - `frontend/src/components/common/RepoSwitcher.tsx`
  - `frontend/src/components/common/SimpleFileBrowser.tsx`
  - `frontend/src/components/layout/TopBar.tsx`

### Findings

- ✅ No obvious incorrect event unsubscribe patterns in critical paths.
- ✅ Runtime browser integration is idiomatic.
- ⚠️ There is little centralized abstraction around runtime calls; behavior and validation are duplicated across components.

---

## 2) IPC Communication Audit (Frequency + Payload)

## High Severity

### A. Redundant polling in repo settings panels

Three separate panels poll `GetTaskStatuses()` every 10 seconds:

- `RemoteSyncPanel`
- `LargeFilesPanel`
- `PerformancePanel`

in `frontend/src/components/layout/pages/repo-settings/RepoSettingsPage.tsx`.

At the same time, backend emits `background-task-completed` from `services/repository_settings_service.go`.

**Impact:** avoidable periodic IPC and increased wakeups, especially when the page remains open.

**Recommendation:** use event-first refresh (`background-task-completed`) and keep a slower fallback poll (e.g., 60s) only for resilience.

---

### B. Interval overlap risk (no in-flight guards)

Observed interval-driven calls:

- `completeGitHubLogin()` every 2s in `GitHubDeviceFlowModal.tsx`
- `GetStats()` every 3s in `DebugPage.tsx`
- `GetTaskStatuses()` every 10s in `RepoSettingsPage.tsx`
- `Status()` every 30s in `RepoContext.tsx`

If backend response time > interval, multiple concurrent calls can queue.

**Impact:** IPC burst amplification and unnecessary backend contention.

**Recommendation:** add per-loop in-flight guard (`if (busy) return`) or convert to recursive `setTimeout` after await.

---

## Medium Severity

### C. N+1 IPC pattern in recent projects status detection

`RecentProjectsPage.tsx` loads recent folders and for each path executes:

1. `DetectRepo(path)`
2. `GetRemoteURL(path)` (for repo paths)

**Impact:** startup/list rendering latency scales poorly with history size.

**Recommendation:** add a backend batch method (single call returning `path + repo status + remote status`) to reduce round trips.

---

### D. Heavy payload IPC for viewer/diff flows

Large binary data is transferred as base64 for:

- `PDFViewer.tsx`
- `ImageViewer.tsx`
- `Model3DViewer.tsx`
- `PDFDiffViewer.tsx`
- `Model3DDiffViewer.tsx`

Diff viewers often fetch two versions concurrently.

**Impact:** high memory overhead and decode latency; base64 inflates size ~33% before decode.

**Recommendation:** for very large assets, prefer file-path/native stream approaches where possible, and enforce payload guards (size thresholds + graceful fallback messaging).

---

## Low Severity

### E. Duplicate URL parsing utility

`gitUrlToWebUrl` is duplicated in:

- `RepoSwitcher.tsx`
- `SimpleFileBrowser.tsx`

**Impact:** consistency drift and repeated validation logic.

**Recommendation:** extract one shared utility with strict protocol allowlist.

---

## 3) State Synchronization Audit

### Outcome

State synchronization strategy is conceptually correct:

- Event-driven refresh via `files-changed`
- Fallback polling every 30 seconds in `RepoContext`
- Manual refresh after operations

### Findings

- ✅ Good baseline resilience: event + polling + explicit refresh.
- ⚠️ Some layered listeners create repeated refresh pressure:
  - `RepoContext` refreshes status on `files-changed`
  - `SimpleFileBrowser` also reacts to `files-changed`
  - Viewer components react to `files-changed` individually

This is often acceptable, but can stack under intense filesystem churn.

**Recommendation:** introduce lightweight event coalescing/throttling policy at context level and track event-to-request fanout.

---

## 4) Build Optimization / Dependency Weight

## Build Evidence (production build)

From `npm run build` in `frontend/`:

- `dist/assets/index-BzPTLq8o.js` ≈ **1.23 MB** (gzip 351 KB)
- `dist/assets/o3dv.module-Di_f6k-S.js` ≈ **1.06 MB** (gzip 281 KB)
- `dist/assets/pdf.worker.min-*.mjs` ≈ **1.05 MB**
- `dist/assets/pdf-BKgQKo8Q.js` ≈ **439 KB**

### Findings

- ✅ Heavy viewers (`PDFViewer`, `Model3DViewer`, `L5XViewer`) are lazy-loaded in `frontend/src/lib/viewers-builtin.ts`.
- ⚠️ Base app chunk is still large for desktop startup responsiveness.
- ⚠️ `@wailsio/runtime` is pinned to `latest` in `frontend/package.json` (non-reproducible build risk).
- ⚠️ Suspicious generated file appears under source tree:
  - `frontend/src/components/common/frontend/bindings/github.com/wailsapp/wails/v3/internal/eventcreate.ts`

Potentially harmless, but it should be reviewed/removed if accidental.

---

## Security & Safety Notes

## Medium

### OpenURL input validation

`Browser.OpenURL(...)` is invoked after remote URL conversion but without strict scheme allowlisting.

**Risk:** malformed or unexpected protocols could be opened.

**Recommendation:** normalize and allow only `https:` / `http:` before `Browser.OpenURL`, with user-facing error otherwise.

---

## Priority Matrix

| Priority | Finding | Category |
|---|---|---|
| P1 | Replace repo-settings 10s polling with event-first updates | IPC / State Sync |
| P1 | Add in-flight guards to all interval-based backend calls | IPC / Stability |
| P2 | Batch recent-project status backend API | IPC Latency |
| P2 | Add URL scheme allowlist before Browser.OpenURL | Security |
| P2 | Review large base64 payload strategy for big viewers/diffs | Performance / Memory |
| P3 | Deduplicate URL parsing utility | Maintainability |
| P3 | Pin `@wailsio/runtime` version | Build Reproducibility |
| P3 | Review stray generated binding file under `src` | Build Hygiene |

---

## Suggested Implementation Order

1. **Event-first repo-settings sync** (`background-task-completed`) + fallback slow poll.
2. **In-flight guards** for every polling loop.
3. **OpenURL hardening** with strict protocol validation.
4. **Backend batch endpoint** for recent projects status.
5. **Bundle hygiene pass** (main chunk analysis + dependency review).

---

## Final Verdict

The frontend is fundamentally production-capable and architecturally aligned with Wails v3. The main improvements are **operational efficiency and hardening**, not a rewrite. Addressing the P1/P2 items will materially reduce IPC load, improve responsiveness under stress, and strengthen runtime safety.
