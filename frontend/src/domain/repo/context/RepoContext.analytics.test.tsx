import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const {
  analyticsMocks,
  DetectRepo,
  Status,
  CommitAll,
  GetCommitGraph,
  ListMergeReviewFiles,
  DiffMergeReviewFileRaw,
  Branches,
  GetMergeState,
  GetConflictedFiles,
  IsGHInstalled,
  IsLFSInstalled,
  GetGHVersion,
  GetGitVersion,
  AuthStatus,
  InitializeLFS,
  GetPresetPatterns,
  TrackPattern,
  SyncWithProgress,
  Pull,
  EnsurePortableToolchainIfNeeded,
  GetAppSettings,
  SaveAppSettings,
  EnsureIdentity,
  GetUserProfile,
  SetUserProfile,
  WatchDirectory,
  StopWatching,
  GetRemotes,
  GetSettings,
  StartBackgroundTasks,
  StopBackgroundTasks,
  EnsureControlZebraDir,
  IsDefaultBranchSyncEligible,
} = vi.hoisted(() => ({
  analyticsMocks: {
    trackRepoOpened: vi.fn(),
    trackRepoClosed: vi.fn(),
    trackRepoInitialized: vi.fn(),
    trackCommitCreated: vi.fn(),
    trackCommitBranchAndSave: vi.fn(),
    trackCommitUndone: vi.fn(),
    trackChangesDiscarded: vi.fn(),
    trackSyncStarted: vi.fn(),
    trackSyncCompleted: vi.fn(),
    trackSyncFailed: vi.fn(),
    trackBranchSwitched: vi.fn(),
    trackBranchCreated: vi.fn(),
    trackConflictDetected: vi.fn(),
    trackConflictResolved: vi.fn(),
    trackMergeCompleted: vi.fn(),
    trackMergeAborted: vi.fn(),
    trackErrorShown: vi.fn(),
    trackProjectSetupStarted: vi.fn(),
    trackProjectSetupCompleted: vi.fn(),
    trackProjectPublishAttempted: vi.fn(),
    trackProjectPublishFailed: vi.fn(),
    trackProjectPublishCompleted: vi.fn(),
  },
  DetectRepo: vi.fn(),
  Status: vi.fn(),
  CommitAll: vi.fn(),
  GetCommitGraph: vi.fn(),
  ListMergeReviewFiles: vi.fn(),
  DiffMergeReviewFileRaw: vi.fn(),
  Branches: vi.fn(),
  GetMergeState: vi.fn(),
  GetConflictedFiles: vi.fn(),
  IsGHInstalled: vi.fn(),
  IsLFSInstalled: vi.fn(),
  GetGHVersion: vi.fn(),
  GetGitVersion: vi.fn(),
  AuthStatus: vi.fn(),
  InitializeLFS: vi.fn(),
  GetPresetPatterns: vi.fn(),
  TrackPattern: vi.fn(),
  SyncWithProgress: vi.fn(),
  Pull: vi.fn(),
  EnsurePortableToolchainIfNeeded: vi.fn(),
  GetAppSettings: vi.fn(),
  SaveAppSettings: vi.fn(),
  EnsureIdentity: vi.fn(),
  GetUserProfile: vi.fn(),
  SetUserProfile: vi.fn(),
  WatchDirectory: vi.fn(),
  StopWatching: vi.fn(),
  GetRemotes: vi.fn(),
  GetSettings: vi.fn(),
  StartBackgroundTasks: vi.fn(),
  StopBackgroundTasks: vi.fn(),
  EnsureControlZebraDir: vi.fn(),
  IsDefaultBranchSyncEligible: vi.fn(),
}));

vi.mock('../../auth/context/AuthContext', () => ({
  useAuth: () => ({
    userName: 'Test User',
    userEmail: 'test@controlzebra.com',
  }),
}));

vi.mock('../../analytics/analytics', () => analyticsMocks);

vi.mock('../../../../bindings/controlzebra/services/gitservice', () => ({
  DetectRepo,
  Status,
  CommitAll,
  GetCommitGraph,
  ShowCommit: vi.fn(),
  DiffWorkingRaw: vi.fn(),
  DiffCommitFileRaw: vi.fn(),
  ListMergeReviewFiles,
  DiffMergeReviewFileRaw,
  Branches,
  CheckoutBranch: vi.fn(),
  CreateBranchAndCheckout: vi.fn(),
  StashAndSwitchBranch: vi.fn(),
  ResetSoftHead: vi.fn(),
  ResetHardHead: vi.fn(),
  DiscardAll: vi.fn(),
  DiscardFile: vi.fn(),
  InitRepo: vi.fn(),
  CheckBranchConflicts: vi.fn(),
  GetParentBranch: vi.fn(),
  GetMergeState,
  GetConflictedFiles,
  StartMergeWithOptions: vi.fn(),
  EnsureChangeRequestSnapshotsLocal: vi.fn(),
  EnsureChangeRequestFileContent: vi.fn(),
  ClearChangeRequestSnapshot: vi.fn(),
  ClearChangeRequestSnapshots: vi.fn(),
  ResolveConflictKeepOurs: vi.fn(),
  ResolveConflictKeepTheirs: vi.fn(),
  ResolveConflictKeepBoth: vi.fn(),
  AbortMerge: vi.fn(),
  CompleteMerge: vi.fn(),
  GetConflictSidesInfo: vi.fn(),
  AbortCurrentOperation: vi.fn(),
  AbortCherryPick: vi.fn(),
  ContinueCherryPick: vi.fn(),
  SkipCherryPickCommit: vi.fn(),
  AbortRevert: vi.fn(),
  ContinueRevert: vi.fn(),
  SkipRevertCommit: vi.fn(),
  RevertCommit: vi.fn(),
  AbortBisect: vi.fn(),
  GetBisectState: vi.fn(),
  AbortAM: vi.fn(),
  SkipAMPatch: vi.fn(),
  CreateBranchFromDetached: vi.fn(),
  RemoveAllStaleLocks: vi.fn(),
  GetGitVersion,
  Pull,
}));

vi.mock('../../../../bindings/controlzebra/services/githubservice', () => ({
  IsGHInstalled,
  GetGHVersion,
  AuthLogin: vi.fn(),
  AuthLoginStart: vi.fn(),
  AuthLoginComplete: vi.fn(),
  AuthLoginCancel: vi.fn(),
  AuthLogout: vi.fn(),
  AuthStatus,
  RepoList: vi.fn(),
  RepoClone: vi.fn(),
  RepoCreateFromLocal: vi.fn(),
  ListUserOrganizations: vi.fn(),
}));

vi.mock('../../../../bindings/controlzebra/services/lfsservice', () => ({
  InitializeLFS,
  IsLFSInstalled,
  GetPresetPatterns,
  TrackPattern,
}));

vi.mock('../../../../bindings/controlzebra/services/localbinservice', () => ({
  EnsurePortableToolchainIfNeeded,
}));

vi.mock('../../../../bindings/controlzebra/services/progressservice', () => ({
  SyncWithProgress,
}));

vi.mock('../../../../bindings/controlzebra/services/integrationsessionservice', () => ({
  IsDefaultBranchSyncEligible,
}));

vi.mock('../../../../bindings/controlzebra/services/settingsservice', () => ({
  GetAppSettings,
  SaveAppSettings,
  EnsureIdentity,
  GetUserProfile,
  SetUserProfile,
}));

vi.mock('../../../../bindings/controlzebra/services/filewatcherservice', () => ({
  WatchDirectory,
  StopWatching,
}));

vi.mock('../../../../bindings/controlzebra/services/repositorysettingsservice', () => ({
  GetRemotes,
  WriteRepoLocalConfig: vi.fn(),
  EnsureControlZebraDir,
  GetSettings,
  StartBackgroundTasks,
  StopBackgroundTasks,
  ApplyGitignoreTemplate: vi.fn(),
}));

vi.mock('../../../../bindings/controlzebra/services/filesystemservice', () => ({
  RevealInFinder: vi.fn(),
  OpenInTerminal: vi.fn(),
}));

vi.mock('../../../shared/utils/recentFolders', () => ({
  addRecentFolder: vi.fn(),
}));

vi.mock('../../../viewers/registry/viewer-cache', () => ({
  clearViewerCache: vi.fn(),
}));

vi.mock('../../../viewers/components/file/l5x', () => ({
  clearAllTabStates: vi.fn(),
}));

vi.mock('@wailsio/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wailsio/runtime')>();
  return {
    ...actual,
    Events: {
      On: vi.fn(() => () => {}),
    },
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { RepoProvider, useRepo } from './RepoContext';

function CaptureRepoApi({ onReady }: { onReady: (api: ReturnType<typeof useRepo>) => void }): null {
  const api = useRepo();
  onReady(api);
  return null;
}

function renderHarness(onReady: (api: ReturnType<typeof useRepo>) => void): void {
  const Wrapper = ({ children }: { children: ReactNode }) => <RepoProvider>{children}</RepoProvider>;
  render(
    <Wrapper>
      <CaptureRepoApi onReady={onReady} />
    </Wrapper>,
  );
}

describe('RepoContext analytics validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    DetectRepo.mockResolvedValue({ path: '/tmp/repo', isRepo: true, branch: 'main', hasError: false });
    Status.mockResolvedValue({
      branch: 'main',
      ahead: 0,
      behind: 0,
      changedFiles: [],
      hasChanges: false,
      hasUpstream: true,
      totalLocalCommits: 0,
      hasError: false,
    });
    CommitAll.mockResolvedValue({ success: true, message: 'ok' });
    GetCommitGraph.mockResolvedValue({ hasError: false, commits: [] });
    ListMergeReviewFiles.mockResolvedValue([]);
    DiffMergeReviewFileRaw.mockResolvedValue(null);
    Branches.mockResolvedValue({ hasError: false, current: 'main', local: [], remote: [] });
    GetMergeState.mockResolvedValue({ inMerge: false, inRebase: false, hasConflicts: false });
    GetConflictedFiles.mockResolvedValue([]);

    IsGHInstalled.mockResolvedValue(false);
    IsLFSInstalled.mockResolvedValue(true);
    GetGHVersion.mockResolvedValue('');
    GetGitVersion.mockResolvedValue('2.45.0');
    AuthStatus.mockResolvedValue(null);

    InitializeLFS.mockResolvedValue({ success: true });
    GetPresetPatterns.mockResolvedValue([]);
    TrackPattern.mockResolvedValue({ success: true });

    SyncWithProgress.mockResolvedValue({ success: true, outcome: 'synced', message: 'Synced successfully' });
    IsDefaultBranchSyncEligible.mockResolvedValue(false);
    Pull.mockResolvedValue({ success: true, message: 'Already up to date' });
    EnsurePortableToolchainIfNeeded.mockResolvedValue({ success: true });

    GetAppSettings.mockResolvedValue({ lastRepoPath: '' });
    SaveAppSettings.mockResolvedValue({ success: true });
    EnsureIdentity.mockResolvedValue({ wasAutoSet: false, name: '', email: '' });
    GetUserProfile.mockResolvedValue({ name: 'Test User', email: 'test@controlzebra.com' });
    SetUserProfile.mockResolvedValue({ success: true, message: 'saved' });

    WatchDirectory.mockResolvedValue({ success: true });
    StopWatching.mockResolvedValue({ success: true });

    GetRemotes.mockResolvedValue(['origin']);
    GetSettings.mockResolvedValue({ fetchSettings: { pruneStaleBranches: true, fetchTags: true } });
    StartBackgroundTasks.mockResolvedValue({ success: true });
    StopBackgroundTasks.mockResolvedValue({ success: true });
    EnsureControlZebraDir.mockResolvedValue({ success: true });
  });

  it('fires project_setup_started once per startTracking() call', async () => {
    let api: ReturnType<typeof useRepo> | null = null;
    renderHarness((value) => {
      api = value;
    });

    await waitFor(() => expect(api).not.toBeNull());

    DetectRepo.mockResolvedValueOnce({ path: '/tmp/non-git', isRepo: false, branch: '', hasError: false });
    await act(async () => {
      await api!.openRepo('/tmp/non-git');
    });

    await act(async () => {
      await api!.startTracking('status_bar_nudge');
    });

    expect(analyticsMocks.trackProjectSetupStarted).toHaveBeenCalledTimes(1);
  });

  it('emits repo_opened with has_remote=true when remote exists', async () => {
    let api: ReturnType<typeof useRepo> | null = null;
    renderHarness((value) => {
      api = value;
    });

    await waitFor(() => expect(api).not.toBeNull());

    await act(async () => {
      await api!.openRepo('/tmp/repo-with-remote');
    });

    expect(analyticsMocks.trackRepoOpened).toHaveBeenCalledWith(
      expect.objectContaining({ hasRemote: true }),
    );
  });

  it('emits repo_opened with has_remote=null when remote detection fails', async () => {
    let api: ReturnType<typeof useRepo> | null = null;
    renderHarness((value) => {
      api = value;
    });

    await waitFor(() => expect(api).not.toBeNull());
    GetRemotes.mockRejectedValueOnce(new Error('remotes unavailable'));

    await act(async () => {
      await api!.openRepo('/tmp/repo-remote-error');
    });

    expect(analyticsMocks.trackRepoOpened).toHaveBeenCalledWith(
      expect.objectContaining({ hasRemote: null }),
    );
  });

  it('emits sync_completed with non-zero duration_ms', async () => {
    let api: ReturnType<typeof useRepo> | null = null;
    renderHarness((value) => {
      api = value;
    });

    await waitFor(() => expect(api).not.toBeNull());

    await act(async () => {
      await api!.openRepo('/tmp/repo-sync');
    });

    await act(async () => {
      await api!.syncRepo();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      api!.handleProgressComplete(true);
    });

    expect(analyticsMocks.trackSyncCompleted).toHaveBeenCalled();
    const calls = analyticsMocks.trackSyncCompleted.mock.calls;
    const args = calls[calls.length - 1]?.[0] as { durationMs: number };
    expect(args.durationMs).toBeGreaterThan(0);
  });

  it('requires confirmation before syncing the actual default branch', async () => {
    let api: ReturnType<typeof useRepo> | null = null;
    renderHarness((value) => {
      api = value;
    });
    await waitFor(() => expect(api).not.toBeNull());

    await act(async () => {
      await api!.openRepo('/tmp/default-sync');
    });
    IsDefaultBranchSyncEligible.mockResolvedValueOnce(true);

    let syncPromise: Promise<boolean> | null = null;
    await act(async () => {
      syncPromise = api!.syncRepo();
      await Promise.resolve();
    });

    expect(api!.defaultBranchSyncPrompt).toEqual({ isOpen: true, branch: 'main' });
    expect(SyncWithProgress).not.toHaveBeenCalled();

    await act(async () => {
      api!.confirmDefaultBranchSync();
      await syncPromise;
    });
    expect(SyncWithProgress).toHaveBeenCalledTimes(1);
  });

  it('closes Sync progress without success or failure analytics when decisions are needed', async () => {
    let api: ReturnType<typeof useRepo> | null = null;
    renderHarness((value) => {
      api = value;
    });
    await waitFor(() => expect(api).not.toBeNull());

    await act(async () => {
      await api!.openRepo('/tmp/default-conflict');
    });
    IsDefaultBranchSyncEligible.mockResolvedValueOnce(true);
    SyncWithProgress.mockResolvedValueOnce({
      success: false,
      outcome: 'needs-decisions',
      message: 'Files need decisions',
    });

    let syncPromise: Promise<boolean> | null = null;
    await act(async () => {
      syncPromise = api!.syncRepo();
      await Promise.resolve();
      api!.confirmDefaultBranchSync();
      await syncPromise;
    });

    expect(api!.progressModal.isOpen).toBe(false);
    expect(analyticsMocks.trackSyncCompleted).not.toHaveBeenCalled();
    expect(analyticsMocks.trackSyncFailed).not.toHaveBeenCalled();
  });

  it('preserves merge review target and source refs from the backend payload', async () => {
    let api: ReturnType<typeof useRepo> | null = null;
    renderHarness((value) => {
      api = value;
    });

    await waitFor(() => expect(api).not.toBeNull());

    await act(async () => {
      await api!.openRepo('/tmp/repo-merge-review');
    });

    DiffMergeReviewFileRaw.mockResolvedValueOnce({
      path: 'Programs/Mixer.L5X',
      oldPath: 'Programs/Mixer.L5X',
      status: 'modified',
      binary: false,
      rawDiff: '@@ -1 +1 @@',
      hasError: false,
      targetRef: 'origin/main',
      sourceRef: 'feature/plc-update',
    });

    let diffResult = null;
    await act(async () => {
      diffResult = await api!.loadMergeReviewFileDiff('Programs/Mixer.L5X', 'main', 'feature/plc-update');
    });

    expect(DiffMergeReviewFileRaw).toHaveBeenCalledWith(
      '/tmp/repo-merge-review',
      'main',
      'feature/plc-update',
      'Programs/Mixer.L5X',
    );
    expect(diffResult).toEqual(expect.objectContaining({
      targetRef: 'origin/main',
      sourceRef: 'feature/plc-update',
    }));
  });

});
