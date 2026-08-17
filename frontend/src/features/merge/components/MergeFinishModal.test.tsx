import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repoStore, sessionStore } = vi.hoisted(() => ({
  repoStore: {
    current: {
      repoPath: '/tmp/repo',
      mergeReviewFiles: [] as unknown[],
      isLoadingMergeReviewFiles: false,
      loadMergeReviewFiles: vi.fn().mockResolvedValue([]),
      loadMergeReviewFileDiff: vi.fn().mockResolvedValue(null),
    },
  },
  sessionStore: {
    current: {
      session: null as Record<string, unknown> | null,
      entries: [] as { path: string }[],
      isBusy: false,
      finish: vi.fn(),
      cancelReview: vi.fn(),
      refresh: vi.fn(),
    },
  },
}));

vi.mock('../../../context', () => ({
  useRepo: () => repoStore.current,
}));

vi.mock('../../integration', () => ({
  useIntegrationSession: () => sessionStore.current,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import MergeFinishModal from './MergeFinishModal';

function review(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'abc',
    state: 'ready',
    message: 'Your work is ready to be combined with the shared project.',
    sourceBranch: 'feature/tank-logic',
    targetBranch: 'main',
    sourceOid: 'aaa111',
    destinationOid: 'bbb222',
    hasResult: true,
    error: '',
    ...overrides,
  };
}

describe('MergeFinishModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoStore.current = {
      repoPath: '/tmp/repo',
      mergeReviewFiles: [],
      isLoadingMergeReviewFiles: false,
      loadMergeReviewFiles: vi.fn().mockResolvedValue([]),
      loadMergeReviewFileDiff: vi.fn().mockResolvedValue(null),
    };
    sessionStore.current = {
      session: review(),
      entries: [],
      isBusy: false,
      finish: vi.fn().mockResolvedValue({ success: true, message: 'Done' }),
      cancelReview: vi.fn().mockResolvedValue({ success: true, message: 'Cancelled' }),
      refresh: vi.fn(),
    };
  });

  it('reviews the exact revisions the result was built from', async () => {
    render(<MergeFinishModal open onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(repoStore.current.loadMergeReviewFiles).toHaveBeenCalledWith('bbb222', 'aaa111');
    });
  });

  it('offers Finish when the review is ready', async () => {
    const onOpenChange = vi.fn();
    render(<MergeFinishModal open onOpenChange={onOpenChange} />);

    const finish = screen.getByRole('button', { name: 'Finish' });
    expect(finish).toBeEnabled();

    finish.click();
    await waitFor(() => {
      expect(sessionStore.current.finish).toHaveBeenCalled();
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('refuses to finish while files still need a decision', () => {
    sessionStore.current = {
      ...sessionStore.current,
      session: review({ state: 'needs-decisions', hasResult: false }),
      entries: [{ path: 'logic/alpha.L5X' }, { path: 'logic/beta.L5X' }],
    };

    render(<MergeFinishModal open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Finish' })).toBeDisabled();
    expect(screen.getByText('2 files need a decision')).toBeInTheDocument();
  });

  it('confirms before cancelling and says nothing changes', async () => {
    render(<MergeFinishModal open onOpenChange={vi.fn()} />);

    screen.getByRole('button', { name: 'Cancel review' }).click();

    await waitFor(() => {
      expect(screen.getByText('Cancel this review?')).toBeInTheDocument();
    });
    expect(screen.getByText(/Nothing in your project or the/)).toBeInTheDocument();
    expect(sessionStore.current.cancelReview).not.toHaveBeenCalled();
  });

  it('tells the user when a newer save replaced the review', async () => {
    const { rerender } = render(<MergeFinishModal open onOpenChange={vi.fn()} />);

    sessionStore.current = { ...sessionStore.current, session: review({ sessionId: 'def' }) };
    rerender(<MergeFinishModal open onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/earlier choices were cleared/)).toBeInTheDocument();
    });
  });
});
