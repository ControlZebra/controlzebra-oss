/**
 * SidebarCommitPanel - Compact commit form for sidebar.
 * Shows commit message input, action buttons, and changed files list.
 * Clicking on files with visual diff support (L5X, images) opens the diff viewer.
 */
import { memo, useState, useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import {
  FileText,
  Trash2,
  ChevronDown,
  GitBranchPlus,
} from 'lucide-react';
import { FILE_STATUS, isProtectedBranch, type FileStatusType, type ExplorerTab } from '../../../constants';
import { ICON_STYLES, STATUS_CONFIG, generateDefaultBranchName } from '../../../lib/gitHelpers';
import { useLayout } from '../../../context';
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
import { GetUserProfile } from '../../../../bindings/controlzebra/services/settingsservice';
import { supportsVisualDiff } from '../../../lib/file-utils';
import type { FileStatus } from '../../../context';

// ============================================================================
// Types
// ============================================================================

interface SidebarCommitPanelProps {
  changedFiles: FileStatus[];
  onCommit: (message: string) => Promise<boolean>;
  onBranchAndCommit: (branchName: string, message: string) => Promise<boolean>;
  onRewind: () => Promise<boolean>;
  currentBranch: string;
  repoPath?: string;
  isCommitting: boolean;
  isRewinding: boolean;
}

interface ChangedFileItemProps {
  file: FileStatus;
  repoPath?: string;
  onOpenDiff?: (file: FileStatus) => void;
}

interface ChangedFilesListProps {
  files: FileStatus[];
  repoPath?: string;
  onOpenDiff?: (file: FileStatus) => void;
}

// ============================================================================
// Components
// ============================================================================

/**
 * ChangedFileItem - Single file in the changed files list.
 * Uses shortLabel for compact display.
 * Clicking on files with visual diff support (L5X, images) opens the diff viewer.
 */
const ChangedFileItem = memo(function ChangedFileItem({ file, onOpenDiff }: ChangedFileItemProps): JSX.Element {
  const statusConfig = STATUS_CONFIG[file.status as FileStatusType] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
  const StatusIcon = statusConfig.Icon;
  const hasVisualDiff = supportsVisualDiff(file.path);
  
  const handleClick = useCallback(() => {
    if (hasVisualDiff && onOpenDiff) {
      onOpenDiff(file);
    }
  }, [file, hasVisualDiff, onOpenDiff]);
  
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!hasVisualDiff}
      className={`w-full flex items-center gap-2 px-2 py-1 rounded text-sm text-left transition-colors
        ${hasVisualDiff 
          ? 'hover-bg-theme-interactive cursor-pointer' 
          : 'cursor-default opacity-70'
        }`}
      title={hasVisualDiff ? `View changes: ${file.path}` : file.path}
    >
      <StatusIcon style={ICON_STYLES.xs as CSSProperties} className={statusConfig.className} />
      <FileText style={ICON_STYLES.xs as CSSProperties} className="text-theme-muted shrink-0" />
      <span className="text-theme-primary truncate flex-1">
        {file.name}
      </span>
    </button>
  );
});

/**
 * ChangedFilesList - Vertical list of changed files.
 */
const ChangedFilesList = memo(function ChangedFilesList({ files, repoPath, onOpenDiff }: ChangedFilesListProps): JSX.Element | null {
  if (!files || files.length === 0) return null;

  return (
    <div className="border-t border-theme-default">
      <div className="px-3 py-2 text-xs text-theme-muted uppercase tracking-wide">
        Changed Files ({files.length})
      </div>
      <div className="max-h-48 overflow-y-auto px-1">
        {files.map((file, index) => (
          <ChangedFileItem 
            key={`${file.path}-${index}`} 
            file={file} 
            repoPath={repoPath}
            onOpenDiff={onOpenDiff}
          />
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
}: SidebarCommitPanelProps): JSX.Element {
  const { openExplorerTab } = useLayout();
  const [message, setMessage] = useState('');
  const [showRewindModal, setShowRewindModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [defaultBranchName, setDefaultBranchName] = useState('');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // Fetch user profile for default branch name
  useEffect(() => {
    const fetchDefaults = async (): Promise<void> => {
      try {
        const profile = await GetUserProfile(repoPath || '');
        const defaultName = generateDefaultBranchName(profile?.email || profile?.name);
        setDefaultBranchName(defaultName);
      } catch {
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

  const handleSave = useCallback(async (): Promise<void> => {
    if (!message.trim()) return;
    const success = await onCommit(message);
    if (success) {
      setMessage('');
    }
  }, [message, onCommit]);

  const handleBranchAndSaveConfirm = useCallback(async (branchName: string): Promise<void> => {
    if (!message.trim() || !branchName.trim()) return;
    const success = await onBranchAndCommit(branchName, message);
    if (success) {
      setMessage('');
      setShowBranchModal(false);
    }
  }, [message, onBranchAndCommit]);

  const handleRewindConfirm = useCallback(async (): Promise<void> => {
    const success = await onRewind();
    if (success) {
      setShowRewindModal(false);
    }
  }, [onRewind]);

  /**
   * Open a visual diff viewer for supported file types (L5X, L5K, images).
   * Creates an explorer tab showing working tree changes (HEAD vs current).
   */
  const handleOpenDiff = useCallback((file: FileStatus): void => {
    if (!repoPath) return;
    
    const absolutePath = repoPath + '/' + file.path;
    const fileName = file.path.split('/').pop() || file.path;
    
    const tab: ExplorerTab = {
      id: `diff-working-${file.path}`,
      title: `${fileName} (Working Changes)`,
      filePath: absolutePath,
      type: 'diff',
      diffContext: {
        type: 'working',
        relativePath: file.path,
        absolutePath,
        status: file.status,
      },
    };
    
    openExplorerTab(tab);
  }, [repoPath, openExplorerTab]);

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
                variant="default"
                className="flex-1"
              >
                <GitBranchPlus style={ICON_STYLES.xs as CSSProperties} />
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
                    <ChevronDown style={ICON_STYLES.xs as CSSProperties} />
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
              variant="default"
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
            <Trash2 style={ICON_STYLES.xs as CSSProperties} />
          </Button>
        </div>
      </div>

      {/* Changed files list */}
      <ChangedFilesList 
        files={changedFiles} 
        repoPath={repoPath}
        onOpenDiff={handleOpenDiff}
      />

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
