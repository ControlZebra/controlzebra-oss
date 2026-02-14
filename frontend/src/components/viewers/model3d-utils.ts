/**
 * model3d-utils – Shared utilities for 3D model viewers.
 *
 * Provides:
 * - base64→File conversion (OV requires browser File objects)
 * - Extension set + helper for 3D model detection
 */

// ---------------------------------------------------------------------------
// Supported 3D extensions
// ---------------------------------------------------------------------------

/**
 * All file extensions the 3D viewer can handle.
 * Sourced from Online3DViewer's supported import formats.
 */
export const MODEL_3D_EXTENSIONS = new Set([
  // Mesh / Print
  'stl', 'obj', '3mf', 'ply', 'off', 'amf',
  // CAD / Engineering
  'step', 'stp', 'iges', 'igs', 'brep', '3dm', 'fcstd',
  // Scene / Exchange
  'gltf', 'glb', 'fbx', 'dae', '3ds', 'wrl',
  // BIM
  'bim', 'ifc',
]);

/**
 * Check if a file path has a 3D model extension.
 *
 * @example
 *   is3DModelFile('part.stl')             // true
 *   is3DModelFile('/repo/cad/housing.stp') // true
 *   is3DModelFile('readme.md')            // false
 */
export function is3DModelFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return MODEL_3D_EXTENSIONS.has(ext);
}

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
