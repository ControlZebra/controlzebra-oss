import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    loadConflictResolutionData: vi.fn().mockResolvedValue(null),
    resolveConflictWithContent: vi.fn().mockResolvedValue(false),
    isSquashMerge: true,
    setIsSquashMerge: vi.fn(),
    currentBranch: 'feature/tank-logic',
    availableBranches: [{ name: 'main', isCurrent: false }],
    targetBranch: 'main',
    setTargetBranch: vi.fn(),
    handleTargetBranchChange: vi.fn(),
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a changed files table with View changes buttons in the review state', () => {
    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      mergeReviewFiles: [
        { path: 'logic/alpha.L5X', status: 'modified' },
        { path: 'logic/beta.L5X', status: 'modified' },
      ],
      selectedReviewFiles: ['logic/alpha.L5X'],
      reviewFilePath: 'logic/alpha.L5X',
    }));

    render(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Merge review' })).toBeInTheDocument();
    expect(screen.getByText('feature/tank-logic')).toBeInTheDocument();
    expect(screen.getAllByText('main').length).toBeGreaterThan(0);
    expect(screen.getByText('(Current branch)')).toBeInTheDocument();
    expect(screen.getByText('2 files changed')).toBeInTheDocument();
    expect(screen.getByText('1 file to merge')).toBeInTheDocument();
    expect(screen.getByText('No conflicts')).toBeInTheDocument();
    expect(screen.getByText('logic/alpha.L5X')).toBeInTheDocument();
    expect(screen.getByText('logic/beta.L5X')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /View changes/i }).length).toBe(2);
    expect(screen.queryByText('No conflicts found. Review the files if you want, then merge when ready.')).not.toBeInTheDocument();
    expect(screen.queryByText('Squash merge')).not.toBeInTheDocument();
  });

  it('lets the user open the target branch drawer and choose another destination branch', async () => {
    const handleTargetBranchChange = vi.fn();

    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      availableBranches: [
        { name: 'main', isCurrent: false },
        { name: 'release/v1', isCurrent: false },
      ],
      handleTargetBranchChange,
    }));

    render(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change target branch from main' }));

    await waitFor(() => {
      expect(screen.getByText('Choose a destination branch')).toBeInTheDocument();
    });
    expect(screen.getAllByText('(Current branch)').length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole('button', { name: /release\/v1/i }));

    expect(handleTargetBranchChange).toHaveBeenCalledWith('release/v1');
  });

  it('opens the diff viewer when clicking View changes on a file in the review table', () => {
    const handleReviewFile = vi.fn().mockResolvedValue(undefined);

    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      mergeReviewFiles: [
        { path: 'logic/alpha.L5X', status: 'modified' },
        { path: 'logic/beta.L5X', status: 'modified' },
      ],
      selectedReviewFiles: ['logic/alpha.L5X'],
      reviewFilePath: null,
      handleReviewFile,
    }));

    render(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    const viewButtons = screen.getAllByRole('button', { name: /View changes/i });
    fireEvent.click(viewButtons[1]);

    expect(handleReviewFile).toHaveBeenCalledWith('logic/beta.L5X');
    expect(screen.getByText('logic/beta.L5X')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to files/i })).toBeInTheDocument();
  });

  it('returns to the file table when clicking Back to files from the diff viewer', () => {
    const handleReviewFile = vi.fn().mockResolvedValue(undefined);

    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      mergeReviewFiles: [
        { path: 'logic/alpha.L5X', status: 'modified' },
        { path: 'logic/beta.L5X', status: 'modified' },
      ],
      selectedReviewFiles: ['logic/alpha.L5X'],
      reviewFilePath: null,
      handleReviewFile,
    }));

    render(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    const viewButtons = screen.getAllByRole('button', { name: /View changes/i });
    fireEvent.click(viewButtons[0]);

    expect(screen.getByRole('button', { name: /Back to files/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back to files/i }));

    expect(screen.queryByRole('button', { name: /Back to files/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /View changes/i }).length).toBe(2);
  });

  it('shows the dry-run conflict summary before the live merge starts', () => {
    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      conflictedFiles: [
        { path: 'logic/alpha.L5X', status: 'both-modified' },
      ],
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
    expect(screen.getByRole('button', { name: /Start guided merge/i })).toBeInTheDocument();
    expect(screen.getByText('logic/alpha.L5X')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View changes/i })).toBeInTheDocument();
    expect(screen.queryByText('Choose files for this merge')).not.toBeInTheDocument();
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

  it('keeps fast preflight results in preparing briefly before revealing the summary', () => {
    vi.useFakeTimers();

    let controllerValue = createControllerValue({
      isCheckingConflicts: true,
      conflictCheckResult: null,
    });

    useMergeFlowControllerMock.mockImplementation(() => controllerValue);

    const { rerender } = render(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Preparing merge' })).toBeInTheDocument();
    expect(screen.getByText('processing')).toBeInTheDocument();

    controllerValue = createControllerValue({
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
    });

    rerender(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Preparing merge' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ready to merge' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(599);
    });

    expect(screen.getByRole('heading', { name: 'Preparing merge' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByRole('heading', { name: 'Ready to merge' })).toBeInTheDocument();
  });

  it('keeps conflict resolution inside the modal and does not trigger background file actions', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: /Keep Current File/ }));

    expect(handleResolve).toHaveBeenCalledWith('logic/alpha.L5X', 'mine');
    expect(openInDefaultApp).not.toHaveBeenCalled();
  });

  it('loads an eligible text conflict, previews a choice, and applies the composed file', async () => {
    const loadConflictResolutionData = vi.fn().mockResolvedValue({
      success: true,
      path: 'notes/process.txt',
      status: 'both-modified',
      eligible: true,
      base: { present: true },
      current: { present: true },
      incoming: { present: true },
      segments: [
        { kind: 'context', text: 'before\n' },
        {
          kind: 'conflict',
          conflict: {
            id: 'region-1',
            current: ['current value'],
            base: ['old value'],
            incoming: ['incoming value'],
          },
        },
        { kind: 'context', text: 'after\n' },
      ],
      resolutionToken: 'token-1',
      newline: '\n',
      hasFinalNewline: true,
    });
    const resolveConflictWithContent = vi.fn().mockResolvedValue(true);

    useMergeFlowControllerMock.mockReturnValue(createControllerValue({
      conflictedFiles: [{ path: 'notes/process.txt', status: 'both-modified' }],
      selectedConflictFile: 'notes/process.txt',
      conflictCheckResult: {
        success: true,
        hasConflicts: true,
        conflictedFiles: [{ path: 'notes/process.txt', status: 'both-modified' }],
        parentBranch: 'main',
        targetBranch: 'main',
        sourceBranch: 'feature/tank-logic',
        mergeStarted: true,
        isSquashMerge: true,
        liveMergePhase: 'resolving',
      },
      loadConflictResolutionData,
      resolveConflictWithContent,
    }));

    render(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Resolve text conflicts' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Use Incoming/ }));

    expect(screen.getByLabelText('Resolved file preview')).toHaveTextContent('before incoming value after');
    fireEvent.click(screen.getByRole('button', { name: 'Resolve File' }));

    await waitFor(() => {
      expect(resolveConflictWithContent).toHaveBeenCalledWith(
        'notes/process.txt',
        'token-1',
        'before\nincoming value\nafter\n',
      );
    });
  });

  it('keeps each text conflict draft while moving between files', async () => {
    const conflictedFiles = [
      { path: 'notes/first.txt', status: 'both-modified' as const },
      { path: 'notes/second.txt', status: 'both-modified' as const },
    ];
    const loadConflictResolutionData = vi.fn().mockImplementation(async (path: string) => ({
      success: true,
      path,
      status: 'both-modified',
      eligible: true,
      base: { present: true },
      current: { present: true },
      incoming: { present: true },
      segments: [
        {
          kind: 'conflict',
          conflict: {
            id: `region-${path}`,
            current: [`current ${path}`],
            base: [`old ${path}`],
            incoming: [`incoming ${path}`],
          },
        },
      ],
      resolutionToken: `token-${path}`,
      newline: '\n',
      hasFinalNewline: false,
    }));
    const mergeResult = {
      success: true,
      hasConflicts: true,
      conflictedFiles,
      parentBranch: 'main',
      targetBranch: 'main',
      sourceBranch: 'feature/tank-logic',
      mergeStarted: true,
      isSquashMerge: true,
      liveMergePhase: 'resolving',
    };
    let controllerValue: Record<string, unknown> = createControllerValue({
      conflictedFiles,
      selectedConflictFile: 'notes/first.txt',
      conflictCheckResult: mergeResult,
      loadConflictResolutionData,
    });
    useMergeFlowControllerMock.mockImplementation(() => controllerValue);

    const { rerender } = render(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    await screen.findByText('current notes/first.txt');
    fireEvent.click(screen.getByRole('button', { name: /Use Current/ }));

    controllerValue = {
      ...controllerValue,
      selectedConflictFile: 'notes/second.txt',
    };
    rerender(<ExplorerMergeModal open onOpenChange={vi.fn()} />);
    await screen.findByText('current notes/second.txt');
    fireEvent.click(screen.getByRole('button', { name: /Use Incoming/ }));

    controllerValue = {
      ...controllerValue,
      selectedConflictFile: 'notes/first.txt',
    };
    rerender(<ExplorerMergeModal open onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Use Current/ })).toHaveAttribute('aria-pressed', 'true');
    });
    expect(loadConflictResolutionData).toHaveBeenCalledTimes(2);
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