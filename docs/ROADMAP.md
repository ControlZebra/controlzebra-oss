# Rewind Logic — Roadmap

This roadmap translates product intent into concrete milestones with scope boundaries.

Related docs:
- See docs/COLLABORATION_SPEC.md for concrete collaboration models/APIs.

## Milestone v1 (MVP): core Git loop for non-CLI users

Outcome: open a repo, see changes, Save (commit), Sync (pull), Share (push) safely.

Scope:
- Repo open/select (local folder)
- Current Activity (git status → changed files list)
- Save Changes (add + commit)
- Sync / Get Updates (pull)
- Share / Upload (push)
- Identify Yourself (git config name/email)
- Operation output surfaced in UI (Terminal panel as log viewer)

Key decisions:
- Opinionated staging: always `git add .`.
- Commit message required.
- Clear error messages (missing upstream, auth required, merge conflicts, etc.).

Deliverables checklist:
- Go: `GitService`, `SettingsService`, command runner + event streaming
- React: wire existing buttons to services; replace mock data

## Milestone v2: review + recovery

Outcome: users can review what changed and recover from common mistakes.

Scope:
- History view backed by `git log`
- MainArea shows:
  - commit details
  - file diffs for text-like files
- Branch UX:
  - Start New Task (checkout -b)
  - Switch Task (checkout)
- Safety actions:
  - Discard My Changes
  - Undo Last Save
- Initial conflict awareness:
  - detect conflicts and show a guided message + next steps

Non-scope:
- Full merge conflict helper UI (defer unless required).

## Milestone v3: industrial file diffing (proprietary binary parsing)

Outcome: proprietary/binary-ish industrial files become reviewable.

Scope:
- File-type identification
- Parser pipeline (start with your existing JavaScript model/tool bundled into the desktop app)
- Structured diff view for supported formats
- Fallback behavior when unsupported:
  - show that a file changed + file metadata

Initial target formats:
- Rockwell / Allen-Bradley proprietary files (per product focus)

Acceptance criteria:
- For at least one real target format, show a human-readable change summary between two commits.

## Milestone v4: accounts + collaboration options

Outcome: app identity + team workflows.

Scope (proposed):
- Rewind Logic account login using existing AgniaVault auth API (PKCE), required only for cloud/collaboration
- Project catalog (optional): list accessible projects from backend and associate to local repos
- Team-shared configuration:
  - centralized YAML config synced via backend
- Activity/audit log:
  - record key operations (Sync/Save/Share/etc.) + outcomes
- Sharing review artifacts:
  - publish a “change report” (including parsed Rockwell/Allen-Bradley summaries) to the backend
- Git provider connectivity status:
  - GitHub via `gh`
  - GitLab via `glab`

Notes:
- Rewind Logic auth is separate from GitHub/GitLab authentication.
- Local Git usage should work without Rewind Logic login.

Additional collaboration ideas (optional, low-UX overhead):
- Notifications: backend emits events for “new report uploaded”, “push failed”, “updates available”.
- Config versioning: every team YAML change is versioned, with rollback.
- Environment profiles: per-site/per-line configs (e.g., Plant A vs Plant B) with explicit selection.
- Read-only viewers: allow a user to view published change reports without linking a local repo.

## Open questions (need decisions)

1) Target proprietary formats:
- Which file extensions / vendor tools are the must-have for v3?

2) Diff UX:
- For binary parsing diffs, do you want “structured summary” (recommended) or a raw hex diff fallback?

3) Auth + collaboration:
- Is Rewind Logic auth required to use the app, or only for optional collaboration features?

4) Repo model:
- Single repo at a time (simpler) or a project list of multiple repos?
