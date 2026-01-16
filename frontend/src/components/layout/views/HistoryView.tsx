/**
 * HistoryView - Git graph visualization for repository commit history.
 * Displays commits with branch/merge topology similar to `git log --graph`.
 * Clicking a commit loads its details in MainArea.
 */
import { memo, useCallback } from 'react';
import { useRepo } from '../../../context';
import { GitGraph } from '../../common';

function HistoryView(): JSX.Element {
  const { repoPath, graphCommits, selectedCommit, selectCommit } = useRepo();

  const handleSelect = useCallback((hash: string | null): void => {
    // Toggle selection if clicking the same commit (hash will be null)
    if (!hash || selectedCommit?.hash === hash) {
      selectCommit('');  // Empty string to deselect
    } else {
      selectCommit(hash);
    }
  }, [selectedCommit, selectCommit]);

  // No repository open state
  if (!repoPath) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-theme-muted text-sm">No repository open</p>
        <p className="text-theme-muted text-xs mt-1">Use File → Open Folder to select a repo</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <GitGraph
        commits={graphCommits}
        selectedHash={selectedCommit?.hash}
        onSelectCommit={handleSelect}
        className="py-2"
      />
    </div>
  );
}

export default memo(HistoryView);
