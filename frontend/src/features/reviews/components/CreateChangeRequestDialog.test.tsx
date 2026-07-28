import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setActiveView, loadChangeRequestTargets, createChangeRequest, toastSuccess, toastError } = vi.hoisted(() => ({
  setActiveView: vi.fn(),
  loadChangeRequestTargets: vi.fn(),
  createChangeRequest: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const repoState = {
  loadChangeRequestTargets,
  createChangeRequest,
  isCreatingChangeRequest: false,
};

vi.mock('../../../context', () => ({
  useRepo: () => repoState,
  useLayout: () => ({ setActiveView }),
}));

vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), error: (...args: unknown[]) => toastError(...args) },
}));

import CreateChangeRequestDialog from './CreateChangeRequestDialog';

describe('CreateChangeRequestDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoState.isCreatingChangeRequest = false;
    loadChangeRequestTargets.mockResolvedValue({
      success: true,
      branches: [
        { name: 'main', isDefault: true },
        { name: 'feature/x', isDefault: false },
      ],
      defaultBranch: 'main',
    });
    createChangeRequest.mockResolvedValue({ success: true, isDuplicate: false, changeRequest: { number: 5 } });
  });

  it('loads target branches when opened and fixes the source branch', async () => {
    render(
      <CreateChangeRequestDialog open onOpenChange={vi.fn()} sourceBranch="feature/x" defaultTargetBranch="main" />,
    );

    await waitFor(() => expect(loadChangeRequestTargets).toHaveBeenCalledOnce());
    // The source branch is fixed and rendered as a disabled input.
    expect(screen.getByDisplayValue('feature/x')).toBeDisabled();
  });

  it('requires a title before the request can be created', async () => {
    render(
      <CreateChangeRequestDialog open onOpenChange={vi.fn()} sourceBranch="feature/x" defaultTargetBranch="main" />,
    );

    await waitFor(() => expect(loadChangeRequestTargets).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /Create Request/i })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Summarize the changes'), { target: { value: 'Update mixer' } });
    expect(screen.getByRole('button', { name: /Create Request/i })).toBeEnabled();
  });

  it('creates the request and navigates to Reviews on success', async () => {
    const onOpenChange = vi.fn();
    render(
      <CreateChangeRequestDialog open onOpenChange={onOpenChange} sourceBranch="feature/x" defaultTargetBranch="main" />,
    );

    await waitFor(() => expect(loadChangeRequestTargets).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText('Summarize the changes'), { target: { value: 'Update mixer' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Request/i }));

    await waitFor(() => expect(createChangeRequest).toHaveBeenCalledWith({
      sourceBranch: 'feature/x',
      targetBranch: 'main',
      title: 'Update mixer',
      body: '',
    }));
    expect(setActiveView).toHaveBeenCalledWith('reviews');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('surfaces an error and stays open when creation fails', async () => {
    createChangeRequest.mockResolvedValue({ success: false, isDuplicate: false, error: 'Branch not synced', errorCode: 'branch_not_synced' });
    const onOpenChange = vi.fn();
    render(
      <CreateChangeRequestDialog open onOpenChange={onOpenChange} sourceBranch="feature/x" defaultTargetBranch="main" />,
    );

    await waitFor(() => expect(loadChangeRequestTargets).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText('Summarize the changes'), { target: { value: 'Update mixer' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Request/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Branch not synced'));
    expect(setActiveView).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
