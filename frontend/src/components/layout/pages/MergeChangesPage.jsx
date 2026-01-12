/**
 * MergeChangesPage - Main area content for Merge Changes/Conflict Resolution view.
 * 
 * Implements a 3-step conflict resolution process:
 * 1. Check for conflicts with auto-detected or user-selected branch
 * 2. Resolve each conflict by choosing Keep Mine / Keep Theirs
 * 3. Complete merge with commit message when all conflicts are resolved
 */
import { memo, useCallback, useState, useEffect, useMemo } from 'react';
import { 
  Flag, AlertTriangle, CheckCircle2, Loader2, Wand2, Search, 
  ChevronDown, ChevronUp, XCircle, User, Clock, GitCommit,
  Check, X, GitMerge
} from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { useRepo } from '../../../context';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../ui';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const largeIconStyle = { width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 };

/**
 * ConflictResolutionCard - Card showing one side of the conflict (mine or theirs)
 */
const ConflictResolutionCard = memo(function ConflictResolutionCard({ 
  type, // 'mine' | 'theirs'
  isSelected,
  onSelect,
  commitInfo,
  disabled,
}) {
  const isMine = type === 'mine';
  
  return (
    <Card 
      className={`flex-1 cursor-pointer transition-all ${
        isSelected 
          ? isMine 
            ? 'ring-2 ring-blue-500 bg-blue-500/10' 
            : 'ring-2 ring-orange-500 bg-orange-500/10'
          : 'hover:border-gray-500'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={(e) => !disabled && onSelect(type, e)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className={`text-base ${isMine ? 'text-blue-400' : 'text-orange-400'}`}>
            {isMine ? 'Keep Mine' : 'Keep Theirs'}
          </CardTitle>
          {isSelected && (
            <Check style={iconStyle} className={isMine ? 'text-blue-400' : 'text-orange-400'} />
          )}
        </div>
        <CardDescription className="text-xs">
          {isMine 
            ? 'Keep your local changes and discard incoming changes' 
            : 'Accept incoming changes and discard your local changes'
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {commitInfo ? (
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-theme-secondary">
              <User style={{ width: 12, height: 12 }} />
              <span className="truncate">{commitInfo.author || 'Unknown'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-theme-muted">
              <Clock style={{ width: 12, height: 12 }} />
              <span>{commitInfo.date || 'Unknown date'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-theme-muted">
              <GitCommit style={{ width: 12, height: 12 }} />
              <span className="font-mono">{commitInfo.hash?.slice(0, 7) || '...'}</span>
            </div>
          </div>
        ) : (
          <p className="text-theme-muted text-xs italic">
            {isMine ? 'Your current branch' : 'Incoming branch'}
          </p>
        )}
      </CardContent>
    </Card>
  );
});

/**
 * FileResolutionUI - UI for resolving a single file conflict
 */
const FileResolutionUI = memo(function FileResolutionUI({
  filePath,
  fileStatus,
  currentResolution,
  onConfirm,
  isResolving,
  parentBranch,
  conflictSidesInfo,
}) {
  const [selectedStrategy, setSelectedStrategy] = useState(currentResolution || null);
  const [selectedCards, setSelectedCards] = useState(new Set()); // For shift+click multi-select
  
  // Reset selection when file changes
  useEffect(() => {
    setSelectedStrategy(currentResolution || null);
    setSelectedCards(new Set());
  }, [filePath, currentResolution]);

  const handleSelect = useCallback((strategy, event) => {
    // Shift+click enables "Keep Both" by selecting both cards
    if (event?.shiftKey) {
      setSelectedCards(prev => {
        const newSet = new Set(prev);
        if (newSet.has(strategy)) {
          newSet.delete(strategy);
        } else {
          newSet.add(strategy);
        }
        // If both are selected, set strategy to 'both'
        if (newSet.has('mine') && newSet.has('theirs')) {
          setSelectedStrategy('both');
        } else if (newSet.size === 1) {
          setSelectedStrategy(Array.from(newSet)[0]);
        } else {
          setSelectedStrategy(null);
        }
        return newSet;
      });
    } else {
      // Regular click - single selection
      setSelectedCards(new Set([strategy]));
      setSelectedStrategy(prev => prev === strategy ? null : strategy);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedStrategy) {
      onConfirm(filePath, selectedStrategy);
    }
  }, [filePath, selectedStrategy, onConfirm]);

  const fileName = filePath.split('/').pop();
  const isAlreadyResolved = !!currentResolution;
  const isBothSelected = selectedStrategy === 'both';

  return (
    <div className="flex-1 flex flex-col p-6 max-w-3xl mx-auto">
      {/* File header */}
      <div className="mb-6">
        <h2 className="text-theme-primary text-xl font-semibold mb-2">
          Resolve Conflict: {fileName}
        </h2>
        <p className="text-theme-muted text-sm">
          Choose how to resolve the conflict in this file.
        </p>
        <div className="mt-2 flex items-center gap-4 text-xs text-theme-muted">
          <span className="font-mono bg-theme-base px-2 py-0.5 rounded">{filePath}</span>
          {fileStatus && (
            <span className="text-orange-400">{fileStatus}</span>
          )}
        </div>
        {parentBranch && (
          <p className="text-theme-muted text-xs mt-1">
            Comparing against: <span className="text-theme-secondary">{parentBranch}</span>
          </p>
        )}
      </div>

      {/* Shift+click hint */}
      <div className="text-center mb-2">
        <p className="text-theme-muted text-xs">
          <kbd className="px-1.5 py-0.5 bg-theme-base rounded text-[10px] border border-theme-default">Shift</kbd>
          <span className="mx-1">+</span>
          <span>click both cards to keep both versions</span>
        </p>
      </div>

      {/* Resolution cards */}
      <div className="flex gap-4 mb-6">
        <ConflictResolutionCard
          type="mine"
          isSelected={selectedStrategy === 'mine' || isBothSelected}
          onSelect={handleSelect}
          disabled={isResolving}
          commitInfo={conflictSidesInfo?.ours}
        />
        <ConflictResolutionCard
          type="theirs"
          isSelected={selectedStrategy === 'theirs' || isBothSelected}
          onSelect={handleSelect}
          disabled={isResolving}
          commitInfo={conflictSidesInfo?.theirs}
        />
      </div>

      {/* Explanation based on selection */}
      {selectedStrategy && (
        <div className={`p-4 rounded-lg border mb-6 ${
          isBothSelected
            ? 'bg-purple-500/10 border-purple-500/30'
            : selectedStrategy === 'mine' 
              ? 'bg-blue-500/10 border-blue-500/30' 
              : 'bg-orange-500/10 border-orange-500/30'
        }`}>
          <p className="text-sm text-theme-secondary">
            {isBothSelected 
              ? `✓ Keep both versions: Your file will be kept as "${fileName}", and the incoming version will be saved as "${fileName.replace(/(\.[^.]+)$/, '_COPY$1')}".`
              : selectedStrategy === 'mine' 
                ? '✓ Your local changes will be preserved. The incoming changes from the other branch will be discarded for this file.'
                : '✓ The incoming changes will be applied. Your local changes to this file will be discarded.'
            }
          </p>
        </div>
      )}

      {/* Confirm button */}
      <div className="flex justify-center gap-3">
        <Button
          onClick={handleConfirm}
          disabled={!selectedStrategy || isResolving}
          variant="default"
          className="min-w-[160px]"
        >
          {isResolving ? (
            <>
              <Loader2 style={iconStyle} className="mr-2 animate-spin" />
              Resolving...
            </>
          ) : isAlreadyResolved ? (
            <>
              <Check style={iconStyle} className="mr-2" />
              Update Resolution
            </>
          ) : (
            <>
              <Check style={iconStyle} className="mr-2" />
              Confirm Resolution
            </>
          )}
        </Button>
      </div>
    </div>
  );
});

/**
 * ConflictsOverview - Default view when conflicts exist but no file is selected
 */
const ConflictsOverview = memo(function ConflictsOverview({
  conflictedFiles,
  fileResolutions,
  parentBranch,
  onCompleteMerge,
  onAbortMerge,
  isResolving,
}) {
  const [mergeMessage, setMergeMessage] = useState('');
  
  const resolvedCount = conflictedFiles.filter(f => fileResolutions[f.path]).length;
  const allResolved = resolvedCount === conflictedFiles.length && conflictedFiles.length > 0;

  const handleCompleteMerge = useCallback(() => {
    onCompleteMerge(mergeMessage);
  }, [mergeMessage, onCompleteMerge]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-lg w-full">
        <AlertTriangle 
          style={largeIconStyle} 
          className="text-orange-400 mx-auto mb-4" 
        />
        <h2 className="text-theme-primary text-xl font-semibold mb-2">
          {conflictedFiles.length} Conflict{conflictedFiles.length !== 1 ? 's' : ''} Detected
        </h2>
        {parentBranch && (
          <p className="text-theme-muted text-sm mb-4">
            When merging with <span className="text-orange-400 font-medium">{parentBranch}</span>
          </p>
        )}

        {/* Progress indicator */}
        <div className="bg-theme-surface border border-theme-default rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-secondary text-sm">Resolution Progress</span>
            <span className={`text-sm font-medium ${allResolved ? 'text-green-400' : 'text-orange-400'}`}>
              {resolvedCount} / {conflictedFiles.length}
            </span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${allResolved ? 'bg-green-500' : 'bg-orange-500'}`}
              style={{ width: `${(resolvedCount / conflictedFiles.length) * 100}%` }}
            />
          </div>
          {!allResolved && (
            <p className="text-theme-muted text-xs mt-2">
              Click on each file in the sidebar to resolve conflicts.
            </p>
          )}
        </div>

        {/* Merge completion section - shown when all resolved */}
        {allResolved ? (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 style={iconStyle} className="text-green-400" />
              <span className="text-green-400 font-medium">All conflicts resolved!</span>
            </div>
            <p className="text-theme-muted text-sm mb-4">
              You can now complete the merge. Add an optional commit message below.
            </p>
            <textarea
              value={mergeMessage}
              onChange={(e) => setMergeMessage(e.target.value)}
              placeholder="Merge commit message (optional)"
              className="w-full px-3 py-2 bg-theme-base border border-theme-default rounded-lg text-sm text-theme-primary placeholder:text-theme-muted resize-none focus:outline-none focus:ring-1 focus:ring-green-500"
              rows={3}
            />
          </div>
        ) : (
          <div className="bg-theme-surface border border-theme-default rounded-lg p-4 mb-6 text-left">
            <h3 className="text-theme-secondary text-sm font-medium mb-2">How to resolve:</h3>
            <ol className="text-theme-muted text-xs space-y-1.5 list-decimal list-inside">
              <li>Click a conflicted file in the sidebar</li>
              <li>Choose "Keep Mine" or "Keep Theirs"</li>
              <li>Confirm your resolution</li>
              <li>Repeat for all files, then merge</li>
            </ol>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 justify-center">
          <Button
            onClick={handleCompleteMerge}
            disabled={!allResolved || isResolving}
            variant="default"
            className="min-w-[140px]"
          >
            {isResolving ? (
              <>
                <Loader2 style={iconStyle} className="mr-2 animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <GitMerge style={iconStyle} className="mr-2" />
                Complete Merge
              </>
            )}
          </Button>
          <Button
            onClick={onAbortMerge}
            disabled={isResolving}
            variant="outline"
            className="text-red-400 border-red-400/50 hover:bg-red-500/10"
          >
            <X style={iconStyle} className="mr-2" />
            Abort Merge
          </Button>
        </div>
      </div>
    </div>
  );
});

/**
 * InitialCheckPanel - Shown when no conflicts have been checked yet
 */
const InitialCheckPanel = memo(function InitialCheckPanel({
  detectedParentBranch,
  branches,
  isCheckingConflicts,
  onCheckConflicts,
  showError,
  errorMessage,
}) {
  const [manualBranchOverride, setManualBranchOverride] = useState('');
  const [showBranchSelector, setShowBranchSelector] = useState(false);

  const availableBranches = useMemo(() => 
    branches?.local?.filter(b => !b.isCurrent) || [], 
    [branches?.local]
  );
  
  const availableRemoteBranches = useMemo(() => 
    branches?.remote?.slice(0, 5) || [], 
    [branches?.remote]
  );

  const handleCheck = useCallback(() => {
    onCheckConflicts(manualBranchOverride || '');
  }, [manualBranchOverride, onCheckConflicts]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md w-full">
        {showError ? (
          <>
            <XCircle style={largeIconStyle} className="text-red-400 mx-auto mb-4" />
            <h2 className="text-theme-primary text-xl font-semibold mb-2">
              Check Failed
            </h2>
            <p className="text-red-400 text-sm mb-4">
              {errorMessage || 'An error occurred while checking for conflicts.'}
            </p>
          </>
        ) : (
          <>
            <Wand2 style={largeIconStyle} className="text-blue-400 mx-auto mb-4" />
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
                {availableRemoteBranches.map(branch => (
                  <option key={`remote-${branch.name}`} value={branch.name.replace('origin/', '')}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Action button */}
          <Button
            onClick={handleCheck}
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
        </div>
        
        {/* How it works */}
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
});

/**
 * NoConflictsResult - Shown when check completes with no conflicts
 */
const NoConflictsResult = memo(function NoConflictsResult({
  parentBranch,
  message,
  onCheckAgain,
  onClear,
  isCheckingConflicts,
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md w-full">
        <CheckCircle2 style={largeIconStyle} className="text-green-400 mx-auto mb-4" />
        <h2 className="text-theme-primary text-xl font-semibold mb-2">
          No Conflicts Detected
        </h2>
        <p className="text-theme-muted text-sm mb-4">
          A clean merge is possible with <span className="text-green-400 font-medium">{parentBranch || 'the parent branch'}</span>.
        </p>
        <p className="text-theme-muted text-xs mb-6">
          {message || 'You can safely merge this branch.'}
        </p>
        
        <div className="flex gap-2 justify-center">
          <Button onClick={onCheckAgain} disabled={isCheckingConflicts} variant="outline">
            <Search style={iconStyle} className="mr-2" />
            Check Again
          </Button>
          <Button onClick={onClear} variant="outline">
            Clear Results
          </Button>
        </div>
      </div>
    </div>
  );
});

/**
 * MergeChangesPage - Main component
 */
function MergeChangesPage() {
  const { 
    repoPath, 
    branches,
    conflictedFiles = [], 
    isCheckingConflicts, 
    conflictCheckResult, 
    selectedConflictFile,
    setSelectedConflictFile,
    detectedParentBranch,
    fetchParentBranch,
    checkBranchConflicts,
    clearConflicts,
    fileResolutions = {},
    resolveConflict,
    abortMerge,
    completeMerge,
    isResolvingConflict,
    conflictSidesInfo,
  } = useRepo();

  // Auto-detect parent branch when view loads
  useEffect(() => {
    if (repoPath && !detectedParentBranch) {
      fetchParentBranch();
    }
  }, [repoPath, detectedParentBranch, fetchParentBranch]);

  // Handlers
  const handleCheckConflicts = useCallback(async (parentBranch) => {
    await checkBranchConflicts(parentBranch);
  }, [checkBranchConflicts]);

  const handleClearResults = useCallback(() => {
    clearConflicts();
  }, [clearConflicts]);

  const handleConfirmResolution = useCallback(async (filePath, strategy) => {
    const success = await resolveConflict(filePath, strategy);
    if (success) {
      // Clear selection to go back to overview
      setSelectedConflictFile(null);
    }
  }, [resolveConflict, setSelectedConflictFile]);

  const handleAbortMerge = useCallback(async () => {
    await abortMerge();
  }, [abortMerge]);

  const handleCompleteMerge = useCallback(async (message) => {
    await completeMerge(message);
  }, [completeMerge]);

  // No repository open
  if (!repoPath) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Flag style={largeIconStyle} className="text-theme-muted mx-auto mb-4" />
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

  // Loading state
  if (isCheckingConflicts) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Loader2 style={largeIconStyle} className="text-blue-400 mx-auto mb-4 animate-spin" />
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

  // No conflicts found
  if (conflictCheckResult?.success && !conflictCheckResult?.hasConflicts) {
    return (
      <NoConflictsResult
        parentBranch={conflictCheckResult.parentBranch}
        message={conflictCheckResult.message}
        onCheckAgain={() => handleCheckConflicts('')}
        onClear={handleClearResults}
        isCheckingConflicts={isCheckingConflicts}
      />
    );
  }

  // Has conflicts
  if (conflictedFiles.length > 0) {
    // File selected - show resolution UI
    if (selectedConflictFile) {
      const selectedFile = conflictedFiles.find(f => f.path === selectedConflictFile);
      return (
        <FileResolutionUI
          filePath={selectedConflictFile}
          fileStatus={selectedFile?.status}
          currentResolution={fileResolutions[selectedConflictFile]}
          onConfirm={handleConfirmResolution}
          isResolving={isResolvingConflict}
          parentBranch={conflictCheckResult?.parentBranch}
          conflictSidesInfo={conflictSidesInfo}
        />
      );
    }

    // No file selected - show overview
    return (
      <ConflictsOverview
        conflictedFiles={conflictedFiles}
        fileResolutions={fileResolutions}
        parentBranch={conflictCheckResult?.parentBranch}
        onCompleteMerge={handleCompleteMerge}
        onAbortMerge={handleAbortMerge}
        isResolving={isResolvingConflict}
      />
    );
  }

  // Initial state or error
  const showError = conflictCheckResult && !conflictCheckResult.success;
  return (
    <InitialCheckPanel
      detectedParentBranch={detectedParentBranch}
      branches={branches}
      isCheckingConflicts={isCheckingConflicts}
      onCheckConflicts={handleCheckConflicts}
      showError={showError}
      errorMessage={conflictCheckResult?.error}
    />
  );
}

export default memo(MergeChangesPage);
