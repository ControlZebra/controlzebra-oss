/**
 * ExplorerView - Sidebar view showing action panels based on repo state.
 * 
 * Displays contextual panels based on repo state:
 * - No folder: Prompt to open folder
 * - Not a git repo: Initialize option
 * - Has changes: Commit form with changed files
 * - Needs push: Sync/publish prompt with GitHub integration
 * - Feature branch synced: Merge request option
 * - Main branch synced: All caught up
 */
import { memo, useState, useCallback, useMemo, type CSSProperties } from 'react';
import { FolderOpen } from 'lucide-react';
import { MAIN_BRANCHES } from '../../../constants';
import { ICON_STYLES } from '../../../lib/gitHelpers';
import { useRepo, type FileStatus } from '../../../context';
import { OpenFolderDialog } from '../../../../bindings/controlzebra/services/filedialogservice';
import { Button } from '../../ui';
import { SidebarCommitPanel, ExplorerStatusPanel } from '../sidebar-panels';
import { GitHubDeviceFlowModal } from '../../common';

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
    // Remote state
    hasRemote,
    refreshRemotes,
    // GitHub state
    ghInstalled,
    ghAuthStatus,
    startGitHubLogin,
    publishToGitHub,
    loadUserOrganizations,
  } = useRepo();
  
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
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
    if (!repoInfo?.isRepo) return { type: 'noRepo', folderName: repoPath.split('/').pop() || '' };
    
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

  // No folder open - show open folder prompt
  if (panelState.type === 'noFolder') {
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
          <FolderOpen style={ICON_STYLES.sm as CSSProperties} />
          Open Folder
        </Button>
        <p className="text-theme-muted text-xs mt-3">
          <kbd className="px-1 py-0.5 rounded bg-theme-muted text-theme-secondary text-xs">⌘O</kbd>
        </p>
      </div>
    );
  }

  // Has uncommitted changes - show commit panel
  if (panelState.type === 'hasChanges') {
    return (
      <SidebarCommitPanel
        changedFiles={panelState.changedFiles}
        onCommit={commitChanges}
        onBranchAndCommit={branchAndCommit}
        onRewind={handleRewind}
        currentBranch={panelState.branchName}
        repoPath={repoPath || undefined}
        isCommitting={isCommitting}
        isRewinding={isRewinding}
      />
    );
  }

  // All other states use the unified status panel
  return (
    <>
      <ExplorerStatusPanel
        status={panelState.type}
        folderName={panelState.type === 'noRepo' ? panelState.folderName : undefined}
        branchName={panelState.type === 'featureBranch' ? panelState.branchName : undefined}
        repoPath={repoPath || undefined}
        ahead={panelState.type === 'push' ? panelState.ahead : undefined}
        hasUpstream={panelState.type === 'push' ? panelState.hasUpstream : undefined}
        hasRemote={hasRemote}
        totalLocalCommits={panelState.type === 'push' ? panelState.totalLocalCommits : undefined}
        onInitialize={initializeGitRepo}
        onSync={syncRepo}
        onConnectGitHub={handleConnectGitHub}
        onPublishToGitHub={handlePublishToGitHub}
        onLoadOrganizations={loadUserOrganizations}
        isLoading={isLoading}
        isSyncing={isSyncing}
        isPublishing={isPublishing}
        ghInstalled={ghInstalled}
        ghAuthStatus={ghAuthStatus}
      />
      
      {/* GitHub Device Flow Modal */}
      <GitHubDeviceFlowModal
        isOpen={deviceFlow.isOpen}
        userCode={deviceFlow.userCode}
        verificationUrl={deviceFlow.verificationUrl}
        onComplete={handleDeviceFlowComplete}
        onCancel={handleDeviceFlowCancel}
      />
    </>
  );
}

export default memo(ExplorerView);
