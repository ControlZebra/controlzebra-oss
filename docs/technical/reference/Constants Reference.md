# Constants Reference

> Frontend constants defined in `frontend/src/shared/constants/index.ts`.

## VIEWS

View IDs used by the [[Layout System|view registry]] and [[Context Providers#LayoutContext|LayoutContext]]:

```tsx
export const VIEWS = {
    EXPLORER: 'explorer',
    HISTORY: 'history',
    MERGE_CHANGES: 'merge-changes',
    REPO_SETTINGS: 'repo-settings',
    SETTINGS: 'settings',
    PROFILE: 'profile',
    DEBUG: 'debug',
} as const;

export type ViewType = typeof VIEWS[keyof typeof VIEWS];
```

## ICON_SIZES

Standard icon sizes for `lucide-react`:

```tsx
export const ICON_SIZES = {
    xs: 14,   // Status indicators, inline icons
    sm: 16,   // Default for most UI elements
    md: 20,   // Activity bar, prominent actions
    lg: 28,   // Profile avatars, feature highlights
} as const;
```

## FILE_STATUS

Git file status types and associated colors:

```tsx
export const FILE_STATUS = {
    ADDED: 'added',         // text-green-400
    MODIFIED: 'modified',   // text-yellow-400
    DELETED: 'deleted',     // text-red-400
    RENAMED: 'renamed',     // text-blue-400
    UNTRACKED: 'untracked', // text-gray-400
} as const;
```

## SETTINGS_CATEGORIES

App settings navigation:

```tsx
export const SETTINGS_CATEGORIES = [
    { id: 'general', name: 'General', description: 'App preferences' },
    { id: 'git-config', name: 'Git Configuration', description: 'Name and email for commits' },
];
```

## WELCOME_CATEGORIES

Welcome page navigation:

```tsx
export const WELCOME_CATEGORIES = [
    { id: 'recent-projects', name: 'Recent Projects' },
    { id: 'new-project', name: 'New Project' },
    { id: 'clone-project', name: 'Clone Project' },
    { id: 'open-folder', name: 'Open Folder' },
];
```

## ExplorerTab

Tab type for the Explorer's file viewer tabs:

```tsx
export interface ExplorerTab {
    id: string
    name: string
    filePath?: string
    diffContext?: DiffContext
    isPinned?: boolean
}

export const FILE_BROWSER_TAB: ExplorerTab = {
    id: 'file-browser',
    name: 'Files',
    isPinned: true,
};
```

## DiffContext

Context for diff viewers:

```tsx
export interface DiffContext {
    filePath: string
    oldRef: string      // e.g., "HEAD~1", commit hash
    newRef: string      // e.g., "HEAD", "working"
    diffType: string    // "commit", "staged", "unstaged", "branch"
}
```

---

**Related:** [[Frontend Architecture]] | [[Layout System]] | [[UI Components]]
