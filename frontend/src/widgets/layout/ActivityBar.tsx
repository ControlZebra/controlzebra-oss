/**
 * ActivityBar - Vertical navigation sidebar (leftmost panel).
 * Provides navigation between main views: Explorer, Changes, History, Profile, Settings.
 * Clicking an active view toggles the sidebar collapsed state.
 * Git-related views (Changes, History) are disabled when no git repo is open.
 */
import { memo, useMemo, useCallback, type CSSProperties } from 'react';
import {
  House,
  Clock,
  Merge,
  Sliders,
  Settings,
  UserCircle,
  Bug,
  type LucideIcon,
} from 'lucide-react';
import { ICON_SIZES, VIEWS, type ViewType } from '../../shared/constants';
import { useLayout, useRepo } from '../../context';

// ============================================================================
// Types
// ============================================================================

interface NavItem {
  id: ViewType;
  Icon: LucideIcon;
  label: string;
  requiresGit: boolean;
}

interface NavButtonProps {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
  disabled: boolean;
  showNotificationDot?: boolean;
}

// ============================================================================
// Navigation Configuration
// ============================================================================

// Top navigation items (main workspace views)
// requiresGit: true means the view requires an active git repository
const TOP_NAV_ITEMS: NavItem[] = [
  { id: VIEWS.EXPLORER, Icon: House, label: 'Next Step Advisor', requiresGit: false },
  { id: VIEWS.HISTORY, Icon: Clock, label: 'History', requiresGit: true },
  { id: VIEWS.MERGE_CHANGES, Icon: Merge, label: 'Merge changes', requiresGit: true },
  { id: VIEWS.REPO_SETTINGS, Icon: Sliders, label: 'Repository Settings', requiresGit: true },
];

// Bottom navigation items (user-specific)
const BOTTOM_NAV_ITEMS: NavItem[] = [
  { id: VIEWS.PROFILE, Icon: UserCircle, label: 'Profile', requiresGit: false },
  { id: VIEWS.DEBUG, Icon: Bug, label: 'Debug Logs', requiresGit: false },
  { id: VIEWS.SETTINGS, Icon: Settings, label: 'Settings', requiresGit: false },
];

// ============================================================================
// Components
// ============================================================================

/**
 * NavButton - Individual navigation button in the activity bar.
 * Handles active state styling and click events.
 */
function NavButton({ item, isActive, onClick, disabled, showNotificationDot = false }: NavButtonProps): JSX.Element {
  const { Icon, label } = item;
  
  const iconSize = ICON_SIZES.lg * 0.7;
  const iconStyle: CSSProperties = { width: iconSize, height: iconSize };
  
  return (
    <button
      onClick={onClick}
      title={disabled ? `${label} (requires version control)` : label}
      aria-label={label}
      aria-pressed={isActive}
      disabled={disabled}
      className={`
        w-10 h-10 flex items-center justify-center rounded transition-colors relative
        ${disabled 
          ? 'text-gray-500/60 dark:text-gray-500/60 cursor-not-allowed bg-theme-muted/20' 
          : isActive 
            ? 'bg-theme-muted text-blue-500 dark:text-blue-400' 
            : 'text-theme-muted hover:text-theme-secondary hover-bg-theme-interactive'
        }
      `}
    >
      <Icon style={iconStyle} />
      {showNotificationDot && (
        <span
          className="absolute top-1 right-1 w-2 h-2 rounded-full bg-yellow-400 animate-pulse"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

/**
 * ActivityBar - Main vertical navigation component
 */
function ActivityBar(): JSX.Element {
  const { activeView, setActiveView, sidebarCollapsed, setSidebarCollapsed } = useLayout();
  const { repoInfo, repoStatus } = useRepo();
  
  // Check if we have an active git repository
  const isGitRepo = repoInfo?.isRepo ?? false;
  const hasUncommittedChanges = isGitRepo && (repoStatus?.hasChanges ?? false);

  // Toggle sidebar: clicking active view collapses, clicking inactive opens
  const handleNavClick = useCallback((viewId: ViewType): void => {
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
          showNotificationDot={item.id === VIEWS.EXPLORER && hasUncommittedChanges}
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
    <nav className="w-10 bg-theme-elevated border-r border-theme-default flex flex-col items-center py-3 gap-2 shrink-0">
      {topNavButtons}
      <div className="flex-1" />
      {bottomNavButtons}
    </nav>
  );
}

export default memo(ActivityBar);
