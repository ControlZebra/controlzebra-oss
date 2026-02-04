/**
 * CommitScreen - Quick save form when there are uncommitted changes.
 * Shows commit message input and changed files table.
 * Features a split button for "Branch and Save" with dropdown for "Save on master".
 */
import { memo, useState, useCallback, useEffect, type CSSProperties, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  FileText,
  RefreshCw,
  RotateCcw,
  ChevronDown,
  GitBranch,
} from 'lucide-react';
import { FILE_STATUS, isProtectedBranch, type FileStatusType } from '../../../../constants';
import { ICON_STYLES, STATUS_CONFIG, generateDefaultBranchName, shortenPath } from '../../../../lib/gitHelpers';
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
import { GetUserProfile } from '../../../../../bindings/controlzebra/services/settingsservice';
import type { FileStatus } from '../../../../context';

// ============================================================================
// Types
// ============================================================================

interface CommitScreenProps {
  changedFiles: FileStatus[];
  onCommit: (message: string) => Promise<boolean>;
  onBranchAndCommit: (branchName: string, message: string) => Promise<boolean>;
  onSync: () => Promise<void>;
  onRewind: () => Promise<boolean>;
  currentBranch: string;
  repoPath?: string;
  isCommitting: boolean;
  isSyncing: boolean;
  isRewinding: boolean;
}

interface ChangedFilesTableProps {
  files: FileStatus[];
}

// ============================================================================
// Components
// ============================================================================

/**
 * ChangedFilesTable - Table of changed files with status.
 */
const ChangedFilesTable = memo(function ChangedFilesTable({ files }: ChangedFilesTableProps): JSX.Element | null {
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
              const statusConfig = STATUS_CONFIG[file.status as FileStatusType] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
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
                        style={ICON_STYLES.xs as CSSProperties} 
                        className={statusConfig.className} 
                      />
                      <span className={`text-xs ${statusConfig.className}`}>
                        {statusConfig.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText style={ICON_STYLES.sm as CSSProperties} className="text-theme-muted shrink-0" />
                      <span className="text-sm text-theme-primary truncate">{file.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-theme-muted">
                      —
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-theme-muted truncate block" title={file.path}>
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
  onBranchAndCommit,
  onSync,
  onRewind,
  currentBranch,
  repoPath,
  isCommitting,
  isSyncing,
  isRewinding,
}: CommitScreenProps): JSX.Element {
  const [message, setMessage] = useState('');
  const [justCommitted, setJustCommitted] = useState(false);
  const [showRewindModal, setShowRewindModal] = useState(false);
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [defaultBranchName, setDefaultBranchName] = useState('');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // Fetch user profile for default branch name
  useEffect(() => {
    const fetchDefaults = async (): Promise<void> => {
      try {
        const profile = await GetUserProfile(repoPath || '');
        const defaultName = generateDefaultBranchName(
          profile?.email || profile?.name
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

  const handleMessageChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>): void => {
    setMessage(e.target.value);
    if (justCommitted) setJustCommitted(false);
  }, [justCommitted]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!message.trim()) return;
    const success = await onCommit(message);
    if (success) {
      setMessage('');
      setJustCommitted(true);
    }
  }, [message, onCommit]);

  const handleSync = useCallback(async (): Promise<void> => {
    await onSync();
    setJustCommitted(false);
  }, [onSync]);

  const handleRewindClick = useCallback((): void => {
    setShowRewindModal(true);
  }, []);

  const handleRewindConfirm = useCallback(async (): Promise<void> => {
    const success = await onRewind();
    if (success) {
      setShowRewindModal(false);
    }
  }, [onRewind]);

  const handleRewindCancel = useCallback((): void => {
    setShowRewindModal(false);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>): void => {
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
  const handleBranchAndSaveClick = useCallback((): void => {
    setShowBranchInput(true);
    setBranchName(defaultBranchName);
  }, [defaultBranchName]);

  const handleBranchNameChange = useCallback((e: ChangeEvent<HTMLInputElement>): void => {
    setBranchName(e.target.value);
  }, []);

  const handleBranchAndSaveConfirm = useCallback(async (): Promise<void> => {
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

  const handleBranchAndSaveCancel = useCallback((): void => {
    setShowBranchInput(false);
    setBranchName('');
  }, []);

  const handleBranchInputKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && branchName.trim()) {
      e.preventDefault();
      handleBranchAndSaveConfirm();
    }
    if (e.key === 'Escape') {
      handleBranchAndSaveCancel();
    }
  }, [branchName, handleBranchAndSaveConfirm, handleBranchAndSaveCancel]);

  const handleDismissNudge = useCallback((): void => {
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
            <label className="block text-sm font-medium text-theme-secondary mb-2 flex items-center gap-1.5">
              <GitBranch style={ICON_STYLES.sm as CSSProperties} />
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
              <RefreshCw style={ICON_STYLES.sm as CSSProperties} />
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
                    <GitBranch style={ICON_STYLES.sm as CSSProperties} />
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
                        <ChevronDown style={ICON_STYLES.sm as CSSProperties} />
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
                <RotateCcw style={ICON_STYLES.sm as CSSProperties} />
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
