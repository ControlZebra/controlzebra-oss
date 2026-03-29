# L5X Layout Diff Viewer — Implementation Plan (Unified Change Stream Concept)

> **Status**: 📋 PLANNING  
> **Created**: February 2026  
> **Author**: Engineering  
> **Goal**: Implement a domain-aware, unified change stream for L5X diffs that shows only changed content (with minimal context) in the ControlZebra UI.

---

## Executive Summary

The current ControlZebra implementation uses a layout-based L5X diff viewer with a navigator, tabs, and focused content panel. This document preserves the earlier **Unified Change Stream** concept that informed the redesign, but the active production seam is the layout diff viewer rather than a standalone stream-only viewer.

---

## Objectives

1. Show **only what changed** in L5X files, with minimal context for understanding.
2. Provide a **linear review workflow** (no click-to-explore required).
3. Support **ladder logic (RLL)**, **structured text (ST)**, **tags**, **data types**, **AOIs**, and **modules**.
4. Keep performance acceptable for **large L5X files**.
5. Integrate seamlessly with the existing viewer registry and history diff UX.

---

## Scope

### In Scope (v1)

- RLL routines: changed rungs + 1–2 context rungs, collapsible gaps.
- ST routines: inline unified text diff.
- Controller/program tags: property-level diffs (top-level only).
- Data types: member-level changes (added/removed/modified) at top level.
- AOIs and modules: summary-level changes.
- Integrated with existing diff flow in history and working tree.

### Out of Scope (v1)

- Deep nested UDT member diffing.
- Full side-by-side view.
- Inline comparison of AOI internals.
- Structural move detection beyond rungs.

---

## Architecture Overview

### High-Level Flow

1. User selects an L5X file diff (working tree or commit).
2. Load **old** and **new** file contents.
3. Parse both into `NormalizedController` using ladder-visualizer.
4. Generate a structured diff (`L5XDiff`).
5. Render a **unified change stream** grouped by section.

```
L5X file diff → Read old/new content → parseString() → diffControllers() → Change Stream UI
```

---

## Implementation Plan (Phased)

### Phase 1 — Backend & Data Layer (1 week)

**Goal:** Provide file-at-revision access and structured diff core.

#### Backend: Read File at Revision

- Add `ReadFileAtRevision(repoPath, filePath, revision)` to GitService.
- Use `git show <revision>:<path>` to return raw content.
- Return `OperationResult` with stdout content or error.

#### ladder-visualizer: Diff Engine

- Add `ladder-visualizer/src/diff/` module.
- Implement `diffControllers(oldController, newController)`.
- Match entities by stable IDs (name, rungNumber, module id).
- Generate `L5XDiff` with per-section diffs:
  - Programs + routines
  - RLL rung diffs
  - ST diffs (unified text diff)
  - Tags + dataTypes + AOIs + modules

**Deliverables:**
- `ReadFileAtRevision` backend method
- `diffControllers()` function + diff types

---

### Phase 2 — RLL Change Stream UI (1.5 weeks)

**Goal:** Render ladder routine changes with context and collapsible gaps.

#### New Components

- `L5XLayoutDiffViewer.tsx` (orchestrator shell)
- `DiffChangeStream.tsx` (main scrollable stream)
- `RoutineDiffSection.tsx` (program/routine container)
- `RungChangeCard.tsx` (old/new stacked diagram)
- `ContextRung.tsx` (dimmed unchanged rung)
- `CollapsedRange.tsx` (“N rungs unchanged” expand/collapse)

#### Rung Stream Algorithm

- Show only changed rungs + 1–2 context rungs.
- Collapse the rest into expandable ranges.

**Deliverables:**
- RLL routine diff rendering with context
- Smooth scrollable review experience

---

### Phase 3 — Non-Ladder Sections (1 week)

**Goal:** Render non-ladder diffs as compact cards.

#### Components

- `TagChangeList.tsx` (added/removed/modified tags + property diffs)
- `DataTypeChangeCard.tsx` (UDT member changes)
- `AOIChangeCard.tsx` (summary diffs)
- `ModuleChangeCard.tsx` (summary diffs)
- `STChangeSection.tsx` (text diff via `react-diff-view`)

**Deliverables:**
- End-to-end diff coverage across all L5X sections

---

### Phase 4 — UX Polish & Integration (1 week)

**Goal:** Make the experience production-ready.

#### UI/UX Enhancements

- Change stream toolbar (Collapse All / Expand All / change count)
- Sticky section headers for long routines
- Loading + error states
- Diff caching via `viewer-cache.ts`
- Performance tuning (memoization, virtualized sections if needed)

#### Viewer Registration

- Register the layout diff viewer in `frontend/src/viewers/registry/diff-builtins.tsx`
- Ensure it only activates in diff context for `.l5x`/`.l5k` files
- Route diff flow from History view and working tree

**Deliverables:**
- Fully integrated L5X diff viewer
- Production-ready UX

---

## Data Contracts

### `L5XDiff` (Core Diff Model)

- `programs[]`
  - `routines[]`
    - `rungs[]` (RLL)
    - `textDiff` (ST)
- `tags[]`
- `dataTypes[]`
- `aois[]`
- `modules[]`
- `controllerInfo[]`

### Matching Rules

- Programs → name
- Routines → name (within program)
- Rungs → rungNumber
- Tags → name
- Data types → name
- AOIs → name
- Modules → id

---

## Performance Considerations

- Parse only when needed; cache parsed controllers by filePath + revision.
- Cache `L5XDiff` results (keyed by old hash + new hash + file path).
- Render only expanded sections to avoid heavy DOM.
- Use memoized subcomponents for routine/rung cards.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large L5X files cause slow parsing | High | Cache parsed controllers and show loading state |
| Rung rendering is heavy | Medium | Render only changed + context rungs |
| Diff accuracy for complex changes | Medium | Start with simple matching; add move detection later |
| Git show fails for renamed files | Medium | Handle `oldPath` when status is `renamed` |

---

## Success Criteria

1. L5X diffs render in under 5 seconds for typical projects.
2. Users can review all changes in a single scroll without XML noise.
3. Ladder diffs show modified rungs with minimal context and clear old/new separation.
4. Tag and data type changes are readable without drilling into XML.
5. L5X diff view is reachable from both commit history and working tree diffs.

---

## Follow-Up Enhancements (Post v1)

- Sidebar summary tree for jump-to-change navigation.
- Deeper tag/UDT member diffs.
- Move detection for rungs (if users demand it).
- Optional side-by-side toggle for expert users.
