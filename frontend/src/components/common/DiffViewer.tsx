/**
 * DiffViewer - Diff viewer using react-diff-view library.
 * Displays unified (single column) diff view.
 * Parses raw unified diff text from git.
 */
import { memo, useMemo } from 'react';
import { parseDiff, Diff, Hunk, HunkData } from 'react-diff-view';
import 'react-diff-view/style/index.css';
import { cn } from '../../lib/utils';

interface FileDiff {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  binary?: boolean;
  rawDiff?: string;
  hasError?: boolean;
  error?: string;
}

interface DiffHeaderProps {
  fileDiff: FileDiff;
}

/**
 * DiffHeader - File path and status header.
 */
function DiffHeader({ fileDiff }: DiffHeaderProps) {
  const statusColors: Record<string, string> = {
    added: 'text-green-600 dark:text-green-400',
    modified: 'text-yellow-600 dark:text-yellow-400',
    deleted: 'text-red-600 dark:text-red-400',
    renamed: 'text-blue-600 dark:text-blue-400',
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-theme-surface border-b border-theme-default">
      <div className="flex items-center gap-3">
        <span className={cn('text-xs font-medium uppercase', statusColors[fileDiff.status] || 'text-theme-muted')}>
          {fileDiff.status}
        </span>
        <span className="text-sm text-theme-primary">
          {fileDiff.oldPath && fileDiff.oldPath !== fileDiff.path
            ? `${fileDiff.oldPath} → ${fileDiff.path}`
            : fileDiff.path}
        </span>
      </div>
    </div>
  );
}

interface DiffViewerProps {
  fileDiff?: FileDiff | null;
  showHeader?: boolean;
}

/**
 * DiffViewer - Main component for viewing file diffs.
 */
function DiffViewer({ fileDiff, showHeader = true }: DiffViewerProps) {
  // Parse the raw diff text using react-diff-view
  const files = useMemo(() => {
    if (!fileDiff?.rawDiff) return [];
    try {
      return parseDiff(fileDiff.rawDiff, { nearbySequences: 'zip' });
    } catch (err) {
      console.error('Failed to parse diff:', err);
      return [];
    }
  }, [fileDiff?.rawDiff]);

  // Empty state - no diff selected
  if (!fileDiff) {
    return (
      <div className="flex items-center justify-center h-full text-theme-muted text-sm">
        Select a file to view changes
      </div>
    );
  }

  // Error state
  if (fileDiff.hasError) {
    return (
      <div className="flex items-center justify-center h-full text-red-600 dark:text-red-400 text-sm">
        {fileDiff.error || 'Failed to load diff'}
      </div>
    );
  }

  // Binary file
  if (fileDiff.binary) {
    return (
      <div className="flex flex-col h-full">
        {showHeader && <DiffHeader fileDiff={fileDiff} />}
        <div className="flex-1 flex items-center justify-center text-theme-muted text-sm">
          Binary file - cannot display diff
        </div>
      </div>
    );
  }

  // No changes
  if (!fileDiff.rawDiff || files.length === 0 || !files[0]?.hunks?.length) {
    return (
      <div className="flex flex-col h-full">
        {showHeader && <DiffHeader fileDiff={fileDiff} />}
        <div className="flex-1 flex items-center justify-center text-theme-muted text-sm">
          No changes to display
        </div>
      </div>
    );
  }

  // Get the first file (we're always viewing a single file diff)
  const file = files[0];

  return (
    <div className="diff-viewer-container flex flex-col h-full min-h-0">
      {showHeader && <DiffHeader fileDiff={fileDiff} />}
      <div className="flex-1 overflow-auto min-h-0">
        <Diff
          viewType="unified"
          diffType={file.type}
          hunks={file.hunks}
          className="diff-table"
        >
          {(hunks: HunkData[]) =>
            hunks.map((hunk) => (
              <Hunk key={hunk.content} hunk={hunk} />
            ))
          }
        </Diff>
      </div>
    </div>
  );
}

export default memo(DiffViewer);
