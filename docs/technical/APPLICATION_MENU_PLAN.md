# Application Menu Implementation Plan

This document outlines the implementation plan for ControlZebra's application menu system using Wails 3.

## Target Audience

**Primary**: Windows users (industrial automation engineers)  
**Secondary**: macOS and Linux users

ControlZebra is a read-only Git client for viewing and managing version control—users do not edit file content within the app. Text input is limited to commit messages, branch names, and search fields.

## Current State

The current menu implementation in [main.go](../../main.go#L60-L95) includes:
- **AppMenu** (macOS only) - Standard app menu with About, Services, Hide, Quit
- **File Menu** - Open Folder, Close Folder, Exit (Windows/Linux)

## Proposed Menu Structure

### 1. Application Menu (macOS Only)
**Priority: ✅ COMPLETE**  
**Difficulty: N/A**

Already implemented via `menu.AddRole(application.AppMenu)`.

---

### 2. File Menu
**Priority: 🔴 HIGH**  
**Difficulty: Medium**

| Item | Accelerator | Action | Status |
|------|-------------|--------|--------|
| Open Folder... | `CmdOrCtrl+O` | `fileDialogService.OpenFolderDialog()` | ✅ Done |
| Open Recent | (submenu) | Load from `SettingsService.GetRecentFolders()` | 🔲 TODO |
| Separator | - | - | - |
| Reveal in Finder/Explorer | - | `fileSystemService.ShowInExplorer()` | 🔲 TODO |
| Open in External Terminal | - | `terminalService.OpenSystemTerminal()` | 🔲 TODO |
| Separator | - | - | - |
| Close Folder | `CmdOrCtrl+W` | Emit `folder-closed` | ✅ Done |
| Exit (Win/Linux) | `Alt+F4` | `app.Quit()` | ✅ Done |

**Implementation Notes:**
- **Open Recent**: Requires `SettingsService` method to track and return recent folders (max 5-10)
- **Reveal in Finder**: Need to emit event with current repo path; frontend can call `fileSystemService.ShowInExplorer(path)`
- **External Terminal**: `terminalService.OpenSystemTerminal()` may need implementation

**Backend Requirements:**
```go
// SettingsService additions needed:
func (s *SettingsService) GetRecentFolders() []string
func (s *SettingsService) AddRecentFolder(path string)

// FileSystemService additions needed:
func (s *FileSystemService) ShowInExplorer(path string) error

// TerminalService additions needed:
func (s *TerminalService) OpenSystemTerminal(path string) error
```

---

### 3. Edit Menu
**Priority: � LOW**  
**Difficulty: Easy**

| Item | Accelerator | Action | Status |
|------|-------------|--------|--------|
| Undo | `CmdOrCtrl+Z` | `Role: Undo` | 🔲 TODO |
| Redo | `CmdOrCtrl+Shift+Z` | `Role: Redo` | 🔲 TODO |
| Separator | - | - | - |
| Cut | `CmdOrCtrl+X` | `Role: Cut` | 🔲 TODO |
| Copy | `CmdOrCtrl+C` | `Role: Copy` | 🔲 TODO |
| Paste | `CmdOrCtrl+V` | `Role: Paste` | 🔲 TODO |
| Select All | `CmdOrCtrl+A` | `Role: SelectAll` | 🔲 TODO |

**Implementation Notes:**
- All items use Wails roles - minimal code required
- Useful for commit message input, branch names, and search fields
- Note: ControlZebra does not support editing file content—this is for UI text inputs only
- On Windows, these shortcuts typically work without explicit menu items; mainly needed for macOS

**Code Example:**
```go
editMenu := menu.AddSubmenu("Edit")
editMenu.AddRole(application.Undo)
editMenu.AddRole(application.Redo)
editMenu.AddSeparator()
editMenu.AddRole(application.Cut)
editMenu.AddRole(application.Copy)
editMenu.AddRole(application.Paste)
editMenu.AddRole(application.SelectAll)
```

---

### 4. View Menu
**Priority: 🟡 MEDIUM**  
**Difficulty: Medium**

| Item | Accelerator | Action | Status |
|------|-------------|--------|--------|
| Toggle Sidebar | `CmdOrCtrl+B` | Emit `view:toggle-sidebar` | 🔲 TODO |
| Toggle Terminal Panel | `CmdOrCtrl+J` | Emit `view:toggle-terminal` | 🔲 TODO |
| Separator | - | - | - |
| Zoom In | `CmdOrCtrl+Plus` | `Role: ZoomIn` | 🔲 TODO |
| Zoom Out | `CmdOrCtrl+Minus` | `Role: ZoomOut` | 🔲 TODO |
| Reset Zoom | `CmdOrCtrl+0` | `Role: ZoomReset` | 🔲 TODO |
| Separator | - | - | - |
| Toggle Full Screen | `F11` / `Ctrl+Cmd+F` | `Role: ToggleFullScreen` | 🔲 TODO |
| Separator (Dev Only) | - | - | - |
| Reload | `CmdOrCtrl+R` | `Role: Reload` | 🔲 TODO |
| Force Reload | `CmdOrCtrl+Shift+R` | `Role: ForceReload` | 🔲 TODO |
| Toggle Dev Tools | `F12` | `Role: ToggleDevTools` | 🔲 TODO |

**Implementation Notes:**
- Dev-only items should be conditionally added based on build flag
- Frontend needs event listeners for `view:toggle-sidebar` and `view:toggle-terminal`
- Add event listener in `LayoutContext` or `App.jsx`

**Frontend Event Handlers Required:**
```javascript
// In App.jsx or LayoutContext
useEffect(() => {
  const cleanup = [
    Events.On('view:toggle-sidebar', () => toggleSidebar()),
    Events.On('view:toggle-terminal', () => toggleBottomPanel()),
  ];
  return () => cleanup.forEach(fn => fn());
}, []);
```

---

### 5. Repository Menu (Core Git Workflows)
**Priority: 🔴 HIGH**  
**Difficulty: Medium**

| Item | Accelerator | Action | Status |
|------|-------------|--------|--------|
| Sync / Get Updates | `CmdOrCtrl+Down` | Emit `git:pull` | 🔲 TODO |
| Share / Upload | `CmdOrCtrl+Up` | Emit `git:push` | 🔲 TODO |
| Separator | - | - | - |
| Save Changes | `CmdOrCtrl+S` | Emit `view:focus-commit-panel` | 🔲 TODO |
| Separator | - | - | - |
| Switch Task... | - | Emit `view:open-branch-modal` | 🔲 TODO |
| Start New Task... | - | Emit `view:create-branch` | 🔲 TODO |
| Separator | - | - | - |
| Discard My Changes... | - | Emit `git:discard-all-confirm` | 🔲 TODO |
| Undo Last Save... | - | Emit `git:undo-last-save-confirm` | 🔲 TODO |

**Implementation Notes:**
- All items emit events; frontend handles state and confirmations
- `git:pull` and `git:push` should trigger the same handlers as TopBar buttons
- Confirmation dialogs for destructive actions handled by frontend

**Frontend Event Handlers Required:**
```javascript
// In RepoContext or App.jsx
Events.On('git:pull', () => handleSync());
Events.On('git:push', () => handlePush());
Events.On('view:focus-commit-panel', () => setActiveView(VIEWS.CHANGES));
Events.On('view:open-branch-modal', () => setShowBranchModal(true));
Events.On('view:create-branch', () => {
  setShowBranchModal(true);
  setBranchModalMode('create');
});
Events.On('git:discard-all-confirm', () => setShowDiscardDialog(true));
Events.On('git:undo-last-save-confirm', () => setShowUndoDialog(true));
```

---

### 6. LFS Menu (Industrial Features)
**Priority: 🟡 MEDIUM**  
**Difficulty: Easy**

| Item | Accelerator | Action | Status |
|------|-------------|--------|--------|
| Lock File... | - | Emit `lfs:lock-dialog` | 🔲 TODO |
| Unlock File... | - | Emit `lfs:unlock-dialog` | 🔲 TODO |
| Separator | - | - | - |
| Manage LFS Patterns... | - | Emit `view:open-lfs-settings` | 🔲 TODO |

**Implementation Notes:**
- These features depend on LFS being enabled for the repo
- Consider disabling menu items when LFS is not available (runtime menu update)
- Lock/Unlock dialogs need to be created in frontend

**Frontend Components Required:**
- `LFSLockDialog.jsx` - File picker + lock action
- `LFSUnlockDialog.jsx` - Show locked files + unlock action

---

### 7. Help Menu
**Priority: 🟢 LOW**  
**Difficulty: Easy**

| Item | Accelerator | Action | Status |
|------|-------------|--------|--------|
| Documentation | - | Open URL (docs link) | 🔲 TODO |
| Report Issue | - | Open URL (GitHub Issues) | 🔲 TODO |
| Separator | - | - | - |
| About ControlZebra | - | Show about dialog (Win/Linux) | 🔲 TODO |

**Implementation Notes:**
- Use `runtime.BrowserOpenURL()` equivalent in Wails 3
- About dialog on macOS is handled by AppMenu role

**Code Example:**
```go
helpMenu := menu.AddSubmenu("Help")
helpMenu.Add("Documentation").OnClick(func(ctx *application.Context) {
    // Open docs URL
})
helpMenu.Add("Report Issue").OnClick(func(ctx *application.Context) {
    // Open GitHub issues URL
})
if runtime.GOOS != "darwin" {
    helpMenu.AddSeparator()
    helpMenu.Add("About ControlZebra").OnClick(func(ctx *application.Context) {
        // Show about dialog or emit event
    })
}
```

---

## Implementation Priorities

### Phase 1: Critical (Sprint 1)
**Must have for core workflows**

1. **Repository Menu** (Medium) - Core value proposition; keyboard shortcuts for git operations
2. **File Menu enhancements** (Medium) - Open Recent is highly valuable for returning users

### Phase 2: Important (Sprint 2)
**Enhances user experience**

3. **View Menu** (Medium) - UI toggle shortcuts, zoom controls
4. **LFS Menu** (Easy) - Key differentiator for industrial users

### Phase 3: Nice to Have (Sprint 3)
**Polish**

5. **Edit Menu** (Easy) - Mainly for macOS users; Windows handles this natively
6. **Help Menu** (Easy) - Low effort, adds professionalism

---

## Difficulty Assessment

| Difficulty | Criteria | Examples |
|------------|----------|----------|
| **Easy** | Uses built-in Wails roles or simple event emission | Edit Menu, Help Menu |
| **Medium** | Requires new backend methods or frontend event handlers | File Menu (Open Recent), Repository Menu |
| **Hard** | Requires significant new UI components or complex state management | LFS dialogs (if not already built) |

---

## Technical Considerations

### 1. Event-Driven Architecture
All menu actions should emit events rather than calling services directly:

```go
// Good: Emit event, let frontend handle
menuItem.OnClick(func(ctx *application.Context) {
    app.Event.Emit("git:pull", "")
})

// Avoid: Direct service call bypasses frontend state
menuItem.OnClick(func(ctx *application.Context) {
    gitService.Pull(repoPath) // Don't do this
})
```

### 2. Event Registration
Register all custom events in `main.go`:

```go
func init() {
    // Existing events
    application.RegisterEvent[string]("time")
    application.RegisterEvent[string]("folder-selected")
    application.RegisterEvent[string]("folder-closed")
    
    // View events
    application.RegisterEvent[string]("view:toggle-sidebar")
    application.RegisterEvent[string]("view:toggle-terminal")
    application.RegisterEvent[string]("view:focus-commit-panel")
    application.RegisterEvent[string]("view:open-branch-modal")
    application.RegisterEvent[string]("view:create-branch")
    application.RegisterEvent[string]("view:open-lfs-settings")
    
    // Git events
    application.RegisterEvent[string]("git:pull")
    application.RegisterEvent[string]("git:push")
    application.RegisterEvent[string]("git:discard-all-confirm")
    application.RegisterEvent[string]("git:undo-last-save-confirm")
    
    // LFS events
    application.RegisterEvent[string]("lfs:lock-dialog")
    application.RegisterEvent[string]("lfs:unlock-dialog")
}
```

### 3. Development Build Detection
For dev-only menu items:

```go
// Option 1: Build tag
// +build dev

// Option 2: Check if running in dev mode (Wails 3 specific)
if app.IsDev() {
    viewMenu.AddSeparator()
    viewMenu.AddRole(application.Reload)
    viewMenu.AddRole(application.ForceReload)
    viewMenu.AddRole(application.ToggleDevTools)
}
```

### 4. Context-Aware Menu State
For future enhancement, disable items when no repo is open:

```go
// Store menu item references for runtime updates
var pushMenuItem *application.MenuItem

// On repo state change, update menu
func updateMenuState(hasRepo bool) {
    if pushMenuItem != nil {
        pushMenuItem.SetEnabled(hasRepo)
    }
}
```

---

## Frontend Integration Checklist

### Event Listeners to Add

Location: `frontend/src/App.jsx` or dedicated `useMenuEvents.js` hook

```javascript
import { Events } from '@controlzebra/runtime';

export function useMenuEvents() {
  const { 
    handleSync, handlePush, 
    setShowBranchModal, setShowDiscardDialog, setShowUndoDialog 
  } = useRepo();
  const { toggleSidebar, toggleBottomPanel, setActiveView } = useLayout();

  useEffect(() => {
    const cleanups = [
      // View events
      Events.On('view:toggle-sidebar', toggleSidebar),
      Events.On('view:toggle-terminal', toggleBottomPanel),
      Events.On('view:focus-commit-panel', () => setActiveView('changes')),
      Events.On('view:open-branch-modal', () => setShowBranchModal(true)),
      Events.On('view:create-branch', () => {
        setShowBranchModal(true);
        // Set to create mode
      }),
      Events.On('view:open-lfs-settings', () => setActiveView('settings')),
      
      // Git events
      Events.On('git:pull', handleSync),
      Events.On('git:push', handlePush),
      Events.On('git:discard-all-confirm', () => setShowDiscardDialog(true)),
      Events.On('git:undo-last-save-confirm', () => setShowUndoDialog(true)),
      
      // LFS events
      Events.On('lfs:lock-dialog', () => setShowLFSLockDialog(true)),
      Events.On('lfs:unlock-dialog', () => setShowLFSUnlockDialog(true)),
    ];

    return () => cleanups.forEach(cleanup => cleanup());
  }, [/* dependencies */]);
}
```

---

## Estimated Effort

| Phase | Items | Effort | Dependencies |
|-------|-------|--------|--------------|
| Phase 1 | Edit Menu, Repository Menu | 4-6 hours | Frontend event handlers |
| Phase 2 | View Menu, File Menu (Recent) | 6-8 hours | SettingsService methods, LayoutContext updates |
| Phase 3 | LFS Menu, Help Menu | 2-4 hours | LFS UI components |

**Total Estimate: 12-18 hours**

---

## Testing Checklist

- [ ] All keyboard shortcuts work on Windows (primary platform)
- [ ] All keyboard shortcuts work on macOS
- [ ] All keyboard shortcuts work on Linux
- [ ] Edit menu enables Cmd+C/V in text inputs on macOS
- [ ] Events are received and handled by frontend
- [ ] Open Recent shows correct folder list
- [ ] Dev-only items hidden in production build
- [ ] Menu items gracefully handle "no repo open" state
