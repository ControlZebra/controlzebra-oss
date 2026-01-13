/**
 * ReadyToPushScreen - Screen when all changes are committed locally.
 * Encourages syncing to cloud while noting it's optional.
 */
import { memo } from 'react';
import { Cloud, Save, Upload } from 'lucide-react';
import { ICON_STYLES } from '../../../../lib/gitHelpers';
import { Button } from '../../../ui';

function ReadyToPushScreen({ 
  ahead = 0,
  hasUpstream = true,
  totalLocalCommits = 0,
  onSync, 
  isSyncing,
}) {
  // Determine the count to show - either ahead count or total commits if no upstream
  const pendingCount = hasUpstream ? ahead : totalLocalCommits;
  
  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-screen-enter overflow-y-auto">
      <div className="max-w-lg w-full text-center">
        {/* Header */}
        <h1 className="text-5xl font-light text-theme-primary mb-2">Nice work!</h1>
        <p className="text-sm text-theme-muted mb-8">Your changes are saved locally</p>

        {/* Snapshot saved icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-6">
          <Save style={ICON_STYLES.xl} className="text-blue-400" />
        </div>

        {/* Explanation */}
        <p className="text-theme-secondary text-base mb-2">
          You have {pendingCount} snapshot{pendingCount !== 1 ? 's' : ''} pending backup.
        </p>
        {!hasUpstream ? (
          <p className="text-theme-muted text-sm mb-8">
            This branch hasn't been published yet. Sync to create a backup in the cloud.
          </p>
        ) : (
          <p className="text-theme-muted text-sm mb-8">
            Feel free to continue making changes or sync to cloud for a secure backup.
          </p>
        )}

        {/* Sync action */}
        <Button 
          onClick={onSync} 
          loading={isSyncing} 
          size="lg"
          variant="secondary"
          className="w-[70%] h-10 text-lg"
        >
          {hasUpstream ? (
            <Cloud style={ICON_STYLES.md} />
          ) : (
            <Upload style={ICON_STYLES.md} />
          )}
          {hasUpstream ? 'Sync to cloud' : 'Publish to cloud'}
        </Button>

        
      </div>
    </div>
  );
}

export default memo(ReadyToPushScreen);
