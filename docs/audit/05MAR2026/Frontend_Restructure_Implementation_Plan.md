# Frontend Restructure Implementation Plan

**Date:** March 5, 2026  
**Project:** ControlZebra Desktop (`frontend/src`)  
**Reference:** `docs/audit/05MAR2026/Frontend_Restructure_Proposal.md`  
**Constraint:** No user-facing UX changes (architecture/hardening only)

---

## 1) Objective

Implement the restructure proposal with low risk, incremental delivery, and no behavior changes.  
Primary outcomes:

- Single-source viewer and diff-viewer routing
- Clear ownership boundaries across `app`, `shared`, `domain`, `features`, `viewers`, `widgets`
- Reduced duplicated diff routing logic
- Source-tree hygiene (remove generated artifacts and duplicate `.jsx` siblings)
- Safer runtime URL opening path via one hardened helper

---

## 2) Scope

### In scope

- Frontend folder architecture setup and progressive migration
- Diff registry + shared renderer path used by History/Explorer/Merge/Common diff flows
- Canonical file-type constants used by both viewer and diff routing
- Browser URL opening wrapper with strict allowlist and migration of current direct runtime calls
- Build/lint/CI hygiene tasks listed in proposal phase 4

### Out of scope

- New UX or visual redesign
- New workflow features
- Backend Go service behavior changes
- Large-scale API contract changes in Wails bindings

---

## 3) Delivery Model (2 sprints)

## Sprint 1 — Foundation + Diff Registry (highest ROI)

### Goals

- Establish structure and shared constants
- Implement unified diff registry/renderer path
- Remove duplicated diff routing logic from page-level components

### Work items

1. **Create target directories (no moves yet)** ✅
   - Add scaffold folders under `app`, `shared`, `domain`, `features`, `viewers/registry`, `widgets`
   - Add `README.md` ownership notes per top-level folder

2. **Introduce canonical file-type constants** ✅
   - Create `shared/constants/file-types.ts`
   - Define `IMAGE_EXTENSIONS`, `PDF_EXTENSIONS`, `MODEL_3D_EXTENSIONS`, `L5X_EXTENSIONS`
   - Add helper(s): `fileKindFromPath`, `isFileKind` style guards as needed

3. **Implement diff registry stack** ✅
   - `viewers/registry/diff-registry.ts`
   - `viewers/registry/diff-builtins.ts`
   - Register lazy diff components once (Image/PDF/3D/L5X/Text fallback)
   - Add deterministic priority ordering

4. **Add shared diff renderer abstraction** ✅
   - `viewers/components/shared/DiffRenderer.tsx` (or `renderDiffContent` utility)
   - Handle `Suspense` fallback in one place
   - Standardize error/fallback behavior

5. **Migrate call sites to unified resolution path**
   - `components/layout/pages/HistoryPage.tsx` ✅
   - `components/layout/pages/explorer/ExplorerPage.tsx` ✅
   - `components/layout/pages/merge/MergeReviewDiffModal.tsx` ✅
   - `components/common/DiffViewer.tsx` ✅

6. **Cleanup hygiene tasks (first pass)**
   - Remove generated artifacts under `src/components/**/frontend/bindings`
   - Remove duplicate `.jsx` siblings where `.tsx` equivalent exists

### Sprint 1 acceptance criteria

- All listed call sites use shared diff registry/renderer path
- No repeated `lazy(() => import(...DiffViewer))` in page-level components
- File-open and diff routes resolve from same file-type constants
- No behavior regressions in manual validation matrix (see section 6)

---

## Sprint 2 — State Boundary Refactor + Enforcement

### Goals

- Decompose repo-state responsibilities without breaking existing public contracts
- Harden runtime URL opening and enforce hygiene in tooling/CI

### Work items

1. **Repo domain decomposition (contract-stable)**
   - Extract from `RepoContext.tsx` into:
     - `domain/repo/services/repo-queries.ts`
     - `domain/repo/services/repo-commands.ts`
     - `domain/repo/polling/useStatusPolling.ts`
   - Keep context API stable for consumers in phase 1

2. **URL runtime hardening** ✅
   - Add `shared/runtime/browser.ts`
   - Allowlist schemes (`https`, and explicit internal-safe cases only)
   - Route all existing direct `Browser.OpenURL(...)` usage through this helper:
     - `RepoSwitcher`
     - `SimpleFileBrowser`
     - `GitHubDeviceFlowModal`

3. **Dependency/build hygiene**
   - Pin `@wailsio/runtime` in `frontend/package.json`
   - Add lint rule disallowing `.jsx` in `frontend/src`
   - Add CI guard to fail on generated bindings under `src/components/**/frontend/bindings`

4. **Architecture documentation**
   - Add `frontend/src/ARCHITECTURE.md`
   - Document ownership, import direction, and where new files belong

### Sprint 2 acceptance criteria

- `RepoContext` remains API-compatible for existing consuming components
- URL opening behavior is centralized and allowlist-enforced
- CI/lint catches banned file patterns and `.jsx` regressions
- Architecture doc merged and referenced from contributor docs

---

## 4) Work Breakdown by Phase (Proposal Mapping)

## Phase 1 — No behavior changes

- Scaffold folders + ownership docs ✅
- Move only constants/utilities first ✅
- Add import aliases (optional; only if it reduces churn and path brittleness)

## Phase 2 — Viewer deduplication

- Build diff registry and shared renderer ✅
- Migrate call sites one by one behind feature flag or guarded PR sequence ✅ (through PR-5 complete)

## Phase 3 — Repo state decomposition

- Extract polling hook with in-flight protection
- Separate query vs command concerns
- Preserve public context contract

## Phase 4 — Hygiene and enforcement

- Remove generated artifacts
- Remove `.jsx` in `src`
- Add lint/CI protections
- Add architecture guide

---

## 5) PR Strategy (Low Risk)

Use small, reviewable PRs with isolated blast radius:

1. `PR-1` scaffolding + file-types constants ✅
2. `PR-2` diff registry + shared renderer ✅
3. `PR-3` migrate `HistoryPage` ✅
4. `PR-4` migrate `ExplorerPage` ✅
5. `PR-5` migrate `MergeReviewDiffModal` + `common/DiffViewer` ✅
6. `PR-6` repo domain decomposition part 1 (queries/commands) ✅
7. `PR-7` polling extraction + context integration ✅
8. `PR-8` browser hardening + callsite migration ✅
9. `PR-9` lint/CI enforcement + cleanup + docs

Each PR must include:

- Behavior parity checklist
- Before/after import map for touched modules
- Manual validation evidence for affected flows

---

## 6) Validation Matrix (Must Pass)

Run after each affected PR, then full pass at sprint end:

1. **Explorer flow**
   - Open text/image/pdf/3D/L5X files
   - Open diffs for same file classes
2. **History flow**
   - Commit selection and diff rendering for same file classes
3. **Merge review flow**
   - Conflict review modal rendering for same file classes
4. **Fallback behavior**
   - Unknown extension routes to unsupported/fallback renderer
5. **Performance sanity**
   - Verify lazy chunks still load on demand (no eager heavy imports)
6. **Build/test checks**
   - `cd frontend && npm test`
   - `task dev` startup sanity
   - TypeScript compile in frontend

---

## 7) Risks and Mitigation

1. **Risk:** Silent routing drift during migration  
   **Mitigation:** Introduce compatibility tests around `fileKindFromPath` and diff resolution order.

2. **Risk:** Context decomposition breaks downstream consumers  
   **Mitigation:** Keep `RepoContext` contract stable; migrate internals only first.

3. **Risk:** Import churn causes merge conflicts during feature work  
   **Mitigation:** Timebox restructuring PRs; merge quickly; announce ownership map early.

4. **Risk:** Over-refactor beyond proposal scope  
   **Mitigation:** Enforce “no UX changes” and reject non-architectural additions in review.

---

## 8) Definition of Done

- Proposal phases 1–4 completed with all acceptance criteria met
- Duplicate diff routing removed from targeted pages/components
- Canonical file-type constants consumed by both viewer and diff systems
- Repo context responsibilities split internally with stable external API
- URL opening centralized via hardened helper
- Source tree cleaned (`.jsx` duplicates and generated artifacts removed)
- Lint/CI guards active and documented
- `frontend/src/ARCHITECTURE.md` merged

---

## 9) Ownership and Cadence

- **Frontend lead:** architecture decisions, diff registry design, final review gate
- **Feature engineers:** per-page migrations and validation scripts/checklists
- **QA/dev verification:** parity testing across explorer/history/merge flows
- **Cadence:** Daily short sync during migration week; PR merge target <24h review cycle

---

## 10) Immediate Next Actions (This Week)

1. Approve this implementation plan and lock scope boundaries.
2. Start `PR-1` (scaffold + canonical file types).
3. Start `PR-2` (diff registry + shared renderer) immediately after `PR-1` merges.
4. Prepare a shared validation checklist doc for all migration PRs.
5. Schedule sprint-end parity verification session before release branch cut.
