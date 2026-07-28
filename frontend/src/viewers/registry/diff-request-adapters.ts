import type { DiffRenderRequest, DiffSide } from './diff-registry';

interface BaseDiffRequestInput {
  repoPath?: string | null;
  filePath: string;
  oldPath?: string;
  fileStatus?: string;
  fileDiff?: unknown;
  binary?: boolean;
  showHeader?: boolean;
}

interface WorkingTreeDiffRequestInput extends BaseDiffRequestInput {
  absoluteFilePath: string;
}

interface CommitDiffRequestInput extends BaseDiffRequestInput {
  commitHash: string;
  parentHash?: string | null;
}

interface MergeReviewDiffRequestInput extends BaseDiffRequestInput {
  targetRef: string;
  sourceRef: string;
}

interface ChangeRequestDiffRequestInput extends BaseDiffRequestInput {
  baseRef: string;
  headRef: string;
}

type DiffStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | string | undefined;

interface BuiltDiffSides {
  viewerFilePath: string;
  normalizedStatus?: string;
  oldSide: DiffSide;
  newSide: DiffSide;
}

function normalizeDiffStatus(status?: string): DiffStatus {
  if (!status) {
    return status;
  }

  const normalizedStatus = status.toLowerCase();
  if (normalizedStatus === 'untracked') {
    return 'added';
  }
  // GitHub reports deletions as "removed".
  if (normalizedStatus === 'removed') {
    return 'deleted';
  }

  return normalizedStatus;
}

function buildDiffSides(
  filePath: string,
  oldPath: string | undefined,
  fileStatus: string | undefined,
  buildOldPresentSide: (path: string) => DiffSide,
  buildNewPresentSide: (path: string) => DiffSide,
): BuiltDiffSides {
  const normalizedStatus = normalizeDiffStatus(fileStatus);
  const previousPath = oldPath ?? filePath;
  const viewerFilePath = normalizedStatus === 'deleted' ? previousPath : filePath;

  switch (normalizedStatus) {
    case 'added':
      return {
        viewerFilePath,
        normalizedStatus,
        oldSide: { kind: 'missing', path: previousPath },
        newSide: buildNewPresentSide(filePath),
      };

    case 'deleted':
      return {
        viewerFilePath,
        normalizedStatus,
        oldSide: buildOldPresentSide(previousPath),
        newSide: { kind: 'missing', path: filePath },
      };

    case 'renamed':
    case 'copied':
    case 'modified':
    default:
      return {
        viewerFilePath,
        normalizedStatus,
        oldSide: buildOldPresentSide(previousPath),
        newSide: buildNewPresentSide(filePath),
      };
  }
}

export function buildWorkingTreeDiffRequest({
  repoPath,
  filePath,
  absoluteFilePath,
  oldPath,
  fileStatus,
  fileDiff,
  binary,
  showHeader,
}: WorkingTreeDiffRequestInput): DiffRenderRequest {
  const { viewerFilePath, normalizedStatus, oldSide, newSide } = buildDiffSides(
    filePath,
    oldPath,
    fileStatus,
    (path) => ({ kind: 'ref', ref: 'HEAD', path }),
    (path) => ({ kind: 'working', absolutePath: absoluteFilePath, path }),
  );

  return {
    repoPath,
    filePath: viewerFilePath,
    oldSide,
    newSide,
    oldPath,
    fileStatus: normalizedStatus,
    fileDiff,
    binary,
    showHeader,
  };
}

export function buildCommitDiffRequest({
  repoPath,
  filePath,
  commitHash,
  parentHash,
  oldPath,
  fileStatus,
  fileDiff,
  binary,
  showHeader,
}: CommitDiffRequestInput): DiffRenderRequest {
  const previousRevision = parentHash ?? `${commitHash}^`;
  const { viewerFilePath, normalizedStatus, oldSide, newSide } = buildDiffSides(
    filePath,
    oldPath,
    fileStatus,
    (path) => ({ kind: 'ref', ref: previousRevision, path }),
    (path) => ({ kind: 'ref', ref: commitHash, path }),
  );

  return {
    repoPath,
    filePath: viewerFilePath,
    oldSide,
    newSide,
    oldPath,
    fileStatus: normalizedStatus,
    fileDiff,
    binary,
    showHeader,
  };
}

export function buildMergeReviewDiffRequest({
  repoPath,
  filePath,
  targetRef,
  sourceRef,
  oldPath,
  fileStatus,
  fileDiff,
  binary,
  showHeader,
}: MergeReviewDiffRequestInput): DiffRenderRequest {
  const { viewerFilePath, normalizedStatus, oldSide, newSide } = buildDiffSides(
    filePath,
    oldPath,
    fileStatus,
    (path) => ({ kind: 'ref', ref: targetRef, path }),
    (path) => ({ kind: 'ref', ref: sourceRef, path }),
  );

  return {
    repoPath,
    filePath: viewerFilePath,
    oldSide,
    newSide,
    oldPath,
    fileStatus: normalizedStatus,
    fileDiff,
    binary,
    showHeader,
  };
}

/**
 * Change Request diffs compare two private snapshot refs prepared by
 * `EnsureChangeRequestSnapshotsLocal`. `baseRef` points at the merge base rather
 * than the target branch tip, so this two-dot comparison matches the file list
 * GitHub itself reports for the request.
 */
export function buildChangeRequestDiffRequest({
  repoPath,
  filePath,
  baseRef,
  headRef,
  oldPath,
  fileStatus,
  fileDiff,
  binary,
  showHeader,
}: ChangeRequestDiffRequestInput): DiffRenderRequest {
  const { viewerFilePath, normalizedStatus, oldSide, newSide } = buildDiffSides(
    filePath,
    oldPath,
    fileStatus,
    (path) => ({ kind: 'ref', ref: baseRef, path }),
    (path) => ({ kind: 'ref', ref: headRef, path }),
  );

  return {
    repoPath,
    filePath: viewerFilePath,
    oldSide,
    newSide,
    oldPath,
    fileStatus: normalizedStatus,
    fileDiff,
    binary,
    showHeader,
  };
}
