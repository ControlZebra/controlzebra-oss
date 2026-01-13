/**
 * ChonkyFileBrowser - Enhanced file browser component using Chonky.
 * 
 * Features:
 * - Git status badges (modified, added, deleted, untracked)
 * - File size and modification date display
 * - Hidden files toggle
 * - Context menu actions: Open in Terminal, Reveal in Finder, Copy Path, Stage/Unstage, Discard
 * - Built-in search/filter
 * - Keyboard shortcuts (arrows, Enter, Backspace)
 */
import { memo, useState, useCallback, useMemo, useEffect } from 'react';
import {
  FileBrowser,
  FileNavbar,
  FileToolbar,
  FileList,
  FileContextMenu,
  ChonkyActions,
  defineFileAction,
  ChonkyIconName,
} from 'chonky';
import { 
  ListDirectoryWithOptions, 
  OpenFile, 
  OpenInTerminal,
  RevealInFinder,
  CopyToClipboard,
} from '../../../bindings/changeme/services/filesystemservice';
import { 
  Add, 
  Unstage, 
  DiscardFile,
} from '../../../bindings/changeme/services/gitservice';
import { useRepo, useLayout } from '../../context';
import { toast } from 'sonner';
import { Events } from '@wailsio/runtime';

// Git status color mapping for file badges
const GIT_STATUS_COLORS = {
  added: '#4ade80',      // green
  modified: '#facc15',   // yellow
  deleted: '#f87171',    // red
  renamed: '#60a5fa',    // blue
  untracked: '#9ca3af',  // gray
};

/**
 * Convert FileSystemService entries to Chonky FileData format.
 * Includes git status information if available.
 */
function toChonkyFiles(entries, gitStatusMap = {}) {
  if (!entries || entries.length === 0) return [];
  
  return entries.map((entry) => {
    const relativePath = entry.path;
    const gitStatus = gitStatusMap[entry.name] || gitStatusMap[relativePath];
    
    return {
      id: entry.path,
      name: entry.name,
      isDir: entry.isDirectory,
      size: entry.isDirectory ? undefined : entry.size,
      modDate: entry.modTime ? new Date(entry.modTime) : undefined,
      ext: entry.extension ? `.${entry.extension}` : undefined,
      isHidden: entry.isHidden,
      // Custom properties for git status
      gitStatus: gitStatus || null,
      color: gitStatus ? GIT_STATUS_COLORS[gitStatus] : undefined,
    };
  });
}

/**
 * Build folder chain from current path to root.
 * The folder chain shows breadcrumb navigation in Chonky.
 */
function buildFolderChain(currentPath, rootPath) {
  if (!currentPath || !rootPath) return [];
  
  const chain = [];
  let path = currentPath;
  
  // Add all folders from current path up to (and including) root
  while (path && path.length >= rootPath.length) {
    const name = path.split('/').pop() || path;
    chain.unshift({
      id: path,
      name: name,
      isDir: true,
    });
    
    // Stop at root
    if (path === rootPath) break;
    
    // Go up one level
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    if (parentPath === path || !parentPath) break;
    path = parentPath;
  }
  
  return chain;
}

/**
 * Build a map of file name -> git status from repo status
 */
function buildGitStatusMap(repoStatus, currentPath, repoPath) {
  const statusMap = {};
  
  if (!repoStatus?.changedFiles || !repoPath) return statusMap;
  
  // Get the relative current path from repo root
  const relativeCurrentPath = currentPath?.startsWith(repoPath) 
    ? currentPath.slice(repoPath.length + 1) // +1 for trailing slash
    : '';
  
  for (const file of repoStatus.changedFiles) {
    // file.path is relative to repo root
    const filePath = file.path;
    
    // Check if file is in current directory
    const fileDir = filePath.includes('/') 
      ? filePath.substring(0, filePath.lastIndexOf('/'))
      : '';
    
    if (fileDir === relativeCurrentPath) {
      // File is directly in current directory
      const fileName = filePath.split('/').pop();
      statusMap[fileName] = file.status;
    } else if (filePath.startsWith(relativeCurrentPath ? relativeCurrentPath + '/' : '')) {
      // File is in a subdirectory - mark the folder
      const remainingPath = relativeCurrentPath 
        ? filePath.slice(relativeCurrentPath.length + 1)
        : filePath;
      const folderName = remainingPath.split('/')[0];
      if (folderName && !statusMap[folderName]) {
        statusMap[folderName] = 'modified'; // Folder contains changes
      }
    }
  }
  
  return statusMap;
}

// Define custom file actions
const OpenInTerminalAction = defineFileAction({
  id: 'open_in_terminal',
  requiresSelection: false,
  button: {
    name: 'Open in Terminal',
    contextMenu: true,
    icon: ChonkyIconName.terminal,
  },
});

const RevealInFinderAction = defineFileAction({
  id: 'reveal_in_finder',
  requiresSelection: false,
  button: {
    name: 'Reveal in Finder',
    contextMenu: true,
    icon: ChonkyIconName.folder,
  },
});

const CopyPathAction = defineFileAction({
  id: 'copy_path',
  requiresSelection: false,
  button: {
    name: 'Copy Path',
    contextMenu: true,
    icon: ChonkyIconName.copy,
  },
  hotkeys: ['ctrl+shift+c', 'cmd+shift+c'],
});

const StageFileAction = defineFileAction({
  id: 'stage_file',
  requiresSelection: true,
  button: {
    name: 'Stage File',
    contextMenu: true,
    group: 'Git',
    icon: ChonkyIconName.checkActive,
  },
});

const UnstageFileAction = defineFileAction({
  id: 'unstage_file',
  requiresSelection: true,
  button: {
    name: 'Unstage File',
    contextMenu: true,
    group: 'Git',
    icon: ChonkyIconName.checkEmpty,
  },
});

const DiscardChangesAction = defineFileAction({
  id: 'discard_changes',
  requiresSelection: true,
  button: {
    name: 'Discard Changes',
    contextMenu: true,
    group: 'Git',
    icon: ChonkyIconName.trash,
  },
});

// All custom actions to pass to FileBrowser
const customFileActions = [
  OpenInTerminalAction,
  RevealInFinderAction,
  CopyPathAction,
  StageFileAction,
  UnstageFileAction,
  DiscardChangesAction,
];

function ChonkyFileBrowser({ repoPath }) {
  const [currentPath, setCurrentPath] = useState(repoPath);
  const [files, setFiles] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [showHiddenFiles, setShowHiddenFiles] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const { repoInfo, repoStatus, refreshStatus } = useRepo();
  const { theme } = useLayout();
  const isGitRepo = repoInfo?.isRepo;
  
  // Determine if dark mode should be used
  const isDarkMode = useMemo(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    // System preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [theme]);

  // Reset current path when repo changes
  useEffect(() => {
    setCurrentPath(repoPath);
  }, [repoPath]);
  
  // Subscribe to file-changed events for event-based refresh
  useEffect(() => {
    if (!currentPath) return;
    
    const handleFileChanged = (data) => {
      // Only refresh if the change is in our current directory
      if (data?.path?.startsWith(currentPath) || data?.path === currentPath) {
        setRefreshTrigger(prev => prev + 1);
      }
    };
    
    // Subscribe to file change events
    const unsubscribe = Events.On('files-changed', handleFileChanged);
    
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [currentPath]);

  // Build git status map for current directory
  const gitStatusMap = useMemo(
    () => buildGitStatusMap(repoStatus, currentPath, repoPath),
    [repoStatus, currentPath, repoPath]
  );

  // Load directory contents when path, hidden files toggle, or refresh trigger changes
  useEffect(() => {
    const loadDirectory = async () => {
      if (!currentPath) {
        setFiles([]);
        return;
      }

      setFiles(null); // Show loading state
      setError(null);

      try {
        const result = await ListDirectoryWithOptions(currentPath, showHiddenFiles);
        if (result.error) {
          setError(result.error);
          setFiles([]);
        } else {
          setFiles(toChonkyFiles(result.entries || [], gitStatusMap));
        }
      } catch (err) {
        console.error('Failed to load directory:', err);
        setError('Failed to load directory');
        setFiles([]);
      }
    };

    loadDirectory();
  }, [currentPath, showHiddenFiles, gitStatusMap, refreshTrigger]);

  // Build folder chain for breadcrumb navigation
  const folderChain = useMemo(
    () => buildFolderChain(currentPath, repoPath),
    [currentPath, repoPath]
  );

  // Handle file actions (open folder, open file, custom actions)
  const handleFileAction = useCallback(
    async (data) => {
      const { id, payload, state } = data;

      // Handle OpenFiles action (double-click, enter)
      if (id === ChonkyActions.OpenFiles.id) {
        const { targetFile, files: selectedFiles } = payload;
        const fileToOpen = targetFile ?? selectedFiles[0];

        if (!fileToOpen) return;

        if (fileToOpen.isDir) {
          // Navigate into folder
          setCurrentPath(fileToOpen.id);
        } else {
          // Open file with system default application
          try {
            const result = await OpenFile(fileToOpen.id);
            if (!result.success) {
              toast.error(`Failed to open file: ${result.error}`);
            }
          } catch (err) {
            toast.error('Failed to open file');
          }
        }
        return;
      }

      // Handle ToggleHiddenFiles
      if (id === ChonkyActions.ToggleHiddenFiles.id) {
        setShowHiddenFiles(prev => !prev);
        return;
      }

      // Get the context menu trigger file or first selected file
      const targetFile = state.contextMenuTriggerFile || state.selectedFiles[0];
      const targetPath = targetFile?.id || currentPath;

      // Custom actions
      switch (id) {
        case 'open_in_terminal': {
          const folderPath = targetFile?.isDir ? targetPath : currentPath;
          try {
            const result = await OpenInTerminal(folderPath);
            if (!result.success) {
              toast.error(`Failed to open terminal: ${result.error}`);
            }
          } catch (err) {
            toast.error('Failed to open terminal');
          }
          break;
        }

        case 'reveal_in_finder': {
          try {
            const result = await RevealInFinder(targetPath);
            if (!result.success) {
              toast.error(`Failed to reveal in Finder: ${result.error}`);
            }
          } catch (err) {
            toast.error('Failed to reveal in Finder');
          }
          break;
        }

        case 'copy_path': {
          try {
            const result = await CopyToClipboard(targetPath);
            if (result.success) {
              toast.success('Path copied to clipboard');
            } else {
              toast.error(`Failed to copy path: ${result.error}`);
            }
          } catch (err) {
            toast.error('Failed to copy path');
          }
          break;
        }

        case 'stage_file': {
          if (!isGitRepo || !repoPath) {
            toast.error('Not in a git repository');
            return;
          }
          // Stage all selected files
          const filesToStage = state.selectedFiles.filter(f => !f.isDir);
          for (const file of filesToStage) {
            try {
              const result = await Add(repoPath, file.id);
              if (result.success) {
                toast.success(`Staged: ${file.name}`);
              } else {
                toast.error(`Failed to stage ${file.name}: ${result.error}`);
              }
            } catch (err) {
              toast.error(`Failed to stage ${file.name}`);
            }
          }
          await refreshStatus?.();
          break;
        }

        case 'unstage_file': {
          if (!isGitRepo || !repoPath) {
            toast.error('Not in a git repository');
            return;
          }
          const filesToUnstage = state.selectedFiles.filter(f => !f.isDir);
          for (const file of filesToUnstage) {
            try {
              const result = await Unstage(repoPath, file.id);
              if (result.success) {
                toast.success(`Unstaged: ${file.name}`);
              } else {
                toast.error(`Failed to unstage ${file.name}: ${result.error}`);
              }
            } catch (err) {
              toast.error(`Failed to unstage ${file.name}`);
            }
          }
          await refreshStatus?.();
          break;
        }

        case 'discard_changes': {
          if (!isGitRepo || !repoPath) {
            toast.error('Not in a git repository');
            return;
          }
          const filesToDiscard = state.selectedFiles.filter(f => !f.isDir && f.gitStatus);
          if (filesToDiscard.length === 0) {
            toast.info('No changed files selected');
            return;
          }
          // Confirm before discarding
          const confirmed = window.confirm(
            `Discard changes to ${filesToDiscard.length} file(s)? This cannot be undone.`
          );
          if (!confirmed) return;
          
          for (const file of filesToDiscard) {
            try {
              const result = await DiscardFile(repoPath, file.id, true);
              if (result.success) {
                toast.success(`Discarded changes: ${file.name}`);
              } else {
                toast.error(`Failed to discard ${file.name}: ${result.error}`);
              }
            } catch (err) {
              toast.error(`Failed to discard ${file.name}`);
            }
          }
          await refreshStatus?.();
          break;
        }
      }
    },
    [currentPath, repoPath, isGitRepo, refreshStatus]
  );

  // Actions to disable from defaults (we customize or don't need them)
  const disabledActions = useMemo(() => [
    ChonkyActions.SelectAllFiles.id,
    ChonkyActions.ClearSelection.id,
    ChonkyActions.ToggleShowFoldersFirst.id,
  ], []);

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden chonky-container">
      <FileBrowser
        files={files}
        folderChain={folderChain}
        onFileAction={handleFileAction}
        fileActions={customFileActions}
        defaultFileViewActionId={ChonkyActions.EnableListView.id}
        disableDefaultFileActions={disabledActions}
        disableDragAndDrop={false}
        clearSelectionOnOutsideClick={true}
        darkMode={isDarkMode}
      >
        <FileNavbar />
        <FileToolbar />
        <FileList />
        <FileContextMenu />
      </FileBrowser>
    </div>
  );
}

export default memo(ChonkyFileBrowser);
