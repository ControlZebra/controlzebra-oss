/**
 * CommitPanel - Bottom panel for committing changes.
 * Shows file list on left, commit message input on right.
 */
import { memo, useState, useCallback, type CSSProperties, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  HelpCircle,
  CheckCircle,
  AlertCircle,
  Bookmark,
  type LucideIcon,
} from 'lucide-react';
import { ICON_SIZES, FILE_STATUS, FILE_STATUS_COLORS, type FileStatusType } from '../../../constants';
import { useRepo, type FileStatus } from '../../../context';
import { Button, Textarea } from '../../ui';

// ============================================================================
// Types
// ============================================================================

interface StatusConfigItem {
  Icon: LucideIcon;
  className: string;
}

interface FileItemProps {
  file: FileStatus;
}

interface InlineMessageProps {
  type?: 'success' | 'error';
  text?: string;
}

// ============================================================================
// Configuration
// ============================================================================

// Status configuration - uses shared colors from constants
const STATUS_CONFIG: Record<FileStatusType, StatusConfigItem> = {
  [FILE_STATUS.ADDED]: { Icon: Plus, className: FILE_STATUS_COLORS[FILE_STATUS.ADDED] },
  [FILE_STATUS.MODIFIED]: { Icon: Pencil, className: FILE_STATUS_COLORS[FILE_STATUS.MODIFIED] },
  [FILE_STATUS.DELETED]: { Icon: Trash2, className: FILE_STATUS_COLORS[FILE_STATUS.DELETED] },
  [FILE_STATUS.RENAMED]: { Icon: Pencil, className: FILE_STATUS_COLORS[FILE_STATUS.RENAMED] },
  [FILE_STATUS.UNTRACKED]: { Icon: HelpCircle, className: FILE_STATUS_COLORS[FILE_STATUS.UNTRACKED] },
};

// Shared icon styles
const iconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const fileIconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const statusIconStyle: CSSProperties = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

// ============================================================================
// Components
// ============================================================================

/**
 * FileItem - Single file in the commit panel file list.
 */
const FileItem = memo(function FileItem({ file }: FileItemProps): JSX.Element {
  const statusKey = file.status as keyof typeof STATUS_CONFIG;
  const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
  const StatusIcon = statusConfig?.Icon;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 hover-bg-theme-interactive cursor-pointer transition-colors">
      <FileText style={fileIconStyle} className="text-theme-secondary shrink-0" />
      <span className="flex-1 text-theme-primary text-xs truncate">{file.name}</span>
      {StatusIcon && (
        <StatusIcon style={statusIconStyle} className={statusConfig.className} />
      )}
    </div>
  );
});

/**
 * InlineMessage - Status message shown after actions.
 */
function InlineMessage({ type, text }: InlineMessageProps): JSX.Element | null {
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

function CommitPanel(): JSX.Element {
  const { repoPath, repoStatus, commitChanges, isCommitting } = useRepo();
  const [message, setMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const changedFiles = repoStatus?.changedFiles || [];

  const handleMessageChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>): void => {
    setMessage(e.target.value);
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!message.trim()) return;
    const success = await commitChanges(message);
    if (success) {
      setMessage('');
      setStatusMessage({ type: 'success', text: 'Changes saved!' });
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage({ type: 'error', text: 'Failed to save' });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  }, [message, commitChanges]);

  // Keyboard shortcut: Ctrl/Cmd+Enter to save
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  // No repository open state
  if (!repoPath) {
    return (
      <div className="h-full flex items-center justify-center text-theme-muted text-sm">
        No repository open
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Left: Changed files list (30%) */}
      <div className="w-[30%] border-r border-theme-default flex flex-col">
        <div className="px-2 py-1.5 border-b border-theme-default">
          <span className="text-theme-secondary text-xs">{changedFiles.length} files</span>
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
