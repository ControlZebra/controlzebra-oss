/**
 * GitGraph - Custom SVG-based git graph visualization component.
 * Renders commit history with branch/merge topology similar to git log --graph.
 * 
 * Features:
 * - Visual branch lines with colors
 * - Commit nodes with connection lines
 * - Click to select commit for details
 * - Compact commit info with hover tooltips
 * - Smart message truncation based on sidebar width
 */
import { memo, useMemo, useCallback, useRef, useState, useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../components/ui';
import { shortenRelativeDate } from '../utils/relativeDate';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Smart truncate message based on available width.
 * Assumes ~7px per character for monospace font at text-xs size.
 */
function truncateMessage(message: string, availableWidth: number): string {
  const firstLine = message.split('\n')[0].trim();
  // Approximate character width for text-xs monospace (~7px per char)
  const charWidth = 7;
  // Account for time (6ch ~42px) + separator (1ch ~7px) + padding (~16px)
  const reservedWidth = 65;
  const maxChars = Math.max(8, Math.floor((availableWidth - reservedWidth) / charWidth));
  
  if (firstLine.length <= maxChars) return firstLine;
  return firstLine.slice(0, maxChars - 1) + '…';
}

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

interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  relativeDate: string;
  refs?: string[];
  parents?: string[];
}

interface GraphNode {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  relativeDate: string;
  refs: string[];
  row: number;
  column: number;
  color: string;
}

interface Connection {
  fromRow: number;
  fromColumn: number;
  toParentHash: string;
  toColumn: number;
  toRow?: number;
  color: string;
  isMerge: boolean;
}

interface GraphLayout {
  nodes: GraphNode[];
  connections: Connection[];
  maxColumn: number;
}

/**
 * Compute the visual layout for the git graph.
 * Assigns each commit to a column (lane) based on branch topology.
 */
function computeGraphLayout(commits: Commit[]): GraphLayout {
  if (!commits || commits.length === 0) return { nodes: [], connections: [], maxColumn: 0 };

  const nodes: GraphNode[] = [];
  const connections: Connection[] = [];
  
  // Track active lanes (columns) - each lane holds the hash of the commit that "owns" it
  const lanes: (string | null)[] = [];
  // Map commit hash to its assigned column
  const commitToColumn = new Map<string, number>();
  // Map commit hash to its row index
  const commitToRow = new Map<string, number>();
  // Track which branch color to use for each lane
  const laneColors = new Map<number, string>();
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
    
    const color = laneColors.get(column)!;
    
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
        let parentColumn: number;
        
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
          color: parentIndex === 0 ? color : laneColors.get(parentColumn)!,
          isMerge: parentIndex > 0,
        });
      });
    }
  });
  
  // Resolve connections to parent rows and columns
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

interface ConnectionPathProps {
  connection: Connection;
  config: typeof CONFIG;
}

/**
 * Renders the SVG path for a connection line between commits.
 */
function ConnectionPath({ connection, config }: ConnectionPathProps) {
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

interface CommitNodeProps {
  node: GraphNode;
  config: typeof CONFIG;
  isSelected: boolean;
  onSelect: (hash: string) => void;
}

/**
 * Renders a single commit node (circle) in the graph.
 */
function CommitNode({ node, config, isSelected, onSelect }: CommitNodeProps) {
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

interface CommitInfoProps {
  node: GraphNode;
  x: number;
  config: typeof CONFIG;
  isSelected: boolean;
  onSelect: (hash: string) => void;
  availableWidth: number;
}

/**
 * Renders compact commit info with tooltip.
 * Format: "2h · Fix valve…" (no branch refs, just message)
 */
const CommitInfo = memo(function CommitInfo({ node, x, config, isSelected, onSelect, availableWidth }: CommitInfoProps) {
  const y = node.row * config.rowHeight;
  const shortTime = shortenRelativeDate(node.relativeDate);
  const truncatedMessage = truncateMessage(node.message, availableWidth);
  const hasRefs = node.refs.length > 0;
  
  return (
    <foreignObject
      x={x}
      y={y}
      width={Math.max(100, availableWidth)}
      height={config.rowHeight}
      className="overflow-visible"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSelect(node.hash)}
            className={`
              w-full h-full flex items-center gap-1.5 text-left text-xs px-1
              transition-colors duration-100
              focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500
              ${isSelected
                ? 'text-blue-600 dark:text-blue-300'
                : 'text-theme-secondary hover:text-theme-primary'
              }
            `}
          >
            {/* Compact time */}
            <span className="text-theme-muted shrink-0 w-6 text-right">
              {shortTime}
            </span>
            
            <span className="text-theme-muted/60">·</span>
            
            {/* Truncated message only (no refs) */}
            <span className="truncate flex-1 min-w-0">
              {truncatedMessage}
            </span>
          </button>
        </TooltipTrigger>
        
        <TooltipContent side="right" align="start" className="max-w-xs">
          <div className="space-y-1.5">
            {/* Full message */}
            <p className="font-medium text-theme-primary break-words">
              {node.message.split('\n')[0]}
            </p>
            
            {/* Meta info */}
            <div className="flex flex-col gap-0.5 text-theme-secondary">
              <span>{node.author}</span>
              <span className="text-theme-muted">{node.shortHash}</span>
              <span>{node.relativeDate}</span>
            </div>
            
            {/* Refs shown only in tooltip */}
            {hasRefs && (
              <div className="flex flex-wrap gap-1 pt-1">
                {node.refs.map((ref) => (
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
    </foreignObject>
  );
});

interface GitGraphProps {
  commits: Commit[];
  selectedHash?: string | null;
  onSelectCommit?: (hash: string | null) => void;
  className?: string;
}

/**
 * Main GitGraph component.
 */
function GitGraph({ commits, selectedHash, onSelectCommit, className }: GitGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(200);
  
  // Measure container width for smart truncation
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    
    // Use ResizeObserver for responsive width updates
    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => resizeObserver.disconnect();
  }, []);
  
  const { nodes, connections, maxColumn } = useMemo(
    () => computeGraphLayout(commits),
    [commits]
  );
  
  const handleSelect = useCallback((hash: string) => {
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
  // Available width for commit info = container width - graph area
  const infoAvailableWidth = Math.max(100, containerWidth - graphWidth - 10);
  
  return (
    <TooltipProvider delayDuration={300}>
      <div ref={containerRef} className={`overflow-auto ${className || ''}`}>
        <svg
          width="100%"
          height={totalHeight}
          style={{ minWidth: `${graphWidth + 100}px` }}
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
          
          {/* Commit info (compact with tooltips) */}
          <g className="commit-info">
            {nodes.map(node => (
              <CommitInfo
                key={node.hash}
                node={node}
                x={graphWidth}
                config={CONFIG}
                isSelected={node.hash === selectedHash}
                onSelect={handleSelect}
                availableWidth={infoAvailableWidth}
              />
            ))}
          </g>
        </svg>
      </div>
    </TooltipProvider>
  );
}

export default memo(GitGraph);
