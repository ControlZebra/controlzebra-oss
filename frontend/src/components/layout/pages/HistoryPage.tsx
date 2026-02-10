/**
 * HistoryPage - Main area content for Commit History view.
 * Shows commit details + file list, or file diff when viewing a specific file.
 */
import { memo, useCallback, useMemo, useState, lazy, Suspense, type CSSProperties } from 'react';
import { 
  FileText, 
  User, 
  Clock, 
  Plus, 
  Minus, 
  Hash,
  ChevronLeft,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { VIEWS, ICON_SIZES } from '../../../constants';
import { useRepo, type CommitDetail } from '../../../context';
import { DiffViewer, EmptyState, LoadingState } from '../../common';
import { isL5XFile, isImageFile } from '../../../lib/file-utils';

// Lazy-load heavy diff viewers for code splitting
const L5XDiffViewer = lazy(() => import('../../viewers/l5x-diff/L5XDiffViewer'));
const ImageDiffViewer = lazy(() => import('../../viewers/ImageDiffViewer'));
import { 
  Button,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../ui';

// ============================================================================
// Types
// ============================================================================

interface CommitFile {
  path: string;
  oldPath?: string;
  status: string;
  additions: number;
  deletions: number;
}

interface CommitHeaderProps {
  commit: CommitDetail;
  onBack?: () => void;
  onRestore?: () => void;
  isRestoring?: boolean;
}

interface CommitFileListProps {
  files: CommitFile[];
  onFileSelect: (filePath: string) => void;
}

// ============================================================================
// Styles
// ============================================================================

const iconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconXsStyle: CSSProperties = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

// ============================================================================
// Components
// ============================================================================

/**
 * CommitHeader - Shows commit metadata (author, date, message).
 */
const CommitHeader = memo(function CommitHeader({ commit, onBack, onRestore, isRestoring }: CommitHeaderProps): JSX.Element {
  return (
    <div className="border-b border-theme-default bg-theme-elevated">
      {/* Back button when viewing file diff */}
      {onBack && (
        <div className="px-4 py-2 border-b border-theme-muted/50">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft style={iconStyle} />
            <span>Back to commit</span>
          </Button>
        </div>
      )}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-theme-primary font-medium mb-2">{commit.message}</h2>
            {commit.body && (
              <p className="text-theme-secondary text-sm mb-3 whitespace-pre-wrap">{commit.body}</p>
            )}
          </div>
          {onRestore && (
            <Button 
              variant="default" 
              size="sm" 
              onClick={onRestore}
              disabled={isRestoring}
              className="shrink-0 bg-theme-muted hover:bg-theme-elevated text-theme-primary border border-theme-default"
            >
              <RotateCcw style={iconStyle} className={isRestoring ? 'animate-spin' : ''} />
              <span>{isRestoring ? 'Restoring...' : 'Restore'}</span>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-theme-muted">
          <div className="flex items-center gap-1.5">
            <Hash style={iconXsStyle} />
            <span>{commit.shortHash}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <User style={iconXsStyle} />
            <span>{commit.author}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock style={iconXsStyle} />
            <span>{commit.relativeDate}</span>
          </div>
        </div>
        {/* Stats */}
        <div className="flex items-center gap-3 mt-3 text-xs">
          <span className="text-theme-secondary">
            {commit.stats?.filesChanged || 0} file{commit.stats?.filesChanged !== 1 ? 's' : ''} changed
          </span>
          <span className="text-green-400 flex items-center gap-1">
            <Plus style={iconXsStyle} />
            {commit.stats?.additions || 0}
          </span>
          <span className="text-red-400 flex items-center gap-1">
            <Minus style={iconXsStyle} />
            {commit.stats?.deletions || 0}
          </span>
        </div>
      </div>
    </div>
  );
});

/**
 * CommitFileList - List of files changed in a commit.
 * Responsive: hides additions/deletions on narrow screens.
 */
const CommitFileList = memo(function CommitFileList({ files, onFileSelect }: CommitFileListProps): JSX.Element {
  const statusColors: Record<string, string> = {
    added: 'text-green-400',
    modified: 'text-yellow-400',
    deleted: 'text-red-400',
    renamed: 'text-blue-400',
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-4 py-2 text-xs text-theme-muted uppercase tracking-wide border-b border-theme-muted/50 sticky top-0 bg-theme-elevated">
        Changed Files
      </div>
      {files.map((file, idx) => (
        <button
          key={idx}
          onClick={() => onFileSelect(file.path)}
          className="w-full flex items-center gap-2 px-4 py-2 hover-bg-theme-interactive transition-colors text-left min-w-0"
        >
          <FileText style={iconStyle} className="text-theme-secondary shrink-0" />
          <span className="flex-1 text-sm text-theme-primary truncate min-w-0">
            {file.oldPath && file.oldPath !== file.path 
              ? `${file.oldPath} → ${file.path}`
              : file.path
            }
          </span>
          <span className={`text-xs uppercase shrink-0 ${statusColors[file.status] || 'text-theme-secondary'}`}>
            {file.status}
          </span>
          <span className="text-xs text-theme-muted shrink-0 hidden sm:inline">
            <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
            {' '}
            <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

function HistoryPage(): JSX.Element {
  const { 
    repoPath,
    selectedCommit,
    selectedCommitFile,
    currentDiff,
    isDiffLoading,
    loadCommitFileDiff,
    selectCommit,
    revertCommit,
  } = useRepo();

  // Determine if the currently selected file is an L5X file or image file
  const isL5XDiff = useMemo(
    () => selectedCommitFile ? isL5XFile(selectedCommitFile) : false,
    [selectedCommitFile],
  );

  const isImageDiff = useMemo(
    () => selectedCommitFile ? isImageFile(selectedCommitFile) : false,
    [selectedCommitFile],
  );

  // Find the file info for the selected file (needed for oldPath on renames)
  const selectedFileInfo = useMemo(
    () => selectedCommit?.files?.find(f => f.path === selectedCommitFile),
    [selectedCommit, selectedCommitFile],
  );

  // State for restore confirmation modal
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Handle clicking a file in commit detail view
  const handleCommitFileSelect = useCallback((filePath: string): void => {
    loadCommitFileDiff(filePath);
  }, [loadCommitFileDiff]);

  // Go back from file diff to commit overview
  const handleBackToCommit = useCallback((): void => {
    if (selectedCommit) {
      selectCommit(selectedCommit.hash);
    }
  }, [selectedCommit, selectCommit]);

  // Open restore confirmation modal
  const handleRestoreClick = useCallback((): void => {
    setShowRestoreConfirm(true);
  }, []);

  // Confirm and execute restore (revert)
  const handleRestoreConfirm = useCallback(async (): Promise<void> => {
    if (!selectedCommit) return;
    
    setIsRestoring(true);
    try {
      await revertCommit(selectedCommit.hash);
    } finally {
      setIsRestoring(false);
      setShowRestoreConfirm(false);
    }
  }, [selectedCommit, revertCommit]);

  if (isDiffLoading) {
    return <LoadingState />;
  }

  // Restore confirmation modal
  const restoreConfirmModal = (
    <AlertDialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore this snapshot?</AlertDialogTitle>
          <AlertDialogDescription>
            This will create a new commit that undoes all changes from "{selectedCommit?.message}". 
            Your commit history will be preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleRestoreConfirm}
            disabled={isRestoring}
          >
            {isRestoring ? 'Restoring...' : 'Restore'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Viewing a file diff from a commit
  if (selectedCommit && selectedCommitFile && (currentDiff || isL5XDiff || isImageDiff)) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <CommitHeader 
          commit={selectedCommit} 
          onBack={handleBackToCommit}
          onRestore={handleRestoreClick}
          isRestoring={isRestoring}
        />
        <div className="flex-1 overflow-hidden min-h-0">
          {isL5XDiff && repoPath ? (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full gap-2 text-theme-secondary">
                  <Loader2 size={ICON_SIZES.md} className="animate-spin" />
                  <span className="text-sm">Loading L5X diff viewer…</span>
                </div>
              }
            >
              <L5XDiffViewer
                repoPath={repoPath}
                commitHash={selectedCommit.hash}
                parentHash={selectedCommit.parentHashes?.[0]}
                filePath={selectedCommitFile}
                oldPath={selectedFileInfo?.oldPath}
                fileStatus={selectedFileInfo?.status ?? 'modified'}
              />
            </Suspense>
          ) : isImageDiff && repoPath ? (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full gap-2 text-theme-secondary">
                  <Loader2 size={ICON_SIZES.md} className="animate-spin" />
                  <span className="text-sm">Loading image diff viewer…</span>
                </div>
              }
            >
              <ImageDiffViewer
                repoPath={repoPath}
                filePath={selectedCommitFile}
                commitHash={selectedCommit.hash}
              />
            </Suspense>
          ) : (
            <DiffViewer fileDiff={currentDiff} showHeader={true} repoPath={repoPath ?? undefined} commitHash={selectedCommit.hash} />
          )}
        </div>
        {restoreConfirmModal}
      </div>
    );
  }

  // Commit selected, showing file list
  if (selectedCommit) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <CommitHeader 
          commit={selectedCommit}
          onRestore={handleRestoreClick}
          isRestoring={isRestoring}
        />
        <CommitFileList 
          files={(selectedCommit.files || []) as CommitFile[]} 
          onFileSelect={handleCommitFileSelect}
        />
        {restoreConfirmModal}
      </div>
    );
  }

  return <EmptyState activeView={VIEWS.HISTORY} />;
}

export default memo(HistoryPage);
