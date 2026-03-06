/**
 * Viewer path helpers that are safe across Windows and Unix separators.
 */

/**
 * Returns the file name (last segment) from a path.
 * Handles both '/' and '\\' separators and trims trailing separators.
 */
export function getPathFileName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  if (!trimmed) return path;

  const separatorIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (separatorIndex < 0) {
    return trimmed;
  }

  return trimmed.slice(separatorIndex + 1) || trimmed;
}
