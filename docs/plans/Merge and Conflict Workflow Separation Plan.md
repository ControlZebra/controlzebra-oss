# Merge and Conflict Workflow Separation Plan

> Separate merge planning, repository-wide conflict resolution, and the conflict file queue so users can resolve any live conflict without first entering a merge action.

## Status

Proposed 2026-08-15.

This plan supersedes the modal layout and queue-advancement decisions in
[[Text and Ladder Conflict Resolution Plan]]. It does not replace that plan's
backend safety contract, conflict composer, text resolver, L5X resolver, or
whole-file fallback behavior.

Implementation order:

1. Make live conflict state independent from merge planning state.
2. Add a standalone conflict resolver tab.
3. Add the repository-wide conflict queue to Next Step Advisor.
4. Remove file resolution from Merge Manager and centralize operation controls there.
5. Route every conflicted-file entry point through the standalone resolver.

## Reviewer Difficulty Assessment (Senior Engineer)

> Added during senior review. Each phase carries a difficulty rating to help
> route the work to an appropriate LLM model and to set human review depth.
> Scores are 0 (trivial) to 10 (expert-level, high blast radius).

### Rating dimensions

| Dimension | What it measures |
| --- | --- |
| Code complexity | Amount and intricacy of code to write/move: types, hooks, wiring, edge cases. |
| Reasoning | State-machine and invariant reasoning needed to keep the refactor correct. |
| Context breadth | How many files/subsystems must be held in mind at once to avoid regressions. |
| Blast radius | Risk to shipping behavior if the change is wrong (data loss, stuck states). |
| Test burden | Volume and subtlety of tests required to prove correctness. |
| Autonomy risk | Likelihood an LLM silently makes a wrong architectural call without a human. |

### Phase-by-phase scores

| Phase | Code | Reasoning | Context breadth | Blast radius | Test burden | Autonomy risk | Overall | Recommended model tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 0: Contract & regression harness | 3 | 6 | 6 | 2 | 7 | 5 | Medium | Frontier reasoning model. Getting the fixtures and invariants wrong here poisons every later phase. |
| Phase 1: Separate live conflict state | 6 | 9 | 9 | 9 | 8 | 8 | **High** | Top-tier frontier model + mandatory human review. This is the load-bearing state split. |
| Phase 2: Standalone conflict resolver tab | 6 | 6 | 7 | 7 | 6 | 6 | Medium-High | Frontier model. Component moves are mechanical, but draft/token lifetime and focus return need care. |
| Phase 3: Next Step Advisor conflict queue | 4 | 4 | 5 | 4 | 5 | 4 | Medium | Strong mid-tier model. Mostly presentational with clear rules; watch advisor precedence and a11y. |
| Phase 4: Reduce Merge Manager to its boundary | 5 | 7 | 8 | 8 | 6 | 7 | High | Frontier model + human review. Deletions here can drop operation controls for interrupted states. |
| Phase 5: Unify entry points & harden | 4 | 5 | 7 | 5 | 6 | 5 | Medium | Strong mid-tier model. Mechanical routing plus a final regression sweep across all callers. |

### Reviewer routing guidance

- Phases 1 and 4 are the two places where an LLM can quietly break a shipped
  workflow (stuck merge/cherry-pick/revert/AM states, or conflicts that can no
  longer be resolved). Do not ship these without human sign-off, regardless of
  model tier.
- Phases 3 and 5 are safe to delegate to a strong mid-tier model with the tests
  from Phase 0 in place.
- Phase 0 looks easy but is scored high on reasoning and test burden on purpose:
  the whole refactor is only as safe as the harness that guards it. Treat it as
  frontier-model work, not warm-up.
- Any phase touching `RepoContext` should be run with the backend conflict suite
  available so the model can validate assumptions instead of guessing.

### Senior review notes on the plan itself

- The plan is sound and the ownership boundary table is the strongest part.
  Keep Safety Invariant 3 (a file leaves the queue only after backend staging
  succeeds) as the primary acceptance signal for Phases 1 and 2.
- Sequence risk: Phase 4 must not start until Phase 3's queue is the *only*
  place unresolved files are listed. Removing the modal queue before the advisor
  queue is authoritative would leave a gap with no resolution surface.
- Watch the `RecoveryBanner` change in Phase 4. Repointing its destructive
  action to `Open Manager` is correct, but it is a user-visible behavior change
  for existing recovery flows and should be called out in release notes.

## Goal

Let users resolve repository conflicts regardless of how those conflicts began.
Sync, interrupted operations, and repositories opened with existing unmerged
files must expose the same conflict queue and resolver without requiring the
user to start or reopen a merge workflow.

The normal workflow should be:

```text
Conflict detected anywhere in the open project
  -> Next Step Advisor shows files that need decisions
  -> user selects one file
  -> the file opens in a main-area resolution tab
  -> user resolves or closes the file
  -> the app returns focus to the queue
  -> operation-level completion or cancellation remains in Merge Manager
```

Merge planning remains a separate workflow:

```text
Choose changes to combine
  -> run preflight
  -> review affected files
  -> start merge
  -> if conflicts occur, leave file decisions to the global queue
  -> return to Merge Manager to finish or cancel the operation
```

## Approved Product Decisions

| Decision | Direction |
| --- | --- |
| Supported conflict sources | Sync conflicts, interrupted merge/cherry-pick/revert/patch operations, and any repository already containing unmerged files. |
| Queue location | Next Step Advisor sidebar. |
| Queue visibility | Show only while unresolved conflicts exist. |
| Resolver presentation | One main-area tab per conflicted file. |
| After resolving a file | Close the resolver tab and return focus to the queue. Do not advance automatically. |
| Operation actions | Continue, Skip, Finish, and Abort remain in Merge Manager. |
| Merge workflow boundary | Branch/source selection, preflight, review, and starting the merge. |
| Direct access | Clicking a conflicted file anywhere opens the same standalone resolver tab. |
| UI persistence | Do not persist queue selection, resolver tabs, or drafts across app restart or repository changes. Repository state remains authoritative. |
| Delivery | Full refactor with focused state, component, integration, and regression tests. |

## Problem Statement

The backend already supports resolving a live conflict without starting a new
merge. The frontend currently prevents that independence in four ways:

1. `RepoContext` combines merge preflight state, live repository conflict state,
   selected-file UI state, and resolution bookkeeping.
2. File-resolution methods reconcile through `reconcileLiveMergeState()`, which
   requires merge source and target context even when the conflict came from
   Sync or another interrupted operation.
3. `ExplorerMergeModal` owns conflict-detail loading, drafts, queue selection,
   the resolver, and merge completion in one lifecycle.
4. `ConflictQueue` renders both the file list and `ConflictResolverPane`, making
   it impossible to place the queue in the sidebar without also moving the
   viewer there.

Repository opening also detects only a subset of interrupted states before
loading conflicted files. A repository opened during cherry-pick, revert, or
patch application can therefore have resolvable conflicts without populating
the frontend queue.

## Scope

### In Scope

- Repository-wide detection of live unmerged files.
- Conflict discovery after Sync and after any repository refresh that can expose an interrupted operation.
- Existing interrupted merge, cherry-pick, revert, and patch-application conflicts.
- Repositories opened while unmerged files already exist.
- A conflict-only panel in Next Step Advisor.
- One main-area resolution tab per conflicted file.
- Existing text, L5X, and whole-file conflict-resolution experiences.
- One shared action for opening a conflicted file from any UI surface.
- Merge Manager progress and operation-level controls without an embedded queue or resolver.
- Explicit focus return to the queue after successful resolution.
- Focused tests for state reconciliation, navigation, and workflow separation.

### Out Of Scope

- New conflict composition algorithms or new supported file formats.
- Persisting unfinished drafts, selected conflicts, or resolver tabs.
- Automatically opening the next unresolved file.
- Resolving preflight-only potential conflicts before an operation creates live unmerged index entries.
- Moving Continue, Skip, Finish, or Abort controls into the queue or resolver.
- Changing merge strategy, Sync strategy, or backend conflict safety rules.
- Combining ordinary read-only diff viewers with the mutating conflict resolver.
- Creating a new activity-bar destination solely for conflicts.

## Safety Invariants

1. `GetConflictedFiles` is authoritative for the current unresolved queue.
2. Potential preflight conflicts never appear in the live conflict queue.
3. A file disappears from the queue only after the backend has written or selected the result and staged it successfully.
4. Resolver drafts remain in frontend memory and are scoped to one file and one resolution token.
5. Closing a resolver tab never writes or stages its draft.
6. Repository switching clears conflict tabs and drafts immediately.
7. Resolution actions refresh repository conflict state without requiring merge-planning context.
8. Continue and Finish remain unavailable while the backend reports unresolved files.
9. Destructive operation actions retain confirmation dialogs that explain their consequences.
10. Existing backend stale-token, path, encoding, size, atomic-write, and L5X validation protections remain unchanged.

## Target Architecture

```text
Git repository state
  -> RepoContext live conflict state
       -> Next Step Advisor conflict queue
            -> openConflictResolver(path)
                 -> Explorer conflict tab
                      -> ConflictResolverPane
                           -> TextConflictResolver
                           -> L5XConflictResolver
                           -> WholeFileConflictFallback

Git operation state
  -> Merge Manager
       -> merge selection / preflight / review / start
       -> active operation status
       -> Continue / Skip / Finish / Abort
```

The ownership boundaries are:

| Concern | Owner |
| --- | --- |
| Current unresolved files | `RepoContext`, derived from the backend. |
| Active repository operation | `RepoContext`, derived from `GetMergeState`. |
| Merge planning and preflight | `useMergeFlowController` and Merge Manager. |
| Open resolver tabs | `LayoutContext`. |
| Draft for one open file | Standalone conflict resolver tab/hook. |
| Conflict queue presentation | Next Step Advisor conflict panel. |
| Text/L5X/fallback dispatch | Existing `ConflictResolverPane`. |

## Phase 0: Contract And Regression Harness

> Difficulty: Medium. Code 3 / Reasoning 6 / Test burden 7. Frontier reasoning model; the harness guards every later phase.

### Objective

Lock the separation contract in tests before moving UI ownership.

### Work

- Add a `RepoContext` test fixture for repositories with live conflicts but no
  `conflictCheckResult`.
- Add cases for merge, Sync-created merge, cherry-pick, revert, and patch
  application operation states.
- Record the existing resolver behavior for text, L5X, and whole-file fallback.
- Add an `ExplorerMergeModal` assertion that will eventually require the modal
  to contain no `ConflictQueue` or `ConflictResolverPane`.

### Exit Gate

Tests can prove that a live conflict may exist without merge-planning state and
that the existing detailed resolvers remain behaviorally stable.

## Phase 1: Separate Live Conflict State

> Difficulty: High. Code 6 / Reasoning 9 / Blast radius 9. Top-tier frontier model + mandatory human review; this is the load-bearing state split.

### Objective

Make repository conflict detection and reconciliation independent from merge
planning.

### RepoContext Contract

Add:

```ts
refreshConflictState: () => Promise<ConflictedFile[]>;
isLoadingConflicts: boolean;
```

`refreshConflictState()` should fetch `GetMergeState(repoPath)` and
`GetConflictedFiles(repoPath)` together, then update:

- active operation state
- authoritative unresolved files
- conflict-side labels when available

It must not require `targetBranch`, `sourceBranch`, `conflictCheckResult`, or
merge options.

### State Cleanup

- Remove `selectedConflictFile` from `RepoContext`; selection is UI state encoded
  by the active resolver tab.
- Retire `fileResolutions` after all completion gates use the current backend
  conflict list.
- Split `clearConflicts()` into:
  - `clearMergePlanningState()` for preflight, review, and branch-selection results.
  - `resetConflictState()` for repository closure/switching only.
- Replace post-resolution calls to `reconcileLiveMergeState()` with
  `refreshConflictState()`.
- Keep merge-specific live-phase calculation inside `useMergeFlowController` or
  a merge-owned helper instead of the repository conflict API.

### Refresh Triggers

Call `refreshConflictState()`:

- after opening a repository
- after Sync completes or fails into an interrupted state
- after starting a merge
- after resolving a file
- after Continue, Skip, Finish, or Abort
- during the existing repository refresh path
- after relevant file-watcher events, using the existing debounce path

Avoid a second independent polling loop. Reuse the current refresh and watcher
cadence.

### Backend Impact

No new resolution backend methods are expected. Reuse:

- `GetMergeState`
- `GetConflictedFiles`
- `GetConflictResolutionData`
- `ResolveConflictWithContent`
- existing whole-file resolution methods

Only add backend work if tests prove `GetMergeState` cannot identify one of the
approved interrupted-operation sources.

### Exit Gate

Opening or refreshing any repository with live unmerged files populates
`conflictedFiles` without opening Merge Manager and without a merge preflight
result.

## Phase 2: Standalone Conflict Resolver Tab

> Difficulty: Medium-High. Code 6 / Reasoning 6 / Blast radius 7. Frontier model; watch draft/token lifetime and focus return.

### Objective

Open one conflicted file in the main area without rendering the queue beside it.

### Explorer Tab Contract

Extend `ExplorerTab`:

```ts
type: 'file-browser' | 'file' | 'diff' | 'commit' | 'conflict';

conflictContext?: {
  relativePath: string;
};
```

Add `openConflictResolver(path)` to `LayoutContext`. It should:

1. Normalize path separators.
2. Use a stable ID such as `conflict:${normalizedPath}`.
3. Focus an existing tab instead of opening a duplicate.
4. Open the Explorer main area when invoked from another view.
5. Keep the Next Step Advisor sidebar visible.

### Resolver Ownership

Create:

```text
frontend/src/features/conflict/components/resolver/
  ConflictResolverTab.tsx
  ConflictResolverPane.tsx
  TextConflictResolver.tsx
  L5XConflictResolver.tsx
  L5XVisualRegionCard.tsx
  TextConflictBlock.tsx
  WholeFileConflictFallback.tsx

frontend/src/features/conflict/hooks/
  useConflictResolutionDraft.ts
```

Move existing resolver components from the modal-specific folder without
changing their resolution semantics.

`useConflictResolutionDraft` owns:

- resolution-data loading for one path
- loading and apply errors
- a token-scoped in-memory draft
- stale-token reload behavior
- apply and whole-file actions for the open path

After successful resolution:

1. Refresh conflict state.
2. Close the resolver tab.
3. Activate the pinned File Browser tab.
4. Move keyboard focus to the conflict queue when it still exists.

Do not open the next file automatically.

### Exit Gate

A conflicted file can be resolved from a main-area tab while Merge Manager has
never been opened. Closing the tab discards the draft and performs no mutation.

## Phase 3: Next Step Advisor Conflict Queue

> Difficulty: Medium. Code 4 / Reasoning 4 / Blast radius 4. Strong mid-tier model; mostly presentational, watch advisor precedence and a11y.

### Objective

Make unresolved files globally visible and selectable from the existing
contextual sidebar.

Create:

```text
frontend/src/features/conflict/components/queue/
  ConflictAdvisorPanel.tsx
  ConflictFileQueue.tsx
  conflictStatusLabels.ts
```

When `conflictedFiles.length > 0`, the conflict panel takes precedence over the
normal changed-files, share, feature-branch, and synced advisor panels.

The panel should contain:

- `Files need decisions` heading
- unresolved count
- one row per unresolved file
- plain-language status such as `Both versions changed`
- a selected/open indicator when that file has an active resolver tab
- a `Review file` action or row activation that calls `openConflictResolver(path)`
- a link to `Open Manager` for operation status and controls

The queue must not contain:

- Current/Incoming decision controls
- a file preview
- conflict-region choices
- Continue, Skip, Finish, or Abort actions
- an automatic selection side effect

When the last conflict is resolved, the panel disappears and Next Step Advisor
recomputes its ordinary repository recommendation.

### Accessibility

- Rows must be keyboard-operable buttons or links.
- The unresolved count must be announced when it changes.
- Returning from a resolved tab should focus the queue heading or first remaining row.
- Long paths must wrap or truncate without changing sidebar width.

### Exit Gate

The queue is visible whenever the open repository has live conflicts and hidden
otherwise. Selecting a row opens exactly one resolver tab.

## Phase 4: Reduce Merge Manager To Its Boundary

> Difficulty: High. Code 5 / Reasoning 7 / Blast radius 8. Frontier model + human review; deletions can drop operation controls for interrupted states.

### Objective

Keep merge planning and operation controls in Merge Manager while removing all
file-level resolution state and UI.

Remove from `ExplorerMergeModal`:

- `resolutionDataByPath`
- `conflictDrafts`
- `resolutionLoadingByPath`
- resolution load/apply error maps
- selected-conflict synchronization
- `ConflictQueue` rendering
- direct `ConflictResolverPane` ownership

When an active operation has conflicts, Merge Manager should show:

- operation name and current status
- number of files still needing decisions
- `Review files`, which reveals Next Step Advisor and optionally focuses the queue
- disabled Continue or Finish controls until no conflicts remain
- applicable Continue, Skip, Finish, and Abort controls after repository state allows them

Merge setup continues to own:

- source and destination selection
- merge options
- preflight
- affected-file review
- start action

Potential conflicts found during preflight remain in merge review. They become
global queue items only after the operation starts and the backend reports live
unmerged files.

### Interrupted Operations

Merge Manager must render operation controls from the active repository state,
not from the presence of a merge preflight result. This includes:

- merge or Sync-created merge: Finish or Abort
- cherry-pick: Continue, Skip, or Abort
- revert: Continue, Skip, or Abort
- patch application: Skip or Abort, plus Continue if the backend supports it

`RecoveryBanner` should stop performing destructive cancellation directly. Its
primary action becomes `Open Manager`, where confirmations and consequences are
shown consistently.

### Exit Gate

Merge Manager contains no conflict file list, file resolver, or per-file draft.
It remains the only home for operation-level Continue, Skip, Finish, and Abort
actions.

## Phase 5: Unify Entry Points And Harden

> Difficulty: Medium. Code 4 / Reasoning 5 / Context breadth 7. Strong mid-tier model; mechanical routing plus a final regression sweep across all callers.

### Objective

Make every conflicted-file interaction use the same standalone path and prove
that the workflows remain independent.

Route these surfaces through `openConflictResolver(path)`:

- Next Step Advisor queue
- conflicted rows in Explorer
- Merge Manager's conflict summary
- Recovery Banner resolution action
- conflict notifications or toasts with actions
- any future status-bar conflict indicator

Remove obsolete modal-only exports and rename directories so component paths
reflect feature ownership rather than presentation history.

### Exit Gate

There is one file-resolution entry action, one authoritative unresolved queue,
and no code path that requires starting a merge to resolve an existing conflict.

## File Change Map

| File or area | Planned change |
| --- | --- |
| `frontend/src/domain/repo/context/RepoContext.tsx` | Add operation-neutral conflict refresh; separate merge planning from live conflicts; remove UI selection ownership. |
| `frontend/src/domain/repo/context/RepoContext.types.ts` | Expose the smaller conflict-state contract and remove modal-oriented fields. |
| `frontend/src/features/merge/hooks/useMergeFlowController.ts` | Derive merge phases from merge state plus authoritative conflict count. |
| `frontend/src/features/merge/components/ExplorerMergeModal.tsx` | Remove queue, resolver, drafts, and file-level handlers; retain planning and operation controls. |
| `frontend/src/features/conflict/components/modal/` | Split and move components into `queue/` and `resolver/`; remove the modal-specific directory. |
| `frontend/src/features/explorer/components/ExplorerView.tsx` | Give live conflicts highest advisor priority and render `ConflictAdvisorPanel`. |
| `frontend/src/shared/constants/index.ts` | Add the conflict tab descriptor. |
| `frontend/src/context/LayoutContext.tsx` | Add stable conflict-tab opening and focus behavior. |
| `frontend/src/features/explorer/components/ExplorerTabsBar.tsx` | Render conflict-tab icon and accessible title. |
| `frontend/src/features/explorer/pages/ExplorerPage.tsx` | Mount and retain standalone conflict resolver tabs. |
| `frontend/src/shared/ui/RecoveryBanner.tsx` | Route to queue/manager; remove direct destructive operation actions. |
| Existing conflict and merge tests | Rehome component tests and add workflow-separation coverage. |

## Test Matrix

### Repository State

- Opening a repository with merge conflicts populates the queue.
- Opening a repository with cherry-pick conflicts populates the queue.
- Opening a repository with revert conflicts populates the queue.
- Opening a repository with patch-application conflicts populates the queue.
- Sync resulting in conflicts populates the queue without opening Merge Manager.
- A conflict-free refresh clears the queue.
- Repository switching clears resolver tabs and drafts.

### Resolver Tabs

- Selecting a queued file opens one stable conflict tab.
- Selecting it again focuses the existing tab.
- Text, L5X, and whole-file fallback dispatch remains correct.
- Closing a tab does not apply its draft.
- A stale resolution token reloads current data and does not apply stale content.
- Successful resolution closes the tab and returns focus to the queue.
- Successful resolution does not open the next file.

### Advisor Queue

- Conflict state takes precedence over ordinary advisor panels.
- Every unresolved backend file appears exactly once.
- Potential preflight conflicts do not appear.
- The panel disappears after the last conflict is resolved.
- Paths and statuses remain readable at minimum and maximum sidebar widths.

### Merge Manager

- Merge setup, preflight, review, and start behavior remain intact.
- The modal renders no queue or resolver.
- Active conflict count updates while the modal remains open.
- Continue and Finish are disabled while conflicts remain.
- Operation controls use current repository operation state without requiring preflight state.
- Abort confirmations remain present and describe consequences.

### Cross-Workflow

- A conflict can be fully resolved without opening Merge Manager.
- Starting a merge that produces conflicts populates the same global queue.
- Resolving all files does not automatically finish the active operation.
- Returning to Merge Manager after resolution exposes the correct completion action.
- File watcher refreshes cannot resurrect a resolved file after backend staging succeeds.

## Validation Commands

Run focused checks after each phase, followed by the complete frontend gate:

```bash
cd frontend
npm exec -- vitest run <changed-test-files>
npm run typecheck
npm run lint
npm test
npm run build
```

When `RepoContext` behavior changes, also run backend conflict tests to ensure the
frontend refactor has not exposed an invalid service assumption:

```bash
go test ./services/... -run 'Conflict|Merge|CherryPick|Revert|AM' -v
go test ./services/... -v
```

Regenerate Wails bindings only if an exported Go contract changes. Never edit
generated bindings manually.

## Release Acceptance Criteria

The refactor is complete only when all of the following are true:

1. Users can resolve Sync, interrupted-operation, and pre-existing repository conflicts without entering a merge action.
2. Next Step Advisor shows the authoritative unresolved file queue only while conflicts exist.
3. The queue and resolver are never rendered in the same modal or panel.
4. Each file resolves in a standalone main-area tab.
5. Resolving a file returns to the queue and does not advance automatically.
6. Merge Manager contains merge planning and operation controls but no file-level resolver state.
7. Every conflicted-file click uses one shared resolver-tab entry action.
8. No UI-specific conflict state survives repository switching or app restart.
9. Existing text, L5X, and whole-file conflict safety tests pass unchanged or with location-only updates.
10. Frontend tests, typecheck, lint, production build, and backend conflict suites pass.

## Documentation Follow-Up

After implementation:

- Update [[Text and Ladder Conflict Resolution Plan]] status to identify this plan
  as the authority for queue placement, resolver navigation, and draft lifetime.
- Update technical workflow documentation that still instructs users to enter
  `Combine Versions` before resolving an existing conflict.
- Add the completed architecture outcome to `summary/PLANS_SUMMARY.md`.
