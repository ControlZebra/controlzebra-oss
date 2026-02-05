# Multi-Viewer Architecture Implementation Plan

> **Status**: Ready for Implementation  
> **Last Updated**: February 2026  
> **Goal**: Refactor file viewing to use a plugin-ready registry pattern that supports lazy loading, error boundaries, and future external extensions.

---

## Executive Summary

This document outlines the step-by-step plan to convert the existing single-viewer architecture (`FileContentViewer`) into a flexible, registry-based multi-viewer system. The new architecture will support:

- **Built-in viewers**: Text, Image, Unsupported fallback (Phase 1)
- **Lazy loading**: Heavy viewers (PDF, etc.) load on-demand
- **Error boundaries**: Viewer crashes don't break the app
- **Future extensions**: Inactive endpoint for external add-ons

---

## Current State Analysis

### What Exists Today

| Component | Location | Purpose |
|-----------|----------|---------|
| `FileContentViewer` | `components/common/FileContentViewer.tsx` | Displays text files with line numbers |
| `ExplorerPage` | `components/layout/pages/explorer/ExplorerPage.tsx` | Renders tabs, switches between file browser and file viewer |
| `ExplorerTabsBar` | `components/common/ExplorerTabsBar.tsx` | Tab UI with icons based on `tab.type` |
| `isTextFile()` | `constants/index.ts` | Checks if file extension is viewable |
| `ExplorerTab` interface | `constants/index.ts` | Tab data with `type: 'file-browser' \| 'file'` |
| `openExplorerTab()` | `context/LayoutContext.tsx` | Opens a file in a new tab |

### Current Flow

```
SimpleFileBrowser.handlePreview(file)
  → isTextFile(file.name) check
  → Create ExplorerTab { type: 'file' }
  → openExplorerTab(tab)
  → ExplorerPage renders FileContentViewer
```

### Built-in Viewers (Current)

| Viewer | Status | Notes |
|--------|--------|-------|
| Text/Code | ✅ Exists | `FileContentViewer.tsx` - 110 lines |
| Image | ❌ Missing | Opens in external app |
| Unsupported | ❌ Missing | Shows toast only |

---

## Target Architecture

### File Structure (After Implementation)

```
frontend/src/
├── lib/
│   ├── viewers.ts              # Core registry (types + functions)
│   └── viewers-builtin.ts      # Built-in viewer registrations
├── components/
│   └── viewers/                # NEW: Viewer components directory
│       ├── index.ts            # ViewerRenderer + exports
│       ├── ViewerErrorBoundary.tsx
│       ├── TextViewer.tsx      # Renamed FileContentViewer
│       ├── ImageViewer.tsx     # NEW
│       └── UnsupportedViewer.tsx # NEW
```

### New Flow

```
SimpleFileBrowser.handlePreview(file)
  → getViewerForFile(file.name) 
  → Create ExplorerTab { type: 'file', viewerId: viewer.id }
  → openExplorerTab(tab)
  → ExplorerPage uses ViewerRenderer
  → ViewerRenderer wraps in Suspense + ErrorBoundary
  → Viewer component renders
```

---

## Step-by-Step Implementation Plan

### Step 1: Create Core Viewer Registry (`lib/viewers.ts`)

**File**: `frontend/src/lib/viewers.ts`  
**Effort**: Low  
**Dependencies**: None

Create the core registry module with types and functions:

```typescript
// Types: ViewerProps, ViewerConfig
// Registry: viewers array (internal)
// Functions: registerViewer(), getViewerForFile(), getViewerById(), getAllViewers()
// Helpers: extMatch(), magicMatch(), anyMatch()
```

**Key Implementation Details**:
- `ViewerConfig.component` supports both eager and lazy-loaded components via `ComponentType | LazyExoticComponent`
- `canHandle(fileName, contentPeek?)` allows advanced matching beyond extensions
- Viewers sorted by priority (highest first) on registration
- `getAllViewers()` returns readonly copy for settings/debug UI

**Acceptance Criteria**:
- [ ] Types exported for use in other modules
- [ ] `registerViewer()` adds and sorts viewers correctly
- [ ] `getViewerForFile()` returns first matching viewer
- [ ] Helper functions work correctly

---

### Step 2: Create Error Boundary Component

**File**: `frontend/src/components/viewers/ViewerErrorBoundary.tsx`  
**Effort**: Low  
**Dependencies**: Step 1 (uses ICON_SIZES from constants)

Create a React class component that catches errors from viewer components:

**Features**:
- Catches JavaScript errors in viewer components
- Shows friendly error message with file path
- "Try Again" button to reset error state
- Logs errors to console for debugging

**Acceptance Criteria**:
- [ ] Catches errors without crashing entire app
- [ ] Retry button clears error state
- [ ] Error message is user-friendly
- [ ] Console logs error details

---

### Step 3: Create ViewerRenderer Component

**File**: `frontend/src/components/viewers/index.ts`  
**Effort**: Low  
**Dependencies**: Step 1, Step 2

Create the main viewer rendering component that wraps viewers with:
- `<Suspense>` for lazy-loaded components
- `<ViewerErrorBoundary>` for crash protection
- Loading spinner fallback

**Exports**:
- `ViewerRenderer` - main component
- `ViewerErrorBoundary` - for custom use
- Re-export `ViewerProps` type from lib/viewers

**Acceptance Criteria**:
- [ ] Shows loading spinner for lazy components
- [ ] Error boundary wraps viewer content
- [ ] Memoized for performance

---

### Step 4: Migrate FileContentViewer to TextViewer

**Files**: 
- Move `frontend/src/components/common/FileContentViewer.tsx` → `frontend/src/components/viewers/TextViewer.tsx`
- Update exports in `components/common/index.ts`

**Effort**: Low  
**Dependencies**: Step 1 (uses ViewerProps type)

**Changes**:
1. Rename file and component
2. Update props interface to use `ViewerProps` from lib/viewers
3. Update any internal imports

**Acceptance Criteria**:
- [ ] Component works identically to before
- [ ] Uses `ViewerProps` interface
- [ ] Old import paths still work (via re-export if needed)

---

### Step 5: Create ImageViewer Component

**File**: `frontend/src/components/viewers/ImageViewer.tsx`  
**Effort**: Low  
**Dependencies**: Step 1

Create a simple image viewer that:
- Loads local images via `file://` protocol
- Shows loading/error states
- Centers image with max-width/height constraints
- Handles load errors gracefully

**Note**: May need Wails backend support to serve local files securely. Test with actual file paths.

**Acceptance Criteria**:
- [ ] Displays images correctly
- [ ] Shows error state for failed loads
- [ ] Images scale appropriately
- [ ] Works with various image formats

---

### Step 6: Create UnsupportedViewer Component

**File**: `frontend/src/components/viewers/UnsupportedViewer.tsx`  
**Effort**: Low  
**Dependencies**: Step 1

Create fallback viewer shown when no viewer matches:
- Shows file icon and "Preview not available" message
- Displays filename
- Clean, non-alarming design

**Acceptance Criteria**:
- [ ] Displays file name
- [ ] Shows appropriate icon
- [ ] Message is clear and helpful

---

### Step 7: Create Built-in Viewer Registrations

**File**: `frontend/src/lib/viewers-builtin.ts`  
**Effort**: Low  
**Dependencies**: Steps 1, 4, 5, 6

Register all built-in viewers:

1. **Text Viewer** (priority: 0, eager load)
   - Extensions: js, jsx, ts, tsx, json, yaml, yml, go, py, etc.
   - Also: dotfiles, files without extensions

2. **Image Viewer** (priority: 0, eager load)
   - Extensions: png, jpg, jpeg, gif, webp, bmp, ico, svg

3. **Unsupported Viewer** (priority: -1000, eager load)
   - Matches everything (fallback)

**Commented placeholder for future**:
- PDF Viewer (lazy loaded, magic byte detection)

**Acceptance Criteria**:
- [ ] All viewers registered in correct order
- [ ] Text viewer matches expected extensions
- [ ] Image viewer matches image extensions
- [ ] Unsupported catches everything else

---

### Step 8: Update ExplorerTab Interface

**File**: `frontend/src/constants/index.ts`  
**Effort**: Low  
**Dependencies**: None

Add `viewerId` field to `ExplorerTab` interface:

```typescript
export interface ExplorerTab {
  id: string;
  title: string;
  type: 'file-browser' | 'file';
  filePath?: string;
  isPinned?: boolean;
  viewerId?: string;  // NEW: Explicit viewer selection
}
```

**Note**: Keep existing `type` field for backward compatibility with file-browser tab logic.

**Acceptance Criteria**:
- [ ] Interface updated with optional viewerId
- [ ] Existing tabs still work
- [ ] TypeScript compiles without errors

---

### Step 9: Update ExplorerPage to Use ViewerRenderer

**File**: `frontend/src/components/layout/pages/explorer/ExplorerPage.tsx`  
**Effort**: Low  
**Dependencies**: Steps 3, 7

Update `renderContent()` function:

1. Import `getViewerForFile`, `getViewerById` from `lib/viewers`
2. Import `ViewerRenderer` from `components/viewers`
3. Replace direct `<FileContentViewer>` usage with `<ViewerRenderer>`
4. Use `activeTab.viewerId` or auto-detect from filename

**Before**:
```tsx
if (activeTab.filePath) {
  return <FileContentViewer filePath={activeTab.filePath} />;
}
```

**After**:
```tsx
const viewer = activeTab.viewerId 
  ? getViewerById(activeTab.viewerId)
  : getViewerForFile(activeTab.title);

if (viewer) {
  return <ViewerRenderer viewer={viewer} filePath={activeTab.filePath} />;
}
```

**Acceptance Criteria**:
- [ ] Text files still open correctly
- [ ] ViewerRenderer wraps content
- [ ] Error boundary catches crashes
- [ ] Loading state shows for lazy viewers

---

### Step 10: Update SimpleFileBrowser File Opening

**File**: `frontend/src/components/common/SimpleFileBrowser.tsx`  
**Effort**: Low  
**Dependencies**: Steps 7, 8

Update `handlePreview()` function:

1. Import `getViewerForFile` from `lib/viewers`
2. Replace `isTextFile()` check with `getViewerForFile()`
3. Add `viewerId` to created tab
4. Update condition for showing toast

**Before**:
```tsx
if (isTextFile(file.name)) {
  const tab: ExplorerTab = { ... type: 'file' ... };
  openExplorerTab(tab);
} else {
  toast.info('Preview not available');
}
```

**After**:
```tsx
const viewer = getViewerForFile(file.name);
if (viewer && viewer.id !== 'unsupported') {
  const tab: ExplorerTab = { ...type: 'file', viewerId: viewer.id };
  openExplorerTab(tab);
} else {
  toast.info('Preview not available');
}
```

**Acceptance Criteria**:
- [ ] Files with registered viewers open in tabs
- [ ] Unsupported files show toast
- [ ] Images now open in tabs (new behavior!)

---

### Step 11: Initialize Viewers on App Start

**File**: `frontend/src/main.tsx`  
**Effort**: Low  
**Dependencies**: Step 7

Import viewers-builtin.ts to trigger registration:

```tsx
// At top of main.tsx, before ReactDOM.render
import './lib/viewers-builtin';
```

**Why**: The import runs the registration code as a side effect, populating the viewer registry before any components render.

**Acceptance Criteria**:
- [ ] Viewers registered before app renders
- [ ] No runtime errors on startup
- [ ] `getAllViewers()` returns registered viewers

---

### Step 12: Update ExplorerTabsBar Icons (Optional Enhancement)

**File**: `frontend/src/components/common/ExplorerTabsBar.tsx`  
**Effort**: Low  
**Dependencies**: Steps 7, 8

Update tab icons to use viewer-specific icons:

1. Import `getViewerById` from `lib/viewers`
2. Look up viewer by `tab.viewerId` if available
3. Use `viewer.icon` if defined, fallback to current logic

**Acceptance Criteria**:
- [ ] Text files show FileText icon
- [ ] Image files show Image icon
- [ ] Fallback works for tabs without viewerId

---

### Step 13: Cleanup Legacy Code

**Files**: `frontend/src/constants/index.ts`, `frontend/src/components/common/index.ts`  
**Effort**: Low  
**Dependencies**: All previous steps complete and tested

1. Mark `isTextFile()` as deprecated (or remove if confident)
2. Mark `TEXT_FILE_EXTENSIONS` as deprecated
3. Remove or update re-export of FileContentViewer
4. Clean up any unused imports

**Acceptance Criteria**:
- [ ] No console warnings about deprecated functions
- [ ] App works without legacy code paths
- [ ] Clean compile with no unused exports

---

## Implementation Summary

| Step | File(s) | Effort | Status |
|------|---------|--------|--------|
| 1 | `lib/viewers.ts` | Low | ⬜ |
| 2 | `viewers/ViewerErrorBoundary.tsx` | Low | ⬜ |
| 3 | `viewers/index.ts` | Low | ⬜ |
| 4 | `viewers/TextViewer.tsx` | Low | ⬜ |
| 5 | `viewers/ImageViewer.tsx` | Low | ⬜ |
| 6 | `viewers/UnsupportedViewer.tsx` | Low | ⬜ |
| 7 | `lib/viewers-builtin.ts` | Low | ⬜ |
| 8 | `constants/index.ts` | Low | ⬜ |
| 9 | `ExplorerPage.tsx` | Low | ⬜ |
| 10 | `SimpleFileBrowser.tsx` | Low | ⬜ |
| 11 | `main.tsx` | Low | ⬜ |
| 12 | `ExplorerTabsBar.tsx` (optional) | Low | ⬜ |
| 13 | Cleanup | Low | ⬜ |

**Total Estimated Effort**: ~3-4 hours

---

## Future Extensions (Not In Scope)

These are documented for future reference but **not implemented now**:

### External Plugin Support
```typescript
// Example: L5X Ladder Logic Viewer
import { registerViewer } from 'controlzebra/lib/viewers';

registerViewer({
  id: 'l5x-ladder',
  name: 'Ladder Logic Viewer',
  icon: Cpu,
  priority: 10,
  canHandle: (fileName) => fileName.toLowerCase().endsWith('.l5x'),
  component: lazy(() => import('./L5XViewer')),
});
```

### Additional Built-in Viewers
- **PDF Viewer**: `lazy(() => import('./PDFViewer'))` with pdf.js
- **Markdown Viewer**: Rendered markdown with syntax highlighting
- **SVG Viewer**: With zoom/pan controls

### Content Peek for Magic Byte Detection
```typescript
// In SimpleFileBrowser, fetch first 1KB for better detection
const peek = await ReadFileHeader(file.path, 1024);
const viewer = getViewerForFile(file.name, peek);
```

---

## Testing Checklist

After implementation, verify:

- [ ] **Text files**: .ts, .tsx, .json, .md open in TextViewer
- [ ] **Image files**: .png, .jpg, .svg open in ImageViewer
- [ ] **Unknown files**: .pdf, .docx show toast (no viewer crash)
- [ ] **Viewer crash**: Simulated error shows ErrorBoundary, retry works
- [ ] **Tab icons**: Correct icons for each file type
- [ ] **Performance**: No noticeable slowdown on file open
- [ ] **Hot reload**: Viewers work correctly after HMR

---

## Appendix: Code Templates

### Template: New Viewer Component

```typescript
// frontend/src/components/viewers/MyViewer.tsx
import { memo } from 'react';
import type { ViewerProps } from '../../lib/viewers';

function MyViewer({ filePath }: ViewerProps): JSX.Element {
  // Implementation here
  return <div>Viewing: {filePath}</div>;
}

export default memo(MyViewer);
```

### Template: Register New Viewer

```typescript
// In viewers-builtin.ts
import MyViewer from '../components/viewers/MyViewer';

registerViewer({
  id: 'my-viewer',
  name: 'My Viewer',
  icon: SomeIcon,
  priority: 0,
  canHandle: extMatch('ext1', 'ext2'),
  component: MyViewer,
});
```

