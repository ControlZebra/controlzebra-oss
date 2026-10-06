import type { NormalizedController, NormalizedProgram } from 'ladder-visualizer';
import { metadataLinkTitle, type MetadataTarget } from '../file/l5x/metadata-model';
import { programIdentity, findProgram } from '../file/l5x/program-identity';
import { generateTabId, type TabData } from '../file/l5x/useTabs';

export interface OrganizerNode {
  key: string;
  label: string;
  icon: 'folder' | 'controller' | 'task' | 'program' | 'aoi' | 'type' | 'module' | 'tags' | 'routine';
  data?: TabData;
  children?: OrganizerNode[];
  defaultExpanded?: boolean;
}

const metadata = (target: MetadataTarget): TabData => ({ type: 'metadata', target });
const entity = (label: string, icon: OrganizerNode['icon'], data: TabData, children?: OrganizerNode[]): OrganizerNode =>
  ({ key: generateTabId(data), label, icon, data, children });
const folder = (key: string, label: string, children: OrganizerNode[], defaultExpanded = true): OrganizerNode =>
  ({ key, label, icon: 'folder', children, defaultExpanded });

/** Build the existing organizer hierarchy from public normalized data. */
export function buildOrganizerTree(controller: NormalizedController): OrganizerNode[] {
  const programNodes = controller.programs.map((program, programIndex) => {
    const identity = programIdentity(controller.programs, program);
    return entity(program.name, 'program', metadata({ kind: 'program', ...identity }), [
      entity('Program Tags', 'tags', { type: 'program-tags', programIndex, programName: program.name, programUid: identity.uid }),
      ...program.routines.map((routine, routineIndex) => entity(routine.name, 'routine', {
        type: 'routine', programIndex, programName: program.name, programUid: identity.uid, routineIndex, routineName: routine.name,
      })).sort((left, right) => left.label.localeCompare(right.label)),
    ]);
  });
  const indices = new Map(controller.programs.map((program, index) => [program.name, index]));
  const scheduled = new Set<number>();
  const tasks = (controller.tasks ?? []).map(task => {
    const programIndices = [...new Set(task.scheduledProgramNames.map(name => indices.get(name))
      .filter((index): index is number => index !== undefined))];
    programIndices.forEach(index => scheduled.add(index));
    return { ...entity(task.name, 'task', metadata({ kind: 'task', name: task.name }),
      programIndices.map(index => programNodes[index])), defaultExpanded: true };
  });
  const typeCategories = [
    ['UserDefined', 'User Defined'], ['String', 'Strings'], ['AddOnDefined', 'Add-On Defined'],
    ['Predefined', 'Predefined'], ['ModuleDefined', 'Module Defined'],
  ];
  const types = controller.dataTypeCatalog ?? controller.dataTypes;
  const typeCategory = (type: typeof types[number]) => type.category ?? (type.family === 'StringFamily' ? 'String'
    : type.class === 'AddOnDefined' ? 'AddOnDefined' : type.class === 'ModuleDefined' ? 'ModuleDefined'
      : type.class === 'User' ? 'UserDefined' : 'Predefined');
  return [
    { ...entity(`Controller ${controller.name}`, 'controller', metadata({ kind: 'controller' }),
      [entity('Controller Tags', 'tags', { type: 'controller-tags' })]), defaultExpanded: true },
    folder('tasks', 'Tasks', [...tasks,
      folder('unscheduled', 'Unscheduled', programNodes.filter((_, index) => !scheduled.has(index)))]),
    folder('motion-groups', 'Motion Groups', []),
    folder('aois', 'Add-On Instructions', controller.aois.map(aoi => entity(aoi.name, 'aoi',
      metadata({ kind: 'aoi', name: aoi.name }), [
        entity('Parameters', 'tags', { type: 'aoi-parameters', aoiName: aoi.name }),
        entity('Local Tags', 'tags', { type: 'aoi-local-tags', aoiName: aoi.name }),
        folder(`aoi-routines:${aoi.name}`, 'Routines', aoi.routines.map((routine, routineIndex) =>
          entity(routine.name, 'routine', { type: 'aoi-routine', aoiName: aoi.name, routineIndex, routineName: routine.name }))
          .sort((left, right) => left.label.localeCompare(right.label)), false),
      ]))),
    folder('data-types', 'Data Types', typeCategories.map(([category, label]) => folder(`types:${category}`, label,
      types.filter(type => typeCategory(type) === category).map(type => entity(type.name, 'type',
        metadata({ kind: 'data-type', name: type.name }))), false))),
    folder('io', 'I/O Configuration', controller.modules.map(module => entity(
      module.catalogNumber ? `${module.name} (${module.catalogNumber})` : module.name, 'module',
      metadata({ kind: 'module', name: module.name })))),
  ];
}

export function organizerTabTitle(data: TabData): string {
  return data.type === 'metadata' ? `${data.target.kind === 'controller' ? 'Controller' : data.target.name} Metadata`
    : metadataLinkTitle(data);
}

/** Resolve old tab descriptors against refreshed owners before highlighting a row. */
export function organizerSelectionId(controller: NormalizedController, data?: TabData | null): string | undefined {
  if (!data) return undefined;
  const programData = (program: NormalizedProgram) => {
    const identity = programIdentity(controller.programs, program);
    return { programIndex: controller.programs.indexOf(program), programName: program.name, programUid: identity.uid };
  };
  if (data.type === 'metadata' && data.target.kind === 'program') {
    const program = findProgram(controller.programs, data.target);
    return program ? generateTabId(metadata({ kind: 'program', ...programIdentity(controller.programs, program) })) : undefined;
  }
  if (data.type === 'routine' || data.type === 'program-tags') {
    const program = findProgram(controller.programs, { uid: data.programUid, name: data.programName, index: data.programIndex });
    if (!program) return undefined;
    if (data.type === 'program-tags') return generateTabId({ ...data, ...programData(program) });
    const routine = data.routineName !== undefined ? program.routines.find(candidate => candidate.name === data.routineName)
      : program.routines[data.routineIndex];
    return routine ? generateTabId({ ...data, ...programData(program), routineName: routine.name }) : undefined;
  }
  if (data.type === 'controller-info') return generateTabId(metadata({ kind: 'controller' }));
  if (data.type === 'data-type') return generateTabId(metadata({ kind: 'data-type', name: data.dataTypeName }));
  if (data.type === 'module') return generateTabId(metadata({ kind: 'module', name: data.moduleName }));
  return generateTabId(data);
}
