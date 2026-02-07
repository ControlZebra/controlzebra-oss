# GitHubService Frontend Integration Plan

This document outlines the step-by-step plan to integrate the GitHubService backend (Go) into the ControlZebra frontend (React/TypeScript).

**Author:** Senior Developer  
**Date:** February 2026  
**Status:** Planning

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Phase 1: Bindings Generation](#phase-1-bindings-generation)
4. [Phase 2: State Management](#phase-2-state-management)
5. [Phase 3: AccountsSettings Component](#phase-3-accountssettings-component)
6. [Phase 4: ProfilePage Integration](#phase-4-profilepage-integration)
7. [Phase 5: Clone Repository Integration](#phase-5-clone-repository-integration)
8. [Phase 6: Publish to GitHub Feature](#phase-6-publish-to-github-feature)
9. [Phase 7: Repository Browser](#phase-7-repository-browser)
10. [Testing Checklist](#testing-checklist)
11. [Error Handling Strategy](#error-handling-strategy)

---

## Overview

### Backend API Summary

The `GitHubService` provides the following methods via the Go backend:

| Method | Purpose |
|--------|---------|
| `IsGHInstalled()` | Check if GitHub CLI is available |
| `GetGHVersion()` | Get installed `gh` CLI version |
| `AuthLogin()` | Start browser-based OAuth flow |
| `AuthLogout()` | Log out of GitHub |
| `AuthStatus()` | Check current auth status (username, token, scopes) |
| `RepoList(limit, visibility)` | List user's repositories |
| `RepoListForOrg(org, limit)` | List organization's repositories |
| `RepoClone(repo, destPath)` | Clone a repository |
| `RepoCreate(options)` | Create a new GitHub repository |
| `RepoCreateFromLocal(localPath, name, description, private)` | Publish local repo to GitHub |

### Frontend Integration Points

| Location | Integration |
|----------|-------------|
| `AccountsSettings.tsx` | Connect/disconnect GitHub account |
| `ProfilePage.tsx` | Show connected account status |
| `GitInitForm.tsx` | Clone from GitHub, browse repos |
| `TopBar.tsx` or `StatusBar.tsx` | Quick publish action |
| New: `RepoContext.tsx` | GitHub auth state management |

---

## Prerequisites

Before starting implementation:

1. **Regenerate Wails bindings** to include GitHubService:
   ```bash
   task common:generate:bindings
   ```
   
2. **Verify bindings exist** at:
   - `frontend/bindings/controlzebra/services/githubservice.ts`
   
3. **Confirm `gh` CLI** is installed for development testing:
   ```bash
   gh --version
   ```

---

## Phase 1: Bindings Generation

**Effort:** 5 minutes  
**Files affected:** Auto-generated

### Steps

1. Run the bindings generator:
   ```bash
   cd /Users/shreyasnikte/Software\ Projects/ControlZebra/ControlZebra-Desktop
   task common:generate:bindings
   ```

2. Verify new files are created:
   - `frontend/bindings/controlzebra/services/githubservice.ts`

3. Check that `index.ts` exports `GitHubService`:
   ```typescript
   // frontend/bindings/controlzebra/services/index.ts
   import * as GitHubService from "./githubservice.js";
   export { GitHubService };
   ```

4. Verify TypeScript types are generated in `models.ts`:
   - `GitHubAuthStatus`
   - `GitHubAuthResult`
   - `GitHubRepo`
   - `GitHubRepoListResult`
   - `GitHubRepoCreateOptions`
   - `GitHubRepoCreateResult`
   - `GitHubCloneResult`

---

## Phase 2: State Management

**Effort:** 1-2 hours  
**Files affected:** `context/RepoContext.tsx`, new: `context/GitHubContext.tsx`

### Option A: Extend RepoContext (Recommended)

Add GitHub state to the existing `RepoContext` for simpler integration:

```typescript
// Add to RepoContext.types.ts
interface GitHubState {
  ghInstalled: boolean;
  ghVersion: string;
  authStatus: GitHubAuthStatus | null;
  isCheckingAuth: boolean;
  repos: GitHubRepo[];
  isLoadingRepos: boolean;
}

interface GitHubActions {
  checkGitHubAuth: () => Promise<void>;
  loginGitHub: () => Promise<GitHubAuthResult>;
  logoutGitHub: () => Promise<GitHubAuthResult>;
  loadGitHubRepos: (limit?: number, visibility?: string) => Promise<void>;
  cloneGitHubRepo: (repo: string, destPath: string) => Promise<GitHubCloneResult>;
  publishToGitHub: (name: string, description: string, isPrivate: boolean) => Promise<GitHubRepoCreateResult>;
}
```

### Option B: Separate GitHubContext

Create a dedicated context for GitHub operations if the state grows large:

```typescript
// context/GitHubContext.tsx
export const GitHubContext = createContext<GitHubContextValue | null>(null);

export function GitHubProvider({ children }: { children: ReactNode }) {
  // State management for GitHub
}

export function useGitHub() {
  const context = useContext(GitHubContext);
  if (!context) throw new Error('useGitHub must be used within GitHubProvider');
  return context;
}
```

### Implementation Steps

1. **Add state variables:**
   ```typescript
   const [ghInstalled, setGhInstalled] = useState(false);
   const [ghAuthStatus, setGhAuthStatus] = useState<GitHubAuthStatus | null>(null);
   const [isCheckingGhAuth, setIsCheckingGhAuth] = useState(false);
   ```

2. **Create auth check function:**
   ```typescript
   const checkGitHubAuth = useCallback(async () => {
     setIsCheckingGhAuth(true);
     try {
       const installed = await GitHubService.IsGHInstalled();
       setGhInstalled(installed);
       
       if (installed) {
         const status = await GitHubService.AuthStatus();
         setGhAuthStatus(status);
       }
     } finally {
       setIsCheckingGhAuth(false);
     }
   }, []);
   ```

3. **Create login/logout functions:**
   ```typescript
   const loginGitHub = useCallback(async (): Promise<GitHubAuthResult> => {
     const result = await GitHubService.AuthLogin();
     if (result.success) {
       await checkGitHubAuth(); // Refresh status
     }
     return result;
   }, [checkGitHubAuth]);

   const logoutGitHub = useCallback(async (): Promise<GitHubAuthResult> => {
     const result = await GitHubService.AuthLogout();
     if (result.success) {
       setGhAuthStatus(null);
     }
     return result;
   }, []);
   ```

4. **Check auth on app startup:**
   ```typescript
   useEffect(() => {
     checkGitHubAuth();
   }, [checkGitHubAuth]);
   ```

---

## Phase 3: AccountsSettings Component

**Effort:** 2-3 hours  
**File:** `frontend/src/components/layout/pages/settings/AccountsSettings.tsx`

### Current State

The component shows static "Not connected" status with non-functional buttons.

### Target State

- Show real connection status
- Functional "Connect" button that opens browser auth
- "Disconnect" button when logged in
- Error handling for CLI not installed

### Implementation

```tsx
import { memo, useState, useEffect, useCallback, type JSX } from 'react';
import { Github, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useRepo } from '../../../../context'; // or useGitHub
import { Button } from '../../../ui';
import { GitLabIcon } from '../../../common';

function AccountsSettings(): JSX.Element {
  const { 
    ghInstalled, 
    ghAuthStatus, 
    isCheckingGhAuth,
    loginGitHub,
    logoutGitHub,
    checkGitHubAuth 
  } = useRepo();
  
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGitHubConnect = useCallback(async () => {
    setError(null);
    setIsLoggingIn(true);
    try {
      const result = await loginGitHub();
      if (!result.success) {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoggingIn(false);
    }
  }, [loginGitHub]);

  const handleGitHubDisconnect = useCallback(async () => {
    setError(null);
    setIsLoggingOut(true);
    try {
      const result = await logoutGitHub();
      if (!result.success) {
        setError(result.error || 'Logout failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoggingOut(false);
    }
  }, [logoutGitHub]);

  // Render different states
  const renderGitHubStatus = () => {
    if (!ghInstalled) {
      return (
        <div className="flex items-center gap-2 text-yellow-400">
          <AlertCircle size={16} />
          <span className="text-sm">GitHub CLI (gh) not installed</span>
        </div>
      );
    }
    
    if (isCheckingGhAuth) {
      return <Loader2 className="animate-spin" size={16} />;
    }
    
    if (ghAuthStatus?.loggedIn) {
      return (
        <div className="flex items-center gap-2 text-green-400">
          <Check size={16} />
          <span className="text-sm">Connected as {ghAuthStatus.username}</span>
        </div>
      );
    }
    
    return <span className="text-theme-muted text-xs uppercase">Not connected</span>;
  };

  const renderGitHubButton = () => {
    if (!ghInstalled) {
      return (
        <Button variant="secondary" className="w-full justify-center" disabled>
          <Github size={16} />
          <span className="ml-2">Install gh CLI first</span>
        </Button>
      );
    }
    
    if (ghAuthStatus?.loggedIn) {
      return (
        <Button 
          variant="secondary" 
          className="w-full justify-center"
          onClick={handleGitHubDisconnect}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? <Loader2 className="animate-spin" size={16} /> : null}
          <span className="ml-2">Disconnect GitHub</span>
        </Button>
      );
    }
    
    return (
      <Button 
        variant="secondary" 
        className="w-full justify-center"
        onClick={handleGitHubConnect}
        disabled={isLoggingIn}
      >
        {isLoggingIn ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          <Github size={16} />
        )}
        <span className="ml-2">
          {isLoggingIn ? 'Opening browser...' : 'Connect GitHub Account'}
        </span>
      </Button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="text-red-400" size={20} />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* GitHub Section */}
      <div className="bg-theme-surface rounded-lg p-6 border border-theme-default">
        <div className="flex items-center gap-4 mb-4">
          <Github style={{ width: 32, height: 32 }} className="text-theme-secondary" />
          <div className="flex-1">
            <h3 className="text-theme-primary font-medium">GitHub</h3>
            <p className="text-theme-muted text-sm">Push, pull, and manage pull requests</p>
          </div>
          {renderGitHubStatus()}
        </div>
        {renderGitHubButton()}
        
        {/* Show additional info when connected */}
        {ghAuthStatus?.loggedIn && (
          <div className="mt-4 pt-4 border-t border-theme-default text-sm text-theme-muted">
            <div className="flex justify-between">
              <span>Protocol:</span>
              <span className="text-theme-secondary">{ghAuthStatus.protocol || 'N/A'}</span>
            </div>
            {ghAuthStatus.scopes && (
              <div className="flex justify-between mt-1">
                <span>Scopes:</span>
                <span className="text-theme-secondary text-xs">{ghAuthStatus.scopes}</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* GitLab Section - unchanged for now */}
      {/* ... */}
      
      <p className="text-xs text-theme-muted text-center pt-2">
        Connecting accounts uses the CLI tools (gh, glab) installed on your system
      </p>
    </div>
  );
}

export default memo(AccountsSettings);
```

---

## Phase 4: ProfilePage Integration

**Effort:** 1 hour  
**File:** `frontend/src/components/layout/pages/ProfilePage.tsx`

### Changes

Update the ProfilePage to show real connection status:

```tsx
function ProfilePage(): JSX.Element {
  const { ghAuthStatus, isCheckingGhAuth } = useRepo();
  
  // ...
  
  const getGitHubStatusText = () => {
    if (isCheckingGhAuth) return 'Checking...';
    if (ghAuthStatus?.loggedIn) return `@${ghAuthStatus.username}`;
    return 'Not connected';
  };
  
  const getGitHubStatusClass = () => {
    if (ghAuthStatus?.loggedIn) return 'text-green-400';
    return 'text-theme-muted';
  };

  return (
    // ... existing JSX with dynamic status
    <span className={`text-sm ${getGitHubStatusClass()}`}>
      {getGitHubStatusText()}
    </span>
  );
}
```

---

## Phase 5: Clone Repository Integration

**Effort:** 3-4 hours  
**File:** `frontend/src/components/layout/pages/explorer/GitInitForm.tsx`

### Feature: "Browse My Repositories" Button

Add a repository browser when user is authenticated:

### New Component: GitHubRepoPicker

```tsx
// components/common/GitHubRepoPicker.tsx
interface GitHubRepoPickerProps {
  onSelect: (repo: GitHubRepo) => void;
  onCancel: () => void;
}

function GitHubRepoPicker({ onSelect, onCancel }: GitHubRepoPickerProps): JSX.Element {
  const { ghAuthStatus } = useRepo();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [visibility, setVisibility] = useState<'all' | 'public' | 'private'>('all');

  useEffect(() => {
    loadRepos();
  }, [visibility]);

  const loadRepos = async () => {
    setIsLoading(true);
    try {
      const result = await GitHubService.RepoList(50, visibility === 'all' ? '' : visibility);
      if (result.success) {
        setRepos(result.repos);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRepos = repos.filter(repo => 
    repo.name.toLowerCase().includes(filter.toLowerCase()) ||
    repo.description?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input 
          placeholder="Search repositories..." 
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select 
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as any)}
          className="bg-theme-surface border border-theme-default rounded px-3 py-2"
        >
          <option value="all">All</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </div>
      
      <div className="max-h-64 overflow-y-auto space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin" />
          </div>
        ) : filteredRepos.length === 0 ? (
          <p className="text-center text-theme-muted py-4">No repositories found</p>
        ) : (
          filteredRepos.map(repo => (
            <button
              key={repo.fullName}
              onClick={() => onSelect(repo)}
              className="w-full p-3 rounded-lg border border-theme-default bg-theme-surface hover:border-blue-500/50 text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-theme-primary">{repo.name}</span>
                {repo.private && (
                  <Badge variant="outline" className="text-xs">Private</Badge>
                )}
              </div>
              {repo.description && (
                <p className="text-sm text-theme-muted mt-1 truncate">{repo.description}</p>
              )}
            </button>
          ))
        )}
      </div>
      
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
```

### Integration with CloneForm

Update the `CloneForm` to include the repository browser:

```tsx
// In CloneForm component
const [showRepoPicker, setShowRepoPicker] = useState(false);
const { ghAuthStatus } = useRepo();

const handleRepoSelect = (repo: GitHubRepo) => {
  setFormData(prev => ({
    ...prev,
    remoteUrl: repo.cloneUrl || repo.url
  }));
  setShowRepoPicker(false);
};

// Add button near the URL input
{ghAuthStatus?.loggedIn && (
  <Button 
    type="button"
    variant="secondary" 
    onClick={() => setShowRepoPicker(true)}
    className="mt-2"
  >
    <Github size={16} />
    <span className="ml-2">Browse My Repositories</span>
  </Button>
)}

{showRepoPicker && (
  <GitHubRepoPicker 
    onSelect={handleRepoSelect}
    onCancel={() => setShowRepoPicker(false)}
  />
)}
```

---

## Phase 6: Publish to GitHub Feature

**Effort:** 3-4 hours  
**New component:** `components/common/PublishToGitHubModal.tsx`

### Feature: Publish Local Repo to GitHub

Add a "Publish to GitHub" action for local-only repositories.

### Implementation

```tsx
// components/common/PublishToGitHubModal.tsx
interface PublishToGitHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  repoPath: string;
  suggestedName: string;
}

function PublishToGitHubModal({ 
  isOpen, 
  onClose, 
  repoPath, 
  suggestedName 
}: PublishToGitHubModalProps): JSX.Element {
  const [name, setName] = useState(suggestedName);
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePublish = async () => {
    setError(null);
    setIsPublishing(true);
    try {
      const result = await GitHubService.RepoCreateFromLocal(
        repoPath,
        name,
        description,
        isPrivate
      );
      
      if (result.success) {
        toast.success(`Repository published to GitHub!`);
        onClose();
      } else {
        setError(result.error || 'Failed to publish');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsPublishing(false);
    }
  };

  // Modal UI with form fields...
}
```

### Add to RepositoryPanel or TopBar

```tsx
// Check if repo has no remote
const { remotes } = useRepo();
const hasNoRemote = !remotes || remotes.length === 0;

{hasNoRemote && ghAuthStatus?.loggedIn && (
  <Button 
    variant="secondary"
    onClick={() => setShowPublishModal(true)}
  >
    <Github size={16} />
    Publish to GitHub
  </Button>
)}
```

---

## Phase 7: Repository Browser

**Effort:** 4-5 hours (optional, can defer)  
**New view:** Repository exploration

### Feature Description

A new view that lets users:
- Browse their GitHub repositories
- See repo details (stars, forks, language)
- Quick-clone with one click
- Search and filter

This is optional for initial release but improves the user experience significantly.

---

## Testing Checklist

### Phase 1: Bindings
- [ ] Bindings regenerated without errors
- [ ] TypeScript types match Go structs
- [ ] Import statements work in components

### Phase 2: State Management
- [ ] `ghInstalled` detects CLI correctly
- [ ] `ghAuthStatus` loads on app start
- [ ] State updates after login/logout

### Phase 3: AccountsSettings
- [ ] "CLI not installed" message shows correctly
- [ ] Connect button opens browser
- [ ] Login completes and shows username
- [ ] Disconnect button logs out
- [ ] Error messages display properly

### Phase 4: ProfilePage
- [ ] Shows connected account with username
- [ ] Shows "Not connected" when logged out
- [ ] Loading state displays during check

### Phase 5: Clone Integration
- [ ] Repository picker loads repos
- [ ] Search/filter works
- [ ] Selecting repo populates URL field
- [ ] Clone completes successfully

### Phase 6: Publish Feature
- [ ] Publish modal opens for local repos
- [ ] Creates GitHub repo with correct settings
- [ ] Pushes code after creation
- [ ] Shows success/error messages

---

## Error Handling Strategy

### User-Friendly Error Messages

| Backend Error | User-Facing Message |
|---------------|---------------------|
| `gh: command not found` | "GitHub CLI is not installed. Please install it from https://cli.github.com" |
| `not logged in to GitHub` | "You need to connect your GitHub account first" |
| `authentication failed` | "GitHub authentication failed. Please try again." |
| `name already exists` | "A repository with this name already exists in your account" |
| `permission denied` | "You don't have permission to access this repository" |
| Network errors | "Unable to connect to GitHub. Check your internet connection." |

### Error Display Pattern

```tsx
// Use toast for transient errors
toast.error("Clone failed: " + result.error);

// Use inline error for form validation
{error && (
  <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
    {error}
  </div>
)}
```

---

## Implementation Timeline

| Phase | Effort | Priority | Dependencies |
|-------|--------|----------|--------------|
| Phase 1: Bindings | 5 min | P0 | None |
| Phase 2: State | 2 hours | P0 | Phase 1 |
| Phase 3: AccountsSettings | 3 hours | P0 | Phase 2 |
| Phase 4: ProfilePage | 1 hour | P1 | Phase 2 |
| Phase 5: Clone Integration | 4 hours | P1 | Phase 2 |
| Phase 6: Publish Feature | 4 hours | P2 | Phase 2 |
| Phase 7: Repo Browser | 5 hours | P3 | Phase 2 |

**Total estimated effort:** 19-20 hours

---

## File Summary

### New Files to Create

| File | Purpose |
|------|---------|
| `context/GitHubContext.tsx` | (Optional) Dedicated GitHub state |
| `components/common/GitHubRepoPicker.tsx` | Repository browser/selector |
| `components/common/PublishToGitHubModal.tsx` | Publish local repo modal |

### Files to Modify

| File | Changes |
|------|---------|
| `context/RepoContext.tsx` | Add GitHub state and actions |
| `context/RepoContext.types.ts` | Add GitHub type definitions |
| `components/layout/pages/settings/AccountsSettings.tsx` | Implement connect/disconnect |
| `components/layout/pages/ProfilePage.tsx` | Show real connection status |
| `components/layout/pages/explorer/GitInitForm.tsx` | Add repo browser integration |
| `components/layout/bottom-panels/RepositoryPanel.tsx` | Add publish button (optional) |

---

## Notes

1. **Browser Auth Flow:** The `gh auth login --web` command opens a browser. The Wails app will wait for the command to complete. Consider showing a loading state with "Waiting for browser authentication..."

2. **Token Storage:** The `gh` CLI handles token storage securely. We don't need to store tokens ourselves.

3. **Offline Behavior:** Always check `ghInstalled` before attempting operations. Show appropriate messaging when CLI is not available.

4. **Rate Limiting:** GitHub has API rate limits. The `gh` CLI handles this, but consider caching repo lists for a few minutes.

5. **Organization Repos:** The `RepoListForOrg` method exists but is not included in the initial phases. Can add an org selector later.
