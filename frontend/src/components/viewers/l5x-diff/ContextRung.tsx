/**
 * ContextRung — Dimmed unchanged rung shown for context around changes.
 *
 * Renders a single rung using VirtualizedLadderDiagram at reduced opacity
 * so it's visually distinct from changed rungs. Provides spatial context
 * for understanding nearby changes.
 */
import { memo, useMemo } from 'react';
import {
  VirtualizedLadderDiagram,
  type NormalizedRung,
  type LadderDiagramTheme,
} from 'ladder-visualizer';

// ============================================================================
// Types
// ============================================================================

export interface ContextRungProps {
  /** The rung data to render. */
  rung: NormalizedRung;
  /** Display rung number (0-indexed). */
  rungNumber: number;
  /** Theme for ladder rendering. */
  theme?: LadderDiagramTheme;
  /** Whether we're in dark mode (for CSS class). */
  isDarkMode?: boolean;
}

/** Height allocated per context rung. */
const CONTEXT_RUNG_HEIGHT = 120;

// ============================================================================
// Component
// ============================================================================

function ContextRung({ rung, rungNumber, theme, isDarkMode }: ContextRungProps): JSX.Element {
  const rungs = useMemo(() => [rung], [rung]);
  const wrapperClass = isDarkMode ? 'ladder-visualizer-dark' : '';

  return (
    <div
      className="relative border-y border-theme-muted/10"
      style={{ opacity: 0.45 }}
      title={`Rung ${rungNumber} (unchanged)`}
    >
      {/* Rung number badge */}
      <div className="absolute top-1 left-1 z-10 text-[10px] font-mono text-theme-muted/70 bg-theme-surface/80 px-1 rounded">
        #{rungNumber}
      </div>
      <div className={wrapperClass} style={{ height: CONTEXT_RUNG_HEIGHT }}>
        <VirtualizedLadderDiagram
          rungs={rungs}
          theme={theme}
          height={CONTEXT_RUNG_HEIGHT}
          className="h-full"
        />
      </div>
    </div>
  );
}

export default memo(ContextRung);
