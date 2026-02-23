# Merge Changes Selective Review + Selective Merge Plan

> **Status**: 📋 PLANNING  
> **Created**: 2026-02-23  
> **Author**: Engineering  
> **Scope**: `MergeChangesPage` review table + per-file diff modal + selective merge backend support
> **Revision Note**: Senior review incorporated for compatibility + safer merge semantics.

---

## Confirmed Product Decisions (from stakeholder Q&A)

1. **Selective scope**: Merge should include **only selected files**.
2. **Conflict behavior**: If selected files conflict, resolve conflicts **only for selected files**.
3. **Diff basis**: Review diff uses **2-dot** comparison: `target..source`.
4. **File type behavior**: Show all changed files and allow Review button; binary rendering uses existing viewer behavior.
5. **Commit message UX**: Pre-fill an **auto-generated message**, editable by user.

---

## Senior Review Verdict

**Verdict**: ✅ Proceed with revisions.

The product direction is correct. The original draft needed four corrections:
- preserve backward compatibility for existing non-selective merge calls,
- preserve file status/rename metadata in review list,
- define deterministic unselected-file neutralization behavior,
- hard-enforce conflict scoping so unselected conflicts never block completion.

---

## Problem Statement

`MergeChangesPage` currently supports conflict check + merge start, but it does not let users:
- inspect file-level diffs before starting merge,
- choose a subset of files to merge,
- block merge start until at least one file is selected.

This creates risk for non-technical users who need deterministic, file-level control.

---

## Current State (Codebase Study)

### Frontend
- `frontend/src/components/layout/pages/MergeChangesPage.tsx`
  - Stepper + check/start merge flow exists.
  - `ConflictCheckResultPanel` currently shows conflict summary and `Start Merge` but no changed-file table.
- `frontend/src/context/RepoContext.tsx`
  - Existing merge orchestration via `checkConflictsOnly()` and `startMerge()`.
  - `startMerge()` calls backend `StartMergeWithOptions(repoPath, target, source, { squash })`.
- Existing diff rendering stack:
  - `frontend/src/components/common/DiffViewer.tsx` (renderer)
  - `frontend/src/components/viewers/TextDiffViewer.tsx` (loads raw diff and delegates to `DiffViewer`)

### Backend
- `services/git_service.go`
  - `CheckBranchConflicts()` exists (merge-tree dry run, conflict list).
  - `StartMergeWithOptions()` exists with `MergeOptions{ squash }`.
  - No current API for **branch-to-branch changed file listing**.
  - No current API for **branch-to-branch raw file diff**.
  - No selective file merge support yet.

---

## Proposed UX (MVP)

### 1) Start Merge view adds changed-file table
After check-conflicts succeeds (review step), render a table:
- Columns: `checkbox`, `name`, `status`, `review`
- Header checkbox = select all
- Row checkbox = per-file select
- Default: no rows selected
- Disable `Start Merge` until `selectedFiles.length > 0`

### 2) Review button per row
- Button label: `Review changes`
- Opens modal
- Modal embeds existing diff viewer stack (no changes to `DiffViewer` behavior)
- Diff source: `git diff target..source -- <file>`

### 3) Squash toggle compatibility
- Same start-merge screen retains existing squash option
- File selection and review coexist with squash mode

### 4) Conflict flow after start
- If selected files conflict, continue existing conflict UI flow but scoped to selected files
- Unselected-file conflicts must not block completion

---

## Architecture & Data Model Changes

### Frontend types (`RepoContext.types.ts`)
Add:
- `MergeReviewFile`
  - `path: string`
  - `status?: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'`
  - `oldPath?: string`
- `MergeReviewDiffResult` (raw diff payload compatible with existing diff renderer)
- `MergeOptions` extension:
  - existing: `squash?: boolean`
  - new: `selective?: boolean`
  - new: `selectedFiles?: string[]`

Compatibility contract:
- `selective` defaults to `false`.
- Empty `selectedFiles` is an error **only when** `selective === true`.
- Existing callers that pass only `{ squash }` continue to work unchanged.

### Frontend state (`RepoContext.tsx`)
Add state/actions:
- `mergeReviewFiles: MergeReviewFile[]`
- `isLoadingMergeReviewFiles: boolean`
- `loadMergeReviewFiles(targetBranch?: string, sourceBranch?: string): Promise<MergeReviewFile[]>`
- `loadMergeReviewFileDiff(path: string, targetBranch?: string, sourceBranch?: string): Promise<RawDiffResult | null>`

Update merge API calls:
- `startMerge(..., options)` forwards `{ squash, selective, selectedFiles }`

### Backend (`services/git_service.go`)
Extend `MergeOptions`:
- existing: `Squash bool`
- new: `Selective bool`
- new: `SelectedFiles []string`

Add methods:
1. `ListMergeReviewFiles(repoPath, targetBranch, sourceBranch) []MergeReviewFile`
   - Uses `git diff --name-status -M target..source`
   - Parses statuses `A/M/D/R/C`
2. `DiffMergeReviewFileRaw(repoPath, targetBranch, sourceBranch, filePath) RawDiffResult`
   - Uses `git diff target..source -- filePath`

Selective merge behavior in `StartMergeWithOptions()`:
- If `options.Selective && len(options.SelectedFiles) == 0` → fail fast with clear error
- Preserve existing branch checkout + merge flow
- After merge starts, neutralize unselected files so only selected files remain in staged/conflicted state

---

## Backend Selective Merge Strategy (Implementation Detail)

Goal: Keep existing merge/conflict semantics while scoping result to selected files.

1. Resolve source/target refs exactly as existing merge path (local first, fallback `origin/<branch>`).
2. Compute `allChanged = git diff --name-only target..source`.
3. Build sets:
   - `selected = normalized(selectedFiles)`
   - `unselected = allChanged - selected`
4. Run current merge start logic unchanged (`--squash` or regular).
5. For each `unselected` path, neutralize to target (`ours`) using deterministic rules:
   - If path is unmerged (`git ls-files -u -- <path>` has entries):
     - `git checkout --ours -- <path>`
     - `git add -- <path>`
   - Else tracked path:
     - `git restore --source=HEAD --staged --worktree -- <path>`
   - Else merge-introduced untracked/extra path:
     - remove from index/worktree with safe fallback (`git rm --cached --ignore-unmatch -- <path>`, then cleanup worktree if present)
6. Re-query conflicts via existing `GetConflictedFiles(repoPath)`.
7. Enforce scope:
   - keep only selected-path conflicts in response/state,
   - if any unselected conflict remains, return backend failure with actionable error.
8. Return success payload compatible with current frontend merge flow.

Safety guarantees:
- Unselected files are never left conflicted.
- Unselected files are never left staged by merge side-effects.
- Selected conflicts remain and proceed through existing resolution UI.

---

## UI Implementation Plan (Frontend)

### Phase A — Data plumbing
1. Add backend binding usage in `RepoContext.tsx`.
2. Load changed-file list after successful `checkConflictsOnly()`.
3. Store list in context for `MergeChangesPage`.
4. Reset list when target/source changes or user dismisses merge flow.

### Phase B — Review table in `ConflictCheckResultPanel`
1. Replace conflict-only preview card with changed-file table.
2. Add header checkbox + row checkboxes.
3. Add status badges (`A/M/D/R/C`) and rename display (`oldPath → path`).
4. Add `Review changes` button per row.
5. Disable `Start Merge` when nothing is selected.

### Phase C — Diff modal
1. Add modal state in `MergeChangesPage`:
   - `isReviewModalOpen`, `reviewFilePath`, `reviewDiff`, `isLoadingReviewDiff`
2. On row review click:
   - fetch branch diff via context
   - render existing `TextDiffViewer`/`DiffViewer` stack in modal
3. Keep modal minimal and theme-consistent with existing app components.

### Phase D — Start merge with selected files
1. Track selected files in page state.
2. Pass selected files to `startMerge(..., { squash, selective: true, selectedFiles })`.
3. Preserve existing success/error messaging and step transitions.

---

## Test Plan

### Backend (Go)
Add tests near merge service tests:
1. `ListMergeReviewFiles` returns expected files + statuses for `target..source`, including rename via `-M`.
2. `DiffMergeReviewFileRaw` returns valid raw diff for text and preserves binary behavior.
3. `StartMergeWithOptions` compatibility:
   - passes unchanged when `selective=false` and no selected files,
   - fails fast when `selective=true` and selected list is empty.
4. Selective clean merge keeps only selected file changes staged.
5. Selective conflict merge keeps selected conflicts and neutralizes unselected conflicts.
6. Rename/delete/add edge cases are neutralized correctly and do not block completion.

### Frontend (Vitest)
1. `MergeChangesPage` review table renders files from context.
2. Header checkbox selects/unselects all.
3. Start Merge button is disabled when selection is empty.
4. `Review changes` opens modal and requests diff.
5. `startMerge` called with `{ squash, selective: true, selectedFiles }`.
6. Existing non-selective flow remains functional without `selective` option.

---

## Rollout Sequence

1. Backend APIs + tests (`ListMergeReviewFiles`, `DiffMergeReviewFileRaw`, selective `MergeOptions`).
2. Regenerate Wails bindings.
3. RepoContext integration.
4. MergeChangesPage UI table + modal + selection gating.
5. Conflict-flow verification for selected-only behavior.
6. Regression check for existing non-selective merge UX + analytics.
7. QA on binary files, renamed/deleted/copied files, and squash/non-squash modes.

---

## Risks & Mitigations

- **Risk**: Selective semantics are subtle for rename/delete/add paths.  
  **Mitigation**: `--name-status -M` + explicit edge-case test matrix.

- **Risk**: Unselected conflicts might still block completion.  
  **Mitigation**: mandatory post-neutralization conflict recheck; fail if unselected conflict remains.

- **Risk**: Existing merge flow could regress due to new validation.  
  **Mitigation**: validation only when `selective=true`; retain old behavior by default.

- **Risk**: Large repos produce long file lists.  
  **Mitigation**: MVP keeps scroll-capped list; virtualization optional follow-up.

---

## Acceptance Criteria

1. After conflict check, user sees changed-files table with checkbox/name/status/review columns.
2. No file is selected by default.
3. Header checkbox toggles all rows.
4. `Start Merge` is disabled until at least one file is selected.
5. `Review changes` opens modal showing file diff for `target..source`.
6. Starting merge merges only selected files.
7. Conflict resolution flow only concerns selected conflicting files.
8. Works in both squash and regular merge modes.
9. Existing non-selective merge path remains backward compatible.

---

## Implementation Checklist (Execution-Ready)

### 0) Pre-flight
- [ ] Confirm branch for implementation (feature branch name)
- [ ] Confirm this plan is source of truth for API naming (`ListMergeReviewFiles`, `DiffMergeReviewFileRaw`)
- [ ] Confirm no parallel merge refactor is in-flight

### 1) Backend API + selective merge core

**File**: `services/git_service.go`
- [ ] Extend `MergeOptions` with:
  - [ ] `Selective bool \`json:"selective"\``
  - [ ] `SelectedFiles []string \`json:"selectedFiles"\``
- [ ] Add `MergeReviewFile` response type with `path/status/oldPath`
- [ ] Implement `ListMergeReviewFiles(repoPath, targetBranch, sourceBranch)`
  - [ ] Resolve refs with same rules as conflict check/merge start
  - [ ] Run `git diff --name-status -M target..source`
  - [ ] Parse A/M/D/R/C correctly
- [ ] Implement `DiffMergeReviewFileRaw(repoPath, targetBranch, sourceBranch, filePath)`
  - [ ] Use existing `RawDiffResult`
  - [ ] Set `Binary` when output indicates binary
- [ ] Update `StartMergeWithOptions`:
  - [ ] Enforce selected-files validation only when `options.Selective`
  - [ ] Keep legacy behavior when `options.Selective == false`
  - [ ] After merge starts, neutralize unselected paths (unmerged/tracked/untracked cases)
  - [ ] Re-query conflicts and fail if unselected conflicts remain

**Done when**:
- [ ] Non-selective merges behave exactly as before
- [ ] Selective merges only leave selected paths in staged/conflict sets

### 2) Backend tests

**File**: `services/git_service_test.go` (or nearest merge-focused test file)
- [ ] Add test: list review files includes statuses + rename support
- [ ] Add test: per-file branch diff returns raw diff
- [ ] Add test: selective=true with empty selection fails
- [ ] Add test: selective=false with empty selection still succeeds (compat)
- [ ] Add test: clean selective merge keeps only selected files staged
- [ ] Add test: selective conflict merge keeps selected conflicts
- [ ] Add test: rename/delete/add unselected paths neutralized correctly

**Done when**:
- [ ] New tests pass locally
- [ ] No existing merge tests regress

### 3) Regenerate Wails bindings

**File/area**: `frontend/bindings/`
- [ ] Run bindings generation command
- [ ] Confirm new methods/types are present in generated TS bindings

**Done when**:
- [ ] `RepoContext.tsx` can import and call new methods without manual type hacks

### 4) Frontend context plumbing

**File**: `frontend/src/context/RepoContext.types.ts`
- [ ] Add `MergeReviewFile` and any diff-result type used by modal
- [ ] Extend `MergeOptions` with `selective?: boolean`, `selectedFiles?: string[]`
- [ ] Extend context value with:
  - [ ] `mergeReviewFiles`
  - [ ] `isLoadingMergeReviewFiles`
  - [ ] `loadMergeReviewFiles(...)`
  - [ ] `loadMergeReviewFileDiff(...)`

**File**: `frontend/src/context/RepoContext.tsx`
- [ ] Add new state (`mergeReviewFiles`, loading flag)
- [ ] Implement loader methods using generated bindings
- [ ] On successful conflict check, load review file list
- [ ] Reset review state on dismiss/branch-change/flow reset
- [ ] Update `startMerge` to forward `{ squash, selective, selectedFiles }`

**Done when**:
- [ ] Merge page can access review files/diff loaders through context only

### 5) Merge page UI (review table + modal + gating)

**File**: `frontend/src/components/layout/pages/MergeChangesPage.tsx`
- [ ] Add selection state (`selectedFiles`, select-all behavior)
- [ ] Replace/add review step table with columns: checkbox/name/status/review
- [ ] Ensure default selection is empty
- [ ] Disable `Start Merge` when no file selected
- [ ] Add review modal state and open/close handlers
- [ ] Wire row `Review changes` to diff loader and existing viewer stack
- [ ] Pass selective options into `startMerge`
- [ ] Preserve squash toggle and existing messaging

**Done when**:
- [ ] UX matches acceptance criteria without introducing new pages/components

### 6) Frontend tests

**Files**:
- `frontend/src/components/layout/pages/MergeChangesPage*.test.tsx` (new or existing)
- `frontend/src/context/RepoContext*.test.tsx` (update as needed)

- [ ] Test review table render from context data
- [ ] Test select-all and per-row selection behavior
- [ ] Test start button disabled/enabled transitions
- [ ] Test review modal opens and requests diff
- [ ] Test `startMerge` called with selective payload
- [ ] Test existing non-selective call path remains valid

**Done when**:
- [ ] Focused tests pass for page and context

### 7) Validation + regression pass

**Commands/flows**
- [ ] Run backend merge-related tests
- [ ] Run focused frontend tests for merge page/context
- [ ] Manual check: clean selective merge
- [ ] Manual check: selective merge with conflicts
- [ ] Manual check: squash + selective
- [ ] Manual check: binary file review path

**Done when**:
- [ ] All acceptance criteria satisfied
- [ ] No regression in non-selective merge flow

### 8) PR checklist
- [ ] Include before/after screenshots of review table and modal
- [ ] Include test evidence (backend + frontend)
- [ ] Include note on compatibility behavior (`selective=false` default)
- [ ] Call out known limitations (large list virtualization deferred)
