import { memo, useCallback, useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { ICON_STYLES } from '../../shared/utils/gitHelpers';
import {
  closeCurrentWindow,
  getCurrentWindowIsMaximised,
  minimiseCurrentWindow,
  onCurrentWindowStateChange,
  toggleCurrentWindowMaximise,
} from '../../shared/runtime/window';

export const windowDragStyle = { '--wails-draggable': 'drag' } as CSSProperties;
export const windowControlProps = {
  style: { '--wails-draggable': 'no-drag' } as CSSProperties,
  'data-window-control': 'true',
} as const;

export function handleWindowTitleDoubleClick(event: MouseEvent<HTMLElement>): void {
  if (!(event.target as HTMLElement).closest('[data-window-control="true"]')) {
    void toggleCurrentWindowMaximise();
  }
}

function WindowControls(): JSX.Element {
  const [maximised, setMaximised] = useState(false);
  useEffect(() => {
    let disposed = false;
    void getCurrentWindowIsMaximised()
      .then((value) => {
        if (!disposed) setMaximised(value);
      })
      .catch(() => {});
    const unsubscribe = onCurrentWindowStateChange((value) => {
      if (!disposed) setMaximised(value);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const minimise = useCallback(() => {
    void minimiseCurrentWindow();
  }, []);
  const maximise = useCallback(() => {
    void toggleCurrentWindowMaximise();
  }, []);
  const close = useCallback(() => {
    void closeCurrentWindow();
  }, []);
  const captionClass = 'h-full w-11 rounded-none';
  return (
    <div {...windowControlProps} className="flex h-full shrink-0" aria-label="Window controls">
      <Button
        variant="ghost"
        className={captionClass}
        onClick={minimise}
        aria-label="Minimize window"
        title="Minimize window"
      >
        <Minus style={ICON_STYLES.sm} />
      </Button>
      <Button
        variant="ghost"
        className={captionClass}
        onClick={maximise}
        aria-label={maximised ? 'Restore window' : 'Maximize window'}
        title={maximised ? 'Restore window' : 'Maximize window'}
      >
        {maximised ? <Copy style={ICON_STYLES.sm} /> : <Square style={ICON_STYLES.sm} />}
      </Button>
      <Button
        variant="ghost"
        className={`${captionClass} hover:bg-red-600 hover:text-white`}
        onClick={close}
        aria-label="Close window"
        title="Close window"
      >
        <X style={ICON_STYLES.sm} />
      </Button>
    </div>
  );
}

export default memo(WindowControls);
