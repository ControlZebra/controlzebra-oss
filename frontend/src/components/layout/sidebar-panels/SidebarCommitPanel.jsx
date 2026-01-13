/**
 * SidebarCommitPanel - Compact commit form for sidebar.
 * Shows commit message input, action buttons, and changed files list.
 */
import { memo, useState, useCallback, useEffect } from 'react';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  HelpCircle,
  RotateCcw,
  ChevronDown,
  GitBranch,
} from 'lucide-react';
import { ICON_SIZES, FILE_STATUS, FILE_STATUS_COLORS } from '../../../constants';
import { Button, Textarea } from '../../ui';
import { ButtonGroup } from '../../ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { MasterBranchNudge } from '../../common';
import { RewindConfirmModal, BranchNameModal } from '../';
import { GetUserProfile } from '../../../../bindings/changeme/services/settingsservice';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconStyleXs = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

// Status icon configuration
const STATUS_CONFIG = {
  [FILE_STATUS.ADDED]: { Icon: Plus, className: FILE_STATUS_COLORS[FILE_STATUS.ADDED], label: 'A' },
  [FILE_STATUS.MODIFIED]: { Icon: Pencil, className: FILE_STATUS_COLORS[FILE_STATUS.MODIFIED], label: 'M' },
  [FILE_STATUS.DELETED]: { Icon: Trash2, className: FILE_STATUS_COLORS[FILE_STATUS.DELETED], label: 'D' },
  [FILE_STATUS.RENAMED]: { Icon: Pencil, className: FILE_STATUS_COLORS[FILE_STATUS.RENAMED], label: 'R' },
  [FILE_STATUS.UNTRACKED]: { Icon: HelpCircle, className: FILE_STATUS_COLORS[FILE_STATUS.UNTRACKED], label: '?' },
};

// Check if branch is protected
function isProtectedBranch(branchName) {
  if (!branchName) return false;
  const protectedBranches = ['main', 'master', 'develop', 'production'];
  return protectedBranches.includes(branchName.toLowerCase());
}

// Generate default branch name
function generateDefaultBranchName(userName) {
  let user = 'user';
  if (userName) {
    if (userName.includes('@')) {
      user = userName.split('@')[0];
    } else {
      user = userName.toLowerCase().replace(/\s+/g, '-');
    }
  }
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${now.getFullYear()}-${months[now.getMonth()]}-${String(now.getDate()).padStart(2, '0')}`;
  return `${user}/${dateStr}/changes`;
}

/**
 * ChangedFileItem - Single file in the changed files list.
 */
const ChangedFileItem = memo(function ChangedFileItem({ file }) {
  const statusConfig = STATUS_CONFIG[file.status] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
  const StatusIcon = statusConfig.Icon;
  
  return (
    <div className="flex items-center gap-2 px-2 py-1 hover-bg-theme-interactive rounded text-sm">
      <StatusIcon style={iconStyleXs} className={statusConfig.className} />
      <FileText style={iconStyleXs} className="text-theme-muted shrink-0" />
      <span className="text-theme-primary truncate flex-1" title={file.path}>
        {file.name}
      </span>
    </div>
  );
});

/**
 * ChangedFilesList - Vertical list of changed files.
 */
const ChangedFilesList = memo(function ChangedFilesList({ files }) {
  if (!files || files.length === 0) return null;

  return (
    <div className="border-t border-theme-default">
      <div className="px-3 py-2 text-xs text-theme-muted uppercase tracking-wide">
        Changed Files ({files.length})
      </div>
      <div className="max-h-48 overflow-y-auto px-1">
        {files.map((file, index) => (
          <ChangedFileItem key={`${file.path}-${index}`} file={file} />
        ))}
      </div>
    </div>
  );
});

function SidebarCommitPanel({ 
  changedFiles, 
  onCommit,
  onBranchAndCommit,
  onRewind,
  currentBranch,
  repoPath,
  isCommitting,
  isRewinding,
}) {
  const [message, setMessage] = useState('');
  const [showRewindModal, setShowRewindModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [defaultBranchName, setDefaultBranchName] = useState('');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // Fetch user profile for default branch name
  useEffect(() => {
    const fetchDefaults = async () => {
      try {
        const profile = await GetUserProfile(repoPath || '');
        const defaultName = generateDefaultBranchName(profile?.email || profile?.name);
        setDefaultBranchName(defaultName);
      } catch (err) {
        setDefaultBranchName('feature/changes');
      }
    };
    fetchDefaults();
  }, [repoPath]);

  const showMasterNudge = isProtectedBranch(currentBranch) && 
                          changedFiles?.length > 0 && 
                          !nudgeDismissed;

  const handleSave = useCallback(async () => {
    if (!message.trim()) return;
    const success = await onCommit(message);
    if (success) {
      setMessage('');
    }
  }, [message, onCommit]);

  const handleBranchAndSaveConfirm = useCallback(async (branchName) => {
    if (!message.trim() || !branchName.trim()) return;
    const success = await onBranchAndCommit(branchName, message);
    if (success) {
      setMessage('');
      setShowBranchModal(false);
    }
  }, [message, onBranchAndCommit]);

  const handleRewindConfirm = useCallback(async () => {
    const success = await onRewind();
    if (success) {
      setShowRewindModal(false);
    }
  }, [onRewind]);

  const onProtectedBranch = isProtectedBranch(currentBranch);

  return (
    <div className="flex flex-col h-full">
      {/* Header section */}
      <div className="p-3 space-y-3">
        {/* Nudge */}
        {showMasterNudge && (
          <MasterBranchNudge 
            branchName={currentBranch} 
            onDismiss={() => setNudgeDismissed(true)}
            compact
          />
        )}

        {/* Commit message */}
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe changes..."
          disabled={isCommitting}
          rows={3}
          className="text-sm"
        />

        {/* Action buttons */}
        <div className="flex gap-2">
          {onProtectedBranch ? (
            <ButtonGroup className="flex-1">
              <Button 
                onClick={() => setShowBranchModal(true)}
                disabled={!message.trim() || isCommitting} 
                loading={isCommitting}
                size="sm"
                className="flex-1"
              >
                <GitBranch style={iconStyleXs} />
                Branch & Save
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="default"
                    size="sm"
                    disabled={!message.trim() || isCommitting}
                    className="px-1.5 border-l border-blue-500/30"
                  >
                    <ChevronDown style={iconStyleXs} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleSave}>
                    Save on {currentBranch}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
          ) : (
            <Button 
              onClick={handleSave} 
              disabled={!message.trim()} 
              loading={isCommitting}
              size="sm"
              className="flex-1"
            >
              Save
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setShowRewindModal(true)}
            disabled={isCommitting}
            size="sm"
            title="Discard all changes"
          >
            <RotateCcw style={iconStyleXs} />
          </Button>
        </div>
      </div>

      {/* Changed files list */}
      <ChangedFilesList files={changedFiles} />

      {/* Modals */}
      <RewindConfirmModal
        open={showRewindModal}
        onClose={() => setShowRewindModal(false)}
        onConfirm={handleRewindConfirm}
        isLoading={isRewinding}
      />

      <BranchNameModal
        open={showBranchModal}
        onClose={() => setShowBranchModal(false)}
        onConfirm={handleBranchAndSaveConfirm}
        defaultBranchName={defaultBranchName}
        isLoading={isCommitting}
        currentBranch={currentBranch}
      />
    </div>
  );
}

export default memo(SidebarCommitPanel);
