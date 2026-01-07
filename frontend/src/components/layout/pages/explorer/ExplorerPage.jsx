/**
 * ExplorerPage - Main area showing recommended actions based on repo state.
 * 
 * Displays contextual guidance:
 * - No repo: Welcome screen with open folder prompt
 * - Has changes: Quick save form with changed files table
 * - No changes but ahead of remote: Sync to cloud / Create PR screen
 * - Fully synced: Success state encouraging exploration
 */
import { memo, useState, useCallback } from 'react';
import { useRepo } from '../../../../context';
import { OpenFolderDialog } from '../../../../../bindings/changeme/services/filedialogservice';
import NoDirectoryScreen from './NoDirectoryScreen';
import CommitScreen from './CommitScreen';
import ReadyToPushScreen from './ReadyToPushScreen';
import AllSyncedScreen from './AllSyncedScreen';

function ExplorerPage() {
  const { 
    repoPath, 
    repoStatus, 
    openRepo, 
    commitChanges, 
    syncRepo,
    isCommitting,
    isSyncing,
  } = useRepo();
  
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

  const changedFiles = repoStatus?.changedFiles || [];
  const hasChanges = changedFiles.length > 0;
  const ahead = repoStatus?.ahead || 0;

  // No repository open
  if (!repoPath) {
    return <NoDirectoryScreen onOpenFolder={handleOpenFolder} isLoading={isOpeningFolder} />;
  }

  // Repository open with uncommitted changes
  if (hasChanges) {
    return (
      <CommitScreen
        changedFiles={changedFiles}
        onCommit={commitChanges}
        onSync={syncRepo}
        isCommitting={isCommitting}
        isSyncing={isSyncing}
      />
    );
  }

  // Repository open, no changes, but commits ahead of remote (ready to push/PR)
  if (ahead > 0) {
    return (
      <ReadyToPushScreen
        ahead={ahead}
        onSync={syncRepo}
        isSyncing={isSyncing}
      />
    );
  }

  // Repository open, no changes, fully synced
  return <AllSyncedScreen repoPath={repoPath} />;
}

export default memo(ExplorerPage);
