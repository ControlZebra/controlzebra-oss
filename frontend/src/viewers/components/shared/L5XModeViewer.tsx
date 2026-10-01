import { memo, Suspense, useCallback, useState, type ReactNode } from 'react';
import { Cpu } from 'lucide-react';
import LoadingState from '../../../shared/ui/LoadingState';
import { Button } from '../../../shared/ui/button';
import { ViewerHeader } from './ViewerHeader';
import ViewerErrorBoundary from './ViewerErrorBoundary';

interface L5XModeViewerProps {
  filePath: string;
  pretty: ReactNode;
  raw: ReactNode;
  actions?: ReactNode;
}

/** Owns presentation selection; the individual viewers only render their content. */
function L5XModeViewer({ filePath, pretty, raw, actions }: L5XModeViewerProps): JSX.Element {
  const [mode, setMode] = useState<'pretty' | 'raw'>('pretty');
  const selectPretty = useCallback(() => setMode('pretty'), []);
  const selectRaw = useCallback(() => setMode('raw'), []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ViewerHeader filePath={filePath} icon={Cpu} extraContent={(
        <>
          {actions}
          <div role="group" aria-label="File display mode" className="flex shrink-0 gap-1">
            <Button size="sm" variant={mode === 'pretty' ? 'secondary' : 'ghost'} aria-pressed={mode === 'pretty'} onClick={selectPretty}>Pretty</Button>
            <Button size="sm" variant={mode === 'raw' ? 'secondary' : 'ghost'} aria-pressed={mode === 'raw'} onClick={selectRaw}>Raw</Button>
          </div>
        </>
      )} />
      {/* Keep structured navigation and sheet selections while inspecting source. */}
      <div className="min-h-0 flex-1 overflow-hidden" hidden={mode !== 'pretty'}>
        <ViewerErrorBoundary filePath={filePath}>
          <Suspense fallback={<LoadingState message="Loading viewer…" />}>{pretty}</Suspense>
        </ViewerErrorBoundary>
      </div>
      {mode === 'raw' && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ViewerErrorBoundary filePath={filePath}>{raw}</ViewerErrorBoundary>
        </div>
      )}
    </div>
  );
}

export default memo(L5XModeViewer);
