/**
 * ExplorerPage - Main area showing recommended actions based on repo state.
 * 
 * Displays contextual guidance:
 * - No repo: Welcome screen with open folder prompt
 * - Has changes: Quick save form with changed files table
 * - No changes but ahead of remote: Encourage sync to cloud
 * - No changes, synced, on feature branch: Suggest merge request
 * - No changes, synced, on main/master: All caught up state
 */
import { memo, useState, useCallback } from 'react';
import { useRepo } from '../../../../context';
import { OpenFolderDialog } from '../../../../../bindings/changeme/services/filedialogservice';
import NoDirectoryScreen from './NoDirectoryScreen';
import CommitScreen from './CommitScreen';
import ReadyToPushScreen from './ReadyToPushScreen';
import MergeRequestScreen from './MergeRequestScreen';
import AllSyncedScreen from './AllSyncedScreen';

// Main branches where we don't suggest merge requests
const MAIN_BRANCHES = ['main', 'master'];

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
  const branchName = repoStatus?.branch || 'main';
  const isMainBranch = MAIN_BRANCHES.includes(branchName.toLowerCase());

  // No repository open
  if (!repoPath) {
    return (
      <NoDirectoryScreen 
        onOpenFolder={handleOpenFolder} 
        onOpenPath={openRepo}
        isLoading={isOpeningFolder} 
      />
    );
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

  // Repository open, no changes, but commits ahead of remote (ready to push)
  if (ahead > 0) {
    return (
      <ReadyToPushScreen
        ahead={ahead}
        onSync={syncRepo}
        isSyncing={isSyncing}
      />
    );
  }

  // Repository open, no changes, synced, on feature branch → suggest merge request
  if (!isMainBranch) {
    return <MergeRequestScreen branchName={branchName} />;
  }

  // Repository open, no changes, synced, on main/master → all caught up
  return <AllSyncedScreen repoPath={repoPath} />;
}

export default memo(ExplorerPage);
