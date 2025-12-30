/**
 * StatusBar - Application footer with panel tabs and repository status.
 * Shows commit/terminal tabs, branch info, sync status, and change count.
 */
import { memo, useCallback, useMemo } from 'react';
import {
  CodeSquare,
  Terminal,
  CheckCircle,
  RefreshCw,
  CloudDownload,
  CloudUpload,
  Pencil,
} from 'lucide-react';
import { BOTTOM_PANELS, ICON_SIZES } from '../../constants';
import { useLayout, useRepo } from '../../context';

// Icon style for consistent sizing
const iconStyle = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

// Panel tab configuration
const PANEL_TABS = [
  { id: BOTTOM_PANELS.COMMIT, Icon: CodeSquare, label: 'Commit' },
  { id: BOTTOM_PANELS.TERMINAL, Icon: Terminal, label: 'Terminal' },
];

/**
 * Determines the sync status display based on repo state.
 * Returns icon component, text, and color class.
 */
function getSyncStatus(isSyncing, ahead, behind) {
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

function StatusBar() {
  const { 
    activeBottomPanel, 
    setActiveBottomPanel, 
    bottomPanelCollapsed, 
    setBottomPanelCollapsed 
  } = useLayout();
  
  const { repoPath, repoInfo, repoStatus, isSyncing } = useRepo();

  // Toggle panel: clicking active collapses, clicking inactive opens
  const handleTabClick = useCallback((panelId) => {
    if (activeBottomPanel === panelId && !bottomPanelCollapsed) {
      setBottomPanelCollapsed(true);
    } else {
      setActiveBottomPanel(panelId);
      setBottomPanelCollapsed(false);
    }
  }, [activeBottomPanel, bottomPanelCollapsed, setActiveBottomPanel, setBottomPanelCollapsed]);

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

  return (
    <footer className="h-6 bg-gray-800 border-t border-gray-700 flex items-center justify-between px-2 select-none shrink-0">
      {/* Left: Panel tabs */}
      <div className="flex items-center gap-0.5">
        {PANEL_TABS.map(tab => {
          const { Icon, label, id } = tab;
          const isActive = activeBottomPanel === id && !bottomPanelCollapsed;
          
          return (
            <button
              key={id}
              onClick={() => handleTabClick(id)}
              title={label}
              className={`
                flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors
                ${isActive 
                  ? 'text-gray-200 bg-gray-700' 
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                }
              `}
            >
              <Icon style={iconStyle} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Status indicators */}
      <div className="flex items-center gap-3 text-xs">
        {repoPath ? (
          <>
            {/* Branch name */}
            <div className="flex items-center gap-1 text-gray-400">
              <CodeSquare style={iconStyle} />
              <span>{branchName}</span>
            </div>
            
            {/* Sync status */}
            <div className={`flex items-center gap-1 ${syncStatus.className}`}>
              <syncStatus.Icon 
                style={iconStyle} 
                className={syncStatus.spinning ? 'animate-spin' : ''} 
              />
              <span>{syncStatus.text}</span>
            </div>

            {/* Changes count */}
            {changesCount > 0 && (
              <div className="flex items-center gap-1 text-yellow-400">
                <Pencil style={iconStyle} />
                <span>{changesCount} changes</span>
              </div>
            )}
          </>
        ) : (
          <span className="text-gray-500">No repository open</span>
        )}
      </div>
    </footer>
  );
}

export default memo(StatusBar);
