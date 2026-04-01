import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useRepo } from '../../context';
import { ICON_SIZES } from '../../shared/constants';
import {
  closeCurrentWindow,
  getCurrentWindowIsMaximised,
  isMacDesktop,
  isWindowsDesktop,
  minimiseCurrentWindow,
  onCurrentWindowStateChange,
  toggleCurrentWindowMaximise,
} from '../../shared/runtime/window';

const iconSmStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const dragRegionStyle = { '--wails-draggable': 'drag' } as CSSProperties;
const noDragRegionStyle = { '--wails-draggable': 'no-drag' } as CSSProperties;
const macTitleBarHeight = 40;
const windowsTitleBarHeight = 32;
const macTrafficLightInset = 76;
const captionButtonClassName = 'flex h-full w-9 items-center justify-center border border-transparent text-theme-muted transition-colors duration-75 hover:bg-theme-hover hover:text-theme-primary';
const noDragControlProps = {
  style: noDragRegionStyle,
  'data-window-control': 'true',
} as const;

function getRepoDisplayName(repoPath: string | null | undefined): string {
  if (!repoPath) {
    return '';
  }

  const normalizedPath = repoPath.replace(/[\\/]+$/, '');
  if (!normalizedPath) {
    return '';
  }

  const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

function TitleBar(): JSX.Element {
  const { repoPath, repoInfo } = useRepo();
  const isWindows = isWindowsDesktop();
  const isMac = isMacDesktop();
  const [isWindowMaximised, setIsWindowMaximised] = useState(false);

  useEffect(() => {
    if (!isWindows) {
      setIsWindowMaximised(false);
      return undefined;
    }

    let disposed = false;

    void getCurrentWindowIsMaximised()
      .then((value) => {
        if (!disposed) {
          setIsWindowMaximised(value);
        }
      })
      .catch(() => {
        if (!disposed) {
          setIsWindowMaximised(false);
        }
      });

    const unsubscribe = onCurrentWindowStateChange((value) => {
      if (!disposed) {
        setIsWindowMaximised(value);
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [isWindows]);

  const handleMinimiseWindow = useCallback((): void => {
    void minimiseCurrentWindow();
  }, []);

  const handleToggleMaximiseWindow = useCallback((): void => {
    void toggleCurrentWindowMaximise();
  }, []);

  const handleCloseWindow = useCallback((): void => {
    void closeCurrentWindow();
  }, []);

  const handleTitleBarDoubleClick = useCallback((event: React.MouseEvent<HTMLElement>): void => {
    if (!isWindows) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('[data-window-control="true"]')) {
      return;
    }

    void toggleCurrentWindowMaximise();
  }, [isWindows]);

  const repoName = useMemo(() => {
    if (!repoInfo?.isRepo) {
      return '';
    }
    return getRepoDisplayName(repoPath);
  }, [repoInfo?.isRepo, repoPath]);

  const barHeight = isWindows ? windowsTitleBarHeight : macTitleBarHeight;

  return (
    <header
      className="flex shrink-0 items-center gap-3 border-b border-theme-default bg-theme-elevated px-3 select-none"
      style={{ ...dragRegionStyle, height: barHeight }}
      onDoubleClick={handleTitleBarDoubleClick}
      data-testid="title-bar"
    >
      <div
        className="flex min-w-0 items-center gap-2 text-[13px]"
        style={isMac ? { paddingLeft: macTrafficLightInset } : undefined}
      >
        <span className="shrink-0 font-medium text-theme-primary">
          ControlZebra
        </span>
        {repoName ? (
          <span className="truncate font-medium text-theme-primary">({repoName})</span>
        ) : null}
      </div>

      <div className="flex-1" />

      {isWindows ? (
        <div
          className="-mr-3 flex h-full items-center overflow-hidden"
          style={noDragRegionStyle}
          aria-label="Window controls"
        >
          <button
            {...noDragControlProps}
            onClick={handleMinimiseWindow}
            title="Minimize window"
            aria-label="Minimize window"
            className={captionButtonClassName}
          >
            <Minus style={iconSmStyle} />
          </button>
          <button
            {...noDragControlProps}
            onClick={handleToggleMaximiseWindow}
            title={isWindowMaximised ? 'Restore window' : 'Maximize window'}
            aria-label={isWindowMaximised ? 'Restore window' : 'Maximize window'}
            className={captionButtonClassName}
          >
            {isWindowMaximised ? (
              <Copy style={iconSmStyle} />
            ) : (
              <Square style={iconSmStyle} />
            )}
          </button>
          <button
            {...noDragControlProps}
            onClick={handleCloseWindow}
            title="Close window"
            aria-label="Close window"
            className={`${captionButtonClassName} hover:border-red-500/30 hover:bg-red-600 hover:text-white`}
          >
            <X style={iconSmStyle} />
          </button>
        </div>
      ) : null}
    </header>
  );
}

export default memo(TitleBar);