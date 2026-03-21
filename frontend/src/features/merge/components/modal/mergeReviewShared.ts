import type { MergeReviewDiffResult, MergeReviewFile } from '../../../../context';
import { buildMergeReviewDiffRequest } from '../../../../viewers/registry/diff-request-adapters';
import type { DiffRenderRequest } from '../../../../viewers/registry/diff-registry';

export function formatMergeReviewFileLabel(file: Pick<MergeReviewFile, 'path' | 'oldPath'>): string {
  if (file.oldPath && file.oldPath !== file.path) {
    return `${file.oldPath} → ${file.path}`;
  }

  return file.path;
}

export function getMergeReviewSelectedFilePath(
  reviewFilePath: string | null,
  reviewDiff: MergeReviewDiffResult | null,
): string {
  return reviewDiff?.path || reviewFilePath || '';
}

export function buildMergeReviewDiffRenderRequest({
  repoPath,
  reviewFilePath,
  reviewDiff,
}: {
  repoPath?: string | null;
  reviewFilePath: string | null;
  reviewDiff: MergeReviewDiffResult | null;
}): DiffRenderRequest | null {
  if (!reviewDiff) {
    return null;
  }

  const selectedFilePath = getMergeReviewSelectedFilePath(reviewFilePath, reviewDiff);
  const activeViewerPath = reviewDiff.status === 'deleted' && reviewDiff.oldPath
    ? reviewDiff.oldPath
    : selectedFilePath;

  if (!reviewDiff.targetRef || !reviewDiff.sourceRef) {
    return {
      repoPath: repoPath || null,
      filePath: activeViewerPath,
      fileStatus: reviewDiff.status,
      oldPath: reviewDiff.oldPath,
      fileDiff: reviewDiff,
      binary: reviewDiff.binary,
      showHeader: true,
    };
  }

  return buildMergeReviewDiffRequest({
    repoPath: repoPath || null,
    filePath: selectedFilePath,
    targetRef: reviewDiff.targetRef,
    sourceRef: reviewDiff.sourceRef,
    oldPath: reviewDiff.oldPath,
    fileStatus: reviewDiff.status,
    fileDiff: reviewDiff,
    binary: reviewDiff.binary,
    showHeader: true,
  });
}