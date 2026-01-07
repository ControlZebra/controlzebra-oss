/**
 * ReadyToPushScreen - Screen when all changes are committed locally.
 * Encourages syncing to cloud while noting it's optional.
 */
import { memo } from 'react';
import { Cloud, Save } from 'lucide-react';
import { ICON_SIZES } from '../../../../constants';
import { Button } from '../../../ui';

function ReadyToPushScreen({ 
  ahead = 0,
  onSync, 
  isSyncing,
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-screen-enter">
      <div className="max-w-lg w-full text-center">
        {/* Header */}
        <h1 className="text-5xl font-light text-theme-primary mb-2">Nice work!</h1>
        <p className="text-sm text-theme-muted mb-8">Your changes are saved locally</p>

        {/* Snapshot saved icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-6">
          <Save style={{ width: 32, height: 32 }} className="text-blue-400" />
        </div>

        {/* Explanation */}
        <p className="text-theme-secondary text-base mb-2">
          You have {ahead} snapshot{ahead !== 1 ? 's' : ''} saved on this device.
        </p>
        <p className="text-theme-muted text-sm mb-8">
          We recommend syncing to the cloud for a secure backup. This way your work is safe even if something happens to this computer.
        </p>

        {/* Sync action */}
        <Button 
          onClick={onSync} 
          loading={isSyncing} 
          size="lg"
          variant="outline"
          className="w-full max-w-md h-14 text-lg border-2 border-theme-default hover:border-theme-muted"
        >
          <Cloud style={{ width: ICON_SIZES.md, height: ICON_SIZES.md }} />
          Sync to cloud
        </Button>

        {/* Optional note */}
        <p className="text-xs text-theme-muted mt-6">
          This is optional — feel free to continue making changes and sync whenever you're ready.
        </p>
      </div>
    </div>
  );
}

export default memo(ReadyToPushScreen);
