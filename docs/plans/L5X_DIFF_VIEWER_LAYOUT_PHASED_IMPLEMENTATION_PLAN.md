# L5X Diff Viewer Layout — Phased Implementation Plan

> Status: Planning
> Created: March 2026
> Author: Engineering
> Goal: Replace the current unified change-stream L5X diff experience with a navigator-and-tabs layout that closely matches the normal L5X viewer while still presenting diff-aware content.

## Summary

This plan covers a new L5X diff UX direction for ControlZebra. Instead of a single linear review stream, the diff view should resemble the existing L5X viewer layout: header, collapsible navigator, tab bar, and focused content panel.

Phase 1 is intentionally narrow:
- Show changed routines and changed tags in the navigator
- Open selected entities in tabs
- Render full context inside the selected entity view
- Support RLL routine diffs only

Deferred work includes Structured Text routines, AOIs, data types, modules, and any secondary change-list mode.

This plan should be treated as a parallel successor to the earlier unified change-stream direction in docs/plans/L5X_DIFF_VIEWER_PLAN.md, not as a silent replacement.

## Scope

### In Scope
- Diff-aware shell that mirrors the existing L5X viewer layout
- Changed-entity navigator for:
  - changed routines
  - changed controller tags
  - changed program tags
- Diff-specific tab state and navigation
- Full-context RLL routine diff view
- Full-context tag diff views
- Reuse of existing old/new diff loading, parsing, caching, and reload logic
- Preserve existing diff registry entry points

### Out of Scope
- Structured Text routine diff tabs
- AOI diff tabs
- Data type diff tabs
- Module diff tabs
- Secondary review stream or jump list mode
- Broader diff registry redesign

## Priority And Complexity Scale

### Priority
- P0: Critical path for the new experience
- P1: High-value follow-up required for a complete phase-1 release
- P2: Useful polish or extension work that can follow after release readiness

### Complexity
- Low: Localized UI or state change with clear reuse path
- Medium: Cross-component feature work with some new view-model logic
- High: New architecture seam, non-trivial rendering, or risk around performance and correctness

## Delivery Strategy

The safest implementation path is to keep the current data-loading contract in place and replace only the rendering architecture. That means L5X diff entry, old/new file loading, parsing, diff generation, caching, and file-watcher-triggered reload remain in the existing L5X diff viewer. The new work should sit on top as a new diff-specific shell and view-model layer.

## Phase Overview

| Phase | Name | Priority | Complexity | Outcome |
|------|------|----------|------------|---------|
| 1 | Contract and view-model foundation | P0 | High | Stable diff-specific data model for navigator and tabs |
| 2 | Navigator shell and tab framework | P0 | Medium | L5X diff surface visually matches the normal viewer layout |
| 3 | RLL routine diff inspector | P0 | High | Full-context routine tabs with rung-level change highlighting |
| 4 | Tag diff inspector | P1 | Medium | Full-context controller and program tag diff tabs |
| 5 | Integration hardening and release validation | P1 | Medium | Production-ready behavior across history and working-tree flows |
| 6 | Deferred extensions | P2 | High | ST and other entity types after the core experience is stable |

## Phase 1 — Contract And View-Model Foundation

Priority: P0
Complexity: High

### Goal
Create the adapter layer that bridges raw L5X diff output and the new navigator/tab-based UI.

### Why This Comes First
The current L5X diff viewer owns loading, parsing, caching, and diff creation, but the new UX needs a very different presentation contract. If the team starts with UI components first, tab identity and navigator behavior will drift or get coupled to raw diff arrays.

### Implementation
- Preserve the existing entry flow in frontend/src/viewers/components/diff/l5x-diff/L5XDiffViewer.tsx.
- Add a diff-specific adapter that combines:
  - old parsed controller
  - new parsed controller
  - structured diff output from ladder-visualizer/src/diff/types.ts
- Produce a UI-friendly model for:
  - navigator sections
  - tab descriptors
  - selected entity render data
  - stable semantic ids for tabs and tree items
- Ensure the adapter only surfaces changed entities in navigation while still carrying enough context to render the full selected entity.
- Keep the adapter isolated from React rendering so it can be tested independently.

### Deliverables
- Diff view-model types
- Adapter utilities for changed routines and changed tags
- Stable identity rules for:
  - controller tags
  - program tags
  - program/routine pairs
- Unit tests for adapter correctness

### Dependencies
- Existing L5X diff generation already in place

### Exit Criteria
- The adapter can map changed routines and tags from a real L5X diff into a deterministic navigator/tab model.
- Repeated loads of the same diff produce the same tab ids and navigation ids.

## Phase 2 — Navigator Shell And Tab Framework

Priority: P0
Complexity: Medium

### Goal
Build the new L5X diff shell so the page structure matches the normal L5X viewer layout.

### Implementation
- Mirror the layout patterns in frontend/src/viewers/components/file/L5XViewer.tsx:
  - header
  - collapsible navigator panel
  - tab bar
  - main content surface
- Add a diff-specific tab hook modeled on frontend/src/viewers/components/file/l5x/useTabs.ts.
- Reuse or minimally adapt frontend/src/viewers/components/file/l5x/TabBar.tsx.
- Add a diff-aware navigator component that visually resembles ladder-visualizer/src/components/ProgramNavigator.tsx but filters to changed entities and adds change status badges.
- Keep the shell compatible with the existing theme bridge used by the L5X viewer.

### Deliverables
- New diff shell component structure
- Diff navigator component
- Diff tab-state hook with per-file cache
- Empty-state handling when there are no domain-level changes

### Dependencies
- Phase 1

### Exit Criteria
- A user can open an L5X diff and navigate between changed routines and changed tag sections using tabs.
- The page structure visually aligns with the existing L5X viewer.

## Phase 3 — RLL Routine Diff Inspector

Priority: P0
Complexity: High

### Goal
Implement the main value path for the redesigned diff experience: full-context ladder routine inspection.

### Implementation
- Build a routine tab renderer that shows the whole selected RLL routine rather than only changed rungs plus a small context window.
- Reuse current change semantics from frontend/src/viewers/components/diff/l5x-diff/RoutineDiffSection.tsx where useful, but do not preserve the current stream layout.
- Introduce a routine render model that marks each rung as:
  - unchanged
  - added
  - removed
  - modified
- Use ladder-visualizer rendering primitives where possible to stay visually aligned with the normal viewer.
- Add clear highlighting for changed rungs while keeping unchanged context readable but subdued.
- Handle added and removed routines explicitly.

### Deliverables
- RLL routine diff tab renderer
- Full-routine context support
- Change highlighting rules for rung-level states
- Tests for modified, added, and removed routine cases

### Dependencies
- Phase 1
- Phase 2

### Exit Criteria
- A changed ladder routine opens in a tab and displays complete routine context with correct per-rung diff highlighting.
- Added and removed routines render without breaking the routine layout.

## Phase 4 — Tag Diff Inspector

Priority: P1
Complexity: Medium

### Goal
Deliver full-context tag views for controller and program tags.

### Implementation
- Build tag tab renderers that resemble the normal tag table experience in the L5X viewer.
- Surface changed rows from diff data while keeping the tab scoped to the full relevant tag group.
- Add field-level change disclosure per tag using current property-diff data from frontend/src/viewers/components/diff/l5x-diff/TagDiffSection.tsx.
- Support both controller-level tag tabs and program-level tag tabs.
- Ensure change styling remains legible for large tag tables.

### Deliverables
- Controller tag diff tab
- Program tag diff tab
- Row highlighting and field-level property diff presentation
- Tests for controller/program tag mapping and rendering

### Dependencies
- Phase 1
- Phase 2

### Exit Criteria
- Users can open controller tags or program tags from the navigator and inspect changed tags in a full-context table-like view.

## Phase 5 — Integration Hardening And Release Validation

Priority: P1
Complexity: Medium

### Goal
Make the new L5X diff layout production-ready inside ControlZebra’s existing diff flows.

### Implementation
- Keep registration stable in frontend/src/viewers/registry/diff-builtins.tsx.
- Validate compatibility with current diff request adapters and history/working-tree entry points.
- Verify file-watcher reload behavior still refreshes the open diff when a working-tree L5X file changes.
- Add loading, error, and no-change states that fit the new layout.
- Confirm tab persistence and navigator selection persistence behave correctly across re-renders.
- Run targeted performance checks on large L5X files.

### Deliverables
- Stable integration with existing diff flows
- Regression coverage for load/reload/error paths
- Manual verification checklist
- Release-readiness signoff criteria

### Dependencies
- Phases 2 through 4

### Exit Criteria
- The redesigned L5X diff works from working tree and history flows without regressions in viewer resolution, reload behavior, or loading states.

## Phase 6 — Deferred Extensions

Priority: P2
Complexity: High

### Goal
Extend the new diff shell after the core routine-and-tag experience is stable.

### Candidate Work
- Structured Text routine diff tabs
- AOI diff tabs
- Data type diff tabs
- Module diff tabs
- Optional secondary change-list or review mode
- Shared diff-aware primitives moved into ladder-visualizer if reuse proves real

### Recommendation
Do not start this phase until routine and tag behavior have shipped and been validated with real L5X repos. The risk of over-generalizing too early is high.

## Recommended Sequence

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6

## Team Guidance

### Highest-Risk Areas
- Stable semantic identity for tabs and navigator items
- Rendering full-context RLL routines without losing diff clarity
- Preserving performance on large L5X files
- Avoiding accidental coupling between the normal viewer and diff-only concerns

### Recommended Ownership Split
- One engineer on adapter and tab-state foundation
- One engineer on shell and navigator
- One engineer on RLL routine rendering
- Tag rendering can begin once the adapter contract is stable

## Validation Checklist

- Navigator shows only changed routines and changed tags
- Selected entities open as tabs with stable identity
- Routine tabs render full ladder context with correct change highlighting
- Controller and program tag tabs render correctly
- Added, removed, modified, and no-change states behave correctly
- Working-tree diff reload still works
- History diff and working-tree diff both resolve to the redesigned L5X diff viewer
- Visual structure matches the normal L5X viewer closely enough that users do not need to relearn the layout

## Success Criteria

1. Users can review L5X diffs by navigating programs, routines, and tags using the same mental model as the normal L5X viewer.
2. The redesigned diff feels like an inspector, not a separate review tool.
3. Phase-1 routine and tag coverage is stable enough that the old change-stream presentation is no longer the primary L5X diff experience.
4. The implementation keeps the current diff-loading and registry plumbing intact.

## File Targets

- frontend/src/viewers/components/diff/l5x-diff/L5XDiffViewer.tsx
- frontend/src/viewers/components/diff/l5x-diff/RoutineDiffSection.tsx
- frontend/src/viewers/components/diff/l5x-diff/TagDiffSection.tsx
- frontend/src/viewers/components/file/L5XViewer.tsx
- frontend/src/viewers/components/file/l5x/useTabs.ts
- frontend/src/viewers/components/file/l5x/TabBar.tsx
- frontend/src/viewers/registry/diff-builtins.tsx
- frontend/src/viewers/components/diff/diff-side-loaders.ts
- ladder-visualizer/src/diff/types.ts
- ladder-visualizer/src/components/ProgramNavigator.tsx
