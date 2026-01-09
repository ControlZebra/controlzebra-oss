/**
 * MasterBranchNudge - Banner shown when user has uncommitted changes on master/main branch.
 * Encourages users to work on feature branches instead of committing directly to main.
 */
import { memo } from 'react';
import { GitBranch, AlertCircle, X } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { Button } from '../ui';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

function MasterBranchNudge({ 
  branchName = 'master', 
  onDismiss,
  className = '' 
}) {
  return (
    <div 
      className={`
        bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4
        flex items-start gap-3
        ${className}
      `}
    >
      <div className="shrink-0 mt-0.5">
        <AlertCircle 
          style={iconStyle} 
          className="text-amber-500" 
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-200">
          You're working on <code className="font-mono bg-amber-500/20 px-1 rounded">{branchName}</code>
        </p>
        <p className="text-xs text-amber-300/80 mt-1">
          Consider creating a new branch for your changes. This keeps {branchName} clean and makes it easier to review your work.
        </p>
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          className="shrink-0 h-6 w-6 text-amber-400 hover:text-amber-300 hover:bg-amber-500/20"
          aria-label="Dismiss"
        >
          <X style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
        </Button>
      )}
    </div>
  );
}

export default memo(MasterBranchNudge);
