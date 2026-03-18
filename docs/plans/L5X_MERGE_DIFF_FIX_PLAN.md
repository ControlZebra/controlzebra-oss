# L5X Merge Review Diff Fix Plan

> **Status**: 📋 PLANNING  
> **Created**: 2026-03-17  
> **Author**: Engineering  
> **Scope**: Why L5X is not using the specialized merge diff viewer today, and the correct path to fix it without breaking merge review semantics.

---

## 1) Problem Statement

In the Merge Changes review modal, image and PDF files can open a specialized viewer, but `.l5x` files do not. Instead of the structured L5X diff experience, merge review falls back to the generic text diff path.

This is not just an isolated L5X wiring bug. The current merge review modal is reusing the **working-tree diff contract** for a **branch-to-branch** comparison (`target..source`). L5X is the first viewer that fails hard under that mismatch; image and PDF happen to render, but they are using the wrong comparison semantics.

---

## 2) What I Verified

### Frontend merge review flow

- `frontend/src/features/merge/components/MergeReviewDiffModal.tsx`
  - Calls `DiffRenderer` with:
    - `mode="working"`
    - `filePath={activeViewerPath}`
    - `fileDiff={reviewDiff}`
    - **no** `absoluteFilePath`

### Diff registry rules

- `frontend/src/viewers/registry/diff-builtins.tsx`
  - L5X working diff viewer only activates when all of these are true:
    - file kind is `l5x`
    - `mode === 'working'`
    - `repoPath` exists
    - `absoluteFilePath` exists
  - Image and PDF diff viewers only require:
    - matching file type
    - `repoPath`

### L5X working diff implementation

- `frontend/src/viewers/components/diff/l5x-diff/L5XWorkingDiffViewer.tsx`
  - Loads old side from `HEAD` using `ReadFileAtRevision`
  - Loads new side from the filesystem using `ReadTextFile(absoluteFilePath)`
  - This viewer is explicitly designed for **HEAD vs working tree**, not **target branch vs source branch**

### Merge-review backend payload

- `services/git_service.go`
  - `DiffMergeReviewFileRaw(...)` already resolves and stores:
    - `TargetRef`
    - `SourceRef`
  - These are the correct branch-side refs for a merge review snapshot

### Frontend merge-review type gap

- `frontend/src/domain/repo/context/RepoContext.types.ts`
  - `MergeReviewDiffResult` currently omits `targetRef` and `sourceRef`
  - So the modal cannot pass correct branch refs to specialized viewers even though the backend already returns them

---

## 3) Root Cause

There are **two layers** to the failure.

### Root Cause A: L5X viewer is never selected

The merge review modal passes `mode="working"` but does not pass `absoluteFilePath`.

The diff registry requires `absoluteFilePath` for `l5x-working`, so `.l5x` files do not match the L5X viewer entry and fall through to the text diff renderer.

### Root Cause B: Merge review is using the wrong diff contract

Merge review is comparing `target..source`, but the specialized viewer path is being invoked as though the user is viewing local uncommitted changes.

That means:

- L5X cannot work because it needs a real filesystem path for the working-tree side.
- Image/PDF can render because their viewers do not require `absoluteFilePath`, but they still load data using working-tree assumptions (`HEAD` vs local file), not true branch-to-branch data.

So the visible L5X failure is real, but the larger issue is that merge review currently lacks a dedicated **branch-compare diff contract** for specialized viewers.

---

## 4) Non-Goal / Wrong Fix To Avoid

Do **not** fix this by simply inventing an `absoluteFilePath` in the merge modal.

Example of the wrong approach:

- constructing `absoluteFilePath = repoPath + '/' + filePath`
- letting `L5XWorkingDiffViewer` read the current working tree file

That would make L5X render in some cases, but it would still compare:

- old side = `HEAD`
- new side = current checked-out file on disk

instead of:

- old side = merge target branch
- new side = merge source branch

That would produce misleading merge review output.

---

## 5) Correct Fix Strategy

Implement merge review as a **branch-compare** viewer mode instead of pretending it is a working-tree diff.

### Phase 1 — Normalize merge review payload

**Files**:

- `frontend/src/domain/repo/context/RepoContext.types.ts`
- `frontend/src/domain/repo/context/RepoContext.tsx`

**Changes**:

1. Extend `MergeReviewDiffResult` to include the backend refs already returned by `RawDiffResult`:
   - `targetRef?: string`
   - `sourceRef?: string`
2. Optionally normalize these into a more explicit structure:
   - `revisions.oldRef = targetRef`
   - `revisions.newRef = sourceRef`
3. Preserve `path`, `oldPath`, `status`, `binary`, `rawDiff`, and error fields.

**Done when**:

- Merge modal has enough metadata to tell any specialized viewer exactly what the old and new branch snapshots are.

### Phase 2 — Add merge-review diff mode to the registry contract

**Files**:

- `frontend/src/viewers/registry/diff-registry.ts`
- `frontend/src/viewers/registry/diff-builtins.tsx`
- `frontend/src/features/merge/components/MergeReviewDiffModal.tsx`

**Changes**:

1. Add a dedicated diff mode, for example:
   - `mode: 'merge-review'`
2. Extend `DiffRenderRequest` with branch-side metadata:
   - `targetRef?: string`
   - `sourceRef?: string`
   - optional `compareContext?: 'target-source'`
3. Make `MergeReviewDiffModal` build one normalized viewer request from `reviewDiff` instead of forcing `mode='working'`.

**Done when**:

- Merge review no longer depends on working-tree-only assumptions.

### Phase 3 — Add L5X branch-compare viewer path

**Files**:

- `frontend/src/viewers/components/diff/l5x-diff/L5XDiffViewer.tsx`
- `frontend/src/viewers/components/diff/l5x-diff/L5XWorkingDiffViewer.tsx`
- `frontend/src/viewers/registry/diff-builtins.tsx`

**Preferred implementation**:

Create a merge-review-specific L5X entry that:

1. Loads old content from `targetRef` using `ReadFileAtRevisionLarge(repoPath, effectiveOldPath, targetRef)`
2. Loads new content from `sourceRef` using `ReadFileAtRevisionLarge(repoPath, effectiveNewPath, sourceRef)`
3. Reuses the existing parser/diff pipeline:
   - `parseString(...)`
   - `diffControllers(...)`
   - `DiffChangeStream`
4. Handles status cases correctly:
   - `added`: no old side
   - `deleted`: no new side
   - `renamed`: `oldPath` on old side, `path` on new side

**Implementation note**:

This can be a new component, or `L5XDiffViewer` can be extended with an explicit branch-compare mode. Reusing the existing commit-style loader is preferable to reusing the working-tree loader.

**Done when**:

- `.l5x` merge review opens the structured L5X diff UI using branch refs, not filesystem state.

### Phase 4 — Bring image/PDF/3D onto the same contract

**Files**:

- `frontend/src/viewers/components/diff/ImageDiffViewer.tsx`
- `frontend/src/viewers/components/diff/PDFDiffViewer.tsx`
- `frontend/src/viewers/components/diff/Model3DDiffViewer.tsx`
- supporting backend/helper APIs as needed

**Changes**:

1. Add a branch-compare code path for specialized binary viewers.
2. Stop using working-tree loaders for merge review.
3. Fetch old/new assets from the resolved target/source refs.

**Why this is required**:

Image and PDF are currently only “working” in the sense that a viewer appears. They are not guaranteed to show the actual `target..source` comparison.

**Done when**:

- All specialized merge review viewers share the same branch-compare semantics.

### Phase 5 — Hardening and test coverage

**Frontend tests**:

1. Merge review for `.l5x` resolves to the L5X specialized viewer.
2. Merge review request carries `targetRef` and `sourceRef` into the viewer layer.
3. Rename and delete cases resolve correct old/new paths.
4. Unknown binary types still show deterministic fallback.

**Backend tests**:

1. `DiffMergeReviewFileRaw(...)` returns `targetRef` and `sourceRef`.
2. Ref resolution is stable for local and remote-tracking branches.
3. Rename/delete/add cases preserve path metadata.

**Manual QA**:

1. Modified `.l5x` file between branches.
2. Renamed `.l5x` file.
3. Added/deleted `.l5x` file.
4. Modified image and PDF between branches to confirm contract correctness.

---

## 6) Recommended Delivery Order

1. Phase 1 and Phase 2 first.
2. Phase 3 immediately after, to fix the visible L5X issue.
3. Phase 4 next, to remove incorrect semantics from image/PDF/3D merge review.
4. Phase 5 before release.

This keeps the first visible fix on L5X while still correcting the underlying contract problem.

---

## 7) Acceptance Criteria

This plan is complete when all of the following are true:

1. `.l5x` merge review opens the structured L5X diff viewer instead of text fallback.
2. Merge review compares **target branch vs source branch**, not working tree vs `HEAD`.
3. Rename/add/delete cases render correct old/new paths for specialized viewers.
4. Image, PDF, 3D, and L5X all use the same merge-review diff contract.
5. Existing explorer and history diff flows remain unchanged.

---

## 8) Relationship To Existing Plans

This plan is the concrete investigation follow-up for the current user-visible `.l5x` gap.

Related broader planning already in the repo:

- `docs/plans/MERGE_BRANCH_DIFF_CONTRACT_PLAN.md`
- `docs/plans/L5X_DIFF_VIEWER_PLAN.md`

Use this document as the execution entry point for the merge-review bug, and keep the broader contract plan as the long-lived reference for cross-file-type consistency.