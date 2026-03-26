import { memo, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DARK_THEME,
  VirtualizedLadderDiagram,
  type LadderDiagramTheme,
  type NormalizedRung,
} from 'ladder-visualizer';

import { CONTROL_ZEBRA_LADDER_THEME } from '../../file/l5x/theme';
import { buildRoutineDiffRenderModel, type L5XDiffRoutineRow } from './routine-render-model';
import type { L5XDiffRoutineEntity } from './types';

const OVERSCAN_ROWS = 6;
const SINGLE_RUNG_HEIGHT = 150;
const MODIFIED_RUNG_HEIGHT = 292;

function getChangeTone(kind: L5XDiffRoutineEntity['changeKind'] | L5XDiffRoutineRow['state']): string {
  switch (kind) {
    case 'added':
      return 'border-theme-added/40 bg-theme-added/10 text-theme-added';
    case 'removed':
      return 'border-theme-removed/40 bg-theme-removed/10 text-theme-removed';
    case 'modified':
      return 'border-theme-modified/40 bg-theme-modified/10 text-theme-modified';
    default:
      return 'border-theme-default bg-theme-elevated text-theme-secondary';
  }
}

function buildRoutineTheme(isDarkMode: boolean): LadderDiagramTheme {
  const baseTheme = isDarkMode ? DARK_THEME : CONTROL_ZEBRA_LADDER_THEME;
  return {
    ...baseTheme,
    bgPrimary: 'transparent',
    rowEvenBg: 'transparent',
    rowOddBg: 'transparent',
    cellEvenBg: 'transparent',
    cellOddBg: 'transparent',
  };
}

function RungDiagram({
  rung,
  label,
  tone,
  theme,
  isDarkMode,
}: {
  rung: NormalizedRung;
  label: string;
  tone: 'added' | 'removed';
  theme: LadderDiagramTheme;
  isDarkMode: boolean;
}): JSX.Element {
  const rungs = useMemo(() => [rung], [rung]);
  const toneClass = tone === 'added'
    ? 'border-theme-added/40 bg-theme-added/10'
    : 'border-theme-removed/40 bg-theme-removed/10';

  return (
    <div className={`border ${toneClass} overflow-hidden`}>
      <div className="border-b border-theme-default/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-theme-secondary">
        {label}
      </div>
      <div className={isDarkMode ? 'ladder-visualizer-dark' : ''} style={{ height: SINGLE_RUNG_HEIGHT }}>
        <VirtualizedLadderDiagram
          rungs={rungs}
          theme={theme}
          height={SINGLE_RUNG_HEIGHT}
          className="h-full"
        />
      </div>
    </div>
  );
}

const RoutineDiffRowCard = memo(function RoutineDiffRowCard({
  row,
  theme,
  isDarkMode,
}: {
  row: L5XDiffRoutineRow;
  theme: LadderDiagramTheme;
  isDarkMode: boolean;
}): JSX.Element {
  const primaryRung = row.newRung ?? row.oldRung;
  const rowToneClass = row.state === 'added'
    ? 'border-theme-added/40 bg-theme-added/5'
    : row.state === 'removed'
      ? 'border-theme-removed/40 bg-theme-removed/5'
      : 'border-theme-modified/40 bg-theme-modified/5';

  return (
    <div className={`overflow-hidden border-b ${rowToneClass}`}>
      <div className="flex items-center justify-between gap-3 px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-theme-secondary">Rung #{row.rungNumber}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getChangeTone(row.state)}`}>
            {row.state}
          </span>
        </div>
        {row.propertyChanges.length > 0 ? (
          <span className="text-[11px] text-theme-muted">{row.propertyChanges.length} field changes</span>
        ) : null}
      </div>

      {row.propertyChanges.length > 0 ? (
        <div className="border-t border-theme-default/30 px-3 py-2 text-xs text-theme-secondary">
          <div className="flex flex-wrap gap-2">
            {row.propertyChanges.map((propertyChange) => (
              <span
                key={`${row.key}:${propertyChange.property}`}
                className="rounded border border-theme-default bg-theme-elevated px-2 py-0.5"
              >
                {propertyChange.property}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2 px-3 py-2">
        {row.state === 'modified' ? (
          <>
            {row.oldRung ? (
              <RungDiagram rung={row.oldRung} label="Old" tone="removed" theme={theme} isDarkMode={isDarkMode} />
            ) : null}
            {row.newRung ? (
              <RungDiagram rung={row.newRung} label="New" tone="added" theme={theme} isDarkMode={isDarkMode} />
            ) : null}
          </>
        ) : primaryRung ? (
          <RungDiagram
            rung={primaryRung}
            label={row.state === 'removed' ? 'Removed' : 'Added'}
            tone={row.state === 'removed' ? 'removed' : 'added'}
            theme={theme}
            isDarkMode={isDarkMode}
          />
        ) : (
          <div className="rounded-md border border-dashed border-theme-default px-3 py-6 text-sm text-theme-secondary">
            Rung data is unavailable for this row.
          </div>
        )}
      </div>
    </div>
  );
});

export const RoutineDiffInspector = memo(function RoutineDiffInspector({
  entity,
  isDarkMode,
}: {
  entity: L5XDiffRoutineEntity;
  isDarkMode: boolean;
}): JSX.Element {
  const model = useMemo(() => buildRoutineDiffRenderModel(entity), [entity]);
  const theme = useMemo(() => buildRoutineTheme(isDarkMode), [isDarkMode]);
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: model.rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (model.rows[index]?.state === 'modified' ? MODIFIED_RUNG_HEIGHT : SINGLE_RUNG_HEIGHT),
    overscan: OVERSCAN_ROWS,
    paddingStart: 8,
    paddingEnd: 8,
    gap: 12,
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-theme-bg">
      {model.propertyChanges.length > 0 ? (
        <div className="border-b border-theme-default bg-theme-surface px-4 py-2 text-sm text-theme-secondary">
          <div className="flex flex-wrap gap-2">
            {model.propertyChanges.map((propertyChange) => (
              <span
                key={`${model.routineName}:${propertyChange.property}`}
                className="rounded border border-theme-default bg-theme-elevated px-2 py-0.5 text-xs"
              >
                {propertyChange.property}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-hidden">
        {model.rows.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center px-4 text-sm text-theme-secondary">
            No changed rung lines are available for this routine diff.
          </div>
        ) : (
          <div ref={parentRef} className="h-full min-h-[420px] overflow-auto bg-theme-surface">
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = model.rows[virtualRow.index];
                return (
                  <div
                    key={row.key}
                    ref={rowVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <RoutineDiffRowCard row={row} theme={theme} isDarkMode={isDarkMode} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});