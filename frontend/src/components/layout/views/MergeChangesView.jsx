/**
 * MergeChangesView - Sidebar view for conflict checking and resolution.
 * Shows list of conflicted files when checking merge conflicts.
 * Control elements (branch selector, check button) are in MergeChangesPage.
 */
import { memo, useCallback } from 'react';
import { FileWarning, AlertTriangle, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { useRepo } from '../../../context';

// Shared icon styles
const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const statusIconStyle = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

/**
 * ConflictFileItem - Single file in the conflicts list.
 * Shows file name and conflict status indicator.
 */
const ConflictFileItem = memo(function ConflictFileItem({ file, isSelected, onSelect }) {
  return (
    <div 
      onClick={() => onSelect(file.path)}
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
        isSelected 
          ? 'bg-blue-600/30 border-l-2 border-blue-500' 
          : 'hover-bg-theme-interactive border-l-2 border-transparent'
      }`}
    >
      <FileWarning style={iconStyle} className="text-orange-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-theme-primary text-sm truncate">{file.path}</p>
        <p className="text-theme-muted text-xs truncate">{file.status}</p>
      </div>
      <AlertTriangle style={statusIconStyle} className="text-orange-400" />
    </div>
  );
});

function MergeChangesView() {
  const { 
    repoPath, 
    conflictedFiles = [], 
    selectedConflictFile, 
    setSelectedConflictFile,
    isCheckingConflicts,
    conflictCheckResult,
  } = useRepo();

  const handleSelect = useCallback((path) => {
    // Toggle selection if clicking the same file
    if (selectedConflictFile === path) {
      setSelectedConflictFile(null);
    } else {
      setSelectedConflictFile(path);
    }
  }, [selectedConflictFile, setSelectedConflictFile]);

  // No repository open state
  if (!repoPath) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-theme-muted text-sm">No repository open</p>
        <p className="text-theme-muted text-xs mt-1">Use File → Open Folder to select a repo</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Results section */}
      <div className="flex-1 overflow-y-auto">
        {/* Show checking state */}
        {isCheckingConflicts && (
          <div className="px-3 py-4 text-center">
            <Loader2 
              style={{ width: ICON_SIZES.lg, height: ICON_SIZES.lg }} 
              className="text-blue-400 mx-auto mb-2 animate-spin" 
            />
            <p className="text-theme-muted text-sm">Analyzing branches...</p>
          </div>
        )}

        {/* Show success state - no conflicts */}
        {!isCheckingConflicts && conflictCheckResult?.success && !conflictCheckResult?.hasConflicts && (
          <div className="px-3 py-4 text-center">
            <CheckCircle2 
              style={{ width: ICON_SIZES.lg, height: ICON_SIZES.lg }} 
              className="text-green-400 mx-auto mb-2" 
            />
            <p className="text-green-400 text-sm font-medium">No Conflicts!</p>
            <p className="text-theme-muted text-xs mt-1">
              No conflicts to display
            </p>
          </div>
        )}

        {/* Show error state */}
        {!isCheckingConflicts && conflictCheckResult && !conflictCheckResult.success && (
          <div className="px-3 py-4 text-center">
            <XCircle 
              style={{ width: ICON_SIZES.lg, height: ICON_SIZES.lg }} 
              className="text-red-400 mx-auto mb-2" 
            />
            <p className="text-red-400 text-sm font-medium">Check Failed</p>
            <p className="text-theme-muted text-xs mt-1">
              {conflictCheckResult.error || 'Unknown error'}
            </p>
          </div>
        )}

        {/* Show conflicts list */}
        {!isCheckingConflicts && conflictedFiles.length > 0 && (
          <>
            <div className="px-3 py-2 border-b border-theme-default">
              <p className="text-orange-400 text-xs font-medium uppercase tracking-wide">
                {conflictedFiles.length} Conflicted {conflictedFiles.length === 1 ? 'File' : 'Files'}
              </p>
              {conflictCheckResult?.parentBranch && (
                <p className="text-theme-muted text-xs mt-0.5">
                  vs {conflictCheckResult.parentBranch}
                </p>
              )}
            </div>
            {conflictedFiles.map(file => (
              <ConflictFileItem 
                key={file.path} 
                file={file} 
                isSelected={selectedConflictFile === file.path}
                onSelect={handleSelect}
              />
            ))}
          </>
        )}

        {/* Initial state - no check performed */}
        {!isCheckingConflicts && !conflictCheckResult && conflictedFiles.length === 0 && (
          <div className="px-3 py-4 text-center">
            <p className="text-theme-muted text-sm">No conflicts to display</p>
            <p className="text-theme-muted text-xs mt-1">
              Use the main panel to check for conflicts
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MergeChangesView);
