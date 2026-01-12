/**
 * ExplorerPage - Main area showing recommended actions based on repo state.
 * 
 * Displays contextual guidance:
 * - No folder: Welcome screen with open folder prompt
 * - Folder without git: Warning screen with initialize option
 * - Has changes: Quick save form with changed files table
 * - No changes but ahead of remote: Encourage sync to cloud
 * - No changes, synced, on feature branch: Suggest merge request
 * - No changes, synced, on main/master: All caught up state
 */
import { memo, useState, useCallback } from 'react';
import { useRepo } from '../../../../context';
import { OpenFolderDialog } from '../../../../../bindings/changeme/services/filedialogservice';
import NoDirectoryScreen from './NoDirectoryScreen';
import NoGitRepoScreen from './NoGitRepoScreen';
import CommitScreen from './CommitScreen';
import ReadyToPushScreen from './ReadyToPushScreen';
import MergeRequestScreen from './MergeRequestScreen';
import AllSyncedScreen from './AllSyncedScreen';

// Main branches where we don't suggest merge requests
const MAIN_BRANCHES = ['main', 'master'];

function ExplorerPage() {
  const { 
    repoPath, 
    repoInfo,
    repoStatus, 
    openRepo, 
    initializeGitRepo,
    commitChanges,
    branchAndCommit,
    syncRepo,
    rewindToLastSnapshot,
    isLoading,
    isCommitting,
    isSyncing,
  } = useRepo();
  
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [isRewinding, setIsRewinding] = useState(false);

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

  const handleInitializeGit = useCallback(async () => {
    await initializeGitRepo();
  }, [initializeGitRepo]);

  const handleRewind = useCallback(async () => {
    setIsRewinding(true);
    try {
      const success = await rewindToLastSnapshot();
      return success;
    } finally {
      setIsRewinding(false);
    }
  }, [rewindToLastSnapshot]);

  // No folder open
  if (!repoPath) {
    return (
      <NoDirectoryScreen 
        onOpenFolder={handleOpenFolder} 
        onOpenPath={openRepo}
        isLoading={isOpeningFolder} 
      />
    );
  }

  // Folder open but not a git repository
  const isGitRepo = repoInfo?.isRepo;
  if (!isGitRepo) {
    const folderName = repoPath.split('/').pop();
    return (
      <NoGitRepoScreen 
        folderName={folderName}
        onInitialize={handleInitializeGit}
        isLoading={isLoading}
      />
    );
  }

  const changedFiles = repoStatus?.changedFiles || [];
  const hasChanges = changedFiles.length > 0;
  const ahead = repoStatus?.ahead || 0;
  const hasUpstream = repoStatus?.hasUpstream ?? true; // Default to true for backwards compat
  const totalLocalCommits = repoStatus?.totalLocalCommits || 0;
  const branchName = repoStatus?.branch || 'main';
  const isMainBranch = MAIN_BRANCHES.includes(branchName.toLowerCase());

  // Repository open with uncommitted changes
  if (hasChanges) {
    return (
      <CommitScreen
        changedFiles={changedFiles}
        onCommit={commitChanges}
        onBranchAndCommit={branchAndCommit}
        onSync={syncRepo}
        onRewind={handleRewind}
        currentBranch={branchName}
        repoPath={repoPath}
        isCommitting={isCommitting}
        isSyncing={isSyncing}
        isRewinding={isRewinding}
      />
    );
  }

  // Repository open, no changes, but commits ahead of remote (ready to push)
  // Also show when there's no upstream but we have local commits to push
  const needsPush = ahead > 0 || (!hasUpstream && totalLocalCommits > 0);
  if (needsPush) {
    return (
      <ReadyToPushScreen
        ahead={ahead}
        hasUpstream={hasUpstream}
        totalLocalCommits={totalLocalCommits}
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
