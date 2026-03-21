import { describe, expect, it } from 'vitest';

import {
  buildCommitDiffRequest,
  buildMergeReviewDiffRequest,
  buildWorkingTreeDiffRequest,
} from './diff-request-adapters';

describe('diff-request-adapters', () => {
  it('builds working tree requests with HEAD vs working snapshots', () => {
    const request = buildWorkingTreeDiffRequest({
      repoPath: '/repo',
      filePath: 'Programs/Mixer.L5X',
      absoluteFilePath: '/repo/Programs/Mixer.L5X',
      fileStatus: 'modified',
      showHeader: true,
    });

    expect(request.filePath).toBe('Programs/Mixer.L5X');
    expect(request.oldSide).toEqual({
      kind: 'ref',
      ref: 'HEAD',
      path: 'Programs/Mixer.L5X',
    });
    expect(request.newSide).toEqual({
      kind: 'working',
      absolutePath: '/repo/Programs/Mixer.L5X',
      path: 'Programs/Mixer.L5X',
    });
    expect(request).not.toHaveProperty('mode');
    expect(request).not.toHaveProperty('absoluteFilePath');
  });

  it('normalizes untracked working files into added snapshots', () => {
    const request = buildWorkingTreeDiffRequest({
      repoPath: '/repo',
      filePath: 'Programs/NewFile.L5X',
      absoluteFilePath: '/repo/Programs/NewFile.L5X',
      fileStatus: 'untracked',
    });

    expect(request.fileStatus).toBe('added');
    expect(request.oldSide).toEqual({ kind: 'missing', path: 'Programs/NewFile.L5X' });
    expect(request.newSide).toEqual({
      kind: 'working',
      absolutePath: '/repo/Programs/NewFile.L5X',
      path: 'Programs/NewFile.L5X',
    });
  });

  it('uses the old path as the viewer path for deleted files', () => {
    const request = buildMergeReviewDiffRequest({
      repoPath: '/repo',
      filePath: 'Programs/Deleted.L5X',
      oldPath: 'Programs/Original.L5X',
      fileStatus: 'deleted',
      targetRef: 'origin/main',
      sourceRef: 'feature/plc-update',
    });

    expect(request.filePath).toBe('Programs/Original.L5X');
    expect(request.oldSide).toEqual({
      kind: 'ref',
      ref: 'origin/main',
      path: 'Programs/Original.L5X',
    });
    expect(request.newSide).toEqual({ kind: 'missing', path: 'Programs/Deleted.L5X' });
  });

  it('builds commit requests with parent vs commit refs for renamed files', () => {
    const request = buildCommitDiffRequest({
      repoPath: '/repo',
      filePath: 'Programs/NewName.L5X',
      oldPath: 'Programs/OldName.L5X',
      fileStatus: 'renamed',
      commitHash: 'abc123',
    });

    expect(request.oldSide).toEqual({
      kind: 'ref',
      ref: 'abc123^',
      path: 'Programs/OldName.L5X',
    });
    expect(request.newSide).toEqual({
      kind: 'ref',
      ref: 'abc123',
      path: 'Programs/NewName.L5X',
    });
    expect(request).not.toHaveProperty('mode');
    expect(request).not.toHaveProperty('commitHash');
    expect(request).not.toHaveProperty('parentHash');
  });
});
