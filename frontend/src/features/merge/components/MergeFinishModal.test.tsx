import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionStore, toastStore } = vi.hoisted(() => ({
  sessionStore: {
    current: {
      session: null as Record<string, unknown> | null,
      entries: [] as { path: string }[],
      isBusy: false,
      shareUpdate: vi.fn(),
      cancelUpdate: vi.fn(),
    },
  },
  toastStore: {
    success: vi.fn(),
  },
}));

vi.mock('../../integration', () => ({
  useIntegrationSession: () => sessionStore.current,
}));

vi.mock('../../integration/components/SessionConflictResolver', () => ({
  default: () => <div>Embedded session conflict resolver</div>,
}));

vi.mock('sonner', () => ({ toast: toastStore }));

import MergeFinishModal from './MergeFinishModal';

function update(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'abc',
    state: 'updated',
    message: 'Your work is up to date with the shared project.',
    sourceBranch: 'feature/tank-logic',
    targetBranch: 'main',
    error: '',
    ...overrides,
  };
}

describe('MergeFinishModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStore.current = {
      session: update(),
      entries: [],
      isBusy: false,
      shareUpdate: vi.fn().mockResolvedValue({ success: true, message: 'Shared' }),
      cancelUpdate: vi.fn().mockResolvedValue({ success: true, message: 'Restored' }),
    };
  });

  it('does not start an update when opened without an active session', () => {
    sessionStore.current = { ...sessionStore.current, session: null };

    render(<MergeFinishModal open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Update status')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share updated work' })).not.toBeInTheDocument();
  });

  it('asks before sharing an updated feature', async () => {
    const onOpenChange = vi.fn();
    render(<MergeFinishModal open onOpenChange={onOpenChange} />);

    expect(screen.getByText('Share updated work?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share updated work' }));

    await waitFor(() => expect(sessionStore.current.shareUpdate).toHaveBeenCalledTimes(1));
    expect(toastStore.success).toHaveBeenCalledWith('Shared');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps a failed share open and shows the inline recovery message', async () => {
    const onOpenChange = vi.fn();
    sessionStore.current = {
      ...sessionStore.current,
      shareUpdate: vi.fn().mockResolvedValue({
        success: false,
        error: 'Your updated work is still saved on this computer. Check your connection, then try again.',
      }),
    };

    render(<MergeFinishModal open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share updated work' }));

    await waitFor(() => expect(sessionStore.current.shareUpdate).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/still saved on this computer/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('embeds Conflict Review and does not offer sharing while files need decisions', () => {
    sessionStore.current = {
      ...sessionStore.current,
      session: update({ state: 'needs-decisions' }),
      entries: [{ path: 'logic/alpha.L5X' }, { path: 'logic/beta.L5X' }],
    };

    render(<MergeFinishModal open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Conflict Review')).toBeInTheDocument();
    expect(screen.getByText('Embedded session conflict resolver')).toBeInTheDocument();
    expect(screen.getByText('2 files need a decision')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share updated work' })).not.toBeInTheDocument();
  });

  it('confirms restoration before cancelling an interrupted update', async () => {
    sessionStore.current = {
      ...sessionStore.current,
      session: update({ state: 'needs-decisions' }),
      entries: [{ path: 'logic/alpha.L5X' }],
    };
    render(<MergeFinishModal open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel update' }));

    expect(await screen.findByText('Cancel this update?')).toBeInTheDocument();
    expect(screen.getByText(/restore the project to exactly how it was/)).toBeInTheDocument();
    expect(sessionStore.current.cancelUpdate).not.toHaveBeenCalled();
  });

  it('offers cancellation when automatic completion fails', () => {
    sessionStore.current = {
      ...sessionStore.current,
      session: update({
        state: 'failed',
        error: 'The update could not finish. Check your project requirements, then try again.',
      }),
    };

    render(<MergeFinishModal open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Cancel update' })).toBeEnabled();
  });

  it('keeps the modal open and shows recovery guidance when cancellation fails', async () => {
    const onOpenChange = vi.fn();
    sessionStore.current = {
      ...sessionStore.current,
      session: update({ state: 'failed' }),
      cancelUpdate: vi.fn().mockResolvedValue({
        success: false,
        error: "The update wasn't cancelled. Close and reopen the project, then try again.",
      }),
    };
    render(<MergeFinishModal open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel update' }));
    const cancelButtons = await screen.findAllByRole('button', { name: 'Cancel update' });
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);

    expect(await screen.findByText(/wasn't cancelled/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('closes Conflict Review after the last decision completes the update', async () => {
    const onOpenChange = vi.fn();
    sessionStore.current = {
      ...sessionStore.current,
      session: update({ state: 'needs-decisions' }),
      entries: [{ path: 'logic/alpha.L5X' }],
    };
    const { rerender } = render(
      <MergeFinishModal open onOpenChange={(value) => onOpenChange(value)} />,
    );

    sessionStore.current = { ...sessionStore.current, session: update() };
    rerender(<MergeFinishModal open onOpenChange={(value) => onOpenChange(value)} />);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
