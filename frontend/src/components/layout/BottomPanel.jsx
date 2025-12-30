import { memo, useMemo, useCallback, useRef } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import { BOTTOM_PANELS, ICON_SIZES } from '../../constants';
import { useLayout } from '../../context';
import { CommitPanel, TerminalPanel } from './bottom-panels';

const iconStyle = { fontSize: ICON_SIZES.sm };

const PANEL_CONFIG = {
  [BOTTOM_PANELS.COMMIT]: { title: 'Commit', Component: CommitPanel },
  [BOTTOM_PANELS.TERMINAL]: { title: 'Terminal', Component: TerminalPanel },
};

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 400;

function BottomPanel() {
  const { bottomPanelCollapsed, setBottomPanelCollapsed, activeBottomPanel, bottomPanelHeight, setBottomPanelHeight } = useLayout();
  const isResizing = useRef(false);
  const containerRef = useRef(null);

  const { title, Component } = useMemo(
    () => PANEL_CONFIG[activeBottomPanel] || PANEL_CONFIG[BOTTOM_PANELS.COMMIT],
    [activeBottomPanel]
  );

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e) => {
      if (!isResizing.current || !containerRef.current) return;
      const parentRect = containerRef.current.parentElement.getBoundingClientRect();
      const newHeight = parentRect.bottom - e.clientY;
      setBottomPanelHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, newHeight)));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [setBottomPanelHeight]);

  if (bottomPanelCollapsed) {
    return null;
  }

  return (
    <section 
      ref={containerRef}
      className="bg-gray-900 border-t border-gray-700 flex flex-col shrink-0 relative"
      style={{ height: bottomPanelHeight }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 left-0 w-full h-1 cursor-row-resize hover:bg-blue-500/50 transition-colors z-10"
      />
      <header className="h-7 px-2 flex items-center justify-between border-b border-gray-800 shrink-0">
        <span className="text-gray-400 text-xs font-medium uppercase tracking-wide">
          {title}
        </span>
        <button
          onClick={() => setBottomPanelCollapsed(true)}
          title="Close panel"
          className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <CloseIcon sx={iconStyle} />
        </button>
      </header>
      
      <div className="flex-1 overflow-hidden">
        <Component />
      </div>
    </section>
  );
}

export default memo(BottomPanel);
