# Viewer System

> Pluggable file viewer and diff viewer registry in `frontend/src/viewers/`.

## Overview

The viewer system is a registry-based architecture for opening files and displaying diffs in the main content area. Viewers are registered at startup, and the registry finds the best viewer for a given file based on extension matching and priority.

## Architecture

```
viewers/
├── registry/
│   ├── viewer-registry.ts      # File viewer registry (registerViewer, getViewerForFile)
│   ├── diff-registry.ts        # Diff viewer registry
│   ├── builtins.ts             # Built-in file viewer registrations
│   ├── diff-builtins.tsx       # Built-in diff viewer registrations
│   └── viewer-cache.ts         # Content caching
│
└── components/
    ├── file/                   # File viewer components
    │   ├── TextViewer.tsx
    │   ├── ImageViewer.tsx
    │   ├── PDFViewer.tsx       # Lazy loaded
    │   ├── Model3DViewer.tsx   # Lazy loaded
    │   ├── L5XViewer.tsx       # Lazy loaded
    │   └── UnsupportedViewer.tsx
    │
    ├── diff/                   # Diff viewer components
    │   ├── TextDiffViewer.tsx
    │   ├── ImageDiffViewer.tsx
    │   ├── PDFDiffViewer.tsx
    │   ├── Model3DDiffViewer.tsx
    │   └── l5x-layout-diff/    # L5X layout diff sub-components
    │
    └── shared/                 # Shared utilities
        ├── ViewerRenderer.tsx   # Renders correct viewer for a file
        ├── ViewerHeader.tsx     # Standard viewer header bar
        ├── ViewerErrorBoundary.tsx
        └── DiffRenderer.tsx     # Renders correct diff viewer
```

## ViewerConfig Interface

```tsx
interface ViewerConfig {
    id: string                    // Unique identifier
    name: string                  // Display name
    description?: string
    icon?: LucideIcon            // lucide-react icon
    
    component: ComponentType<ViewerProps> | LazyExoticComponent<ComponentType<ViewerProps>>
    
    canHandle: (fileName: string, contentPeek?: Uint8Array) => boolean
    
    priority?: number            // Higher = checked first; default 0
    builtIn?: boolean           // Cannot unregister if true
    managesOwnHeader?: boolean   // If true, viewer renders its own header
}
```

## Built-in File Viewers

| Viewer | Extensions | Priority | Lazy? |
|--------|-----------|----------|-------|
| `TextViewer` | `.ts`, `.tsx`, `.go`, `.json`, `.md`, `.txt`, `.xml`, `.yml`, `.css`, etc. | 0 | No |
| `ImageViewer` | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.svg` | 0 | No |
| `PDFViewer` | `.pdf` | 0 | Yes |
| `Model3DViewer` | `.stl`, `.obj`, `.step`, `.stp`, `.3mf`, `.iges`, `.fbx`, `.blend` | 0 | Yes |
| `L5XViewer` | `.L5X`, `.L5K` | 1 | Yes |
| `UnsupportedViewer` | Fallback (matches everything) | -1 | No |

## Built-in Diff Viewers

| Viewer | Extensions | Priority |
|--------|-----------|----------|
| `TextDiffViewer` | Text files (same as TextViewer) | 0 |
| `ImageDiffViewer` | Image files (png, jpg, etc.) | 0 |
| `PDFDiffViewer` | PDF | 0 |
| `Model3DDiffViewer` | 3D model files | 0 |
| `L5XDiffViewer` | L5X/L5K files | 1 |

## Registry API

### File Viewers

```tsx
import { registerViewer, getViewerForFile, unregisterViewer } from './registry/viewer-registry';

// Register
registerViewer({
    id: 'my-viewer',
    name: 'My Custom Viewer',
    component: MyViewerComponent,
    canHandle: (fileName) => fileName.endsWith('.custom'),
    priority: 5,
});

// Lookup
const viewer = getViewerForFile('project.custom');
// Returns ViewerConfig with highest priority whose canHandle() returns true

// Unregister (only non-builtIn)
unregisterViewer('my-viewer');
```

### Diff Viewers

Same pattern via `diff-registry.ts`:
```tsx
import { registerDiffViewer, getDiffViewerForFile } from './registry/diff-registry';
```

## ViewerProps

```tsx
interface ViewerProps {
    filePath: string          // Absolute path to file
    contentPeek?: Uint8Array  // First N bytes (for magic number detection)
}

interface DiffViewerProps {
    filePath: string
    diffContext: DiffContext   // Refs, hunks, unified diff text
}
```

## Registration Timing

Viewers are registered in `main.tsx` **before** the app renders:

```tsx
// main.tsx
import '../viewers/registry/builtins';      // File viewers
import '../viewers/registry/diff-builtins'; // Diff viewers

ReactDOM.createRoot(rootElement).render(<App />);
```

## Adding a New Viewer

See [[Adding a New Viewer]] for the step-by-step guide.

---

**Related:** [[Frontend Architecture]] | [[Layout System]] | [[Adding a New Viewer]]
