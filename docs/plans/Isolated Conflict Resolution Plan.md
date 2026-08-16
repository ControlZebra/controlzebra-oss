# Isolated Pre-Merge Conflict Readiness Action Plan

> Prepare and resolve real integration conflicts while feature development is
> still active, without changing either branch until the user chooses Finish.

## Status

Action plan, 2026-08-16. Supersedes the design-only revision of the same name.

This plan supersedes the merge-generated conflict lifecycle in
[[Merge and Conflict Workflow Separation Plan]]. That plan remains relevant to
repositories opened with an existing interrupted operation, but a merge started
by ControlZebra must no longer place the open project into an unmerged state.

It builds on the classifier delivered by [[Conflict Queue Service Plan]] and the
file-specific decision tools in [[Text and Ladder Conflict Resolution Plan]].

## Approved Decisions

These were settled before implementation planning and are not open for
rediscussion inside a phase.

| Decision | Choice |
| --- | --- |
| Deprecation strategy | Feature-flag the session path behind Developer Mode, run both paths, delete the old path in Phase 5. |
| Destination resolution | Reuse `GitService.mergeTargetRef` for v1. No new per-repo destination setting. |
| Resolver UI | Reuse `frontend/src/features/conflict` components. Swap `repoPath` for `sessionId` in the data layer only. |
| Windows verification | Manual verification checkpoints. No Windows CI in this plan. |
| Scope | Regular and squash merge, one active session per Git common repository, saved revisions only. |
| Apply primitive | Chosen from how the destination is being used, because no single command is correct for all three cases. Nothing has it checked out: `git update-ref <destinationRef> <resultOID> <destinationOID>`, a true compare-and-swap with no working files to disturb. The open project has it checked out: `git merge --ff-only <resultOID>`, which updates ref, index, and files together and refuses on its own rather than overwriting local work. Another linked worktree has it checked out: stop and report `blocked`. Proven in Phase 0 and Phase 2. |
| Destination revision | The local `refs/heads/<branch>` only. Readiness does not fetch, so a destination that exists only on the remote is not yet a destination and readiness stays silent. Revisited in Phase 4. |
| Branch after Finish | The user stays on the branch they were working on. Unlike `prepareMergeTargetBaseline`, Finish never checks out the destination. |
| Result creation primitive | `git commit-tree`. It takes explicit parents, gives exact control over regular and squash topology, and cannot run repository hooks. Proven in Phase 0. |

## Product Decision

Conflict readiness is part of feature development, not part of the Finish
workflow.

After each **Save Changes** on a feature branch, ControlZebra schedules an
authoritative integration check against that feature's destination. The check
runs a real merge in a backend-owned worktree:

1. A conflict-free result marks the feature **Ready to Finish** but changes
   neither branch.
2. A conflicting result publishes a non-blocking **Files Needing a Decision**
   queue. The user may resolve those files before choosing Finish.

Finish is always an explicit user decision. It reuses the prepared result only
after verifying that its source and destination revisions are still current.

The open project never enters a merge or unmerged state, even temporarily.
Predicted conflicts are not used as resolution items.

## Current Implementation Baseline

What exists today in `controlzebra-oss`, and what each piece becomes.

### Backend

| Existing code | Today's behavior | Disposition |
| --- | --- | --- |
| `services/conflict_queue_service.go` | Bound to the open repo. Debounced scan on `RepoEventBus`. Falls back to prediction when nothing is unmerged. Registered in `main.go` and emits `conflictQueue:changed`. | Keep for pre-existing interrupted repos. Remove the prediction fallback and `ConflictQueueSnapshot.TargetBranch`. |
| `classifyConflictQueue` in `services/conflict_queue_classifier.go` | Classifies real unmerged index entries for a repo path. | Reuse unchanged against the session workspace. This is the highest-value existing asset. |
| `predictConflictQueue` and `mergeTreeConflictRecords` | `git merge-tree --write-tree` simulation feeding the queue. | Delete in Phase 5. Explicitly forbidden as a decision source. |
| `GitService.GetMergeState` (`git_service.go:3340`) | Builds `gitDir := filepath.Join(repoPath, ".git")` and stats `MERGE_HEAD`, `SQUASH_MSG`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `BISECT_LOG`, `rebase-apply`, `index.lock`. | Not worktree-aware. Must be rewritten on `git rev-parse --git-path` before the session path reuses it. |
| `services/git_conflict_resolution.go` | `GetConflictResolutionData`, `ResolveConflictWithContent`, `ResolveConflictWithDecisions`, `resolveConflictWithStage`, all keyed on `repoPath` and gated on `GetMergeState(repoPath)`. | Keep the eligibility, token, encoding, size, mode, atomic-write, and staging logic. Re-key the public entry points on `sessionId`. |
| `GitService.StartMerge` (`3709`), `StartMergeWithOptions` (`3856`), `prepareMergeTargetBaseline` (`3627`), `CompleteMerge` (`4859`), `CompleteSquashMerge` (`4216`), `AbortMerge` (`4240`) | Mutate the open checkout and can leave it unmerged. | Replaced by the session lifecycle. Delete in Phase 5. |
| `GitService.CheckBranchConflicts` (`5134`), `GetConflictSidesInfo` (`5309`) | Preflight prediction and side labelling for the modal. | Delete in Phase 5. Readiness replaces preflight. |
| `GitService.mergeTargetRef` (`4964`) | Resolves the branch the checked-out work merges into. | Reuse as the v1 destination resolver for readiness. |
| `GitService.ListMergeReviewFiles` (`1965`), `DiffMergeReviewFileRaw` (`2039`) | Read-only two-ref review listing and diff. | Keep. Retarget at the session's captured source and destination OIDs. |
| `services/repo_events.go` | `RepoEventBus` with `RepoMutationCommit` and friends. | Reuse as the readiness trigger. Add a post-save event carrying enough identity to debounce. |
| `changeRequestRepoLocks` in `services/change_request_snapshot.go` | Per-repo `sync.Map` mutex keyed on a normalized path, case-folded on Windows. | Precedent for the repository coordinator. Generalize rather than duplicate. |
| `changeRequestRefNamespace` (`refs/controlzebra/change-requests`) | Private ref namespace outside `refs/heads`. | Precedent for `refs/controlzebra/integration/<sessionID>` holding prepared results. |
| `services/data_paths.go`, `atomic_replace_unix.go`, `atomic_replace_windows.go` | XDG-compliant local data layout and atomic file replace. | Reuse for session metadata persistence. |

### Frontend

| Existing code | Today's behavior | Disposition |
| --- | --- | --- |
| `features/conflict/context/ConflictQueueContext.tsx` | Calls `SetRepository`, `ClearRepository`, and `Refresh`, and subscribes to `conflictQueue:changed`. | The single data-layer seam. Gains a session-backed source behind the flag. |
| `features/conflict/components/modal/*` and `components/sidebar/*` | Resolver pane, text and L5X resolvers, whole-file fallback, sidebar queue. | Reuse unchanged. They must never learn about sessions. |
| `features/conflict/lib/conflict-queue-presentation.ts`, `types.ts` | Presentation mapping and decision payload helpers. | Reuse. Extend only if a new session state needs a label. |
| `features/merge/hooks/useMergeFlowController.ts` | `MergeFlowStep` of `check`, `review`, `resolve`, `complete`. Drives the live merge. | The `check` and `resolve` steps disappear. Replaced by a readiness hook. |
| `features/merge/components/ExplorerMergeModal.tsx`, `modal/MergeReviewPane.tsx`, `modal/TargetBranchDrawer.tsx`, `MergeReviewDiffModal.tsx` | Blocking merge modal with preflight and in-modal resolution. | Reduced to a Finish confirmation plus read-only review. Blocking resolution removed. |
| `features/explorer/pages/MergeRequestScreen.tsx` | Explorer sub-screen for the merge state. | Becomes the Ready to Finish and Needs Decisions surface. |
| `domain/repo/context/RepoContext.tsx` and `.types.ts` | Holds merge state, conflicted files, and merge actions. | Merge-state fields shrink to interrupted-repo recovery only. |
| `context/LayoutContext.tsx` `developerModeEnabled`, `services/settings_service.go` `AppSettings.DeveloperModeEnabled` | Existing Developer Mode flag with settings persistence. | The gate for the session path through Phase 4. |

### Confirmed Gaps

No existing code provides any of the following. All are net new.

- Linked-worktree creation, ownership locking, or lifecycle.
- Worktree-aware resolution of Git administrative paths.
- A repository coordinator shared across services that mutate refs.
- Persisted, restartable session state and startup reconciliation.
- Result creation that bypasses project-controlled commit hooks.
- A guarded application sequence for a checked-out destination.

## Deprecation Strategy

The old and new paths coexist from Phase 2 through Phase 4.

- Gate every session-path entry point on `AppSettings.DeveloperModeEnabled`,
  read through `useLayout().developerModeEnabled` on the frontend and through
  `SettingsService` on the backend.
- With the flag off, behavior is byte-for-byte today's behavior.
- With the flag on, `ExplorerMergeModal` never starts a live merge, and
  `ConflictQueueContext` reads from the session snapshot.
- No shared mutable state between the two paths. The session service must not
  write to `ConflictQueueService`, and vice versa.
- Phase 5 deletes the old path, removes the flag from this feature, and leaves
  Developer Mode itself in place for other tools.

Deletion order in Phase 5 matters: remove frontend callers first, regenerate
bindings, confirm nothing else fails to build, then remove Go methods.

## Architecture

```text
Save Changes on feature branch
  -> debounce and schedule readiness check
       -> capture source OID, destination ref/OID, and finish mode
            -> replace any older session for the same repository
                 -> create detached worktree at destination OID
                      -> run a real merge against source OID
                           -> no conflicts
                                -> persist prepared result
                                     -> show Ready to Finish
                           -> conflicts
                                -> publish non-blocking decision queue
                                     -> stage decisions in session workspace
                                          -> persist prepared result
                                               -> show Ready to Finish

Explicit Finish action
  -> verify prepared source and destination are still current
       -> validate destination checkout
            -> apply prepared result
                 -> refresh project and clean up
```

The temporary worktree is detached at the captured destination OID. The source
is also resolved to an immutable OID before execution. This preserves the
meaning of current and incoming versions even if branch names move later.

A worktree is preferred over a temporary index because text, ladder, image, and
future external-tool workflows need materialized files and normal Git conflict
stages. Although the operation is real, its result stays unreachable from the
source and destination branches until Finish succeeds.

## Readiness Semantics

Readiness is always scoped to this immutable tuple:

```text
(repositoryCommonDir, sourceOID, destinationRef, destinationOID, mergeMode)
```

The result answers one question: can this exact saved feature revision be
finished against this exact destination revision using the selected mode?

It excludes unsaved working-file edits. It is not a prediction based on path
overlap or `git merge-tree` output. It is the materialized outcome of the same
integration that Finish would otherwise run.

Any source or destination revision change invalidates the result. ControlZebra
replaces it with a fresh session after the next eligible trigger. The first
release does not reuse decisions from an invalidated session.

## Session Model

```text
sessionID
repositoryCommonDir
openProjectPath
workspacePath
operationKind
mergeMode
sourceRef
destinationRef
destinationOID
sourceOID
resultOID
state
generation
createdAt
updatedAt
```

`sessionID` is opaque and unguessable. Frontend APIs accept the session ID and
repository-relative file paths only. Temporary workspace paths never cross the
Wails boundary.

Repository identity is the canonical path from `git rev-parse --git-common-dir`,
not the caller's worktree path. This identity enforces the one-session limit
across linked worktrees and coordinates repository mutations.

Session metadata is written atomically under ControlZebra's local data directory
with restrictive permissions. The worktree is locked with an ownership reason so
ordinary pruning cannot remove an active review. Replaced sessions are marked
obsolete before workspace cleanup begins.

## Session Lifecycle

```text
scheduled -> preparing
  -> needs-decisions -> ready
  -> ready -> applying -> completed
  -> blocked -> applying | obsolete | cancelled
  -> obsolete -> cleaning
  -> failed -> scheduled | cancelled
```

`needs-decisions` exposes the non-blocking Conflict Review queue. `ready` means
the captured source and destination have a prepared result, but neither branch
has changed. `blocked` means the result is still current but the checkout is
temporarily unsafe to update. `obsolete` means a newer source or destination
requires a fresh session.

Cancellation is idempotent and never moves either ref.

## Finish Protocol

Finish consumes an already prepared result. An atomic ref update alone is not
valid for a destination checked out in the open project: it moves `HEAD` without
updating files or the index. Finish is a persisted, restartable protocol.

1. Verify the session is ready, has no unresolved queue entries, and has a
   persisted prepared result.
2. Verify the source ref still equals `sourceOID` and the destination ref still
   equals `destinationOID`.
3. Transition to `applying` without rebuilding the merge.
4. Acquire the repository coordinator and enumerate linked worktrees with
   `git worktree list --porcelain`.
5. Repeat OID validation while the coordinator is held, using compare-and-swap
   semantics for destination advancement.
6. Verify the destination checkout has no staged, unstaged, or untracked work
   the update could overwrite.
7. If another linked worktree owns the destination, stop without changing it.
8. Update the destination ref, index, and files through a guarded Git operation
   appropriate to the checkout that owns the destination.
9. Verify the destination ref, index, files, and expected result before marking
   the session `completed`.
10. Publish repository mutations, refresh the open project, and remove the
    temporary worktree idempotently.

Guarantees: compare-and-swap destination advancement, no silent overwrite of
local work, a persisted result before mutation begins, recovery at every
checkpoint, and cleanup only after verification. Direct `update-ref` against a
checked-out destination is forbidden.

## Refresh, Obsolete, And Blocked Reviews

If the source or destination no longer matches its captured OID, the old session
becomes `obsolete` and a fresh check is scheduled from the newest saved
revisions. Existing decisions are not reused. The user is told:

> Your saved work changed, so Conflict Review was refreshed. Review the latest
> files before finishing.

If unsaved, staged, or untracked work blocks Finish without moving either ref,
the result remains recoverable. The user is told what to save, move, or discard.
ControlZebra does not stash, discard, or overwrite that work.

---

# Phased Actions

Each phase lists targeted, verifiable actions against real files. A phase is
done only when its exit criteria pass.

## Phase 0 - Contract And Git Harness

Goal: prove the risky Git mechanics before any service code depends on them.

### Actions

- [x] Add a `newLinkedWorktreeRepo(t)` helper producing a repo with a checked-out
      destination and at least one linked worktree. It lives in
      `services/integration_git_harness_test.go` rather than
      `services/git_service_test.go`, and builds every scenario in code, so no
      `services/testdata/integration/` fixture directory was needed.
- [x] Add `services/integration_git_harness_test.go` proving, against real Git:
  - [x] `git worktree add --detach <workspace> <destinationOID>` plus
        `git -C <workspace> merge --no-commit --no-ff <sourceOID>` yields the
        expected unmerged index for a conflicting pair.
  - [x] Regular-mode result creation produces two parents in the expected order.
  - [x] Squash-mode result creation produces one parent and matches the tree of
        the equivalent `git merge --squash` outcome.
  - [x] Result creation runs with hooks disabled and does not execute a
        repository `pre-commit` or `commit-msg` hook planted by the fixture.
  - [x] The prepared result is unreachable from `refs/heads/*` until applied.
- [x] Add `services/integration_apply_test.go` proving the guarded application
      sequence against a destination that is checked out in the open project:
      ref, index, and working files all match the result afterwards. The
      primitive is `git merge --ff-only <resultOID>` run in the worktree that
      owns the destination.
- [x] Prove application refuses and reports `blocked` when the destination
      checkout has staged, unstaged, or untracked work at an affected path.
- [x] Prove application refuses when another linked worktree owns the
      destination.
- [x] Add interruption tests. Nothing is persisted until Phase 2, so Phase 0
      proves the Git-level invariant only: stopping after any step of the apply
      sequence, and a stale `index.lock`, leaves the destination fully applied or
      fully unapplied, never half-applied, and re-running converges. Recovery
      across persisted `applying` checkpoints is a Phase 2 test.
- [x] Write the user-facing outcome string for each of `scheduled`, `preparing`,
      `needs-decisions`, `ready`, `blocked`, `obsolete`, `failed`, `cancelled`,
      and `recovered`, following
      `.github/skills/user-facing-language/SKILL.md`. Two parts: what happened,
      then a concrete next step. No Git jargon. They live in
      `services/integration_session_messages_test.go` with tests enforcing both
      rules, so Phase 0 writes no production code. Phase 2 moves them into the
      service.
- [x] Record a manual Windows verification checklist in
      `docs/technical/testing/Isolated-Integration-Manual-Checks.md` covering
      linked worktrees, long paths, antivirus file locks, and interrupted
      application. Windows is manual-only.

### Exit Criteria

- [x] Every harness test passes on macOS via
      `go test ./services/... -run Integration -v`.
- [ ] The Windows checklist has been executed once manually and its results
      recorded in the document.
- [x] No service code has been written yet.

## Phase 1 - Worktree-Aware Foundations

Goal: remove `.git` path assumptions and add identity, coordination, and
persistence primitives.

### Actions

Delivered in two passes. Pass A is the worktree-aware foundation, Pass B is
session persistence and the workspace lifecycle.

#### Pass A - worktree-aware foundation

- [x] Add `services/git_admin_paths.go` with helpers wrapping
      `git rev-parse --path-format=absolute --git-path <name>`,
      `--git-common-dir`, and `--git-dir`, each returning an error rather than
      guessing. One `rev-parse` call resolves many names in order, so callers pay
      for one subprocess, not one per name.
- [x] Rewrite `GitService.GetMergeState` to use those helpers instead of
      `filepath.Join(repoPath, ".git")`. It now resolves all fourteen names in a
      single call and returns an empty state when the path is not a repository.
- [x] Audit every remaining `.git` string literal in `services/`. All seven
      sites in `git_service.go` were converted: `GetMergeState`, `AbortMerge`'s
      `SQUASH_MSG` cleanup, `GetBisectState`, `RemoveStaleLock`,
      `RemoveAllStaleLocks`, `CheckLockFile`, and `RemoveLockFile`. All fourteen
      sites in `repository_settings_service.go` were converted too, across
      `DiagnoseRepository` and `RemoveStaleLocks`. That file mattered more than
      it first appeared: git routes `HEAD.lock` to the worktree-specific
      directory while `config.lock` and `refs/heads` stay in the common one, so
      the old single `.git` join was wrong for every one of them from a linked
      worktree. Deliberately left untouched:
  - `git_service.go:87` in `DetectRepo` only tests `.git` for existence, and in a
    linked worktree `.git` is a file, so `os.Stat` still succeeds. Correct by
    accident, but correct.
  - `github_service.go` `.git` handling, which trims clone URLs and never
    touches the filesystem.
  - `RemoveStaleLocks` still globs `refs/heads/*.lock` at a single level, so a
    lock for a slash-named branch such as `feature/valve-timing` is missed. A
    pre-existing gap, unrelated to worktree awareness, left as-is on purpose.
- [x] Add `services/repo_identity.go` with a canonical common-directory identity
      function. It resolves symlinks so two routes to one repository agree, folds
      case on Windows, and caches per caller path because a repository never
      changes its common directory.
- [x] Add `services/repo_coordinator.go` generalizing `changeRequestRepoLocks`
      into a shared coordinator keyed on common-directory identity. Migrated
      `change_request_snapshot.go` to it so there is one lock table, not two.
      `lockChangeRequestRepo` survives as a thin wrapper, so its eight call sites
      are unchanged. Identity resolution failures fall back to the cleaned path
      key, so a git failure narrows the guarantee instead of skipping the lock.
      The coordinator serializes short start, apply, and cancel transitions only,
      never a human review period.

#### Pass B - persistence and workspace lifecycle

- [x] Add `services/integration_session_store.go` with atomic persistence under
      `data_paths.go`, restrictive permissions, `atomic_replace_*.go` for writes,
      and a schema version field. `DataLocations` gained `IntegrationDir`.
      Session ids are 128 bits of randomness, validated as hex before ever being
      used in a path. One unreadable or future-schema record is skipped rather
      than failing the whole listing, so a single corrupt file cannot hide every
      other active review.
- [x] Add `services/integration_session_workspace.go` owning detached worktree
      creation, `git worktree lock` with an ownership reason, ownership-marker
      validation, and idempotent removal that tolerates missing directories and
      retries Windows file-lock failures. `git worktree prune` is never used.
      The ownership marker lives in the worktree's administrative directory,
      outside the working tree, so it never appears as untracked content that
      could be swept into a resolution.
- [x] Add startup reconciliation in
      `services/integration_session_reconcile.go` that pairs persisted sessions
      with real worktrees and refs. A missing workspace, an unowned workspace, or
      a vanished result produces a persisted `failed` state with a plain-English
      reason. It never moves a ref.
- [x] Define and enforce preflight gates before materializing project content.
      Implemented as `checkIntegrationPreflight`:
  - Disk space: `git ls-tree -r -l -z` sums the destination tree, and creation
    requires twice that plus a 256 MB floor.
  - Windows path budget: the longest repo-relative path plus the workspace root
    must stay under `MAX_PATH`, enforced only when `core.longpaths` is off.
  - LFS: the workspace is created with the LFS smudge and process filters
    disabled via `-c`, so preparation stays fast on large projects.
  - Custom filters: left alone, so a resolved file matches the user's real
    working file.
  - Submodules: detected and recorded, never initialized or updated.

### Exit Criteria

- [x] `go test ./services/...` passes, including existing merge-state tests.
- [x] `GetMergeState` returns correct results inside a linked worktree.
- [x] Creating and cancelling a session leaves no worktree, no lock, no metadata
      file, and no ref behind.
- [x] Cancelling twice is a no-op the second time.

## Phase 2 - Isolated Readiness And Safe Finish

Goal: the backend can prepare and apply a result. No UI yet.

### Actions

- [x] Add `services/integration_session_service.go` with the service struct,
      `NewIntegrationSessionService(git *GitService)`, and `SetApp`. The
      constructor takes the `integrationMergeTarget` seam rather than the
      concrete type, matching `ConflictQueueService`, so the service is testable
      without a live repository. The Phase 0 outcome strings moved here from
      `integration_session_messages_test.go`, which kept its two rules as tests
      against the production map.
- [x] Register it in `main.go` next to `conflictQueueService`: construct it,
      give it the `repoEventBus`, add it to `Services`, call `SetApp` after
      `application.New`, and kick off `RecoverSessions` on a goroutine so an
      unfinished review from a previous run is reconciled before the user can
      act on it.
- [x] Capture the immutable tuple on session creation. The destination comes
      from `GitService.mergeTargetRef`, but only its branch name: that method
      prefers the remote-tracking ref, and Finish can only update a local
      branch. Readiness therefore captures `refs/heads/<branch>` and stays
      silent when no local branch exists.
- [x] Implement preparation: create the detached worktree, run the mode-specific
      merge with `--no-commit`, and classify the outcome with the existing
      `classifyConflictQueue`. Work already contained in the destination
      short-circuits to `ready` with the destination as its own result, so a
      no-op integration never creates an empty merge commit.
- [x] Implement result creation with hooks disabled, writing the result to
      `refs/controlzebra/integration/<sessionID>`, mirroring the private
      namespace pattern of `changeRequestRefNamespace`.
- [x] Implement the ten-step Finish protocol using the sequence proven in
      Phase 0. The prepared result is reused; the merge is never re-run. Steps 2
      and 5 both validate revisions on purpose: step 2 avoids taking the
      coordinator pointlessly, step 5 closes the race once it is held.
- [x] Implement `blocked` detection and its recovery path. A refusal keeps the
      prepared result, so Finish can simply be chosen again once the user has
      dealt with whatever was in the way.
- [x] Implement session replacement: mark the old session obsolete before
      cleanup, and drop late results by session ID and generation.
- [x] Publish repository mutations through `RepoEventBus` after a successful
      Finish so `ConflictQueueService` and the file watcher refresh. Both the
      open project and the working copy that owns the destination are announced.
- [x] Enforce one in-flight preparation per common repository.
- [x] Add `services/integration_session_service_test.go` covering create,
      prepare, conflict-free ready, conflicting needs-decisions, obsolete
      replacement, blocked, cancel, apply, and restart reconciliation. Both
      reachable apply paths are covered: destination checked out nowhere, and
      destination checked out in the open project after the user switched to it.

### Exit Criteria

- [x] A conflict-free readiness check reaches `ready` and changes no ref.
- [x] Finish applies the prepared result and the destination checkout's files,
      index, and ref all agree.
- [x] Every Phase 0 checked-out-destination assertion still holds when driven
      through the service rather than the harness.
- [x] Do not start Phase 3 until this exit criterion passes.

## Phase 3 - Session Queue And Resolution

Goal: route existing conflict tooling at the session workspace.

### Actions

- [ ] Add `SessionConflictSnapshot` to the session service:

  ```go
  type SessionConflictSnapshot struct {
      SessionID  string               `json:"sessionId"`
      Generation uint64               `json:"generation"`
      Entries    []ConflictQueueEntry `json:"entries"`
      ScannedAt  int64                `json:"scannedAt"`
      Error      string               `json:"error,omitempty"`
  }
  ```

- [ ] Emit an `integrationSession:conflicts` event carrying that snapshot. Do not
      reuse `conflictQueue:changed`, and do not rebind `ConflictQueueService` to
      the session workspace.
- [ ] Call `classifyConflictQueue` from
      `services/conflict_queue_classifier.go` against the session workspace,
      unchanged. Never call `predictConflictQueue` from the session path.
- [ ] Add session-keyed resolution entry points that resolve the workspace on the
      backend, verify the requested relative path is in the current session
      queue, and delegate to the existing helpers in
      `services/git_conflict_resolution.go`:
  - [ ] `GetSessionConflictResolutionData(sessionID, relPath)`
  - [ ] `ResolveSessionConflictWithDecisions(sessionID, relPath, token, decisions)`
  - [ ] `ResolveSessionConflictWithContent(sessionID, relPath, token, content)`
  - [ ] `ResolveSessionConflictWithSide(sessionID, relPath, side)`
- [ ] Refactor `GetConflictResolutionData` so its merge-state gate is a parameter
      rather than a hard-coded `g.GetMergeState(repoPath)` call. The session path
      is already known to be mid-merge.
- [ ] Preserve every existing protection: stale resolution tokens, path safety
      via `safeRepoRelativePath`, encoding, size limit, file mode, atomic write,
      and index staging.
- [ ] Ignore late events whose session ID or generation does not match the active
      session.
- [ ] Require an empty real-conflict queue before result creation.
- [ ] Do not reuse decisions from an obsolete session in this release.
- [ ] Regenerate bindings with `task common:generate:bindings`.

### Exit Criteria

- [ ] Text, ladder, and whole-file decisions all stage correctly in the session
      workspace and never touch the open project.
- [ ] No frontend API accepts or receives a filesystem path outside the open
      repository.
- [ ] A stale token is rejected with the existing error, unchanged.

## Phase 4 - Background Readiness Workflow

Goal: the user-visible workflow, behind Developer Mode.

### Actions

- [ ] Emit a post-save repository event from the Save Changes path carrying
      repository identity, so the session service can debounce and schedule.
      Extend `RepoMutationCommit` handling in `services/repo_events.go` rather
      than adding a parallel bus.
- [ ] Implement debounced scheduling in the session service. Coalesce a burst of
      saves into one preparation. Mirror the debounce approach already used by
      `ConflictQueueService.scheduleScan`.
- [ ] Add
      `frontend/src/features/integration/context/IntegrationSessionContext.tsx`
      holding session state, subscribing to `integrationSession:conflicts`, and
      exposing `finish`, `cancelReview`, and `refresh`.
- [ ] Add a source switch inside
      `frontend/src/features/conflict/context/ConflictQueueContext.tsx`: when
      `useLayout().developerModeEnabled` is true, read entries from the session
      context instead of `SetRepository` and `Refresh`. This is the only conflict
      file that changes.
- [ ] Leave every component under `features/conflict/components/` unchanged. They
      must not learn about sessions.
- [ ] Update `frontend/src/features/explorer/pages/MergeRequestScreen.tsx` to
      render Ready to Finish, Files Needing a Decision, blocked, and obsolete
      states without navigating the user away from current work.
- [ ] Reduce `frontend/src/features/merge/components/ExplorerMergeModal.tsx`
      under the flag to a Finish confirmation. Remove the preflight check step
      and the in-modal blocking resolution step.
- [ ] Trim `MergeFlowStep` in
      `frontend/src/features/merge/hooks/useMergeFlowController.ts` under the
      flag: `check` and `resolve` no longer apply.
- [ ] Retarget `MergeReviewPane` and `MergeReviewDiffModal` at the session's
      captured source and destination OIDs so review shows exactly what Finish
      will apply.
- [ ] Add the refresh notice shown when a new saved revision discards prior
      decisions.
- [ ] Add the Cancel Review confirmation that states decisions will be deleted
      and that neither branch changes.
- [ ] Hide predicted entries entirely when the flag is on.
- [ ] Add tests: `IntegrationSessionContext.test.tsx`, an updated
      `ConflictQueueContext.test.tsx` covering both sources, and an updated
      `ExplorerMergeModal.test.tsx` for the reduced flow.

### Exit Criteria

- [ ] With Developer Mode off, behavior is unchanged and all existing frontend
      tests pass untouched.
- [ ] With Developer Mode on, saving on a feature branch produces a readiness
      result without blocking the user.
- [ ] The open project stays editable while decisions are pending.
- [ ] Restart and project switching preserve an active review.

## Phase 5 - Deprecation, Migration, And Hardening

Goal: one path. Delete the old one.

### Actions - Frontend First

- [ ] Remove the Developer Mode gate for this feature and make the session path
      unconditional. Leave Developer Mode itself in place for other tools.
- [ ] Delete the live-merge branches from `useMergeFlowController.ts`,
      `ExplorerMergeModal.tsx`, and `TargetBranchDrawer.tsx`.
- [ ] Remove merge-state and conflicted-file fields from
      `frontend/src/domain/repo/context/RepoContext.tsx` and
      `RepoContext.types.ts` that only the old flow consumed. Keep what the
      interrupted-repo recovery banner needs.
- [ ] Remove the dual source from `ConflictQueueContext.tsx`, leaving only the
      session source plus the interrupted-repo source.

### Actions - Backend Second

- [ ] Delete `predictConflictQueue` and `mergeTreeConflictRecords` from
      `services/conflict_queue_classifier.go`, the `predict` call site and the
      `conflictQueueMergeTarget` seam in `services/conflict_queue_service.go`,
      and `TargetBranch` from `ConflictQueueSnapshot`.
- [ ] Delete `ConflictStatePredicted` and any presentation handling for it in
      `frontend/src/features/conflict/lib/conflict-queue-presentation.ts`.
- [ ] Delete `GitService.StartMerge`, `StartMergeWithOptions`,
      `prepareMergeTargetBaseline`, `CompleteMerge`, `CompleteSquashMerge`,
      `AbortMerge`, `CheckBranchConflicts`, and `GetConflictSidesInfo`.
- [ ] Delete the repo-keyed public conflict resolution entry points once the
      session-keyed ones are the only callers. Keep every internal helper.
- [ ] Keep `AbortCurrentOperation` and the recovery path for repositories opened
      with a pre-existing interrupted Git operation. That migration is out of
      scope.
- [ ] Regenerate bindings with `task common:generate:bindings` and confirm the
      frontend build has no unresolved imports.

### Actions - Hardening

- [ ] Exercise LFS-tracked files, custom clean and smudge filters, submodules,
      files above the 50 MB classifier limit, disk exhaustion, long Windows
      paths, antivirus locks, project switching, and application restart.
- [ ] Run the Phase 0 Windows manual checklist again and record results.
- [ ] Add `docs/technical/backend/services/IntegrationSessionService.md`, and
      update `GIT_WORKFLOWS.md`, the `ConflictQueueService` document, and
      `docs/plans/summary/PLANS_SUMMARY.md`.
- [ ] Mark [[Merge and Conflict Workflow Separation Plan]] as superseded except
      for its interrupted-repository recovery scope.

### Exit Criteria

- [ ] No code path can leave the open project unmerged as a result of a
      ControlZebra-initiated merge.
- [ ] `grep -rn "predictConflictQueue\|StartMergeWithOptions" services frontend`
      returns nothing.
- [ ] `go test ./services/...` and `cd frontend && npm test` both pass.

## Acceptance Criteria

- Save Changes schedules a readiness check for the feature's destination without
  blocking continued work.
- A readiness check never leaves the open project unmerged.
- A conflicting check creates one non-blocking, resumable Conflict Review.
- A conflict-free check marks the feature Ready to Finish and applies nothing.
- Regular and squash results have the expected parent topology and content.
- Current and incoming labels retain their existing meaning.
- The open project remains usable while decisions are pending.
- Unsaved files are excluded from readiness.
- Any source or destination ref change invalidates the prepared result and
  schedules a fresh check.
- Decisions from an obsolete review are not reused in the first release.
- Local staged, unstaged, and untracked work is never overwritten.
- Cancelling deletes the isolated result and leaves both branches unchanged.
- Only explicit Finish may apply a prepared result.
- Finish reuses the valid prepared result instead of rerunning the merge.
- Restart and project switching preserve an active review.
- Session paths are never accepted from or exposed to the frontend.
- No predicted conflict appears as an active decision item.
- Linked-worktree behavior passes on macOS and on the manual Windows checklist.
- Recovery is tested at every persisted `applying` checkpoint.

## Non-Goals

- Eliminating Git's internal unmerged state inside the isolated workspace.
- Reimplementing Git's merge engine.
- Reusing decisions from an obsolete review.
- Including unsaved working-file edits in readiness.
- Applying a conflict-free result before the user chooses Finish.
- Supporting multiple active reviews for one common repository.
- Silently stashing, discarding, or overwriting open project files.
- Migrating Sync or every pre-existing interrupted-operation workflow.
- Replacing existing conflict classifiers or file viewers.
- Using conflict prediction as the resolution foundation.
- Adding Windows CI.

## Open Questions

Answer before the phase that needs them, not before starting.

1. ~~Phase 1: where does the session worktree live?~~ Answered: under
   `DataLocations.LocalDataDir` in an `integration/` subdirectory, so
   `%LOCALAPPDATA%\ControlZebra\integration\` and
   `~/Library/Caches/ControlZebra/integration/`. The macOS cache directory can be
   cleared by the OS, and that risk is accepted: startup reconciliation already
   has to treat a missing workspace as a recoverable failure, so a purge lands on
   a path that must work anyway.
2. ~~Phase 2: on a fresh clone with no upstream, `mergeTargetRef` may report not
   ok. Does readiness stay silent, or does the UI prompt once for a
   destination?~~ Answered: readiness stays silent and creates no session.
   Nothing has gone wrong when there is no local destination branch, and
   prompting on a fresh clone would be noise. Phase 4 may add an affordance if
   real usage shows one is needed.
3. Phase 4: how long may a preparation run before the UI reports progress rather
   than staying silent? Large LFS repositories will exceed the 30-second
   `CommandRunner` default and need an explicit timeout, as
   `changeRequestFetchTimeout` already does.
4. Phase 5: should Finish reuse `ProgressService` for streaming progress, or is a
   session state transition enough?

**Related:** [[Conflict Queue Service Plan]] | [[Conflict Queue Sidebar Plan]] |
[[Merge and Conflict Workflow Separation Plan]] |
[[Text and Ladder Conflict Resolution Plan]]
