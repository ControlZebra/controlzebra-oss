/**
 * model3d-utils – Shared utilities for 3D model viewers.
 *
 * Provides base64→File conversion (OV requires browser File objects).
 *
 * For file-type detection (is3DModelFile, MODEL_3D_EXTENSIONS), use
 * `isFileKind(path, 'model3d')` from `shared/constants/file-types`.
 */

// ---------------------------------------------------------------------------
// base64 → File conversion
// ---------------------------------------------------------------------------

/**
 * Convert a base64-encoded string to a browser `File` object.
 *
 * Required because `OV.EmbeddedViewer.LoadModelFromFileList` expects an
 * array of `File` objects. Wails cannot serve file:// URLs, so all binary
 * content travels through the Go backend as base64.
 *
 * @param base64Data - Raw base64 string (no data-URL prefix)
 * @param fileName   - Name including extension (e.g. "part.stl")
 */
export function base64ToFile(base64Data: string, fileName: string): File {
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new File([bytes], fileName);
}
