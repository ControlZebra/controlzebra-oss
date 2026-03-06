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
  FolderOpen,
  CodeSquare,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Undo2,
  Trash2,
  Menu,
} from 'lucide-react';
import { openExternalUrl } from '../../shared/runtime/browser';
import { ICON_SIZES, VIEWS } from '../../constants';
import { useLayout, useRepo } from '../../context';
import { useWindowSize, BREAKPOINTS } from '../../hooks';
import { UndoLastSaveDialog } from '../../components/ui';
import BranchModal from './BranchModal';
import RewindConfirmModal from './RewindConfirmModal';
import SwitchProjectModal from './SwitchProjectModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';

// Shared icon style
const iconStyle: CSSProperties = { width: ICON_SIZES.md, height: ICON_SIZES.md };
const COMMUNITY_DISCORD_URL = 'https://discord.com/channels/1470750950552633466/1470779539696390205';

function DiscordIcon({ style, className = '' }: { style?: CSSProperties; className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={style}
      className={className}
      fill="currentColor"
    >
      <path d="M20.317 4.3698A19.7913 19.7913 0 0015.885 3c-.191.328-.403.775-.553 1.125a18.271 18.271 0 00-5.487 0A12.64 12.64 0 009.292 3a19.736 19.736 0 00-4.433 1.37C2.07 8.587 1.333 12.693 1.697 16.742a19.9 19.9 0 005.42 2.758 14.9 14.9 0 001.163-1.919 12.96 12.96 0 01-1.837-.885c.154-.111.305-.226.45-.345a14.16 14.16 0 0010.214 0c.146.12.297.235.45.345-.58.338-1.196.635-1.84.887.339.66.728 1.301 1.164 1.918a19.88 19.88 0 005.421-2.757c.426-4.696-.728-8.765-2.985-12.972zM8.02 14.323c-.996 0-1.812-.918-1.812-2.045 0-1.127.8-2.045 1.812-2.045 1.02 0 1.828.926 1.813 2.045 0 1.127-.801 2.045-1.813 2.045zm7.974 0c-.996 0-1.812-.918-1.812-2.045 0-1.127.8-2.045 1.812-2.045 1.02 0 1.828.926 1.813 2.045 0 1.127-.793 2.045-1.813 2.045z" />
    </svg>
  );
}

function TopBar(): JSX.Element {
  const { 
    repoPath, 
    repoInfo, 
    repoStatus,
    closeRepo,
    commits,
    undoLastCommit,
    discardAllChanges,
    operationInProgress,
  } = useRepo();
  const { sidebarCollapsed, sidebarWidth, toggleSidebar, setActiveView } = useLayout();

  // Responsive state
  const { isCompactTopBar } = useWindowSize();

  // Modal states
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [switchProjectModalOpen, setSwitchProjectModalOpen] = useState(false);
  const [isRewinding, setIsRewinding] = useState(false);

  const handleSwitchProject = useCallback(async (): Promise<void> => {
    await closeRepo();
    setActiveView(VIEWS.EXPLORER);
  }, [closeRepo, setActiveView]);

  const handleOpenCommunity = useCallback(async (): Promise<void> => {
    await openExternalUrl(COMMUNITY_DISCORD_URL);
  }, []);

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
                    disabled={!hasCommits || operationInProgress}
                    title="Undo Last Save"
                    className="flex items-center justify-center h-8 w-8 p-0 bg-theme-elevated hover:bg-theme-hover border border-transparent rounded-md transition-colors duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated text-theme-muted hover:text-theme-primary"
                  >
                    <Undo2 style={iconStyle} className="currentColor" />
                  </button>

                  {/* Discard Changes */}
                  <button 
                    onClick={() => setDiscardDialogOpen(true)}
                    disabled={!hasChanges || operationInProgress}
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
                  disabled={!hasCommits || operationInProgress}
                >
                  <Undo2 style={iconStyle} className="mr-2" />
                  Undo Last Save
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDiscardDialogOpen(true)}
                  disabled={!hasChanges || operationInProgress}
                >
                  <Trash2 style={iconStyle} className="mr-2" />
                  Discard All Changes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleOpenCommunity}
                >
                  <DiscordIcon style={iconStyle} className="mr-2" />
                  Community
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Right: Community button (hidden on compact - moved to burger menu) */}
        <div className="flex items-center gap-2 justify-end shrink-0">
          {repoPath && isGitRepo && !isCompactTopBar && (
            <button 
              onClick={handleOpenCommunity}
              title="Community"
              className="flex items-center justify-center gap-2 h-8 px-2 bg-theme-elevated hover:bg-theme-hover border border-transparent rounded-md transition-colors duration-75 text-theme-muted hover:text-theme-primary"
            >
              <DiscordIcon style={iconStyle} />
              <span className="text-sm font-medium">
                Community
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
