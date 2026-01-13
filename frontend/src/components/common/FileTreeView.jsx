/**
 * FileTreeView - File tree explorer component.
 * Displays hierarchical directory structure with lazy-loading of subdirectories.
 * Used in the MainArea when a folder is open.
 */
import { memo, useState, useCallback, useMemo, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { ICON_SIZES, EXTENSION_COLORS } from '../../constants';
import { ListDirectory, OpenFile } from '../../../bindings/changeme/services/filesystemservice';

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
    if (entry.isDirectory) return 'text-theme-secondary';
    return EXTENSION_COLORS[entry.extension] || 'text-theme-secondary';
  }, [entry.isDirectory, entry.extension]);

  const paddingLeft = 16 + level * 16;

  return (
    <div>
      <div
        onClick={handleToggle}
        onDoubleClick={handleDoubleClick}
        style={{ paddingLeft }}
        className="flex items-center gap-2 py-1 pr-4 cursor-pointer hover-bg-theme-interactive transition-colors select-none"
      >
        {/* Arrow indicator for directories */}
        <span className="w-5 h-5 flex items-center justify-center shrink-0">
          {entry.isDirectory && (
            expanded ? (
              <ChevronDown style={arrowStyle} className="text-theme-secondary" />
            ) : (
              <ChevronRight style={arrowStyle} className="text-theme-secondary" />
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
        <span className="text-theme-primary text-sm truncate flex-1">{entry.name}</span>
        
        {/* Loading indicator */}
        {isLoading && (
          <span className="text-theme-muted text-xs">...</span>
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

function FileTreeView({ repoPath }) {
  const [entries, setEntries] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(null);

  // Load root directory when repoPath changes
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

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  // Loading state
  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-theme-muted text-sm">Loading...</p>
      </div>
    );
  }

  // Empty directory state
  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-theme-muted text-sm">Empty folder</p>
      </div>
    );
  }

  const folderName = repoPath?.split('/').pop() || 'Files';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-theme-default flex items-center gap-2">
        <Folder style={iconStyle} className="text-yellow-500" />
        <span className="text-theme-primary font-medium">{folderName}</span>
        <span className="text-theme-muted text-xs">({entries.length} items)</span>
      </div>
      
      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-2">
        {entries.map((entry) => (
          <FileTreeItem 
            key={entry.path} 
            entry={entry} 
            onOpenFile={handleOpenFile}
          />
        ))}
      </div>
      
      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-theme-default text-xs text-theme-muted">
        Double-click to open files
      </div>
    </div>
  );
}

export default memo(FileTreeView);
