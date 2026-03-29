import {
  buildInlineDiffModel,
  measureRoutineDiffRowHeight,
  MIN_RUNG_HEIGHT,
  type InlineDiffRungModel,
  type NormalizedRung,
  type PropertyChange,
} from 'ladder-visualizer';

import type { L5XDiffRoutineEntity } from './types';

export type L5XDiffRoutineRowState = 'added' | 'removed' | 'modified';

export interface L5XDiffRoutineRow {
  key: string;
  rungNumber: number;
  state: L5XDiffRoutineRowState;
  measuredHeight: number;
  oldRung?: NormalizedRung;
  newRung?: NormalizedRung;
  inlineDiffModel?: InlineDiffRungModel;
  propertyChanges: PropertyChange[];
}

export interface L5XDiffRoutineRenderModel {
  changeKind: L5XDiffRoutineEntity['changeKind'];
  programName: string;
  routineName: string;
  rows: L5XDiffRoutineRow[];
  propertyChanges: PropertyChange[];
  counts: Record<'unchanged' | L5XDiffRoutineRowState, number>;
}

function getRungIdentity(rung: NormalizedRung, fallbackIndex: number): number {
  return Number.isFinite(rung.number) ? rung.number : fallbackIndex;
}

function buildRungMap(rungs: NormalizedRung[] | undefined): Map<number, NormalizedRung> {
  const map = new Map<number, NormalizedRung>();

  for (const [index, rung] of (rungs ?? []).entries()) {
    map.set(getRungIdentity(rung, index), rung);
  }

  return map;
}

function getMeasuredRoutineDiffRowHeight(
  state: L5XDiffRoutineRowState,
  oldRung: NormalizedRung | undefined,
  newRung: NormalizedRung | undefined,
  inlineDiffModel: InlineDiffRungModel | undefined,
): number {
  if (state === 'modified') {
    return inlineDiffModel
      ? measureRoutineDiffRowHeight({ state, inlineDiffModel })
      : MIN_RUNG_HEIGHT;
  }

  const rung = newRung ?? oldRung;
  return rung
    ? measureRoutineDiffRowHeight({ state, rung })
    : MIN_RUNG_HEIGHT;
}

export function buildRoutineDiffRenderModel(entity: L5XDiffRoutineEntity): L5XDiffRoutineRenderModel {
  const oldRungs = buildRungMap(entity.oldRoutine?.rungs);
  const newRungs = buildRungMap(entity.newRoutine?.rungs);
  const rungDiffs = new Map(
    (entity.routineDiff.rungDiffs ?? []).map((rungDiff) => [rungDiff.rungNumber, rungDiff] as const),
  );

  const rungNumbers = new Set<number>([
    ...oldRungs.keys(),
    ...newRungs.keys(),
    ...rungDiffs.keys(),
  ]);

  const counts: Record<L5XDiffRoutineRowState, number> = {
    added: 0,
    removed: 0,
    modified: 0,
  };
  let unchangedCount = 0;

  const rows: L5XDiffRoutineRow[] = [];

  for (const rungNumber of [...rungNumbers].sort((left, right) => left - right)) {
    const rungDiff = rungDiffs.get(rungNumber);
    const oldRung = rungDiff?.oldRung ?? oldRungs.get(rungNumber);
    const newRung = rungDiff?.newRung ?? newRungs.get(rungNumber);

    if (rungDiff) {
      const inlineDiffModel = rungDiff.kind === 'modified'
        ? buildInlineDiffModel({
            oldRung,
            newRung,
            rungNumber,
          })
        : undefined;
      const row = {
        key: `${entity.semanticId}:rung:${rungNumber}`,
        rungNumber,
        state: rungDiff.kind,
        measuredHeight: getMeasuredRoutineDiffRowHeight(rungDiff.kind, oldRung, newRung, inlineDiffModel),
        oldRung,
        newRung,
        inlineDiffModel,
        propertyChanges: rungDiff.propertyChanges ?? [],
      } satisfies L5XDiffRoutineRow;
      counts[row.state] += 1;
      rows.push(row);
    } else if (entity.changeKind === 'added' && newRung && !oldRung) {
      const row = {
        key: `${entity.semanticId}:rung:${rungNumber}`,
        rungNumber,
        state: 'added',
        measuredHeight: getMeasuredRoutineDiffRowHeight('added', oldRung, newRung, undefined),
        oldRung,
        newRung,
        propertyChanges: [],
      } satisfies L5XDiffRoutineRow;
      counts.added += 1;
      rows.push(row);
    } else if (entity.changeKind === 'removed' && oldRung && !newRung) {
      const row = {
        key: `${entity.semanticId}:rung:${rungNumber}`,
        rungNumber,
        state: 'removed',
        measuredHeight: getMeasuredRoutineDiffRowHeight('removed', oldRung, newRung, undefined),
        oldRung,
        newRung,
        propertyChanges: [],
      } satisfies L5XDiffRoutineRow;
      counts.removed += 1;
      rows.push(row);
    } else {
      unchangedCount += 1;
    }
  }

  return {
    changeKind: entity.changeKind,
    programName: entity.programName,
    routineName: entity.routineName,
    rows,
    propertyChanges: entity.routineDiff.propertyChanges ?? [],
    counts: {
      unchanged: unchangedCount,
      ...counts,
    },
  };
}