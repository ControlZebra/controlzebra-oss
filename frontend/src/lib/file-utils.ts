/**
 * File-type detection utilities.
 *
 * Shared across the app wherever routing decisions depend on file extension
 * (diff viewers, sidebar panels, explorer pages, etc.).
 */

// ---------------------------------------------------------------------------
// Image Files (diffable raster formats — SVG excluded)
// ---------------------------------------------------------------------------

/**
 * Extensions supported for visual image diffing.
 * SVG is intentionally excluded — it's XML text and better served by the
 * text DiffViewer. ICO is excluded because imgdiff doesn't decode it.
 */
const IMAGE_DIFF_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif',
]);

/**
 * Check if a file path has a raster image extension suitable for visual diffing.
 *
 * @example
 *   isImageFile('screenshot.png')         // true
 *   isImageFile('/repo/assets/logo.svg')  // false  (SVG → text diff)
 *   isImageFile('config.json')            // false
 */
export function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_DIFF_EXTENSIONS.has(ext);
}

// ---------------------------------------------------------------------------
// Domain-specific files (L5X / L5K)
// ---------------------------------------------------------------------------

const DOMAIN_DIFF_EXTENSIONS = new Set(['l5x', 'l5k']);

/** Check if a file path is a Rockwell Automation ladder-logic file. */
export function isL5XFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return DOMAIN_DIFF_EXTENSIONS.has(ext);
}

// ---------------------------------------------------------------------------
// PDF Files
// ---------------------------------------------------------------------------

const PDF_EXTENSIONS = new Set(['pdf']);

/**
 * Check if a file path is a PDF file suitable for visual page diffing.
 *
 * @example
 *   isPdfFile('report.pdf')    // true
 *   isPdfFile('readme.txt')    // false
 */
export function isPdfFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return PDF_EXTENSIONS.has(ext);
}

// ---------------------------------------------------------------------------
// Aggregate helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the file type supports any kind of rich visual diff
 * (image diff, L5X domain diff, PDF visual diff, etc.) — as opposed to plain text diff.
 */
export function supportsVisualDiff(filePath: string): boolean {
  return isImageFile(filePath) || isL5XFile(filePath) || isPdfFile(filePath);
}

/**
 * Returns true if the file can be opened in a diff tab.
 *
 * Note: Text diffs are supported for virtually any file (Git will provide a
 * unified diff for text; binary files will show a friendly fallback message).
 */
export function supportsDiff(filePath: string): boolean {
  return !!filePath;
}
