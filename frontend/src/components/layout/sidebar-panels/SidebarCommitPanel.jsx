/**
 * SidebarCommitPanel - Compact commit form for sidebar.
 * Shows commit message input, action buttons, and changed files list.
 */
import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  FileText,
  RotateCcw,
  ChevronDown,
  GitBranch,
} from 'lucide-react';
import { FILE_STATUS, isProtectedBranch } from '../../../constants';
import { ICON_STYLES, STATUS_CONFIG, generateDefaultBranchName } from '../../../lib/gitHelpers';
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

/**
 * ChangedFileItem - Single file in the changed files list.
 * Uses shortLabel for compact display.
 */
const ChangedFileItem = memo(function ChangedFileItem({ file }) {
  const statusConfig = STATUS_CONFIG[file.status] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
  const StatusIcon = statusConfig.Icon;
  
  return (
    <div className="flex items-center gap-2 px-2 py-1 hover-bg-theme-interactive rounded text-sm">
      <StatusIcon style={ICON_STYLES.xs} className={statusConfig.className} />
      <FileText style={ICON_STYLES.xs} className="text-theme-muted shrink-0" />
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

  // Memoize computed values to prevent unnecessary re-renders
  const onProtectedBranch = useMemo(
    () => isProtectedBranch(currentBranch),
    [currentBranch]
  );

  const showMasterNudge = useMemo(
    () => onProtectedBranch && changedFiles?.length > 0 && !nudgeDismissed,
    [onProtectedBranch, changedFiles?.length, nudgeDismissed]
  );

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
                <GitBranch style={ICON_STYLES.xs} />
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
                    <ChevronDown style={ICON_STYLES.xs} />
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
            <RotateCcw style={ICON_STYLES.xs} />
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
