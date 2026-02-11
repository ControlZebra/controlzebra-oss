/**
 * PDF Diff Utilities — render PDF pages to ImageData and compare with pixelmatch.
 *
 * Uses pdfjs-dist (via react-pdf) for PDF rendering and pixelmatch for
 * pixel-level comparison. All operations run in the browser — no Node.js
 * runtime required.
 *
 * Key functions:
 *  - loadPdfFromBase64()   — parse base64 into a pdfjs PDFDocumentProxy
 *  - renderPageToImageData() — rasterise a single page to an ImageData
 *  - comparePages()        — pixelmatch two ImageData arrays → diff result
 *  - imageDataToDataUrl()  — paint an ImageData into a data URL for <img>
 */
import { pdfjs } from 'react-pdf';
import pixelmatch from 'pixelmatch';

// ---------------------------------------------------------------------------
// pdf.js worker configuration — must happen before any getDocument() call.
// PDFViewer.tsx also sets this, but PDFDiffViewer may lazy-load first.
// Setting it again is idempotent.
// ---------------------------------------------------------------------------
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// ============================================================================
// Types
// ============================================================================

/** Result of comparing two rendered PDF pages. */
export interface PageDiffResult {
  /** Old page rendered as a data URL (or null if page doesn't exist in old). */
  oldDataUrl: string | null;
  /** New page rendered as a data URL (or null if page doesn't exist in new). */
  newDataUrl: string | null;
  /** Diff-highlight image as a data URL (null if only one side exists). */
  diffDataUrl: string | null;
  /** Number of mismatched pixels. */
  diffPixelCount: number;
  /** Total pixels compared. */
  totalPixels: number;
  /** True when both pages are pixel-identical (within threshold). */
  isEqual: boolean;
  /** Width of the rendered page(s). */
  width: number;
  /** Height of the rendered page(s). */
  height: number;
}

/** Summary statistics across all pages. */
export interface PdfDiffSummary {
  oldPageCount: number;
  newPageCount: number;
  /** Max of old and new page counts. */
  totalPages: number;
  /** Pages that have pixel differences. */
  changedPages: number;
  /** Pages only in old (removed). */
  removedPages: number;
  /** Pages only in new (added). */
  addedPages: number;
  /** Pages that are identical. */
  unchangedPages: number;
}

// ============================================================================
// PDF Loading
// ============================================================================

/** Re-export the document proxy type for consumers. */
export type PDFDocumentProxy = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;

/**
 * Load a pdfjs document from base64-encoded PDF data.
 * The base64 string should be raw base64 (no `data:` prefix).
 *
 * Validates the decoded bytes before passing to pdfjs to provide clear
 * error messages instead of cryptic "Invalid PDF structure" failures.
 */
export async function loadPdfFromBase64(base64Data: string): Promise<PDFDocumentProxy> {
  if (!base64Data || base64Data.length === 0) {
    throw new Error('Empty PDF data received from backend');
  }

  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Validate: PDF files must start with the %PDF- magic header
  if (
    bytes.length < 5 ||
    bytes[0] !== 0x25 || // %
    bytes[1] !== 0x50 || // P
    bytes[2] !== 0x44 || // D
    bytes[3] !== 0x46 || // F
    bytes[4] !== 0x2d    // -
  ) {
    // Check if this is a Git LFS pointer that wasn't resolved
    const header = binaryStr.substring(0, 60);
    if (header.startsWith('version https://git-lfs')) {
      throw new Error(
        'This file is stored in Git LFS. The actual PDF content could not be retrieved. ' +
        'Ensure git-lfs is installed and run "git lfs pull".',
      );
    }
    throw new Error(
      `Not a valid PDF file (missing %PDF- header). ` +
      `Got ${bytes.length} bytes starting with: ${JSON.stringify(header.substring(0, 20))}`,
    );
  }

  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  return doc;
}

// ============================================================================
// Page Rendering
// ============================================================================

/**
 * Render a single PDF page to an ImageData.
 *
 * Creates a temporary off-screen canvas, renders the page at the given scale,
 * then extracts the ImageData and releases the canvas to avoid memory leaks.
 *
 * @param doc   - The loaded pdfjs document.
 * @param pageNum - 1-based page number.
 * @param scale - Render scale (1.0 = 72 DPI, 2.0 = 144 DPI, etc.).
 * @returns The rendered ImageData or null if the page doesn't exist.
 */
export async function renderPageToImageData(
  doc: PDFDocumentProxy,
  pageNum: number,
  scale: number = 1.5,
): Promise<ImageData | null> {
  if (pageNum < 1 || pageNum > doc.numPages) return null;

  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2d context');

  // pdfjs v4+ prefers the `canvas` parameter; passing canvasContext is
  // deprecated.  When both are supplied pdfjs may silently create a second
  // context from `canvas`, which is harmless (same underlying context) but
  // redundant.  Use the recommended signature: canvas + viewport only.
  await page.render({ canvas, viewport }).promise;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Release canvas memory
  canvas.width = 0;
  canvas.height = 0;

  return imageData;
}

// ============================================================================
// Pixel Comparison
// ============================================================================

/**
 * Compare two page ImageData arrays using pixelmatch.
 *
 * If the pages have different dimensions, both are composited onto a canvas
 * of the maximum size (padding smaller one with transparent pixels).
 *
 * @param oldData - ImageData from the old page (or null if page was added).
 * @param newData - ImageData from the new page (or null if page was removed).
 * @param threshold - Matching threshold (0–1). Lower = stricter. Default 0.05.
 * @returns A PageDiffResult with data URLs and stats.
 */
export function comparePages(
  oldData: ImageData | null,
  newData: ImageData | null,
  threshold: number = 0.05,
): PageDiffResult {
  // One side missing → added or removed page
  if (!oldData && !newData) {
    return { oldDataUrl: null, newDataUrl: null, diffDataUrl: null, diffPixelCount: 0, totalPixels: 0, isEqual: true, width: 0, height: 0 };
  }

  if (!oldData && newData) {
    return {
      oldDataUrl: null,
      newDataUrl: imageDataToDataUrl(newData),
      diffDataUrl: null,
      diffPixelCount: newData.width * newData.height,
      totalPixels: newData.width * newData.height,
      isEqual: false,
      width: newData.width,
      height: newData.height,
    };
  }

  if (oldData && !newData) {
    return {
      oldDataUrl: imageDataToDataUrl(oldData),
      newDataUrl: null,
      diffDataUrl: null,
      diffPixelCount: oldData.width * oldData.height,
      totalPixels: oldData.width * oldData.height,
      isEqual: false,
      width: oldData.width,
      height: oldData.height,
    };
  }

  // Both sides present — compare
  const old = oldData!;
  const nw = newData!;

  const maxW = Math.max(old.width, nw.width);
  const maxH = Math.max(old.height, nw.height);

  // Normalise to the same dimensions if they differ
  const oldNorm = normalizeImageData(old, maxW, maxH);
  const newNorm = normalizeImageData(nw, maxW, maxH);

  // Run pixelmatch
  const diffBuffer = new Uint8ClampedArray(maxW * maxH * 4);
  const numDiff = pixelmatch(
    oldNorm.data,
    newNorm.data,
    diffBuffer,
    maxW,
    maxH,
    { threshold, includeAA: false, alpha: 0.1 },
  );

  const diffImageData = new ImageData(diffBuffer, maxW, maxH);
  const totalPixels = maxW * maxH;

  return {
    oldDataUrl: imageDataToDataUrl(old),
    newDataUrl: imageDataToDataUrl(nw),
    diffDataUrl: imageDataToDataUrl(diffImageData),
    diffPixelCount: numDiff,
    totalPixels,
    isEqual: numDiff === 0,
    width: maxW,
    height: maxH,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert an ImageData to a PNG data URL via a temporary canvas.
 */
export function imageDataToDataUrl(data: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(data, 0, 0);
  const url = canvas.toDataURL('image/png');
  // Release canvas memory
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

/**
 * Normalise ImageData to a target size by padding with transparent pixels.
 * Returns the original if already the right size (no allocation).
 */
function normalizeImageData(data: ImageData, targetWidth: number, targetHeight: number): ImageData {
  if (data.width === targetWidth && data.height === targetHeight) return data;

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d')!;
  // Fill with transparent white (so diff background isn't flagged)
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  // Put original data in top-left
  ctx.putImageData(data, 0, 0);
  const result = ctx.getImageData(0, 0, targetWidth, targetHeight);
  canvas.width = 0;
  canvas.height = 0;
  return result;
}

/**
 * Compute summary statistics from an array of per-page diff results.
 */
export function computeSummary(
  results: Map<number, PageDiffResult>,
  oldPageCount: number,
  newPageCount: number,
): PdfDiffSummary {
  const totalPages = Math.max(oldPageCount, newPageCount);
  let changedPages = 0;
  let removedPages = 0;
  let addedPages = 0;
  let unchangedPages = 0;

  for (let i = 1; i <= totalPages; i++) {
    const r = results.get(i);
    if (!r) continue;

    if (r.oldDataUrl === null && r.newDataUrl !== null) {
      addedPages++;
    } else if (r.oldDataUrl !== null && r.newDataUrl === null) {
      removedPages++;
    } else if (r.isEqual) {
      unchangedPages++;
    } else {
      changedPages++;
    }
  }

  return { oldPageCount, newPageCount, totalPages, changedPages, removedPages, addedPages, unchangedPages };
}
