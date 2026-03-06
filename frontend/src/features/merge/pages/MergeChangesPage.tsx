/**
 * MergeChangesPage - Clean MVP implementation
 * 
 * A simplified 3-step merge workflow:
 * 1. CHECK: Select target branch and check for conflicts
 * 2. RESOLVE: For each conflict, choose Keep Mine / Keep Theirs
 * 3. COMPLETE: Review and complete the merge with a commit message
 * 
 * Design principles:
 * - All logic in one file for clarity
 * - Minimal state - derive what we can
 * - Clear visual feedback at each step
 */
import { memo, useCallback, useState, useEffect, useMemo, type CSSProperties, type ChangeEvent } from 'react';
import {
  Merge,
  Search,
  Eye,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  X,
  ChevronDown,
  FolderOpen,
  Play,
  FileWarning,
  GitBranch,
  ClipboardCheck,
  Wrench,
  Flag,
  User,
  Clock,
  Hash,
  MessageSquare,
  Info,
  Trash2,
} from 'lucide-react';
import { ICON_SIZES, VIEWS } from '../../../constants';
import {
  Button, Badge, Card, CardHeader, CardContent,
} from '../../../components/ui';
import { useLayout, useRepo, type BranchInfo, type ConflictedFile, type ResolutionStrategy, type MergeReviewFile, type MergeReviewDiffResult } from '../../../context';
import MergeReviewDiffModal from '../components/MergeReviewDiffModal';

// ============================================================================
// Types
// ============================================================================

interface CommitInfo {
  author?: string;
  message?: string;
  hash?: string;
  date?: string;
}

interface ConflictSidesInfo {
  ours?: CommitInfo;
  theirs?: CommitInfo;
}

interface CheckPanelProps {
  currentBranch: string;
  targetBranch: string;
  onTargetChange: (branch: string) => void;
  availableBranches: BranchInfo[];
  onCheck: () => void;
  isChecking: boolean;
  error: string | null;
  isSquashMerge: boolean;
  onSquashChange: (value: boolean) => void;
}

interface ConflictCheckResultPanelProps {
  sourceBranch: string;
  targetBranch: string;
  hasConflicts: boolean;
  conflictCount: number;
  mergeReviewFiles: MergeReviewFile[];
  selectedReviewFiles: string[];
  onToggleReviewFile: (filePath: string) => void;
  onToggleAllReviewFiles: () => void;
  onReviewFile: (filePath: string) => void;
  isLoadingMergeReviewFiles: boolean;
  onStartMerge: () => void;
  onCancel: () => void;
  isProcessing: boolean;
  isSquashMerge: boolean;
}

interface CleanMergePanelProps {
  sourceBranch: string;
  targetBranch: string;
  onComplete: (message: string) => void;
  onAbort: () => void;
  isProcessing: boolean;
  isSquashMerge: boolean;
}

interface ResolutionCardProps {
  type: 'mine' | 'theirs';
  isSelected: boolean;
  isOtherSelected: boolean;
  onSelect: (type: 'mine' | 'theirs') => void;
  disabled: boolean;
  commitInfo?: CommitInfo;
  branchName?: string;
}

interface FileResolutionPanelProps {
  filePath: string;
  currentResolution: ResolutionStrategy | null;
  onConfirm: (filePath: string, strategy: ResolutionStrategy) => void;
  onBack: () => void;
  isProcessing: boolean;
  conflictSidesInfo?: ConflictSidesInfo;
  sourceBranch: string;
  targetBranch: string;
}

interface ConflictsOverviewPanelProps {
  conflictedFiles: ConflictedFile[];
  fileResolutions: Record<string, ResolutionStrategy>;
  sourceBranch: string;
  targetBranch: string;
  onSelectFile: (path: string) => void;
  onComplete: (message: string) => void;
  onAbort: () => void;
  isProcessing: boolean;
  isSquashMerge: boolean;
}

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

interface AlreadyUpToDatePanelProps {
  targetBranch: string;
  onDismiss: () => void;
}

// ============================================================================
// Styles
// ============================================================================

const iconSm: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconLg: CSSProperties = { width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 };

// ============================================================================
// MERGE STEPPER
// ============================================================================

type MergeStep = 'check' | 'review' | 'resolve' | 'complete';

const MERGE_STEPS: { id: MergeStep; label: string; icon: typeof Search }[] = [
  { id: 'check', label: 'Check', icon: Search },
  { id: 'review', label: 'Review', icon: ClipboardCheck },
  { id: 'resolve', label: 'Resolve', icon: Wrench },
  { id: 'complete', label: 'Complete', icon: Flag },
];

function getStepIndex(step: MergeStep): number {
  return MERGE_STEPS.findIndex(s => s.id === step);
}

interface MergeStepperProps {
  currentStep: MergeStep;
}

const MergeStepper = memo(function MergeStepper({ currentStep }: MergeStepperProps): JSX.Element {
  const currentIdx = getStepIndex(currentStep);

  return (
    <div className="shrink-0 border-b border-theme-default bg-theme-surface/50 px-6 py-4">
      <div className="flex items-center justify-center max-w-lg mx-auto">
        {MERGE_STEPS.map((step, idx) => {
          const isCompleted = idx < currentIdx;
          const isActive = idx === currentIdx;
          const StepIcon = step.icon;

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-initial">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5 relative">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
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
                  className={`text-[11px] font-medium whitespace-nowrap ${
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

              {/* Connector line (not after last step) */}
              {idx < MERGE_STEPS.length - 1 && (
                <div className="flex-1 mx-2 mt-[-18px]">
                  <div
                    className={`h-0.5 w-full rounded transition-all ${
                      idx < currentIdx ? 'bg-green-500' : 'bg-theme-default'
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

// ============================================================================
// STEP 1: Initial Check Panel
// ============================================================================
const CheckPanel = memo(function CheckPanel({
  currentBranch,
  targetBranch,
  onTargetChange,
  availableBranches,
  onCheck,
  isChecking,
  error,
  isSquashMerge,
  onSquashChange,
}: CheckPanelProps): JSX.Element {
  const [showSelector, setShowSelector] = useState(false);
  const isSameBranch = currentBranch === (targetBranch || 'main');

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md w-full">
        <Merge style={iconLg} className="text-blue-400 mx-auto mb-4" />
        <h2 className="text-theme-primary text-xl font-semibold mb-2">
          Merge changes
        </h2>
        <p className="text-theme-muted text-sm mb-6">
          Merge your changes from <span className="text-blue-400 font-medium">{currentBranch}</span> into another branch.
        </p>

        {/* Error display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-left">
            <div className="flex items-start gap-2">
              <XCircle style={iconSm} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Control panel */}
        <div className="bg-theme-surface border border-theme-default rounded-lg p-4 space-y-4">
          {/* Merge direction */}
          <div className={`flex items-center justify-center gap-3 py-2 px-3 bg-theme-base rounded-lg ${
            isSameBranch ? 'border border-orange-500/30' : ''
          }`}>
            <span className="text-blue-400 font-medium">{currentBranch}</span>
            <ArrowRight style={iconSm} className="text-theme-muted" />
            <span className={`font-medium ${isSameBranch ? 'text-orange-400' : 'text-green-400'}`}>{targetBranch || 'main'}</span>
          </div>

          {/* Target branch selector */}
          <div className="text-left">
            <button
              onClick={() => setShowSelector(!showSelector)}
              className="flex items-center gap-2 text-theme-muted text-xs hover:text-theme-secondary"
            >
              <span>Destination Branch: <span className="text-theme-primary">{targetBranch || 'main'}</span></span>
              <ChevronDown style={{ width: 12, height: 12 }} className={showSelector ? 'rotate-180' : ''} />
            </button>
            
            {showSelector && (
              <select
                value={targetBranch || ''}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => onTargetChange(e.target.value)}
                className="mt-2 w-full px-2 py-1.5 bg-theme-base border border-theme-default rounded text-sm text-theme-primary"
              >
                <option value="">Auto-detect (main/master)</option>
                {availableBranches.map(b => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Squash merge toggle */}
          <div className="flex items-center justify-between py-2 px-3 bg-theme-base rounded-lg">
            <div className="text-left">
              <p className="text-theme-primary text-sm font-medium">Squash commits (Recommended)</p>
              <p className="text-theme-muted text-xs">Better for larger files and cleaner history</p>
            </div>
            <button
              onClick={() => onSquashChange(!isSquashMerge)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isSquashMerge ? 'bg-blue-500' : 'bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  isSquashMerge ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Check button */}
          <Button onClick={onCheck} disabled={isChecking || isSameBranch} className="w-full">
            {isChecking ? (
              <>
                <Loader2 style={iconSm} className="animate-spin mr-2" />
                Checking...
              </>
            ) : (
              <>
                <Search style={iconSm} className="mr-2" />
                Check for Conflicts
              </>
            )}
          </Button>

          {/* Same branch warning */}
          {isSameBranch && (
            <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-left">
              <Info style={iconSm} className="text-orange-400 mt-0.5 shrink-0" />
              <p className="text-orange-400 text-sm">
                Source and destination branch are the same. Select a different destination branch to merge into.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// STEP 1b: Conflict Check Results (shown after dry-run, before starting merge)
// ============================================================================
const ConflictCheckResultPanel = memo(function ConflictCheckResultPanel({
  hasConflicts,
  conflictCount,
  mergeReviewFiles,
  selectedReviewFiles,
  onToggleReviewFile,
  onToggleAllReviewFiles,
  onReviewFile,
  isLoadingMergeReviewFiles,
  onStartMerge,
  onCancel,
  isProcessing,
  isSquashMerge,
}: ConflictCheckResultPanelProps): JSX.Element {
  const allSelected = mergeReviewFiles.length > 0 && selectedReviewFiles.length === mergeReviewFiles.length;
  const canStartMerge = mergeReviewFiles.length === 0 || selectedReviewFiles.length > 0;

  return (
    <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
      <div className="text-center max-w-xl w-full">
        {hasConflicts ? (
          <>
            <AlertTriangle style={iconLg} className="text-theme-warning mx-auto mb-4" />
            <h2 className="text-theme-primary text-xl font-semibold mb-2">
              {conflictCount === 1
                ? 'One file needs your attention'
                : `${conflictCount} files need your attention`}
            </h2>
            <p className="text-theme-secondary text-sm mb-6">
              Both branches changed the same files. You'll choose which version to keep for each one.
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 style={iconLg} className="text-theme-muted mx-auto mb-4" />
            <h2 className="text-theme-primary text-xl font-semibold mb-2">
              Ready to merge
            </h2>
            <p className="text-theme-secondary text-sm mb-6">
              No conflicts found. Your changes can be merged cleanly.
            </p>
            
            {isSquashMerge && (
              <div className="bg-theme-surface border border-theme-default rounded-lg p-3 mb-4 text-left">
                <p className="text-theme-secondary text-xs">
                  All changes will be combined into a single save.
                </p>
              </div>
            )}
          </>
        )}

        <Card className="mb-6 text-left">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <p className="text-theme-muted text-xs uppercase tracking-wide font-medium">Files to merge</p>
              <Badge variant="outline">{selectedReviewFiles.length}/{mergeReviewFiles.length} selected</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoadingMergeReviewFiles ? (
              <div className="py-8 flex items-center justify-center text-theme-muted text-sm gap-2">
                <Loader2 style={iconSm} className="animate-spin" />
                Loading files...
              </div>
            ) : mergeReviewFiles.length === 0 ? (
              <p className="text-theme-muted text-sm py-3">No changed files available for review.</p>
            ) : (
              <>
                <label className="flex items-center gap-2 px-2 py-2 border-b border-theme-default mb-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAllReviewFiles}
                    className="rounded border-theme-default bg-theme-base"
                  />
                  <span className="text-theme-secondary text-sm">Select all files</span>
                </label>
                <div className="max-h-52 overflow-y-auto -mx-1 space-y-1">
                  {mergeReviewFiles.map((file) => {
                    const checked = selectedReviewFiles.includes(file.path);
                    const fileName = file.path.split('/').pop() || file.path;
                    const fileStatus = file.status || 'modified';
                    return (
                      <div key={file.path} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-theme-muted/10">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleReviewFile(file.path)}
                          className="rounded border-theme-default bg-theme-base shrink-0"
                        />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-theme-primary text-sm truncate">
                            {file.oldPath && file.oldPath !== file.path ? `${file.oldPath} → ${file.path}` : fileName}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">{fileStatus}</Badge>
                        <button
                          onClick={() => onReviewFile(file.path)}
                          className="shrink-0 text-theme-muted hover:text-theme-primary transition-colors p-1 rounded hover:bg-theme-muted/10"
                          title={`Review changes in ${fileName}`}
                        >
                          <Eye style={iconSm} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Button onClick={onCancel} variant="outline" disabled={isProcessing}>
            <X style={iconSm} className="mr-2" />
            Cancel
          </Button>
          <Button onClick={onStartMerge} disabled={isProcessing || !canStartMerge}>
            {isProcessing ? (
              <Loader2 style={iconSm} className="animate-spin mr-2" />
            ) : (
              <Play style={iconSm} className="mr-2" />
            )}
            Start Merge
          </Button>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// STEP 2a: Clean Merge (No Conflicts) - shown after merge is started
// ============================================================================
const CleanMergePanel = memo(function CleanMergePanel({
  sourceBranch,
  targetBranch,
  onComplete,
  onAbort,
  isProcessing,
  isSquashMerge,
}: CleanMergePanelProps): JSX.Element {
  const defaultMessage = isSquashMerge 
    ? `Squash merge ${sourceBranch} into ${targetBranch}`
    : `Merge ${sourceBranch} into ${targetBranch}`;
  const [message, setMessage] = useState(defaultMessage);

  const handleComplete = useCallback((): void => {
    onComplete(message);
  }, [message, onComplete]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md w-full">
        <CheckCircle2 style={iconLg} className="text-green-400 mx-auto mb-4" />
        <h2 className="text-theme-primary text-xl font-semibold mb-2">
          Ready to {isSquashMerge ? 'Squash Merge' : 'Merge'}
        </h2>
        <p className="text-theme-muted text-sm mb-6">
          No conflicts detected. You can {isSquashMerge ? 'squash merge' : 'merge'} <span className="text-blue-400">{sourceBranch}</span> into <span className="text-green-400">{targetBranch}</span>.
        </p>

        {/* Squash merge info */}
        {isSquashMerge && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4 text-left">
            <p className="text-blue-400 text-xs">
              <strong>Squash merge:</strong> All commits from {sourceBranch} will be combined into a single commit on {targetBranch}.
            </p>
          </div>
        )}

        {/* Commit message */}
        <div className="bg-theme-surface border border-theme-default rounded-lg p-4 mb-4 text-left">
          <label className="text-theme-muted text-xs block mb-2">
            {isSquashMerge ? 'Commit Message' : 'Merge Message'}
          </label>
          <textarea
            value={message}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-theme-base border border-theme-default rounded text-sm text-theme-primary resize-none"
            placeholder={isSquashMerge ? "Describe your changes..." : "Describe this merge..."}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Button onClick={onAbort} variant="outline" disabled={isProcessing}>
            <X style={iconSm} className="mr-2" />
            Cancel
          </Button>
          <Button onClick={handleComplete} disabled={isProcessing || !message.trim()}>
            {isProcessing ? (
              <Loader2 style={iconSm} className="animate-spin mr-2" />
            ) : (
              <Check style={iconSm} className="mr-2" />
            )}
            {isSquashMerge ? 'Complete Squash Merge' : 'Complete Merge'}
          </Button>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// STEP 2b: Conflict Resolution
// ============================================================================

// Normalize git date strings (e.g. "2026-01-15 14:30:52 +0530") into ISO 8601
function normalizeGitDate(dateStr: string): Date {
  let date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    // Try fixing common git %ci format: "2026-01-15 14:30:52 +0530"
    // Convert to ISO 8601: replace first space with 'T', add colon in offset
    const fixed = dateStr
      .replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/, '$1T$2')
      .replace(/([+-])(\d{2})(\d{2})$/, '$1$2:$3');
    date = new Date(fixed);
  }
  return date;
}

// Format a date string into a human-readable relative time
function formatRelativeTime(dateStr: string): string {
  try {
    const date = normalizeGitDate(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatFullDate(dateStr: string): string {
  try {
    const date = normalizeGitDate(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// Card for selecting mine/theirs
const ResolutionCard = memo(function ResolutionCard({
  type,
  isSelected,
  isOtherSelected,
  onSelect,
  disabled,
  commitInfo,
  branchName,
}: ResolutionCardProps): JSX.Element {
  const isMine = type === 'mine';

  const relativeTime = useMemo(() => {
    if (!commitInfo?.date) return null;
    return formatRelativeTime(commitInfo.date);
  }, [commitInfo?.date]);

  const fullDate = useMemo(() => {
    if (!commitInfo?.date) return null;
    return formatFullDate(commitInfo.date);
  }, [commitInfo?.date]);

  return (
    <button
      onClick={() => onSelect(type)}
      disabled={disabled}
      className={`relative flex-1 p-5 rounded-lg border-2 text-left transition-all flex flex-col ${
        isSelected
          ? isMine
            ? 'border-theme-accent-strong bg-theme-accent'
            : 'border-theme-warning-strong bg-theme-warning'
          : 'border-theme-default hover:border-theme-muted bg-theme-surface'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {/* Discard overlay when the other card is selected */}
      {isOtherSelected && (
        <div className="absolute inset-0 rounded-lg bg-theme-base-50 flex items-center justify-center z-10 pointer-events-none">
          <Trash2 style={{ width: 144, height: 144 }} className="text-red-400" />
        </div>
      )}
      {/* Header: title + branch badge */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isMine ? 'bg-[var(--color-accent-primary)]' : 'bg-[var(--color-warning)]'}`} />
          <h3 className="text-theme-primary font-semibold text-base">
            {isMine ? 'Keep Mine' : 'Keep Theirs'}
          </h3>
        </div>
        {branchName && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            isMine
              ? 'text-theme-accent-muted border-theme-accent bg-theme-accent'
              : 'text-theme-warning-muted border-theme-warning bg-theme-warning'
          }`}>
            <GitBranch style={{ width: 10, height: 10, display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
            {branchName}
          </span>
        )}
      </div>

      {/* Subtitle */}
      <p className="text-theme-muted text-xs mb-4">
        {isMine
          ? 'Your version — changes you made locally'
          : 'Their version — incoming changes from the target branch'
        }
      </p>

      {/* Commit details section */}
      {commitInfo && (commitInfo.author || commitInfo.message || commitInfo.hash) ? (
        <div className="mt-auto pt-3 border-t border-theme-default space-y-2.5">
          <p className={`text-[10px] font-medium uppercase tracking-wider ${
            isMine ? 'text-theme-accent-subtle' : 'text-theme-warning-subtle'
          }`}>
            Last change on this branch
          </p>

          {/* Author */}
          {commitInfo.author && (
            <div className="flex items-center gap-2">
              <User style={{ width: 12, height: 12 }} className="text-theme-muted shrink-0" />
              <span className="text-theme-secondary text-xs font-medium">{commitInfo.author}</span>
            </div>
          )}

          {/* Date */}
          {relativeTime && (
            <div className="flex items-center gap-2">
              <Clock style={{ width: 12, height: 12 }} className="text-theme-muted shrink-0" />
              <span className="text-theme-secondary text-xs">{relativeTime}</span>
              {fullDate && (
                <span className="text-theme-muted text-[10px]">({fullDate})</span>
              )}
            </div>
          )}

          {/* Commit message */}
          {commitInfo.message && (
            <div className="flex items-start gap-2">
              <MessageSquare style={{ width: 12, height: 12 }} className="text-theme-muted shrink-0 mt-0.5" />
              <p className="text-theme-secondary text-xs leading-relaxed line-clamp-2">
                {commitInfo.message}
              </p>
            </div>
          )}

          {/* Commit hash */}
          {commitInfo.hash && (
            <div className="flex items-center gap-2">
              <Hash style={{ width: 12, height: 12 }} className="text-theme-muted shrink-0" />
              <span className="text-theme-muted text-[10px] font-mono">{commitInfo.hash.slice(0, 7)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-auto pt-3 border-t border-theme-default">
          <p className="text-theme-muted text-xs italic">No commit details available</p>
        </div>
      )}

      {/* Consequence warning */}
      <div className={`mt-3 pt-2.5 border-t border-theme-default`}>
        <div className="flex items-start gap-1.5">
          <Info style={{ width: 11, height: 11 }} className={`shrink-0 mt-0.5 ${
            isMine ? 'text-theme-accent-subtle' : 'text-theme-warning-subtle'
          }`} />
          <p className={`text-[11px] leading-relaxed ${
            isMine ? 'text-theme-accent-muted' : 'text-theme-warning-muted'
          }`}>
            {isMine
              ? 'Incoming changes to this file will be discarded'
              : 'Your local changes to this file will be discarded'
            }
          </p>
        </div>
      </div>
    </button>
  );
});

// File resolution UI (shown when a file is selected)
const FileResolutionPanel = memo(function FileResolutionPanel({
  filePath,
  currentResolution,
  onConfirm,
  onBack,
  isProcessing,
  conflictSidesInfo,
  sourceBranch,
  targetBranch,
}: FileResolutionPanelProps): JSX.Element {
  const [selected, setSelected] = useState<ResolutionStrategy | null>(currentResolution || null);
  const fileName = filePath.split('/').pop();

  useEffect(() => {
    setSelected(currentResolution || null);
  }, [filePath, currentResolution]);

  const handleConfirm = useCallback((): void => {
    if (selected) {
      onConfirm(filePath, selected);
    }
  }, [filePath, selected, onConfirm]);

  return (
    <div className="flex-1 flex flex-col p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-theme-primary text-xl font-normal">
          Which version of <span className="font-semibold">{fileName}</span> do you want to keep?
        </h2>
        <p className="text-theme-muted text-xs mt-1">Project File Path: {filePath}</p>
      </div>

      {/* Resolution cards */}
      <div className="flex gap-4 mb-6">
        <ResolutionCard
          type="mine"
          isSelected={selected === 'mine'}
          isOtherSelected={selected === 'theirs'}
          onSelect={() => setSelected('mine')}
          disabled={isProcessing}
          commitInfo={conflictSidesInfo?.ours}
          branchName={sourceBranch}
        />
        <ResolutionCard
          type="theirs"
          isSelected={selected === 'theirs'}
          isOtherSelected={selected === 'mine'}
          onSelect={() => setSelected('theirs')}
          disabled={isProcessing}
          commitInfo={conflictSidesInfo?.theirs}
          branchName={targetBranch}
        />
      </div>

      {/* Explanation */}
      {selected && (
        <div className={`p-4 rounded-lg border mb-6 ${
          selected === 'mine'
            ? 'bg-theme-accent border-theme-accent'
            : 'bg-theme-warning border-theme-warning'
        }`}>
          <p className="text-sm text-theme-secondary">
            {selected === 'mine'
              ? '✓ Your local changes will be kept. Incoming changes will be discarded for this file.'
              : '✓ Incoming changes will be applied. Your local changes will be discarded for this file.'
            }
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-center">
        <Button onClick={onBack} variant="outline" disabled={isProcessing}>
          <X style={iconSm} className="mr-2" />
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={!selected || isProcessing}>
          {isProcessing ? (
            <Loader2 style={iconSm} className="animate-spin mr-2" />
          ) : (
            <Check style={iconSm} className="mr-2" />
          )}
          {currentResolution ? 'Update Resolution' : 'Confirm Resolution'}
        </Button>
      </div>
    </div>
  );
});

// Conflicts overview (default when conflicts exist but no file selected)
const ConflictsOverviewPanel = memo(function ConflictsOverviewPanel({
  conflictedFiles,
  fileResolutions,
  sourceBranch,
  targetBranch,
  onSelectFile,
  onComplete,
  onAbort,
  isProcessing,
  isSquashMerge,
}: ConflictsOverviewPanelProps): JSX.Element {
  const defaultMessage = isSquashMerge 
    ? `Squash merge ${sourceBranch} into ${targetBranch}`
    : `Merge ${sourceBranch} into ${targetBranch}`;
  const [message, setMessage] = useState(defaultMessage);
  
  const resolvedCount = conflictedFiles.filter(f => fileResolutions[f.path]).length;
  const allResolved = resolvedCount === conflictedFiles.length;

  const handleComplete = useCallback((): void => {
    onComplete(message);
  }, [message, onComplete]);

  return (
    <div className="flex-1 flex flex-col p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <AlertTriangle style={iconLg} className="text-theme-warning mx-auto mb-4" />
        <h2 className="text-theme-primary text-xl font-semibold mb-2">
          {conflictedFiles.length === 1
            ? 'One file needs your attention'
            : `${conflictedFiles.length} files need your attention`}
        </h2>
        <p className="text-theme-secondary text-sm max-w-sm mx-auto">
          Both branches changed the same files. Choose which version to keep for each file, then complete the merge.
        </p>
      </div>

      {/* File list */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <p className="text-theme-muted text-xs uppercase tracking-wide font-medium">Conflicted Files</p>
            <Badge variant={allResolved ? 'success' : 'outline'}>
              {resolvedCount}/{conflictedFiles.length} resolved
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-h-64 overflow-y-auto -mx-1 space-y-1">
            {conflictedFiles.map(file => {
              const isResolved = !!fileResolutions[file.path];
              const resolution = fileResolutions[file.path];
              const fileName = file.path.split('/').pop() || file.path;
              const dirPath = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
              return (
                <div
                  key={file.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                    isResolved
                      ? 'bg-green-500/5 hover:bg-green-500/10'
                      : 'hover:bg-theme-muted/10'
                  }`}
                >
                  {/* Status icon */}
                  <div className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center border ${
                    isResolved
                      ? 'bg-green-500/10 border-green-500/20'
                      : 'bg-theme-warning border-theme-warning'
                  }`}>
                    {isResolved ? (
                      <CheckCircle2 style={iconSm} className="text-green-400" />
                    ) : (
                      <FileWarning style={iconSm} className="text-theme-warning" />
                    )}
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-theme-primary text-sm font-medium truncate">{fileName}</p>
                    {dirPath && (
                      <p className="text-theme-muted text-[11px] truncate">{dirPath}/</p>
                    )}
                  </div>

                  {/* Resolution badge */}
                  {resolution && (
                    <Badge variant={resolution === 'mine' ? 'info' : 'warning'}>
                      {resolution === 'mine' ? 'Mine' : 'Theirs'}
                    </Badge>
                  )}

                  {/* Resolve / Change button */}
                  <Button
                    size="sm"
                    variant={isResolved ? 'ghost' : 'default'}
                    onClick={() => onSelectFile(file.path)}
                  >
                    {isResolved ? (
                      <>Change</>  
                    ) : (
                      <>Resolve</>  
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Completion section (only when all resolved) */}
      {allResolved && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 style={iconSm} className="text-green-400" />
            <span className="text-green-400 font-medium">All conflicts resolved!</span>
          </div>
          {isSquashMerge && (
            <p className="text-blue-400 text-xs mb-3">
              All commits will be combined into a single commit.
            </p>
          )}
          <label className="text-theme-muted text-xs block mb-2">
            {isSquashMerge ? 'Commit Message' : 'Merge Message'}
          </label>
          <textarea
            value={message}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-theme-base border border-theme-default rounded text-sm text-theme-primary resize-none"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-center">
        <Button
          onClick={onAbort}
          variant="outline"
          disabled={isProcessing}
        >
          <X style={iconSm} className="mr-2" />
          Cancel
        </Button>
        {allResolved && (
          <Button onClick={handleComplete} disabled={isProcessing || !message.trim()}>
            {isProcessing ? (
              <Loader2 style={iconSm} className="animate-spin mr-2" />
            ) : (
              <Check style={iconSm} className="mr-2" />
            )}
            {isSquashMerge ? 'Complete Squash Merge' : 'Complete Merge'}
          </Button>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// SUCCESS / SPECIAL STATES
// ============================================================================

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
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md w-full">
        <CheckCircle2 style={iconLg} className="text-green-400 mx-auto mb-4" />
        <h2 className="text-theme-primary text-xl font-semibold mb-2">
          Merge Complete!
        </h2>
        <p className="text-theme-muted text-sm mb-6">
          {message || 'Your changes have been successfully merged.'}
        </p>

        {showDeleteMergedBranchCard && mergedBranchName && onDeleteMergedBranch && onSkipDelete && onOpenBranchManagement ? (
          <Card className="text-left">
            <CardHeader className="pb-2">
              <p className="text-theme-primary text-sm font-medium">Clean up merged branch</p>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-theme-secondary text-sm mb-4">
                Old branches can cause confusion and make it easier to save changes to the wrong place.
              </p>

              <div className="flex gap-2">
                <Button onClick={onDeleteMergedBranch} disabled={isDeletingMergedBranch} className="flex-1">
                  {isDeletingMergedBranch ? (
                    <>
                      <Loader2 style={iconSm} className="animate-spin mr-2" />
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
                className="mt-3 text-xs text-theme-muted hover:text-theme-primary underline"
              >
                Open Branch Management
              </button>
            </CardContent>
          </Card>
        ) : (
          <Button onClick={onDismiss}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
});

const AlreadyUpToDatePanel = memo(function AlreadyUpToDatePanel({ targetBranch, onDismiss }: AlreadyUpToDatePanelProps): JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <CheckCircle2 style={iconLg} className="text-blue-400 mx-auto mb-4" />
        <h2 className="text-theme-primary text-xl font-semibold mb-2">
          Already Up to Date
        </h2>
        <p className="text-theme-muted text-sm mb-6">
          {targetBranch} already contains all your changes. Nothing to merge.
        </p>
        <Button onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </div>
  );
});

const NoRepoPanel = memo(function NoRepoPanel(): JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <FolderOpen style={iconLg} className="text-theme-muted mx-auto mb-4" />
        <h2 className="text-theme-primary text-xl font-semibold mb-2">
          No Repository Open
        </h2>
        <p className="text-theme-muted text-sm">
          Open a folder with version control to merge changes.
        </p>
      </div>
    </div>
  );
});

// ============================================================================
// BRANCH DIRECTION BANNER
// ============================================================================

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
          <span className="text-blue-400 text-lg font-semibold">{sourceBranch}</span>
        </div>
        <ArrowRight style={{ width: ICON_SIZES.md, height: ICON_SIZES.md }} className="text-theme-muted" />
        <div className="flex items-center gap-2">
          <GitBranch style={iconSm} className="text-theme-warning" />
          <span className="text-theme-warning text-lg font-semibold">{targetBranch}</span>
        </div>
      </div>
      <p className="text-theme-muted text-xs text-center mt-1">Merging your changes into the destination branch</p>
    </div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function MergeChangesPage(): JSX.Element {
  const { setActiveView, setSelectedRepoSettingsCategory } = useLayout();

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
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewFilePath, setReviewFilePath] = useState<string | null>(null);
  const [reviewDiff, setReviewDiff] = useState<MergeReviewDiffResult | null>(null);
  const [isLoadingReviewDiff, setIsLoadingReviewDiff] = useState(false);
  const [isDeletingMergedBranch, setIsDeletingMergedBranch] = useState(false);
  const [mergedSourceBranch, setMergedSourceBranch] = useState<string>('');
  const [isCompletingMerge, setIsCompletingMerge] = useState(false);

  // Current branch from repo info
  const currentBranch = repoInfo?.branch || 'current';

  // Available branches for selection (excluding current)
  const availableBranches = useMemo(() =>
    branches?.local?.filter(b => !b.isCurrent) || [],
    [branches?.local]
  );

  // Auto-detect parent branch on mount
  useEffect(() => {
    if (repoPath && !detectedParentBranch) {
      fetchParentBranch();
    }
    if (repoPath && !branches) {
      refreshBranches();
    }
  }, [repoPath, detectedParentBranch, fetchParentBranch, branches, refreshBranches]);

  // Effective target branch
  const effectiveTarget = targetBranch || detectedParentBranch?.name || 'main';

  // Effective source branch - use conflictCheckResult.sourceBranch after merge starts
  // because currentBranch changes to target after StartMerge
  const effectiveSource = conflictCheckResult?.sourceBranch || currentBranch;
  const branchToCleanUp = mergedSourceBranch || effectiveSource;
  const canDeleteMergedBranch = branchToCleanUp !== 'current' && branchToCleanUp !== 'main' && branchToCleanUp !== 'master';

  // Handle check for conflicts (dry-run only - does NOT start merge)
  const handleCheck = useCallback(async (): Promise<void> => {
    setError(null);
    const result = await checkConflictsOnly(targetBranch);
    if (result && !result.success) {
      setError(result.error || 'Failed to check for conflicts');
    }
  }, [targetBranch, checkConflictsOnly]);

  // Handle start merge (actually begins the merge process)
  const handleStartMerge = useCallback(async (): Promise<void> => {
    setError(null);
    const shouldUseSelective = mergeReviewFiles.length > 0;
    if (shouldUseSelective && selectedReviewFiles.length === 0) {
      setError('Select at least one file to start merge.');
      return;
    }

    const result = await startMerge(targetBranch, '', {
      squash: isSquashMerge,
      selective: shouldUseSelective,
      selectedFiles: shouldUseSelective ? selectedReviewFiles : [],
    });
    if (!result) {
      setError('Failed to start merge');
      return;
    }

    if (result.autoCompleted) {
      setMergedSourceBranch(effectiveSource);
      setShowSuccess(true);
    }
  }, [targetBranch, startMerge, mergeReviewFiles.length, selectedReviewFiles, isSquashMerge, effectiveSource]);

  const handleToggleReviewFile = useCallback((filePath: string): void => {
    setSelectedReviewFiles((prev) =>
      prev.includes(filePath)
        ? prev.filter((path) => path !== filePath)
        : [...prev, filePath]
    );
  }, []);

  const handleToggleAllReviewFiles = useCallback((): void => {
    setSelectedReviewFiles((prev) =>
      prev.length === mergeReviewFiles.length ? [] : mergeReviewFiles.map((file) => file.path)
    );
  }, [mergeReviewFiles]);

  const handleReviewFile = useCallback(async (filePath: string): Promise<void> => {
    setReviewFilePath(filePath);
    setReviewDiff(null);
    setIsReviewModalOpen(true);
    setIsLoadingReviewDiff(true);
    const diffResult = await loadMergeReviewFileDiff(filePath, effectiveTarget, effectiveSource);
    setReviewDiff(diffResult);
    setIsLoadingReviewDiff(false);
  }, [loadMergeReviewFileDiff, effectiveTarget, effectiveSource]);

  const handleCloseReviewModal = useCallback((): void => {
    setIsReviewModalOpen(false);
    setReviewFilePath(null);
    setReviewDiff(null);
  }, []);

  // Auto-select all files when review file list loads/changes
  useEffect(() => {
    if (mergeReviewFiles.length > 0) {
      setSelectedReviewFiles(mergeReviewFiles.map((file) => file.path));
    } else {
      setSelectedReviewFiles([]);
    }
  }, [mergeReviewFiles]);

  // Handle file resolution
  const handleResolve = useCallback(async (filePath: string, strategy: ResolutionStrategy): Promise<void> => {
    const success = await resolveConflict(filePath, strategy);
    if (success) {
      setSelectedConflictFile(null); // Go back to overview
    }
  }, [resolveConflict, setSelectedConflictFile]);

  // Handle abort
  const handleAbort = useCallback(async (): Promise<void> => {
    await abortMerge();
    setError(null);
    setShowSuccess(false);
    setMergedSourceBranch('');
    setIsCompletingMerge(false);
    setIsReviewModalOpen(false);
    setReviewFilePath(null);
    setReviewDiff(null);
    setSelectedReviewFiles([]);
  }, [abortMerge]);

  // Handle complete
  const handleComplete = useCallback(async (message: string): Promise<void> => {
    if (isCompletingMerge) return;

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

  // Handle dismiss (reset everything)
  const handleDismiss = useCallback((): void => {
    clearConflicts();
    setError(null);
    setShowSuccess(false);
    setMergedSourceBranch('');
    setIsCompletingMerge(false);
    setIsDeletingMergedBranch(false);
    setTargetBranch('');
    setIsReviewModalOpen(false);
    setReviewFilePath(null);
    setReviewDiff(null);
    setSelectedReviewFiles([]);
  }, [clearConflicts]);

  const handleDeleteMergedBranch = useCallback(async (): Promise<void> => {
    if (!canDeleteMergedBranch || isDeletingMergedBranch) return;

    setIsDeletingMergedBranch(true);
    try {
      const success = await deleteBranch(branchToCleanUp);
      if (success) {
        handleDismiss();
      }
    } finally {
      setIsDeletingMergedBranch(false);
    }
  }, [canDeleteMergedBranch, isDeletingMergedBranch, deleteBranch, branchToCleanUp, handleDismiss]);

  const handleOpenBranchManagement = useCallback((): void => {
    setSelectedRepoSettingsCategory('branch-management');
    setActiveView(VIEWS.REPO_SETTINGS);
  }, [setSelectedRepoSettingsCategory, setActiveView]);

  // ---- Compute the current merge step for the stepper ----
  const resolvedCount = conflictedFiles.filter(f => fileResolutions[f.path]).length;
  const allConflictsResolved = conflictedFiles.length > 0 && resolvedCount === conflictedFiles.length;
  const hasConflictsInMerge = conflictCheckResult?.hasConflicts || conflictedFiles.length > 0;

  const currentMergeStep: MergeStep = useMemo(() => {
    if (showSuccess) return 'complete';
    // Merge started with conflicts, all resolved → complete step
    if (conflictCheckResult?.mergeStarted && allConflictsResolved && conflictedFiles.length > 0) return 'complete';
    // Merge started, no conflicts → complete step (clean merge)
    if (conflictCheckResult?.mergeStarted && !hasConflictsInMerge) return 'complete';
    // Merge started with conflicts, still resolving → resolve step
    if (conflictCheckResult?.mergeStarted && hasConflictsInMerge) return 'resolve';
    // Check done but merge not started → review step
    if (conflictCheckResult?.success && !conflictCheckResult?.mergeStarted) return 'review';
    // Default → check step
    return 'check';
  }, [showSuccess, conflictCheckResult, allConflictsResolved, conflictedFiles.length, hasConflictsInMerge]);

  // No repo open
  if (!repoPath) {
    return <NoRepoPanel />;
  }

  // Loading state
  if (isCheckingConflicts) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <MergeStepper currentStep="check" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 style={iconLg} className="text-blue-400 mx-auto mb-4 animate-spin" />
            <p className="text-theme-muted">Analyzing branches...</p>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (showSuccess) {
    return (
      <SuccessPanel
        onDismiss={handleDismiss}
        showDeleteMergedBranchCard={canDeleteMergedBranch}
        mergedBranchName={branchToCleanUp}
        onDeleteMergedBranch={() => {
          void handleDeleteMergedBranch();
        }}
        onSkipDelete={handleDismiss}
        onOpenBranchManagement={handleOpenBranchManagement}
        isDeletingMergedBranch={isDeletingMergedBranch}
      />
    );
  }

  // Already up to date
  if (conflictCheckResult?.success && conflictCheckResult?.alreadyUpToDate) {
    return (
      <AlreadyUpToDatePanel
        targetBranch={effectiveTarget}
        onDismiss={handleDismiss}
      />
    );
  }

  // Auto-completed merge
  if (conflictCheckResult?.success && conflictCheckResult?.autoCompleted) {
    return (
      <SuccessPanel
        message="Merge completed automatically."
        onDismiss={handleDismiss}
        showDeleteMergedBranchCard={canDeleteMergedBranch}
        mergedBranchName={branchToCleanUp}
        onDeleteMergedBranch={() => {
          void handleDeleteMergedBranch();
        }}
        onSkipDelete={handleDismiss}
        onOpenBranchManagement={handleOpenBranchManagement}
        isDeletingMergedBranch={isDeletingMergedBranch}
      />
    );
  }

  // Helper: whether we are past the initial check panel (i.e. user has committed to a merge direction)
  const showBranchBanner = !!conflictCheckResult?.success;

  // Determine the content panel to show
  let contentPanel: JSX.Element;

  // Check complete but merge NOT started yet - show results with "Start Merge" button
  if (conflictCheckResult?.success && !conflictCheckResult?.mergeStarted) {
    contentPanel = (
      <ConflictCheckResultPanel
        sourceBranch={effectiveSource}
        targetBranch={effectiveTarget}
        hasConflicts={conflictCheckResult?.hasConflicts || false}
        conflictCount={conflictCheckResult?.conflictedFiles?.length || conflictedFiles.length}
        mergeReviewFiles={mergeReviewFiles}
        selectedReviewFiles={selectedReviewFiles}
        onToggleReviewFile={handleToggleReviewFile}
        onToggleAllReviewFiles={handleToggleAllReviewFiles}
        onReviewFile={handleReviewFile}
        isLoadingMergeReviewFiles={isLoadingMergeReviewFiles}
        onStartMerge={handleStartMerge}
        onCancel={handleDismiss}
        isProcessing={isCheckingConflicts}
        isSquashMerge={conflictCheckResult?.isSquashMerge ?? isSquashMerge}
      />
    );
  } else if (conflictCheckResult?.success && conflictCheckResult?.mergeStarted && !conflictCheckResult?.hasConflicts && conflictedFiles.length === 0) {
    // Clean merge - merge started, no conflicts
    contentPanel = (
      <CleanMergePanel
        sourceBranch={effectiveSource}
        targetBranch={effectiveTarget}
        onComplete={handleComplete}
        onAbort={handleAbort}
        isProcessing={isResolvingConflict || isCompletingMerge}
        isSquashMerge={conflictCheckResult?.isSquashMerge ?? isSquashMerge}
      />
    );
  } else if (conflictedFiles.length > 0 && selectedConflictFile) {
    // File selected - show resolution UI
    contentPanel = (
      <FileResolutionPanel
        filePath={selectedConflictFile}
        currentResolution={fileResolutions[selectedConflictFile] || null}
        onConfirm={handleResolve}
        onBack={() => setSelectedConflictFile(null)}
        isProcessing={isResolvingConflict}
        conflictSidesInfo={conflictSidesInfo as ConflictSidesInfo}
        sourceBranch={effectiveSource}
        targetBranch={effectiveTarget}
      />
    );
  } else if (conflictedFiles.length > 0) {
    // Conflicts overview
    contentPanel = (
      <ConflictsOverviewPanel
        conflictedFiles={conflictedFiles}
        fileResolutions={fileResolutions}
        sourceBranch={effectiveSource}
        targetBranch={effectiveTarget}
        onSelectFile={setSelectedConflictFile}
        onComplete={handleComplete}
        onAbort={handleAbort}
        isProcessing={isResolvingConflict || isCompletingMerge}
        isSquashMerge={conflictCheckResult?.isSquashMerge ?? isSquashMerge}
      />
    );
  } else {
    // Initial state - show check panel with stepper
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <MergeStepper currentStep="check" />
        <CheckPanel
          currentBranch={currentBranch}
          targetBranch={effectiveTarget}
          onTargetChange={setTargetBranch}
          availableBranches={availableBranches}
          onCheck={handleCheck}
          isChecking={isCheckingConflicts}
          error={error || (conflictCheckResult && !conflictCheckResult.success ? conflictCheckResult.error || null : null)}
          isSquashMerge={isSquashMerge}
          onSquashChange={setIsSquashMerge}
        />
      </div>
    );
  }

  // Wrap content with stepper at top and branch direction banner at bottom
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <MergeStepper currentStep={currentMergeStep} />
      {contentPanel}
      {showBranchBanner && (
        <BranchDirectionBanner
          sourceBranch={effectiveSource}
          targetBranch={effectiveTarget}
        />
      )}

      <MergeReviewDiffModal
        open={isReviewModalOpen}
        onClose={handleCloseReviewModal}
        reviewFilePath={reviewFilePath}
        reviewDiff={reviewDiff}
        isLoadingReviewDiff={isLoadingReviewDiff}
        repoPath={repoPath}
      />
    </div>
  );
}

export default memo(MergeChangesPage);
