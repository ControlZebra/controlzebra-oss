/**
 * DiffViewer - Diff viewer using react-diff-view library.
 * Displays unified (single column) diff view.
 * Parses raw unified diff text from git.
 */
import { memo, useMemo, lazy, Suspense } from 'react';
import { parseDiff, Diff, Hunk, HunkData } from 'react-diff-view';
import 'react-diff-view/style/index.css';
import { cn } from '../../lib/utils';
import { isImageFile } from '../../lib/file-utils';

// Lazy-load ImageDiffViewer only when needed (binary image files)
const ImageDiffViewer = lazy(() => import('../viewers/ImageDiffViewer'));

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
    added: 'text-theme-added',
    modified: 'text-theme-modified',
    deleted: 'text-theme-removed',
    renamed: 'text-theme-accent',
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
  /** Repo path — needed when rendering ImageDiffViewer for binary image files. */
  repoPath?: string;
  /** Commit hash — passed to ImageDiffViewer for history diffs. */
  commitHash?: string;
}

/**
 * DiffViewer - Main component for viewing file diffs.
 */
function DiffViewer({ fileDiff, showHeader = true, repoPath, commitHash }: DiffViewerProps) {
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
      <div className="flex items-center justify-center h-full text-theme-error text-sm">
        {fileDiff.error || 'Failed to load diff'}
      </div>
    );
  }

  // Binary file — render ImageDiffViewer for image files, fallback message for others
  if (fileDiff.binary) {
    if (repoPath && isImageFile(fileDiff.path)) {
      return (
        <div className="flex flex-col h-full">
          {showHeader && <DiffHeader fileDiff={fileDiff} />}
          <div className="flex-1 min-h-0">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-theme-secondary text-sm">
                  Loading image diff viewer…
                </div>
              }
            >
              <ImageDiffViewer
                repoPath={repoPath}
                filePath={fileDiff.path}
                commitHash={commitHash}
                isWorkingTree={!commitHash}
              />
            </Suspense>
          </div>
        </div>
      );
    }
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
