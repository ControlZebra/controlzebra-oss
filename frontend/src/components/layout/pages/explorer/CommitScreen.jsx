/**
 * CommitScreen - Quick save form when there are uncommitted changes.
 * Shows commit message input and changed files table.
 * Features a split button for "Branch and Save" with dropdown for "Save on master".
 */
import { memo, useState, useCallback, useEffect } from 'react';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  HelpCircle,
  RefreshCw,
  RotateCcw,
  ChevronDown,
  GitBranch,
} from 'lucide-react';
import { ICON_SIZES, FILE_STATUS, FILE_STATUS_COLORS } from '../../../../constants';
import { 
  Button, 
  Textarea, 
  Card, 
  CardContent,
  Input,
} from '../../../ui';
import { ButtonGroup } from '../../../ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../ui/dropdown-menu';
import { MasterBranchNudge } from '../../../common';
import { RewindConfirmModal } from '../../';
import { GetUserProfile, GetMachineName } from '../../../../../bindings/changeme/services/settingsservice';

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
// Helper: Check if branch is a protected/main branch
// ============================================================================
function isProtectedBranch(branchName) {
  if (!branchName) return false;
  const protectedBranches = ['main', 'master', 'develop', 'production'];
  return protectedBranches.includes(branchName.toLowerCase());
}

// ============================================================================
// Helper: Generate default branch name
// Format: [username]/[machine]/[YYYY-MMM-DD]/[description]
// ============================================================================
function generateDefaultBranchName(userName, machineName) {
  // Extract username from email (remove domain) or use name
  let user = 'user';
  if (userName) {
    if (userName.includes('@')) {
      // It's an email, extract the part before @
      user = userName.split('@')[0];
    } else {
      // Use the name, replace spaces with dashes and lowercase
      user = userName.toLowerCase().replace(/\s+/g, '-');
    }
  }
  
  // Sanitize machine name
  const machine = (machineName || 'local').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  
  // Format date as YYYY-MMM-DD
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${now.getFullYear()}-${months[now.getMonth()]}-${String(now.getDate()).padStart(2, '0')}`;
  
  return `${user}/${machine}/${dateStr}/changes`;
}

// ============================================================================
// Main CommitScreen Component
// ============================================================================
function CommitScreen({ 
  changedFiles, 
  onCommit,
  onBranchAndCommit,
  onSync,
  onRewind,
  currentBranch,
  repoPath,
  isCommitting,
  isSyncing,
  isRewinding,
}) {
  const [message, setMessage] = useState('');
  const [justCommitted, setJustCommitted] = useState(false);
  const [showRewindModal, setShowRewindModal] = useState(false);
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [defaultBranchName, setDefaultBranchName] = useState('');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // Fetch user profile and machine name for default branch name
  useEffect(() => {
    const fetchDefaults = async () => {
      try {
        const [profile, machineName] = await Promise.all([
          GetUserProfile(repoPath || ''),
          GetMachineName(),
        ]);
        const defaultName = generateDefaultBranchName(
          profile?.email || profile?.name,
          machineName
        );
        setDefaultBranchName(defaultName);
      } catch (err) {
        console.error('Failed to fetch defaults for branch name:', err);
        setDefaultBranchName('feature/changes');
      }
    };
    fetchDefaults();
  }, [repoPath]);

  // Show nudge when on a protected branch with uncommitted changes
  const showMasterNudge = isProtectedBranch(currentBranch) && 
                          changedFiles?.length > 0 && 
                          !nudgeDismissed;

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

  const handleRewindClick = useCallback(() => {
    setShowRewindModal(true);
  }, []);

  const handleRewindConfirm = useCallback(async () => {
    const success = await onRewind();
    if (success) {
      setShowRewindModal(false);
    }
  }, [onRewind]);

  const handleRewindCancel = useCallback(() => {
    setShowRewindModal(false);
  }, []);

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

  // Branch and Save handlers
  const handleBranchAndSaveClick = useCallback(() => {
    setShowBranchInput(true);
    setBranchName(defaultBranchName);
  }, [defaultBranchName]);

  const handleBranchNameChange = useCallback((e) => {
    setBranchName(e.target.value);
  }, []);

  const handleBranchAndSaveConfirm = useCallback(async () => {
    if (!message.trim() || !branchName.trim()) return;
    const success = await onBranchAndCommit(branchName, message);
    if (success) {
      setMessage('');
      setBranchName('');
      setShowBranchInput(false);
      setJustCommitted(true);
      setNudgeDismissed(false); // Reset for next time
    }
  }, [message, branchName, onBranchAndCommit]);

  const handleBranchAndSaveCancel = useCallback(() => {
    setShowBranchInput(false);
    setBranchName('');
  }, []);

  const handleBranchInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && branchName.trim()) {
      e.preventDefault();
      handleBranchAndSaveConfirm();
    }
    if (e.key === 'Escape') {
      handleBranchAndSaveCancel();
    }
  }, [branchName, handleBranchAndSaveConfirm, handleBranchAndSaveCancel]);

  const handleDismissNudge = useCallback(() => {
    setNudgeDismissed(true);
  }, []);

  const showSyncButton = justCommitted && changedFiles.length === 0;
  const onProtectedBranch = isProtectedBranch(currentBranch);

  return (
    <div className="flex-1 flex flex-col items-center p-8 overflow-auto animate-screen-enter">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-light text-theme-primary mb-2">Welcome!</h1>
          <p className="text-sm text-theme-muted">Recommended next step</p>
        </div>

        {/* Master Branch Nudge */}
        {showMasterNudge && (
          <MasterBranchNudge 
            branchName={currentBranch} 
            onDismiss={handleDismissNudge}
          />
        )}

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

        {/* Branch name input (shown when Branch and Save is clicked) */}
        {showBranchInput && (
          <div className="mb-4 p-4 bg-theme-surface border border-theme-default rounded-lg">
            <label className="block text-sm font-medium text-theme-secondary mb-2">
              <GitBranch style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm, display: 'inline', marginRight: 6 }} />
              New branch name
            </label>
            <div className="flex gap-2">
              <Input
                value={branchName}
                onChange={handleBranchNameChange}
                onKeyDown={handleBranchInputKeyDown}
                placeholder="feature/my-changes"
                disabled={isCommitting}
                autoFocus
                className="flex-1"
              />
              <Button
                onClick={handleBranchAndSaveConfirm}
                disabled={!branchName.trim() || !message.trim()}
                loading={isCommitting}
              >
                Create & Save
              </Button>
              <Button
                variant="ghost"
                onClick={handleBranchAndSaveCancel}
                disabled={isCommitting}
              >
                Cancel
              </Button>
            </div>
            <p className="text-xs text-theme-muted mt-2">
              This will create a new branch, move your changes there, and save them.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-center gap-3 mb-8">
          {showSyncButton ? (
            <Button onClick={handleSync} loading={isSyncing} size="lg">
              <RefreshCw style={iconStyle} />
              Sync with remote
            </Button>
          ) : !showBranchInput ? (
            <>
              {/* Split button for Branch and Save / Save on master */}
              {onProtectedBranch ? (
                <ButtonGroup>
                  <Button 
                    onClick={handleBranchAndSaveClick}
                    disabled={!message.trim() || isCommitting} 
                    loading={isCommitting}
                    size="lg"
                  >
                    <GitBranch style={iconStyle} />
                    Branch and Save
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="default"
                        size="lg"
                        disabled={!message.trim() || isCommitting}
                        className="px-2 border-l border-blue-500/30"
                      >
                        <ChevronDown style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} />
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
                  size="lg"
                >
                  Save Snapshot
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleRewindClick}
                disabled={isCommitting || isSyncing}
                size="lg"
              >
                <RotateCcw style={iconStyle} />
                Rewind
              </Button>
            </>
          ) : null}
        </div>

        {/* Changed files table */}
        <ChangedFilesTable files={changedFiles} />
      </div>

      {/* Rewind Confirmation Modal */}
      <RewindConfirmModal
        open={showRewindModal}
        onClose={handleRewindCancel}
        onConfirm={handleRewindConfirm}
        isLoading={isRewinding}
      />
    </div>
  );
}

export default memo(CommitScreen);
