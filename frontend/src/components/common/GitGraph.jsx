/**
 * GitGraph - Custom SVG-based git graph visualization component.
 * Renders commit history with branch/merge topology similar to git log --graph.
 * 
 * Features:
 * - Visual branch lines with colors
 * - Branch and tag labels (refs)
 * - Commit nodes with connection lines
 * - Click to select commit for details
 */
import { memo, useMemo, useCallback } from 'react';

// Graph configuration
const CONFIG = {
  nodeRadius: 6,
  lineWidth: 2,
  columnWidth: 16,
  rowHeight: 32,
  leftPadding: 12,
  labelPadding: 8,
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
function CommitNode({ node, config, isSelected, onSelect }) {
  const x = config.leftPadding + node.column * config.columnWidth;
  const y = node.row * config.rowHeight + config.rowHeight / 2;
  
  return (
    <circle
      cx={x}
      cy={y}
      r={config.nodeRadius}
      fill={isSelected ? '#fff' : node.color}
      stroke={node.color}
      strokeWidth={isSelected ? 3 : 2}
      className="cursor-pointer transition-all"
      onClick={() => onSelect(node.hash)}
    />
  );
}

/**
 * Renders commit info (message, author, date) next to the graph.
 */
const CommitInfo = memo(function CommitInfo({ node, x, config, isSelected, onSelect }) {
  const y = node.row * config.rowHeight + config.rowHeight / 2;
  
  // Calculate refs display
  const refsDisplay = node.refs.length > 0 
    ? `[${node.refs.join(', ')}] ` 
    : '';
  
  return (
    <g 
      className={`cursor-pointer ${isSelected ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
      onClick={() => onSelect(node.hash)}
    >
      {/* Refs labels inline */}
      {node.refs.length > 0 && (
        <text
          x={x}
          y={y + 4}
          fill="#60a5fa"
          fontSize={12}
          fontFamily="monospace"
          fontWeight="500"
        >
          [{node.refs.join(', ')}]
        </text>
      )}
      
      {/* Commit message */}
      <text
        x={x + (node.refs.length > 0 ? (refsDisplay.length * 7) : 0)}
        y={y + 4}
        fill={isSelected ? '#fff' : '#d1d5db'}
        fontSize={13}
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {node.shortHash} {node.message.substring(0, 50)}{node.message.length > 50 ? '...' : ''}
      </text>
      
      {/* Author and date on second line */}
      <text
        x={x}
        y={y + 18}
        fill="#6b7280"
        fontSize={11}
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {node.author} • {node.relativeDate}
      </text>
    </g>
  );
});

/**
 * Main GitGraph component.
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
  
  const graphWidth = CONFIG.leftPadding + (maxColumn + 1) * CONFIG.columnWidth + CONFIG.labelPadding;
  const totalHeight = commits.length * CONFIG.rowHeight;
  
  return (
    <div className={`overflow-auto ${className || ''}`}>
      <svg
        width="100%"
        height={totalHeight}
        style={{ minWidth: '400px' }}
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
              onSelect={handleSelect}
            />
          ))}
        </g>
        
        {/* Commit info (message, author, etc.) */}
        <g className="commit-info">
          {nodes.map(node => (
            <CommitInfo
              key={node.hash}
              node={node}
              x={graphWidth}
              config={CONFIG}
              isSelected={node.hash === selectedHash}
              onSelect={handleSelect}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export default memo(GitGraph);
