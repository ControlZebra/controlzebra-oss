# L5X Git Diff Noise Reduction Plan

> Reduce Studio 5000 L5X diff noise in Git by comparing a stable semantic representation instead of raw export XML.

## Background

Studio 5000 exported L5X files produce noisy Git diffs even when the underlying ladder logic has not meaningfully changed. The two main sources are:

- volatile export metadata such as export timestamps, software revision, and export options
- non-semantic ordering changes in the XML that cause large text diffs even when the controller model is effectively the same

ControlZebra already has a strong semantic foundation for L5X parsing and diffing through the linked `ladder-visualizer` package. That package parses L5X into a normalized controller model and now has a package-side implementation checklist that locks the phase 1 canonicalization contract. This desktop plan exists to wire that package output into ordinary repository review.

## Problem Statement

Raw text diff is the wrong comparison layer for L5X exports.

- metadata-only re-exports appear as meaningful file changes
- XML sibling and collection reordering creates distracting churn
- reviewers have to mentally reconstruct whether a diff reflects real ladder logic changes or only Studio export behavior
- the repository currently has no L5X-specific Git diff driver or contributor setup flow

## Goals

- reduce Git diff noise for `.l5x` files without rewriting stored source files in phase 1
- consume the existing ladder-visualizer parsing and canonicalization pipeline instead of building desktop-specific L5X logic
- preserve real logic changes such as operand edits, rung additions or removals, rung comment changes, and structural branch edits
- make repository setup understandable for ordinary contributors

## Non-Goals

- do not implement L5X canonicalization logic in ControlZebra Desktop
- do not introduce a clean or smudge filter that rewrites committed L5X content in phase 1
- do not hide behaviorally meaningful ordering changes inside a rung
- do not expand this plan into a second copy of the package serializer specification

## Package Contract This Plan Depends On

The linked ladder-visualizer package is the source of truth for canonicalization behavior. Desktop integration assumes the package-side contract is as follows:

- the canonicalizer is exposed as a short executable command suitable for `git config diff.l5x.textconv <command>`
- the canonicalizer always excludes `createdDate` and `modifiedDate`
- the canonicalizer excludes export metadata such as `exportDate`, `exportOptions`, `softwareRevision`, and `schemaRevision`
- the canonicalizer uses a narrow allowlist per section instead of serializing full normalized entities
- the canonicalizer preserves top-level rung instruction order and branch ordering in phase 1
- unsupported or ambiguous rung serialization remains visible through an explicit raw-rung fallback marker
- approved nested collection normalization is handled inside the package, including data type members, AOI parameters, AOI local tags, AOI routines, module ports, and module connections

This desktop plan must not redefine those rules. It should only reference and consume them.

## Proposed Approach

Use a Git `textconv` diff driver for L5X files and point it at the packaged ladder-visualizer canonicalizer executable.

Instead of asking Git to compare raw XML, configure the repository and contributor environment so Git runs the package CLI, which:

1. parses the L5X file with the existing ladder-visualizer parser
2. converts it into the normalized controller model
3. emits canonical plain text with the package-defined filtering, ordering, and rung fallback rules

Git then diffs that canonical text while leaving the original `.l5x` file unchanged in the repository.

This is the safest first implementation because:

- it improves review output without altering source files
- it keeps Git review semantics aligned with the package that already powers L5X viewing and diffing
- it keeps desktop ownership focused on repository wiring, docs, and verification rather than format logic

## Desktop-Owned Scope

This plan owns:

- committing `.gitattributes` entries for L5X diff handling
- documenting the one-time local Git config needed to enable the diff driver
- documenting the expected executable command name provided by ladder-visualizer
- documenting verification steps for contributors
- verifying that the linked workspace consumption model can expose the package executable without ad hoc patching

This plan does not own:

- serializer field allowlists
- timestamp filtering rules
- nested collection normalization rules
- rung fallback serialization logic
- package CLI implementation details beyond the executable contract it must satisfy

## Repository Integration Contract

The repository integration phase must match the package-side contract exactly.

### Diff Driver Shape

- the repository uses `diff=l5x` for `*.l5x` and `*.L5X`
- contributors configure `diff.l5x.textconv` to call the short executable name exposed by ladder-visualizer
- the recommended Git config must not rely on `node path/to/script`, workspace-relative internals, or contributor-specific patching

### Contributor Setup Contract

- `.gitattributes` is committed to the repository
- local Git config remains a one-time contributor step in phase 1
- setup docs explain what the command does in plain language without requiring knowledge of ladder-visualizer internals
- setup docs clearly state that the canonicalizer changes Git review output only and does not rewrite the stored `.l5x` file

### Linked Workspace Contract

- the desktop repo consumes ladder-visualizer through its built package outputs
- repository guidance must account for the linked package workflow so contributors do not accidentally use stale build artifacts
- validation steps must include rebuilding ladder-visualizer when testing new canonicalizer behavior from the linked workspace

## Implementation Phases

## Phase 1: Consume Package Canonicalizer

Wait for ladder-visualizer to ship the canonicalizer executable and lock the package-facing usage note.

Deliverables:

- confirmed executable command name from ladder-visualizer
- confirmed expectation that the package executable works from the linked workspace model used by ControlZebra Desktop
- clear note in desktop planning that canonicalization rules are package-owned, not repo-owned

Notes:

- this phase does not add repository wiring yet if the package executable contract is not ready
- desktop should not invent a temporary Node-path invocation that diverges from the package plan

## Phase 2: Git Integration In The Repository

Add repository guidance and attributes so contributors can enable the L5X diff driver locally.

Deliverables:

- a root `.gitattributes` entry mapping `*.l5x` and `*.L5X` to `diff=l5x`
- setup documentation describing how to configure `diff.l5x.textconv` to invoke the short ladder-visualizer executable
- setup documentation that explicitly states the repository depends on the package executable contract
- verification steps showing the difference between `git diff` and `git diff --no-textconv`
- verification steps for linked-workspace contributors that include rebuilding ladder-visualizer before validation when package code changes

Notes:

- `.gitattributes` can be committed, but the `textconv` command still needs local Git config in phase 1
- the documentation should target ordinary contributors and avoid requiring them to understand the package internals
- docs ownership for exact setup examples lives here in ControlZebra Desktop, not in ladder-visualizer package docs

## Phase 3: Verification And Rollout

Validate the repository wiring against representative L5X fixtures and confirm the contributor workflow is reasonable.

Deliverables:

- manual verification on representative metadata-only churn, reorder churn, and true logic change cases
- confirmation that raw-rung fallback remains visible in Git diff output when canonicalization cannot safely reduce a rung
- confirmation that `git diff --no-textconv` still shows raw XML for troubleshooting
- final contributor guidance that covers install, verify, and disable steps

Notes:

- this phase validates the integration contract; it does not expand canonicalization rules
- any request to change serialization semantics should route back to ladder-visualizer plan work, not desktop-only patches

## Validation Plan

The desktop integration is complete only when these cases are verified:

1. contributors can enable the diff driver with committed `.gitattributes` plus one-time local Git config
2. the configured `diff.l5x.textconv` command is the short package executable, not a fragile Node-path command
3. metadata-only re-export produces no meaningful canonical diff through ordinary `git diff`
4. approved non-semantic reorder produces no meaningful canonical diff through ordinary `git diff`
5. true logic changes still produce canonical diff output
6. unsupported or ambiguous rung cases remain visible through the package raw-rung fallback in Git output
7. `git diff --no-textconv` still exposes raw XML when a contributor needs to debug the canonicalizer behavior
8. linked-workspace contributors can verify changes reliably after rebuilding ladder-visualizer

Validation should include both package automated coverage in ladder-visualizer and a manual Git verification pass in this repository.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Desktop docs drift from the package executable contract | High | Treat ladder-visualizer as the source of truth for command shape and serialization behavior |
| Git setup is too manual for contributors | Medium | Commit `.gitattributes`, add one-time setup documentation, and provide verification commands |
| Linked workspace testing uses stale package artifacts | High | Require ladder-visualizer rebuild steps when validating package changes from the desktop repo |
| Contributors fall back to raw XML and lose trust in the workflow | Medium | Document `git diff --no-textconv` as a troubleshooting tool, not the normal review path |

## Open Questions

- Do we want a future repository bootstrap step that configures the L5X diff driver automatically for contributors?
- Do we want repository docs to include a troubleshooting section for stale linked-package builds beyond the initial verification steps?

## Recommended First Cut

Start with the smallest safe desktop integration:

1. wait for the ladder-visualizer short executable contract to land
2. commit `.gitattributes` for `diff=l5x`
3. document one-time local Git config using the package executable name
4. document linked-workspace verification steps, including rebuilding ladder-visualizer when package code changes
5. verify `git diff` versus `git diff --no-textconv` on representative L5X fixtures

This first cut keeps repository work narrow and aligned to the package-owned canonicalization contract.

**Related:** [[PLANS_SUMMARY]] | [[Viewer System]] | [[Git Workflows]] | [[Frontend Architecture]]