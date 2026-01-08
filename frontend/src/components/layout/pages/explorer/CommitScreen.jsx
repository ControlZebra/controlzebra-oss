/**
 * CommitScreen - Quick save form when there are uncommitted changes.
 * Shows commit message input and changed files table.
 */
import { memo, useState, useCallback } from 'react';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import { ICON_SIZES, FILE_STATUS, FILE_STATUS_COLORS } from '../../../../constants';
import { Button, Textarea, Card, CardContent } from '../../../ui';

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
 */
function shortenPath(fullPath, maxLength = 30) {
  if (!fullPath || fullPath.length <= maxLength) return fullPath;
  
  const parts = fullPath.split('/').filter(Boolean);
  if (parts.length === 0) return fullPath;
  
  const fileName = parts[parts.length - 1];
  
  if (fileName.length >= maxLength - 4) {
    return `.../${fileName.slice(0, maxLength - 4)}`;
  }
  
  if (parts.length >= 2) {
    const parent = parts[parts.length - 2];
    const shortPath = `.../${parent}/${fileName}`;
    if (shortPath.length <= maxLength) {
      return shortPath;
    }
  }
  
  return `.../${fileName}`;
}

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
            <tr className="border-b border-theme-default text-left">
              <th className="px-4 py-3 text-xs font-medium text-theme-muted uppercase tracking-wide w-20">Status</th>
              <th className="px-4 py-3 text-xs font-medium text-theme-muted uppercase tracking-wide">File Name</th>
              <th className="px-4 py-3 text-xs font-medium text-theme-muted uppercase tracking-wide w-32">Modified</th>
              <th className="px-4 py-3 text-xs font-medium text-theme-muted uppercase tracking-wide">Path</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700/50">
            {files.map((file, index) => {
              const statusConfig = STATUS_CONFIG[file.status] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
              const StatusIcon = statusConfig.Icon;
              const shortenedPath = shortenPath(file.path);
              
              return (
                <tr 
                  key={`${file.path}-${index}`}
                  className="hover-bg-theme-interactive transition-colors"
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
                      <FileText style={iconStyle} className="text-theme-muted shrink-0" />
                      <span className="text-sm text-theme-primary truncate">{file.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-theme-muted">
                      {file.modifiedDate || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-theme-muted font-mono truncate block" title={file.path}>
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
// Main CommitScreen Component
// ============================================================================
function CommitScreen({ 
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
  }, [handleSave, handleSync, justCommitted, changedFiles.length]);

  const showSyncButton = justCommitted && changedFiles.length === 0;

  return (
    <div className="flex-1 flex flex-col items-center p-8 overflow-auto animate-screen-enter">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-light text-theme-primary mb-2">Welcome!</h1>
          <p className="text-sm text-theme-muted">Recommended next step</p>
        </div>

        {/* Prompt message */}
        <p className="text-center text-sm text-theme-muted mb-6">
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
            className="text-base"
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
}

export default memo(CommitScreen);
