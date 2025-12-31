/**
 * TopBar - Application header with repo name and action controls.
 * Shows repository name, current branch, and action buttons.
 * 
 * v2 additions:
 * - Branch modal trigger
 * - Undo Last Save button
 * - Discard Changes button
 */
import { memo, useCallback, useState } from 'react';
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

// Shared icon style
const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

function TopBar() {
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

  const handleSync = useCallback(async () => {
    await syncRepo();
  }, [syncRepo]);

  const handleUndo = useCallback(async () => {
    await undoLastCommit();
  }, [undoLastCommit]);

  const handleDiscard = useCallback(async () => {
    await discardAllChanges();
  }, [discardAllChanges]);

  // Derive display values from repo state
  const repoName = repoPath ? repoPath.split('/').pop() : 'Rewind Logic';
  const branchName = repoInfo?.branch || 'main';
  const hasChanges = repoStatus?.changedFiles?.length > 0;
  const hasCommits = commits?.length > 0;

  return (
    <>
      <header className="h-[52px] bg-gray-900 border-b border-gray-700 flex items-center justify-center px-3 select-none shrink-0 relative">
        {/* Center: App name / repo name */}
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">
            {repoPath ? repoName : 'Rewind Logic'}
          </span>
          
          {repoPath && (
            <span className="text-gray-500 text-xs">• {branchName}</span>
          )}
        </div>

        {/* Right: Action buttons */}
        <div className="absolute right-3 flex items-center gap-2">
          {repoPath && (
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
      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard All Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently discard all your uncommitted changes.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard}>
              Discard All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default memo(TopBar);
