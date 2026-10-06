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
| `L5XLayoutDiffViewer` | L5X/L5K files | 1 |

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

## L5X Pretty and Raw modes

The L5X registry entries load `L5XFileViewer` and `L5XDiffViewer`. Both use
`L5XModeViewer` to own the shared header and Pretty / Raw selection. The mode is
local to the open tab and starts at Pretty on each mount. The structured viewer
stays mounted while Raw is shown so its routine, navigator, and sheet selections
survive switching modes. Raw content is loaded only when selected.

File Raw mode uses `TextViewer`. Parsed L5X controllers use a `l5x:` cache key
prefix to keep them separate from raw text cached by file path. Both views refresh
when the working file changes.

Diff Raw mode uses the existing `TextDiffViewer` unified display and Git text
conversion behavior. Request adapters retain `textDiffSource` separately from
the file sides so additions and deletions still identify the intended working,
commit, or ref comparison. Before displaying a raw L5X diff, the shared text-side
loaders check that both present sides can be read within the text viewer limit.
Working and revision text reads share the 10 MB backend limit, including resolved
LFS content. The wrapper owns diff reload actions and working-file subscriptions.

The mode controls sit outside the content error boundaries, making Raw accessible
even when structured parsing or rendering fails.

## L5X metadata inspectors

The file viewer's Project Organizer adds a searchable Metadata list for
controllers, programs, tasks, AOI definitions, datatypes, and modules. It uses
the pinned package's public navigator for existing content views and an
app-owned selection list for metadata. The comparison organizer is unchanged.

`metadata-model.ts` maps normalized fields and resolvable references into
property groups. `MetadataInspector.tsx` renders those groups with shared
table and button primitives and central theme tokens. Missing values display
as "Not supplied". Zero and false remain values, program UIDs stay strings,
dates display in ISO UTC, and task and scan-time units are not inferred.
Member declarations, task schedules, ports, and connections retain source
order. The entity list shows at most 25 entries per page, and inspectors show
at most 50 fields per page.

Metadata tabs use source program UIDs when available and entity names
otherwise. Routine links retain owner and routine names rather than depending
on array positions. Reloads resolve each selection against the current
controller. Removed entities show a missing-entity state with Raw access.
Existing dedicated tag, datatype, module, AOI interface, and routine views
remain available.

## Read-only text surface

`TextViewer` owns backend reads, the existing 10 MB size limit, caching and the
working-file subscription. It lazily loads `CodeMirrorTextViewer` when text is
needed, including L5X Raw. The adapter in `components/text/read-only-editor.ts`
owns editor creation, plain-text configuration, updates and disposal. Text diffs
continue to use their existing renderer.

The editor renders a viewport plus a buffer, shows line numbers, and leaves
wrapping off. It uses app theme variables and observes its container through
CodeMirror's normal layout lifecycle. Read-only state, a non-editable focusable
content surface and a transaction filter prevent document edits. Selection and
copy use the complete editor document, including offscreen text and original
line endings. No formatting, syntax language, replacement or save commands are
configured.

Find uses CodeMirror's full-document query and next/previous commands. Ctrl+F
(Cmd+F on macOS) opens Find; Ctrl+G / Shift+Ctrl+G (Cmd on macOS) and F3 / Shift+F3
navigate matches. Enter / Shift+Enter also navigate from the Find field. Go to
Line uses Ctrl+Alt+G (Cmd+Option+G on macOS), accepts a one-based integer within
the document, and scrolls that line into view. Escape closes the active control
and returns focus to the text. Shortcuts stay inside the viewer.

Watcher refreshes retain the editor during loading, update the changed text in
place, retain selection offsets and the scroll anchor, and clamp positions when
the document shrinks. Closing or switching away from Raw disposes the editor;
reopening uses the existing content cache and a fresh editor. L5X mode selection
continues to reset to Pretty when its tab is reopened.

### Desktop validation

Automated tests cover reads, empty/error states, refresh without remounting,
selection clamping, read-only commands and input events, complete-document copy,
Find, Go to Line, shortcut scope and disposal. jsdom geometry shims are only for
behavioral tests; they do not establish desktop layout or performance.

For desktop acceptance, compare the preceding table renderer and CodeMirror in
the actual Wails WebView using a representative L5X file, a many-line file just
under 10 MB and a long-line file. Record file bytes/lines/longest line, machine,
OS, WebView and build versions. Measure cold open, cached reopen, Pretty/Raw
switching, scrolling and external refresh. Record rendered line counts and long
tasks; if the runtime lacks Long Tasks API support, state that limitation rather
than treating animation-frame gaps as equivalent measurements. Verify horizontal
scrolling, resize, light/dark themes, focus, selection/copy across offscreen lines,
refresh position preservation and size-limit errors. Repeat keyboard and clipboard
checks on Windows/WebView2 before treating platform acceptance as complete.

## Adding a New Viewer

See [Adding a New Viewer](../guides/Adding%20a%20New%20Viewer.md) for the step-by-step guide.

---

**Related:** [Frontend Architecture](Frontend%20Architecture.md) | [Layout System](Layout%20System.md) | [Adding a New Viewer](../guides/Adding%20a%20New%20Viewer.md)
