/**
 * ExplorerPage - Main area showing tabs with file browser and opened files.
 * 
 * Features:
 * - Tabs bar at the top with file browser as pinned tab
 * - File browser shows when that tab is active
 * - File content shows when file tabs are active (using multi-viewer architecture)
 * - When no folder is open: Shows welcome screen
 * - Non-git folders: Shows file browser like usual (start tracking via sidebar)
 * - All open tabs are kept mounted (but hidden) to preserve viewer state/cache
 */
import { memo, useState, useCallback, useMemo } from 'react';
import { useRepo, useLayout } from '../../../../context';
import { OpenFolderDialog } from '../../../../../bindings/controlzebra/services/filedialogservice';
import NoDirectoryScreen from './NoDirectoryScreen';
import SimpleFileBrowser from '../../../common/SimpleFileBrowser';
import ExplorerTabsBar from '../../../common/ExplorerTabsBar';
import { ViewerRenderer, getViewerForFile, getViewerById } from '../../../viewers';

function ExplorerPage(): JSX.Element {
  const { repoPath, openRepo } = useRepo();
  const { activeExplorerTab, explorerTabs } = useLayout();
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);

  const handleOpenFolder = useCallback(async (): Promise<void> => {
    setIsOpeningFolder(true);
    try {
      const result = await OpenFolderDialog();
      if (result.selected && result.path) {
        await openRepo(result.path);
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
    setIsOpeningFolder(false);
  }, [openRepo]);

  // Memoize file tabs - must be called before any conditional returns (Rules of Hooks)
  const fileTabs = useMemo(() => 
    explorerTabs.filter(tab => tab.type === 'file' && tab.filePath),
    [explorerTabs]
  );

  // Check if file browser is active
  const isFileBrowserActive = activeExplorerTab === 'file-browser';

  // Memoize rendered file tabs to avoid recreating elements on every render
  // This keeps viewer components mounted and their caches intact
  // Must be called before any conditional returns (Rules of Hooks)
  const renderedFileTabs = useMemo(() => {
    return fileTabs.map(tab => {
      const viewer = tab.viewerId 
        ? getViewerById(tab.viewerId)
        : getViewerForFile(tab.title);
      
      if (!viewer || !tab.filePath) return null;
      
      const isActive = tab.id === activeExplorerTab;
      
      return (
        <div 
          key={tab.id} 
          className="h-full"
          style={{ display: isActive ? 'block' : 'none' }}
        >
          <ViewerRenderer viewer={viewer} filePath={tab.filePath} />
        </div>
      );
    }).filter(Boolean) as JSX.Element[];
  }, [fileTabs, activeExplorerTab]);

  // No folder open - show welcome screen
  if (!repoPath) {
    return (
      <NoDirectoryScreen 
        onOpenFolder={handleOpenFolder} 
        onOpenPath={openRepo}
        isLoading={isOpeningFolder} 
      />
    );
  }

  // Folder open - show tabs and content
  // Render file browser and all file tabs, showing only the active one
  return (
    <div className="flex flex-col h-full">
      <ExplorerTabsBar />
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {/* File browser - always mounted, shown when active */}
        <div 
          className="h-full"
          style={{ display: isFileBrowserActive ? 'block' : 'none' }}
        >
          <SimpleFileBrowser repoPath={repoPath} />
        </div>
        
        {/* All file tabs - mounted but hidden when not active */}
        {renderedFileTabs}
      </div>
    </div>
  );
}

export default memo(ExplorerPage);
