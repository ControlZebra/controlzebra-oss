/**
 * StatusBar - Application footer with panel tabs and repository status.
 * Shows commit/terminal tabs, branch info, sync status, change count,
 * and project state indicators (tracked/untracked/remote).
 */
import { memo, useCallback, useMemo, useState, useEffect, type CSSProperties } from 'react';
import {
  CheckCircle,
  RefreshCw,
  CloudDownload,
  CloudUpload,
  Pencil,
  CodeSquare,
  FolderOpen,
  HardDrive,
  Cloud,
  AlertTriangle,
  Bug,
  type LucideIcon,
} from 'lucide-react';
import { onEvent } from '../../shared/runtime/events';
import { ICON_SIZES, VIEWS, PROJECT_STATES, type ProjectState } from '../../shared/constants';
import { useRepo, useLayout } from '../../context';
import { IsEnabled, SetEnabled } from '../../../bindings/controlzebra/services/debugservice';

// ============================================================================
// Types
// ============================================================================

interface SyncStatusResult {
  Icon: LucideIcon;
  text: string;
  className: string;
  spinning: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

// Icon style for consistent sizing
const iconStyle: CSSProperties = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

// ============================================================================
// Helpers
// ============================================================================

/**
 * Determines the sync status display based on repo state.
 * Returns icon component, text, and color class.
 */
function getSyncStatus(isSyncing: boolean, ahead: number, behind: number): SyncStatusResult {
  if (isSyncing) {
    return { Icon: RefreshCw, text: 'Syncing...', className: 'text-blue-400', spinning: true };
  }
  if (behind > 0 && ahead > 0) {
    return { Icon: RefreshCw, text: `${behind}↓ ${ahead}↑`, className: 'text-yellow-400', spinning: false };
  }
  if (behind > 0) {
    return { Icon: CloudDownload, text: `${behind} behind`, className: 'text-yellow-400', spinning: false };
  }
  if (ahead > 0) {
    return { Icon: CloudUpload, text: `${ahead} ahead`, className: 'text-yellow-400', spinning: false };
  }
  return { Icon: CheckCircle, text: 'Synced', className: 'text-green-400', spinning: false };
}

/**
 * Determines the project state indicator for the status bar.
 * Shows tracking status and remote connectivity at a glance.
 */
interface ProjectStateIndicator {
  Icon: LucideIcon;
  text: string;
  className: string;
  showNudge: boolean;
}

function getProjectStateIndicator(state: ProjectState | null): ProjectStateIndicator | null {
  switch (state) {
    case PROJECT_STATES.EMPTY_UNTRACKED:
    case PROJECT_STATES.HAS_FILES_UNTRACKED:
      return {
        Icon: FolderOpen,
        text: 'Not tracked',
        className: 'text-yellow-400',
        showNudge: true,
      };
    case PROJECT_STATES.TRACKED_NO_REMOTE:
      return {
        Icon: HardDrive,
        text: 'Local only',
        className: 'text-yellow-400',
        showNudge: false,
      };
    case PROJECT_STATES.TRACKED_WITH_REMOTE:
      return {
        Icon: Cloud,
        text: 'Remote connected',
        className: 'text-green-400',
        showNudge: false,
      };
    case PROJECT_STATES.JUST_CREATED:
      return {
        Icon: CheckCircle,
        text: 'Just created',
        className: 'text-green-400',
        showNudge: false,
      };
    case PROJECT_STATES.NESTED_REPO:
      return {
        Icon: AlertTriangle,
        text: 'Nested repo',
        className: 'text-orange-400',
        showNudge: false,
      };
    default:
      return null;
  }
}

// ============================================================================
// Component
// ============================================================================

function StatusBar(): JSX.Element {
  const {
    repoPath,
    repoInfo,
    repoStatus,
    isSyncing,
    hasRemote,
    startTracking,
    installRequiredPackages,
    gitInstalled,
    lfsInstalled,
    isInstallingPackages,
  } = useRepo();
  const { setActiveView, setSidebarCollapsed } = useLayout();

  // ---------------------------------------------------------------------------
  // Debug logging indicator state
  // ---------------------------------------------------------------------------
  const [debugEnabled, setDebugEnabled] = useState(false);

  // Fetch initial state and listen for changes
  useEffect(() => {
    let cancelled = false;
    IsEnabled().then((v) => { if (!cancelled) setDebugEnabled(v); }).catch(() => {});

    const unsub = onEvent('debug:state-changed', (event: any) => {
      const data = event?.data?.[0] ?? event;
      setDebugEnabled(data as boolean);
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  // Toggle debug logging directly from StatusBar
  const handleDebugClick = useCallback(() => {
    setActiveView(VIEWS.DEBUG);
    setSidebarCollapsed(false);
  }, [setActiveView, setSidebarCollapsed]);

  const handleDebugToggle = useCallback(async () => {
    const next = !debugEnabled;
    try {
      await SetEnabled(next);
      setDebugEnabled(next);
    } catch { /* ignore */ }
  }, [debugEnabled]);

  // Derive status info from repo state
  const branchName = repoInfo?.branch || 'main';
  const changesCount = repoStatus?.changedFiles?.length || 0;
  const ahead = repoStatus?.ahead || 0;
  const behind = repoStatus?.behind || 0;

  // Memoize sync status to prevent recalculation
  const syncStatus = useMemo(
    () => getSyncStatus(isSyncing, ahead, behind),
    [isSyncing, ahead, behind]
  );

  // Derive project state for status bar indicator (Phase 13.1)
  const projectState = useMemo((): ProjectState | null => {
    if (!repoPath) return null;
    if (!repoInfo?.isRepo) {
      const fileCount = repoStatus?.changedFiles?.length || 0;
      return fileCount > 0
        ? PROJECT_STATES.HAS_FILES_UNTRACKED
        : PROJECT_STATES.EMPTY_UNTRACKED;
    }
    // Nested repo check: detected repo root differs from opened path
    if (repoInfo.path && repoInfo.path !== repoPath) {
      return PROJECT_STATES.NESTED_REPO;
    }
    if (!hasRemote) return PROJECT_STATES.TRACKED_NO_REMOTE;
    return PROJECT_STATES.TRACKED_WITH_REMOTE;
  }, [repoPath, repoInfo?.isRepo, repoInfo?.path, hasRemote, repoStatus?.changedFiles?.length]);

  // Memoize project state indicator
  const stateIndicator = useMemo(
    () => getProjectStateIndicator(projectState),
    [projectState]
  );

  // Handle "Enable version control" nudge click
  const handleNudgeClick = useCallback(async () => {
    if (!gitInstalled || !lfsInstalled) {
      await installRequiredPackages();
      return;
    }

    await startTracking('status_bar_nudge');
  }, [startTracking, gitInstalled, lfsInstalled, installRequiredPackages]);

  return (
    <footer className="h-6 bg-theme-surface border-t border-theme-default flex items-center justify-between px-2 select-none shrink-0 min-w-0">
      {/* Left: Debug indicator */}
      <div className="flex items-center gap-1.5 text-xs shrink-0">
        <button
          onClick={handleDebugClick}
          onContextMenu={(e) => { e.preventDefault(); handleDebugToggle(); }}
          className={`flex items-center gap-1 px-1 rounded transition-colors
            ${debugEnabled
              ? 'text-green-400 hover:text-green-300'
              : 'text-theme-muted hover:text-theme-secondary'
            }`}
          title={debugEnabled ? 'Debug: ON — Click to view, right-click to toggle' : 'Debug: OFF — Click to view, right-click to toggle'}
        >
          <Bug style={iconStyle} />
          <span className="hidden sm:inline text-[11px]">
            {debugEnabled ? 'Debug' : 'Debug'}
          </span>
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${debugEnabled ? 'bg-green-400' : 'bg-gray-600'}`}
          />
        </button>
      </div>

      {/* Right: Status indicators */}
      <div className="flex items-center gap-3 text-xs min-w-0">
        {repoPath ? (
          <>
            {/* Project state indicator (Phase 13.1) */}
            {stateIndicator && (
              <div className={`flex items-center gap-1 shrink-0 ${stateIndicator.className}`}>
                <stateIndicator.Icon style={iconStyle} />
                <span className="hidden sm:inline">{stateIndicator.text}</span>
                {stateIndicator.showNudge && (
                  <button
                    onClick={handleNudgeClick}
                    disabled={isInstallingPackages}
                    className="text-blue-400 hover:text-blue-300 underline underline-offset-2 ml-1 hidden md:inline"
                    title={(!gitInstalled || !lfsInstalled)
                      ? 'Install required packages to enable version control'
                      : 'Enable version control for this folder'}
                  >
                    {isInstallingPackages ? 'Installing…' : ((!gitInstalled || !lfsInstalled) ? 'Install' : 'Enable')}
                  </button>
                )}
              </div>
            )}

            {/* Branch name — only show when tracked */}
            {repoInfo?.isRepo && (
              <div className="flex items-center gap-1 text-theme-secondary min-w-0">
                <CodeSquare style={iconStyle} className="shrink-0" />
                <span className="truncate max-w-[120px]">{branchName}</span>
              </div>
            )}
            
            {/* Sync status — only show when tracked with remote */}
            {repoInfo?.isRepo && hasRemote && (
              <div className={`flex items-center gap-1 shrink-0 ${syncStatus.className}`}>
                <syncStatus.Icon 
                  style={iconStyle} 
                  className={syncStatus.spinning ? 'animate-spin' : ''} 
                />
                <span className="hidden sm:inline">{syncStatus.text}</span>
              </div>
            )}

            {/* Changes count */}
            {changesCount > 0 && (
              <div className="flex items-center gap-1 text-yellow-400 shrink-0">
                <Pencil style={iconStyle} />
                <span className="hidden sm:inline">{changesCount} changes</span>
                <span className="sm:hidden">{changesCount}</span>
              </div>
            )}
          </>
        ) : (
          <span className="text-theme-muted truncate">No repository open</span>
        )}
      </div>
    </footer>
  );
}

export default memo(StatusBar);
