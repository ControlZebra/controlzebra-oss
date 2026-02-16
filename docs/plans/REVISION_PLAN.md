# ControlZebra — Revision Plan (v1 / v2 / v3)

This document proposes an incremental delivery plan for ControlZebra: ControlZebra (PLC/HMI/actuator configuration workflows) who are not comfortable with Git/CLI.

Guiding principles:
- Opinionated, minimal surface area: map user language to Git actions.
- Safety first: clear “panic buttons” (discard changes, undo last save) and guardrails.
- CLI-first integration: run `git`, `gh`, `glab` via Go `os/exec` (no go-git).
- Progressive disclosure: default flows are simple; advanced escape hatches live in the Terminal panel.

## Current implementation snapshot (Dec 2025)

Backend (Go/Wails):
- `GitService` fully implemented with v1 + v2 core methods
- `CommandRunner` helper for CLI execution
- `SettingsService` for app settings persistence
- `FileSystemService` and `FileDialogService` for file operations
- `TerminalService` for terminal integration
- `LFSService` planned for v2 LFS support

Frontend (React/MUI + Tailwind):
- VS Code-like layout (TopBar, ActivityBar, Sidebar views, MainArea, BottomPanel, StatusBar)
- Real git operations via Wails bindings
- v1 complete: repo open, status, commit, sync, push
- v2 core complete: history viewing, diff viewing, branch switching, undo/discard
- v2 additions in progress: branch protection, LFS support, conflict resolution

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

## v2 — Review & recovery: history + diffs + safer workflows

Goal: make the app useful for reviewing work, recovering from common mistakes, and preventing dangerous operations on protected branches. Support LFS workflows and guide users through merge conflicts.

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

### UX deliverables (v2 additions) 🔲
- Nudge to branch:
  - Show nudge banner when user has uncommitted changes on `master` branch. 🔲
  - Prompt: "You have unsaved work on master. Start a new branch?" 🔲
  - Quick action button to create branch and move changes. 🔲
- Safe branching with stash:
  - "Move Changes to New Branch" action in TopBar/BranchModal. 🔲
  - Stash → create branch → pop workflow for safe branch switching. 🔲
  - Handle stash conflicts gracefully with clear messaging. 🔲
- Git LFS integration:
  - "Enable LFS" action in Settings for repos not using LFS. 🔲
  - LFS track list editor in Settings (add/remove file patterns). 🔲
  - Preset patterns for industrial files (*.acd, *.L5X, *.mer, etc.). 🔲
  - LFS status indicator in StatusBar when repo uses LFS. 🔲
  - LFS file badges in ChangesView file list. 🔲
  - Lock indicator showing who owns locks on files. 🔲
  - Warning before switching branches with locked LFS files. 🔲
- Conflict resolution UI:
  - ConflictView component showing conflicted files after failed pull. 🔲
  - Per-file resolution options: Keep Mine / Keep Theirs / Edit Manually. 🔲
  - "Abort Sync" button to run `git merge --abort`. 🔲
  - Merge completion flow: resolve all → stage → commit. 🔲
  - Plain-language guidance explaining the conflict situation. 🔲

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

### Backend deliverables (v2 additions) ✅
- `GitService` - Stash operations:
  - `StashPush(repoPath, message)` → create a new stash ✅
  - `StashPop(repoPath)` → apply and remove most recent stash ✅
  - `StashAndSwitchBranch(repoPath, targetBranch, createNew)` → safe branch switch workflow ✅
    - Runs: `git stash push` → `git checkout [-b] <branch>` → `git stash pop`
  - `StashList(repoPath)` → list stashes for recovery if pop fails ✅
  - `StashDrop(repoPath, index, confirm)` → clean up stashes ✅

- `LFSService` (new service in `services/lfs_service.go`):
  - `IsLFSInstalled()` → check if git-lfs CLI is available ✅
  - `GetLFSVersion()` → get installed git-lfs version ✅
  - `IsLFSEnabled(repoPath)` → detect if repo uses Git LFS ✅
  - `InitializeLFS(repoPath)` → run `git lfs install` for new LFS setup ✅
  - `GetTrackedPatterns(repoPath)` → parse `.gitattributes` for LFS patterns ✅
  - `TrackPattern(repoPath, pattern)` → `git lfs track "<pattern>"` ✅
  - `UntrackPattern(repoPath, pattern)` → `git lfs untrack "<pattern>"` ✅
  - `GetPresetPatterns()` → return common industrial file patterns ✅
  - `LFSStatus(repoPath)` → get LFS-tracked files and their status ✅
  - `LFSLocks(repoPath)` → list current locks with owners ✅
  - `LFSLock(repoPath, path)` → lock a file ✅
  - `LFSUnlock(repoPath, path, force)` → unlock a file (force for own locks) ✅
  - `CheckLocksBeforeBranchSwitch(repoPath)` → warn about locked files ✅

- `GitService` - Conflict resolution:
  - `GetMergeState(repoPath)` → detect if repo is in merge/conflict state ✅
  - `GetConflictedFiles(repoPath)` → list files with merge conflicts ✅
  - `ResolveConflictKeepOurs(repoPath, path)` → `git checkout --ours <path>` ✅
  - `ResolveConflictKeepTheirs(repoPath, path)` → `git checkout --theirs <path>` ✅
  - `MarkResolved(repoPath, path)` → `git add <path>` after manual edit ✅
  - `AbortMerge(repoPath)` → `git merge --abort` ✅
  - `CompleteMerge(repoPath, message)` → `git commit` after all resolved ✅

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

### Frontend deliverables (v2 additions) 🔲
- **MasterBranchNudge** (`components/common/MasterBranchNudge.jsx`):
  - Banner shown when user has uncommitted changes on `master` branch 🔲
  - "Start New Branch" quick action button 🔲
  - Dismissible for current session 🔲
- **BranchModal** enhancements:
  - "Move Changes" option when creating new branch with uncommitted changes 🔲
  - LFS lock warnings before branch switch 🔲
- **LFSIndicator** (`components/common/LFSIndicator.jsx`):
  - StatusBar indicator when LFS is enabled 🔲
  - File list badges for LFS-tracked files 🔲
  - Lock icon with owner tooltip 🔲
- **LFSSettingsPanel** (`components/settings/LFSSettingsPanel.jsx`):
  - "Enable LFS" button for repos without LFS 🔲
  - Editable list of tracked file patterns 🔲
  - Add/remove pattern with validation 🔲
  - Preset patterns dropdown (industrial file types) 🔲
  - Explanation text about LFS and when to use it 🔲
- **ConflictView** (`components/layout/views/ConflictView.jsx`):
  - Shown when repo is in conflict state 🔲
  - List of conflicted files with status 🔲
  - Per-file action buttons: Keep Mine / Keep Theirs / Edit 🔲
  - "Complete Merge" and "Abort Sync" buttons 🔲
  - Explanatory text for non-technical users 🔲
- **ConflictDiffViewer** (`components/common/ConflictDiffViewer.jsx`):
  - Three-way diff view showing base, ours, theirs 🔲
  - Highlight conflict markers in file content 🔲
- **RepoContext** additions:
  - New state: `showMasterNudge`, `lfsEnabled`, `lfsLocks`, `conflictState`, `conflictedFiles` 🔲
  - New actions: `moveChangesToNewBranch`, `dismissMasterNudge`, `resolveConflict`, `abortMerge`, `completeMerge` 🔲

### Non-goals (deferred to v3+)
- Proprietary binary parsing.
- Advanced LFS operations (migrate, prune).
- Three-way merge editor for manual conflict resolution.

**v2 Implementation Status: 🔄 IN PROGRESS**
- Core features (history, diff, undo/discard, branching): ✅ COMPLETE
- Backend: Branch protection, stash, LFS, conflict resolution: ✅ COMPLETE
- Frontend: Protected branch UI, LFS UI, conflict resolution UI: 🔲 PENDING

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

### ControlZebra auth (AgniaVault backend API)
- Use the existing PKCE endpoints:
  - `POST /api/auth/pkce/initiate`
  - `POST /api/auth/pkce/authenticate`
  - `GET /api/auth/me`
  - `POST /api/auth/refresh`
- Desktop storage:
  - Store token in OS keychain/credential vault if available; otherwise a local encrypted store.

Policy:
- ControlZebra auth is optional for local Git usage.
- Only require login for collaborative/cloud features (project catalog, shared config, team workflows).

### GitHub/GitLab account connectivity via CLI
- `gh auth login` and `glab auth login` flows invoked from Go.
- Detect auth status:
  - `gh auth status`
  - `glab auth status`
- Keep these separate from "ControlZebra auth" (app account vs git provider account).

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
---

## High Priority Items — Implementation Checklist (Updated: January 2026)

This section tracks the current implementation status and prioritizes remaining work.

### ✅ COMPLETED

#### v1 Core (MVP)
- [x] Repository selection/open with git detection
- [x] Current branch and sync status display
- [x] Changed files view from `git status`
- [x] Save Changes (`git add .` + `git commit`)
- [x] Sync (`git pull`)
- [x] Share (`git push`)
- [x] Git config for user.name/email
- [x] CommandRunner with timeout support
- [x] SettingsService for app persistence

#### v2 Core Features
- [x] History view with real commit list
- [x] Commit details in MainArea
- [x] Diff viewing (side-by-side with syntax highlighting)
- [x] Branch switching/creation UI (BranchModal)
- [x] Undo Last Save (ResetSoftHead with confirmation)
- [x] Discard All Changes (with confirmation)
- [x] Discard single file changes
- [x] DiffViewer component with hunk headers

#### v2 Backend Services (Go)
- [x] GitService: GetRecentCommits, ShowCommit, DiffWorking, DiffCommitFile
- [x] GitService: Branches, CheckoutBranch, CreateBranchAndCheckout
- [x] GitService: ResetSoftHead, ResetHardHead, DiscardAll, DiscardFile
- [x] GitService: StashPush, StashPop, StashList, StashDrop
- [x] GitService: IsProtectedBranch, GetProtectedBranches, SetProtectedBranches
- [x] GitService: StashAndSwitchBranch (safe branch switching workflow)
- [x] GitService: GetMergeState, GetConflictedFiles, AbortMerge, CompleteMerge
- [x] GitService: ResolveConflictKeepOurs, ResolveConflictKeepTheirs, MarkResolved
- [x] LFSService: IsLFSInstalled, GetLFSVersion, IsLFSEnabled
- [x] LFSService: InitializeLFS, GetTrackedPatterns, TrackPattern, UntrackPattern
- [x] LFSService: GetPresetPatterns (industrial file patterns)
- [x] LFSService: LFSStatus, LFSLocks, LFSLock, LFSUnlock
- [x] LFSService: CheckLocksBeforeBranchSwitch

#### v2 Partial Frontend
- [x] LFS-enabled repo initialization (GitInitForm with LFS options)
- [x] LFS Groups Settings panel (custom extension groups management)
- [x] Progress modal for operations

---

### 🔴 HIGH PRIORITY — Pending Implementation

These items block a complete v2 release and should be prioritized.

#### P0: v2 Frontend — Master Branch Nudge ✅ COMPLETE
**Effort: Low | Impact: High**

1. [x] **MasterBranchNudge Component** (`components/common/MasterBranchNudge.jsx`)
   - Banner shown when user has uncommitted changes on `master` branch
   - On the Commitscreen.jsx replace the create snapshot button with "Branch and Save" action button to create a branch and move changes with commit
   - The action button side dropdown to give option to Save on master branch.

2. [x] **RepoContext: Master Nudge State**
   - Add `showMasterNudge` state (true when on master with uncommitted changes)
   - Check on status refresh: if branch is `master` and changes exist, show nudge

3. [x] **Branch and Save Enhancement: **
   - Show when user has uncommitted changes 
   - creates a new branch
   - Use `StashAndSwitchBranch()` for safe migration
   - Handle stash pop failures with clear messaging

#### P0: v2 Frontend — Conflict Resolution UI
**Effort: High | Impact: High**

4. [ ] **MergeChangesPage Component** (`components/layout/views/ConflictView.jsx`)
   - Left sidebar is reserved to show list of conflict files
   - Create a 3 step process for the merge
      - Check for conflicts with autodetect/user selected branch
         - (Completed) When conflicts are deteched show them in the sidebar. 
         - The conflict file list item should show file name & a tag/label for the conflict resolution strategy (Mine/Theirs/Unknown)
         - Add a red '!' icon for each file listitem
      - Conflict resolution
         - When no file in the listitem is selected, show the default conflict resolution screen. merge changes button (greyed out disabled) along with message "You have X file conflicts. Click on each file to resolve the conflicts"
         - When clicked on the file name in the sidebar, the main area should show two cards side by side: one for each commit - showing the author name as H1, timestamp & short hash below the name, then a paragraph for commit message (shortened with 'see more'). Also show "Keep Mine" / "Keep Theirs" above those cards. Add a explanation for each choice, when selected
         - Allow user to select multiple cards with shift+click. if both cards are selected, show exaplanation that explains "Keep both (local copy becomes fileName_COPY)"
         - Add a confirm button below the conflict resolution UI, When conflict strategy for a file is selected, user is allowed to click the confirm button.
         - When confirm button is clicked the red "!" icon will become a green tick icon for the listitem along with a tag/label for Mine/Theirs. Also show the default conflict resolution screen mentioned in the first item in this section. 
         - when all file conflict strategies are received from the user, enable the merge changes button with commit textarea for merge commit on the default conflict resolution screen. 

   - Always show "Abort Merge" button on the screen
   - Plain-language guidance explaining what happened

5. [ ] **RepoContext: Conflict State**
   - Add `mergeState`, `conflictedFiles` state
   - Call `GetMergeState()` after sync/pull operations
   - Add actions: `resolveConflict(file, strategy)`, `abortMerge()`, `completeMerge(message)`



#### P1: v2 Frontend — LFS Status Indicators
**Effort: Medium | Impact: Medium**

7. [ ] **LFSIndicator in StatusBar**
   - Show "LFS" badge when repo has LFS enabled
   - Click to show LFS status popup

8. [ ] **LFS File Badges in ChangesView**
   - Icon/badge for LFS-tracked files in the file list
   - Lock icon with owner tooltip for locked files

9. [ ] **LFS Lock Warnings in BranchModal**
   - Check `CheckLocksBeforeBranchSwitch()` before switching
   - Warn if switching affects locked files
   - Offer to auto-unlock owned locks

#### P1: v2 Frontend — LFS Settings Panel
**Effort: Medium | Impact: Medium**

10. [ ] **LFSSettingsPanel** (`components/settings/LFSSettingsPanel.jsx`)
    - "Enable LFS" button for repos without LFS
    - View/edit tracked patterns list
    - Add/remove patterns with `.gitattributes` sync
    - Preset patterns dropdown for industrial files

---

### 🟡 MEDIUM PRIORITY — v3 Prerequisites

These prepare the codebase for v3 features.

11. [ ] **GitHub/GitLab CLI Auth Integration**
    - ProfileView: "Connect GitHub Account" using `gh auth login`
    - ProfileView: "Connect GitLab Account" using `glab auth login`
    - Auth status detection and display

12. [ ] **Binary File Detection**
    - Detect non-text files in file list
    - Show "Binary file changed" placeholder in DiffViewer
    - Prepare for v3 industrial file parsing

13. [ ] **Comprehensive Error Messages**
    - Review all error paths for user-friendly messaging
    - Add contextual help for common errors (upstream not set, auth required, etc.)

---

### 🟢 LOW PRIORITY — Nice to Have

14. [ ] **Stash UI** (beyond auto-stash)
    - View stash list
    - Manually stash/pop/drop stashes
    - Stash with custom message

16. [ ] **Keyboard Shortcuts**
    - Save: Cmd/Ctrl+S
    - Sync: Cmd/Ctrl+Shift+S
    - New branch: Cmd/Ctrl+B

---

### Implementation Order Recommendation

**Sprint 1: Conflict Resolution (Critical Path)**
- Items 4, 5 — ConflictView + RepoContext conflict state
- This unblocks users from completing sync operations that result in conflicts

**Sprint 2: Master Branch Nudge**
- Items 1, 2, 3 — Nudge banner + move changes workflow
- Encourages users to work on feature branches instead of master

**Sprint 3: LFS Polish**
- Items 7, 8, 9, 10 — StatusBar indicator, file badges, settings panel
- Completes the LFS user experience

**Sprint 4: Git Provider Integration**
- Item 11 — GitHub/GitLab auth
- Enables push to GitHub/GitLab without manual CLI auth
