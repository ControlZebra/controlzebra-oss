/**
 * ExplorerStatusPanel - Unified status panel for explorer sidebar.
 * 
 * Consolidates: SidebarNoRepoPanel, SidebarSyncedPanel, SidebarPushPanel, SidebarMergePanel
 * into a single component with consistent visual structure.
 * 
 * Visual structure:
 * - Icon in colored circle
 * - Title
 * - Subtitle
 * - Optional action button
 */
import { memo, useState, useEffect, useCallback, useMemo, type CSSProperties, type ReactNode } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  GitBranch,
  Merge,
  CloudUpload,
  CloudCheck,
  Cloud,
  Upload,
  Github,
  Lock,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import { ICON_STYLES } from '../../../lib/gitHelpers';
import { 
  Button, 
  Input, 
  Label, 
  Select, 
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  type SelectOption,
} from '../../ui';
import { cn } from '../../../lib/utils';
import type { GitHubAuthStatus, GitHubOrganization, GitHubOrganizationsResult } from '../../../context/RepoContext.types';

// ============================================================================
// Types
// ============================================================================

type StatusType = 'noRepo' | 'synced' | 'push' | 'featureBranch';

interface PanelConfig {
  Icon: LucideIcon;
  iconBg: string;
  iconColor: string;
}

interface PanelLayoutProps {
  type: StatusType;
  title: string;
  subtitle: ReactNode;
  children?: ReactNode;
}

interface ExplorerStatusPanelProps {
  status: StatusType;
  folderName?: string;
  branchName?: string;
  repoPath?: string;
  ahead?: number;
  hasUpstream?: boolean;
  hasRemote?: boolean;
  totalLocalCommits?: number;
  onInitialize?: () => void;
  onSync?: () => void;
  onConnectGitHub?: () => void;
  onPublishToGitHub?: (name: string, isPrivate: boolean, owner: string) => Promise<void>;
  onOpenCombineChanges?: () => void;
  onLoadOrganizations?: () => Promise<GitHubOrganizationsResult>;
  isLoading?: boolean;
  isSyncing?: boolean;
  isPublishing?: boolean;
  ghInstalled?: boolean;
  ghAuthStatus?: GitHubAuthStatus | null;
}

// ============================================================================
// Configuration
// ============================================================================

// Panel type configurations
const PANEL_CONFIGS: Record<StatusType, PanelConfig> = {
  noRepo: {
    Icon: AlertTriangle,
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-500',
  },
  synced: {
    Icon: CheckCircle2,
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
  },
  push: {
    Icon: CloudUpload,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
  },
  featureBranch: {
    Icon: CloudCheck,
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
  },
};

// ============================================================================
// Components
// ============================================================================

/**
 * Base panel layout - shared visual structure for all status types
 */
function PanelLayout({ type, title, subtitle, children }: PanelLayoutProps): JSX.Element {
  const config = PANEL_CONFIGS[type];
  const { Icon, iconBg, iconColor } = config;

  return (
    <div className="p-4 text-center">
      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${iconBg} mb-3`}>
        <Icon style={ICON_STYLES.lg as CSSProperties} className={iconColor} />
      </div>
      <p className="text-theme-primary text-sm font-medium mb-1">{title}</p>
      <p className="text-theme-muted text-xs mb-4">{subtitle}</p>
      {children}
    </div>
  );
}

/**
 * ExplorerStatusPanel - Renders the appropriate status panel based on repo state.
 */
function ExplorerStatusPanel({
  status,
  folderName,
  branchName,
  repoPath,
  ahead = 0,
  hasUpstream = true,
  hasRemote = true,
  totalLocalCommits = 0,
  onInitialize,
  onSync,
  onConnectGitHub,
  onPublishToGitHub,
  onOpenCombineChanges,
  onLoadOrganizations,
  isLoading = false,
  isSyncing = false,
  isPublishing = false,
  ghInstalled = false,
  ghAuthStatus = null,
}: ExplorerStatusPanelProps): JSX.Element {
  // State for publish form
  const defaultRepoName = repoPath?.split('/').pop() || 'my-repo';
  const [isPrivate, setIsPrivate] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [organizations, setOrganizations] = useState<GitHubOrganization[]>([]);
  const [repoName, setRepoName] = useState(defaultRepoName);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);

  const handleOpenCombineChanges = useCallback((): void => {
    onOpenCombineChanges?.();
  }, [onOpenCombineChanges]);

  // Load organizations when authenticated and in publish mode
  useEffect(() => {
    const loadOrgs = async () => {
      if (ghAuthStatus?.loggedIn && onLoadOrganizations && !hasRemote) {
        setIsLoadingOrgs(true);
        try {
          const result = await onLoadOrganizations();
          if (result.success) {
            setUsername(result.username);
            setOrganizations(result.organizations);
            // Default to personal account (only if not already set)
            setSelectedOwner((prev) => prev || result.username);
          }
        } finally {
          setIsLoadingOrgs(false);
        }
      }
    };
    loadOrgs();
  }, [ghAuthStatus?.loggedIn, onLoadOrganizations, hasRemote]);

  // Reset repo name when repoPath changes
  useEffect(() => {
    setRepoName(repoPath?.split('/').pop() || 'my-repo');
  }, [repoPath]);

  const handlePublish = useCallback(async () => {
    if (onPublishToGitHub && repoName) {
      // Pass empty string for owner if it's the personal account (username)
      const owner = selectedOwner === username ? '' : selectedOwner;
      await onPublishToGitHub(repoName, isPrivate, owner);
    }
  }, [onPublishToGitHub, repoName, isPrivate, selectedOwner, username]);

  // Memoized options for the owner Select component
  const ownerOptions = useMemo((): SelectOption[] => {
    const options: SelectOption[] = [];
    if (username) {
      options.push({ value: username, label: `${username} (personal)` });
    }
    organizations.forEach((org) => {
      options.push({ value: org.login, label: org.name || org.login });
    });
    return options;
  }, [username, organizations]);

  switch (status) {
    case 'noRepo':
      return (
        <PanelLayout
          type="noRepo"
          title="No Version Control"
          subtitle={<><span className="font-medium">{folderName}</span> is not tracked</>}
        >
          <Button 
            onClick={onInitialize} 
            loading={isLoading}
            size="sm"
            className="w-full"
          >
            <GitBranch style={ICON_STYLES.sm as CSSProperties} />
            Start Tracking
          </Button>
        </PanelLayout>
      );

    case 'push': {
      const pendingCount = hasUpstream ? ahead : totalLocalCommits;
      
      // Case 1: Remote exists - show Push Changes / Sync button
      if (hasRemote) {
        return (
          <PanelLayout
            type="push"
            title={`${pendingCount} snapshot${pendingCount !== 1 ? 's' : ''} pending`}
            subtitle={hasUpstream ? 'Ready to sync' : 'Branch not published'}
          >
            <Button 
              onClick={onSync} 
              loading={isSyncing} 
              size="sm"
              className="w-full"
            >
              {hasUpstream ? (
                <Cloud style={ICON_STYLES.sm as CSSProperties} />
              ) : (
                <Upload style={ICON_STYLES.sm as CSSProperties} />
              )}
              {hasUpstream ? 'Push Changes' : 'Push Changes'}
            </Button>
          </PanelLayout>
        );
      }
      
      // Case 2: No remote, not authenticated - show Connect GitHub button
      if (!ghAuthStatus?.loggedIn) {
        return (
          <PanelLayout
            type="push"
            title={`${pendingCount} snapshot${pendingCount !== 1 ? 's' : ''} pending`}
            subtitle="Connect GitHub to share your work"
          >
            <Button 
              onClick={onConnectGitHub} 
              disabled={!ghInstalled}
              size="sm"
              className="w-full"
            >
              <Github style={ICON_STYLES.sm as CSSProperties} />
              Connect GitHub
            </Button>
            {!ghInstalled && (
              <p className="text-yellow-400 text-xs mt-2">GitHub CLI not installed</p>
            )}
          </PanelLayout>
        );
      }
      
      // Case 3: No remote, authenticated - show Publish form
      return (
        <div className="p-4">
          <div className="flex items-center justify-center mb-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10">
              <Github style={ICON_STYLES.lg as CSSProperties} className="text-blue-400" />
            </div>
          </div>
          <p className="text-theme-primary text-sm font-medium mb-1 text-center">Publish to GitHub</p>
          <p className="text-theme-muted text-xs mb-4 text-center">
            {pendingCount} snapshot{pendingCount !== 1 ? 's' : ''} pending
          </p>
          
          {/* Repository Name Field */}
          <div className="mb-3">
            <Label htmlFor="repo-name" className="text-left">Repository Name</Label>
            <Input
              id="repo-name"
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="my-repo"
            />
          </div>
          
          {/* Visibility Dropdown */}
          <div className="mb-3">
            <Label className="text-left">Visibility</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded border border-theme-default bg-theme-surface px-3 py-2 text-sm transition-colors",
                    "hover:border-theme-hover",
                    "focus:outline-none focus:border-blue-500"
                  )}
                >
                  <span className="flex items-center gap-2 text-theme-primary">
                    {isPrivate ? (
                      <><Lock style={{ width: 14, height: 14 }} /> Private</>
                    ) : (
                      <><Globe style={{ width: 14, height: 14 }} /> Public</>
                    )}
                  </span>
                  <svg
                    className="h-4 w-4 text-theme-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                <DropdownMenuRadioGroup
                  value={isPrivate ? 'private' : 'public'}
                  onValueChange={(value) => setIsPrivate(value === 'private')}
                >
                  <DropdownMenuRadioItem value="private" className="flex-col items-start py-2">
                    <span className="font-semibold text-theme-primary">Private</span>
                    <span className="text-xs text-theme-muted">Only you and collaborators can see this repository</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="public" className="flex-col items-start py-2">
                    <span className="font-semibold text-theme-primary">Public</span>
                    <span className="text-xs text-theme-muted">Anyone on the internet can see this repository</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* Owner Dropdown */}
          <div className="mb-4">
            <Label className="text-left">Owner</Label>
            <Select
              value={selectedOwner}
              onValueChange={setSelectedOwner}
              options={ownerOptions}
              placeholder={isLoadingOrgs ? 'Loading...' : 'Select owner'}
              disabled={isLoadingOrgs}
            />
          </div>
          
          {/* Publish Button */}
          <Button 
            onClick={handlePublish} 
            loading={isPublishing}
            disabled={!repoName.trim() || !selectedOwner}
            size="sm"
            className="w-full"
          >
            <Github style={ICON_STYLES.sm as CSSProperties} />
            Publish to GitHub
          </Button>
        </div>
      );
    }

    case 'featureBranch':
      return (
        <PanelLayout
          type="featureBranch"
          title="Branch synced"
          subtitle={<><span>{branchName}</span> is up to date</>}
        >
          <Button 
            onClick={handleOpenCombineChanges}
            size="sm"
            className="w-full"
          >
            <Merge style={ICON_STYLES.sm as CSSProperties} />
            I am ready to merge
          </Button>
        </PanelLayout>
      );

    case 'synced':
    default: {
      const displayName = repoPath?.split('/').pop() || 'Repository';
      return (
        <PanelLayout
          type="synced"
          title="All caught up"
          subtitle={<>No changes in <span className="font-medium">{displayName}</span></>}
        />
      );
    }
  }
}

export default memo(ExplorerStatusPanel);
