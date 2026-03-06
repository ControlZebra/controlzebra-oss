/**
 * AllSyncedScreen - Success state when repo is fully synced with no changes.
 */
import { memo, type CSSProperties } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { ICON_STYLES } from '../../../lib/gitHelpers';
import { getFolderNameFromPath } from '../../../lib/pathUtils';

// ============================================================================
// Types
// ============================================================================

interface AllSyncedScreenProps {
  repoPath?: string;
}

// ============================================================================
// Component
// ============================================================================

function AllSyncedScreen({ repoPath }: AllSyncedScreenProps): JSX.Element {
  const folderName = repoPath ? getFolderNameFromPath(repoPath) : 'Repository';
  
  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-screen-enter overflow-y-auto">
      <div className="max-w-md text-center">
        
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-6">
          <CheckCircle2 style={ICON_STYLES.xl as CSSProperties} className="text-green-400" />
        </div>
        <h1 className="text-3xl font-light text-theme-primary mb-2">All caught up!</h1>

        <p className="text-theme-secondary text-base mb-2">
          No changes detected in <span className="font-medium">{folderName}</span>
        </p>
        <p className="text-theme-muted text-sm">
          Your project is up to date. Make some changes to files and they'll appear here.
        </p>
      </div>
    </div>
  );
}

export default memo(AllSyncedScreen);
