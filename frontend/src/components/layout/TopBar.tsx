/**
 * TopBar - Application header with repo name and action controls.
 * Shows repository name, current branch, and action buttons.
 * 
 * v2 additions:
 * - Branch modal trigger
 * - Undo Last Save button
 * - Discard Changes button
 * - Responsive burger menu for narrow windows
 */
import { memo, useCallback, useState, type CSSProperties } from 'react';
import {
  ArrowUpDown,
  CodeSquare,
  ChevronDown,
  Undo2,
  Trash2,
  Menu,
} from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { useRepo } from '../../context';
import { useWindowSize } from '../../hooks';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

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

  // Responsive state
  const { isCompactTopBar } = useWindowSize();

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
      <header className="h-[52px] bg-theme-elevated border-b border-theme-default flex items-center justify-between px-3 select-none shrink-0 gap-2">
        {/* Left: Undo and Discard buttons (hidden on compact - moved to burger menu) */}
        <div className="flex items-center gap-2 shrink-0">
          {repoPath && isGitRepo && !isCompactTopBar && (
            <>
              {/* Undo Last Save */}
              <button 
                onClick={() => setUndoDialogOpen(true)}
                disabled={!hasCommits}
                title="Undo Last Save"
                className="flex items-center justify-center h-9 w-9 bg-theme-elevated hover:bg-theme-hover border border-theme-default rounded-md transition-colors duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated text-theme-muted hover:text-theme-primary"
              >
                <Undo2 style={iconStyle} className="currentColor" />
              </button>

              {/* Discard Changes */}
              <button 
                onClick={() => setDiscardDialogOpen(true)}
                disabled={!hasChanges}
                title="Discard All Changes"
                className="flex items-center justify-center h-9 w-9 bg-theme-elevated hover:bg-theme-hover border border-theme-default rounded-md transition-colors duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated text-theme-muted hover:text-theme-primary"
              >
                <Trash2 style={iconStyle} className="currentColor" />
              </button>
            </>
          )}
        </div>

        {/* Center: Branch selector + burger menu (on compact) */}
        <div className="flex-1 flex justify-center items-center gap-2 min-w-0 px-2">
          <button 
            onClick={() => repoPath && isGitRepo && setBranchModalOpen(true)}
            disabled={!repoPath || !isGitRepo}
            className="group flex items-center justify-center gap-2 px-3 py-1.5 h-9 flex-1 max-w-[500px] bg-theme-elevated hover:bg-theme-hover border border-theme-default rounded-md transition-colors duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated text-theme-muted hover:text-theme-primary"
          >
            <CodeSquare style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} className="transition-colors shrink-0" />
            <span className="font-medium text-sm truncate text-center transition-colors">
              {repoPath && isGitRepo ? branchName : 'No branch'}
            </span>
            <ChevronDown style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} className="transition-colors shrink-0" />
          </button>
          
          {/* Burger menu - right of branch selector on compact view */}
          {repoPath && isGitRepo && isCompactTopBar && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  title="Actions Menu"
                  className="flex items-center justify-center h-9 w-9 bg-theme-elevated hover:bg-theme-hover border border-theme-default rounded-md transition-colors duration-75 shrink-0 text-theme-muted hover:text-theme-primary"
                >
                  <Menu style={iconStyle} className="currentColor" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setUndoDialogOpen(true)}
                  disabled={!hasCommits}
                >
                  <Undo2 style={iconStyle} className="mr-2" />
                  Undo Last Save
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDiscardDialogOpen(true)}
                  disabled={!hasChanges}
                >
                  <Trash2 style={iconStyle} className="mr-2" />
                  Discard All Changes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSync}
                  disabled={isSyncing}
                >
                  <ArrowUpDown style={iconStyle} className="mr-2" />
                  {isSyncing ? 'Syncing...' : 'Sync with Cloud'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Right: Sync button (hidden on compact - moved to burger menu) */}
        <div className="flex items-center gap-2 justify-end shrink-0">
          {repoPath && isGitRepo && !isCompactTopBar && (
            <button 
              onClick={handleSync}
              disabled={isSyncing}
              title="Sync"
              className="flex items-center justify-center gap-2 h-7 px-2 bg-theme-elevated hover:bg-theme-hover border border-theme-default rounded-md transition-colors duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated text-theme-muted hover:text-theme-primary"
            >
              <ArrowUpDown 
                style={iconStyle} 
                className={`${isSyncing ? 'animate-pulse' : ''}`} 
              />
              <span className="text-sm font-medium">
                {isSyncing ? 'Syncing...' : 'Sync'}
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
