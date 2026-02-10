# Image Diff Viewer — Implementation Plan

> **Status**: 📋 PLANNING  
> **Created**: February 2026  
> **Author**: Engineering  
> **Goal**: Visual diff comparison for image files across git versions (working tree + commit history).

---

## Executive Summary

Currently, image files in diffs show a dead-end "Binary file - cannot display diff" message. This plan adds visual image diffing using `n7olkachev/imgdiff` on the backend (pixel-level comparison generating a highlighted diff image) and reuses the existing `react-photo-view` frontend infrastructure from `ImageViewer.tsx` for rendering.

The feature will support three diff view modes: **side-by-side**, **overlay/swipe**, and **diff-highlight** (imgdiff output). It integrates into both the commit history flow and the working tree changes flow.

---

## Objectives

1. Provide **visual image comparison** between git revisions — not just "binary file changed".
2. Generate a **pixel-level diff highlight image** using `imgdiff` on the backend.
3. Reuse the existing **react-photo-view** zoom/pan/rotate infrastructure.
4. Support both **commit history diffs** and **working tree diffs**.
5. Keep the feature **fast** — imgdiff is 3× faster than odiff, and we cache aggressively.

---

## Scope

### In Scope (v1)

- Backend: Extract image at old/new revisions, run imgdiff, return results as base64.
- Frontend: `ImageDiffViewer` component with three modes:
  - **Side-by-side**: Old and new images shown next to each other.
  - **Diff highlight**: imgdiff-generated image showing changed pixels in red.
  - **Overlay/swipe**: Drag a slider to reveal old vs new (onion skin).
- Integration into `HistoryPage` and `ExplorerPage` diff flows.
- Image metadata display (dimensions, file size, pixel diff count).
- Click-to-zoom via `react-photo-view` on any of the three images.
- Support formats: PNG, JPG, JPEG, GIF, WebP, BMP, TIFF (anything Go `image` decodes).

### Out of Scope (v1)

- SVG diff (SVGs are XML text — the existing text DiffViewer handles them better).
- Animated GIF frame-by-frame comparison.
- Perceptual diff thresholds exposed in UI settings.
- Side-by-side diff for non-image binary files.

---

## Architecture Overview

### High-Level Flow

```
User selects image file diff (history or working tree)
  → Frontend detects image extension
  → Calls Go backend: ImageDiff(repoPath, filePath, oldRevision, newRevision)
  → Backend:
      1. Extract old image: git show <oldRev>:<path> → temp file
      2. Extract new image: git show <newRev>:<path> (or read working tree)
      3. Run imgdiff.Diff(oldImg, newImg, options) → diff image
      4. Encode all three as base64 (old, new, diff)
      5. Return ImageDiffResult with base64 data + metadata
  → Frontend renders ImageDiffViewer with three modes
```

### Where It Fits

```
Existing:
  HistoryPage  → isL5XFile?  → L5XDiffViewer
               → else        → DiffViewer (text)
               → binary?     → "Binary file" placeholder  ← DEAD END

New:
  HistoryPage  → isImageFile? → ImageDiffViewer  ← NEW
               → isL5XFile?   → L5XDiffViewer
               → binary?      → "Binary file" placeholder
               → else         → DiffViewer (text)

  ExplorerPage → diff tab + isImageFile? → ImageDiffViewer  ← NEW
               → diff tab + isL5XFile?   → L5XWorkingDiffViewer
```

---

## Decisions & Constraints

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend diff library | `n7olkachev/imgdiff` | Team decision. MIT license, Go-native, 3× faster than odiff, outputs diff image. |
| Frontend image rendering | `react-photo-view` | Team decision. Already used in `ImageViewer.tsx` for zoom/pan/rotate. Reuse infra. |
| Image transport | Base64 data URLs | Wails webview cannot access `file://` URLs. Existing pattern in `ReadFileBase64`. |
| Diff image format | PNG (base64) | imgdiff outputs `image.NRGBA`. Encode as PNG for lossless diff visualization. |
| Temp file strategy | In-memory via `git show` pipe | Avoid temp file cleanup issues. Use `git show` stdout → `image.Decode()`. |
| SVG handling | Excluded — use text diff | SVGs are XML. Text diff is more useful than pixel comparison. |

---

## Implementation Plan (Phased)

### Phase 1 — Backend: Image Diff Service (Go)

**Goal**: Add `ImageDiffService` (or extend `GitService`) with methods to extract images at revisions and compute pixel diffs.

#### Step 1.1: Add `imgdiff` Dependency

```bash
go get github.com/n7olkachev/imgdiff
```

Update `go.mod` and `go.sum`.

#### Step 1.2: New Backend Method — `ImageDiff`

**File**: `services/git_service.go` (or new `services/image_diff_service.go` if preferred for separation)

> **Recommendation**: Add to `GitService` since it depends on `git show` and `CommandRunner`. If the team prefers isolation, a separate service is fine — just register it in `main.go`.

**New types:**

```go
// ImageDiffResult contains the result of comparing two image versions.
type ImageDiffResult struct {
    Success bool   `json:"success"`
    Error   string `json:"error,omitempty"`

    // Base64-encoded images (data only, no data: URL prefix)
    OldImage string `json:"oldImage,omitempty"` // Image at old revision
    NewImage string `json:"newImage,omitempty"` // Image at new revision (or working tree)
    DiffImage string `json:"diffImage,omitempty"` // imgdiff output highlighting changes

    // MIME type for the original images
    MimeType string `json:"mimeType"`

    // Metadata
    OldWidth  int    `json:"oldWidth"`
    OldHeight int    `json:"oldHeight"`
    NewWidth  int    `json:"newWidth"`
    NewHeight int    `json:"newHeight"`
    OldSize   int64  `json:"oldSize"`  // Bytes
    NewSize   int64  `json:"newSize"`  // Bytes

    // Diff statistics from imgdiff
    DiffPixelCount uint64 `json:"diffPixelCount"`
    IsEqual        bool   `json:"isEqual"`

    // Status
    Status string `json:"status"` // "added", "modified", "deleted"
}
```

**Method signature:**

```go
// ImageDiff compares an image file between two revisions (or working tree).
// oldRevision: commit hash, "HEAD", "HEAD~1", etc. Empty string = file didn't exist (added).
// newRevision: commit hash, or empty string = use working tree version.
func (g *GitService) ImageDiff(repoPath, filePath, oldRevision, newRevision string) ImageDiffResult
```

**Implementation outline:**

```
1. Determine status:
   - oldRevision empty → "added" (no old image, no diff)
   - newRevision empty + file not on disk → "deleted" (no new image, no diff)
   - Both present → "modified" (run imgdiff)

2. Load old image (if exists):
   - git show <oldRevision>:<relPath> → stdout bytes
   - image.Decode(bytes.NewReader(stdout)) → oldImg
   - Encode to base64 for transport

3. Load new image (if exists):
   - If newRevision is set: git show <newRevision>:<relPath> → bytes
   - If newRevision empty: os.ReadFile(fullPath) → bytes
   - image.Decode → newImg
   - Encode to base64

4. Compute diff (if both exist):
   - imgdiff.Diff(oldImg, newImg, &imgdiff.Options{
       Threshold: 0.1,    // Default perceptual threshold
       DiffImage: true,   // Render original image beneath diff pixels
     })
   - Encode result.Image as PNG → base64

5. Return ImageDiffResult with all data.
```

**Key implementation details:**

- Use `g.runner.RunGitRaw(repoPath, "show", revision+":"+relPath)` — we need raw **bytes**, not string. The existing `RunGit` returns `Stdout` as string which corrupts binary data.
- If `RunGitRaw` doesn't exist, add a helper that captures raw `[]byte` stdout (see Step 1.3).
- Import `"image"`, `"image/png"`, `_ "image/jpeg"`, `_ "image/gif"` for decoder registration.
- Use `encoding/base64` for transport.
- Diff image is always PNG regardless of input format (lossless diff visualization).

#### Step 1.3: Add `RunGitRaw` Helper

**File**: `services/runner.go`

The existing `CommandRunner.RunGit()` captures stdout as `string`, which corrupts binary content. Add a method that returns raw `[]byte`:

```go
// RunGitRaw executes a git command and returns raw stdout bytes.
// Use for binary content (images, etc.) where string conversion corrupts data.
func (r *CommandRunner) RunGitRaw(repoPath string, args ...string) ([]byte, error)
```

Implementation: Use `exec.Command` with `cmd.Output()` to get `[]byte` directly.

#### Step 1.4: Working Tree Image Diff Helper

For working tree diffs, the "old" version is HEAD and the "new" version is the file on disk:

```go
// ImageDiffWorking compares the working tree version of an image against HEAD.
func (g *GitService) ImageDiffWorking(repoPath, filePath string) ImageDiffResult {
    return g.ImageDiff(repoPath, filePath, "HEAD", "")
}
```

#### Step 1.5: Commit Image Diff Helper

For commit history diffs, compare parent commit to the commit:

```go
// ImageDiffCommit compares an image in a commit against its parent.
func (g *GitService) ImageDiffCommit(repoPath, filePath, commitHash string) ImageDiffResult {
    return g.ImageDiff(repoPath, filePath, commitHash+"^", commitHash)
}
```

**Edge case**: First commit (no parent) — detect via `git rev-parse <hash>^` failure, treat as "added".

#### Step 1.6: Tests

**File**: `services/git_service_test.go` (or `services/image_diff_test.go`)

Test cases:
1. Modified image: both old and new exist, diff highlights returned.
2. Added image: no old image, new image returned, status = "added".
3. Deleted image: old image returned, no new, status = "deleted".
4. Identical images: `isEqual = true`, `diffPixelCount = 0`.
5. Different dimensions: imgdiff handles this (uses larger bounds).
6. Non-image binary file: `image.Decode` fails → return error gracefully.
7. Large image: ensure base64 encoding completes within reasonable time.

---

### Phase 2 — Frontend: ImageDiffViewer Component

**Goal**: Build `ImageDiffViewer.tsx` that renders three comparison modes using `react-photo-view`.

#### Step 2.1: Image Extension Detection Utility

**File**: `frontend/src/lib/file-utils.ts` (or add to existing utils)

```typescript
const IMAGE_DIFF_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif',
]);

/** Check if a file path is a diffable image (not SVG). */
export function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_DIFF_EXTENSIONS.has(ext);
}
```

> **Note**: SVG is excluded — it's XML text, better served by `DiffViewer`.

#### Step 2.2: ImageDiffViewer Component

**File**: `frontend/src/components/viewers/ImageDiffViewer.tsx`

**Props:**

```typescript
interface ImageDiffViewerProps {
  repoPath: string;
  filePath: string;
  /** For commit diffs: the commit hash. For working tree: omit or null. */
  commitHash?: string | null;
  /** For working tree diffs */
  isWorkingTree?: boolean;
}
```

**Component structure:**

```
ImageDiffViewer
├── Mode selector tabs: [Side-by-Side] [Diff Highlight] [Overlay]
├── Metadata bar: dimensions, sizes, diff pixel count, % changed
├── Active mode view:
│   ├── SideBySideView — two PhotoProvider/PhotoView panels
│   ├── DiffHighlightView — single PhotoView of diff image
│   └── OverlayView — stacked images with CSS clip-path + draggable slider
└── Loading / Error / "Added" / "Deleted" states
```

**State management:**

```typescript
const [result, setResult] = useState<ImageDiffResult | null>(null);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [mode, setMode] = useState<'side-by-side' | 'diff' | 'overlay'>('side-by-side');
```

**Data fetching:**

```typescript
useEffect(() => {
  if (isWorkingTree) {
    ImageDiffWorking(repoPath, filePath).then(handleResult);
  } else if (commitHash) {
    ImageDiffCommit(repoPath, filePath, commitHash).then(handleResult);
  }
}, [repoPath, filePath, commitHash, isWorkingTree]);
```

#### Step 2.3: Sub-views

**SideBySideView**:
- Two columns, each with `PhotoProvider` > `PhotoView`.
- Labels: "Before" (old revision) / "After" (new revision or working tree).
- Checkerboard background (reuse from `ImageViewer.tsx`).
- Dimension labels beneath each image.
- Clicking either image opens fullscreen viewer.

**DiffHighlightView**:
- Single `PhotoProvider` > `PhotoView` showing the imgdiff output image.
- Changed pixels highlighted in red on a faded copy of the original.
- Shows diff stats: "42 pixels changed (0.3%)".
- `imgdiff.Options.DiffImage = true` renders the original underneath — so context is preserved.

**OverlayView**:
- Stack old and new images on top of each other (absolute positioning).
- CSS `clip-path: inset(0 <rightClip> 0 0)` on the top (new) image.
- Draggable vertical slider divider (simple `onMouseDown` + `onMouseMove`).
- Labels on each side: "Before" / "After".
- This is a common pattern in image diff tools (GitHub uses it).

#### Step 2.4: Reuse from ImageViewer.tsx

Extract shared utilities into a small helper or keep inline:

| Reusable piece | From `ImageViewer.tsx` | How to reuse |
|---|---|---|
| `formatFileSize()` | Line 52 | Extract to shared util or copy (tiny function) |
| Checkerboard CSS pattern | Lines 207-212 | Extract as a CSS class or constant |
| `ToolbarIcon` component | Lines 56-70 | Extract to shared component in `viewers/` |
| `PhotoProvider` toolbar config | Lines 196-210 | Compose with same toolbar pattern |
| Loading/error state patterns | Lines 155-188 | Follow same pattern (not extract — different data shape) |

> **Action**: Create `frontend/src/components/viewers/image-utils.ts` with shared `formatFileSize`, `CHECKERBOARD_STYLE`, and `ToolbarIcon` component. Update `ImageViewer.tsx` to import from it (cleanup refactor).

#### Step 2.5: Caching Strategy

Use the same pattern as `ImageViewer.tsx`'s `imageCache`:

```typescript
const imageDiffCache = new Map<string, ImageDiffResult>();

function cacheKey(repoPath: string, filePath: string, commitHash?: string): string {
  return `${repoPath}:${filePath}:${commitHash || 'working'}`;
}
```

- Cache on first load; skip backend call on subsequent renders (tab switches).
- Invalidate when `repoPath` or repo status changes (listen to repo events).
- Working tree diffs should invalidate more aggressively (file may have changed).

---

### Phase 3 — Integration into Diff Flow

**Goal**: Wire `ImageDiffViewer` into the existing diff rendering pipelines.

#### Step 3.1: HistoryPage — Commit File Diffs

**File**: `frontend/src/components/layout/pages/HistoryPage.tsx`

Currently:
```
if (isL5XFile) → L5XDiffViewer
else → DiffViewer
```

Change to:
```
if (isL5XFile) → L5XDiffViewer
else if (isImageFile) → ImageDiffViewer  ← NEW
else → DiffViewer
```

Pass `commitHash={selectedCommit.hash}` to `ImageDiffViewer`.

When `currentDiff.binary === true && isImageFile(selectedCommitFile)`, skip the "Binary file" placeholder and render `ImageDiffViewer` instead.

#### Step 3.2: ExplorerPage — Working Tree Diffs

**File**: `frontend/src/components/layout/pages/explorer/ExplorerPage.tsx`

Currently, diff tabs for non-L5X files render a placeholder. Add image diff support:

```
if (isL5XFile) → L5XWorkingDiffViewer
else if (isImageFile) → ImageDiffViewer (isWorkingTree=true)  ← NEW
else → placeholder (future: generic text diff)
```

#### Step 3.3: Enable Image Files in Changes View

**File**: `frontend/src/components/layout/sidebar-panels/SidebarCommitPanel.tsx`

Currently `supportsDomainDiff()` only returns true for L5X/L5K files:

```typescript
const DOMAIN_DIFF_EXTENSIONS = new Set(['l5x', 'l5k']);
```

Expand to include image extensions, or create a separate `supportsVisualDiff()`:

```typescript
const VISUAL_DIFF_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif',
]);

function supportsDiff(filePath: string): boolean {
  return supportsDomainDiff(filePath) || supportsVisualDiff(filePath);
}
```

This makes image files clickable in the changes list sidebar, which opens a diff tab.

#### Step 3.4: DiffViewer Binary Fallback Update

**File**: `frontend/src/components/common/DiffViewer.tsx`

Update the binary file placeholder to hint that image diffs are available elsewhere, or better — detect image extension and render `ImageDiffViewer` inline as a fallback:

```typescript
// In the binary branch:
if (fileDiff.binary && isImageFile(fileDiff.path)) {
  return <ImageDiffViewer ... />;
}
// else: existing "Binary file - cannot display diff" message
```

This ensures that even if `ImageDiffViewer` isn't routed to directly, binary image files get visual diffing.

---

### Phase 4 — Polish & UX

#### Step 4.1: Mode Persistence

Store the user's preferred diff mode in `localStorage`:

```typescript
const [mode, setMode] = useState<DiffMode>(
  () => (localStorage.getItem('image-diff-mode') as DiffMode) || 'side-by-side'
);
```

#### Step 4.2: Keyboard Shortcuts

- `1` / `2` / `3` to switch modes (side-by-side / diff / overlay).
- `←` / `→` to move the overlay slider.
- Reuse existing keyboard shortcut patterns from the app.

#### Step 4.3: Added/Deleted States

- **Added image** (no old version): Show only the new image with a green "Added" badge. No side-by-side or diff modes available.
- **Deleted image** (no new version): Show only the old image with a red "Deleted" badge. Faded/grayscale treatment.

#### Step 4.4: Different Dimensions Indicator

When old and new images have different dimensions, show a clear warning:
```
⚠ Image dimensions changed: 1920×1080 → 2560×1440
```

imgdiff handles different-sized images (uses the larger bounds), but the user should know.

#### Step 4.5: Diff Stats Bar

Below the mode tabs, show:
```
42 pixels changed  •  0.03% of image  •  1920×1080 → 1920×1080  •  245 KB → 312 KB (+27%)
```

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `services/image_diff_service.go` (or add to `git_service.go`) | Backend image diff logic using imgdiff |
| `services/image_diff_test.go` | Backend tests |
| `frontend/src/components/viewers/ImageDiffViewer.tsx` | Main image diff component |
| `frontend/src/components/viewers/image-utils.ts` | Shared image utilities (formatFileSize, checkerboard, ToolbarIcon) |
| `frontend/src/lib/file-utils.ts` | `isImageFile()` utility (shared across diff routing) |

### Modified Files

| File | Change |
|------|--------|
| `go.mod` / `go.sum` | Add `github.com/n7olkachev/imgdiff` dependency |
| `services/runner.go` | Add `RunGitRaw()` method for binary stdout |
| `main.go` | Register new service if using separate `ImageDiffService` (skip if adding to `GitService`) |
| `frontend/src/components/layout/pages/HistoryPage.tsx` | Route image files to `ImageDiffViewer` |
| `frontend/src/components/layout/pages/explorer/ExplorerPage.tsx` | Route image diff tabs to `ImageDiffViewer` |
| `frontend/src/components/layout/sidebar-panels/SidebarCommitPanel.tsx` | Make image files clickable for diffs |
| `frontend/src/components/common/DiffViewer.tsx` | Optional: render `ImageDiffViewer` for binary images |
| `frontend/src/components/viewers/ImageViewer.tsx` | Extract shared utils to `image-utils.ts` |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Large images → huge base64 payloads | Medium | High (memory, latency) | Cap at 50MB (match `ReadFileBase64`). Downsample diff image if > 4K. Show warning for large files. |
| `git show` binary corruption via string | High (if not handled) | Critical | Use `RunGitRaw` with `[]byte` capture — **must** be implemented in Phase 1. |
| imgdiff panics on malformed images | Low | Medium | Wrap `imgdiff.Diff()` in recover(). Return error result. |
| Different image formats (JPEG vs PNG) | Low | Low | Go's `image.Decode` auto-detects. Diff output is always PNG. |
| GIF animations lost in diff | Medium | Low | Out of scope v1. Show first frame only (Go's default). Document limitation. |
| react-photo-view conflicts with overlay slider | Low | Medium | Overlay mode doesn't use PhotoView click-to-zoom. Only side-by-side and diff modes use it. |

---

## Effort Estimate

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| Phase 1: Backend | 2-3 days | `imgdiff` library review, `RunGitRaw` |
| Phase 2: Frontend component | 3-4 days | Phase 1 (needs backend API), react-photo-view patterns |
| Phase 3: Integration | 1-2 days | Phase 2 (needs component), existing page modifications |
| Phase 4: Polish | 1-2 days | Phase 3 |
| **Total** | **7-11 days** | |

---

## Testing Strategy

### Backend Tests (`services/image_diff_test.go`)

- Create a test git repo with image files at different commits.
- Test `ImageDiff`, `ImageDiffWorking`, `ImageDiffCommit`.
- Verify base64 output decodes to valid images.
- Test edge cases: added, deleted, identical, different dimensions, corrupt files.
- Benchmark: ensure diff of a 4K image completes in < 3 seconds.

### Frontend Tests

- Unit test `ImageDiffViewer` with mocked backend responses.
- Test mode switching (side-by-side → diff → overlay).
- Test loading, error, and edge states (added/deleted).
- Test `isImageFile()` utility with various extensions.
- Snapshot test for each mode's rendered output.

### Manual QA Checklist

- [ ] Open commit with modified PNG → three modes work correctly.
- [ ] Open commit with added image → shows "Added" state.
- [ ] Open commit with deleted image → shows "Deleted" state.
- [ ] Working tree: modify an image, view diff in Changes.
- [ ] Click image in any mode → fullscreen react-photo-view works.
- [ ] Large image (>5MB) → loads without freezing.
- [ ] JPEG, PNG, GIF, WebP all handled correctly.
- [ ] SVG files still route to text DiffViewer (not ImageDiffViewer).
- [ ] Tab switching caches correctly — no re-fetch on return.

---

## Future Enhancements (v2+)

- **Threshold slider**: Let users adjust `imgdiff.Options.Threshold` in the UI.
- **Animated GIF support**: Frame-by-frame comparison.
- **Diff overlay opacity**: Adjustable transparency for the diff highlight overlay.
- **Multiple file carousel**: Step through all changed images in a commit.
- **SVG visual diff**: Render SVGs to canvas, then run pixel comparison.
- **Perceptual similarity score**: Show a percentage similarity metric.
