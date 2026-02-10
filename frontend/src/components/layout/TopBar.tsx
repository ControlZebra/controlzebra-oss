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
  RefreshCw,
  FolderOpen,
  CodeSquare,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Undo2,
  Trash2,
  Menu,
} from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { useLayout, useRepo } from '../../context';
import { useWindowSize, BREAKPOINTS } from '../../hooks';
import { UndoLastSaveDialog } from '../ui';
import BranchModal from './BranchModal';
import RewindConfirmModal from './RewindConfirmModal';
import SwitchProjectModal from './SwitchProjectModal';
import { OpenFolderDialog } from '../../../bindings/controlzebra/services/filedialogservice';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

// Shared icon style
const iconStyle: CSSProperties = { width: ICON_SIZES.md, height: ICON_SIZES.md };

function TopBar(): JSX.Element {
  const { 
    repoPath, 
    repoInfo, 
    repoStatus,
    openRepo,
    closeRepo,
    syncRepo, 
    isSyncing,
    commits,
    undoLastCommit,
    discardAllChanges,
  } = useRepo();
  const { sidebarCollapsed, sidebarWidth, toggleSidebar } = useLayout();

  // Responsive state
  const { isCompactTopBar } = useWindowSize();

  // Modal states
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [switchProjectModalOpen, setSwitchProjectModalOpen] = useState(false);
  const [isRewinding, setIsRewinding] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);

  const handleOpenFolder = useCallback(async (): Promise<void> => {
    setIsOpeningFolder(true);
    try {
      const result = await OpenFolderDialog();
      if (result.selected && result.path) {
        await openRepo(result.path);
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
    } finally {
      setIsOpeningFolder(false);
    }
  }, [openRepo]);

  const handleSwitchProject = useCallback(async (): Promise<void> => {
    await closeRepo();
  }, [closeRepo]);

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
  const branchName = repoInfo?.branch || 'main';
  const hasChanges = (repoStatus?.changedFiles?.length ?? 0) > 0;
  const hasCommits = (commits?.length ?? 0) > 0;
  const isGitRepo = repoInfo?.isRepo ?? false;
  const leftPanelWidth = BREAKPOINTS.ACTIVITY_BAR_WIDTH + (sidebarCollapsed ? 0 : sidebarWidth);

  return (
    <>
      <header className="h-[52px] bg-theme-elevated border-b border-theme-default flex items-center justify-between px-3 select-none shrink-0 gap-2">
        {/* Left: Undo and Discard buttons aligned with sidebar (hidden when sidebar collapsed or compact) */}
        <div
          className="flex items-center shrink-0 transition-[width,opacity] duration-150"
          style={{ width: leftPanelWidth }}
        >
          <div
            className="flex items-center justify-between gap-2 w-full"
            style={{ paddingLeft: sidebarCollapsed ? 0 : BREAKPOINTS.ACTIVITY_BAR_WIDTH, paddingRight: 8 }}
          >
            <div className={`flex items-center gap-2 transition-opacity ${sidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              {repoPath && isGitRepo && !isCompactTopBar && !sidebarCollapsed && (
                <>
                  {/* Switch Project */}
                  <button 
                    onClick={() => setSwitchProjectModalOpen(true)}
                    title="Switch Project"
                    className="flex items-center justify-center h-8 w-8 p-0 bg-theme-elevated hover:bg-theme-hover border border-transparent rounded-md transition-colors duration-75 text-theme-muted hover:text-theme-primary"
                  >
                    <FolderOpen style={iconStyle} className="currentColor" />
                  </button>

                  {/* Undo Last Save */}
                  <button 
                    onClick={() => setUndoDialogOpen(true)}
                    disabled={!hasCommits}
                    title="Undo Last Save"
                    className="flex items-center justify-center h-8 w-8 p-0 bg-theme-elevated hover:bg-theme-hover border border-transparent rounded-md transition-colors duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated text-theme-muted hover:text-theme-primary"
                  >
                    <Undo2 style={iconStyle} className="currentColor" />
                  </button>

                  {/* Discard Changes */}
                  <button 
                    onClick={() => setDiscardDialogOpen(true)}
                    disabled={!hasChanges}
                    title="Discard All Changes"
                    className="flex items-center justify-center h-8 w-8 p-0 bg-theme-elevated hover:bg-theme-hover border border-transparent rounded-md transition-colors duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated text-theme-muted hover:text-theme-primary"
                  >
                    <Trash2 style={iconStyle} className="currentColor" />
                  </button>
                </>
              )}
            </div>
            <button
              onClick={toggleSidebar}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex items-center justify-center h-8 w-8 p-0 bg-theme-elevated hover:bg-theme-hover border border-transparent rounded-md transition-colors duration-75 text-theme-muted hover:text-theme-primary"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen style={iconStyle} className="currentColor" />
              ) : (
                <PanelLeftClose style={iconStyle} className="currentColor" />
              )}
            </button>
          </div>
        </div>

        {/* Center: Branch selector + burger menu (on compact) */}
        <div className="flex-1 flex justify-center items-center gap-2 min-w-0 px-2">
          <button 
            onClick={() => repoPath && isGitRepo && setBranchModalOpen(true)}
            disabled={!repoPath || !isGitRepo}
            className="group flex items-center justify-center gap-2 px-3 py-1.5 h-9 flex-1 max-w-[500px] bg-theme-elevated hover:bg-theme-hover border border-theme-default rounded-md transition-colors duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated text-theme-muted hover:text-theme-primary"
          >
            <CodeSquare style={{ width: ICON_SIZES.md, height: ICON_SIZES.md }} className="transition-colors shrink-0" />
            <span className="font-medium text-sm truncate text-center transition-colors">
              {repoPath && isGitRepo ? branchName : 'No branch'}
            </span>
            <ChevronDown style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} className="transition-colors shrink-0" />
          </button>
          
          {/* Burger menu - right of branch selector on compact view */}
          {repoPath && isGitRepo && isCompactTopBar && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  title="Actions Menu"
                  className="flex items-center justify-center h-8 w-8 p-0 bg-theme-elevated hover:bg-theme-hover border border-transparent rounded-md transition-colors duration-75 shrink-0 text-theme-muted hover:text-theme-primary"
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
                  <RefreshCw style={iconStyle} className="mr-2" />
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
              className="flex items-center justify-center gap-2 h-8 px-2 bg-theme-elevated hover:bg-theme-hover border border-transparent rounded-md transition-colors duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated text-theme-muted hover:text-theme-primary"
            >
              <RefreshCw 
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
      <UndoLastSaveDialog
        open={undoDialogOpen}
        onOpenChange={setUndoDialogOpen}
        onConfirm={handleUndo}
      />

      {/* Discard Changes Confirmation */}
      <RewindConfirmModal
        open={discardDialogOpen}
        onClose={() => setDiscardDialogOpen(false)}
        onConfirm={handleDiscard}
        isLoading={isRewinding}
      />

      {/* Switch Project Confirmation */}
      <SwitchProjectModal
        open={switchProjectModalOpen}
        onClose={() => setSwitchProjectModalOpen(false)}
        onConfirm={handleSwitchProject}
      />
    </>
  );
}

export default memo(TopBar);
