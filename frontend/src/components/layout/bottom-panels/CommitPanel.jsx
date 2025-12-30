/**
 * CommitPanel - Bottom panel for committing changes.
 * Shows file list on left, commit message input on right.
 */
import { memo, useState, useCallback } from 'react';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  HelpCircle,
  CheckCircle,
  AlertCircle,
  Bookmark,
} from 'lucide-react';
import { ICON_SIZES, FILE_STATUS, FILE_STATUS_COLORS } from '../../../constants';
import { useRepo } from '../../../context';
import { Button, Textarea } from '../../ui';

// Status configuration - uses shared colors from constants
const STATUS_CONFIG = {
  [FILE_STATUS.ADDED]: { Icon: Plus, className: FILE_STATUS_COLORS[FILE_STATUS.ADDED] },
  [FILE_STATUS.MODIFIED]: { Icon: Pencil, className: FILE_STATUS_COLORS[FILE_STATUS.MODIFIED] },
  [FILE_STATUS.DELETED]: { Icon: Trash2, className: FILE_STATUS_COLORS[FILE_STATUS.DELETED] },
  [FILE_STATUS.RENAMED]: { Icon: Pencil, className: FILE_STATUS_COLORS[FILE_STATUS.RENAMED] },
  [FILE_STATUS.UNTRACKED]: { Icon: HelpCircle, className: FILE_STATUS_COLORS[FILE_STATUS.UNTRACKED] },
};

// Shared icon styles
const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const fileIconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const statusIconStyle = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

/**
 * FileItem - Single file in the commit panel file list.
 */
const FileItem = memo(function FileItem({ file }) {
  const statusConfig = STATUS_CONFIG[file.status] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
  const StatusIcon = statusConfig?.Icon;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-700/50 cursor-pointer transition-colors">
      <FileText style={fileIconStyle} className="text-gray-400 shrink-0" />
      <span className="flex-1 text-gray-200 text-xs truncate">{file.name}</span>
      {StatusIcon && (
        <StatusIcon style={statusIconStyle} className={statusConfig.className} />
      )}
    </div>
  );
});

/**
 * InlineMessage - Status message shown after actions.
 */
function InlineMessage({ type, text }) {
  if (!text) return null;
  
  const isSuccess = type === 'success';
  const Icon = isSuccess ? CheckCircle : AlertCircle;
  const colorClass = isSuccess ? 'text-green-400' : 'text-red-400';
  
  return (
    <div className={`flex items-center gap-1.5 text-xs ${colorClass}`}>
      <Icon style={iconStyle} />
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

  // Keyboard shortcut: Ctrl/Cmd+Enter to save
  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  // No repository open state
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
        <Textarea
          value={message}
          onChange={handleMessageChange}
          onKeyDown={handleKeyDown}
          placeholder="Describe your changes..."
          disabled={isCommitting}
          className="flex-1 text-xs"
        />
        
        {/* Actions row */}
        <div className="flex items-center gap-2 justify-between">
          <InlineMessage type={statusMessage?.type} text={statusMessage?.text} />
          
          <Button 
            size="sm"
            onClick={handleSave}
            disabled={!message.trim() || changedFiles.length === 0}
            loading={isCommitting}
          >
            {isCommitting ? (
              'Saving...'
            ) : (
              <>
                <Bookmark style={iconStyle} />
                <span>Save Changes</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default memo(CommitPanel);
