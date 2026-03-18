import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../bindings/controlzebra/services/gitservice', () => ({
  GetFileAtRevisionBase64: vi.fn(),
  ReadFileAtRevisionLarge: vi.fn(),
}));

vi.mock('../../../../bindings/controlzebra/services/filesystemservice', () => ({
  ReadFileBase64: vi.fn(),
  ReadTextFile: vi.fn(),
}));

import { GetFileAtRevisionBase64, ReadFileAtRevisionLarge } from '../../../../bindings/controlzebra/services/gitservice';
import { ReadFileBase64, ReadTextFile } from '../../../../bindings/controlzebra/services/filesystemservice';
import {
  loadBinarySide,
  loadTextSide,
  resolveDiffSidePair,
  serializeDiffSide,
} from './diff-side-loaders';

describe('diff-side-loaders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers explicit old/new sides when they are present', () => {
    const oldSide = { kind: 'ref', ref: 'origin/main', path: 'Programs/Main.L5X' } as const;
    const newSide = { kind: 'ref', ref: 'feature/plc', path: 'Programs/Main.L5X' } as const;

    const resolved = resolveDiffSidePair({
      repoPath: '/repo',
      filePath: 'Programs/Main.L5X',
      oldSide,
      newSide,
      commitHash: 'abc123',
      isWorkingTree: true,
    });

    expect(resolved).toEqual({ oldSide, newSide });
  });

  it('builds legacy commit sides from parent and commit refs', () => {
    const resolved = resolveDiffSidePair({
      repoPath: '/repo',
      filePath: 'Programs/Main.L5X',
      commitHash: 'abc123',
    });

    expect(resolved).toEqual({
      oldSide: { kind: 'ref', ref: 'abc123^', path: 'Programs/Main.L5X' },
      newSide: { kind: 'ref', ref: 'abc123', path: 'Programs/Main.L5X' },
    });
  });

  it('builds legacy working-tree sides with an absolute path', () => {
    const resolved = resolveDiffSidePair({
      repoPath: '/repo',
      filePath: 'Programs/Main.L5X',
    });

    expect(resolved).toEqual({
      oldSide: { kind: 'ref', ref: 'HEAD', path: 'Programs/Main.L5X' },
      newSide: {
        kind: 'working',
        absolutePath: '/repo/Programs/Main.L5X',
        path: 'Programs/Main.L5X',
      },
    });
  });

  it('loads ref text content through the git service', async () => {
    vi.mocked(ReadFileAtRevisionLarge).mockResolvedValue({
      hasError: false,
      content: '<L5X />',
    });

    await expect(
      loadTextSide('/repo', { kind: 'ref', ref: 'origin/main', path: 'Programs/Main.L5X' }),
    ).resolves.toBe('<L5X />');

    expect(ReadFileAtRevisionLarge).toHaveBeenCalledWith('/repo', 'Programs/Main.L5X', 'origin/main');
  });

  it('treats missing working-tree text files as absent sides', async () => {
    vi.mocked(ReadTextFile).mockResolvedValue({
      success: false,
      error: 'file does not exist',
    });

    await expect(
      loadTextSide('/repo', {
        kind: 'working',
        absolutePath: '/repo/Programs/Missing.L5X',
        path: 'Programs/Missing.L5X',
      }),
    ).resolves.toBeNull();
  });

  it('loads working-tree binary content through the filesystem service', async () => {
    vi.mocked(ReadFileBase64).mockResolvedValue({
      success: true,
      data: 'ZmFrZQ==',
      mimeType: 'application/pdf',
      size: 4,
    });

    await expect(
      loadBinarySide('/repo', {
        kind: 'working',
        absolutePath: '/repo/Docs/Manual.pdf',
        path: 'Docs/Manual.pdf',
      }),
    ).resolves.toEqual({
      base64Data: 'ZmFrZQ==',
      mimeType: 'application/pdf',
      size: 4,
    });

    expect(ReadFileBase64).toHaveBeenCalledWith('/repo/Docs/Manual.pdf');
  });

  it('throws a clear error when a binary ref load fails', async () => {
    vi.mocked(GetFileAtRevisionBase64).mockResolvedValue({
      success: false,
      error: 'git cat-file failed',
    });

    await expect(
      loadBinarySide('/repo', { kind: 'ref', ref: 'origin/main', path: 'Docs/Manual.pdf' }),
    ).rejects.toThrow('Failed to load origin/main:Docs/Manual.pdf: git cat-file failed');
  });

  it('serializes working sides with their absolute path for cache keys', () => {
    expect(
      serializeDiffSide({
        kind: 'working',
        absolutePath: '/repo/Docs/Manual.pdf',
        path: 'Docs/Manual.pdf',
      }),
    ).toBe('working:/repo/Docs/Manual.pdf:Docs/Manual.pdf');
  });
});