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
import { 
  DetectRepo, 
  Status, 
  CommitAll, 
  Sync, 
  GetRecentCommits,
  ShowCommit,
  DiffWorking,
  DiffCommitFile,
  Branches,
  CheckoutBranch,
  CreateBranchAndCheckout,
  ResetSoftHead,
  DiscardAll,
  DiscardFile,
} from '../../bindings/changeme/services/gitservice';
import { GetAppSettings, SaveAppSettings } from '../../bindings/changeme/services/settingsservice';
import { Events } from '@wailsio/runtime';

const RepoContext = createContext(null);

// Polling interval for status updates (in ms)
const STATUS_POLL_INTERVAL = 3000;

export function RepoProvider({ children }) {
  // ===== Repository State =====
  const [repoPath, setRepoPath] = useState(null);
  const [repoInfo, setRepoInfo] = useState(null);
  const [repoStatus, setRepoStatus] = useState(null);
  const [commits, setCommits] = useState([]);
  const [branches, setBranches] = useState(null);
  
  // ===== Selection State (v2) =====
  const [selectedFileIndex, setSelectedFileIndex] = useState(null);
  const [selectedCommit, setSelectedCommit] = useState(null); // CommitDetail object
  const [selectedCommitFile, setSelectedCommitFile] = useState(null); // File path in commit
  const [currentDiff, setCurrentDiff] = useState(null); // FileDiff object
  
  // ===== Loading States =====
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  
  // ===== Feedback Messages =====
  // Format: { type: 'success' | 'error' | 'info', text: string }
  const [statusMessage, setStatusMessage] = useState(null);
  
  // ===== Refs =====
  const pollIntervalRef = useRef(null);

  // Clear status message
  const clearStatusMessage = useCallback(() => {
    setStatusMessage(null);
  }, []);

  // Show a temporary status message
  const showMessage = useCallback((type, text, duration = 5000) => {
    setStatusMessage({ type, text });
    if (duration > 0) {
      setTimeout(() => setStatusMessage(null), duration);
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
    } catch (err) {
      console.error('Failed to refresh status:', err);
    }
  }, [repoPath]);

  // Fetch recent commits
  const refreshCommits = useCallback(async () => {
    if (!repoPath) return;
    
    try {
      const recentCommits = await GetRecentCommits(repoPath, 50);
      setCommits(recentCommits || []);
    } catch (err) {
      console.error('Failed to fetch commits:', err);
    }
  }, [repoPath]);

  // Refresh all repository data
  const refreshAll = useCallback(async () => {
    await Promise.all([refreshStatus(), refreshCommits()]);
  }, [refreshStatus, refreshCommits]);

  // Open a repository by path
  const openRepo = useCallback(async (path) => {
    setIsLoading(true);
    setSelectedFileIndex(null);
    
    try {
      const info = await DetectRepo(path);
      
      if (!info.isRepo) {
        showMessage('error', info.error || 'Not a valid Git repository');
        setIsLoading(false);
        return false;
      }
      
      setRepoPath(path);
      setRepoInfo(info);
      
      // Persist last opened repo to settings
      try {
        await SaveAppSettings({ lastRepoPath: path, theme: 'dark' });
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
      
      showMessage('success', `Opened repository: ${path.split('/').pop()}`);
      setIsLoading(false);
      return true;
    } catch (err) {
      showMessage('error', `Failed to open repository: ${err.message || err}`);
      setIsLoading(false);
      return false;
    }
  }, [showMessage]);

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

  // Start polling when repo is open
  useEffect(() => {
    if (repoPath) {
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
  }, [repoPath, refreshAll, refreshStatus]);

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

  // Sync repository (pull --rebase + push)
  const syncRepo = useCallback(async () => {
    if (!repoPath) {
      showMessage('error', 'No repository open');
      return false;
    }
    
    setIsSyncing(true);
    
    try {
      const result = await Sync(repoPath);
      
      if (!result.success) {
        showMessage('error', result.error || 'Sync failed');
        setIsSyncing(false);
        return false;
      }
      
      showMessage('success', result.message || 'Synced successfully');
      await refreshAll();
      setIsSyncing(false);
      return true;
    } catch (err) {
      showMessage('error', `Sync failed: ${err.message || err}`);
      setIsSyncing(false);
      return false;
    }
  }, [repoPath, showMessage, refreshAll]);

  // ===== v2: Diff Operations =====
  
  // Load diff for a working tree file (changed file in ChangesView)
  const loadWorkingDiff = useCallback(async (filePath) => {
    if (!repoPath || !filePath) {
      setCurrentDiff(null);
      return;
    }
    
    setIsDiffLoading(true);
    setSelectedCommit(null); // Clear commit selection when viewing working changes
    setSelectedCommitFile(null);
    
    try {
      const diff = await DiffWorking(repoPath, filePath);
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
  const loadCommitFileDiff = useCallback(async (filePath) => {
    if (!repoPath || !selectedCommit || !filePath) {
      return;
    }
    
    setIsDiffLoading(true);
    setSelectedCommitFile(filePath);
    
    try {
      const diff = await DiffCommitFile(repoPath, selectedCommit.hash, filePath);
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
    commits,
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
    
    // Feedback
    statusMessage,
    showMessage,
    clearStatusMessage,
    
    // Actions
    openRepo,
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
    
    // v2: Recovery actions
    undoLastCommit,
    discardAllChanges,
    discardFileChanges,
  }), [
    repoPath, repoInfo, repoStatus, commits, branches, selectedFileIndex,
    selectedCommit, selectedCommitFile, currentDiff,
    isLoading, isSyncing, isCommitting, isDiffLoading,
    statusMessage, showMessage, clearStatusMessage,
    openRepo, commitChanges, syncRepo, refreshStatus, refreshCommits, refreshAll,
    loadWorkingDiff, selectCommit, loadCommitFileDiff, clearSelection,
    refreshBranches, switchBranch, createBranch,
    undoLastCommit, discardAllChanges, discardFileChanges,
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
