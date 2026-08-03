# Text and L5X Conflict Resolution MVP Plan

> Expand live merge conflict handling from whole-file choices to guided three-way resolution for text files, complete-rung and complete-tag resolution for eligible L5X conflicts, and whole-file fallbacks for every unsupported L5X case.

## Status

Planned as of 2026-07-31.

Implementation order:

1. Shared three-way conflict contract and backend safety harness.
2. Three-way text conflict engine and resolver.
3. L5X source projection with complete-rung and complete-tag choices.
4. Integrated fallback, platform validation, and MVP release hardening.

These are implementation phases, not separate product releases. The first public release is not complete until all four phases pass the combined MVP exit gate.

## Goal

Let a non-technical user resolve a conflicted text file without leaving ControlZebra or understanding Git conflict markers.

The normal workflow should be:

```text
Select conflicted file
  -> review one true conflict region at a time
  -> choose Current or Incoming for the block
  -> optionally expand the block and choose individual lines
  -> resolve the file once every region has a choice
  -> move automatically to the next file
```

For `.l5x` files, the resolver should present eligible ladder conflicts visually and let the user choose the complete Current or Incoming rung. It should also present eligible controller-scoped and program-scoped tag conflicts and let the user choose the complete Current or Incoming tag. The resulting file must remain valid L5X.

When ControlZebra cannot visualize or map an L5X conflict safely, it must always offer whole-file Current and Incoming choices instead of guessing. The text resolver may also be offered when the file is text-safe, but it is an optional advanced fallback and never replaces the required whole-file escape hatch.

## Approved Product Decisions

| Decision | Direction |
| --- | --- |
| Merge model | Three-way: base, current, and incoming. |
| Required decisions | Ask only for true conflict regions. Preserve Git's automatically merged content. |
| Text selection unit | Conflict block by default, expandable to individual lines. |
| L5X selection units | Complete rung and complete tag. No instruction, operand, branch-leg, or individual tag-property choices in this release. |
| Entity selection meaning | `Use Current/Incoming Rung` and `Use Current/Incoming Tag` copy the exact complete XML element from that side; they do not create a hybrid entity from auto-merged lines. |
| Manual editing | Not supported. The result is composed only from Current and Incoming selections. |
| Side labels | `Current` and `Incoming`. Do not use `Mine`, `Theirs`, `Ours`, or `Source` inside the detailed resolver. |
| Draft behavior | Keep choices in frontend memory. Write and stage only when the user selects `Resolve File`. |
| L5X validation | Block detailed resolution when the composed file cannot be parsed; retain whole-file Current/Incoming fallback actions. |
| L5X fallback | Whole-file Current and Incoming actions remain available for every L5X file, including partially visualized, ambiguous, invalid, or unsupported content. |
| Layout | Keep the decision queue on the left and use the right side as the full resolver. |
| Delivery | Build incrementally, but ship text, rung, tag, and whole-file fallback behavior together as one MVP. |

## Current Behavior

The current live-conflict path is file-level only:

- `MergeConflictQueue.tsx` renders `Keep Mine` and `Keep Theirs` cards.
- `RepoContext.resolveConflict()` calls `ResolveConflictKeepOurs()` or `ResolveConflictKeepTheirs()`.
- `GitService` runs `git checkout --ours/--theirs -- <path>` and immediately stages the file.
- `fileResolutions` records one strategy per file and the queue advances to the next unresolved file.
- the ordinary text diff viewer parses a two-snapshot unified patch and is read-only.
- the L5X diff viewer parses two complete controllers and renders read-only controller, routine, rung, instruction, and text differences.

These read-only diff contracts are useful for display, but they are not a safe foundation for conflict composition. The new workflow needs the three unmerged Git index stages and an explicit resolution contract.

## Scope

### In Scope

- Live conflicts after `startMerge()` has produced unmerged index entries.
- UTF-8 text files, including UTF-8 BOM files, within a defined size limit.
- Existing text-viewer extensions such as `.md`, `.txt`, `.xml`, `.json`, source code, `.l5x`, and `.l5k`.
- Three-way content from Git index stages:
  - stage 1: common base
  - stage 2: current
  - stage 3: incoming
- Git-generated conflict boundaries with automatically merged context preserved.
- Block-level Current/Incoming choices.
- Optional line-level Current/Incoming inclusion inside one expanded conflict block.
- In-memory drafts for every opened conflicted file while the merge modal remains mounted.
- Atomic working-tree write followed by `git add` when the file is resolved.
- Whole-file Current/Incoming actions as shortcuts and fallbacks.
- Complete-rung Current/Incoming choices for safely mapped RLL conflicts.
- Complete-tag Current/Incoming choices for safely mapped controller and program tags.
- Exact source-span replacement for selected L5X entities so a side choice cannot create a hybrid rung or tag.
- Whole-file Current/Incoming fallbacks that remain reachable from every L5X resolver state.
- Parse validation before an L5X result can be written and staged.

### Out Of Scope

- A freeform text or XML editor.
- Character-level selection.
- Selecting individual ladder instructions, operands, branch legs, tag properties, AOIs, modules, or data types.
- Automatically resolving semantically equivalent L5X changes.
- Reconstructing an L5X document from `NormalizedController`.
- Persisting unfinished drafts across modal closure, merge abort, app restart, or repository change.
- Reusing the resolver for pre-merge review, history, Change Requests, or ordinary working-tree diffs.
- Binary conflict composition.
- Non-UTF-8 text editing in the first release.
- Changing the existing merge strategy or completion workflow.

## Safety Invariants

The implementation must preserve these rules:

1. Git remains the authority for base, current, incoming, and conflict boundaries.
2. Resolution data comes from the live index entries, not branch tips or the conflict-marker working file.
3. Automatically merged content is not turned into an unnecessary user decision.
4. The frontend never writes repository files directly.
5. The backend verifies that the unmerged index entries are unchanged before applying a draft.
6. A file is not considered resolved until the composed content is written and `git add -- <path>` succeeds.
7. Invalid L5X content cannot be staged through the ladder resolver.
8. The normalized ladder model is never serialized back into L5X.
9. Unsupported, binary, oversized, deleted, encoding-unsafe, or ambiguous files retain whole-file fallback actions.
10. Closing or aborting the merge cannot silently apply an in-memory draft.
11. A rung or tag choice copies the exact complete XML element from the selected index stage; it cannot preserve edits from the other side inside that entity.
12. Whole-file fallback remains available before apply for every L5X file and discards any detailed draft only after explicit confirmation.
13. Choosing a missing side in a delete/modify conflict stages the deletion instead of attempting to check out a nonexistent blob.

## Architecture

### Keep Resolution Separate From Read-Only Diffing

Do not add mutating props to `DiffRenderRequest` or turn the global viewer registry into an editor registry. Read-only diffs are used in history, explorer, merge review, and Change Requests; coupling resolution state into that contract would spread merge-only behavior across unrelated surfaces.

Add a merge-owned renderer instead:

```text
MergeConflictQueue
  -> ConflictResolverPane
       -> TextConflictResolver
      -> L5XConflictResolver
       -> WholeFileConflictFallback
```

The resolver may reuse visual primitives and pure view models from the existing text and L5X viewers, but it owns its loading, draft, decision, and apply contracts.

### Git Index Stage Contract

Add typed backend models in `services/git_service.go`:

```go
type ConflictBlob struct {
    Present bool   `json:"present"`
    OID     string `json:"oid,omitempty"`
    Mode    string `json:"mode,omitempty"`
    Content string `json:"content,omitempty"`
}

type ConflictRegion struct {
    ID       string   `json:"id"`
    Current  []string `json:"current"`
    Base     []string `json:"base,omitempty"`
    Incoming []string `json:"incoming"`
}

type ConflictSegment struct {
    Kind     string          `json:"kind"` // context or conflict
    Text     string          `json:"text,omitempty"`
    Conflict *ConflictRegion `json:"conflict,omitempty"`
}

type ConflictResolutionData struct {
    Success          bool              `json:"success"`
    Path             string            `json:"path"`
    Status           string            `json:"status"`
    Eligible         bool              `json:"eligible"`
    IneligibleReason string            `json:"ineligibleReason,omitempty"`
    Base             ConflictBlob      `json:"base"`
    Current          ConflictBlob      `json:"current"`
    Incoming         ConflictBlob      `json:"incoming"`
    Segments         []ConflictSegment `json:"segments,omitempty"`
    ResolutionToken  string            `json:"resolutionToken,omitempty"`
    Newline          string            `json:"newline,omitempty"`
    HasFinalNewline  bool              `json:"hasFinalNewline"`
    Error            string            `json:"error,omitempty"`
}
```

The exact generated TypeScript shape may use Wails model classes, but the frontend should map it immediately to merge-domain types in `RepoContext.types.ts` or a feature-local model.

Add two exported service methods:

```go
GetConflictResolutionData(repoPath string, filePath string) ConflictResolutionData
ResolveConflictWithContent(
    repoPath string,
    filePath string,
    resolutionToken string,
    content string,
) OperationResult
```

`GetConflictResolutionData` should:

1. verify a merge, squash merge, or supported live conflict operation is active
2. validate and normalize the repository-relative path
3. read `git ls-files -u -z -- <path>` and capture the stage 1, 2, and 3 mode/OID entries
4. read blobs by OID with `git cat-file blob <oid>` rather than interpreting user paths as revision syntax
5. classify the file by content, encoding, status, extension, and size
6. invoke Git's three-way file merge engine over temporary stage snapshots
7. parse the generated diff3 conflict regions into typed context/conflict segments
8. return a resolution token derived from path plus the stage mode/OID tuple

Use `git merge-file -p --diff3` with unique labels and a large marker size for region generation. Exit code `0` means Git merged the file without a remaining conflict, `1` means conflict regions were produced, and values greater than `1` are failures. Marker parsing must use generated labels, detect marker collisions in source content, and fail closed to whole-file fallback if the output cannot be parsed unambiguously.

Do not use the working-tree file as input. Its marker style is user-configurable, may already have been edited externally, and does not reliably contain the base section.

### Eligibility Rules

The detailed text resolver is available only when all of these conditions hold:

- the path still has unmerged index entries
- current and incoming blobs required by the conflict status are available
- all present blobs are valid UTF-8, optionally with a UTF-8 BOM
- no present blob contains NUL bytes
- each side and the composed output are below the configured limit
- the path matches the shared text-viewer extension set or passes a conservative backend text-content check
- conflict regions can be generated and parsed unambiguously

Start with a 2 MiB per-side and 4 MiB composed-output limit. Keep the constants named and covered by tests so they can be adjusted from evidence later.

Whole-file actions remain available for:

- binary files
- unsupported encodings
- oversized files
- delete/modify and both-deleted cases
- missing required stages
- marker collisions or merge-engine failures
- unsupported live operations

For `.l5x` files, whole-file actions are not limited to ineligible files. They remain available as explicit escape actions from the text, rung, tag, mixed-content, loading-error, and validation-error states. If detailed decisions already exist, selecting a whole-file action must explain that those draft decisions will be discarded and require confirmation.

Whole-file application must use index-stage presence rather than assuming both sides have blobs:

- when the selected side exists, write its exact blob and stage the path
- when the selected side represents deletion, remove the working-tree path and stage the deletion
- when both sides deleted the path, stage the deletion without presenting a nonexistent file preview
- directory/file conflicts, submodules, and unsafe symlink cases fail closed with a specific recovery message

The existing `ConflictFileStatus` frontend union must be reconciled with every status emitted by `GetConflictedFiles()`, including `both-deleted`. Do not let an unrecognized backend status disappear from the queue.

### Text Conflict Draft Model

Add a feature-local draft model under `frontend/src/features/merge/`:

```ts
type ConflictSide = 'current' | 'incoming';

interface ConflictLineChoice {
  current: boolean[];
  incoming: boolean[];
}

interface ConflictRegionDecision {
  mode: 'unresolved' | 'block' | 'lines';
  side?: ConflictSide;
  lines?: ConflictLineChoice;
}

interface TextConflictDraft {
  path: string;
  resolutionToken: string;
  decisions: Record<string, ConflictRegionDecision>;
}
```

Rules:

- every true conflict starts unresolved
- `Use Current` selects the complete current block and clears incoming line choices
- `Use Incoming` selects the complete incoming block and clears current line choices
- expanding a block exposes separate Current and Incoming line lists
- line mode may include lines from both sides, but keeps each side's original order
- line mode never permits arbitrary text or line reordering
- an empty result for a conflict block is valid only after an explicit `Remove this block` action or explicit deselection of all expanded lines followed by confirmation
- collapsing an expanded block preserves its line decisions
- `Resolve File` stays disabled until every conflict region has an explicit decision

Composition is a pure frontend function:

```ts
composeConflictResolution(segments, decisions): ComposeResult
```

It concatenates context segments exactly as returned by the backend and substitutes each conflict segment with the selected lines. It must preserve the backend-provided BOM, newline convention, and final-newline state. Add golden tests for LF, CRLF, BOM, and no-final-newline files.

### Apply Contract

`ResolveConflictWithContent` should:

1. repeat merge-state and path validation
2. reload the unmerged entries for the path
3. recompute and compare the resolution token
4. reject a stale draft if any stage OID or mode changed
5. reject NUL content, invalid UTF-8, or output over the configured limit
6. create a temporary file in the destination directory
7. preserve the executable bit from the current stage when applicable
8. write, flush, close, and atomically rename the temporary file over the working-tree path
9. run `git add -- <path>`
10. return success only after staging succeeds

The repository-relative path validation must reject absolute paths and paths that escape the repository after cleaning. Symlink behavior must be tested explicitly; the method must not follow a working-tree symlink outside the repository.

If the write succeeds but `git add` fails, return a distinct recovery message: the composed working file exists but remains unresolved. Keep the draft in memory and allow retry. Do not mark `fileResolutions[path]` or advance the queue until the backend returns success and live merge reconciliation confirms that the path is no longer unmerged.

## Phase 0: Contract And Test Harness

Before changing the UI, lock the three-way backend behavior with real temporary Git repositories.

Deliverables:

- `ConflictBlob`, `ConflictSegment`, `ConflictRegion`, and `ConflictResolutionData` Go models
- helper that reads and fingerprints unmerged index stages
- helper that invokes Git's merge engine and parses typed conflict regions
- explicit UTF-8, binary, size, newline, and path-safety rules
- generated Wails bindings for the new service methods and models

Backend test matrix in `services/git_service_test.go`:

- both branches edit the same line
- branches edit different lines and only the overlapping region requires a choice
- several conflict regions in one file
- both-added file with no base stage
- delete/modify and both-deleted fallback behavior
- empty file and empty selected result
- LF, CRLF, BOM, and missing final newline
- literal marker-like content
- UTF-16, invalid UTF-8, and NUL content
- per-side and output size limits
- executable file mode
- filename containing spaces, Unicode, leading dash, and colon
- path traversal and symlink escape attempts
- stale resolution token after an external index change
- no active merge and already-resolved file

Exit gate:

- backend tests prove that only true conflict regions become decisions and that unchanged stage fingerprints cannot be bypassed

### Phase 0 Action Plan

1. **Action:** Finalize the shared conflict models, complete status union, stage-presence rules, resolution-token format, size limits, encoding rules, and reason-code enums before implementing UI behavior.
  **Project manager note:** This freezes the contract used by the Go backend, generated Wails bindings, Desktop frontend, and later L5X package work. Treat changes after this point as scope changes because they can cause coordinated rework across both repositories.
2. **Action:** Implement repository-relative path validation and a helper that reads stage 1/2/3 mode and OID entries with `git ls-files -u -z`, then loads content by OID.
  **Project manager note:** This is the security and correctness foundation. It ensures the feature uses the exact files Git is merging and cannot write outside the open project.
3. **Action:** Implement Git-backed conflict-segment generation, newline/BOM detection, marker-collision detection, text eligibility, and deterministic stage fingerprinting.
  **Project manager note:** This creates the authoritative decision list while preserving changes Git already merged automatically. Completing this before UI work prevents the frontend team from building against invented sample behavior.
4. **Action:** Implement atomic content apply and exact whole-file apply, including selected-side deletion, executable mode, staging failure recovery, and stale-token rejection.
  **Project manager note:** A choice is not complete until the working file and Git index agree. This step also protects users from silently overwriting a conflict that changed after they opened it.
5. **Action:** Add the full temporary-repository test matrix and regenerate Wails bindings.
  **Project manager note:** Phase 0 exits only when tests prove the contract on real Git repositories. Generated bindings are the handoff artifact that unblocks the frontend vertical slice.

## Phase 1: Three-Way Text Resolver

### Frontend Domain And State

Extend the merge context with narrowly scoped operations:

```ts
loadConflictResolutionData(path: string): Promise<ConflictResolutionData | null>;
resolveConflictWithContent(path: string, token: string, content: string): Promise<boolean>;
```

Keep draft decisions in the merge feature component, keyed by file path. Do not put every selected line into global `RepoContext`; the context should own backend loading/apply state and live merge reconciliation, while the modal owns ephemeral presentation drafts.

Invalidate a draft when:

- its resolution token changes
- the file no longer appears in `conflictedFiles`
- the repository changes
- the merge is aborted or completed
- the modal is unmounted

### Components

Refactor `MergeConflictQueue.tsx` into a queue shell and resolver pane without changing auto-advance semantics.

Add:

- `ConflictResolverPane.tsx` for eligibility, loading, error, and resolver routing
- `TextConflictResolver.tsx` for block and line decisions
- `TextConflictBlock.tsx` for one expandable conflict region
- `WholeFileConflictFallback.tsx` for existing whole-file choices
- `conflict-composer.ts` for pure composition and validation
- focused tests beside each component and utility

Desktop layout:

- retain the approximately 280 px decision queue
- let the resolver consume the remaining modal width and height
- keep the active path, status, unresolved-region count, and `Resolve File` action visible in a sticky resolver header/footer
- show context lines around the active region without requiring decisions on them
- distinguish Current and Incoming with restrained existing diff colors, text labels, and accessible icons; color alone is insufficient
- use checkboxes for individual line inclusion because line mode can include content from both sides
- provide `Previous conflict` and `Next conflict` navigation
- show `N of M conflicts decided` separately from the file queue count

Mobile or narrow layout:

- stack queue and resolver or collapse the queue into a file selector
- do not put two full text columns side by side when they cannot remain readable
- keep all controls reachable without overlapping the modal footer

### Whole-File Shortcuts

Eligible text files should still offer `Use all Current` and `Use all Incoming` as deliberate shortcuts. These actions populate every region decision, show the composed preview, and still require `Resolve File`; they must not call the existing immediate checkout methods directly.

Ineligible files continue to use immediate whole-file resolution through the existing backend methods. Rename their UI labels to `Keep Current File` and `Keep Incoming File` while leaving internal Git method names unchanged.

### Phase 1 Tests

Frontend tests should cover:

- loading and routing eligible versus fallback files
- one unresolved block disabling `Resolve File`
- block-level Current and Incoming selection
- expanding a block and selecting lines from both sides
- explicit empty-block behavior
- preserving line decisions through collapse and file navigation
- whole-file shortcut populating all decisions without applying immediately
- compose output for multiple conflicts and untouched auto-merged context
- stale-token response preserving the draft and requiring reload
- apply success updating `fileResolutions` and advancing once
- apply failure retaining the active file and decisions
- modal close/abort discarding drafts without writes
- keyboard and screen-reader labels for side choices and conflict navigation

Exit gate:

- representative `.md`, `.txt`, `.xml`, and source files can be resolved without exposing conflict markers
- backend and frontend tests pass
- a manual Windows and macOS pass verifies CRLF behavior and queue/resolver sizing

### Phase 1 Action Plan

1. **Action:** Map generated backend models into merge-domain types and add only `loadConflictResolutionData` and `resolveConflictWithContent` to `RepoContext`.
  **Project manager note:** Keeping detailed draft state out of global context limits regression risk and makes ownership clear: context handles repository operations; the merge modal handles temporary user choices.
2. **Action:** Implement the pure composer and completeness validator first, with golden tests for LF, CRLF, BOM, no-final-newline, multiple regions, and explicit empty blocks.
  **Project manager note:** The composer is the feature's data-loss boundary. Finishing and testing it before visual controls gives the UI team a stable definition of what every click will produce.
3. **Action:** Build one end-to-end `.txt` vertical slice with one conflict block, Current/Incoming selection, preview, apply, live-index reconciliation, and queue advancement.
  **Project manager note:** This is the first demonstrable milestone. It validates the entire architecture cheaply before adding navigation and line-level complexity.
4. **Action:** Add multi-region navigation, block decisions, expanded line selection, explicit empty-block confirmation, per-file draft retention, and whole-file shortcuts.
  **Project manager note:** These are user-efficiency features built on the proven slice. Progress should be demonstrated with representative `.md`, `.xml`, and source files rather than isolated component screenshots.
5. **Action:** Add loading, stale-draft, apply-failure, close/abort, accessibility, responsive-layout, and analytics coverage.
  **Project manager note:** These states determine whether the resolver is trustworthy for non-technical users. Phase 1 is not complete if only the successful path works.
6. **Action:** Run focused frontend tests, type checking, build validation, and manual Windows/macOS line-ending checks.
  **Project manager note:** This phase produces a releasable text resolver, but not a releasable product MVP; L5X rung/tag resolution and fallback hardening remain mandatory.

## Phase 2: L5X Complete-Rung And Complete-Tag Resolver

### Core Constraint

The existing L5X viewer parses source XML into `NormalizedController`, and the inline ladder diff model is designed for display. It does not retain a lossless source mapping and must not be serialized back into an L5X file.

The L5X resolver must therefore be a source-aware projection over the phase 1 three-way model:

1. Git still produces the authoritative auto-merged context and conflict regions.
2. `ladder-visualizer` maps conflict regions to stable RLL rung or tag identities on the base, current, and incoming sides.
3. choosing a rung or tag replaces that complete XML element with the exact source span from Current or Incoming, including non-conflicting edits inside the entity
4. the phase 1 composer preserves Git's auto-merged content everywhere outside the selected entity spans
5. `ladder-visualizer.parseString(result, 'l5x')` validates the composed file before apply

This avoids a second merge engine and avoids rebuilding XML from normalized objects.

### Package-Owned Contract

Add a pure, non-React conflict projection API in the `ladder-visualizer` package. The exact names can follow package conventions, but the contract should resemble:

```ts
interface L5XSourceRange {
  startOffset: number;
  endOffset: number;
}

interface L5XEntityAlternative {
  source: string;
  sourceRange: L5XSourceRange;
}

interface L5XRungConflictChoice {
  id: string;
  programName: string;
  routineName: string;
  rungNumber: number;
  conflictRegionIds: string[];
  mergedSourceRange: L5XSourceRange;
  currentAlternative?: L5XEntityAlternative;
  incomingAlternative?: L5XEntityAlternative;
  baseRung?: NormalizedRung;
  currentRung?: NormalizedRung;
  incomingRung?: NormalizedRung;
}

interface L5XTagConflictChoice {
  id: string;
  scope: 'controller' | 'program';
  programName?: string;
  tagName: string;
  conflictRegionIds: string[];
  mergedSourceRange: L5XSourceRange;
  currentAlternative?: L5XEntityAlternative;
  incomingAlternative?: L5XEntityAlternative;
  baseTag?: NormalizedTag;
  currentTag?: NormalizedTag;
  incomingTag?: NormalizedTag;
}

interface L5XConflictProjection {
  rungConflicts: L5XRungConflictChoice[];
  tagConflicts: L5XTagConflictChoice[];
  unsupportedConflictRegionIds: string[];
  warnings: string[];
}

projectL5XConflictRegions(input): L5XConflictProjection;
```

The package owns:

- XML-aware location of programs, RLL routines, and rung elements in all three source documents
- XML-aware location of controller and program tags in all three source documents
- stable rung and tag identity and mapping rules
- detection of one-to-many, many-to-one, duplicate, renumbered, moved, or otherwise ambiguous mappings
- construction of existing inline rung diff display models for Current versus Incoming context
- validation of the final composed L5X text

The package must use a structured XML parser/tokenizer and source locations. It must not locate or replace `<Rung>` elements with regular expressions. If the current `fast-xml-parser` path cannot retain source ranges, add a narrowly scoped source-location pass rather than changing the ordinary normalized parser or serializing the whole document through `XMLBuilder`.

### Safe Projection Rules

A conflict can be offered as a complete-rung choice only when:

- both selected alternatives can be associated with one stable program/routine/rung identity
- all text conflict regions covered by the visual choice belong exclusively to that rung
- the complete `<Rung>` source span is available for each selectable side
- selecting one side replaces the entire rung and cannot retain content from the other side inside it
- the resulting complete text passes L5X parsing

A conflict can be offered as a complete-tag choice only when:

- it maps to one stable controller tag identity or one stable program-plus-tag identity
- all conflict regions covered by the choice belong exclusively to that `<Tag>` element
- the complete `<Tag>` source span is available for each selectable side
- selecting one side replaces the entire tag, including attributes, descriptions, data blocks, CDATA, and unsupported child XML
- the resulting complete text passes L5X parsing

Fallback to the text resolver when:

- a conflict spans multiple rungs
- rung identity is ambiguous or the rung moved/renumbered incompatibly
- a conflict mixes a rung or tag with another entity, or spans data types, AOIs, modules, controller metadata, or routine metadata
- the routine is structured text rather than RLL
- source locations cannot be established safely
- parsing any required side fails

The L5X resolver may show unsupported conflicts in the same file as an `Other L5X conflicts` group. The user may resolve text-safe regions through the phase 1 text surface, or abandon the detailed draft and choose a complete Current or Incoming file. Whole-file fallback remains visible throughout this workflow.

### Desktop Components

Add a merge-owned `L5XConflictResolver.tsx` that reuses:

- `buildInlineDiffModel()` and `InlineDiffRung` for modified-rung comparison
- `VirtualizedLadderDiagram` for single-sided added/removed rung context
- existing ControlZebra ladder themes
- package-owned height measurement and virtualization patterns
- the existing tag-table and tag-diff presentation for controller and program tags

Each visual rung card provides exactly two actions:

- `Use Current Rung`
- `Use Incoming Rung`

Each tag row or card provides exactly two actions:

- `Use Current Tag`
- `Use Incoming Tag`

Do not make SVG instructions or individual tag properties clickable in this phase. A rung or tag decision replaces the complete mapped entity atomically and marks all conflict regions owned exclusively by that entity as decided. The composed source remains the source of truth for apply and validation.

### Phase 2 Tests

Package tests in `ladder-visualizer`:

- one modified RLL rung mapped to one conflict region
- one rung containing several underlying text conflict regions
- added and removed rung cases
- branches, comments, CDATA, and escaped XML content
- identical rung numbers in different programs/routines
- reordered, renumbered, and moved rung ambiguity
- conflict spanning two rungs
- mixed rung and tag conflict
- controller-tag and program-tag add, remove, and modify cases
- tags containing descriptions, CDATA, multiple `Data` formats, and unsupported child XML
- duplicate or ambiguous tag identities
- structured-text routine fallback
- malformed and unsupported L5X fallback
- composed output parses and preserves unselected document content

Desktop tests:

- `.l5x` eligible file routes to ladder resolver
- complete-rung choice copies the selected side's entire rung, including non-conflicting edits inside it
- complete-tag choice copies the selected side's entire tag, including source details absent from `NormalizedTag`
- no instruction-level choice controls are rendered
- no individual tag-property choice controls are rendered
- unsupported regions retain whole-file fallback and optionally expose text fallback
- invalid composed L5X disables detailed apply and explains the whole-file fallback
- valid composed L5X calls the same phase 1 apply method
- successful apply advances the existing decision queue once

Exit gate:

- real Studio 5000 fixtures with rung and tag conflicts resolve to parseable L5X
- unsupported mappings fail closed to whole-file fallback, with optional text resolution when safe
- no normalized-controller serialization or regex XML splicing exists in either repository

### Phase 2 Action Plan

1. **Action:** Select and prove a structured XML tokenizer or source-location strategy against real L5X fixtures containing comments, CDATA, escaped content, and multiple tag data formats.
  **Project manager note:** This is the main technical uncertainty. Schedule it as a time-boxed spike with a go/no-go review before committing the UI estimate; normalized parser objects alone are not lossless enough for safe replacement.
2. **Action:** Implement pure source-location indexes for programs, routines, rungs, controller tags, and program tags without changing ordinary `parseString()` behavior.
  **Project manager note:** The output of this step is exact source ranges, not UI. It enables complete-entity choices while protecting unsupported L5X content from accidental rewriting.
3. **Action:** Implement three-way rung and tag projection, exclusive conflict-region ownership, ambiguity reason codes, and exact Current/Incoming alternatives.
  **Project manager note:** This determines which conflicts can be shown safely. Ambiguous mappings are expected product outcomes, not engineering failures; they must produce a categorized fallback reason.
4. **Action:** Add package tests for complete-rung and complete-tag replacement, additions/deletions, mixed conflicts, moves, duplicate identities, malformed files, and preservation of unselected content.
  **Project manager note:** Fixture evidence is the acceptance artifact for the projection layer. Use sanitized Studio 5000 exports so estimates and confidence are based on production-like files.
5. **Action:** Build the Desktop L5X resolver with rung visualization, tag rows, decision counts, mixed unsupported groups, parse validation, and persistent whole-file actions.
  **Project manager note:** The interface should expose only decisions the projection marked safe. Unsupported areas must be explained plainly and must never trap the user without a whole-file way forward.
6. **Action:** Integrate entity decisions into the shared composer and prove that choosing Current or Incoming copies the complete entity rather than a hybrid.
  **Project manager note:** This is the critical product acceptance check. A visual side label is misleading unless the final XML exactly matches that side for the selected rung or tag.
7. **Action:** Run package tests, type checking, library build, Desktop feature tests, and linked-package integration validation.
  **Project manager note:** Phase 2 is complete only when the package and its actual Desktop consumer pass together; a package-only demonstration does not prove the shipped workflow.

## Phase 3: Integrated Fallback And MVP Release Hardening

### Phase 3 Action Plan

1. **Action:** Make `Keep Current File` and `Keep Incoming File` visible and functional in every L5X resolver state, including partial visualization, loading failure, parse failure, stale draft, and unsupported content.
  **Project manager note:** This is a direct client requirement and the guaranteed recovery path. It should be tracked as an acceptance criterion, not treated as secondary error handling.
2. **Action:** Add confirmation and draft-reset behavior when a whole-file action replaces existing rung, tag, or text decisions.
  **Project manager note:** Users must understand that detailed work will be discarded. The confirmation prevents accidental loss while keeping recovery to one deliberate action.
3. **Action:** Verify delete/modify, both-deleted, directory/file, symlink, submodule, binary, oversized, and unsupported-encoding behavior across backend and UI.
  **Project manager note:** These cases are uncommon but high-risk. MVP readiness requires predictable fallback behavior rather than leaving users in an unfinishable merge.
4. **Action:** Run end-to-end fixture scenarios with multiple files and mixed resolver types, confirming one queue advancement per successful apply and no writes on modal close or merge abort.
  **Project manager note:** This validates the product workflow rather than isolated components. Include text, visual L5X, unsupported L5X, and deletion conflicts in the same test merge.
5. **Action:** Complete accessibility, analytics privacy, performance, and plain-language UX review with representative non-technical users.
  **Project manager note:** The release goal is not merely conflict correctness; operators must be able to understand the choices without Git terminology or hidden technical knowledge.
6. **Action:** Run the complete backend, package, frontend, build, Windows, and macOS validation matrix and record release evidence.
  **Project manager note:** Windows is a mandatory release gate because path handling, atomic replacement, file watchers, and CRLF behavior differ materially from macOS.
7. **Action:** Hold one MVP go/no-go review against the combined Definition of Done below.
  **Project manager note:** Do not release Phase 1 independently. The client-required MVP includes text resolution, rung selection, tag selection, and whole-file fallback as one product capability.

## File-Level Implementation Map

### ControlZebra Desktop Backend

| File | Planned change |
| --- | --- |
| `services/git_service.go` | Add stage loading, text eligibility, Git merge-file region generation, resolution tokens, atomic content apply, and stage-aware whole-file apply including deletion. |
| `services/git_service_test.go` | Add real-repository three-way conflict, path safety, encoding, newline, stale-token, and apply tests. |
| `frontend/bindings/controlzebra/services/` | Regenerate bindings; never edit generated files manually. |

### ControlZebra Desktop Frontend

| File | Planned change |
| --- | --- |
| `frontend/src/domain/repo/context/RepoContext.types.ts` | Add complete conflict statuses and load/apply contracts. Keep file completion separate from region decisions. |
| `frontend/src/domain/repo/context/RepoContext.tsx` | Load resolution data, apply composed content, reconcile live merge state, and update analytics. |
| `frontend/src/features/merge/components/ExplorerMergeModal.tsx` | Own per-file in-memory drafts and pass active resolver state into the queue surface. |
| `frontend/src/features/merge/components/modal/MergeConflictQueue.tsx` | Retain queue/auto-advance behavior and host the detailed resolver pane. |
| `frontend/src/features/merge/components/modal/ConflictResolverPane.tsx` | New resolver router and loading/fallback states. |
| `frontend/src/features/merge/components/modal/TextConflictResolver.tsx` | New block-first text resolution UI. |
| `frontend/src/features/merge/components/modal/TextConflictBlock.tsx` | New expandable block and line-selection UI. |
| `frontend/src/features/merge/components/modal/WholeFileConflictFallback.tsx` | New plain-language wrapper around current whole-file actions. |
| `frontend/src/features/merge/lib/conflict-composer.ts` | New pure composition, completeness, newline, and empty-block rules. |
| `frontend/src/features/merge/components/modal/L5XConflictResolver.tsx` | Visual complete-rung and complete-tag resolver with persistent whole-file fallback. |

### Ladder Visualizer

| File area | Planned change |
| --- | --- |
| `src/parsers/l5x/` | Add source-aware rung and tag location support without altering ordinary normalized parsing behavior. |
| `src/diff/` | Add pure three-way L5X rung/tag conflict projection types, mapping logic, and reason codes. |
| `src/index.ts` | Export the package-owned projection contract. |
| `tests/` | Add real-fixture projection, ambiguity, and parse-validation coverage. |

## Analytics And Diagnostics

Extend conflict analytics without recording file contents, paths, branch names, or selected lines.

Track:

- resolver type: whole-file, text, L5X rung, or L5X tag
- conflict region count bucket
- block versus line mode used
- whole-file shortcut used
- L5X fallback reason category
- apply success, stale draft, validation failure, or staging failure
- time-to-resolve bucket

Debug logging may include method names, status, sizes, stage presence, and hashed resolution tokens. It must not log blob content or composed output.

## Validation Commands

After each backend slice:

```bash
go test ./services/... -run 'Test.*Conflict' -v
```

After each frontend slice:

```bash
cd frontend
npm exec -- vitest run src/features/merge
npm run typecheck
```

After ladder package changes:

```bash
cd ../ladder-visualizer
npm run test:run
npm run typecheck
npm run build:lib
```

Before completing each phase:

```bash
go test ./services/... -v
cd frontend && npm test && npm run typecheck && npm run build
```

Manual release validation must include Windows because line endings, executable-bit handling, path separators, atomic replacement, and file watcher events differ from macOS.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Frontend recomputes a merge differently from Git | High | Git backend generates authoritative conflict segments from index stage blobs. Frontend only substitutes explicit decisions. |
| Index changes after a draft loads | High | Fingerprint stage mode/OIDs and reject stale resolution tokens at apply time. |
| Line-level combinations produce invalid syntax | Medium | No syntax guarantee for generic text; always show composed preview. L5X has mandatory parse validation. |
| L5X normalized serialization loses unsupported XML | Critical | Never serialize `NormalizedController`; copy exact selected-side source spans for complete rungs and tags. |
| Rung or tag mapping is ambiguous | High | Block detailed apply, provide a plain-language reason, and retain whole-file fallback. |
| A side choice creates a hybrid rung or tag | Critical | Replace the complete entity source span and test non-conflicting edits inside selected entities. |
| Unsupported L5X content traps the user | High | Keep whole-file Current/Incoming actions visible in every L5X resolver state. |
| Large files freeze the modal | Medium | Enforce backend limits, lazy-load the active file, virtualize long conflict lists, and avoid storing duplicate full strings per decision. |
| CRLF or final newline changes create unrelated churn | High | Preserve backend newline/BOM metadata and cover it with golden tests on Windows and macOS. |
| Applying content writes outside the repository | Critical | Validate relative paths, reject escapes, and test symlink behavior before writing. |
| Existing file-level semantics regress | High | Keep current methods and tests as fallback; route only explicitly eligible text files into the new path. |

## Definition Of Done

The conflict resolution MVP is complete only when:

- users can resolve true conflict regions in eligible UTF-8 text files by block or selected lines
- non-conflicting edits from both branches remain in the result automatically
- drafts remain in memory until `Resolve File`
- stale drafts cannot overwrite changed index state
- successful apply writes and stages once, then advances the queue
- eligible RLL conflicts appear as complete-rung Current/Incoming choices
- eligible controller and program tag conflicts appear as complete-tag Current/Incoming choices
- selected rungs and tags exactly match the chosen side and never become hybrid entities
- no instruction-level choice exists
- no individual tag-property choice exists
- whole-file Current/Incoming fallback is available in every L5X resolver state
- delete/modify and both-deleted whole-file choices apply the selected side's presence or deletion correctly
- invalid or ambiguous detailed L5X results are blocked without blocking whole-file recovery
- real composed fixtures parse successfully in `ladder-visualizer`
- no code serializes normalized controllers or edits L5X with regex
- closing or aborting discards drafts without writing
- focused and full backend, package, frontend, type, and build validation passes
- manual Windows and macOS acceptance passes are recorded

## Recommended First Implementation Slice

Start with one backend-to-frontend vertical slice for a small UTF-8 `.txt` file containing one conflict:

1. load stage 1/2/3 blobs and one typed conflict region
2. render one block with `Use Current` and `Use Incoming`
3. compose the result in memory
4. apply it through a stage-fingerprint-checked backend method
5. verify the file leaves `git ls-files -u` and the queue advances

After that slice passes, add multi-region navigation, line expansion, and broad text eligibility. The first L5X vertical slice should then use one modified rung and one modified controller tag in the same file, prove exact complete-entity replacement for both, retain a visible whole-file fallback, parse the result, stage it, and advance the queue once.

**Related:** [[PLANS_SUMMARY]] | [[Git Workflows]] | [[Viewer System]] | [[L5X Git Diff Noise Reduction Plan]]