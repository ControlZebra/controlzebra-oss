# How to Create a New File Viewer

> **Audience**: Developers adding new file type support to ControlZebra  
> **Last Updated**: February 2026  
> **Prerequisites**: Familiarity with React, TypeScript, and the ControlZebra frontend codebase

---

## Overview

ControlZebra uses a **registry-based multi-viewer architecture**. Each file type (text, image, PDF, etc.) has a dedicated viewer component. When a user opens a file, the registry finds the best matching viewer and renders it.

### Key Concepts

| Concept | What It Does |
|---------|-------------|
| **Viewer** | A React component that renders a specific file type |
| **Registry** | A sorted list of viewers; the first one whose `canHandle()` returns `true` is used |
| **Priority** | Higher-priority viewers are checked first (e.g., L5X viewer at priority 10 beats text viewer at 0 for `.l5x` files) |
| **Lazy Loading** | Heavy viewers load on-demand to keep initial bundle small |

### Architecture Diagram

```
User opens file
      │
      ▼
getViewerForFile(fileName)     ← Registry lookup (lib/viewers.ts)
      │
      ▼
ViewerRenderer                 ← Suspense + ErrorBoundary wrapper (components/viewers/index.tsx)
      │
      ▼
YourViewer component           ← Your viewer renders here
```

### File Structure

```
frontend/src/
├── lib/
│   ├── viewers.ts              # Core registry: types, register/query functions, helpers
│   ├── viewers-builtin.ts      # All built-in viewer registrations (import order matters)
│   └── viewer-cache.ts         # Shared caching utilities for viewer content
├── components/
│   └── viewers/
│       ├── index.tsx            # ViewerRenderer + exports
│       ├── ViewerErrorBoundary.tsx
│       ├── ViewerHeader.tsx     # Common header with "Open in Default App"
│       ├── TextViewer.tsx       # Reference: simple viewer
│       ├── ImageViewer.tsx      # Reference: viewer with backend data loading
│       ├── PDFViewer.tsx        # Reference: lazy-loaded viewer with toolbar
│       ├── UnsupportedViewer.tsx # Fallback viewer
│       └── L5XViewer.tsx        # Reference: complex viewer with own header
```

---

## Step-by-Step Guide

### Step 1: Create Your Viewer Component

Create a new file in `frontend/src/components/viewers/`. Follow this template:

```tsx
// frontend/src/components/viewers/MyViewer.tsx

/**
 * MyViewer - Displays .xyz files.
 *
 * Features:
 * - [List what your viewer does]
 * - Loading and error states
 */
import { memo, useState, useMemo, useEffect, useRef } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import type { ViewerProps } from '../../lib/viewers';

// If you need to load file content from the Go backend:
import { ReadFileBase64 } from '../../../bindings/controlzebra/services/filesystemservice';
// or for text files:
// import { ReadTextFile } from '../../../bindings/controlzebra/services/filesystemservice';

function MyViewer({ filePath }: ViewerProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MyDataType | null>(null);

  const fileName = useMemo(() => filePath.split('/').pop() || filePath, [filePath]);

  // Load file content
  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const result = await ReadFileBase64(filePath);
        if (!mounted) return;
        if (!result.success) {
          setError(result.error || 'Failed to load file');
          setIsLoading(false);
          return;
        }
        // Process your data here
        setData(/* processed data */);
        setIsLoading(false);
      } catch (err) {
        if (!mounted) return;
        setError(`Failed to read file: ${err?.message || err}`);
        setIsLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [filePath]);

  // --- Error state ---
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-theme-secondary gap-3">
        <AlertCircle size={ICON_SIZES.lg} className="text-red-400" />
        <div className="text-center max-w-md">
          <p className="text-theme-primary font-medium mb-1">Cannot display file</p>
          <p className="text-sm">{error}</p>
          <p className="text-xs text-theme-muted mt-2">{fileName}</p>
        </div>
      </div>
    );
  }

  // --- Loading state ---
  if (isLoading || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 size={ICON_SIZES.lg} className="animate-spin text-theme-secondary" />
        <span className="text-sm text-theme-muted">Loading {fileName}…</span>
      </div>
    );
  }

  // --- Loaded – render your content ---
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Your viewer content here */}
    </div>
  );
}

export default memo(MyViewer);
```

#### Rules to Follow

1. **Always accept `ViewerProps`** — every viewer receives `{ filePath, contentPeek? }`.
2. **Always wrap with `memo()`** — prevents unnecessary re-renders.
3. **Always handle loading, error, and loaded states** — the three states pattern is consistent across all viewers.
4. **Use `ICON_SIZES` from constants** — keeps icon sizing consistent.
5. **Use `lucide-react` icons** — the project standard icon library.
6. **Use Tailwind theme classes** (`text-theme-primary`, `bg-theme-surface`, etc.) — not hardcoded colors.
7. **Load files via Go backend** — Wails webviews cannot access `file://` URLs. Use `ReadFileBase64` for binary files or `ReadTextFile` for text files.
8. **Clean up effects** — use a mounted flag or abort controller to prevent state updates after unmount.

#### Optional: Add Caching

If your viewer's data is expensive to load, add a simple cache (see `ImageViewer.tsx` or `PDFViewer.tsx` for examples):

```tsx
const myCache = new Map<string, MyDataType>();

// In your effect:
if (myCache.has(filePath)) {
  setData(myCache.get(filePath)!);
  setIsLoading(false);
  return;
}

// After successful load:
myCache.set(filePath, processedData);
```

Alternatively, use the shared `useCachedContent` hook from `lib/viewer-cache.ts` (see `TextViewer.tsx` for an example).

---

### Step 2: Register Your Viewer

Open `frontend/src/lib/viewers-builtin.ts` and add a registration block.

#### For Small/Simple Viewers (Eager Loading)

Import the component directly:

```tsx
import MyViewer from '../components/viewers/MyViewer';

registerViewer({
  id: 'my-viewer',           // Unique ID
  name: 'My Viewer',         // Shown in UI
  description: 'Displays .xyz files with feature X',
  icon: SomeIcon,            // From lucide-react
  priority: 0,               // Standard priority
  builtIn: true,
  canHandle: extMatch(['xyz', 'abc']),  // File extensions (no dots)
  component: MyViewer,
});
```

#### For Heavy Viewers (Lazy Loading)

Use `lazy()` to code-split:

```tsx
registerViewer({
  id: 'my-viewer',
  name: 'My Viewer',
  description: 'Displays .xyz files',
  icon: SomeIcon,
  priority: 0,
  builtIn: true,
  canHandle: extMatch(['xyz']),
  component: lazy(() => import('../components/viewers/MyViewer')),
});
```

**Use lazy loading when** your viewer imports a large library (like `react-pdf`, a code editor, etc.). This keeps the initial app bundle small.

#### Registration Order and Priority

Viewers are sorted by priority, **not** by registration order:

| Priority | Use Case | Example |
|----------|----------|---------|
| `10+` | Specialized viewers that override generic ones | L5X viewer (overrides text for `.l5x`) |
| `0` | Standard viewers | Text, Image, PDF |
| `-1000` | Fallback / catch-all | Unsupported viewer |

If two viewers have the same priority, the one registered first wins.

---

### Step 3: Choose Your `canHandle()` Function

The `canHandle()` function determines which files your viewer can open. Use the provided helpers from `lib/viewers.ts`:

#### `extMatch(extensions)` — Match by file extension

```tsx
canHandle: extMatch(['pdf'])
canHandle: extMatch(['js', 'jsx', 'ts', 'tsx'])
```

#### `nameMatch(options)` — Match by file name patterns

```tsx
canHandle: nameMatch({
  dotfiles: true,               // .gitignore, .env
  extensionless: true,          // Makefile, LICENSE
  names: ['Dockerfile', 'Makefile'],
})
```

#### `magicMatch(magicBytes)` — Match by file header bytes

```tsx
// PDF magic bytes: %PDF
canHandle: magicMatch([[0x25, 0x50, 0x44, 0x46]])
```

#### `anyMatch(handlers)` — Combine multiple matchers

```tsx
canHandle: anyMatch([
  extMatch(['pdf']),
  magicMatch([[0x25, 0x50, 0x44, 0x46]]),
])
```

#### `matchAll()` — Match everything (only for fallback)

```tsx
canHandle: matchAll()  // Used by UnsupportedViewer
```

#### Custom `canHandle` — Write your own logic

```tsx
canHandle: (fileName: string, contentPeek?: Uint8Array) => {
  return fileName.toLowerCase().endsWith('.custom');
}
```

---

### Step 4: (Optional) Add Vendor Chunk Splitting

If your viewer uses a large third-party library, add a manual chunk entry in `frontend/vite.config.js` so it doesn't bloat the main bundle:

```js
manualChunks: (id) => {
  // Your new viewer's library
  if (id.includes('your-library-name')) {
    return 'vendor-your-viewer';
  }
  // ... existing chunks
}
```

---

### Step 5: (Optional) Custom Header Behavior

By default, `ViewerRenderer` adds a standard header bar above your viewer with the file path and an "Open in Default App" button. This is handled for you automatically.

If your viewer needs a custom header (e.g., with extra controls, a navigator, or tabs), set `managesOwnHeader: true` in the registration:

```tsx
registerViewer({
  id: 'my-viewer',
  // ...
  managesOwnHeader: true,  // ViewerRenderer won't render the standard header
  component: MyViewer,
});
```

Then render your own header inside the viewer component. You can reuse `ViewerHeader` from `components/viewers/ViewerHeader.tsx` and extend it.

---

### Step 6: Test Your Viewer

1. **Build check**: Run `npm run build:dev` from `frontend/` and verify no TypeScript or build errors.
2. **Manual test**: Run `task dev` from the project root, open a file of your type, and verify:
   - Loading spinner appears briefly
   - Content renders correctly
   - Error state works (try with a corrupted/missing file)
   - Tab switching preserves state (if you added caching)
3. **Lazy loading** (if applicable): Check the browser DevTools Network tab — your viewer's chunk should only load when a matching file is opened.
4. **Error boundary**: Temporarily throw an error in your viewer — the app should show a friendly error instead of crashing.

---

## Quick Reference: Existing Viewers

Study these for patterns:

| Viewer | File | Pattern | Key Takeaway |
|--------|------|---------|-------------|
| TextViewer | `TextViewer.tsx` | Simple, eager | Uses `useCachedContent` hook, `ReadTextFile` backend call |
| ImageViewer | `ImageViewer.tsx` | Medium, eager | Manual cache Map, `ReadFileBase64`, metadata display |
| PDFViewer | `PDFViewer.tsx` | Complex, **lazy** | Third-party lib (`react-pdf`), toolbar with controls, worker config |
| L5XViewer | `L5XViewer.tsx` | Complex, **lazy** | `managesOwnHeader: true`, multi-tab layout, external library |
| UnsupportedViewer | `UnsupportedViewer.tsx` | Fallback | `matchAll()`, lowest priority, no data loading |

---

## Checklist

Before submitting your PR:

- [ ] Viewer component created in `components/viewers/`
- [ ] Component wrapped with `memo()`
- [ ] Handles loading, error, and loaded states
- [ ] Uses `ViewerProps` interface from `lib/viewers`
- [ ] Registered in `lib/viewers-builtin.ts` with correct priority
- [ ] `canHandle()` matches the right file types
- [ ] Large libraries use `lazy()` loading
- [ ] (If lazy) Vendor chunk added in `vite.config.js`
- [ ] `npm run build:dev` succeeds
- [ ] Manually tested with real files

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| "Viewer with id X is already registered" | Duplicate registration or HMR re-running side effects | Check for duplicate `registerViewer()` calls |
| File opens but shows blank | `file://` URL used instead of backend API | Use `ReadFileBase64` or `ReadTextFile` |
| Viewer works in dev but not production | Worker files not bundled correctly | Check Vite config for worker handling |
| State lost on tab switch | No caching | Add a cache Map or use `useCachedContent` |
| App crashes when viewer errors | Missing error boundary | `ViewerRenderer` handles this—make sure your viewer is rendered through it |
| PDF/heavy viewer slows initial load | Eager import of large library | Use `lazy(() => import(...))` in registration |
