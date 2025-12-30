/**
 * TopBar - Application header with repo name and sync controls.
 * Shows repository name, current branch, and sync button.
 */
import { memo, useCallback } from 'react';
import {
  RefreshCw,
  CodeSquare,
  ChevronDown,
} from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { useRepo } from '../../context';
import { Button } from '../ui';

// Shared icon style
const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

function TopBar() {
  const { repoPath, repoInfo, syncRepo, isSyncing } = useRepo();

  const handleSync = useCallback(async () => {
    await syncRepo();
  }, [syncRepo]);

  // Derive display values from repo state
  const repoName = repoPath ? repoPath.split('/').pop() : 'Rewind Logic';
  const branchName = repoInfo?.branch || 'main';

  return (
    <header className="h-[52px] bg-gray-900 border-b border-gray-700 flex items-center justify-center px-3 select-none shrink-0 relative">
      {/* Center: App name / repo name */}
      <div className="flex items-center gap-2">
        <span className="text-white font-semibold text-sm">
          {repoPath ? repoName : 'Rewind Logic'}
        </span>
        
        {repoPath && (
          <span className="text-gray-500 text-xs">• {branchName}</span>
        )}
      </div>

      {/* Right: Branch selector and Sync button */}
      <div className="absolute right-3 flex items-center gap-2">
        {repoPath && (
          <>
            {/* Branch selector dropdown button */}
            <Button variant="secondary" size="sm">
              <CodeSquare style={iconStyle} />
              <span>{branchName}</span>
              <ChevronDown style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
            </Button>

            {/* Sync button */}
            <Button 
              size="sm"
              onClick={handleSync}
              loading={isSyncing}
            >
              {isSyncing ? (
                'Syncing...'
              ) : (
                <>
                  <RefreshCw style={iconStyle} />
                  <span>Sync</span>
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </header>
  );
}

export default memo(TopBar);
