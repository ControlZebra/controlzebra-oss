/**
 * ExplorerView - Sidebar view showing action panels based on repo state.
 * 
 * Displays contextual panels based on repo state:
 * - No folder: Sidebar renders WelcomeView instead (handled by Sidebar.tsx)
 * - Not a git repo: Initialize option via ExplorerStatusPanel
 * - Has changes: Commit form with changed files
 * - Needs push: Sync/publish prompt with GitHub integration
 * - Feature branch synced: Merge request option
 * - Main branch synced: All caught up
 */
import { memo, useState, useCallback, useMemo } from 'react';
import { useLayout } from '../../../context';
import { MAIN_BRANCHES } from '../../../shared/constants';
import { useRepo, type FileStatus } from '../../../context';
import { getFolderNameFromPath } from '../../../shared/utils/path';
import SidebarCommitPanel from './SidebarCommitPanel';
import ExplorerStatusPanel from './ExplorerStatusPanel';
import GitHubDeviceFlowModal from '../../auth/components/GitHubDeviceFlowModal';
import HistoryTimeline from '../../history/components/HistoryTimeline';

// ============================================================================
// Types
// ============================================================================

type PanelState = 
  | { type: 'noFolder' }
  | { type: 'noRepo'; folderName: string }
  | { type: 'hasChanges'; changedFiles: FileStatus[]; branchName: string }
  | { type: 'push'; ahead: number; hasUpstream: boolean; totalLocalCommits: number }
  | { type: 'featureBranch'; branchName: string }
  | { type: 'synced' };

interface DeviceFlowState {
  isOpen: boolean;
  userCode: string;
  verificationUrl: string;
}

// ============================================================================
// Component
// ============================================================================

function ExplorerView(): JSX.Element {
  const {
    openExplorerTab,
    explorerTabs,
    activeExplorerTab,
    setActiveExplorerTab,
    openExplorerMergeModal,
  } = useLayout();
  const { 
    repoPath, 
    repoInfo,
    repoStatus, 
    graphCommits,
    startTracking,
    installRequiredPackages,
    commitChanges,
    branchAndCommit,
    discardFileChanges,
    syncRepo,
    rewindToLastSnapshot,
    isLoading,
    isCommitting,
    isSyncing,
    // Global operation lock
    operationInProgress,
    // Remote state
    hasRemote,
    refreshRemotes,
    // GitHub state
    gitInstalled,
    lfsInstalled,
    isInstallingPackages,
    ghInstalled,
    ghAuthStatus,
    startGitHubLogin,
    publishToGitHub,
    loadUserOrganizations,
  } = useRepo();
  
  const [isRewinding, setIsRewinding] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState>({
    isOpen: false,
    userCode: '',
    verificationUrl: '',
  });

  // Derive panel state from repo status
  const panelState = useMemo((): PanelState => {
    if (!repoPath) return { type: 'noFolder' };
    if (!repoInfo?.isRepo) return { type: 'noRepo', folderName: getFolderNameFromPath(repoPath) || '' };
    
    const changedFiles = repoStatus?.changedFiles || [];
    const ahead = repoStatus?.ahead || 0;
    const hasUpstream = repoStatus?.hasUpstream ?? true;
    const totalLocalCommits = repoStatus?.totalLocalCommits || 0;
    const branchName = repoStatus?.branch || 'main';
    const isMainBranch = MAIN_BRANCHES.includes(branchName.toLowerCase());
    const needsPush = ahead > 0 || (!hasUpstream && totalLocalCommits > 0);

    if (changedFiles.length > 0) {
      return { type: 'hasChanges', changedFiles, branchName };
    }
    if (needsPush) {
      return { type: 'push', ahead, hasUpstream, totalLocalCommits };
    }
    if (!isMainBranch) {
      return { type: 'featureBranch', branchName };
    }
    return { type: 'synced' };
  }, [repoPath, repoInfo?.isRepo, repoStatus]);

  const handleRewind = useCallback(async (): Promise<boolean> => {
    setIsRewinding(true);
    try {
      return await rewindToLastSnapshot();
    } finally {
      setIsRewinding(false);
    }
  }, [rewindToLastSnapshot]);

  // Handle GitHub connect button - start device flow authentication
  const handleConnectGitHub = useCallback(async (): Promise<void> => {
    const result = await startGitHubLogin();
    
    if (result.success && result.userCode) {
      setDeviceFlow({
        isOpen: true,
        userCode: result.userCode,
        verificationUrl: result.verificationUrl || 'https://github.com/login/device',
      });
    }
  }, [startGitHubLogin]);

  // Handle device flow completion
  const handleDeviceFlowComplete = useCallback(() => {
    setDeviceFlow({ isOpen: false, userCode: '', verificationUrl: '' });
    // Remotes will be refreshed when user publishes
  }, []);

  // Handle device flow cancel
  const handleDeviceFlowCancel = useCallback(() => {
    setDeviceFlow({ isOpen: false, userCode: '', verificationUrl: '' });
  }, []);

  // Handle publish to GitHub with form data
  const handlePublishToGitHub = useCallback(async (
    name: string,
    isPrivate: boolean,
    owner: string
  ): Promise<void> => {
    if (!repoPath) return;
    
    setIsPublishing(true);
    try {
      const result = await publishToGitHub(name, '', isPrivate, owner);
      if (result.success) {
        // Refresh remotes after successful publish
        await refreshRemotes();
      }
    } finally {
      setIsPublishing(false);
    }
  }, [repoPath, publishToGitHub, refreshRemotes]);

  const handleOpenCombineChanges = useCallback((): void => {
    openExplorerMergeModal();
  }, [openExplorerMergeModal]);

  const selectedTimelineCommitHash = useMemo(() => {
    const activeTab = explorerTabs.find((tab) => tab.id === activeExplorerTab);
    return activeTab?.type === 'commit' ? activeTab.commitContext?.commitHash ?? null : null;
  }, [explorerTabs, activeExplorerTab]);

  const handleTimelineSelectCommit = useCallback((hash: string | null): void => {
    if (!hash) {
      setActiveExplorerTab('file-browser');
      return;
    }

    const graphCommit = graphCommits.find((commit) => commit.hash === hash);
    const firstLineMessage = graphCommit?.message.split('\n')[0].trim();
    const shortHash = graphCommit?.shortHash || hash.slice(0, 7);

    openExplorerTab({
      id: `commit-${hash}`,
      title: firstLineMessage || `Snapshot ${shortHash}`,
      type: 'commit',
      commitContext: {
        commitHash: hash,
      },
    });
  }, [graphCommits, openExplorerTab, setActiveExplorerTab]);

  const sharedModals = (
    <>
      <GitHubDeviceFlowModal
        isOpen={deviceFlow.isOpen}
        userCode={deviceFlow.userCode}
        verificationUrl={deviceFlow.verificationUrl}
        onComplete={handleDeviceFlowComplete}
        onCancel={handleDeviceFlowCancel}
      />
    </>
  );

  let primaryPanel: JSX.Element;

  // No folder open - sidebar shows WelcomeView in this case (handled by Sidebar.tsx)
  // So we just return null as a safety fallback
  if (panelState.type === 'noFolder') {
    return (
      <>
        <div className="p-4 text-center text-theme-muted text-xs">No folder open</div>
        {sharedModals}
      </>
    );
  }

  // Has uncommitted changes - show commit panel
  if (panelState.type === 'hasChanges') {
    primaryPanel = (
      <SidebarCommitPanel
        changedFiles={panelState.changedFiles}
        onCommit={commitChanges}
        onBranchAndCommit={branchAndCommit}
        onRewind={handleRewind}
        onDiscardFile={discardFileChanges}
        currentBranch={panelState.branchName}
        repoPath={repoPath || undefined}
        isCommitting={isCommitting}
        isRewinding={isRewinding}
        operationInProgress={operationInProgress}
      />
    );
  } else {
    primaryPanel = (
      <ExplorerStatusPanel
        status={panelState.type}
        folderName={panelState.type === 'noRepo' ? panelState.folderName : undefined}
        branchName={repoStatus?.branch}
        repoPath={repoPath || undefined}
        ahead={panelState.type === 'push' ? panelState.ahead : undefined}
        hasUpstream={panelState.type === 'push' ? panelState.hasUpstream : undefined}
        hasRemote={hasRemote}
        totalLocalCommits={panelState.type === 'push' ? panelState.totalLocalCommits : undefined}
        onInitialize={startTracking}
        onInstallRequiredPackages={installRequiredPackages}
        onSync={syncRepo}
        onConnectGitHub={handleConnectGitHub}
        onPublishToGitHub={handlePublishToGitHub}
        onOpenCombineChanges={handleOpenCombineChanges}
        onLoadOrganizations={loadUserOrganizations}
        isLoading={isLoading}
        isSyncing={isSyncing}
        isPublishing={isPublishing}
        operationInProgress={operationInProgress}
        gitInstalled={gitInstalled}
        lfsInstalled={lfsInstalled}
        isInstallingPackages={isInstallingPackages}
        ghInstalled={ghInstalled}
        ghAuthStatus={ghAuthStatus}
      />
    );
  }

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {primaryPanel}
        </div>

        <section className="flex-1 min-h-0 flex flex-col border-t border-theme-default" aria-label="Timeline">
          <header className="px-3 py-2 border-b border-theme-default shrink-0">
            <h3 className="text-theme-muted text-xs font-medium uppercase tracking-wide">
              Timeline
            </h3>
          </header>

          <div className="flex-1 min-h-0">
            <HistoryTimeline
              selectedHash={selectedTimelineCommitHash}
              onSelectCommit={handleTimelineSelectCommit}
            />
          </div>
        </section>
      </div>

      {sharedModals}
    </>
  );
}

export default memo(ExplorerView);
