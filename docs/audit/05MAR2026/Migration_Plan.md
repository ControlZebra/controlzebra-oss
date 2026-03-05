# Frontend Restructure — File Migration Plan

**Date:** March 5, 2026  
**Based on:** `Frontend_Restructure_Proposal.md`  
**Scope:** `frontend/src/`

---

## Current State Summary

The new directory skeleton is in place with README files and some initial implementations:

| New Directory | Status | Files Implemented |
|---|---|---|
| `app/` | Skeleton only | README.md |
| `shared/constants/` | Partial | `file-types.ts` (canonical extension lists + `fileKindFromPath`) |
| `shared/runtime/` | Partial | `browser.ts` (safe `openExternalUrl` wrapper) |
| `domain/repo/services/` | Done | `repo-commands.ts`, `repo-queries.ts` (binding re-exports) |
| `domain/repo/polling/` | Done | `useStatusPolling.ts` |
| `features/` | Skeleton only | README.md |
| `viewers/registry/` | Done | `diff-registry.ts`, `diff-builtins.tsx` |
| `viewers/components/shared/` | Done | `DiffRenderer.tsx` |
| `widgets/` | Skeleton only | README.md |

Legacy directories still in active use: `components/`, `context/`, `lib/`, `constants/`, `hooks/`

---

## General Rules for Every Move

1. **Move the file** with `git mv` (preserves history).
2. **Update all imports** in consuming files. Use grep for the old path.
3. **Update any barrel `index.ts`** that re-exported the moved file.
4. **Run `npm run build`** (or `task dev`) after each logical group of moves to verify nothing broke.
5. **Don't change any behavior** — only move + update imports.

---

## Phase 1 — Shared Utilities & Constants (no behavior changes)

These moves have the fewest dependents and establish the `shared/` layer.

### 1.1 Move `constants/index.ts` → `shared/constants/index.ts`

| Current Path | Target Path |
|---|---|
| `constants/index.ts` | `shared/constants/index.ts` |

- **Consumers (≈30+ files):** Nearly every component imports `VIEWS`, `ICON_SIZES`, `FILE_STATUS`, etc. from `../../constants` or `../../../constants`.
- **Strategy:** Move the file. Then either update all imports, or add a re-export shim at the old location:
  ```ts
  // constants/index.ts (shim — keep during migration)
  export * from '../shared/constants/index';
  ```
- **Recommendation:** Use the shim approach. It's safe and avoids a massive import rewrite in one PR.

### 1.2 Move hooks to `shared/hooks/`

| Current Path | Target Path |
|---|---|
| `hooks/useWindowSize.ts` | `shared/hooks/useWindowSize.ts` |
| `hooks/useLoginTheme.ts` | `shared/hooks/useLoginTheme.ts` |
| `hooks/useAnalytics.ts` | `shared/hooks/useAnalytics.ts` |
| `hooks/index.ts` | `shared/hooks/index.ts` |

- **Consumers:** `useWindowSize` → `AppLayout.tsx`, `Sidebar.tsx`. `useLoginTheme` → `App.tsx`, `LoginView.tsx`. `useAnalytics` → a few components.
- **Note:** `useLfsAutoTrackBeforeSave.ts` is feature-specific — move it to `features/explorer/hooks/` later (Phase 5).
- **Shim:** Add `hooks/index.ts` shim re-exporting from `../shared/hooks`.

### 1.3 Move generic lib utilities to `shared/utils/`

| Current Path | Target Path | Notes |
|---|---|---|
| `lib/utils.ts` | `shared/utils/misc.ts` | General helpers (cn, etc.) |
| `lib/pathUtils.ts` | `shared/utils/path.ts` | Path manipulation |
| `lib/gitHelpers.ts` | `shared/utils/gitHelpers.ts` | Git formatting helpers |
| `lib/recentFolders.ts` | `shared/utils/recentFolders.ts` | Recent folders list logic |

- **Consumers:** Scattered across components. Use shim re-exports from `lib/` during migration.
- **Do NOT move yet:** `lib/analytics.ts` (has deep Supabase/PostHog wiring), `lib/supabaseClient.ts`, `lib/viewers.ts`, `lib/viewers-builtin.ts`, `lib/file-utils.ts`, `lib/viewer-cache.ts`, `lib/text-viewer-patterns.ts`, `lib/lfs-auto-track.ts`.

### 1.4 Move UI primitives to `shared/ui/`

| Current Path | Target Path |
|---|---|
| `components/ui/*` (entire directory) | `shared/ui/*` |

- **Consumers:** ~20+ files import from `../../components/ui/` or `../ui/`.
- **Strategy:** Move directory. Add shim at `components/ui/index.ts`:
  ```ts
  export * from '../../shared/ui';
  ```
- **This is high-impact but low-risk** — the UI primitives are leaf nodes with no upstream dependencies.

---

## Phase 2 — Viewer System Consolidation

The diff registry and `DiffRenderer` are already built. This phase moves the viewer *components* into the new `viewers/` tree.

### 2.1 Move viewer components to `viewers/components/file/`

| Current Path | Target Path |
|---|---|
| `components/viewers/TextViewer.tsx` | `viewers/components/file/TextViewer.tsx` |
| `components/viewers/ImageViewer.tsx` | `viewers/components/file/ImageViewer.tsx` |
| `components/viewers/PDFViewer.tsx` | `viewers/components/file/PDFViewer.tsx` |
| `components/viewers/Model3DViewer.tsx` | `viewers/components/file/Model3DViewer.tsx` |
| `components/viewers/L5XViewer.tsx` | `viewers/components/file/L5XViewer.tsx` |
| `components/viewers/UnsupportedViewer.tsx` | `viewers/components/file/UnsupportedViewer.tsx` |

- **Update imports in:** `lib/viewers-builtin.ts` (imports `TextViewer`, `ImageViewer`, `UnsupportedViewer`).
- **Note:** Each viewer imports `type ViewerProps` from `lib/viewers.ts` — update those paths too after the move.

### 2.2 Move diff viewer components to `viewers/components/diff/`

| Current Path | Target Path |
|---|---|
| `components/viewers/TextDiffViewer.tsx` | `viewers/components/diff/TextDiffViewer.tsx` |
| `components/viewers/ImageDiffViewer.tsx` | `viewers/components/diff/ImageDiffViewer.tsx` |
| `components/viewers/PDFDiffViewer.tsx` | `viewers/components/diff/PDFDiffViewer.tsx` |
| `components/viewers/Model3DDiffViewer.tsx` | `viewers/components/diff/Model3DDiffViewer.tsx` |
| `components/viewers/l5x-diff/L5XDiffViewer.tsx` | `viewers/components/diff/l5x-diff/L5XDiffViewer.tsx` |
| `components/viewers/l5x-diff/L5XWorkingDiffViewer.tsx` | `viewers/components/diff/l5x-diff/L5XWorkingDiffViewer.tsx` |
| `components/viewers/l5x-diff/` (all sub-components) | `viewers/components/diff/l5x-diff/` |

- **Update imports in:** `viewers/registry/diff-builtins.tsx` (the only file that imports these — 6 imports on lines 5–12).

### 2.3 Move viewer shared utilities

| Current Path | Target Path |
|---|---|
| `components/viewers/ViewerHeader.tsx` | `viewers/components/shared/ViewerHeader.tsx` |
| `components/viewers/ViewerErrorBoundary.tsx` | `viewers/components/shared/ViewerErrorBoundary.tsx` |
| `components/viewers/index.tsx` | `viewers/components/shared/ViewerRenderer.tsx` (rename) |
| `components/viewers/image-utils.tsx` | `viewers/components/file/image-utils.tsx` |
| `components/viewers/model3d-utils.ts` | `viewers/components/file/model3d-utils.ts` |
| `components/viewers/pdf-diff-utils.ts` | `viewers/components/diff/pdf-diff-utils.ts` |
| `components/viewers/path-utils.ts` | `viewers/components/shared/path-utils.ts` |
| `components/viewers/l5x/` (entire dir) | `viewers/components/file/l5x/` |

- **After this move:** `components/viewers/` directory should be empty and can be deleted.

### 2.4 Move viewer registry files from `lib/`

| Current Path | Target Path |
|---|---|
| `lib/viewers.ts` | `viewers/registry/viewer-registry.ts` |
| `lib/viewers-builtin.ts` | `viewers/registry/builtins.ts` |
| `lib/viewer-cache.ts` | `viewers/registry/viewer-cache.ts` |
| `lib/text-viewer-patterns.ts` | `viewers/components/file/text-viewer-patterns.ts` |

- **Update `main.tsx`:** Change `import './lib/viewers-builtin'` → `import './viewers/registry/builtins'`.
- **Update `ViewerProps` imports** in all viewer components (they import `type ViewerProps` from `lib/viewers`).
- **Shim:** Add `lib/viewers.ts` shim for any remaining consumers:
  ```ts
  export * from '../viewers/registry/viewer-registry';
  ```

### 2.5 Consolidate `lib/file-utils.ts`

| Current Path | Target Path |
|---|---|
| `lib/file-utils.ts` | `shared/constants/file-utils.ts` |

- **Only 2 consumers:** `diff-builtins.tsx` and `SidebarCommitPanel.tsx`.
- **After move:** Consider merging `isImageFile()` etc. into `shared/constants/file-types.ts` since they duplicate the same logic. The `fileKindFromPath()` function already exists there. `isImageFile(p)` is equivalent to `isFileKind(p, 'image')`.
- **If merging:** Update `diff-builtins.tsx` L4 to use `isFileKind` from `shared/constants/file-types.ts` instead of `isImageFile` from `file-utils.ts`. Update `SidebarCommitPanel.tsx` L18 similarly for `supportsDiff`.

---

## Phase 3 — Domain Layer (Repo State)

The `domain/repo/services/` and `domain/repo/polling/` files are already implemented. This phase wires them in and moves the context.

### 3.1 Move `RepoContext` files to `domain/repo/context/`

| Current Path | Target Path |
|---|---|
| `context/RepoContext.tsx` | `domain/repo/context/RepoContext.tsx` |
| `context/RepoContext.types.ts` | `domain/repo/context/RepoContext.types.ts` |

- **Consumers:** 26 component files use `useRepo()`. Plus test files.
- **Strategy:** Move files. Add shim at `context/RepoContext.tsx`:
  ```ts
  export * from '../domain/repo/context/RepoContext';
  ```
  And keep `context/index.ts` re-exporting from the shim. This makes the move non-breaking.
- **Note:** `RepoContext.analytics.test.tsx` → move to `domain/repo/context/` alongside.

### 3.2 Move `AuthContext` to `domain/auth/context/`

| Current Path | Target Path |
|---|---|
| `context/AuthContext.tsx` | `domain/auth/context/AuthContext.tsx` |
| `context/AuthContext.test.tsx` | `domain/auth/context/AuthContext.test.tsx` |

- **Consumers:** `App.tsx`, `context/index.ts`.
- **Strategy:** Same shim approach via `context/index.ts`.

### 3.3 Keep `LayoutContext` in place (for now)

`LayoutContext.tsx` is pure UI state (sidebar, active view, theme). It belongs in `widgets/` or stays in `context/`. Moving it has high churn (used widely) and low payoff. **Skip for now.**

### 3.4 Move analytics + supabase to `domain/`

| Current Path | Target Path |
|---|---|
| `lib/analytics.ts` | `domain/analytics/analytics.ts` |
| `lib/analytics.test.ts` | `domain/analytics/analytics.test.ts` |
| `lib/supabaseClient.ts` | `domain/auth/supabaseClient.ts` |
| `lib/lfs-auto-track.ts` | `domain/repo/services/lfs-auto-track.ts` |

---

## Phase 4 — Layout Widgets

### 4.1 Move layout shell to `widgets/layout/`

| Current Path | Target Path |
|---|---|
| `components/layout/AppLayout.tsx` | `widgets/layout/AppLayout.tsx` |
| `components/layout/TopBar.tsx` | `widgets/layout/TopBar.tsx` |
| `components/layout/ActivityBar.tsx` | `widgets/layout/ActivityBar.tsx` |
| `components/layout/Sidebar.tsx` | `widgets/layout/Sidebar.tsx` |
| `components/layout/MainArea.tsx` | `widgets/layout/MainArea.tsx` |
| `components/layout/StatusBar.tsx` | `widgets/layout/StatusBar.tsx` |
| `components/layout/index.ts` | `widgets/layout/index.ts` |

- **Consumers:** `App.tsx` imports `AppLayout` from `./components/layout`.
- **Strategy:** Move files, add shim at `components/layout/index.ts`.

### 4.2 Move layout modals to `widgets/layout/`

| Current Path | Target Path |
|---|---|
| `components/layout/BranchModal.tsx` | `widgets/layout/BranchModal.tsx` |
| `components/layout/BranchNameModal.tsx` | `widgets/layout/BranchNameModal.tsx` |
| `components/layout/RewindConfirmModal.tsx` | `widgets/layout/RewindConfirmModal.tsx` |
| `components/layout/NonGitFolderPromptModal.tsx` | `widgets/layout/NonGitFolderPromptModal.tsx` |
| `components/layout/AdditionalPackagesModal.tsx` | `widgets/layout/AdditionalPackagesModal.tsx` |
| `components/layout/SwitchProjectModal.tsx` | `widgets/layout/SwitchProjectModal.tsx` |

---

## Phase 5 — Feature Modules

This is the largest phase. Each feature gets its own directory under `features/`.

### 5.1 Explorer feature

| Current Path | Target Path |
|---|---|
| `components/layout/pages/explorer/ExplorerPage.tsx` | `features/explorer/pages/ExplorerPage.tsx` |
| `components/layout/pages/explorer/AllSyncedScreen.tsx` | `features/explorer/pages/AllSyncedScreen.tsx` |
| `components/layout/pages/explorer/CommitScreen.tsx` | `features/explorer/pages/CommitScreen.tsx` |
| `components/layout/pages/explorer/MergeRequestScreen.tsx` | `features/explorer/pages/MergeRequestScreen.tsx` |
| `components/layout/pages/explorer/ReadyToPushScreen.tsx` | `features/explorer/pages/ReadyToPushScreen.tsx` |
| `components/layout/pages/explorer/index.ts` | `features/explorer/pages/index.ts` |
| `components/layout/views/ExplorerView.tsx` | `features/explorer/components/ExplorerView.tsx` |
| `components/layout/sidebar-panels/ExplorerStatusPanel.tsx` | `features/explorer/components/ExplorerStatusPanel.tsx` |
| `components/layout/sidebar-panels/SidebarCommitPanel.tsx` | `features/explorer/components/SidebarCommitPanel.tsx` |
| `components/layout/sidebar-panels/MainBranchSaveChoiceModal.tsx` | `features/explorer/components/MainBranchSaveChoiceModal.tsx` |
| `components/common/ExplorerTabsBar.tsx` | `features/explorer/components/ExplorerTabsBar.tsx` |
| `components/common/SimpleFileBrowser.tsx` | `features/explorer/components/SimpleFileBrowser.tsx` |
| `components/common/DiffViewer.tsx` | `features/explorer/components/DiffViewer.tsx` |
| `hooks/useLfsAutoTrackBeforeSave.ts` | `features/explorer/hooks/useLfsAutoTrackBeforeSave.ts` |
| `components/common/LFSAutoTrackModal.tsx` | `features/explorer/components/LFSAutoTrackModal.tsx` |
| `components/common/ProjectSetupBanner.tsx` | `features/explorer/components/ProjectSetupBanner.tsx` |

- **Update `VIEW_REGISTRY`** in pages `index.ts` to import from `features/explorer/pages/`.
- **Update `views/index.ts`** to import `ExplorerView` from `features/explorer/components/`.

### 5.2 History feature

| Current Path | Target Path |
|---|---|
| `components/layout/pages/HistoryPage.tsx` | `features/history/pages/HistoryPage.tsx` |
| `components/layout/views/HistoryView.tsx` | `features/history/components/HistoryView.tsx` |
| `components/common/CommitList.tsx` | `features/history/components/CommitList.tsx` |
| `components/common/GitGraph.tsx` | `features/history/components/GitGraph.tsx` |

### 5.3 Merge feature

| Current Path | Target Path |
|---|---|
| `components/layout/pages/MergeChangesPage.tsx` | `features/merge/pages/MergeChangesPage.tsx` |
| `components/layout/pages/merge/MergeReviewDiffModal.tsx` | `features/merge/components/MergeReviewDiffModal.tsx` |
| `components/layout/views/MergeChangesView.tsx` | `features/merge/components/MergeChangesView.tsx` |

### 5.4 Settings feature

| Current Path | Target Path |
|---|---|
| `components/layout/pages/settings/SettingsPage.tsx` | `features/settings/pages/SettingsPage.tsx` |
| `components/layout/pages/settings/GeneralSettings.tsx` | `features/settings/components/GeneralSettings.tsx` |
| `components/layout/pages/settings/GitConfigForm.tsx` | `features/settings/components/GitConfigForm.tsx` |
| `components/layout/pages/settings/LFSGroupsSettings.tsx` | `features/settings/components/LFSGroupsSettings.tsx` |
| `components/layout/pages/settings/index.ts` | `features/settings/pages/index.ts` |
| `components/layout/views/SettingsView.tsx` | `features/settings/components/SettingsView.tsx` |

### 5.5 Repo Settings feature

| Current Path | Target Path |
|---|---|
| `components/layout/pages/repo-settings/RepoSettingsPage.tsx` | `features/repo-settings/pages/RepoSettingsPage.tsx` |
| `components/layout/pages/repo-settings/index.ts` | `features/repo-settings/pages/index.ts` |
| `components/layout/views/RepoSettingsView.tsx` | `features/repo-settings/components/RepoSettingsView.tsx` |

### 5.6 Welcome feature

| Current Path | Target Path |
|---|---|
| `components/layout/pages/welcome/RecentProjectsPage.tsx` | `features/welcome/pages/RecentProjectsPage.tsx` |
| `components/layout/pages/welcome/NewProjectPage.tsx` | `features/welcome/pages/NewProjectPage.tsx` |
| `components/layout/pages/welcome/CloneProjectPage.tsx` | `features/welcome/pages/CloneProjectPage.tsx` |
| `components/layout/pages/welcome/OpenFolderPage.tsx` | `features/welcome/pages/OpenFolderPage.tsx` |
| `components/layout/pages/welcome/index.ts` | `features/welcome/pages/index.ts` |
| `components/layout/views/WelcomeView.tsx` | `features/welcome/components/WelcomeView.tsx` |
| `components/common/ProjectCreationStepper.tsx` | `features/welcome/components/ProjectCreationStepper.tsx` |
| `components/common/PublishToCloudModal.tsx` | `features/welcome/components/PublishToCloudModal.tsx` |
| `components/common/RepoSwitcher.tsx` | `features/welcome/components/RepoSwitcher.tsx` |

### 5.7 Profile & Debug features

| Current Path | Target Path |
|---|---|
| `components/layout/pages/ProfilePage.tsx` | `features/profile/pages/ProfilePage.tsx` |
| `components/layout/views/ProfileView.tsx` | `features/profile/components/ProfileView.tsx` |
| `components/layout/pages/DebugPage.tsx` | `features/debug/pages/DebugPage.tsx` |
| `components/layout/views/DebugView.tsx` | `features/debug/components/DebugView.tsx` |
| `components/layout/views/debug/DebugToggle.tsx` | `features/debug/components/DebugToggle.tsx` |
| `components/layout/views/debug/LogEntryRow.tsx` | `features/debug/components/LogEntryRow.tsx` |
| `components/layout/views/debug/LogFilterBar.tsx` | `features/debug/components/LogFilterBar.tsx` |
| `components/layout/views/debug/StatsBar.tsx` | `features/debug/components/StatsBar.tsx` |

### 5.8 Auth feature (login)

| Current Path | Target Path |
|---|---|
| `components/layout/views/LoginView.tsx` | `features/auth/components/LoginView.tsx` |
| `components/layout/views/LoginView.test.tsx` | `features/auth/components/LoginView.test.tsx` |
| `components/common/GitHubDeviceFlowModal.tsx` | `features/auth/components/GitHubDeviceFlowModal.tsx` |

### 5.9 Common components that stay shared

These components are used across multiple features and should stay in `shared/` or `components/common/`:

| File | Keep At | Reason |
|---|---|---|
| `Spinner.tsx` | `shared/ui/Spinner.tsx` | Used everywhere |
| `EmptyState.tsx` | `shared/ui/EmptyState.tsx` | Used by multiple features |
| `LoadingState.tsx` | `shared/ui/LoadingState.tsx` | Used by multiple features |
| `GitLabIcon.tsx` | `shared/icons/GitLabIcon.tsx` | Generic icon |
| `RecoveryBanner.tsx` | `shared/ui/RecoveryBanner.tsx` or `features/explorer/` | Primarily explorer, but cross-cutting |

---

## Phase 6 — App Bootstrap

### 6.1 Move entry files to `app/`

| Current Path | Target Path |
|---|---|
| `App.tsx` | `app/App.tsx` |
| `main.tsx` | `app/main.tsx` |

- **Update `frontend/index.html`** entry point: change `<script src="/src/main.tsx">` → `<script src="/src/app/main.tsx">`.
- **Update Vite config** if `main.tsx` is referenced there.

### 6.2 Create provider wrappers (optional)

Extract from `App.tsx` into `app/providers/`:
- `app/providers/AnalyticsProvider.tsx`
- `app/providers/AuthProvider.tsx` (re-export wrapper)
- `app/providers/RepoProvider.tsx` (re-export wrapper)

This is optional and can wait.

---

## Phase 7 — Cleanup & Hygiene

### 7.1 Delete empty legacy directories

After all moves are complete, delete:
- `components/common/` (should be empty)
- `components/layout/` (should be empty)
- `components/viewers/` (should be empty)
- `components/ui/` (should be empty, replaced by shim or removed)
- `lib/` (should be empty, replaced by shims or removed)
- `hooks/` (should be empty)
- `constants/` (should be empty)
- `context/` (should be empty or only shims)

### 7.2 Remove shims

Once all imports are updated, remove the temporary re-export shims:
- `constants/index.ts` shim
- `hooks/index.ts` shim
- `lib/viewers.ts` shim
- `lib/file-utils.ts` shim
- `components/ui/index.ts` shim
- `components/layout/index.ts` shim
- `context/index.ts` shims for RepoContext, AuthContext

### 7.3 Delete stray generated artifacts

- `components/common/frontend/` — this directory is empty now but should be removed if it still exists.

### 7.4 Consolidate duplicate logic

- `components/viewers/model3d-utils.ts` has its own copy of `is3DModelFile` logic — after move, replace with import from `shared/constants/file-types.ts`.
- `lib/file-utils.ts` functions (`isImageFile`, `isPdfFile`, etc.) should be replaced with `isFileKind()` from `shared/constants/file-types.ts` by consumers.

### 7.5 Wails runtime Events — wrap in `shared/runtime/events.ts`

9 files import `Events` from `@wailsio/runtime` directly. Create a typed wrapper:

| File importing `Events` directly | Action |
|---|---|
| `context/RepoContext.tsx` | Update after domain move |
| `components/viewers/ImageViewer.tsx` | Update after viewer move |
| `components/viewers/ImageDiffViewer.tsx` | Update after viewer move |
| `components/viewers/Model3DViewer.tsx` | Update after viewer move |
| `components/viewers/Model3DDiffViewer.tsx` | Update after viewer move |
| `components/common/SimpleFileBrowser.tsx` | Update after feature move |
| `components/layout/StatusBar.tsx` | Update after widget move |
| `components/layout/pages/DebugPage.tsx` | Update after feature move |
| `components/ui/progress-modal.tsx` | Update after shared move |

---

## Recommended Execution Order

Do phases in order. Within each phase, batch moves by feature/directory and run `npm run build` after each batch.

| Order | Phase | Est. Effort | Risk |
|---|---|---|---|
| 1st | Phase 1 (shared + constants + hooks + ui) | 1–2 hours | Low — leaf nodes, use shims |
| 2nd | Phase 2 (viewers consolidation) | 2–3 hours | Low — only 4-6 import sites per move |
| 3rd | Phase 3 (domain / context) | 1–2 hours | Medium — RepoContext has 26 consumers, but shim mitigates |
| 4th | Phase 4 (layout widgets) | 1 hour | Low — 7 files, clear dependencies |
| 5th | Phase 5 (feature modules) | 3–4 hours | Medium — most files, many cross-imports |
| 6th | Phase 6 (app bootstrap) | 30 min | Low — 2 files + config update |
| 7th | Phase 7 (cleanup) | 1–2 hours | Low — removing dead code and shims |

**Total estimate:** 10–15 hours of focused work across 2–4 PRs.

---

## PR Strategy

| PR | Contents | Validates |
|---|---|---|
| PR 1 | Phase 1 + Phase 2 | Shared layer + viewer consolidation |
| PR 2 | Phase 3 + Phase 4 | Domain layer + layout widgets |
| PR 3 | Phase 5 | All feature modules |
| PR 4 | Phase 6 + Phase 7 | Bootstrap move + final cleanup |

Each PR should pass `npm run build`, `npm run lint`, and `npm test` before merge.

---

## Files NOT Moved (Intentionally)

| File | Reason |
|---|---|
| `index.css` | Root stylesheet, stays at `src/` |
| `vite-env.d.ts` | Vite type declarations, stays at `src/` |
| `test/setup.ts` | Test infrastructure, stays at `test/` |
| `frontend/bindings/` | Auto-generated, never touch |

---

## Quick Reference: Full File Count

| Source Directory | Files to Move | Target |
|---|---|---|
| `components/common/` | 16 files | `features/*/components/` + `shared/ui/` |
| `components/layout/` | 6 shell + 6 modals + sidebar-panels | `widgets/layout/` |
| `components/layout/pages/` | ~20 files across subdirs | `features/*/pages/` |
| `components/layout/views/` | 10 views + debug subdir | `features/*/components/` |
| `components/viewers/` | 12 viewers + l5x/ + l5x-diff/ + utils | `viewers/components/` |
| `components/ui/` | 20 primitives | `shared/ui/` |
| `lib/` | 12 files | `shared/utils/`, `viewers/registry/`, `domain/` |
| `context/` | 5 files (+ 2 tests) | `domain/repo/context/`, `domain/auth/context/` |
| `hooks/` | 4 files | `shared/hooks/`, `features/explorer/hooks/` |
| `constants/` | 1 file | `shared/constants/` |
| Root `App.tsx`, `main.tsx` | 2 files | `app/` |
