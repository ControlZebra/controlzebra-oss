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
 * 
 * Provides actions for:
 * - Opening repositories
 * - Committing changes
 * - Syncing with remote
 * - Viewing diffs
 * - Branch switching/creation
 * - Undo last commit (ResetSoftHead)
 * - Discard changes
 */
import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { 
  DetectRepo, 
  Status, 
  CommitAll, 
  Sync, 
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
  StartMerge,
  ResolveConflictKeepOurs,
  ResolveConflictKeepTheirs,
  ResolveConflictKeepBoth,
  AbortMerge,
  CompleteMerge,
  GetConflictSidesInfo,
} from '../../bindings/changeme/services/gitservice';
import { SyncWithProgress } from '../../bindings/changeme/services/progressservice';
import { GetAppSettings, SaveAppSettings } from '../../bindings/changeme/services/settingsservice';
import { Events } from '@wailsio/runtime';
import { addRecentFolder } from '../lib/recentFolders';

const RepoContext = createContext(null);

// Polling interval for status updates (in ms)
const STATUS_POLL_INTERVAL = 3000;

export function RepoProvider({ children }) {
  // ===== Repository State =====
  const [repoPath, setRepoPath] = useState(null);
  const [repoInfo, setRepoInfo] = useState(null);
  const [repoStatus, setRepoStatus] = useState(null);
  const [graphCommits, setGraphCommits] = useState([]); // Commits with parent hashes and refs for git graph
  const [branches, setBranches] = useState(null);
  
  // ===== Selection State (v2) =====
  const [selectedFileIndex, setSelectedFileIndex] = useState(null);
  const [selectedCommit, setSelectedCommit] = useState(null); // CommitDetail object
  const [selectedCommitFile, setSelectedCommitFile] = useState(null); // File path in commit
  const [currentDiff, setCurrentDiff] = useState(null); // FileDiff object
  
  // ===== Conflict State (v2 Merge Changes) =====
  const [conflictedFiles, setConflictedFiles] = useState([]);
  const [selectedConflictFile, setSelectedConflictFile] = useState(null);
  const [conflictCheckResult, setConflictCheckResult] = useState(null); // Full result from CheckBranchConflicts
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [detectedParentBranch, setDetectedParentBranch] = useState(null); // Auto-detected parent branch info
  const [fileResolutions, setFileResolutions] = useState({}); // { [filePath]: 'mine' | 'theirs' | 'both' }
  const [mergeState, setMergeState] = useState(null); // Current merge state from backend
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const [conflictSidesInfo, setConflictSidesInfo] = useState(null); // Commit info for both sides of conflict
  
  // ===== Loading States =====
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  
  // ===== Progress Modal State =====
  const [progressModal, setProgressModal] = useState({
    isOpen: false,
    operationId: null,
    title: '',
  });
  
  // ===== Refs =====
  const pollIntervalRef = useRef(null);
  const operationIdCounter = useRef(0);

  // Show a toast notification using sonner
  // Maps our type names to sonner toast methods
  const showMessage = useCallback((type, text, duration = 5000) => {
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
  const refreshStatus = useCallback(async () => {
    if (!repoPath) return;
    
    try {
      const status = await Status(repoPath);
      if (status.hasError) {
        console.error('Status error:', status.error);
        return;
      }
      setRepoStatus(status);
      
      // Update repoInfo.branch if it changed (e.g., after branch switch)
      if (status.branch && status.branch !== repoInfo?.branch) {
        setRepoInfo(prev => prev ? { ...prev, branch: status.branch } : prev);
      }
    } catch (err) {
      console.error('Failed to refresh status:', err);
    }
  }, [repoPath, repoInfo?.branch]);

  // Fetch commits with graph data (parent hashes and refs) for git graph visualization
  const refreshCommits = useCallback(async () => {
    if (!repoPath) return;
    
    try {
      const result = await GetCommitGraph(repoPath, 50);
      if (result.hasError) {
        console.error('Failed to fetch graph commits:', result.error);
        return;
      }
      setGraphCommits(result.commits || []);
    } catch (err) {
      console.error('Failed to fetch graph commits:', err);
    }
  }, [repoPath]);

  // Refresh all repository data
  const refreshAll = useCallback(async () => {
    await Promise.all([refreshStatus(), refreshCommits()]);
  }, [refreshStatus, refreshCommits]);

  // Open a folder by path (may or may not be a git repo)
  const openRepo = useCallback(async (path) => {
    // Prevent duplicate calls while already loading
    if (isLoading) return false;
    // Skip if already open at this path
    if (path === repoPath) return true;
    
    setIsLoading(true);
    setSelectedFileIndex(null);
    
    try {
      const info = await DetectRepo(path);
      
      // Allow opening non-git folders - just track that it's not a repo
      setRepoPath(path);
      setRepoInfo(info);
      
      // Add to recent folders list (localStorage)
      addRecentFolder(path);
      
      // Persist last opened folder to settings
      try {
        await SaveAppSettings({ lastRepoPath: path, theme: 'dark' });
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
      
      const folderName = path.split('/').pop();
      if (info.isRepo) {
        showMessage('success', `Opened repository: ${folderName}`);
      } else {
        showMessage('info', `Opened folder: ${folderName} (no version control)`);
      }
      
      setIsLoading(false);
      return true;
    } catch (err) {
      showMessage('error', `Failed to open folder: ${err.message || err}`);
      setIsLoading(false);
      return false;
    }
  }, [isLoading, repoPath, showMessage]);

  // Initialize git in current folder
  const initializeGitRepo = useCallback(async () => {
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
      
      // Re-detect the repo to get updated info
      const info = await DetectRepo(repoPath);
      setRepoInfo(info);
      
      showMessage('success', 'Version control initialized successfully');
      setIsLoading(false);
      return true;
    } catch (err) {
      showMessage('error', `Failed to initialize: ${err.message || err}`);
      setIsLoading(false);
      return false;
    }
  }, [repoPath, repoInfo, showMessage]);

  // Close the current repository
  const closeRepo = useCallback(async () => {
    // Clear all repo state
    setRepoPath(null);
    setRepoInfo(null);
    setRepoStatus(null);
    setGraphCommits([]);
    setBranches(null);
    setSelectedFileIndex(null);
    setSelectedCommit(null);
    setSelectedCommitFile(null);
    setCurrentDiff(null);
    
    // Stop polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    // Clear last opened repo from settings
    try {
      await SaveAppSettings({ lastRepoPath: '', theme: 'dark' });
    } catch (err) {
      console.error('Failed to clear settings:', err);
    }
  }, []);

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
    // NOTE: openRepo is intentionally omitted to run only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start polling when git repo is open
  useEffect(() => {
    // Only poll for git repos
    if (repoPath && repoInfo?.isRepo) {
      // Initial fetch
      refreshAll();
      
      // Start polling for status updates
      pollIntervalRef.current = setInterval(refreshStatus, STATUS_POLL_INTERVAL);
      
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
  }, [repoPath, repoInfo?.isRepo, refreshAll, refreshStatus]);

  // Reset conflict check state when local changes are detected
  // This ensures users re-check for conflicts after making new changes
  useEffect(() => {
    if (repoStatus?.hasChanges && conflictCheckResult) {
      // If we have a conflict check result and new local changes are detected,
      // clear the conflict state to force a re-check
      setConflictCheckResult(null);
      setConflictedFiles([]);
      setSelectedConflictFile(null);
      setFileResolutions({});
      setMergeState(null);
      setConflictSidesInfo(null);
      // Keep detectedParentBranch so user doesn't have to re-select
    }
  }, [repoStatus?.hasChanges, conflictCheckResult]);

  // Listen for folder-selected event from native menu
  useEffect(() => {
    const unsubscribe = Events.On('folder-selected', async (event) => {
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

  // Commit all changes with message
  const commitChanges = useCallback(async (message) => {
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
      showMessage('error', `Failed to save: ${err.message || err}`);
      setIsCommitting(false);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

  // Generate unique operation ID
  const generateOperationId = useCallback(() => {
    operationIdCounter.current += 1;
    return `op-${Date.now()}-${operationIdCounter.current}`;
  }, []);

  // Close progress modal
  const closeProgressModal = useCallback(() => {
    setProgressModal({ isOpen: false, operationId: null, title: '' });
  }, []);

  // Handle progress modal completion
  const handleProgressComplete = useCallback((success, error) => {
    closeProgressModal();
    setIsSyncing(false);
    
    if (success) {
      showMessage('success', 'Synced successfully');
      refreshAll();
    } else if (error) {
      showMessage('error', error);
    }
  }, [closeProgressModal, showMessage, refreshAll]);

  // Sync repository with progress (pull --rebase + push)
  const syncRepo = useCallback(async () => {
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
      // This runs the operation; progress events come via the event system
      const result = await SyncWithProgress(repoPath, operationId);
      
      // The modal will handle completion via the progress events
      // But we check exit code here as a safety net
      if (!result.success) {
        // Progress modal will show the error, but ensure we capture it
        return false;
      }
      
      return true;
    } catch (err) {
      // In case of unexpected error, close modal and show error
      closeProgressModal();
      setIsSyncing(false);
      showMessage('error', `Sync failed: ${err.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, generateOperationId, closeProgressModal]);

  // ===== v2: Diff Operations =====
  
  // Load diff for a working tree file (changed file in ExplorerView)
  // Uses DiffWorkingRaw to get raw unified diff text for react-diff-view
  const loadWorkingDiff = useCallback(async (filePath) => {
    if (!repoPath || !filePath) {
      setCurrentDiff(null);
      return;
    }
    
    setIsDiffLoading(true);
    setSelectedCommit(null); // Clear commit selection when viewing working changes
    setSelectedCommitFile(null);
    
    try {
      const diff = await DiffWorkingRaw(repoPath, filePath);
      setCurrentDiff(diff);
    } catch (err) {
      console.error('Failed to load diff:', err);
      setCurrentDiff({ hasError: true, error: err.message || 'Failed to load diff' });
    } finally {
      setIsDiffLoading(false);
    }
  }, [repoPath]);

  // Load commit details when a commit is selected in HistoryView
  const selectCommit = useCallback(async (commitHash) => {
    if (!repoPath || !commitHash) {
      setSelectedCommit(null);
      setCurrentDiff(null);
      return;
    }
    
    setIsDiffLoading(true);
    setSelectedFileIndex(null); // Clear working file selection
    setSelectedCommitFile(null);
    setCurrentDiff(null);
    
    try {
      const detail = await ShowCommit(repoPath, commitHash);
      if (detail.hasError) {
        showMessage('error', detail.error || 'Failed to load commit');
        setSelectedCommit(null);
      } else {
        setSelectedCommit(detail);
      }
    } catch (err) {
      console.error('Failed to load commit:', err);
      showMessage('error', `Failed to load commit: ${err.message || err}`);
      setSelectedCommit(null);
    } finally {
      setIsDiffLoading(false);
    }
  }, [repoPath, showMessage]);

  // Load diff for a file within a selected commit
  // Uses DiffCommitFileRaw to get raw unified diff text for react-diff-view
  const loadCommitFileDiff = useCallback(async (filePath) => {
    if (!repoPath || !selectedCommit || !filePath) {
      return;
    }
    
    setIsDiffLoading(true);
    setSelectedCommitFile(filePath);
    
    try {
      const diff = await DiffCommitFileRaw(repoPath, selectedCommit.hash, filePath);
      setCurrentDiff(diff);
    } catch (err) {
      console.error('Failed to load commit file diff:', err);
      setCurrentDiff({ hasError: true, error: err.message || 'Failed to load diff' });
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

  // ===== v2: Branch Operations =====
  
  // Fetch branches
  const refreshBranches = useCallback(async () => {
    if (!repoPath) return;
    
    try {
      const branchList = await Branches(repoPath);
      if (!branchList.hasError) {
        setBranches(branchList);
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err);
    }
  }, [repoPath]);

  // Switch to existing branch
  const switchBranch = useCallback(async (branchName) => {
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
      showMessage('error', `Failed to switch branch: ${err.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, clearSelection, refreshAll, refreshBranches]);

  // Create new branch and switch to it
  const createBranch = useCallback(async (branchName) => {
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
      showMessage('error', `Failed to create branch: ${err.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, clearSelection, refreshAll, refreshBranches]);

  // Create new branch, switch to it, and commit changes
  // This is a compound action that combines stash → branch → pop → commit
  const branchAndCommit = useCallback(async (branchName, message) => {
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
      // Step 1: Stash changes and switch to new branch
      const switchResult = await StashAndSwitchBranch(repoPath, branchName.trim(), true);
      
      if (!switchResult.success) {
        showMessage('error', switchResult.error || 'Failed to create branch and move changes');
        return false;
      }
      
      // Step 2: Commit the changes (they are now staged after stash pop)
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
      showMessage('error', `Failed: ${err.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, clearSelection, refreshAll, refreshBranches]);

  // ===== v2: Recovery Operations =====
  
  // Undo last commit (keeps changes staged)
  const undoLastCommit = useCallback(async () => {
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
      showMessage('error', `Failed to undo: ${err.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, clearSelection, refreshAll]);

  // Discard all changes
  const discardAllChanges = useCallback(async () => {
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
      showMessage('error', `Failed to discard: ${err.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, clearSelection, refreshAll]);

  // Rewind to last snapshot (git reset --hard HEAD)
  const rewindToLastSnapshot = useCallback(async () => {
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
      showMessage('error', `Failed to rewind: ${err.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, clearSelection, refreshAll]);

  // Discard changes to a single file
  const discardFileChanges = useCallback(async (filePath) => {
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
      showMessage('error', `Failed to discard: ${err.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, refreshStatus]);

  // Check for merge conflicts against a parent branch
  // Pass empty string to auto-detect parent branch
  const checkBranchConflicts = useCallback(async (parentBranch = '') => {
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
      // Pass empty string to trigger auto-detect on backend
      const result = await CheckBranchConflicts(repoPath, parentBranch);
      
      setConflictCheckResult(result);
      
      // Store detected parent branch if returned
      if (result.parentBranch) {
        setDetectedParentBranch({
          name: result.parentBranch,
          source: result.parentBranchSource || 'auto-detected',
        });
        
        // Fetch commit info for both sides of the conflict
        try {
          const sidesInfo = await GetConflictSidesInfo(repoPath, result.parentBranch);
          if (sidesInfo.success) {
            setConflictSidesInfo(sidesInfo);
          }
        } catch (sidesErr) {
          console.error('Failed to get conflict sides info:', sidesErr);
        }
      }
      
      if (!result.success) {
        showMessage('error', result.error || 'Failed to check conflicts');
        setIsCheckingConflicts(false);
        return result;
      }
      
      if (result.hasConflicts) {
        // Actually start the merge so we're in a real merge state
        // This allows resolution commands (checkout --ours/--theirs) to work
        console.log('[checkBranchConflicts] Starting merge with parent:', result.parentBranch);
        const mergeResult = await StartMerge(repoPath, result.parentBranch);
        console.log('[checkBranchConflicts] StartMerge result:', mergeResult);
        
        if (!mergeResult.success) {
          // Error is in 'error' field, not 'message' field
          const errorMsg = mergeResult.error || mergeResult.message || 'Failed to start merge';
          showMessage('error', errorMsg);
          // Clear conflict state since we couldn't start the merge
          // This prevents the UI from showing resolvable conflicts when there's no merge
          setConflictCheckResult({
            ...result,
            success: false,
            error: errorMsg,
          });
          setIsCheckingConflicts(false);
          return null;
        }
        
        // Refresh conflicted files from actual merge state
        const mergeState = await GetMergeState(repoPath);
        console.log('[checkBranchConflicts] Merge state after start:', mergeState);
        
        if (mergeState.hasConflicts) {
          // Re-fetch the actual conflicted files from the merge
          const actualConflicts = await GetConflictedFiles(repoPath);
          console.log('[checkBranchConflicts] Actual conflicts:', actualConflicts);
          setConflictedFiles(actualConflicts || result.conflictedFiles || []);
        } else {
          setConflictedFiles(result.conflictedFiles || []);
        }
        
        const parentInfo = result.parentBranch ? ` against ${result.parentBranch}` : '';
        showMessage('info', `Merge started with ${result.conflictedFiles?.length || 0} conflict(s)${parentInfo}`);
      } else {
        // conflictedFiles already cleared at start of function
        const parentInfo = result.parentBranch ? ` with ${result.parentBranch}` : '';
        showMessage('success', result.message || `No conflicts detected${parentInfo} - clean merge possible`);
      }
      
      setIsCheckingConflicts(false);
      return result;
    } catch (err) {
      showMessage('error', `Failed to check conflicts: ${err.message || err}`);
      setIsCheckingConflicts(false);
      return null;
    }
  }, [repoPath, showMessage]);

  // Get parent branch info (for display or pre-selection)
  const fetchParentBranch = useCallback(async () => {
    if (!repoPath) return null;
    
    try {
      const result = await GetParentBranch(repoPath);
      if (result.parentBranch) {
        setDetectedParentBranch({
          name: result.parentBranch,
          source: result.source || 'auto-detected',
        });
        return result;
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

  // Set resolution strategy for a file (doesn't apply it yet)
  const setFileResolution = useCallback((filePath, strategy) => {
    setFileResolutions(prev => ({
      ...prev,
      [filePath]: strategy, // 'mine' | 'theirs' | 'both'
    }));
  }, []);

  // Apply resolution for a single file
  const resolveConflict = useCallback(async (filePath, strategy) => {
    if (!repoPath || !filePath) {
      showMessage('error', 'Invalid file path');
      return false;
    }

    console.log('[resolveConflict] Starting resolution:', { repoPath, filePath, strategy });
    
    setIsResolvingConflict(true);
    try {
      let result;
      if (strategy === 'mine') {
        result = await ResolveConflictKeepOurs(repoPath, filePath);
      } else if (strategy === 'theirs') {
        result = await ResolveConflictKeepTheirs(repoPath, filePath);
      } else if (strategy === 'both') {
        // 'both' strategy - keep both versions, rename one as _COPY
        result = await ResolveConflictKeepBoth(repoPath, filePath);
      } else {
        showMessage('error', 'Invalid resolution strategy');
        setIsResolvingConflict(false);
        return false;
      }

      console.log('[resolveConflict] Result:', result);

      if (!result.success) {
        // Error message is in 'error' field, not 'message' field
        showMessage('error', result.error || result.message || 'Failed to resolve conflict');
        setIsResolvingConflict(false);
        return false;
      }

      // Update local state
      setFileResolutions(prev => ({
        ...prev,
        [filePath]: strategy,
      }));

      showMessage('success', result.message || `Resolved "${filePath.split('/').pop()}"`);
      setIsResolvingConflict(false);
      return true;
    } catch (err) {
      showMessage('error', `Failed to resolve: ${err.message || err}`);
      setIsResolvingConflict(false);
      return false;
    }
  }, [repoPath, showMessage]);

  // Apply all pending resolutions
  const applyAllResolutions = useCallback(async () => {
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
  const abortMerge = useCallback(async () => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }

    console.log('[abortMerge] Aborting merge...');

    try {
      const result = await AbortMerge(repoPath);
      console.log('[abortMerge] Result:', result);
      
      if (!result.success) {
        // Error is in 'error' field, not 'message'
        showMessage('error', result.error || result.message || 'Failed to abort merge');
        return false;
      }

      showMessage('success', result.message || 'Merge aborted');
      clearConflicts();
      await refreshStatus();
      return true;
    } catch (err) {
      console.error('[abortMerge] Exception:', err);
      showMessage('error', `Failed to abort merge: ${err.message || err}`);
      return false;
    }
  }, [repoPath, showMessage, clearConflicts, refreshStatus]);

  // Complete the merge with a commit message
  const completeMerge = useCallback(async (message) => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }

    // Check if all conflicts are resolved (local state)
    const unresolvedCount = conflictedFiles.filter(f => !fileResolutions[f.path]).length;
    if (unresolvedCount > 0) {
      showMessage('error', `${unresolvedCount} file(s) still need resolution`);
      return false;
    }

    console.log('[completeMerge] Starting merge completion with message:', message);

    // Store parent branch before clearing conflicts
    const parentBranchName = detectedParentBranch?.name;

    try {
      const result = await CompleteMerge(repoPath, message || '');
      console.log('[completeMerge] Result:', result);
      
      if (!result.success) {
        // Error is in 'error' field, not 'message'
        showMessage('error', result.error || result.message || 'Failed to complete merge');
        return false;
      }

      showMessage('success', result.message || 'Merge completed successfully');
      clearConflicts();
      clearSelection();
      await refreshAll();
      await refreshBranches();

      // After successful merge, checkout to the parent branch
      if (parentBranchName) {
        console.log('[completeMerge] Switching to parent branch:', parentBranchName);
        try {
          const checkoutResult = await CheckoutBranch(repoPath, parentBranchName);
          if (checkoutResult.success) {
            showMessage('success', `Switched to ${parentBranchName}`);
            await refreshAll();
            await refreshBranches();
          } else {
            console.error('[completeMerge] Failed to switch to parent branch:', checkoutResult.error);
          }
        } catch (checkoutErr) {
          console.error('[completeMerge] Error switching to parent branch:', checkoutErr);
        }
      }

      return true;
    } catch (err) {
      console.error('[completeMerge] Exception:', err);
      showMessage('error', `Failed to complete merge: ${err.message || err}`);
      return false;
    }
  }, [repoPath, conflictedFiles, fileResolutions, showMessage, clearConflicts, clearSelection, refreshAll, refreshBranches, detectedParentBranch]);

  // Refresh merge state from backend
  const refreshMergeState = useCallback(async () => {
    if (!repoPath) return null;
    
    try {
      const state = await GetMergeState(repoPath);
      setMergeState(state);
      return state;
    } catch (err) {
      console.error('Failed to get merge state:', err);
      return null;
    }
  }, [repoPath]);

  // Also refresh branches when repo changes
  useEffect(() => {
    if (repoPath) {
      refreshBranches();
    }
  }, [repoPath, refreshBranches]);

  // Memoized context value
  const value = useMemo(() => ({
    // State
    repoPath,
    repoInfo,
    repoStatus,
    commits: graphCommits, // Alias for backward compatibility
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
    checkBranchConflicts,
    clearConflicts,
    detectedParentBranch,
    fetchParentBranch,
    conflictSidesInfo,
    
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
    conflictedFiles, selectedConflictFile, conflictCheckResult, isCheckingConflicts, checkBranchConflicts, clearConflicts,
    detectedParentBranch, fetchParentBranch, conflictSidesInfo,
    fileResolutions, setFileResolution, mergeState, isResolvingConflict,
    resolveConflict, applyAllResolutions, abortMerge, completeMerge, refreshMergeState,
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
export function useRepo() {
  const context = useContext(RepoContext);
  if (!context) {
    throw new Error('useRepo must be used within a RepoProvider');
  }
  return context;
}
