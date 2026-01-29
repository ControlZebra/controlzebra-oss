/**
 * HistoryView - Commit history with toggle between compact list and git graph.
 * - Compact list: Space-efficient, shows time + truncated message with hover details
 * - Git graph: Visual branch/merge topology
 * Clicking a commit loads its details in MainArea.
 */
import { memo, useCallback, useState } from 'react';
import { GitBranch, List } from 'lucide-react';
import { useRepo } from '../../../context';
import { CommitList, GitGraph } from '../../common';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui';

type ViewMode = 'list' | 'graph';

function HistoryView(): JSX.Element {
  const { repoPath, graphCommits, selectedCommit, selectCommit } = useRepo();
  const [viewMode, setViewMode] = useState<ViewMode>('list');

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
    <div className="h-full flex flex-col">
      {/* View mode toggle */}
      <div className="flex items-center justify-end gap-1 px-2 py-1.5 border-b border-theme-default shrink-0">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/50'
                }`}
                aria-label="Compact list view"
              >
                <List size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Compact list</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setViewMode('graph')}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'graph'
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/50'
                }`}
                aria-label="Git graph view"
              >
                <GitBranch size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Branch graph</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Commit view */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'list' ? (
          <CommitList
            commits={graphCommits}
            selectedHash={selectedCommit?.hash}
            onSelectCommit={handleSelect}
            className="py-1"
          />
        ) : (
          <GitGraph
            commits={graphCommits}
            selectedHash={selectedCommit?.hash}
            onSelectCommit={handleSelect}
            className="py-2"
          />
        )}
      </div>
    </div>
  );
}

export default memo(HistoryView);
