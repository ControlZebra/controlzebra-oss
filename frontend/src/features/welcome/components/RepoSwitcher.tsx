/**
 * RepoSwitcher - Dropdown component for project actions and switching.
 */
import { memo, useState, useCallback, type CSSProperties } from 'react';
import {
  FolderGit2,
  ChevronDown,
  FolderOpen,
  Globe,
  FolderSync,
  Settings,
} from 'lucide-react';
import { ICON_SIZES, VIEWS } from '../../../shared/constants';
import { useLayout, useRepo } from '../../../context';
import { Button } from '../../../shared/ui';
import { Popover, PopoverTrigger, PopoverContent } from '../../../shared/ui/popover';
import { cn } from '../../../shared/utils/misc';
import { getFolderNameFromPath } from '../../../shared/utils/path';
import { RevealInFinder } from '../../../../bindings/controlzebra/services/filesystemservice';
import { GetRemoteURL } from '../../../../bindings/controlzebra/services/gitservice';
import { openExternalUrl } from '../../../shared/runtime/browser';
import { toast } from 'sonner';

// ============================================================================
// Styles
// ============================================================================

const iconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const IS_MAC_OS = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const FILE_MANAGER_NAME = IS_MAC_OS ? 'Finder' : 'Explorer';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert git remote URL to a browser URL.
 */
function gitUrlToWebUrl(gitUrl: string): string {
  if (!gitUrl) return '';

  let webUrl = gitUrl.trim();

  if (webUrl.startsWith('git@')) {
    webUrl = webUrl
      .replace(/^git@/, 'https://')
      .replace(/:([^/])/, '/$1');
  }

  if (webUrl.endsWith('.git')) {
    webUrl = webUrl.slice(0, -4);
  }

  return webUrl;
}

// ============================================================================
// Main Component
// ============================================================================

function RepoSwitcher(): JSX.Element {
  const {
    repoPath,
    closeRepo,
  } = useRepo();
  const { setActiveView } = useLayout();

  const [isOpen, setIsOpen] = useState(false);

  // Derive repo display values
  const repoName = repoPath ? getFolderNameFromPath(repoPath) : 'No repository';

  const handleOpenInFileManager = useCallback(async () => {
    if (!repoPath) {
      toast.error('No folder is currently open');
      return;
    }

    try {
      const result = await RevealInFinder(repoPath);
      if (!result.success) {
        toast.error(result.error || `Failed to open in ${FILE_MANAGER_NAME}`);
      } else {
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to open in file manager:', error);
      toast.error(`Failed to open in ${FILE_MANAGER_NAME}`);
    }
  }, [repoPath]);

  const handleOpenInBrowser = useCallback(async () => {
    if (!repoPath) {
      toast.error('No folder is currently open');
      return;
    }

    try {
      const remoteUrl = await GetRemoteURL(repoPath);
      if (!remoteUrl) {
        toast.error('No remote repository configured');
        return;
      }

      const webUrl = gitUrlToWebUrl(remoteUrl);
      if (!webUrl) {
        toast.error('Could not parse remote URL');
        return;
      }

      const didOpen = await openExternalUrl(webUrl);
      if (!didOpen) {
        toast.error('Could not open remote URL safely');
        return;
      }

      setIsOpen(false);
    } catch (error) {
      console.error('Failed to open repository in browser:', error);
      toast.error('Failed to open repository in browser');
    }
  }, [repoPath]);

  const handleSwitchProjects = useCallback(async () => {
    try {
      await closeRepo();
      setActiveView(VIEWS.EXPLORER);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to switch projects:', error);
    }
  }, [closeRepo, setActiveView]);

  const handleProjectSettings = useCallback(() => {
    if (!repoPath) {
      toast.error('No folder is currently open');
      return;
    }
    setActiveView(VIEWS.REPO_SETTINGS);
    setIsOpen(false);
  }, [repoPath, setActiveView]);

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
        className="p-2"
        style={{ width: 320 }}
      >
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenInFileManager}
            className="w-full justify-start gap-2 text-xs"
          >
            <FolderOpen style={iconStyle} />
            Open in {FILE_MANAGER_NAME}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenInBrowser}
            className="w-full justify-start gap-2 text-xs"
          >
            <Globe style={iconStyle} />
            Open in Browser
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSwitchProjects}
            className="w-full justify-start gap-2 text-xs"
          >
            <FolderSync style={iconStyle} />
            Switch Projects
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleProjectSettings}
            className="w-full justify-start gap-2 text-xs"
          >
            <Settings style={iconStyle} />
            Project Settings
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default memo(RepoSwitcher);
