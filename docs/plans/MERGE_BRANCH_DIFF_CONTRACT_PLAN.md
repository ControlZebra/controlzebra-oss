# Merge Review Branch-to-Branch Diff Contract Plan (Q1)

> **Status**: 📋 PLANNING  
> **Created**: 2026-02-24  
> **Author**: Engineering  
> **Scope**: Merge review file list + modal diff data contract for consistent `source` vs `target` branch comparison.

---

## 1) Goal

Establish one **single diff contract** for merge review so every file type (text, image, PDF, 3D, later L5X-specialized) reads from the same backend compare source:

- compare basis: `target..source` (already agreed),
- deterministic path handling for rename/delete,
- one payload shape consumed by all viewers.

This removes ambiguity from mixing working-tree semantics with merge-review semantics.

---

## 2) Why This Matters

Current merge review UI can render specialized viewers, but some viewers naturally assume:
- working tree vs HEAD, or
- commit vs parent.

Merge review is different: it should always represent **branch-to-branch**.  
If the data contract is inconsistent, users can see misleading previews.

---

## 3) Product Decisions Already Locked

From stakeholder decisions:
1. Rename display/load rule:
   - Display: `oldPath → path`
   - Active load path: `path`, except `deleted` uses `oldPath`.
2. Unsupported binary: show `Cannot preview this binary file`.
3. Modal behavior: freeze to snapshot opened (no auto-refresh while open).

These are included in this plan and should not be reopened.

---

## 4) Target Contract (Backend -> Frontend)

## 4.1 File list payload (review table)

```ts
interface MergeReviewFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  binary?: boolean;
}
```

Source command baseline:
- `git diff --name-status -M target..source`

## 4.2 Per-file diff payload (review modal)

```ts
interface MergeReviewDiffResult {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  binary?: boolean;
  rawDiff?: string;      // for text diffs
  hasError?: boolean;
  error?: string;

  // new (Q1) – immutable snapshot fields for specialized viewers
  compareContext?: {
    sourceBranch: string;
    targetBranch: string;
    mode: 'two-dot';     // target..source
    openedAt: string;    // ISO timestamp
  };

  // new (Q1) – binary viewer hint payload
  revisions?: {
    // for branch-to-branch fetch when viewer needs explicit refs
    oldRef?: string;     // target branch ref/commit
    newRef?: string;     // source branch ref/commit
    oldPath?: string;
    newPath?: string;
  };
}
```

---

## 5) Proposed Backend API Additions

In `services/git_service.go` (or related service layer), add/extend:

1. `ListMergeReviewFiles(repoPath, targetBranch, sourceBranch)`
2. `DiffMergeReviewFileRaw(repoPath, targetBranch, sourceBranch, filePath)`
3. `GetMergeReviewBinaryAsset(repoPath, ref, filePath)` **(new helper endpoint)**

### 5.1 Why endpoint #3 is needed

Specialized viewers currently load by working-tree/commit assumptions. For true branch compare, they need stable bytes for:
- old side = `target` (or merge-base variant in future),
- new side = `source`.

`GetMergeReviewBinaryAsset` returns bytes/base64 for a specific `ref + filePath`, so image/PDF/3D viewers can compare the correct pair.

---

## 6) Frontend Implementation Phases

## Phase A — Contract-safe data plumbing

Files:
- `frontend/src/context/RepoContext.types.ts`
- `frontend/src/context/RepoContext.tsx`

Tasks:
1. Extend `MergeReviewDiffResult` with `compareContext` and `revisions`.
2. Populate those fields from backend response.
3. Keep backward compatibility (if fields absent, fallback to existing text behavior).

Acceptance:
- Existing merge review still works for text files.
- No regression in `HistoryPage` or working-tree flows.

## Phase B — Modal viewer input normalization

File:
- `frontend/src/components/layout/pages/merge/MergeReviewDiffModal.tsx`

Tasks:
1. Build a single `effectiveViewerInput` object from `reviewDiff`.
2. Apply fixed rules:
   - display label uses rename arrow,
   - active path rule from decision #1,
   - unsupported binary message from decision #2.
3. Use `reviewDiff` snapshot only (freeze behavior, decision #3).

Acceptance:
- Closing/reopening modal on same file reproduces identical content.
- Rename + delete paths render correctly in header and viewer requests.

## Phase C — Specialized viewers branch-aware adapter

Files:
- `frontend/src/components/viewers/ImageDiffViewer.tsx`
- `frontend/src/components/viewers/PDFDiffViewer.tsx`
- `frontend/src/components/viewers/Model3DDiffViewer.tsx`
- optional adapter file: `frontend/src/components/viewers/merge-review/BranchCompareAdapter.ts`

Tasks:
1. Add optional props:
   - `compareMode?: 'working' | 'commit' | 'branch-compare'`
   - `oldRef?`, `newRef?`, `oldPath?`, `newPath?`
2. In `branch-compare`, fetch both sides via merge-review binary endpoint.
3. Preserve current behavior for existing call sites (history + explorer).

Acceptance:
- Image/PDF/3D modal comparisons for merge review use target/source bytes, not working-tree guess.
- Existing history and explorer flows remain unchanged.

## Phase D — Telemetry + error hardening

Files:
- `RepoContext.tsx`, viewer components

Tasks:
1. Add structured warnings when compare context missing.
2. Emit analytics/event labels (`merge_review_diff_contract_fallback`, `merge_review_branch_compare_used`).
3. Fail closed for unsupported binary (`Cannot preview this binary file`).

Acceptance:
- No silent fallback without logs.
- Product can monitor fallback rates post-release.

---

## 7) Effort Estimate

- **MVP Q1**: 2-4 days
  - contract fields, modal normalization, adapter for one specialized viewer first.
- **Full Q1 across image/PDF/3D**: 5-8 days
  - all viewer adapters, tests, and fallback telemetry.

Risk drivers:
- viewer internals assume current data-loading shape,
- rename/deleted edge cases across binary types,
- payload size/performance for large binaries.

---

## 8) Test Plan

## Backend tests (`services/*_test.go`)
1. `ListMergeReviewFiles` status parsing for `A/M/D/R/C`.
2. `DiffMergeReviewFileRaw` includes stable `compareContext` and `revisions`.
3. Binary asset fetch by `ref + path` handles rename/deleted gracefully.

## Frontend tests (Vitest)
1. Modal renders rename display rule correctly.
2. Active viewer path rule honors deleted-file exception.
3. Unsupported binary message appears for unknown binary extensions.
4. Snapshot freeze: modal does not change with background context updates.
5. Specialized viewer in `branch-compare` mode requests old/new refs from payload.

Manual checks:
- renamed image,
- deleted PDF,
- modified 3D file,
- unsupported binary (e.g., `.bin`).

---

## 9) Rollout Strategy

1. Ship Phase A+B behind no flag (low risk, mostly contract + modal normalization).
2. Phase C by file-type batches:
   - first image,
   - then PDF,
   - then 3D.
3. Track fallback telemetry for one beta cycle.
4. Only after stable fallback near zero, start Q2 (`.l5x` specialized merge review compare).

---

## 10) Open Follow-up (Q2, not in this plan)

After Q1 is stable, decide for L5X:
- keep text fallback in merge review, or
- add branch-aware L5X structural diff endpoint + viewer mode.

This is intentionally deferred to avoid blocking Q1 delivery.

---

## 11) Definition of Done

Q1 is done when all are true:
1. Merge review modal always represents `target..source` semantics.
2. Text and specialized viewers consume one normalized contract.
3. Rename/delete path rules match agreed behavior.
4. Unsupported binary behavior is deterministic.
5. Modal content remains frozen for its open session.
6. No regressions in history or explorer diff flows.
