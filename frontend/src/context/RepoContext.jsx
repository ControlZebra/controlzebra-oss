import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { DetectRepo, Status, CommitAll, Sync, GetRecentCommits } from '../../bindings/changeme/services/gitservice';
import { GetAppSettings, SaveAppSettings } from '../../bindings/changeme/services/settingsservice';
import { Events } from '@wailsio/runtime';

const RepoContext = createContext(null);

// Polling interval for status updates (in ms)
const STATUS_POLL_INTERVAL = 3000;

export function RepoProvider({ children }) {
  // Repo state
  const [repoPath, setRepoPath] = useState(null);
  const [repoInfo, setRepoInfo] = useState(null);
  const [repoStatus, setRepoStatus] = useState(null);
  const [commits, setCommits] = useState([]);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  
  // Feedback messages
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error' | 'info', text: string }
  
  // Selection state
  const [selectedFileIndex, setSelectedFileIndex] = useState(null);
  
  // Polling ref
  const pollIntervalRef = useRef(null);

  // Clear status message function
  const clearStatusMessage = useCallback(() => {
    setStatusMessage(null);
  }, []);

  // Clear status message after delay
  const showMessage = useCallback((type, text, duration = 5000) => {
    setStatusMessage({ type, text });
    if (duration > 0) {
      setTimeout(() => setStatusMessage(null), duration);
    }
  }, []);

  // Load last repo from settings on mount
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
  }, []);

  // Fetch repo status
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

  // Fetch commits
  const refreshCommits = useCallback(async () => {
    if (!repoPath) return;
    
    try {
      const recentCommits = await GetRecentCommits(repoPath, 50);
      setCommits(recentCommits || []);
    } catch (err) {
      console.error('Failed to fetch commits:', err);
    }
  }, [repoPath]);

  // Refresh all data
  const refreshAll = useCallback(async () => {
    await Promise.all([refreshStatus(), refreshCommits()]);
  }, [refreshStatus, refreshCommits]);

  // Start polling when repo is open
  useEffect(() => {
    if (repoPath) {
      // Initial fetch
      refreshAll();
      
      // Start polling
      pollIntervalRef.current = setInterval(refreshStatus, STATUS_POLL_INTERVAL);
      
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
  }, [repoPath, refreshAll, refreshStatus]);

  // Open a repository
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
      
      // Save to settings
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

  // Commit all changes
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

  // Sync (pull --rebase + push)
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

  const value = useMemo(() => ({
    // State
    repoPath,
    repoInfo,
    repoStatus,
    commits,
    selectedFileIndex,
    setSelectedFileIndex,
    
    // Loading states
    isLoading,
    isSyncing,
    isCommitting,
    
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
  }), [
    repoPath, repoInfo, repoStatus, commits, selectedFileIndex,
    isLoading, isSyncing, isCommitting,
    statusMessage, showMessage, clearStatusMessage,
    openRepo, commitChanges, syncRepo, refreshStatus, refreshCommits, refreshAll,
  ]);

  return (
    <RepoContext.Provider value={value}>
      {children}
    </RepoContext.Provider>
  );
}

export function useRepo() {
  const context = useContext(RepoContext);
  if (!context) {
    throw new Error('useRepo must be used within a RepoProvider');
  }
  return context;
}
