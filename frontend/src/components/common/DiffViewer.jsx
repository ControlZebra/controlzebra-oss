/**
 * DiffViewer - Side-by-side diff viewer for text files.
 * Displays old and new versions with highlighted changes.
 */
import { memo, useMemo } from 'react';
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
    add: side === 'new' ? 'bg-green-900/30' : '',
    delete: side === 'old' ? 'bg-red-900/30' : '',
    context: '',
  }[line.type] || '';
  
  const textClass = {
    add: 'text-green-300',
    delete: 'text-red-300',
    context: 'text-gray-300',
  }[line.type] || 'text-gray-300';
  
  return (
    <div className={cn('flex min-h-[22px] font-mono text-xs', bgClass)}>
      <span className="w-10 flex-shrink-0 px-2 text-right text-gray-500 select-none border-r border-gray-700/50">
        {showContent && lineNumber > 0 ? lineNumber : ''}
      </span>
      <span className={cn('flex-1 px-2 whitespace-pre overflow-hidden', textClass)}>
        {showContent ? line.content : ''}
      </span>
    </div>
  );
});

/**
 * DiffHunk - A hunk of changes with header.
 */
const DiffHunk = memo(function DiffHunk({ hunk, showHeader }) {
  // Split lines into left (old) and right (new) sides
  const { leftLines, rightLines } = useMemo(() => {
    const left = [];
    const right = [];
    
    for (const line of hunk.lines) {
      if (line.type === 'context') {
        left.push(line);
        right.push(line);
      } else if (line.type === 'delete') {
        left.push(line);
        // Add placeholder on right
        right.push({ ...line, type: 'placeholder' });
      } else if (line.type === 'add') {
        // Add placeholder on left
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
      
      // If both are placeholders, skip (shouldn't happen)
      if (leftLine?.type === 'placeholder' && rightLine?.type === 'placeholder') {
        leftIdx++;
        rightIdx++;
        continue;
      }
      
      // If left is delete and right is add, pair them
      if (leftLine?.type === 'delete' && rightLine?.type === 'add') {
        compactedLeft.push({ ...leftLine, newLine: rightLine.newLine });
        compactedRight.push({ ...rightLine, oldLine: leftLine.oldLine });
        leftIdx++;
        rightIdx++;
        continue;
      }
      
      // Otherwise just advance
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
    
    return { leftLines: compactedLeft, rightLines: compactedRight };
  }, [hunk.lines]);
  
  return (
    <div className="border-b border-gray-700/50 last:border-b-0">
      {showHeader && (
        <div className="bg-gray-800/50 px-3 py-1 text-xs text-gray-500 font-mono border-b border-gray-700/50">
          {hunk.header}
        </div>
      )}
      <div className="flex">
        {/* Left side (old) */}
        <div className="flex-1 border-r border-gray-700 overflow-hidden">
          {leftLines.map((line, idx) => (
            <DiffLine key={`left-${idx}`} line={line} side="old" />
          ))}
        </div>
        {/* Right side (new) */}
        <div className="flex-1 overflow-hidden">
          {rightLines.map((line, idx) => (
            <DiffLine key={`right-${idx}`} line={line} side="new" />
          ))}
        </div>
      </div>
    </div>
  );
});

/**
 * DiffHeader - File path and status header.
 */
function DiffHeader({ fileDiff }) {
  const statusColors = {
    added: 'text-green-400',
    modified: 'text-yellow-400',
    deleted: 'text-red-400',
    renamed: 'text-blue-400',
  };
  
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700">
      <span className={cn('text-xs font-medium uppercase', statusColors[fileDiff.status] || 'text-gray-400')}>
        {fileDiff.status}
      </span>
      <span className="text-sm text-gray-200 font-mono">
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
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Select a file to view changes
      </div>
    );
  }
  
  if (fileDiff.hasError) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm">
        {fileDiff.error || 'Failed to load diff'}
      </div>
    );
  }
  
  if (fileDiff.binary) {
    return (
      <div className="flex flex-col h-full">
        {showHeader && <DiffHeader fileDiff={fileDiff} />}
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          Binary file - cannot display diff
        </div>
      </div>
    );
  }
  
  if (!fileDiff.hunks || fileDiff.hunks.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {showHeader && <DiffHeader fileDiff={fileDiff} />}
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          No changes to display
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full min-h-0">
      {showHeader && <DiffHeader fileDiff={fileDiff} />}
      <div className="flex-1 overflow-auto min-h-0">
        {/* Column headers */}
        <div className="flex sticky top-0 bg-gray-800/95 border-b border-gray-700 text-xs text-gray-400">
          <div className="flex-1 px-3 py-1 border-r border-gray-700">
            Old
          </div>
          <div className="flex-1 px-3 py-1">
            New
          </div>
        </div>
        {/* Hunks */}
        {fileDiff.hunks.map((hunk, idx) => (
          <DiffHunk 
            key={idx} 
            hunk={hunk} 
            showHeader={fileDiff.hunks.length > 1}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(DiffViewer);
