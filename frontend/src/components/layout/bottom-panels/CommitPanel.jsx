import { memo, useState, useCallback } from 'react';
import SaveIcon from '@mui/icons-material/Save';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { ICON_SIZES, FILE_STATUS } from '../../../constants';
import { useRepo } from '../../../context';

const iconStyle = { fontSize: ICON_SIZES.sm };
const fileIconStyle = { fontSize: ICON_SIZES.sm };
const statusIconStyle = { fontSize: ICON_SIZES.xs };
const messageIconStyle = { fontSize: ICON_SIZES.sm };

const STATUS_CONFIG = {
  [FILE_STATUS.ADDED]: { icon: AddIcon, className: 'text-green-400' },
  [FILE_STATUS.MODIFIED]: { icon: EditIcon, className: 'text-yellow-400' },
  [FILE_STATUS.DELETED]: { icon: DeleteIcon, className: 'text-red-400' },
  [FILE_STATUS.RENAMED]: { icon: EditIcon, className: 'text-blue-400' },
  [FILE_STATUS.UNTRACKED]: { icon: HelpOutlineIcon, className: 'text-gray-400' },
};

function FileItem({ file }) {
  const statusConfig = STATUS_CONFIG[file.status] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
  const StatusIcon = statusConfig?.icon;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-700/50 cursor-pointer transition-colors">
      <InsertDriveFileIcon sx={fileIconStyle} className="text-gray-400 shrink-0" />
      <span className="flex-1 text-gray-200 text-xs truncate">{file.name}</span>
      {StatusIcon && (
        <StatusIcon sx={statusIconStyle} className={statusConfig.className} />
      )}
    </div>
  );
}

function InlineMessage({ type, text }) {
  if (!text) return null;
  
  const isSuccess = type === 'success';
  const Icon = isSuccess ? CheckCircleIcon : ErrorIcon;
  const colorClass = isSuccess ? 'text-green-400' : 'text-red-400';
  
  return (
    <div className={`flex items-center gap-1.5 text-xs ${colorClass}`}>
      <Icon sx={messageIconStyle} />
      <span>{text}</span>
    </div>
  );
}

function CommitPanel() {
  const { repoPath, repoStatus, commitChanges, isCommitting, statusMessage } = useRepo();
  const [message, setMessage] = useState('');

  const changedFiles = repoStatus?.changedFiles || [];

  const handleMessageChange = useCallback((e) => {
    setMessage(e.target.value);
  }, []);

  const handleSave = useCallback(async () => {
    if (!message.trim()) return;
    const success = await commitChanges(message);
    if (success) {
      setMessage('');
    }
  }, [message, commitChanges]);

  const handleKeyDown = useCallback((e) => {
    // Ctrl/Cmd + Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  if (!repoPath) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm">
        No repository open
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Left: Changed files list (30%) */}
      <div className="w-[30%] border-r border-gray-700 flex flex-col">
        <div className="px-2 py-1.5 border-b border-gray-800">
          <span className="text-gray-400 text-xs">{changedFiles.length} files</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {changedFiles.map((file, index) => (
            <FileItem key={`${file.path}-${index}`} file={file} />
          ))}
        </div>
      </div>

      {/* Right: Commit message & buttons (70%) */}
      <div className="w-[70%] flex flex-col p-3 gap-2">
        <textarea
          value={message}
          onChange={handleMessageChange}
          onKeyDown={handleKeyDown}
          placeholder="Describe your changes..."
          disabled={isCommitting}
          className="flex-1 px-2.5 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-xs placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none disabled:opacity-50"
        />
        
        <div className="flex items-center gap-2 justify-between">
          <InlineMessage type={statusMessage?.type} text={statusMessage?.text} />
          
          <button 
            onClick={handleSave}
            disabled={!message.trim() || isCommitting || changedFiles.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white text-xs font-medium transition-colors"
          >
            {isCommitting ? (
              <>
                <CircularProgress size={14} sx={{ color: 'white' }} />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <SaveIcon sx={iconStyle} />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(CommitPanel);
