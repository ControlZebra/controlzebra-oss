/**
 * MergeChangesView - Sidebar view for conflict checking and resolution.
 * Shows list of conflicted files when checking merge conflicts.
 * Supports auto-detection of parent branch with manual override option.
 */
import { memo, useCallback, useState, useEffect, useMemo } from 'react';
import { FileWarning, AlertTriangle, Search, Loader2, CheckCircle2, XCircle, Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { useRepo } from '../../../context';
import { Button } from '../../ui';

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
    branches,
    conflictedFiles = [], 
    selectedConflictFile, 
    setSelectedConflictFile,
    isCheckingConflicts,
    checkBranchConflicts,
    conflictCheckResult,
    clearConflicts,
    detectedParentBranch,
    fetchParentBranch,
  } = useRepo();

  const [manualBranchOverride, setManualBranchOverride] = useState('');
  const [showBranchSelector, setShowBranchSelector] = useState(false);

  // Auto-detect parent branch when view loads
  useEffect(() => {
    if (repoPath && !detectedParentBranch) {
      fetchParentBranch();
    }
  }, [repoPath, detectedParentBranch, fetchParentBranch]);

  const handleSelect = useCallback((path) => {
    // Toggle selection if clicking the same file
    if (selectedConflictFile === path) {
      setSelectedConflictFile(null);
    } else {
      setSelectedConflictFile(path);
    }
  }, [selectedConflictFile, setSelectedConflictFile]);

  // Check conflicts - use manual override if set, otherwise auto-detect (empty string)
  const handleCheckConflicts = useCallback(async () => {
    const branchToCheck = manualBranchOverride || '';
    await checkBranchConflicts(branchToCheck);
  }, [manualBranchOverride, checkBranchConflicts]);

  const handleClearResults = useCallback(() => {
    clearConflicts();
    setManualBranchOverride('');
    setShowBranchSelector(false);
  }, [clearConflicts]);

  // Get local branches for the dropdown (excluding current branch) - memoized for performance
  const availableBranches = useMemo(() => 
    branches?.local?.filter(b => !b.isCurrent) || [], 
    [branches?.local]
  );
  
  // Get remote branches for dropdown - memoized and limited to first 5
  const availableRemoteBranches = useMemo(() => 
    branches?.remote?.slice(0, 5) || [], 
    [branches?.remote]
  );

  // Determine which parent branch will be used
  const effectiveParentBranch = manualBranchOverride || detectedParentBranch?.name || 'auto-detect';

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
      {/* Branch info and check button */}
      <div className="px-3 py-3 border-b border-theme-default space-y-3">
        {/* Auto-detected parent info */}
        <div className="bg-theme-base rounded-lg p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wand2 style={statusIconStyle} className="text-blue-400" />
              <span className="text-theme-muted text-xs">Parent Branch:</span>
            </div>
            <button
              onClick={() => setShowBranchSelector(!showBranchSelector)}
              className="text-blue-400 text-xs hover:text-blue-300 flex items-center gap-1"
            >
              {showBranchSelector ? 'Hide' : 'Change'}
              {showBranchSelector ? (
                <ChevronUp style={{ width: 12, height: 12 }} />
              ) : (
                <ChevronDown style={{ width: 12, height: 12 }} />
              )}
            </button>
          </div>
          <p className="text-theme-primary text-sm font-medium mt-1">
            {manualBranchOverride || detectedParentBranch?.name || 'Will auto-detect'}
          </p>
          {detectedParentBranch?.source && !manualBranchOverride && (
            <p className="text-theme-muted text-xs mt-0.5">
              via {detectedParentBranch.source}
            </p>
          )}
        </div>

        {/* Manual branch override (collapsible) */}
        {showBranchSelector && (
          <div>
            <label className="text-theme-muted text-xs block mb-1">Override Parent Branch</label>
            <select
              value={manualBranchOverride}
              onChange={(e) => setManualBranchOverride(e.target.value)}
              disabled={isCheckingConflicts}
              className="w-full px-2 py-1.5 bg-theme-base border border-theme-default rounded text-sm text-theme-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Use auto-detect</option>
              {availableBranches.map(branch => (
                <option key={`local-${branch.name}`} value={branch.name}>
                  {branch.name}
                </option>
              ))}
              {/* Also add common remote branches */}
              {availableRemoteBranches.map(branch => (
                <option key={`remote-${branch.name}`} value={branch.name.replace('origin/', '')}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        )}
        
        <Button
          onClick={handleCheckConflicts}
          disabled={isCheckingConflicts}
          className="w-full"
          variant="default"
        >
          {isCheckingConflicts ? (
            <>
              <Loader2 style={iconStyle} className="animate-spin mr-2" />
              Checking...
            </>
          ) : (
            <>
              <Search style={iconStyle} className="mr-2" />
              Check for Conflicts
            </>
          )}
        </Button>
        
        {conflictCheckResult && (
          <Button
            onClick={handleClearResults}
            variant="outline"
            className="w-full"
            size="sm"
          >
            Clear Results
          </Button>
        )}
      </div>

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
              Clean merge is possible with {conflictCheckResult.parentBranch || effectiveParentBranch}
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
        {!isCheckingConflicts && !conflictCheckResult && (
          <div className="px-3 py-4 text-center">
            <Wand2 
              style={{ width: ICON_SIZES.lg, height: ICON_SIZES.lg }} 
              className="text-blue-400 mx-auto mb-2" 
            />
            <p className="text-theme-muted text-sm">Ready to check</p>
            <p className="text-theme-muted text-xs mt-1">
              Parent branch will be auto-detected
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MergeChangesView);
