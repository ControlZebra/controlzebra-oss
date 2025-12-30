# Rewind Logic — Revision Plan (v1 / v2 / v3)

This document proposes an incremental delivery plan for Rewind Logic: a simplified Git client for industrial automation users (PLC/HMI/actuator configuration workflows) who are not comfortable with Git/CLI.

Guiding principles:
- Opinionated, minimal surface area: map user language to Git actions.
- Safety first: clear “panic buttons” (discard changes, undo last save) and guardrails.
- CLI-first integration: run `git`, `gh`, `glab` via Go `os/exec` (no go-git).
- Progressive disclosure: default flows are simple; advanced escape hatches live in the Terminal panel.

## Current implementation snapshot (Dec 2025)

Backend (Go/Wails):
- Only `GreetService` exists; no Git/auth/services yet.

Frontend (React/MUI + Tailwind):
- VS Code-like layout exists (TopBar, ActivityBar, Sidebar views, MainArea placeholder, BottomPanel Commit/Terminal).
- Sidebar views are mock-driven (`MOCK_CHANGED_FILES`, `MOCK_COMMITS`, `SETTINGS_CATEGORIES`).
- Commit panel has UI for message + Save/Share but no real operations.

## v1 — MVP: “Make Git usable without Git”

Goal: deliver the core daily loop for a single local repo.

### UX deliverables
- Repo selection/open:
  - Select a local folder and detect if it’s a Git repo.
  - Display current branch and “Synced/Changes” status.
- Changes:
  - Show changed files from `git status`.
- Save Changes:
  - One button that performs `git add .` + `git commit -m <message>`.
  - Clear feedback: success/failure, and why (e.g., no changes).
- Sync:
  - “Sync / Get Updates” runs `git pull`.
- Share:
  - “Share / Upload” runs `git push`.
- Identify Yourself:
  - Simple settings form to set `git config user.name` and `git config user.email` for the repo (or global—decide per UX).

### Backend deliverables (Go services)
- `GitService`
  - `DetectRepo(path)`
  - `Status(repoPath)` → changed files (added/modified/deleted) + branch + ahead/behind
  - `CommitAll(repoPath, message)`
  - `Pull(repoPath)`
  - `Push(repoPath)`
  - `GetRecentCommits(repoPath, limit)` (optional in v1; can remain mock)
  - All implemented via `os/exec` calling `git`.
- `CommandRunner` helper
  - Runs commands with explicit working directory.
  - Captures stdout/stderr and exit codes.
  - Emits progress/output events for the Terminal panel + status area.
- `SettingsService`
  - Persist app settings (theme, last repo, etc.) and user profile settings.

### Frontend deliverables
- Replace mock changed files with `GitService.Status`.
- Wire TopBar Sync button to `GitService.Pull`.
- Wire CommitPanel Save/Share to `GitService.CommitAll` and `GitService.Push`.
- Terminal panel:
  - Not a full shell; it should run a limited, explicit allowlist (or just show logs from Git/gh/glab commands). Keep “raw terminal” optional later.

### Non-goals (explicitly not in v1)
- Merge/conflict helper UI.
- Side-by-side diffs.
- Proprietary binary parsing.
- Multi-repo project management.

### Definition of done
- A user can open a repo, see changed files, Save, Sync, Share without using CLI.

## v2 — Review & recovery: history + diffs + safer workflows

Goal: make the app useful for reviewing work and recovering from common mistakes.

### UX deliverables
- History view:
  - Real commit list (`git log --pretty=...`), clickable.
- Diff viewing for text-like files:
  - Selecting a file shows `git diff` (working tree) or commit-to-commit diff.
  - Selecting a commit shows changed files for that commit.
- Undo Last Save:
  - One button for `git reset --soft HEAD~1` with a confirmation.
- Discard My Changes:
  - One button for `git checkout -- .` (or the safer modern `git restore .` if allowed) with a confirmation.
- Start New Task / Switch Task:
  - `git checkout -b <name>` and `git checkout <branch>`.

### Backend deliverables
- `GitService` additions:
  - `Log(repoPath, limit)`
  - `ShowCommit(repoPath, hash)`
  - `DiffWorking(repoPath, path)`
  - `DiffCommits(repoPath, fromHash, toHash, path?)`
  - `Branches(repoPath)`
  - `CheckoutBranch(repoPath, name)`
  - `CreateBranchAndCheckout(repoPath, name)`
  - `ResetSoftHead(repoPath, n)`
  - `DiscardAll(repoPath)`

### Frontend deliverables
- MainArea becomes the “detail pane”:
  - commit details, file diff, and operation output.
- StatusBar becomes real (branch, sync state, changes count, last operation result).

### Non-goals
- Full conflict resolution UI for arbitrary merges.
- Proprietary binary parsing (starts in v3).

## v3 — Industrial file intelligence: proprietary binary parsing + meaningful diffs

Goal: support industrial automation “binary-ish” files by parsing them into a stable, human-reviewable representation and showing changes between commits.

Primary target formats (initial): Rockwell / Allen-Bradley proprietary files.

### Core approach
- Add a “File Interpretation” pipeline:
  1) Detect file type (extension + signature + repo config)
  2) Parse into an intermediate representation (IR)
  3) Compare IR between two revisions
  4) Render a user-facing diff (ideally structured, not line-based)

This avoids unreliable raw binary diffs.

### Backend deliverables
- `BinaryDiffService` (or `FileAnalysisService`)
  - `Identify(path, bytes)` → file kind + parser used
  - `ParseToIR(repoPath, revision, path)` → JSON-like IR
  - `DiffIR(irA, irB)` → structured change set

Parser strategy (start simple; can evolve):
- Use the existing JavaScript parser/model you already have by bundling it into the desktop app.
- Recommended integration path:
  - Go returns file bytes for a given Git revision (base64) + metadata.
  - Frontend JS runs the Rockwell/Allen-Bradley parser to produce a stable IR.
  - Frontend computes a structured diff (IR-to-IR) and renders it.
- Later options (if needed):
  - Move parsing into Go using an embedded JS runtime, or
  - Run the parser as an external tool via `os/exec`.

### UX deliverables
- When a proprietary binary is selected:
  - Show a “Parsed Changes” view (structured)
  - If parser unavailable: show a clear message and fall back to “file changed” metadata.

### Risks / constraints
- Proprietary formats are volatile; parser maintenance cost is real.
- Some vendors may require licensed tooling—plan for external tooling integration.
- Need careful sandboxing if running third-party parsers.

## Cross-cutting: Auth + accounts + collaboration options

### Rewind Logic auth (AgniaVault backend API)
- Use the existing PKCE endpoints:
  - `POST /api/auth/pkce/initiate`
  - `POST /api/auth/pkce/authenticate`
  - `GET /api/auth/me`
  - `POST /api/auth/refresh`
- Desktop storage:
  - Store token in OS keychain/credential vault if available; otherwise a local encrypted store.

Policy:
- Rewind Logic auth is optional for local Git usage.
- Only require login for collaborative/cloud features (project catalog, shared config, team workflows).

### GitHub/GitLab account connectivity via CLI
- `gh auth login` and `glab auth login` flows invoked from Go.
- Detect auth status:
  - `gh auth status`
  - `glab auth status`
- Keep these separate from “Rewind Logic auth” (app account vs git provider account).

### Collaboration options (planned)
Depending on desired meaning:
- Team configuration sync (shared YAML command/config; same rules across a team)
- Cloud project catalog (list projects from backend; open associated local repo)
- Audit/logging of operations (who ran what, when, and result)
- Sharing review artifacts (publish a change report/diff summary so others can review without local repo)

Optional additions (if/when valuable):
- Config versioning + rollback
- Notifications on important events (new report, push failure, updates available)

## Engineering sequencing notes
- Keep git operations and provider auth independent.
- Prefer small, testable Go service methods over “one mega command”.
- Emit events for operation output so the UI can show progress without freezing.
