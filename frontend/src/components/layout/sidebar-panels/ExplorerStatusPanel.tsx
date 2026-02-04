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
import { memo, useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Save, 
  GitBranch,
  GitPullRequest,
  Cloud,
  Upload,
  Github,
  Pencil,
  Lock,
  Globe,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { ICON_STYLES } from '../../../lib/gitHelpers';
import { Button } from '../../ui';
import { toast } from 'sonner';
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
    Icon: Save,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
  },
  featureBranch: {
    Icon: CheckCircle2,
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
  onLoadOrganizations,
  isLoading = false,
  isSyncing = false,
  isPublishing = false,
  ghInstalled = false,
  ghAuthStatus = null,
}: ExplorerStatusPanelProps): JSX.Element {
  // State for publish form
  const defaultRepoName = repoPath?.split('/').pop() || 'my-repo';
  const [repoName, setRepoName] = useState(defaultRepoName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isPrivate, setIsPrivate] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState<string>('');
  const [organizations, setOrganizations] = useState<GitHubOrganization[]>([]);
  const [username, setUsername] = useState<string>('');
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  const [isOwnerDropdownOpen, setIsOwnerDropdownOpen] = useState(false);

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

  const handleCreateMergeRequest = (): void => {
    toast.info('Merge request creation coming soon!');
  };

  // Get display name for selected owner
  const getOwnerDisplayName = () => {
    if (selectedOwner === username) {
      return `${username} (personal)`;
    }
    return selectedOwner || 'Select owner';
  };

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
              variant="secondary"
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
            <label className="block text-theme-muted text-xs mb-1.5 text-left">Repository Name</label>
            <div className="relative">
              {isEditingName ? (
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditingName(false);
                    if (e.key === 'Escape') {
                      setRepoName(defaultRepoName);
                      setIsEditingName(false);
                    }
                  }}
                  autoFocus
                  className="w-full px-3 py-2 text-sm bg-theme-secondary border border-theme-border rounded-md text-theme-primary focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm bg-theme-secondary border border-theme-border rounded-md text-theme-primary hover:border-theme-border-hover transition-colors"
                >
                  <span className="font-mono truncate">{repoName}</span>
                  <Pencil style={{ width: 14, height: 14 }} className="text-theme-muted flex-shrink-0 ml-2" />
                </button>
              )}
            </div>
          </div>
          
          {/* Visibility Toggle */}
          <div className="mb-3">
            <label className="block text-theme-muted text-xs mb-1.5 text-left">Visibility</label>
            <div className="flex gap-1 p-1 bg-theme-secondary rounded-md border border-theme-border">
              <button
                type="button"
                onClick={() => setIsPrivate(true)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
                  isPrivate 
                    ? 'bg-theme-primary text-theme-primary-inverted' 
                    : 'text-theme-muted hover:text-theme-primary'
                }`}
              >
                <Lock style={{ width: 12, height: 12 }} />
                Private
              </button>
              <button
                type="button"
                onClick={() => setIsPrivate(false)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
                  !isPrivate 
                    ? 'bg-theme-primary text-theme-primary-inverted' 
                    : 'text-theme-muted hover:text-theme-primary'
                }`}
              >
                <Globe style={{ width: 12, height: 12 }} />
                Public
              </button>
            </div>
          </div>
          
          {/* Owner Dropdown */}
          <div className="mb-4">
            <label className="block text-theme-muted text-xs mb-1.5 text-left">Owner</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsOwnerDropdownOpen(!isOwnerDropdownOpen)}
                disabled={isLoadingOrgs}
                className="w-full flex items-center justify-between px-3 py-2 text-sm bg-theme-secondary border border-theme-border rounded-md text-theme-primary hover:border-theme-border-hover transition-colors disabled:opacity-50"
              >
                <span className="truncate">{isLoadingOrgs ? 'Loading...' : getOwnerDisplayName()}</span>
                <ChevronDown style={{ width: 14, height: 14 }} className={`text-theme-muted flex-shrink-0 ml-2 transition-transform ${isOwnerDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isOwnerDropdownOpen && !isLoadingOrgs && (
                <div className="absolute z-10 mt-1 w-full bg-theme-secondary border border-theme-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {/* Personal Account */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOwner(username);
                      setIsOwnerDropdownOpen(false);
                    }}
                    className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-theme-hover transition-colors ${
                      selectedOwner === username ? 'bg-theme-hover text-theme-primary' : 'text-theme-secondary'
                    }`}
                  >
                    <span className="truncate">{username} (personal)</span>
                  </button>
                  
                  {/* Organizations */}
                  {organizations.length > 0 && (
                    <>
                      <div className="h-px bg-theme-border my-1" />
                      {organizations.map((org) => (
                        <button
                          key={org.login}
                          type="button"
                          onClick={() => {
                            setSelectedOwner(org.login);
                            setIsOwnerDropdownOpen(false);
                          }}
                          className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-theme-hover transition-colors ${
                            selectedOwner === org.login ? 'bg-theme-hover text-theme-primary' : 'text-theme-secondary'
                          }`}
                        >
                          <span className="truncate">{org.name || org.login}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
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
          subtitle={<><span className="font-mono">{branchName}</span> is up to date</>}
        >
          <Button 
            onClick={handleCreateMergeRequest}
            size="sm"
            variant="outline"
            className="w-full"
          >
            <GitPullRequest style={ICON_STYLES.sm as CSSProperties} />
            Merge Request
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
