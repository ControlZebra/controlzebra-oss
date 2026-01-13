/**
 * SidebarSyncedPanel - Compact panel when repo is fully synced.
 */
import { memo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';

const iconStyleLg = { width: ICON_SIZES.lg, height: ICON_SIZES.lg };

function SidebarSyncedPanel({ repoPath }) {
  const folderName = repoPath?.split('/').pop() || 'Repository';
  
  return (
    <div className="p-4 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 mb-3">
        <CheckCircle2 style={iconStyleLg} className="text-green-400" />
      </div>
      <p className="text-theme-primary text-sm font-medium mb-1">All caught up</p>
      <p className="text-theme-muted text-xs">
        No changes in <span className="font-medium">{folderName}</span>
      </p>
    </div>
  );
}

export default memo(SidebarSyncedPanel);
