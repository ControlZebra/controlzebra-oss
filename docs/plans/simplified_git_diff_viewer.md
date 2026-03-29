# Simplified Branch Compare Diff Implementation Plan

> **Status**: 📋 PLANNING  
> **Created**: 2026-03-18  
> **Author**: Engineering  
> **Scope**: Simplify branch-to-branch diff rendering by replacing mode-specific viewer contracts with one two-snapshot contract that also works for LFS-backed image and PDF files.

---

## 1) Goal

Reduce the current diff-viewer complexity to one core concept:

- every diff viewer receives an **old snapshot** and a **new snapshot**,
- each snapshot is either a Git ref, a working-tree file, or a missing side,
- viewers no longer need to understand whether they were opened from history, working tree, or merge review.

This keeps merge review correct for `target..source`, fixes the `.l5x` gap, and avoids introducing more viewer-specific modes.

---

## 2) Problem With The Current Direction

Today the frontend diff system is shaped around app-specific modes:

- `working`
- `commit`
- and the current merge-review work naturally pushes toward adding a third mode such as `merge-review`

That makes the system harder to reason about because each specialized viewer must answer two separate questions:

1. What file type am I handling?
2. What diff scenario am I handling?

That coupling is the source of the current complexity:

- L5X has separate working and commit viewer paths.
- Image/PDF viewers use different loader assumptions depending on call site.
- Merge review already has the correct branch refs, but the viewer layer cannot use them directly.

The result is a widening matrix of special cases.

---

## 3) Simplifying Principle

Do not represent diffs as viewer modes.

Represent diffs as **two resolved content snapshots**.

Each viewer should only need to know:

- what is the old side?
- what is the new side?
- how do I load bytes/text for each side?

Everything else belongs in the adapter layer that builds the request.

---

## 4) Target Contract

### 4.1 Snapshot Types

```ts
type DiffSide =
  | { kind: 'ref'; ref: string; path: string }
  | { kind: 'working'; absolutePath: string; path: string }
  | { kind: 'missing'; path: string };
```

### 4.2 Unified Viewer Request

```ts
interface DiffRenderRequest {
  repoPath: string;
  filePath: string;
  fileStatus?: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | string;
  oldPath?: string;
  oldSide: DiffSide;
  newSide: DiffSide;
  binary?: boolean;
  fileDiff?: unknown;
  showHeader?: boolean;
}
```

### 4.3 Examples

#### Commit history diff

```ts
oldSide = { kind: 'ref', ref: parentHash ?? `${commitHash}^`, path: oldPath ?? filePath }
newSide = { kind: 'ref', ref: commitHash, path: filePath }
```

#### Working tree diff

```ts
oldSide = { kind: 'ref', ref: 'HEAD', path: oldPath ?? filePath }
newSide = { kind: 'working', absolutePath: absoluteFilePath, path: filePath }
```

#### Merge review diff

```ts
oldSide = { kind: 'ref', ref: targetRef, path: oldPath ?? filePath }
newSide = { kind: 'ref', ref: sourceRef, path: filePath }
```

#### Added file

```ts
oldSide = { kind: 'missing', path: oldPath ?? filePath }
newSide = { kind: 'ref' | 'working', ... }
```

#### Deleted file

```ts
oldSide = { kind: 'ref', ... }
newSide = { kind: 'missing', path: filePath }
```

---

## 5) Why This Handles LFS Cleanly

The backend already has the correct low-level primitives:

- `ReadFileAtRevisionLarge(repoPath, filePath, revision)` for text-based or large structured content
- `GetFileAtRevisionBase64(repoPath, filePath, revision)` for binary content

These already:

- use Git object reads rather than the checked-out filesystem,
- apply Git filters,
- attempt LFS resolution when a pointer is encountered,
- work for branch refs as well as commits.

That means the correct rule for merge review becomes simple:

- if a side is `kind: 'ref'`, load it through Git,
- if a side is `kind: 'working'`, load it from the filesystem,
- if a side is `kind: 'missing'`, treat it as absent.

This is especially important for:

- **PDF files in Git LFS**
- **image files in Git LFS**
- **large `.l5x` files**

No synthetic filesystem path is needed for branch compare.

---

## 6) Proposed Architecture

### 6.1 Keep Registry Matching By File Type Only

The diff registry should decide:

- text
- image
- pdf
- model3d
- l5x

It should not decide between:

- working tree
- commit history
- merge review

That removes the current branching seen in entries such as `l5x-working` vs `l5x-commit`.

### 6.2 Move Diff-Scenario Translation To One Adapter Layer

Each call site converts its own domain data into `oldSide` and `newSide`:

- history diff page
- explorer/working-tree diff
- merge review modal

After that, viewer components all operate on the same contract.

### 6.3 Use Shared Side Loaders

Create shared viewer-side utilities:

```ts
async function loadTextSide(repoPath: string, side: DiffSide): Promise<string | null>
async function loadBinarySide(repoPath: string, side: DiffSide): Promise<BinaryPayload | null>
```

Rules:

- `missing` -> `null`
- `ref` -> backend Git-based loader
- `working` -> filesystem loader

This removes duplicate loading logic from specialized viewers.

---

## 7) Implementation Phases

### Phase 1 — Add Snapshot Metadata Without Breaking Existing Call Sites

**Files**:

- `frontend/src/viewers/registry/diff-registry.ts`
- `frontend/src/context/RepoContext.types.ts`
- `frontend/src/context/RepoContext.tsx`

**Tasks**:

1. Extend merge review types to include backend-provided `targetRef` and `sourceRef`.
2. Add `DiffSide` and the new `oldSide/newSide` fields to the viewer contract.
3. Keep old fields (`mode`, `commitHash`, `parentHash`, `absoluteFilePath`) during migration.
4. Document precedence rules:
   - if `oldSide/newSide` exist, viewers use them,
   - otherwise existing mode-based behavior continues.

**Acceptance**:

- No current diff path breaks.
- Merge review payload finally exposes branch refs to the viewer layer.

### Phase 2 — Normalize Call Sites Into Old/New Sides

**Files**:

- merge review modal
- history diff entry points
- working-tree diff entry points

**Tasks**:

1. Build one normalized request object per file open event.
2. Apply explicit add/delete/rename rules in the adapter.
3. Stop teaching viewers about page-level semantics.

**Acceptance**:

- Every diff entry point constructs a complete `oldSide/newSide` request.
- Rename and deleted-file handling is deterministic.

### Phase 3 — Introduce Shared Side Loaders

**Files**:

- new viewer utility file for text/binary side loading
- specialized viewers that currently own mode-specific loading logic

**Tasks**:

1. Implement shared loaders for text and binary sides.
2. Route all `ref` loads through the existing LFS-aware backend APIs.
3. Centralize error shaping for missing files and LFS-unavailable content.

**Acceptance**:

- Viewers stop duplicating Git-vs-filesystem branching.
- Merge review branch compare automatically works with LFS-aware loaders.

### Phase 4 — Collapse Specialized Viewers Onto The New Contract

**Files**:

- `L5XLayoutDiffViewer`
- `ImageDiffViewer`
- `PDFDiffViewer`
- `Model3DDiffViewer`
- `diff-builtins.tsx`

**Tasks**:

1. Replace separate working/commit viewer variants with single viewers where practical.
2. Keep L5X on the layout diff viewer and finish moving its loading path fully onto the two-side contract.
3. Convert PDF to load old/new PDFs from sides rather than from mode assumptions.
4. Convert image diff loading to use side-based assets.
5. Leave text fallback intact throughout the migration.

**Acceptance**:

- `.l5x` merge review opens the layout diff viewer.
- PDF/image merge review compares `target` vs `source`, not `HEAD` vs working tree.
- History and explorer flows still work.

### Phase 5 — Remove Legacy Mode-Specific Diff Branching

**Files**:

- diff registry
- specialized viewers
- any adapters still using `mode` as primary behavior

**Tasks**:

1. Remove `working`/`commit` branching where no longer needed.
2. Delete superseded specialized viewer variants.
3. Simplify registry registration to file-type-only decisions.

**Acceptance**:

- The diff system is expressed primarily in terms of sides, not modes.
- There is no separate merge-review viewer contract.

---

## 8) File-Type Guidance

### 8.1 L5X

Target end state:

- one L5X layout diff viewer,
- loads both sides as text using the shared text loader,
- runs the existing parse/diff pipeline on the loaded contents.

This keeps the current layout-based L5X experience while removing the last scenario-specific loader assumptions.

### 8.2 PDF

Target end state:

- one PDF viewer,
- loads two binary sides using `GetFileAtRevisionBase64` or `ReadFileBase64` via the shared side loader,
- preserves existing page-render and pixel-compare logic.

This is the cleanest path for LFS-backed PDFs.

### 8.3 Image

Two acceptable implementations:

1. Preferred simplification:
   - load both sides as binary payloads,
   - compare them in the frontend similarly to PDF.
2. Transitional simplification:
   - create one generic backend compare method that accepts `oldSide/newSide`,
   - stop having separate backend entry points for commit vs working tree vs merge review.

Either option is simpler than maintaining separate scenario-specific image diff methods.

### 8.4 3D

Same rule as PDF/image:

- load explicit old/new assets from sides,
- never infer content from the checked-out working tree during merge review.

---

## 9) Migration Strategy

### Option A — Lowest Risk

Use a compatibility layer first.

Add:

- `oldSide?`
- `newSide?`

to the existing request, but keep:

- `mode`
- `commitHash`
- `parentHash`
- `absoluteFilePath`

During migration:

- specialized viewers prefer `oldSide/newSide` when present,
- otherwise they fall back to the old mode-based behavior.

This allows merge review to move first without forcing a full rewrite.

### Option B — Cleanest End State

Move directly to the new contract and refactor viewers in one pass.

This is cleaner architecturally, but higher risk because it touches more existing flows at once.

### Recommendation

Use **Option A** first, then remove the legacy fields in a follow-up cleanup.

---

## 10) Testing Plan

### Frontend tests

1. Merge review builds `oldSide/newSide` from `targetRef/sourceRef`.
2. Added, deleted, and renamed files build correct side descriptors.
3. Registry resolution depends on file type, not merge-review-specific mode.
4. L5X specialized viewer is selected for merge review.
5. Text fallback still works when specialized loading fails.

### Backend tests

1. `DiffMergeReviewFileRaw(...)` returns stable `targetRef/sourceRef`.
2. `GetFileAtRevisionBase64(...)` resolves LFS-backed PDF/image content for branch refs.
3. `ReadFileAtRevisionLarge(...)` handles large L5X content at non-HEAD refs.
4. Rename/delete/add paths are stable for both old and new side loads.

### Manual QA

1. Modified L5X across branches.
2. Renamed L5X across branches.
3. Image stored in LFS across branches.
4. PDF stored in LFS across branches.
5. Deleted binary file in merge review.
6. Existing working-tree diff in explorer.
7. Existing commit-history diff in history page.

---

## 11) Risks And Tradeoffs

### Risk: Migration spans several viewer types

Mitigation:

- keep text fallback untouched,
- add compatibility fields during migration,
- convert viewers one at a time.

### Risk: Image viewer may still depend on backend-produced diff artifacts

Mitigation:

- allow a transitional backend compare adapter,
- but ensure it accepts explicit old/new sides rather than scenario-specific flags.

### Risk: Registry changes could regress existing viewer selection

Mitigation:

- add targeted registry tests for representative file types and contexts.

---

## 12) Definition Of Done

This plan is complete when all of the following are true:

1. Merge review is represented as `target` snapshot vs `source` snapshot.
2. `.l5x` merge review uses the structured viewer instead of text fallback.
3. Image and PDF merge review use explicit branch-side content loads and remain compatible with Git LFS.
4. Viewers no longer need a dedicated merge-review mode.
5. Existing working-tree and history diff flows still behave as before.
6. The registry primarily routes by file type, not by diff scenario.

---

## 13) Relationship To Existing Plans

This document should be used as the implementation simplification companion to:

- `docs/plans/L5X_MERGE_DIFF_FIX_PLAN.md`
- `docs/plans/MERGE_BRANCH_DIFF_CONTRACT_PLAN.md`

Those documents correctly identify the branch-compare correctness problem.
This plan narrows the implementation approach:

- do not add more scenario-specific viewer modes,
- reduce the system to a two-snapshot contract,
- reuse existing LFS-aware ref loaders wherever possible.