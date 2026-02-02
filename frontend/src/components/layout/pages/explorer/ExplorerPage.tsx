/**
 * ExplorerPage - Main area showing tabs with file browser and opened files.
 * 
 * Features:
 * - Tabs bar at the top with file browser as pinned tab
 * - File browser shows when that tab is active
 * - File content shows when file tabs are active
 * - When no folder is open: Shows welcome screen
 */
import { memo, useState, useCallback } from 'react';
import { useRepo, useLayout } from '../../../../context';
import { OpenFolderDialog } from '../../../../../bindings/controlzebra/services/filedialogservice';
import NoDirectoryScreen from './NoDirectoryScreen';
import NoGitRepoScreen from './NoGitRepoScreen';
import SimpleFileBrowser from '../../../common/SimpleFileBrowser';
import ExplorerTabsBar from '../../../common/ExplorerTabsBar';
import FileContentViewer from '../../../common/FileContentViewer';

function ExplorerPage(): JSX.Element {
  const { repoPath, repoInfo, openRepo, initializeGitRepo, isLoading } = useRepo();
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

  // Folder open but not a git repo - show init screen
  if (!repoInfo?.isRepo) {
    const folderName = repoPath.split('/').pop() || 'Folder';
    return (
      <NoGitRepoScreen
        folderName={folderName}
        onInitialize={initializeGitRepo}
        isLoading={isLoading}
      />
    );
  }

  // Find the active tab
  const activeTab = explorerTabs.find(tab => tab.id === activeExplorerTab);

  // Render content based on active tab type
  const renderContent = (): JSX.Element => {
    if (!activeTab || activeTab.type === 'file-browser') {
      return <SimpleFileBrowser repoPath={repoPath} />;
    }

    // File tab - show file content
    if (activeTab.filePath) {
      return <FileContentViewer filePath={activeTab.filePath} />;
    }

    return <SimpleFileBrowser repoPath={repoPath} />;
  };

  // Folder open - show tabs and content
  return (
    <div className="flex flex-col h-full">
      <ExplorerTabsBar />
      <div className="flex-1 min-h-0 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}

export default memo(ExplorerPage);
