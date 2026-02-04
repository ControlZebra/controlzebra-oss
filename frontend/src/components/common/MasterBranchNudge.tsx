/**
 * MasterBranchNudge - Banner shown when user has uncommitted changes on master/main branch.
 * Encourages users to work on feature branches instead of committing directly to main.
 */
import { memo } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { Button } from '../ui';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconStyleXs = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

interface MasterBranchNudgeProps {
  branchName?: string;
  onDismiss?: () => void;
  compact?: boolean;
  className?: string;
}

function MasterBranchNudge({ 
  branchName = 'master', 
  onDismiss,
  compact = false,
  className = '' 
}: MasterBranchNudgeProps) {
  if (compact) {
    return (
      <div 
        className={`
          bg-amber-100 dark:bg-amber-500/10 
          border border-amber-300 dark:border-amber-500/30 
          rounded p-2 text-xs
          flex items-center gap-2
          ${className}
        `}
      >
        <AlertCircle style={iconStyleXs} className="text-amber-600 dark:text-amber-500 shrink-0" />
        <span className="text-amber-800 dark:text-amber-200 flex-1">
          On <code>{branchName}</code>
        </span>
        {onDismiss && (
          <button onClick={onDismiss} className="text-amber-600 dark:text-amber-400 hover:text-amber-700">
            <X style={iconStyleXs} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`
        bg-amber-100 dark:bg-amber-500/10 
        border border-amber-300 dark:border-amber-500/30 
        rounded-lg p-3 mb-4
        flex items-start gap-3
        ${className}
      `}
    >
      <div className="shrink-0 mt-0.5">
        <AlertCircle 
          style={iconStyle} 
          className="text-amber-600 dark:text-amber-500" 
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          You're working on <code className="bg-amber-200 dark:bg-amber-500/20 px-1 rounded text-amber-900 dark:text-amber-100">{branchName}</code>
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-1">
          Consider creating a new branch for your changes. This keeps {branchName} clean and makes it easier to review your work.
        </p>
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          className="shrink-0 h-6 w-6 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-500/20"
          aria-label="Dismiss"
        >
          <X style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
        </Button>
      )}
    </div>
  );
}

export default memo(MasterBranchNudge);
