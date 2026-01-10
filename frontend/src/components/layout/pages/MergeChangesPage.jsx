/**
 * MergeChangesPage - Main area content for Merge Changes/Conflict Checker view.
 * Shows conflict resolution interface when conflicts are detected.
 */
import { memo } from 'react';
import { Flag, AlertTriangle, CheckCircle2, Loader2, Wand2 } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { useRepo } from '../../../context';

function MergeChangesPage() {
  const { repoPath, conflictedFiles = [], isCheckingConflicts, conflictCheckResult, selectedConflictFile, detectedParentBranch } = useRepo();

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
        <div className="text-center max-w-md">
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
          <p className="text-theme-muted text-xs">
            {conflictCheckResult.message || 'You can safely merge this branch.'}
          </p>
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
          <div className="text-center max-w-md">
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
            <div className="bg-theme-surface border border-theme-default rounded-lg p-4 text-left">
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
          </div>
        </div>
      );
    }

    // Overview of conflicts
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
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
          <p className="text-theme-muted text-xs">
            These conflicts must be resolved before merging. Each file contains changes 
            from both branches that overlap.
          </p>
        </div>
      </div>
    );
  }

  // Default state - no conflicts, ready to check
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
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
        
        {/* Show detected parent branch if available */}
        {detectedParentBranch && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4">
            <p className="text-blue-400 text-sm font-medium">
              Detected parent: {detectedParentBranch.name}
            </p>
            <p className="text-theme-muted text-xs mt-1">
              via {detectedParentBranch.source}
            </p>
          </div>
        )}
        
        <div className="bg-theme-surface border border-theme-default rounded-lg p-4 text-left">
          <h3 className="text-theme-secondary text-sm font-medium mb-2">How it works:</h3>
          <ol className="text-theme-muted text-xs space-y-2 list-decimal list-inside">
            <li>Parent branch is automatically detected</li>
            <li>Click "Check for Conflicts" to analyze</li>
            <li>Review any conflicted files that are found</li>
            <li>Resolve conflicts before merging</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default memo(MergeChangesPage);
