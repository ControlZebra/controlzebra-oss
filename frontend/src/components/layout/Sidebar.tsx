import { memo, useMemo, useCallback, useRef, type MouseEvent, type ComponentType } from 'react';
import { ChevronDown, FolderGit2 } from 'lucide-react';
import { VIEWS, ICON_SIZES, type ViewType } from '../../constants';
import { useLayout, useRepo } from '../../context';
import { ExplorerView, HistoryView, MergeChangesView, RepoSettingsView, SettingsView, ProfileView } from './views';

// ============================================================================
// Types
// ============================================================================

interface ViewConfig {
  title: string;
  Component: ComponentType;
}

// ============================================================================
// Configuration
// ============================================================================

const VIEW_CONFIG: Record<ViewType, ViewConfig> = {
  [VIEWS.EXPLORER]: { title: 'Quick Actions', Component: ExplorerView },
  [VIEWS.HISTORY]: { title: 'Commit History', Component: HistoryView },
  [VIEWS.MERGE_CHANGES]: { title: 'Merge Changes', Component: MergeChangesView },
  [VIEWS.REPO_SETTINGS]: { title: 'Repository Settings', Component: RepoSettingsView },
  [VIEWS.SETTINGS]: { title: 'Settings', Component: SettingsView },
  [VIEWS.PROFILE]: { title: 'Profile', Component: ProfileView },
};

const MIN_WIDTH = 150;
const MAX_WIDTH = 400;

// ============================================================================
// Component
// ============================================================================

function Sidebar(): JSX.Element | null {
  const { activeView, sidebarCollapsed, sidebarWidth, setSidebarWidth } = useLayout();
  const { repoPath, repoInfo } = useRepo();
  const isResizing = useRef(false);

  // Derive repo display values
  const repoName = repoPath ? repoPath.split('/').pop() : 'No repository';
  const isGitRepo = repoInfo?.isRepo ?? false;

  const { title, Component } = useMemo(
    () => VIEW_CONFIG[activeView] || VIEW_CONFIG[VIEWS.HISTORY],
    [activeView]
  );

  const handleMouseDown = useCallback((e: MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: globalThis.MouseEvent): void => {
      if (!isResizing.current) return;
      const activityBarWidth = 56; // w-14 = 56px
      const newWidth = e.clientX - activityBarWidth;
      setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = (): void => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [setSidebarWidth]);

  if (sidebarCollapsed) {
    return null;
  }

  return (
    <aside 
      className="bg-theme-surface border-r border-theme-default flex flex-col shrink-0 relative"
      style={{ width: sidebarWidth }}
    >
      {/* Repository selector - always visible */}
      <button 
        className="flex items-center gap-3 px-3 py-2.5 mx-2 mt-2 bg-theme-elevated hover:bg-theme-hover border border-theme-default rounded-md transition-colors"
        title={repoPath || 'Open a folder'}
      >
        <FolderGit2 style={{ width: ICON_SIZES.md, height: ICON_SIZES.md }} className="text-theme-muted shrink-0" />
        <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
          <span className="text-theme-muted text-[10px] font-medium uppercase tracking-wide">
            Current repository
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-theme-primary font-semibold text-sm truncate">
              {repoName}
            </span>
            {repoPath && !isGitRepo && (
              <span className="text-yellow-500/80 text-[10px] whitespace-nowrap">• No git</span>
            )}
          </div>
        </div>
        <ChevronDown style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} className="text-theme-muted shrink-0" />
      </button>

      {/* View header */}
      <header className="h-9 px-3 flex items-center border-b border-theme-default shrink-0 mt-2">
        <h2 className="text-theme-muted text-xs font-medium uppercase tracking-wide">
          {title}
        </h2>
      </header>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <Component />
      </div>
      {/* Resize handle - wider hit area with visible indicator */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-2 h-full cursor-col-resize group z-10"
      >
        {/* Visible resize bar */}
        <div className="absolute top-0 right-0 w-[3px] h-full bg-theme-default group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors" />
        {/* Resize grip dots - visible on hover */}
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[3px] h-8 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-1 h-1 rounded-full bg-blue-400" />
          <div className="w-1 h-1 rounded-full bg-blue-400" />
          <div className="w-1 h-1 rounded-full bg-blue-400" />
        </div>
      </div>
    </aside>
  );
}

export default memo(Sidebar);
