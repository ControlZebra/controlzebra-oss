# 3D Model Viewer — Implementation Plan

**Author:** Engineering  
**Date:** February 2026  
**Status:** Draft  
**Library:** [Online3DViewer](https://github.com/kovacsv/Online3DViewer) (npm: `online-3d-viewer` v0.18.0)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Supported Formats](#2-supported-formats)
3. [Architecture Summary](#3-architecture-summary)
4. [Part A: 3D Model Viewer (Single File)](#4-part-a-3d-model-viewer-single-file)
5. [Part B: 3D Diff Viewer (Side-by-Side + Overlay)](#5-part-b-3d-diff-viewer-side-by-side--overlay)
6. [File Inventory](#6-file-inventory)
7. [Testing Plan](#7-testing-plan)
8. [Risks & Mitigations](#8-risks--mitigations)
9. [Future Enhancements](#9-future-enhancements)

---

## 1. Overview

Industrial automation repos frequently contain 3D model files (STL exports from SolidWorks, STEP/IGES from CAD tools, OBJ/FBX from visualization pipelines). Currently these files hit the "Unsupported File" fallback viewer. This plan adds:

- **Part A**: A read-only 3D viewer that renders models inline when a user opens a 3D file.
- **Part B**: A diff viewer that compares two revisions of a 3D file using side-by-side and overlay modes.

We use the **Online3DViewer** library which is built on three.js and supports 18+ import formats out of the box. We install it as an npm package and use its `EmbeddedViewer` API programmatically — no iframes, no customization of UI chrome.

---

## 2. Supported Formats

These extensions will be registered with the viewer:

| Category | Extensions |
|----------|-----------|
| Mesh / Print | `stl`, `obj`, `3mf`, `ply`, `off`, `amf` |
| CAD / Engineering | `step`, `stp`, `iges`, `igs`, `brep`, `3dm`, `fcstd` |
| Scene / Exchange | `gltf`, `glb`, `fbx`, `dae`, `3ds`, `wrl` |
| BIM | `bim`, `ifc` |

> **Priority extensions for industrial automation:** `stl`, `step`, `stp`, `iges`, `igs`, `obj`, `3mf`, `gltf`, `glb`

---

## 3. Architecture Summary

The implementation follows the **exact same patterns** already established in the codebase:

```
┌─────────────────────────────────────────────────────────┐
│  viewers-builtin.ts  ←  registers Model3DViewer         │
│  (extMatch + lazy import)                               │
├─────────────────────────────────────────────────────────┤
│  Model3DViewer.tsx   ←  single-file viewer component    │
│  (uses OV.EmbeddedViewer, loads via ReadFileBase64)     │
├─────────────────────────────────────────────────────────┤
│  Model3DDiffViewer.tsx  ←  diff viewer component        │
│  (side-by-side + overlay modes, uses three.js access)   │
├─────────────────────────────────────────────────────────┤
│  DiffViewer.tsx  ←  wire up 3D diff for binary 3D files │
│  (like ImageDiffViewer / PDFDiffViewer)                 │
├─────────────────────────────────────────────────────────┤
│  Go backend  ←  ReadFileBase64 (already exists)         │
│  + GetFileAtRevisionBase64 (already exists)             │
└─────────────────────────────────────────────────────────┘
```

**Key principle:** Wails webviews cannot access `file://` URLs. All file content must go through the Go backend as base64. The Online3DViewer library's `LoadModelFromFileList(File[])` method accepts browser `File` objects, which we construct from the base64 data returned by the backend.

---

## 4. Part A: 3D Model Viewer (Single File)

### Step 1: Install the npm package

```bash
cd frontend
npm install online-3d-viewer
```

This installs the `online-3d-viewer` package (v0.18.0, ~5.4MB unpacked). It brings three.js as a dependency. Verify it doesn't conflict with any existing three.js dependency in the project.

### Step 2: Create `Model3DViewer.tsx`

**File:** `frontend/src/components/viewers/Model3DViewer.tsx`

This is the core viewer component. Follow the same pattern as `ImageViewer.tsx`:

```
Component Structure:
├── Imports (OV library, React hooks, Wails bindings)
├── Cache (Map<filePath, base64Data> to avoid re-fetches)
├── Model3DViewer function component
│   ├── State: isLoading, error, viewerRef
│   ├── Effect: Load file via ReadFileBase64
│   ├── Effect: Initialize OV.EmbeddedViewer on container div
│   ├── Effect: Resize observer for responsive sizing
│   ├── Effect: Cleanup (viewer.Destroy())
│   ├── Effect: Listen for 'files-changed' event to refresh
│   └── Render: container div + loading/error states
└── Export: memo(Model3DViewer)
```

#### 2a. Load file content from Go backend

```tsx
import { ReadFileBase64 } from '../../../bindings/controlzebra/services/filesystemservice';

// Fetch binary content as base64
const result = await ReadFileBase64(filePath);
if (!result.success) { setError(result.error); return; }

// Convert base64 to a browser File object (required by OV)
const binaryStr = atob(result.data);
const bytes = new Uint8Array(binaryStr.length);
for (let i = 0; i < binaryStr.length; i++) {
  bytes[i] = binaryStr.charCodeAt(i);
}
const fileName = filePath.split('/').pop() || 'model';
const file = new File([bytes], fileName);
```

#### 2b. Initialize the EmbeddedViewer

```tsx
import * as OV from 'online-3d-viewer';

// containerRef is a React ref to a div element
const viewer = new OV.EmbeddedViewer(containerRef.current, {
  backgroundColor: new OV.RGBAColor(30, 30, 30, 255),  // Match app dark theme
  defaultColor: new OV.RGBColor(180, 180, 180),
  onModelLoaded: () => setIsLoading(false),
  onModelLoadFailed: (err) => setError('Failed to load 3D model'),
});

viewer.LoadModelFromFileList([file]);
```

#### 2c. Handle cleanup and resizing

```tsx
// Cleanup on unmount or file change
useEffect(() => {
  return () => {
    if (viewerInstanceRef.current) {
      viewerInstanceRef.current.Destroy();
      viewerInstanceRef.current = null;
    }
  };
}, [filePath]);

// Resize observer
useEffect(() => {
  if (!containerRef.current) return;
  const ro = new ResizeObserver(() => {
    viewerInstanceRef.current?.Resize();
  });
  ro.observe(containerRef.current);
  return () => ro.disconnect();
}, []);
```

#### 2d. Handle file-change events (refresh on disk change)

Same pattern as `ImageViewer.tsx` — listen for `'files-changed'` event, invalidate cache, re-fetch.

#### 2e. Render

```tsx
return (
  <div className="h-full w-full relative">
    {isLoading && <LoadingSpinner />}
    {error && <ErrorDisplay message={error} />}
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: error ? 'none' : 'block' }}
    />
  </div>
);
```

### Step 3: Register the viewer in `viewers-builtin.ts`

**File:** `frontend/src/lib/viewers-builtin.ts`

Add a new registration block following the exact pattern of existing viewers:

```tsx
import { Box } from 'lucide-react';  // 3D box icon

// ============================================================================
// 3D Model Viewer
// Handles 3D model files (STL, OBJ, STEP, GLTF, etc.)
// ============================================================================

const MODEL_3D_EXTENSIONS = [
  // Mesh / Print
  'stl', 'obj', '3mf', 'ply', 'off', 'amf',
  // CAD / Engineering
  'step', 'stp', 'iges', 'igs', 'brep', '3dm', 'fcstd',
  // Scene / Exchange
  'gltf', 'glb', 'fbx', 'dae', '3ds', 'wrl',
  // BIM
  'bim', 'ifc',
];

registerViewer({
  id: 'model-3d',
  name: '3D Model Viewer',
  description: 'Displays 3D models with orbit, pan, and zoom',
  icon: Box,
  priority: 10,       // Higher than text viewer to claim .obj, etc.
  builtIn: true,
  canHandle: extMatch(MODEL_3D_EXTENSIONS),
  component: lazy(() => import('../components/viewers/Model3DViewer')),
});
```

> **Note on `.obj` conflict:** The text viewer currently claims `.obj` via `TEXT_EXTENSIONS`. Since the 3D viewer has `priority: 10` vs text viewer's `priority: 0`, the 3D viewer will win for `.obj` files. This is the correct behavior — OBJ files are 3D models, not text.

### Step 4: Test manually

1. Run `task dev`
2. Open a repository that contains `.stl`, `.obj`, or `.gltf` files
3. Click on a 3D file in the file explorer
4. Verify the model renders in the main area with orbit/zoom controls
5. Verify loading state shows while model is parsing
6. Verify error state shows for corrupted files
7. Switch between 3D files and other file types — verify cleanup

---

## 5. Part B: 3D Diff Viewer (Side-by-Side + Overlay)

### Overview

When a 3D model file has changes (shows in the Changes view or History view), we need to show what changed. Two comparison modes:

1. **Side-by-side:** Two independent 3D viewers, one showing the old revision, one showing the new. User can orbit each independently.
2. **Overlay:** A single 3D viewer where Model A (old) is rendered in **red at 50% opacity** and Model B (new) is rendered in **blue at 50% opacity**. Where geometry overlaps, it appears **purple**. This instantly highlights what was added, removed, or modified.

### Step 5: Create `model3d-utils.ts`

**File:** `frontend/src/components/viewers/model3d-utils.ts`

Shared utilities for both the single viewer and the diff viewer:

```tsx
/**
 * Convert base64 string to a browser File object.
 * Required because OV.EmbeddedViewer.LoadModelFromFileList expects File[].
 */
export function base64ToFile(base64Data: string, fileName: string): File {
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new File([bytes], fileName);
}

/**
 * Check if a file path is a 3D model file.
 */
export const MODEL_3D_EXTENSIONS = new Set([
  'stl', 'obj', '3mf', 'ply', 'off', 'amf',
  'step', 'stp', 'iges', 'igs', 'brep', '3dm', 'fcstd',
  'gltf', 'glb', 'fbx', 'dae', '3ds', 'wrl',
  'bim', 'ifc',
]);

export function is3DModelFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return MODEL_3D_EXTENSIONS.has(ext);
}

/**
 * Default EmbeddedViewer parameters for dark theme.
 */
export function getDefaultViewerParams() {
  // Import OV dynamically to keep this module light
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OV = require('online-3d-viewer');
  return {
    backgroundColor: new OV.RGBAColor(30, 30, 30, 255),
    defaultColor: new OV.RGBColor(180, 180, 180),
  };
}
```

### Step 6: Create `Model3DDiffViewer.tsx`

**File:** `frontend/src/components/viewers/Model3DDiffViewer.tsx`

Follow the pattern of `ImageDiffViewer.tsx` (same props interface, same cache pattern, same mode toggle toolbar).

```
Component Structure:
├── Types: Model3DDiffViewerProps (repoPath, filePath, commitHash, isWorkingTree)
├── DiffMode type: 'side-by-side' | 'overlay'
├── Cache: Map<cacheKey, { oldData, newData }>
├── Model3DDiffViewer function component
│   ├── State: mode, isLoading, error, oldData, newData
│   ├── Effect: Fetch old+new content
│   │   ├── Old: GetFileAtRevisionBase64(repoPath, filePath, commitHash+'~1') or HEAD
│   │   ├── New: GetFileAtRevisionBase64(repoPath, filePath, commitHash) or ReadFileBase64
│   │   └── Cache result
│   ├── Toolbar: Mode toggle (side-by-side / overlay)
│   ├── Render mode === 'side-by-side': <SideBySideView />
│   └── Render mode === 'overlay': <OverlayView />
└── Export: memo(Model3DDiffViewer)
```

#### 6a. Fetch old and new file content

```tsx
import { ReadFileBase64 } from '../../../bindings/controlzebra/services/filesystemservice';
import { GetFileAtRevisionBase64 } from '../../../bindings/controlzebra/services/gitservice';

// For commit diffs:
//   Old = parent commit version
//   New = this commit's version
// For working tree diffs:
//   Old = HEAD version
//   New = working tree (disk) version

let oldResult, newResult;

if (isWorkingTree) {
  oldResult = await GetFileAtRevisionBase64(repoPath, filePath, 'HEAD');
  newResult = await ReadFileBase64(fullFilePath);
} else {
  oldResult = await GetFileAtRevisionBase64(repoPath, filePath, commitHash + '~1');
  newResult = await GetFileAtRevisionBase64(repoPath, filePath, commitHash);
}
```

#### 6b. Side-by-Side View

Two independent `EmbeddedViewer` instances in a flex row:

```
┌──────────────────┬──────────────────┐
│    Before (Old)   │    After (New)    │
│                   │                   │
│  [OV.Embedded     │  [OV.Embedded     │
│   Viewer #1]      │   Viewer #2]      │
│                   │                   │
│  orbit/zoom       │  orbit/zoom       │
│  independently    │  independently    │
└──────────────────┴──────────────────┘
```

Each viewer is initialized the same way as Part A. No camera synchronization needed for v1 (keep it simple).

**Implementation:**

```tsx
function SideBySideView({ oldFile, newFile }: { oldFile: File | null; newFile: File | null }) {
  const oldContainerRef = useRef<HTMLDivElement>(null);
  const newContainerRef = useRef<HTMLDivElement>(null);
  const oldViewerRef = useRef<OV.EmbeddedViewer | null>(null);
  const newViewerRef = useRef<OV.EmbeddedViewer | null>(null);

  useEffect(() => {
    // Initialize old viewer
    if (oldContainerRef.current && oldFile) {
      oldViewerRef.current = new OV.EmbeddedViewer(oldContainerRef.current, {
        backgroundColor: new OV.RGBAColor(30, 30, 30, 255),
        defaultColor: new OV.RGBColor(180, 180, 180),
      });
      oldViewerRef.current.LoadModelFromFileList([oldFile]);
    }
    // Initialize new viewer
    if (newContainerRef.current && newFile) {
      newViewerRef.current = new OV.EmbeddedViewer(newContainerRef.current, {
        backgroundColor: new OV.RGBAColor(30, 30, 30, 255),
        defaultColor: new OV.RGBColor(180, 180, 180),
      });
      newViewerRef.current.LoadModelFromFileList([newFile]);
    }
    return () => {
      oldViewerRef.current?.Destroy();
      newViewerRef.current?.Destroy();
    };
  }, [oldFile, newFile]);

  return (
    <div className="flex-1 flex gap-1 min-h-0">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="text-xs text-center py-1 text-theme-muted">Before</div>
        <div ref={oldContainerRef} className="flex-1" />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="text-xs text-center py-1 text-theme-muted">After</div>
        <div ref={newContainerRef} className="flex-1" />
      </div>
    </div>
  );
}
```

#### 6c. Overlay View

This is the more interesting mode. A **single** `EmbeddedViewer` loads Model B (new) normally, then we use three.js access to:

1. Recolor Model B's meshes to **blue, 50% opacity**
2. Load Model A (old) as a separate `File`, parse it with OV, and add it to the scene as red, 50% opacity

**Approach — Use `AddExtraObject` for the overlay:**

```
Single OV.EmbeddedViewer
│
├── Main model (Model B / New) → recolored blue, 50% opacity
├── Extra object (Model A / Old) → recolored red, 50% opacity
│
└── Where geometry overlaps → appears purple (additive blending)
```

**Implementation outline:**

```tsx
function OverlayView({ oldFile, newFile }: { oldFile: File | null; newFile: File | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OV.EmbeddedViewer | null>(null);

  useEffect(() => {
    if (!containerRef.current || !newFile) return;

    const viewer = new OV.EmbeddedViewer(containerRef.current, {
      backgroundColor: new OV.RGBAColor(30, 30, 30, 255),
      defaultColor: new OV.RGBColor(180, 180, 180),
      onModelLoaded: () => {
        // Step 1: Recolor main model (new) to blue, 50% opacity
        const innerViewer = viewer.GetViewer();
        recolorMeshes(innerViewer, 0x4488ff, 0.5);

        // Step 2: Load old model and add as overlay
        if (oldFile) {
          loadAndOverlay(viewer, oldFile, 0xff4444, 0.5);
        }
      },
    });

    viewer.LoadModelFromFileList([newFile]);
    viewerRef.current = viewer;

    return () => {
      viewer.Destroy();
      viewerRef.current = null;
    };
  }, [oldFile, newFile]);

  return <div ref={containerRef} className="h-full w-full" />;
}
```

**Helper: Recolor all meshes in the current model:**

```tsx
function recolorMeshes(
  innerViewer: any, // OV.Viewer
  color: number,
  opacity: number,
): void {
  // Access three.js scene and traverse all meshes
  const scene = innerViewer.scene;
  scene.traverse((obj: any) => {
    if (obj.isMesh) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      obj.material = materials.map((mat: any) => {
        const newMat = mat.clone();
        newMat.color.set(color);
        newMat.opacity = opacity;
        newMat.transparent = true;
        newMat.depthWrite = false;  // Important for correct overlay blending
        newMat.needsUpdate = true;
        return newMat;
      });
    }
  });
  innerViewer.Render();
}
```

**Helper: Load second model and add as overlay:**

This is the trickiest part. We need to load the old model **without** a second `EmbeddedViewer` and inject it into the first viewer's scene. Two approaches:

**Approach A (Simpler — Recommended for v1):** Use a hidden off-screen `EmbeddedViewer` to load the old model, then steal its three.js root object and add it to the main viewer.

```tsx
async function loadAndOverlay(
  mainViewer: OV.EmbeddedViewer,
  oldFile: File,
  color: number,
  opacity: number,
): Promise<void> {
  // Create a temporary hidden container
  const tempDiv = document.createElement('div');
  tempDiv.style.width = '1px';
  tempDiv.style.height = '1px';
  tempDiv.style.position = 'absolute';
  tempDiv.style.left = '-9999px';
  document.body.appendChild(tempDiv);

  const tempViewer = new OV.EmbeddedViewer(tempDiv, {
    backgroundColor: new OV.RGBAColor(0, 0, 0, 0),
    defaultColor: new OV.RGBColor(180, 180, 180),
    onModelLoaded: () => {
      // Get the root three.js object from the temp viewer
      const tempInner = tempViewer.GetViewer();
      const rootObject = tempInner.mainModel.GetRootObject();

      // Deep clone it
      const clone = rootObject.clone(true);

      // Recolor to red, 50% opacity
      clone.traverse((obj: any) => {
        if (obj.isMesh) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          obj.material = materials.map((mat: any) => {
            const newMat = mat.clone();
            newMat.color.set(color);
            newMat.opacity = opacity;
            newMat.transparent = true;
            newMat.depthWrite = false;
            newMat.needsUpdate = true;
            return newMat;
          });
        }
      });

      // Add clone to main viewer's scene
      const mainInner = mainViewer.GetViewer();
      mainInner.AddExtraObject(clone);
      mainInner.Render();

      // Cleanup temp viewer
      tempViewer.Destroy();
      document.body.removeChild(tempDiv);
    },
    onModelLoadFailed: () => {
      tempViewer.Destroy();
      document.body.removeChild(tempDiv);
    },
  });

  tempViewer.LoadModelFromFileList([oldFile]);
}
```

> **Note:** `mainModel.GetRootObject()` returns the three.js `Object3D` root. The exact API path may vary — check `innerViewer.mainModel.mainModel.GetRootObject()` vs `innerViewer.mainModel.GetRootObject()` during implementation by logging the viewer object.

### Step 7: Wire up 3D diff in `DiffViewer.tsx`

**File:** `frontend/src/components/common/DiffViewer.tsx`

Add a condition for 3D model files, following the exact pattern of `ImageDiffViewer` and `PDFDiffViewer`:

```tsx
import { is3DModelFile } from '../viewers/model3d-utils';

const Model3DDiffViewer = lazy(() => import('../viewers/Model3DDiffViewer'));

// Inside the binary file handling section, add before the fallback:
if (repoPath && is3DModelFile(fileDiff.path)) {
  return (
    <div className="flex flex-col h-full">
      {showHeader && <DiffHeader fileDiff={fileDiff} />}
      <div className="flex-1 min-h-0">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full text-theme-secondary text-sm">
            Loading 3D diff viewer…
          </div>
        }>
          <Model3DDiffViewer
            repoPath={repoPath}
            filePath={fileDiff.path}
            commitHash={commitHash}
            isWorkingTree={!commitHash}
          />
        </Suspense>
      </div>
    </div>
  );
}
```

Also add `is3DModelFile` to `frontend/src/lib/file-utils.ts` (or import from `model3d-utils.ts`).

### Step 8: Wire up 3D diff in `HistoryPage.tsx` and `ExplorerPage.tsx`

Follow the same pattern as `ImageDiffViewer` in these pages. They already have lazy-loaded diff viewers for images — add the 3D case:

```tsx
const Model3DDiffViewer = lazy(() => import('../../viewers/Model3DDiffViewer'));

// In the file type detection logic:
if (is3DModelFile(selectedFile)) {
  return <Model3DDiffViewer repoPath={...} filePath={...} commitHash={...} />;
}
```

---

## 6. File Inventory

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/components/viewers/Model3DViewer.tsx` | Single-file 3D viewer component |
| `frontend/src/components/viewers/Model3DDiffViewer.tsx` | Diff viewer with side-by-side + overlay modes |
| `frontend/src/components/viewers/model3d-utils.ts` | Shared utilities (base64→File, extension set, theme params) |

### Modified Files

| File | Change |
|------|--------|
| `frontend/package.json` | Add `online-3d-viewer` dependency |
| `frontend/src/lib/viewers-builtin.ts` | Register `model-3d` viewer |
| `frontend/src/components/common/DiffViewer.tsx` | Add 3D model diff branch |
| `frontend/src/lib/file-utils.ts` | Add `is3DModelFile()` helper |
| `frontend/src/components/layout/pages/HistoryPage.tsx` | Wire up `Model3DDiffViewer` |
| `frontend/src/components/layout/pages/explorer/ExplorerPage.tsx` | Wire up `Model3DDiffViewer` |
| `frontend/src/components/viewers/index.tsx` | Export `Model3DViewer` (optional, for eager use) |

### No Backend Changes Required

All needed Go backend methods already exist:
- `FileSystemService.ReadFileBase64` — read file from disk as base64
- `GitService.GetFileAtRevisionBase64` — read file from git history as base64

---

## 7. Testing Plan

### Manual Testing Checklist

#### Part A: Single Viewer
- [ ] `.stl` file opens and renders correctly
- [ ] `.obj` file (with `.mtl`) opens correctly
- [ ] `.gltf` / `.glb` file opens correctly  
- [ ] `.step` / `.stp` file opens correctly
- [ ] Orbit (click + drag) works
- [ ] Zoom (scroll wheel) works
- [ ] Pan (right-click + drag or shift+click) works
- [ ] Loading spinner shows while model parses
- [ ] Error state shows for corrupted/empty files
- [ ] Switching between 3D and non-3D files doesn't crash
- [ ] Large models (>10MB) load within reasonable time
- [ ] Memory is freed when switching away (check browser DevTools)
- [ ] File changes on disk trigger viewer refresh

#### Part B: Diff Viewer
- [ ] Side-by-side mode shows two independent viewers
- [ ] Each viewer in side-by-side can be orbited independently
- [ ] Overlay mode shows red (old) + blue (new) models
- [ ] Overlapping geometry appears purple
- [ ] Mode toggle switches between side-by-side and overlay
- [ ] Working tree diffs work (modified file not yet committed)
- [ ] Commit history diffs work (comparing two commits)
- [ ] New file (added) shows only the new model
- [ ] Deleted file shows only the old model
- [ ] Loading state shows while both models are fetched

### Unit Tests

Add tests in `frontend/src/components/viewers/viewers.test.tsx`:
- `is3DModelFile()` returns true for all supported extensions
- `is3DModelFile()` returns false for non-3D files
- `base64ToFile()` correctly converts data
- Viewer registration test: `getViewerForFile('model.stl')` returns `model-3d` viewer

---

## 8. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Bundle size increase** — `online-3d-viewer` is ~5.4MB unpacked, plus three.js | Medium | Lazy-load the viewer component. Only loaded when user opens a 3D file. |
| **WebGL context limits** — browsers limit concurrent WebGL contexts (~8-16) | Medium | Side-by-side uses 2 contexts. Overlay uses only 1. Always call `Destroy()` on cleanup. Add error handling for WebGL context loss. |
| **Large models (>50MB)** — slow to base64-encode and transfer | Medium | Existing 50MB limit on `ReadFileBase64`. Show a warning for files >20MB. |
| **STEP/IGES parsing** — CAD formats need `occt-import-js` WASM | Low | Online3DViewer bundles this. May need to configure WASM file serving. Test with sample STEP files early. |
| **Overlay alignment** — old and new models may have different coordinate systems | Low | This is expected for most industrial use cases (same origin). Document that overlay works best when models share the same coordinate system. |
| **Memory leaks** — three.js/WebGL resources not freed | Medium | Always call `viewer.Destroy()` in useEffect cleanup. Test with browser DevTools memory profiler. |
| **three.js version conflict** | Low | Check if any existing dependency uses three.js. If so, ensure version compatibility. `online-3d-viewer` bundles its own three.js. |

---

## 9. Future Enhancements

These are **out of scope** for v1 but worth noting:

1. **Camera sync in side-by-side mode** — link orbit/zoom so both viewers move together
2. **Measurement tools** — distance, angle measurements on models  
3. **Exploded view** — separate assemblies for easier inspection
4. **Model metadata display** — vertex count, face count, bounding box, units
5. **Thumbnail generation** — render a thumbnail for 3D files in the file explorer
6. **Three-way overlay** — show added geometry (green), removed geometry (red), unchanged (gray)
7. **Wireframe toggle** — switch between solid/wireframe rendering
8. **Section plane** — clip the model to inspect internal geometry
9. **Export screenshot** — save current view as PNG

---

## Implementation Order

Recommended order for an engineer picking this up:

1. **Install `online-3d-viewer`** and verify it imports correctly (30 min)
2. **Create `model3d-utils.ts`** with `base64ToFile` and extension set (30 min)
3. **Create `Model3DViewer.tsx`** — get a basic STL rendering (2-3 hours)
4. **Register in `viewers-builtin.ts`** and test with various formats (1 hour)
5. **Create `Model3DDiffViewer.tsx` — side-by-side mode** (2-3 hours)
6. **Add overlay mode** to diff viewer (3-4 hours)
7. **Wire up in `DiffViewer.tsx`**, `HistoryPage.tsx`, `ExplorerPage.tsx` (1 hour)
8. **Test all supported formats**, fix edge cases (2-3 hours)
9. **Add `is3DModelFile` to `file-utils.ts`** and write unit tests (1 hour)

**Estimated total: 2-3 days for a single engineer.**
