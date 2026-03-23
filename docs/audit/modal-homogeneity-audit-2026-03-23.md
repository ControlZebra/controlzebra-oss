# Modal Homogeneity Audit

Date: 2026-03-23
Scope: ControlZebra desktop app frontend modal and dialog surfaces under `frontend/src`

## Executive Summary

The app currently has two modal systems:

1. A shared `AlertDialog` primitive in `frontend/src/shared/ui/alert-dialog.tsx`
2. Multiple bespoke modal implementations that recreate their own backdrop, positioning, keyboard handling, and close semantics

The result is a split implementation model rather than a homogeneous one.

The newer work is converging on the shared `AlertDialog` primitive, especially in merge, explorer, welcome, auth, and inline confirmation flows. The older and more workflow-heavy modals still use hand-rolled overlays. That split creates three practical problems:

- Inconsistent public props (`open` vs `isOpen`, `onOpenChange` vs `onClose`, `onCancel`)
- Inconsistent interaction behavior (overlay click, escape handling, focus management, blocking behavior)
- Repeated layout and styling logic outside the shared UI layer

## Inventory

### Shared `AlertDialog`-based surfaces

These use the shared dialog primitive and inherit its portal, body scroll locking, focus trap, focus restoration, and stacked-dialog handling:

- `frontend/src/shared/ui/UndoLastSaveDialog.tsx`
- `frontend/src/widgets/layout/AdditionalPackagesModal.tsx`
- `frontend/src/widgets/layout/NonGitFolderPromptModal.tsx`
- `frontend/src/features/auth/components/GitHubDeviceFlowModal.tsx`
- `frontend/src/features/welcome/components/PublishToCloudModal.tsx`
- `frontend/src/features/explorer/components/LFSAutoTrackModal.tsx`
- `frontend/src/features/explorer/components/MainBranchSaveChoiceModal.tsx`
- `frontend/src/features/merge/components/ExplorerMergeModal.tsx`
- `frontend/src/features/merge/components/MergeReviewDiffModal.tsx`
- Inline confirmations in `frontend/src/features/explorer/components/SimpleFileBrowser.tsx`
- Inline confirmation in `frontend/src/features/history/components/CommitOverviewPanel.tsx`

### Bespoke modal implementations

These bypass the shared dialog infrastructure and implement their own wrapper/backdrop/content stack:

- `frontend/src/widgets/layout/BranchModal.tsx`
- `frontend/src/widgets/layout/BranchNameModal.tsx`
- `frontend/src/widgets/layout/RewindConfirmModal.tsx`
- `frontend/src/widgets/layout/SwitchProjectModal.tsx`
- `RenameBranchModal` inside `frontend/src/features/repo-settings/pages/RepoSettingsPage.tsx`
- `frontend/src/shared/ui/progress-modal.tsx`

## What The Shared Primitive Already Gives You

`frontend/src/shared/ui/alert-dialog.tsx` already centralizes several behaviors that the bespoke modals do not consistently reproduce:

- Portal rendering to `document.body`
- Open-dialog stack tracking for nested dialogs
- Body scroll locking while any dialog is open
- Escape key handling for the topmost dialog only
- Focus trap with tab cycling
- Focus restoration to the previously focused element on close
- Standard backdrop and container styling baseline

This file is currently the strongest foundation for a homogeneous approach.

## Findings

### 1. There is no shared primitive for non-destructive workflow modals

Severity: High

The shared UI layer exports `AlertDialog`, but it does not export a general-purpose `Dialog` or `Modal` primitive. That matters because several app surfaces are not destructive confirmation dialogs. They are workflow modals with search, forms, branch selection, or progress state.

Examples:

- `frontend/src/widgets/layout/BranchModal.tsx`
- `frontend/src/widgets/layout/BranchNameModal.tsx`
- `frontend/src/widgets/layout/SwitchProjectModal.tsx`
- `frontend/src/features/repo-settings/pages/RepoSettingsPage.tsx` (`RenameBranchModal`)
- `frontend/src/shared/ui/progress-modal.tsx`

Because there is no shared generic dialog primitive, those flows reimplement their own shell instead of using a common contract.

Impact:

- Accessibility behavior drifts
- Visual behavior drifts
- Consumers must remember multiple modal APIs
- Future modal work is likely to keep splitting rather than converging

### 2. The modal prop contract is inconsistent across the app

Severity: High

Current prop signatures vary significantly:

- `open` + `onOpenChange`: `ExplorerMergeModal`, `UndoLastSaveDialog`, `LFSAutoTrackModal`, `MainBranchSaveChoiceModal`
- `open` + `onClose`: `BranchModal`, `BranchNameModal`, `RewindConfirmModal`, `SwitchProjectModal`, `RenameBranchModal`
- `isOpen` + `onClose`: `PublishToCloudModal`
- `isOpen` + `onCancel` + `onComplete`: `GitHubDeviceFlowModal`
- `isOpen` + `operationId` + `onComplete`: `ProgressModal`

This inconsistency is visible at call sites. `TopBar.tsx` and `AppLayout.tsx` need different state adapters depending on the modal being rendered.

Impact:

- Higher cognitive load for every caller
- More wrapper lambdas and state bridging than necessary
- Harder to build reusable modal helpers or tests
- Easier to introduce close-state bugs during refactors

### 3. Bespoke modals do not consistently meet the shared accessibility baseline

Severity: High

Compared with `AlertDialog`, the bespoke modals have several gaps:

- No portal rendering
- No stacked-dialog coordination
- No body scroll lock
- No guaranteed focus trap
- No focus restoration on close
- Missing or inconsistent ARIA semantics

File-by-file notes:

- `frontend/src/widgets/layout/BranchModal.tsx`
  - No `role="dialog"`
  - No `aria-modal`
  - No focus trap
  - No focus restoration

- `frontend/src/widgets/layout/BranchNameModal.tsx`
  - Has `role="dialog"` and `aria-modal`
  - Still lacks focus trap and focus restoration
  - Accessibility is better than the other bespoke modals, but still below the shared primitive baseline

- `frontend/src/widgets/layout/RewindConfirmModal.tsx`
  - No ARIA dialog semantics
  - No focus trap
  - No focus restoration

- `frontend/src/widgets/layout/SwitchProjectModal.tsx`
  - No ARIA dialog semantics
  - No focus trap
  - Adds a global `window` escape listener instead of using a shared modal lifecycle

- `frontend/src/features/repo-settings/pages/RepoSettingsPage.tsx` (`RenameBranchModal`)
  - No ARIA dialog semantics
  - No focus trap
  - No focus restoration

- `frontend/src/shared/ui/progress-modal.tsx`
  - Intentionally blocking, but still bypasses the app’s shared dialog infrastructure entirely

Impact:

- Keyboard navigation quality differs by modal
- Nested modal behavior is less predictable
- Users can lose focus context after close
- Accessibility regressions are more likely in the bespoke set

### 4. Dismissal behavior is inconsistent and not encoded as a shared policy

Severity: Medium

The app currently uses multiple close models:

- Shared `AlertDialog` blocks backdrop-click dismissal and allows escape dismissal
- Bespoke modals usually close on backdrop click
- `AdditionalPackagesModal` is effectively non-dismissible because `onOpenChange` is a no-op
- `ProgressModal` is fully blocking and manually implemented
- Some dialogs close themselves through `AlertDialogAction`; others use custom `Button` actions and manual callbacks

This is not inherently wrong, but the behavior is implicit and component-specific rather than policy-driven.

Examples:

- Destructive bespoke modals like `RewindConfirmModal` allow closing by clicking the backdrop
- Shared destructive dialogs do not allow backdrop dismissal
- Blocking install/progress flows use two different approaches to become non-dismissible

Impact:

- Users get different close behavior for similar severity levels
- Engineers have to rediscover the expected behavior per modal
- There is no obvious standard for “confirm”, “form”, and “blocking progress” modal classes

### 5. Layout and styling are duplicated outside the shared UI layer

Severity: Medium

The bespoke modals repeat the same shell structure with slightly different values:

- `fixed inset-0 z-50`
- `bg-black/75 backdrop-blur-[1px]`
- `w-full max-w-sm|max-w-md`
- `bg-theme-surface border border-theme-default rounded-lg shadow-xl`
- ad hoc header/body/footer padding choices

The shared `AlertDialogContent` already provides a standard container shell, but the bespoke set duplicates and slightly mutates it.

Impact:

- Visual drift accumulates over time
- Design changes require touching many files
- Modal sizing is not standardized by tokens or variants

### 6. Shared-dialog usage is directionally correct, but composition is still uneven

Severity: Medium

Even inside the `AlertDialog` family, the composition is mixed:

- Some dialogs use `AlertDialogAction` and `AlertDialogCancel`
- Some use `AlertDialogCancel` with a plain `Button`
- Some wire `onOpenChange` directly to state setters
- Some translate close events manually with `!open && onClose()`

Examples:

- `frontend/src/features/explorer/components/LFSAutoTrackModal.tsx` uses the full shared footer/action model cleanly
- `frontend/src/widgets/layout/NonGitFolderPromptModal.tsx` and `frontend/src/features/welcome/components/PublishToCloudModal.tsx` mix shared and plain button actions
- `frontend/src/features/auth/components/GitHubDeviceFlowModal.tsx` uses `isOpen` and `onCancel` naming even though it sits on `AlertDialog`

This is a smaller issue than the bespoke overlays, but it still weakens homogeneity.

### 7. Progress and long-running modal patterns are not unified

Severity: Medium

There are at least two blocking or semi-blocking operational modal patterns:

- `frontend/src/shared/ui/progress-modal.tsx`
- `frontend/src/widgets/layout/AdditionalPackagesModal.tsx`

Both represent “wait while the app performs setup or sync work”, but they use different APIs, different shells, and different dismissibility behavior.

Impact:

- Operational states feel inconsistent
- Shared progress UX improvements cannot be rolled out from one place
- Blocking modal behavior is duplicated conceptually

## Positive Findings

The codebase is not starting from zero. Several good patterns are already present:

- The shared `AlertDialog` primitive is substantially better than the bespoke overlays from an interaction and accessibility standpoint
- Most newer work appears to prefer the shared primitive
- Complex merge flows already use the shared dialog system, including nested confirmation inside `ExplorerMergeModal`
- Destructive confirmations in explorer and history are already close to a reusable standard

## Recommended Target Architecture

### 1. Introduce a general-purpose shared `Dialog` primitive

Add a non-destructive modal primitive in `frontend/src/shared/ui`, separate from `AlertDialog`.

Recommended exported shape:

- `Dialog`
- `DialogContent`
- `DialogHeader`
- `DialogFooter`
- `DialogTitle`
- `DialogDescription`

Recommended shared props:

- `open: boolean`
- `onOpenChange: (open: boolean) => void`
- `size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'`
- `closeOnEscape?: boolean`
- `closeOnInteractOutside?: boolean`
- `initialFocusRef?: RefObject<HTMLElement>`
- `restoreFocus?: boolean`

Implementation note:

- Reuse the same portal, stack, and focus-management engine already present in `alert-dialog.tsx`
- `AlertDialog` should become a specialization of the same base behavior rather than a separate modal system

### 2. Standardize the public contract for all dismissible modals

Use one controlled API across the app:

- `open`
- `onOpenChange`

For most component-level modals, avoid `isOpen` and avoid `onClose` as the only state API. `onClose` can still exist as an internal convenience callback derived from `onOpenChange(false)` if needed, but it should not be the primary public contract.

Recommended migration targets:

- `BranchModal`
- `BranchNameModal`
- `RewindConfirmModal`
- `SwitchProjectModal`
- `RenameBranchModal`
- `PublishToCloudModal`
- `GitHubDeviceFlowModal`
- `ProgressModal` if it remains component-driven rather than app-service-driven

### 3. Define modal behavior classes explicitly

Document three modal categories and enforce them in shared primitives:

- Confirm modal
  - Destructive or decision confirmation
  - Usually uses `AlertDialog`
  - Default: close on escape, no close on backdrop

- Workflow modal
  - Forms, branch selection, branch rename, review flows
  - Uses shared `Dialog`
  - Default: close on escape, optional backdrop close depending on task risk

- Blocking progress modal
  - Long-running operation, install, sync, repair
  - Uses shared `Dialog` or a shared `BlockingDialog`
  - Default: no escape close, no backdrop close

This removes implicit policy from individual components.

### 4. Migrate bespoke overlays first

Highest-value migration order:

1. `frontend/src/widgets/layout/BranchModal.tsx`
2. `frontend/src/widgets/layout/BranchNameModal.tsx`
3. `frontend/src/features/repo-settings/pages/RepoSettingsPage.tsx` (`RenameBranchModal`)
4. `frontend/src/widgets/layout/SwitchProjectModal.tsx`
5. `frontend/src/widgets/layout/RewindConfirmModal.tsx`
6. `frontend/src/shared/ui/progress-modal.tsx`

Why this order:

- Branch and rename flows are straightforward and benefit immediately from accessibility parity
- Switch and rewind are simple conversions with low product risk
- Progress is more specialized and should move after the shared base API is stable

### 5. Normalize shared-dialog composition patterns

After the bespoke overlays are migrated, clean up the existing `AlertDialog` consumers:

- Prefer `open` and `onOpenChange`
- Use `AlertDialogAction` and `AlertDialogCancel` when the semantics fit
- Reserve plain `Button` for custom actions that intentionally should not auto-close
- Make dismissibility explicit in the component contract rather than encoding it through no-op handlers

### 6. Add modal QA coverage at the shared-layer level

Add tests around the shared modal primitives that verify:

- Focus trap
- Escape behavior
- Backdrop interaction policy
- Focus restoration
- Body scroll locking
- Nested modal stacking

Then keep per-modal tests focused on business behavior rather than modal mechanics.

### 7. Add a simple implementation rule for future work

Recommended engineering rule:

- No component outside `frontend/src/shared/ui` should render its own fullscreen modal wrapper or portal unless there is a documented exception

That rule alone will prevent the current split from growing.

## Proposed Remediation Plan

### Phase 1: Foundation

- Add shared `Dialog` primitive built on the same infrastructure as `AlertDialog`
- Extract common overlay/content/stack/focus logic into a shared base module
- Add `size` and close-policy props to shared modal primitives

### Phase 2: Migration

- Convert the five bespoke workflow/confirmation overlays plus `ProgressModal`
- Standardize all public props to `open` and `onOpenChange`
- Replace ad hoc global escape listeners and local keydown wrappers with shared behavior

### Phase 3: Cleanup

- Normalize `AlertDialog` consumers that still use inconsistent naming or footer composition
- Remove duplicated shell classes from feature code
- Add a short modal usage guide to the frontend shared UI docs or Copilot instructions

## Recommended Immediate Actions

If you want the smallest practical next step, do these three things first:

1. Create `Dialog` in `frontend/src/shared/ui`
2. Convert `BranchModal`, `BranchNameModal`, and `RenameBranchModal` to use it
3. Standardize modal props across new or touched code to `open` and `onOpenChange`

That will remove most of the structural inconsistency without forcing a risky all-at-once rewrite.

## Bottom Line

The app already has a solid shared foundation for confirmation dialogs, but it does not yet have a unified modal architecture.

Today’s implementation is best described as:

- Good shared standard for confirm dialogs
- No shared standard for workflow dialogs
- Several legacy bespoke overlays still carrying interaction, accessibility, and API inconsistency

The remediation path is straightforward: establish one shared generic dialog primitive, migrate the bespoke overlays onto it, and standardize the public props to `open` and `onOpenChange`.