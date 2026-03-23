# Modal Homogeneity Audit

Date: 2026-03-23
Scope: ControlZebra desktop app frontend modal and dialog surfaces under `frontend/src`

## Executive Summary

The app now has a shared modal foundation rather than the split architecture described at the start of this audit.

Today there are two shared modal primitives built on one shared engine:

1. `AlertDialog` in `frontend/src/shared/ui/alert-dialog.tsx`
2. `Dialog` in `frontend/src/shared/ui/dialog.tsx`, backed by `frontend/src/shared/ui/dialog-base.tsx`

The major structural problem identified in this audit has been addressed:

- The original bespoke fullscreen modal implementations called out here have been migrated onto shared primitives
- `AlertDialog` now reuses the same base portal, stack, focus, and scroll-lock behavior as `Dialog`
- The public modal contract has been normalized significantly toward `open` and `onOpenChange`

The remaining work is no longer foundational migration. It is cleanup, policy definition, and QA hardening around the shared layer.

The practical problems that still remain are:

- A few remaining inconsistent public APIs and state adapters
- Dismissal and blocking behavior that is still implicit in some consumers instead of encoded as shared policy
- Incomplete shared-layer QA and usage guidance for future modal work

## Inventory

### Shared `AlertDialog`-based surfaces

These use the shared alert-dialog primitive and inherit the shared portal, body scroll locking, focus trap, focus restoration, and stacked-dialog handling:

- `frontend/src/shared/ui/UndoLastSaveDialog.tsx`
- `frontend/src/widgets/layout/AdditionalPackagesModal.tsx`
- `frontend/src/widgets/layout/NonGitFolderPromptModal.tsx`
- `frontend/src/widgets/layout/RewindConfirmModal.tsx`
- `frontend/src/features/auth/components/GitHubDeviceFlowModal.tsx`
- `frontend/src/features/welcome/components/PublishToCloudModal.tsx`
- `frontend/src/features/explorer/components/LFSAutoTrackModal.tsx`
- `frontend/src/features/explorer/components/MainBranchSaveChoiceModal.tsx`
- `frontend/src/features/merge/components/ExplorerMergeModal.tsx`
- `frontend/src/features/merge/components/MergeReviewDiffModal.tsx`
- Inline confirmations in `frontend/src/features/explorer/components/SimpleFileBrowser.tsx`
- Inline confirmation in `frontend/src/features/history/components/CommitOverviewPanel.tsx`

### Shared `Dialog`-based surfaces

These use the shared workflow/progress dialog primitive and inherit the same base portal, stack, focus, and scroll-lock behavior:

- `frontend/src/widgets/layout/BranchModal.tsx`
- `frontend/src/widgets/layout/BranchNameModal.tsx`
- `frontend/src/widgets/layout/SwitchProjectModal.tsx`
- `RenameBranchModal` inside `frontend/src/features/repo-settings/pages/RepoSettingsPage.tsx`
- `frontend/src/shared/ui/progress-modal.tsx`

### Remaining cleanup candidates

These no longer bypass the shared dialog infrastructure, but they still have API or policy cleanup remaining:

- `frontend/src/widgets/layout/NonGitFolderPromptModal.tsx` manually translates dialog close into domain dismissal logic

## What The Shared Primitive Already Gives You

The shared modal layer now spans `frontend/src/shared/ui/dialog-base.tsx`, `frontend/src/shared/ui/dialog.tsx`, and `frontend/src/shared/ui/alert-dialog.tsx`.

That shared layer centralizes several behaviors that were previously reimplemented in feature code:

- Portal rendering to `document.body`
- Open-dialog stack tracking for nested dialogs
- Body scroll locking while any dialog is open
- Escape key handling for the topmost dialog only
- Shared dismissal-reason metadata via the optional second `onOpenChange` argument
- Focus trap with tab cycling
- Focus restoration to the previously focused element on close
- Standard backdrop and container styling baseline
- Shared size and overlay-tone variants plus close-policy props for `Dialog`

This is now the strongest foundation for a homogeneous modal architecture in the app.

## Findings

### 1. Shared primitives exist, but modal behavior classes are not yet encoded as first-class policy

Severity: Medium

The shared UI layer now exports both `AlertDialog` and a general-purpose `Dialog`, which is a substantial improvement over the original state of the codebase. However, the intended behavior classes are still implicit rather than codified.

The audit originally proposed three categories:

- Confirm modal
- Workflow modal
- Blocking progress modal

Those categories are not yet enforced directly in the shared API. Instead, consumers still encode parts of the policy themselves.

Examples:

- `frontend/src/shared/ui/dialog.tsx` now exposes a shared `BlockingDialog`, but the modal behavior classes are still not documented clearly enough for future contributors
- `frontend/src/features/auth/components/GitHubDeviceFlowModal.tsx` customizes close behavior through its own `onOpenChange` translation because the modal class semantics are not explicitly modeled

Impact:

- Close policy remains harder to reason about than it should be
- Blocking flows are still implemented by convention rather than by a named shared primitive or variant
- Future modal work can still drift unless the intended classes are documented and enforced centrally

### 2. The modal prop contract is mostly standardized, but a few shared-dialog consumers still lag behind

Severity: Medium

The migration work has removed the broad prop inconsistency that originally existed across the app. Most modal surfaces now use `open` and `onOpenChange`.

The remaining inconsistencies are narrower:

- Some consumers still translate `onOpenChange` manually to perform close-side effects rather than exposing a clean controlled contract all the way through
- Some page-local state objects still use `isOpen` as an internal field name even though the modal component contract has been normalized

This is no longer a systemic architecture problem, but it is still enough inconsistency to slow reuse and make refactors noisier than necessary.

Impact:

- There is still avoidable adapter code at some call sites
- Public modal APIs are not yet uniformly predictable
- The cleanup cost will keep growing if the remaining exceptions are left in place

### 3. The original accessibility gaps in bespoke modals are largely closed, but shared-layer guarantees still need broader verification

Severity: Medium

The highest-risk accessibility issues identified in the original audit have been reduced substantially. The previously bespoke branch, rename, switch-project, rewind, and progress surfaces now sit on shared primitives and therefore inherit the shared portal, focus-trap, and focus-restoration behavior.

The remaining accessibility and interaction risk is now less about missing implementation and more about incomplete verification and policy consistency.

Current gaps are primarily:

- Shared-layer behavior is better covered now, but nested/backdrop/focus policy still relies on a relatively small test surface
- Blocking modal behavior is not yet expressed as a first-class shared pattern
- Nested-dialog and scroll-lock guarantees need broader automated verification

Examples:

- `frontend/src/shared/ui/dialog.test.tsx` now covers focus restoration, escape handling, backdrop policy, body scroll locking, topmost-dialog escape handling, and blocking dialog dismissal behavior
- The shared blocking-modal contract is in place, but it still needs usage guidance so future long-running flows choose it consistently
- Nested dialogs are covered for escape handling, but the broader stacked-dialog interaction surface is still only lightly tested

Impact:

- Regressions are still possible without stronger shared-layer tests
- The shared baseline is better, but it is not yet protected strongly enough against future drift

### 4. Dismissal behavior is inconsistent and not encoded as a shared policy

Severity: Medium

The app currently uses multiple close models:

- Shared `AlertDialog` blocks backdrop-click dismissal and allows escape dismissal
- Shared `Dialog` allows backdrop-click dismissal and escape dismissal by default
- `BlockingDialog` disables escape dismissal and outside-click dismissal for long-running operational flows
- `ProgressModal` is fully blocking through shared dialog props
- Some dialogs close themselves through `AlertDialogAction`; others use custom `Button` actions and manual callbacks

This is not inherently wrong, but the behavior is implicit and component-specific rather than policy-driven.

Examples:

- Confirm dialogs and workflow dialogs now behave differently by primitive, but that policy is still documented only implicitly
- `frontend/src/widgets/layout/AdditionalPackagesModal.tsx` and `frontend/src/shared/ui/progress-modal.tsx` now share a `BlockingDialog` contract, but the class is still not documented as the standard for future operational flows
- Close behavior is still sometimes inferred from feature-level code instead of expressed directly by a named modal class

Impact:

- Users get different close behavior for similar severity levels
- Engineers have to rediscover the expected behavior per modal
- There is no obvious standard for “confirm”, “form”, and “blocking progress” modal classes

### 5. Layout and styling duplication has been reduced, but variant usage is not yet standardized

Severity: Medium

The migration to shared primitives removed most of the old fullscreen wrapper duplication. What remains is mostly variant-level inconsistency rather than full shell reimplementation.

Examples of remaining variation:

- ad hoc `AlertDialogContent` and `DialogContent` sizing choices across feature code
- one-off overlay styling such as the custom overlay in `frontend/src/shared/ui/progress-modal.tsx`
- inconsistent header and footer spacing patterns layered on top of the shared primitives

The shared content components now provide the shell, but sizing and spacing conventions are not yet expressed as stronger variants or tokens.

Impact:

- Visual drift can still accumulate at the variant level
- Design changes still require auditing multiple consumers
- Modal sizing and density are not yet standardized strongly enough by shared tokens or variants

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
- `frontend/src/features/auth/components/GitHubDeviceFlowModal.tsx` still uses a custom `onOpenChange` adapter to run cancellation side effects

This is a smaller issue than the bespoke overlays, but it still weakens homogeneity.

### 7. Progress and long-running modal patterns are not unified

Severity: Medium

This item has been addressed in the current branch.

The shared UI layer now has a common `BlockingDialog` contract, and both of the operational modal patterns called out in this audit use it:

- `frontend/src/shared/ui/progress-modal.tsx`
- `frontend/src/widgets/layout/AdditionalPackagesModal.tsx`

Impact:

- Operational states now share one explicit blocking policy
- Shared progress UX improvements can be applied from the shared layer more easily
- The remaining work is documentation and broader adoption, not foundational unification

## Positive Findings

The codebase is not starting from zero. Several good patterns are already present:

- A shared `Dialog` primitive now exists for workflow and progress surfaces
- `AlertDialog` now reuses the same base portal, stack, and focus-management engine as `Dialog`
- The originally bespoke modal surfaces called out in this audit have been migrated to shared primitives
- Complex merge flows already use the shared dialog system, including nested confirmation inside `ExplorerMergeModal`
- Shared modal tests now cover the core focus restoration and backdrop policy baseline

## Recommended Target Architecture

### 1. Keep `Dialog` as the shared workflow baseline

Status: Complete

The app now has a non-destructive shared `Dialog` primitive in `frontend/src/shared/ui`, separate from `AlertDialog`. Future modal work should continue to build on it rather than introducing new wrappers.

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

### 2. Finish standardizing the public contract for all dismissible modals

Use one controlled API across the app:

- `open`
- `onOpenChange`

For most component-level modals, avoid `isOpen` and avoid `onClose` as the only state API. `onClose` can still exist as an internal convenience callback derived from `onOpenChange(false)` if needed, but it should not be the primary public contract.

Remaining migration targets:

- Any future or touched modal surface that still exposes `onClose` as its primary state contract

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

### 4. Keep the bespoke overlay migration closed

Status: Complete

The highest-value migration wave identified in this audit has already been completed:

1. `frontend/src/widgets/layout/BranchModal.tsx`
2. `frontend/src/widgets/layout/BranchNameModal.tsx`
3. `frontend/src/features/repo-settings/pages/RepoSettingsPage.tsx` (`RenameBranchModal`)
4. `frontend/src/widgets/layout/SwitchProjectModal.tsx`
5. `frontend/src/widgets/layout/RewindConfirmModal.tsx`
6. `frontend/src/shared/ui/progress-modal.tsx`

Why this still matters:

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

Status: Complete

- Add shared `Dialog` primitive built on the same infrastructure as `AlertDialog`
- Extract common overlay/content/stack/focus logic into a shared base module
- Add `size` and close-policy props to shared modal primitives

### Phase 2: Migration

Status: Largely complete

- Convert the five bespoke workflow/confirmation overlays plus `ProgressModal`
- Standardize all public props to `open` and `onOpenChange`
- Replace ad hoc global escape listeners and local keydown wrappers with shared behavior

### Phase 3: Cleanup

Status: Active

- Normalize `AlertDialog` consumers that still use inconsistent naming or footer composition
- Remove duplicated shell classes from feature code
- Add a short modal usage guide to the frontend shared UI docs or Copilot instructions

## Remaining Tasks

The foundation and first migration wave are now substantially complete in the current branch:

- Shared `Dialog` and shared dialog-base infrastructure exist in `frontend/src/shared/ui`
- `AlertDialog` now reuses the shared base behavior instead of maintaining a separate stack/focus implementation
- The previously bespoke workflow and confirmation overlays called out in this audit have been migrated onto shared primitives
- `GitHubDeviceFlowModal` and `PublishToCloudModal` now use the `open` / `onOpenChange` public contract
- Shared modal tests now cover focus restoration, escape handling, and backdrop policy basics

What remains is the cleanup and policy pass.

### 1. Define explicit modal behavior classes in shared UI

- Document and enforce the three intended modal classes in shared primitives:
  - Confirm modal
  - Workflow modal
  - Blocking progress modal
- Blocking flows now have a dedicated shared `BlockingDialog`; document it as the default for long-running operational flows
- Make the default close policy explicit per class instead of leaving it implicit at each call site

Progress update:

- Complete: `frontend/src/shared/ui/README.md` now documents confirm, workflow, and blocking modal classes plus the standard `open` / `onOpenChange` contract
- Complete: `.github/copilot-instructions.md` now includes the shared modal-class guidance and the rule against bespoke fullscreen wrappers outside `frontend/src/shared/ui`
- Complete: `frontend/src/shared/ui/dialog-base.tsx` now emits an optional dismissal reason through `onOpenChange`, making shared close intent explicit for trigger, action, cancel, escape, and outside-click flows
- Remaining: shared primitives still rely on documentation and conventions rather than stronger type-level enforcement of modal classes

### 2. Unify blocking operational modals

- Complete: `frontend/src/widgets/layout/AdditionalPackagesModal.tsx` no longer relies on `onOpenChange={() => {}}`
- Complete: `AdditionalPackagesModal` and `frontend/src/shared/ui/progress-modal.tsx` now share one blocking-modal contract via `BlockingDialog`
- Complete: blocking flows now disable escape dismissal and outside-click dismissal through shared policy rather than ad hoc handlers

### 3. Normalize remaining uneven shared-dialog consumers

- Complete: `frontend/src/features/merge/components/MergeReviewDiffModal.tsx` now uses `open` + `onOpenChange`
- Complete: GitHub device-flow callers now use named `onOpenChange` handlers instead of inline close adapters in `ExplorerView`, `ProfilePage`, `CloneProjectPage`, and `NewProjectPage`
- Complete: `frontend/src/widgets/layout/NonGitFolderPromptModal.tsx` now routes its primary confirm path through `AlertDialogAction` instead of mixing a plain `Button` into a simple confirm footer
- Remaining: some dialogs still translate close events into domain-specific cancellation or dismissal behavior because that policy is not yet modeled directly by the shared primitives

### 4. Normalize shared-dialog composition patterns

- Complete: `frontend/src/widgets/layout/NonGitFolderPromptModal.tsx` now uses `AlertDialogAction` for its confirm path, reducing one of the remaining simple mixed-footer cases
- Complete: `frontend/src/features/auth/components/GitHubDeviceFlowModal.tsx`, `frontend/src/features/welcome/components/PublishToCloudModal.tsx`, and `frontend/src/widgets/layout/RewindConfirmModal.tsx` now use `AlertDialogAction` with `preventDefault()` for async or parent-controlled close flows instead of plain `Button` actions in alert footers
- Complete: the remaining `AlertDialog` footers that intentionally stay open during async work now do so through shared `AlertDialogAction` semantics rather than ad hoc plain-button composition
- Complete: `frontend/src/shared/ui/dialog-base.tsx` now supports shared `size` variants up to `6xl` and an `overlayTone` variant, which removed ad hoc shell styling from `PublishToCloudModal`, `LFSAutoTrackModal`, `MergeReviewDiffModal`, `ExplorerMergeModal`, and `ProgressModal`
- Remaining: some high-complexity modal layouts still use custom height and content classes where the shared shell intentionally stops short of imposing layout structure

### 5. Expand shared-layer modal QA coverage

- Complete: shared tests now cover body scroll locking while dialogs are open
- Complete: shared tests now cover nested dialog stacking for topmost escape handling
- Complete: shared tests now cover blocking-dialog dismissal policy for progress/setup-style modals
- Complete: shared tests now cover topmost-only backdrop dismissal for stacked dialogs
- Complete: shared tests now verify body scroll remains locked until the last stacked dialog closes
- Complete: shared tests now verify dismissal reasons emitted by the shared layer for action, escape, and outside-click close paths
- Keep feature tests focused on business behavior once those shared guarantees are covered centrally

### 6. Add a durable implementation rule for future modal work

- Add a short modal usage guide to shared UI docs or Copilot instructions
- State the rule that no component outside `frontend/src/shared/ui` should render its own fullscreen modal wrapper or portal unless there is a documented exception
- Consider adding a lightweight hygiene check or code-review checklist item so the split modal architecture does not reappear

Progress update:

- Complete: the shared modal usage guide now lives in `frontend/src/shared/ui/README.md`
- Complete: the no-bespoke-wrapper rule is now encoded in `.github/copilot-instructions.md`
- Complete: `frontend/src/scripts/enforce-frontend-hygiene.mjs` now fails if `createPortal` is introduced outside `frontend/src/shared/ui/dialog-base.tsx`
- Complete: `frontend/src/scripts/enforce-frontend-hygiene.mjs` now also flags bespoke fullscreen modal shells outside `frontend/src/shared/ui`, closing the gap where a custom wrapper could bypass the shared layer without using `createPortal`

## Recommended Immediate Actions

If you want the smallest practical next step from the current branch state, do these three things first:

1. Decide whether device-flow cancellation should become a first-class shared modal policy instead of staying encoded in consumer-level `onOpenChange` handlers

That keeps the cleanup focused on the remaining architectural gap instead of redoing already completed migration work.

## Bottom Line

The app now has a real shared modal architecture, and the original split between shared dialogs and bespoke fullscreen overlays has been reduced substantially.

Today’s implementation is best described as:

- Good shared standard for confirm dialogs
- Working shared standard for workflow dialogs
- Remaining cleanup work around blocking-modal policy, a few lagging APIs, and shared-layer QA/documentation

The remediation path is now straightforward and incremental: finish the remaining cleanup consumers, codify modal behavior classes, and strengthen the shared-layer guarantees with tests and documentation.