/**
 * MainArea - Central content area for viewing diffs and commit details.
 * 
 * Displays:
 * - File diff when a changed file is selected (working tree)
 * - Commit details + file list when a commit is selected
 * - File diff when a file within a commit is selected
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
import { VIEWS, ICON_SIZES } from '../../constants';
import { useLayout, useRepo } from '../../context';
import { DiffViewer } from '../common';
import { Button } from '../ui';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

/**
 * CommitHeader - Shows commit metadata (author, date, message).
 */
const CommitHeader = memo(function CommitHeader({ commit, onBack }) {
  return (
    <div className="border-b border-gray-700 bg-gray-800/50">
      {/* Back button when viewing file diff */}
      {onBack && (
        <div className="px-4 py-2 border-b border-gray-700/50">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft style={iconStyle} />
            <span>Back to commit</span>
          </Button>
        </div>
      )}
      <div className="px-4 py-3">
        <h2 className="text-gray-100 font-medium mb-2">{commit.message}</h2>
        {commit.body && (
          <p className="text-gray-400 text-sm mb-3 whitespace-pre-wrap">{commit.body}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-gray-500">
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
          <span className="text-gray-400">
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
      <div className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-700/50 sticky top-0 bg-gray-900">
        Changed Files
      </div>
      {files.map((file, idx) => (
        <button
          key={idx}
          onClick={() => onFileSelect(file.path)}
          className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-800/50 transition-colors text-left"
        >
          <FileText style={iconStyle} className="text-gray-400 shrink-0" />
          <span className="flex-1 text-sm text-gray-200 truncate font-mono">
            {file.oldPath && file.oldPath !== file.path 
              ? `${file.oldPath} → ${file.path}`
              : file.path
            }
          </span>
          <span className={`text-xs uppercase ${statusColors[file.status] || 'text-gray-400'}`}>
            {file.status}
          </span>
          <span className="text-xs text-gray-500 w-16 text-right">
            <span className="text-green-400">+{file.additions}</span>
            {' '}
            <span className="text-red-400">-{file.deletions}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

/**
 * EmptyState - Placeholder when nothing is selected.
 */
const EmptyState = memo(function EmptyState({ activeView }) {
  const VIEW_HINTS = {
    [VIEWS.EXPLORER]: 'Browse your project files',
    [VIEWS.CHANGES]: 'Click on a file to view changes',
    [VIEWS.HISTORY]: 'Click on a commit to view details',
    [VIEWS.SETTINGS]: 'Select a settings category',
    [VIEWS.PROFILE]: 'Connect your accounts',
  };

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center text-gray-600 px-4">
        <p className="text-base">Select an item from the sidebar</p>
        <p className="text-sm mt-1">{VIEW_HINTS[activeView]}</p>
      </div>
    </div>
  );
});

/**
 * LoadingState - Shows while loading diff/commit data.
 */
const LoadingState = memo(function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-gray-500 text-sm">Loading...</div>
    </div>
  );
});

function MainArea() {
  const { activeView } = useLayout();
  const { 
    selectedFileIndex,
    repoStatus,
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
    // Re-select the same commit to clear file selection
    if (selectedCommit) {
      selectCommit(selectedCommit.hash);
    }
  }, [selectedCommit, selectCommit]);

  // Loading state
  if (isDiffLoading) {
    return (
      <main className="flex-1 bg-gray-900 flex flex-col min-w-0">
        <LoadingState />
      </main>
    );
  }

  // Case 1: Viewing a file diff from a commit
  if (selectedCommit && selectedCommitFile && currentDiff) {
    return (
      <main className="flex-1 bg-gray-900 flex flex-col min-w-0">
        <CommitHeader commit={selectedCommit} onBack={handleBackToCommit} />
        <div className="flex-1 overflow-hidden">
          <DiffViewer fileDiff={currentDiff} showHeader={true} />
        </div>
      </main>
    );
  }

  // Case 2: Commit selected, showing file list
  if (selectedCommit) {
    return (
      <main className="flex-1 bg-gray-900 flex flex-col min-w-0">
        <CommitHeader commit={selectedCommit} />
        <CommitFileList 
          files={selectedCommit.files || []} 
          onFileSelect={handleCommitFileSelect}
        />
      </main>
    );
  }

  // Case 3: Working tree file selected (from ChangesView)
  if (selectedFileIndex !== null && currentDiff) {
    return (
      <main className="flex-1 bg-gray-900 flex flex-col min-w-0">
        <DiffViewer fileDiff={currentDiff} showHeader={true} />
      </main>
    );
  }

  // Default: Empty state
  return (
    <main className="flex-1 bg-gray-900 flex flex-col min-w-0">
      <EmptyState activeView={activeView} />
    </main>
  );
}

export default memo(MainArea);
