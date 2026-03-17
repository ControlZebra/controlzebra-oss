# Context Providers

> Three React Contexts manage all application state.

## Provider Hierarchy

```tsx
<AuthProvider>           // Session, login/logout
  <AnalyticsProvider>    // PostHog tracking
    <AuthGate>           // Routes to Login or Main App
      <RepoProvider>     // Git state machine
        <LayoutProvider> // UI state (sidebar, tabs, theme)
          <AppLayout />  // VS Code-like shell
        </LayoutProvider>
      </RepoProvider>
    </AuthGate>
  </AnalyticsProvider>
</AuthProvider>
```

## RepoContext

> `frontend/src/domain/repo/context/RepoContext.tsx` — ~3,052 lines

The largest and most complex context. Manages the entire git state machine.

### State Shape

```tsx
interface RepoState {
    // Repository
    repoPath: string | null
    repoRoot: string | null
    isGitRepo: boolean
    
    // Working Tree
    status: FileStatus[]
    stagedFiles: FileStatus[]
    hasChanges: boolean
    hasUntrackedFiles: boolean
    
    // Branches
    currentBranch: string
    branches: BranchInfo[]
    trackingInfo: BranchTrackingInfo
    
    // History
    commits: CommitInfo[]
    commitGraph: GraphData
    
    // Merge & Conflicts
    mergeState: MergeState | null
    conflictFiles: string[]
    stuckState: StuckState | null
    
    // Stash
    stashes: StashEntry[]
    
    // LFS
    lfsInstalled: boolean
    lfsInitialized: boolean
    trackedPatterns: LFSPattern[]
    locks: LFSLock[]
    
    // GitHub
    isGithubAuthenticated: boolean
    githubUsername: string | null
    isGithubRepo: boolean
    
    // Loading States
    isLoading: boolean
    isSyncing: boolean
    isPushing: boolean
    isCommitting: boolean
    
    // Error
    error: string | null
}
```

### Key Actions

```tsx
interface RepoActions {
    // Lifecycle
    openRepo: (path: string) => Promise<void>
    closeRepo: () => void
    refreshAll: () => Promise<void>
    refreshStatus: () => Promise<void>
    
    // Commit
    commitAll: (message: string) => Promise<OperationResult>
    
    // Sync
    sync: () => Promise<OperationResult>
    push: () => Promise<OperationResult>
    
    // Branches
    createBranch: (name: string) => Promise<OperationResult>
    switchBranch: (name: string) => Promise<OperationResult>
    deleteBranch: (name: string) => Promise<OperationResult>
    
    // Merge
    startMerge: (source: string, options: MergeOptions) => Promise<OperationResult>
    abortMerge: () => Promise<OperationResult>
    resolveConflict: (file: string, strategy: ConflictStrategy) => Promise<OperationResult>
    
    // Stash
    stashSave: (message: string) => Promise<OperationResult>
    stashPop: () => Promise<OperationResult>
    
    // Undo
    rewind: () => Promise<OperationResult>
    discardAll: () => Promise<OperationResult>
    discardFile: (file: string) => Promise<OperationResult>
}
```

### Hook

```tsx
const { status, currentBranch, commitAll, sync, push } = useRepo();
```

## LayoutContext

> `frontend/src/context/LayoutContext.tsx` — ~365 lines

Controls UI state independently of git state.

### State Shape

```tsx
interface LayoutState {
    // Sidebar
    activeView: ViewType
    sidebarCollapsed: boolean
    sidebarWidth: number          // Default 400px
    
    // Explorer Tabs
    explorerTabs: ExplorerTab[]
    activeExplorerTab: string
    
    // Sub-navigation
    selectedSettingsCategory: string
    selectedRepoSettingsCategory: string
    selectedWelcomeCategory: string
    
    // Theme
    theme: 'light' | 'dark' | 'system'
    
    // Project creation
    newProjectPrefillPath: string
}
```

### ExplorerTab Type

```tsx
interface ExplorerTab {
    id: string              // Unique tab ID
    name: string            // Display name
    filePath?: string       // File path for viewer
    diffContext?: DiffContext  // For diff viewers
    isPinned?: boolean      // true for the Files tab
}
```

### Hook

```tsx
const { activeView, setActiveView, theme, setTheme, openExplorerTab } = useLayout();
```

### Responsive Behavior

`useWindowSize()` hook triggers auto-collapse:
- When window width drops below threshold → `setSidebarCollapsed(true)`
- When width exceeds threshold → `setSidebarCollapsed(false)` (unless user manually collapsed)
- User intent tracking prevents auto-collapse from fighting manual toggles

## AuthContext

> `frontend/src/domain/auth/context/AuthContext.tsx` — ~188 lines

Manages Supabase authentication with OS keychain persistence.

### State Shape

```tsx
interface AuthState {
    isLoading: boolean
    isAuthenticated: boolean
    userEmail: string | null
    userName: string | null
    authError: string | null
}
```

### Actions

```tsx
interface AuthActions {
    loginWithPassword: (email: string, password: string) => Promise<AuthResult>
    logout: () => Promise<AuthResult>
    refreshSession: () => Promise<AuthResult>
}
```

### Session Hydration

On app mount:
1. `hydrateFromKeychain()` → calls `AuthService.LoadSession()`
2. If session in keychain → deserialize, validate with Supabase
3. Valid → set authenticated state, refresh keychain
4. Invalid → clear keychain, show login screen

### Hook

```tsx
const { isAuthenticated, isLoading, userEmail, loginWithPassword, logout } = useAuth();
```

---

**Related:** [[State Management]] | [[Frontend Architecture]] | [[Layout System]]
