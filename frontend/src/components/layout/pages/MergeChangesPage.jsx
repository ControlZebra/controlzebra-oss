/**
 * MergeChangesPage - Main area content for Merge Changes/Conflict Checker view.
 * Contains control elements (branch selector, check button) and shows results.
 */
import { memo, useCallback, useState, useEffect, useMemo } from 'react';
import { Flag, AlertTriangle, CheckCircle2, Loader2, Wand2, Search, ChevronDown, ChevronUp, XCircle } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { useRepo } from '../../../context';
import { Button } from '../../ui';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

function MergeChangesPage() {
  const { 
    repoPath, 
    branches,
    conflictedFiles = [], 
    isCheckingConflicts, 
    conflictCheckResult, 
    selectedConflictFile, 
    detectedParentBranch,
    fetchParentBranch,
    checkBranchConflicts,
    clearConflicts,
  } = useRepo();

  const [manualBranchOverride, setManualBranchOverride] = useState('');
  const [showBranchSelector, setShowBranchSelector] = useState(false);

  // Auto-detect parent branch when view loads
  useEffect(() => {
    if (repoPath && !detectedParentBranch) {
      fetchParentBranch();
    }
  }, [repoPath, detectedParentBranch, fetchParentBranch]);

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

  // No repository open
  if (!repoPath) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Flag 
            style={{ width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 }} 
            className="text-theme-muted mx-auto mb-4" 
          />
          <h2 className="text-theme-primary text-xl font-semibold mb-2">
            Merge Changes
          </h2>
          <p className="text-theme-muted text-sm">
            Open a repository to check for merge conflicts and resolve them.
          </p>
        </div>
      </div>
    );
  }

  // Checking in progress
  if (isCheckingConflicts) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Loader2 
            style={{ width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 }} 
            className="text-blue-400 mx-auto mb-4 animate-spin" 
          />
          <h2 className="text-theme-primary text-xl font-semibold mb-2">
            Checking for Conflicts...
          </h2>
          <p className="text-theme-muted text-sm">
            Analyzing branch differences to detect potential merge conflicts.
          </p>
        </div>
      </div>
    );
  }

  // Check completed - no conflicts
  if (conflictCheckResult?.success && !conflictCheckResult?.hasConflicts) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md w-full">
          <CheckCircle2 
            style={{ width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 }} 
            className="text-green-400 mx-auto mb-4" 
          />
          <h2 className="text-theme-primary text-xl font-semibold mb-2">
            No Conflicts Detected
          </h2>
          <p className="text-theme-muted text-sm mb-4">
            A clean merge is possible with <span className="text-green-400 font-medium">{conflictCheckResult.parentBranch || 'the parent branch'}</span>.
          </p>
          <p className="text-theme-muted text-xs mb-6">
            {conflictCheckResult.message || 'You can safely merge this branch.'}
          </p>
          
          {/* Action buttons */}
          <div className="flex gap-2 justify-center">
            <Button
              onClick={handleCheckConflicts}
              disabled={isCheckingConflicts}
              variant="outline"
            >
              <Search style={iconStyle} className="mr-2" />
              Check Again
            </Button>
            <Button
              onClick={handleClearResults}
              variant="outline"
            >
              Clear Results
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Has conflicts - show file selected or overview
  if (conflictedFiles.length > 0) {
    // If a conflict file is selected, show its details
    if (selectedConflictFile) {
      const selectedFile = conflictedFiles.find(f => f.path === selectedConflictFile);
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md w-full">
            <AlertTriangle 
              style={{ width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 }} 
              className="text-orange-400 mx-auto mb-4" 
            />
            <h2 className="text-theme-primary text-xl font-semibold mb-2">
              Conflict: {selectedConflictFile.split('/').pop()}
            </h2>
            <p className="text-theme-muted text-sm mb-4">
              This file has conflicting changes between branches.
            </p>
            <div className="bg-theme-surface border border-theme-default rounded-lg p-4 text-left mb-6">
              <p className="text-theme-secondary text-sm font-medium mb-2">File Path:</p>
              <p className="text-theme-muted text-xs font-mono break-all">{selectedConflictFile}</p>
              {selectedFile?.status && (
                <>
                  <p className="text-theme-secondary text-sm font-medium mt-3 mb-2">Status:</p>
                  <p className="text-theme-muted text-xs">{selectedFile.status}</p>
                </>
              )}
              {conflictCheckResult?.parentBranch && (
                <>
                  <p className="text-theme-secondary text-sm font-medium mt-3 mb-2">Comparing Against:</p>
                  <p className="text-theme-muted text-xs">{conflictCheckResult.parentBranch}</p>
                </>
              )}
            </div>
            
            {/* Action buttons */}
            <div className="flex gap-2 justify-center">
              <Button
                onClick={handleCheckConflicts}
                disabled={isCheckingConflicts}
                variant="outline"
              >
                <Search style={iconStyle} className="mr-2" />
                Check Again
              </Button>
              <Button
                onClick={handleClearResults}
                variant="outline"
              >
                Clear Results
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Overview of conflicts
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md w-full">
          <AlertTriangle 
            style={{ width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 }} 
            className="text-orange-400 mx-auto mb-4" 
          />
          <h2 className="text-theme-primary text-xl font-semibold mb-2">
            {conflictedFiles.length} Conflict{conflictedFiles.length !== 1 ? 's' : ''} Detected
          </h2>
          {conflictCheckResult?.parentBranch && (
            <p className="text-theme-muted text-sm mb-2">
              When merging with <span className="text-orange-400 font-medium">{conflictCheckResult.parentBranch}</span>
            </p>
          )}
          <p className="text-theme-muted text-sm mb-4">
            Select a conflicted file from the sidebar to view details.
          </p>
          <p className="text-theme-muted text-xs mb-6">
            These conflicts must be resolved before merging. Each file contains changes 
            from both branches that overlap.
          </p>
          
          {/* Action buttons */}
          <div className="flex gap-2 justify-center">
            <Button
              onClick={handleCheckConflicts}
              disabled={isCheckingConflicts}
              variant="outline"
            >
              <Search style={iconStyle} className="mr-2" />
              Check Again
            </Button>
            <Button
              onClick={handleClearResults}
              variant="outline"
            >
              Clear Results
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Default state - ready to check (includes control panel)
  // Also shown when error occurred
  const showError = conflictCheckResult && !conflictCheckResult.success;
  
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md w-full">
        {showError ? (
          <>
            <XCircle 
              style={{ width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 }} 
              className="text-red-400 mx-auto mb-4" 
            />
            <h2 className="text-theme-primary text-xl font-semibold mb-2">
              Check Failed
            </h2>
            <p className="text-red-400 text-sm mb-4">
              {conflictCheckResult.error || 'An error occurred while checking for conflicts.'}
            </p>
          </>
        ) : (
          <>
            <Wand2 
              style={{ width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 }} 
              className="text-blue-400 mx-auto mb-4" 
            />
            <h2 className="text-theme-primary text-xl font-semibold mb-2">
              Merge Changes
            </h2>
            <p className="text-theme-muted text-sm mb-4">
              Check for potential merge conflicts before integrating changes.
            </p>
          </>
        )}
        
        {/* Control Panel */}
        <div className="bg-theme-surface border border-theme-default rounded-lg p-4 text-left space-y-4">
          {/* Parent branch info */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Wand2 style={iconStyle} className="text-blue-400" />
                <span className="text-theme-secondary text-sm font-medium">Parent Branch</span>
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
            <p className="text-theme-primary text-sm font-medium">
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
          
          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleCheckConflicts}
              disabled={isCheckingConflicts}
              className="flex-1"
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
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        
        {/* How it works - only show when no error */}
        {!showError && (
          <div className="bg-theme-surface border border-theme-default rounded-lg p-4 text-left mt-4">
            <h3 className="text-theme-secondary text-sm font-medium mb-2">How it works:</h3>
            <ol className="text-theme-muted text-xs space-y-2 list-decimal list-inside">
              <li>Parent branch is automatically detected</li>
              <li>Click "Check for Conflicts" to analyze</li>
              <li>Review any conflicted files in the sidebar</li>
              <li>Resolve conflicts before merging</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MergeChangesPage);
