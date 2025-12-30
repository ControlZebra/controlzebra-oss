import { memo, useMemo, useCallback } from 'react';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { ICON_SIZES, VIEWS } from '../../constants';
import { useLayout } from '../../context';

const TOP_NAV_ITEMS = [
  { id: VIEWS.EXPLORER, icon: FolderIcon, label: 'Explorer' },
  { id: VIEWS.CHANGES, icon: DescriptionIcon, label: 'Changes' },
  { id: VIEWS.HISTORY, icon: HistoryIcon, label: 'History' },
];

const BOTTOM_NAV_ITEMS = [
  { id: VIEWS.PROFILE, icon: AccountCircleIcon, label: 'Profile' },
  { id: VIEWS.SETTINGS, icon: SettingsIcon, label: 'Settings' },
];

const iconStyle = { fontSize: ICON_SIZES.md };

function NavButton({ item, isActive, onClick }) {
  const Icon = item.icon;
  
  return (
    <button
      onClick={onClick}
      title={item.label}
      aria-label={item.label}
      aria-pressed={isActive}
      className={`
        w-9 h-9 flex items-center justify-center rounded transition-colors
        ${isActive 
          ? 'bg-gray-700 text-blue-400' 
          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
        }
      `}
    >
      <Icon sx={iconStyle} />
    </button>
  );
}

function ActivityBar() {
  const { activeView, setActiveView, sidebarCollapsed, setSidebarCollapsed } = useLayout();

  // Clicking active view collapses sidebar, clicking inactive view opens it
  const handleNavClick = useCallback((viewId) => {
    if (activeView === viewId && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    } else {
      setActiveView(viewId);
      setSidebarCollapsed(false);
    }
  }, [activeView, sidebarCollapsed, setActiveView, setSidebarCollapsed]);

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
