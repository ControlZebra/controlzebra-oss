/**
 * TopBar - Application header with repo name and action controls.
 * Shows the current branch and action buttons.
 * 
 * v2 additions:
 * - Branch modal trigger
 * - Undo Last Save button
 * - Responsive burger menu for narrow windows
 */
import { memo, useCallback, useState, type CSSProperties } from 'react';
import {
  FolderOpen,
  CodeSquare,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  Menu,
} from 'lucide-react';
import { ICON_SIZES, VIEWS } from '../../shared/constants';
import { useLayout, useRepo } from '../../context';
import { useWindowSize, BREAKPOINTS } from '../../shared/hooks';
import { UndoLastSaveDialog } from '../../shared/ui';
import BranchModal from './BranchModal';
import SwitchProjectModal from './SwitchProjectModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu';

// Shared icon style
const iconStyle: CSSProperties = { width: ICON_SIZES.md, height: ICON_SIZES.md };
const iconSmStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const noDragRegionStyle = { '--wails-draggable': 'no-drag' } as CSSProperties;
const noDragControlProps = {
  style: noDragRegionStyle,
  'data-window-control': 'true',
} as const;

function TopBar(): JSX.Element {
  const { 
    repoPath, 
    repoInfo, 
    closeRepo,
    commits,
    undoLastCommit,
    operationInProgress,
  } = useRepo();
  const {
    sidebarCollapsed,
    sidebarWidth,
    toggleSidebar,
    setActiveView,
  } = useLayout();

  // Responsive state
  const { isCompactTopBar } = useWindowSize();

  // Modal states
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const [switchProjectModalOpen, setSwitchProjectModalOpen] = useState(false);

  const handleSwitchProject = useCallback(async (): Promise<void> => {
    await closeRepo();
    setActiveView(VIEWS.EXPLORER);
  }, [closeRepo, setActiveView]);

  const handleUndo = useCallback(async (): Promise<void> => {
    await undoLastCommit();
  }, [undoLastCommit]);

  // Derive display values from repo state
  const branchName = repoInfo?.branch || 'main';
  const hasCommits = (commits?.length ?? 0) > 0;
  const isGitRepo = repoInfo?.isRepo ?? false;
  const leftPanelWidth = BREAKPOINTS.ACTIVITY_BAR_WIDTH + (sidebarCollapsed ? 0 : sidebarWidth);

  return (
    <>
      <header
        className="h-[52px] bg-theme-elevated border-b border-theme-default flex items-center justify-between px-3 shrink-0 gap-2"
        data-testid="top-bar"
      >
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
                    {...noDragControlProps}
                    onClick={() => setSwitchProjectModalOpen(true)}
                    title="Switch Project"
                    className="flex items-center justify-center h-8 w-8 p-0 bg-theme-elevated hover:bg-theme-hover border border-transparent rounded-md transition-colors duration-75 text-theme-muted hover:text-theme-primary"
                  >
                    <FolderOpen style={iconStyle} className="currentColor" />
                  </button>

                  {/* Undo Last Save */}
                  <button 
                    {...noDragControlProps}
                    onClick={() => setUndoDialogOpen(true)}
                    disabled={!hasCommits || operationInProgress}
                    title="Undo Last Save"
                    className="flex items-center justify-center h-8 w-8 p-0 bg-theme-elevated hover:bg-theme-hover border border-transparent rounded-md transition-colors duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated text-theme-muted hover:text-theme-primary"
                  >
                    <Trash2 style={iconStyle} className="currentColor" />
                  </button>
                </>
              )}
            </div>
            <button
              {...noDragControlProps}
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
            {...noDragControlProps}
            onClick={() => repoPath && isGitRepo && setBranchModalOpen(true)}
            disabled={!repoPath || !isGitRepo}
            className="group flex items-center justify-center gap-2 px-3 py-1.5 h-9 flex-1 max-w-[500px] bg-theme-elevated hover:bg-theme-hover border border-theme-default rounded-md transition-colors duration-75 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-theme-elevated text-theme-muted hover:text-theme-primary"
          >
            <CodeSquare style={{ width: ICON_SIZES.md, height: ICON_SIZES.md }} className="transition-colors shrink-0" />
            <span className="font-medium text-sm truncate text-center transition-colors">
              {repoPath && isGitRepo ? branchName : 'No branch'}
            </span>
            <ChevronDown style={iconSmStyle} className="transition-colors shrink-0" />
          </button>
          
          {/* Burger menu - right of branch selector on compact view */}
          {repoPath && isGitRepo && isCompactTopBar && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  {...noDragControlProps}
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
                  <Trash2 style={iconStyle} className="mr-2" />
                  Undo Last Save
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Branch Modal */}
      <BranchModal 
        open={branchModalOpen} 
        onOpenChange={setBranchModalOpen} 
      />

      {/* Undo Last Save Confirmation */}
      <UndoLastSaveDialog
        open={undoDialogOpen}
        onOpenChange={setUndoDialogOpen}
        onConfirm={handleUndo}
      />

      {/* Switch Project Confirmation */}
      <SwitchProjectModal
        open={switchProjectModalOpen}
        onOpenChange={setSwitchProjectModalOpen}
        onConfirm={handleSwitchProject}
      />

    </>
  );
}

export default memo(TopBar);
