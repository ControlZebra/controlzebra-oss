/**
 * ExplorerTabsBar - Tab bar for the explorer main area.
 * 
 * Features:
 * - File browser is pinned (cannot be closed)
 * - Other file tabs can be closed
 * - Active tab highlighting
 * - Click to switch tabs
 * - Viewer-specific icons for file tabs
 */
import { memo, useCallback, useMemo } from 'react';
import { X, FolderOpen, FileText, Pin, Eye, FileDiff, type LucideIcon } from 'lucide-react';
import { useLayout } from '../../context';
import { ICON_SIZES, type ExplorerTab } from '../../constants';
import { getViewerById, getViewerForFile } from '../../lib/viewers';

interface TabItemProps {
  tab: ExplorerTab;
  isActive: boolean;
  onSelect: () => void;
  onClose?: () => void;
}

/**
 * Get the appropriate icon for a tab.
 * Uses viewer-specific icons when available, falls back to FileText.
 */
function getTabIcon(tab: ExplorerTab): LucideIcon {
  if (tab.type === 'file-browser') {
    return FolderOpen;
  }
  
  // Try to get viewer icon via explicit viewerId or auto-detect from filename
  const viewer = tab.viewerId 
    ? getViewerById(tab.viewerId)
    : getViewerForFile(tab.title);
  
  return viewer?.icon ?? FileText;
}

const TabItem = memo(function TabItem({ 
  tab, 
  isActive, 
  onSelect, 
  onClose 
}: TabItemProps): JSX.Element {
  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClose?.();
  }, [onClose]);

  const Icon = useMemo(() => getTabIcon(tab), [tab]);

  return (
    <div
      onClick={onSelect}
      className={`
        group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer
        min-w-0 max-w-[180px]
        transition-colors duration-150
        ${isActive 
          ? 'bg-fb-base rounded-t-xl' 
          : 'bg-theme-elevated hover:bg-theme-muted'
        }
      `}
      title={tab.filePath || tab.title}
    >
      {tab.type === 'file' && (
        <Eye
          size={ICON_SIZES.xs}
          className={isActive ? 'text-blue-400 shrink-0' : 'text-theme-muted shrink-0'}
        />
      )}
      {tab.type === 'diff' && (
        <FileDiff
          size={ICON_SIZES.xs}
          className={isActive ? 'text-orange-400 shrink-0' : 'text-theme-muted shrink-0'}
        />
      )}
      <Icon 
        size={ICON_SIZES.sm} 
        className={isActive ? 'text-blue-500 shrink-0' : 'text-theme-secondary shrink-0'} 
      />
      <span 
        className={`
          truncate text-sm
          ${isActive ? 'text-theme-primary' : 'text-theme-secondary'}
        `}
      >
        {tab.title}
      </span>
      
      {tab.isPinned ? (
        <Pin 
          size={ICON_SIZES.xs} 
          className="shrink-0 text-theme-muted ml-1 rotate-45" 
        />
      ) : (
        <button
          onClick={handleClose}
          className={`
            shrink-0 ml-1 p-0.5 rounded
            opacity-0 group-hover:opacity-100
            hover:bg-theme-muted
            transition-opacity duration-150
          `}
          aria-label={`Close ${tab.title}`}
        >
          <X size={ICON_SIZES.xs} className="text-theme-muted hover:text-theme-primary" />
        </button>
      )}
    </div>
  );
});

function ExplorerTabsBar(): JSX.Element {
  const { 
    explorerTabs, 
    activeExplorerTab, 
    setActiveExplorerTab, 
    closeExplorerTab 
  } = useLayout();

  return (
    <div className="flex items-center bg-theme-elevated border-b border-theme-default overflow-x-auto shrink-0">
      {explorerTabs.map(tab => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={activeExplorerTab === tab.id}
          onSelect={() => setActiveExplorerTab(tab.id)}
          onClose={tab.isPinned ? undefined : () => closeExplorerTab(tab.id)}
        />
      ))}
      
      {/* Empty space to fill remaining area */}
      <div className="flex-1 bg-theme-elevated min-w-[40px]" />
    </div>
  );
}

export default memo(ExplorerTabsBar);
