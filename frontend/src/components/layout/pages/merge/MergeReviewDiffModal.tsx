import { memo, lazy, Suspense, useMemo, type CSSProperties } from 'react';
import { Loader2 } from 'lucide-react';

import { ICON_SIZES } from '../../../../constants';
import type { MergeReviewDiffResult } from '../../../../context';
import { isL5XFile, isImageFile, isPdfFile, is3DModelFile } from '../../../../lib/file-utils';
import TextDiffViewer from '../../../viewers/TextDiffViewer';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../ui';

const ImageDiffViewer = lazy(() => import('../../../viewers/ImageDiffViewer'));
const PDFDiffViewer = lazy(() => import('../../../viewers/PDFDiffViewer'));
const Model3DDiffViewer = lazy(() => import('../../../viewers/Model3DDiffViewer'));

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

  const isL5XDiff = useMemo(
    () => !!activeViewerPath && isL5XFile(activeViewerPath),
    [activeViewerPath],
  );

  const isImageDiff = useMemo(
    () => !!activeViewerPath && isImageFile(activeViewerPath),
    [activeViewerPath],
  );

  const isPdfDiff = useMemo(
    () => !!activeViewerPath && isPdfFile(activeViewerPath),
    [activeViewerPath],
  );

  const is3DModelDiff = useMemo(
    () => !!activeViewerPath && is3DModelFile(activeViewerPath),
    [activeViewerPath],
  );

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
          ) : isImageDiff && repoPath ? (
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-theme-secondary text-sm gap-2">
                  <Loader2 style={iconSm} className="animate-spin" />
                  Loading image diff viewer…
                </div>
              }
            >
              <ImageDiffViewer
                repoPath={repoPath}
                filePath={activeViewerPath}
                isWorkingTree
              />
            </Suspense>
          ) : isPdfDiff && repoPath ? (
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-theme-secondary text-sm gap-2">
                  <Loader2 style={iconSm} className="animate-spin" />
                  Loading PDF diff viewer…
                </div>
              }
            >
              <PDFDiffViewer
                repoPath={repoPath}
                filePath={activeViewerPath}
                isWorkingTree
              />
            </Suspense>
          ) : is3DModelDiff && repoPath ? (
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-theme-secondary text-sm gap-2">
                  <Loader2 style={iconSm} className="animate-spin" />
                  Loading 3D diff viewer…
                </div>
              }
            >
              <Model3DDiffViewer
                repoPath={repoPath}
                filePath={activeViewerPath}
                isWorkingTree
              />
            </Suspense>
          ) : reviewDiff.binary && !isImageDiff && !isPdfDiff && !is3DModelDiff ? (
            <div className="h-64 flex items-center justify-center text-theme-muted text-sm">
              Cannot preview this binary file
            </div>
          ) : isL5XDiff ? (
            <div className="h-full overflow-auto">
              <TextDiffViewer
                repoPath={repoPath || ''}
                filePath={activeViewerPath}
                fileDiff={reviewDiff as any}
                fileStatus={reviewDiff.status}
                oldPath={reviewDiff.oldPath}
                isWorkingTree
                showHeader
              />
            </div>
          ) : (
            <div className="h-full overflow-auto">
              <TextDiffViewer
                repoPath={repoPath || ''}
                filePath={activeViewerPath}
                fileDiff={reviewDiff as any}
                fileStatus={reviewDiff.status}
                oldPath={reviewDiff.oldPath}
                isWorkingTree
                showHeader
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