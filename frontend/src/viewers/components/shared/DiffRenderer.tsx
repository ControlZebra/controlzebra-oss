import { memo, Suspense, useMemo } from 'react';
import { Loader2 } from 'lucide-react';

import { ICON_SIZES } from '../../../constants';
import {
  resolveDiffViewer,
  type DiffRenderRequest,
  type DiffViewerConfig,
} from '../../registry/diff-registry';
import { ensureBuiltInDiffViewersRegistered } from '../../registry/diff-builtins';

interface DiffRendererProps extends DiffRenderRequest {
  loadingLabel?: string;
}

interface DiffLoadingFallbackProps {
  viewer?: DiffViewerConfig;
  loadingLabel?: string;
}

function DiffLoadingFallback({ viewer, loadingLabel }: DiffLoadingFallbackProps): JSX.Element {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-theme-secondary">
      <Loader2 size={ICON_SIZES.md} className="animate-spin" />
      <span className="text-sm">{loadingLabel ?? `Loading ${viewer?.name?.toLowerCase() ?? 'diff viewer'}…`}</span>
    </div>
  );
}

function MissingViewerFallback(): JSX.Element {
  return (
    <div className="h-64 flex items-center justify-center text-theme-muted text-sm">
      Unable to resolve diff renderer for this file
    </div>
  );
}

function DiffRendererInner(props: DiffRendererProps): JSX.Element {
  ensureBuiltInDiffViewersRegistered();

  const viewer = useMemo(() => resolveDiffViewer(props), [props]);

  if (!viewer) {
    return <MissingViewerFallback />;
  }

  const ViewerComponent = viewer.component;

  return (
    <Suspense fallback={<DiffLoadingFallback viewer={viewer} loadingLabel={props.loadingLabel} />}>
      <ViewerComponent {...props} />
    </Suspense>
  );
}

export const DiffRenderer = memo(DiffRendererInner);
