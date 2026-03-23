import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MergeReviewFile } from '../../../../context';
import MergeReviewPane from './MergeReviewPane';

vi.mock('./MergeReviewPreview', () => ({
  default: ({ reviewFilePath }: { reviewFilePath: string | null }) => (
    <div data-testid="merge-review-preview">preview:{reviewFilePath ?? 'none'}</div>
  ),
}));

const reviewFiles: MergeReviewFile[] = [
  { path: 'logic/alpha.L5X', status: 'modified' },
  { path: 'logic/beta.L5X', status: 'renamed', oldPath: 'logic/beta-old.L5X' },
  { path: 'logic/gamma.L5X', status: 'added' },
];

describe('MergeReviewPane', () => {
  it('navigates between files from the toolbar', () => {
    const onReviewFile = vi.fn().mockResolvedValue(undefined);

    render(
      <MergeReviewPane
        repoPath="/tmp/repo"
        mergeReviewFiles={reviewFiles}
        selectedReviewFiles={reviewFiles.map((file) => file.path)}
        reviewFilePath="logic/beta.L5X"
        reviewDiff={null}
        isLoadingMergeReviewFiles={false}
        isLoadingReviewDiff={false}
        onToggleReviewFile={vi.fn()}
        onToggleAllReviewFiles={vi.fn()}
        onReviewFile={onReviewFile}
      />,
    );

    expect(screen.getByText('logic/beta-old.L5X → logic/beta.L5X')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous file' }));
    expect(onReviewFile).toHaveBeenCalledWith('logic/alpha.L5X');

    fireEvent.click(screen.getByRole('button', { name: 'Next file' }));
    expect(onReviewFile).toHaveBeenCalledWith('logic/gamma.L5X');
  });

  it('opens the files popover and routes file actions through the shared list', () => {
    const onReviewFile = vi.fn().mockResolvedValue(undefined);
    const onToggleReviewFile = vi.fn();
    const onToggleAllReviewFiles = vi.fn();

    render(
      <MergeReviewPane
        repoPath="/tmp/repo"
        mergeReviewFiles={reviewFiles}
        selectedReviewFiles={['logic/alpha.L5X']}
        reviewFilePath="logic/alpha.L5X"
        reviewDiff={null}
        isLoadingMergeReviewFiles={false}
        isLoadingReviewDiff={false}
        onToggleReviewFile={onToggleReviewFile}
        onToggleAllReviewFiles={onToggleAllReviewFiles}
        onReviewFile={onReviewFile}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Selected files/ }));

    expect(screen.getAllByText('Selected files').length).toBeGreaterThan(1);
    expect(screen.getByText('These are the files that will be included when you continue the merge.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Select all files'));
    expect(onToggleAllReviewFiles).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Preview logic\/gamma\.L5X/i }));
    expect(onReviewFile).toHaveBeenCalledWith('logic/gamma.L5X');
  });
});