/**
 * ActivityBar - Vertical navigation sidebar (leftmost panel).
 * Provides navigation between main views: Explorer, Changes, History, Profile, Settings.
 * Clicking an active view toggles the sidebar collapsed state.
 */
import { memo, useMemo, useCallback } from 'react';
import {
  Folder,
  FileText,
  Clock,
  Settings,
  UserCircle,
} from 'lucide-react';
import { ICON_SIZES, VIEWS } from '../../constants';
import { useLayout } from '../../context';

// Top navigation items (main workspace views)
const TOP_NAV_ITEMS = [
  { id: VIEWS.EXPLORER, Icon: Folder, label: 'Explorer' },
  { id: VIEWS.CHANGES, Icon: FileText, label: 'Changes' },
  { id: VIEWS.HISTORY, Icon: Clock, label: 'History' },
];

// Bottom navigation items (user-specific)
const BOTTOM_NAV_ITEMS = [
  { id: VIEWS.PROFILE, Icon: UserCircle, label: 'Profile' },
  { id: VIEWS.SETTINGS, Icon: Settings, label: 'Settings' },
];

/**
 * NavButton - Individual navigation button in the activity bar.
 * Handles active state styling and click events.
 */
function NavButton({ item, isActive, onClick }) {
  const { Icon, label } = item;
  
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      className={`
        w-9 h-9 flex items-center justify-center rounded transition-colors
        ${isActive 
          ? 'bg-gray-700 text-blue-400' 
          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
        }
      `}
    >
      <Icon style={{ width: ICON_SIZES.md, height: ICON_SIZES.md }} />
    </button>
  );
}

function ActivityBar() {
  const { activeView, setActiveView, sidebarCollapsed, setSidebarCollapsed } = useLayout();

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
    TOP_NAV_ITEMS.map(item => (
      <NavButton
        key={item.id}
        item={item}
        isActive={activeView === item.id && !sidebarCollapsed}
        onClick={() => handleNavClick(item.id)}
      />
    )), [activeView, sidebarCollapsed, handleNavClick]
  );

  const bottomNavButtons = useMemo(() => 
    BOTTOM_NAV_ITEMS.map(item => (
      <NavButton
        key={item.id}
        item={item}
        isActive={activeView === item.id && !sidebarCollapsed}
        onClick={() => handleNavClick(item.id)}
      />
    )), [activeView, sidebarCollapsed, handleNavClick]
  );

  return (
    <nav className="w-11 bg-gray-900 border-r border-gray-700 flex flex-col items-center py-2 gap-0.5 shrink-0">
      {topNavButtons}
      <div className="flex-1" />
      {bottomNavButtons}
    </nav>
  );
}

export default memo(ActivityBar);
