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
} from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { Button } from '../../ui';
import { useRepo, type BranchInfo, type ConflictedFile, type ResolutionStrategy } from '../../../context';

// ============================================================================
// Types
// ============================================================================

interface CommitInfo {
  author?: string;
  message?: string;
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
  conflictedFiles: ConflictedFile[];
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
  onSelect: (type: 'mine' | 'theirs') => void;
  disabled: boolean;
  commitInfo?: CommitInfo;
}

interface FileResolutionPanelProps {
  filePath: string;
  currentResolution: ResolutionStrategy | null;
  onConfirm: (filePath: string, strategy: ResolutionStrategy) => void;
  onBack: () => void;
  isProcessing: boolean;
  conflictSidesInfo?: ConflictSidesInfo;
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
          <div className="flex items-center justify-center gap-3 py-2 px-3 bg-theme-base rounded-lg">
            <span className="text-blue-400 font-medium">{currentBranch}</span>
            <ArrowRight style={iconSm} className="text-theme-muted" />
            <span className="text-green-400 font-medium">{targetBranch || 'main'}</span>
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
          <Button onClick={onCheck} disabled={isChecking} className="w-full">
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
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// STEP 1b: Conflict Check Results (shown after dry-run, before starting merge)
// ============================================================================
const ConflictCheckResultPanel = memo(function ConflictCheckResultPanel({
  sourceBranch,
  targetBranch,
  hasConflicts,
  conflictCount,
  conflictedFiles = [],
  onStartMerge,
  onCancel,
  isProcessing,
  isSquashMerge,
}: ConflictCheckResultPanelProps): JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md w-full">
        {hasConflicts ? (
          <>
            <AlertTriangle style={iconLg} className="text-orange-400 mx-auto mb-4" />
            <h2 className="text-theme-primary text-xl font-semibold mb-2">
              {conflictCount} Conflict{conflictCount !== 1 ? 's' : ''} Detected
            </h2>
            <p className="text-theme-muted text-sm mb-6">
              Merging <span className="text-blue-400 font-medium">{sourceBranch}</span> into{' '}
              <span className="text-green-400 font-medium">{targetBranch}</span> will require
              resolving {conflictCount} file conflict{conflictCount !== 1 ? 's' : ''}.
            </p>
            
            {/* Preview of conflicted files */}
            <div className="bg-theme-surface border border-theme-default rounded-lg p-4 mb-6 text-left">
              <p className="text-theme-muted text-xs uppercase tracking-wide mb-2">Files with conflicts:</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {conflictedFiles.map((file) => (
                  <div key={file.path} className="flex items-center gap-2 py-1">
                    <FileWarning style={iconSm} className="text-orange-400 shrink-0" />
                    <span className="text-theme-primary text-sm truncate">{file.path}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 mb-4 text-left">
              <p className="text-orange-400 text-xs">
                <strong>Note:</strong> Starting the merge will modify your working directory.
                You'll need to resolve each conflict before completing the merge.
              </p>
            </div>
          </>
        ) : (
          <>
            <CheckCircle2 style={iconLg} className="text-green-400 mx-auto mb-4" />
            <h2 className="text-theme-primary text-xl font-semibold mb-2">
              No Conflicts Detected
            </h2>
            <p className="text-theme-muted text-sm mb-6">
              You can safely merge <span className="text-blue-400 font-medium">{sourceBranch}</span> into{' '}
              <span className="text-green-400 font-medium">{targetBranch}</span>.
            </p>
            
            {isSquashMerge && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4 text-left">
                <p className="text-blue-400 text-xs">
                  <strong>Squash merge:</strong> All commits from {sourceBranch} will be combined into a single commit.
                </p>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Button onClick={onCancel} variant="outline" disabled={isProcessing}>
            <X style={iconSm} className="mr-2" />
            Cancel
          </Button>
          <Button onClick={onStartMerge} disabled={isProcessing}>
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

// Card for selecting mine/theirs
const ResolutionCard = memo(function ResolutionCard({
  type,
  isSelected,
  onSelect,
  disabled,
  commitInfo,
}: ResolutionCardProps): JSX.Element {
  const isMine = type === 'mine';
  
  return (
    <button
      onClick={() => onSelect(type)}
      disabled={disabled}
      className={`flex-1 p-4 rounded-lg border-2 text-left transition-all ${
        isSelected
          ? isMine
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-orange-500 bg-orange-500/10'
          : 'border-theme-default hover:border-theme-muted bg-theme-surface'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-3 h-3 rounded-full ${isMine ? 'bg-blue-500' : 'bg-orange-500'}`} />
        <h3 className="text-theme-primary font-medium">
          {isMine ? 'Keep Mine' : 'Keep Theirs'}
        </h3>
      </div>
      <p className="text-theme-muted text-xs">
        {isMine
          ? 'Keep your local version of this file'
          : 'Use the incoming version from the target branch'
        }
      </p>
      {commitInfo && (
        <div className="mt-2 pt-2 border-t border-theme-default">
          <p className="text-theme-muted text-[10px] truncate">
            {commitInfo.author} • {commitInfo.message?.slice(0, 30)}...
          </p>
        </div>
      )}
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
        <button
          onClick={onBack}
          className="text-blue-400 text-sm hover:text-blue-300 mb-2 flex items-center gap-1"
        >
          ← Back to overview
        </button>
        <h2 className="text-theme-primary text-xl font-semibold">
          {fileName}
        </h2>
        <p className="text-theme-muted text-xs mt-1">{filePath}</p>
      </div>

      {/* Resolution cards */}
      <div className="flex gap-4 mb-6">
        <ResolutionCard
          type="mine"
          isSelected={selected === 'mine'}
          onSelect={() => setSelected('mine')}
          disabled={isProcessing}
          commitInfo={conflictSidesInfo?.ours}
        />
        <ResolutionCard
          type="theirs"
          isSelected={selected === 'theirs'}
          onSelect={() => setSelected('theirs')}
          disabled={isProcessing}
          commitInfo={conflictSidesInfo?.theirs}
        />
      </div>

      {/* Explanation */}
      {selected && (
        <div className={`p-4 rounded-lg border mb-6 ${
          selected === 'mine'
            ? 'bg-blue-500/10 border-blue-500/30'
            : 'bg-orange-500/10 border-orange-500/30'
        }`}>
          <p className="text-sm text-theme-secondary">
            {selected === 'mine'
              ? '✓ Your local changes will be kept. Incoming changes will be discarded for this file.'
              : '✓ Incoming changes will be applied. Your local changes will be discarded for this file.'
            }
          </p>
        </div>
      )}

      {/* Confirm button */}
      <div className="flex justify-center">
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
  const progressPercent = conflictedFiles.length > 0 
    ? (resolvedCount / conflictedFiles.length) * 100 
    : 0;

  const handleComplete = useCallback((): void => {
    onComplete(message);
  }, [message, onComplete]);

  return (
    <div className="flex-1 flex flex-col p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <AlertTriangle style={iconLg} className="text-orange-400 mx-auto mb-4" />
        <h2 className="text-theme-primary text-xl font-semibold mb-2">
          {conflictedFiles.length} Conflict{conflictedFiles.length !== 1 ? 's' : ''} Found
        </h2>
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-blue-400">{sourceBranch}</span>
          <ArrowRight style={iconSm} className="text-theme-muted" />
          <span className="text-orange-400">{targetBranch}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-theme-surface border border-theme-default rounded-lg p-4 mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-theme-muted">Resolution Progress</span>
          <span className={allResolved ? 'text-green-400' : 'text-orange-400'}>
            {resolvedCount} / {conflictedFiles.length}
          </span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${allResolved ? 'bg-green-500' : 'bg-orange-500'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {!allResolved && (
          <p className="text-theme-muted text-xs mt-2">
            Click each file in the sidebar to resolve conflicts.
          </p>
        )}
      </div>

      {/* File list (quick access) */}
      <div className="bg-theme-surface border border-theme-default rounded-lg mb-4 max-h-48 overflow-y-auto">
        {conflictedFiles.map(file => {
          const isResolved = !!fileResolutions[file.path];
          const resolution = fileResolutions[file.path];
          return (
            <button
              key={file.path}
              onClick={() => onSelectFile(file.path)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-theme-muted/10 border-b border-theme-default last:border-b-0 text-left"
            >
              {isResolved ? (
                <Check style={iconSm} className="text-green-400 shrink-0" />
              ) : (
                <AlertTriangle style={iconSm} className="text-orange-400 shrink-0" />
              )}
              <span className="text-theme-primary text-sm truncate flex-1">
                {file.path.split('/').pop()}
              </span>
              {resolution && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  resolution === 'mine' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
                }`}>
                  {resolution === 'mine' ? 'Mine' : 'Theirs'}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
          className="text-red-400 border-red-400/50 hover:bg-red-500/10"
        >
          <X style={iconSm} className="mr-2" />
          Abort Merge
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

const SuccessPanel = memo(function SuccessPanel({ message, onDismiss }: SuccessPanelProps): JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <CheckCircle2 style={iconLg} className="text-green-400 mx-auto mb-4" />
        <h2 className="text-theme-primary text-xl font-semibold mb-2">
          Merge Complete!
        </h2>
        <p className="text-theme-muted text-sm mb-6">
          {message || 'Your changes have been successfully merged.'}
        </p>
        <Button onClick={onDismiss}>
          Done
        </Button>
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
// MAIN COMPONENT
// ============================================================================

function MergeChangesPage(): JSX.Element {
  const {
    repoPath,
    repoInfo,
    branches,
    conflictedFiles = [],
    isCheckingConflicts,
    conflictCheckResult,
    selectedConflictFile,
    setSelectedConflictFile,
    detectedParentBranch,
    fetchParentBranch,
    checkConflictsOnly,
    startMerge,
    clearConflicts,
    fileResolutions = {},
    resolveConflict,
    abortMerge,
    completeMerge,
    isResolvingConflict,
    conflictSidesInfo,
    refreshBranches,
    isSquashMerge,
    setIsSquashMerge,
  } = useRepo();

  const [targetBranch, setTargetBranch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

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
    const result = await startMerge(targetBranch);
    if (!result) {
      setError('Failed to start merge');
    }
  }, [targetBranch, startMerge]);

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
  }, [abortMerge]);

  // Handle complete
  const handleComplete = useCallback(async (message: string): Promise<void> => {
    const success = await completeMerge(message);
    if (success) {
      setShowSuccess(true);
    }
  }, [completeMerge]);

  // Handle dismiss (reset everything)
  const handleDismiss = useCallback((): void => {
    clearConflicts();
    setError(null);
    setShowSuccess(false);
    setTargetBranch('');
  }, [clearConflicts]);

  // No repo open
  if (!repoPath) {
    return <NoRepoPanel />;
  }

  // Loading state
  if (isCheckingConflicts) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 style={iconLg} className="text-blue-400 mx-auto mb-4 animate-spin" />
          <p className="text-theme-muted">Analyzing branches...</p>
        </div>
      </div>
    );
  }

  // Success state
  if (showSuccess) {
    return <SuccessPanel onDismiss={handleDismiss} />;
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
    return <SuccessPanel message="Merge completed automatically." onDismiss={handleDismiss} />;
  }

  // Check complete but merge NOT started yet - show results with "Start Merge" button
  // This is the key decoupling: user can see conflicts without mutating working tree
  if (conflictCheckResult?.success && !conflictCheckResult?.mergeStarted) {
    return (
      <ConflictCheckResultPanel
        sourceBranch={effectiveSource}
        targetBranch={effectiveTarget}
        hasConflicts={conflictCheckResult?.hasConflicts || false}
        conflictCount={conflictCheckResult?.conflictedFiles?.length || conflictedFiles.length}
        conflictedFiles={(conflictCheckResult?.conflictedFiles || conflictedFiles) as ConflictedFile[]}
        onStartMerge={handleStartMerge}
        onCancel={handleDismiss}
        isProcessing={isCheckingConflicts}
        isSquashMerge={conflictCheckResult?.isSquashMerge ?? isSquashMerge}
      />
    );
  }

  // Clean merge - merge started, no conflicts (show complete panel)
  if (conflictCheckResult?.success && conflictCheckResult?.mergeStarted && !conflictCheckResult?.hasConflicts && conflictedFiles.length === 0) {
    return (
      <CleanMergePanel
        sourceBranch={effectiveSource}
        targetBranch={effectiveTarget}
        onComplete={handleComplete}
        onAbort={handleAbort}
        isProcessing={isResolvingConflict}
        isSquashMerge={conflictCheckResult?.isSquashMerge ?? isSquashMerge}
      />
    );
  }

  // Conflicts exist
  if (conflictedFiles.length > 0) {
    // File selected - show resolution UI
    if (selectedConflictFile) {
      return (
        <FileResolutionPanel
          filePath={selectedConflictFile}
          currentResolution={fileResolutions[selectedConflictFile] || null}
          onConfirm={handleResolve}
          onBack={() => setSelectedConflictFile(null)}
          isProcessing={isResolvingConflict}
          conflictSidesInfo={conflictSidesInfo as ConflictSidesInfo}
        />
      );
    }

    // Show overview
    return (
      <ConflictsOverviewPanel
        conflictedFiles={conflictedFiles}
        fileResolutions={fileResolutions}
        sourceBranch={effectiveSource}
        targetBranch={effectiveTarget}
        onSelectFile={setSelectedConflictFile}
        onComplete={handleComplete}
        onAbort={handleAbort}
        isProcessing={isResolvingConflict}
        isSquashMerge={conflictCheckResult?.isSquashMerge ?? isSquashMerge}
      />
    );
  }

  // Initial state - show check panel
  return (
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
  );
}

export default memo(MergeChangesPage);
