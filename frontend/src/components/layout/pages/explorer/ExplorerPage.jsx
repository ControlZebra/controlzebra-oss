/**
 * ExplorerPage - Main area showing file tree or welcome screen.
 * 
 * When no folder is open: Shows welcome screen with open folder option
 * When folder is open: Shows file tree explorer
 */
import { memo, useState, useCallback } from 'react';
import { useRepo } from '../../../../context';
import { OpenFolderDialog } from '../../../../../bindings/changeme/services/filedialogservice';
import { FileTreeView } from '../../../common';
import NoDirectoryScreen from './NoDirectoryScreen';

function ExplorerPage() {
  const { repoPath, openRepo } = useRepo();
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);

  const handleOpenFolder = useCallback(async () => {
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

  // Folder open - show file tree
  return <FileTreeView repoPath={repoPath} />;
}

export default memo(ExplorerPage);
