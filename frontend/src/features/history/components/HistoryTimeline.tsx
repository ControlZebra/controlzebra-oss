/**
 * HistoryTimeline - Shared commit timeline UI with list/graph toggle.
 * Used by both the History sidebar and the Explorer timeline panel.
 */
import { memo, useCallback, useState } from 'react';
import { GitBranch, List } from 'lucide-react';
import { useRepo } from '../../../context';
import CommitList from './CommitList';
import GitGraph from './GitGraph';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../shared/ui';

type ViewMode = 'list' | 'graph';

interface HistoryTimelineProps {
  className?: string;
  showNoRepoState?: boolean;
  selectedHash?: string | null;
  onSelectCommit?: (hash: string | null) => void;
}

function HistoryTimeline({
  className,
  showNoRepoState = false,
  selectedHash: selectedHashOverride,
  onSelectCommit: onSelectCommitOverride,
}: HistoryTimelineProps): JSX.Element {
  const { repoPath, graphCommits, selectedCommit, selectCommit } = useRepo();
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const selectedHash = selectedHashOverride ?? selectedCommit?.hash;

  const handleSelect = useCallback((hash: string | null): void => {
    const nextHash = !hash || selectedHash === hash ? null : hash;

    if (onSelectCommitOverride) {
      onSelectCommitOverride(nextHash);
      return;
    }

    if (!nextHash) {
      selectCommit('');
      return;
    }

    selectCommit(nextHash);
  }, [onSelectCommitOverride, selectedHash, selectCommit]);

  if (!repoPath && showNoRepoState) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-theme-muted text-sm">No repository open</p>
        <p className="text-theme-muted text-xs mt-1">Use File → Open Folder to select a repo</p>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${className || ''}`}>
      <div className="flex items-center justify-end gap-1 px-2 py-1.5 border-b border-theme-default shrink-0">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600/20 text-blue-500 dark:text-blue-400'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-muted'
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
                    ? 'bg-blue-600/20 text-blue-500 dark:text-blue-400'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-muted'
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

      <div className="flex-1 overflow-auto min-h-0">
        {viewMode === 'list' ? (
          <CommitList
            commits={graphCommits}
            selectedHash={selectedHash}
            onSelectCommit={handleSelect}
            className="py-1"
          />
        ) : (
          <GitGraph
            commits={graphCommits}
            selectedHash={selectedHash}
            onSelectCommit={handleSelect}
            className="py-2"
          />
        )}
      </div>
    </div>
  );
}

export default memo(HistoryTimeline);