# Conflict Queue Service Plan

> A fresh, self-contained backend service that maintains the authoritative queue of conflicted files for the open repository and pushes it to the frontend.

## Status

Implemented 2026-08-15. See [[ConflictQueueService]] for the shipped contract.

All four phases are complete: the event bus, the classifier, the queue service,
and the wiring plus documentation. The frontend queue UI described in
[[Merge and Conflict Workflow Separation Plan]] is not part of this work.

Scope is **backend only**. This plan does not modify the existing conflict
resolution workflow (`services/git_conflict_resolution.go` and its
`GitService` entry points), which is planned for deprecation. The new service
is built with no dependency on that code so it can outlive it.

It complements [[Merge and Conflict Workflow Separation Plan]], which defines
the UX-side queue. This plan defines the backend contract that plan leaves open.

## Problem

Today there is no queue. Conflict information is pull-only and fragmented:

- `GitService.GetConflictedFiles` re-runs `git status --porcelain` on demand and
  returns little more than a path.
- Every per-file check (is it text, is it too big, is it a supported mode) is
  done lazily, one file at a time, when a file is opened.
- Nothing tells the frontend that the conflict set changed. Callers must know to
  ask, so the UI can silently show a stale set after a merge, abort, or
  continue.

The result is that "what still needs a decision?" has no single owner.

## Approved Design Decisions

| Decision | Direction |
| --- | --- |
| Shape | Stateful `ConflictQueueService`, single source of truth, pushes updates. |
| Refresh trigger | Explicit invalidation only. No fsnotify, no polling. |
| Invalidation source | Small internal event bus: `GitService` publishes "repo mutated"; the queue subscribes. |
| Per-entry analysis | Classification only: conflict type, file kind, eligibility, reason, size. No segment parsing. |
| Repository scope | One queue for the currently open repository. Reset on repository change. |
| Session memory | None. The queue is a pure mirror of git's unmerged set. |
| Event payload | Full snapshot plus a generation counter. No deltas. |
| Ordering | Alphabetical by repository-relative path. |
| Failure behavior | Keep the last good snapshot and attach an error to the pushed state. |
| Concurrency | ~150 ms debounce, one rescan at a time, superseded requests dropped. |
| Placement | New files in the existing `services` package. |
| Classification code | Written fresh. No reuse of the deprecated resolution helpers. |

## Architecture

```text
GitService (merge, pull, cherry-pick, revert, rebase, stash, abort, continue)
  -> publishes RepoMutated{repoPath} on the internal event bus
       -> ConflictQueueService.invalidate()
            -> debounce ~150ms, coalesce
                 -> rescan: git ls-files -u  ->  classify each entry
                      -> new snapshot (generation++)
                           -> Wails event "conflictQueue:changed" (full snapshot)
                                -> frontend renders the queue
```

The frontend may also call `GetConflictQueue()` directly for the initial paint
or after a reload; it returns the current snapshot without forcing a rescan.

### Ownership boundary

| Concern | Owner |
| --- | --- |
| Which files are conflicted | `ConflictQueueService` |
| What kind of conflict each file has | `ConflictQueueService` |
| Whether a file is resolvable in-app | `ConflictQueueService` (classification) |
| How a file is resolved | Existing resolution workflow (untouched) |
| Operation-level continue/abort | `GitService` (untouched) |
| Telling the queue something changed | The event bus, fed by `GitService` |

## Data Contract

```go
type ConflictKind string // both-modified, both-added, added-by-us,
                         // added-by-them, deleted-by-us, deleted-by-them,
                         // both-deleted, unknown

type ConflictFileKind string // text, l5x, image, binary, submodule, symlink, unknown

type ConflictEligibility string // eligible, ineligible

type ConflictQueueEntry struct {
    Path            string              `json:"path"`
    Kind            ConflictKind        `json:"kind"`
    FileKind        ConflictFileKind    `json:"fileKind"`
    Eligibility     ConflictEligibility `json:"eligibility"`
    IneligibleReason string             `json:"ineligibleReason,omitempty"`
    SizeBytes       int64               `json:"sizeBytes"`
    HasBase         bool                `json:"hasBase"`
    HasOurs         bool                `json:"hasOurs"`
    HasTheirs       bool                `json:"hasTheirs"`
}

type ConflictQueueSnapshot struct {
    RepoPath   string               `json:"repoPath"`
    Generation uint64               `json:"generation"`
    Entries    []ConflictQueueEntry `json:"entries"`
    ScannedAt  time.Time            `json:"scannedAt"`
    Error      string               `json:"error,omitempty"`
}
```

Bound methods exposed to the frontend:

- `SetRepository(repoPath string) ConflictQueueSnapshot` — bind the queue to a
  repository, clear prior state, scan once.
- `GetConflictQueue() ConflictQueueSnapshot` — current snapshot, no rescan.
- `Refresh() ConflictQueueSnapshot` — force an immediate coalesced rescan.
- `ClearRepository()` — unbind, emit an empty snapshot.

Emitted event: `conflictQueue:changed` with a `ConflictQueueSnapshot` payload.

### Invariants

1. An entry exists if and only if git reports the path as unmerged at scan time.
2. `Generation` increases strictly on every emitted snapshot.
3. A snapshot with a non-empty `Error` carries the last good `Entries`, and its
   `ScannedAt` is the timestamp of that last good scan.
4. Entries are sorted by `Path` with a stable, byte-wise comparison.
5. No caller outside the service can mutate a snapshot; snapshots are copied out.

## Classification Rules

Source of truth is `git ls-files -u -z` (stage 1/2/3 entries) rather than
porcelain status, because it gives modes, blob IDs, and stage presence directly.

- **Conflict kind** is derived from which stages are present, matching git's own
  add/add, modify/delete, and delete/delete semantics.
- **File kind** is derived from mode first (submodule `160000`, symlink `120000`),
  then extension (`.l5x`, known image extensions), then a bounded content sniff
  of the "ours" blob (or "theirs" when "ours" is absent).
- **Eligibility** is `ineligible` with a reason for: submodules, symlinks, any
  blob over the size limit, non-UTF-8 text, and binary kinds without a dedicated
  viewer. Everything else is `eligible`.
- Classification reads blob metadata by default and only reads content up to a
  fixed sniff limit, so a rescan cost stays proportional to the number of
  conflicted files, not repository size.

## Implementation Phases

### Phase 0 — Event bus

Add a minimal in-process publish/subscribe type in `services` with a single
`RepoMutated{RepoPath}` message. Synchronous fan-out to non-blocking
subscribers. No external dependency.

Deliverables: `services/repo_events.go`, `services/repo_events_test.go`.

### Phase 1 — Classifier

Pure functions: parse `git ls-files -u -z` output, derive conflict kind, file
kind, eligibility, and size. No I/O beyond the runner and bounded blob reads.
Fully table-tested against fixtures for every conflict kind.

Deliverables: `services/conflict_queue_classifier.go` and its test file.

### Phase 2 — Queue service

State, debounce, coalescing, generation counter, error retention, snapshot
copy-out, and Wails event emission. Table-tested with a fake runner and a
controllable clock so debounce behavior is deterministic.

Deliverables: `services/conflict_queue_service.go` and its test file.

### Phase 3 — Wiring

Register the service in `main.go`, publish `RepoMutated` from the
conflict-producing `GitService` operations, and subscribe the queue.

The resolution workflow is not touched. Because it is scheduled for
deprecation, it does not publish mutations, so the frontend must call
`Refresh()` after a file is resolved and staged. Every other path — merge,
pull, sync, cherry-pick, revert, stash, checkout, commit, reset, discard,
abort, continue, and skip — updates the queue on its own.

Deliverables: `main.go` wiring, deferred publish calls on 32 `GitService`
operations, and an integration test running the real bus, `GitService`, and
queue against a conflicted repository.

### Phase 4 — Documentation

Add `docs/technical/backend/services/ConflictQueueService.md` and register the
`conflictQueue:changed` event in the events reference.

## Testing Strategy

- Fixture repositories built in `t.TempDir()` producing each conflict kind:
  both-modified, both-added, modify/delete both directions, delete/delete, plus
  a submodule, a symlink, a large blob, an image, and an `.l5x` file.
- Debounce and coalescing tests: N rapid invalidations produce exactly one scan
  and exactly one emitted snapshot.
- Failure test: a rescan that errors keeps prior entries, sets `Error`, and does
  not regress `ScannedAt`.
- Repository switch test: entries are cleared and the new repository is scanned.
  The generation never resets, per Invariant 2, so the frontend can always treat
  a lower generation as stale.
- Ordering test: entries sorted alphabetically regardless of git output order.

## Non-Goals

- Changing, wrapping, or refactoring the existing conflict resolution workflow.
- Parsing conflict regions or precomputing auto-resolvable hunks.
- Persisting the queue across restarts.
- Multi-repository queues, filesystem watching, and background polling. The API
  is shaped so these can be added later without a breaking change.

**Related:** [[Merge and Conflict Workflow Separation Plan]] | [[Text and Ladder Conflict Resolution Plan]] | [[GitService]]
