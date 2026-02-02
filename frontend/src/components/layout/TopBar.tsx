/**
 * TopBar - Application header with repo name and action controls.
 * Shows repository name, current branch, and action buttons.
 * 
 * v2 additions:
 * - Branch modal trigger
 * - Undo Last Save button
 * - Discard Changes button
 */
import { memo, useCallback, useState, type CSSProperties } from 'react';
import {
  ArrowUpDown,
  CodeSquare,
  ChevronDown,
  Undo2,
  Trash2,
} from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { useRepo } from '../../context';
import { 
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '../ui';
import BranchModal from './BranchModal';
import RewindConfirmModal from './RewindConfirmModal';

// Shared icon style
const iconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

function TopBar(): JSX.Element {
  const { 
    repoPath, 
    repoInfo, 
    repoStatus,
    syncRepo, 
    isSyncing,
    commits,
    undoLastCommit,
    discardAllChanges,
  } = useRepo();

  // Modal states
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [isRewinding, setIsRewinding] = useState(false);

  const handleSync = useCallback(async (): Promise<void> => {
    await syncRepo();
  }, [syncRepo]);

  const handleUndo = useCallback(async (): Promise<void> => {
    await undoLastCommit();
  }, [undoLastCommit]);

  const handleDiscard = useCallback(async (): Promise<void> => {
    setIsRewinding(true);
    try {
      const success = await discardAllChanges();
      if (success) {
        setDiscardDialogOpen(false);
      }
    } finally {
      setIsRewinding(false);
    }
  }, [discardAllChanges]);

  // Derive display values from repo state
  const repoName = repoPath ? repoPath.split('/').pop() : 'ControlZebra';
  const branchName = repoInfo?.branch || 'main';
  const hasChanges = (repoStatus?.changedFiles?.length ?? 0) > 0;
  const hasCommits = (commits?.length ?? 0) > 0;
  const isGitRepo = repoInfo?.isRepo ?? false;

  return (
    <>
      <header className="h-[52px] bg-theme-base border-b border-theme-default grid grid-cols-3 items-center px-3 select-none shrink-0">
        {/* Left: Undo and Discard buttons */}
        <div className="flex items-center gap-2">
          {repoPath && isGitRepo && (
            <>
              {/* Undo Last Save */}
              <button 
                onClick={() => setUndoDialogOpen(true)}
                disabled={!hasCommits}
                title="Undo Last Save"
                className="flex items-center justify-center h-9 w-9 bg-theme-elevated hover:bg-theme-hover border border-theme-default rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated"
              >
                <Undo2 style={iconStyle} className="text-gray-400" />
              </button>

              {/* Discard Changes */}
              <button 
                onClick={() => setDiscardDialogOpen(true)}
                disabled={!hasChanges}
                title="Discard All Changes"
                className="flex items-center justify-center h-9 w-9 bg-theme-elevated hover:bg-theme-hover border border-theme-default rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated"
              >
                <Trash2 style={iconStyle} className="text-gray-400" />
              </button>
            </>
          )}
        </div>

        {/* Center: Branch selector - compact */}
        <div className="flex justify-center">
          <button 
            onClick={() => repoPath && isGitRepo && setBranchModalOpen(true)}
            disabled={!repoPath || !isGitRepo}
            className="flex items-center justify-center gap-2 px-3 py-1.5 h-9 min-w-[500px] bg-theme-elevated hover:bg-theme-hover border border-theme-default rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated"
          >
            <CodeSquare style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} className="text-theme-muted shrink-0" />
            <span className="text-theme-primary font-medium text-sm truncate text-center">
              {repoPath && isGitRepo ? branchName : 'No branch'}
            </span>
            <ChevronDown style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} className="text-theme-muted shrink-0" />
          </button>
        </div>

        {/* Right: Sync button */}
        <div className="flex items-center gap-2 justify-end">
          {repoPath && isGitRepo && (
            <button 
              onClick={handleSync}
              disabled={isSyncing}
              title="Sync with Cloud"
              className="flex items-center justify-center gap-2 h-9 px-3 bg-blue-600 hover:bg-blue-700 border border-blue-500 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
            >
              <ArrowUpDown 
                style={iconStyle} 
                className={`text-white ${isSyncing ? 'animate-pulse' : ''}`} 
              />
              <span className="text-white text-sm font-medium">
                {isSyncing ? 'Syncing...' : 'Sync with Cloud'}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Branch Modal */}
      <BranchModal 
        open={branchModalOpen} 
        onClose={() => setBranchModalOpen(false)} 
      />

      {/* Undo Last Save Confirmation */}
      <AlertDialog open={undoDialogOpen} onOpenChange={setUndoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo Last Save?</AlertDialogTitle>
            <AlertDialogDescription>
              This will undo your last commit. Your changes will be kept but unstaged.
              This action is safe - no work will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="default" onClick={handleUndo}>
              Undo Last Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard Changes Confirmation */}
      <RewindConfirmModal
        open={discardDialogOpen}
        onClose={() => setDiscardDialogOpen(false)}
        onConfirm={handleDiscard}
        isLoading={isRewinding}
      />
    </>
  );
}

export default memo(TopBar);
