/**
 * SidebarMergePanel - Compact panel when on feature branch and synced.
 */
import { memo } from 'react';
import { CheckCircle2, GitPullRequest } from 'lucide-react';
import { ICON_STYLES } from '../../../lib/gitHelpers';
import { Button } from '../../ui';
import { toast } from 'sonner';

function SidebarMergePanel({ branchName }) {
  const handleCreateMergeRequest = () => {
    toast.info('Merge request creation coming soon!');
  };

  return (
    <div className="p-4 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 mb-3">
        <CheckCircle2 style={ICON_STYLES.lg} className="text-green-400" />
      </div>
      <p className="text-theme-primary text-sm font-medium mb-1">Branch synced</p>
      <p className="text-theme-muted text-xs mb-4">
        <span className="font-mono">{branchName}</span> is up to date
      </p>
      <Button 
        onClick={handleCreateMergeRequest}
        size="sm"
        variant="outline"
        className="w-full"
      >
        <GitPullRequest style={ICON_STYLES.sm} />
        Merge Request
      </Button>
    </div>
  );
}

export default memo(SidebarMergePanel);
