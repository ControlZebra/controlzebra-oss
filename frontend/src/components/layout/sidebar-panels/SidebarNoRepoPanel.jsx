/**
 * SidebarNoRepoPanel - Compact panel when folder has no git.
 */
import { memo } from 'react';
import { AlertTriangle, GitBranch } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { Button } from '../../ui';

const iconStyleSm = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconStyleLg = { width: ICON_SIZES.lg, height: ICON_SIZES.lg };

function SidebarNoRepoPanel({ folderName, onInitialize, isLoading }) {
  return (
    <div className="p-4 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-500/10 mb-3">
        <AlertTriangle style={iconStyleLg} className="text-yellow-500" />
      </div>
      <p className="text-theme-primary text-sm font-medium mb-1">No Version Control</p>
      <p className="text-theme-muted text-xs mb-4">
        <span className="font-medium">{folderName}</span> is not tracked
      </p>
      <Button 
        onClick={onInitialize} 
        loading={isLoading}
        size="sm"
        className="w-full"
      >
        <GitBranch style={iconStyleSm} />
        Start Tracking
      </Button>
    </div>
  );
}

export default memo(SidebarNoRepoPanel);
