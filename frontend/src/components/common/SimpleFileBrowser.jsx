/**
 * SimpleFileBrowser - A lightweight file browser component.
 * 
 * Features:
 * - Double-click folders to navigate into them
 * - Breadcrumb navigation for quick jumping
 * - Grid/List view toggle
 * - Hidden files toggle
 * - Git status badges
 * - Uses Lucide icons (no external file browser dependencies)
 */
import { memo, useState, useCallback, useMemo, useEffect } from 'react';
import {
  Folder,
  File,
  FileText,
  FileCode,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  ChevronRight,
  Grid3X3,
  List,
  Eye,
  EyeOff,
  RefreshCw,
  Home,
} from 'lucide-react';
import { 
  ListDirectoryWithOptions, 
  OpenFile,
} from '../../../bindings/changeme/services/filesystemservice';
import { useRepo } from '../../context';
import { toast } from 'sonner';
import { Events } from '@wailsio/runtime';

// Git status color classes
const GIT_STATUS_COLORS = {
  added: 'text-green-400',
  modified: 'text-yellow-400',
  deleted: 'text-red-400',
  renamed: 'text-blue-400',
  untracked: 'text-gray-500',
};

// File extension to icon mapping
const EXTENSION_ICONS = {
  // Code files
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  py: FileCode,
  go: FileCode,
  rs: FileCode,
  java: FileCode,
  c: FileCode,
  cpp: FileCode,
  h: FileCode,
  css: FileCode,
  scss: FileCode,
  html: FileCode,
  xml: FileCode,
  json: FileCode,
  yaml: FileCode,
  yml: FileCode,
  toml: FileCode,
  // Text files
  md: FileText,
  txt: FileText,
  log: FileText,
  // Images
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  ico: FileImage,
  // Video
  mp4: FileVideo,
  mov: FileVideo,
  avi: FileVideo,
  mkv: FileVideo,
  webm: FileVideo,
  // Audio
  mp3: FileAudio,
  wav: FileAudio,
  ogg: FileAudio,
  flac: FileAudio,
  // Archives
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  rar: FileArchive,
  '7z': FileArchive,
  // Spreadsheets
  csv: FileSpreadsheet,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
};

/**
 * Get the appropriate icon for a file based on extension
 */
function getFileIcon(fileName, isDirectory) {
  if (isDirectory) return Folder;
  
  const ext = fileName.split('.').pop()?.toLowerCase();
  return EXTENSION_ICONS[ext] || File;
}

/**
 * Build git status map for current directory
 */
function buildGitStatusMap(repoStatus, currentPath, repoPath) {
  const statusMap = {};
  if (!repoStatus?.changedFiles || !repoPath) return statusMap;
  
  const relativeCurrentPath = currentPath?.startsWith(repoPath) 
    ? currentPath.slice(repoPath.length + 1)
    : '';
  
  for (const file of repoStatus.changedFiles) {
    const filePath = file.path;
    const fileDir = filePath.includes('/') 
      ? filePath.substring(0, filePath.lastIndexOf('/'))
      : '';
    
    if (fileDir === relativeCurrentPath) {
      const fileName = filePath.split('/').pop();
      statusMap[fileName] = file.status;
    } else if (filePath.startsWith(relativeCurrentPath ? relativeCurrentPath + '/' : '')) {
      const remainingPath = relativeCurrentPath 
        ? filePath.slice(relativeCurrentPath.length + 1)
        : filePath;
      const folderName = remainingPath.split('/')[0];
      if (folderName && !statusMap[folderName]) {
        statusMap[folderName] = 'modified';
      }
    }
  }
  
  return statusMap;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Format date for display
 */
function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  });
}

/**
 * Breadcrumb component for folder navigation
 */
function Breadcrumbs({ currentPath, rootPath, onNavigate }) {
  const parts = useMemo(() => {
    if (!currentPath || !rootPath) return [];
    
    const segments = [];
    let path = currentPath;
    
    while (path && path.length >= rootPath.length) {
      const name = path.split('/').pop() || path;
      segments.unshift({ path, name });
      
      if (path === rootPath) break;
      
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      if (parentPath === path || !parentPath) break;
      path = parentPath;
    }
    
    return segments;
  }, [currentPath, rootPath]);

  if (parts.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 px-3 py-2 bg-theme-surface border-b border-theme-default overflow-x-auto">
      <button
        onClick={() => onNavigate(rootPath)}
        className="p-1 hover:bg-theme-muted rounded text-theme-muted hover:text-theme-primary transition-colors shrink-0"
        title="Go to root"
      >
        <Home className="w-4 h-4" />
      </button>
      
      {parts.map((part, index) => (
        <div key={part.path} className="flex items-center shrink-0">
          <ChevronRight className="w-4 h-4 text-theme-muted" />
          <button
            onClick={() => onNavigate(part.path)}
            className={`px-2 py-1 rounded text-sm transition-colors truncate max-w-[150px] ${
              index === parts.length - 1
                ? 'text-theme-primary font-medium'
                : 'text-theme-muted hover:text-theme-secondary hover:bg-theme-muted'
            }`}
            title={part.name}
          >
            {part.name}
          </button>
        </div>
      ))}
    </nav>
  );
}

/**
 * Toolbar with view toggle and actions
 */
function Toolbar({ viewMode, onViewModeChange, showHidden, onShowHiddenChange, onRefresh }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-theme-surface border-b border-theme-default">
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="p-1.5 hover:bg-theme-muted rounded text-theme-muted hover:text-theme-primary transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={onShowHiddenChange}
          className={`p-1.5 hover:bg-theme-muted rounded transition-colors ${
            showHidden ? 'text-theme-primary' : 'text-theme-muted hover:text-theme-secondary'
          }`}
          title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
        >
          {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </div>
      
      <div className="flex items-center gap-1 bg-theme-muted rounded p-0.5">
        <button
          onClick={() => onViewModeChange('grid')}
          className={`p-1.5 rounded transition-colors ${
            viewMode === 'grid' 
              ? 'bg-theme-surface text-theme-primary shadow-sm' 
              : 'text-theme-muted hover:text-theme-secondary'
          }`}
          title="Grid view"
        >
          <Grid3X3 className="w-4 h-4" />
        </button>
        <button
          onClick={() => onViewModeChange('list')}
          className={`p-1.5 rounded transition-colors ${
            viewMode === 'list' 
              ? 'bg-theme-surface text-theme-primary shadow-sm' 
              : 'text-theme-muted hover:text-theme-secondary'
          }`}
          title="List view"
        >
          <List className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * File item component for grid view
 */
function FileItemGrid({ file, gitStatus, onDoubleClick }) {
  const Icon = getFileIcon(file.name, file.isDirectory);
  const statusColor = gitStatus ? GIT_STATUS_COLORS[gitStatus] : '';
  
  return (
    <button
      onDoubleClick={onDoubleClick}
      className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-theme-muted transition-colors group w-full"
      title={file.name}
    >
      <div className={`relative ${file.isDirectory ? 'text-yellow-500' : 'text-theme-muted'}`}>
        <Icon className="w-10 h-10" />
        {gitStatus && (
          <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
            gitStatus === 'added' ? 'bg-green-500' :
            gitStatus === 'modified' ? 'bg-yellow-500' :
            gitStatus === 'deleted' ? 'bg-red-500' :
            'bg-gray-500'
          }`} />
        )}
      </div>
      <span className={`text-xs text-center truncate w-full ${statusColor || 'text-theme-primary'}`}>
        {file.name}
      </span>
    </button>
  );
}

/**
 * File item component for list view
 */
function FileItemList({ file, gitStatus, onDoubleClick }) {
  const Icon = getFileIcon(file.name, file.isDirectory);
  const statusColor = gitStatus ? GIT_STATUS_COLORS[gitStatus] : '';
  
  return (
    <button
      onDoubleClick={onDoubleClick}
      className="flex items-center gap-3 px-3 py-2 hover:bg-theme-muted transition-colors w-full text-left rounded"
    >
      <div className={`relative shrink-0 ${file.isDirectory ? 'text-yellow-500' : 'text-theme-muted'}`}>
        <Icon className="w-5 h-5" />
        {gitStatus && (
          <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
            gitStatus === 'added' ? 'bg-green-500' :
            gitStatus === 'modified' ? 'bg-yellow-500' :
            gitStatus === 'deleted' ? 'bg-red-500' :
            'bg-gray-500'
          }`} />
        )}
      </div>
      <span className={`flex-1 truncate text-sm ${statusColor || 'text-theme-primary'}`}>
        {file.name}
      </span>
      {!file.isDirectory && (
        <>
          <span className="text-xs text-theme-muted shrink-0 w-16 text-right">
            {formatFileSize(file.size)}
          </span>
          <span className="text-xs text-theme-muted shrink-0 w-20 text-right">
            {formatDate(file.modTime)}
          </span>
        </>
      )}
    </button>
  );
}

/**
 * Empty state when directory is empty
 */
function EmptyDirectory() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <Folder className="w-12 h-12 text-theme-muted mx-auto mb-3" />
        <p className="text-theme-muted text-sm">This folder is empty</p>
      </div>
    </div>
  );
}

/**
 * Loading state
 */
function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <RefreshCw className="w-8 h-8 text-theme-muted mx-auto mb-3 animate-spin" />
        <p className="text-theme-muted text-sm">Loading...</p>
      </div>
    </div>
  );
}

/**
 * Main SimpleFileBrowser component
 */
function SimpleFileBrowser({ repoPath }) {
  const [currentPath, setCurrentPath] = useState(repoPath);
  const [files, setFiles] = useState(null);
  const [error, setError] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const { repoStatus } = useRepo();

  // Reset current path when repo changes
  useEffect(() => {
    setCurrentPath(repoPath);
  }, [repoPath]);

  // Subscribe to file change events
  useEffect(() => {
    if (!currentPath) return;
    
    const handleFileChanged = (data) => {
      if (data?.path?.startsWith(currentPath) || data?.path === currentPath) {
        setRefreshTrigger(prev => prev + 1);
      }
    };
    
    const unsubscribe = Events.On('files-changed', handleFileChanged);
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [currentPath]);

  // Build git status map
  const gitStatusMap = useMemo(
    () => buildGitStatusMap(repoStatus, currentPath, repoPath),
    [repoStatus, currentPath, repoPath]
  );

  // Load directory contents
  useEffect(() => {
    const loadDirectory = async () => {
      if (!currentPath) {
        setFiles([]);
        return;
      }

      setFiles(null);
      setError(null);

      try {
        const result = await ListDirectoryWithOptions(currentPath, showHidden);
        if (result.error) {
          setError(result.error);
          setFiles([]);
        } else {
          // Sort: directories first, then files (alphabetically)
          const entries = (result.entries || []).sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          });
          setFiles(entries);
        }
      } catch (err) {
        console.error('Failed to load directory:', err);
        setError('Failed to load directory');
        setFiles([]);
      }
    };

    loadDirectory();
  }, [currentPath, showHidden, refreshTrigger]);

  // Handle navigation
  const handleNavigate = useCallback((path) => {
    setCurrentPath(path);
  }, []);

  // Handle file/folder double-click
  const handleItemDoubleClick = useCallback(async (file) => {
    if (file.isDirectory) {
      setCurrentPath(file.path);
    } else {
      try {
        const result = await OpenFile(file.path);
        if (!result.success) {
          toast.error(`Failed to open file: ${result.error}`);
        }
      } catch (err) {
        toast.error('Failed to open file');
      }
    }
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Handle toggle hidden files
  const handleToggleHidden = useCallback(() => {
    setShowHidden(prev => !prev);
  }, []);

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <Breadcrumbs 
        currentPath={currentPath} 
        rootPath={repoPath} 
        onNavigate={handleNavigate} 
      />
      
      <Toolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showHidden={showHidden}
        onShowHiddenChange={handleToggleHidden}
        onRefresh={handleRefresh}
      />
      
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
      
      <div className="flex-1 overflow-auto">
        {files === null ? (
          <LoadingState />
        ) : files.length === 0 ? (
          <EmptyDirectory />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2 p-3">
            {files.map((file) => (
              <FileItemGrid
                key={file.path}
                file={file}
                gitStatus={gitStatusMap[file.name]}
                onDoubleClick={() => handleItemDoubleClick(file)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col p-2">
            {files.map((file) => (
              <FileItemList
                key={file.path}
                file={file}
                gitStatus={gitStatusMap[file.name]}
                onDoubleClick={() => handleItemDoubleClick(file)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(SimpleFileBrowser);
