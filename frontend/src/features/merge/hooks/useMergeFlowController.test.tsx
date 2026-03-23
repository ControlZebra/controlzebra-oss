import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useRepoMock } = vi.hoisted(() => ({
  useRepoMock: vi.fn(),
}));

vi.mock('../../../context', () => ({
  useRepo: useRepoMock,
}));

import { useMergeFlowController } from './useMergeFlowController';

function createRepoValue(overrides: Record<string, unknown> = {}) {
  return {
    repoPath: null,
    repoInfo: { branch: 'feature/tank-logic' },
    branches: null,
    conflictedFiles: [],
    isCheckingConflicts: false,
    conflictCheckResult: null,
    mergeReviewFiles: [],
    isLoadingMergeReviewFiles: false,
    selectedConflictFile: null,
    setSelectedConflictFile: vi.fn(),
    detectedParentBranch: null,
    fetchParentBranch: vi.fn(),
    checkConflictsOnly: vi.fn(),
    loadMergeReviewFileDiff: vi.fn(),
    startMerge: vi.fn().mockResolvedValue({ success: true }),
    clearConflicts: vi.fn(),
    fileResolutions: {},
    resolveConflict: vi.fn(),
    abortMerge: vi.fn(),
    completeMerge: vi.fn(),
    deleteBranch: vi.fn(),
    isResolvingConflict: false,
    conflictSidesInfo: null,
    refreshBranches: vi.fn(),
    isSquashMerge: true,
    setIsSquashMerge: vi.fn(),
    ...overrides,
  };
}

describe('useMergeFlowController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips repository setup work when disabled', () => {
    const fetchParentBranch = vi.fn();
    const refreshBranches = vi.fn();

    useRepoMock.mockReturnValue(createRepoValue({
      repoPath: '/tmp/repo',
      detectedParentBranch: null,
      branches: null,
      fetchParentBranch,
      refreshBranches,
    }));

    renderHook(() => useMergeFlowController({ enabled: false }));

    expect(fetchParentBranch).not.toHaveBeenCalled();
    expect(refreshBranches).not.toHaveBeenCalled();
  });

  it('uses selective merge when the user narrows the clean review selection', async () => {
    const startMerge = vi.fn().mockResolvedValue({ success: true });

    useRepoMock.mockReturnValue(createRepoValue({
      startMerge,
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
      mergeReviewFiles: [
        { path: 'logic/alpha.L5X' },
        { path: 'logic/beta.L5X' },
      ],
    }));

    const { result } = renderHook(() => useMergeFlowController());

    await waitFor(() => {
      expect(result.current.selectedReviewFiles).toEqual(['logic/alpha.L5X', 'logic/beta.L5X']);
    });

    act(() => {
      result.current.handleToggleReviewFile('logic/beta.L5X');
    });

    await act(async () => {
      await result.current.handleStartMerge();
    });

    expect(startMerge).toHaveBeenCalledWith('', '', {
      squash: true,
      selective: true,
      selectedFiles: ['logic/alpha.L5X'],
    });
  });

  it('keeps a full clean selection on the regular merge path', async () => {
    const startMerge = vi.fn().mockResolvedValue({ success: true });

    useRepoMock.mockReturnValue(createRepoValue({
      startMerge,
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
      mergeReviewFiles: [
        { path: 'logic/alpha.L5X' },
        { path: 'logic/beta.L5X' },
      ],
    }));

    const { result } = renderHook(() => useMergeFlowController());

    await waitFor(() => {
      expect(result.current.selectedReviewFiles).toEqual(['logic/alpha.L5X', 'logic/beta.L5X']);
    });

    await act(async () => {
      await result.current.handleStartMerge();
    });

    expect(startMerge).toHaveBeenCalledWith('', '', {
      squash: true,
      selective: false,
      selectedFiles: [],
    });
  });

  it('uses selective merge for conflict merges when the user narrows the file set', async () => {
    const startMerge = vi.fn().mockResolvedValue({ success: true });

    useRepoMock.mockReturnValue(createRepoValue({
      startMerge,
      conflictCheckResult: {
        success: true,
        hasConflicts: true,
        conflictedFiles: [{ path: 'logic/alpha.L5X', status: 'both-modified' }],
        parentBranch: 'main',
        targetBranch: 'main',
        sourceBranch: 'feature/tank-logic',
        mergeStarted: false,
        isSquashMerge: true,
        liveMergePhase: 'dry-run',
      },
      mergeReviewFiles: [
        { path: 'logic/alpha.L5X' },
        { path: 'logic/beta.L5X' },
      ],
    }));

    const { result } = renderHook(() => useMergeFlowController());

    await waitFor(() => {
      expect(result.current.selectedReviewFiles).toEqual(['logic/alpha.L5X', 'logic/beta.L5X']);
    });

    act(() => {
      result.current.handleToggleReviewFile('logic/beta.L5X');
    });

    await act(async () => {
      await result.current.handleStartMerge();
    });

    expect(startMerge).toHaveBeenCalledWith('', '', {
      squash: true,
      selective: true,
      selectedFiles: ['logic/alpha.L5X'],
    });
    expect(result.current.error).toBeNull();
  });

  it('keeps controller state intact when aborting the merge fails', async () => {
    const abortMerge = vi.fn().mockResolvedValue(false);
    const loadMergeReviewFileDiff = vi.fn().mockResolvedValue({
      path: 'logic/alpha.L5X',
      status: 'modified',
      targetRef: 'main',
      sourceRef: 'feature/tank-logic',
    });

    useRepoMock.mockReturnValue(createRepoValue({
      abortMerge,
      loadMergeReviewFileDiff,
      detectedParentBranch: { name: 'main', source: 'auto-detected' },
      repoPath: '/tmp/repo',
    }));

    const { result } = renderHook(() => useMergeFlowController());

    await act(async () => {
      await result.current.handleReviewFile('logic/alpha.L5X');
    });

    expect(result.current.reviewFilePath).toBe('logic/alpha.L5X');

    let abortResult = true;
    await act(async () => {
      abortResult = await result.current.handleAbort();
    });

    expect(abortResult).toBe(false);
    expect(result.current.reviewFilePath).toBe('logic/alpha.L5X');
  });
});