/**
 * HistoryView - Commit history viewer for the repository.
 * Displays recent commits with hash, message, and relative date.
 * Clicking a commit loads its details in MainArea.
 */
import { memo, useCallback } from 'react';
import { Hash } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { useRepo } from '../../../context';

// Shared icon style
const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

/**
 * CommitItem - Single commit in the history list.
 * Shows commit message, short hash, and relative date.
 */
const CommitItem = memo(function CommitItem({ commit, isSelected, onSelect }) {
  return (
    <div 
      onClick={() => onSelect(commit.hash)}
      className={`flex items-start gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
        isSelected 
          ? 'bg-blue-600/30 border-l-2 border-blue-500' 
          : 'hover:bg-gray-700/50 border-l-2 border-transparent'
      }`}
    >
      <Hash style={iconStyle} className="text-gray-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-gray-200 text-sm truncate">{commit.message}</p>
        <p className="text-gray-500 text-xs">
          <span className="font-mono">{commit.shortHash}</span>
          <span className="mx-1">•</span>
          <span>{commit.relativeDate}</span>
        </p>
      </div>
    </div>
  );
});

function HistoryView() {
  const { repoPath, commits, selectedCommit, selectCommit } = useRepo();

  const handleSelect = useCallback((hash) => {
    // Toggle selection if clicking the same commit
    if (selectedCommit?.hash === hash) {
      selectCommit(null);
    } else {
      selectCommit(hash);
    }
  }, [selectedCommit, selectCommit]);

  // No repository open state
  if (!repoPath) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-gray-500 text-sm">No repository open</p>
        <p className="text-gray-600 text-xs mt-1">Use File → Open Folder to select a repo</p>
      </div>
    );
  }

  // Empty history state
  if (commits.length === 0) {
    return (
      <p className="px-3 py-4 text-gray-500 text-sm text-center">
        No commit history
      </p>
    );
  }

  return (
    <div className="py-1">
      {commits.map(commit => (
        <CommitItem 
          key={commit.hash} 
          commit={commit} 
          isSelected={selectedCommit?.hash === commit.hash}
          onSelect={handleSelect}
        />
      ))}
    </div>
  );
}

export default memo(HistoryView);
