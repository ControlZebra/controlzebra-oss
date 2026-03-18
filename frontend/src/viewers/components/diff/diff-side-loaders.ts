import { GetFileAtRevisionBase64, ReadFileAtRevisionLarge } from '../../../../bindings/controlzebra/services/gitservice';
import { ReadFileBase64, ReadTextFile } from '../../../../bindings/controlzebra/services/filesystemservice';
import type { DiffSide } from '../../registry/diff-registry';

export interface BinarySidePayload {
  base64Data: string;
  mimeType?: string;
  size?: number;
}

interface ResolveDiffSidePairInput {
  repoPath: string;
  filePath: string;
  oldSide?: DiffSide;
  newSide?: DiffSide;
  commitHash?: string | null;
  isWorkingTree?: boolean;
  absoluteFilePath?: string;
}

interface ResolvedDiffSidePair {
  oldSide: DiffSide;
  newSide: DiffSide;
}

function isAbsolutePath(path: string): boolean {
  return /^([a-zA-Z]:)?[\\/]/.test(path);
}

function joinRepoPath(repoPath: string, filePath: string): string {
  const normalizedFilePath = filePath.replace(/\\/g, '/');
  if (isAbsolutePath(normalizedFilePath)) {
    return normalizedFilePath;
  }

  const normalizedRepoPath = repoPath.replace(/\\/g, '/').replace(/\/+$/, '');
  return `${normalizedRepoPath}/${normalizedFilePath}`;
}

function isMissingFileError(error?: string): boolean {
  if (!error) {
    return false;
  }

  return /(does not exist|not exist|no such file|cannot find|not found|missing)/i.test(error);
}

function formatSideLabel(side: DiffSide): string {
  switch (side.kind) {
    case 'ref':
      return `${side.ref}:${side.path}`;
    case 'working':
      return side.absolutePath;
    case 'missing':
      return side.path;
    default:
      return side satisfies never;
  }
}

export function serializeDiffSide(side?: DiffSide): string {
  if (!side) {
    return 'none';
  }

  switch (side.kind) {
    case 'ref':
      return `ref:${side.ref}:${side.path}`;
    case 'working':
      return `working:${side.absolutePath}:${side.path}`;
    case 'missing':
      return `missing:${side.path}`;
    default:
      return side satisfies never;
  }
}

export function resolveDiffSidePair({
  repoPath,
  filePath,
  oldSide,
  newSide,
  commitHash,
  isWorkingTree,
  absoluteFilePath,
}: ResolveDiffSidePairInput): ResolvedDiffSidePair | null {
  if (oldSide && newSide) {
    return { oldSide, newSide };
  }

  if (commitHash && !isWorkingTree) {
    return {
      oldSide: { kind: 'ref', ref: `${commitHash}^`, path: filePath },
      newSide: { kind: 'ref', ref: commitHash, path: filePath },
    };
  }

  const workingPath = absoluteFilePath ?? joinRepoPath(repoPath, filePath);
  return {
    oldSide: { kind: 'ref', ref: 'HEAD', path: filePath },
    newSide: { kind: 'working', absolutePath: workingPath, path: filePath },
  };
}

export async function loadTextSide(repoPath: string, side: DiffSide): Promise<string | null> {
  if (side.kind === 'missing') {
    return null;
  }

  if (side.kind === 'ref') {
    const result = await ReadFileAtRevisionLarge(repoPath, side.path, side.ref);
    if (result.hasError) {
      if (isMissingFileError(result.error)) {
        return null;
      }
      throw new Error(`Failed to load ${formatSideLabel(side)}: ${result.error || 'Unknown error'}`);
    }
    return result.content;
  }

  const result = await ReadTextFile(side.absolutePath);
  if (!result.success) {
    if (isMissingFileError(result.error)) {
      return null;
    }
    throw new Error(`Failed to load ${formatSideLabel(side)}: ${result.error || 'Unknown error'}`);
  }

  return result.content ?? '';
}

export async function loadBinarySide(repoPath: string, side: DiffSide): Promise<BinarySidePayload | null> {
  if (side.kind === 'missing') {
    return null;
  }

  if (side.kind === 'ref') {
    const result = await GetFileAtRevisionBase64(repoPath, side.path, side.ref);
    if (!result.success) {
      if (isMissingFileError(result.error)) {
        return null;
      }
      throw new Error(`Failed to load ${formatSideLabel(side)}: ${result.error || 'Unknown error'}`);
    }

    if (!result.data) {
      throw new Error(`Failed to load ${formatSideLabel(side)}: empty binary payload`);
    }

    return {
      base64Data: result.data,
      mimeType: result.mimeType,
      size: result.size,
    };
  }

  const result = await ReadFileBase64(side.absolutePath);
  if (!result.success) {
    if (isMissingFileError(result.error)) {
      return null;
    }
    throw new Error(`Failed to load ${formatSideLabel(side)}: ${result.error || 'Unknown error'}`);
  }

  if (!result.data) {
    throw new Error(`Failed to load ${formatSideLabel(side)}: empty binary payload`);
  }

  return {
    base64Data: result.data,
    mimeType: result.mimeType,
    size: result.size,
  };
}