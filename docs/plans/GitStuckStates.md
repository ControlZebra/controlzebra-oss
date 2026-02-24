# Common Git Stuck States — Implementation Guide

## Already Implemented ✅
- **Interactive Rebase** — Detected via `.git/rebase-merge/` or `.git/rebase-apply/`
- **Merge Conflicts** — Detected via `.git/MERGE_HEAD`

---

## Needs Implementation

### 1. Cherry-Pick in Progress
- **Detection:** `.git/CHERRY_PICK_HEAD`
- **User Impact:** User started cherry-picking commits and hit conflicts or abandoned mid-operation.
- **Backend Methods:**
  ```go
  func (g *GitService) GetCherryPickState(repoPath string) CherryPickState
  func (g *GitService) ContinueCherryPick(repoPath string) OperationResult
  func (g *GitService) AbortCherryPick(repoPath string) OperationResult  // git cherry-pick --abort
  func (g *GitService) SkipCherryPickCommit(repoPath string) OperationResult  // git cherry-pick --skip
  ```
- **Frontend:** Add to `MergeState` type, show recovery panel similar to rebase.

---

### 2. Revert in Progress
- **Detection:** `.git/REVERT_HEAD`
- **User Impact:** User tried to undo a commit via revert but hit conflicts.
- **Backend Methods:**
  ```go
  func (g *GitService) GetRevertState(repoPath string) RevertState
  func (g *GitService) ContinueRevert(repoPath string) OperationResult
  func (g *GitService) AbortRevert(repoPath string) OperationResult  // git revert --abort
  ```
- **Frontend:** Similar recovery UI, message: "Undoing a previous save caused conflicts."

---

### 3. Bisect in Progress
- **Detection:** `.git/BISECT_LOG` or `.git/BISECT_START`
- **User Impact:** User started binary search to find a bug, forgot they were in bisect mode.
- **Backend Methods:**
  ```go
  func (g *GitService) GetBisectState(repoPath string) BisectState
  func (g *GitService) AbortBisect(repoPath string) OperationResult  // git bisect reset
  ```
- **Frontend:** Warning banner: "Bug search in progress. Complete or abort to resume normal work."

---

### 4. Detached HEAD State
- **Detection:** `git symbolic-ref HEAD` fails or `.git/HEAD` contains a commit hash instead of `ref: refs/heads/...`
- **User Impact:** User is not on any branch — commits will be orphaned if they switch branches.
- **Backend Methods:**
  ```go
  func (g *GitService) IsDetachedHead(repoPath string) bool
  func (g *GitService) CreateBranchFromDetached(repoPath, branchName string) OperationResult
  ```
- **Frontend:**
  - StatusBar: Show "DETACHED" instead of branch name in red/orange
  - Banner: "You're not on any branch. Create a branch to save your work."
  - Quick action: "Create Branch Here"

---

### 5. Locked Index (.git/index.lock)
- **Detection:** `.git/index.lock` file existence
- **User Impact:** A previous git operation crashed or was killed, leaving a lock file. All git operations will fail with "fatal: Unable to create '.git/index.lock': File exists."
- **Backend Methods:**
  ```go
  func (g *GitService) CheckForStaleLocks(repoPath string) []string  // Returns list of lock files
  func (g *GitService) RemoveStaleLock(repoPath, lockFile string, confirm bool) OperationResult
  ```
- **Frontend:**
  - Auto-detect on error: If any git operation fails with "index.lock", offer to remove it
  - Warning: "A previous operation didn't complete cleanly. Remove lock to continue?"
  - Confirmation dialog required (destructive action)

---

### 6. Stash Apply Conflicts
- **Detection:** After `git stash pop` fails with conflicts, working tree has conflicts but no MERGE_HEAD
- **User Impact:** User tried to restore stashed changes but they conflict with current state.
- **Backend Methods:**
  ```go
  // Already have stash methods, but add:
  func (g *GitService) GetStashConflictState(repoPath string) bool
  func (g *GitService) AbortStashApply(repoPath string) OperationResult  // git reset --merge
  ```
- **Frontend:** Recovery panel: "Restoring saved changes caused conflicts. Resolve or discard."

---

### 7. AM (Apply Mailbox) in Progress
- **Detection:** `.git/rebase-apply/applying` file
- **User Impact:** User applied patches via `git am` and hit conflicts.
- **Backend Methods:**
  ```go
  func (g *GitService) GetAMState(repoPath string) bool
  func (g *GitService) AbortAM(repoPath string) OperationResult  // git am --abort
  func (g *GitService) SkipAMPatch(repoPath string) OperationResult  // git am --skip
  ```
- **Frontend:** Recovery panel for patch application.

---

## Implementation Priority

| Priority | State           | Frequency | User Confusion Level |
|----------|----------------|-----------|---------------------|
| **P0**   | Detached HEAD  | High      | Very High           |
| **P0**   | Locked Index   | Medium    | Critical            |
| **P1**   | Cherry-Pick    | Medium    | High                |
| **P1**   | Revert         | Medium    | High                |
| **P2**   | Stash Conflicts| Low-Med   | Medium              |
| **P3**   | Bisect         | Low       | Medium              |
| **P3**   | AM Patches     | Very Low  | Low                 |

---

## Unified Implementation Approach

### 1. Extend `MergeState` to `RepoOperationState`
```go
type RepoOperationState struct {
    InMerge       bool   `json:"inMerge"`
    InRebase      bool   `json:"inRebase"`
    InCherryPick  bool   `json:"inCherryPick"`
    InRevert      bool   `json:"inRevert"`
    InBisect      bool   `json:"inBisect"`
    InAM          bool   `json:"inAM"`
    IsDetached    bool   `json:"isDetached"`
    HasLockFile   bool   `json:"hasLockFile"`
    HasConflicts  bool   `json:"hasConflicts"`
    Message       string `json:"message,omitempty"`
}
```

### 2. Create `GetFullRepoState()` method
- Single method that checks all stuck states at once, called on:
  - Repo open
  - After any failed git operation
  - Periodically (every 30s with status refresh)

### 3. Frontend Pattern
Create a generic `RecoveryPanel` component that takes:
```jsx
<RecoveryPanel
  type="cherry-pick" | "revert" | "bisect" | "detached" | "locked"
  onAbort={handleAbort}
  onContinue={handleContinue}  // optional
  conflictedFiles={files}
  userFriendlyMessage="..."
/>
```

### 4. Update `RecoveryBanner` to handle all states
Prioritize display order: Locked Index > Merge/Rebase > Cherry-Pick > Revert > Bisect > Detached HEAD

---

## Testing Approach
For each state, create a test repo in that state:
```bash
# Cherry-pick conflict
git cherry-pick <conflicting-commit>
# Revert conflict  
git revert <commit-with-changes-in-current>
# Bisect
git bisect start && git bisect bad && git bisect good <old-commit>
# Detached HEAD
git checkout <commit-hash>
# Locked index
touch .git/index.lock
```
