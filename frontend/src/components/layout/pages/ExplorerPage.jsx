/**
 * ExplorerPage - Main area showing recommended actions based on repo state.
 * 
 * Displays contextual guidance:
 * - No repo: Welcome screen with open folder prompt
 * - Has changes: Quick save form with changed files table
 * - No changes: Success state encouraging exploration
 */
import { memo, useState, useCallback } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  Plus,
  Pencil,
  Trash2,
  HelpCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useRepo } from '../../../context';
import { ICON_SIZES, FILE_STATUS, FILE_STATUS_COLORS } from '../../../constants';
import { Button, Textarea, Card, CardContent } from '../../ui';
import { OpenFolderDialog } from '../../../../bindings/changeme/services/filedialogservice';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

// Status icon configuration
const STATUS_CONFIG = {
  [FILE_STATUS.ADDED]: { Icon: Plus, className: FILE_STATUS_COLORS[FILE_STATUS.ADDED], label: 'Added' },
  [FILE_STATUS.MODIFIED]: { Icon: Pencil, className: FILE_STATUS_COLORS[FILE_STATUS.MODIFIED], label: 'Modified' },
  [FILE_STATUS.DELETED]: { Icon: Trash2, className: FILE_STATUS_COLORS[FILE_STATUS.DELETED], label: 'Deleted' },
  [FILE_STATUS.RENAMED]: { Icon: Pencil, className: FILE_STATUS_COLORS[FILE_STATUS.RENAMED], label: 'Renamed' },
  [FILE_STATUS.UNTRACKED]: { Icon: HelpCircle, className: FILE_STATUS_COLORS[FILE_STATUS.UNTRACKED], label: 'New' },
};

/**
 * Shorten a file path macOS-style: .../parent/file.ext
 * Limits to approximately maxLength characters
 */
function shortenPath(fullPath, maxLength = 30) {
  if (!fullPath || fullPath.length <= maxLength) return fullPath;
  
  const parts = fullPath.split('/').filter(Boolean);
  if (parts.length === 0) return fullPath;
  
  const fileName = parts[parts.length - 1];
  
  // If just filename fits, return it
  if (fileName.length >= maxLength - 4) {
    return `.../${fileName.slice(0, maxLength - 4)}`;
  }
  
  // Try to include parent folder
  if (parts.length >= 2) {
    const parent = parts[parts.length - 2];
    const shortPath = `.../${parent}/${fileName}`;
    if (shortPath.length <= maxLength) {
      return shortPath;
    }
  }
  
  // Fallback: just ellipsis + filename
  return `.../${fileName}`;
}

// ============================================================================
// No Repository State
// ============================================================================
const NoRepoState = memo(function NoRepoState({ onOpenFolder, isLoading }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-5xl font-light text-neutral-100 mb-2">Welcome!</h1>
        <p className="text-neutral-400 mb-8">Get started by opening a folder</p>
        
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neutral-700/50 mb-6">
          <Folder style={{ width: 32, height: 32 }} className="text-neutral-500" />
        </div>
        
        <p className="text-neutral-500 text-sm mb-6">
          Open a folder containing your project files to start tracking changes.
        </p>
        
        <Button size="lg" onClick={onOpenFolder} loading={isLoading}>
          <FolderOpen style={iconStyle} />
          Open Folder
        </Button>
        
        <p className="text-xs text-neutral-600 mt-4">
          Tip: Use <kbd className="px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300">⌘O</kbd> to quickly open a folder
        </p>
      </div>
    </div>
  );
});

// ============================================================================
// All Synced State - No changes to commit
// ============================================================================
const AllSyncedState = memo(function AllSyncedState({ repoPath }) {
  const folderName = repoPath?.split('/').pop() || 'Repository';
  
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-5xl font-light text-neutral-100 mb-2">Welcome!</h1>
        <p className="text-sm text-neutral-500 mb-8">All caught up</p>
        
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-6">
          <CheckCircle2 style={{ width: 32, height: 32 }} className="text-green-400" />
        </div>
        
        <p className="text-neutral-300 text-base mb-2">
          No changes detected in <span className="font-medium">{folderName}</span>
        </p>
        <p className="text-neutral-500 text-sm">
          Your project is up to date. Make some changes to files and they'll appear here.
        </p>
      </div>
    </div>
  );
});

// ============================================================================
// Changed Files Table
// ============================================================================
const ChangedFilesTable = memo(function ChangedFilesTable({ files }) {
  if (!files || files.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-700/50 text-left">
              <th className="px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide w-20">Status</th>
              <th className="px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">File Name</th>
              <th className="px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide w-32">Modified</th>
              <th className="px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide">Path</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-700/30">
            {files.map((file, index) => {
              const statusConfig = STATUS_CONFIG[file.status] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
              const StatusIcon = statusConfig.Icon;
              const shortenedPath = shortenPath(file.path);
              
              return (
                <tr 
                  key={`${file.path}-${index}`}
                  className="hover:bg-neutral-700/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon 
                        style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} 
                        className={statusConfig.className} 
                      />
                      <span className={`text-xs ${statusConfig.className}`}>
                        {statusConfig.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText style={iconStyle} className="text-neutral-500 shrink-0" />
                      <span className="text-sm text-neutral-200 truncate">{file.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-neutral-500">
                      {file.modifiedDate || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-neutral-500 font-mono truncate block" title={file.path}>
                      {shortenedPath}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Has Changes State - Quick save form
// ============================================================================
const HasChangesState = memo(function HasChangesState({ 
  repoPath, 
  changedFiles, 
  onCommit, 
  onSync,
  isCommitting,
  isSyncing,
}) {
  const [message, setMessage] = useState('');
  const [justCommitted, setJustCommitted] = useState(false);

  const handleMessageChange = useCallback((e) => {
    setMessage(e.target.value);
    if (justCommitted) setJustCommitted(false);
  }, [justCommitted]);

  const handleSave = useCallback(async () => {
    if (!message.trim()) return;
    const success = await onCommit(message);
    if (success) {
      setMessage('');
      setJustCommitted(true);
    }
  }, [message, onCommit]);

  const handleSync = useCallback(async () => {
    await onSync();
    setJustCommitted(false);
  }, [onSync]);

  const handleKeyDown = useCallback((e) => {
    // Ctrl+Enter (or Cmd+Enter) to save/sync
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      if (justCommitted && changedFiles.length === 0) {
        handleSync();
      } else {
        handleSave();
      }
    }
    // Shift+Enter allows default behavior (new line) - no need to handle
  }, [handleSave, handleSync, justCommitted, changedFiles.length]);

  const showSyncButton = justCommitted && changedFiles.length === 0;

  return (
    <div className="flex-1 flex flex-col items-center p-8 overflow-auto">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-light text-neutral-100 mb-2">Welcome!</h1>
          <p className="text-sm text-neutral-500">Recommended next step</p>
        </div>

        {/* Prompt message */}
        <p className="text-center text-sm text-neutral-500 mb-6">
          New changes are detected. Make a quick save, your future self will thank you!
        </p>

        {/* Commit message input */}
        <div className="mb-4">
          <Textarea
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe your changes... (Shift+Enter for new line, Ctrl+Enter to save)"
            disabled={isCommitting || isSyncing}
            rows={4}
            className="text-base bg-neutral-700 border-neutral-600"
          />
        </div>

        {/* Action button */}
        <div className="flex justify-center mb-8">
          {showSyncButton ? (
            <Button onClick={handleSync} loading={isSyncing} size="lg">
              <RefreshCw style={iconStyle} />
              Sync with remote
            </Button>
          ) : (
            <Button 
              onClick={handleSave} 
              disabled={!message.trim()} 
              loading={isCommitting}
              size="lg"
            >
              Create Snapshot
            </Button>
          )}
        </div>

        {/* Changed files table */}
        <ChangedFilesTable files={changedFiles} />
      </div>
    </div>
  );
});

// ============================================================================
// Main ExplorerPage Component
// ============================================================================
function ExplorerPage() {
  const { 
    repoPath, 
    repoStatus, 
    openRepo, 
    commitChanges, 
    syncRepo,
    isCommitting,
    isSyncing,
  } = useRepo();
  
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);

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

  const changedFiles = repoStatus?.changedFiles || [];
  const hasChanges = changedFiles.length > 0;

  // No repository open
  if (!repoPath) {
    return <NoRepoState onOpenFolder={handleOpenFolder} isLoading={isOpeningFolder} />;
  }

  // Repository open but no changes
  if (!hasChanges) {
    return <AllSyncedState repoPath={repoPath} />;
  }

  // Repository open with changes
  return (
    <HasChangesState
      repoPath={repoPath}
      changedFiles={changedFiles}
      onCommit={commitChanges}
      onSync={syncRepo}
      isCommitting={isCommitting}
      isSyncing={isSyncing}
    />
  );
}

export default memo(ExplorerPage);
