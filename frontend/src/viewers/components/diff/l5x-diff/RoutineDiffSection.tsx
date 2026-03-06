/**
 * RoutineDiffSection — Container for a single routine's RLL rung changes.
 *
 * Implements the rung stream algorithm:
 * 1. Identify which rungs are changed (from rungDiffs).
 * 2. Include 1 context rung above and below each changed rung.
 * 3. Collapse all remaining unchanged rungs into CollapsedRange indicators.
 * 4. Render RungChangeCards for changes, ContextRungs for context, and
 *    CollapsedRanges for gaps — in rung-number order.
 *
 * For added/removed routines, shows a summary card instead.
 */
import { memo, useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, GitBranch } from 'lucide-react';
import type {
  RoutineDiff,
  RungDiff,
  NormalizedRung,
  LadderDiagramTheme,
} from 'ladder-visualizer';
import { ICON_SIZES } from '../../../../constants';

import RungChangeCard from './RungChangeCard';
import ContextRung from './ContextRung';
import CollapsedRange from './CollapsedRange';

// ============================================================================
// Types
// ============================================================================

export interface RoutineDiffSectionProps {
  /** The routine diff data. */
  routineDiff: RoutineDiff;
  /** Parent program name for display. */
  programName: string;
  /** Theme for ladder rendering. */
  theme?: LadderDiagramTheme;
  /** Whether we're in dark mode. */
  isDarkMode?: boolean;
  /** Whether section starts collapsed (default: false). */
  defaultCollapsed?: boolean;
}

/** Number of unchanged rungs to show around each change for context. */
const CONTEXT_SIZE = 1;

// ============================================================================
// Stream Item Types
// ============================================================================

type StreamItem =
  | { type: 'change'; rungDiff: RungDiff }
  | { type: 'context'; rung: NormalizedRung; rungNumber: number }
  | { type: 'collapsed'; startRung: number; endRung: number };

// ============================================================================
// Rung Stream Algorithm
// ============================================================================

/**
 * Build an ordered stream of items from rung diffs + full rung list.
 *
 * @param rungDiffs - Array of rung diffs (changed rungs only)
 * @param allRungs  - Complete rung list from the routine (new version preferred)
 * @returns Ordered stream items for rendering
 */
function buildRungStream(rungDiffs: RungDiff[], allRungs: NormalizedRung[]): StreamItem[] {
  const totalRungs = allRungs.length;
  if (totalRungs === 0 && rungDiffs.length === 0) return [];

  // Build a map of changed rung numbers for O(1) lookup
  const changedMap = new Map<number, RungDiff>();
  for (const rd of rungDiffs) {
    changedMap.set(rd.rungNumber, rd);
  }

  // Determine which rung numbers need context (within CONTEXT_SIZE of a change)
  const contextSet = new Set<number>();
  for (const rd of rungDiffs) {
    for (let offset = -CONTEXT_SIZE; offset <= CONTEXT_SIZE; offset++) {
      const idx = rd.rungNumber + offset;
      if (idx >= 0 && idx < totalRungs && !changedMap.has(idx)) {
        contextSet.add(idx);
      }
    }
  }

  // Walk through all rungs and classify each
  const items: StreamItem[] = [];
  let collapseStart: number | null = null;

  const flushCollapse = (beforeIndex: number) => {
    if (collapseStart !== null) {
      items.push({ type: 'collapsed', startRung: collapseStart, endRung: beforeIndex - 1 });
      collapseStart = null;
    }
  };

  for (let i = 0; i < totalRungs; i++) {
    if (changedMap.has(i)) {
      flushCollapse(i);
      items.push({ type: 'change', rungDiff: changedMap.get(i)! });
    } else if (contextSet.has(i)) {
      flushCollapse(i);
      items.push({ type: 'context', rung: allRungs[i], rungNumber: i });
    } else {
      // Unchanged, non-context rung → collapse
      if (collapseStart === null) {
        collapseStart = i;
      }
    }
  }
  // Flush any trailing collapsed range
  flushCollapse(totalRungs);

  // Handle added/removed rungs that are beyond the allRungs range
  // (e.g., rungs removed from the end — their rungNumber > allRungs.length)
  const maxAllRung = totalRungs - 1;
  const extraDiffs = rungDiffs
    .filter(rd => rd.rungNumber > maxAllRung)
    .sort((a, b) => a.rungNumber - b.rungNumber);
  for (const rd of extraDiffs) {
    items.push({ type: 'change', rungDiff: rd });
  }

  return items;
}

// ============================================================================
// Sub-components
// ============================================================================

/** Section header with routine name, change kind badge, and summary. */
const SectionHeader = memo(function SectionHeader({
  programName,
  routineName,
  kind,
  summary,
  isCollapsed,
  onToggle,
}: {
  programName: string;
  routineName: string;
  kind: RoutineDiff['kind'];
  summary?: RoutineDiff['summary'];
  isCollapsed: boolean;
  onToggle: () => void;
}): JSX.Element {
  const kindColors = {
    added: 'text-theme-added bg-theme-added',
    removed: 'text-theme-removed bg-theme-removed',
    modified: 'text-theme-modified bg-theme-modified',
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      className="
        w-full flex items-center gap-3 px-4 py-2.5
        bg-theme-elevated hover:bg-theme-muted/30
        border-b border-theme-default
        transition-colors cursor-pointer select-none sticky top-0 z-10
      "
    >
      {isCollapsed ? (
        <ChevronRight size={ICON_SIZES.sm} className="shrink-0 text-theme-secondary" />
      ) : (
        <ChevronDown size={ICON_SIZES.sm} className="shrink-0 text-theme-secondary" />
      )}

      <GitBranch size={ICON_SIZES.xs} className="shrink-0 text-theme-muted" />

      <span className="text-sm text-theme-primary font-medium truncate">
        {programName} / {routineName}
      </span>

      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${kindColors[kind]}`}>
        {kind}
      </span>

      {summary && (
        <span className="ml-auto text-xs text-theme-muted shrink-0">
          {summary.rungsAdded > 0 && <span className="text-theme-added">+{summary.rungsAdded}</span>}
          {summary.rungsRemoved > 0 && <span className="text-theme-removed ml-1">-{summary.rungsRemoved}</span>}
          {summary.rungsModified > 0 && <span className="text-theme-modified ml-1">~{summary.rungsModified}</span>}
        </span>
      )}
    </button>
  );
});

// ============================================================================
// Main Component
// ============================================================================

function RoutineDiffSection({
  routineDiff,
  programName,
  theme,
  isDarkMode,
  defaultCollapsed = false,
}: RoutineDiffSectionProps): JSX.Element {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [expandedRanges, setExpandedRanges] = useState<Set<string>>(new Set());

  const toggleSection = useCallback(() => setIsCollapsed(prev => !prev), []);

  const toggleRange = useCallback((key: string) => {
    setExpandedRanges(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Build stream items for RLL routines
  const streamItems = useMemo((): StreamItem[] => {
    if (routineDiff.kind === 'added' || routineDiff.kind === 'removed') {
      // For added/removed routines we don't show individual rung diffs
      return [];
    }

    if (!routineDiff.rungDiffs || routineDiff.rungDiffs.length === 0) {
      return [];
    }

    // Use the new routine's rungs as the "complete" list; fall back to old
    const allRungs =
      routineDiff.newRoutine?.rungs ??
      routineDiff.oldRoutine?.rungs ??
      [];

    return buildRungStream(routineDiff.rungDiffs, allRungs);
  }, [routineDiff]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="border border-theme-default rounded-lg overflow-hidden bg-theme-surface/50">
      <SectionHeader
        programName={programName}
        routineName={routineDiff.name}
        kind={routineDiff.kind}
        summary={routineDiff.summary}
        isCollapsed={isCollapsed}
        onToggle={toggleSection}
      />

      {!isCollapsed && (
        <div className="space-y-2 p-3">
          {/* Property-level changes (description, type, etc.) */}
          {routineDiff.propertyChanges && routineDiff.propertyChanges.length > 0 && (
            <div className="px-3 py-2 rounded bg-theme-elevated text-xs space-y-1">
              {routineDiff.propertyChanges.map((pc, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="font-medium text-theme-secondary">{pc.property}:</span>
                  {pc.oldValue !== undefined && (
                    <span className="text-theme-removed line-through">{String(pc.oldValue)}</span>
                  )}
                  {pc.newValue !== undefined && (
                    <span className="text-theme-added">{String(pc.newValue)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Added / Removed routine summary */}
          {routineDiff.kind === 'added' && (
            <div className="px-3 py-2 rounded bg-theme-added border border-theme-added text-sm text-theme-added">
              New routine added
              {routineDiff.newRoutine?.rungs && (
                <span className="ml-1 text-theme-muted">
                  ({routineDiff.newRoutine.rungs.length} rung{routineDiff.newRoutine.rungs.length !== 1 ? 's' : ''})
                </span>
              )}
            </div>
          )}
          {routineDiff.kind === 'removed' && (
            <div className="px-3 py-2 rounded bg-theme-removed border border-theme-removed text-sm text-theme-removed">
              Routine removed
              {routineDiff.oldRoutine?.rungs && (
                <span className="ml-1 text-theme-muted">
                  ({routineDiff.oldRoutine.rungs.length} rung{routineDiff.oldRoutine.rungs.length !== 1 ? 's' : ''})
                </span>
              )}
            </div>
          )}

          {/* Rung stream (modified routines) */}
          {streamItems.map((item) => {
            switch (item.type) {
              case 'change':
                return (
                  <RungChangeCard
                    key={`change-${item.rungDiff.rungNumber}`}
                    rungDiff={item.rungDiff}
                    theme={theme}
                    isDarkMode={isDarkMode}
                  />
                );

              case 'context':
                return (
                  <ContextRung
                    key={`ctx-${item.rungNumber}`}
                    rung={item.rung}
                    rungNumber={item.rungNumber}
                    theme={theme}
                    isDarkMode={isDarkMode}
                  />
                );

              case 'collapsed': {
                const rangeKey = `${item.startRung}-${item.endRung}`;
                const isExpanded = expandedRanges.has(rangeKey);

                return (
                  <div key={`collapsed-${rangeKey}`}>
                    <CollapsedRange
                      startRung={item.startRung}
                      endRung={item.endRung}
                      isExpanded={isExpanded}
                      onToggle={() => toggleRange(rangeKey)}
                    />
                    {/* Expanded rungs (from the new routine) */}
                    {isExpanded && routineDiff.newRoutine?.rungs && (
                      <div className="space-y-1 py-1">
                        {routineDiff.newRoutine.rungs
                          .slice(item.startRung, item.endRung + 1)
                          .map((rung, i) => (
                            <ContextRung
                              key={`expanded-${item.startRung + i}`}
                              rung={rung}
                              rungNumber={item.startRung + i}
                              theme={theme}
                              isDarkMode={isDarkMode}
                            />
                          ))}
                      </div>
                    )}
                  </div>
                );
              }

              default:
                return null;
            }
          })}

          {/* Edge case: no stream items and no special kind message */}
          {streamItems.length === 0 && routineDiff.kind === 'modified' && (
            <div className="px-3 py-2 text-xs text-theme-muted italic">
              No rung-level changes (only property changes)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(RoutineDiffSection);
