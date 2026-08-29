# ConflictQueueService

> `services/conflict_queue_service.go` — the authoritative queue of conflicted files for the open repository.

## Overview

ConflictQueueService answers one question: **which files still need a conflict decision, and what can be done with each of them?**

It is a stateful service. It holds the queue for the currently open repository, recomputes it when a git operation may have changed the unmerged set, and pushes a full snapshot to the frontend. The frontend subscribes; it never reconciles deltas and never polls.

The service does not resolve conflicts. Resolution is a separate concern, so the queue has no dependency on the resolution workflow.

## Architecture

```text
GitService operation (merge, pull, cherry-pick, revert, stash, abort, continue, …)
  → RepoEventBus.Publish(RepoMutated{repoPath, reason})
      → ConflictQueueService schedules a rescan (150ms debounce, coalesced)
          → git ls-files -u -z  →  classify  →  new snapshot (generation++)
              → Wails event `conflictQueue:changed`
```

See [[RepoEventBus]] in `services/repo_events.go` for the bus. It is a minimal in-process publish/subscribe type that exists so `GitService` does not need to know the queue exists.

## Constructor and Wiring

```go
repoEventBus := services.NewRepoEventBus()

gitService := services.NewGitService()
gitService.SetRepoEventBus(repoEventBus)

conflictQueueService := services.NewConflictQueueService()
conflictQueueService.AttachToBus(repoEventBus)
conflictQueueService.SetApp(app) // required for event emission
```

## Bound Methods

| Method | Purpose |
|--------|---------|
| `SetRepository(repoPath)` | Bind the queue to a repository, clear prior state, scan once |
| `GetConflictQueue()` | Return the current snapshot without rescanning |
| `Refresh()` | Force an immediate rescan (coalesced with any running scan) |
| `ClearRepository()` | Unbind and emit an empty snapshot |

Call `Refresh()` after any action the backend cannot observe through the bus — most notably after a file is resolved and staged by the resolution workflow.

## Snapshot Contract

```go
type ConflictQueueSnapshot struct {
    RepoPath   string               `json:"repoPath"`
    Generation uint64               `json:"generation"`
    Entries    []ConflictQueueEntry `json:"entries"`
    ScannedAt  int64                `json:"scannedAt"` // Unix milliseconds
    Error      string               `json:"error,omitempty"`
}

type ConflictQueueEntry struct {
    Path             string              `json:"path"`
    Kind             ConflictKind        `json:"kind"`
    FileKind         ConflictFileKind    `json:"fileKind"`
    Eligibility      ConflictEligibility `json:"eligibility"`
    IneligibleReason string              `json:"ineligibleReason,omitempty"`
    SizeBytes        int64               `json:"sizeBytes"`
    HasBase          bool                `json:"hasBase"`
    HasOurs          bool                `json:"hasOurs"`
    HasTheirs        bool                `json:"hasTheirs"`
}
```

### Invariants

1. An entry exists if and only if git reported the path as unmerged at scan time.
2. `Generation` increases strictly on every emitted snapshot, including error snapshots, and never resets while the process lives.
3. An error snapshot keeps the last good `Entries` and the last good `ScannedAt`, so the UI shows a warning rather than an empty queue.
4. Entries are sorted alphabetically by `Path`.
5. Snapshots are copied out. Callers cannot mutate service state.

## Classification

`services/conflict_queue_classifier.go` reads `git ls-files -u -z` and resolves every referenced blob size in a single `git cat-file --batch-check` call.

**Conflict kinds** — derived from which index stages are present:

| Stages present | Kind |
|---|---|
| base + ours + theirs | `both-modified` |
| ours + theirs | `both-added` |
| base + ours | `deleted-by-them` |
| base + theirs | `deleted-by-us` |
| ours | `added-by-us` |
| theirs | `added-by-them` |
| base | `both-deleted` |

**File kinds** — `text`, `l5x`, `image`, `binary`, `submodule`, `symlink`, `unknown`. Determined by mode first, then extension, then a bounded 8 KB content sniff of the most representative stage.

**Ineligible reasons** — `submodule`, `symlink`, `unsupported-mode`, `too-large` (over 50 MB, or an unreadable size), `image`, `binary`, `not-utf8`, `one-sided`.

Classification never parses conflict regions. Scan cost is proportional to the number of conflicted files, not repository size.

## Concurrency

- Bus-triggered rescans are debounced by 150 ms, so a burst of mutations produces one scan.
- Scans are serialized. A scan already superseded by another waiting scan is dropped instead of duplicating work.
- A scan whose repository changed while it was running is discarded.

## Non-Goals

- Resolving conflicts, or parsing conflict regions.
- Persisting the queue across restarts. Repository state is authoritative.
- Watching the filesystem, polling, or holding queues for multiple repositories. The API is shaped so these can be added later without a breaking change.

**Related:** [[GitService]] | [[FileWatcherService]] | [[Event Reference]] | [[Conflict Queue Service Plan]]
