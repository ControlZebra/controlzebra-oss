# Conflict Queue Sidebar

> `features/conflict/` — persistent list of files that still need a conflict decision.

## Overview

Whenever a merge, pull, rebase, cherry-pick or revert leaves files unmerged, the
Explorer sidebar shows a **Conflicts (N)** section between the primary panel and
the Timeline. The section is hidden entirely when nothing is conflicted, so the
sidebar is unchanged during normal work.

The backend [ConflictQueueService](../../backend/services/ConflictQueueService.md) is the single source of truth. It pushes a
full snapshot on the `conflictQueue:changed` event; the frontend never
reconciles deltas.

## Pieces

| File | Role |
| --- | --- |
| `context/ConflictQueueContext.tsx` | Mirrors the backend snapshot; owns repository binding and refresh |
| `components/sidebar/ConflictQueueSection.tsx` | The sidebar section: header, error row, list |
| `components/sidebar/ConflictQueueRow.tsx` | One file row (filename + tooltip) |
| `lib/conflict-queue-presentation.ts` | The only place backend enums become user-facing wording |

## Provider

`ConflictQueueProvider` wraps `AppLayout` inside `RepoProvider`.

- Calls `SetRepository(repoPath)` when a repository opens and `ClearRepository()`
  when none is open.
- Applies a snapshot only when its `generation` is newer than the one held, so
  late or duplicated events are dropped without tracking their origin.
- Ignores snapshots whose `repoPath` is not the repository being shown.
- Reads as empty when no provider is mounted, so conflict surfaces never crash
  the view hosting them.

### Refresh after resolution

The conflict resolution workflow being deprecated stages resolutions without
publishing a repository mutation, so nothing on the backend would invalidate the
queue. The provider therefore rescans whenever RepoContext's legacy
`conflictedFiles` list changes. Remove that bridge when that workflow is
replaced with one that publishes mutations.

## Presentation rules

- Rows show the **filename only**; the tooltip and accessible name carry what
  happened, any limitation, and the full path.
- Files the app can't open (images, binaries, submodules, symlinks, oversized or
  non-UTF-8 files) stay listed and clickable, de-emphasized, and lead to the
  whole-file choice.
- Wording follows [User-Facing Terminology](../../../product/User-Facing%20Terminology.md) — no git vocabulary.
- A failed scan shows an inline warning and keeps the last good list.

## Click behaviour

A row opens the combine-changes modal, today's conflict resolver.
`ExplorerView.handleOpenConflict` is the single swap point for the standalone
resolver that will replace it.

---

**Related:** [ConflictQueueService](../../backend/services/ConflictQueueService.md) | [Explorer Feature](Explorer%20Feature.md) | [Context Providers](../Context%20Providers.md)
