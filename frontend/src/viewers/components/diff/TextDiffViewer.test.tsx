import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const diffViewerSpy = vi.fn<(props: unknown) => JSX.Element>((_props) => <div data-testid="diff-viewer" />);

vi.mock('../../../features/explorer/components/DiffViewer', () => ({
  default: (props: unknown) => diffViewerSpy(props),
}));

vi.mock('../../../../bindings/controlzebra/services/gitservice', () => ({
  DiffCommitFileRaw: vi.fn(),
  DiffMergeReviewFileRaw: vi.fn(),
  DiffWorkingRaw: vi.fn(),
}));

import {
  DiffCommitFileRaw,
  DiffMergeReviewFileRaw,
  DiffWorkingRaw,
} from '../../../../bindings/controlzebra/services/gitservice';
import TextDiffViewer from './TextDiffViewer';

describe('TextDiffViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads working tree diffs from HEAD vs working snapshots', async () => {
    vi.mocked(DiffWorkingRaw).mockResolvedValue({
      path: 'Docs/notes.txt',
      status: 'modified',
      binary: false,
      rawDiff: '@@ -1 +1 @@',
      hasError: false,
      error: '',
    });

    render(
      <TextDiffViewer
        repoPath="/repo"
        filePath="Docs/notes.txt"
        oldSide={{ kind: 'ref', ref: 'HEAD', path: 'Docs/notes.txt' }}
        newSide={{ kind: 'working', absolutePath: '/repo/Docs/notes.txt', path: 'Docs/notes.txt' }}
        fileStatus="modified"
      />,
    );

    await waitFor(() => {
      expect(DiffWorkingRaw).toHaveBeenCalledWith('/repo', 'Docs/notes.txt');
    });
    expect(DiffCommitFileRaw).not.toHaveBeenCalled();
    expect(DiffMergeReviewFileRaw).not.toHaveBeenCalled();
  });

  it('loads commit history diffs from parent and commit refs', async () => {
    vi.mocked(DiffCommitFileRaw).mockResolvedValue({
      path: 'Docs/notes.txt',
      status: 'modified',
      binary: false,
      rawDiff: '@@ -1 +1 @@',
      hasError: false,
      error: '',
    });

    render(
      <TextDiffViewer
        repoPath="/repo"
        filePath="Docs/notes.txt"
        oldSide={{ kind: 'ref', ref: 'abc123^', path: 'Docs/notes.txt' }}
        newSide={{ kind: 'ref', ref: 'abc123', path: 'Docs/notes.txt' }}
        fileStatus="modified"
      />,
    );

    await waitFor(() => {
      expect(DiffCommitFileRaw).toHaveBeenCalledWith('/repo', 'abc123', 'Docs/notes.txt');
    });
    expect(DiffWorkingRaw).not.toHaveBeenCalled();
    expect(DiffMergeReviewFileRaw).not.toHaveBeenCalled();
  });

  it('uses preloaded merge-review diffs without fetching', async () => {
    render(
      <TextDiffViewer
        repoPath="/repo"
        filePath="Docs/notes.txt"
        oldSide={{ kind: 'ref', ref: 'origin/main', path: 'Docs/notes.txt' }}
        newSide={{ kind: 'ref', ref: 'feature/docs', path: 'Docs/notes.txt' }}
        fileStatus="modified"
        fileDiff={{
          path: 'Docs/notes.txt',
          status: 'modified',
          binary: false,
          rawDiff: '@@ -1 +1 @@',
          hasError: false,
          error: '',
        } as any}
      />,
    );

    await waitFor(() => {
      expect(diffViewerSpy).toHaveBeenCalled();
    });
    expect(DiffWorkingRaw).not.toHaveBeenCalled();
    expect(DiffCommitFileRaw).not.toHaveBeenCalled();
    expect(DiffMergeReviewFileRaw).not.toHaveBeenCalled();
  });
});