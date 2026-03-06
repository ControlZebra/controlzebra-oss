import { memo } from 'react';
import { DownloadCloud, Loader2 } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { useRepo } from '../../context';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  Progress,
} from '../ui';

function AdditionalPackagesModal(): JSX.Element {
  const {
    isInstallingPackages,
    packagesInstallMessage,
    packagesInstallPercent,
  } = useRepo();

  return (
    <AlertDialog open={isInstallingPackages} onOpenChange={() => {}}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <DownloadCloud size={ICON_SIZES.sm} className="text-blue-400" />
            Preparing required packages
          </AlertDialogTitle>
          <AlertDialogDescription>
            Additional packages are being downloaded. Please wait and do not shut down the app.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="px-6 pb-6 space-y-3">
          <div className="flex items-center gap-2 text-theme-secondary text-sm">
            <Loader2 size={14} className="animate-spin" />
            <span>{packagesInstallMessage || 'Downloading additional packages...'}</span>
          </div>

          {packagesInstallPercent != null && (
            <div className="space-y-1">
              <Progress value={packagesInstallPercent} />
              <p className="text-[11px] text-theme-muted text-right">
                {Math.round(packagesInstallPercent)}%
              </p>
            </div>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default memo(AdditionalPackagesModal);
