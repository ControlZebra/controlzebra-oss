import { memo, useState, useCallback, useMemo } from 'react';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { ICON_SIZES } from '../../../constants';
import { useRepo } from '../../../context';
import { ListDirectory, OpenFile } from '../../../../bindings/changeme/services/filesystemservice';

const iconStyle = { fontSize: ICON_SIZES.sm };
const arrowStyle = { fontSize: ICON_SIZES.md };

// File extension to icon color mapping
const EXTENSION_COLORS = {
  js: 'text-yellow-400',
  jsx: 'text-blue-400',
  ts: 'text-blue-500',
  tsx: 'text-blue-400',
  json: 'text-yellow-500',
  md: 'text-gray-300',
  go: 'text-cyan-400',
  py: 'text-green-400',
  html: 'text-orange-400',
  css: 'text-blue-300',
  scss: 'text-pink-400',
  yml: 'text-red-400',
  yaml: 'text-red-400',
  xml: 'text-orange-300',
  txt: 'text-gray-400',
};

function FileTreeItem({ entry, level = 0, onOpenFile }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = useCallback(async () => {
    if (!entry.isDirectory) return;
    
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

  const handleDoubleClick = useCallback(async (e) => {
    e.stopPropagation();
    if (!entry.isDirectory) {
      onOpenFile(entry.path);
    }
  }, [entry.isDirectory, entry.path, onOpenFile]);

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
        {/* Arrow for directories */}
        <span className="w-4 h-4 flex items-center justify-center">
          {entry.isDirectory && (
            expanded ? (
              <ArrowDropDownIcon sx={arrowStyle} className="text-gray-400" />
            ) : (
              <ArrowRightIcon sx={arrowStyle} className="text-gray-400" />
            )
          )}
        </span>
        
        {/* Icon */}
        {entry.isDirectory ? (
          expanded ? (
            <FolderOpenIcon sx={iconStyle} className="text-yellow-500 shrink-0" />
          ) : (
            <FolderIcon sx={iconStyle} className="text-yellow-500 shrink-0" />
          )
        ) : (
          <InsertDriveFileIcon sx={iconStyle} className={`${fileColorClass} shrink-0`} />
        )}
        
        {/* Name */}
        <span className="text-gray-200 text-sm truncate flex-1">{entry.name}</span>
        
        {isLoading && (
          <span className="text-gray-500 text-xs">...</span>
        )}
      </div>
      
      {/* Children */}
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
}

function ExplorerView() {
  const { repoPath } = useRepo();
  const [entries, setEntries] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(null);

  // Load root directory when component mounts or repoPath changes
  const loadDirectory = useCallback(async () => {
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
  }, [repoPath]);

  // Load on mount and when path changes
  useMemo(() => {
    loadDirectory();
  }, [loadDirectory]);

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

  if (!repoPath) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-gray-500 text-sm">No folder open</p>
        <p className="text-gray-600 text-xs mt-1">Use File → Open Folder to select a folder</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

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
