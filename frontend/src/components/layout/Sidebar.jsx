import { memo, useMemo, useCallback, useRef } from 'react';
import { VIEWS } from '../../constants';
import { useLayout } from '../../context';
import { ExplorerView, ChangesView, HistoryView, MergeChangesView, SettingsView, ProfileView } from './views';

const VIEW_CONFIG = {
  [VIEWS.EXPLORER]: { title: 'Explorer', Component: ExplorerView },
  [VIEWS.CHANGES]: { title: 'Source Control', Component: ChangesView },
  [VIEWS.HISTORY]: { title: 'Commit History', Component: HistoryView },
  [VIEWS.MERGE_CHANGES]: { title: 'Merge Changes', Component: MergeChangesView },
  [VIEWS.SETTINGS]: { title: 'Settings', Component: SettingsView },
  [VIEWS.PROFILE]: { title: 'Profile', Component: ProfileView },
};

const MIN_WIDTH = 150;
const MAX_WIDTH = 400;

function Sidebar() {
  const { activeView, sidebarCollapsed, sidebarWidth, setSidebarWidth } = useLayout();
  const isResizing = useRef(false);

  const { title, Component } = useMemo(
    () => VIEW_CONFIG[activeView] || VIEW_CONFIG[VIEWS.CHANGES],
    [activeView]
  );

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      const activityBarWidth = 56; // w-14 = 56px
      const newWidth = e.clientX - activityBarWidth;
      setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
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
      <header className="h-9 px-3 flex items-center border-b border-theme-default shrink-0">
        <h2 className="text-theme-muted text-xs font-medium uppercase tracking-wide">
          {title}
        </h2>
      </header>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <Component />
      </div>
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors"
      />
    </aside>
  );
}

export default memo(Sidebar);
