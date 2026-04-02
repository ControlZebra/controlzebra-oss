# ControlZebra Desktop Plans Summary

This document replaces the previous collection of detailed plan files in this folder, while newer targeted follow-up plans may still be added when active implementation work needs a dedicated design document.

## Active Follow-Up Plans

- [[L5X Git Diff Noise Reduction Plan]] - Active implementation plan for reducing Studio 5000 L5X Git diff noise through semantic canonicalization and Git textconv integration.
- [[Python Automation MVP Plan]] - Active implementation plan for repo-scoped Python automations with managed runtime, isolated dependencies, and non-blocking app-driven triggers.

The original plans captured several generations of product design, implementation sequencing, wireframes, and operational notes. Many of them were written before the related work shipped, and several retained stale status markers long after the repository moved on. This summary keeps the durable outcomes, major architectural decisions, and remaining roadmap themes in one place.

## Status At A Glance

- v1 core desktop workflow shipped: open a repository, review changes, save changes, sync, and push.
- v2 core capabilities largely shipped: history, diffing, branching, stash flows, undo/discard, protected-branch safeguards, LFS plumbing, merge-state handling, image/PDF/3D/L5X viewers, and update foundations.
- Several plan documents were superseded by later implementations or more focused follow-up plans.
- Remaining work is mostly polish, UX refinement, and a smaller set of still-open roadmap items rather than missing platform foundations.

## Product Evolution

ControlZebra was planned as a simplified Git desktop app for non-technical industrial users working with PLC, HMI, actuator, and other configuration files. Across the archived plans, the durable product direction stayed consistent:

- Prefer plain-English actions over Git jargon.
- Build around safe defaults, clear recovery paths, and visible state.
- Keep the backend CLI-first, using the system or bundled Git tooling rather than embedding a Git library.
- Support industrial file types as first-class review artifacts instead of forcing users through text-only workflows.

The broad roadmap evolved in three steps:

1. v1 established the core daily loop: open a repository, inspect changed files, save changes, sync, and push.
2. v2 expanded into review and recovery: history, diffs, branching, stash, merge handling, LFS support, and safer destructive actions.
3. Later planning shifted toward refinement rather than reinvention: better merge UX, optional accounts, startup diagnostics, polished viewers, update reliability, and future collaboration features.

## What Shipped

### Core Git And Recovery

- Repository opening, status, commit/save, pull/sync, and push/share shipped as the baseline experience.
- History browsing, commit details, working-tree diffs, and commit-file diffs shipped.
- Undo-last-save, discard changes, branch switching, and branch creation shipped.
- Stash-based branch switching and related safety flows were added.
- Merge-state detection, conflicted-file listing, abort/continue flows, and conflict-resolution backend support were implemented.
- LFS service foundations shipped, including enablement, tracked-pattern management, status, locks, and lock-aware checks.

### Viewer And Diff Platform

- The app moved to a registry-based viewer architecture for file rendering and diff rendering.
- Standard text diffs shipped alongside specialized viewers for images, PDFs, 3D models, and Rockwell L5X files.
- Binary and visual diff work standardized around old-side/new-side snapshot inputs rather than mode-specific one-off contracts.
- The diff system now supports history review, working-tree review, and merge-review entry points with the same overall contract model.

### UI Shell And Navigation

- The desktop shell, sidebar-driven navigation, history workflows, welcome flow, and major repo views shipped.
- The welcome experience was refined into clearer entry paths for recent projects, new projects, clone flows, and opening existing folders.
- File-management and file-browsing work substantially shipped, including table/list structure, navigation aids, and supporting UX around repository content.

### Updates And Distribution Foundations

- The updater direction settled on a sidecar updater model rather than in-process self-update logic.
- Windows update work standardized on a per-user LocalAppData installation model to avoid elevation-heavy update flows.
- Update staging and staged-artifact reuse were implemented to support ready-to-install update behavior and safer retries.
- Release-manifest and channel concepts were defined around hosted update metadata and signed artifacts.

## Superseded Or Consolidated Decisions

### Viewer Planning

- Early viewer plans that proposed standalone, file-type-specific implementation tracks were effectively absorbed into the current viewer registry and shared diff architecture.
- Earlier L5X diff concepts based on alternative presentation models were superseded by the layout-oriented diff direction that mirrors the normal L5X viewer more closely.
- Simplification work on the diff contract replaced older assumptions that different diff entry points needed independent viewer data shapes.

### Auth Direction

- Earlier Supabase-auth planning treated account login as a stronger gating mechanism.
- Later planning replaced that direction with optional-account and guest-mode thinking: the core desktop Git workflow should not depend on mandatory ControlZebra account sign-in.
- GitHub authentication planning remained separate from ControlZebra-account planning and was treated as task-specific integration for publishing, cloning, and connected workflows.

### Merge UX Planning

- Several independent merge plan documents converged on a shared direction: merge should be outcome-first, safer, and easier to review in-context rather than forcing users into a separate abstract workflow.
- Wireframe-heavy merge docs were intermediate design artifacts for a broader merge-modal redesign, not separate long-term tracks.

### Update Planning

- The earliest general auto-update plan became historical once the Windows LocalAppData and sidecar-updater plans established the real implementation path.
- Later updater documents became the authoritative direction for install location, staging, installer handoff, and retry-safe application.

## Durable Architecture Decisions

### Backend Pattern

- Git, GitHub CLI, and related operations are executed through CLI tooling and a shared command-runner approach.
- Service-based backend exposure through Wails remained the core integration seam between Go services and the React frontend.
- Mutation-style operations generally return explicit success/error structures rather than relying on implicit UI assumptions.

### Viewer And Diff Pattern

- File rendering is registry-driven so new industrial formats can be added without redesigning the whole shell.
- Diff rendering is not text-only; viewers can fetch historical or branch-specific file content and render domain-appropriate comparisons.
- Merge review and history review share the same core diff concepts wherever possible.

### Update Pattern

- A separate updater executable is responsible for checking, downloading, staging, and applying updates.
- Windows updates are designed around silent or near-silent per-user installation rather than machine-wide elevated replacement.
- Update staging is intentionally resilient: downloads can be reused when metadata still matches, and stale staging content can be cleaned safely.

## Remaining High-Level Roadmap

The deleted plans contained a large amount of detailed sequencing, but the remaining substantive work reduces to a smaller number of themes.

### Merge UX Refinement

- Finish the merge experience around an explorer-first, outcome-first workflow.
- Improve conflict handling so review, resolution, and safety gating feel coherent for non-technical users.
- Preserve selective merge and review concepts where they improve clarity without exposing raw Git complexity.

### Optional Accounts And Connected Workflows

- Keep local Git workflows available without mandatory ControlZebra account login.
- Add GitHub-connected workflows where they provide clear value, especially for clone, publish, and account-linked repository discovery.
- Reserve richer cloud and collaboration features for later phases rather than coupling them to desktop basics.

### Observability And Startup Diagnostics

- Add stronger structured debug logging and runtime diagnostics for supportability.
- Improve startup gating so benign warnings do not look fatal and real failures are easier to explain to non-technical users.
- Add analytics carefully and intentionally, with a clear event model and privacy-conscious behavior.

### Final UI Polish

- Finish remaining v2 frontend polish items around LFS surfacing, branch nudges, merge guidance, and consistency across views and dialogs.
- Continue reducing Git jargon and tightening error/recovery messaging.
- Keep refining large-file and industrial-file experiences rather than treating them as edge cases.

### Longer-Term Work

- Extend industrial structured diffing beyond the current set of viewers where it materially improves review quality.
- Expand recovery coverage for additional stuck Git states.
- Add collaboration and account-linked cloud capabilities only after the single-user desktop workflow is fully polished.

## Release And Update Operations

The old plans folder also contained operational release notes and update runbook material. The durable process-level points were:

- Versioned desktop release artifacts are built and packaged per channel.
- Windows distribution depends on a signed installer/update flow and corresponding manifest publication.
- Release work includes version bumping, packaging, signing, manifest generation, publication, and verification.
- Update correctness depends as much on packaging and manifest discipline as on in-app update logic.

This summary intentionally preserves those principles without retaining step-by-step historical runbook text.

## Historical Disposition

All previous files in this folder were intentionally consolidated into this single summary on 2026-04-01.

Reasons for consolidation:

- Most plans described work that has already shipped.
- Several files were superseded by later implementation paths.
- Some documents overlapped heavily and fragmented the same topic across multiple drafts, wireframes, and follow-up plans.
- A single high-level summary is easier to maintain and more accurately reflects the current state of the product.

The folder primarily holds this archival summary, with occasional focused follow-up plans when a current implementation topic benefits from a dedicated design document.