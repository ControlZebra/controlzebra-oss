/**
 * ActivityBar - Vertical navigation sidebar (leftmost panel).
 * Provides navigation between main views: Explorer, Changes, History, Profile, Settings.
 * Clicking an active view toggles the sidebar collapsed state.
 * Git-related views (Changes, History) are disabled when no git repo is open.
 */
import { memo, useMemo, useCallback } from 'react';
import {
  Folder,
  GitBranch,
  Clock,
  Settings,
  UserCircle,
} from 'lucide-react';
import { ICON_SIZES, VIEWS } from '../../constants';
import { useLayout, useRepo } from '../../context';

// Top navigation items (main workspace views)
// requiresGit: true means the view requires an active git repository
const TOP_NAV_ITEMS = [
  { id: VIEWS.EXPLORER, Icon: Folder, label: 'Explorer', requiresGit: false },
  { id: VIEWS.CHANGES, Icon: GitBranch, label: 'Changes', requiresGit: true },
  { id: VIEWS.HISTORY, Icon: Clock, label: 'History', requiresGit: true },
];

// Bottom navigation items (user-specific)
const BOTTOM_NAV_ITEMS = [
  { id: VIEWS.PROFILE, Icon: UserCircle, label: 'Profile', requiresGit: false },
  { id: VIEWS.SETTINGS, Icon: Settings, label: 'Settings', requiresGit: false },
];

/**
 * NavButton - Individual navigation button in the activity bar.
 * Handles active state styling and click events.
 */
function NavButton({ item, isActive, onClick, disabled }) {
  const { Icon, label } = item;
  
  return (
    <button
      onClick={onClick}
      title={disabled ? `${label} (requires version control)` : label}
      aria-label={label}
      aria-pressed={isActive}
      disabled={disabled}
      className={`
        w-10 h-10 flex items-center justify-center rounded transition-colors
        ${disabled 
          ? 'text-gray-500/60 dark:text-gray-500/60 cursor-not-allowed bg-theme-muted/20' 
          : isActive 
            ? 'bg-theme-muted text-blue-500 dark:text-blue-400' 
            : 'text-theme-muted hover:text-theme-secondary hover-bg-theme-interactive'
        }
      `}
    >
      <Icon style={{ width: ICON_SIZES.lg, height: ICON_SIZES.lg }} />
    </button>
  );
}

function ActivityBar() {
  const { activeView, setActiveView, sidebarCollapsed, setSidebarCollapsed } = useLayout();
  const { repoInfo } = useRepo();
  
  // Check if we have an active git repository
  const isGitRepo = repoInfo?.isRepo ?? false;

  // Toggle sidebar: clicking active view collapses, clicking inactive opens
  const handleNavClick = useCallback((viewId) => {
    if (activeView === viewId && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    } else {
      setActiveView(viewId);
      setSidebarCollapsed(false);
    }
  }, [activeView, sidebarCollapsed, setActiveView, setSidebarCollapsed]);

  // Memoize button lists to prevent unnecessary re-renders
  const topNavButtons = useMemo(() => 
    TOP_NAV_ITEMS.map(item => {
      const disabled = item.requiresGit && !isGitRepo;
      return (
        <NavButton
          key={item.id}
          item={item}
          isActive={activeView === item.id && !sidebarCollapsed}
          onClick={() => !disabled && handleNavClick(item.id)}
          disabled={disabled}
        />
      );
    }), [activeView, sidebarCollapsed, handleNavClick, isGitRepo]
  );

  const bottomNavButtons = useMemo(() => 
    BOTTOM_NAV_ITEMS.map(item => {
      const disabled = item.requiresGit && !isGitRepo;
      return (
        <NavButton
          key={item.id}
          item={item}
          isActive={activeView === item.id && !sidebarCollapsed}
          onClick={() => !disabled && handleNavClick(item.id)}
          disabled={disabled}
        />
      );
    }), [activeView, sidebarCollapsed, handleNavClick, isGitRepo]
  );

  return (
    <nav className="w-14 bg-theme-base border-r border-theme-default flex flex-col items-center py-3 gap-2 shrink-0">
      {topNavButtons}
      <div className="flex-1" />
      {bottomNavButtons}
    </nav>
  );
}

export default memo(ActivityBar);
