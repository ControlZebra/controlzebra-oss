/**
 * SidebarPushPanel - Compact panel when commits are ready to push.
 */
import { memo } from 'react';
import { Cloud, Upload, Save } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { Button } from '../../ui';

const iconStyleSm = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconStyleLg = { width: ICON_SIZES.lg, height: ICON_SIZES.lg };

function SidebarPushPanel({ 
  ahead = 0,
  hasUpstream = true,
  totalLocalCommits = 0,
  onSync, 
  isSyncing,
}) {
  const pendingCount = hasUpstream ? ahead : totalLocalCommits;
  
  return (
    <div className="p-4 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 mb-3">
        <Save style={iconStyleLg} className="text-blue-400" />
      </div>
      <p className="text-theme-primary text-sm font-medium mb-1">
        {pendingCount} snapshot{pendingCount !== 1 ? 's' : ''} pending
      </p>
      <p className="text-theme-muted text-xs mb-4">
        {hasUpstream ? 'Ready to sync' : 'Branch not published'}
      </p>
      <Button 
        onClick={onSync} 
        loading={isSyncing} 
        size="sm"
        variant="secondary"
        className="w-full"
      >
        {hasUpstream ? (
          <Cloud style={iconStyleSm} />
        ) : (
          <Upload style={iconStyleSm} />
        )}
        {hasUpstream ? 'Sync' : 'Publish'}
      </Button>
    </div>
  );
}

export default memo(SidebarPushPanel);
