export const IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'svg',
  'tiff',
  'tif',
  'avif',
] as const;

export const PDF_EXTENSIONS = ['pdf'] as const;

export const MODEL_3D_EXTENSIONS = [
  'stl',
  'obj',
  '3mf',
  'ply',
  'off',
  'amf',
  'step',
  'stp',
  'iges',
  'igs',
  'brep',
  '3dm',
  'fcstd',
  'gltf',
  'glb',
  'fbx',
  'dae',
  '3ds',
  'wrl',
  'bim',
  'ifc',
] as const;

export const L5X_EXTENSIONS = ['l5x', 'l5k'] as const;

export type FileKind = 'image' | 'pdf' | 'model3d' | 'l5x' | 'unknown';

const IMAGE_EXTENSION_SET = new Set<string>(IMAGE_EXTENSIONS);
const PDF_EXTENSION_SET = new Set<string>(PDF_EXTENSIONS);
const MODEL_3D_EXTENSION_SET = new Set<string>(MODEL_3D_EXTENSIONS);
const L5X_EXTENSION_SET = new Set<string>(L5X_EXTENSIONS);

function extensionFromPath(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? '';
}

export function fileKindFromPath(filePath: string): FileKind {
  const extension = extensionFromPath(filePath);

  if (!extension) {
    return 'unknown';
  }

  if (L5X_EXTENSION_SET.has(extension)) {
    return 'l5x';
  }

  if (MODEL_3D_EXTENSION_SET.has(extension)) {
    return 'model3d';
  }

  if (PDF_EXTENSION_SET.has(extension)) {
    return 'pdf';
  }

  if (IMAGE_EXTENSION_SET.has(extension)) {
    return 'image';
  }

  return 'unknown';
}

export function isFileKind(filePath: string, kind: Exclude<FileKind, 'unknown'>): boolean {
  return fileKindFromPath(filePath) === kind;
}
