/**
 * File-type detection utilities.
 *
 * Shared across the app wherever routing decisions depend on file extension
 * (diff viewers, sidebar panels, explorer pages, etc.).
 *
 * For generic file-kind detection, prefer `isFileKind(path, kind)` from
 * `./file-types`. The helpers below exist only where they add semantics that
 * `isFileKind` does not provide (e.g. `isImageFile` excludes SVG/ICO/AVIF
 * because those formats are unsuitable for pixel-level image diffing).
 */
import { IMAGE_EXTENSIONS } from './file-types';

// ---------------------------------------------------------------------------
// Image Files (diffable raster formats — SVG excluded)
// ---------------------------------------------------------------------------

/**
 * Extensions supported for visual image diffing.
 * SVG is intentionally excluded — it's XML text and better served by the
 * text DiffViewer. ICO is excluded because imgdiff doesn't decode it.
 */
const IMAGE_DIFF_EXTENSIONS = new Set<string>(
  IMAGE_EXTENSIONS.filter((ext) => ext !== 'svg' && ext !== 'ico' && ext !== 'avif'),
);

/**
 * Check if a file path has a raster image extension suitable for visual diffing.
 *
 * NOTE: This intentionally differs from `isFileKind(path, 'image')` which
 * includes ALL image types (svg, ico, avif). Use this specifically for
 * image diff routing decisions.
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
// Aggregate helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the file can be opened in a diff tab.
 *
 * Note: Text diffs are supported for virtually any file (Git will provide a
 * unified diff for text; binary files will show a friendly fallback message).
 */
export function supportsDiff(filePath: string): boolean {
  return !!filePath;
}
