import { memo, useMemo, type CSSProperties } from 'react';
import { Loader2 } from 'lucide-react';

import { ICON_SIZES } from '../../../constants';
import type { MergeReviewDiffResult } from '../../../context';
import { DiffRenderer } from '../../../viewers/components/shared/DiffRenderer';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui';

const iconSm: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

interface MergeReviewDiffModalProps {
  open: boolean;
  onClose: () => void;
  reviewFilePath: string | null;
  reviewDiff: MergeReviewDiffResult | null;
  isLoadingReviewDiff: boolean;
  repoPath?: string | null;
}

function MergeReviewDiffModal({
  open,
  onClose,
  reviewFilePath,
  reviewDiff,
  isLoadingReviewDiff,
  repoPath,
}: MergeReviewDiffModalProps): JSX.Element {
  const displayPath = useMemo(() => {
    if (reviewDiff?.oldPath && reviewDiff.oldPath !== reviewDiff.path) {
      return `${reviewDiff.oldPath} → ${reviewDiff.path}`;
    }
    return reviewFilePath || reviewDiff?.path || '';
  }, [reviewDiff?.oldPath, reviewDiff?.path, reviewFilePath]);

  const selectedFilePath = useMemo(
    () => reviewDiff?.path || reviewFilePath || '',
    [reviewDiff?.path, reviewFilePath],
  );

  const activeViewerPath = useMemo(() => {
    if (reviewDiff?.status === 'deleted' && reviewDiff.oldPath) {
      return reviewDiff.oldPath;
    }
    return selectedFilePath;
  }, [reviewDiff?.status, reviewDiff?.oldPath, selectedFilePath]);

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <AlertDialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Review Changes
          </AlertDialogTitle>
          <AlertDialogDescription>
            {displayPath || 'Select a file to review'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden border border-theme-default rounded-lg">
          {isLoadingReviewDiff ? (
            <div className="h-64 flex items-center justify-center text-theme-muted text-sm gap-2">
              <Loader2 style={iconSm} className="animate-spin" />
              Loading diff...
            </div>
          ) : !selectedFilePath ? (
            <div className="h-64 flex items-center justify-center text-theme-muted text-sm">
              No file selected
            </div>
          ) : !reviewDiff ? (
            <div className="h-64 flex items-center justify-center text-theme-muted text-sm">
              Unable to load diff for {selectedFilePath}
            </div>
          ) : (
            <div className="h-full overflow-auto">
              <DiffRenderer
                repoPath={repoPath || null}
                filePath={activeViewerPath}
                mode="working"
                fileStatus={reviewDiff.status}
                oldPath={reviewDiff.oldPath}
                fileDiff={reviewDiff as any}
                binary={reviewDiff.binary}
                showHeader
                loadingLabel="Loading diff viewer…"
              />
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default memo(MergeReviewDiffModal);