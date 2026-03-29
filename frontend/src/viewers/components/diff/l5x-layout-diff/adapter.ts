import type {
  ChangeKind,
  NormalizedController,
  NormalizedProgram,
  NormalizedRoutine,
  NormalizedRoutineType,
  ProgramDiff,
  RoutineDiff,
  TagDiff,
} from 'ladder-visualizer';

import type {
  BuildL5XDiffLayoutViewModelInput,
  L5XDiffAggregateChangeKind,
  L5XDiffControllerTagsEntity,
  L5XDiffLayoutViewModel,
  L5XDiffNavigatorItem,
  L5XDiffNavigatorSection,
  L5XDiffProgramTagsEntity,
  L5XDiffRenderableEntity,
  L5XDiffRoutineEntity,
  L5XDiffTabDescriptor,
} from './types';

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function buildRoutineSemanticId(programName: string, routineName: string): string {
  return `routine:${encodeSegment(programName)}:${encodeSegment(routineName)}`;
}

export function buildControllerTagsSemanticId(): string {
  return 'controller-tags';
}

export function buildProgramTagsSemanticId(programName: string): string {
  return `program-tags:${encodeSegment(programName)}`;
}

export function buildNavigatorItemId(semanticId: string): string {
  return `nav:${semanticId}`;
}

export function buildTabId(semanticId: string): string {
  return `tab:${semanticId}`;
}

function aggregateChangeKind(items: Array<{ kind: ChangeKind }>): L5XDiffAggregateChangeKind {
  const kinds = new Set(items.map((item) => item.kind));
  if (kinds.size === 1) {
    return items[0]?.kind ?? 'modified';
  }
  return 'mixed';
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

function getProgram(controller: NormalizedController, programName: string): NormalizedProgram | undefined {
  return controller.programs.find((program) => program.name === programName);
}

function getRoutine(program: NormalizedProgram | undefined, routineName: string): NormalizedRoutine | undefined {
  return program?.routines.find((routine) => routine.name === routineName);
}

function resolveRoutineType(
  routineDiff: RoutineDiff,
  oldRoutine?: NormalizedRoutine,
  newRoutine?: NormalizedRoutine,
): NormalizedRoutineType | undefined {
  return routineDiff.routineType ?? newRoutine?.type ?? oldRoutine?.type;
}

function getChangedRungNumbers(routineDiff: RoutineDiff): number[] {
  return [...(routineDiff.rungDiffs ?? [])]
    .map((rungDiff) => rungDiff.rungNumber)
    .sort((left, right) => left - right);
}

function buildRoutineEntity(
  oldController: NormalizedController,
  newController: NormalizedController,
  programDiff: ProgramDiff,
  routineDiff: RoutineDiff,
): L5XDiffRoutineEntity | null {
  const oldProgram = getProgram(oldController, programDiff.name);
  const newProgram = getProgram(newController, programDiff.name);
  const oldRoutine = getRoutine(oldProgram, routineDiff.name);
  const newRoutine = getRoutine(newProgram, routineDiff.name);
  const routineType = resolveRoutineType(routineDiff, oldRoutine, newRoutine);

  if (routineType !== 'RLL') {
    return null;
  }

  const semanticId = buildRoutineSemanticId(programDiff.name, routineDiff.name);
  const tab: L5XDiffTabDescriptor = {
    id: buildTabId(semanticId),
    semanticId,
    kind: 'routine',
    title: routineDiff.name,
    subtitle: programDiff.name,
  };

  return {
    kind: 'routine',
    semanticId,
    navigatorItemId: buildNavigatorItemId(semanticId),
    tab,
    changeKind: routineDiff.kind,
    programName: programDiff.name,
    routineName: routineDiff.name,
    routineType,
    oldProgram,
    newProgram,
    oldRoutine: routineDiff.oldRoutine ?? oldRoutine,
    newRoutine: routineDiff.newRoutine ?? newRoutine,
    routineDiff,
    programDiff,
    changedRungNumbers: getChangedRungNumbers(routineDiff),
  };
}

function buildRoutineNavigatorItem(entity: L5XDiffRoutineEntity): L5XDiffNavigatorItem {
  const totalCount = Math.max(
    entity.oldRoutine?.rungs.length ?? 0,
    entity.newRoutine?.rungs.length ?? 0,
  );

  return {
    id: entity.navigatorItemId,
    semanticId: entity.semanticId,
    tabId: entity.tab.id,
    kind: 'routine',
    title: entity.routineName,
    description: entity.programName,
    badge: entity.routineType,
    changeKind: entity.changeKind,
    changedCount: entity.changedRungNumbers.length || 1,
    totalCount,
  };
}

function buildControllerTagsEntity(
  oldController: NormalizedController,
  newController: NormalizedController,
  tagDiffs: TagDiff[],
): L5XDiffControllerTagsEntity | null {
  if (tagDiffs.length === 0) {
    return null;
  }

  const semanticId = buildControllerTagsSemanticId();
  const tab: L5XDiffTabDescriptor = {
    id: buildTabId(semanticId),
    semanticId,
    kind: 'controller-tags',
    title: 'Controller Tags',
  };

  return {
    kind: 'controller-tags',
    semanticId,
    navigatorItemId: buildNavigatorItemId(semanticId),
    tab,
    changeKind: aggregateChangeKind(tagDiffs),
    title: 'Controller Tags',
    fullContextTags: (newController.tags.length > 0 ? newController.tags : oldController.tags),
    changedTagDiffs: sortByName(tagDiffs),
  };
}

function buildProgramTagsEntity(
  oldController: NormalizedController,
  newController: NormalizedController,
  programDiff: ProgramDiff,
): L5XDiffProgramTagsEntity | null {
  if (programDiff.tagDiffs.length === 0) {
    return null;
  }

  const oldProgram = getProgram(oldController, programDiff.name);
  const newProgram = getProgram(newController, programDiff.name);
  const semanticId = buildProgramTagsSemanticId(programDiff.name);
  const tab: L5XDiffTabDescriptor = {
    id: buildTabId(semanticId),
    semanticId,
    kind: 'program-tags',
    title: `${programDiff.name} Tags`,
    subtitle: programDiff.name,
  };

  return {
    kind: 'program-tags',
    semanticId,
    navigatorItemId: buildNavigatorItemId(semanticId),
    tab,
    changeKind: aggregateChangeKind(programDiff.tagDiffs),
    title: `${programDiff.name} Tags`,
    programName: programDiff.name,
    oldProgram,
    newProgram,
    fullContextTags: (newProgram?.tags.length ? newProgram.tags : oldProgram?.tags) ?? [],
    changedTagDiffs: sortByName(programDiff.tagDiffs),
  };
}

function buildRoutineSection(entities: L5XDiffRoutineEntity[]): L5XDiffNavigatorSection | null {
  if (entities.length === 0) {
    return null;
  }

  return {
    id: 'section:routines',
    kind: 'routines',
    title: 'Changed Routines',
    itemCount: entities.length,
    items: entities.map(buildRoutineNavigatorItem),
  };
}

function buildControllerTagsSection(entity: L5XDiffControllerTagsEntity | null): L5XDiffNavigatorSection | null {
  if (!entity) {
    return null;
  }

  return {
    id: 'section:controller-tags',
    kind: 'controller-tags',
    title: 'Controller Tags',
    itemCount: 1,
    items: [{
      id: entity.navigatorItemId,
      semanticId: entity.semanticId,
      tabId: entity.tab.id,
      kind: 'controller-tags',
      title: entity.title,
      badge: `${entity.changedTagDiffs.length} changed`,
      changeKind: entity.changeKind,
      changedCount: entity.changedTagDiffs.length,
      totalCount: entity.fullContextTags.length,
    }],
  };
}

function buildProgramTagsSection(entities: L5XDiffProgramTagsEntity[]): L5XDiffNavigatorSection | null {
  if (entities.length === 0) {
    return null;
  }

  return {
    id: 'section:program-tags',
    kind: 'program-tags',
    title: 'Program Tags',
    itemCount: entities.length,
    items: entities.map((entity) => ({
      id: entity.navigatorItemId,
      semanticId: entity.semanticId,
      tabId: entity.tab.id,
      kind: 'program-tags',
      title: entity.title,
      description: entity.programName,
      badge: `${entity.changedTagDiffs.length} changed`,
      changeKind: entity.changeKind,
      changedCount: entity.changedTagDiffs.length,
      totalCount: entity.fullContextTags.length,
    })),
  };
}

function toEntityMap(entities: L5XDiffRenderableEntity[]): Record<string, L5XDiffRenderableEntity> {
  return Object.fromEntries(entities.map((entity) => [entity.tab.id, entity]));
}

export function buildL5XDiffLayoutViewModel({
  oldController,
  newController,
  diff,
}: BuildL5XDiffLayoutViewModelInput): L5XDiffLayoutViewModel {
  const sortedProgramDiffs = sortByName(diff.programs);

  let stRoutineCount = 0;
  let otherRoutineCount = 0;

  const routineEntities = sortedProgramDiffs
    .flatMap((programDiff) => sortByName(programDiff.routineDiffs).map((routineDiff) => ({ programDiff, routineDiff })))
    .map(({ programDiff, routineDiff }) => {
      const entity = buildRoutineEntity(oldController, newController, programDiff, routineDiff);
      if (entity) {
        return entity;
      }

      const routineType = routineDiff.routineType ?? routineDiff.newRoutine?.type ?? routineDiff.oldRoutine?.type;
      if (routineType === 'ST') {
        stRoutineCount += 1;
      } else {
        otherRoutineCount += 1;
      }
      return null;
    })
    .filter((entity): entity is L5XDiffRoutineEntity => entity !== null);

  const controllerTagsEntity = buildControllerTagsEntity(oldController, newController, diff.tags);
  const programTagsEntities = sortedProgramDiffs
    .map((programDiff) => buildProgramTagsEntity(oldController, newController, programDiff))
    .filter((entity): entity is L5XDiffProgramTagsEntity => entity !== null);

  const entities: L5XDiffRenderableEntity[] = [
    ...routineEntities,
    ...(controllerTagsEntity ? [controllerTagsEntity] : []),
    ...programTagsEntities,
  ];

  const navigatorSections = [
    buildRoutineSection(routineEntities),
    buildControllerTagsSection(controllerTagsEntity),
    buildProgramTagsSection(programTagsEntities),
  ].filter((section): section is L5XDiffNavigatorSection => section !== null);

  const tabs: L5XDiffTabDescriptor[] = entities.map((entity) => entity.tab);

  return {
    diff,
    oldController,
    newController,
    navigatorSections,
    tabs,
    entitiesByTabId: toEntityMap(entities),
    initialTabId: tabs[0]?.id ?? null,
    unsupportedChanges: {
      stRoutineCount,
      otherRoutineCount,
    },
  };
}

export type { L5XDiffLayoutViewModel } from './types';
