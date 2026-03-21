import { memo, useMemo, type CSSProperties } from 'react';
import { Loader2 } from 'lucide-react';

import { ICON_SIZES } from '../../../../shared/constants';
import type { MergeReviewDiffResult } from '../../../../context';
import { DiffRenderer } from '../../../../viewers/components/shared/DiffRenderer';
import {
  buildMergeReviewDiffRenderRequest,
  getMergeReviewSelectedFilePath,
} from './mergeReviewShared';

const iconSm: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

interface MergeReviewPreviewProps {
  repoPath?: string | null;
  reviewFilePath: string | null;
  reviewDiff: MergeReviewDiffResult | null;
  isLoadingReviewDiff: boolean;
  emptyLabel?: string;
  errorLabelPrefix?: string;
}

function MergeReviewPreview({
  repoPath,
  reviewFilePath,
  reviewDiff,
  isLoadingReviewDiff,
  emptyLabel = 'Select a file to review.',
  errorLabelPrefix = 'Unable to load a preview for',
}: MergeReviewPreviewProps): JSX.Element {
  const selectedFilePath = useMemo(
    () => getMergeReviewSelectedFilePath(reviewFilePath, reviewDiff),
    [reviewDiff, reviewFilePath],
  );

  const diffRequest = useMemo(
    () => buildMergeReviewDiffRenderRequest({ repoPath, reviewFilePath, reviewDiff }),
    [repoPath, reviewDiff, reviewFilePath],
  );

  if (isLoadingReviewDiff) {
    return (
      <div className="h-full min-h-72 flex items-center justify-center text-theme-muted text-sm gap-2">
        <Loader2 style={iconSm} className="animate-spin" />
        Loading preview...
      </div>
    );
  }

  if (!selectedFilePath) {
    return (
      <div className="h-full min-h-72 flex items-center justify-center text-theme-muted text-sm">
        {emptyLabel}
      </div>
    );
  }

  if (!reviewDiff || !diffRequest) {
    return (
      <div className="h-full min-h-72 flex items-center justify-center text-theme-muted text-sm">
        {errorLabelPrefix} {selectedFilePath}.
      </div>
    );
  }

  return (
    <div className="h-full min-h-72 overflow-auto">
      <DiffRenderer {...diffRequest} loadingLabel="Loading diff viewer…" />
    </div>
  );
}

export default memo(MergeReviewPreview);