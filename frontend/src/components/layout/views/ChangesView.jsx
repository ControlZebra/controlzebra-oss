import { memo, useState, useCallback } from 'react';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SaveIcon from '@mui/icons-material/Save';
import SyncIcon from '@mui/icons-material/Sync';
import CircularProgress from '@mui/material/CircularProgress';
import { ICON_SIZES, FILE_STATUS } from '../../../constants';
import { useRepo } from '../../../context';

const iconStyle = { fontSize: ICON_SIZES.sm };
const statusIconStyle = { fontSize: ICON_SIZES.xs };
const buttonIconStyle = { fontSize: ICON_SIZES.sm };

const STATUS_CONFIG = {
  [FILE_STATUS.ADDED]: { icon: AddIcon, className: 'text-green-400' },
  [FILE_STATUS.MODIFIED]: { icon: EditIcon, className: 'text-yellow-400' },
  [FILE_STATUS.DELETED]: { icon: DeleteIcon, className: 'text-red-400' },
  [FILE_STATUS.RENAMED]: { icon: EditIcon, className: 'text-blue-400' },
  [FILE_STATUS.UNTRACKED]: { icon: HelpOutlineIcon, className: 'text-gray-400' },
};

function FileItem({ file, index, isSelected, onSelect }) {
  const statusConfig = STATUS_CONFIG[file.status] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
  const StatusIcon = statusConfig?.icon;

  return (
    <div 
      onClick={() => onSelect(index)}
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
        isSelected 
          ? 'bg-blue-600/30 border-l-2 border-blue-500' 
          : 'hover:bg-gray-700/50 border-l-2 border-transparent'
      }`}
    >
      <InsertDriveFileIcon sx={iconStyle} className="text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-gray-200 text-sm truncate">{file.name}</p>
        <p className="text-gray-500 text-xs truncate">{file.path}</p>
      </div>
      {StatusIcon && (
        <StatusIcon sx={statusIconStyle} className={statusConfig.className} />
      )}
    </div>
  );
}

function ChangesView() {
  const { 
    repoPath, 
    repoStatus, 
    selectedFileIndex, 
    setSelectedFileIndex,
    commitChanges,
    syncRepo,
    isCommitting,
    isSyncing
  } = useRepo();

  const [message, setMessage] = useState('');
  const [justCommitted, setJustCommitted] = useState(false);

  const handleSelect = useCallback((index) => {
    setSelectedFileIndex(selectedFileIndex === index ? null : index);
  }, [selectedFileIndex, setSelectedFileIndex]);

  const handleMessageChange = useCallback((e) => {
    setMessage(e.target.value);
    // Reset justCommitted when user starts typing a new message
    if (justCommitted) {
      setJustCommitted(false);
    }
  }, [justCommitted]);

  const handleSave = useCallback(async () => {
    if (!message.trim()) return;
    const success = await commitChanges(message);
    if (success) {
      setMessage('');
      setJustCommitted(true);
    }
  }, [message, commitChanges]);

  const handleSync = useCallback(async () => {
    await syncRepo();
    setJustCommitted(false);
  }, [syncRepo]);

  const handleKeyDown = useCallback((e) => {
    // Ctrl/Cmd + Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (justCommitted) {
        handleSync();
      } else {
        handleSave();
      }
    }
  }, [handleSave, handleSync, justCommitted]);

  if (!repoPath) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-gray-500 text-sm">No repository open</p>
        <p className="text-gray-600 text-xs mt-1">Use File → Open Folder to select a repo</p>
      </div>
    );
  }

  const changedFiles = repoStatus?.changedFiles || [];
  const hasChanges = changedFiles.length > 0;
  const showSyncButton = justCommitted && !hasChanges;

  return (
    <div className="flex flex-col h-full">
      {/* Commit Message Input */}
      <div className="px-3 py-2 border-b border-gray-700">
        <textarea
          value={message}
          onChange={handleMessageChange}
          onKeyDown={handleKeyDown}
          placeholder="Message (Ctrl+Enter to commit)"
          disabled={isCommitting || isSyncing}
          rows={3}
          className="w-full px-2.5 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none disabled:opacity-50"
        />
        
        {/* Action Button */}
        <div className="mt-2">
          {showSyncButton ? (
            <button 
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white text-sm font-medium transition-colors"
            >
              {isSyncing ? (
                <>
                  <CircularProgress size={14} sx={{ color: 'white' }} />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <SyncIcon sx={buttonIconStyle} />
                  <span>Sync Changes</span>
                </>
              )}
            </button>
          ) : (
            <button 
              onClick={handleSave}
              disabled={!message.trim() || isCommitting || !hasChanges}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white text-sm font-medium transition-colors"
            >
              {isCommitting ? (
                <>
                  <CircularProgress size={14} sx={{ color: 'white' }} />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <SaveIcon sx={buttonIconStyle} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Changed Files List */}
      <div className="flex-1 overflow-y-auto">
        {hasChanges ? (
          <div className="py-1">
            <div className="px-3 py-1.5 text-gray-500 text-xs uppercase tracking-wide">
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
          <p className="px-3 py-4 text-gray-500 text-sm text-center">
            No changes detected
          </p>
        )}
      </div>
    </div>
  );
}

export default memo(ChangesView);
