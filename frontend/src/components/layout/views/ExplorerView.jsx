/**
 * ExplorerView - Sidebar view showing action panels based on repo state.
 * 
 * Displays contextual panels:
 * - No folder: Prompt to open folder
 * - Folder without git: Initialize option
 * - Has changes: Commit form with changed files list
 * - No changes but ahead: Push prompt
 * - On feature branch, synced: Merge request option
 * - On main, synced: All caught up
 */
import { memo, useState, useCallback } from 'react';
import { FolderOpen } from 'lucide-react';
import { MAIN_BRANCHES } from '../../../constants';
import { ICON_STYLES } from '../../../lib/gitHelpers';
import { useRepo } from '../../../context';
import { OpenFolderDialog } from '../../../../bindings/changeme/services/filedialogservice';
import { Button } from '../../ui';
import {
  SidebarCommitPanel,
  SidebarSyncedPanel,
  SidebarPushPanel,
  SidebarNoRepoPanel,
  SidebarMergePanel,
} from '../sidebar-panels';

function ExplorerView() {
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

  // No folder open - show open folder prompt
  if (!repoPath) {
    return (
      <div className="p-4 text-center">
        <p className="text-theme-muted text-xs mb-3">No folder open</p>
        <Button 
          size="sm" 
          variant="secondary" 
          onClick={handleOpenFolder} 
          loading={isOpeningFolder}
          className="w-full"
        >
          <FolderOpen style={ICON_STYLES.sm} />
          Open Folder
        </Button>
        <p className="text-theme-muted text-xs mt-3">
          <kbd className="px-1 py-0.5 rounded bg-theme-muted text-theme-secondary text-xs">⌘O</kbd>
        </p>
      </div>
    );
  }

  // Folder open but not a git repository
  const isGitRepo = repoInfo?.isRepo;
  if (!isGitRepo) {
    const folderName = repoPath.split('/').pop();
    return (
      <SidebarNoRepoPanel 
        folderName={folderName}
        onInitialize={handleInitializeGit}
        isLoading={isLoading}
      />
    );
  }

  const changedFiles = repoStatus?.changedFiles || [];
  const hasChanges = changedFiles.length > 0;
  const ahead = repoStatus?.ahead || 0;
  const hasUpstream = repoStatus?.hasUpstream ?? true;
  const totalLocalCommits = repoStatus?.totalLocalCommits || 0;
  const branchName = repoStatus?.branch || 'main';
  const isMainBranch = MAIN_BRANCHES.includes(branchName.toLowerCase());

  // Has uncommitted changes
  if (hasChanges) {
    return (
      <SidebarCommitPanel
        changedFiles={changedFiles}
        onCommit={commitChanges}
        onBranchAndCommit={branchAndCommit}
        onRewind={handleRewind}
        currentBranch={branchName}
        repoPath={repoPath}
        isCommitting={isCommitting}
        isRewinding={isRewinding}
      />
    );
  }

  // No changes, but commits ahead of remote (ready to push)
  const needsPush = ahead > 0 || (!hasUpstream && totalLocalCommits > 0);
  if (needsPush) {
    return (
      <SidebarPushPanel
        ahead={ahead}
        hasUpstream={hasUpstream}
        totalLocalCommits={totalLocalCommits}
        onSync={syncRepo}
        isSyncing={isSyncing}
      />
    );
  }

  // On feature branch, synced → suggest merge request
  if (!isMainBranch) {
    return <SidebarMergePanel branchName={branchName} />;
  }

  // All synced on main branch
  return <SidebarSyncedPanel repoPath={repoPath} />;
}

export default memo(ExplorerView);
