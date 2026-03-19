import { describe, expect, it } from 'vitest';

import './diff-builtins';
import { resolveDiffViewer } from './diff-registry';

describe('diff-builtins', () => {
  it('resolves the unified L5X viewer for merge-review snapshot diffs', () => {
    const viewer = resolveDiffViewer({
      repoPath: '/repo',
      filePath: 'Programs/Main.L5X',
      oldSide: { kind: 'ref', ref: 'origin/main', path: 'Programs/Main.L5X' },
      newSide: { kind: 'ref', ref: 'feature/plc', path: 'Programs/Main.L5X' },
      mode: 'working',
      fileStatus: 'modified',
    });

    expect(viewer?.id).toBe('l5x');
  });

  it('resolves the unified L5X viewer for working-tree snapshot diffs', () => {
    const viewer = resolveDiffViewer({
      repoPath: '/repo',
      filePath: 'Programs/Main.L5X',
      oldSide: { kind: 'ref', ref: 'HEAD', path: 'Programs/Main.L5X' },
      newSide: {
        kind: 'working',
        absolutePath: '/repo/Programs/Main.L5X',
        path: 'Programs/Main.L5X',
      },
      mode: 'working',
      fileStatus: 'modified',
      absoluteFilePath: '/repo/Programs/Main.L5X',
    });

    expect(viewer?.id).toBe('l5x');
  });

  it('resolves the image viewer for merge-review snapshot diffs', () => {
    const viewer = resolveDiffViewer({
      repoPath: '/repo',
      filePath: 'Screenshots/HMI.png',
      oldSide: { kind: 'ref', ref: 'origin/main', path: 'Screenshots/HMI.png' },
      newSide: { kind: 'ref', ref: 'feature/panel', path: 'Screenshots/HMI.png' },
      mode: 'working',
      fileStatus: 'modified',
      binary: true,
    });

    expect(viewer?.id).toBe('image');
  });

  it('resolves the PDF viewer for merge-review snapshot diffs', () => {
    const viewer = resolveDiffViewer({
      repoPath: '/repo',
      filePath: 'Manuals/Recipe.pdf',
      oldSide: { kind: 'ref', ref: 'origin/main', path: 'Manuals/Recipe.pdf' },
      newSide: { kind: 'ref', ref: 'feature/docs', path: 'Manuals/Recipe.pdf' },
      mode: 'working',
      fileStatus: 'modified',
      binary: true,
    });

    expect(viewer?.id).toBe('pdf');
  });

  it('resolves the 3D model viewer for working-tree snapshot diffs', () => {
    const viewer = resolveDiffViewer({
      repoPath: '/repo',
      filePath: 'Models/Fixture.step',
      oldSide: { kind: 'ref', ref: 'HEAD', path: 'Models/Fixture.step' },
      newSide: {
        kind: 'working',
        absolutePath: '/repo/Models/Fixture.step',
        path: 'Models/Fixture.step',
      },
      mode: 'working',
      fileStatus: 'modified',
      absoluteFilePath: '/repo/Models/Fixture.step',
      binary: true,
    });

    expect(viewer?.id).toBe('model-3d');
  });
});