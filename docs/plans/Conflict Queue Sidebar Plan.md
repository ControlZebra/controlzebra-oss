# Conflict Queue Sidebar Plan

> Surface the backend conflict queue as a persistent section in the explorer sidebar, above Timeline, so conflicted files are visible and actionable without opening the merge modal.

## Status

Implemented 2026-08-15. See [[Conflict Queue Sidebar]] for the shipped behavior.

Frontend-only. The backend is already shipped — see
[[Conflict Queue Service Plan]] and [[ConflictQueueService]]. This plan consumes
that contract and adds no backend behavior beyond generated bindings.

It is a step toward [[Merge and Conflict Workflow Separation Plan]] Phase 3. It
deliberately stops short of the standalone resolver tab (that plan's Phase 2).

## Problem

Conflicted files are only visible inside the merge modal. A user who syncs, hits
a conflict, and closes the modal has no way to see what still needs a decision.
The backend now knows the answer continuously; nothing shows it.

## Approved Product Decisions

| Decision | Direction |
| --- | --- |
| Placement | New section in the explorer sidebar, directly above Timeline. |
| Visibility | Only while the queue is non-empty. |
| Vertical space | Fixed section with its own scroll, capped at ~40% of the sidebar height, so Timeline keeps a usable minimum. |
| Row content | Filename only. Conflict kind and ineligibility reason live in the tooltip. |
| Click behavior | Opens the existing conflict resolver modal focused on that file. |
| Ineligible files | Listed, visually de-emphasized, reason in the tooltip. Clicking opens the whole-file fallback (keep mine / keep theirs). |
| Header | `Conflicts (3)` with a warning icon. |
| Scan errors | Small inline warning row above the list; the last good list stays visible. |
| State | Dedicated `ConflictQueueProvider` + `useConflictQueue`, independent of `RepoContext`. |
| Lifecycle | Provider calls `SetRepository` on repo open/change, `ClearRepository` on close, and `Refresh` after a resolution completes. |
| Merge modal | Untouched. Its legacy queue coexists during the transition. |
| Activity bar badge | Out of scope for this iteration. |

## Layout

```text
Explorer sidebar
├── RepoSwitcher
├── View header ("Next step advisor")
├── Primary panel          (commit panel or status panel)  ← flexible
├── Conflicts (N)          ← NEW, only when N > 0, max ~40% height, scrolls
└── Timeline                                               ← flexible, keeps a minimum
```

The section renders inside `ExplorerView`, between `primaryPanel` and the
Timeline `<section>`. It is an `aria-label`led landmark like Timeline, so
screen-reader users can jump to it.

## Component Design

New files under `src/features/conflict/`:

| File | Responsibility |
| --- | --- |
| `context/ConflictQueueProvider.tsx` | Subscribes to `conflictQueue:changed`, owns the snapshot, exposes `refresh()`. |
| `hooks/useConflictQueue.ts` | Consumer hook returning `{ entries, error, isEmpty, refresh }`. |
| `components/sidebar/ConflictQueueSection.tsx` | Header, error row, scroll container, empty-guard. |
| `components/sidebar/ConflictQueueRow.tsx` | One file row: name, de-emphasis, tooltip, click handler. |
| `lib/conflict-queue-presentation.ts` | Maps backend enums to user-facing strings. |

The provider wraps the app at the same level as the other repository-scoped
providers so the section and any future consumer share one subscription.

### Presentation mapping

Backend enums are technical; the sidebar shows the app's non-technical
vocabulary, consistent with [[User-Facing Terminology]].

| `kind` | Tooltip phrasing |
| --- | --- |
| `both-modified` | Both changed this file |
| `both-added` | Both added this file |
| `added-by-us` | Only you added this file |
| `added-by-them` | Only they added this file |
| `deleted-by-us` | You deleted it, they changed it |
| `deleted-by-them` | They deleted it, you changed it |
| `both-deleted` | Both deleted this file |

| `ineligibleReason` | Tooltip phrasing |
| --- | --- |
| `image` | Image files are compared side by side |
| `binary` | This file can't be shown as text |
| `too-large` | This file is too large to open here |
| `submodule` / `symlink` / `unsupported-mode` | This file type can't be resolved in the app |
| `not-utf8` | This file uses an unsupported text encoding |
| `one-sided` | One side deleted this file |

Every tooltip ends with the file's full repository-relative path, since the row
shows the filename only.

## Data Flow

```text
Backend emits `conflictQueue:changed` (full snapshot)
  → ConflictQueueProvider replaces its snapshot if generation is newer
      → useConflictQueue re-renders ConflictQueueSection
          → row click → open existing resolver modal for that path
              → on resolution success → provider.refresh()
```

Snapshots carry a strictly increasing `generation`. The provider ignores any
snapshot whose generation is not greater than the one it holds, so a late event
can never overwrite newer state.

## Implementation Phases

### Phase 1 — Bindings and provider

Regenerate Wails bindings for `ConflictQueueService`, then add the provider and
hook with event subscription, generation guarding, and repository lifecycle
calls. No UI yet.

### Phase 2 — Sidebar section

Add `ConflictQueueSection` and `ConflictQueueRow` with the presentation mapping,
de-emphasis, tooltips, error row, and height cap. Render it in `ExplorerView`
above Timeline.

### Phase 3 — Wire the click

Open the existing resolver modal for the clicked path, routing ineligible files
to the whole-file fallback. Call `refresh()` when a resolution succeeds.

### Phase 4 — Tests and docs

Component tests for empty, populated, ineligible, and error states; a provider
test for generation guarding and lifecycle; an `ExplorerView` test asserting the
section renders above Timeline only when the queue is non-empty. Document the
section in the frontend feature docs.

## Non-Goals

- The standalone resolver tab, and removing file resolution from Merge Manager.
- Changing the merge modal or the existing resolution workflow.
- Persisting selection, scroll position, or collapsed state across restarts.
- Bulk actions such as "keep mine for everything".
- An activity bar badge or conflict notifications.

**Related:** [[Conflict Queue Service Plan]] | [[ConflictQueueService]] | [[Merge and Conflict Workflow Separation Plan]] | [[User-Facing Terminology]]
