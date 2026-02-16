/**
 * RepoContext - Repository state management for Git operations.
 * 
 * Manages:
 * - Repository path, info, and status
 * - Commit history and selected commit details
 * - File diffs for working tree and commits
 * - Branch list and operations
 * - Loading states for async operations
 * - User feedback messages
 * - File selection state
 * - Automatic status polling
 */
import { 
  createContext, 
  useContext, 
  useState, 
  useCallback, 
  useMemo, 
  useEffect, 
  useRef 
} from 'react';
import { toast } from 'sonner';
import { 
  DetectRepo, 
  Status, 
  CommitAll, 
  GetCommitGraph,
  ShowCommit,
  DiffWorkingRaw,
  DiffCommitFileRaw,
  Branches,
  CheckoutBranch,
  CreateBranchAndCheckout,
  RenameBranch,
  DeleteBranch,
  StashAndSwitchBranch,
  ResetSoftHead,
  ResetHardHead,
  DiscardAll,
  DiscardFile,
  InitRepo,
  CheckBranchConflicts,
  GetParentBranch,
  GetMergeState,
  GetConflictedFiles,
  StartMergeWithOptions,
  ResolveConflictKeepOurs,
  ResolveConflictKeepTheirs,
  ResolveConflictKeepBoth,
  AbortMerge,
  CompleteMerge,
  GetConflictSidesInfo,
  AbortCurrentOperation,
  AbortCherryPick,
  ContinueCherryPick,
  SkipCherryPickCommit,
  AbortRevert,
  ContinueRevert,
  SkipRevertCommit,
  RevertCommit,
  AbortBisect,
  GetBisectState,
  AbortAM,
  SkipAMPatch,
  CreateBranchFromDetached,
  RemoveAllStaleLocks,
  GetGitVersion,
} from '../../bindings/controlzebra/services/gitservice';
import {
  IsGHInstalled,
  GetGHVersion,
  AuthLogin,
  AuthLoginStart,
  AuthLoginComplete,
  AuthLoginCancel,
  AuthLogout,
  AuthStatus,
  RepoList,
  RepoClone,
  RepoCreateFromLocal,
  ListUserOrganizations,
} from '../../bindings/controlzebra/services/githubservice';
import {
  InitializeLFS,
  IsLFSInstalled,
  GetPresetPatterns,
  TrackPattern,
} from '../../bindings/controlzebra/services/lfsservice';
import {
  EnsurePortableToolchainIfNeeded,
} from '../../bindings/controlzebra/services/localbinservice';
import { SyncWithProgress } from '../../bindings/controlzebra/services/progressservice';
import { GetAppSettings, SaveAppSettings, EnsureIdentity } from '../../bindings/controlzebra/services/settingsservice';
import { useAuth } from './AuthContext';
import { WatchDirectory, StopWatching } from '../../bindings/controlzebra/services/filewatcherservice';
import { GetRemotes, WriteRepoLocalConfig, EnsureControlZebraDir, GetSettings, StartBackgroundTasks, StopBackgroundTasks, ApplyGitignoreTemplate } from '../../bindings/controlzebra/services/repositorysettingsservice';
import { RevealInFinder, OpenInTerminal } from '../../bindings/controlzebra/services/filesystemservice';
import { Events } from '@wailsio/runtime';
import { addRecentFolder } from '../lib/recentFolders';
import { clearViewerCache } from '../lib/viewer-cache';
import { clearAllTabStates } from '../components/viewers/l5x';
import {
  trackRepoOpened,
  trackRepoClosed,
  trackRepoInitialized,
  trackCommitCreated,
  trackCommitBranchAndSave,
  trackCommitUndone,
  trackChangesDiscarded,
  trackSyncStarted,
  trackSyncCompleted,
  trackSyncFailed,
  trackBranchSwitched,
  trackBranchCreated,
  trackConflictDetected,
  trackConflictResolved,
  trackMergeCompleted,
  trackMergeAborted,
  trackErrorShown,
  trackProjectSetupStarted,
  trackProjectSetupCompleted,
  trackProjectPublishAttempted,
  trackProjectPublishFailed,
  trackProjectPublishCompleted,
} from '../lib/analytics';

import type {
  RepoContextValue,
  RepoProviderProps,
  RepoInfo,
  RepoStatus,
  GraphCommit,
  CommitDetail,
  BranchList,
  FileDiff,
  ConflictedFile,
  BranchConflictCheckResult,
  MergeState,
  DetectedParentBranch,
  ConflictSidesInfo,
  ProgressModalState,
  FileResolutionsMap,
  ResolutionStrategy,
  MessageType,
  MergeOptions,
  StartMergeResult,
  ParentBranchResult,
  BisectState,
  GitHubAuthStatus,
  GitHubAuthResult,
  GitHubDeviceFlowResult,
  GitHubRepo,
  GitHubRepoListResult,
  GitHubCloneResult,
  GitHubRepoCreateResult,
  GitHubOrganizationsResult,
  CreateProjectOptions,
  CreateProjectResult,
} from './RepoContext.types';

// Polling interval for status updates (in ms)
const STATUS_POLL_INTERVAL = 30000;

// Global UI events consumed by LayoutContext for explorer tab cleanup
const CLOSE_ALL_PREVIEW_TABS_EVENT = 'cz:explorer-close-all-previews';
const CLOSE_FILE_PREVIEW_TABS_EVENT = 'cz:explorer-close-file-previews';
const REPO_OPEN_SUCCESS_EVENT = 'cz:repo-open-success';

// Create context with null default
const RepoContext = createContext<RepoContextValue | null>(null);

export function RepoProvider({ children }: RepoProviderProps) {
  const { userName, userEmail } = useAuth();

  // ===== Repository State =====
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [repoStatus, setRepoStatus] = useState<RepoStatus | null>(null);
  const [graphCommits, setGraphCommits] = useState<GraphCommit[]>([]);
  const [branches, setBranches] = useState<BranchList | null>(null);
  
  // ===== Selection State (v2) =====
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<CommitDetail | null>(null);
  const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(null);
  const [currentDiff, setCurrentDiff] = useState<FileDiff | null>(null);
  
  // ===== Conflict State (v2 Merge Changes) =====
  const [conflictedFiles, setConflictedFiles] = useState<ConflictedFile[]>([]);
  const [selectedConflictFile, setSelectedConflictFile] = useState<string | null>(null);
  const [conflictCheckResult, setConflictCheckResult] = useState<BranchConflictCheckResult | null>(null);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [detectedParentBranch, setDetectedParentBranch] = useState<DetectedParentBranch | null>(null);
  const [fileResolutions, setFileResolutions] = useState<FileResolutionsMap>({});
  const [mergeState, setMergeState] = useState<MergeState | null>(null);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const [conflictSidesInfo, setConflictSidesInfo] = useState<ConflictSidesInfo | null>(null);
  const [isSquashMerge, setIsSquashMerge] = useState(true);
  
  // ===== Loading States =====
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [nonGitFolderPromptPath, setNonGitFolderPromptPath] = useState<string | null>(null);
  
  // ===== Repository Settings State =====
  const [repoSettings, setRepoSettings] = useState<{
    fetchPrune: boolean;
    fetchTags: boolean;
  } | null>(null);

  // ===== Remote State =====
  const [hasRemote, setHasRemote] = useState(false);
  
  // ===== GitHub State (Phase 2) =====
  const [gitInstalled, setGitInstalled] = useState(true);
  const [lfsInstalled, setLfsInstalled] = useState(true);
  const [isInstallingPackages, setIsInstallingPackages] = useState(false);
  const [packagesInstallMessage, setPackagesInstallMessage] = useState('');
  const [packagesInstallPercent, setPackagesInstallPercent] = useState<number | null>(null);

  const [ghInstalled, setGhInstalled] = useState(false);
  const [ghVersion, setGhVersion] = useState('');
  const [ghAuthStatus, setGhAuthStatus] = useState<GitHubAuthStatus | null>(null);
  const [isCheckingGhAuth, setIsCheckingGhAuth] = useState(false);
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingGhRepos, setIsLoadingGhRepos] = useState(false);
  
  // ===== Progress Modal State =====
  const [progressModal, setProgressModal] = useState<ProgressModalState>({
    isOpen: false,
    operationId: null,
    title: '',
  });
  
  // ===== Refs =====
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const operationIdCounter = useRef(0);
  const repoOpenTimeRef = useRef<number>(0);
  const syncStartTimeRef = useRef<number | null>(null);

  const isWindowsPlatform = useCallback((): boolean => {
    return navigator.userAgent.toLowerCase().includes('win');
  }, []);

  // ===== Core Handlers =====

  // Show a toast notification using sonner
  const showMessage = useCallback((type: MessageType, text: string, duration = 5000) => {
    const options = { duration };
    
    switch (type) {
      case 'success':
        toast.success(text, options);
        break;
      case 'error':
        toast.error(text, options);
        break;
      case 'info':
      default:
        toast.info(text, options);
        break;
    }
  }, []);

  const closeAllExplorerPreviews = useCallback(() => {
    window.dispatchEvent(new CustomEvent(CLOSE_ALL_PREVIEW_TABS_EVENT));
  }, []);

  const closeExplorerPreviewsForFile = useCallback((relativePath: string) => {
    if (!relativePath) return;
    window.dispatchEvent(new CustomEvent(CLOSE_FILE_PREVIEW_TABS_EVENT, {
      detail: { relativePath },
    }));
  }, []);

  const refreshToolchainStatus = useCallback(async (): Promise<{ hasGit: boolean; hasGh: boolean; hasLfs: boolean }> => {
    let hasGit = false;
    let hasGh = false;
    let hasLfs = false;

    try {
      const gitVersion = await GetGitVersion();
      hasGit = !!gitVersion;
    } catch {
      hasGit = false;
    }

    try {
      hasGh = await IsGHInstalled();
    } catch {
      hasGh = false;
    }

    try {
      hasLfs = await IsLFSInstalled();
    } catch {
      hasLfs = false;
    }

    setGitInstalled(hasGit);
    setGhInstalled(hasGh);
    setLfsInstalled(hasLfs);

    return { hasGit, hasGh, hasLfs };
  }, []);

  const installRequiredPackages = useCallback(async (): Promise<boolean> => {
    if (!isWindowsPlatform()) {
      showMessage('error', 'Required packages are missing. Please install Git, Git LFS, and GitHub CLI manually.');
      return false;
    }

    setIsInstallingPackages(true);
    setPackagesInstallMessage('Additional packages are being downloaded...');
    setPackagesInstallPercent(null);

    try {
      const result = await EnsurePortableToolchainIfNeeded();
      if (!result.success) {
        showMessage('error', result.error || result.message || 'Failed to install required packages');
        return false;
      }

      await refreshToolchainStatus();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to install required packages: ${error.message || err}`);
      return false;
    } finally {
      setIsInstallingPackages(false);
    }
  }, [isWindowsPlatform, refreshToolchainStatus, showMessage]);

  // Fetch repo status from Git
  const refreshStatus = useCallback(async (): Promise<void> => {
    if (!repoPath) return;
    
    try {
      const status = await Status(repoPath);
      if (status.hasError) {
        console.error('Status error:', status.error);
        return;
      }
      setRepoStatus(status as RepoStatus);
      
      // Update repoInfo.branch if it changed
      if (status.branch && status.branch !== repoInfo?.branch) {
        setRepoInfo(prev => prev ? { ...prev, branch: status.branch } : prev);
      }
    } catch (err) {
      console.error('Failed to refresh status:', err);
    }
  }, [repoPath, repoInfo?.branch]);

  // Fetch commits with graph data
  const refreshCommits = useCallback(async (): Promise<void> => {
    if (!repoPath) return;
    
    try {
      const result = await GetCommitGraph(repoPath, 50);
      if (result.hasError) {
        console.error('Failed to fetch graph commits:', result.error);
        return;
      }
      setGraphCommits((result.commits || []) as GraphCommit[]);
    } catch (err) {
      console.error('Failed to fetch graph commits:', err);
    }
  }, [repoPath]);

  // Refresh all repository data
  const refreshAll = useCallback(async (): Promise<void> => {
    await Promise.all([refreshStatus(), refreshCommits()]);
  }, [refreshStatus, refreshCommits]);

  // Check if repository has remotes configured
  const refreshRemotes = useCallback(async (): Promise<boolean> => {
    if (!repoPath) {
      setHasRemote(false);
      return false;
    }
    
    try {
      const remotes = await GetRemotes(repoPath);
      const hasRemoteConfigured = remotes && remotes.length > 0;
      setHasRemote(hasRemoteConfigured);
      return hasRemoteConfigured;
    } catch (err) {
      console.error('Failed to check remotes:', err);
      setHasRemote(false);
      return false;
    }
  }, [repoPath]);

  // Refresh repository-level settings (protected branches, fetch options)
  const refreshRepoSettings = useCallback(async (pathOverride?: string): Promise<void> => {
    const targetPath = pathOverride || repoPath;
    if (!targetPath) return;

    try {
      const settings = await GetSettings(targetPath);
      setRepoSettings({
        fetchPrune: settings.fetchSettings?.pruneStaleBranches ?? true,
        fetchTags: settings.fetchSettings?.fetchTags ?? true,
      });
    } catch (err) {
      console.warn('Failed to load repo settings, using defaults:', err);
      setRepoSettings({
        fetchPrune: true,
        fetchTags: true,
      });
    }
  }, [repoPath]);

  // ===== Repo Operations =====

  // Open a folder by path
  const openRepo = useCallback(async (path: string): Promise<boolean> => {
    if (isLoading) return false;
    if (path === repoPath) return true;
    
    setIsLoading(true);
    setSelectedFileIndex(null);
    
    try {
      const info = await DetectRepo(path);
      let hasRemoteConfigured: boolean | null = info.isRepo ? null : false;
      
      setRepoPath(path);
      setRepoInfo(info as RepoInfo);
      addRecentFolder(path);
      repoOpenTimeRef.current = Date.now();
      
      try {
        const currentSettings = await GetAppSettings();
        await SaveAppSettings({ ...currentSettings, lastRepoPath: path });
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
      
      if (info.isRepo) {
        // Check if repo has remotes configured
        try {
          const remotes = await GetRemotes(path);
          hasRemoteConfigured = !!(remotes && remotes.length > 0);
          setHasRemote(hasRemoteConfigured);
        } catch (err) {
          console.error('Failed to check remotes:', err);
          hasRemoteConfigured = null;
          setHasRemote(false);
        }
        
        try {
          const state = await GetMergeState(path);
          if (state.inMerge || state.inRebase) {
            setMergeState(state as MergeState);
            
            if (state.hasConflicts) {
              const conflicts = await GetConflictedFiles(path);
              setConflictedFiles((conflicts || []) as ConflictedFile[]);
            }
            
            const opType = state.inRebase ? 'rebase' : 'merge';
            showMessage('warning', `Repository has an interrupted ${opType}. Use "Combine Versions" to resolve or abort.`);
          }
        } catch (err) {
          console.error('Failed to check merge state:', err);
        }
      } else {
        setHasRemote(false);
      }

      // Track repo opened event after remote detection to ensure payload correctness.
      trackRepoOpened({
        isGitRepo: info.isRepo,
        hasRemote: hasRemoteConfigured,
        branchName: info.branch || 'unknown',
      });
      
      // Ensure git identity is configured (auto-set from Supabase login if missing)
      if (info.isRepo) {
        try {
          const identity = await EnsureIdentity(path, userName || '', userEmail || '');
          if (identity.wasAutoSet) {
            console.info('Git identity auto-configured from ControlZebra account:', identity.name, identity.email);
          }
        } catch (err) {
          console.warn('Failed to ensure git identity:', err);
        }
      }
      
      try {
        await WatchDirectory(path);
      } catch (err) {
        console.error('Failed to start file watcher:', err);
      }
      
      // Load repository settings (protected branches, fetch options, etc.)
      if (info.isRepo) {
        await refreshRepoSettings(path);

        // Start background tasks (auto-sync, LFS auto-download, auto-optimization)
        try {
          await StartBackgroundTasks(path);
        } catch (err) {
          console.warn('Failed to start background tasks:', err);
        }
      }

      window.dispatchEvent(new CustomEvent(REPO_OPEN_SUCCESS_EVENT, {
        detail: { path },
      }));
      
      setIsLoading(false);
      return true;
    } catch (err) {
      const error = err as Error;
      trackErrorShown({
        errorContext: 'repo_open',
        actionAttempted: 'open_repo',
      });
      showMessage('error', `Failed to open folder: ${error.message || err}`);
      setIsLoading(false);
      return false;
    }
  }, [isLoading, repoPath, userName, userEmail, showMessage, refreshRepoSettings]);

  /**
   * Open folder entrypoint for user-driven folder selection.
   * If the selected folder is not initialized as a git repository, show
   * a modal prompt instead of opening it directly.
   */
  const openFolder = useCallback(async (path: string): Promise<boolean> => {
    try {
      const info = await DetectRepo(path);

      if (!info.hasError && !info.isRepo) {
        setNonGitFolderPromptPath(path);
        return false;
      }
    } catch (err) {
      console.warn('Failed preflight repo detection, falling back to openRepo:', err);
    }

    setNonGitFolderPromptPath(null);
    return openRepo(path);
  }, [openRepo]);

  const dismissNonGitFolderPrompt = useCallback((): void => {
    setNonGitFolderPromptPath(null);
  }, []);

  /**
   * Start tracking a folder with version control.
   * This is the main entry point for the "Start Tracking" button.
   *
   * Process:
   * 1. Initialize git in the directory
   * 2. Initialize LFS & add all known LFS attributes by default
   * 3. Add .gitignore for .env by default
   * 4. Ensure git identity is set (auto-set from Supabase login if missing)
   */
  const startTracking = useCallback(async (source: 'status_bar_nudge' | 'setup_banner' = 'setup_banner'): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No folder open');
      return false;
    }

    if (!gitInstalled || !lfsInstalled) {
      const installed = await installRequiredPackages();
      if (!installed) {
        return false;
      }
    }
    
    if (repoInfo?.isRepo) {
      showMessage('info', 'Folder is already being tracked');
      return true;
    }
    
    setIsLoading(true);
    const setupStartTime = Date.now();

    // Determine initial project state for analytics
    const fileCount = repoStatus?.changedFiles?.length || 0;
    const projectState = fileCount > 0 ? 'has-files-untracked' : 'empty-untracked';

    // Track setup started
    trackProjectSetupStarted({
      projectState,
      source,
      hasFiles: fileCount > 0,
    });
    
    try {
      // Step 1: Initialize git
      const initResult = await InitRepo(repoPath);
      if (!initResult.success) {
        showMessage('error', initResult.error || 'Failed to initialize version control');
        setIsLoading(false);
        return false;
      }
      
      // Step 2: Initialize LFS and add all preset patterns
      try {
        await InitializeLFS(repoPath);
        
        // Get and apply all preset LFS patterns
        const presetPatterns = await GetPresetPatterns();
        for (const preset of presetPatterns) {
          try {
            await TrackPattern(repoPath, preset.pattern);
          } catch (err) {
            console.warn(`Failed to track LFS pattern ${preset.pattern}:`, err);
          }
        }
      } catch (err) {
        console.warn('Failed to initialize LFS:', err);
        // Continue even if LFS setup fails
      }
      
      // Step 3: Create .controlzebra/ directory & ensure local.json is gitignored
      try {
        await EnsureControlZebraDir(repoPath);
      } catch (err) {
        console.warn('Failed to ensure .controlzebra directory:', err);
      }
      
      // Step 4: Ensure git identity from ControlZebra account
      try {
        await EnsureIdentity(repoPath, userName || '', userEmail || '');
      } catch (err) {
        console.warn('Failed to ensure git identity:', err);
      }
      
      // Step 5: Make initial commit with all files
      let initialCommitMade = false;
      try {
        const commitResult = await CommitAll(repoPath, 'Initial commit');
        if (commitResult.success) {
          initialCommitMade = true;
        } else {
          console.warn('Failed to make initial commit:', commitResult.error);
          // Continue even if initial commit fails (might have no files to commit)
        }
      } catch (err) {
        console.warn('Failed to make initial commit:', err);
        // Continue even if commit fails
      }
      
      // Refresh repo info
      const info = await DetectRepo(repoPath);
      setRepoInfo(info as RepoInfo);
      
      // Refresh status to show current state
      const status = await Status(repoPath);
      setRepoStatus(status as RepoStatus);
      
      // Track repo initialized
      trackRepoInitialized({
        lfsEnabled: true,
        initialCommitMade,
      });

      // Track project setup completed (Phase 13.2)
      trackProjectSetupCompleted({
        projectState,
        lfsEnabled: true,
        initialCommitMade,
        durationMs: Date.now() - setupStartTime,
      });
      
      showMessage('success', 'Version control enabled');
      setIsLoading(false);
      return true;
    } catch (err) {
      const error = err as Error;
      trackErrorShown({
        errorContext: 'start_tracking',
        actionAttempted: 'start_tracking',
      });
      showMessage('error', `Failed to start tracking: ${error.message || err}`);
      setIsLoading(false);
      return false;
    }
  }, [repoPath, repoInfo?.isRepo, repoStatus?.changedFiles?.length, userName, userEmail, showMessage, gitInstalled, lfsInstalled, installRequiredPackages]);

  // Close the current repository
  const closeRepo = useCallback(async (): Promise<void> => {
    // Track repo closed event
    if (repoOpenTimeRef.current > 0) {
      const sessionDuration = Math.round((Date.now() - repoOpenTimeRef.current) / 1000);
      trackRepoClosed({ sessionDurationSeconds: sessionDuration });
      repoOpenTimeRef.current = 0;
    }
    
    // Stop background tasks for the current repo before clearing state
    if (repoPath) {
      try {
        await StopBackgroundTasks(repoPath);
      } catch (err) {
        console.warn('Failed to stop background tasks:', err);
      }
    }

    setRepoPath(null);
    setRepoInfo(null);
    setRepoStatus(null);
    setGraphCommits([]);
    setBranches(null);
    setSelectedFileIndex(null);
    setSelectedCommit(null);
    setSelectedCommitFile(null);
    setCurrentDiff(null);
    setRepoSettings(null);
    
    // Clear viewer cache and L5X tab states when closing repo to free memory
    clearViewerCache();
    clearAllTabStates();
    
    try {
      await StopWatching();
    } catch (err) {
      console.error('Failed to stop file watcher:', err);
    }
    
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    try {
      const currentSettings = await GetAppSettings();
      await SaveAppSettings({ ...currentSettings, lastRepoPath: '' });
    } catch (err) {
      console.error('Failed to clear settings:', err);
    }
  }, []);

  // ===== Commit & Sync Operations =====

  // Commit all changes with message
  // force: bypass protected branch check (used when user explicitly confirms)
  const commitChanges = useCallback(async (message: string, _force = false): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    
    if (!message || !message.trim()) {
      showMessage('error', 'Commit message is required');
      return false;
    }
    
    const currentBranch = repoInfo?.branch || 'unknown';
    
    setIsCommitting(true);
    const startTime = Date.now();
    const filesChanged = repoStatus?.changedFiles?.length ?? 0;
    
    try {
      const result = await CommitAll(repoPath, message);
      
      if (!result.success) {
        trackCommitCreated({
          success: false,
          filesChanged,
          branchName: currentBranch,
          messageLength: message.length,
          isProtectedBranch: false,
          durationMs: Date.now() - startTime,
          errorType: 'git_error',
        });
        showMessage('error', result.error || 'Failed to save changes');
        setIsCommitting(false);
        return false;
      }
      
      trackCommitCreated({
        success: true,
        filesChanged,
        branchName: currentBranch,
        messageLength: message.length,
        isProtectedBranch: false,
        durationMs: Date.now() - startTime,
      });

      closeAllExplorerPreviews();
      
      showMessage('success', 'Changes saved successfully');
      await refreshAll();
      setIsCommitting(false);
      return true;
    } catch (err) {
      const error = err as Error;
      trackCommitCreated({
        success: false,
        filesChanged,
        branchName: currentBranch,
        messageLength: message.length,
        isProtectedBranch: false,
        durationMs: Date.now() - startTime,
        errorType: 'exception',
      });
      showMessage('error', `Failed to save: ${error.message || err}`);
      setIsCommitting(false);
      return false;
    }
  }, [repoPath, repoStatus, repoInfo, showMessage, refreshAll, closeAllExplorerPreviews]);

  // Generate unique operation ID
  const generateOperationId = useCallback((): string => {
    operationIdCounter.current += 1;
    return `op-${Date.now()}-${operationIdCounter.current}`;
  }, []);

  // Close progress modal
  const closeProgressModal = useCallback(() => {
    setProgressModal({ isOpen: false, operationId: null, title: '' });
  }, []);

  // Handle progress modal completion
  const handleProgressComplete = useCallback((success: boolean, error?: string) => {
    const startedAt = syncStartTimeRef.current;
    const durationMs = startedAt ? Math.max(1, Date.now() - startedAt) : 1;
    syncStartTimeRef.current = null;

    closeProgressModal();
    setIsSyncing(false);
    
    if (success) {
      trackSyncCompleted({
        success: true,
        durationMs,
      });
      showMessage('success', 'Synced successfully');
      refreshAll();
    } else if (error) {
      trackSyncFailed({
        errorType: 'sync_error',
        hadConflicts: error.toLowerCase().includes('conflict'),
      });
      showMessage('error', error);
    }
  }, [closeProgressModal, showMessage, refreshAll]);

  // Sync repository with progress
  const syncRepo = useCallback(async (): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    
    const operationId = generateOperationId();
    const currentBranch = repoInfo?.branch || 'unknown';
    const localAhead = repoStatus?.ahead ?? 0;
    const localBehind = repoStatus?.behind ?? 0;
    syncStartTimeRef.current = Date.now();
    
    // Track sync started
    trackSyncStarted({
      branchName: currentBranch,
      localAhead,
      localBehind,
    });
    
    setIsSyncing(true);
    setProgressModal({
      isOpen: true,
      operationId,
      title: 'Syncing with remote',
    });
    
    try {
      // Apply fetch settings from repo configuration (prune stale branches, fetch tags)
      const prune = repoSettings?.fetchPrune ?? true;
      const tags = repoSettings?.fetchTags ?? true;
      const result = await SyncWithProgress(repoPath, operationId, prune, tags);
      
      if (!result.success) {
        return false;
      }
      
      return true;
    } catch (err) {
      const error = err as Error;
      syncStartTimeRef.current = null;
      trackSyncFailed({
        errorType: 'exception',
        hadConflicts: false,
      });
      closeProgressModal();
      setIsSyncing(false);
      showMessage('error', `Sync failed: ${error.message || err}`);
      return false;
    }
  }, [repoPath, repoInfo, repoStatus, repoSettings, showMessage, generateOperationId, closeProgressModal]);

  // ===== Diff Operations =====

  // Load diff for a working tree file
  const loadWorkingDiff = useCallback(async (filePath: string): Promise<void> => {
    if (!repoPath || !filePath) {
      setCurrentDiff(null);
      return;
    }
    
    setIsDiffLoading(true);
    setSelectedCommit(null);
    setSelectedCommitFile(null);
    
    try {
      const diff = await DiffWorkingRaw(repoPath, filePath);
      setCurrentDiff(diff as FileDiff);
    } catch (err) {
      const error = err as Error;
      console.error('Failed to load diff:', err);
      setCurrentDiff({ hasError: true, error: error.message || 'Failed to load diff' } as FileDiff);
    } finally {
      setIsDiffLoading(false);
    }
  }, [repoPath]);

  // Load commit details
  const selectCommit = useCallback(async (commitHash: string): Promise<void> => {
    if (!repoPath || !commitHash) {
      setSelectedCommit(null);
      setCurrentDiff(null);
      return;
    }
    
    setIsDiffLoading(true);
    setSelectedFileIndex(null);
    setSelectedCommitFile(null);
    setCurrentDiff(null);
    
    try {
      const detail = await ShowCommit(repoPath, commitHash);
      if (detail.hasError) {
        showMessage('error', detail.error || 'Failed to load commit');
        setSelectedCommit(null);
      } else {
        setSelectedCommit(detail as CommitDetail);
      }
    } catch (err) {
      const error = err as Error;
      console.error('Failed to load commit:', err);
      showMessage('error', `Failed to load commit: ${error.message || err}`);
      setSelectedCommit(null);
    } finally {
      setIsDiffLoading(false);
    }
  }, [repoPath, showMessage]);

  // Load diff for a file within a selected commit
  const loadCommitFileDiff = useCallback(async (filePath: string): Promise<void> => {
    if (!repoPath || !selectedCommit || !filePath) {
      return;
    }
    
    setIsDiffLoading(true);
    setSelectedCommitFile(filePath);
    
    try {
      const diff = await DiffCommitFileRaw(repoPath, selectedCommit.hash, filePath);
      setCurrentDiff(diff as FileDiff);
    } catch (err) {
      const error = err as Error;
      console.error('Failed to load commit file diff:', err);
      setCurrentDiff({ hasError: true, error: error.message || 'Failed to load diff' } as FileDiff);
    } finally {
      setIsDiffLoading(false);
    }
  }, [repoPath, selectedCommit]);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedFileIndex(null);
    setSelectedCommit(null);
    setSelectedCommitFile(null);
    setCurrentDiff(null);
  }, []);

  // ===== Branch Operations =====

  // Fetch branches
  const refreshBranches = useCallback(async (): Promise<void> => {
    if (!repoPath) return;
    
    try {
      const branchList = await Branches(repoPath);
      if (!branchList.hasError) {
        setBranches(branchList as BranchList);
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err);
    }
  }, [repoPath]);

  // Switch to existing branch
  const switchBranch = useCallback(async (branchName: string): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    
    const fromBranch = repoInfo?.branch || 'unknown';
    
    try {
      const result = await CheckoutBranch(repoPath, branchName);
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to switch branch');
        return false;
      }
      
      trackBranchSwitched({
        fromBranch,
        toBranch: branchName,
        usedStash: false,
      });

      closeAllExplorerPreviews();
      
      showMessage('success', result.message || `Switched to ${branchName}`);
      clearSelection();
      await refreshAll();
      await refreshBranches();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to switch branch: ${error.message || err}`);
      return false;
    }
  }, [repoPath, repoInfo, showMessage, clearSelection, refreshAll, refreshBranches, closeAllExplorerPreviews]);

  // Create new branch and switch to it
  const createBranch = useCallback(async (branchName: string): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    
    const fromBranch = repoInfo?.branch || 'unknown';
    
    try {
      const result = await CreateBranchAndCheckout(repoPath, branchName);
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to create branch');
        return false;
      }
      
      trackBranchCreated({
        branchName,
        fromBranch,
        movedUncommittedChanges: false,
      });

      closeAllExplorerPreviews();
      
      showMessage('success', result.message || `Created branch ${branchName}`);
      clearSelection();
      await refreshAll();
      await refreshBranches();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to create branch: ${error.message || err}`);
      return false;
    }
  }, [repoPath, repoInfo, showMessage, clearSelection, refreshAll, refreshBranches, closeAllExplorerPreviews]);

  // Rename an existing branch (local + remote when upstream exists)
  const renameBranch = useCallback(async (oldName: string, newName: string): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }

    try {
      const result = await RenameBranch(repoPath, oldName, newName, true);
      if (!result.success) {
        showMessage('error', result.error || 'Failed to rename branch');
        return false;
      }

      showMessage('success', result.message || `Renamed branch '${oldName}' to '${newName}'`);
      await refreshAll();
      await refreshBranches();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to rename branch: ${error.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll, refreshBranches]);

  // Delete an existing branch (local + remote when upstream exists)
  const deleteBranch = useCallback(async (branchName: string): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }

    try {
      const result = await DeleteBranch(repoPath, branchName, true);
      if (!result.success) {
        showMessage('error', result.error || 'Failed to delete branch');
        return false;
      }

      showMessage('success', result.message || `Deleted branch '${branchName}'`);
      await refreshAll();
      await refreshBranches();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to delete branch: ${error.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll, refreshBranches]);

  // Create new branch, switch to it, and commit changes
  const branchAndCommit = useCallback(async (branchName: string, message: string): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    
    if (!branchName || !branchName.trim()) {
      showMessage('error', 'Branch name is required');
      return false;
    }
    
    if (!message || !message.trim()) {
      showMessage('error', 'Commit message is required');
      return false;
    }
    
    const fromBranch = repoInfo?.branch || 'unknown';
    const wasOnProtectedBranch = fromBranch === 'main' || fromBranch === 'master';
    const filesChanged = repoStatus?.changedFiles?.length ?? 0;
    
    try {
      const switchResult = await StashAndSwitchBranch(repoPath, branchName.trim(), true);
      
      if (!switchResult.success) {
        showMessage('error', switchResult.error || 'Failed to create branch and move changes');
        return false;
      }
      
      const commitResult = await CommitAll(repoPath, message.trim());
      
      if (!commitResult.success) {
        showMessage('error', commitResult.error || 'Branch created but failed to save changes');
        return false;
      }
      
      trackCommitBranchAndSave({
        newBranchName: branchName,
        filesChanged,
        wasOnProtectedBranch,
      });

      closeAllExplorerPreviews();
      
      showMessage('success', `Created branch "${branchName}" and saved changes`);
      clearSelection();
      await refreshAll();
      await refreshBranches();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed: ${error.message || err}`);
      return false;
    }
  }, [repoPath, repoInfo, repoStatus, showMessage, clearSelection, refreshAll, refreshBranches, closeAllExplorerPreviews]);

  // ===== Recovery Operations =====

  // Undo last commit
  const undoLastCommit = useCallback(async (): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    
    try {
      const result = await ResetSoftHead(repoPath, 1, true);
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to undo last commit');
        return false;
      }
      
      trackCommitUndone({ commitsResetCount: 1 });
      
      showMessage('success', result.message || 'Undid last commit');
      clearSelection();
      await refreshAll();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to undo: ${error.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, clearSelection, refreshAll]);

  // Discard all changes
  const discardAllChanges = useCallback(async (): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    
    const filesDiscarded = repoStatus?.changedFiles?.length ?? 0;
    
    try {
      const result = await DiscardAll(repoPath, true);
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to discard changes');
        return false;
      }
      
      trackChangesDiscarded({
        filesDiscarded,
        wasPartial: false,
      });
      
      showMessage('success', result.message || 'All changes discarded');
      clearSelection();
      await refreshAll();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to discard: ${error.message || err}`);
      return false;
    }
  }, [repoPath, repoStatus, showMessage, clearSelection, refreshAll]);

  // Rewind to last snapshot
  const rewindToLastSnapshot = useCallback(async (): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    
    try {
      const result = await ResetHardHead(repoPath, true);
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to rewind');
        return false;
      }
      
      showMessage('success', result.message || 'Rewound to last snapshot');
      clearSelection();
      await refreshAll();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to rewind: ${error.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, clearSelection, refreshAll]);

  // Discard changes to a single file
  const discardFileChanges = useCallback(async (filePath: string): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    
    try {
      const result = await DiscardFile(repoPath, filePath, true);
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to discard file changes');
        return false;
      }
      
      trackChangesDiscarded({
        filesDiscarded: 1,
        wasPartial: true,
      });
      
      showMessage('success', result.message || `Discarded changes to ${filePath}`);
      setSelectedFileIndex(null);
      setCurrentDiff(null);
      await refreshStatus();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to discard: ${error.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, refreshStatus]);

  // ===== Conflict Checking Operations =====

  // Check for merge conflicts (DRY-RUN ONLY)
  const checkConflictsOnly = useCallback(async (
    targetBranch = '', 
    sourceBranch = '', 
    options: MergeOptions = {}
  ): Promise<BranchConflictCheckResult | null> => {
    const { squash = isSquashMerge } = options;
    
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return null;
    }
    
    setIsCheckingConflicts(true);
    setConflictedFiles([]);
    setSelectedConflictFile(null);
    setConflictCheckResult(null);
    setConflictSidesInfo(null);
    
    try {
      const result = await CheckBranchConflicts(repoPath, targetBranch, sourceBranch);
      
      const resultWithSquash = { ...result, isSquashMerge: squash } as BranchConflictCheckResult;
      setConflictCheckResult(resultWithSquash);
      
      if (result.targetBranch || result.parentBranch) {
        setDetectedParentBranch({
          name: result.targetBranch || result.parentBranch,
          source: 'auto-detected',
        });
        
        try {
          const sidesInfo = await GetConflictSidesInfo(repoPath, result.targetBranch || result.parentBranch);
          if (sidesInfo.success) {
            setConflictSidesInfo(sidesInfo as ConflictSidesInfo);
          }
        } catch (sidesErr) {
          console.error('Failed to get conflict sides info:', sidesErr);
        }
      }
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to check conflicts');
        setIsCheckingConflicts(false);
        return resultWithSquash;
      }
      
      const target = result.targetBranch || result.parentBranch;
      const source = result.sourceBranch || repoInfo?.branch;
      
      if (result.hasConflicts) {
        setConflictedFiles((result.conflictedFiles || []) as ConflictedFile[]);
        
        // Track conflict detected
        trackConflictDetected({
          conflictedFilesCount: result.conflictedFiles?.length || 0,
          conflictSource: 'merge',
        });
        
        showMessage('info', `Found ${result.conflictedFiles?.length || 0} potential conflict(s) when merging ${source} → ${target}`);
      }
      
      setIsCheckingConflicts(false);
      return resultWithSquash;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to check conflicts: ${error.message || err}`);
      setIsCheckingConflicts(false);
      return null;
    }
  }, [repoPath, showMessage, isSquashMerge, repoInfo?.branch]);

  // Start the actual merge process
  const startMerge = useCallback(async (
    targetBranch = '', 
    sourceBranch = '', 
    options: MergeOptions = {}
  ): Promise<StartMergeResult | null> => {
    const { squash = isSquashMerge } = options;
    
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return null;
    }
    
    const target = targetBranch || conflictCheckResult?.targetBranch || conflictCheckResult?.parentBranch || detectedParentBranch?.name;
    const source = sourceBranch || conflictCheckResult?.sourceBranch || repoInfo?.branch;
    const mergeType = squash ? 'Squash merge' : 'Merge';
    
    if (!target) {
      showMessage('error', 'No target branch specified. Please check for conflicts first.');
      return null;
    }
    
    setIsCheckingConflicts(true);
    
    try {
      const mergeResult = await StartMergeWithOptions(repoPath, target, source || '', { squash });
      
      if (!mergeResult.success) {
        const errorMsg = mergeResult.error || mergeResult.message || 'Failed to start merge';
        showMessage('error', errorMsg);
        setConflictCheckResult(prev => prev ? { ...prev, success: false, error: errorMsg, mergeStarted: false } : null);
        setIsCheckingConflicts(false);
        return null;
      }
      
      if (mergeResult.error === 'already_up_to_date') {
        showMessage('info', `${target} already contains all changes from ${source} - nothing to merge`);
        setConflictCheckResult(prev => prev ? { ...prev, success: true, alreadyUpToDate: true, mergeStarted: false } : null);
        setIsCheckingConflicts(false);
        return { success: true, alreadyUpToDate: true };
      }
      
      if (mergeResult.error === 'auto_completed') {
        showMessage('success', `Merged ${source} into ${target} successfully`);
        setConflictCheckResult(prev => prev ? { ...prev, success: true, autoCompleted: true, mergeStarted: true } : null);
        await refreshAll();
        setIsCheckingConflicts(false);
        return { success: true, autoCompleted: true };
      }
      
      const mergeStateAfterStart = await GetMergeState(repoPath);
      
      if (mergeStateAfterStart.hasConflicts) {
        const actualConflicts = await GetConflictedFiles(repoPath);
        setConflictedFiles((actualConflicts || conflictCheckResult?.conflictedFiles || []) as ConflictedFile[]);
        showMessage('info', `${mergeType} started: ${source} → ${target} with ${actualConflicts?.length || 0} conflict(s) to resolve`);
      } else {
        setConflictedFiles([]);
        showMessage('success', `${mergeType} started - ready to complete`);
      }
      
      setConflictCheckResult(prev => prev ? { ...prev, mergeStarted: true, hasConflicts: mergeStateAfterStart.hasConflicts } : null);
      setIsCheckingConflicts(false);
      return { success: true, hasConflicts: mergeStateAfterStart.hasConflicts };
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to start merge: ${error.message || err}`);
      setIsCheckingConflicts(false);
      return null;
    }
  }, [repoPath, showMessage, isSquashMerge, conflictCheckResult, detectedParentBranch, repoInfo?.branch, refreshAll]);

  // Legacy function for backward compatibility
  const checkBranchConflicts = useCallback(async (
    targetBranch = '', 
    sourceBranch = '', 
    options: MergeOptions = {}
  ): Promise<BranchConflictCheckResult | null> => {
    const checkResult = await checkConflictsOnly(targetBranch, sourceBranch, options);
    if (!checkResult || !checkResult.success) {
      return checkResult;
    }
    const mergeResult = await startMerge(targetBranch, sourceBranch, options);
    if (!mergeResult) {
      return null;
    }
    return { ...checkResult, ...mergeResult };
  }, [checkConflictsOnly, startMerge]);

  // Get parent branch info
  const fetchParentBranch = useCallback(async (): Promise<ParentBranchResult | null> => {
    if (!repoPath) return null;
    
    try {
      const result = await GetParentBranch(repoPath);
      if (result.parentBranch) {
        setDetectedParentBranch({
          name: result.parentBranch,
          source: result.source || 'auto-detected',
        });
        return result as ParentBranchResult;
      }
      return null;
    } catch (err) {
      console.error('Failed to detect parent branch:', err);
      return null;
    }
  }, [repoPath]);

  // Clear conflict check results
  const clearConflicts = useCallback(() => {
    setConflictedFiles([]);
    setSelectedConflictFile(null);
    setConflictCheckResult(null);
    setDetectedParentBranch(null);
    setFileResolutions({});
    setMergeState(null);
    setConflictSidesInfo(null);
  }, []);

  // Set resolution strategy for a file
  const setFileResolution = useCallback((filePath: string, strategy: ResolutionStrategy) => {
    setFileResolutions(prev => ({ ...prev, [filePath]: strategy }));
  }, []);

  // Apply resolution for a single file
  const resolveConflict = useCallback(async (filePath: string, strategy: ResolutionStrategy): Promise<boolean> => {
    if (!repoPath || !filePath) {
      showMessage('error', 'Invalid file path');
      return false;
    }

    setIsResolvingConflict(true);
    try {
      let result;
      if (strategy === 'mine') {
        result = await ResolveConflictKeepOurs(repoPath, filePath);
      } else if (strategy === 'theirs') {
        result = await ResolveConflictKeepTheirs(repoPath, filePath);
      } else if (strategy === 'both') {
        result = await ResolveConflictKeepBoth(repoPath, filePath);
      } else {
        showMessage('error', 'Invalid resolution strategy');
        setIsResolvingConflict(false);
        return false;
      }

      if (!result.success) {
        showMessage('error', result.error || result.message || 'Failed to resolve conflict');
        setIsResolvingConflict(false);
        return false;
      }

      // Track conflict resolution
      trackConflictResolved({
        resolutionStrategy: strategy === 'mine' ? 'ours' : strategy === 'theirs' ? 'theirs' : 'both',
      });

      setFileResolutions(prev => ({ ...prev, [filePath]: strategy }));
      showMessage('success', result.message || `Resolved "${filePath.split('/').pop()}"`);
      setIsResolvingConflict(false);
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to resolve: ${error.message || err}`);
      setIsResolvingConflict(false);
      return false;
    }
  }, [repoPath, showMessage]);

  // Apply all pending resolutions
  const applyAllResolutions = useCallback(async (): Promise<boolean> => {
    if (!repoPath) return false;

    const pending = conflictedFiles.filter(f => fileResolutions[f.path] && fileResolutions[f.path] !== 'both');
    
    if (pending.length === 0) {
      showMessage('info', 'No resolutions to apply');
      return false;
    }

    setIsResolvingConflict(true);
    let successCount = 0;
    
    for (const file of pending) {
      const strategy = fileResolutions[file.path];
      const success = await resolveConflict(file.path, strategy);
      if (success) successCount++;
    }

    setIsResolvingConflict(false);
    
    if (successCount === pending.length) {
      showMessage('success', `Resolved ${successCount} file(s)`);
      return true;
    } else {
      showMessage('warning', `Resolved ${successCount} of ${pending.length} file(s)`);
      return false;
    }
  }, [repoPath, conflictedFiles, fileResolutions, resolveConflict, showMessage]);

  // Abort the current merge
  const abortMerge = useCallback(async (): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }

    const conflictsRemaining = conflictedFiles.length;
    // Remember the original branch so we can switch back after abort
    const originalBranch = conflictCheckResult?.sourceBranch;

    try {
      const result = await AbortMerge(repoPath);
      
      if (!result.success) {
        showMessage('error', result.error || result.message || 'Failed to abort merge');
        return false;
      }

      trackMergeAborted({ conflictsRemaining });

      // Switch back to the original branch (merge checks out target, so we need to go back)
      if (originalBranch) {
        try {
          const checkoutResult = await CheckoutBranch(repoPath, originalBranch);
          if (checkoutResult.success) {
            showMessage('success', `Merge aborted — switched back to ${originalBranch}`);
          } else {
            showMessage('success', result.message || 'Merge aborted');
            console.warn('[abortMerge] Could not switch back to original branch:', checkoutResult.error || checkoutResult.message);
          }
        } catch (checkoutErr) {
          showMessage('success', result.message || 'Merge aborted');
          console.warn('[abortMerge] Error switching back to original branch:', checkoutErr);
        }
      } else {
        showMessage('success', result.message || 'Merge aborted');
      }

      clearConflicts();
      await refreshStatus();
      await refreshBranches();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to abort merge: ${error.message || err}`);
      return false;
    }
  }, [repoPath, conflictedFiles, conflictCheckResult, showMessage, clearConflicts, refreshStatus, refreshBranches]);

  // Complete the merge with a commit message
  const completeMerge = useCallback(async (message: string): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }

    const unresolvedCount = conflictedFiles.filter(f => !fileResolutions[f.path]).length;
    if (unresolvedCount > 0) {
      showMessage('error', `${unresolvedCount} file(s) still need resolution`);
      return false;
    }

    const parentBranchName = detectedParentBranch?.name;
    const totalConflicts = conflictedFiles.length;
    const strategiesUsed = Object.values(fileResolutions).filter(Boolean) as string[];

    try {
      // CompleteMerge handles both regular and squash merges on the backend
      const result = await CompleteMerge(repoPath, message || '');
      
      if (!result.success) {
        showMessage('error', result.error || result.message || 'Failed to complete merge');
        return false;
      }

      // Track merge completed
      trackMergeCompleted({
        totalConflicts,
        resolutionStrategiesUsed: strategiesUsed,
      });

      showMessage('success', result.message || 'Merge completed successfully');
      clearConflicts();
      clearSelection();
      await refreshAll();
      await refreshBranches();

      if (parentBranchName) {
        try {
          const checkoutResult = await CheckoutBranch(repoPath, parentBranchName);
          if (checkoutResult.success) {
            showMessage('success', `Switched to ${parentBranchName}`);
            await refreshAll();
            await refreshBranches();
          }
        } catch (checkoutErr) {
          console.error('[completeMerge] Error switching to parent branch:', checkoutErr);
        }
      }

      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to complete merge: ${error.message || err}`);
      return false;
    }
  }, [repoPath, conflictedFiles, fileResolutions, showMessage, clearConflicts, clearSelection, refreshAll, refreshBranches, detectedParentBranch]);

  // Refresh merge state from backend
  const refreshMergeState = useCallback(async (): Promise<MergeState | null> => {
    if (!repoPath) return null;
    
    try {
      const state = await GetMergeState(repoPath);
      setMergeState(state as MergeState);
      return state as MergeState;
    } catch (err) {
      console.error('Failed to get merge state:', err);
      return null;
    }
  }, [repoPath]);

  // ===== Stuck State Recovery Actions =====

  const abortCurrentOperation = useCallback(async (): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    try {
      const result = await AbortCurrentOperation(repoPath);
      if (!result.success) {
        showMessage('error', result.error || result.message || 'Failed to abort operation');
        return false;
      }
      showMessage('success', result.message || 'Operation aborted');
      clearConflicts();
      await refreshAll();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to abort operation: ${error.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, clearConflicts, refreshAll]);

  const abortCherryPick = useCallback(async (): Promise<boolean> => {
    if (!repoPath) return false;
    try {
      const result = await AbortCherryPick(repoPath);
      if (result.success) {
        showMessage('success', result.message);
        await refreshAll();
        return true;
      }
      showMessage('error', result.error || result.message);
      return false;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to abort cherry-pick: ${error.message}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

  const continueCherryPick = useCallback(async (): Promise<boolean> => {
    if (!repoPath) return false;
    try {
      const result = await ContinueCherryPick(repoPath);
      if (result.success) {
        showMessage('success', result.message);
        await refreshAll();
        return true;
      }
      showMessage('error', result.error || result.message);
      return false;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to continue cherry-pick: ${error.message}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

  const skipCherryPickCommit = useCallback(async (): Promise<boolean> => {
    if (!repoPath) return false;
    try {
      const result = await SkipCherryPickCommit(repoPath);
      if (result.success) {
        showMessage('success', result.message);
        await refreshAll();
        return true;
      }
      showMessage('error', result.error || result.message);
      return false;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to skip commit: ${error.message}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

  const abortRevert = useCallback(async (): Promise<boolean> => {
    if (!repoPath) return false;
    try {
      const result = await AbortRevert(repoPath);
      if (result.success) {
        showMessage('success', result.message);
        await refreshAll();
        return true;
      }
      showMessage('error', result.error || result.message);
      return false;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to abort revert: ${error.message}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

  const continueRevert = useCallback(async (): Promise<boolean> => {
    if (!repoPath) return false;
    try {
      const result = await ContinueRevert(repoPath);
      if (result.success) {
        showMessage('success', result.message);
        await refreshAll();
        return true;
      }
      showMessage('error', result.error || result.message);
      return false;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to continue revert: ${error.message}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

  const skipRevertCommit = useCallback(async (): Promise<boolean> => {
    if (!repoPath) return false;
    try {
      const result = await SkipRevertCommit(repoPath);
      if (result.success) {
        showMessage('success', result.message);
        await refreshAll();
        return true;
      }
      showMessage('error', result.error || result.message);
      return false;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to skip commit: ${error.message}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

  const revertCommit = useCallback(async (commitHash: string): Promise<boolean> => {
    if (!repoPath) return false;
    try {
      const result = await RevertCommit(repoPath, commitHash);
      if (result.success) {
        closeAllExplorerPreviews();
        showMessage('success', result.message);
        await refreshAll();
        return true;
      }
      showMessage('error', result.error || result.message);
      return false;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to revert commit: ${error.message}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll, closeAllExplorerPreviews]);

  const abortBisect = useCallback(async (): Promise<boolean> => {
    if (!repoPath) return false;
    try {
      const result = await AbortBisect(repoPath);
      if (result.success) {
        showMessage('success', result.message);
        await refreshAll();
        return true;
      }
      showMessage('error', result.error || result.message);
      return false;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to abort bisect: ${error.message}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

  const getBisectState = useCallback(async (): Promise<BisectState | null> => {
    if (!repoPath) return null;
    try {
      return await GetBisectState(repoPath) as BisectState;
    } catch (err) {
      console.error('Failed to get bisect state:', err);
      return null;
    }
  }, [repoPath]);

  const abortAM = useCallback(async (): Promise<boolean> => {
    if (!repoPath) return false;
    try {
      const result = await AbortAM(repoPath);
      if (result.success) {
        showMessage('success', result.message);
        await refreshAll();
        return true;
      }
      showMessage('error', result.error || result.message);
      return false;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to abort patch application: ${error.message}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

  const skipAMPatch = useCallback(async (): Promise<boolean> => {
    if (!repoPath) return false;
    try {
      const result = await SkipAMPatch(repoPath);
      if (result.success) {
        showMessage('success', result.message);
        await refreshAll();
        return true;
      }
      showMessage('error', result.error || result.message);
      return false;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to skip patch: ${error.message}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

  const createBranchFromDetached = useCallback(async (branchName: string): Promise<boolean> => {
    if (!repoPath) return false;
    if (!branchName) {
      showMessage('error', 'Branch name is required');
      return false;
    }
    try {
      const result = await CreateBranchFromDetached(repoPath, branchName);
      if (result.success) {
        showMessage('success', result.message);
        await refreshAll();
        await refreshBranches();
        return true;
      }
      showMessage('error', result.error || result.message);
      return false;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to create branch: ${error.message}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll, refreshBranches]);

  const removeAllStaleLocks = useCallback(async (): Promise<boolean> => {
    if (!repoPath) return false;
    try {
      const result = await RemoveAllStaleLocks(repoPath, true);
      if (result.success) {
        showMessage('success', result.message);
        await refreshAll();
        return true;
      }
      showMessage('error', result.error || result.message);
      return false;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to remove lock files: ${error.message}`);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

  // ===== GitHub Handlers (Phase 2) =====

  // Check GitHub CLI installation and auth status
  const checkGitHubAuth = useCallback(async (): Promise<void> => {
    setIsCheckingGhAuth(true);
    try {
      const installed = await IsGHInstalled();
      setGhInstalled(installed);
      
      if (installed) {
        const version = await GetGHVersion();
        setGhVersion(version);
        
        const status = await AuthStatus();
        setGhAuthStatus(status as GitHubAuthStatus);
      } else {
        setGhVersion('');
        setGhAuthStatus(null);
      }
    } catch (err) {
      console.error('Failed to check GitHub auth:', err);
      setGhAuthStatus(null);
    } finally {
      setIsCheckingGhAuth(false);
    }
  }, []);

  // Login to GitHub
  const loginGitHub = useCallback(async (): Promise<GitHubAuthResult> => {
    try {
      const result = await AuthLogin();
      if (result.success) {
        // Refresh auth status after login
        await checkGitHubAuth();
        showMessage('success', 'Successfully connected to GitHub');
      } else {
        showMessage('error', result.error || 'GitHub login failed');
      }
      return result as GitHubAuthResult;
    } catch (err) {
      const error = err as Error;
      const result: GitHubAuthResult = {
        success: false,
        error: error.message || 'GitHub login failed',
      };
      showMessage('error', result.error!);
      return result;
    }
  }, [checkGitHubAuth, showMessage]);

  // Start GitHub login (device flow) - returns verification code
  const startGitHubLogin = useCallback(async (): Promise<GitHubDeviceFlowResult> => {
    try {
      const result = await AuthLoginStart();
      return result as GitHubDeviceFlowResult;
    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        error: error.message || 'Failed to start GitHub login',
      };
    }
  }, []);

  // Complete GitHub login (check if auth completed)
  const completeGitHubLogin = useCallback(async (): Promise<GitHubAuthResult> => {
    try {
      const result = await AuthLoginComplete();
      if (result.success) {
        await checkGitHubAuth();
        showMessage('success', 'Successfully connected to GitHub');
      }
      return result as GitHubAuthResult;
    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        error: error.message || 'GitHub login not completed',
      };
    }
  }, [checkGitHubAuth, showMessage]);

  // Cancel GitHub login (abort in-progress device flow)
  const cancelGitHubLogin = useCallback(async (): Promise<GitHubAuthResult> => {
    try {
      const result = await AuthLoginCancel();
      return result as GitHubAuthResult;
    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        error: error.message || 'Failed to cancel GitHub login',
      };
    }
  }, []);

  // Logout from GitHub
  const logoutGitHub = useCallback(async (): Promise<GitHubAuthResult> => {
    try {
      const result = await AuthLogout();
      if (result.success) {
        setGhAuthStatus(null);
        setGhRepos([]);
        showMessage('success', 'Disconnected from GitHub');
      } else {
        showMessage('error', result.error || 'GitHub logout failed');
      }
      return result as GitHubAuthResult;
    } catch (err) {
      const error = err as Error;
      const result: GitHubAuthResult = {
        success: false,
        error: error.message || 'GitHub logout failed',
      };
      showMessage('error', result.error!);
      return result;
    }
  }, [showMessage]);

  // Load GitHub repositories
  const loadGitHubRepos = useCallback(async (
    limit = 30,
    visibility = ''
  ): Promise<GitHubRepoListResult> => {
    setIsLoadingGhRepos(true);
    try {
      const result = await RepoList(limit, visibility);
      if (result.success) {
        setGhRepos((result.repos || []) as GitHubRepo[]);
      } else {
        showMessage('error', result.error || 'Failed to load repositories');
      }
      return result as GitHubRepoListResult;
    } catch (err) {
      const error = err as Error;
      const result: GitHubRepoListResult = {
        success: false,
        repos: [],
        error: error.message || 'Failed to load repositories',
      };
      showMessage('error', result.error!);
      return result;
    } finally {
      setIsLoadingGhRepos(false);
    }
  }, [showMessage]);

  // Clone a GitHub repository
  const cloneGitHubRepo = useCallback(async (
    repo: string,
    destPath: string
  ): Promise<GitHubCloneResult> => {
    try {
      const result = await RepoClone(repo, destPath, false);
      if (result.success) {
        showMessage('success', `Repository cloned to ${result.cloneDir}`);
        // Optionally open the cloned repo
        if (result.cloneDir) {
          await openRepo(result.cloneDir);
        }
      } else {
        showMessage('error', result.error || 'Failed to clone repository');
      }
      return result as GitHubCloneResult;
    } catch (err) {
      const error = err as Error;
      const result: GitHubCloneResult = {
        success: false,
        error: error.message || 'Failed to clone repository',
      };
      showMessage('error', result.error!);
      return result;
    }
  }, [showMessage, openRepo]);

  // Publish local repo to GitHub
  const publishToGitHub = useCallback(async (
    name: string,
    description: string,
    isPrivate: boolean,
    owner?: string
  ): Promise<GitHubRepoCreateResult> => {
    if (!repoPath) {
      return {
        success: false,
        error: 'No repository open',
      };
    }

    const publishStartTime = Date.now();

    // Track publish attempt (Phase 13.2)
    trackProjectPublishAttempted({
      repoName: name,
      isPrivate,
      hasOrganization: !!owner && owner.length > 0,
      source: 'setup_banner',
    });
    
    try {
      const result = await RepoCreateFromLocal(repoPath, name, description, isPrivate, owner || '');
      if (result.success) {
        const displayName = owner ? `${owner}/${name}` : name;
        showMessage('success', `Repository published to GitHub as ${result.repo?.fullName || displayName}`);

        // Track publish completed (Phase 13.2)
        trackProjectPublishCompleted({
          repoName: name,
          isPrivate,
          durationMs: Date.now() - publishStartTime,
        });

        // Refresh status to update remote info
        await refreshStatus();
      } else {
        showMessage('error', result.error || 'Failed to publish repository');
        // Track publish failure (Phase 13.2)
        trackProjectPublishFailed({
          errorType: result.error || 'unknown_error',
          repoName: name,
        });
      }
      return result as GitHubRepoCreateResult;
    } catch (err) {
      const error = err as Error;
      const result: GitHubRepoCreateResult = {
        success: false,
        error: error.message || 'Failed to publish repository',
      };
      showMessage('error', result.error!);

      // Track publish failure (Phase 13.2)
      trackProjectPublishFailed({
        errorType: error.message || 'exception',
        repoName: name,
      });

      return result;
    }
  }, [repoPath, showMessage, refreshStatus]);

  // Load user's organizations for publish form
  const loadUserOrganizations = useCallback(async (): Promise<GitHubOrganizationsResult> => {
    try {
      const result = await ListUserOrganizations();
      return result as GitHubOrganizationsResult;
    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        username: '',
        organizations: [],
        error: error.message || 'Failed to load organizations',
      };
    }
  }, []);

  // ===== Project Creation Orchestration (Welcome Screen) =====

  /**
   * createProject - Full project creation flow with step callbacks.
   *
   * Steps:
   *  0 – Initializing (git init, LFS presets, identity)
   *  1 – Saving Changes (initial commit)
   *  2 – Publishing (GitHub repo creation — skipped if local-only)
   *  3 – Done (opens the project)
   *
   * The `onStepChange` callback lets the UI stepper advance.
   */
  const createProject = useCallback(async (options: CreateProjectOptions): Promise<CreateProjectResult> => {
    const { path, remote, onStepChange, gitignoreTemplateId } = options;
    const createStartTime = Date.now();

    if (!gitInstalled || !lfsInstalled || (!remote.skip && !ghInstalled)) {
      const installed = await installRequiredPackages();
      if (!installed) {
        return {
          success: false,
          error: 'Required packages are still being installed. Please wait and try again.',
        };
      }
    }

    // Track setup started (Phase 13.2)
    trackProjectSetupStarted({
      projectState: 'new-project',
      source: 'new_project_page',
      hasFiles: false, // New project page — may or may not have files
    });

    try {
      // ── Step 0: Initialize ──────────────────────────────────────────
      onStepChange?.(0);

      const info = await DetectRepo(path);
      if (!info.isRepo) {
        // Init git
        const initResult = await InitRepo(path);
        if (!initResult.success) {
          return { success: false, error: initResult.error || 'Failed to initialize repository' };
        }

        // Init LFS + preset patterns
        try {
          await InitializeLFS(path);
          const presetPatterns = await GetPresetPatterns();
          for (const preset of presetPatterns) {
            try {
              await TrackPattern(path, preset.pattern);
            } catch (err) {
              console.warn(`Failed to track LFS pattern ${preset.pattern}:`, err);
            }
          }
        } catch (err) {
          console.warn('Failed to initialize LFS:', err);
          // Non-fatal: continue without LFS
        }

        // Ensure git identity from ControlZebra account
        try {
          await EnsureIdentity(path, userName || '', userEmail || '');
        } catch (err) {
          console.warn('Failed to ensure git identity:', err);
        }

        // Apply selected .gitignore template before first commit
        if (gitignoreTemplateId) {
          try {
            const templateResult = await ApplyGitignoreTemplate(path, gitignoreTemplateId);
            if (!templateResult.success) {
              console.warn('Failed to apply .gitignore template:', templateResult.error);
            }
          } catch (err) {
            console.warn('Failed to apply .gitignore template:', err);
          }
        }
      }

      // Write .controlzebra/ config (non-fatal if it fails)
      try {
        await WriteRepoLocalConfig(path, {
          createdAt: new Date().toISOString(),
          createdBy: userName || userEmail || 'unknown',
          appVersion: '0.0.0-dev',
        });
      } catch (err) {
        console.warn('Failed to write .controlzebra config:', err);
      }

      // ── Step 1: Commit ──────────────────────────────────────────────
      onStepChange?.(1);

      const commitResult = await CommitAll(path, 'Initial commit');
      if (!commitResult.success) {
        // Non-fatal: might be an empty folder with nothing to commit
        console.warn('Initial commit may have been skipped:', commitResult.error);
      }

      // ── Step 2: Publish (if not local-only) ─────────────────────────
      if (!remote.skip && remote.repoName) {
        onStepChange?.(2);

        // Track publish attempt (Phase 13.2)
        trackProjectPublishAttempted({
          repoName: remote.repoName,
          isPrivate: remote.isPrivate ?? true,
          hasOrganization: !!remote.owner && remote.owner.length > 0,
          source: 'new_project_page',
        });

        const publishStart = Date.now();
        const pubResult = await RepoCreateFromLocal(
          path,
          remote.repoName,
          '', // description
          remote.isPrivate ?? true,
          remote.owner || '',
        );

        if (!pubResult.success) {
          // Repo exists locally — return partial success with warning
          const displayName = remote.owner
            ? `${remote.owner}/${remote.repoName}`
            : remote.repoName;
          const errorMsg = `Project created locally, but publishing "${displayName}" failed: ${pubResult.error}`;
          showMessage('warning', errorMsg, 8000);

          // Track publish failure (Phase 13.2)
          trackProjectPublishFailed({
            errorType: pubResult.error || 'unknown_error',
            repoName: remote.repoName,
          });

          // Still open the project so the user isn't stuck
          onStepChange?.(3);
          await openRepo(path);

          return { success: false, error: errorMsg };
        }

        // Track publish completed (Phase 13.2)
        trackProjectPublishCompleted({
          repoName: remote.repoName,
          isPrivate: remote.isPrivate ?? true,
          durationMs: Date.now() - publishStart,
        });

        showMessage('success', `Repository published to GitHub as ${pubResult.repo?.fullName || remote.repoName}`);
      }

      // ── Step 3: Done ────────────────────────────────────────────────
      onStepChange?.(3);
      await openRepo(path);

      trackRepoInitialized({
        lfsEnabled: true,
        initialCommitMade: true,
      });

      // Track project setup completed (Phase 13.2)
      trackProjectSetupCompleted({
        projectState: 'new-project',
        lfsEnabled: true,
        initialCommitMade: true,
        durationMs: Date.now() - createStartTime,
      });

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      trackErrorShown({
        errorContext: 'create_project',
        actionAttempted: 'create_project',
      });
      showMessage('error', `Failed to create project: ${msg}`);
      return { success: false, error: msg };
    }
  }, [userName, userEmail, openRepo, showMessage, gitInstalled, lfsInstalled, ghInstalled, installRequiredPackages]);

  // ===== Effects =====

  // Track local portable toolchain progress emitted by backend.
  useEffect(() => {
    const unsubscribe = Events.On('local-bin:progress', (event: any) => {
      const payload = (event?.data?.[0] ?? event?.data ?? event) as {
        component?: string;
        phase?: string;
        message?: string;
        percent?: number;
        error?: string;
      };

      if (!payload || typeof payload !== 'object') return;

      if (payload.message) {
        setPackagesInstallMessage(payload.message);
      }

      if (typeof payload.percent === 'number' && Number.isFinite(payload.percent)) {
        setPackagesInstallPercent(Math.max(0, Math.min(100, payload.percent)));
      }

      if (payload.phase === 'error') {
        setIsInstallingPackages(false);
        if (payload.error) {
          showMessage('error', payload.error);
        }
        return;
      }

      if (payload.component === 'toolchain' && payload.phase === 'done') {
        setIsInstallingPackages(false);
        setPackagesInstallMessage(payload.message || 'Additional packages are ready');
        return;
      }

      setIsInstallingPackages(true);
    });

    return () => {
      unsubscribe();
    };
  }, [showMessage]);

  // Prevent app shutdown while package download is in progress.
  useEffect(() => {
    if (!isInstallingPackages) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = 'Additional packages are being downloaded. Please wait.';
      return event.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isInstallingPackages]);

  // Validate required CLI packages at startup and install if missing.
  useEffect(() => {
    const initializeToolchain = async () => {
      const status = await refreshToolchainStatus();
      const hasMissing = !status.hasGit || !status.hasGh || !status.hasLfs;

      if (hasMissing && isWindowsPlatform()) {
        await installRequiredPackages();
        await refreshToolchainStatus();
      }
    };

    initializeToolchain();
  }, [refreshToolchainStatus, installRequiredPackages, isWindowsPlatform]);

  // Check GitHub auth status on mount
  useEffect(() => {
    checkGitHubAuth();
  }, [checkGitHubAuth]);

  // Load last opened repository on mount
  useEffect(() => {
    const loadLastRepo = async () => {
      try {
        const settings = await GetAppSettings();
        if (settings.lastRepoPath) {
          await openRepo(settings.lastRepoPath);
        }
      } catch (err) {
        console.error('Failed to load last repo:', err);
      }
    };
    loadLastRepo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start polling when git repo is open
  useEffect(() => {
    if (repoPath && repoInfo?.isRepo) {
      refreshAll();
      pollIntervalRef.current = setInterval(refreshStatus, STATUS_POLL_INTERVAL);
      
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
  }, [repoPath, repoInfo?.isRepo, refreshAll, refreshStatus]);

  // Event-based refresh for file changes
  useEffect(() => {
    if (!repoPath || !repoInfo?.isRepo) return;
    
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const normalizedRepoPath = repoPath.replace(/\\/g, '/');
    
    const handleFilesChanged = (event: {
      data?: {
        path?: string;
        eventType?: string;
        isDir?: boolean;
      };
    }) => {
      const changedPath = event.data?.path;
      const eventType = event.data?.eventType;
      const isDir = event.data?.isDir;

      if (!isDir && changedPath && (eventType === 'write' || eventType === 'rename' || eventType === 'remove')) {
        const normalizedChangedPath = changedPath.replace(/\\/g, '/');
        const repoPrefix = `${normalizedRepoPath}/`;

        if (normalizedChangedPath.startsWith(repoPrefix)) {
          const relativePath = normalizedChangedPath.slice(repoPrefix.length);

          // Ignore internal git metadata updates.
          if (relativePath && !relativePath.startsWith('.git/')) {
            closeExplorerPreviewsForFile(relativePath);
          }
        }
      }

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        refreshStatus();
      }, 300);
    };
    
    const unsubscribe = Events.On('files-changed', handleFilesChanged);
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [repoPath, repoInfo?.isRepo, refreshStatus, closeExplorerPreviewsForFile]);

  // Reset conflict check state when local changes are detected
  useEffect(() => {
    if (repoStatus?.hasChanges && conflictCheckResult) {
      if (conflictedFiles.length > 0) {
        return;
      }
      if (conflictCheckResult.success && !conflictCheckResult.hasConflicts) {
        return;
      }
      setConflictCheckResult(null);
      setConflictedFiles([]);
      setSelectedConflictFile(null);
      setFileResolutions({});
      setMergeState(null);
      setConflictSidesInfo(null);
    }
  }, [repoStatus?.hasChanges, conflictCheckResult, conflictedFiles.length]);

  // Listen for folder-selected event from native menu
  useEffect(() => {
    const unsubscribe = Events.On('folder-selected', async (event: { data?: string }) => {
      if (event.data) {
        await openFolder(event.data);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [openFolder]);

  // Listen for folder-closed event from native menu
  useEffect(() => {
    const unsubscribe = Events.On('folder-closed', async () => {
      await closeRepo();
    });
    
    return () => {
      unsubscribe();
    };
  }, [closeRepo]);

  // Listen for file:reveal-in-finder event from native menu
  useEffect(() => {
    const unsubscribe = Events.On('file:reveal-in-finder', async () => {
      if (repoPath) {
        const result = await RevealInFinder(repoPath);
        if (!result.success && result.error) {
          toast.error(result.error);
        }
      } else {
        toast.error('No folder is currently open');
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [repoPath]);

  // Listen for file:open-in-terminal event from native menu
  useEffect(() => {
    const unsubscribe = Events.On('file:open-in-terminal', async () => {
      if (repoPath) {
        const result = await OpenInTerminal(repoPath);
        if (!result.success && result.error) {
          toast.error(result.error);
        }
      } else {
        toast.error('No folder is currently open');
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [repoPath]);

  // Refresh branches when repo changes
  useEffect(() => {
    if (repoPath) {
      refreshBranches();
    }
  }, [repoPath, refreshBranches]);

  // ===== Memoized Context Value =====
  const value = useMemo<RepoContextValue>(() => ({
    // State
    repoPath,
    repoInfo,
    repoStatus,
    commits: graphCommits,
    graphCommits,
    branches,
    selectedFileIndex,
    setSelectedFileIndex,
    
    // v2: Selection state
    selectedCommit,
    selectedCommitFile,
    currentDiff,
    
    // Loading states
    isLoading,
    isSyncing,
    isCommitting,
    isDiffLoading,
    gitInstalled,
    lfsInstalled,
    isInstallingPackages,
    packagesInstallMessage,
    packagesInstallPercent,
    
    // Remote state
    hasRemote,
    refreshRemotes,

    // Repository settings (protected branches, fetch options)
    repoSettings,
    refreshRepoSettings,
    
    // Progress modal state
    progressModal,
    handleProgressComplete,
    
    // Feedback
    showMessage,

    // Non-git folder prompt state
    nonGitFolderPromptPath,
    dismissNonGitFolderPrompt,
    
    // Actions
    openRepo,
    openFolder,
    closeRepo,
    startTracking,
    installRequiredPackages,
    commitChanges,
    syncRepo,
    refreshStatus,
    refreshCommits,
    refreshAll,
    
    // v2: Diff actions
    loadWorkingDiff,
    selectCommit,
    loadCommitFileDiff,
    clearSelection,
    
    // v2: Branch actions
    refreshBranches,
    switchBranch,
    createBranch,
    renameBranch,
    deleteBranch,
    branchAndCommit,
    
    // v2: Recovery actions
    undoLastCommit,
    discardAllChanges,
    discardFileChanges,
    rewindToLastSnapshot,
    
    // v2: Conflict checking actions
    conflictedFiles,
    selectedConflictFile,
    setSelectedConflictFile,
    conflictCheckResult,
    isCheckingConflicts,
    checkConflictsOnly,
    startMerge,
    checkBranchConflicts,
    clearConflicts,
    detectedParentBranch,
    fetchParentBranch,
    conflictSidesInfo,
    
    // v2: Merge options
    isSquashMerge,
    setIsSquashMerge,
    
    // v2: Conflict resolution actions
    fileResolutions,
    setFileResolution,
    mergeState,
    isResolvingConflict,
    resolveConflict,
    applyAllResolutions,
    abortMerge,
    completeMerge,
    refreshMergeState,

    // v2: Stuck state recovery actions
    abortCurrentOperation,
    abortCherryPick,
    continueCherryPick,
    skipCherryPickCommit,
    revertCommit,
    abortRevert,
    continueRevert,
    skipRevertCommit,
    abortBisect,
    getBisectState,
    abortAM,
    skipAMPatch,
    createBranchFromDetached,
    removeAllStaleLocks,

    // GitHub Integration (Phase 2)
    ghInstalled,
    ghVersion,
    ghAuthStatus,
    isCheckingGhAuth,
    ghRepos,
    isLoadingGhRepos,
    checkGitHubAuth,
    loginGitHub,
    startGitHubLogin,
    completeGitHubLogin,
    cancelGitHubLogin,
    logoutGitHub,
    loadGitHubRepos,
    cloneGitHubRepo,
    publishToGitHub,
    loadUserOrganizations,

    // Project creation (Welcome Screen)
    createProject,
  }), [
    repoPath, repoInfo, repoStatus, graphCommits, branches, selectedFileIndex,
    selectedCommit, selectedCommitFile, currentDiff,
    isLoading, isSyncing, isCommitting, isDiffLoading,
    gitInstalled, lfsInstalled, isInstallingPackages, packagesInstallMessage, packagesInstallPercent,
    hasRemote, refreshRemotes,
    repoSettings, refreshRepoSettings,
    progressModal, handleProgressComplete,
    showMessage,
    nonGitFolderPromptPath, dismissNonGitFolderPrompt,
    openRepo, openFolder, closeRepo, startTracking, installRequiredPackages, commitChanges, syncRepo, refreshStatus, refreshCommits, refreshAll,
    loadWorkingDiff, selectCommit, loadCommitFileDiff, clearSelection,
    refreshBranches, switchBranch, createBranch, renameBranch, deleteBranch, branchAndCommit,
    undoLastCommit, discardAllChanges, discardFileChanges, rewindToLastSnapshot,
    conflictedFiles, selectedConflictFile, conflictCheckResult, isCheckingConflicts, 
    checkConflictsOnly, startMerge, checkBranchConflicts, clearConflicts,
    detectedParentBranch, fetchParentBranch, conflictSidesInfo,
    isSquashMerge,
    fileResolutions, setFileResolution, mergeState, isResolvingConflict,
    resolveConflict, applyAllResolutions, abortMerge, completeMerge, refreshMergeState,
    abortCurrentOperation,
    abortCherryPick, continueCherryPick, skipCherryPickCommit,
    revertCommit, abortRevert, continueRevert, skipRevertCommit,
    abortBisect, getBisectState,
    abortAM, skipAMPatch,
    createBranchFromDetached,
    removeAllStaleLocks,
    // GitHub dependencies
    ghInstalled, ghVersion, ghAuthStatus, isCheckingGhAuth, ghRepos, isLoadingGhRepos,
    checkGitHubAuth, loginGitHub, startGitHubLogin, completeGitHubLogin, cancelGitHubLogin, logoutGitHub, loadGitHubRepos, cloneGitHubRepo, publishToGitHub, loadUserOrganizations,
    createProject,
  ]);

  return (
    <RepoContext.Provider value={value}>
      {children}
    </RepoContext.Provider>
  );
}

/**
 * useRepo - Hook to access repository context.
 * Must be used within a RepoProvider.
 */
export function useRepo(): RepoContextValue {
  const context = useContext(RepoContext);
  if (!context) {
    // During React Fast Refresh (HMR), context identity can break when
    // createContext() re-executes in the updated module. The Provider still
    // holds the old context reference while consumers get the new one.
    // Force a full page reload instead of crashing with a white screen.
    if (import.meta.hot) {
      import.meta.hot.invalidate('RepoContext identity changed during HMR');
      return {} as RepoContextValue;
    }
    throw new Error('useRepo must be used within a RepoProvider');
  }
  return context;
}
