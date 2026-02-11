# PDF Diff Plan (2026-02-10)

## Goal
Add visual PDF diff support to ControlZebra so users can see page-by-page visual changes when PDF files are modified in a git repo.

## Why not use pdf-visual-diff directly
`pdf-visual-diff` is a Node.js library that depends on Node-specific APIs (`fs`, `Buffer`) and native modules (`canvas`, `jimp`). ControlZebra runs a Go backend with a Wails webview frontend (browser context), so the library cannot be executed directly without embedding a Node runtime.

Instead, we will replicate its approach using the existing stack:
- PDF rendering via `pdfjs-dist` (already in `react-pdf`)
- Pixel comparison via `pixelmatch` (browser-compatible)
- File access via existing Go services (`git show` + `ReadFileBase64`)

This preserves the visual diff behavior while avoiding Node runtime dependency.

## Architecture
Frontend-driven PDF diff rendering with lazy page comparison:

1. Load old PDF bytes from git revision (Go backend)
2. Load new PDF bytes from working tree or commit (Go backend)
3. Render page N for both PDFs using pdf.js into canvas
4. Extract ImageData and run `pixelmatch` → diff ImageData
5. Display per-page diff in UI

## Dependencies
Add to frontend:
- `pixelmatch`

## New Components / Files
- `frontend/src/components/viewers/PDFDiffViewer.tsx`
  - Side-by-side view
  - Diff-highlight view
  - Optional overlay/swipe view
  - Page navigation + zoom + summary stats

- `frontend/src/components/viewers/pdf-diff-utils.ts`
  - Render page to ImageData
  - Compare ImageData with `pixelmatch`
  - Convert ImageData to data URL
  - Page count helpers

## Existing Files to Modify
- `frontend/src/lib/file-utils.ts`
  - Add `isPdfFile()`
  - Update `supportsVisualDiff()` to include PDFs

- `frontend/src/components/layout/pages/HistoryPage.tsx`
  - Add PDF diff branch in commit diff rendering

- `frontend/src/components/layout/pages/explorer/ExplorerPage.tsx`
  - Add PDF diff branch for working-tree diffs

- `frontend/src/components/common/DiffViewer.tsx`
  - If binary and PDF, render `PDFDiffViewer` instead of generic message

- `frontend/src/components/layout/sidebar-panels/SidebarCommitPanel.tsx`
  - Include PDFs in visual diff badge logic

## Backend Usage (No New Service Required)
Reuse existing patterns:
- Working tree PDF: `ReadFileBase64(filePath)`
- Commit/revision PDF: use existing git show helpers in GitService or add a small generic helper:
  - `GetFileAtRevisionBase64(repoPath, filePath, revision)`

## Viewer Behavior Details
- Modes:
  - Side-by-side (default)
  - Diff highlight (per-page image)
  - Overlay slider (optional)

- Page count differences:
  - If old has more pages → mark missing pages as removed
  - If new has more pages → mark added pages

- Performance:
  - Only compare pages that are in or near viewport (virtualized)
  - Cache per-page diff results

- Tolerance:
  - Default threshold around 0.05
  - Optional UI slider for advanced users (v2)

## Risks and Mitigations
- Large PDFs → lazy diffing + virtualization
- Rendering differences across OS → tolerance setting
- Memory usage → release canvases after ImageData extraction

## Acceptance Criteria
- When a PDF file changes, the diff view shows visual changes per page
- Added/removed pages are clearly indicated
- Performance remains responsive with large PDFs (100+ pages)
- No Node.js runtime required

## Follow-up Enhancements
- Mask regions (ignore timestamps / headers)
- Text-layer diff alongside visual diff
- Export diff report (PNG per page)
