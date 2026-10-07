import { createInstructionContextFromController } from 'ladder-visualizer';

import type {
  AOIDiff,
  ChangeKind,
  InstructionContext,
  NormalizedController,
  NormalizedProgram,
  NormalizedRoutine,
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
  RoutineOwner,
  RoutineOwnerKind,
} from './types';

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function buildRoutineSemanticId(ownerName: string, routineName: string, ownerKind: RoutineOwnerKind = 'program'): string {
  return `routine:${ownerKind}:${encodeSegment(ownerName)}:${encodeSegment(routineName)}`;
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

function getRoutine(owner: RoutineOwner | undefined, routineName: string): NormalizedRoutine | undefined {
  return owner?.routines.find((routine) => routine.name === routineName);
}

function getDataTypes(controller: NormalizedController) {
  return controller.dataTypeCatalog ?? controller.dataTypes;
}

function buildRoutineEntity(
  ownerKind: RoutineOwnerKind,
  ownerDiff: ProgramDiff | AOIDiff,
  routineDiff: RoutineDiff,
  oldController: NormalizedController,
  newController: NormalizedController,
  oldInstructionContext: InstructionContext,
  newInstructionContext: InstructionContext,
): L5XDiffRoutineEntity | null {
  const oldOwner = 'oldAOI' in ownerDiff ? ownerDiff.oldAOI : undefined;
  const newOwner = 'newAOI' in ownerDiff ? ownerDiff.newAOI : undefined;
  const ownerOnSide = (controller: NormalizedController) =>
    (ownerKind === 'program' ? controller.programs : controller.aois).find(owner => owner.name === ownerDiff.name);
  const resolvedOldOwner = ownerDiff.kind === 'added' ? undefined : oldOwner ?? ownerOnSide(oldController);
  const resolvedNewOwner = ownerDiff.kind === 'removed' ? undefined : newOwner ?? ownerOnSide(newController);
  const oldRoutine = routineDiff.kind === 'added' ? undefined : routineDiff.oldRoutine ?? getRoutine(resolvedOldOwner, routineDiff.name);
  const newRoutine = routineDiff.kind === 'removed' ? undefined : routineDiff.newRoutine ?? getRoutine(resolvedNewOwner, routineDiff.name);
  const routineType = newRoutine?.type ?? oldRoutine?.type ?? routineDiff.routineType;
  if (!routineType || ![oldRoutine?.type, newRoutine?.type, routineType].some(type => type && ['RLL', 'ST', 'FBD'].includes(type))) return null;

  const semanticId = buildRoutineSemanticId(ownerDiff.name, routineDiff.name, ownerKind);
  const tab: L5XDiffTabDescriptor = {
    id: buildTabId(semanticId), semanticId, kind: 'routine', title: routineDiff.name,
    subtitle: `${ownerKind === 'aoi' ? 'AOI' : 'Program'} ${ownerDiff.name}`,
  };
  return {
    kind: 'routine', semanticId, navigatorItemId: buildNavigatorItemId(semanticId), tab,
    changeKind: routineDiff.kind, ownerKind, ownerName: ownerDiff.name,
    routineName: routineDiff.name, routineType,
    oldOwner: resolvedOldOwner, newOwner: resolvedNewOwner, oldRoutine, newRoutine,
    oldInstructionContext, newInstructionContext, routineDiff,
    changedRungNumbers: (routineDiff.rungDiffs ?? []).map(rung => rung.rungNumber).sort((a, b) => a - b),
  };
}

function buildRoutineNavigatorItem(entity: L5XDiffRoutineEntity): L5XDiffNavigatorItem {
  const oldType = entity.oldRoutine?.type;
  const newType = entity.newRoutine?.type;
  return {
    id: entity.navigatorItemId, semanticId: entity.semanticId, tabId: entity.tab.id,
    kind: 'routine', title: entity.routineName, description: entity.tab.subtitle,
    badge: oldType && newType && oldType !== newType ? `${oldType} → ${newType}` : entity.routineType,
    changeKind: entity.changeKind,
    // Count routines once, regardless of nested rungs, sheets, elements or wires.
    changedCount: 1,
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
  const sourceController = newController.tags.length > 0 ? newController : oldController;
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
    fullContextTags: sourceController.tags,
    dataTypes: getDataTypes(sourceController),
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
  const useNewProgram = Boolean(newProgram?.tags.length);
  const sourceProgram = useNewProgram ? newProgram : oldProgram;
  const sourceController = useNewProgram ? newController : oldController;
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
    fullContextTags: sourceProgram?.tags ?? [],
    dataTypes: getDataTypes(sourceController),
    changedTagDiffs: sortByName(programDiff.tagDiffs),
  };
}

function buildRoutineSections(entities: L5XDiffRoutineEntity[]): L5XDiffNavigatorSection[] {
  const groups = new Map<string, L5XDiffNavigatorSection>();
  for (const entity of entities) {
    const id = `section:${buildRoutineSemanticId(entity.ownerName, '', entity.ownerKind)}`;
    const group = groups.get(id) ?? {
      id, kind: 'routines', title: entity.tab.subtitle!, itemCount: 0, items: [],
    };
    group.items.push(buildRoutineNavigatorItem(entity));
    group.itemCount += 1;
    groups.set(id, group);
  }
  return [...groups.values()];
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

  let otherRoutineCount = 0;
  const oldInstructionContext = createInstructionContextFromController(oldController);
  const newInstructionContext = createInstructionContextFromController(newController);
  const routineEntities: L5XDiffRoutineEntity[] = [];
  const owners = [
    ...sortedProgramDiffs.map(ownerDiff => ({ ownerKind: 'program' as const, ownerDiff })),
    ...sortByName(diff.aois).map(ownerDiff => ({ ownerKind: 'aoi' as const, ownerDiff })),
  ];
  for (const { ownerKind, ownerDiff } of owners) {
    for (const routineDiff of sortByName(ownerDiff.routineDiffs ?? [])) {
      const entity = buildRoutineEntity(ownerKind, ownerDiff, routineDiff, oldController, newController,
        oldInstructionContext, newInstructionContext);
      if (entity) routineEntities.push(entity);
      else otherRoutineCount += 1;
    }
  }

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
    ...buildRoutineSections(routineEntities),
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
      otherRoutineCount,
    },
  };
}

export type { L5XDiffLayoutViewModel } from './types';
