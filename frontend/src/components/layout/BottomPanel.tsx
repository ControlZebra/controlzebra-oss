/**
 * BottomPanel - Resizable panel at the bottom of the main area.
 * Contains commit panel and terminal views.
 * Supports vertical resizing via drag handle.
 */
import { memo, useMemo, useCallback, useRef, type MouseEvent, type CSSProperties, type ComponentType } from 'react';
import { X } from 'lucide-react';
import { BOTTOM_PANELS, ICON_SIZES, type BottomPanelType } from '../../constants';
import { useLayout } from '../../context';
import { RepositoryPanel, TerminalPanel } from './bottom-panels';
import { Button } from '../ui';

// ============================================================================
// Types
// ============================================================================

interface PanelConfig {
  title: string;
  Component: ComponentType;
}

// ============================================================================
// Configuration
// ============================================================================

// Panel configuration mapping
const PANEL_CONFIG: Record<BottomPanelType, PanelConfig> = {
  [BOTTOM_PANELS.REPOSITORY]: { title: 'Repository', Component: RepositoryPanel },
  [BOTTOM_PANELS.TERMINAL]: { title: 'Terminal', Component: TerminalPanel },
};

// Resize constraints
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 400;

// ============================================================================
// Component
// ============================================================================

function BottomPanel(): JSX.Element {
  const { bottomPanelCollapsed, setBottomPanelCollapsed, activeBottomPanel, bottomPanelHeight, setBottomPanelHeight } = useLayout();
  const isResizing = useRef(false);
  const containerRef = useRef<HTMLElement>(null);

  // Get panel config based on active panel
  const { title, Component } = useMemo(
    () => PANEL_CONFIG[activeBottomPanel] || PANEL_CONFIG[BOTTOM_PANELS.REPOSITORY],
    [activeBottomPanel]
  );

  const iconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

  // Handle vertical resize via mouse drag
  const handleMouseDown = useCallback((e: MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: globalThis.MouseEvent): void => {
      if (!isResizing.current || !containerRef.current) return;
      const parentRect = containerRef.current.parentElement?.getBoundingClientRect();
      if (!parentRect) return;
      const newHeight = parentRect.bottom - e.clientY;
      setBottomPanelHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, newHeight)));
    };

    const handleMouseUp = (): void => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [setBottomPanelHeight]);

  return (
    <section 
      ref={containerRef}
      className="bg-theme-surface border-t border-theme-default flex flex-col shrink-0 relative"
      style={{ 
        height: bottomPanelHeight,
        display: bottomPanelCollapsed ? 'none' : 'flex'
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 left-0 w-full h-1 cursor-row-resize hover:bg-blue-500/50 transition-colors z-10"
      />
      
      {/* Panel header */}
      <header className="h-7 px-2 flex items-center justify-between border-b border-theme-default shrink-0">
        <span className="text-theme-muted text-xs font-medium uppercase tracking-wide">
          {title}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setBottomPanelCollapsed(true)}
          title="Close panel"
          className="h-5 w-5"
        >
          <X style={iconStyle} />
        </Button>
      </header>
      
      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        <Component />
      </div>
    </section>
  );
}

export default memo(BottomPanel);
