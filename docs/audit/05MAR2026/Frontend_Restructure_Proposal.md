# Frontend Restructure Proposal (TypeScript / Wails v3)

**Date:** March 5, 2026  
**Author Role:** Senior Frontend Engineer  
**Scope:** `ControlZebra-Desktop/frontend/src`

---

## Why restructure now

The frontend is functional, but folder ownership and boundaries are blurred in ways that slow onboarding and increase accidental complexity:

- Large cross-cutting files (`RepoContext.tsx`, `RepoSettingsPage.tsx`) hold mixed responsibilities.
- Viewers are centrally registered for file viewing, but diff viewers are selected repeatedly in multiple pages/modals with duplicated lazy imports and type-routing logic.
- Stray generated/runtime artifacts exist under source (`components/common/frontend/bindings/...`).
- Mixed extension files in same layer (`.jsx` + `.tsx`) increase tooling inconsistency.

This proposal keeps behavior unchanged while improving maintainability, performance posture, and team velocity.

---

## Key findings from current structure

## 1) Structural layout issues

- `components/layout/pages` currently acts as both feature layer and view composition layer.
- `components/common` mixes pure UI, feature components, and generated artifacts.
- `lib` combines generic helpers with product-specific routing/viewer concerns.
- Duplicate files exist in some areas (`BranchNameModal.jsx` and `BranchNameModal.tsx`, `RepoSettingsView.jsx` and `RepoSettingsView.tsx`).

## 2) Viewer loading duplication

Current code already lazy-loads heavy viewers, which is good. However, diff viewer routing is repeated in several places:

- `components/common/DiffViewer.tsx`
- `components/layout/pages/HistoryPage.tsx`
- `components/layout/pages/explorer/ExplorerPage.tsx`
- `components/layout/pages/merge/MergeReviewDiffModal.tsx`

Repeated patterns include:

- same `lazy(() => import(...))` for `ImageDiffViewer`, `PDFDiffViewer`, `Model3DDiffViewer`
- repeated file-type checks (`isImageFile`, `isPdfFile`, `is3DModelFile`, `isL5XFile`)
- repeated Suspense fallback blocks

This is maintainability duplication (not runtime bundle duplication), and it increases risk of behavior drift.

## 3) Type routing constants drift risk

File extension/type knowledge is duplicated between:

- `lib/viewers-builtin.ts` (viewer registration)
- `lib/file-utils.ts` (diff routing)

If one list changes and the other doesn’t, the app can route open-view vs diff-view inconsistently.

---

## Proposed target frontend structure

Use a feature-oriented structure with clear separation between **app bootstrap**, **shared primitives**, **domain state/services**, and **viewer system**.

```text
frontend/src/
  app/
    main.tsx
    App.tsx
    providers/
      AnalyticsProvider.tsx
      AuthProvider.tsx
      RepoProvider.tsx
    bootstrap/
      registerBuiltInViewers.ts
      registerBuiltInDiffViewers.ts

  shared/
    ui/                    # existing shadcn/radix primitives
    icons/
    constants/
      index.ts
      file-types.ts        # single source for extension groups
    hooks/
    utils/
      path.ts
      url.ts               # OpenURL-safe conversion + allowlist
      formatting.ts
    runtime/
      events.ts            # typed Wails event wrappers
      browser.ts           # safe Browser.OpenURL wrapper

  domain/
    repo/
      context/
        RepoContext.tsx
        RepoContext.types.ts
      services/
        repo-queries.ts
        repo-commands.ts
      selectors/
      polling/
        useStatusPolling.ts
    auth/
      context/
      services/

  features/
    explorer/
      pages/
      components/
      hooks/
    history/
      pages/
      components/
    merge/
      pages/
      components/
    repo-settings/
      pages/
      panels/
      hooks/
    welcome/
      pages/

  viewers/
    registry/
      viewer-registry.ts   # open-file viewer registry
      diff-registry.ts     # diff viewer registry
      builtins.ts
      diff-builtins.ts
      file-kind.ts         # maps file -> kind using shared/constants/file-types.ts
    components/
      file/
        TextViewer.tsx
        ImageViewer.tsx
        PDFViewer.tsx
        Model3DViewer.tsx
        L5XViewer.tsx
        UnsupportedViewer.tsx
      diff/
        TextDiffViewer.tsx
        ImageDiffViewer.tsx
        PDFDiffViewer.tsx
        Model3DDiffViewer.tsx
        l5x-layout-diff/
          L5XLayoutDiffViewer.tsx
      shared/
        ViewerRenderer.tsx
        ViewerHeader.tsx
        ViewerErrorBoundary.tsx
        LoadingFallback.tsx

  widgets/
    layout/
      AppLayout.tsx
      TopBar.tsx
      Sidebar.tsx
      MainArea.tsx
      StatusBar.tsx
      ActivityBar.tsx

  test/
```

---

## Viewer loading architecture (recommended)

### Goal

Keep lazy loading, but make viewer and diff-viewer selection **single-source and reusable**.

### Design

1. Keep current `viewers` registry pattern for normal file viewing.
2. Add a parallel diff registry with one API:
   - `getDiffViewerForFile(filePath, context)`
3. Move all lazy imports for diff viewers to one module:
   - `viewers/registry/diff-builtins.ts`
4. Add a generic renderer used everywhere:
   - `renderDiffContent(...)` or `<DiffRenderer ... />`

### Example registry shape

```ts
interface DiffViewerConfig {
  id: string;
  canHandle: (filePath: string, ctx: DiffContext) => boolean;
  component: React.ComponentType<DiffViewerProps> | React.LazyExoticComponent<...>;
  priority?: number;
}
```

### Where this removes duplication

- `HistoryPage.tsx` becomes: resolve config -> render `<DiffRenderer />`.
- `ExplorerPage.tsx` becomes same call path.
- `MergeReviewDiffModal.tsx` becomes same call path.
- `common/DiffViewer.tsx` uses same routing for binary types.

This removes repeated lazy imports and repeated branching logic from page-level components.

---

## File-type routing cleanup

Create one canonical source for extension groups:

- `shared/constants/file-types.ts`
  - `IMAGE_EXTENSIONS`
  - `PDF_EXTENSIONS`
  - `MODEL_3D_EXTENSIONS`
  - `L5X_EXTENSIONS`
  - helpers (`fileKindFromPath`)

Then both registries consume those constants. This avoids drift between file-open and diff behavior.

---

## “Files store” and state boundaries recommendation

Current context is very large and mixes orchestration + UI concerns. Keep React Context, but split by responsibility:

- `domain/repo/context/RepoContext.tsx`: public API + high-level state
- `domain/repo/services/repo-queries.ts`: read/query calls
- `domain/repo/services/repo-commands.ts`: mutating actions
- `domain/repo/polling/useStatusPolling.ts`: polling/in-flight guard logic

For UI-specific state, keep it local to feature modules (or `LayoutContext` only for true app-shell state).

This gives junior engineers clear file ownership and safer PR scopes.

---

## Security + runtime hardening included in restructure

- Add `shared/runtime/browser.ts` with strict scheme allowlist before opening URLs.
- Replace direct `Browser.OpenURL(...)` calls with one helper used by:
  - `RepoSwitcher`
  - `SimpleFileBrowser`
  - `GitHubDeviceFlowModal`

---

## Cleanup tasks to do immediately

1. Remove accidental generated files from source tree:
   - `components/common/frontend/bindings/github.com/wailsapp/wails/v3/internal/eventcreate.ts`
   - `components/common/frontend/bindings/github.com/wailsapp/wails/v3/internal/eventdata.d.ts`
2. Remove duplicate `.jsx` siblings where `.tsx` equivalent exists.
3. Pin `@wailsio/runtime` to a fixed version in `frontend/package.json`.

---

## Migration plan (low-risk, incremental)

## Phase 1 — No behavior changes

- Create new folders (`shared`, `domain`, `viewers/registry`, `features`).
- Move only utilities/constants first.
- Add import aliases if needed (`@/shared`, `@/features`, etc.).

## Phase 2 — Viewer deduplication

- Introduce `diff-registry.ts` and `diff-builtins.ts`.
- Replace page-level branching in:
  - `HistoryPage.tsx`
  - `ExplorerPage.tsx`
  - `MergeReviewDiffModal.tsx`
  - `common/DiffViewer.tsx`
- Keep existing viewer components unchanged.

## Phase 3 — Repo state decomposition

- Extract polling hooks with in-flight guards.
- Split query/command service wrappers.
- Keep `RepoContext` public contract stable to avoid broad breakage.

## Phase 4 — Hygiene and enforcement

- Add lint rules preventing `.jsx` in `src/`.
- Add CI check for generated files under `src/components/**/frontend/bindings`.
- Add architecture README in `frontend/src` describing ownership.

---

## Expected outcomes

- Faster onboarding: clear place for each new file.
- Lower regression risk: one routing path for viewer/diff selection.
- Cleaner runtime behavior: fewer polling edge cases and less duplicated branching.
- Better release reproducibility: pinned runtime dependencies and cleaner source tree.

---

## Recommendation to leadership

Approve this as a **2-sprint refactor track** done in parallel with feature work, with a strict rule: no UX changes, only architecture/hardening. The highest ROI item is the **unified diff viewer registry + renderer**, because it immediately reduces duplication across multiple critical workflows.
