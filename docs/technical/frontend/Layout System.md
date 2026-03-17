# Layout System

> VS Code-like shell built with React components.

## Architecture

```
AppLayout
├── TopBar                 (app header: project name, branch switcher, sync/push buttons)
├── RecoveryBanner         (stuck state detection and recovery UI)
├── Toaster                (sonner toast notifications)
├── ProgressModal          (git progress streaming overlay)
├── Modals                 (NonGitFolderPrompt, AdditionalPackages, etc.)
│
├── <main flex container>
│   ├── ActivityBar        (left: vertical icon navigation)
│   ├── Sidebar            (middle: view content panel, resizable)
│   └── MainArea           (right: primary content with tabs)
│
└── StatusBar              (bottom: repo status, branch, file count)
```

## Components

### TopBar (`widgets/layout/TopBar.tsx`)

The header bar showing:
- Project name (clickable → RepoSwitcher)
- Current branch name (clickable → BranchModal)
- Action buttons: Sync, Push, Settings
- GitHub connection status

### ActivityBar (`widgets/layout/ActivityBar.tsx`)

Vertical icon navigation on the left edge. Each icon maps to a [[#View Registry|view]]:

| Icon | View | Constant |
|------|------|----------|
| FolderOpen | Explorer | `VIEWS.EXPLORER` |
| Clock | History | `VIEWS.HISTORY` |
| GitMerge | Merge Changes | `VIEWS.MERGE_CHANGES` |
| Settings | Settings | `VIEWS.SETTINGS` |
| FolderCog | Repo Settings | `VIEWS.REPO_SETTINGS` |
| User | Profile | `VIEWS.PROFILE` |
| Bug | Debug | `VIEWS.DEBUG` |

Clicking an icon sets `activeView` in [[Context Providers#LayoutContext|LayoutContext]].

### Sidebar (`widgets/layout/Sidebar.tsx`)

Renders the view component for the current `activeView`:
- Collapsible (toggle via ActivityBar click or responsive auto-collapse)
- Resizable width (drag handle, stored in LayoutContext)
- Minimum width: ~200px, default: 400px

### MainArea (`widgets/layout/MainArea.tsx`)

The primary content area. Renders in two modes:

1. **View page mode:** Dispatches to the page component from the [[#View Registry]]
2. **Explorer tab mode:** When `activeView` is Explorer, shows file browser tabs with the [[Viewer System]]

Explorer tabs:
- Pinned "Files" tab (always visible)
- File viewer tabs (opened by clicking files in the file browser)
- Tab bar with close buttons

### StatusBar (`widgets/layout/StatusBar.tsx`)

Bottom bar showing:
- Repository root path
- Current branch
- File change count
- LFS lock indicator (when locks present)
- Sync status indicators

## View Registry

`widgets/layout/view-registry.ts` maps view IDs to page components:

```tsx
export const VIEW_REGISTRY: Partial<Record<ViewType, ComponentType>> = {
    [VIEWS.EXPLORER]: ExplorerPage,
    [VIEWS.HISTORY]: HistoryPage,
    [VIEWS.MERGE_CHANGES]: MergeChangesPage,
    [VIEWS.REPO_SETTINGS]: RepoSettingsPage,
    [VIEWS.SETTINGS]: SettingsPage,
    [VIEWS.PROFILE]: ProfilePage,
    [VIEWS.DEBUG]: DebugPage,
};
```

Each page component has a corresponding sidebar view component rendered in the Sidebar.

## Explorer Page Sub-Screens

The Explorer page shows different screens based on the repo state:

```
ExplorerPage
├── AllSyncedScreen       ← No pending changes, everything pushed
├── CommitScreen          ← Has uncommitted changes → "Save Changes" flow
├── ReadyToPushScreen     ← Changes committed but not pushed → "Share" flow
└── MergeRequestScreen    ← Active merge in progress → conflict resolution
```

## Welcome Page Sub-Pages

When no repo is open, the Welcome page shows:

```
WelcomePage
├── RecentProjectsPage   ← List of recently opened repos
├── NewProjectPage        ← Create a new git repo
├── CloneProjectPage      ← Clone from GitHub
└── OpenFolderPage        ← Open existing folder
```

## Modal Components

| Modal | Location | Trigger |
|-------|----------|---------|
| BranchModal | `widgets/layout/BranchModal.tsx` | Branch indicator click |
| BranchNameModal | `widgets/layout/BranchNameModal.tsx` | New branch creation |
| RewindConfirmModal | `widgets/layout/RewindConfirmModal.tsx` | Undo last save |
| SwitchProjectModal | `widgets/layout/SwitchProjectModal.tsx` | Project switcher |
| NonGitFolderPromptModal | `widgets/layout/NonGitFolderPromptModal.tsx` | Opening non-git folder |
| AdditionalPackagesModal | `widgets/layout/AdditionalPackagesModal.tsx` | Missing dependencies |
| LFSAutoTrackModal | `features/explorer/components/LFSAutoTrackModal.tsx` | Pre-commit LFS detection |
| PublishToCloudModal | `features/welcome/components/PublishToCloudModal.tsx` | Publish to GitHub |
| GitHubDeviceFlowModal | `features/auth/components/GitHubDeviceFlowModal.tsx` | GitHub device auth |

## Adding a New View

See [[Adding a New View]] for the step-by-step guide.

---

**Related:** [[Frontend Architecture]] | [[Context Providers]] | [[Viewer System]]
