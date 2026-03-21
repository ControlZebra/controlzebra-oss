import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Files,
  GitBranch,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import { ICON_SIZES } from '../../../shared/constants';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  Textarea,
} from '../../../shared/ui';
import { useMergeFlowController, type MergeOutcomeState } from '../hooks/useMergeFlowController';
import MergeConflictQueue from './modal/MergeConflictQueue';
import MergeReviewPane, { MergeReviewFileList } from './modal/MergeReviewPane';
import { getMergeReviewSelectedFilePath } from './modal/mergeReviewShared';

const iconSm: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconMd: CSSProperties = { width: ICON_SIZES.md, height: ICON_SIZES.md };
const iconLg: CSSProperties = { width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 };

interface ExplorerMergeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getDefaultMergeMessage(sourceBranch: string, targetBranch: string, isSquashMerge: boolean): string {
  return isSquashMerge
    ? `Squash merge ${sourceBranch} into ${targetBranch}`
    : `Merge ${sourceBranch} into ${targetBranch}`;
}

function buildOutcomeBadge(state: MergeOutcomeState): { label: string; variant: 'info' | 'success' | 'warning' | 'outline' } {
  switch (state) {
    case 'ready':
      return { label: 'Ready now', variant: 'success' };
    case 'needs-decisions':
    case 'resolving':
      return { label: 'Needs decisions', variant: 'warning' };
    case 'resolving-preparing':
      return { label: 'Preparing conflict list', variant: 'info' };
    case 'complete':
      return { label: 'Ready to finish', variant: 'info' };
    case 'up-to-date':
      return { label: 'Already synced', variant: 'outline' };
    case 'success':
      return { label: 'Merge complete', variant: 'success' };
    case 'setup':
      return { label: 'Choose destination', variant: 'outline' };
    case 'preparing':
    default:
      return { label: 'Preparing merge', variant: 'outline' };
  }
}

function ExplorerMergeModal({ open, onOpenChange }: ExplorerMergeModalProps): JSX.Element {
  const {
    repoPath,
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
    error,
    showSuccess,
    selectedReviewFiles,
    reviewFilePath,
    reviewDiff,
    isLoadingReviewDiff,
    isDeletingMergedBranch,
    isCompletingMerge,
    effectiveTarget,
    effectiveSource,
    branchToCleanUp,
    canDeleteMergedBranch,
    hasActiveMerge: hasActiveMergeFromController,
    defaultMergeMessage: defaultMergeMessageFromController,
    mergeOutcomeState,
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
  } = useMergeFlowController();

  const [message, setMessage] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isAbandoningMerge, setIsAbandoningMerge] = useState(false);
  const [isReviewDrawerOpen, setIsReviewDrawerOpen] = useState(false);
  const hasAutoAnalyzedRef = useRef(false);
  const reviewDrawerRef = useRef<HTMLDivElement | null>(null);
  const hasActiveMerge = hasActiveMergeFromController ?? (Boolean(conflictCheckResult?.mergeStarted) && !showSuccess && !conflictCheckResult?.autoCompleted);
  const defaultMergeMessage = defaultMergeMessageFromController ?? getDefaultMergeMessage(
    effectiveSource,
    effectiveTarget,
    conflictCheckResult?.isSquashMerge ?? isSquashMerge,
  );

  useEffect(() => {
    setMessage(defaultMergeMessage);
  }, [defaultMergeMessage]);

  useEffect(() => {
    if (!open) {
      hasAutoAnalyzedRef.current = false;
      return;
    }

    if (!targetBranch && effectiveTarget && effectiveTarget !== currentBranch) {
      setTargetBranch(effectiveTarget);
    }
  }, [open, targetBranch, effectiveTarget, currentBranch, setTargetBranch]);

  useEffect(() => {
    if (!open || hasAutoAnalyzedRef.current || !targetBranch) {
      return;
    }

    hasAutoAnalyzedRef.current = true;
    void handleCheck();
  }, [open, targetBranch, handleCheck]);

  const outcomeState = mergeOutcomeState ?? useMemo<MergeOutcomeState>(() => {
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

  useEffect(() => {
    if (!open || outcomeState !== 'review') {
      setIsReviewDrawerOpen(false);
    }
  }, [open, outcomeState]);

  useEffect(() => {
    if (
      outcomeState !== 'review'
      || isLoadingMergeReviewFiles
      || mergeReviewFiles.length === 0
      || reviewFilePath
      || isLoadingReviewDiff
    ) {
      return;
    }

    void handleReviewFile(mergeReviewFiles[0].path);
  }, [
    handleReviewFile,
    isLoadingMergeReviewFiles,
    isLoadingReviewDiff,
    mergeReviewFiles,
    outcomeState,
    reviewFilePath,
  ]);

  useEffect(() => {
    if (!isReviewDrawerOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (!reviewDrawerRef.current?.contains(event.target as Node)) {
        setIsReviewDrawerOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsReviewDrawerOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleEscape, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isReviewDrawerOpen]);

  const badge = buildOutcomeBadge(outcomeState);
  const isReviewState = outcomeState === 'review';
  const activeReviewPath = useMemo(
    () => getMergeReviewSelectedFilePath(reviewFilePath, reviewDiff) || mergeReviewFiles[0]?.path || '',
    [mergeReviewFiles, reviewDiff, reviewFilePath],
  );
  const currentReviewIndex = useMemo(
    () => mergeReviewFiles.findIndex((file) => file.path === activeReviewPath),
    [activeReviewPath, mergeReviewFiles],
  );
  const hasPreviousReviewFile = currentReviewIndex > 0;
  const hasNextReviewFile = currentReviewIndex >= 0 && currentReviewIndex < mergeReviewFiles.length - 1;
  const selectedConflict = useMemo(
    () => conflictedFiles.find((file) => file.path === selectedConflictFile) || conflictedFiles[0] || null,
    [conflictedFiles, selectedConflictFile],
  );

  const requestClose = useCallback((): void => {
    if (hasActiveMerge) {
      setShowCloseConfirm(true);
      return;
    }

    handleDismiss();
    onOpenChange(false);
  }, [handleDismiss, hasActiveMerge, onOpenChange]);

  const confirmClose = useCallback(async (): Promise<void> => {
    setIsAbandoningMerge(true);
    try {
      const aborted = await handleAbort();
      if (aborted) {
        handleDismiss();
        onOpenChange(false);
        setShowCloseConfirm(false);
      }
    } finally {
      setIsAbandoningMerge(false);
    }
  }, [handleAbort, handleDismiss, onOpenChange]);

  const handleOpenStateChange = useCallback((nextOpen: boolean): void => {
    if (!nextOpen) {
      requestClose();
    }
  }, [requestClose]);

  const handleRetryAnalysis = useCallback((): void => {
    void handleCheck();
  }, [handleCheck]);

  const handleMergeNow = useCallback((): void => {
    void handleStartMerge();
  }, [handleStartMerge]);

  const handleDeleteBranchAndClose = useCallback((): void => {
    void (async () => {
      const deleted = await handleDeleteMergedBranch();
      if (deleted) {
        onOpenChange(false);
      }
    })();
  }, [handleDeleteMergedBranch, onOpenChange]);

  const handleFinishMerge = useCallback((): void => {
    void handleComplete(message);
  }, [handleComplete, message]);

  const handleStepReviewFile = useCallback((direction: -1 | 1): void => {
    const nextIndex = currentReviewIndex + direction;
    const nextFile = mergeReviewFiles[nextIndex];

    if (!nextFile) {
      return;
    }

    void handleReviewFile(nextFile.path);
  }, [currentReviewIndex, handleReviewFile, mergeReviewFiles]);

  const handleReviewSelection = useCallback((filePath: string): void => {
    setIsReviewDrawerOpen(false);
    void handleReviewFile(filePath);
  }, [handleReviewFile]);

  const branchOptions = useMemo(
    () => availableBranches.map((branch) => ({ value: branch.name, label: branch.name })),
    [availableBranches],
  );

  let footerNote = 'Note: Check this step, then continue when you are ready.';

  let title = 'Preparing merge';
  let description = 'Checking whether your work can be merged safely.';

  switch (outcomeState) {
    case 'setup':
      title = 'Choose where to merge';
      description = 'Pick the destination branch before checking the merge path.';
      footerNote = 'Note: Choose where these changes should go.';
      break;
    case 'ready':
      title = 'Ready to merge';
      description = 'Everything looks good. Your changes can be merged safely.';
      footerNote = 'Note: Everything looks good. You can merge now.';
      break;
    case 'review':
      title = 'Merge review';
      description = 'No conflicts found. Review the files if you want, then merge when ready.';
      footerNote = 'Note: Choose the files you want and preview them if needed.';
      break;
    case 'needs-decisions':
      title = 'Needs decisions';
      description = 'A few files were changed in both branches. Start the guided merge to choose which version to keep.';
      footerNote = 'Note: You will choose what to keep for each file.';
      break;
    case 'resolving':
      title = 'Resolve files';
      description = 'Choose which version to keep for each file, one file at a time.';
      footerNote = 'Note: Pick the version you want to keep for this file.';
      break;
    case 'resolving-preparing':
      title = 'Preparing conflict list';
      description = 'The merge has started. ControlZebra is confirming which files still need a choice.';
      footerNote = 'Note: ControlZebra is getting the list of files that need a choice.';
      break;
    case 'complete':
      title = 'Finish merge';
      description = 'Your merge is prepared. Add a message, then finish when you are ready.';
      footerNote = 'Note: Add a short message, then finish the merge.';
      break;
    case 'up-to-date':
      title = 'Already up to date';
      description = `${effectiveTarget} already contains these changes.`;
      footerNote = 'Note: There is nothing new to merge.';
      break;
    case 'success':
      title = 'Merge complete';
      description = 'Your changes have been merged successfully.';
      footerNote = 'Note: The merge is done.';
      break;
    default:
      footerNote = 'Note: ControlZebra is getting things ready.';
      break;
  }

  return (
    <>
      <AlertDialog open={open} onOpenChange={handleOpenStateChange}>
        <AlertDialogContent className="max-w-6xl h-[min(92vh,860px)] p-0 flex flex-col overflow-hidden">
          <div className="border-b border-theme-default px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertDialogTitle className={isReviewState ? 'text-xl' : 'text-2xl'}>{title}</AlertDialogTitle>
                  {isReviewState ? (
                    <div className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-theme-default bg-theme-surface/60 px-3 py-1.5 text-sm text-theme-primary font-medium">
                      <GitBranch style={iconSm} className="text-blue-400 shrink-0" />
                      <span className="truncate">{effectiveSource}</span>
                      <ArrowRight style={iconSm} className="text-theme-muted shrink-0" />
                      <span className="truncate">{effectiveTarget}</span>
                    </div>
                  ) : (
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  )}
                </div>
                {!isReviewState && <AlertDialogDescription className="mt-2">{description}</AlertDialogDescription>}
              </div>
              <Button variant="ghost" size="icon" onClick={requestClose} aria-label="Close merge modal">
                <X style={iconSm} />
              </Button>
            </div>

            {isReviewState ? (
              <div className="mt-2 space-y-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-theme-secondary">
                  <span>{mergeReviewFiles.length} files changed</span>
                  <span>No conflicts</span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleStepReviewFile(-1)}
                    disabled={!hasPreviousReviewFile || isLoadingReviewDiff}
                    aria-label="Previous file"
                    className="h-9 w-9 px-0 border-theme-default text-theme-primary"
                  >
                    <ChevronLeft className="h-4.5 w-4.5 stroke-[2.5]" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleStepReviewFile(1)}
                    disabled={!hasNextReviewFile || isLoadingReviewDiff}
                    aria-label="Next file"
                    className="h-9 w-9 px-0 border-theme-default text-theme-primary"
                  >
                    <ChevronRight className="h-4.5 w-4.5 stroke-[2.5]" />
                  </Button>

                  <div ref={reviewDrawerRef} className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsReviewDrawerOpen((current) => !current)}
                      aria-expanded={isReviewDrawerOpen}
                      aria-controls="merge-review-selected-files"
                      className="h-9 border-theme-default text-theme-primary"
                    >
                      <Files style={iconSm} />
                      Selected files
                      <Badge variant="outline">{mergeReviewFiles.length}</Badge>
                    </Button>

                    {isReviewDrawerOpen && (
                      <div
                        id="merge-review-selected-files"
                        className="absolute right-0 top-full z-20 mt-2 w-[min(24rem,calc(100vw-4rem))] overflow-hidden rounded-xl border border-theme-default bg-theme-surface shadow-xl"
                      >
                        <MergeReviewFileList
                          mergeReviewFiles={mergeReviewFiles}
                          selectedReviewFiles={selectedReviewFiles}
                          reviewFilePath={activeReviewPath}
                          isLoadingMergeReviewFiles={isLoadingMergeReviewFiles}
                          onToggleReviewFile={handleToggleReviewFile}
                          onToggleAllReviewFiles={handleToggleAllReviewFiles}
                          onReviewFile={handleReviewSelection}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <div className="inline-flex items-center gap-2 rounded-lg border border-theme-default bg-theme-surface/60 px-3 py-2 text-theme-primary font-medium">
                  <GitBranch style={iconSm} className="text-blue-400 shrink-0" />
                  <span>{effectiveSource}</span>
                </div>
                <div className="inline-flex items-center justify-center rounded-lg border border-theme-default bg-theme-surface/40 px-2 py-2 text-theme-muted">
                  <ArrowRight style={iconMd} />
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg border border-theme-default bg-theme-surface/60 px-3 py-2 text-theme-primary font-medium">
                  <GitBranch style={iconSm} className="text-amber-400 shrink-0" />
                  <span>{effectiveTarget}</span>
                </div>
              </div>
            )}
          </div>

          <div className={isReviewState ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 min-h-0 overflow-auto px-5 py-4'}>
            {error && (
              <div className={isReviewState ? 'mx-4 mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300' : 'mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300'}>
                {error}
              </div>
            )}

            {outcomeState === 'preparing' && (
              <div className="h-full min-h-80 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <Loader2 style={iconLg} className="mx-auto mb-4 animate-spin text-blue-400" />
                  <p className="text-theme-primary text-lg font-medium mb-2">Preparing merge</p>
                  <p className="text-theme-secondary text-sm">Checking whether your work can be merged safely.</p>
                </div>
              </div>
            )}

            {outcomeState === 'setup' && (
              <div className="max-w-xl mx-auto">
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <div>
                      <p className="text-theme-primary text-base font-medium mb-1">Choose a destination branch</p>
                      <p className="text-theme-secondary text-sm">The merge check needs to know which branch should receive your changes.</p>
                    </div>
                    <Select
                      value={targetBranch}
                      onValueChange={setTargetBranch}
                      options={branchOptions}
                      placeholder="Select a destination branch"
                    />
                    <label className="flex items-center justify-between gap-4 rounded-lg border border-theme-default px-4 py-3">
                      <div>
                        <p className="text-theme-primary text-sm font-medium">Combine changes into one save</p>
                        <p className="text-theme-secondary text-xs">Use a squash merge to keep history simple for non-technical users.</p>
                      </div>
                      <button
                        type="button"
                        aria-pressed={isSquashMerge}
                        onClick={() => setIsSquashMerge(!isSquashMerge)}
                        className={`relative h-6 w-11 rounded-full transition-colors ${isSquashMerge ? 'bg-blue-500' : 'bg-gray-600'}`}
                      >
                        <span
                          className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${isSquashMerge ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                      </button>
                    </label>
                  </CardContent>
                </Card>
              </div>
            )}

            {outcomeState === 'ready' && (
              <div className="max-w-3xl mx-auto space-y-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <CheckCircle2 style={iconLg} className="text-green-400 shrink-0" />
                      <div>
                        <p className="text-theme-primary text-lg font-medium mb-2">Everything looks good</p>
                        <p className="text-theme-secondary text-sm">No conflicts were found. You can merge {effectiveSource} into {effectiveTarget} now.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {outcomeState === 'review' && (
              <div className="h-full min-h-0">
                <MergeReviewPane
                  repoPath={repoPath}
                  mergeReviewFiles={mergeReviewFiles}
                  selectedReviewFiles={selectedReviewFiles}
                  reviewFilePath={reviewFilePath}
                  reviewDiff={reviewDiff}
                  isLoadingMergeReviewFiles={isLoadingMergeReviewFiles}
                  isLoadingReviewDiff={isLoadingReviewDiff}
                  onToggleReviewFile={handleToggleReviewFile}
                  onToggleAllReviewFiles={handleToggleAllReviewFiles}
                  onReviewFile={handleReviewFile}
                  showToolbar={false}
                  showFrame={false}
                />
              </div>
            )}

            {outcomeState === 'needs-decisions' && (
              <div className="max-w-3xl mx-auto space-y-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <AlertTriangle style={iconLg} className="text-amber-400 shrink-0" />
                      <div>
                        <p className="text-theme-primary text-lg font-medium mb-2">A few files need a choice</p>
                        <p className="text-theme-secondary text-sm mb-4">Both branches changed the same files. Start the guided merge and ControlZebra will walk you through each file.</p>
                        <div className="space-y-2">
                          {conflictCheckResult?.conflictedFiles?.map((file) => (
                            <div key={file.path} className="flex items-center gap-2 rounded-lg border border-theme-default px-3 py-2 text-sm">
                              <FileWarning style={iconSm} className="text-amber-400 shrink-0" />
                              <span className="text-theme-primary break-all">{file.path}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {outcomeState === 'resolving' && (
              <MergeConflictQueue
                conflictedFiles={conflictedFiles}
                selectedConflictFile={selectedConflictFile}
                fileResolutions={fileResolutions}
                isResolvingConflict={isResolvingConflict}
                conflictSidesInfo={conflictSidesInfo}
                sourceBranch={effectiveSource}
                targetBranch={effectiveTarget}
                onSelectFile={setSelectedConflictFile}
                onResolve={handleResolve}
              />
            )}

            {outcomeState === 'resolving-preparing' && (
              <div className="h-full min-h-80 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <Loader2 style={iconLg} className="mx-auto mb-4 animate-spin text-amber-400" />
                  <p className="text-theme-primary text-lg font-medium mb-2">Preparing the conflict list</p>
                  <p className="text-theme-secondary text-sm">
                    The merge is in progress. ControlZebra is checking which files still need a choice before it shows the resolution queue.
                  </p>
                </div>
              </div>
            )}

            {outcomeState === 'complete' && (
              <div className="max-w-3xl mx-auto space-y-4">
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-start gap-4">
                      <Sparkles style={iconLg} className="text-blue-400 shrink-0" />
                      <div>
                        <p className="text-theme-primary text-lg font-medium mb-2">Everything is ready</p>
                        <p className="text-theme-secondary text-sm">
                          {conflictCheckResult?.liveMergePhase === 'ready-to-complete'
                            ? 'The repository confirms there are no unresolved conflicts. Add a merge message and finish.'
                            : 'No conflicts were found after the merge started. Add a message and finish.'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-theme-muted text-xs uppercase tracking-wide mb-2">Merge message</p>
                      <Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {outcomeState === 'up-to-date' && (
              <div className="h-full min-h-80 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <CheckCircle2 style={iconLg} className="mx-auto mb-4 text-blue-400" />
                  <p className="text-theme-primary text-lg font-medium mb-2">Nothing to merge</p>
                  <p className="text-theme-secondary text-sm">{effectiveTarget} already contains these changes.</p>
                </div>
              </div>
            )}

            {outcomeState === 'success' && (
              <div className="max-w-3xl mx-auto space-y-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <CheckCircle2 style={iconLg} className="text-green-400 shrink-0" />
                      <div>
                        <p className="text-theme-primary text-lg font-medium mb-2">Merge finished</p>
                        <p className="text-theme-secondary text-sm">Your changes are now in {effectiveTarget}.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {canDeleteMergedBranch && (
                  <Card>
                    <CardContent className="p-6 flex items-start justify-between gap-4 flex-col md:flex-row md:items-center">
                      <div>
                        <p className="text-theme-primary text-base font-medium mb-1">Clean up merged branch</p>
                        <p className="text-theme-secondary text-sm">Delete {branchToCleanUp} now to reduce confusion the next time someone saves changes.</p>
                      </div>
                      <Button onClick={handleDeleteBranchAndClose} disabled={isDeletingMergedBranch}>
                        {isDeletingMergedBranch ? <Loader2 style={iconSm} className="animate-spin mr-2" /> : <Trash2 style={iconSm} className="mr-2" />}
                        Delete {branchToCleanUp}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>

          <AlertDialogFooter className="border-t border-theme-default bg-theme-surface/60 px-5 py-3 justify-between">
            <div className="text-xs text-theme-muted">
              {outcomeState === 'resolving' && selectedConflict
                ? `Note: Choose what to keep for ${selectedConflict.path}.`
                : footerNote}
            </div>
            <div className="flex gap-2">
              {(outcomeState === 'setup' || outcomeState === 'ready' || outcomeState === 'review' || outcomeState === 'needs-decisions' || outcomeState === 'complete' || outcomeState === 'resolving' || outcomeState === 'resolving-preparing') && (
                <Button variant="outline" onClick={requestClose} disabled={isResolvingConflict || isCompletingMerge}>
                  Cancel
                </Button>
              )}

              {outcomeState === 'setup' && (
                <Button onClick={handleRetryAnalysis} disabled={!targetBranch || targetBranch === currentBranch}>
                  <Search style={iconSm} className="mr-2" />
                  Check merge
                </Button>
              )}

              {outcomeState === 'ready' && (
                <Button onClick={handleMergeNow}>
                  <Check style={iconSm} className="mr-2" />
                  Merge now
                </Button>
              )}

              {outcomeState === 'review' && (
                <Button onClick={handleMergeNow} disabled={selectedReviewFiles.length === 0}>
                  <Check style={iconSm} className="mr-2" />
                  Merge now
                </Button>
              )}

              {outcomeState === 'needs-decisions' && (
                <Button onClick={handleMergeNow}>
                  <ChevronRight style={iconSm} className="mr-2" />
                  Start guided merge
                </Button>
              )}

              {outcomeState === 'complete' && (
                <Button onClick={handleFinishMerge} disabled={isCompletingMerge || !message.trim()}>
                  {isCompletingMerge ? <Loader2 style={iconSm} className="animate-spin mr-2" /> : <Check style={iconSm} className="mr-2" />}
                  Save my choices and finish
                </Button>
              )}

              {outcomeState === 'up-to-date' && (
                <Button onClick={requestClose}>Close</Button>
              )}

              {outcomeState === 'success' && (
                <Button onClick={requestClose}>Done</Button>
              )}
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave merge?</AlertDialogTitle>
            <AlertDialogDescription>
              A merge is already in progress. Leaving this modal will stop the merge and discard any unfinished conflict decisions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAbandoningMerge}>Stay here</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmClose()} disabled={isAbandoningMerge}>
              {isAbandoningMerge ? <Loader2 style={iconSm} className="animate-spin mr-2" /> : null}
              Leave merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default memo(ExplorerMergeModal);