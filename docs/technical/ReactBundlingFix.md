# React Bundling Fix — White Screen in Production Wails Build

**Date**: February 2026  
**Severity**: P0 — App completely non-functional in production  
**Files Changed**: `frontend/vite.config.js`, `ladder-visualizer/package.json`

---

## Symptom

After `go build` (or `./scripts/build-all.sh`), the Wails app opens to a **blank white screen**. The dev server (`task dev`) works fine.

Opening the WebKit inspector (macOS) or attaching a remote debugger reveals:

```
TypeError: undefined is not an object (evaluating 'o.Children={map:B,forEach:...}')
  ce (vendor-react-QocR8xge.js:9:3769)
  oe (vendor-react-QocR8xge.js:9:6515)
  wc (vendor-react-dom-iNY6tnHV.js:9)
```

React never mounts. No components render. The entire app is dead.

---

## Root Cause (Two Compounding Issues)

### Issue 1: Duplicate React Instances

The `ladder-visualizer` package is linked into the frontend via a `file:` protocol reference in `package.json`:

```json
"ladder-visualizer": "file:../../ladder-visualizer"
```

At the time, `ladder-visualizer/package.json` had `react` and `react-dom` in **both** `dependencies` and `peerDependencies`:

```json
"peerDependencies": {
  "react": "^18.0.0",
  "react-dom": "^18.0.0"
},
"dependencies": {
  "react": "^18.2.0",      // ← PROBLEM: installs its own copy
  "react-dom": "^18.2.0",  // ← PROBLEM: installs its own copy
  ...
}
```

This caused `npm install` to create:
- `frontend/node_modules/react/` (copy A — used by the app)
- `ladder-visualizer/node_modules/react/` (copy B — used by the linked package)

Combined with `preserveSymlinks: true` in the Vite config (needed for linked packages), Vite resolved React imports from `ladder-visualizer` source files to **copy B** because it followed the symlink to the real package path outside `frontend/node_modules/`.

### Issue 2: Circular Chunk Dependencies from `manualChunks`

The Vite config used a function-based `manualChunks` to split vendor libraries into named chunks:

```js
manualChunks: (id) => {
  if (id.includes('node_modules/react-dom')) return 'vendor-react-dom';
  if (id.includes('node_modules/react/'))    return 'vendor-react';
  if (id.includes('node_modules'))           return 'vendor-misc';  // catch-all
}
```

**Why this is dangerous**: Rollup assigns each module to a chunk independently based on the function's return value. When two manually-assigned chunks share a dependency module, Rollup must place that shared module in ONE chunk and create a cross-chunk `import` in the other. This creates **cross-chunk import cycles**.

For example:
1. `vendor-react` chunk contains React core
2. `vendor-misc` catch-all chunk gets a React-related utility (e.g., `object-assign`)
3. `vendor-react` needs `object-assign` → imports from `vendor-misc`
4. `vendor-misc` needs React → imports from `vendor-react`
5. **Circular dependency**: `vendor-react ↔ vendor-misc`

Even after removing the catch-all and combining `react` + `react-dom` + `scheduler` into one chunk, the same pattern emerged with `vendor-pdf` (because `react-pdf` shares internal dependencies with React core).

### How Circular Imports Cause the Crash

ES modules handle circular imports by providing the importing module with a **live binding** to the exporting module's namespace — but only the exports that have been **evaluated so far**. If module A is still being evaluated when module B imports from it, B gets a partially-initialized namespace.

In React's production bundle (CJS wrapped in ESM), the code structure is:

```js
var o = {};  // hoisted declaration — value is undefined until assignment executes

function ce() {
  // ... sets up React internals ...
  o.Children = { map: B, forEach: ... };  // ← crashes here
  return o;
}
```

When the circular import evaluates this module before `var o = {}` has been reached (it's hoisted but not yet assigned), `o` is `undefined`, and `o.Children = ...` throws:

```
TypeError: undefined is not an object (evaluating 'o.Children=...')
```

---

## How It Was Debugged

### 1. Identify it's a bundling issue, not a Wails issue

The error only occurs in production builds (`vite build`), not in dev mode (`vite dev`). The Wails asset server logs show all JS/CSS files being served correctly — the files exist and are delivered, but **React itself crashes during module initialization**.

### 2. Inspect the built chunks

```bash
head -c 300 frontend/dist/assets/vendor-react-QocR8xge.js
```

Revealed:
```js
import{g as le}from"./vendor-misc-DxCIEh6_.js";
```

The React chunk imports from `vendor-misc` — a red flag for circular dependencies.

```bash
head -c 500 frontend/dist/assets/vendor-react-dom-iNY6tnHV.js
```

Revealed:
```js
import{a as gc,b as yc}from"./vendor-react-QocR8xge.js";
```

`react-dom` imports from `react` (expected), but `react` imports from `misc` which imports from `react` (circular).

### 3. Attempt incremental fix (failed)

First attempt: Combine `react` + `react-dom` + `scheduler` into one chunk, remove the `vendor-misc` catch-all. Result: the circular dependency shifted to `vendor-react ↔ vendor-pdf` because `react-pdf` shares internal dependencies with React.

This confirmed that **any** function-based `manualChunks` with React is fundamentally unsafe — Rollup will always find shared modules to create cross-chunk imports.

### 4. Final fix: Remove manualChunks entirely

For a Wails desktop app, all assets are embedded in the Go binary via `embed.FS`. There is zero network caching benefit from chunk splitting. Removing `manualChunks` lets Rollup handle all splitting automatically — it only splits at explicit `dynamic import()` boundaries, which are cycle-free by construction.

---

## The Fix

### 1. `ladder-visualizer/package.json` — Remove React from `dependencies`

React and react-dom must ONLY be in `peerDependencies`. Having them in `dependencies` causes npm to install a separate copy inside the package's own `node_modules/`, which creates a duplicate instance when the package is linked.

```diff
  "dependencies": {
    "fast-xml-parser": "^5.3.3",
-   "react": "^18.2.0",
-   "react-dom": "^18.2.0",
    "zustand": "^4.4.0"
  }
```

The `tsup.config.ts` already correctly marks `react` and `react-dom` as `external`, so the built library doesn't bundle them.

### 2. `frontend/vite.config.js` — Force single React resolution

```js
resolve: {
  preserveSymlinks: true,
  alias: {
    'react': path.resolve(__dirname, 'node_modules/react'),
    'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime'),
    'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime'),
  },
  dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
},
```

This forces ALL React imports — including those from inside linked packages — to resolve to the frontend's single copy.

### 3. `frontend/vite.config.js` — Remove `manualChunks`

```diff
  build: {
-   chunkSizeWarningLimit: 600,
-   rollupOptions: {
-     output: {
-       manualChunks: (id) => { ... }
-     }
-   }
+   chunkSizeWarningLimit: 800,
  }
```

Dynamic `import()` calls in app code (PDFViewer, L5XViewer) still create natural code-split chunks automatically.

---

## Result

| Metric | Before | After |
|--------|--------|-------|
| Production build | ❌ White screen (React crash) | ✅ App loads normally |
| Dev mode | ✅ Working | ✅ Working |
| Chunk count | ~13 vendor chunks | 3 chunks (main + 2 lazy-loaded) |
| Total JS size | ~1.8 MB | ~2.0 MB (single main bundle) |
| Load performance | N/A (crashed) | Identical — Wails serves from memory |

---

## Prevention Rules

1. **Linked packages must use `peerDependencies` for React** — never `dependencies`. Add this check to PR reviews for any package consumed via `file:` or `npm link`.

2. **Do NOT use function-based `manualChunks` with React** — Rollup cannot guarantee acyclic chunk graphs when you manually assign modules. Use static object-based `manualChunks` only if needed, or let Rollup handle splitting automatically.

3. **For Wails/Electron/Tauri apps, prefer no chunk splitting** — All assets are local. The only reason to split is lazy-loading large features via dynamic `import()`, which Vite handles automatically.

4. **When debugging "undefined is not an object" in vendor chunks** — Check for circular chunk imports by inspecting the first line of each built chunk file. If chunk A imports from chunk B and chunk B imports from chunk A, you have a circular initialization issue.
