/**
 * ExplorerView - File tree explorer for the repository.
 * Displays hierarchical directory structure with lazy-loading of subdirectories.
 */
import { memo, useState, useCallback, useMemo, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { ICON_SIZES, EXTENSION_COLORS } from '../../../constants';
import { useRepo } from '../../../context';
import { ListDirectory, OpenFile } from '../../../../bindings/changeme/services/filesystemservice';

// Shared icon styles
const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const arrowStyle = { width: ICON_SIZES.md, height: ICON_SIZES.md };

/**
 * FileTreeItem - Recursive tree node for files and directories.
 * Handles lazy-loading of directory contents on expand.
 */
const FileTreeItem = memo(function FileTreeItem({ entry, level = 0, onOpenFile }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Toggle directory expansion and lazy-load children
  const handleToggle = useCallback(async () => {
    if (!entry.isDirectory) return;
    
    // Load children on first expand
    if (!expanded && children.length === 0) {
      setIsLoading(true);
      try {
        const result = await ListDirectory(entry.path);
        if (!result.error) {
          setChildren(result.entries || []);
        }
      } catch (err) {
        console.error('Failed to load directory:', err);
      }
      setIsLoading(false);
    }
    setExpanded(!expanded);
  }, [entry.path, entry.isDirectory, expanded, children.length]);

  // Open file on double-click
  const handleDoubleClick = useCallback(async (e) => {
    e.stopPropagation();
    if (!entry.isDirectory) {
      onOpenFile(entry.path);
    }
  }, [entry.isDirectory, entry.path, onOpenFile]);

  // Get color class based on file extension
  const fileColorClass = useMemo(() => {
    if (entry.isDirectory) return 'text-gray-300';
    return EXTENSION_COLORS[entry.extension] || 'text-gray-400';
  }, [entry.isDirectory, entry.extension]);

  const paddingLeft = 8 + level * 12;

  return (
    <div>
      <div
        onClick={handleToggle}
        onDoubleClick={handleDoubleClick}
        style={{ paddingLeft }}
        className="flex items-center gap-1 py-0.5 pr-2 cursor-pointer hover:bg-gray-700/50 transition-colors select-none"
      >
        {/* Arrow indicator for directories */}
        <span className="w-4 h-4 flex items-center justify-center">
          {entry.isDirectory && (
            expanded ? (
              <ChevronDown style={arrowStyle} className="text-gray-400" />
            ) : (
              <ChevronRight style={arrowStyle} className="text-gray-400" />
            )
          )}
        </span>
        
        {/* File/Folder icon */}
        {entry.isDirectory ? (
          expanded ? (
            <FolderOpen style={iconStyle} className="text-yellow-500 shrink-0" />
          ) : (
            <Folder style={iconStyle} className="text-yellow-500 shrink-0" />
          )
        ) : (
          <FileText style={iconStyle} className={`${fileColorClass} shrink-0`} />
        )}
        
        {/* Entry name */}
        <span className="text-gray-200 text-sm truncate flex-1">{entry.name}</span>
        
        {/* Loading indicator */}
        {isLoading && (
          <span className="text-gray-500 text-xs">...</span>
        )}
      </div>
      
      {/* Children (recursive) */}
      {expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FileTreeItem
              key={child.path}
              entry={child}
              level={level + 1}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
});

function ExplorerView() {
  const { repoPath } = useRepo();
  const [entries, setEntries] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(null);

  // Load root directory when repoPath changes
  // NOTE: Using useEffect (not useMemo) because this triggers side effects
  useEffect(() => {
    const loadDirectory = async () => {
      if (!repoPath) {
        setEntries([]);
        setIsLoaded(false);
        return;
      }
      
      try {
        const result = await ListDirectory(repoPath);
        if (result.error) {
          setError(result.error);
          setEntries([]);
        } else {
          setEntries(result.entries || []);
          setError(null);
        }
        setIsLoaded(true);
      } catch (err) {
        setError('Failed to load directory');
        setEntries([]);
        setIsLoaded(true);
      }
    };

    loadDirectory();
  }, [repoPath]);

  // Handle file open via system default application
  const handleOpenFile = useCallback(async (path) => {
    try {
      const result = await OpenFile(path);
      if (!result.success) {
        console.error('Failed to open file:', result.error);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  }, []);

  // Empty state: no repository open
  if (!repoPath) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-gray-500 text-sm">No folder open</p>
        <p className="text-gray-600 text-xs mt-1">Use File → Open Folder to select a folder</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  // Loading state
  if (!isLoaded) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  // Empty directory state
  if (entries.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-gray-500 text-sm">Empty folder</p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {entries.map((entry) => (
        <FileTreeItem 
          key={entry.path} 
          entry={entry} 
          onOpenFile={handleOpenFile}
        />
      ))}
    </div>
  );
}

export default memo(ExplorerView);
