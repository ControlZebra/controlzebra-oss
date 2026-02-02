# Git Workflows Documentation

This document details the complete git workflows implemented in ControlZebra for the Explorer and Merge Changes pages, including all git commands executed, decision points, and state transitions.

**Date:** January 14, 2026  
**Version:** v2 (Post-MVP implementation)

---

## Table of Contents
- [Overview](#overview)
- [Explorer View Workflows](#explorer-view-workflows)
  - [1. Save Changes (Commit)](#1-save-changes-commit)
  - [2. Branch and Save](#2-branch-and-save)
  - [3. Sync Repository](#3-sync-repository)
  - [4. Rewind to Last Snapshot](#4-rewind-to-last-snapshot)
  - [5. Discard All Changes](#5-discard-all-changes)
- [Merge Changes Workflows](#merge-changes-workflows)
  - [1. Check for Conflicts](#1-check-for-conflicts)
  - [2. Start Merge (with/without conflicts)](#2-start-merge-withwithout-conflicts)
  - [3. Resolve Conflicts](#3-resolve-conflicts)
  - [4. Complete Merge](#4-complete-merge)
  - [5. Abort Merge](#5-abort-merge)
- [Stuck State Recovery Operations](#stuck-state-recovery-operations)
- [State Management](#state-management)
- [Error Handling](#error-handling)
- [Recommendations](#recommendations)

---

## Overview

ControlZebra uses a **CLI-first approach** - all git operations are executed via `os/exec` calling the `git` command-line tool. The backend service (`GitService`) provides high-level operations that orchestrate multiple git commands, while the frontend (`RepoContext`) manages state and user feedback.

### Key Components
- **Backend:** `services/git_service.go` - Wraps git CLI operations
- **Frontend State:** `frontend/src/context/RepoContext.jsx` - Manages UI state and orchestrates operations
- **UI Views:**
  - `frontend/src/components/layout/views/ExplorerView.jsx` - Main commit/sync interface
  - `frontend/src/components/layout/views/MergeChangesView.jsx` - Conflict file list sidebar
  - `frontend/src/components/layout/pages/MergeChangesPage.jsx` - Merge workflow main area

---

## Explorer View Workflows

### 1. Save Changes (Commit)

**Trigger:** User clicks "Save Changes" in CommitPanel with a commit message  
**Frontend Function:** `RepoContext.commitChanges(message)`  
**Backend Function:** `GitService.CommitAll(repoPath, message)`

#### Decision Tree
```
START
  ↓
Is message empty? ──YES→ Error: "Commit message is required"
  ↓ NO
Are there changes? ──NO→ Error: "No changes to commit"
  ↓ YES
Stage all changes
  ↓
Commit staged changes
  ↓
Refresh status
  ↓
END (Success)
```

#### Git Commands Executed
```bash
# Backend checks for changes
git status --porcelain

# Stage all changes
git add .

# Commit with message
git commit -m "<message>"
```

#### State Transitions
1. **Frontend:** `isCommitting = true`
2. **Backend:** Execute `git add .`
3. **Backend:** Execute `git commit -m "..."`
4. **Frontend:** Show success toast
5. **Frontend:** Call `refreshAll()` to update UI
6. **Frontend:** `isCommitting = false`

---

### 2. Branch and Save

**Trigger:** User selects "Branch and Save" from commit panel dropdown  
**Frontend Function:** `RepoContext.branchAndCommit(branchName, message)`  
**Backend Functions:** 
- `GitService.StashAndSwitchBranch(repoPath, branchName, createNew=true)`
- `GitService.CommitAll(repoPath, message)`

#### Decision Tree
```
START
  ↓
Is branchName empty? ──YES→ Error: "Branch name is required"
  ↓ NO
Is message empty? ──YES→ Error: "Commit message is required"
  ↓ NO
Stash changes
  ↓
Create and checkout new branch
  ↓
Pop stash (applies changes)
  ↓
Did stash pop succeed? ──NO→ Error: "Stash pop failed, check for conflicts"
  ↓ YES
Stage all changes
  ↓
Commit changes
  ↓
Refresh status and branches
  ↓
END (Success: Created branch + saved)
```

#### Git Commands Executed
```bash
# Backend: StashAndSwitchBranch
git stash push -m "Auto-stash for branch switch"
git checkout -b <branchName>
git stash pop

# Backend: CommitAll
git add .
git commit -m "<message>"
```

#### State Transitions
1. **Frontend:** User provides branch name + commit message
2. **Backend:** Stash uncommitted changes
3. **Backend:** Create new branch (`git checkout -b`)
4. **Backend:** Pop stash to apply changes to new branch
5. **Backend:** If pop has conflicts, return error with details
6. **Frontend:** If stash successful, continue to commit
7. **Backend:** Stage and commit changes
8. **Frontend:** Show success toast, refresh status and branches
9. **Frontend:** Clear selection and commit form

---

### 3. Sync Repository

**Trigger:** User clicks "Sync" button in TopBar or SidebarPushPanel  
**Frontend Function:** `RepoContext.syncRepo()`  
**Backend Functions:**
- `ProgressService.SyncWithProgress(repoPath, operationId)` (wrapper)
- `GitService.Sync(repoPath)` (core logic)

#### Decision Tree
```
START
  ↓
Is repo configured with remote? ──NO→ Error: "No remote branch configured"
  ↓ YES
Pull changes (--no-rebase)
  ↓
Pull has conflicts? ──YES→ Error: "Merge conflict detected"
  ↓ NO
Pull succeeded?
  ↓ YES
Push changes
  ↓
Push rejected? ──YES→ Error: "Push rejected. Remote has changes."
  ↓ NO
END (Success: Synced)
```

#### Git Commands Executed
```bash
# Backend: Sync
git pull --no-rebase    # Merge strategy, not rebase
git push
```

#### State Transitions
1. **Frontend:** `isSyncing = true`, open progress modal
2. **Backend:** Execute `git pull --no-rebase`
3. **Backend:** Check for conflicts in output
   - If conflicts: Return error, frontend shows conflict message
   - If no upstream: Return error "No remote branch configured"
4. **Backend:** Execute `git push`
   - If rejected: Return error "Push rejected"
   - If no upstream: Return error "No remote branch configured"
5. **Frontend:** Progress modal auto-closes on completion event
6. **Frontend:** Show success/error toast
7. **Frontend:** Call `refreshAll()` to update UI
8. **Frontend:** `isSyncing = false`

#### Special Cases
- **No upstream configured:** Error shown, user must configure remote
- **Pull conflicts:** Sync aborts, user directed to use Merge Changes view
- **Push rejected (remote ahead):** User must sync again to pull latest

---

### 4. Rewind to Last Snapshot

**Trigger:** User clicks "Rewind" button in CommitPanel  
**Frontend Function:** `RepoContext.rewindToLastSnapshot()`  
**Backend Function:** `GitService.ResetSoftHead(repoPath, n=1, confirm=true)`

#### Decision Tree
```
START
  ↓
User confirms action in AlertDialog? ──NO→ Cancel
  ↓ YES
Reset HEAD to previous commit (keep changes staged)
  ↓
Refresh status
  ↓
END (Success: Changes unstaged)
```

#### Git Commands Executed
```bash
# Backend: ResetSoftHead
git reset --soft HEAD~1
```

#### State Transitions
1. **Frontend:** User clicks "Rewind", AlertDialog appears
2. **User:** Confirms dangerous action
3. **Frontend:** `isRewinding = true`
4. **Backend:** Execute `git reset --soft HEAD~1`
5. **Frontend:** Show success toast "Rewound to previous snapshot"
6. **Frontend:** Call `refreshAll()` to update UI
7. **Frontend:** `isRewinding = false`

---

### 5. Discard All Changes

**Trigger:** User clicks "Discard All Changes" in TopBar  
**Frontend Function:** `RepoContext.discardAllChanges()`  
**Backend Function:** `GitService.DiscardAll(repoPath, confirm=true)`

#### Decision Tree
```
START
  ↓
User confirms action in AlertDialog? ──NO→ Cancel
  ↓ YES
Are there changes? ──NO→ Error: "No changes to discard"
  ↓ YES
Restore all files to HEAD
  ↓
Unstage all staged changes
  ↓
Refresh status
  ↓
END (Success: All changes discarded)
```

#### Git Commands Executed
```bash
# Backend: DiscardAll (Git 2.23+)
git restore .                 # Discard working tree changes
git restore --staged .        # Unstage staged changes

# Backend: DiscardAll (Git < 2.23)
git checkout -- .             # Discard working tree changes
git reset HEAD -- .           # Unstage staged changes
```

#### State Transitions
1. **Frontend:** User clicks "Discard All Changes", AlertDialog appears
2. **User:** Confirms dangerous action
3. **Backend:** Execute restore/checkout commands
4. **Frontend:** Show success toast "All changes discarded"
5. **Frontend:** Call `refreshStatus()` to update UI
6. **Frontend:** Clear file selection

---

## Merge Changes Workflows

The Merge Changes workflow follows a **3-step process**: Check → Resolve → Complete

### 1. Check for Conflicts

**Trigger:** User enters target branch and clicks "Check for Conflicts" in MergeChangesPage  
**Frontend Function:** `RepoContext.checkBranchConflicts(targetBranch, sourceBranch, squash)`  
**Backend Functions:**
- `GitService.CheckBranchConflicts(repoPath, targetBranch, sourceBranch)` - Dry-run check
- `GitService.StartMergeWithOptions(repoPath, targetBranch, sourceBranch, options)` - Start actual merge

#### Decision Tree
```
START
  ↓
Is repo path valid? ──NO→ Error: "No repository open"
  ↓ YES
Has uncommitted changes? ──YES→ Error: "Commit or stash changes first"
  ↓ NO
Fetch target branch from remote
  ↓
Run merge-tree dry-run
  ↓
Conflicts detected? ─┬─YES→ Store conflicted files → Start actual merge → RESOLVE step
                     │
                     └─NO→ No conflicts detected → Start clean merge
                              ↓
                         Already up to date? ──YES→ END (Nothing to merge)
                              ↓ NO
                         Auto-completed? ──YES→ END (Fast-forward merge)
                              ↓ NO
                         Merge staged, ready to commit → COMPLETE step
```

#### Git Commands Executed
```bash
# Backend: CheckBranchConflicts - Dry run check
git fetch origin <targetBranch>
git rev-parse --verify origin/<targetBranch>    # Verify target exists
git rev-parse --verify <sourceBranch>           # Verify source exists
git merge-tree --write-tree --name-only origin/<targetBranch> <sourceBranch>

# If conflicts OR no conflicts, start actual merge:
# Backend: StartMergeWithOptions
git checkout <targetBranch>
git merge --no-commit --no-ff <sourceBranch>    # Regular merge
# OR
git merge --squash <sourceBranch>               # Squash merge
```

#### State Transitions
1. **Frontend:** `isCheckingConflicts = true`
2. **Backend:** Fetch target branch
3. **Backend:** Run `git merge-tree` (dry-run, doesn't touch working tree)
4. **Backend:** Parse output:
   - Exit code 0 = No conflicts
   - Exit code 1 = Conflicts detected
5. **Frontend:** Store `conflictCheckResult` with conflict details
6. **Backend:** Checkout target branch
7. **Backend:** Start actual merge (with or without conflicts)
8. **Frontend:** 
   - If conflicts: Set `conflictedFiles`, show in sidebar → **RESOLVE step**
   - If no conflicts: Show "Ready to merge" → **COMPLETE step**
9. **Frontend:** `isCheckingConflicts = false`

#### Special Cases

**Already Up to Date:**
```
git merge output: "Already up to date."
→ Frontend shows: "Target already contains all changes - nothing to merge"
→ State cleared, no merge started
```

**Auto-completed (Fast-forward):**
```
git merge succeeds without creating merge commit
→ Frontend shows: "Merged successfully"
→ refreshAll() called, state cleared
→ No manual commit needed
```

**Squash Merge:**
```
git merge --squash <source>
→ All commits from source branch combined into one
→ Changes staged, but NOT committed
→ User must complete merge with custom message
→ Results in linear history (no merge commit with two parents)
```

---

### 2. Start Merge (with/without conflicts)

**Note:** This step is **automatically executed** after conflict check. The user doesn't manually "start" a merge.

**Backend Function:** `GitService.StartMergeWithOptions(repoPath, targetBranch, sourceBranch, options)`

#### Decision Tree (Internal)
```
START (called by CheckBranchConflicts)
  ↓
Already in merge state? ──YES→ Return success (continue existing merge)
  ↓ NO
In rebase state? ──YES→ Error: "Abort rebase first"
  ↓ NO
Has uncommitted changes? ──YES→ Error: "Commit or stash first"
  ↓ NO
Checkout target branch
  ↓
Execute merge command (with --squash if requested)
  ↓
Merge failed? ─┬─Exit code 1 with conflicts → Return success (expected)
                │
                ├─Exit code 0 → Check merge state
                │                 ↓
                │            In merge state? ──NO→ Already up to date / Auto-completed
                │                 ↓ YES
                │            Return success (staged, ready to commit)
                │
                └─Other error → Return failure
```

#### Git Commands Executed
```bash
# Regular merge (creates merge commit with two parents)
git checkout <targetBranch>
git merge --no-commit --no-ff <sourceBranch>

# Squash merge (linear history, single commit)
git checkout <targetBranch>
git merge --squash <sourceBranch>
```

#### Merge States After Execution

| Scenario | Exit Code | Merge State | Next Step |
|----------|-----------|-------------|-----------|
| Conflicts | 1 | `inMerge=true`, `hasConflicts=true` | Resolve conflicts |
| Clean merge (regular) | 0 | `inMerge=true`, `hasConflicts=false` | Complete merge |
| Clean merge (squash) | 0 | `inMerge=false` (staged only) | Complete merge |
| Already up to date | 0 | `inMerge=false` | Nothing to do |
| Fast-forward | 0 | `inMerge=false` | Auto-completed |

---

### 3. Resolve Conflicts

**Trigger:** User selects a conflict file and chooses resolution strategy  
**Frontend Function:** `RepoContext.resolveConflict(filePath, strategy)`  
**Backend Functions:**
- `GitService.ResolveConflictKeepOurs(repoPath, filePath)` - strategy='mine'
- `GitService.ResolveConflictKeepTheirs(repoPath, filePath)` - strategy='theirs'
- `GitService.ResolveConflictKeepBoth(repoPath, filePath)` - strategy='both'

#### Decision Tree
```
START (per file)
  ↓
Is merge in progress? ──NO→ Error: "No merge in progress"
  ↓ YES
User selects strategy:
  ├─Keep Mine → Checkout --ours
  ├─Keep Theirs → Checkout --theirs
  └─Keep Both → Extract both versions, rename one with _COPY
  ↓
Stage resolved file
  ↓
Update local resolution state
  ↓
All files resolved? ──YES→ Enable "Complete Merge" button
  ↓ NO
Continue resolving next file
```

#### Git Commands Executed

**Strategy: Keep Mine**
```bash
git checkout --ours -- <filePath>
git add -- <filePath>
```

**Strategy: Keep Theirs**
```bash
git checkout --theirs -- <filePath>
git add -- <filePath>
```

**Strategy: Keep Both**
```bash
# Extract local version (stage 2 is "ours") with timestamp suffix
git show :2:<filePath> > <baseName>_COPY_<YYYYMMDD_HHMMSS><ext>

# Keep incoming version (stage 3 is "theirs") as the original filename
git checkout --theirs -- <filePath>

# Stage both files
git add -- <filePath> <baseName>_COPY_<timestamp><ext>
```

> **Note:** The timestamp suffix (e.g., `_COPY_20260115_143052`) ensures unique filenames
> even when resolving the same file multiple times.

#### State Transitions (Per File)
1. **Frontend:** User clicks file in conflict list, opens resolution UI
2. **Frontend:** User selects strategy (Mine/Theirs/Both)
3. **Frontend:** `isResolvingConflict = true`
4. **Backend:** Execute appropriate checkout command
5. **Backend:** Stage resolved file with `git add`
6. **Frontend:** Update `fileResolutions[filePath] = strategy`
7. **Frontend:** Update conflict file badge to show resolution (green check)
8. **Frontend:** Show success toast "Resolved [filename]"
9. **Frontend:** `isResolvingConflict = false`
10. **Frontend:** Check if all files resolved → enable "Complete Merge"

#### Resolution State Tracking
```javascript
// Frontend state
fileResolutions = {
  'src/file1.js': 'mine',
  'src/file2.js': 'theirs',
  'assets/logo.png': 'both',
}

// UI displays:
// - Green check icon next to resolved files
// - Strategy label ("Keep Mine" / "Keep Theirs")
// - Progress bar: X/Y files resolved
```

---

### 4. Complete Merge

**Trigger:** User clicks "Complete Merge" after resolving all conflicts (or if no conflicts)  
**Frontend Function:** `RepoContext.completeMerge(message)`  
**Backend Functions:**
- `GitService.CompleteMerge(repoPath, message)` - Regular merge
- `GitService.CompleteSquashMerge(repoPath, message)` - Squash merge

#### Decision Tree
```
START
  ↓
Is merge in progress? ──NO→ Error: "No merge in progress"
  ↓ YES
All conflicts resolved? ──NO→ Error: "X files still need resolution"
  ↓ YES
Is squash merge?
  ├─YES→ Commit staged changes (single commit)
  └─NO → Complete merge commit (merge commit with two parents)
  ↓
Checkout parent/target branch
  ↓
Refresh status and branches
  ↓
Clear conflict state
  ↓
END (Success: Merge completed)
```

#### Git Commands Executed

**Regular Merge:**
```bash
# Backend: CompleteMerge
# If message provided:
git commit -m "<message>"

# If no message (use default):
git commit --no-edit    # Uses MERGE_MSG template
```

**Squash Merge:**
```bash
# Backend: CompleteSquashMerge
# Squash merge doesn't create merge commit, just commits staged changes
git commit -m "<message>"
```

#### State Transitions
1. **Frontend:** User enters commit message (optional)
2. **Frontend:** Clicks "Complete Merge" button
3. **Backend:** Verify merge state (`GetMergeState`)
4. **Backend:** Check for unresolved conflicts
5. **Backend:** Execute appropriate commit command
6. **Frontend:** Show success toast "Merge completed successfully"
7. **Backend:** Checkout to parent/target branch (optional, based on workflow)
8. **Frontend:** Clear conflict state:
   - `conflictedFiles = []`
   - `conflictCheckResult = null`
   - `fileResolutions = {}`
   - `mergeState = null`
9. **Frontend:** Call `refreshAll()` and `refreshBranches()`
10. **Frontend:** Clear selection and reset UI

#### After Merge Commit

**Regular Merge Result:**
```
A---B---C---D (main)
     \     /
      E---F (feature)

Merge commit D has two parents: C and F
History preserves both branch lineages
```

**Squash Merge Result:**
```
A---B---C---D (main)
     \
      E---F (feature, not merged into main)

Commit D contains all changes from E+F but as a single commit
Feature branch history is flattened
Cleaner linear history
```

---

### 5. Abort Merge

**Trigger:** User clicks "Abort Merge" button during conflict resolution  
**Frontend Function:** `RepoContext.abortMerge()`  
**Backend Function:** `GitService.AbortMerge(repoPath)`

#### Decision Tree
```
START
  ↓
Is merge in progress? ──NO→ Error: "No merge in progress"
  ↓ YES
User confirms abort in AlertDialog? ──NO→ Cancel
  ↓ YES
Abort merge
  ↓
Restore working tree to pre-merge state
  ↓
Clear conflict state
  ↓
Refresh status
  ↓
END (Success: Back to original state)
```

#### Git Commands Executed
```bash
# Backend: AbortMerge
git merge --abort
```

#### State Transitions
1. **Frontend:** User clicks "Abort Merge", AlertDialog appears
2. **User:** Confirms abort
3. **Backend:** Execute `git merge --abort`
4. **Backend:** Working tree restored to state before merge started
5. **Frontend:** Show success toast "Merge aborted"
6. **Frontend:** Clear all conflict state:
   - `conflictedFiles = []`
   - `conflictCheckResult = null`
   - `fileResolutions = {}`
   - `mergeState = null`
7. **Frontend:** Call `refreshStatus()`
8. **Frontend:** Reset UI to initial check state

---uck State Recovery Operations

When git operations are interrupted (merge conflicts, cherry-pick conflicts, revert conflicts, etc.), the repository can be left in a "stuck" state. ControlZebra provides recovery actions to help users get unstuck.

**Note:** Rebase operations are currently supported for recovery but **will be removed in a future version** as the application moves to a merge-only workflow.

### Universal Abort Operation

**Trigger:** User clicks "Abort Current Operation" in recovery UI  
**Frontend Function:** `RepoContext.abortCurrentOperation()`  
**Backend Function:** `GitService.AbortCurrentOperation(repoPath)`

#### Decision Tree
```
START
  ↓
Detect current operation state
  ├─In merge? → git merge --abort
  ├─In rebase? → git rebase --abort (DEPRECATED)
  ├─In cherry-pick? → git cherry-pick --abort
  ├─In revert? → git revert --abort
  ├─In AM (apply mailbox)? → git am --abort
  └─In bisect? → git bisect reset
  ↓
Clear stuck state
  ↓
Restore working tree
  ↓
END (Success: Back to clean state)
```

#### Git Commands Executed
```bash
# Backend detects state by checking for specific git files
# Then executes appropriate abort command

# Merge
git merge --abort

# Rebase (DEPRECATED - will be removed)
git rebase --abort

# Cherry-pick
git cherry-pick --abort

# Revert
git revert --abort

# Apply mailbox
git am --abort

# Bisect
git bisect reset
```

---

### Cherry-Pick Operations

#### Abort Cherry-Pick
**Backend Function:** `GitService.AbortCherryPick(repoPath)`

```bash
git cherry-pick --abort
```

#### Continue Cherry-Pick
**Backend Function:** `GitService.ContinueCherryPick(repoPath)`

After resolving conflicts, continue the cherry-pick:
```bash
git cherry-pick --continue
```

#### Skip Cherry-Pick Commit
**Backend Function:** `GitService.SkipCherryPickCommit(repoPath)`

Skip the problematic commit and continue:
```bash
git cherry-pick --skip
```

---

### Revert Operations

#### Abort Revert
**Backend Function:** `GitService.AbortRevert(repoPath)`

```bash
git revert --abort
```

#### Continue Revert
**Backend Function:** `GitService.ContinueRevert(repoPath)`

After resolving conflicts:
```bash
git revert --continue
```

#### Skip Revert Commit
**Backend Function:** `GitService.SkipRevertCommit(repoPath)`

```bash
git revert --skip
```

---

### Rebase Operations (REMOVED)

**⚠️ Note:** Rebase support has been removed. The application uses a merge-only workflow to simplify the user experience for non-technical users.

If a rebase is detected (from an external tool), users can only abort it:

#### Abort Rebase
**Backend Function:** `GitService.AbortCurrentOperation(repoPath)` - handles rebase abort automatically
```bash
git rebase --abort
```

After aborting, users should use the Merge Changes workflow instead.

---

## Recommendations

### Detached HEAD State Handling

**Current Status:** The application detects detached HEAD but does not provide a user-friendly recovery workflow.

**Recommended User Experience:**

1. **Detection Banner**
   - Show a prominent banner when in detached HEAD state
   - Message: "You're viewing a specific point in history. Create a branch to save new changes."
   - Icon: Warning/Info indicator

2. **Quick Actions**
   - **Primary Action:** "Create Branch Here" - Opens dialog to name and create branch
     - Executes: `git checkout -b <branchName>`
   - **Secondary Action:** "Return to [last branch]" - Checkout back to previous branch
     - Executes: `git checkout <lastBranch>`

3. **Commit Blocking**
   - Disable "Save Changes" button in CommitPanel when in detached HEAD
   - Show tooltip: "Create a branch first to save changes"
   - Provide inline "Create Branch" button as alternative

4. **Visual Indicators**
   - StatusBar: Show "DETACHED HEAD" badge with warning color
   - TopBar: Display current commit hash instead of branch name
   - ActivityBar: Dim branch-related actions

5. **Education**
   - First-time detection: Show an educational dialog explaining detached HEAD
   - Link to help documentation or inline explanation
   - Option to "Don't show again"

**Implementation Priority:** Medium - Detached HEAD is a confusing state for non-technical users and should be handled gracefully.

---

### Git LFS (Large File Storage) Integration

Git LFS workflows are documented separately in:
- **Service Documentation:** [docs/technical/Services.md](Services.md) - LFSService methods
- **LFS Configuration:** Managed via Settings and Repository Settings panels
- **Merge Considerations:** LFS files follow standard merge workflows but with additional lock/unlock coordination

**Key LFS Behaviors:**
- LFS-tracked files appear as normal files in the conflict resolution workflow
- Lock indicators shown in file lists (prevents concurrent edits)
- Large files do not block merge operations (pointers are merged, not file content)

---

## Changelog

**January 14, 2026 - Initial Documentation**
- Documented Explorer workflows: Commit, Branch & Save, Sync, Rewind, Discard
- Documented Merge Changes workflows: Check, Start, Resolve, Complete, Abort
- Added Stuck State Recovery operations section (Cherry-pick, Revert, Rebase, AM, Bisect)
- Marked Rebase operations as deprecated (to be removed)
- Added state management details
- Added error handling scenarios
- Added recommendations for Detached HEAD handling
- Added note about separate LFS documenta new branch to preserve work:
```bash
git checkout -b <branchName>
```

---

### Lock File Recovery

#### Remove Stale Lock Files
**Backend Function:** `GitService.RemoveAllStaleLocks(repoPath)`

Removes stale `.lock` files that can prevent git operations:
```bash
# Manually removes files:
rm -f .git/index.lock
rm -f .git/HEAD.lock
rm -f .git/refs/heads/*.lock
# etc.
```

**Warning:** This is a destructive operation and should only be used when git operations consistently fail due to lock files.

---

## St

## State Management

### Repository State (Frontend)

**File:** `frontend/src/context/RepoContext.jsx`

#### Core State Variables
```javascript
// Repository info
repoPath: string | null              // Current repository path
repoInfo: RepoInfo | null            // Branch, isRepo, hasError
repoStatus: RepoStatus | null        // Changed files, ahead/behind counts

// Conflict/Merge state
conflictedFiles: ConflictedFile[]    // Files with conflicts
selectedConflictFile: string | null  // Currently selected conflict file
conflictCheckResult: object | null   // Result from CheckBranchConflicts
detectedParentBranch: object | null  // Auto-detected target branch
fileResolutions: object              // { filePath: 'mine' | 'theirs' | 'both' }
mergeState: object | null            // Current merge/rebase state from backend
conflictSidesInfo: object | null     // Commit info for both sides
isSquashMerge: boolean               // Whether to use squash merge (default: true)

// Loading states
isLoading: boolean                   // General loading (open repo, init)
isSyncing: boolean                   // Sync operation in progress
isCommitting: boolean                // Commit operation in progress
isCheckingConflicts: boolean         // Conflict check in progress
isResolvingConflict: boolean         // Resolving individual conflict
```

### Git State (Backend)

**File:** `services/git_service.go`

#### Merge State Detection
```go
type MergeState struct {
    InMerge      bool     // .git/MERGE_HEAD exists
    InRebase     bool     // .git/rebase-merge or .git/rebase-apply exists
    HasConflicts bool     // Unmerged files exist
    MergeHead    string   // Hash of commit being merged
    ConflictFiles []string
}
```

#### Detection Logic
```bash
# Check if in merge state
test -f .git/MERGE_HEAD

# Check if in rebase state
test -d .git/rebase-merge || test -d .git/rebase-apply

# Check for conflicts
git ls-files --unmerged
```

### State Synchronization

**Automatic Status Refresh:**
- **Polling:** Every 30 seconds (fallback)
- **File Watcher:** Real-time file change events (primary)
- **Manual:** After every git operation (`refreshAll()`)

**Event-based Refresh:**
```javascript
// File watcher emits 'files-changed' event
// Debounced 300ms to prevent excessive refreshes
Events.On('files-changed', () => {
  setTimeout(() => refreshStatus(), 300);
});
```

---

## Error Handling

### Common Error Scenarios

#### 1. No Upstream Configured
**Trigger:** Sync operation when no remote is set  
**Git Error:** `"no tracking information"` or `"no upstream"`  
**User Message:** `"No remote branch configured. Please set up a remote first."`  
**Recovery:** User must configure remote via Terminal or git hosting UI

#### 2. Pull Conflicts
**Trigger:** Sync operation encounters merge conflicts  
**Git Error:** `"CONFLICT"` in pull output  
**User Message:** `"Merge conflict detected. Use 'Combine Versions' to resolve."`  
**Recovery:** User directed to Merge Changes view to resolve conflicts manually

#### 3. Push Rejected
**Trigger:** Push when remote has new commits  
**Git Error:** `"rejected"` in push output  
**User Message:** `"Push rejected. Remote has changes. Please sync again."`  
**Recovery:** User must pull first (Sync again)

#### 4. Uncommitted Changes During Merge
**Trigger:** Attempting to start merge with uncommitted changes  
**Git Error:** Pre-flight check fails  
**User Message:** `"Cannot start merge: you have uncommitted changes. Commit or stash first."`  
**Recovery:** User must commit or use "Branch and Save"

#### 5. Merge in Progress
**Trigger:** Attempting to start new merge while another is active  
**Git Error:** `.git/MERGE_HEAD` exists  
**User Message:** `"Merge already in progress - resolve conflicts or abort first."`  
**Recovery:** User must complete or abort current merge

#### 6. Rebase in Progress
**Trigger:** Attempting to start merge during rebase  
**Git Error:** `.git/rebase-merge` exists  
**User Message:** `"Cannot start merge: rebase in progress. Abort the rebase first."`  
**Recovery:** User must complete/abort rebase (future feature)

#### 7. Branch Not Found
**Trigger:** Invalid branch name in merge check  
**Git Error:** `git rev-parse` fails  
**User Message:** `"Branch '<name>' not found locally or on remote"`  
**Recovery:** User must enter valid branch name or fetch from remote

#### 8. Stash Pop Conflicts
**Trigger:** Branch and Save encounters conflicts when popping stash  
**Git Error:** Stash pop fails with conflicts  
**User Message:** `"Stash pop failed - resolve conflicts manually"`  
**Recovery:** User must resolve stash conflicts in new branch, then commit

---

## Questions & Clarifications Needed

Before finalizing this documentation, please clarify:

### 1. **Interrupted Operations Recovery**
I see there are several recovery methods in RepoContext (AbortCurrentOperation, AbortCherryPick, AbortRevert, etc.), but they're not fully connected to the UI yet. Should I document these as "Future Features" or are they actively used?

### 2. **LFS (Large File Storage) Integration**
I noticed LFS service and settings exist, but they're not integrated into the merge workflow. Should LFS-specific merge scenarios be documented separately?

### 3. **File Watcher Behavior**
The file watcher is mentioned to start on repo open, but I don't see explicit documentation on:
- What file changes trigger refresh (only git files? all files?)
- Does it watch subdirectories?
- Performance implications for large repos?

Should I add a section on File Watcher internals?

### 5. **Progress Modal Events**
The sync operation uses a progress modal with event-based updates. Should I document the event system (`progress-update`, `progress-complete`) in detail?

### 6. **Detached HEAD State**
How should the UI handle detached HEAD scenarios? I see checks for it, but no user-facing recovery workflow documented.

---

## Changelog

**January 15, 2026 - Rebase Workflow Removed**
- Removed `ContinueRebase`, `SkipRebaseCommit`, `GetRebaseProgress` from GitService
- Removed `AbortRebase` from RepositorySettingsService
- Removed `continueRebase`, `skipRebaseCommit` from RepoContext
- Removed RebaseRecoveryPanel from MergeChangesPage
- Updated RecoveryBanner to show abort-only option for detected rebase
- Rebase detection remains for abort purposes - users should use merge workflow instead

**January 14, 2026 - Initial Documentation**
- Documented Explorer workflows: Commit, Branch & Save, Sync, Rewind, Discard
- Documented Merge Changes workflows: Check, Start, Resolve, Complete, Abort
- Added state management details
- Added error handling scenarios
- Listed open questions for clarification

