/**
 * RungChangeCard — Displays old/new rung diagrams stacked vertically.
 *
 * For 'added' rungs:   only the new rung with a green-tinted background.
 * For 'removed' rungs:  only the old rung with a red-tinted background.
 * For 'modified' rungs: old (red) stacked above new (green).
 *
 * Each side uses VirtualizedLadderDiagram with a single-rung array.
 */
import { memo, useMemo } from 'react';
import { Plus, Minus, ArrowRightLeft } from 'lucide-react';
import {
  VirtualizedLadderDiagram,
  type NormalizedRung,
  type RungDiff,
  type LadderDiagramTheme,
} from 'ladder-visualizer';
import { ICON_SIZES } from '../../../constants';

// ============================================================================
// Types
// ============================================================================

export interface RungChangeCardProps {
  /** The structured rung diff. */
  rungDiff: RungDiff;
  /** Theme for ladder rendering. */
  theme?: LadderDiagramTheme;
  /** Whether we're in dark mode (for CSS class). */
  isDarkMode?: boolean;
}

/** Height allocated for each rung panel (old or new). */
const RUNG_PANEL_HEIGHT = 140;

// ============================================================================
// Helpers
// ============================================================================

function ChangeKindBadge({ kind }: { kind: RungDiff['kind'] }): JSX.Element {
  const config = {
    added:    { icon: Plus,           label: 'Added',    color: 'text-theme-added', bg: 'bg-theme-added' },
    removed:  { icon: Minus,          label: 'Removed',  color: 'text-theme-removed',   bg: 'bg-theme-removed' },
    modified: { icon: ArrowRightLeft, label: 'Modified', color: 'text-theme-modified', bg: 'bg-theme-modified' },
  }[kind];

  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color} ${config.bg}`}>
      <Icon size={ICON_SIZES.xs} />
      {config.label}
    </span>
  );
}

interface RungPanelProps {
  rung: NormalizedRung;
  label: string;
  accentColor: string;     // Tailwind border color class
  /** Inline rgba background tint (avoids Tailwind opacity issues). */
  bgTint: string;
  theme?: LadderDiagramTheme;
  isDarkMode?: boolean;
}

/** Inline tint colors — explicit rgba avoids Tailwind theme() opacity bugs. */
const PANEL_TINTS = {
  added:   'rgba(34, 197, 94, 0.2)',   // green-500 at 6%
  removed: 'rgba(239, 68, 68, 0.2)',   // red-500 at 6%
} as const;

/** Renders a single rung inside a colored panel. */
const RungPanel = memo(function RungPanel({
  rung,
  label,
  accentColor,
  bgTint,
  theme,
  isDarkMode,
}: RungPanelProps): JSX.Element {
  const rungs = useMemo(() => [rung], [rung]);
  const wrapperClass = isDarkMode ? 'ladder-visualizer-dark' : '';
  const diffTheme = useMemo<LadderDiagramTheme>(() => ({
    ...theme,
    bgPrimary: 'transparent',
    rowEvenBg: 'transparent',
    rowOddBg: 'transparent',
  }), [theme]);

  return (
    <div
      className={`relative rounded border ${accentColor}`}
      style={{ backgroundColor: bgTint }}
    >
      {/* Side label */}
      <div className="absolute top-1 left-2 z-10 text-[10px] font-semibold uppercase tracking-wider text-theme-muted">
        {label}
      </div>
      <div className={wrapperClass} style={{ height: RUNG_PANEL_HEIGHT }}>
        <VirtualizedLadderDiagram
          rungs={rungs}
          theme={diffTheme}
          height={RUNG_PANEL_HEIGHT}
          className="h-full"
        />
      </div>
    </div>
  );
});

// ============================================================================
// Component
// ============================================================================

function RungChangeCard({ rungDiff, theme, isDarkMode }: RungChangeCardProps): JSX.Element {
  const { kind, rungNumber, oldRung, newRung, propertyChanges } = rungDiff;

  return (
    <div className="border border-theme-default rounded-lg overflow-hidden bg-theme-surface">
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-2 bg-theme-elevated border-b border-theme-default">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-theme-secondary">Rung #{rungNumber}</span>
          <ChangeKindBadge kind={kind} />
        </div>
        {propertyChanges && propertyChanges.length > 0 && (
          <span className="text-[10px] text-theme-muted">
            {propertyChanges.length} propert{propertyChanges.length === 1 ? 'y' : 'ies'} changed
          </span>
        )}
      </div>

      {/* Rung comment changes */}
      {propertyChanges?.some(pc => pc.property === 'comment') && (
        <div className="px-3 py-1.5 text-xs border-b border-theme-muted/20 bg-theme-surface/50">
          {propertyChanges.filter(pc => pc.property === 'comment').map((pc, i) => (
            <div key={i} className="space-y-0.5">
              {pc.oldValue !== undefined && pc.oldValue !== null && (
                <div className="text-theme-removed-muted line-through">
                  {String(pc.oldValue)}
                </div>
              )}
              {pc.newValue !== undefined && pc.newValue !== null && (
                <div className="text-theme-added-muted">
                  {String(pc.newValue)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Rung diagrams */}
      <div className="p-2 space-y-2">
        {/* Old rung (shown for removed + modified) */}
        {(kind === 'removed' || kind === 'modified') && oldRung && (
          <RungPanel
            rung={oldRung}
            label="Old"
            accentColor="border-theme-removed"
            bgTint={PANEL_TINTS.removed}
            theme={theme}
            isDarkMode={isDarkMode}
          />
        )}

        {/* New rung (shown for added + modified) */}
        {(kind === 'added' || kind === 'modified') && newRung && (
          <RungPanel
            rung={newRung}
            label="New"
            accentColor="border-theme-added"
            bgTint={PANEL_TINTS.added}
            theme={theme}
            isDarkMode={isDarkMode}
          />
        )}
      </div>
    </div>
  );
}

export default memo(RungChangeCard);
