import { memo, useCallback, useMemo } from 'react';
import { useRepo } from '../../context';
import { isMacDesktop, isWindowsDesktop } from '../../shared/runtime/window';
import WindowControls, { handleWindowTitleDoubleClick, windowDragStyle } from './WindowControls';

const macTitleBarHeight = 40;
const windowsTitleBarHeight = 32;
const macTrafficLightInset = 76;
const titleTextClassName = 'font-sans text-xs font-medium leading-none text-theme-primary';

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
  const handleTitleBarDoubleClick = useCallback((event: React.MouseEvent<HTMLElement>): void => {
    if (isWindows) handleWindowTitleDoubleClick(event);
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
      style={{ ...windowDragStyle, height: barHeight }}
      onDoubleClick={handleTitleBarDoubleClick}
      data-testid="title-bar"
    >
      <div
        className="flex min-w-0 items-center gap-2"
        style={isMac ? { paddingLeft: macTrafficLightInset } : undefined}
      >
        <span className={`shrink-0 ${titleTextClassName}`}>
          ControlZebra
        </span>
        {repoName ? (
          <span className={`truncate ${titleTextClassName}`}>({repoName})</span>
        ) : null}
      </div>

      <div className="flex-1" />

      {isWindows ? <WindowControls /> : null}
    </header>
  );
}

export default memo(TitleBar);