/**
 * ChangesView - Sidebar view for staging and committing changes.
 * Shows list of changed files with status indicators and commit form.
 */
import { memo, useState, useCallback } from 'react';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  HelpCircle,
  RefreshCw,
  Bookmark,
  RotateCcw,
} from 'lucide-react';
import { ICON_SIZES, FILE_STATUS, FILE_STATUS_COLORS } from '../../../constants';
import { useRepo } from '../../../context';
import { Button, Textarea } from '../../ui';
import { RewindConfirmModal } from '../';

// Status icon configuration - maps status to icon and color class
const STATUS_CONFIG = {
  [FILE_STATUS.ADDED]: { Icon: Plus, className: FILE_STATUS_COLORS[FILE_STATUS.ADDED] },
  [FILE_STATUS.MODIFIED]: { Icon: Pencil, className: FILE_STATUS_COLORS[FILE_STATUS.MODIFIED] },
  [FILE_STATUS.DELETED]: { Icon: Trash2, className: FILE_STATUS_COLORS[FILE_STATUS.DELETED] },
  [FILE_STATUS.RENAMED]: { Icon: Pencil, className: FILE_STATUS_COLORS[FILE_STATUS.RENAMED] },
  [FILE_STATUS.UNTRACKED]: { Icon: HelpCircle, className: FILE_STATUS_COLORS[FILE_STATUS.UNTRACKED] },
};

// Shared icon styles
const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const statusIconStyle = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

/**
 * FileItem - Single file in the changes list.
 * Shows file name, path, and status indicator.
 */
const FileItem = memo(function FileItem({ file, index, isSelected, onSelect }) {
  const statusConfig = STATUS_CONFIG[file.status] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
  const StatusIcon = statusConfig?.Icon;

  return (
    <div 
      onClick={() => onSelect(index)}
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
        isSelected 
          ? 'bg-blue-600/30 border-l-2 border-blue-500' 
          : 'hover-bg-theme-interactive border-l-2 border-transparent'
      }`}
    >
      <FileText style={iconStyle} className="text-theme-secondary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-theme-primary text-sm truncate">{file.name}</p>
        <p className="text-theme-muted text-xs truncate">{file.path}</p>
      </div>
      {StatusIcon && (
        <StatusIcon style={statusIconStyle} className={statusConfig.className} />
      )}
    </div>
  );
});

function ChangesView() {
  const { 
    repoPath, 
    repoStatus, 
    selectedFileIndex, 
    setSelectedFileIndex,
    commitChanges,
    syncRepo,
    isCommitting,
    isSyncing,
    loadWorkingDiff,
    clearSelection,
    resetHardHead,
  } = useRepo();

  const [message, setMessage] = useState('');
  const [justCommitted, setJustCommitted] = useState(false);
  const [isRewindModalOpen, setIsRewindModalOpen] = useState(false);
  const [isRewinding, setIsRewinding] = useState(false);

  // Handle file selection - load diff when selected
  const handleSelect = useCallback((index) => {
    const changedFiles = repoStatus?.changedFiles || [];
    if (selectedFileIndex === index) {
      // Deselect
      setSelectedFileIndex(null);
      clearSelection();
    } else {
      // Select and load diff
      setSelectedFileIndex(index);
      const file = changedFiles[index];
      if (file) {
        loadWorkingDiff(file.path);
      }
    }
  }, [selectedFileIndex, setSelectedFileIndex, repoStatus, loadWorkingDiff, clearSelection]);

  // Handle commit message input
  const handleMessageChange = useCallback((e) => {
    setMessage(e.target.value);
    // Reset justCommitted flag when user starts typing
    if (justCommitted) {
      setJustCommitted(false);
    }
  }, [justCommitted]);

  // Commit changes with current message
  const handleSave = useCallback(async () => {
    if (!message.trim()) return;
    const success = await commitChanges(message);
    if (success) {
      setMessage('');
      setJustCommitted(true);
    }
  }, [message, commitChanges]);

  // Sync repository with remote
  const handleSync = useCallback(async () => {
    await syncRepo();
    setJustCommitted(false);
  }, [syncRepo]);

  // Handle rewind confirmation
  const handleRewindConfirm = useCallback(async () => {
    setIsRewinding(true);
    const success = await resetHardHead();
    setIsRewinding(false);
    if (success) {
      setIsRewindModalOpen(false);
    }
  }, [resetHardHead]);

  // Keyboard shortcuts: Ctrl/Cmd+Enter to save or sync
  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (justCommitted) {
        handleSync();
      } else {
        handleSave();
      }
    }
  }, [handleSave, handleSync, justCommitted]);

  // No repository open state
  if (!repoPath) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-theme-muted text-sm">No repository open</p>
        <p className="text-theme-muted text-xs mt-1">Use File → Open Folder to select a repo</p>
      </div>
    );
  }

  const changedFiles = repoStatus?.changedFiles || [];
  const hasChanges = changedFiles.length > 0;
  const showSyncButton = justCommitted && !hasChanges;

  return (
    <div className="flex flex-col h-full">
      {/* Commit Message Input */}
      <div className="px-3 py-2 border-b border-theme-default">
        <Textarea
          value={message}
          onChange={handleMessageChange}
          onKeyDown={handleKeyDown}
          placeholder="Message (Ctrl+Enter to commit)"
          disabled={isCommitting || isSyncing}
          rows={3}
          className="text-sm"
        />
        
        {/* Action Buttons - Save and Rewind, or Sync based on state */}
        <div className="mt-2 flex gap-2">
          {showSyncButton ? (
            <Button 
              className="flex-1"
              onClick={handleSync}
              loading={isSyncing}
            >
              {isSyncing ? (
                'Syncing...'
              ) : (
                <>
                  <RefreshCw style={iconStyle} />
                  <span>Sync Changes</span>
                </>
              )}
            </Button>
          ) : (
            <>
              <Button 
                className="flex-1"
                onClick={handleSave}
                disabled={!message.trim() || !hasChanges}
                loading={isCommitting}
              >
                {isCommitting ? (
                  'Saving...'
                ) : (
                  <>
                    <Bookmark style={iconStyle} />
                    <span>Save Snapshot</span>
                  </>
                )}
              </Button>
              <Button 
                variant="destructive"
                onClick={() => setIsRewindModalOpen(true)}
                disabled={!hasChanges || isCommitting}
                title="Rewind all changes to last snapshot"
              >
                <RotateCcw style={iconStyle} />
                <span>Rewind</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Changed Files List */}
      <div className="flex-1 overflow-y-auto">
        {hasChanges ? (
          <div className="py-1">
            <div className="px-3 py-1.5 text-theme-muted text-xs uppercase tracking-wide">
              Changes ({changedFiles.length})
            </div>
            {changedFiles.map((file, index) => (
              <FileItem 
                key={`${file.path}-${file.status}`} 
                file={file} 
                index={index}
                isSelected={selectedFileIndex === index}
                onSelect={handleSelect}
              />
            ))}
          </div>
        ) : (
          <p className="px-3 py-4 text-theme-muted text-sm text-center">
            No changes detected
          </p>
        )}
      </div>

      {/* Rewind Confirmation Modal */}
      <RewindConfirmModal
        open={isRewindModalOpen}
        onClose={() => setIsRewindModalOpen(false)}
        onConfirm={handleRewindConfirm}
        isLoading={isRewinding}
      />
    </div>
  );
}

export default memo(ChangesView);
