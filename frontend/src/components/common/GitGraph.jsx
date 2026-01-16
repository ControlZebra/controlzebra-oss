/**
 * GitGraph - Custom SVG-based git graph visualization component.
 * Renders commit history with branch/merge topology similar to git log --graph.
 * 
 * Features:
 * - Visual branch lines with colors
 * - Branch and tag labels (refs)
 * - Commit nodes with connection lines
 * - Click to select commit for details
 * - Light/dark theme support via CSS variables
 * - Proper text overflow handling
 */
import { memo, useMemo, useCallback } from 'react';

// Graph configuration
const CONFIG = {
  nodeRadius: 5,
  lineWidth: 2,
  columnWidth: 14,
  rowHeight: 56, // Increased for two-line layout
  leftPadding: 8,
  graphWidth: 80, // Fixed width for the graph area
};

// Color palette for branches (cycling)
const BRANCH_COLORS = [
  '#3b82f6', // blue - main/master
  '#f59e0b', // amber - feature branches
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
];

/**
 * Compute the visual layout for the git graph.
 * Assigns each commit to a column (lane) based on branch topology.
 */
function computeGraphLayout(commits) {
  if (!commits || commits.length === 0) return { nodes: [], connections: [] };

  const nodes = [];
  const connections = [];
  
  // Track active lanes (columns) - each lane holds the hash of the commit that "owns" it
  const lanes = [];
  // Map commit hash to its assigned column
  const commitToColumn = new Map();
  // Map commit hash to its row index
  const commitToRow = new Map();
  // Track which branch color to use for each lane
  const laneColors = new Map();
  let nextColorIndex = 0;

  commits.forEach((commit, rowIndex) => {
    commitToRow.set(commit.hash, rowIndex);
    
    // Find if this commit continues an existing lane (a parent reserved it)
    let column = lanes.indexOf(commit.hash);
    
    if (column === -1) {
      // New commit not reserved - find first empty lane or create new one
      column = lanes.indexOf(null);
      if (column === -1) {
        column = lanes.length;
        lanes.push(null);
      }
    }
    
    // Assign color if lane doesn't have one
    if (!laneColors.has(column)) {
      laneColors.set(column, BRANCH_COLORS[nextColorIndex % BRANCH_COLORS.length]);
      nextColorIndex++;
    }
    
    // Clear this lane since we're processing this commit
    lanes[column] = null;
    commitToColumn.set(commit.hash, column);
    
    const color = laneColors.get(column);
    
    // Create node for this commit
    nodes.push({
      hash: commit.hash,
      shortHash: commit.shortHash,
      message: commit.message,
      author: commit.author,
      relativeDate: commit.relativeDate,
      refs: commit.refs || [],
      row: rowIndex,
      column,
      color,
    });
    
    // Reserve lanes for parents
    if (commit.parents && commit.parents.length > 0) {
      commit.parents.forEach((parentHash, parentIndex) => {
        let parentColumn;
        
        if (parentIndex === 0) {
          // First parent continues in the same lane
          parentColumn = column;
          lanes[column] = parentHash;
        } else {
          // Additional parents (merge) - find or create a lane for them
          const existingLane = lanes.indexOf(parentHash);
          if (existingLane !== -1) {
            parentColumn = existingLane;
          } else {
            // Find first empty lane to the right, or create new one
            let emptyLane = -1;
            for (let i = column + 1; i < lanes.length; i++) {
              if (lanes[i] === null) {
                emptyLane = i;
                break;
              }
            }
            if (emptyLane === -1) {
              emptyLane = lanes.length;
              lanes.push(null);
            }
            parentColumn = emptyLane;
            lanes[parentColumn] = parentHash;
            
            // Assign a new color for this branch
            if (!laneColors.has(parentColumn)) {
              laneColors.set(parentColumn, BRANCH_COLORS[nextColorIndex % BRANCH_COLORS.length]);
              nextColorIndex++;
            }
          }
        }
        
        // Create connection to parent
        connections.push({
          fromRow: rowIndex,
          fromColumn: column,
          toParentHash: parentHash,
          toColumn: parentColumn,
          color: parentIndex === 0 ? color : laneColors.get(parentColumn),
          isMerge: parentIndex > 0,
        });
      });
    }
  });
  
  // Resolve connections to parent rows and columns
  // We need to update toColumn because in branch-out scenarios,
  // multiple children may reserve different lanes for the same parent,
  // but the parent will only occupy one actual column.
  connections.forEach(conn => {
    const parentRow = commitToRow.get(conn.toParentHash);
    if (parentRow !== undefined) {
      conn.toRow = parentRow;
    }
    // Update toColumn to the parent's actual column
    const actualParentColumn = commitToColumn.get(conn.toParentHash);
    if (actualParentColumn !== undefined) {
      conn.toColumn = actualParentColumn;
    }
  });
  
  // Calculate max column for width
  const maxColumn = Math.max(...nodes.map(n => n.column), 0);
  
  return { nodes, connections, maxColumn };
}

/**
 * Renders commit info (message, author, date) next to the graph.
 * Uses HTML elements for proper text handling and theme support.
 */
const CommitRow = memo(function CommitRow({ node, isSelected, onSelect }) {
  // Format refs for display - separate branch names and tags
  const branchRefs = node.refs.filter(ref => !ref.startsWith('tag:'));
  const tagRefs = node.refs.filter(ref => ref.startsWith('tag:')).map(ref => ref.replace('tag: ', ''));
  
  return (
    <div
      className={`
        group flex items-start gap-2 px-2 py-1.5 cursor-pointer rounded-md mx-1 w-full
        transition-colors duration-150
        ${isSelected 
          ? 'bg-blue-500/15 ring-1 ring-blue-500/30 dark:bg-blue-500/20 dark:ring-blue-500/30' 
          : 'hover:bg-theme-subtle'
        }
      `}
      onClick={() => onSelect(node.hash)}
      title={`${node.hash}\n${node.message}`}
    >
      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
        {/* First line: refs + message */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Branch refs */}
          {branchRefs.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {branchRefs.slice(0, 2).map((ref, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded
                    bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400
                    max-w-[80px] truncate"
                  title={ref}
                >
                  {ref}
                </span>
              ))}
              {branchRefs.length > 2 && (
                <span className="text-[10px] text-theme-muted">+{branchRefs.length - 2}</span>
              )}
            </div>
          )}
          {/* Tag refs */}
          {tagRefs.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {tagRefs.slice(0, 1).map((ref, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded
                    bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400
                    max-w-[60px] truncate"
                  title={ref}
                >
                  {ref}
                </span>
              ))}
            </div>
          )}
          {/* Commit message */}
          <span className={`
            text-sm truncate min-w-0 flex-1
            ${isSelected ? 'text-theme-primary font-medium' : 'text-theme-primary'}
          `}>
            {node.message}
          </span>
        </div>
        
        {/* Second line: hash + author + date */}
        <div className="flex items-center gap-1.5 text-xs text-theme-muted truncate">
          <span className="font-mono text-theme-secondary shrink-0">{node.shortHash}</span>
          <span className="shrink-0">•</span>
          <span className="truncate min-w-0">{node.author}</span>
          <span className="shrink-0">•</span>
          <span className="shrink-0 text-theme-muted whitespace-nowrap">{node.relativeDate}</span>
        </div>
      </div>
    </div>
  );
});

/**
 * Renders the SVG path for a connection line between commits.
 * Handles straight lines, branch-outs, and merges.
 * 
 * Connection goes from child (fromRow, fromColumn) DOWN to parent (toRow, toColumn).
 * Since we display newest commits at top, child is above parent (fromRow < toRow).
 */
function ConnectionPath({ connection, config }) {
  const { fromRow, fromColumn, toRow, toColumn, color } = connection;
  
  if (toRow === undefined) {
    return null;
  }
  
  // Child position (top) - where the line starts
  const childX = config.leftPadding + fromColumn * config.columnWidth;
  const childY = fromRow * config.rowHeight + config.rowHeight / 2;
  // Parent position (bottom) - where the line ends
  const parentX = config.leftPadding + toColumn * config.columnWidth;
  const parentY = toRow * config.rowHeight + config.rowHeight / 2;
  
  // Start and end points (accounting for node radius)
  const startY = childY + config.nodeRadius;
  const endY = parentY - config.nodeRadius;
  
  if (fromColumn === toColumn) {
    // Straight vertical line - same column
    return (
      <path
        d={`M ${childX} ${startY} L ${parentX} ${endY}`}
        fill="none"
        stroke={color}
        strokeWidth={config.lineWidth}
        strokeLinecap="round"
      />
    );
  }
  
  // Different columns - need to show branch/merge curve
  const rowDiff = toRow - fromRow;
  const midY = (startY + endY) / 2;
  
  if (rowDiff === 1) {
    // Adjacent rows - use a simple quadratic curve
    const path = `M ${childX} ${startY} 
                  Q ${childX} ${endY}, ${parentX} ${endY}`;
    return (
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={config.lineWidth}
        strokeLinecap="round"
      />
    );
  } else {
    // Multiple rows apart - use an S-curve with vertical segments
    // Go down from child, curve to parent's column, then continue to parent
    const curveStartY = startY + config.rowHeight * 0.3;
    const curveEndY = endY - config.rowHeight * 0.3;
    
    const path = `M ${childX} ${startY}
                  L ${childX} ${curveStartY}
                  C ${childX} ${midY}, ${parentX} ${midY}, ${parentX} ${curveEndY}
                  L ${parentX} ${endY}`;
    return (
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={config.lineWidth}
        strokeLinecap="round"
      />
    );
  }
}

/**
 * Renders a single commit node (circle) in the graph.
 */
function CommitNode({ node, config, isSelected }) {
  const x = config.leftPadding + node.column * config.columnWidth;
  const y = node.row * config.rowHeight + config.rowHeight / 2;
  
  return (
    <circle
      cx={x}
      cy={y}
      r={config.nodeRadius}
      fill={isSelected ? '#fff' : node.color}
      stroke={node.color}
      strokeWidth={isSelected ? 2.5 : 2}
      className="transition-all"
    />
  );
}

/**
 * Main GitGraph component.
 * Uses hybrid layout: single SVG for graph lines/nodes, HTML rows for commit text.
 */
function GitGraph({ commits, selectedHash, onSelectCommit, className }) {
  const { nodes, connections, maxColumn } = useMemo(
    () => computeGraphLayout(commits),
    [commits]
  );
  
  const handleSelect = useCallback((hash) => {
    if (onSelectCommit) {
      onSelectCommit(hash === selectedHash ? null : hash);
    }
  }, [onSelectCommit, selectedHash]);
  
  if (!commits || commits.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-theme-muted text-sm">No commit history</p>
      </div>
    );
  }
  
  const graphSvgWidth = CONFIG.leftPadding + (maxColumn + 1) * CONFIG.columnWidth + 8;
  const totalHeight = commits.length * CONFIG.rowHeight;
  
  return (
    <div className={`overflow-y-auto overflow-x-hidden ${className || ''}`}>
      <div className="flex">
        {/* Graph column - fixed width with single SVG for all connections */}
        <div 
          className="shrink-0 relative"
          style={{ width: `${graphSvgWidth}px`, height: `${totalHeight}px` }}
        >
          <svg
            width={graphSvgWidth}
            height={totalHeight}
            className="absolute inset-0"
          >
            {/* Connection lines (render first, behind nodes) */}
            <g className="connections">
              {connections.map((conn, idx) => (
                <ConnectionPath key={idx} connection={conn} config={CONFIG} />
              ))}
            </g>
            
            {/* Commit nodes */}
            <g className="nodes">
              {nodes.map(node => (
                <CommitNode
                  key={node.hash}
                  node={node}
                  config={CONFIG}
                  isSelected={node.hash === selectedHash}
                />
              ))}
            </g>
          </svg>
        </div>
        
        {/* Commit info column - flexible width with overflow handling */}
        <div className="flex-1 min-w-0 flex flex-col">
          {nodes.map((node) => (
            <div 
              key={node.hash}
              style={{ height: `${CONFIG.rowHeight}px` }}
              className="flex items-center"
            >
              <CommitRow
                node={node}
                isSelected={node.hash === selectedHash}
                onSelect={handleSelect}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(GitGraph);
