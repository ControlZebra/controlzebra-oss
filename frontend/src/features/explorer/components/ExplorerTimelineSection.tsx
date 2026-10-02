import { memo, useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../../../shared/ui/button';
import { useLayout } from '../../../context';
import { TIMELINE_HEIGHT } from '../../../shared/constants';
import { ICON_STYLES } from '../../../shared/utils/gitHelpers';
import HistoryTimeline from '../../history/components/HistoryTimeline';

interface Props {
  selectedHash: string | null;
  onSelectCommit: (hash: string | null) => void;
}

function ExplorerTimelineSection({ selectedHash, onSelectCommit }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const { timelineHeight: height, setTimelineHeight } = useLayout();
  const section = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const clamp = useCallback((next: number) => {
    const available = section.current?.parentElement?.clientHeight || 800;
    return Math.max(TIMELINE_HEIGHT.MIN, Math.min(next, TIMELINE_HEIGHT.MAX, available * 0.4));
  }, []);
  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      drag.current = { y: event.clientY, height: section.current?.clientHeight || height };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [height]
  );
  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (drag.current)
        setTimelineHeight(clamp(drag.current.height + drag.current.y - event.clientY), false);
    },
    [clamp, setTimelineHeight]
  );
  const endDrag = useCallback(() => {
    if (drag.current) {
      drag.current = null;
      setTimelineHeight(height);
    }
  }, [height, setTimelineHeight]);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        setTimelineHeight(clamp(height + (event.key === 'ArrowUp' ? 16 : -16)));
      }
    },
    [clamp, height, setTimelineHeight]
  );
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  return (
    <section
      ref={section}
      className="relative flex shrink-0 flex-col overflow-hidden border-t border-shell-divider bg-theme-surface"
      aria-label="Timeline"
      style={{ height: expanded ? height : 32, maxHeight: expanded ? '40%' : undefined }}
    >
      {expanded && (
        <div
          role="separator"
          aria-label="Resize Timeline"
          aria-orientation="horizontal"
          aria-valuemin={TIMELINE_HEIGHT.MIN}
          aria-valuemax={TIMELINE_HEIGHT.MAX}
          aria-valuenow={height}
          tabIndex={0}
          className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-row-resize touch-none hover:bg-theme-hover focus-visible:bg-theme-hover focus-visible:outline-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={handleKeyDown}
        />
      )}
      <header className="shrink-0">
        <Button
          variant="ghost"
          onClick={toggle}
          aria-expanded={expanded}
          className="h-8 w-full justify-start px-3 text-xs"
        >
          {expanded ? (
            <ChevronDown style={ICON_STYLES.xs} />
          ) : (
            <ChevronRight style={ICON_STYLES.xs} />
          )}
          <h3 className="font-sans font-medium">Timeline</h3>
        </Button>
      </header>
      {/* Keep the existing history component and its selection/view behavior. */}
      <div hidden={!expanded} className="min-h-0 flex-1">
        <HistoryTimeline selectedHash={selectedHash} onSelectCommit={onSelectCommit} />
      </div>
    </section>
  );
}

export default memo(ExplorerTimelineSection);
