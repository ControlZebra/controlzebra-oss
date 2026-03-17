# History Feature

> `features/history/` — Commit history and visual git graph.

## Overview

The History view shows the commit timeline with an interactive visual graph. Users can browse past saves, view diffs, and understand the project's evolution.

## Components

### Sidebar
- **HistoryView** — Commit list with search/filter

### Main Area
- **HistoryPage** — Full-width commit detail view + git graph

### Core Components
- **CommitList** — Virtualized list of commits using `@tanstack/react-virtual`
  - Each row shows: commit hash, message, author, date, branch refs
  - Click to view commit details and diff
  - Efficient — handles repos with thousands of commits
- **GitGraph** — Visual git graph showing branch/merge topology
  - Color-coded branches
  - Merge/fork points highlighted
  - Synchronized scrolling with CommitList

## Data Flow

```
HistoryPage mounts
  → RepoContext.getCommitLog(limit)
  → Backend: git log --oneline --graph --all
  → Parse into CommitInfo[] and graph data
  → Render CommitList (virtualized) + GitGraph
```

---

**Related:** [[GitService]] (commit log methods) | [[Layout System]]


---

# Merge Feature

> `features/merge/` — Branch merging and conflict resolution.

## Overview

The Merge feature handles the complete merge workflow — selecting branches, previewing changes, resolving conflicts, and completing the merge.

## Components

### Sidebar
- **MergeChangesView** — Shows merge-related files and conflict status

### Main Area
- **MergeChangesPage** — Full merge workflow UI
- **MergeReviewDiffModal** — Preview diffs before merging

## Merge Workflow

```
User selects source branch in BranchModal
  → RepoContext.startMerge(source, { isSquashMerge: true })
    → GitService.StartMergeWithOptions()
      → git merge --squash <source>
  → If clean merge:
    → Auto-commit with merge message
    → Switch to Explorer → ReadyToPushScreen
  → If conflicts:
    → Set mergeState in RepoContext
    → Explorer shows MergeRequestScreen
    → Per-file conflict resolution:
      → "Keep My Changes" (--ours)
      → "Keep Their Changes" (--theirs)
      → "Keep Both" (export both with _COPY_ suffix)
    → When all resolved: complete merge
```

## Merge Strategy

| Setting | Value | Rationale |
|---------|-------|-----------|
| Default merge type | Squash (`--squash`) | Clean, linear history |
| Rebase | Never used | Too complex for non-technical users |
| Fast-forward | Allowed when possible | Simplifies history |

---

**Related:** [[GitService]] (merge methods) | [[Explorer Feature]] | [[Git Workflows]]


---

# Welcome Feature

> `features/welcome/` — Welcome screen, project creation, and cloning.

## Overview

The Welcome screen is shown when no repository is open. It provides four paths to get started:

## Sub-Pages

### RecentProjectsPage
- List of recently opened repositories (from [[SettingsService]])
- Click to reopen
- Remove from recents

### NewProjectPage
- **ProjectCreationStepper** — Wizard for creating a new git repo:
  1. Choose folder location
  2. Set project name
  3. Initialize git repo
  4. Optional: create GitHub repo ([[GitHubService]])
  5. Optional: configure LFS patterns

### CloneProjectPage
- GitHub authentication check
- List of user's GitHub repos (from [[GitHubService]])
- Choose destination folder
- Clone with progress ([[ProgressService]])

### OpenFolderPage
- Native folder picker (from [[FileDialogService]])
- Opens existing git repo
- If not a git repo → NonGitFolderPromptModal (offer to initialize)

## Components

- **WelcomeView** — Sidebar with navigation between sub-pages
- **RepoSwitcher** — Quick project switching dropdown
- **PublishToCloudModal** — Create GitHub repo from local project
- **ProjectCreationStepper** — Multi-step project wizard

---

**Related:** [[GitHubService]] | [[SettingsService]] | [[FileDialogService]]
