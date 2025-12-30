import { memo, useCallback } from 'react';
import SyncIcon from '@mui/icons-material/Sync';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CircularProgress from '@mui/material/CircularProgress';
import { ICON_SIZES } from '../../constants';
import { useRepo } from '../../context';

const iconStyle = { fontSize: ICON_SIZES.sm };

function TopBar() {
  const { repoPath, repoInfo, syncRepo, isSyncing } = useRepo();

  const handleSync = useCallback(async () => {
    await syncRepo();
  }, [syncRepo]);

  const repoName = repoPath ? repoPath.split('/').pop() : 'Rewind Logic';
  const branchName = repoInfo?.branch || 'main';

  return (
    <header className="h-10 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-3 select-none shrink-0">
      {/* Left: App name / repo name */}
      <div className="flex items-center gap-2">
        <span className="text-white font-semibold text-sm">
          {repoPath ? repoName : 'Rewind Logic'}
        </span>
        
        {repoPath && (
          <span className="text-gray-500 text-xs">• {branchName}</span>
        )}
      </div>

      {/* Right: Branch selector and Sync button */}
      <div className="flex items-center gap-2">
        {repoPath && (
          <>
            <button className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-200 text-xs transition-colors">
              <AccountTreeIcon sx={iconStyle} />
              <span>{branchName}</span>
              <KeyboardArrowDownIcon sx={iconStyle} />
            </button>

            <button 
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-70 disabled:cursor-not-allowed rounded text-white text-xs font-medium transition-colors"
            >
              {isSyncing ? (
                <>
                  <CircularProgress size={14} sx={{ color: 'white' }} />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <SyncIcon sx={iconStyle} />
                  <span>Sync</span>
                </>
              )}
            </button>
          </>
        )}
      </div>
    </header>
  );
}

export default memo(TopBar);
