/**
 * HistoryPage - Main area content for Commit History view.
 * Shows commit details + file list, or file diff when viewing a specific file.
 */
import { memo, useCallback } from 'react';
import { 
  FileText, 
  User, 
  Clock, 
  Plus, 
  Minus, 
  Hash,
  ChevronLeft,
} from 'lucide-react';
import { VIEWS, ICON_SIZES } from '../../../constants';
import { useRepo } from '../../../context';
import { DiffViewer, EmptyState, LoadingState } from '../../common';
import { Button } from '../../ui';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

/**
 * CommitHeader - Shows commit metadata (author, date, message).
 */
const CommitHeader = memo(function CommitHeader({ commit, onBack }) {
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
        <h2 className="text-theme-primary font-medium mb-2">{commit.message}</h2>
        {commit.body && (
          <p className="text-theme-secondary text-sm mb-3 whitespace-pre-wrap">{commit.body}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-theme-muted">
          <div className="flex items-center gap-1.5">
            <Hash style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
            <span className="font-mono">{commit.shortHash}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <User style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
            <span>{commit.author}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
            <span>{commit.relativeDate}</span>
          </div>
        </div>
        {/* Stats */}
        <div className="flex items-center gap-3 mt-3 text-xs">
          <span className="text-theme-secondary">
            {commit.stats?.filesChanged || 0} file{commit.stats?.filesChanged !== 1 ? 's' : ''} changed
          </span>
          <span className="text-green-400 flex items-center gap-1">
            <Plus style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
            {commit.stats?.additions || 0}
          </span>
          <span className="text-red-400 flex items-center gap-1">
            <Minus style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
            {commit.stats?.deletions || 0}
          </span>
        </div>
      </div>
    </div>
  );
});

/**
 * CommitFileList - List of files changed in a commit.
 */
const CommitFileList = memo(function CommitFileList({ files, onFileSelect }) {
  const statusColors = {
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
          className="w-full flex items-center gap-2 px-4 py-2 hover-bg-theme-interactive transition-colors text-left"
        >
          <FileText style={iconStyle} className="text-theme-secondary shrink-0" />
          <span className="flex-1 text-sm text-theme-primary truncate font-mono">
            {file.oldPath && file.oldPath !== file.path 
              ? `${file.oldPath} → ${file.path}`
              : file.path
            }
          </span>
          <span className={`text-xs uppercase ${statusColors[file.status] || 'text-theme-secondary'}`}>
            {file.status}
          </span>
          <span className="text-xs text-neutral-500 w-16 text-right">
            <span className="text-green-400">+{file.additions}</span>
            {' '}
            <span className="text-red-400">-{file.deletions}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

function HistoryPage() {
  const { 
    selectedCommit,
    selectedCommitFile,
    currentDiff,
    isDiffLoading,
    loadCommitFileDiff,
    selectCommit,
  } = useRepo();

  // Handle clicking a file in commit detail view
  const handleCommitFileSelect = useCallback((filePath) => {
    loadCommitFileDiff(filePath);
  }, [loadCommitFileDiff]);

  // Go back from file diff to commit overview
  const handleBackToCommit = useCallback(() => {
    if (selectedCommit) {
      selectCommit(selectedCommit.hash);
    }
  }, [selectedCommit, selectCommit]);

  if (isDiffLoading) {
    return <LoadingState />;
  }

  // Viewing a file diff from a commit
  if (selectedCommit && selectedCommitFile && currentDiff) {
    return (
      <>
        <CommitHeader commit={selectedCommit} onBack={handleBackToCommit} />
        <div className="flex-1 overflow-hidden min-h-0">
          <DiffViewer fileDiff={currentDiff} showHeader={true} />
        </div>
      </>
    );
  }

  // Commit selected, showing file list
  if (selectedCommit) {
    return (
      <>
        <CommitHeader commit={selectedCommit} />
        <CommitFileList 
          files={selectedCommit.files || []} 
          onFileSelect={handleCommitFileSelect}
        />
      </>
    );
  }

  return <EmptyState activeView={VIEWS.HISTORY} />;
}

export default memo(HistoryPage);
