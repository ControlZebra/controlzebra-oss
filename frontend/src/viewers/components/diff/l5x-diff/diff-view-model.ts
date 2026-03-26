import type { ChangeKind, L5XDiff, RoutineDiff, TagDiff } from 'ladder-visualizer';

export type DiffTabData =
  | { type: 'routine'; programName: string; routineName: string }
  | { type: 'controller-tags' }
  | { type: 'program-tags'; programName: string };

export interface DiffTabDescriptor {
  id: string;
  title: string;
  subtitle?: string;
  kind: ChangeKind;
  changeCount: number;
  data: DiffTabData;
}

export interface DiffRoutineItem extends DiffTabDescriptor {
  routineType: string;
  rungSummary: {
    added: number;
    removed: number;
    modified: number;
  };
}

export interface DiffRoutineGroup {
  id: string;
  title: string;
  routineCount: number;
  routines: DiffRoutineItem[];
}

export interface DiffTagGroup extends DiffTabDescriptor {
  scope: 'controller' | 'program';
  counts: {
    added: number;
    removed: number;
    modified: number;
  };
}

export interface DiffNavigatorModel {
  routineGroups: DiffRoutineGroup[];
  tagGroups: DiffTagGroup[];
  totalItems: number;
  validTabIds: string[];
  unsupported: {
    stRoutineCount: number;
    otherRoutineCount: number;
    dataTypeCount: number;
    aoiCount: number;
    moduleCount: number;
    controllerInfoChangeCount: number;
  };
}

function encodeIdSegment(value: string): string {
  return encodeURIComponent(value);
}

export function getDiffTabId(data: DiffTabData): string {
  switch (data.type) {
    case 'routine':
      return `routine:${encodeIdSegment(data.programName)}:${encodeIdSegment(data.routineName)}`;
    case 'controller-tags':
      return 'controller-tags';
    case 'program-tags':
      return `program-tags:${encodeIdSegment(data.programName)}`;
  }
}

function getRoutineType(routineDiff: RoutineDiff): string {
  return routineDiff.routineType ?? routineDiff.newRoutine?.type ?? routineDiff.oldRoutine?.type ?? 'unknown';
}

function getRoutineChangeCount(routineDiff: RoutineDiff): number {
  if (routineDiff.summary) {
    return routineDiff.summary.rungsAdded + routineDiff.summary.rungsRemoved + routineDiff.summary.rungsModified;
  }

  if (routineDiff.rungDiffs && routineDiff.rungDiffs.length > 0) {
    return routineDiff.rungDiffs.length;
  }

  return 1;
}

function summarizeTagDiffs(tagDiffs: TagDiff[]): { added: number; removed: number; modified: number } {
  return tagDiffs.reduce(
    (summary, tagDiff) => {
      summary[tagDiff.kind] += 1;
      return summary;
    },
    { added: 0, removed: 0, modified: 0 },
  );
}

function summarizeRoutineKind(routineDiff: RoutineDiff): ChangeKind {
  return routineDiff.kind;
}

function summarizeTagGroupKind(tagDiffs: TagDiff[]): ChangeKind {
  if (tagDiffs.length === 1) {
    return tagDiffs[0].kind;
  }

  if (tagDiffs.some((tagDiff) => tagDiff.kind === 'modified')) {
    return 'modified';
  }

  if (tagDiffs.some((tagDiff) => tagDiff.kind === 'added') && tagDiffs.some((tagDiff) => tagDiff.kind === 'removed')) {
    return 'modified';
  }

  return tagDiffs[0]?.kind ?? 'modified';
}

export function buildDiffNavigatorModel(diff: L5XDiff): DiffNavigatorModel {
  let stRoutineCount = 0;
  let otherRoutineCount = 0;

  const routineGroups = diff.programs
    .map((programDiff): DiffRoutineGroup | null => {
      const routines = programDiff.routineDiffs.reduce<DiffRoutineItem[]>((items, routineDiff) => {
        const routineType = getRoutineType(routineDiff);

        if (routineType === 'ST') {
          stRoutineCount += 1;
          return items;
        }

        if (routineType !== 'RLL') {
          otherRoutineCount += 1;
          return items;
        }

        const data: DiffTabData = {
          type: 'routine',
          programName: programDiff.name,
          routineName: routineDiff.name,
        };

        items.push({
          id: getDiffTabId(data),
          title: routineDiff.name,
          subtitle: `${programDiff.name} • RLL`,
          kind: summarizeRoutineKind(routineDiff),
          changeCount: getRoutineChangeCount(routineDiff),
          data,
          routineType,
          rungSummary: {
            added: routineDiff.summary?.rungsAdded ?? 0,
            removed: routineDiff.summary?.rungsRemoved ?? 0,
            modified: routineDiff.summary?.rungsModified ?? 0,
          },
        });

        return items;
      }, []);

      if (routines.length === 0) {
        return null;
      }

      return {
        id: `program:${encodeIdSegment(programDiff.name)}`,
        title: programDiff.name,
        routineCount: routines.length,
        routines,
      };
    })
    .filter((group): group is DiffRoutineGroup => group !== null);

  const tagGroups: DiffTagGroup[] = [];

  if (diff.tags.length > 0) {
    const data: DiffTabData = { type: 'controller-tags' };
    tagGroups.push({
      id: getDiffTabId(data),
      title: 'Controller Tags',
      subtitle: `${diff.tags.length} changed tag${diff.tags.length === 1 ? '' : 's'}`,
      kind: summarizeTagGroupKind(diff.tags),
      changeCount: diff.tags.length,
      data,
      scope: 'controller',
      counts: summarizeTagDiffs(diff.tags),
    });
  }

  for (const programDiff of diff.programs) {
    if (programDiff.tagDiffs.length === 0) {
      continue;
    }

    const data: DiffTabData = {
      type: 'program-tags',
      programName: programDiff.name,
    };

    tagGroups.push({
      id: getDiffTabId(data),
      title: `${programDiff.name} Tags`,
      subtitle: `${programDiff.tagDiffs.length} changed tag${programDiff.tagDiffs.length === 1 ? '' : 's'}`,
      kind: summarizeTagGroupKind(programDiff.tagDiffs),
      changeCount: programDiff.tagDiffs.length,
      data,
      scope: 'program',
      counts: summarizeTagDiffs(programDiff.tagDiffs),
    });
  }

  const validTabIds = [
    ...routineGroups.flatMap((group) => group.routines.map((routine) => routine.id)),
    ...tagGroups.map((group) => group.id),
  ];

  return {
    routineGroups,
    tagGroups,
    totalItems: validTabIds.length,
    validTabIds,
    unsupported: {
      stRoutineCount,
      otherRoutineCount,
      dataTypeCount: diff.dataTypes.length,
      aoiCount: diff.aois.length,
      moduleCount: diff.modules.length,
      controllerInfoChangeCount: diff.controllerInfo.changes.length,
    },
  };
}