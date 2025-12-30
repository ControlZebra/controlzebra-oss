import { memo } from 'react';
import CommitIcon from '@mui/icons-material/Commit';
import TerminalIcon from '@mui/icons-material/Terminal';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SyncIcon from '@mui/icons-material/Sync';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import EditIcon from '@mui/icons-material/Edit';
import { BOTTOM_PANELS, ICON_SIZES } from '../../constants';
import { useLayout, useRepo } from '../../context';

const iconStyle = { fontSize: ICON_SIZES.xs };

const PANEL_TABS = [
  { id: BOTTOM_PANELS.COMMIT, icon: CommitIcon, label: 'Commit' },
  { id: BOTTOM_PANELS.TERMINAL, icon: TerminalIcon, label: 'Terminal' },
];

function StatusBar() {
  const { 
    activeBottomPanel, 
    setActiveBottomPanel, 
    bottomPanelCollapsed, 
    setBottomPanelCollapsed 
  } = useLayout();
  
  const { repoPath, repoInfo, repoStatus, isSyncing } = useRepo();

  const handleTabClick = (panelId) => {
    if (activeBottomPanel === panelId && !bottomPanelCollapsed) {
      // Clicking active panel collapses it
      setBottomPanelCollapsed(true);
    } else {
      // Clicking different or collapsed panel opens it
      setActiveBottomPanel(panelId);
      setBottomPanelCollapsed(false);
    }
  };

  const branchName = repoInfo?.branch || 'main';
  const changesCount = repoStatus?.changedFiles?.length || 0;
  const ahead = repoStatus?.ahead || 0;
  const behind = repoStatus?.behind || 0;

  // Determine sync status
  let syncStatus = { icon: CheckCircleIcon, text: 'Synced', className: 'text-green-400' };
  if (isSyncing) {
    syncStatus = { icon: SyncIcon, text: 'Syncing...', className: 'text-blue-400' };
  } else if (behind > 0 && ahead > 0) {
    syncStatus = { icon: SyncIcon, text: `${behind}↓ ${ahead}↑`, className: 'text-yellow-400' };
  } else if (behind > 0) {
    syncStatus = { icon: CloudDownloadIcon, text: `${behind} behind`, className: 'text-yellow-400' };
  } else if (ahead > 0) {
    syncStatus = { icon: CloudUploadIcon, text: `${ahead} ahead`, className: 'text-yellow-400' };
  }

  const SyncStatusIcon = syncStatus.icon;

  return (
    <footer className="h-6 bg-gray-800 border-t border-gray-700 flex items-center justify-between px-2 select-none shrink-0">
      {/* Left: Panel tabs */}
      <div className="flex items-center gap-0.5">
        {PANEL_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeBottomPanel === tab.id && !bottomPanelCollapsed;
          
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              title={tab.label}
              className={`
                flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors
                ${isActive 
                  ? 'text-gray-200 bg-gray-700' 
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                }
              `}
            >
              <Icon sx={iconStyle} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Status indicators */}
      <div className="flex items-center gap-3 text-xs">
        {repoPath && (
          <>
            <div className="flex items-center gap-1 text-gray-400">
              <AccountTreeIcon sx={iconStyle} />
              <span>{branchName}</span>
            </div>
            
            <div className={`flex items-center gap-1 ${syncStatus.className}`}>
              <SyncStatusIcon sx={iconStyle} className={isSyncing ? 'animate-spin' : ''} />
              <span>{syncStatus.text}</span>
            </div>

            {changesCount > 0 && (
              <div className="flex items-center gap-1 text-yellow-400">
                <EditIcon sx={iconStyle} />
                <span>{changesCount} changes</span>
              </div>
            )}
          </>
        )}
        
        {!repoPath && (
          <span className="text-gray-500">No repository open</span>
        )}
      </div>
    </footer>
  );
}

export default memo(StatusBar);
