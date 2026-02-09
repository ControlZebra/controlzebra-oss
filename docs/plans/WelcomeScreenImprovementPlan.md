
## Implementation Plan: Welcome Screen Redesign

**Status (2026-02-09):** Phases 1–9 are complete ✅

### Architecture Overview

The welcome screen replaces the current `NoDirectoryScreen` with a **4-category sidebar + main area** pattern (mirroring the existing Settings pattern). It activates whenever `!repoPath` and `activeView === VIEWS.EXPLORER`.

**Categories:**
1. **Recent Projects** — table with status icons
2. **New Project** — init form with local/remote config + progress stepper
3. **Clone Project** — clone from GitHub
4. **Open Folder** — simple folder picker (for existing repos)

```
┌──────────┬─────────────┬──────────────────────────────────┐
│ Activity │  Sidebar     │  Main Area                       │
│ Bar      │ (Welcome     │  (Page for selected category)    │
│          │  Categories) │                                  │
│ [🏠]     │ ▸ Recent    │  ┌──────────────────────────────┐ │
│ [🕐]     │   New       │  │  Recent Projects Table       │ │
│ [⎇]      │   Clone     │  │  or New Project Form         │ │
│ [⚙]      │   Open      │  │  or Clone Form               │ │
│          │             │  │  or Open Folder               │ │
└──────────┴─────────────┴──┴──────────────────────────────┘ │
```

---

### Phase 1 — Constants & State Foundation ✅ Complete

#### 1.1 Add `WELCOME_CATEGORIES` to constants/index.ts

```ts
export const WELCOME_CATEGORIES: SettingsCategory[] = [
  { id: 'recent-projects', name: 'Recent Projects', description: 'Resume where you left off' },
  { id: 'new-project',     name: 'New Project',     description: 'Initialize a new repository' },
  { id: 'clone-project',   name: 'Clone Project',   description: 'Clone from GitHub' },
  { id: 'open-folder',     name: 'Open Folder',     description: 'Open an existing project folder' },
];
```

Reuse the existing `SettingsCategory` type — same shape (id, name, description).

#### 1.2 Add welcome state to LayoutContext

In LayoutContext, add:
- `selectedWelcomeCategory` state (default: `'recent-projects'`)
- `setSelectedWelcomeCategory` setter
- Expose both in the context value

Follow the exact pattern of `selectedSettingsCategory` / `setSelectedSettingsCategory`.

---

### Phase 2 — Sidebar: WelcomeView ✅ Complete

#### 2.1 Create `WelcomeView.tsx`

**Location:** `frontend/src/components/layout/views/WelcomeView.tsx`

**Pattern:** Clone the structure of SettingsView.tsx.

- Import `WELCOME_CATEGORIES` from constants
- Read `selectedWelcomeCategory` / `setSelectedWelcomeCategory` from LayoutContext
- Render each category as a `WelcomeItem` (same markup as `SettingsItem`):
  - Active state: `bg-blue-600/30 border-l-2 border-blue-500`
  - Hover: `hover-bg-theme-interactive border-l-2 border-transparent`
- Add a lucide icon per category:
  - Recent → `Clock`
  - New → `FolderPlus`
  - Clone → `GitBranch` or `Download`
  - Open → `FolderOpen`

#### 2.2 Wire into Sidebar conditionally

In Sidebar.tsx:

The `VIEW_CONFIG` currently maps `VIEWS.EXPLORER → ExplorerView`. Modify this so that when `activeView === VIEWS.EXPLORER && !repoPath`, the sidebar renders `WelcomeView` instead of `ExplorerView`.

**Approach:** Inside the Sidebar render, after resolving the component from `VIEW_CONFIG`, add a conditional override:

```tsx
const isWelcomeMode = activeView === VIEWS.EXPLORER && !repoPath;
const EffectiveComponent = isWelcomeMode ? WelcomeView : config.Component;
const effectiveTitle = isWelcomeMode ? 'Welcome' : config.title;
```

This avoids polluting `VIEW_CONFIG` or adding a new view type — the welcome screen is a **mode** of the explorer view, not a separate view.

#### 2.3 Remove `noFolder` panel from ExplorerView

In ExplorerView.tsx, the `panelState.type === 'noFolder'` branch currently renders "No folder open" + "Open Folder" button (ExplorerView.tsx). Remove this block — when there's no folder open, the sidebar shows `WelcomeView` (from 2.2), so this code is unreachable.

---

### Phase 3 — Main Area: Conditional Welcome Pages ✅ Complete

#### 3.1 Modify ExplorerPage routing

In ExplorerPage.tsx, the current logic:
- `!repoPath` → `<NoDirectoryScreen />`
- else → file browser

Replace the `!repoPath` branch with a **welcome category router**:

```tsx
if (!repoPath) {
  switch (selectedWelcomeCategory) {
    case 'recent-projects': return <RecentProjectsPage />;
    case 'new-project':     return <NewProjectPage />;
    case 'clone-project':   return <CloneProjectPage />;
    case 'open-folder':     return <OpenFolderPage />;
    default:                return <RecentProjectsPage />;
  }
}
```

Read `selectedWelcomeCategory` from `useLayout()`.

---

### Phase 4 — Recent Projects Page ✅ Complete

#### 4.1 Create `RecentProjectsPage.tsx`

**Location:** `frontend/src/components/layout/pages/welcome/RecentProjectsPage.tsx`

**Layout:** Centered, `max-w-3xl mx-auto p-8` (slightly wider than settings for the table).

**Header:** Clock icon + "Recent Projects" title + subtitle.

**Table columns:**

| Column | Content | Width |
|--------|---------|-------|
| Status Icon | Lucide icon based on folder state | 32px |
| Project Name | Folder name (bold) | flex |
| Path | Full path (muted, truncated) | flex |
| Last Opened | Relative time ("2 hours ago") | 120px |
| Actions | X button to remove | 40px |

**Status icons (lucide):**
- `GitBranch` (green) — Git repo with remote
- `HardDrive` (yellow) — Git repo, local only (no remote)
- `Folder` (gray) — Plain folder, not a git repo

**Data source:** Merge frontend localStorage (`getRecentFolders()` → 5 items) with backend (`GetRecentFolders()` → 10 items). Deduplicate, prefer backend ordering (it has more entries). For each path, call `DetectRepo(path)` + `GetRemoteURL(path)` to determine status icon. Cache results — don't re-check on every render.

**Row click:** Calls `openRepo(path)`.

**Empty state:** "No recent projects. Start by creating a new project or opening a folder."

**Footer actions:** "Clear All" link to clear recent history (both localStorage + backend).

---

### Phase 5 — New Project Page (Core Form) ✅ Complete

#### 5.1 Create `NewProjectPage.tsx`

**Location:** `frontend/src/components/layout/pages/welcome/NewProjectPage.tsx`

**Layout:** `max-w-2xl mx-auto p-8`, same card/section style as SettingsPage.tsx.

**State machine:** The form has three modes based on folder detection:

```
User picks path
    ├─ Path is empty/no selection → show form normally
    ├─ Path is NOT a git repo → show full form (Local + Remote + Create Project)
    └─ Path IS a git repo → show "Already a project" state
         └─ "Open Project" button instead of "Create Project"
```

#### 5.2 Section: Local Settings

**Fields:**
- **Project File Path** — Read-only text input + "Browse" button
  - Browse calls `OpenFolderDialog()` (existing binding)
  - On path selection, run validation (Phase 5.5)

#### 5.3 Section: Remote Settings

**Conditional rendering based on detection results:**

**State A — Remote already exists:**
- Both fields disabled, pre-populated from parsed `GetRemoteURL()` output
- Parse URL to extract host (github.com) + repo name (owner/repo)
- Info banner (blue): `ℹ️ Remote already configured: github.com/owner/repo`

**State B — No remote, user hasn't skipped:**

| Field | Type | Details |
|-------|------|---------|
| Skip Remote | Toggle/Checkbox | "Local only (skip cloud backup)" — when checked, collapses everything below |
| GitHub Account | Button / Status | "Connect GitHub Account" → triggers `GitHubDeviceFlowModal`. After auth, shows ✅ username |
| Organization | Select dropdown | Personal account (default) + orgs from `ListUserOrganizations()`. Disabled until logged in. |
| Repository Name | Text input | Auto-suggested from folder name (Phase 5.4). Disabled until logged in. Validated on blur (Phase 6). |
| Visibility | Toggle | Private (default) / Public radio buttons |

**State C — User toggled "Skip Remote":**
- Show muted text: "You can publish to GitHub later from the project's settings."
- Hide GitHub login, org, repo name, visibility fields

#### 5.4 Auto-suggest Repository Name

When user selects a folder path, derive a suggested repo name:

```ts
function suggestRepoName(folderPath: string): string {
  // Handle both Unix and Windows paths
  const normalized = folderPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const folderName = segments[segments.length - 1] || '';
  
  // Sanitize: lowercase, replace spaces/special chars with hyphens
  return folderName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100); // GitHub max
}
```

Put this in a shared utility (`frontend/src/lib/pathUtils.ts`) since it'll be useful elsewhere.

#### 5.5 Folder Path Validation

On path selection, run these checks sequentially and display results inline:

| Check | Icon | Message |
|-------|------|---------|
| Folder is empty | `CheckCircle` (green) | "Empty folder — ready for a new project" |
| Has files, no .git | `FileText` (blue) | "42 files found — will be included in initial commit" |
| Already a git repo | `GitBranch` (yellow) | **Switch to "Already a project" mode** (see 5.1) |
| Inside another git repo | `AlertTriangle` (orange) | "This folder is inside another git repository. This may cause issues." |
| Path doesn't exist | `AlertCircle` (red) | "Folder not found" |

**Implementation:** Call `DetectRepo(path)` + count files via `ListDirectory(path)` (existing `FileSystemService` binding). For nested-repo check, call `DetectRepo` and compare the returned repo root with the selected path — if they differ, it's nested.

#### 5.6 "Already a Git Project" Mode

When detection finds an existing repo:
- Replace the entire form with a simplified card:
  - Show folder name + path
  - Show branch name, commit count, remote URL (if any)
  - Large "Open Project" button (theme blue) → calls `openRepo(path)`
- This replaces "Create Project" button entirely

---

### Phase 6 — Backend: New Methods ✅ Complete

#### 6.1 `CheckRepoNameExists` in github_service.go

```go
type RepoNameCheckResult struct {
    Exists bool   `json:"exists"`
    Error  string `json:"error,omitempty"`
}

func (g *GitHubService) CheckRepoNameExists(owner string, name string) RepoNameCheckResult {
    // Uses: gh repo view owner/name --json name
    // If exit code 0 → exists
    // If "Could not resolve" error → doesn't exist
    // Other errors → propagate
}
```

**Frontend usage:** Call on blur of repo name field with 300ms debounce. Show inline status:
- ✅ "Name available"
- ❌ "Repository already exists"  
- ⏳ Spinner while checking

#### 6.2 Add `LocalOnlyMode` field to per-repo settings

In repository_settings_service.go, add to the `RepositorySettings` struct:

```go
LocalOnlyMode bool `json:"localOnlyMode,omitempty"`
```

Currently, per-repo settings are stored in `~/.config/control-zebra/repositories/{hash}.json`. Per your feedback, we should **also** store a marker in the repo itself.

#### 6.3 Per-repo hidden config folder (`.controlzebra/`)

Create a new pattern: when a project is initialized via the New Project flow, create a `.controlzebra/` directory in the repo root containing:

```
.controlzebra/
  config.json    ← { "localOnlyMode": true/false, "createdAt": "...", "createdBy": "..." }
```

**Backend addition:** Add methods to `RepositorySettingsService`:
- `ReadRepoLocalConfig(repoPath string) → RepoLocalConfig`
- `WriteRepoLocalConfig(repoPath string, config RepoLocalConfig) → OperationResult`

Also add `.controlzebra/` to the auto-generated .gitignore? **No** — this should be committed so collaborators see the settings. But `localOnlyMode` is personal, so split: `.controlzebra/config.json` (committed, shared settings) vs `.controlzebra/local.json` (added to .gitignore, personal prefs like `localOnlyMode`).

---

### Phase 7 — Clone Project Page ✅ Complete

#### 7.1 Create `CloneProjectPage.tsx`

**Location:** `frontend/src/components/layout/pages/welcome/CloneProjectPage.tsx`

**Layout:** `max-w-2xl mx-auto p-8`

**Fields:**

| Field | Type | Details |
|-------|------|---------|
| GitHub Account | Button / Status | Same auth pattern as New Project. Required for browse. |
| Repository | Searchable dropdown | Lists user's repos via `RepoList()` + org repos via `RepoListForOrg()`. Grouped by owner. |
| -or- Manual URL | Text input | Paste a `https://github.com/...` or `git@github.com:...` URL |
| Destination Folder | Read-only input + Browse | Where to clone to. Default: user's home or last-used parent folder. |

**"Clone Project" button** (theme blue):
1. Validate selection + destination
2. Call existing `RepoClone(repoFullName, destPath)` from RepoContext (`cloneGitHubRepo`)
3. On success, auto-open via `openRepo(cloneDir)` (already implemented in the existing clone callback)
4. Show progress stepper (Phase 8)

**Reuse:** The existing ProfilePage.tsx already has a clone-from-list UI. Extract the repo-list + search logic into a shared component or hook (`useGitHubRepoList`).

---

### Phase 8 — Open Folder Page ✅ Complete

#### 8.1 Create `OpenFolderPage.tsx`

**Location:** `frontend/src/components/layout/pages/welcome/OpenFolderPage.tsx`

**Layout:** `max-w-lg mx-auto p-8`, centered, minimal.

**Content:**
- `FolderOpen` icon (large, centered)
- "Open an existing project folder"
- "Browse" button → `OpenFolderDialog()` → `openRepo(path)`
- Keyboard hint: `⌘O` / `Ctrl+O`
- This is essentially the current `NoDirectoryScreen` stripped down (no recent folders, since those are in their own category now)

---

### Phase 9 — Progress Stepper ✅ Complete

#### 9.1 Create `ProjectCreationStepper.tsx`

**Location:** `frontend/src/components/common/ProjectCreationStepper.tsx`

**Pattern:** A horizontal stepper component shown at the bottom of `NewProjectPage` (and optionally `CloneProjectPage`) during creation.

**Steps for New Project:**

| # | Label | Backend Call |
|---|-------|-------------|
| 1 | Initializing | `InitRepoWithLFS()` + `TrackPattern()` (presets) + `EnsureIdentity()` |
| 2 | Saving Changes | `CommitAll(path, "Initial commit")` |
| 3 | Publishing | `RepoCreateFromLocal()` — skipped if local-only |
| 4 | Done | Auto-open via `openRepo()` |

**Steps for Clone:**

| # | Label | Backend Call |
|---|-------|-------------|
| 1 | Cloning | `RepoClone()` |
| 2 | Done | Auto-open via `openRepo()` |

**Visual design:**
```
  ● Initializing ──── ● Saving Changes ──── ○ Publishing ──── ○ Done
  ✓ completed          ⟳ in progress         ○ pending         ○ pending
```

- Completed: green `CheckCircle` icon
- In progress: blue `Loader2` icon (spinning)
- Pending: gray `Circle` icon
- Failed: red `XCircle` icon + error message below

**Props:**
```ts
interface StepperProps {
  steps: { id: string; label: string }[];
  currentStep: number; // 0-indexed
  status: 'idle' | 'running' | 'success' | 'error';
  error?: string;
}
```

The parent (`NewProjectPage`) orchestrates the actual async calls and advances `currentStep`.

---

### Phase 10 — "Create Project" Orchestration in RepoContext

#### 10.1 Add `createProject()` method to RepoContext

This is a new method that combines `startTracking` + `publishToGitHub` into one orchestrated flow with step callbacks:

```ts
interface CreateProjectOptions {
  path: string;
  remote: {
    skip: boolean;
    owner?: string;
    repoName?: string;
    isPrivate?: boolean;
  };
  onStepChange?: (step: number) => void;
}

const createProject = useCallback(async (options: CreateProjectOptions): Promise<boolean> => {
  const { path, remote, onStepChange } = options;
  
  try {
    // Step 0: Initialize
    onStepChange?.(0);
    
    // Check if already a git repo (shouldn't be — form prevents this)
    const info = await DetectRepo(path);
    if (!info.isRepo) {
      await InitRepoWithLFS(path);
      const presetPatterns = await GetPresetPatterns();
      for (const preset of presetPatterns) {
        await TrackPattern(path, preset.pattern);
      }
      await EnsureIdentity(path, userName || '', userEmail || '');
    }
    
    // Create .controlzebra/ config
    await WriteRepoLocalConfig(path, { localOnlyMode: remote.skip });
    
    // Step 1: Commit
    onStepChange?.(1);
    await CommitAll(path, 'Initial commit');
    
    // Step 2: Publish (if not skipped)
    if (!remote.skip && remote.repoName) {
      onStepChange?.(2);
      const result = await RepoCreateFromLocal(
        path, remote.repoName, '', remote.isPrivate ?? true, remote.owner || ''
      );
      if (!result.success) throw new Error(result.error);
    }
    
    // Step 3: Done — open the project
    onStepChange?.(3);
    await openRepo(path);
    
    return true;
  } catch (err) { ... }
}, [userName, userEmail, openRepo, showMessage]);
```

Expose `createProject` from `useRepo()`.

---

### Phase 11 — Cleanup & Integration

| # | Task | File |
|---|------|------|
| 11.1 | Delete NoDirectoryScreen.tsx — fully replaced by new welcome pages | NoDirectoryScreen.tsx |
| 11.2 | Update the barrel export in index.ts — remove `NoDirectoryScreen` | index.ts |
| 11.3 | Add new barrel export index.ts for all four welcome pages | New file |
| 11.4 | Export `WelcomeView` from `views/` barrel | Existing barrel file |
| 11.5 | Regenerate Wails bindings after Go changes (`task common:generate:bindings`) | N/A |
| 11.6 | Keep `File > Open Folder` menu + `⌘O` shortcut working (no changes to main.go) | No change |
| 11.7 | Keep `File > Open Recent` submenu working (no changes needed) | No change |
| 11.8 | Add `.controlzebra/local.json` to auto-generated .gitignore in `startTracking`/`createProject` | RepoContext |

---

### Phase 12 — Unified Project Setup UX (Remove 4-Step Sidebar Flow)

**Goal:** Remove the old 4-step creation process from the sidebar while preserving start tracking and GitHub publishing as clear, unified actions.

#### 12.1 Define explicit project states + user-facing copy

Create a single source of truth for project state (derived from `DetectRepo`, `Status`, and `GetRemotes`):

1. **Empty Folder, Not Tracked** — “This folder is empty and not tracked. Start a new project?”
2. **Has Files, Not Tracked** — “Files found but not tracked by Git. Enable version control?”
3. **Tracked, No Remote** — “Version control enabled. Publish to GitHub for backup?”
4. **Tracked + Remote** — “Project is synced with GitHub.”
5. **Created via Welcome Flow** — “Project created successfully.” (Shown immediately after create)

This messaging replaces step-based language and focuses on the current state only.

#### 12.2 Create a “Project Setup” panel component (main area)

- Renders a **status banner** + **single action row** with context-aware CTAs.
- Eliminates any sidebar stepper/step list UI.
- Actions:
  - **Not tracked** → “Enable Version Control” (uses `createProject` with local-only toggle).
  - **Tracked, no remote** → “Publish to GitHub” (uses `publishToGitHub`).
  - **Tracked + remote** → “Sync Now” or “Manage Remote”.

#### 12.3 Inline “Setup Options” instead of steps

When user clicks “Enable Version Control,” reveal a lightweight inline section (no navigation):
- Project name (auto-suggested)
- Local-only toggle (skip remote)
- GitHub account + visibility (only if remote enabled)

#### 12.4 Unify entry points (New Project + Open Folder)

- Opening a folder (via menu or welcome page) lands in the same **Project Setup** panel if not tracked.
- Creating a project should simply open the folder and land in **Project Setup** with the success banner.

#### 12.5 Remove old 4-step sidebar artifacts

- Delete or hide the sidebar step list UI.
- Update any help text or analytics events that refer to “Step 1/4”.

---

### Phase 13 — UX Consistency & Telemetry

#### 13.1 Status indicators in explorer/status bar

- Always show “Tracked / Not tracked / Remote connected” in status bar.
- If untracked, show a soft nudge link: “Enable version control”.

#### 13.2 Analytics + messaging alignment

- Replace step-based tracking with state-based tracking:
  - `project_setup_started` (state)
  - `project_setup_completed`
  - `project_publish_attempted`
  - `project_publish_failed`

---

### Phase 14 — QA & Edge Cases

- Empty folder → enable tracking → local-only
- Folder with files → enable tracking → publish
- Existing git repo without remote → publish only
- Existing git repo with remote → no setup needed
- Nested repo warning (should not show setup CTA)

---

### File Change Summary

| Action | File | Description |
|--------|------|-------------|
| **Modify** | index.ts | Add `WELCOME_CATEGORIES` |
| **Modify** | `frontend/src/context/LayoutContext.jsx` | Add `selectedWelcomeCategory` state |
| **Create** | `frontend/src/components/layout/views/WelcomeView.tsx` | Sidebar category list |
| **Modify** | Sidebar.tsx | Conditional WelcomeView when !repoPath |
| **Modify** | ExplorerView.tsx | Remove noFolder panel |
| **Modify** | ExplorerPage.tsx | Welcome category router |
| **Create** | `frontend/src/components/layout/pages/welcome/RecentProjectsPage.tsx` | Recent projects table |
| **Create** | `frontend/src/components/layout/pages/welcome/NewProjectPage.tsx` | New project form |
| **Create** | `frontend/src/components/layout/pages/welcome/CloneProjectPage.tsx` | Clone project form |
| **Create** | `frontend/src/components/layout/pages/welcome/OpenFolderPage.tsx` | Simple open folder |
| **Create** | index.ts | Barrel export |
| **Create** | `frontend/src/components/common/ProjectCreationStepper.tsx` | Progress stepper |
| **Create** | `frontend/src/lib/pathUtils.ts` | `suggestRepoName()` + path helpers |
| **Modify** | `frontend/src/context/RepoContext.jsx` | Add `createProject()` method |
| **Delete** | NoDirectoryScreen.tsx | Replaced |
| **Modify** | index.ts | Remove NoDirectoryScreen export |
| **Modify** | github_service.go | Add `CheckRepoNameExists()` |
| **Modify** | repository_settings_service.go | Add `.controlzebra/` config read/write + `LocalOnlyMode` field |

---

### Implementation Order (Dependency Graph)

```
Phase 1–9 (Welcome Screen Core)              ← completed ✅
  ↓
Phase 10 (createProject in RepoContext)      ← depends on Phase 6 + 9
  ↓
Phase 11 (Cleanup)                           ← last for v1 plan
  ↓
Phase 12 (Unified Project Setup UX)          ← depends on Phase 10 + Welcome pages
  ↓
Phase 13 (UX Consistency & Telemetry)        ← depends on Phase 12
  ↓
Phase 14 (QA & Edge Cases)                   ← after Phase 12–13
```

**Estimated effort:** ~3–5 days for a senior developer. Phase 12 is the primary UX refactor; Phase 13–14 are polish + QA.

