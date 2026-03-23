import { memo, useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  FolderOpen,
  GitBranch,
  Loader2,
  Merge,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';

import {
  useLayout,
  type BranchInfo,
  type ConflictedFile,
  type MergeReviewDiffResult,
  type MergeReviewFile,
  type ResolutionStrategy,
} from '../../../context';
import type { ConflictSidesInfo } from '../../../domain/repo/context/RepoContext.types';
import { ICON_SIZES, VIEWS } from '../../../shared/constants';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Textarea,
} from '../../../shared/ui';
import MergeConflictQueue from '../components/modal/MergeConflictQueue';
import MergeReviewPane, {
  MergeReviewFileList,
} from '../components/modal/MergeReviewPane';
import MergeReviewPreview from '../components/modal/MergeReviewPreview';
import { useMergeFlowController, type MergeFlowStep as MergeStep } from '../hooks/useMergeFlowController';

const iconSm: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconLg: CSSProperties = { width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 };

const MERGE_STEPS: { id: MergeStep; label: string; icon: typeof Search }[] = [
  { id: 'check', label: 'Check', icon: Search },
  { id: 'review', label: 'Review', icon: Search },
  { id: 'resolve', label: 'Resolve', icon: Merge },
  { id: 'complete', label: 'Complete', icon: CheckCircle2 },
];

function getStepIndex(step: MergeStep): number {
  return MERGE_STEPS.findIndex((candidate) => candidate.id === step);
}

interface MergeStepperProps {
  currentStep: MergeStep;
}

const MergeStepper = memo(function MergeStepper({ currentStep }: MergeStepperProps): JSX.Element {
  const currentIndex = getStepIndex(currentStep);

  return (
    <div className="shrink-0 border-b border-theme-default bg-theme-surface/50 px-6 py-4">
      <div className="mx-auto flex max-w-lg items-center justify-center">
        {MERGE_STEPS.map((step, index) => {
          const StepIcon = step.icon;
          const isCompleted = index < currentIndex;
          const isActive = index === currentIndex;

          return (
            <div key={step.id} className="flex flex-1 items-center last:flex-initial">
              <div className="relative flex flex-col items-center gap-1.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
                    isCompleted
                      ? 'border border-green-500/50 text-green-400'
                      : isActive
                        ? 'border border-blue-500/50 text-blue-400'
                        : 'border border-theme-default text-theme-muted'
                  }`}
                >
                  {isCompleted ? (
                    <Check style={{ width: 14, height: 14 }} />
                  ) : (
                    <StepIcon style={{ width: 14, height: 14 }} />
                  )}
                </div>
                <span
                  className={`whitespace-nowrap text-[11px] font-medium ${
                    isCompleted
                      ? 'text-green-400'
                      : isActive
                        ? 'text-blue-400'
                        : 'text-theme-muted'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {index < MERGE_STEPS.length - 1 && (
                <div className="mx-2 mt-[-18px] flex-1">
                  <div
                    className={`h-0.5 w-full rounded transition-all ${
                      index < currentIndex ? 'bg-green-500' : 'bg-theme-default'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

interface CheckPanelProps {
  currentBranch: string;
  targetBranch: string;
  effectiveTarget: string;
  availableBranches: BranchInfo[];
  isChecking: boolean;
  error: string | null;
  isSquashMerge: boolean;
  onTargetChange: (branch: string) => void;
  onCheck: () => void;
  onSquashChange: (value: boolean) => void;
}

const CheckPanel = memo(function CheckPanel({
  currentBranch,
  targetBranch,
  effectiveTarget,
  availableBranches,
  isChecking,
  error,
  isSquashMerge,
  onTargetChange,
  onCheck,
  onSquashChange,
}: CheckPanelProps): JSX.Element {
  const [showSelector, setShowSelector] = useState(false);
  const isSameBranch = currentBranch === effectiveTarget;

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <Merge style={iconLg} className="mx-auto mb-4 text-blue-400" />
        <h2 className="mb-2 text-xl font-semibold text-theme-primary">Merge changes</h2>
        <p className="mb-6 text-sm text-theme-muted">
          Merge your changes from <span className="font-medium text-blue-400">{currentBranch}</span> into another branch.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-left">
            <div className="flex items-start gap-2">
              <XCircle style={iconSm} className="mt-0.5 shrink-0 text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          </div>
        )}

        <div className="space-y-4 rounded-lg border border-theme-default bg-theme-surface p-4">
          <div
            className={`flex items-center justify-center gap-3 rounded-lg bg-theme-base px-3 py-2 ${
              isSameBranch ? 'border border-orange-500/30' : ''
            }`}
          >
            <span className="font-medium text-blue-400">{currentBranch}</span>
            <ArrowRight style={iconSm} className="text-theme-muted" />
            <span className={`font-medium ${isSameBranch ? 'text-orange-400' : 'text-green-400'}`}>{effectiveTarget}</span>
          </div>

          <div className="text-left">
            <button
              type="button"
              onClick={() => setShowSelector((value) => !value)}
              className="flex items-center gap-2 text-xs text-theme-muted hover:text-theme-secondary"
            >
              <span>
                Destination Branch: <span className="text-theme-primary">{effectiveTarget}</span>
              </span>
              <ChevronDown style={{ width: 12, height: 12 }} className={showSelector ? 'rotate-180' : ''} />
            </button>

            {showSelector && (
              <select
                value={targetBranch}
                onChange={(event) => onTargetChange(event.target.value)}
                className="mt-2 w-full rounded border border-theme-default bg-theme-base px-2 py-1.5 text-sm text-theme-primary"
              >
                <option value="">Auto-detect (main/master)</option>
                {availableBranches.map((branch) => (
                  <option key={branch.name} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-theme-base px-3 py-2">
            <div className="text-left">
              <p className="text-sm font-medium text-theme-primary">Squash commits</p>
              <p className="text-xs text-theme-muted">Keep the destination history simple for non-technical users.</p>
            </div>
            <button
              type="button"
              aria-pressed={isSquashMerge}
              onClick={() => onSquashChange(!isSquashMerge)}
              className={`relative h-6 w-11 rounded-full transition-colors ${isSquashMerge ? 'bg-blue-500' : 'bg-gray-600'}`}
            >
              <span
                className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                  isSquashMerge ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <Button onClick={onCheck} disabled={isChecking || isSameBranch} className="w-full">
            {isChecking ? (
              <>
                <Loader2 style={iconSm} className="mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <Search style={iconSm} className="mr-2" />
                Check for conflicts
              </>
            )}
          </Button>

          {isSameBranch && (
            <p className="rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-left text-sm text-orange-400">
              Choose a different destination branch before starting the merge check.
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

interface LoadingPanelProps {
  title: string;
  description: string;
}

const LoadingPanel = memo(function LoadingPanel({ title, description }: LoadingPanelProps): JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <Loader2 style={iconLg} className="mx-auto mb-4 animate-spin text-blue-400" />
        <p className="mb-2 text-lg font-medium text-theme-primary">{title}</p>
        <p className="text-sm text-theme-secondary">{description}</p>
      </div>
    </div>
  );
});

interface ReviewStepPanelProps {
  repoPath?: string | null;
  hasConflicts: boolean;
  conflictedFiles: ConflictedFile[];
  mergeReviewFiles: MergeReviewFile[];
  selectedReviewFiles: string[];
  reviewFilePath: string | null;
  reviewDiff: MergeReviewDiffResult | null;
  isLoadingMergeReviewFiles: boolean;
  isLoadingReviewDiff: boolean;
  isProcessing: boolean;
  onToggleReviewFile: (filePath: string) => void;
  onToggleAllReviewFiles: () => void;
  onReviewFile: (filePath: string) => Promise<void>;
  onStartMerge: () => void;
  onCancel: () => void;
}

const ReviewStepPanel = memo(function ReviewStepPanel({
  repoPath,
  hasConflicts,
  conflictedFiles,
  mergeReviewFiles,
  selectedReviewFiles,
  reviewFilePath,
  reviewDiff,
  isLoadingMergeReviewFiles,
  isLoadingReviewDiff,
  isProcessing,
  onToggleReviewFile,
  onToggleAllReviewFiles,
  onReviewFile,
  onStartMerge,
  onCancel,
}: ReviewStepPanelProps): JSX.Element {
  if (hasConflicts) {
    const conflictFilePaths = conflictedFiles.map((file) => file.path);
    const canStartConflictMerge = selectedReviewFiles.length > 0;

    return (
      <div className="flex flex-1 min-h-0 flex-col gap-4 p-6">
        <Card className="mx-auto w-full max-w-3xl">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Merge style={iconLg} className="shrink-0 text-amber-400" />
              <div className="w-full">
                <p className="mb-2 text-lg font-medium text-theme-primary">A few files need a choice</p>
                <p className="mb-4 text-sm text-theme-secondary">
                  Choose the files to bring over first. ControlZebra will only ask you to resolve conflicts for the files you keep selected.
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-theme-secondary">
                  <span>{conflictedFiles.length} file{conflictedFiles.length === 1 ? '' : 's'} need a choice</span>
                  <span className="text-theme-muted">|</span>
                  <span>{selectedReviewFiles.length} file{selectedReviewFiles.length === 1 ? '' : 's'} selected</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="min-h-0 overflow-hidden">
            <MergeReviewFileList
              mergeReviewFiles={mergeReviewFiles}
              selectedReviewFiles={selectedReviewFiles}
              reviewFilePath={reviewFilePath || ''}
              isLoadingMergeReviewFiles={isLoadingMergeReviewFiles}
              conflictFilePaths={conflictFilePaths}
              title="Files in this merge"
              description="Keep only the files you want to bring over now. Files marked Needs a choice will open in the guided conflict step."
              onToggleReviewFile={onToggleReviewFile}
              onToggleAllReviewFiles={onToggleAllReviewFiles}
              onReviewFile={(filePath) => {
                void onReviewFile(filePath);
              }}
            />
          </Card>

          <Card className="min-h-0 overflow-hidden">
            <CardHeader className="border-b border-theme-default px-4 py-3">
              <p className="text-sm font-medium text-theme-primary">Preview</p>
              <p className="text-xs text-theme-secondary">Review the selected file before you start the guided merge.</p>
            </CardHeader>
            <div className="min-h-0 flex-1 bg-theme-base/20">
              <MergeReviewPreview
                repoPath={repoPath}
                reviewFilePath={reviewFilePath}
                reviewDiff={reviewDiff}
                isLoadingReviewDiff={isLoadingReviewDiff}
                emptyLabel="Choose a file to preview before starting the merge."
              />
            </div>
          </Card>
        </div>

        <div className="flex justify-center gap-3">
          <Button onClick={onCancel} variant="outline" disabled={isProcessing}>
            <X style={iconSm} className="mr-2" />
            Cancel
          </Button>
          <Button onClick={onStartMerge} disabled={isProcessing || !canStartConflictMerge}>
            <Check style={iconSm} className="mr-2" />
            Start guided merge for selected files
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-6">
      {mergeReviewFiles.length === 0 && !isLoadingMergeReviewFiles ? (
        <Card className="mx-auto w-full max-w-3xl">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <CheckCircle2 style={iconLg} className="shrink-0 text-green-400" />
              <div>
                <p className="mb-2 text-lg font-medium text-theme-primary">Everything looks good</p>
                <p className="text-sm text-theme-secondary">No conflicting changes were found. You can start the merge now.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="min-h-0 flex-1">
          <MergeReviewPane
            repoPath={repoPath}
            mergeReviewFiles={mergeReviewFiles}
            selectedReviewFiles={selectedReviewFiles}
            reviewFilePath={reviewFilePath}
            reviewDiff={reviewDiff}
            isLoadingMergeReviewFiles={isLoadingMergeReviewFiles}
            isLoadingReviewDiff={isLoadingReviewDiff}
            onToggleReviewFile={onToggleReviewFile}
            onToggleAllReviewFiles={onToggleAllReviewFiles}
            onReviewFile={onReviewFile}
          />
        </div>
      )}

      <div className="flex justify-center gap-3">
        <Button onClick={onCancel} variant="outline" disabled={isProcessing}>
          <X style={iconSm} className="mr-2" />
          Cancel
        </Button>
        <Button onClick={onStartMerge} disabled={isProcessing || (mergeReviewFiles.length > 0 && selectedReviewFiles.length === 0)}>
          <Check style={iconSm} className="mr-2" />
          Start merge
        </Button>
      </div>
    </div>
  );
});

interface CompleteStepPanelProps {
  title: string;
  description: string;
  message: string;
  isCompletingMerge: boolean;
  onMessageChange: (value: string) => void;
  onAbort: () => void;
  onComplete: () => void;
}

const CompleteStepPanel = memo(function CompleteStepPanel({
  title,
  description,
  message,
  isCompletingMerge,
  onMessageChange,
  onAbort,
  onComplete,
}: CompleteStepPanelProps): JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Card className="mx-auto w-full max-w-3xl">
        <CardContent className="space-y-4 p-6">
          <div>
            <p className="mb-2 text-lg font-medium text-theme-primary">{title}</p>
            <p className="text-sm text-theme-secondary">{description}</p>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-theme-muted">Merge message</p>
            <Textarea value={message} onChange={(event) => onMessageChange(event.target.value)} rows={4} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center gap-3">
        <Button onClick={onAbort} variant="outline" disabled={isCompletingMerge}>
          <X style={iconSm} className="mr-2" />
          Cancel
        </Button>
        <Button onClick={onComplete} disabled={isCompletingMerge || !message.trim()}>
          {isCompletingMerge ? <Loader2 style={iconSm} className="mr-2 animate-spin" /> : <Check style={iconSm} className="mr-2" />}
          Save my choices and finish
        </Button>
      </div>
    </div>
  );
});

interface ResolveStepPanelProps {
  conflictedFiles: ConflictedFile[];
  selectedConflictFile: string | null;
  fileResolutions: Record<string, ResolutionStrategy>;
  isResolvingConflict: boolean;
  isCompletingMerge: boolean;
  conflictSidesInfo: ConflictSidesInfo | null;
  sourceBranch: string;
  targetBranch: string;
  message: string;
  onMessageChange: (value: string) => void;
  onSelectFile: (path: string | null) => void;
  onResolve: (filePath: string, strategy: ResolutionStrategy) => void | Promise<void>;
  onAbort: () => void;
  onComplete: () => void;
}

const ResolveStepPanel = memo(function ResolveStepPanel({
  conflictedFiles,
  selectedConflictFile,
  fileResolutions,
  isResolvingConflict,
  isCompletingMerge,
  conflictSidesInfo,
  sourceBranch,
  targetBranch,
  message,
  onMessageChange,
  onSelectFile,
  onResolve,
  onAbort,
  onComplete,
}: ResolveStepPanelProps): JSX.Element {
  const unresolvedCount = conflictedFiles.filter((file) => !fileResolutions[file.path]).length;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-6">
      <div className="min-h-0 flex-1">
        <MergeConflictQueue
          conflictedFiles={conflictedFiles}
          selectedConflictFile={selectedConflictFile}
          fileResolutions={fileResolutions}
          isResolvingConflict={isResolvingConflict}
          conflictSidesInfo={conflictSidesInfo}
          sourceBranch={sourceBranch}
          targetBranch={targetBranch}
          onSelectFile={onSelectFile}
          onResolve={onResolve}
        />
      </div>

      {unresolvedCount === 0 && conflictedFiles.length > 0 && (
        <Card className="mx-auto w-full max-w-3xl">
          <CardContent className="space-y-4 p-6">
            <div>
              <p className="mb-2 text-lg font-medium text-theme-primary">All choices are saved</p>
              <p className="text-sm text-theme-secondary">The repository reports no remaining conflicts. Add a merge message and finish.</p>
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-theme-muted">Merge message</p>
              <Textarea value={message} onChange={(event) => onMessageChange(event.target.value)} rows={3} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center gap-3">
        <Button onClick={onAbort} variant="outline" disabled={isResolvingConflict || isCompletingMerge}>
          <X style={iconSm} className="mr-2" />
          Cancel
        </Button>
        {unresolvedCount === 0 && conflictedFiles.length > 0 && (
          <Button onClick={onComplete} disabled={isResolvingConflict || isCompletingMerge || !message.trim()}>
            {isCompletingMerge ? <Loader2 style={iconSm} className="mr-2 animate-spin" /> : <Check style={iconSm} className="mr-2" />}
            Save my choices and finish
          </Button>
        )}
      </div>
    </div>
  );
});

interface SuccessPanelProps {
  message?: string;
  onDismiss: () => void;
  showDeleteMergedBranchCard?: boolean;
  mergedBranchName?: string;
  onDeleteMergedBranch?: () => void;
  onSkipDelete?: () => void;
  onOpenBranchManagement?: () => void;
  isDeletingMergedBranch?: boolean;
}

const SuccessPanel = memo(function SuccessPanel({
  message,
  onDismiss,
  showDeleteMergedBranchCard = false,
  mergedBranchName,
  onDeleteMergedBranch,
  onSkipDelete,
  onOpenBranchManagement,
  isDeletingMergedBranch = false,
}: SuccessPanelProps): JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <CheckCircle2 style={iconLg} className="mx-auto mb-4 text-green-400" />
        <h2 className="mb-2 text-xl font-semibold text-theme-primary">Merge complete</h2>
        <p className="mb-6 text-sm text-theme-muted">{message || 'Your changes have been successfully merged.'}</p>

        {showDeleteMergedBranchCard && mergedBranchName && onDeleteMergedBranch && onSkipDelete && onOpenBranchManagement ? (
          <Card className="text-left">
            <CardHeader className="pb-2">
              <p className="text-sm font-medium text-theme-primary">Clean up merged branch</p>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="mb-4 text-sm text-theme-secondary">
                Old branches confuse the next save flow. Delete {mergedBranchName} if you do not need it anymore.
              </p>

              <div className="flex gap-2">
                <Button onClick={onDeleteMergedBranch} disabled={isDeletingMergedBranch} className="flex-1">
                  {isDeletingMergedBranch ? (
                    <>
                      <Loader2 style={iconSm} className="mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 style={iconSm} className="mr-2" />
                      Delete {mergedBranchName}
                    </>
                  )}
                </Button>
                <Button onClick={onSkipDelete} variant="outline" disabled={isDeletingMergedBranch} className="flex-1">
                  Skip
                </Button>
              </div>

              <button
                type="button"
                onClick={onOpenBranchManagement}
                className="mt-3 text-xs text-theme-muted underline hover:text-theme-primary"
              >
                Open Branch Management
              </button>
            </CardContent>
          </Card>
        ) : (
          <Button onClick={onDismiss}>Done</Button>
        )}
      </div>
    </div>
  );
});

interface AlreadyUpToDatePanelProps {
  targetBranch: string;
  onDismiss: () => void;
}

const AlreadyUpToDatePanel = memo(function AlreadyUpToDatePanel({
  targetBranch,
  onDismiss,
}: AlreadyUpToDatePanelProps): JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <CheckCircle2 style={iconLg} className="mx-auto mb-4 text-blue-400" />
        <h2 className="mb-2 text-xl font-semibold text-theme-primary">Already up to date</h2>
        <p className="mb-6 text-sm text-theme-muted">{targetBranch} already contains all your changes. Nothing to merge.</p>
        <Button onClick={onDismiss}>Got it</Button>
      </div>
    </div>
  );
});

const NoRepoPanel = memo(function NoRepoPanel(): JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <FolderOpen style={iconLg} className="mx-auto mb-4 text-theme-muted" />
        <h2 className="mb-2 text-xl font-semibold text-theme-primary">No repository open</h2>
        <p className="text-sm text-theme-muted">Open a folder with version control to merge changes.</p>
      </div>
    </div>
  );
});

interface BranchDirectionBannerProps {
  sourceBranch: string;
  targetBranch: string;
}

const BranchDirectionBanner = memo(function BranchDirectionBanner({
  sourceBranch,
  targetBranch,
}: BranchDirectionBannerProps): JSX.Element {
  return (
    <div className="shrink-0 border-t border-theme-default bg-theme-surface/50 px-6 py-4">
      <div className="flex items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <GitBranch style={iconSm} className="text-blue-400" />
          <span className="text-lg font-semibold text-blue-400">{sourceBranch}</span>
        </div>
        <ArrowRight style={{ width: ICON_SIZES.md, height: ICON_SIZES.md }} className="text-theme-muted" />
        <div className="flex items-center gap-2">
          <GitBranch style={iconSm} className="text-theme-warning" />
          <span className="text-lg font-semibold text-theme-warning">{targetBranch}</span>
        </div>
      </div>
      <p className="mt-1 text-center text-xs text-theme-muted">Merging your changes into the destination branch</p>
    </div>
  );
});

function MergeChangesPage(): JSX.Element {
  const { setActiveView, setSelectedRepoSettingsCategory } = useLayout();
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
  } = useMergeFlowController();

  const [message, setMessage] = useState(defaultMergeMessage);

  useEffect(() => {
    setMessage(defaultMergeMessage);
  }, [defaultMergeMessage]);

  const handleOpenBranchManagement = useCallback((): void => {
    setSelectedRepoSettingsCategory('branch-management');
    setActiveView(VIEWS.REPO_SETTINGS);
  }, [setActiveView, setSelectedRepoSettingsCategory]);

  const handleDeleteBranchAndDismiss = useCallback((): void => {
    void handleDeleteMergedBranch();
  }, [handleDeleteMergedBranch]);

  const handleAbortMerge = useCallback((): void => {
    void handleAbort();
  }, [handleAbort]);

  const handleFinishMerge = useCallback((): void => {
    void handleComplete(message);
  }, [handleComplete, message]);

  if (!repoPath) {
    return <NoRepoPanel />;
  }

  if (mergeOutcomeState === 'success') {
    return (
      <SuccessPanel
        message={conflictCheckResult?.autoCompleted ? 'Merge completed automatically.' : undefined}
        onDismiss={handleDismiss}
        showDeleteMergedBranchCard={canDeleteMergedBranch}
        mergedBranchName={branchToCleanUp}
        onDeleteMergedBranch={handleDeleteBranchAndDismiss}
        onSkipDelete={handleDismiss}
        onOpenBranchManagement={handleOpenBranchManagement}
        isDeletingMergedBranch={isDeletingMergedBranch}
      />
    );
  }

  if (mergeOutcomeState === 'up-to-date') {
    return <AlreadyUpToDatePanel targetBranch={effectiveTarget} onDismiss={handleDismiss} />;
  }

  const checkError = error || (conflictCheckResult && !conflictCheckResult.success ? conflictCheckResult.error || null : null);

  let contentPanel: JSX.Element;

  switch (mergeOutcomeState) {
    case 'preparing':
      contentPanel = (
        <LoadingPanel
          title="Preparing merge"
          description="Checking whether your work can be merged safely."
        />
      );
      break;
    case 'setup':
      contentPanel = (
        <CheckPanel
          currentBranch={currentBranch}
          targetBranch={targetBranch}
          effectiveTarget={effectiveTarget}
          availableBranches={availableBranches}
          isChecking={isCheckingConflicts}
          error={checkError}
          isSquashMerge={isSquashMerge}
          onTargetChange={setTargetBranch}
          onCheck={() => {
            void handleCheck();
          }}
          onSquashChange={setIsSquashMerge}
        />
      );
      break;
    case 'ready':
    case 'review':
    case 'needs-decisions':
      contentPanel = (
        <ReviewStepPanel
          repoPath={repoPath}
          hasConflicts={mergeOutcomeState === 'needs-decisions'}
          conflictedFiles={conflictCheckResult?.conflictedFiles || conflictedFiles}
          mergeReviewFiles={mergeReviewFiles}
          selectedReviewFiles={selectedReviewFiles}
          reviewFilePath={reviewFilePath}
          reviewDiff={reviewDiff}
          isLoadingMergeReviewFiles={isLoadingMergeReviewFiles}
          isLoadingReviewDiff={isLoadingReviewDiff}
          isProcessing={isCheckingConflicts}
          onToggleReviewFile={handleToggleReviewFile}
          onToggleAllReviewFiles={handleToggleAllReviewFiles}
          onReviewFile={handleReviewFile}
          onStartMerge={() => {
            void handleStartMerge();
          }}
          onCancel={handleDismiss}
        />
      );
      break;
    case 'resolving-preparing':
      contentPanel = (
        <LoadingPanel
          title="Preparing conflict list"
          description="The merge has started. ControlZebra is checking which files still need a choice."
        />
      );
      break;
    case 'resolving':
      contentPanel = (
        <ResolveStepPanel
          conflictedFiles={conflictedFiles}
          selectedConflictFile={selectedConflictFile}
          fileResolutions={fileResolutions}
          isResolvingConflict={isResolvingConflict}
          isCompletingMerge={isCompletingMerge}
          conflictSidesInfo={conflictSidesInfo}
          sourceBranch={effectiveSource}
          targetBranch={effectiveTarget}
          message={message}
          onMessageChange={setMessage}
          onSelectFile={setSelectedConflictFile}
          onResolve={handleResolve}
          onAbort={handleAbortMerge}
          onComplete={handleFinishMerge}
        />
      );
      break;
    case 'complete':
      contentPanel = (
        <CompleteStepPanel
          title="Everything is ready"
          description="The repository confirms there are no unresolved conflicts. Add a merge message and finish."
          message={message}
          isCompletingMerge={isCompletingMerge}
          onMessageChange={setMessage}
          onAbort={handleAbortMerge}
          onComplete={handleFinishMerge}
        />
      );
      break;
    default:
      contentPanel = (
        <LoadingPanel
          title="Preparing merge"
          description="Checking whether your work can be merged safely."
        />
      );
      break;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MergeStepper currentStep={currentMergeStep} />
      {contentPanel}
      {showBranchBanner && (
        <BranchDirectionBanner sourceBranch={effectiveSource} targetBranch={effectiveTarget} />
      )}
    </div>
  );
}

export default memo(MergeChangesPage);
