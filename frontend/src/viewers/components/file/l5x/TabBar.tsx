/**
 * TabBar component for L5XViewer
 * Displays a horizontal tab bar with closeable tabs
 */
import { memo, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import type { Tab } from './useTabs';

// ============================================================================
// TAB ITEM
// ============================================================================

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onMiddleClick: (e: React.MouseEvent) => void;
}

const TabItem = memo(function TabItem({ 
  tab, 
  isActive, 
  onSelect, 
  onClose, 
  onMiddleClick 
}: TabItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleCloseClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  }, [onClose]);

  return (
    <div
      className={`
        flex items-center gap-1.5 px-3 py-1.5 cursor-pointer select-none
        border-r border-theme-default text-xs max-w-[180px]
        ${isActive 
          ? 'bg-theme-surface text-theme-primary border-b-2 border-b-accent-primary' 
          : 'bg-theme-elevated text-theme-secondary hover:bg-theme-muted'
        }
      `}
      onClick={onSelect}
      onMouseDown={onMiddleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={tab.title}
    >
      <span className="truncate flex-1">{tab.title}</span>
      <button
        className={`
          flex items-center justify-center w-4 h-4 rounded
          transition-opacity hover:bg-theme-muted
          ${isHovered || isActive ? 'opacity-100' : 'opacity-0'}
        `}
        onClick={handleCloseClick}
        title="Close tab"
      >
        <X size={12} className="text-theme-secondary" />
      </button>
    </div>
  );
});

// ============================================================================
// TAB BAR
// ============================================================================

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
}

export const TabBar = memo(function TabBar({ 
  tabs, 
  activeTabId, 
  onTabSelect, 
  onTabClose 
}: TabBarProps) {
  const handleMiddleClick = useCallback((e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      onTabClose(tabId);
    }
  }, [onTabClose]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-end bg-theme-elevated border-b border-theme-default overflow-x-auto scrollbar-thin">
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onSelect={() => onTabSelect(tab.id)}
          onClose={() => onTabClose(tab.id)}
          onMiddleClick={(e) => handleMiddleClick(e, tab.id)}
        />
      ))}
    </div>
  );
});
