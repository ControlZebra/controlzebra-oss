import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ExternalLink, Loader2, RefreshCw } from 'lucide-react';

import { ICON_SIZES } from '../../../shared/constants';
import { Button } from '../../../shared/ui';
import { openExternalUrl } from '../../../shared/runtime/browser';
import { EnsureChangeRequestFileContent } from '../../../domain/repo/services/repo-commands';
import { DiffRenderer } from '../../../viewers/components/shared/DiffRenderer';
import { buildChangeRequestDiffRequest } from '../../../viewers/registry/diff-request-adapters';
import type {
  ChangeRequestSnapshot,
  GitHubChangeRequestError,
  GitHubChangeRequestErrorCode,
  GitHubChangeRequestFile,
} from '../../../domain/repo/context/RepoContext.types';
import { changeRequestErrorCopy } from '../lib/change-request-presentation';

interface ChangeRequestPreviewProps {
  repoPath?: string | null;
  file: GitHubChangeRequestFile | null;
  snapshot: ChangeRequestSnapshot | null;
  isPreparingSnapshot: boolean;
  snapshotError: GitHubChangeRequestError | null;
  requestUrl?: string;
  onRetry: () => void;
}

type ContentCheck =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ready' }
  | { state: 'blocked'; code: GitHubChangeRequestErrorCode };

function PreviewMessage({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6 text-sm text-theme-muted">
      {children}
    </div>
  );
}

function PreviewProblem({
  code,
  requestUrl,
  onRetry,
}: {
  code: GitHubChangeRequestErrorCode;
  requestUrl?: string;
  onRetry: () => void;
}): JSX.Element {
  const copy = changeRequestErrorCopy(code);

  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6" data-testid="change-request-preview-problem">
      <section className="w-full max-w-xl border border-theme-default bg-theme-surface p-6">
        <div className="flex items-start gap-3">
          <AlertCircle size={ICON_SIZES.md} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            <h2 role="alert" className="text-base font-medium text-theme-primary">{copy.title}</h2>
            <p className="mt-2 text-sm leading-6 text-theme-muted">{copy.detail}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {requestUrl && (
            <Button variant="secondary" size="sm" onClick={() => void openExternalUrl(requestUrl)}>
              <ExternalLink size={ICON_SIZES.sm} />
              Open on GitHub
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onRetry}>
            <RefreshCw size={ICON_SIZES.sm} />
            Try again
          </Button>
        </div>
      </section>
    </div>
  );
}

function ChangeRequestPreview({
  repoPath,
  file,
  snapshot,
  isPreparingSnapshot,
  snapshotError,
  requestUrl,
  onRetry,
}: ChangeRequestPreviewProps): JSX.Element {
  const [contentCheck, setContentCheck] = useState<ContentCheck>({ state: 'idle' });
  const checkIdRef = useRef(0);

  const oldPath = file?.previousPath || file?.path || '';
  const newPath = file?.path || '';
  const baseRef = snapshot?.baseRef ?? '';
  const headRef = snapshot?.headRef ?? '';

  useEffect(() => {
    const checkId = checkIdRef.current + 1;
    checkIdRef.current = checkId;

    if (!repoPath || !newPath || !baseRef || !headRef) {
      setContentCheck({ state: 'idle' });
      return;
    }

    setContentCheck({ state: 'checking' });

    void (async () => {
      try {
        const result = await EnsureChangeRequestFileContent(repoPath, baseRef, oldPath, headRef, newPath);
        if (checkIdRef.current !== checkId) return;
        setContentCheck(result.comparable
          ? { state: 'ready' }
          : { state: 'blocked', code: result.errorCode as GitHubChangeRequestErrorCode });
      } catch {
        if (checkIdRef.current !== checkId) return;
        setContentCheck({ state: 'blocked', code: 'snapshot_unavailable' });
      }
    })();
  }, [baseRef, headRef, newPath, oldPath, repoPath]);

  const diffRequest = useMemo(() => {
    if (!file || !baseRef || !headRef) return null;
    return buildChangeRequestDiffRequest({
      repoPath,
      filePath: file.path,
      baseRef,
      headRef,
      oldPath: file.previousPath || undefined,
      fileStatus: file.status,
      showHeader: false,
    });
  }, [baseRef, file, headRef, repoPath]);

  if (!file) {
    return <PreviewMessage>Select a changed file to see what is different.</PreviewMessage>;
  }

  if (snapshotError) {
    return <PreviewProblem code={snapshotError.code} requestUrl={requestUrl} onRetry={onRetry} />;
  }

  if (isPreparingSnapshot || !snapshot) {
    return (
      <PreviewMessage>
        <span className="inline-flex items-center gap-2" data-testid="change-request-preview-preparing">
          <Loader2 size={ICON_SIZES.sm} className="animate-spin" />
          Downloading the changed files
        </span>
      </PreviewMessage>
    );
  }

  if (contentCheck.state === 'blocked') {
    return <PreviewProblem code={contentCheck.code} requestUrl={requestUrl} onRetry={onRetry} />;
  }

  if (contentCheck.state !== 'ready' || !diffRequest) {
    return (
      <PreviewMessage>
        <span className="inline-flex items-center gap-2">
          <Loader2 size={ICON_SIZES.sm} className="animate-spin" />
          Preparing this file
        </span>
      </PreviewMessage>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto" data-testid="change-request-preview-diff">
      <DiffRenderer {...diffRequest} loadingLabel="Loading diff viewer…" />
    </div>
  );
}

export default memo(ChangeRequestPreview);
