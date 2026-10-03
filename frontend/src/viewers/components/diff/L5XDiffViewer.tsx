import { lazy, memo, useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ICON_SIZES } from '../../../shared/constants';
import LoadingState from '../../../shared/ui/LoadingState';
import { Button } from '../../../shared/ui/button';
import { onEvent } from '../../../shared/runtime/events';
import type { DiffRenderRequest } from '../../registry/diff-registry';
import L5XModeViewer from '../shared/L5XModeViewer';
import TextDiffViewer, { type TextDiffViewerProps } from './TextDiffViewer';
import { loadTextSide, serializeDiffSide } from './diff-side-loaders';

const L5XLayoutDiffViewer = lazy(() => import('./l5x-layout-diff/L5XLayoutDiffViewer'));

/** Check the same text-read limits as Pretty before asking Git for a patch. */
const RawL5XDiff = memo(function RawL5XDiff({ request, reloadToken }: {
  request: DiffRenderRequest;
  reloadToken: number;
}): JSX.Element {
  const { repoPath, oldSide, newSide } = request;
  const [state, setState] = useState<{ ready: boolean; error?: string }>({ ready: false });

  useEffect(() => {
    let cancelled = false;
    setState({ ready: false });
    void (async () => {
      try {
        for (const side of [oldSide, newSide]) {
          if (side) await loadTextSide(repoPath ?? '', side);
          if (cancelled) return;
        }
        setState({ ready: true });
      } catch (error) {
        if (cancelled) return;
        const tooLarge = error instanceof Error && error.message.includes('max 10MB');
        setState({ ready: false, error: tooLarge
          ? 'This file exceeds the 10 MB text viewer limit. Open it in the default app to inspect it.'
          : 'Cannot load the text comparison. Reload to try again.' });
      }
    })();
    return () => { cancelled = true; };
  }, [repoPath, oldSide, newSide, reloadToken]);

  if (state.error) return <div className="p-4 text-sm text-theme-secondary" role="status">{state.error}</div>;
  if (!state.ready) return <LoadingState message="Loading text comparison…" />;

  return <TextDiffViewer {...request} fileDiff={request.fileDiff as TextDiffViewerProps['fileDiff']} repoPath={repoPath ?? ''} showHeader={false} reloadToken={oldSide?.kind === 'working' || newSide?.kind === 'working' ? reloadToken + 1 : reloadToken} />;
});

function L5XDiffSession(request: DiffRenderRequest): JSX.Element {
  const { repoPath, filePath, oldSide, newSide } = request;
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken(value => value + 1), []);

  useEffect(() => onEvent('files-changed', (event: {
    data?: { path?: string; eventType?: string; isDir?: boolean };
  }) => {
    const changed = event.data;
    if (changed?.isDir || !changed?.path || !['write', 'rename', 'remove'].includes(changed.eventType ?? '')) return;
    const path = changed.path.replace(/\\/g, '/').toLowerCase();
    if ([oldSide, newSide].some(side => side?.kind === 'working' && side.absolutePath.replace(/\\/g, '/').toLowerCase() === path)) reload();
  }), [oldSide, newSide, reload]);

  const absolutePath = newSide?.kind === 'working' ? newSide.absolutePath
    : oldSide?.kind === 'working' ? oldSide.absolutePath
    : /^(?:[a-z]:[\\/]|[\\/])/i.test(filePath) ? filePath
    : `${repoPath?.replace(/[\\/]+$/, '') ?? ''}/${filePath}`;

  return (
    <L5XModeViewer
      filePath={absolutePath}
      actions={<Button variant="ghost" size="sm" aria-label="Reload diff" onClick={reload}><RefreshCw size={ICON_SIZES.sm} /></Button>}
      pretty={(onShowRaw) => oldSide && newSide ? (
        <L5XLayoutDiffViewer
          repoPath={repoPath ?? ''} filePath={filePath} oldSide={oldSide} newSide={newSide}
          fileStatus={request.fileStatus ?? 'modified'} reloadToken={reloadToken} onShowRaw={onShowRaw}
        />
      ) : <TextDiffViewer {...request} fileDiff={request.fileDiff as TextDiffViewerProps['fileDiff']} repoPath={repoPath ?? ''} showHeader={false} reloadToken={reloadToken} />}
      raw={<RawL5XDiff key={reloadToken} request={request} reloadToken={reloadToken} />}
    />
  );
}

function L5XDiffViewer(request: DiffRenderRequest): JSX.Element {
  const identity = `${request.repoPath}|${request.filePath}|${serializeDiffSide(request.oldSide)}|${serializeDiffSide(request.newSide)}`;
  return <L5XDiffSession key={identity} {...request} />;
}

export default memo(L5XDiffViewer);
