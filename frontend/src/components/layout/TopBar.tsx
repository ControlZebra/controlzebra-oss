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
  RefreshCw,
  CodeSquare,
  ChevronDown,
  Undo2,
  Trash2,
} from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { useRepo } from '../../context';
import { 
  Button, 
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
  const repoName = repoPath ? repoPath.split('/').pop() : 'Rewind Logic';
  const branchName = repoInfo?.branch || 'main';
  const hasChanges = (repoStatus?.changedFiles?.length ?? 0) > 0;
  const hasCommits = (commits?.length ?? 0) > 0;
  const isGitRepo = repoInfo?.isRepo ?? false;

  return (
    <>
      <header className="h-[52px] bg-theme-base border-b border-theme-default flex items-center justify-center px-3 select-none shrink-0 relative">
        {/* Center: App name / repo name */}
        <div className="flex items-center gap-2">
          <span className="text-theme-primary font-semibold text-sm">
            {repoPath ? repoName : 'Rewind Logic'}
          </span>
          
          {repoPath && isGitRepo && (
            <span className="text-theme-muted text-xs">• {branchName}</span>
          )}
          
          {repoPath && !isGitRepo && (
            <span className="text-yellow-500/80 text-xs">• No version control</span>
          )}
        </div>

        {/* Right: Action buttons - only show when git repo is active */}
        <div className="absolute right-3 flex items-center gap-2">
          {repoPath && isGitRepo && (
            <>
              {/* Undo Last Save */}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setUndoDialogOpen(true)}
                disabled={!hasCommits}
                title="Undo Last Save"
              >
                <Undo2 style={iconStyle} />
              </Button>

              {/* Discard Changes */}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setDiscardDialogOpen(true)}
                disabled={!hasChanges}
                title="Discard All Changes"
              >
                <Trash2 style={iconStyle} />
              </Button>

              {/* Branch selector dropdown button */}
              <Button 
                variant="secondary" 
                size="sm"
                onClick={() => setBranchModalOpen(true)}
              >
                <CodeSquare style={iconStyle} />
                <span>{branchName}</span>
                <ChevronDown style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
              </Button>

              {/* Sync button */}
              <Button 
                size="sm"
                onClick={handleSync}
                loading={isSyncing}
              >
                {isSyncing ? (
                  'Syncing...'
                ) : (
                  <>
                    <RefreshCw style={iconStyle} />
                    <span>Sync</span>
                  </>
                )}
              </Button>
            </>
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
