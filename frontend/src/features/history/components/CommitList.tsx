/**
 * CommitList - Compact commit history list for sidebar display.
 * Shows time-relative date + truncated message with full details on hover.
 * 
 * Format: "2h · Fix valve…"
 * Hover: Full commit message, author, hash, refs
 */
import { memo, useCallback } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../shared/ui';
import { shortenRelativeDate } from '../utils/relativeDate';

// ============================================================================
// Types
// ============================================================================

interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  relativeDate: string;
  refs?: string[];
}

interface CommitListProps {
  commits: Commit[];
  selectedHash?: string | null;
  onSelectCommit?: (hash: string | null) => void;
  className?: string;
}

interface CommitListItemProps {
  commit: Commit;
  isSelected: boolean;
  onSelect: (hash: string) => void;
}

// ============================================================================
// Components
// ============================================================================

/**
 * Single commit list item with tooltip.
 * Uses CSS truncation for smart width-based message clipping.
 */
const CommitListItem = memo(function CommitListItem({
  commit,
  isSelected,
  onSelect,
}: CommitListItemProps) {
  const shortTime = shortenRelativeDate(commit.relativeDate);
  const firstLineMessage = commit.message.split('\n')[0].trim();
  const hasRefs = commit.refs && commit.refs.length > 0;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(commit.hash)}
          className={`
            w-full text-left px-3 py-1.5 text-xs
            transition-colors duration-100
            focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500
            ${isSelected
              ? 'bg-blue-600/20 text-blue-600 dark:text-blue-300'
              : 'text-theme-secondary hover:bg-theme-muted hover:text-theme-primary'
            }
          `}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Compact time */}
            <span className="text-theme-muted shrink-0 w-6 text-right">
              {shortTime}
            </span>
            
            <span className="text-theme-muted/60">·</span>
            
            {/* Message with CSS truncation - automatically adapts to container width */}
            <span className="truncate flex-1 min-w-0">
              {firstLineMessage}
            </span>
          </div>
        </button>
      </TooltipTrigger>
      
      <TooltipContent side="right" align="start" className="max-w-xs">
        <div className="space-y-1.5">
          {/* Full message */}
          <p className="font-medium text-theme-primary break-words">
            {firstLineMessage}
          </p>
          
          {/* Meta info */}
          <div className="flex flex-col gap-0.5 text-theme-secondary">
            <span>{commit.author}</span>
            <span className="text-theme-muted">{commit.shortHash}</span>
            <span>{commit.relativeDate}</span>
          </div>
          
          {/* Refs shown only in tooltip */}
          {hasRefs && (
            <div className="flex flex-wrap gap-1 pt-1">
              {commit.refs!.map((ref) => (
                <span
                  key={ref}
                  className="px-1.5 py-0.5 bg-blue-500/20 text-blue-600 dark:text-blue-300 rounded text-xs"
                >
                  {ref}
                </span>
              ))}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
});

/**
 * Main CommitList component.
 */
function CommitList({
  commits,
  selectedHash,
  onSelectCommit,
  className,
}: CommitListProps) {
  const handleSelect = useCallback(
    (hash: string) => {
      if (onSelectCommit) {
        onSelectCommit(hash === selectedHash ? null : hash);
      }
    },
    [onSelectCommit, selectedHash]
  );

  if (!commits || commits.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-theme-muted text-sm">No commit history</p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className={`flex flex-col ${className || ''}`}>
        {commits.map((commit) => (
          <CommitListItem
            key={commit.hash}
            commit={commit}
            isSelected={commit.hash === selectedHash}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}

export default memo(CommitList);
