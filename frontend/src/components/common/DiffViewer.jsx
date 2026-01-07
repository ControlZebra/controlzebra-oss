/**
 * DiffViewer - Side-by-side diff viewer for text files.
 * Displays old and new versions with highlighted changes.
 * Each side has its own horizontal scrollbar, vertical scroll is synchronized.
 */
import { memo, useMemo, useRef, useCallback } from 'react';
import { cn } from '../../lib/utils';

/**
 * DiffLine - Single line in the diff viewer.
 */
const DiffLine = memo(function DiffLine({ line, side }) {
  const lineNumber = side === 'old' ? line.oldLine : line.newLine;
  const showContent = side === 'old' 
    ? line.type !== 'add' 
    : line.type !== 'delete';
  
  const bgClass = {
    add: side === 'new' ? 'bg-green-500/20 dark:bg-green-900/30' : '',
    delete: side === 'old' ? 'bg-red-500/20 dark:bg-red-900/30' : '',
    context: '',
  }[line.type] || '';
  
  const textClass = {
    add: 'text-green-700 dark:text-green-300',
    delete: 'text-red-700 dark:text-red-300',
    context: 'text-theme-primary',
  }[line.type] || 'text-theme-primary';
  
  return (
    <div className={cn('flex min-h-[22px] font-mono text-xs', bgClass)}>
      <span className="w-10 flex-shrink-0 px-2 text-right text-theme-muted select-none border-r border-theme-default">
        {showContent && lineNumber > 0 ? lineNumber : ''}
      </span>
      <span className={cn('px-2 whitespace-pre', textClass)}>
        {showContent ? line.content : ''}
      </span>
    </div>
  );
});

/**
 * DiffHunk - A hunk of changes with header.
 * Returns separate arrays for left and right sides to be rendered in split panels.
 */
const DiffHunkLines = memo(function DiffHunkLines({ hunk, side, showHeader }) {
  // Split lines into left (old) and right (new) sides
  const lines = useMemo(() => {
    const left = [];
    const right = [];
    
    for (const line of hunk.lines) {
      if (line.type === 'context') {
        left.push(line);
        right.push(line);
      } else if (line.type === 'delete') {
        left.push(line);
        right.push({ ...line, type: 'placeholder' });
      } else if (line.type === 'add') {
        left.push({ ...line, type: 'placeholder' });
        right.push(line);
      }
    }
    
    // Compact: pair up consecutive delete/add lines
    const compactedLeft = [];
    const compactedRight = [];
    let leftIdx = 0;
    let rightIdx = 0;
    
    while (leftIdx < left.length || rightIdx < right.length) {
      const leftLine = left[leftIdx];
      const rightLine = right[rightIdx];
      
      if (leftLine?.type === 'placeholder' && rightLine?.type === 'placeholder') {
        leftIdx++;
        rightIdx++;
        continue;
      }
      
      if (leftLine?.type === 'delete' && rightLine?.type === 'add') {
        compactedLeft.push({ ...leftLine, newLine: rightLine.newLine });
        compactedRight.push({ ...rightLine, oldLine: leftLine.oldLine });
        leftIdx++;
        rightIdx++;
        continue;
      }
      
      if (leftLine) {
        compactedLeft.push(leftLine);
        leftIdx++;
      }
      if (rightLine) {
        compactedRight.push(rightLine);
        rightIdx++;
      }
    }
    
    // Ensure same length by padding
    while (compactedLeft.length < compactedRight.length) {
      compactedLeft.push({ type: 'placeholder', content: '', oldLine: 0, newLine: 0 });
    }
    while (compactedRight.length < compactedLeft.length) {
      compactedRight.push({ type: 'placeholder', content: '', oldLine: 0, newLine: 0 });
    }
    
    return side === 'old' ? compactedLeft : compactedRight;
  }, [hunk.lines, side]);
  
  return (
    <div className="border-b border-theme-default last:border-b-0">
      {showHeader && (
        <div className="bg-theme-muted px-3 py-1 text-xs text-theme-muted font-mono border-b border-theme-default whitespace-nowrap">
          {hunk.header}
        </div>
      )}
      <div>
        {lines.map((line, idx) => (
          <DiffLine key={idx} line={line} side={side} />
        ))}
      </div>
    </div>
  );
});

/**
 * DiffHeader - File path and status header.
 */
function DiffHeader({ fileDiff }) {
  const statusColors = {
    added: 'text-green-600 dark:text-green-400',
    modified: 'text-yellow-600 dark:text-yellow-400',
    deleted: 'text-red-600 dark:text-red-400',
    renamed: 'text-blue-600 dark:text-blue-400',
  };
  
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-theme-surface border-b border-theme-default">
      <span className={cn('text-xs font-medium uppercase', statusColors[fileDiff.status] || 'text-theme-muted')}>
        {fileDiff.status}
      </span>
      <span className="text-sm text-theme-primary font-mono">
        {fileDiff.oldPath && fileDiff.oldPath !== fileDiff.path 
          ? `${fileDiff.oldPath} → ${fileDiff.path}`
          : fileDiff.path
        }
      </span>
    </div>
  );
}

/**
 * DiffViewer - Main component for viewing file diffs.
 */
function DiffViewer({ fileDiff, showHeader = true }) {
  if (!fileDiff) {
    return (
      <div className="flex items-center justify-center h-full text-theme-muted text-sm">
        Select a file to view changes
      </div>
    );
  }
  
  if (fileDiff.hasError) {
    return (
      <div className="flex items-center justify-center h-full text-red-600 dark:text-red-400 text-sm">
        {fileDiff.error || 'Failed to load diff'}
      </div>
    );
  }
  
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
  
  if (!fileDiff.hunks || fileDiff.hunks.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {showHeader && <DiffHeader fileDiff={fileDiff} />}
        <div className="flex-1 flex items-center justify-center text-theme-muted text-sm">
          No changes to display
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full min-h-0">
      {showHeader && <DiffHeader fileDiff={fileDiff} />}
      {/* Column headers - fixed at top */}
      <div className="flex shrink-0 bg-theme-surface border-b border-theme-default text-xs text-theme-muted">
        <div className="w-1/2 px-3 py-1 border-r border-theme-default">Old</div>
        <div className="w-1/2 px-3 py-1">New</div>
      </div>
      {/* Synchronized vertical scroll container */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex">
          {/* Left panel (old) - horizontal scroll only */}
          <DiffPanel 
            fileDiff={fileDiff} 
            side="old"
          />
          {/* Right panel (new) - horizontal scroll only */}
          <DiffPanel 
            fileDiff={fileDiff} 
            side="new"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * DiffPanel - Single side of the diff viewer with horizontal scrollbar only.
 * Vertical scrolling is handled by the parent container.
 */
const DiffPanel = memo(function DiffPanel({ fileDiff, side }) {
  return (
    <div className={cn(
      'w-1/2 overflow-x-auto',
      side === 'old' && 'border-r border-theme-default'
    )}>
      <div className="min-w-max">
        {fileDiff.hunks.map((hunk, idx) => (
          <DiffHunkLines 
            key={idx} 
            hunk={hunk} 
            side={side}
            showHeader={fileDiff.hunks.length > 1}
          />
        ))}
      </div>
    </div>
  );
});

export default memo(DiffViewer);
