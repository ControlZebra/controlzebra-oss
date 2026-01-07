/**
 * ReadyToPushScreen - Screen when all changes are committed and ready to sync/PR.
 * Shows sync to cloud and merge request options (based on wireframe).
 */
import { memo } from 'react';
import { Cloud, GitPullRequest } from 'lucide-react';
import { ICON_SIZES } from '../../../../constants';
import { Button } from '../../../ui';
import { toast } from 'sonner';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

function ReadyToPushScreen({ 
  ahead = 0,
  onSync, 
  isSyncing,
}) {
  const handleCreateMergeRequest = () => {
    // Placeholder - PR creation not yet implemented
    toast.info('Merge request creation coming soon!');
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center">
        {/* Header */}
        <h1 className="text-5xl font-light text-neutral-100 mb-2">Welcome!</h1>
        <p className="text-sm text-neutral-500 mb-10">Recommended next step</p>

        {/* Sync to cloud section */}
        <div className="mb-8">
          <p className="text-neutral-400 text-sm mb-4">
            Make a cloud backup of this branch
            {ahead > 0 && (
              <span className="text-neutral-500 ml-1">
                ({ahead} commit{ahead !== 1 ? 's' : ''} ahead)
              </span>
            )}
          </p>
          <Button 
            onClick={onSync} 
            loading={isSyncing} 
            size="lg"
            variant="outline"
            className="w-full max-w-md h-14 text-lg border-2 border-neutral-600 hover:border-neutral-500"
          >
            <Cloud style={{ width: ICON_SIZES.md, height: ICON_SIZES.md }} />
            Sync to cloud
          </Button>
        </div>

        {/* Merge request section */}
        <div>
          <p className="text-neutral-400 text-sm mb-4">
            If you are ready merge your changes with the master copy:
          </p>
          <Button 
            onClick={handleCreateMergeRequest}
            size="lg"
            variant="outline"
            className="w-full max-w-md h-14 text-lg border-2 border-neutral-600 hover:border-neutral-500"
          >
            <GitPullRequest style={{ width: ICON_SIZES.md, height: ICON_SIZES.md }} />
            Create a merge request
          </Button>
        </div>
      </div>
    </div>
  );
}

export default memo(ReadyToPushScreen);
