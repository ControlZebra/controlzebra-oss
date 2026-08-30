# ControlZebra first public beta

## Direction

**Make ControlZebra the easiest way for a small Rockwell team to understand changes, preserve recoverable project versions, and review shared work.**

The Reddit excerpts support practical workflow improvements; they do not yet justify a broad PLC/SCADA/DCS platform or enterprise compliance product. The comments could not be independently retrieved, so treat them as qualitative input.

Your existing Git workflows, L5X diffs, GitHub Change Requests, history, and LFS locking provide much of the foundation. The beta should concentrate on completing and validating these capabilities.

Chosen boundaries: **public self-service launch, small Rockwell teams, manual L5X exports, polish plus small additions.** Default to Windows x64 and GitHub as the supported launch combination.

## Features that should make the beta

1. **A guided first successful checkpoint — finish existing onboarding.**  
   Let users try a bundled sample project, open their own folder, review changes, and save a version without a ControlZebra account. Explain that Save is local and Share uploads to their chosen remote. Provide actionable dependency/authentication errors and retry buttons. First-time setup may require internet; subsequent local work must function offline.

2. **An honest Rockwell capture workflow — small addition.**  
   Guide users to keep their native `.ACD` project and manually exported `.L5X` together. State clearly: ACD is stored for recovery; L5X enables visual review. Remind users to refresh exports when native files change, without claiming that matching timestamps or a changed export proves equivalence. Offer ACD LFS setup; keep L5X as normal text by default and preserve existing repository configuration.

3. **Trustworthy visual changes — highest product priority.**  
   Polish the existing rung/instruction comparison, changed-item navigation, and supported tag/configuration views. Separate export metadata from engineering changes. Always provide raw comparison and visible warnings for unsupported or partially interpreted content. “No changes detected in supported content” must not imply the entire project is unchanged. Preserve instruction order and any ordering whose meaning is uncertain; defer aggressive normalization.

4. **Recovery users can understand — fix ambiguity and add a safe escape route.**  
   Show who saved a version, when, and why. Rename the existing commit-revert action to **Undo this change**: [the current dialog](/Users/shreyasnikte/Software%20Projects/ControlZebra/controlzebra-oss/frontend/src/features/history/components/CommitOverviewPanel.tsx:479) calls it snapshot restoration but describes undoing one commit. Add **Recover this version as a separate project folder**, leaving the working project untouched and retrieving actual LFS files. Hide unfinished per-file Restore controls. Describe recovery as restoring project files, never restoring a running machine.

5. **A complete, modest team-review workflow — finish existing work.**  
   Support creating a task branch, saving, explicitly sharing, opening a Change Request, and inspecting its visual diff. Keep approvals, comments, and protected-branch enforcement in GitHub for this beta, with a clear link there. Finish the active conflict-workflow changes, including cancellation, restart recovery, and explicit sharing. Explain that updating a branch changes local project files; a successful Git merge does not validate PLC behavior.

6. **Basic binary checkout ownership — polish what already exists.**  
   Make existing Lock/Unlock actions and owner indicators understandable as **Check out / Release**. Distinguish “available” from “could not check ownership” when offline, unauthenticated, or unsupported by the server. Require confirmation and server authorization for overrides. Present this as coordination through supported LFS hosts, not guaranteed prevention of edits in Studio 5000. Resolve binary conflicts by whole-file selection, never content merging.

7. **Trustworthy installation and privacy — launch requirements.**  
   Validate installation and updates with security controls enabled, using trusted publisher signing and verified update artifacts. Remove the [instruction to disable antivirus](/Users/shreyasnikte/Software%20Projects/ControlZebra/website/src/content/docs/docs/getting-started/installation.md:8). Align documentation with guest mode and actual provider support. Add a genuine telemetry-off setting, default new installations to off, disable session replay for beta, and provide user-initiated diagnostics that exclude credentials and project contents.

## What should wait

- **Native ACD interpretation, Siemens, and other vendor parsers:** expand after the Rockwell workflow earns repeat use.
- **Automatic exports and the Python automation platform:** manual export is an accepted beta constraint.
- **In-app approvals, centralized audit infrastructure, SSO, and team administration:** GitHub supplies initial collaboration; ordinary Git history is not a tamper-proof compliance record.
- **PLC connectivity, deployment, automated rollback, and AI-generated logic:** outside the beta’s file-management and review purpose.
- **More PDF/image/3D features:** retain existing viewers without making their expansion a launch dependency.

The strongest next feature to validate after launch is **“compare two L5X files without creating a repository.”** It could introduce value to engineers still using dated folders. Shareable review reports come next.

Default commercial approach: a clearly described free beta, with no billing implementation. Validate paid team needs through usage and conversations rather than inferring pricing from Reddit.

## Implementation boundaries

Reuse the existing desktop services, viewer registry, snapshot comparison pipeline, and GitHub integration; add no new hosted backend.

Limit interface additions to recovery into a separate folder, explicit lock-availability status, parser coverage/warnings, and telemetry-off behavior. Preserve existing histories and tracked source files; introduce no automatic LFS history migration or source-rewriting filters.

Keep raw exports authoritative. Any content the visual comparison cannot interpret must remain discoverable.

## Release checks and learning goals

Before public launch:

- Test clean Windows installation, interrupted setup/update, guest mode, offline local work, expired authentication, and missing LFS objects.
- Validate sanitized real L5X examples covering metadata-only exports, changed operands/comments, added/deleted/reordered rungs, unsupported content, malformed files, and large projects.
- Exercise two-person sharing, stale reviews, overlapping changes, binary checkout, cancellation, and restart during conflict resolution.
- Verify recovered project files match the selected version and the original working folder remains untouched.
- Confirm telemetry-off sends no analytics or error reports.

Proposed usability gate: **at least four of five unfamiliar engineers complete the sample review/save workflow within 15 minutes without assistance.**

After launch, measure repeat project use and completed teammate reviews through consenting users or interviews. These are learning targets, not current results. This assessment is based on source inspection, not release verification.
