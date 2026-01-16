/**
 * ExplorerPage - Main area showing file browser or welcome screen.
 * 
 * When no folder is open: Shows welcome screen with open folder option
 * When folder is open: Shows SimpleFileBrowser (lightweight, no external dependencies)
 */
import { memo, useState, useCallback } from 'react';
import { useRepo } from '../../../../context';
import { OpenFolderDialog } from '../../../../../bindings/changeme/services/filedialogservice';
import NoDirectoryScreen from './NoDirectoryScreen';
import SimpleFileBrowser from '../../../common/SimpleFileBrowser';

function ExplorerPage(): JSX.Element {
  const { repoPath, openRepo } = useRepo();
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

  // Folder open - show SimpleFileBrowser
  return <SimpleFileBrowser repoPath={repoPath} />;
}

export default memo(ExplorerPage);
