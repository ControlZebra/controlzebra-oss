/**
 * SidebarCommitPanel - Compact commit form for sidebar.
 * Shows commit message input, action buttons, and changed files list.
 * Clicking on changed files opens a diff tab.
 */
import { memo, useState, useCallback, useEffect, type CSSProperties } from 'react';
import {
  FileText,
  Undo2,
} from 'lucide-react';
import { FILE_STATUS, MAIN_BRANCHES, type FileStatusType, type ExplorerTab } from '../../../shared/constants';
import { ICON_STYLES, STATUS_CONFIG } from '../../../shared/utils/gitHelpers';
import { useLayout, useRepo } from '../../../context';
import { Button, Textarea } from '../../../shared/ui';
import LFSAutoTrackModal from './LFSAutoTrackModal';
import { RewindConfirmModal } from '../../../widgets/layout';
import { GetUserProfile } from '../../../../bindings/controlzebra/services/settingsservice';
import { supportsDiff } from '../../../shared/constants/file-utils';
import type { FileStatus } from '../../../context';
import { useLfsAutoTrackBeforeSave } from '../hooks/useLfsAutoTrackBeforeSave';
import MainBranchSaveChoiceModal, { type MainBranchSaveChoice } from './MainBranchSaveChoiceModal';

let rememberedMainBranchSaveChoice: MainBranchSaveChoice | null = null;

// ============================================================================
// Types
// ============================================================================

interface SidebarCommitPanelProps {
  changedFiles: FileStatus[];
  onCommit: (message: string, force?: boolean) => Promise<boolean>;
  onBranchAndCommit: (branchName: string, message: string) => Promise<boolean>;
  onRewind: () => Promise<boolean>;
  onDiscardFile: (filePath: string) => Promise<boolean>;
  currentBranch: string;
  repoPath?: string;
  isCommitting: boolean;
  isRewinding: boolean;
  operationInProgress?: boolean;
}

interface ChangedFileItemProps {
  file: FileStatus;
  onOpenDiff?: (file: FileStatus) => void;
  onDiscardFile?: (file: FileStatus) => Promise<void>;
  isDiscarding?: boolean;
}

interface ChangedFilesListProps {
  files: FileStatus[];
  onOpenDiff?: (file: FileStatus) => void;
  onDiscardFile?: (file: FileStatus) => Promise<void>;
  onRewind?: () => void;
  isRewinding?: boolean;
  isDiscardingFile?: boolean;
}

// ============================================================================
// Components
// ============================================================================

/**
 * ChangedFileItem - Single file in the changed files list.
 * Uses shortLabel for compact display.
 * Clicking opens a diff tab (text diff or specialized visual diff).
 */
const ChangedFileItem = memo(function ChangedFileItem({ file, onOpenDiff, onDiscardFile, isDiscarding = false }: ChangedFileItemProps): JSX.Element {
  const statusConfig = STATUS_CONFIG[file.status as FileStatusType] || STATUS_CONFIG[FILE_STATUS.MODIFIED];
  const StatusIcon = statusConfig.Icon;
  const canOpenDiff = supportsDiff(file.path);
  
  const handleClick = useCallback(() => {
    if (canOpenDiff && onOpenDiff) {
      onOpenDiff(file);
    }
  }, [file, canOpenDiff, onOpenDiff]);
  
  const handleDiscardClick = useCallback(async (): Promise<void> => {
    if (!onDiscardFile || isDiscarding) return;
    await onDiscardFile(file);
  }, [file, isDiscarding, onDiscardFile]);

  return (
    <div className="group w-full flex items-center gap-1 px-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={!canOpenDiff}
        className={`flex-1 flex items-center gap-2 px-2 py-1 rounded text-sm text-left transition-colors
          ${canOpenDiff
            ? 'hover-bg-theme-interactive cursor-pointer'
            : 'cursor-default opacity-70'
          }`}
        title={canOpenDiff ? `View changes: ${file.path}` : file.path}
      >
        <StatusIcon style={ICON_STYLES.xs as CSSProperties} className={statusConfig.className} />
        <FileText style={ICON_STYLES.xs as CSSProperties} className="text-yellow-500 shrink-0" />
        <span className="text-yellow-500 truncate flex-1">
          {file.name}
        </span>
      </button>

      <button
        type="button"
        onClick={handleDiscardClick}
        disabled={isDiscarding}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-yellow-500 hover:bg-red-500/10 hover:text-red-400 transition-all disabled:opacity-40"
        title={`Discard changes: ${file.path}`}
      >
        <Undo2 style={ICON_STYLES.xs as CSSProperties} />
      </button>
    </div>
  );
});

/**
 * ChangedFilesList - Vertical list of changed files.
 */
const ChangedFilesList = memo(function ChangedFilesList({ files, onOpenDiff, onDiscardFile, onRewind, isRewinding = false, isDiscardingFile = false }: ChangedFilesListProps): JSX.Element | null {
  if (!files || files.length === 0) return null;

  return (
    <div className="border-t border-theme-default">
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="text-xs text-yellow-500 uppercase tracking-wide">
          Changed Files ({files.length})
        </div>
        <button
          type="button"
          onClick={onRewind}
          disabled={isRewinding || isDiscardingFile}
          className="p-1 rounded text-yellow-500 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-50"
          title="Discard all changes"
        >
          <Undo2 style={ICON_STYLES.xs as CSSProperties} />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto px-1">
        {files.map((file, index) => (
          <ChangedFileItem 
            key={`${file.path}-${index}`} 
            file={file} 
            onOpenDiff={onOpenDiff}
            onDiscardFile={onDiscardFile}
            isDiscarding={isDiscardingFile}
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
  onDiscardFile,
  currentBranch,
  repoPath,
  isCommitting,
  isRewinding,
  operationInProgress = false,
}: SidebarCommitPanelProps): JSX.Element {
  const { openExplorerTab } = useLayout();
  const { ghAuthStatus } = useRepo();
  const [message, setMessage] = useState('');
  const [showRewindModal, setShowRewindModal] = useState(false);
  const [showMainBranchChoiceModal, setShowMainBranchChoiceModal] = useState(false);
  const [mainBranchChoice, setMainBranchChoice] = useState<MainBranchSaveChoice>('branch-and-save');
  const [rememberChoiceForSession, setRememberChoiceForSession] = useState(false);
  const [isDiscardingFile, setIsDiscardingFile] = useState(false);
  const [defaultBranchName, setDefaultBranchName] = useState('');

  const {
    modalOpen: showAutoTrackModal,
    candidates: autoTrackCandidates,
    selectedFilePaths: selectedAutoTrackFiles,
    isApplying: isApplyingAutoTrack,
    runBeforeSave,
    toggleCandidate,
    toggleSelectAll,
    cancelModal,
    confirmAndContinue,
  } = useLfsAutoTrackBeforeSave({
    repoPath,
    changedFiles,
  });

  // Fetch user profile for default branch name
  useEffect(() => {
    const fetchDefaults = async (): Promise<void> => {
      try {
        const profile = await GetUserProfile(repoPath || '');
        const usernameSource = ghAuthStatus?.username || profile?.email || profile?.name || 'user';
        const sanitizedUsername = usernameSource
          .toLowerCase()
          .replace(/@.*/, '')
          .replace(/[^a-z0-9._-]/g, '-');
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const defaultName = `@${sanitizedUsername}-${yyyy}${mm}${dd}-${hh}${ss}`;
        setDefaultBranchName(defaultName);
      } catch {
        setDefaultBranchName(`@user-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-00-00`);
      }
    };
    fetchDefaults();
  }, [repoPath, ghAuthStatus?.username]);

  const executeSaveChoice = useCallback(async (choice: MainBranchSaveChoice): Promise<boolean> => {
    if (!message.trim()) return false;

    if (choice === 'branch-and-save') {
      return onBranchAndCommit(defaultBranchName, message);
    }

    return onCommit(message);
  }, [defaultBranchName, message, onBranchAndCommit, onCommit]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!message.trim()) return;

    const isMainBranch = MAIN_BRANCHES.includes(currentBranch.toLowerCase());

    if (!isMainBranch) {
      await runBeforeSave(
        () => onCommit(message),
        () => setMessage(''),
      );
      return;
    }

    if (rememberedMainBranchSaveChoice) {
      const rememberedChoice = rememberedMainBranchSaveChoice;
      await runBeforeSave(
        () => executeSaveChoice(rememberedChoice),
        () => setMessage(''),
      );
      return;
    }

    setMainBranchChoice('branch-and-save');
    setRememberChoiceForSession(false);
    setShowMainBranchChoiceModal(true);
  }, [currentBranch, executeSaveChoice, message, onCommit, runBeforeSave]);

  const handleConfirmMainBranchSaveChoice = useCallback(async (): Promise<void> => {
    await runBeforeSave(
      () => executeSaveChoice(mainBranchChoice),
      () => {
        if (rememberChoiceForSession) {
          rememberedMainBranchSaveChoice = mainBranchChoice;
        }
        setMessage('');
        setShowMainBranchChoiceModal(false);
      },
    );
  }, [executeSaveChoice, mainBranchChoice, rememberChoiceForSession, runBeforeSave]);

  const handleRewindConfirm = useCallback(async (): Promise<void> => {
    const success = await onRewind();
    if (success) {
      setShowRewindModal(false);
    }
  }, [onRewind]);

  const handleDiscardSingleFile = useCallback(async (file: FileStatus): Promise<void> => {
    if (isDiscardingFile || isCommitting || isRewinding) return;

    setIsDiscardingFile(true);
    try {
      await onDiscardFile(file.path);
    } finally {
      setIsDiscardingFile(false);
    }
  }, [isCommitting, isDiscardingFile, isRewinding, onDiscardFile]);

  /**
    * Open a diff tab for a changed file (text diff or specialized visual diff).
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
        <p className="text-theme-primary text-lg font-semibold">
          Careful - You have unsaved changes!
        </p>

        {/* Commit message */}
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe changes..."
          disabled={isCommitting || operationInProgress}
          rows={3}
          className="text-sm"
        />

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button 
            onClick={handleSave} 
            disabled={!message.trim() || isDiscardingFile || operationInProgress}
            loading={isCommitting}
            size="sm"
            variant="default"
            className="flex-1"
          >
            Save
          </Button>
        </div>
      </div>

      {/* Changed files list */}
      <ChangedFilesList 
        files={changedFiles} 
        onOpenDiff={handleOpenDiff}
        onDiscardFile={handleDiscardSingleFile}
        onRewind={() => setShowRewindModal(true)}
        isRewinding={isRewinding}
        isDiscardingFile={isDiscardingFile}
      />

      {/* Modals */}
      <RewindConfirmModal
        open={showRewindModal}
        onClose={() => setShowRewindModal(false)}
        onConfirm={handleRewindConfirm}
        isLoading={isRewinding}
      />

      <MainBranchSaveChoiceModal
        open={showMainBranchChoiceModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowMainBranchChoiceModal(false);
          }
        }}
        currentBranch={currentBranch}
        mainBranchChoice={mainBranchChoice}
        onChoiceChange={setMainBranchChoice}
        defaultBranchName={defaultBranchName}
        rememberChoiceForSession={rememberChoiceForSession}
        onToggleRememberChoice={() => setRememberChoiceForSession((prev) => !prev)}
        isCommitting={isCommitting}
        canConfirm={!!message.trim()}
        onConfirm={handleConfirmMainBranchSaveChoice}
      />

      <LFSAutoTrackModal
        open={showAutoTrackModal}
        candidates={autoTrackCandidates}
        selectedFilePaths={selectedAutoTrackFiles}
        isApplying={isApplyingAutoTrack}
        onOpenChange={(open) => {
          if (!open) {
            cancelModal();
          }
        }}
        onToggleFile={toggleCandidate}
        onToggleSelectAll={toggleSelectAll}
        onConfirm={confirmAndContinue}
      />
    </div>
  );
}

export default memo(SidebarCommitPanel);
