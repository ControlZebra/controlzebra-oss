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
  CompleteSquashMerge,
  GetConflictSidesInfo,
  AbortCurrentOperation,
  AbortCherryPick,
  ContinueCherryPick,
  SkipCherryPickCommit,
  AbortRevert,
  ContinueRevert,
  SkipRevertCommit,
  AbortBisect,
  GetBisectState,
  AbortAM,
  SkipAMPatch,
  CreateBranchFromDetached,
  RemoveAllStaleLocks,
} from '../../bindings/controlzebra/services/gitservice';
import { SyncWithProgress } from '../../bindings/controlzebra/services/progressservice';
import { GetAppSettings, SaveAppSettings } from '../../bindings/controlzebra/services/settingsservice';
import { WatchDirectory, StopWatching } from '../../bindings/controlzebra/services/filewatcherservice';
import { Events } from '@wailsio/runtime';
import { addRecentFolder } from '../lib/recentFolders';

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
} from './RepoContext.types';

// Polling interval for status updates (in ms)
const STATUS_POLL_INTERVAL = 30000;

// Create context with null default
const RepoContext = createContext<RepoContextValue | null>(null);

export function RepoProvider({ children }: RepoProviderProps) {
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
  
  // ===== Progress Modal State =====
  const [progressModal, setProgressModal] = useState<ProgressModalState>({
    isOpen: false,
    operationId: null,
    title: '',
  });
  
  // ===== Refs =====
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const operationIdCounter = useRef(0);

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

  // ===== Repo Operations =====

  // Open a folder by path
  const openRepo = useCallback(async (path: string): Promise<boolean> => {
    if (isLoading) return false;
    if (path === repoPath) return true;
    
    setIsLoading(true);
    setSelectedFileIndex(null);
    
    try {
      const info = await DetectRepo(path);
      
      setRepoPath(path);
      setRepoInfo(info as RepoInfo);
      addRecentFolder(path);
      
      try {
        await SaveAppSettings({ lastRepoPath: path, theme: 'dark' });
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
      
      const folderName = path.split('/').pop();
      if (info.isRepo) {
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
      }
      
      try {
        await WatchDirectory(path);
      } catch (err) {
        console.error('Failed to start file watcher:', err);
      }
      
      setIsLoading(false);
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to open folder: ${error.message || err}`);
      setIsLoading(false);
      return false;
    }
  }, [isLoading, repoPath, showMessage]);

  // Initialize git in current folder
  const initializeGitRepo = useCallback(async (): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No folder open');
      return false;
    }
    
    if (repoInfo?.isRepo) {
      showMessage('info', 'Folder is already a Git repository');
      return true;
    }
    
    setIsLoading(true);
    
    try {
      const result = await InitRepo(repoPath);
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to initialize repository');
        setIsLoading(false);
        return false;
      }
      
      const info = await DetectRepo(repoPath);
      setRepoInfo(info as RepoInfo);
      
      showMessage('success', 'Version control initialized successfully');
      setIsLoading(false);
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to initialize: ${error.message || err}`);
      setIsLoading(false);
      return false;
    }
  }, [repoPath, repoInfo, showMessage]);

  // Close the current repository
  const closeRepo = useCallback(async (): Promise<void> => {
    setRepoPath(null);
    setRepoInfo(null);
    setRepoStatus(null);
    setGraphCommits([]);
    setBranches(null);
    setSelectedFileIndex(null);
    setSelectedCommit(null);
    setSelectedCommitFile(null);
    setCurrentDiff(null);
    
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
      await SaveAppSettings({ lastRepoPath: '', theme: 'dark' });
    } catch (err) {
      console.error('Failed to clear settings:', err);
    }
  }, []);

  // ===== Commit & Sync Operations =====

  // Commit all changes with message
  const commitChanges = useCallback(async (message: string): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    
    if (!message || !message.trim()) {
      showMessage('error', 'Commit message is required');
      return false;
    }
    
    setIsCommitting(true);
    
    try {
      const result = await CommitAll(repoPath, message);
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to save changes');
        setIsCommitting(false);
        return false;
      }
      
      showMessage('success', 'Changes saved successfully');
      await refreshAll();
      setIsCommitting(false);
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to save: ${error.message || err}`);
      setIsCommitting(false);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

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
    closeProgressModal();
    setIsSyncing(false);
    
    if (success) {
      showMessage('success', 'Synced successfully');
      refreshAll();
    } else if (error) {
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
    
    setIsSyncing(true);
    setProgressModal({
      isOpen: true,
      operationId,
      title: 'Syncing with remote',
    });
    
    try {
      const result = await SyncWithProgress(repoPath, operationId);
      
      if (!result.success) {
        return false;
      }
      
      return true;
    } catch (err) {
      const error = err as Error;
      closeProgressModal();
      setIsSyncing(false);
      showMessage('error', `Sync failed: ${error.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, generateOperationId, closeProgressModal]);

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
    
    try {
      const result = await CheckoutBranch(repoPath, branchName);
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to switch branch');
        return false;
      }
      
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
  }, [repoPath, showMessage, clearSelection, refreshAll, refreshBranches]);

  // Create new branch and switch to it
  const createBranch = useCallback(async (branchName: string): Promise<boolean> => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    
    try {
      const result = await CreateBranchAndCheckout(repoPath, branchName);
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to create branch');
        return false;
      }
      
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
  }, [repoPath, showMessage, clearSelection, refreshAll, refreshBranches]);

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
  }, [repoPath, showMessage, clearSelection, refreshAll, refreshBranches]);

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
    
    try {
      const result = await DiscardAll(repoPath, true);
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to discard changes');
        return false;
      }
      
      showMessage('success', result.message || 'All changes discarded');
      clearSelection();
      await refreshAll();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to discard: ${error.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, clearSelection, refreshAll]);

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

    try {
      const result = await AbortMerge(repoPath);
      
      if (!result.success) {
        showMessage('error', result.error || result.message || 'Failed to abort merge');
        return false;
      }

      showMessage('success', result.message || 'Merge aborted');
      clearConflicts();
      await refreshStatus();
      return true;
    } catch (err) {
      const error = err as Error;
      showMessage('error', `Failed to abort merge: ${error.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, clearConflicts, refreshStatus]);

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

    const isSquash = conflictCheckResult?.isSquashMerge ?? isSquashMerge;
    const parentBranchName = detectedParentBranch?.name;

    try {
      let result;
      
      if (isSquash) {
        result = await CompleteSquashMerge(repoPath, message || '');
      } else {
        result = await CompleteMerge(repoPath, message || '');
      }
      
      if (!result.success) {
        showMessage('error', result.error || result.message || 'Failed to complete merge');
        return false;
      }

      const successMsg = isSquash ? 'Squash merge completed successfully' : 'Merge completed successfully';
      showMessage('success', result.message || successMsg);
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
  }, [repoPath, conflictedFiles, fileResolutions, conflictCheckResult, isSquashMerge, showMessage, clearConflicts, clearSelection, refreshAll, refreshBranches, detectedParentBranch]);

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

  // ===== Effects =====

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
    
    const handleFilesChanged = () => {
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
  }, [repoPath, repoInfo?.isRepo, refreshStatus]);

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
        await openRepo(event.data);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [openRepo]);

  // Listen for folder-closed event from native menu
  useEffect(() => {
    const unsubscribe = Events.On('folder-closed', async () => {
      await closeRepo();
    });
    
    return () => {
      unsubscribe();
    };
  }, [closeRepo]);

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
    
    // Progress modal state
    progressModal,
    handleProgressComplete,
    
    // Feedback
    showMessage,
    
    // Actions
    openRepo,
    closeRepo,
    initializeGitRepo,
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
    abortRevert,
    continueRevert,
    skipRevertCommit,
    abortBisect,
    getBisectState,
    abortAM,
    skipAMPatch,
    createBranchFromDetached,
    removeAllStaleLocks,
  }), [
    repoPath, repoInfo, repoStatus, graphCommits, branches, selectedFileIndex,
    selectedCommit, selectedCommitFile, currentDiff,
    isLoading, isSyncing, isCommitting, isDiffLoading,
    progressModal, handleProgressComplete,
    showMessage,
    openRepo, closeRepo, initializeGitRepo, commitChanges, syncRepo, refreshStatus, refreshCommits, refreshAll,
    loadWorkingDiff, selectCommit, loadCommitFileDiff, clearSelection,
    refreshBranches, switchBranch, createBranch, branchAndCommit,
    undoLastCommit, discardAllChanges, discardFileChanges, rewindToLastSnapshot,
    conflictedFiles, selectedConflictFile, conflictCheckResult, isCheckingConflicts, 
    checkConflictsOnly, startMerge, checkBranchConflicts, clearConflicts,
    detectedParentBranch, fetchParentBranch, conflictSidesInfo,
    isSquashMerge,
    fileResolutions, setFileResolution, mergeState, isResolvingConflict,
    resolveConflict, applyAllResolutions, abortMerge, completeMerge, refreshMergeState,
    abortCurrentOperation,
    abortCherryPick, continueCherryPick, skipCherryPickCommit,
    abortRevert, continueRevert, skipRevertCommit,
    abortBisect, getBisectState,
    abortAM, skipAMPatch,
    createBranchFromDetached,
    removeAllStaleLocks,
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
    throw new Error('useRepo must be used within a RepoProvider');
  }
  return context;
}
