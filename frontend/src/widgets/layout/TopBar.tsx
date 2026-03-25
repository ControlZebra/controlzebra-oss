/**
 * TopBar - Application header with repo name and action controls.
 * Shows the current branch, action buttons, and the account menu.
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
  UserCircle,
  Settings,
  PlugZap,
  LogIn,
  LogOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { openExternalUrl } from '../../shared/runtime/browser';
import { ICON_SIZES, VIEWS } from '../../shared/constants';
import { useAuth, useLayout, useRepo } from '../../context';
import { useWindowSize, BREAKPOINTS } from '../../shared/hooks';
import { UndoLastSaveDialog } from '../../shared/ui';
import AccountDialog from '../../features/auth/components/AccountDialog';
import BranchModal from './BranchModal';
import SwitchProjectModal from './SwitchProjectModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu';

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
    setSidebarCollapsed,
    setSelectedSettingsCategory,
    accountDialogOpen,
    setAccountDialogOpen,
    openAccountDialog,
  } = useLayout();
  const { isAuthenticated, userEmail, userName, logout } = useAuth();

  // Responsive state
  const { isCompactTopBar } = useWindowSize();

  // Modal states
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const [switchProjectModalOpen, setSwitchProjectModalOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSwitchProject = useCallback(async (): Promise<void> => {
    await closeRepo();
    setActiveView(VIEWS.EXPLORER);
  }, [closeRepo, setActiveView]);

  const handleOpenCommunity = useCallback(async (): Promise<void> => {
    await openExternalUrl(COMMUNITY_DISCORD_URL);
  }, []);

  const handleOpenSettings = useCallback((category: string): void => {
    setSelectedSettingsCategory(category);
    setActiveView(VIEWS.SETTINGS);
    setSidebarCollapsed(false);
  }, [setActiveView, setSelectedSettingsCategory, setSidebarCollapsed]);

  const handleAccountAction = useCallback(async (): Promise<void> => {
    if (!isAuthenticated) {
      openAccountDialog();
      return;
    }

    setIsSigningOut(true);
    try {
      const result = await logout();
      if (!result.success) {
        toast.error(result.error || 'Failed to sign out');
      }
    } catch {
      toast.error('Failed to sign out');
    } finally {
      setIsSigningOut(false);
    }
  }, [isAuthenticated, logout, openAccountDialog]);

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
                  <Trash2 style={iconStyle} className="mr-2" />
                  Undo Last Save
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Right: Account menu */}
        <div className="flex items-center gap-2 justify-end shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title={isAuthenticated ? (userEmail || 'Account menu') : 'Account menu'}
                className="flex items-center justify-center h-8 w-8 p-0 bg-theme-elevated hover:bg-theme-hover border border-transparent rounded-md transition-colors duration-75 text-theme-muted hover:text-theme-primary"
              >
                <UserCircle style={iconStyle} className="currentColor" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {isAuthenticated && (
                <>
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-theme-primary">
                      {userName || userEmail || 'ControlZebra User'}
                    </span>
                    {userEmail ? (
                      <span className="text-xs font-normal text-theme-muted">{userEmail}</span>
                    ) : null}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => handleOpenSettings('general')}>
                <Settings style={iconStyle} className="mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenSettings('integrations')}>
                <PlugZap style={iconStyle} className="mr-2" />
                Integrations
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenCommunity}>
                <DiscordIcon style={iconStyle} className="mr-2" />
                Discord
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void handleAccountAction()} disabled={isSigningOut}>
                {isAuthenticated ? (
                  <LogOut style={iconStyle} className="mr-2" />
                ) : (
                  <LogIn style={iconStyle} className="mr-2" />
                )}
                {isAuthenticated ? 'Sign out' : 'Sign in'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

      <AccountDialog
        open={accountDialogOpen}
        onOpenChange={setAccountDialogOpen}
      />
    </>
  );
}

export default memo(TopBar);
