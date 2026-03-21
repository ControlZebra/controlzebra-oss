import { memo } from 'react';

import type { MergeReviewDiffResult } from '../../../context';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../shared/ui';
import MergeReviewPreview from './modal/MergeReviewPreview';
import { formatMergeReviewFileLabel } from './modal/mergeReviewShared';

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
  const displayPath = reviewDiff
    ? formatMergeReviewFileLabel(reviewDiff)
    : reviewFilePath || '';

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
          <MergeReviewPreview
            repoPath={repoPath}
            reviewFilePath={reviewFilePath}
            reviewDiff={reviewDiff}
            isLoadingReviewDiff={isLoadingReviewDiff}
            emptyLabel="No file selected"
            errorLabelPrefix="Unable to load diff for"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default memo(MergeReviewDiffModal);