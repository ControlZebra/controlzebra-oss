/**
 * MergeRequestScreen - Screen when changes are synced and ready to create a PR.
 * Shows on feature branches that are synced with remote.
 */
import { memo, type CSSProperties } from 'react';
import { CheckCircle2, GitPullRequest } from 'lucide-react';
import { ICON_STYLES } from '../../../../lib/gitHelpers';
import { Button } from '../../../ui';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

interface MergeRequestScreenProps {
  branchName: string;
}

// ============================================================================
// Component
// ============================================================================

function MergeRequestScreen({ branchName }: MergeRequestScreenProps): JSX.Element {
  const handleCreateMergeRequest = (): void => {
    // Placeholder - PR creation not yet implemented
    toast.info('Merge request creation coming soon!');
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-screen-enter overflow-y-auto">
      <div className="max-w-lg w-full text-center">
        {/* Header */}
        <h1 className="text-5xl font-light text-theme-primary mb-2">Great work!</h1>
        <p className="text-sm text-theme-muted mb-8">Your changes are safe</p>

        {/* Success icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-6">
          <CheckCircle2 style={ICON_STYLES.xl as CSSProperties} className="text-green-400" />
        </div>

        {/* Explanation */}
        <p className="text-theme-secondary text-base mb-2">
          All your changes on <span className="font-medium">{branchName}</span> are now synced with the cloud.
        </p>
        <p className="text-theme-muted text-sm mb-8">
          When you're ready to incorporate your work into the main project, you can create a merge request for review.
        </p>

        {/* Merge request action */}
        <Button 
          onClick={handleCreateMergeRequest}
          size="lg"
          variant="outline"
          className="w-full max-w-md h-14 text-lg border-2 border-theme-default hover:border-theme-muted"
        >
          <GitPullRequest style={ICON_STYLES.md as CSSProperties} />
          Create a merge request
        </Button>

        <p className="text-xs text-theme-muted mt-6">
          No rush — you can continue making changes and sync again anytime.
        </p>
      </div>
    </div>
  );
}

export default memo(MergeRequestScreen);
