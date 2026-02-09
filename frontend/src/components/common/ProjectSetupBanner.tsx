/**
 * ProjectSetupBanner - State-aware banner shown in the main area when a project
 * needs setup (version control, remote publishing, etc.).
 *
 * Renders a status banner + single action row with context-aware CTAs.
 * Replaces any step-based language with state-driven messaging per Phase 12.
 *
 * Project states:
 * 1. Empty Folder, Not Tracked — "Enable Version Control"
 * 2. Has Files, Not Tracked — "Enable Version Control"
 * 3. Tracked, No Remote — "Publish to GitHub"
 * 4. Tracked + Remote — no banner (fully set up)
 * 5. Just Created — success banner (auto-dismisses)
 */
import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  FolderOpen,
  GitBranch,
  CloudUpload,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Github,
  Lock,
  Globe,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import {
  PROJECT_STATES,
  PROJECT_STATE_CONFIGS,
  ICON_SIZES,
  type ProjectState,
} from '../../constants';
import { Button, Input, Label, Select, type SelectOption } from '../ui';
import { cn } from '../../lib/utils';
import type { GitHubAuthStatus, GitHubOrganization, GitHubOrganizationsResult } from '../../context/RepoContext.types';

// ============================================================================
// Types
// ============================================================================

interface ProjectSetupBannerProps {
  /** Derived project state */
  projectState: ProjectState;
  /** Folder name for display */
  folderName: string;
  /** Number of files in folder (for untracked states) */
  fileCount?: number;
  /** Callback to enable version control (git init + initial commit) */
  onEnableVersionControl?: () => Promise<boolean>;
  /** Callback to publish to GitHub */
  onPublishToGitHub?: (name: string, isPrivate: boolean, owner: string) => Promise<void>;
  /** Callback to start GitHub auth flow */
  onConnectGitHub?: () => void;
  /** Callback to load GitHub organizations */
  onLoadOrganizations?: () => Promise<GitHubOrganizationsResult>;
  /** Whether tracking/init is in progress */
  isLoading?: boolean;
  /** Whether publishing is in progress */
  isPublishing?: boolean;
  /** GitHub CLI installed? */
  ghInstalled?: boolean;
  /** GitHub auth status */
  ghAuthStatus?: GitHubAuthStatus | null;
  /** Repo path (for deriving default repo name) */
  repoPath?: string;
}

// ============================================================================
// Icon/color configs per state
// ============================================================================

interface StateVisual {
  Icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  borderColor: string;
}

const STATE_VISUALS: Record<ProjectState, StateVisual> = {
  [PROJECT_STATES.EMPTY_UNTRACKED]: {
    Icon: FolderOpen,
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-400',
    borderColor: 'border-yellow-500/30',
  },
  [PROJECT_STATES.HAS_FILES_UNTRACKED]: {
    Icon: FolderOpen,
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-400',
    borderColor: 'border-yellow-500/30',
  },
  [PROJECT_STATES.TRACKED_NO_REMOTE]: {
    Icon: CloudUpload,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
    borderColor: 'border-blue-500/30',
  },
  [PROJECT_STATES.TRACKED_WITH_REMOTE]: {
    Icon: CheckCircle2,
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
    borderColor: 'border-green-500/30',
  },
  [PROJECT_STATES.JUST_CREATED]: {
    Icon: CheckCircle2,
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
    borderColor: 'border-green-500/30',
  },
  [PROJECT_STATES.NESTED_REPO]: {
    Icon: AlertTriangle,
    iconBg: 'bg-orange-500/10',
    iconColor: 'text-orange-400',
    borderColor: 'border-orange-500/30',
  },
};

// ============================================================================
// Component
// ============================================================================

function ProjectSetupBanner({
  projectState,
  fileCount,
  onEnableVersionControl,
  onPublishToGitHub,
  onConnectGitHub,
  onLoadOrganizations,
  isLoading = false,
  isPublishing = false,
  ghInstalled = false,
  ghAuthStatus,
  repoPath,
}: ProjectSetupBannerProps): JSX.Element | null {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Publish form state
  const defaultRepoName = repoPath?.split('/').pop() || 'my-repo';
  const [repoName, setRepoName] = useState(defaultRepoName);
  const [isPrivate, setIsPrivate] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState('');
  const [username, setUsername] = useState('');
  const [organizations, setOrganizations] = useState<GitHubOrganization[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);

  // Auto-dismiss "just created" banner after 8 seconds
  useEffect(() => {
    if (projectState === PROJECT_STATES.JUST_CREATED) {
      const timer = setTimeout(() => setDismissed(true), 8000);
      return () => clearTimeout(timer);
    }
    setDismissed(false);
  }, [projectState]);

  // Reset repo name when repoPath changes
  useEffect(() => {
    setRepoName(repoPath?.split('/').pop() || 'my-repo');
  }, [repoPath]);

  // Load orgs when authenticated and in publish state
  useEffect(() => {
    const loadOrgs = async () => {
      if (
        projectState === PROJECT_STATES.TRACKED_NO_REMOTE &&
        ghAuthStatus?.loggedIn &&
        onLoadOrganizations
      ) {
        setIsLoadingOrgs(true);
        try {
          const result = await onLoadOrganizations();
          if (result.success) {
            setUsername(result.username);
            setOrganizations(result.organizations);
            setSelectedOwner((prev) => prev || result.username);
          }
        } finally {
          setIsLoadingOrgs(false);
        }
      }
    };
    loadOrgs();
  }, [projectState, ghAuthStatus?.loggedIn, onLoadOrganizations]);

  const handleEnableVC = useCallback(async () => {
    if (onEnableVersionControl) {
      const success = await onEnableVersionControl();
      if (success) {
        setIsExpanded(false);
      }
    }
  }, [onEnableVersionControl]);

  const handlePublish = useCallback(async () => {
    if (onPublishToGitHub && repoName) {
      const owner = selectedOwner === username ? '' : selectedOwner;
      await onPublishToGitHub(repoName, isPrivate, owner);
    }
  }, [onPublishToGitHub, repoName, isPrivate, selectedOwner, username]);

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

  // Don't render for fully set up projects, nested repos, or dismissed banners
  if (projectState === PROJECT_STATES.TRACKED_WITH_REMOTE || projectState === PROJECT_STATES.NESTED_REPO || dismissed) {
    return null;
  }

  const config = PROJECT_STATE_CONFIGS[projectState];
  const visual = STATE_VISUALS[projectState];
  const { Icon, iconBg, iconColor, borderColor } = visual;

  // Build subtitle with context
  let subtitle = config.subtitle;
  if (projectState === PROJECT_STATES.HAS_FILES_UNTRACKED && fileCount != null) {
    subtitle = `${fileCount} file${fileCount !== 1 ? 's' : ''} found but not tracked by Git. Enable version control?`;
  }

  const isUntrackedState =
    projectState === PROJECT_STATES.EMPTY_UNTRACKED ||
    projectState === PROJECT_STATES.HAS_FILES_UNTRACKED;

  const isPublishState = projectState === PROJECT_STATES.TRACKED_NO_REMOTE;

  return (
    <div
      className={cn(
        'mx-4 mt-3 rounded-lg border bg-theme-elevated/50 overflow-hidden transition-all',
        borderColor
      )}
    >
      {/* Banner header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={cn('flex items-center justify-center w-8 h-8 rounded-full shrink-0', iconBg)}>
          <Icon size={ICON_SIZES.sm} className={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-theme-primary text-sm font-medium">{config.title}</p>
          <p className="text-theme-muted text-xs truncate">{subtitle}</p>
        </div>

        {/* Primary CTA (compact, in the header row) */}
        {isUntrackedState && (
          <Button size="sm" onClick={handleEnableVC} loading={isLoading}>
            <GitBranch size={ICON_SIZES.xs} />
            {config.actionLabel}
          </Button>
        )}

        {isPublishState && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setIsExpanded((v) => !v)}
              variant="secondary"
            >
              <CloudUpload size={ICON_SIZES.xs} />
              {config.actionLabel}
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </Button>
          </div>
        )}

        {projectState === PROJECT_STATES.JUST_CREATED && (
          <button
            onClick={() => setDismissed(true)}
            className="text-theme-muted hover:text-theme-secondary text-xs px-2"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Expandable publish form (Phase 12.3 — inline options instead of steps) */}
      {isPublishState && isExpanded && (
        <div className="px-4 pb-4 border-t border-theme-default pt-3 space-y-3">
          {!ghAuthStatus?.loggedIn ? (
            // Not authenticated — show Connect GitHub button
            <div className="text-center py-2">
              <p className="text-theme-muted text-xs mb-3">
                Connect your GitHub account to publish this project.
              </p>
              <Button
                size="sm"
                onClick={onConnectGitHub}
                disabled={!ghInstalled}
              >
                <Github size={ICON_SIZES.xs} />
                Connect GitHub
              </Button>
              {!ghInstalled && (
                <p className="text-yellow-400 text-xs mt-2">GitHub CLI not installed</p>
              )}
            </div>
          ) : (
            // Authenticated — show inline publish form
            <>
              <div>
                <Label htmlFor="setup-repo-name" className="text-left">
                  Repository Name
                </Label>
                <Input
                  id="setup-repo-name"
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="my-repo"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <Label className="text-left">Visibility</Label>
                  <button
                    type="button"
                    onClick={() => setIsPrivate((v) => !v)}
                    className={cn(
                      'flex h-9 w-full items-center gap-2 rounded border border-theme-default bg-theme-surface px-3 text-sm transition-colors',
                      'hover:border-theme-hover'
                    )}
                  >
                    {isPrivate ? (
                      <>
                        <Lock size={14} className="text-theme-muted" /> Private
                      </>
                    ) : (
                      <>
                        <Globe size={14} className="text-theme-muted" /> Public
                      </>
                    )}
                  </button>
                </div>

                <div className="flex-1">
                  <Label className="text-left">Owner</Label>
                  <Select
                    value={selectedOwner}
                    onValueChange={setSelectedOwner}
                    options={ownerOptions}
                    placeholder={isLoadingOrgs ? 'Loading...' : 'Select owner'}
                    disabled={isLoadingOrgs}
                  />
                </div>
              </div>

              <Button
                size="sm"
                onClick={handlePublish}
                loading={isPublishing}
                disabled={!repoName.trim() || !selectedOwner}
                className="w-full"
              >
                <Github size={ICON_SIZES.xs} />
                Publish to GitHub
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(ProjectSetupBanner);
