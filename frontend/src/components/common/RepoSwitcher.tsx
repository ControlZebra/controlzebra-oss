/**
 * RepoSwitcher - Dropdown component for switching between repositories.
 * Shows a searchable list of GitHub repositories that can be cloned and opened.
 */
import { memo, useState, useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import {
  FolderGit2,
  ChevronDown,
  Search,
  Check,
  Loader2,
  Github,
  RefreshCw,
  FolderOpen,
  MoveDiagonal2,
} from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { useRepo } from '../../context';
import type { GitHubRepo } from '../../context/RepoContext.types';
import { Input, Button } from '../ui';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { cn } from '../../lib/utils';
import { OpenFolderDialog } from '../../../bindings/controlzebra/services/filedialogservice';

// ============================================================================
// Types
// ============================================================================

interface RepoItemProps {
  repo: GitHubRepo;
  isSelected: boolean;
  onSelect: (repo: GitHubRepo) => void;
  isCloning: boolean;
}

// ============================================================================
// Styles
// ============================================================================

const iconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconStyleMd: CSSProperties = { width: ICON_SIZES.md, height: ICON_SIZES.md };

// ============================================================================
// Sub-components
// ============================================================================

/**
 * RepoItem - Single repository in the list
 */
const RepoItem = memo(function RepoItem({
  repo,
  isSelected,
  onSelect,
  isCloning,
}: RepoItemProps): JSX.Element {
  return (
    <button
      onClick={() => onSelect(repo)}
      disabled={isCloning}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
        isSelected
          ? "bg-blue-500/25 dark:bg-blue-500/30 text-blue-600 dark:text-blue-300"
          : "hover:bg-neutral-200 dark:hover:bg-neutral-700/60 text-theme-primary",
        isCloning && "opacity-50 cursor-wait"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{repo.name}</span>
          {isSelected && <Check style={iconStyle} className="text-blue-400 shrink-0" />}
        </div>
        <span className="text-xs text-theme-muted truncate block">{repo.fullName}</span>
      </div>
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-theme-muted/20 text-theme-muted shrink-0">
        {repo.private ? 'Private' : 'Public'}
      </span>
    </button>
  );
});

/**
 * EmptyState - Shown when no repos match search or no repos available
 */
const EmptyState = memo(function EmptyState({
  searchQuery,
  isLoggedIn,
}: {
  searchQuery: string;
  isLoggedIn: boolean;
}): JSX.Element {
  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <Github style={iconStyleMd} className="text-theme-muted mb-2" />
        <p className="text-sm text-theme-muted">Connect your GitHub account</p>
        <p className="text-xs text-theme-muted mt-1">to see your repositories</p>
      </div>
    );
  }

  if (searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <Search style={iconStyleMd} className="text-theme-muted mb-2" />
        <p className="text-sm text-theme-muted">No repositories found</p>
        <p className="text-xs text-theme-muted mt-1">Try a different search term</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <FolderGit2 style={iconStyleMd} className="text-theme-muted mb-2" />
      <p className="text-sm text-theme-muted">No repositories yet</p>
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

function RepoSwitcher(): JSX.Element {
  const {
    repoPath,
    repoInfo,
    ghAuthStatus,
    ghRepos,
    isLoadingGhRepos,
    loadGitHubRepos,
    cloneGitHubRepo,
    openFolder,
  } = useRepo();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [cloningRepoName, setCloningRepoName] = useState<string | null>(null);
  const [popoverSize, setPopoverSize] = useState({ width: 320, height: 400 });
  const isResizing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ width: 320, height: 400 });

  // Handle resize drag
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    startPos.current = { x: e.clientX, y: e.clientY };
    startSize.current = { ...popoverSize };
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const deltaX = e.clientX - startPos.current.x;
      const deltaY = e.clientY - startPos.current.y;
      setPopoverSize({
        width: Math.max(280, Math.min(600, startSize.current.width + deltaX)),
        height: Math.max(300, Math.min(600, startSize.current.height + deltaY)),
      });
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [popoverSize]);

  // Derive repo display values
  const repoName = repoPath ? repoPath.split('/').pop() : 'No repository';
  const isGitRepo = repoInfo?.isRepo ?? false;
  const isLoggedIn = ghAuthStatus?.loggedIn ?? false;

  // Load repos when popover opens and user is logged in
  useEffect(() => {
    if (isOpen && isLoggedIn && ghRepos.length === 0) {
      loadGitHubRepos(50);
    }
  }, [isOpen, isLoggedIn, ghRepos.length, loadGitHubRepos]);

  // Filter repos by search query
  const filteredRepos = useMemo(() => {
    if (!searchQuery.trim()) return ghRepos;
    const query = searchQuery.toLowerCase();
    return ghRepos.filter(
      (repo) =>
        repo.name.toLowerCase().includes(query) ||
        repo.fullName.toLowerCase().includes(query) ||
        repo.description?.toLowerCase().includes(query)
    );
  }, [ghRepos, searchQuery]);

  // Check if current repo matches a GitHub repo
  const currentGitHubRepo = useMemo(() => {
    if (!repoPath) return null;
    const currentName = repoPath.split('/').pop()?.toLowerCase();
    return ghRepos.find((r) => r.name.toLowerCase() === currentName) || null;
  }, [repoPath, ghRepos]);

  // Handle repo selection - clone and open
  const handleRepoSelect = useCallback(
    async (repo: GitHubRepo) => {
      // If this repo is already open, just close the popover
      if (currentGitHubRepo?.fullName === repo.fullName) {
        setIsOpen(false);
        return;
      }

      // Ask user where to clone
      try {
        const result = await OpenFolderDialog();
        if (!result.selected || !result.path) {
          return; // User cancelled
        }

        setIsCloning(true);
        setCloningRepoName(repo.name);

        // Create clone path with repository name as subfolder
        const clonePath = `${result.path}/${repo.name}`;
        const cloneResult = await cloneGitHubRepo(repo.fullName, clonePath);
        
        if (cloneResult.success) {
          setIsOpen(false);
        }
      } catch (error) {
        console.error('Failed to clone repository:', error);
      } finally {
        setIsCloning(false);
        setCloningRepoName(null);
      }
    },
    [currentGitHubRepo, cloneGitHubRepo]
  );

  // Handle opening a local folder
  const handleOpenFolder = useCallback(async () => {
    try {
      const result = await OpenFolderDialog();
      if (result.selected && result.path) {
        await openFolder(result.path);
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  }, [openFolder]);

  // Refresh repos
  const handleRefresh = useCallback(() => {
    loadGitHubRepos(50);
  }, [loadGitHubRepos]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-3 px-3 py-2.5 mx-2 mt-2 bg-theme-elevated hover:bg-theme-hover border border-theme-default rounded-md transition-colors w-[calc(100%-16px)]"
          title={repoPath || 'Open a folder'}
        >
          <FolderGit2
            style={{ width: ICON_SIZES.md, height: ICON_SIZES.md }}
            className="text-theme-muted shrink-0"
          />
          <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0 overflow-hidden">
            <span className="text-theme-muted text-[10px] font-medium uppercase tracking-wide">
              Current repository
            </span>
            <div className="flex items-center gap-1.5 w-full min-w-0">
              <span className="text-theme-primary font-semibold text-sm truncate min-w-0 flex-1 text-left">
                {repoName}
              </span>
              {repoPath && !isGitRepo && (
                <span className="text-yellow-500/80 text-[10px] whitespace-nowrap shrink-0">
                  • No git
                </span>
              )}
            </div>
          </div>
          <ChevronDown
            style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }}
            className={cn("text-theme-muted shrink-0 transition-transform", isOpen && "rotate-180")}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent 
        align="start" 
        sideOffset={4} 
        className="p-0 flex flex-col"
        style={{ width: popoverSize.width, height: popoverSize.height }}
      >
        {/* Search header */}
        <div className="p-3 border-b border-theme-default shrink-0">
          <div className="relative">
            <Search
              style={iconStyle}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none"
            />
            <Input
              type="text"
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-theme-surface border-theme-default"
              autoFocus
            />
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-theme-default shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenFolder}
            className="flex-1 justify-start gap-2 text-xs"
          >
            <FolderOpen style={iconStyle} />
            Open local folder
          </Button>
          {isLoggedIn && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoadingGhRepos}
              className="px-2"
              title="Refresh repositories"
            >
              <RefreshCw
                style={iconStyle}
                className={cn(isLoadingGhRepos && "animate-spin")}
              />
            </Button>
          )}
        </div>

        {/* Repository list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoadingGhRepos && ghRepos.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 style={iconStyleMd} className="animate-spin text-theme-muted" />
            </div>
          ) : filteredRepos.length > 0 ? (
            <div className="py-1">
              {isLoggedIn && (
                <div className="px-3 py-1.5 text-xs text-theme-muted font-medium  tracking-wide flex items-center gap-2">
                  <Github style={iconStyle} />
                  Remote Repositories
                </div>
              )}
              {filteredRepos.map((repo) => (
                <RepoItem
                  key={repo.fullName}
                  repo={repo}
                  isSelected={currentGitHubRepo?.fullName === repo.fullName}
                  onSelect={handleRepoSelect}
                  isCloning={isCloning && cloningRepoName === repo.name}
                />
              ))}
            </div>
          ) : (
            <EmptyState searchQuery={searchQuery} isLoggedIn={isLoggedIn} />
          )}
        </div>

        {/* Footer with GitHub status */}
        {isLoggedIn && (
          <div className="px-3 py-2 border-t border-theme-default bg-theme-elevated/50 shrink-0">
            <div className="flex items-center gap-2 text-xs text-theme-muted">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>Connected as {ghAuthStatus?.username}</span>
            </div>
          </div>
        )}

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-center justify-center text-theme-muted hover:text-theme-primary transition-colors"
          title="Drag to resize"
        >
          <MoveDiagonal2 style={{ width: 12, height: 12 }} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default memo(RepoSwitcher);
