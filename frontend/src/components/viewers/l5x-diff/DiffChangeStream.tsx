/**
 * DiffChangeStream — Main scrollable change stream for L5X diffs.
 *
 * Renders a linear review experience:
 * 1. Summary toolbar showing total change counts.
 * 2. Per-program sections, each containing routine diff sections.
 * 3. Only RLL routines get rung-level rendering; ST routines get a
 *    placeholder (Phase 3 will add full ST text diffing).
 *
 * Supports Collapse All / Expand All from the toolbar.
 */
import { memo, useState, useCallback, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ListCollapse,
  Maximize2,
  GitCommit,
  Code,
} from 'lucide-react';
import type { L5XDiff, ProgramDiff, RoutineDiff, LadderDiagramTheme } from 'ladder-visualizer';
import { ICON_SIZES } from '../../../constants';

import RoutineDiffSection from './RoutineDiffSection';
import TagDiffSection from './TagDiffSection';

// ============================================================================
// Types
// ============================================================================

export interface DiffChangeStreamProps {
  /** The structured L5X diff. */
  diff: L5XDiff;
  /** Theme for ladder rendering. */
  theme?: LadderDiagramTheme;
  /** Dark mode flag for CSS class. */
  isDarkMode?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/** Check if a routine diff is for an RLL routine. */
function isRLLRoutine(rd: RoutineDiff): boolean {
  return rd.routineType === 'RLL' || rd.rungDiffs !== undefined;
}

/** Stat badge component. */
function StatBadge({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${color}`}>
      <span className="font-semibold">{count}</span>
      <span className="text-theme-muted">{label}</span>
    </span>
  );
}

// ============================================================================
// Toolbar
// ============================================================================

interface ToolbarProps {
  summary: L5XDiff['summary'];
  allCollapsed: boolean;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}

const Toolbar = memo(function Toolbar({ summary, allCollapsed, onCollapseAll, onExpandAll }: ToolbarProps): JSX.Element {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-theme-elevated border-b border-theme-default">
      {/* Left: summary stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-sm font-medium text-theme-primary">
          <GitCommit size={ICON_SIZES.sm} className="text-theme-secondary" />
          <span>{summary.totalChanges} change{summary.totalChanges !== 1 ? 's' : ''}</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <StatBadge label="routines" count={summary.routines.added + summary.routines.removed + summary.routines.modified} color="text-theme-secondary" />
          <StatBadge label="rungs" count={summary.rungs.added + summary.rungs.removed + summary.rungs.modified} color="text-theme-secondary" />
          <StatBadge label="tags" count={summary.tags.added + summary.tags.removed + summary.tags.modified} color="text-theme-secondary" />
        </div>
      </div>

      {/* Right: collapse/expand buttons */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onCollapseAll}
          disabled={allCollapsed}
          className="p-1.5 rounded hover:bg-theme-muted/30 text-theme-secondary disabled:opacity-30 transition-colors"
          title="Collapse all sections"
        >
          <ListCollapse size={ICON_SIZES.sm} />
        </button>
        <button
          type="button"
          onClick={onExpandAll}
          disabled={!allCollapsed}
          className="p-1.5 rounded hover:bg-theme-muted/30 text-theme-secondary disabled:opacity-30 transition-colors"
          title="Expand all sections"
        >
          <Maximize2 size={ICON_SIZES.sm} />
        </button>
      </div>
    </div>
  );
});

// ============================================================================
// Program Section Header (groups routines under a program)
// ============================================================================

interface ProgramSectionProps {
  programDiff: ProgramDiff;
  theme?: LadderDiagramTheme;
  isDarkMode?: boolean;
  forceCollapsed?: boolean;
}

const ProgramSection = memo(function ProgramSection({
  programDiff,
  theme,
  isDarkMode,
  forceCollapsed,
}: ProgramSectionProps): JSX.Element | null {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const collapsed = forceCollapsed ?? isCollapsed;

  const toggleProgram = useCallback(() => setIsCollapsed(prev => !prev), []);

  // Categorize routines by type
  const rllRoutines = programDiff.routineDiffs.filter(rd => isRLLRoutine(rd));
  const stRoutines = programDiff.routineDiffs.filter(rd => rd.routineType === 'ST');
  const otherRoutines = programDiff.routineDiffs.filter(rd => !isRLLRoutine(rd) && rd.routineType !== 'ST');

  // Check if program has any content to show
  const hasRoutines = programDiff.routineDiffs.length > 0;
  const hasTags = programDiff.tagDiffs && programDiff.tagDiffs.length > 0;

  if (!hasRoutines && !hasTags) return null;

  const kindColors = {
    added: 'text-theme-added',
    removed: 'text-theme-removed',
    modified: 'text-theme-modified',
  };

  // Build summary text
  const summaryParts: string[] = [];
  if (hasRoutines) {
    summaryParts.push(`${programDiff.routineDiffs.length} routine${programDiff.routineDiffs.length !== 1 ? 's' : ''}`);
  }
  if (hasTags) {
    summaryParts.push(`${programDiff.tagDiffs.length} tag${programDiff.tagDiffs.length !== 1 ? 's' : ''}`);
  }

  return (
    <div>
      {/* Program header */}
      <button
        type="button"
        onClick={toggleProgram}
        className="
          w-full flex items-center gap-2 px-4 py-2
          bg-theme-surface hover:bg-theme-muted/20
          border-b border-theme-default
          transition-colors cursor-pointer select-none
        "
      >
        {collapsed ? (
          <ChevronRight size={ICON_SIZES.sm} className="shrink-0 text-theme-secondary" />
        ) : (
          <ChevronDown size={ICON_SIZES.sm} className="shrink-0 text-theme-secondary" />
        )}

        <Code size={ICON_SIZES.xs} className="shrink-0 text-theme-muted" />

        <span className="text-sm font-medium text-theme-primary">
          {programDiff.name}
        </span>

        <span className={`text-xs ${kindColors[programDiff.kind]}`}>
          {programDiff.kind}
        </span>

        <span className="ml-auto text-xs text-theme-muted">
          {summaryParts.join(', ')}
        </span>
      </button>

      {/* Program content */}
      {!collapsed && (
        <div className="space-y-3 p-3">
          {/* Program-scoped tags */}
          {hasTags && (
            <TagDiffSection
              tagDiffs={programDiff.tagDiffs}
              title="Program Tags"
              scopeName={programDiff.name}
              forceCollapsed={forceCollapsed}
            />
          )}

          {/* RLL routines — full rung stream */}
          {rllRoutines.map(rd => (
            <RoutineDiffSection
              key={`rll-${rd.name}`}
              routineDiff={rd}
              programName={programDiff.name}
              theme={theme}
              isDarkMode={isDarkMode}
            />
          ))}

          {/* ST routines — placeholder for Phase 3 */}
          {stRoutines.map(rd => (
            <div
              key={`st-${rd.name}`}
              className="border border-theme-default rounded-lg overflow-hidden bg-theme-surface/50"
            >
              <div className="flex items-center gap-3 px-4 py-2.5 bg-theme-elevated border-b border-theme-default">
                <Code size={ICON_SIZES.xs} className="text-theme-muted" />
                <span className="text-sm text-theme-primary font-medium">
                  {programDiff.name} / {rd.name}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${kindColors[rd.kind]} bg-current/10`}>
                  {rd.kind}
                </span>
                <span className="text-xs text-theme-muted ml-auto">Structured Text</span>
              </div>
              <div className="px-4 py-3 text-xs text-theme-muted italic">
                Structured Text diff rendering coming in a future update.
              </div>
            </div>
          ))}

          {/* Other routine types — summary */}
          {otherRoutines.map(rd => (
            <div
              key={`other-${rd.name}`}
              className="border border-theme-default rounded-lg overflow-hidden bg-theme-surface/50 px-4 py-2.5"
            >
              <span className="text-sm text-theme-primary">{rd.name}</span>
              <span className={`ml-2 text-xs ${kindColors[rd.kind]}`}>{rd.kind}</span>
              <span className="ml-2 text-xs text-theme-muted">({rd.routineType ?? 'unknown type'})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

function DiffChangeStream({ diff, theme, isDarkMode }: DiffChangeStreamProps): JSX.Element {
  const [allCollapsed, setAllCollapsed] = useState(false);

  const handleCollapseAll = useCallback(() => setAllCollapsed(true), []);
  const handleExpandAll = useCallback(() => setAllCollapsed(false), []);

  // Filter to only programs with changes
  const programsWithChanges = useMemo(
    () => diff.programs.filter(p => p.routineDiffs.length > 0 || p.tagDiffs.length > 0 || (p.propertyChanges && p.propertyChanges.length > 0)),
    [diff.programs],
  );

  const hasNoChanges = diff.summary.totalChanges === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <Toolbar
        summary={diff.summary}
        allCollapsed={allCollapsed}
        onCollapseAll={handleCollapseAll}
        onExpandAll={handleExpandAll}
      />

      {/* Scrollable stream */}
      <div className="flex-1 overflow-auto min-h-0">
        {hasNoChanges ? (
          <div className="flex items-center justify-center h-full text-theme-muted text-sm">
            No changes detected between versions
          </div>
        ) : (
          <div className="space-y-1">
            {/* Controller-scoped tags */}
            {diff.tags.length > 0 && (
              <div className="p-3">
                <TagDiffSection
                  tagDiffs={diff.tags}
                  title="Controller Tags"
                  forceCollapsed={allCollapsed ? true : undefined}
                />
              </div>
            )}

            {/* Programs with changes */}
            {programsWithChanges.map(pd => (
              <ProgramSection
                key={pd.name}
                programDiff={pd}
                theme={theme}
                isDarkMode={isDarkMode}
                forceCollapsed={allCollapsed ? true : undefined}
              />
            ))}

            {/* Data Types - placeholder for future */}
            {diff.dataTypes.length > 0 && (
              <div className="px-4 py-3 bg-theme-surface border-b border-theme-default text-sm">
                <span className="font-medium text-theme-primary">Data Types</span>
                <span className="ml-2 text-xs text-theme-muted">{diff.dataTypes.length} change{diff.dataTypes.length !== 1 ? 's' : ''}</span>
                <p className="text-xs text-theme-muted mt-1 italic">Data type diff details coming in a future update.</p>
              </div>
            )}

            {/* AOIs - placeholder for future */}
            {diff.aois.length > 0 && (
              <div className="px-4 py-3 bg-theme-surface border-b border-theme-default text-sm">
                <span className="font-medium text-theme-primary">Add-On Instructions</span>
                <span className="ml-2 text-xs text-theme-muted">{diff.aois.length} change{diff.aois.length !== 1 ? 's' : ''}</span>
                <p className="text-xs text-theme-muted mt-1 italic">AOI diff details coming in a future update.</p>
              </div>
            )}

            {/* Modules - placeholder for future */}
            {diff.modules.length > 0 && (
              <div className="px-4 py-3 bg-theme-surface border-b border-theme-default text-sm">
                <span className="font-medium text-theme-primary">Modules</span>
                <span className="ml-2 text-xs text-theme-muted">{diff.modules.length} change{diff.modules.length !== 1 ? 's' : ''}</span>
                <p className="text-xs text-theme-muted mt-1 italic">Module diff details coming in a future update.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(DiffChangeStream);
