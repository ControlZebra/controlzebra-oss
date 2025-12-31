# Rewind Logic — Revision Plan (v1 / v2 / v3)

This document proposes an incremental delivery plan for Rewind Logic: a simplified Git client for industrial automation users (PLC/HMI/actuator configuration workflows) who are not comfortable with Git/CLI.

Guiding principles:
- Opinionated, minimal surface area: map user language to Git actions.
- Safety first: clear “panic buttons” (discard changes, undo last save) and guardrails.
- CLI-first integration: run `git`, `gh`, `glab` via Go `os/exec` (no go-git).
- Progressive disclosure: default flows are simple; advanced escape hatches live in the Terminal panel.

## Current implementation snapshot (Dec 2025)

Backend (Go/Wails):
- `GitService` fully implemented with v1 + v2 methods
- `CommandRunner` helper for CLI execution
- `SettingsService` for app settings persistence
- `FileSystemService` and `FileDialogService` for file operations
- `TerminalService` for terminal integration

Frontend (React/MUI + Tailwind):
- VS Code-like layout (TopBar, ActivityBar, Sidebar views, MainArea, BottomPanel, StatusBar)
- Real git operations via Wails bindings
- v1 complete: repo open, status, commit, sync, push
- v2 complete: history viewing, diff viewing, branch switching, undo/discard

## v1 — MVP: "Make Git usable without Git" ✅ COMPLETE

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

**v1 Implementation Status: ✅ COMPLETE**

## v2 — Review & recovery: history + diffs + safer workflows ✅ COMPLETE

Goal: make the app useful for reviewing work and recovering from common mistakes.

### UX deliverables ✅
- History view:
  - Real commit list (`git log --pretty=...`), clickable. ✅
  - Clicking a commit shows commit details in MainArea. ✅
- Diff viewing for text-like files:
  - Selecting a file shows `git diff` (working tree) in MainArea. ✅
  - Side-by-side diff viewer with syntax highlighting. ✅
  - Selecting a commit shows changed files for that commit. ✅
  - Clicking a file in commit shows the diff for that file. ✅
- Undo Last Save:
  - Button in TopBar for `git reset --soft HEAD~1` with AlertDialog confirmation. ✅
- Discard My Changes:
  - Button in TopBar for `git restore .` with AlertDialog confirmation. ✅
- Start New Task / Switch Task:
  - BranchModal triggered from TopBar for branch switching/creation. ✅
  - `git checkout -b <name>` and `git checkout <branch>`. ✅

### Backend deliverables ✅
- `GitService` additions (all implemented in `services/git_service.go`):
  - `GetRecentCommits(repoPath, limit)` ✅
  - `ShowCommit(repoPath, hash)` ✅
  - `DiffWorking(repoPath, path)` ✅
  - `DiffCommits(repoPath, fromHash, toHash, path?)` ✅
  - `DiffCommitFile(repoPath, hash, path)` ✅
  - `Branches(repoPath)` ✅
  - `CheckoutBranch(repoPath, name)` ✅
  - `CreateBranchAndCheckout(repoPath, name)` ✅
  - `ResetSoftHead(repoPath, n, confirm)` ✅
  - `DiscardAll(repoPath, confirm)` ✅
  - `DiscardFile(repoPath, path, confirm)` ✅

### Frontend deliverables ✅
- **MainArea** (`components/layout/MainArea.jsx`):
  - Shows commit details when a commit is selected in HistoryView
  - Shows file diff when a file is selected (working tree or commit)
  - CommitHeader component with author, date, stats
  - CommitFileList component for browsing changed files in a commit
- **DiffViewer** (`components/common/DiffViewer.jsx`):
  - Side-by-side diff rendering
  - Syntax highlighting for add/delete/context lines
  - Hunk headers and file path display
  - Binary file handling
- **HistoryView** (`components/layout/views/HistoryView.jsx`):
  - Clickable commits that load details via `selectCommit()`
  - Selected state visual feedback
- **ChangesView** (`components/layout/views/ChangesView.jsx`):
  - File selection triggers `loadWorkingDiff()`
  - Integration with MainArea for viewing
- **TopBar** (`components/layout/TopBar.jsx`):
  - Undo Last Save button with AlertDialog confirmation
  - Discard All Changes button with AlertDialog confirmation
  - Branch button opens BranchModal
- **BranchModal** (`components/layout/BranchModal.jsx`):
  - Switch between existing branches
  - Create new branches
  - Search/filter branch list
- **AlertDialog** (`components/ui/alert-dialog.jsx`):
  - shadcn-style confirmation dialog
  - Used for destructive actions (undo, discard)
- **RepoContext** (`context/RepoContext.jsx`):
  - New state: `selectedCommit`, `selectedCommitFile`, `currentDiff`, `branches`
  - New actions: `loadWorkingDiff`, `selectCommit`, `loadCommitFileDiff`
  - New actions: `switchBranch`, `createBranch`, `refreshBranches`
  - New actions: `undoLastCommit`, `discardAllChanges`, `discardFileChanges`

### Non-goals
- Full conflict resolution UI for arbitrary merges.
- Proprietary binary parsing (starts in v3).

**v2 Implementation Status: ✅ COMPLETE (Dec 31, 2025)**

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
