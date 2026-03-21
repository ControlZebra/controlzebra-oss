import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useMergeFlowControllerMock } = vi.hoisted(() => ({
  useMergeFlowControllerMock: vi.fn(),
}));

vi.mock('../hooks/useMergeFlowController', () => ({
  useMergeFlowController: useMergeFlowControllerMock,
}));

import ExplorerMergeModal from './ExplorerMergeModal';

function createControllerValue(overrides: Record<string, unknown> = {}) {
  return {
    repoPath: '/tmp/repo',
    conflictedFiles: [],
    isCheckingConflicts: false,
    conflictCheckResult: {
      success: true,
      hasConflicts: false,
      conflictedFiles: [],
      parentBranch: 'main',
      targetBranch: 'main',
      sourceBranch: 'feature/tank-logic',
      mergeStarted: false,
      isSquashMerge: true,
      liveMergePhase: 'dry-run',
    },
    mergeReviewFiles: [],
    isLoadingMergeReviewFiles: false,
    selectedConflictFile: null,
    setSelectedConflictFile: vi.fn(),
    fileResolutions: {},
    isResolvingConflict: false,
    conflictSidesInfo: null,
    isSquashMerge: true,
    setIsSquashMerge: vi.fn(),
    currentBranch: 'feature/tank-logic',
    availableBranches: [{ name: 'main', isCurrent: false }],
    targetBranch: 'main',
    setTargetBranch: vi.fn(),
    error: null,
    showSuccess: false,
    selectedReviewFiles: [],
    reviewFilePath: null,
    reviewDiff: null,
    isLoadingReviewDiff: false,
    isDeletingMergedBranch: false,
    isCompletingMerge: false,
    effectiveTarget: 'main',
    effectiveSource: 'feature/tank-logic',
    branchToCleanUp: 'feature/tank-logic',
    canDeleteMergedBranch: true,
    handleCheck: vi.fn(),
    handleStartMerge: vi.fn(),
    handleToggleReviewFile: vi.fn(),
    handleToggleAllReviewFiles: vi.fn(),
    handleReviewFile: vi.fn(),
    handleResolve: vi.fn(),
    handleAbort: vi.fn(),
    handleComplete: vi.fn(),
    handleDismiss: vi.fn(),
    handleDeleteMergedBranch: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe('ExplorerMergeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the compact merge review header without the old review or merge-type labels', () => {
    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      mergeReviewFiles: [{ path: 'logic/alpha.L5X', status: 'modified' }],
      selectedReviewFiles: ['logic/alpha.L5X'],
      reviewFilePath: 'logic/alpha.L5X',
    }));

    render(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Merge review' })).toBeInTheDocument();
    expect(screen.getByText('feature/tank-logic')).toBeInTheDocument();
    expect(screen.getAllByText('main').length).toBeGreaterThan(0);
    expect(screen.queryByText('Review available')).not.toBeInTheDocument();
    expect(screen.queryByText('Squash merge')).not.toBeInTheDocument();
  });

  it('opens the selected files drawer from the upper review header and previews the chosen file', () => {
    const handleReviewFile = vi.fn().mockResolvedValue(undefined);

    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      mergeReviewFiles: [
        { path: 'logic/alpha.L5X', status: 'modified' },
        { path: 'logic/beta.L5X', status: 'modified' },
      ],
      selectedReviewFiles: ['logic/alpha.L5X'],
      reviewFilePath: 'logic/alpha.L5X',
      handleReviewFile,
    }));

    render(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Selected files/ }));

    expect(screen.getAllByText('Selected files').length).toBeGreaterThan(1);
    expect(screen.getByText('These are the files that will be included when you continue the merge.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Preview logic\/beta\.L5X/i }));
    expect(handleReviewFile).toHaveBeenCalledWith('logic/beta.L5X');
  });

  it('closes the selected files drawer when clicking outside it', () => {
    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      mergeReviewFiles: [
        { path: 'logic/alpha.L5X', status: 'modified' },
        { path: 'logic/beta.L5X', status: 'modified' },
      ],
      selectedReviewFiles: ['logic/alpha.L5X'],
      reviewFilePath: 'logic/alpha.L5X',
    }));

    render(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Selected files/ }));
    expect(screen.getByText('These are the files that will be included when you continue the merge.')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('These are the files that will be included when you continue the merge.')).not.toBeInTheDocument();
  });

  it('shows the dry-run conflict summary before the live merge starts', () => {
    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      conflictCheckResult: {
        success: true,
        hasConflicts: true,
        conflictedFiles: [
          { path: 'logic/alpha.L5X', status: 'both-modified' },
        ],
        parentBranch: 'main',
        targetBranch: 'main',
        sourceBranch: 'feature/tank-logic',
        mergeStarted: false,
        isSquashMerge: true,
        liveMergePhase: 'dry-run',
      },
    }));

    render(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Needs decisions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start guided merge' })).toBeInTheDocument();
    expect(screen.getByText('logic/alpha.L5X')).toBeInTheDocument();
  });

  it('stays in the preparing state while the live conflict list is still being hydrated', () => {
    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      conflictCheckResult: {
        success: true,
        hasConflicts: true,
        conflictedFiles: [],
        parentBranch: 'main',
        targetBranch: 'main',
        sourceBranch: 'feature/tank-logic',
        mergeStarted: true,
        isSquashMerge: true,
        liveMergePhase: 'starting',
      },
    }));

    render(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Preparing conflict list' })).toBeInTheDocument();
    expect(screen.queryByText('Save my choices and finish')).not.toBeInTheDocument();
  });

  it('keeps conflict resolution inside the modal and does not trigger background file actions', () => {
    const handleResolve = vi.fn();
    const openInDefaultApp = vi.fn();

    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      conflictedFiles: [{ path: 'logic/alpha.L5X', status: 'both-modified' }],
      selectedConflictFile: 'logic/alpha.L5X',
      conflictCheckResult: {
        success: true,
        hasConflicts: true,
        conflictedFiles: [{ path: 'logic/alpha.L5X', status: 'both-modified' }],
        parentBranch: 'main',
        targetBranch: 'main',
        sourceBranch: 'feature/tank-logic',
        mergeStarted: true,
        isSquashMerge: true,
        liveMergePhase: 'resolving',
      },
      handleResolve,
    }));

    render(
      <div onClick={openInDefaultApp}>
        <button type="button">Open in Default App</button>
        <ExplorerMergeModal open onOpenChange={vi.fn()} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Keep Mine/ }));

    expect(handleResolve).toHaveBeenCalledWith('logic/alpha.L5X', 'mine');
    expect(openInDefaultApp).not.toHaveBeenCalled();
  });

  it('opens a safe close confirmation when Escape is pressed during an active merge', async () => {
    const onOpenChange = vi.fn();

    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      conflictedFiles: [{ path: 'logic/alpha.L5X', status: 'both-modified' }],
      selectedConflictFile: 'logic/alpha.L5X',
      conflictCheckResult: {
        success: true,
        hasConflicts: true,
        conflictedFiles: [{ path: 'logic/alpha.L5X', status: 'both-modified' }],
        parentBranch: 'main',
        targetBranch: 'main',
        sourceBranch: 'feature/tank-logic',
        mergeStarted: true,
        isSquashMerge: true,
        liveMergePhase: 'resolving',
      },
    }));

    render(<ExplorerMergeModal open onOpenChange={onOpenChange} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.getByText('Leave merge?')).toBeInTheDocument();
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});