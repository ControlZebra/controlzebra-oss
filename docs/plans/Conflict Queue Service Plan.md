# Conflict Queue Service Plan

> A fresh, self-contained backend service that maintains the authoritative queue of conflicted files for the open repository and pushes it to the frontend.

## Status

Implemented 2026-08-15. See [[ConflictQueueService]] for the shipped contract,
which is authoritative where this plan and the code disagree.

All four phases are complete: the event bus, the classifier, the queue service,
and the wiring plus documentation. The frontend queue UI described in
[[Merge and Conflict Workflow Separation Plan]] is not part of this work; the
sidebar that consumes this service shipped separately under
[[Conflict Queue Sidebar Plan]].

This document has been reconciled with the code as of 2026-08-16. Where the
implementation went beyond the approved design, the change is called out in
[[#Deviations from the original design]].

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
| Refresh trigger | Explicit invalidation only. No polling. |
| Invalidation source | Small internal event bus. `GitService`, `ProgressService`, and `FileWatcherService` publish "repo mutated"; the queue subscribes. |
| Per-entry analysis | Classification only: conflict type, file kind, eligibility, reason, size. No segment parsing. |
| Repository scope | One queue for the currently open repository. Reset on repository change. |
| Session memory | None. The queue is a mirror of git's unmerged set, plus the predicted set when nothing is unmerged. |
| Event payload | Full snapshot plus a generation counter. No deltas. |
| Ordering | Alphabetical by repository-relative path. |
| Failure behavior | Keep the last good snapshot and attach an error to the pushed state. |
| Concurrency | ~150 ms debounce, one rescan at a time, superseded requests dropped. |
| Placement | New files in the existing `services` package. |
| Classification code | Written fresh. No reuse of the deprecated resolution helpers. |

## Architecture

```text
GitService / ProgressService (merge, pull, cherry-pick, revert, stash, commit,
  checkout, abort, continue) and FileWatcherService (working-tree edits)
  -> publish RepoMutated{repoPath, reason} on the internal event bus
       -> ConflictQueueService.scheduleScan(reason)
            -> debounce 150ms, coalesce, one scan at a time
                 -> rescan: git ls-files -u  ->  classify each entry
                      -> if nothing unmerged and reason != working-tree:
                           git merge-tree --write-tree  ->  predicted entries
                      -> new snapshot (generation++)
                           -> Wails event "conflictQueue:changed" (full snapshot)
                                -> frontend renders the queue
```

Background rescans emit only when the classified set, target branch, or error
actually changed, so a busy file watcher does not churn the UI. Scans requested
directly through `SetRepository` or `Refresh` always emit.

The frontend may also call `GetConflictQueue()` directly for the initial paint
or after a reload; it returns the current snapshot without forcing a rescan.

### Ownership boundary

| Concern | Owner |
| --- | --- |
| Which files are conflicted | `ConflictQueueService` |
| Which files a pending merge will conflict on | `ConflictQueueService` |
| Which branch that merge targets | `GitService`, via the `conflictQueueMergeTarget` seam |
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

type ConflictState string // active, predicted

type ConflictQueueEntry struct {
    Path            string              `json:"path"`
    State           ConflictState       `json:"state"`
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
    RepoPath     string               `json:"repoPath"`
    Generation   uint64               `json:"generation"`
    Entries      []ConflictQueueEntry `json:"entries"`
    TargetBranch string               `json:"targetBranch,omitempty"`
    ScannedAt    int64                `json:"scannedAt"`
    Error        string               `json:"error,omitempty"`
}
```

`ScannedAt` is Unix milliseconds rather than `time.Time`, so the generated
TypeScript binding is a plain number. `TargetBranch` is set only for predicted
snapshots; it is empty when the entries are active conflicts.

Bound methods exposed to the frontend:

- `SetRepository(repoPath string) ConflictQueueSnapshot` — bind the queue to a
  repository, clear prior state, scan once.
- `GetConflictQueue() ConflictQueueSnapshot` — current snapshot, no rescan.
- `Refresh() ConflictQueueSnapshot` — force an immediate coalesced rescan.
- `ClearRepository() ConflictQueueSnapshot` — unbind, emit and return an empty
  snapshot.

Non-bound wiring methods: `SetApp`, `AttachToBus`, `DetachFromBus`.

Emitted event: `conflictQueue:changed` with a `ConflictQueueSnapshot` payload.

### Invariants

1. An `active` entry exists if and only if git reports the path as unmerged at
   scan time. A snapshot is either entirely active or entirely predicted;
   prediction runs only when the unmerged set is empty.
2. `Generation` increases strictly on every emitted snapshot.
3. A snapshot with a non-empty `Error` carries the last good `Entries`, and its
   `ScannedAt` is the timestamp of that last good scan.
4. Entries are sorted by `Path` with a stable, byte-wise comparison.
5. No caller outside the service can mutate a snapshot; snapshots are copied out.
6. A scan whose repository changed while it was running is discarded rather
   than applied to the new repository.

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
- Classification reads blob metadata by default and only reads content up to an
  8 KB sniff limit, so a rescan cost stays proportional to the number of
  conflicted files, not repository size. The size limit for eligibility is
  50 MB.

### Prediction

When the index holds nothing unmerged, the queue runs
`git merge-tree --write-tree -z <targetRef> HEAD` — the same simulation the
guided merge preflight uses — and classifies whatever that merge would leave
unmerged, tagging each entry `predicted`. Exit code 1 means conflicts; any
other non-zero exit is a scan error.

Prediction is skipped when the triggering reason is `working-tree`, because the
simulation compares commits and a working-tree edit cannot change its answer.
It is also skipped when no merge target can be resolved.

## Implementation Phases

### Phase 0 — Event bus

Add a minimal in-process publish/subscribe type in `services` with a single
`RepoMutated{RepoPath, Reason}` message. Synchronous fan-out to non-blocking
subscribers, with panics contained so one subscriber cannot break delivery to
the others. No external dependency.

`Reason` is a `RepoMutationReason`: `merge`, `pull`, `cherry-pick`, `revert`,
`rebase`, `stash`, `abort`, `continue`, `commit`, `checkout`, `working-tree`,
or `other`. It exists so subscribers can skip commit-level work for a change
that only touched files on disk.

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
conflict-producing operations, and subscribe the queue.

The resolution workflow is not touched. Because it is scheduled for
deprecation, it does not publish mutations, so the frontend must call
`Refresh()` after a file is resolved and staged. Every other path — merge,
pull, sync, cherry-pick, revert, stash, checkout, commit, reset, discard,
abort, continue, and skip — updates the queue on its own.

Deliverables: `main.go` wiring (bus construction, `SetRepoEventBus` on
`GitService`, `ProgressService`, and `FileWatcherService`, `AttachToBus` and
`SetApp` on the queue, service registration), deferred publish calls on 32
`GitService` operations plus 2 `ProgressService` operations and the file
watcher's debounced emit, and an integration test running the real bus,
`GitService`, and queue against a conflicted repository.

### Phase 4 — Documentation

Add `docs/technical/backend/services/ConflictQueueService.md`, list the service
in `docs/technical/backend/Services Index.md`, and register the
`conflictQueue:changed` event in `docs/technical/reference/Event Reference.md`.

## Deviations from the original design

These shipped differently from the approved design above and are recorded here
so the delta is explicit rather than discovered.

| Area | Approved | Shipped | Why |
| --- | --- | --- | --- |
| Scope of the queue | Active conflicts only | Also predicts the next merge's conflicts when nothing is unmerged | The user needs to see a clash before starting the merge, not only mid-merge |
| Snapshot shape | No branch context | Added `TargetBranch`; entries carry `State` | The UI must say which merge predicted entries belong to |
| `ScannedAt` | `time.Time` | Unix milliseconds (`int64`) | Cleaner generated TypeScript binding |
| Invalidation | "No fsnotify" | `FileWatcherService` publishes `working-tree` mutations | The queue would otherwise go stale on manual edits; the reason tag keeps the cost down by skipping prediction |
| Bus message | `RepoMutated{RepoPath}` | Added `Reason` | Lets subscribers skip work that a given mutation cannot affect |
| Emission | Emit on every scan | Background scans emit only on a real change | Prevents watcher-driven churn in the UI |
| Publishers | `GitService` only | Also `ProgressService` and `FileWatcherService` | Progress-wrapped pull/sync bypass the plain `GitService` paths |

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
- Prediction tests: a repository with no unmerged files but a conflicting target
  branch yields `predicted` entries and a `TargetBranch`; a `working-tree`
  mutation skips prediction entirely.
- Emission test: a background scan that classifies an identical set emits
  nothing, while `Refresh` always emits.

## Non-Goals

- Changing, wrapping, or refactoring the existing conflict resolution workflow.
- Parsing conflict regions or precomputing auto-resolvable hunks.
- Persisting the queue across restarts.
- Multi-repository queues and background polling. The API is shaped so these
  can be added later without a breaking change.

**Related:** [[Merge and Conflict Workflow Separation Plan]] | [[Text and Ladder Conflict Resolution Plan]] | [[GitService]]
