# Rewind Logic — Collaboration Spec (v4+)

This document expands the collaboration scope that requires Rewind Logic login (AgniaVault auth via PKCE). Local Git usage remains available without login.

## Summary of in-scope collaboration features

1) Team-shared configuration (central YAML)
2) Cloud project catalog (with permissions) + local repo linking
3) Activity/audit log (who did what, when, result)
4) Sharing review artifacts (“change reports”, including parsed Rockwell/Allen-Bradley summaries)
5) Notifications (in-app)
6) Config versioning + rollback
7) Environment profiles (Plant A / Line 2, etc.)
8) Read-only viewers for published change reports

## Concepts and recommended data models

These are intentionally minimal and can be implemented in PocketBase collections with a thin Go API layer.

### 1) Team configuration (YAML)

**Purpose**: One source of truth for commands, file-type rules, parser mapping, and review policies.

**Entity: TeamConfig**
- `id`
- `OrganizationID`
- `name` (e.g., `default`, `plant-a`, `line-3`)
- `yaml` (string)
- `version` (int)
- `createdByUserID`
- `created`
- `updated`

**Entity: TeamConfigVersion** (for versioning + rollback)
- `id`
- `TeamConfigID`
- `version` (int)
- `yaml` (string)
- `changeSummary` (string)
- `createdByUserID`
- `created`

Rules:
- Creating/updating a `TeamConfig` always appends a `TeamConfigVersion`.
- Rollback is a server-side operation that sets `TeamConfig.yaml` back to a chosen version and increments `version`.

### 2) Cloud project catalog + local linking

**Purpose**: A user can pick a cloud project they have access to and link it to a local folder/repo.

**Entity: CloudProject** (likely already exists in AgniaVault)
- `id`
- `OrganizationID`
- `ProjectOwnerID`
- `ProjectName`
- `Client`
- `Description`
- `Status`

**Entity: ProjectRepoLink** (desktop-local + optional cloud sync)
- Local-only fields:
  - `localRepoPath`
  - `lastOpenedAt`
- Cloud-synced fields (optional; only if you want roaming setups):
  - `CloudProjectID`
  - `repoRemoteUrl` (origin)
  - `defaultBranch`

Recommended: keep the *filesystem path* local-only by default.

### 3) Activity/audit log

**Purpose**: Traceability. Record key operations and outcomes.

**Entity: AuditEvent**
- `id`
- `OrganizationID`
- `actorUserID`
- `projectId` (nullable)
- `repoRemoteUrl` (nullable)
- `operation` (enum-like string):
  - `sync_pull`, `share_push`, `save_commit`, `discard_changes`, `undo_last_save`, `create_branch`, `switch_branch`, `generate_report`, `publish_report`, `config_update`, `config_rollback`
- `status` (string): `success` | `failure`
- `startedAt`, `finishedAt`
- `summary` (short human message)
- `errorCode` (optional)
- `errorDetails` (optional; consider redaction)
- `metadata` (JSON; optional)

Privacy/security notes:
- Avoid storing secrets, tokens, or full command lines containing credentials.
- Consider truncating stderr to a safe size.

### 4) Sharing review artifacts (“change reports”)

**Purpose**: Upload a reviewable summary of changes between revisions, including structured diffs from the Rockwell/Allen-Bradley parser.

**Entity: ChangeReport**
- `id`
- `OrganizationID`
- `createdByUserID`
- `projectId` (nullable)
- `repoRemoteUrl` (nullable)
- `baseRef` (commit hash or tag)
- `targetRef` (commit hash or tag)
- `generatedAt`
- `title`
- `summary` (markdown or plain text)
- `filesChangedCount`
- `artifacts` (JSON):
  - list of file entries with:
    - `path`
    - `kind`: `text` | `binary` | `rockwell_ab`
    - `diffSummary` (structured or markdown)
    - `parserVersion` (if applicable)
- `visibility`:
  - `org` (default)
  - later: `project` / `link` (optional)

**Read-only viewer**
- Minimal approach: authenticated read-only users within the org can view.
- Optional later: signed link token to view a single report (careful with external sharing).

### 5) Notifications

**Purpose**: Low-friction collaboration signal.

**Entity: Notification**
- `id`
- `OrganizationID`
- `userID` (recipient)
- `type`: `report_published` | `push_failed` | `updates_available` | `config_changed`
- `title`
- `body`
- `link` (optional; e.g., `changeReportId`)
- `readAt` (nullable)
- `created`

Delivery:
- Start with polling endpoint.
- Later: server-sent events / websockets if needed.

### 6) Environment profiles

**Purpose**: Reduce mistakes (wrong rules for wrong plant/line).

**Entity: EnvironmentProfile**
- `id`
- `OrganizationID`
- `name` (e.g., `Plant A - Line 2`)
- `teamConfigId` (the config to apply)
- `description` (optional)
- `created`
- `updated`

Desktop behavior:
- User selects an environment profile per linked repo (local setting).
- UI always shows the active profile name.

## API checklist (suggested)

These are suggestions for endpoints that match the existing AgniaVault style. Exact routing can be adjusted.

Auth:
- Use existing PKCE flow; all collaboration endpoints require `Authorization: Bearer <token>`.

Config:
- `GET /api/team-configs`
- `GET /api/team-configs/{id}`
- `POST /api/team-configs` (create)
- `PUT /api/team-configs/{id}` (update; creates version)
- `GET /api/team-configs/{id}/versions`
- `POST /api/team-configs/{id}/rollback` (body: version)

Projects + linking:
- `GET /api/projects` (already exists)
- `GET /api/projects/{id}` (already exists)
- (Optional) `POST /api/project-links` / `GET /api/project-links` if you want cloud-synced linking

Audit:
- `POST /api/audit-events` (client writes)
- `GET /api/audit-events` (admin/owner views)

Reports:
- `POST /api/change-reports` (upload report metadata + artifacts)
- `GET /api/change-reports`
- `GET /api/change-reports/{id}`

Notifications:
- `GET /api/notifications`
- `POST /api/notifications/{id}/read`

Environment profiles:
- `GET /api/environment-profiles`
- `POST /api/environment-profiles`
- `PUT /api/environment-profiles/{id}`

## Implementation notes (desktop)

- Keep collaboration optional: app should run fully offline for local Git.
- When logged in:
  - Fetch team configs + profiles and cache locally.
  - Attach `EnvironmentProfile` to a local repo link.
  - Auto-upload audit events for operations.
  - Allow generating and publishing change reports.

## Open decisions (for implementation)

1) Who can edit team configs? (Org admin only vs project maintainers)
2) Config validation: do we validate YAML schema server-side or only client-side?
3) Report artifact size limits and retention policy
4) Whether to support signed public links for reports
