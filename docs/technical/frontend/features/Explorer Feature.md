# Explorer Feature

> `features/explorer/` — The primary working screen for daily git operations.

## Overview

The Explorer is the main feature users interact with. It shows the file browser, changed files, and drives the commit/push/sync workflow. The Explorer's main area changes based on the current git state.

## Components

### Sidebar
- **ExplorerView** — Sidebar entry point, shows status panel
- **ExplorerStatusPanel** — Changed files list, staging controls, quick actions
- **SidebarCommitPanel** — Commit message input, "Save Changes" button

### Main Area Pages (Sub-Screens)

The Explorer page shows different screens based on the repo state:

| Screen | Condition | Purpose |
|--------|-----------|---------|
| `AllSyncedScreen` | No pending changes, pushed up to date | "Everything is saved and shared" |
| `CommitScreen` | Has uncommitted changes | "Save Changes" flow — commit message + save |
| `ReadyToPushScreen` | Commits exist that aren't pushed | "Share" flow — push to remote |
| `MergeRequestScreen` | Active merge in progress | Merge conflict resolution |

State-based routing in `ExplorerPage.tsx`:
```tsx
if (mergeState) return <MergeRequestScreen />;
if (hasUnpushedCommits) return <ReadyToPushScreen />;
if (hasChanges) return <CommitScreen />;
return <AllSyncedScreen />;
```

### File Browser
- **SimpleFileBrowser** — Tree view of repo files
  - Double-click opens file in viewer tab
  - Right-click context menu (open, copy path, reveal in Finder)
  - File status indicators (green=added, yellow=modified, red=deleted)

### Modals
- **LFSAutoTrackModal** — Intercepts commit flow when large files detected (see below)
- **MainBranchSaveChoiceModal** — Prompt when saving on protected branch
- **ProjectSetupBanner** — Banner for repos needing initial setup

## LFS Auto-Track Flow

The `useLfsAutoTrackBeforeSave` hook intercepts the commit flow:

```
User clicks "Save Changes"
  → Hook calls LFSService.DetectLargeFiles()
  → If large untracked files found:
    → Show LFSAutoTrackModal
    → User selects which patterns to track
    → Apply tracking patterns
    → Proceed with commit
  → If no large files: proceed immediately
```

## Explorer Tab System

Files opened from the file browser appear as tabs in the main area:

- **Files tab** (pinned, always visible) — Shows SimpleFileBrowser
- **File viewer tabs** — One per opened file, uses [Viewer System](../Viewer%20System.md) to render
- Tabs dedup by file path (opening same file focuses existing tab)
- Close button on each tab

---

**Related:** [Layout System](../Layout%20System.md) | [RepoContext](../Context%20Providers.md#repocontext) | [Viewer System](../Viewer%20System.md) | [GitService](../../backend/services/GitService.md)
