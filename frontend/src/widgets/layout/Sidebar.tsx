import { memo, useMemo, useCallback, useRef, type MouseEvent, type ComponentType } from 'react';
import { VIEWS, type ViewType } from '../../shared/constants';
import { useLayout, useRepo } from '../../context';
import ExplorerView from '../../features/explorer/components/ExplorerView';
import RepoSettingsView from '../../features/repo-settings/components/RepoSettingsView';
import SettingsView from '../../features/settings/components/SettingsView';
import WelcomeView from '../../features/welcome/components/WelcomeView';
import DebugView from '../../features/debug/components/DebugView';
import ReviewsView from '../../features/reviews/components/ReviewsView';
import { BREAKPOINTS } from '../../shared/hooks/useWindowSize';

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
  [VIEWS.EXPLORER]: { title: 'Next step advisor', Component: ExplorerView },
  [VIEWS.REVIEWS]: { title: 'Reviews', Component: ReviewsView },
  [VIEWS.REPO_SETTINGS]: { title: 'Repository Settings', Component: RepoSettingsView },
  [VIEWS.SETTINGS]: { title: 'Settings', Component: SettingsView },
  [VIEWS.DEBUG]: { title: 'Debug Logs', Component: DebugView },
};

const MIN_WIDTH = 150;
const MAX_WIDTH = 400;

// ============================================================================
// Component
// ============================================================================

function Sidebar(): JSX.Element | null {
  const { activeView, sidebarCollapsed, sidebarWidth, setSidebarWidth } = useLayout();
  const { repoPath } = useRepo();
  const isResizing = useRef(false);

  // When no repo is open and we're on the explorer view, show WelcomeView instead
  const isWelcomeMode = activeView === VIEWS.EXPLORER && !repoPath;

  const { title, Component } = useMemo(
    () => {
      if (isWelcomeMode) {
        return { title: 'Welcome', Component: WelcomeView as ComponentType };
      }
      return VIEW_CONFIG[activeView] || VIEW_CONFIG[VIEWS.EXPLORER];
    },
    [activeView, isWelcomeMode]
  );

  const handleMouseDown = useCallback((e: MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: globalThis.MouseEvent): void => {
      if (!isResizing.current) return;
      const newWidth = e.clientX - BREAKPOINTS.ACTIVITY_BAR_WIDTH;
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
      className="bg-theme-surface border-r border-shell-divider flex flex-col shrink-0 relative"
      style={{ width: sidebarWidth }}
    >
      {/* View header */}
      <header className="px-4 py-3 flex items-center shrink-0">
        <h2 className="text-theme-primary text-lg font-sans font-semibold leading-6">
          {title}
        </h2>
      </header>
      <div className={`flex-1 min-h-0 ${activeView === VIEWS.EXPLORER && repoPath ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}>
        <Component />
      </div>
      {/* Resize handle - wider hit area with visible indicator */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-2 h-full cursor-col-resize group z-10"
      >
        {/* Visible resize bar */}
        <div className="absolute top-0 right-0 w-px h-full group-hover:bg-blue-500 group-active:bg-blue-400 transition-colors" />
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
