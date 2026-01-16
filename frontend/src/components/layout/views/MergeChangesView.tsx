/**
 * MergeChangesView - Sidebar view for the merge workflow.
 * 
 * Shows:
 * - Empty state when no merge is in progress
 * - Conflict file list when checking/resolving conflicts
 * - Resolution status for each file
 */
import { memo, useCallback, type CSSProperties } from 'react';
import {
  FileWarning,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Check,
  GitMerge,
} from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { useRepo, type ConflictedFile, type ResolutionStrategy } from '../../../context';

// ============================================================================
// Types
// ============================================================================

interface ConflictFileItemProps {
  file: ConflictedFile;
  isSelected: boolean;
  onSelect: (path: string) => void;
  resolution?: ResolutionStrategy;
}

// ============================================================================
// Styles
// ============================================================================

const iconSm: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconXs: CSSProperties = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

// ============================================================================
// Components
// ============================================================================

/**
 * ConflictFileItem - Single file in the conflicts list
 */
const ConflictFileItem = memo(function ConflictFileItem({
  file,
  isSelected,
  onSelect,
  resolution,
}: ConflictFileItemProps): JSX.Element {
  const isResolved = !!resolution;
  const fileName = file.path.split('/').pop();
  
  return (
    <button
      onClick={() => onSelect(file.path)}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
        isSelected
          ? 'bg-blue-600/30 border-l-2 border-blue-500'
          : 'hover:bg-theme-muted/10 border-l-2 border-transparent'
      }`}
    >
      <FileWarning
        style={iconSm}
        className={isResolved ? 'text-green-400 shrink-0' : 'text-orange-400 shrink-0'}
      />
      <div className="flex-1 min-w-0">
        <p className="text-theme-primary text-sm truncate">{fileName}</p>
        {resolution && (
          <p className={`text-[10px] ${
            resolution === 'mine' ? 'text-blue-400' : 'text-orange-400'
          }`}>
            {resolution === 'mine' ? 'Keep Mine' : 'Keep Theirs'}
          </p>
        )}
      </div>
      {isResolved ? (
        <Check style={iconXs} className="text-green-400 shrink-0" />
      ) : (
        <AlertTriangle style={iconXs} className="text-orange-400 shrink-0" />
      )}
    </button>
  );
});

// ============================================================================
// Main Component
// ============================================================================

function MergeChangesView(): JSX.Element {
  const {
    repoPath,
    conflictedFiles = [],
    selectedConflictFile,
    setSelectedConflictFile,
    isCheckingConflicts,
    conflictCheckResult,
    fileResolutions = {},
    detectedParentBranch,
    mergeState,
  } = useRepo();

  const handleSelect = useCallback((path: string): void => {
    setSelectedConflictFile(prev => prev === path ? null : path);
  }, [setSelectedConflictFile]);

  // Count resolved files
  const resolvedCount = conflictedFiles.filter(f => fileResolutions[f.path]).length;
  const totalCount = conflictedFiles.length;

  // No repository state
  if (!repoPath) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-theme-muted text-sm">No repository open</p>
      </div>
    );
  }

  // Interrupted rebase state - show warning
  if (mergeState?.inRebase && !conflictCheckResult) {
    return (
      <div className="px-3 py-4 text-center">
        <AlertTriangle
          style={{ width: ICON_SIZES.lg, height: ICON_SIZES.lg }}
          className="text-orange-400 mx-auto mb-2"
        />
        <p className="text-orange-400 text-sm font-medium">Interrupted Rebase</p>
        <p className="text-theme-muted text-xs mt-1">
          Use the main panel to recover
        </p>
        {mergeState.hasConflicts && (
          <p className="text-orange-400/80 text-xs mt-2">
            {conflictedFiles.length} file{conflictedFiles.length !== 1 ? 's' : ''} need attention
          </p>
        )}
      </div>
    );
  }

  // Loading state
  if (isCheckingConflicts) {
    return (
      <div className="px-3 py-4 text-center">
        <Loader2
          style={{ width: ICON_SIZES.lg, height: ICON_SIZES.lg }}
          className="text-blue-400 mx-auto mb-2 animate-spin"
        />
        <p className="text-theme-muted text-sm">Analyzing branches...</p>
      </div>
    );
  }

  // Clean merge - check complete, no conflicts, but merge not started yet
  if (conflictCheckResult?.success && !conflictCheckResult?.hasConflicts && !conflictCheckResult?.mergeStarted && totalCount === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <CheckCircle2
          style={{ width: ICON_SIZES.lg, height: ICON_SIZES.lg }}
          className="text-green-400 mx-auto mb-2"
        />
        <p className="text-green-400 text-sm font-medium">No Conflicts</p>
        <p className="text-theme-muted text-xs mt-1">
          Ready to start merge
        </p>
      </div>
    );
  }

  // Check complete, has predicted conflicts, but merge NOT started yet
  // These are predicted conflicts from dry-run - show preview
  if (conflictCheckResult?.success && conflictCheckResult?.hasConflicts && !conflictCheckResult?.mergeStarted) {
    const predictedConflicts = conflictCheckResult?.conflictedFiles || [];
    const targetBranch = conflictCheckResult?.targetBranch || 
                        conflictCheckResult?.parentBranch || 
                        detectedParentBranch?.name;
    
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-3 py-2 border-b border-theme-default">
          <p className="text-orange-400 text-xs font-medium uppercase tracking-wide">
            {predictedConflicts.length} Predicted Conflict{predictedConflicts.length !== 1 ? 's' : ''}
          </p>
          {targetBranch && (
            <p className="text-theme-muted text-xs mt-0.5">
              when merging into {targetBranch}
            </p>
          )}
          <p className="text-theme-muted text-[10px] mt-1 italic">
            (preview only - start merge to resolve)
          </p>
        </div>

        {/* Predicted conflict file list */}
        <div className="flex-1 overflow-y-auto">
          {predictedConflicts.map(file => (
            <div
              key={file.path}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left border-l-2 border-transparent"
            >
              <FileWarning
                style={iconSm}
                className="text-orange-400 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-theme-primary text-sm truncate">{file.path.split('/').pop()}</p>
              </div>
              <AlertTriangle style={iconXs} className="text-orange-400 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Clean merge - merge started, no conflicts
  if (conflictCheckResult?.success && !conflictCheckResult?.hasConflicts && conflictCheckResult?.mergeStarted && totalCount === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <CheckCircle2
          style={{ width: ICON_SIZES.lg, height: ICON_SIZES.lg }}
          className="text-green-400 mx-auto mb-2"
        />
        <p className="text-green-400 text-sm font-medium">Ready to Complete</p>
        <p className="text-theme-muted text-xs mt-1">
          No conflicts - complete the merge
        </p>
      </div>
    );
  }

  // Has actual conflicts (merge started)
  if (totalCount > 0) {
    const targetBranch = conflictCheckResult?.targetBranch || 
                        conflictCheckResult?.parentBranch || 
                        detectedParentBranch?.name;
    
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-3 py-2 border-b border-theme-default">
          <p className="text-orange-400 text-xs font-medium uppercase tracking-wide">
            {totalCount} Conflict{totalCount !== 1 ? 's' : ''}
          </p>
          {targetBranch && (
            <p className="text-theme-muted text-xs mt-0.5">
              merging into {targetBranch}
            </p>
          )}
          
          {/* Progress bar */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  resolvedCount === totalCount ? 'bg-green-500' : 'bg-orange-500'
                }`}
                style={{ width: `${(resolvedCount / totalCount) * 100}%` }}
              />
            </div>
            <span className="text-theme-muted text-[10px]">
              {resolvedCount}/{totalCount}
            </span>
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {conflictedFiles.map(file => (
            <ConflictFileItem
              key={file.path}
              file={file}
              isSelected={selectedConflictFile === file.path}
              onSelect={handleSelect}
              resolution={fileResolutions[file.path]}
            />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (conflictCheckResult && !conflictCheckResult.success) {
    return (
      <div className="px-3 py-4 text-center">
        <AlertTriangle
          style={{ width: ICON_SIZES.lg, height: ICON_SIZES.lg }}
          className="text-red-400 mx-auto mb-2"
        />
        <p className="text-red-400 text-sm font-medium">Check Failed</p>
        <p className="text-theme-muted text-xs mt-1">
          {conflictCheckResult.error || 'Unknown error'}
        </p>
      </div>
    );
  }

  // Initial state - no check performed
  return (
    <div className="px-3 py-4 text-center">
      <GitMerge
        style={{ width: ICON_SIZES.lg, height: ICON_SIZES.lg }}
        className="text-theme-muted mx-auto mb-2"
      />
      <p className="text-theme-muted text-sm">Combine Versions</p>
      <p className="text-theme-muted text-xs mt-1">
        Use the main panel to check for conflicts
      </p>
    </div>
  );
}

export default memo(MergeChangesView);
