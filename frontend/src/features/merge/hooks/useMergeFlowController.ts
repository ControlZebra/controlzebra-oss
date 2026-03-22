import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  useRepo,
  type MergeReviewDiffResult,
  type ResolutionStrategy,
} from '../../../context';

export type MergeFlowStep = 'check' | 'review' | 'resolve' | 'complete';
export type MergeOutcomeState =
  | 'preparing'
  | 'setup'
  | 'ready'
  | 'review'
  | 'needs-decisions'
  | 'resolving-preparing'
  | 'resolving'
  | 'complete'
  | 'up-to-date'
  | 'success';

export function getDefaultMergeMessage(sourceBranch: string, targetBranch: string, isSquashMerge: boolean): string {
  return isSquashMerge
    ? `Squash merge ${sourceBranch} into ${targetBranch}`
    : `Merge ${sourceBranch} into ${targetBranch}`;
}

/**
 * Shared merge flow orchestration for page and modal surfaces.
 *
 * This hook composes the existing RepoContext merge actions with the UI-level
 * state that coordinates target selection, pre-merge review, completion, and
 * clean-up flows.
 */
export function useMergeFlowController() {
  const {
    repoPath,
    repoInfo,
    branches,
    conflictedFiles = [],
    isCheckingConflicts,
    conflictCheckResult,
    mergeReviewFiles,
    isLoadingMergeReviewFiles,
    selectedConflictFile,
    setSelectedConflictFile,
    detectedParentBranch,
    fetchParentBranch,
    checkConflictsOnly,
    loadMergeReviewFileDiff,
    startMerge,
    clearConflicts,
    fileResolutions = {},
    resolveConflict,
    abortMerge,
    completeMerge,
    deleteBranch,
    isResolvingConflict,
    conflictSidesInfo,
    refreshBranches,
    isSquashMerge,
    setIsSquashMerge,
  } = useRepo();

  const [targetBranch, setTargetBranch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedReviewFiles, setSelectedReviewFiles] = useState<string[]>([]);
  const [reviewFilePath, setReviewFilePath] = useState<string | null>(null);
  const [reviewDiff, setReviewDiff] = useState<MergeReviewDiffResult | null>(null);
  const [isLoadingReviewDiff, setIsLoadingReviewDiff] = useState(false);
  const [isDeletingMergedBranch, setIsDeletingMergedBranch] = useState(false);
  const [mergedSourceBranch, setMergedSourceBranch] = useState('');
  const [isCompletingMerge, setIsCompletingMerge] = useState(false);

  const currentBranch = repoInfo?.branch || 'current';

  const availableBranches = useMemo(
    () => branches?.local?.filter((branch) => !branch.isCurrent) || [],
    [branches?.local],
  );

  const canUseSelectiveReview = useMemo(
    () => Boolean(
      conflictCheckResult?.success
      && !conflictCheckResult.hasConflicts
      && !conflictCheckResult.mergeStarted
      && mergeReviewFiles.length > 0,
    ),
    [conflictCheckResult, mergeReviewFiles.length],
  );

  useEffect(() => {
    if (repoPath && !detectedParentBranch) {
      void fetchParentBranch();
    }
    if (repoPath && !branches) {
      void refreshBranches();
    }
  }, [repoPath, detectedParentBranch, fetchParentBranch, branches, refreshBranches]);

  useEffect(() => {
    if (canUseSelectiveReview) {
      setSelectedReviewFiles(mergeReviewFiles.map((file) => file.path));
      return;
    }

    setSelectedReviewFiles([]);
  }, [canUseSelectiveReview, mergeReviewFiles]);

  const effectiveTarget = targetBranch || detectedParentBranch?.name || 'main';
  const effectiveSource = conflictCheckResult?.sourceBranch || currentBranch;
  const branchToCleanUp = mergedSourceBranch || effectiveSource;
  const canDeleteMergedBranch = branchToCleanUp !== 'current' && branchToCleanUp !== 'main' && branchToCleanUp !== 'master';
  const hasActiveMerge = Boolean(conflictCheckResult?.mergeStarted) && !showSuccess && !conflictCheckResult?.autoCompleted;
  const defaultMergeMessage = useMemo(
    () => getDefaultMergeMessage(
      effectiveSource,
      effectiveTarget,
      conflictCheckResult?.isSquashMerge ?? isSquashMerge,
    ),
    [effectiveSource, effectiveTarget, conflictCheckResult?.isSquashMerge, isSquashMerge],
  );

  const mergeOutcomeState = useMemo<MergeOutcomeState>(() => {
    if (isCheckingConflicts && !conflictCheckResult) {
      return 'preparing';
    }

    if (showSuccess || conflictCheckResult?.autoCompleted) {
      return 'success';
    }

    if (conflictCheckResult?.success && conflictCheckResult.alreadyUpToDate) {
      return 'up-to-date';
    }

    if (conflictCheckResult?.success && conflictCheckResult.mergeStarted) {
      if (conflictCheckResult.liveMergePhase === 'ready-to-complete') {
        return 'complete';
      }

      if (conflictCheckResult.liveMergePhase === 'resolving') {
        return 'resolving';
      }

      return 'resolving-preparing';
    }

    if (conflictCheckResult?.success && conflictCheckResult.hasConflicts) {
      return 'needs-decisions';
    }

    if (conflictCheckResult?.success && mergeReviewFiles.length > 0) {
      return 'review';
    }

    if (conflictCheckResult?.success) {
      return 'ready';
    }

    if (conflictCheckResult && !conflictCheckResult.success) {
      return 'setup';
    }

    if (!targetBranch || targetBranch === currentBranch) {
      return 'setup';
    }

    return 'preparing';
  }, [
    conflictCheckResult,
    currentBranch,
    isCheckingConflicts,
    mergeReviewFiles.length,
    showSuccess,
    targetBranch,
  ]);

  const resetReviewState = useCallback((): void => {
    setReviewFilePath(null);
    setReviewDiff(null);
    setIsLoadingReviewDiff(false);
    setSelectedReviewFiles([]);
  }, []);

  const resetControllerState = useCallback((): void => {
    setError(null);
    setShowSuccess(false);
    setMergedSourceBranch('');
    setIsCompletingMerge(false);
    setIsDeletingMergedBranch(false);
    resetReviewState();
  }, [resetReviewState]);

  const handleCheck = useCallback(async (): Promise<void> => {
    setError(null);
    const result = await checkConflictsOnly(targetBranch);
    if (result && !result.success) {
      setError(result.error || 'Failed to check for conflicts');
    }
  }, [targetBranch, checkConflictsOnly]);

  const handleStartMerge = useCallback(async (): Promise<void> => {
    setError(null);

    const isConflictMerge = Boolean(conflictCheckResult?.hasConflicts);
    const shouldUseSelective = canUseSelectiveReview;

    if (shouldUseSelective && selectedReviewFiles.length === 0) {
      setError('Select at least one file to start merge.');
      return;
    }

    const mergeOptions = isConflictMerge
      ? {
        squash: isSquashMerge,
        selective: false,
        selectedFiles: [],
      }
      : shouldUseSelective
        ? {
          squash: isSquashMerge,
          selective: true,
          selectedFiles: selectedReviewFiles,
        }
        : {
          squash: isSquashMerge,
          selective: false,
          selectedFiles: [],
        };

    const result = await startMerge(targetBranch, '', mergeOptions);

    if (!result) {
      setError('Failed to start merge');
      return;
    }

    if (result.autoCompleted) {
      setMergedSourceBranch(effectiveSource);
      setShowSuccess(true);
    }
  }, [
    targetBranch,
    conflictCheckResult,
    canUseSelectiveReview,
    selectedReviewFiles,
    startMerge,
    isSquashMerge,
    effectiveSource,
  ]);

  const handleToggleReviewFile = useCallback((filePath: string): void => {
    setSelectedReviewFiles((prev) => (
      prev.includes(filePath)
        ? prev.filter((path) => path !== filePath)
        : [...prev, filePath]
    ));
  }, []);

  const handleToggleAllReviewFiles = useCallback((): void => {
    setSelectedReviewFiles((prev) => (
      prev.length === mergeReviewFiles.length ? [] : mergeReviewFiles.map((file) => file.path)
    ));
  }, [mergeReviewFiles]);

  const handleReviewFile = useCallback(async (filePath: string): Promise<void> => {
    setReviewFilePath(filePath);
    setReviewDiff(null);
    setIsLoadingReviewDiff(true);

    try {
      const diffResult = await loadMergeReviewFileDiff(filePath, effectiveTarget, effectiveSource);
      setReviewDiff(diffResult);
    } finally {
      setIsLoadingReviewDiff(false);
    }
  }, [loadMergeReviewFileDiff, effectiveTarget, effectiveSource]);

  const handleResolve = useCallback(async (filePath: string, strategy: ResolutionStrategy): Promise<void> => {
    const success = await resolveConflict(filePath, strategy);
    if (success) {
      setSelectedConflictFile(null);
    }
  }, [resolveConflict, setSelectedConflictFile]);

  const handleAbort = useCallback(async (): Promise<boolean> => {
    const success = await abortMerge();
    if (success) {
      resetControllerState();
    }
    return success;
  }, [abortMerge, resetControllerState]);

  const handleComplete = useCallback(async (message: string): Promise<void> => {
    if (isCompletingMerge) {
      return;
    }

    setIsCompletingMerge(true);
    setMergedSourceBranch(effectiveSource);

    try {
      const success = await completeMerge(message);
      if (success) {
        setShowSuccess(true);
      }
    } finally {
      setIsCompletingMerge(false);
    }
  }, [completeMerge, effectiveSource, isCompletingMerge]);

  const handleDismiss = useCallback((): void => {
    clearConflicts();
    resetControllerState();
    setTargetBranch('');
  }, [clearConflicts, resetControllerState]);

  const handleDeleteMergedBranch = useCallback(async (): Promise<boolean> => {
    if (!canDeleteMergedBranch || isDeletingMergedBranch) {
      return false;
    }

    setIsDeletingMergedBranch(true);
    try {
      const success = await deleteBranch(branchToCleanUp);
      if (success) {
        handleDismiss();
        return true;
      }

      return false;
    } finally {
      setIsDeletingMergedBranch(false);
    }
  }, [
    canDeleteMergedBranch,
    isDeletingMergedBranch,
    deleteBranch,
    branchToCleanUp,
    handleDismiss,
  ]);

  const handleTargetBranchChange = useCallback((nextTargetBranch: string): void => {
    if (!nextTargetBranch || nextTargetBranch === targetBranch) {
      return;
    }

    clearConflicts();
    resetControllerState();
    setTargetBranch(nextTargetBranch);
  }, [clearConflicts, resetControllerState, targetBranch]);

  const showBranchBanner = !!conflictCheckResult?.success;

  const currentMergeStep = useMemo<MergeFlowStep>(() => {
    if (mergeOutcomeState === 'success' || mergeOutcomeState === 'complete') {
      return 'complete';
    }

    if (mergeOutcomeState === 'resolving' || mergeOutcomeState === 'resolving-preparing') {
      return 'resolve';
    }

    if (mergeOutcomeState === 'ready' || mergeOutcomeState === 'review' || mergeOutcomeState === 'needs-decisions') {
      return 'review';
    }

    return 'check';
  }, [mergeOutcomeState]);

  return {
    repoPath,
    repoInfo,
    conflictedFiles,
    isCheckingConflicts,
    conflictCheckResult,
    mergeReviewFiles,
    isLoadingMergeReviewFiles,
    selectedConflictFile,
    setSelectedConflictFile,
    fileResolutions,
    isResolvingConflict,
    conflictSidesInfo,
    isSquashMerge,
    setIsSquashMerge,
    currentBranch,
    availableBranches,
    targetBranch,
    setTargetBranch,
    handleTargetBranchChange,
    error,
    showSuccess,
    selectedReviewFiles,
    reviewFilePath,
    reviewDiff,
    isLoadingReviewDiff,
    isDeletingMergedBranch,
    mergedSourceBranch,
    isCompletingMerge,
    effectiveTarget,
    effectiveSource,
    branchToCleanUp,
    canDeleteMergedBranch,
    hasActiveMerge,
    defaultMergeMessage,
    mergeOutcomeState,
    showBranchBanner,
    currentMergeStep,
    handleCheck,
    handleStartMerge,
    handleToggleReviewFile,
    handleToggleAllReviewFiles,
    handleReviewFile,
    handleResolve,
    handleAbort,
    handleComplete,
    handleDismiss,
    handleDeleteMergedBranch,
  };
}