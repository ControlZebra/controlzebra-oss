# Merge Workflow Refactor Plan (Remote → Local Merge Direction)

> **Status**: 📋 PLANNING  
> **Created**: 2026-02-23  
> **Author**: Senior Engineering  
> **Scope**: `services/git_service.go`, `services/git_service_test.go`, and merge workflow call paths

---

## Objective

Restore and hard-enforce the expected merge direction:

- **Expected**: fetch from remote, update local target branch, then merge locally.
- **Not allowed**: any flow that effectively prioritizes stale local refs in a way that can push incorrect state upstream.

Required baseline command sequence before merge execution:

```bash
git fetch origin --prune
git checkout main
git pull --ff-only origin main
```

This guarantees local `main` matches `origin/main` or fails safely.

---

## Current Findings (Code Study)

### Confirmed hotspots

- `StartMerge()` and `StartMergeWithOptions()` in `services/git_service.go` perform checkout + merge orchestration.
- `CheckBranchConflicts()` does a fetch and merge simulation (`merge-tree`) and influences merge expectations.
- A helper exists to fast-forward target to `origin/<target>` (`fastForwardTargetToOrigin`), but stale handling is not centralized as one explicit preflight contract.
- Recent uncommitted changes added selective merge logic and ref-resolution helpers (`resolveBranchRef`, `neutralizeUnselectedPaths`, etc.), increasing risk of behavioral drift if direction rules are not explicit and shared.

### Why stale branch risk still exists

- Merge baseline setup is split across multiple functions instead of one mandatory preflight.
- Conflict-check and merge-start ref resolution can diverge if they do not consume the same canonical target/source refs.
- Source/target ref selection currently has multiple decision points, which can regress directionality in future edits.

---

## Critical Constraint: Mixed Uncommitted Changes (Recovery Plan First)

Junior engineer changes are uncommitted and mixed with other needed work. Before refactor implementation, preserve work with a reversible split workflow.

### Step 0 — Preserve all work safely

1. Create a safety branch from current HEAD:
   - `git checkout -b wip/merge-refactor-recovery-2026-02-23`
2. Snapshot everything (including untracked) as emergency backup:
   - `git stash push -u -m "pre-merge-refactor-full-snapshot"`
3. Reapply snapshot for selective extraction:
   - `git stash apply stash^{/pre-merge-refactor-full-snapshot}`

### Step 1 — Split mixed edits into logical commits (no data loss)

1. Stage only merge-direction refactor hunks interactively:
   - `git add -p services/git_service.go services/git_service_test.go frontend/src/context/RepoContext.tsx`
2. Commit refactor-only chunk:
   - `git commit -m "refactor: enforce remote-to-local merge preflight"`
3. Stage and commit unrelated-but-needed changes separately.
4. Keep optional leftovers in a dedicated stash:
   - `git stash push -u -m "leftover-nonrefactor-wip"`

This isolation is required before code changes so review and rollback remain clean.

---

## Refactor Design

## 1) Add one canonical preflight for merge workflows

Create a single helper in `services/git_service.go` (used by all merge-entry methods):

- Proposed helper: `prepareMergeTargetBaseline(repoPath, targetBranch string) (originalBranch string, err error)`
- Responsibilities:
  1. Validate repo + remote availability (`origin` preferred, fallback policy explicit).
  2. Run `git fetch origin --prune`.
  3. Checkout target branch (`git checkout <target>`).
  4. Run strict fast-forward update from remote:
     - `git pull --ff-only origin <target>`
  5. Return deterministic error if ff-only fails (divergence, missing upstream, auth, etc.).

Important: do not continue merge on preflight failure.

## 2) Unify ref resolution between conflict-check and merge-start

Standardize ref resolution into shared helpers and use them consistently:

- Target baseline for execution must always be updated local target after preflight.
- Conflict check should resolve refs using the same rules as merge execution (no hidden alternate path).
- Keep deterministic merge semantics:
  - merge source **into** target, never reversed.

## 3) Apply preflight to all merge entry points

Update these methods to consume the same preflight:

- `StartMerge(...)`
- `StartMergeWithOptions(...)`

Behavior contract:

1. Save original branch.
2. Run canonical preflight on target branch.
3. Resolve source ref.
4. Run merge (`--squash` or regular) locally.
5. On any hard failure before merge start, return user to original branch where safe.

## 4) Keep selective merge logic but run it after baseline is guaranteed

Existing selective flow remains, but only after target baseline is guaranteed fresh:

- Determine selected/unselected paths.
- Run merge.
- Neutralize unselected paths.
- Validate no unselected conflicts remain.

No selective behavior should bypass preflight.

## 5) Improve error messaging for stale/diverged target

Map ff-only failures to actionable UX-safe errors:

- Example:
  - `Target branch is not fast-forwardable to origin/main. Resolve divergence first (rebase or manual merge), then retry.`

This avoids accidental merge commits during baseline update.

---

## Frontend/Binding Alignment Plan

Minimal, surgical updates only if required by backend changes:

1. Keep current merge UI flow (`RepoContext.tsx`) intact.
2. Ensure backend error surfaces unchanged fields (`success`, `error`, `message`) so UI handling remains stable.
3. If new typed error codes are added, update only `RepoContext` mapping logic, not page UX.

No new UX components required for this refactor.

---

## Test Plan (Mandatory)

Add/adjust tests in `services/git_service_test.go`.

### A. Preflight correctness

1. `StartMergeWithOptions` runs fetch + ff-only baseline update before merge.
2. Local stale `main` behind `origin/main` is updated before merge starts.
3. Diverged local `main` causes ff-only failure and aborts merge.

### B. Directionality safety

4. Merge simulation and execution both treat operation as `source -> target` consistently.
5. No test path allows reversed remote update behavior.

### C. Existing selective merge compatibility

6. Selective merge still works with updated baseline sequence.
7. Unselected conflicts remain blocked and reported correctly.

### D. Regression checks

8. Existing test `TestStartMergeWithOptions_UsesUpdatedOriginTargetForConflicts` remains green and is extended to assert ff-only preflight behavior explicitly.

---

## Implementation Sequence (Step-by-Step)

1. Isolate mixed uncommitted work into clean commit slices (Recovery Plan above).
2. ✅ Add canonical preflight helper for target baseline update. *(Completed 2026-02-23)*
3. ✅ Refactor `StartMerge` and `StartMergeWithOptions` to call preflight first. *(Completed 2026-02-23)*
4. ✅ Align branch/ref resolution helpers so conflict-check and execution share rules. *(Completed 2026-02-23)*
5. ✅ Update/extend backend tests for ff-only stale/diverged scenarios. *(Completed 2026-02-23)*
6. ✅ Run focused tests: *(Completed 2026-02-23)*
   - `go test ./services -run "Merge|Conflict|Pull|Sync" -v`
7. ✅ Run full service suite: *(Completed 2026-02-23)*
   - `go test ./services/... -v`
8. Validate UI behavior manually through merge flow (no UX changes expected).

---

## Risks & Mitigations
Users
- **Risk**: Preflight checkout mutates current branch unexpectedly during dry-run checks.  
  **Mitigation**: Restrict branch-switching preflight to actual merge-start methods; keep conflict checks read-mostly with shared resolution rules.

- **Risk**: Existing selective merge edge cases regress after helper extraction.  
  **Mitigation**: Lock behavior with focused selective-merge tests before/after refactor.

- **Risk**: Multiple remotes (`origin` absent) break baseline assumptions.  
  **Mitigation**: Explicit remote selection policy (prefer `origin`, else fail with clear instruction for this workflow).

---

## Definition of Done

- One shared merge preflight exists and is called by all merge start paths.
- Preflight enforces:
  - `fetch origin --prune`
  - `checkout <target>`
  - `pull --ff-only origin <target>`
- Merge direction is consistently source into updated local target.
- Divergence fails safely (no accidental merge commit baseline update).
- Existing selective merge behavior remains functional.
- Backend tests cover stale, diverged, and selective paths.
