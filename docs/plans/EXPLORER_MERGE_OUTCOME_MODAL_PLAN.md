# Explorer Merge Outcome-First Modal Plan

> **Status**: 📋 PLANNING  
> **Created**: 2026-03-20  
> **Author**: Senior Engineering  
> **Scope**: Explorer merge entry point, modal UX, merge flow refactor, reuse of existing merge orchestration  
> **Decision**: Stakeholder selected the outcome-first modal direction.

---

## Objective

Replace the current Explorer-to-standalone-merge-page entry with a large Explorer modal that starts with the outcome, not the process.

Target user experience:
- User clicks `I am ready to merge` from the Explorer sidebar.
- A large modal opens over the Explorer page.
- The app immediately analyzes the merge path in the background.
- The first screen answers: `Can I merge now, do I need review, or do I need to make decisions?`
- The modal progressively reveals more detail only when needed.

This is a better fit for ControlZebra's non-technical audience than forcing every merge through a dedicated activity and full-page stepper.

---

## Problem Statement

The current merge workflow is capable, but it adds unnecessary navigation overhead.

Current journey:
1. User is on Explorer and sees a clear next action.
2. Clicking the action switches to the dedicated `Merge changes` activity.
3. The user then works through a full-page merge flow.
4. During review, a second nested modal opens for file diffs.

This creates avoidable context switching:
- Explorer sidebar to merge activity
- merge page to review modal

For most users, especially when merges are clean, that is too much ceremony.

---

## Current Architecture Snapshot

### Existing Explorer trigger
- `frontend/src/features/explorer/components/ExplorerStatusPanel.tsx`
  - renders the `I am ready to merge` button for synced feature branches
- `frontend/src/features/explorer/components/ExplorerView.tsx`
  - currently routes that action to `VIEWS.MERGE_CHANGES`

### Existing dedicated merge surfaces
- `frontend/src/widgets/layout/ActivityBar.tsx`
  - dedicated `Merge changes` activity item
- `frontend/src/widgets/layout/Sidebar.tsx`
  - dedicated `MergeChangesView`
- `frontend/src/widgets/layout/view-registry.ts`
  - dedicated `MergeChangesPage`

### Existing merge logic and state
- `frontend/src/features/merge/pages/MergeChangesPage.tsx`
  - contains the current merge flow orchestration and UI states
- `frontend/src/features/merge/components/MergeReviewDiffModal.tsx`
  - renders review diffs in a nested modal
- `frontend/src/domain/repo/context/RepoContext.tsx`
  - already provides most of the required behavior:
  - `checkConflictsOnly`
  - `loadMergeReviewFiles`
  - `loadMergeReviewFileDiff`
  - `startMerge`
  - `resolveConflict`
  - `abortMerge`
  - `completeMerge`
  - `deleteBranch`

Conclusion:
- The backend and repo orchestration are already good enough.
- The primary work is interaction design, state composition, and removing unnecessary navigation.

---

## Product Decisions

These decisions are fixed for this implementation unless explicitly changed later.

1. The default merge entry point should be the Explorer modal, not the Merge activity.
2. The modal should analyze the merge immediately on open instead of waiting for a manual `Check for Conflicts` click.
3. The first screen should present an outcome summary, not a stepper.
4. Clean merges should feel fast and low-friction.
5. Conflicts should switch the user into a guided decision queue instead of a generic overview-first flow.
6. File review remains available, but it becomes secondary for clean merges.
7. The existing dedicated Merge activity should remain available as an advanced/recovery surface.
8. The existing recovery banner should continue routing interrupted merge/rebase states to the dedicated merge activity until the modal path is proven stable.

---

## UX Concept

## 1) Opening behavior

When the user clicks `I am ready to merge`:
- open a large modal over Explorer
- show a loading summary state immediately
- auto-run merge analysis using existing dry-run logic

Initial loading copy:
- Title: `Preparing merge`
- Body: `Checking whether your work can be merged safely.`

No manual setup gate should appear before analysis unless the app truly cannot determine target/source.

## 2) Primary modal states

The modal should branch into one of these outcome states.

### A. Ready Now
Use when:
- merge check succeeds
- no conflicts
- merge review file list is empty or review is optional

UI:
- clear success-style summary card
- source and destination branches shown prominently
- optional editable merge message
- primary action: `Merge now`
- secondary action: `Review files`
- tertiary action: `Cancel`

User message:
- `Everything looks good. Your changes can be merged safely.`

### B. Needs Review
Use when:
- merge check succeeds
- no conflicts
- there are changed files worth reviewing before merge

UI:
- summary card at top
- compact file list underneath
- file selection opens inline diff/viewer in the same modal body
- primary action remains `Merge now`
- review is optional, not blocking

User message:
- `No conflicts found. Review the files if you want, then merge when ready.`

### C. Needs Decisions
Use when:
- merge check succeeds
- conflicts exist

UI:
- summary card explains that some files need a choice
- enter a focused conflict queue
- main content shows one file at a time
- progress indicator: `1 of 3 decisions`
- side rail lists all files with states: `waiting`, `resolved`, `current`
- primary actions on each file:
  - `Keep Mine`
  - `Keep Theirs`
- after all files are resolved, switch to final completion state

User message:
- `A few files were changed in both branches. Choose which version to keep for each file.`

### D. Already Up To Date
Use when:
- existing check returns `alreadyUpToDate`

UI:
- simple informational state
- single primary action: `Close`

### E. Merge Complete
Use when:
- merge auto-completes, or user completes merge after review/conflict resolution

UI:
- success confirmation
- optional branch cleanup card
- primary action: `Done`
- optional action: `Delete merged branch`

---

## Modal Layout

## Overall shell

Use a large responsive modal.

Target layout behavior:
- desktop: approximately `max-w-6xl`, tall enough for review and conflict work
- smaller screens: full-height sheet-like modal with sticky header and footer
- keep Explorer visible underneath to preserve context

## Layout sections

### Header
- modal title based on outcome
- branch direction summary
- close button

### Summary strip
- source branch
- destination branch
- merge type toggle summary (`Squash merge` on/off)
- state badge: `Ready now`, `Review available`, `Needs decisions`, `Already up to date`

### Body
Changes depending on state:
- loading summary
- review list + inline viewer
- conflict queue + file decision panel
- success card

### Footer
- sticky footer with the next primary action only
- examples:
  - `Merge now`
  - `Save my choices and finish`
  - `Done`

This keeps the user anchored on the next action instead of navigating a process diagram.

---

## Key Interaction Details

## 1) Auto-analysis on open

On open:
1. resolve effective source branch from current repo state
2. resolve target branch from selected branch or detected parent branch
3. run `checkConflictsOnly(targetBranch)`
4. if successful, load merge review files

Rationale:
- this removes the current manual `check` step for the common case
- users asked to merge because they are ready, not because they want to configure a workflow

## 2) Review experience stays inline

Current review opens a nested modal from inside the merge page. The new modal should not open another large modal on top.

Instead:
- show file list in a left rail or upper list
- render the selected diff inline in the main panel
- reuse the existing diff renderer/request adapters

This reduces visual nesting and keeps the workflow comprehensible.

## 3) Conflict resolution becomes queue-first

Current flow supports overview and file resolution, but it is still page-like.

New behavior:
- default into the first unresolved file
- show exactly one decision surface at a time
- allow jumping between files from a compact queue rail
- after each choice, automatically move to the next unresolved file

This is more appropriate for non-technical users than dropping them into a generic conflict list.

## 4) Merge message entry is contextual

Do not front-load message entry.

Rules:
- clean merge: message field appears only in `Ready Now` or `Needs Review`
- conflicts: message field appears only after all conflicts are resolved
- auto-completed merges: no message input needed

## 5) Advanced workflow access remains intact

The dedicated `Merge changes` activity should remain for:
- interrupted merges
- interrupted rebases
- recovery-oriented operations
- future advanced workflows not suited to the Explorer modal

The modal becomes the preferred default entry, not the only entry.

---

## Implementation Strategy

## Phase 1: Extract reusable merge flow controller

Goal:
- separate merge state orchestration from the current page-specific layout

Tasks:
1. Extract non-visual merge flow state from `MergeChangesPage.tsx` into a reusable hook or controller component.
2. Reuse existing `RepoContext` actions instead of introducing new backend contracts.
3. Keep existing dedicated `MergeChangesPage` functional during the transition.

Recommended structure:
- `frontend/src/features/merge/hooks/useMergeFlowController.ts`
- `frontend/src/features/merge/components/ExplorerMergeModal.tsx`
- optional presentational subcomponents under `frontend/src/features/merge/components/modal/`

Why:
- prevents duplicating merge logic in both page and modal
- lowers regression risk

## Phase 2: Build new modal shell and outcome states

Tasks:
1. Create the modal component opened from Explorer.
2. Add loading, ready, review, conflict, up-to-date, and success states.
3. Render branch direction and squash merge summary in the header.
4. Add sticky footer actions.

Important:
- do not wire nested review modal into this new surface
- inline the review viewer instead

## Phase 3: Rework review as inline panel

Tasks:
1. Convert current review modal behavior into inline review content.
2. Reuse existing `DiffRenderer` request-building logic.
3. Keep file rename and deleted-file handling identical to current merge review behavior.
4. Preserve specialized file viewers where available.

## Phase 4: Rework conflict flow into guided queue

Tasks:
1. Create compact conflict queue list.
2. Default into the first unresolved file.
3. Reuse current `resolveConflict` behavior.
4. Auto-advance after successful resolution.
5. Show final completion panel when all conflicts are resolved.

## Phase 5: Wire Explorer entry point

Tasks:
1. Change `ExplorerView` and/or `ExplorerStatusPanel` merge action from navigation to modal open.
2. Keep the ActivityBar merge entry intact.
3. Keep recovery banner navigation intact for now.

## Phase 6: Cleanup and fallback strategy

Tasks:
1. Decide whether `MergeChangesPage` becomes a thin wrapper around the shared modal content or remains a separate advanced surface.
2. Avoid removing the dedicated merge activity until the modal path is stable.
3. Document any remaining differences between modal and dedicated page.

---

## Proposed Component Breakdown

### New components
- `frontend/src/features/merge/components/ExplorerMergeModal.tsx`
- `frontend/src/features/merge/components/modal/MergeOutcomeHeader.tsx`
- `frontend/src/features/merge/components/modal/MergeSummaryCard.tsx`
- `frontend/src/features/merge/components/modal/MergeReviewPane.tsx`
- `frontend/src/features/merge/components/modal/MergeConflictQueue.tsx`
- `frontend/src/features/merge/components/modal/MergeCompletionPane.tsx`

### New shared logic
- `frontend/src/features/merge/hooks/useMergeFlowController.ts`

### Existing code to reuse
- existing `RepoContext` merge actions
- existing merge review diff request adapters
- existing file viewer and diff renderer stack
- existing merge success branch-deletion behavior

### Existing code to simplify or retire
- nested `MergeReviewDiffModal` is likely unnecessary for the Explorer modal path
- some presentational pieces inside `MergeChangesPage.tsx` should be split into reusable modal-first components

---

## Detailed State Mapping

This section defines how current state should map into the new modal.

### Loading
Source:
- `isCheckingConflicts`

UI result:
- loading summary state

### Ready Now
Source:
- `conflictCheckResult.success === true`
- `mergeStarted === false`
- `hasConflicts === false`
- merge review files may be empty

UI result:
- summary-first merge action

### Needs Review
Source:
- same as `Ready Now`
- plus `mergeReviewFiles.length > 0`

UI result:
- summary + review list + inline diff/viewer

### Needs Decisions
Source:
- `conflictCheckResult.hasConflicts === true` or `conflictedFiles.length > 0`

UI result:
- queue-first conflict resolution panel

### Final Completion
Source:
- all conflicted files resolved, or clean merge started successfully

UI result:
- completion pane with message input if needed

### Success
Source:
- `showSuccess === true`
- or `autoCompleted === true`

UI result:
- success pane with optional branch cleanup

---

## File-Level Behavior Rules

These behaviors must remain consistent with current merge review behavior.

1. Rename display:
   - show `oldPath → path`
2. Deleted files:
   - use `oldPath` as the active viewer path when needed
3. Review data source:
   - continue using merge review branch-to-branch diff data
4. Binary viewers:
   - preserve current specialized viewer handling
5. Unsupported binaries:
   - continue showing the explicit unsupported preview state

---

## Accessibility and UX Constraints

1. Primary action must always be visually obvious.
2. The modal must be keyboard navigable.
3. Escape should close only when it is safe to close.
4. If a merge is already started inside the modal, closing should confirm whether the user wants to abandon the flow.
5. Conflict decisions must never be hidden behind hover-only affordances.
6. On smaller screens, the file list should collapse into a selectable drawer or stacked section.

---

## Analytics

Track modal-specific usage so the old and new entry points can be compared.

Suggested events:
- `merge_modal_opened`
- `merge_modal_analysis_completed`
- `merge_modal_ready_now_shown`
- `merge_modal_review_opened`
- `merge_modal_conflict_queue_started`
- `merge_modal_conflict_resolved`
- `merge_modal_completed`
- `merge_modal_closed`
- `merge_activity_opened_from_recovery`

This will show whether the modal reduces abandonment and shortens time-to-merge.

---

## Test Plan

## Frontend

Add or update tests for:

1. Clicking `I am ready to merge` opens the Explorer modal instead of changing active view.
2. Opening the modal triggers merge analysis automatically.
3. Clean merge result shows `Merge now` as the primary action.
4. Reviewable clean merge shows file list and inline diff panel.
5. Conflict result opens into the first unresolved file, not a blank overview.
6. Resolving a conflict auto-advances to the next unresolved file.
7. Completing merge shows success state and optional branch deletion action.
8. Existing dedicated `MergeChangesPage` still works for recovery paths.

## Manual QA

Validate these scenarios:

1. Feature branch clean merge with no files requiring review.
2. Feature branch clean merge with multiple changed files.
3. One conflict file.
4. Multiple conflict files.
5. Rename and delete cases in review viewer.
6. Binary file review in image, PDF, 3D, and L5X paths.
7. Already up-to-date case.
8. Abort/close behavior during conflict resolution.
9. Recovery banner still routes to dedicated merge activity.

---

## Risks and Mitigations

### Risk: modal logic duplicates page logic
Mitigation:
- extract a shared controller before building the new shell

### Risk: too much content in a single modal
Mitigation:
- use outcome-first branching and inline viewer panes
- do not keep the old stepper in the new modal

### Risk: nested modal complexity persists
Mitigation:
- inline merge review viewer instead of launching another modal

### Risk: recovery workflows become harder to reach
Mitigation:
- keep the dedicated merge activity for recovery and advanced paths

### Risk: closing modal mid-flow leaves confusing state
Mitigation:
- differentiate between pre-merge analysis state and active merge state
- confirm before closing active merge flows

---

## Acceptance Criteria

1. Clicking `I am ready to merge` from Explorer opens a large modal, not the dedicated merge activity.
2. The modal runs merge analysis automatically on open.
3. The first modal view communicates the outcome, not a fixed stepper.
4. Clean merges can be completed directly from the modal.
5. File review, when available, happens inline inside the modal.
6. Conflict resolution defaults to a guided one-file-at-a-time queue.
7. Success state offers branch cleanup when appropriate.
8. The dedicated merge activity remains available for recovery and advanced workflows.

---

## Recommended Delivery Sequence

1. Extract shared merge flow controller from `MergeChangesPage`.
2. Build Explorer modal shell with loading and summary states.
3. Inline review pane using existing diff stack.
4. Guided conflict queue.
5. Explorer trigger rewiring.
6. Regression pass on dedicated merge activity and recovery banner.
7. Analytics and polish.

---

## Recommendation

Implement this as an Explorer-first default while preserving the existing dedicated merge activity as a fallback and advanced surface.

That gives ControlZebra the simpler user journey it needs without throwing away the more capable recovery path that already exists.