# L5X Git Diff Noise Reduction Plan

> Reduce Studio 5000 L5X diff noise in Git by comparing a stable semantic representation instead of raw export XML.

## Background

Studio 5000 exported L5X files produce noisy Git diffs even when the underlying ladder logic has not meaningfully changed. The two main sources are:

- Volatile export metadata such as export timestamps, software revision, and export options.
- Non-semantic ordering changes in the XML that cause large text diffs even when the controller model is effectively the same.

ControlZebra already has a strong semantic foundation for L5X parsing and diffing through the linked `ladder-visualizer` package. That package parses L5X into a normalized controller model and already isolates vendor-specific metadata from core logic structures. This plan extends that foundation to Git-side review so ordinary `git diff` output becomes more useful.

## Problem Statement

Raw text diff is the wrong comparison layer for L5X exports.

- Metadata-only re-exports appear as meaningful file changes.
- XML sibling reordering creates distracting churn.
- Reviewers have to mentally reconstruct whether a diff reflects real ladder logic changes or only Studio export behavior.
- The repository currently has no L5X-specific Git diff driver or canonicalization step.

## Goals

- Reduce Git diff noise for `.l5x` files without rewriting the stored source files in the first phase.
- Reuse the existing L5X parsing and normalization pipeline instead of building a second interpretation of the format.
- Preserve real logic changes such as operand edits, rung additions or removals, rung comment changes, and structural branch edits.
- Keep the approach safe for non-technical contributors and straightforward to document.

## Non-Goals

- Do not introduce a clean or smudge filter that rewrites committed L5X content in phase 1.
- Do not hide behaviorally meaningful ordering changes inside a rung.
- Do not solve only the in-app diff viewer while leaving normal Git review noisy.

## Current State

The current architecture already provides several seams we should reuse:

- `ladder-visualizer/src/parsers/parse.ts` is the existing parse entry point.
- `ladder-visualizer/src/parsers/l5x/l5x-to-normalized.ts` converts L5X into `NormalizedController` and stores volatile L5X export details under `vendorMetadata`.
- `ladder-visualizer/src/diff/diffControllers.ts` already compares controller entities by semantic keys such as program name, routine name, and rung number.
- `ladder-visualizer/src/diff/inline/` contains render-oriented rung traversal logic that can inform canonical serialization.

This means we do not need a new XML-specific diff engine. We need a deterministic serializer for Git.

## Proposed Approach

Use a Git `textconv` diff driver for L5X files.

Instead of asking Git to compare raw XML, configure Git to run a small CLI that:

1. Parses the L5X file with the existing ladder-visualizer parser.
2. Converts it into the normalized controller model.
3. Emits a canonical plain-text representation with stable ordering and filtered metadata.

Git then diffs that canonical text while leaving the original `.l5x` file unchanged in the repository.

This gives the safest first implementation because:

- It improves review output without altering source files.
- It keeps the semantics aligned with the app's L5X viewer and diff stack.
- It can be enabled per-repository with `.gitattributes` plus a documented local Git config step.

## Canonical Diff Contract

The canonical serializer should treat the following as noise and exclude them from diff output:

- Export date
- Export options
- Software revision
- Schema revision
- Controller created date
- Controller modified date when it only reflects export churn

The canonical serializer must preserve:

- Controller identity and meaningful description fields
- Programs, routines, and their membership relationships
- Rungs ordered by rung number
- Rung comments
- Instruction mnemonics and operands
- Tags, data types, AOIs, and modules
- Structural branch changes that alter ladder behavior or review meaning

## Ordering Rules

### Safe To Normalize

- Programs by name
- Routines by name within program
- Controller and program tags by stable scope plus name
- Data types by name
- AOIs by name
- Modules by name
- Rungs by rung number

### Preserve Source Order

- Top-level instruction sequence inside a rung
- Any branch layout where semantic equivalence cannot be proven confidently

### Conditional Normalization

Parallel branch leg ordering may be normalized later, but only after tests prove that the serializer does not hide meaningful changes. Phase 1 should default to preserving branch order unless a stable semantic fingerprint makes equivalence obvious.

## Implementation Phases

## Phase 1: Canonical Serializer And CLI

Add a serializer inside `ladder-visualizer` that converts `NormalizedController` into deterministic plain text for diffing.

Deliverables:

- A canonical serializer module for normalized controllers.
- L5X-specific canonical serialization rules that drop volatile export metadata.
- A small Node CLI entry point that Git can call for `textconv`.
- Tests covering metadata-only churn and real logic changes.

Notes:

- This phase should not modify the tracked `.l5x` file.
- The CLI should be packaged with ladder-visualizer so ControlZebra does not duplicate parsing logic.

## Phase 2: Git Integration In The Repository

Add repository guidance and attributes so contributors can enable the L5X diff driver locally.

Deliverables:

- A root `.gitattributes` entry mapping `*.l5x` and `*.L5X` to `diff=l5x`.
- Setup documentation describing how to configure `diff.l5x.textconv` to invoke the CLI.
- Verification steps showing the difference between `git diff` and `git diff --no-textconv`.

Notes:

- `.gitattributes` can be committed, but the `textconv` command usually still needs local Git config.
- The documentation should target ordinary contributors and avoid requiring them to understand the ladder-visualizer internals.

## Phase 3: Optional Advanced Normalization

Evaluate whether harmless branch-leg reorder can be normalized safely.

Deliverables:

- A branch-leg equivalence strategy backed by fixtures.
- Additional tests for safe semantic reordering.
- A clear fallback path that preserves source order when normalization confidence is low.

Notes:

- This is optional follow-up work, not a requirement for the first release.
- We should prefer false negatives over hiding real logic changes.

## Validation Plan

The implementation is complete only when these cases are verified:

1. Metadata-only re-export produces no canonical diff.
2. Non-semantic XML collection reorder produces no canonical diff.
3. Operand changes produce canonical diff output.
4. Rung comment changes produce canonical diff output.
5. Rung add and remove operations produce canonical diff output.
6. Unsafe ordering cases still surface as diffs rather than being incorrectly normalized away.

Validation should include both automated tests in `ladder-visualizer` and a manual Git verification pass against representative L5X fixtures.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Canonicalization hides a real logic change | High | Preserve top-level instruction order and gate advanced normalization behind tests |
| Git setup is too manual for contributors | Medium | Commit `.gitattributes`, add one-time setup documentation, and provide verification commands |
| A second parser path drifts from the viewer | High | Reuse the existing ladder-visualizer parser and normalized model only |
| Textconv output is hard to read | Medium | Keep the canonical text structured, grouped, and stable rather than emitting raw JSON |

## Open Questions

- Should controller `modifiedDate` always be excluded, or only when no other semantic changes exist?
- Should the CLI live as a published package bin, a workspace script, or both?
- Do we want a future repository bootstrap step that configures the L5X diff driver automatically for contributors?

## Recommended First Cut

Start with the smallest safe version:

1. Canonicalize controller, program, routine, tag, AOI, module, and rung ordering.
2. Strip volatile export metadata and timestamps from canonical output.
3. Preserve branch order and top-level rung instruction order.
4. Wire Git through `textconv` only.

This first cut removes the highest-volume noise without taking on unnecessary semantic risk.

**Related:** [[PLANS_SUMMARY]] | [[Viewer System]] | [[Git Workflows]] | [[Frontend Architecture]]