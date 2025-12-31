/**
 * DashboardPage - Dashboard landing page for Rewind Logic.
 * Shows service status, quick actions, repository overview, and setup guidance.
 */
import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  GitBranch,
  GitCommit,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowUpDown,
  Clock,
  HardDrive,
  Terminal,
  Settings,
  ChevronRight,
  Loader2,
  FolderPlus,
} from 'lucide-react';
import { useRepo, useLayout } from '../../../context';
import { VIEWS, ICON_SIZES } from '../../../constants';
import { Button } from '../../ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Progress } from '../../ui/progress';

// Service imports
import { GetGitVersion } from '../../../../bindings/changeme/services/gitservice';
import { IsLFSInstalled, GetLFSVersion, IsLFSEnabled } from '../../../../bindings/changeme/services/lfsservice';
import { OpenFolderDialog } from '../../../../bindings/changeme/services/filedialogservice';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconStyleLg = { width: ICON_SIZES.lg, height: ICON_SIZES.lg };

// ============================================================================
// Status Indicator Component
// ============================================================================
const StatusIndicator = memo(function StatusIndicator({ status, label, version, description }) {
  const statusConfig = {
    ready: { icon: CheckCircle2, variant: 'success', text: 'Ready' },
    warning: { icon: AlertCircle, variant: 'warning', text: 'Warning' },
    error: { icon: XCircle, variant: 'error', text: 'Not Available' },
    loading: { icon: Loader2, variant: 'info', text: 'Checking...' },
    disabled: { icon: XCircle, variant: 'outline', text: 'Disabled' },
  };

  const config = statusConfig[status] || statusConfig.error;
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-neutral-700/30 last:border-0">
      <div className="flex items-center gap-3">
        <Icon
          style={iconStyle}
          className={`${status === 'loading' ? 'animate-spin' : ''} ${
            status === 'ready' ? 'text-green-400' :
            status === 'warning' ? 'text-yellow-400' :
            status === 'error' ? 'text-red-400' :
            'text-neutral-400'
          }`}
        />
        <div>
          <span className="text-sm text-neutral-200">{label}</span>
          {description && (
            <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {version && <span className="text-xs text-neutral-500 font-mono">{version}</span>}
        <Badge variant={config.variant}>{config.text}</Badge>
      </div>
    </div>
  );
});

// ============================================================================
// Quick Action Card Component
// ============================================================================
const QuickAction = memo(function QuickAction({ icon: Icon, title, description, onClick, disabled, variant = 'default' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full p-4 rounded-lg border text-left transition-all group
        ${disabled
          ? 'border-neutral-700/30 bg-neutral-800/30 cursor-not-allowed opacity-50'
          : variant === 'primary'
            ? 'border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/50'
            : 'border-neutral-700/50 bg-neutral-800/50 hover:bg-neutral-700/50 hover:border-neutral-600'
        }
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`
          p-2 rounded-lg
          ${variant === 'primary' ? 'bg-blue-500/20' : 'bg-neutral-700/50'}
          ${!disabled && 'group-hover:scale-105 transition-transform'}
        `}>
          <Icon
            style={iconStyleLg}
            className={variant === 'primary' ? 'text-blue-400' : 'text-neutral-300'}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-neutral-100 mb-1">{title}</h4>
          <p className="text-xs text-neutral-400 line-clamp-2">{description}</p>
        </div>
        <ChevronRight
          style={iconStyle}
          className={`text-neutral-500 shrink-0 mt-1 transition-transform ${!disabled && 'group-hover:translate-x-1'}`}
        />
      </div>
    </button>
  );
});

// ============================================================================
// Repository Stats Card
// ============================================================================
const RepoStats = memo(function RepoStats({ repoPath, repoStatus, commits }) {
  const stats = useMemo(() => {
    if (!repoStatus) return null;
    return {
      branch: repoStatus.branch || 'main',
      changedFiles: repoStatus.changedFiles?.length || 0,
      ahead: repoStatus.ahead || 0,
      behind: repoStatus.behind || 0,
      totalCommits: commits?.length || 0,
    };
  }, [repoStatus, commits]);

  if (!repoPath || !stats) return null;

  const folderName = repoPath.split('/').pop();

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen style={iconStyleLg} className="text-yellow-500" />
            <div>
              <CardTitle>{folderName}</CardTitle>
              <CardDescription className="font-mono text-xs truncate max-w-[200px]">
                {repoPath}
              </CardDescription>
            </div>
          </div>
          <Badge variant="success">
            <GitBranch style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
            {stats.branch}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="flex items-center gap-2 p-2 rounded bg-neutral-700/30">
            <GitCommit style={iconStyle} className="text-neutral-400" />
            <div>
              <p className="text-lg font-medium text-neutral-100">{stats.changedFiles}</p>
              <p className="text-xs text-neutral-500">Changes</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded bg-neutral-700/30">
            <ArrowUpDown style={iconStyle} className="text-neutral-400" />
            <div>
              <p className="text-lg font-medium text-neutral-100">
                <span className="text-green-400">↑{stats.ahead}</span>
                {' '}
                <span className="text-yellow-400">↓{stats.behind}</span>
              </p>
              <p className="text-xs text-neutral-500">Sync Status</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Setup Progress Card
// ============================================================================
const SetupProgress = memo(function SetupProgress({ steps }) {
  const completedSteps = steps.filter(s => s.completed).length;
  const progress = (completedSteps / steps.length) * 100;

  if (progress === 100) return null;

  return (
    <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-neutral-800/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-blue-400">Getting Started</CardTitle>
          <Badge variant="info">{completedSteps}/{steps.length}</Badge>
        </div>
        <CardDescription>Complete these steps to get the most out of Rewind Logic</CardDescription>
      </CardHeader>
      <CardContent>
        <Progress value={progress} className="mb-4" />
        <div className="space-y-2">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-3 p-2 rounded transition-colors ${
                step.completed ? 'opacity-50' : 'hover:bg-neutral-700/30 cursor-pointer'
              }`}
              onClick={!step.completed ? step.action : undefined}
            >
              {step.completed ? (
                <CheckCircle2 style={iconStyle} className="text-green-400 shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-neutral-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${step.completed ? 'line-through text-neutral-500' : 'text-neutral-200'}`}>
                  {step.title}
                </p>
                {!step.completed && step.description && (
                  <p className="text-xs text-neutral-500">{step.description}</p>
                )}
              </div>
              {!step.completed && (
                <ChevronRight style={iconStyle} className="text-neutral-500 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Recent Activity Card
// ============================================================================
const RecentActivity = memo(function RecentActivity({ commits }) {
  if (!commits || commits.length === 0) return null;

  const recentCommits = commits.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock style={iconStyle} className="text-neutral-400" />
            Recent Activity
          </CardTitle>
          <Badge variant="outline">{commits.length} commits</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {recentCommits.map((commit, idx) => (
            <div
              key={commit.hash || idx}
              className="flex items-start gap-3 py-2 border-b border-neutral-700/30 last:border-0"
            >
              <GitCommit style={iconStyle} className="text-neutral-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-200 truncate">{commit.message}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-neutral-500 font-mono">{commit.shortHash}</span>
                  <span className="text-xs text-neutral-600">•</span>
                  <span className="text-xs text-neutral-500">{commit.relativeDate}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

// ============================================================================
// No Repository State
// ============================================================================
const NoRepoState = memo(function NoRepoState({ onOpenFolder, isLoading }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-neutral-800/50 mb-6">
          <Folder style={{ width: 40, height: 40 }} className="text-neutral-600" />
        </div>
        <h2 className="text-xl font-medium text-neutral-200 mb-2">Welcome to Rewind Logic</h2>
        <p className="text-neutral-400 mb-6">
          Your simplified Git client for industrial automation. Open a folder to get started with version control.
        </p>
        <Button size="lg" onClick={onOpenFolder} loading={isLoading}>
          <FolderOpen style={iconStyle} />
          Open Folder
        </Button>
        <p className="text-xs text-neutral-600 mt-4">
          Tip: Use <kbd className="px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300">⌘O</kbd> to quickly open a folder
        </p>
      </div>
    </div>
  );
});

// ============================================================================
// Main DashboardPage Component
// ============================================================================
function DashboardPage() {
  const { repoPath, repoStatus, commits, openRepo, refreshAll } = useRepo();
  const { setActiveView } = useLayout();

  // Service status state
  const [serviceStatus, setServiceStatus] = useState({
    git: { status: 'loading', version: null },
    lfs: { status: 'loading', version: null, enabled: false },
    github: { status: 'disabled', connected: false },
    gitlab: { status: 'disabled', connected: false },
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);

  // Check service status on mount
  useEffect(() => {
    const checkServices = async () => {
      // Check Git
      try {
        const gitVersion = await GetGitVersion();
        if (gitVersion) {
          setServiceStatus(prev => ({
            ...prev,
            git: {
              status: 'ready',
              version: `v${gitVersion.major}.${gitVersion.minor}.${gitVersion.patch}`,
            },
          }));
        } else {
          setServiceStatus(prev => ({
            ...prev,
            git: { status: 'error', version: null },
          }));
        }
      } catch (err) {
        setServiceStatus(prev => ({
          ...prev,
          git: { status: 'error', version: null, error: err.message },
        }));
      }

      // Check LFS
      try {
        const lfsInstalled = await IsLFSInstalled();
        if (lfsInstalled) {
          const lfsVersion = await GetLFSVersion();
          let lfsEnabled = false;
          if (repoPath) {
            const lfsInfo = await IsLFSEnabled(repoPath);
            lfsEnabled = lfsInfo?.enabled || false;
          }
          setServiceStatus(prev => ({
            ...prev,
            lfs: {
              status: 'ready',
              version: lfsVersion || '',
              enabled: lfsEnabled,
            },
          }));
        } else {
          setServiceStatus(prev => ({
            ...prev,
            lfs: { status: 'warning', version: null, enabled: false },
          }));
        }
      } catch (err) {
        setServiceStatus(prev => ({
          ...prev,
          lfs: { status: 'warning', version: null, enabled: false },
        }));
      }
    };

    checkServices();
  }, [repoPath]);

  // Handle open folder
  const handleOpenFolder = useCallback(async () => {
    setIsOpeningFolder(true);
    try {
      const result = await OpenFolderDialog();
      if (result.selected && result.path) {
        await openRepo(result.path);
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
    setIsOpeningFolder(false);
  }, [openRepo]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshAll();
    setIsRefreshing(false);
  }, [refreshAll]);

  // Navigate to view
  const navigateTo = useCallback((view) => {
    setActiveView(view);
  }, [setActiveView]);

  // Setup steps configuration
  const setupSteps = useMemo(() => [
    {
      title: 'Open a repository folder',
      description: 'Select a folder containing your project files',
      completed: !!repoPath,
      action: handleOpenFolder,
    },
    {
      title: 'Review your changes',
      description: 'See what files have been modified',
      completed: !!repoPath && repoStatus?.changedFiles?.length > 0,
      action: () => navigateTo(VIEWS.CHANGES),
    },
    {
      title: 'Configure Git settings',
      description: 'Set your name and email for commits',
      completed: false, // Would need to check git config
      action: () => navigateTo(VIEWS.SETTINGS),
    },
    {
      title: 'Connect a remote account',
      description: 'Link GitHub or GitLab for collaboration',
      completed: serviceStatus.github.connected || serviceStatus.gitlab.connected,
      action: () => navigateTo(VIEWS.SETTINGS),
    },
  ], [repoPath, repoStatus, serviceStatus, handleOpenFolder, navigateTo]);

  // If no repo is open, show welcome state
  if (!repoPath) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Service Status Bar - Always visible */}
        <div className="shrink-0 border-b border-neutral-800 bg-neutral-900/50">
          <div className="max-w-5xl mx-auto p-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Terminal style={iconStyle} className="text-neutral-400" />
                  System Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StatusIndicator
                  status={serviceStatus.git.status}
                  label="Git"
                  version={serviceStatus.git.version}
                  description="Core version control system"
                />
                <StatusIndicator
                  status={serviceStatus.lfs.status}
                  label="Git LFS"
                  version={serviceStatus.lfs.version}
                  description="Large file storage for binary files"
                />
              </CardContent>
            </Card>
          </div>
        </div>
        <NoRepoState onOpenFolder={handleOpenFolder} isLoading={isOpeningFolder} />
      </div>
    );
  }

  // Dashboard with repo open
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-medium text-neutral-100">Dashboard</h1>
            <p className="text-sm text-neutral-500">Overview of your repository and quick actions</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw style={iconStyle} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Stats & Status */}
          <div className="lg:col-span-2 space-y-6">
            {/* Repository Stats */}
            <RepoStats repoPath={repoPath} repoStatus={repoStatus} commits={commits} />

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common tasks for managing your repository</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <QuickAction
                    icon={GitCommit}
                    title="Save Changes"
                    description="Stage and commit all modified files"
                    onClick={() => navigateTo(VIEWS.CHANGES)}
                    disabled={!repoStatus?.hasChanges}
                    variant={repoStatus?.hasChanges ? 'primary' : 'default'}
                  />
                  <QuickAction
                    icon={ArrowUpDown}
                    title="Sync with Remote"
                    description="Pull latest changes and push your commits"
                    onClick={() => navigateTo(VIEWS.CHANGES)}
                  />
                  <QuickAction
                    icon={Clock}
                    title="View History"
                    description="Browse commit history and file changes"
                    onClick={() => navigateTo(VIEWS.HISTORY)}
                  />
                  <QuickAction
                    icon={FolderPlus}
                    title="Open Folder"
                    description="Switch to a different repository"
                    onClick={handleOpenFolder}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <RecentActivity commits={commits} />
          </div>

          {/* Right Column - Status & Setup */}
          <div className="space-y-6">
            {/* Setup Progress */}
            <SetupProgress steps={setupSteps} />

            {/* Service Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Terminal style={iconStyle} className="text-neutral-400" />
                  Services
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StatusIndicator
                  status={serviceStatus.git.status}
                  label="Git"
                  version={serviceStatus.git.version}
                />
                <StatusIndicator
                  status={serviceStatus.lfs.status}
                  label="Git LFS"
                  version={serviceStatus.lfs.version}
                  description={serviceStatus.lfs.enabled ? 'Enabled in repo' : 'Not configured'}
                />
                <StatusIndicator
                  status={serviceStatus.github.connected ? 'ready' : 'disabled'}
                  label="GitHub"
                  description="Connect in Settings"
                />
                <StatusIndicator
                  status={serviceStatus.gitlab.connected ? 'ready' : 'disabled'}
                  label="GitLab"
                  description="Connect in Settings"
                />
              </CardContent>
              <CardFooter>
                <Button variant="ghost" size="sm" className="w-full" onClick={() => navigateTo(VIEWS.SETTINGS)}>
                  <Settings style={iconStyle} />
                  Configure Services
                </Button>
              </CardFooter>
            </Card>

            {/* Repository Info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <HardDrive style={iconStyle} className="text-neutral-400" />
                  Repository
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Branch</span>
                    <Badge variant="outline">
                      <GitBranch style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
                      {repoStatus?.branch || 'main'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Changed Files</span>
                    <span className="text-neutral-200">{repoStatus?.changedFiles?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">LFS Status</span>
                    <Badge variant={serviceStatus.lfs.enabled ? 'success' : 'outline'}>
                      {serviceStatus.lfs.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(DashboardPage);
