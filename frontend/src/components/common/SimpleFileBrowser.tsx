/**
 * SimpleFileBrowser - A lightweight file browser component.
 * 
 * Features:
 * - Double-click folders to navigate into them
 * - Breadcrumb navigation for quick jumping
 * - Grid/List view toggle
 * - Hidden files toggle
 * - Git status badges
 * - Virtualized table view for performance
 * - Uses Lucide icons (no external file browser dependencies)
 */
import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  X,
  ExternalLink,
  Clipboard,
  Trash2,
  Download,
  Share2,
  FolderOpen,
  Link,
  FileEdit,
  Copy,
  Info,
  Cloud,
  type LucideIcon,
} from 'lucide-react';
import { 
  ListDirectoryWithOptions, 
  OpenFile,
  RevealInFinder,
  CopyToClipboard,
} from '../../../bindings/controlzebra/services/filesystemservice';
import { GetRemoteURL } from '../../../bindings/controlzebra/services/gitservice';
import { FileEntry } from '../../../bindings/controlzebra/services/models';
import { useRepo, useLayout } from '../../context';
import { toast } from 'sonner';
import { Events } from '@wailsio/runtime';
import { isTextFile, type ExplorerTab } from '../../constants';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '../ui/context-menu';

/**
 * Helper to reveal a path in Finder with consistent error handling
 */
async function revealPathInFinder(path: string): Promise<boolean> {
  try {
    const result = await RevealInFinder(path);
    if (!result.success) {
      toast.error(result.error || 'Failed to reveal in Finder');
      return false;
    }
    return true;
  } catch (err) {
    console.error('RevealInFinder error:', err);
    toast.error('Failed to reveal in Finder');
    return false;
  }
}

/**
 * Convert a git remote URL to a web-browseable URL
 * Handles SSH (git@github.com:user/repo.git) and HTTPS formats
 */
function gitUrlToWebUrl(gitUrl: string): string {
  if (!gitUrl) return '';
  
  let webUrl = gitUrl.trim();
  
  // Handle SSH format: git@github.com:user/repo.git -> https://github.com/user/repo
  if (webUrl.startsWith('git@')) {
    webUrl = webUrl
      .replace(/^git@/, 'https://')
      .replace(/:([^/])/, '/$1'); // Replace first : with /
  }
  
  // Remove .git suffix if present
  if (webUrl.endsWith('.git')) {
    webUrl = webUrl.slice(0, -4);
  }
  
  return webUrl;
}

/**
 * Helper to copy text to clipboard with consistent error handling
 */
async function copyTextToClipboard(text: string, successMessage = 'Copied to clipboard'): Promise<boolean> {
  try {
    const result = await CopyToClipboard(text);
    if (result.success) {
      toast.success(successMessage);
      return true;
    } else {
      toast.error(result.error || 'Failed to copy to clipboard');
      return false;
    }
  } catch (err) {
    console.error('CopyToClipboard error:', err);
    toast.error('Failed to copy to clipboard');
    return false;
  }
}

// Git status color classes - used for text and icons
const GIT_STATUS_COLORS: Record<string, string> = {
  added: 'text-green-500',
  modified: 'text-yellow-500',
  deleted: 'text-red-500',
  renamed: 'text-blue-500',
  untracked: 'text-gray-500',
};

// Git status single-letter labels
const GIT_STATUS_LABELS: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
};

const IS_MAC_OS = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

// File extension to icon mapping
const EXTENSION_ICONS: Record<string, LucideIcon> = {
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

interface RepoStatus {
  changedFiles?: Array<{
    path: string;
    status: string;
  }>;
}

/**
 * Get the appropriate icon for a file based on extension
 */
function getFileIcon(fileName: string, isDirectory: boolean): LucideIcon {
  if (isDirectory) return Folder;
  
  const ext = fileName.split('.').pop()?.toLowerCase();
  return (ext && EXTENSION_ICONS[ext]) || File;
}

/**
 * Build git status map for current directory
 */
function buildGitStatusMap(repoStatus: RepoStatus | null, currentPath: string | null, repoPath: string | null): Record<string, string> {
  const statusMap: Record<string, string> = {};
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
      if (fileName) {
        statusMap[fileName] = file.status;
      }
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
function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Format date for display
 */
function formatDate(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const currentYear = new Date().getFullYear();
  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== currentYear ? 'numeric' : undefined
  });
}

interface BreadcrumbsProps {
  currentPath: string | null;
  rootPath: string | null;
  onNavigate: (path: string) => void;
}

/**
 * Truncate text in the middle (macOS style)
 * Shows beginning and end of text with ellipsis in the middle
 */
function truncateMiddle(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  
  const ellipsis = '…';
  const charsToShow = maxLength - ellipsis.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  
  return text.substring(0, frontChars) + ellipsis + text.substring(text.length - backChars);
}

/**
 * Breadcrumb component for folder navigation
 */
function Breadcrumbs({ currentPath, rootPath, onNavigate }: BreadcrumbsProps) {
  const parts = useMemo(() => {
    if (!currentPath || !rootPath) return [];
    
    const segments: Array<{ path: string; name: string }> = [];
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
    <nav className="flex items-center gap-1 px-4 py-3 bg-fb-breadcrumb overflow-x-auto">
      <button
        onClick={() => rootPath && onNavigate(rootPath)}
        className="p-1.5 hover:bg-fb-hover rounded text-theme-muted hover:text-theme-primary transition-colors shrink-0"
        title="Go to root"
      >
        <Home className="w-5 h-5" />
      </button>
      
      {parts.map((part, index) => (
        <div key={part.path} className="flex items-center shrink-0">
          <ChevronRight className="w-5 h-5 text-theme-muted" />
          <button
            onClick={() => onNavigate(part.path)}
            className={`px-2 py-1.5 rounded text-base transition-colors ${
              index === parts.length - 1
                ? 'text-theme-primary font-semibold'
                : 'text-theme-muted hover:text-theme-secondary hover:bg-fb-hover'
            }`}
            title={part.name}
          >
            {truncateMiddle(part.name, 20)}
          </button>
        </div>
      ))}
    </nav>
  );
}

interface ToolbarProps {
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  showHidden: boolean;
  onShowHiddenChange: () => void;
  onRefresh: () => void;
  currentPath: string | null;
  repoPath: string | null;
}

/**
 * Toolbar with view toggle and actions
 */
function Toolbar({ viewMode, onViewModeChange, showHidden, onShowHiddenChange, onRefresh, currentPath, repoPath }: ToolbarProps) {
  const handleOpenInFinder = useCallback(async () => {
    if (!currentPath) return;
    await revealPathInFinder(currentPath);
  }, [currentPath]);

  const handleCopyLink = useCallback(async () => {
    if (!currentPath || !repoPath) {
      toast.error('No repository path available');
      return;
    }
    
    try {
      // Get the remote URL from git
      const remoteUrl = await GetRemoteURL(repoPath);
      if (!remoteUrl) {
        toast.error('No remote repository configured');
        return;
      }
      
      // Convert git URL to web URL
      const webBaseUrl = gitUrlToWebUrl(remoteUrl);
      if (!webBaseUrl) {
        toast.error('Could not parse remote URL');
        return;
      }
      
      // Calculate relative path from repo root
      const relativePath = currentPath.startsWith(repoPath)
        ? currentPath.slice(repoPath.length)
        : '';
      
      // URL-encode the path segments to handle special characters:
      // - Spaces → %20
      // - # → %23 (hash/anchor)
      // - ? → %3F (query string)
      // - & → %26 (query params)
      // - + → %2B (plus sign)
      // - % → %25 (percent sign itself)
      // - Special chars like !, @, $, etc.
      // We encode each path segment separately to preserve the / separators
      const encodedPath = relativePath
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
      
      // Construct the full web URL (e.g., https://github.com/user/repo/tree/main/path/to/folder)
      // Note: We use /tree/main as a common default, but this could be enhanced to detect the actual branch
      const fullUrl = encodedPath
        ? `${webBaseUrl}/tree/main${encodedPath}`
        : webBaseUrl;
      
      await copyTextToClipboard(fullUrl, 'Remote link copied to clipboard');
    } catch (err) {
      console.error('Failed to get remote URL:', err);
      toast.error('Failed to get remote repository URL');
    }
  }, [currentPath, repoPath]);

  const handleViewInCloud = useCallback(() => {
    toast.info('View in Cloud coming soon');
  }, []);

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-fb-toolbar border-b border-theme-default">
      <div className="flex items-center gap-1">
        <button
          onClick={handleOpenInFinder}
          className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-fb-hover rounded text-theme-muted hover:text-theme-primary transition-colors text-xs"
          title="Open in Finder"
          disabled={!currentPath}
        >
          <FolderOpen className="w-4 h-4" />
          <span>Open</span>
        </button>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-fb-hover rounded text-theme-muted hover:text-theme-primary transition-colors text-xs"
          title="Reload"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Reload</span>
        </button>
        <button
          onClick={onShowHiddenChange}
          className={`flex items-center gap-1.5 px-2 py-1.5 hover:bg-fb-hover rounded transition-colors text-xs ${
            showHidden ? 'text-theme-primary' : 'text-theme-muted hover:text-theme-secondary'
          }`}
          title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
        >
          {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          <span>{showHidden ? 'Hide Hidden' : 'Show Hidden'}</span>
        </button>
        <div className="w-px h-4 bg-theme-muted mx-1" />
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-fb-hover rounded text-theme-muted hover:text-theme-primary transition-colors text-xs"
          title="Copy remote repository link"
          disabled={!currentPath || !repoPath}
        >
          <Link className="w-4 h-4" />
          <span>Copy Link</span>
        </button>
        <button
          onClick={handleViewInCloud}
          className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-fb-hover rounded text-theme-muted hover:text-theme-primary transition-colors text-xs"
          title="View in Cloud"
        >
          <Cloud className="w-4 h-4" />
          <span>View in Cloud</span>
        </button>
      </div>
      
      <div className="flex items-center gap-1 bg-fb-surface rounded p-0.5">
        <button
          onClick={() => onViewModeChange('grid')}
          className={`p-1.5 rounded transition-colors ${
            viewMode === 'grid' 
              ? 'bg-fb-base text-theme-primary shadow-sm' 
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
              ? 'bg-fb-base text-theme-primary shadow-sm' 
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

interface FileItemGridProps {
  file: FileEntry;
  gitStatus?: string;
  onDoubleClick: () => void;
}

/**
 * File item component for grid view
 */
function FileItemGrid({ file, gitStatus, onDoubleClick }: FileItemGridProps) {
  const Icon = getFileIcon(file.name, file.isDirectory);
  // Only apply git status color to files, not folders
  const statusColor = (gitStatus && !file.isDirectory) ? GIT_STATUS_COLORS[gitStatus] : '';
  
  return (
    <button
      onDoubleClick={onDoubleClick}
      className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-fb-hover transition-colors group w-full"
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

interface FileItemListProps {
  file: FileEntry;
  gitStatus?: string;
  onDoubleClick: () => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onContextAction?: (action: FileContextAction, file: FileEntry) => void;
}

// Context menu action types
type FileContextAction = 
  | 'open'
  | 'preview'
  | 'open-with'
  | 'reveal-in-finder'
  | 'copy-path'
  | 'copy-name'
  | 'share'
  | 'get-info';

/**
 * Git status icon component
 */
const GitStatusIcon = memo(function GitStatusIcon({ status }: { status?: string }) {
  if (!status) return <div className="w-4 h-4" />; // Empty spacer
  
  const colorClass = GIT_STATUS_COLORS[status] || 'text-gray-500';
  const statusLabel = GIT_STATUS_LABELS[status] || '?';
  
  return (
    <span className={`text-xs font-semibold w-4 h-4 flex items-center justify-center ${colorClass}`} title={status}>
      {statusLabel}
    </span>
  );
});

/**
 * File item component for table view (used in virtualized list)
 */
const FileTableRow = memo(function FileTableRow({ file, gitStatus, onDoubleClick, isSelected, onSelect, onContextAction }: FileItemListProps) {
  const Icon = getFileIcon(file.name, file.isDirectory);
  const statusColor = (gitStatus && !file.isDirectory) ? GIT_STATUS_COLORS[gitStatus] : '';
  
  const handleShareClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onContextAction?.('share', file);
  }, [file, onContextAction]);
  
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="row"
          onClick={onSelect}
          onDoubleClick={onDoubleClick}
          className={`flex items-center h-9 px-3 cursor-pointer border-b border-theme-muted transition-colors group ${
            isSelected 
              ? 'bg-fb-selected border-l-2 border-l-blue-500' 
              : 'hover:bg-fb-hover border-l-2 border-l-transparent'
          }`}
        >
          {/* Git Status Column */}
          <div className="w-6 shrink-0 flex items-center justify-center" role="cell">
            <GitStatusIcon status={!file.isDirectory ? gitStatus : undefined} />
          </div>
          
          {/* Type Icon Column */}
          <div className="w-8 shrink-0 flex items-center justify-center" role="cell">
            <Icon className={`w-4 h-4 ${file.isDirectory ? 'text-yellow-500' : 'text-theme-muted'}`} />
          </div>
          
          {/* Name Column */}
          <div className="flex-1 min-w-0 pr-2 flex items-center" role="cell">
            <span className={`text-sm truncate flex-1 ${statusColor || 'text-theme-primary'}`}>
              {file.name}
            </span>
            {/* Share button - visible on hover, positioned at right end */}
            <button
              onClick={handleShareClick}
              className="flex items-center gap-1 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-fb-hover text-theme-muted hover:text-theme-primary transition-all shrink-0 text-xs"
              title="Share"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>
          </div>
          
          {/* Size Column */}
          <div className="w-20 shrink-0 text-right pr-4" role="cell">
            <span className="text-xs text-theme-muted">
              {!file.isDirectory ? formatFileSize(file.size) : '—'}
            </span>
          </div>
          
          {/* Modified Column */}
          <div className="w-24 shrink-0 text-right" role="cell">
            <span className="text-xs text-theme-muted">
              {formatDate(file.modTime)}
            </span>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={() => onContextAction?.('open', file)}>
          <ExternalLink className="mr-2 h-4 w-4" />
          <span>Open</span>
           <ContextMenuShortcut>⏎</ContextMenuShortcut>
        </ContextMenuItem>
        {!file.isDirectory && isTextFile(file.name) && (
          <ContextMenuItem onClick={() => onContextAction?.('preview', file)}>
            <Eye className="mr-2 h-4 w-4" />
            <span>Preview</span>
            <ContextMenuShortcut>␣</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onContextAction?.('open-with', file)}>
          <FileEdit className="mr-2 h-4 w-4" />
          <span>Open With...</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onContextAction?.('reveal-in-finder', file)}>
          <FolderOpen className="mr-2 h-4 w-4" />
          <span>Reveal in Finder</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onContextAction?.('copy-path', file)}>
          <Clipboard className="mr-2 h-4 w-4" />
          <span>Copy Path</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onContextAction?.('copy-name', file)}>
          <Copy className="mr-2 h-4 w-4" />
          <span>Copy Name</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onContextAction?.('share', file)}>
          <Share2 className="mr-2 h-4 w-4" />
          <span>Share...</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onContextAction?.('get-info', file)}>
          <Info className="mr-2 h-4 w-4" />
          <span>Get Info</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

/**
 * Table header for list view
 */
const FileTableHeader = memo(function FileTableHeader() {
  return (
    <div 
      role="row" 
      className="flex items-center h-8 px-3 bg-fb-base border-b border-theme-default text-xs text-theme-muted font-bold sticky top-0 z-10"
    >
      {/* Git Status Column - no header text */}
      <div className="w-6 shrink-0" role="columnheader" aria-label="Git status" />
      
      {/* Type Icon Column - no header text */}
      <div className="w-8 shrink-0" role="columnheader" aria-label="Type" />
      
      {/* Name Column */}
      <div className="flex-1 min-w-0 pr-4" role="columnheader">
        Name
      </div>
      
      {/* Size Column */}
      <div className="w-20 shrink-0 text-right pr-4" role="columnheader">
        Size
      </div>
      
      {/* Modified Column */}
      <div className="w-24 shrink-0 text-right" role="columnheader">
        Modified
      </div>
    </div>
  );
});

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
function LoadingStateInternal() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <RefreshCw className="w-8 h-8 text-theme-muted mx-auto mb-3 animate-spin" />
        <p className="text-theme-muted text-sm">Loading...</p>
      </div>
    </div>
  );
}

interface FileDetailsSidebarProps {
  file: FileEntry | null;
  gitStatus?: string;
  onClose: () => void;
}

/**
 * Right sidebar showing file details and actions
 */
const FileDetailsSidebar = memo(function FileDetailsSidebar({ file, gitStatus, onClose }: FileDetailsSidebarProps) {
  const Icon = file ? getFileIcon(file.name, file.isDirectory) : File;
  const statusColor = gitStatus ? GIT_STATUS_COLORS[gitStatus] : '';
  const statusLabel = gitStatus ? GIT_STATUS_LABELS[gitStatus] : '';

  const handleRevealInFinder = useCallback(async () => {
    if (!file) return;
    await revealPathInFinder(file.path);
  }, [file]);

  const handleCopyPath = useCallback(async () => {
    if (!file) return;
    await copyTextToClipboard(file.path, 'Path copied to clipboard');
  }, [file]);

  if (!file) return null;

  return (
    <div className="w-72 shrink-0 bg-fb-sidebar border-l border-theme-default flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-default">
        <h3 className="text-sm font-semibold text-theme-primary truncate">Details</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-fb-hover rounded text-theme-muted hover:text-theme-primary transition-colors"
          title="Close details"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* File Info */}
      <div className="flex-1 overflow-auto p-4">
        {/* Icon and Name */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className={`mb-3 ${file.isDirectory ? 'text-yellow-500' : 'text-theme-muted'}`}>
            <Icon className="w-16 h-16" />
          </div>
          <h4 className={`text-sm font-medium break-all ${statusColor || 'text-theme-primary'}`}>
            {file.name}
          </h4>
          {gitStatus && (
            <span className={`text-xs mt-1 ${GIT_STATUS_COLORS[gitStatus]}`}>
              {statusLabel} - {gitStatus.charAt(0).toUpperCase() + gitStatus.slice(1)}
            </span>
          )}
        </div>

        {/* File Properties */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-theme-muted">Type</span>
            <span className="text-theme-primary">
              {file.isDirectory ? 'Folder' : file.name.split('.').pop()?.toUpperCase() || 'File'}
            </span>
          </div>
          {!file.isDirectory && file.size !== undefined && (
            <div className="flex justify-between">
              <span className="text-theme-muted">Size</span>
              <span className="text-theme-primary">{formatFileSize(file.size)}</span>
            </div>
          )}
          {file.modTime && (
            <div className="flex justify-between">
              <span className="text-theme-muted">Modified</span>
              <span className="text-theme-primary">{formatDate(file.modTime)}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 pt-4 border-t border-theme-muted">
          <h5 className="text-xs font-medium text-theme-muted mb-3 uppercase tracking-wider">Actions</h5>
          <div className="space-y-1">
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-theme-primary hover:bg-fb-hover rounded transition-colors"
              onClick={handleRevealInFinder}
            >
              <FolderOpen className="w-4 h-4" />
              <span>Reveal in Finder</span>
            </button>
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-theme-primary hover:bg-fb-hover rounded transition-colors"
              onClick={handleCopyPath}
            >
              <Clipboard className="w-4 h-4" />
              <span>Copy Path</span>
            </button>
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-theme-primary hover:bg-fb-hover rounded transition-colors"
              onClick={() => toast.info('Download coming soon')}
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded transition-colors"
              onClick={() => toast.info('Move to Trash coming soon')}
            >
              <Trash2 className="w-4 h-4" />
              <span>Move to Trash</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

interface SimpleFileBrowserProps {
  repoPath: string | null;
}

/**
 * Virtualized file table component for list view
 */
interface VirtualizedFileTableProps {
  files: FileEntry[];
  gitStatusMap: Record<string, string>;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDoubleClick: (file: FileEntry) => void;
  onContextAction: (action: FileContextAction, file: FileEntry) => void;
}

function VirtualizedFileTable({ 
  files, 
  gitStatusMap, 
  selectedPath, 
  onSelect, 
  onDoubleClick,
  onContextAction,
}: VirtualizedFileTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const rowVirtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // 9 * 4 = 36px (h-9)
    overscan: 10, // Render 10 extra items above/below viewport
  });

  return (
    <div 
      ref={parentRef} 
      className="flex-1 overflow-auto"
      role="table"
      aria-label="Files"
    >
      <FileTableHeader />
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
        role="rowgroup"
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const file = files[virtualRow.index];
          return (
            <div
              key={file.path}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <FileTableRow
                file={file}
                gitStatus={gitStatusMap[file.name]}
                isSelected={selectedPath === file.path}
                onSelect={() => onSelect(file.path)}
                onDoubleClick={() => onDoubleClick(file)}
                onContextAction={onContextAction}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Main SimpleFileBrowser component
 */
function SimpleFileBrowser({ repoPath }: SimpleFileBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string | null>(repoPath);
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  
  const { repoStatus } = useRepo();
  const { openExplorerTab } = useLayout();

  // Reset current path when repo changes
  useEffect(() => {
    setCurrentPath(repoPath);
    setSelectedPath(null);
  }, [repoPath]);

  // Clear selection when navigating to a new directory
  useEffect(() => {
    setSelectedPath(null);
  }, [currentPath]);

  // Subscribe to file change events
  useEffect(() => {
    if (!currentPath) return;
    
    const handleFileChanged = (ev: { data?: { path?: string } }) => {
      const path = ev.data?.path;
      if (path?.startsWith(currentPath) || path === currentPath) {
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
          const entries = (result.entries || []).sort((a: FileEntry, b: FileEntry) => {
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
  const handleNavigate = useCallback((path: string) => {
    setCurrentPath(path);
  }, []);

  // Handle file selection (single click)
  const handleSelect = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  // Handle in-app preview (for text files)
  const handlePreview = useCallback((file: FileEntry) => {
    if (file.isDirectory) return;
    
    // Check if it's a text file we can display in a tab
    if (isTextFile(file.name)) {
      // Open in a tab
      const tab: ExplorerTab = {
        id: file.path,
        title: file.name,
        type: 'file',
        filePath: file.path,
        isPinned: false,
      };
      openExplorerTab(tab);
    } else {
      toast.info('Preview not available for this file type');
    }
  }, [openExplorerTab]);

  // Handle file/folder double-click - opens in default application
  const handleItemDoubleClick = useCallback(async (file: FileEntry) => {
    if (file.isDirectory) {
      setCurrentPath(file.path);
    } else {
      // Open file with default application
      try {
        const result = await OpenFile(file.path);
        if (!result.success) {
          toast.error(`Failed to open file: ${result.error}`);
        }
      } catch {
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

  // Handle closing the sidebar (deselect file)
  const handleCloseSidebar = useCallback(() => {
    setSelectedPath(null);
  }, []);

  // Find the selected file object
  const selectedFile = useMemo(() => {
    if (!selectedPath || !files) return null;
    return files.find(f => f.path === selectedPath) || null;
  }, [selectedPath, files]);

  // Handle keyboard events for preview and open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space bar triggers preview for selected file
      if (e.code === 'Space' && selectedFile && !selectedFile.isDirectory) {
        e.preventDefault();
        handlePreview(selectedFile);
      }

      // Enter key opens the selected file or enters the selected folder
      if (e.key === 'Enter' && selectedFile) {
        e.preventDefault();
        handleItemDoubleClick(selectedFile);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, handlePreview]);

  // Handle context menu actions
  const handleContextAction = useCallback(async (action: FileContextAction, file: FileEntry) => {
    switch (action) {
      case 'open':
        handleItemDoubleClick(file);
        break;
      case 'preview':
        handlePreview(file);
        break;
      case 'open-with':
        toast.info('Open With coming soon');
        break;
      case 'reveal-in-finder':
        await revealPathInFinder(file.path);
        break;
      case 'copy-path':
        await copyTextToClipboard(file.path, 'Path copied to clipboard');
        break;
      case 'copy-name':
        await copyTextToClipboard(file.name, 'Name copied to clipboard');
        break;
      case 'share':
        toast.info('Share coming soon');
        break;
      case 'get-info':
        // Select the file to show details in sidebar
        setSelectedPath(file.path);
        break;
    }
  }, [handleItemDoubleClick, handlePreview]);

  return (
    <div className="flex flex-col h-full bg-fb-base">
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
        currentPath={currentPath}
        repoPath={repoPath}
      />
      
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
      
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main file listing area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {files === null ? (
            <LoadingStateInternal />
          ) : files.length === 0 ? (
            <EmptyDirectory />
          ) : viewMode === 'grid' ? (
            <div className="flex-1 overflow-auto bg-fb-base">
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
            </div>
          ) : (
            <VirtualizedFileTable
              files={files}
              gitStatusMap={gitStatusMap}
              selectedPath={selectedPath}
              onSelect={handleSelect}
              onDoubleClick={handleItemDoubleClick}
              onContextAction={handleContextAction}
            />
          )}
        </div>

        {/* Right sidebar for file details */}
        {selectedFile && (
          <FileDetailsSidebar
            file={selectedFile}
            gitStatus={selectedFile ? gitStatusMap[selectedFile.name] : undefined}
            onClose={handleCloseSidebar}
          />
        )}
      </div>
    </div>
  );
}

export default memo(SimpleFileBrowser);
