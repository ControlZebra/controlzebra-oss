# Explorer Merge Conflict Workflow Fix Plan

> **Status**: 📋 PLANNING  
> **Created**: 2026-03-21  
> **Author**: Senior Engineering  
> **Scope**: Explorer merge modal conflict path, merge state orchestration, modal safety, regression coverage  
> **Related**: `EXPLORER_MERGE_OUTCOME_MODAL_PLAN.md`

---

## Objective

Fix the Explorer merge modal so conflict merges reliably enter the guided `Keep Mine` / `Keep Theirs` workflow instead of:
- opening a file in the system default app
- skipping directly to the finish state
- falsely reporting that the merge completed

The fix must preserve the outcome-first modal direction while restoring the core safety rule:

> If Git reports unresolved conflicts, the UI must stay in conflict resolution until the repository confirms those conflicts are resolved.

---

## Problem Summary

Users report this broken sequence:
1. Click `I am ready to merge` from Explorer.
2. The modal identifies a conflict case.
3. The user starts the guided merge flow.
4. Instead of showing the conflict queue, the app opens the file in the default application.
5. The app then advances as if the merge finished.

This is a serious correctness bug because it can mislead non-technical users into thinking a merge succeeded when the repository may still be in an unresolved state.

---

## Root Cause Summary

The current implementation has multiple failure points that can combine into the reported behavior.

### 1. Premature modal state transition
- `ExplorerMergeModal.tsx` currently treats `mergeStarted === true` as enough evidence to move into `complete` when `conflictedFiles` has not been populated yet.
- This creates a race where the modal can skip the resolution queue during the transition from dry-run to live merge.

### 2. Start-merge state hydration is not authoritative enough
- `RepoContext.startMerge()` reads `GetMergeState()` immediately after `StartMergeWithOptions()`.
- If that immediate snapshot temporarily reports no conflicts, the frontend clears `conflictedFiles` and marks the merge as ready to finish.
- The UI is therefore trusting an unstable intermediate state.

### 3. Completion guard trusts stale frontend cache
- `completeMerge()` currently blocks only when the frontend still has unresolved files in `conflictedFiles` and `fileResolutions`.
- If those arrays were cleared incorrectly earlier, the UI can call `CompleteMerge()` even though the repo may still be conflicted.

### 4. Conflict merge path is still coupled to selective review state
- `useMergeFlowController()` enables selective merge whenever `mergeReviewFiles.length > 0`.
- That is acceptable for optional review, but it is not safe to let conflict resolution depend on review-selection state.
- Conflict merges should use the actual conflicted file set, not the incidental review selection state.

### 5. Modal shell is not hardened enough against background interaction
- The current custom `AlertDialog` implementation does not provide the same safety guarantees as the Radix-backed modal primitives used elsewhere.
- The reported default-app open action strongly suggests a background interaction leak or an unintended viewer surface remaining clickable.

---

## Product Decisions

These decisions are fixed for this repair unless explicitly revised later.

1. Conflict resolution correctness takes priority over preserving current transient animations or optimistic UI transitions.
2. The Explorer modal must not show the `complete` state until conflict-free repository state is confirmed.
3. The finish action must verify live repo state before calling `CompleteMerge()`.
4. Conflict merges must not depend on review-file selection state.
5. The modal must block background interaction while open.
6. The dedicated Merge activity remains available as a fallback and recovery surface.

---

## Files In Scope

### Primary frontend files
- `frontend/src/features/merge/components/ExplorerMergeModal.tsx`
- `frontend/src/features/merge/hooks/useMergeFlowController.ts`
- `frontend/src/features/merge/components/modal/MergeConflictQueue.tsx`
- `frontend/src/domain/repo/context/RepoContext.tsx`
- `frontend/src/shared/ui/alert-dialog.tsx`

### Supporting files likely to need tests
- `frontend/src/features/merge/components/modal/MergeConflictQueue.test.tsx`
- merge modal test files to be added under `frontend/src/features/merge/components/`
- `frontend/src/domain/repo/context/RepoContext.analytics.test.tsx` if merge analytics behavior changes

---

## Fix Strategy

## Phase 1: Make conflict state authoritative

Goal:
- ensure live merge state is derived from confirmed repository conflict state, not transient UI assumptions

Tasks:
1. Refactor `RepoContext.startMerge()` so conflict detection after `StartMergeWithOptions()` is based on authoritative repo queries.
2. After merge start, explicitly reconcile:
   - `GetMergeState(repoPath)`
   - `GetConflictedFiles(repoPath)`
3. Treat non-empty conflicted files as the source of truth even if the initial merge-state snapshot says otherwise.
4. Avoid clearing `conflictedFiles` unless the repository has been confirmed conflict-free.
5. Store a derived merge-phase state that distinguishes:
   - dry-run conflict detection
   - live merge started
   - live merge started with unresolved conflicts
   - live merge ready to complete

Rationale:
- the bug exists because the modal is interpreting an unstable state transition as a clean merge

---

## Phase 2: Prevent premature modal completion

Goal:
- ensure `ExplorerMergeModal` cannot advance to `complete` while conflict state is still being hydrated or unresolved

Tasks:
1. Update `ExplorerMergeModal.tsx` outcome derivation to require explicit proof before entering `complete`.
2. Introduce an intermediate `resolving-preparing` or equivalent internal state if needed while live conflict state is being loaded.
3. Make `resolving` the default once merge has started and conflict state is not yet confirmed clean.
4. Only render `complete` when:
   - merge has started
   - repository confirms zero conflicted files
   - completion guard passes
5. Preserve the current `needs-decisions` summary screen before live merge starts.

Rationale:
- the modal should fail closed, not fail open

---

## Phase 3: Decouple conflict workflow from review selection

Goal:
- ensure optional review remains optional and cannot accidentally change conflict-resolution behavior

Tasks:
1. Update `useMergeFlowController.ts` so selective merge is enabled only for the clean-review path.
2. For conflict cases, do not derive merge behavior from `mergeReviewFiles` or `selectedReviewFiles`.
3. Ensure `handleStartMerge()` branches explicitly:
   - clean merge without review
   - clean merge with optional selective review
   - conflict merge with authoritative repo conflict handling
4. Review how merge review files are loaded and reset so the conflict path does not inherit stale review selection state.

Rationale:
- review is a convenience feature, not a merge correctness primitive

---

## Phase 4: Harden completion safety

Goal:
- prevent false success when unresolved conflicts still exist in Git

Tasks:
1. Update `completeMerge()` in `RepoContext.tsx` to re-query live merge state immediately before completion.
2. Re-check `GetConflictedFiles(repoPath)` before calling `CompleteMerge()`.
3. If unresolved conflicts still exist:
   - block completion
   - keep the user in the conflict workflow
   - show a clear error toast explaining that some files still need a choice
4. Ensure post-completion cleanup only runs after the backend confirms success.

Rationale:
- the finish button must be a verified action, not a UI assumption

---

## Phase 5: Fix modal interaction safety

Goal:
- eliminate the possibility that clicks inside the merge workflow trigger background viewer or file-browser actions

Tasks:
1. Review the current custom `AlertDialog` implementation for background interaction leaks.
2. Either:
   - harden the existing dialog with proper event isolation and focus containment, or
   - replace it with the existing Radix-based dialog pattern used elsewhere in the app.
3. Confirm that while the merge modal is open:
   - background content is inert
   - keyboard focus is trapped
   - Escape behavior only closes when safe
   - no viewer header or explorer file actions can receive clicks
4. Specifically regression-test against accidental activation of `Open in Default App`.

Rationale:
- even if the state bug is fixed, background click-through would still be unacceptable

---

## Phase 6: Add regression coverage

Goal:
- lock the workflow down so the same bug cannot reappear quietly in later modal work

Tasks:
1. Add component tests for `ExplorerMergeModal` state transitions.
2. Add controller tests for `useMergeFlowController()` or refactor logic into a testable pure helper if needed.
3. Add RepoContext-focused tests covering:
   - merge starts and conflicts are fetched after start
   - finish is blocked while conflicts still exist
   - clean completion only occurs after confirmed clean repo state
4. Add an interaction test verifying that the conflict workflow stays in-app and does not dispatch any file-open action.
5. Keep the existing `MergeConflictQueue` tests, but extend coverage beyond selection auto-advance.

---

## Proposed State Rules

These rules should govern the repaired modal.

### Before live merge starts
- `checkConflictsOnly()` may show:
  - `ready`
  - `review`
  - `needs-decisions`
  - `up-to-date`

### After live merge starts
- If conflict status is still loading: stay in guarded transition state, not `complete`
- If repo has conflicted files: show `resolving`
- If repo has zero conflicted files and merge is active: show `complete`
- If backend reports merge auto-completed: show `success`

### Before completion
- Re-query repo state
- If any conflicts exist, remain in `resolving`
- Only then allow `CompleteMerge()`

---

## Proposed Implementation Details

### `RepoContext.startMerge()`
- introduce a post-start reconciliation block that resolves final frontend state from live repo data
- prefer `GetConflictedFiles()` over optimistic assumptions
- avoid writing `hasConflicts: false` until conflict queries confirm zero conflicts

### `ExplorerMergeModal.tsx`
- replace the current broad `mergeStarted => complete` path with explicit guarded conditions
- keep conflict resolution visible until confirmed resolved
- optionally expose a small loading message such as `Preparing the conflict list...`

### `useMergeFlowController.ts`
- make merge-start behavior explicit by outcome type instead of inferring from `mergeReviewFiles.length > 0`
- keep review selection logic scoped to review-only merges

### `completeMerge()`
- call live merge-state queries before invoking backend completion
- show a clear blocking message if unresolved conflicts remain

### Modal shell
- prefer a hardened dialog primitive with focus trap and inert background behavior

---

## Analytics

Track the repaired workflow so we can verify whether the fix removes false completions and accidental file-open exits.

Suggested events:
- `merge_modal_conflict_start_requested`
- `merge_modal_conflict_state_hydrated`
- `merge_modal_conflict_resolution_blocked_by_live_state`
- `merge_modal_background_interaction_blocked`
- `merge_modal_conflict_completion_verified`

---

## Test Plan

## Frontend automated tests

Add or update tests for:

1. Conflict dry-run result shows `Needs decisions` before live merge starts.
2. Starting a conflict merge does not transition directly to `complete` while conflict state is still loading.
3. Starting a conflict merge transitions to `resolving` when `GetConflictedFiles()` returns files.
4. The modal does not call any file-open handler while entering or using conflict resolution.
5. Completion is blocked when the repo still has unresolved conflicts even if frontend state was cleared.
6. Clean merges still reach `complete` and `success` without regression.
7. Optional review selection still works for clean reviewable merges.

## Manual QA

Validate these scenarios:

1. Single conflicted text file.
2. Multiple conflicted files.
3. Conflict case with reviewable files also present.
4. Conflict case where the repo takes an extra render cycle to surface conflicted files.
5. Pressing Escape during conflict resolution.
6. Clicking near modal edges to confirm no background file action fires.
7. Clean merge still completes normally.
8. Recovery banner path still routes to the dedicated merge activity.

---

## Risks and Mitigations

### Risk: fixing the race makes the modal feel slower
Mitigation:
- add a short guarded loading state with explicit copy instead of optimistic completion

### Risk: review and conflict code paths diverge too much
Mitigation:
- keep shared controller logic, but separate correctness-critical conflict rules from optional review behavior

### Risk: dialog hardening changes behavior in other modals
Mitigation:
- prefer replacing only the merge modal shell first unless the shared primitive can be upgraded safely

### Risk: backend contract ambiguity still leaks through
Mitigation:
- treat repo conflict queries as authoritative at the frontend boundary and avoid assuming merge-start semantics from a single flag

---

## Acceptance Criteria

1. Starting a conflict merge from Explorer always enters an in-app conflict workflow.
2. The modal never shows `complete` until the repo confirms zero conflicted files.
3. The finish action re-validates live repo conflict state.
4. Conflict merges are not driven by optional review-file selection state.
5. No click in the merge modal can trigger `Open in Default App` or similar background file actions.
6. Clean merge and reviewable clean merge flows continue to work.
7. Dedicated merge activity and recovery paths still function.

---

## Recommended Delivery Sequence

1. Fix `RepoContext.startMerge()` state reconciliation.
2. Guard modal outcome transitions against premature `complete`.
3. Decouple conflict merge from review-selection logic.
4. Add live-state completion guard.
5. Harden or replace the modal shell.
6. Add regression tests.
7. Run manual QA on both clean and conflicted merge scenarios.

---

## Recommendation

Implement this as a correctness-first repair, not a cosmetic patch.

The immediate objective is not to polish the conflict queue further. It is to restore a trustworthy merge workflow where:
- conflict state is authoritative
- completion is verified
- background file actions cannot leak into the modal

Once that is stable, we can continue iterating on the outcome-first merge UX with lower regression risk.