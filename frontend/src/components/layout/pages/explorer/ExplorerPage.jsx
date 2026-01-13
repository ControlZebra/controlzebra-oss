/**
 * ExplorerPage - Main area showing file browser or welcome screen.
 * 
 * When no folder is open: Shows welcome screen with open folder option
 * When folder is open: Shows Chonky file browser (lazy loaded for performance)
 */
import { memo, useState, useCallback, lazy, Suspense } from 'react';
import { useRepo } from '../../../../context';
import { OpenFolderDialog } from '../../../../../bindings/changeme/services/filedialogservice';
import NoDirectoryScreen from './NoDirectoryScreen';
import { Loader2 } from 'lucide-react';

// Lazy load Chonky to reduce initial bundle size (~600KB)
const ChonkyFileBrowser = lazy(() => import('../../../common/ChonkyFileBrowser'));

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

  // Folder open - show Chonky file browser (lazy loaded)
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center bg-theme-base">
          <div className="flex flex-col items-center gap-3 text-theme-muted">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm">Loading file browser...</span>
          </div>
        </div>
      }
    >
      <ChonkyFileBrowser repoPath={repoPath} />
    </Suspense>
  );
}

export default memo(ExplorerPage);
