import type { NormalizedController } from 'ladder-visualizer';
import type { TabData } from './useTabs';
import { findProgram, programIdentity, programIdentityKey } from './program-identity';

export type MetadataTarget =
  | { kind: 'controller' }
  | { kind: 'program'; name: string; uid?: string; ambiguousUid?: boolean }
  | { kind: 'task' | 'aoi' | 'data-type' | 'module'; name: string };

export interface MetadataField {
  label: string;
  value: unknown;
  link?: TabData;
}
export interface MetadataGroup { title: string; fields: MetadataField[] }
export interface MetadataModel { title: string; groups: MetadataGroup[] }

/** Names and source UIDs survive reordering. Document-local module indexes do not. */
export function metadataTargetId(target: MetadataTarget): string {
  return JSON.stringify(['metadata', target.kind, target.kind === 'controller' ? '' :
    target.kind === 'program' ? programIdentityKey(target) : ['name', target.name]]);
}

/** Shared by file inspectors and future comparison inspectors. No units are inferred. */
export function formatMetadataValue(value: unknown): string {
  if (value === undefined || value === null) return 'Not supplied';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'Invalid date' : value.toISOString();
  if (typeof value === 'string') return value === '' ? 'Empty string' : value;
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value.length ? value.join('\n') : 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function formatMetadataDimensions(dimensions?: number[], dimension?: number): string {
  if (dimensions !== undefined) return dimensions.length ? dimensions.map(size => `[${size}]`).join('') : 'Scalar';
  if (dimension !== undefined) return dimension === 0 ? 'Scalar' : `[${dimension}]`;
  return 'Not supplied';
}

function fields<T extends object>(entity: T, definitions: Array<[keyof T, string]>): MetadataField[] {
  return definitions.map(([key, label]) => ({ label, value: entity[key] }));
}
function metadataLink(target: MetadataTarget): TabData {
  return target.kind === 'data-type' ? { type: 'data-type', dataTypeName: target.name } : { type: 'metadata', target };
}

export function metadataLinkTitle(data: TabData): string {
  switch (data.type) {
    case 'metadata': return `${data.target.kind === 'controller' ? 'Controller' : data.target.name} Metadata`;
    case 'routine': return data.routineName ?? 'Routine';
    case 'aoi-routine': return `${data.aoiName}:${data.routineName ?? 'Routine'}`;
    case 'controller-tags': return 'Controller Tags';
    case 'program-tags': return `${data.programName} Tags`;
    case 'program-local-tags': return `${data.programName} Local Tags`;
    case 'program-parameters': return `${data.programName} Parameters`;
    case 'trends': return 'Trends';
    case 'watch-lists': return 'Quick Watch Lists';
    case 'aoi-parameters': return `${data.aoiName} Parameters`;
    case 'aoi-local-tags': return `${data.aoiName} Local Tags`;
    case 'data-type': return data.dataTypeName;
    case 'module': return data.moduleName;
    case 'controller-info': return 'Controller Info';
  }
}

export function buildMetadataModel(controller: NormalizedController, target: MetadataTarget, ambiguousProgramUids?: ReadonlySet<string>): MetadataModel | null {
  const catalog = controller.dataTypeCatalog ?? controller.dataTypes;
  const typeLink = (name?: string) => name && catalog.some(type => type.name === name)
    ? metadataLink({ kind: 'data-type', name }) : undefined;
  const programLink = (name: string) => {
    const program = findProgram(controller.programs, { name }, ambiguousProgramUids);
    return program ? metadataLink({ kind: 'program', ...programIdentity(controller.programs, program, ambiguousProgramUids) }) : undefined;
  };
  switch (target.kind) {
    case 'controller': {
      const scalarMetadata = Object.entries(controller.vendorMetadata ?? {})
        .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
        .sort(([left], [right]) => left.localeCompare(right));
      return { title: `${controller.name} Metadata`, groups: [
        { title: 'Controller', fields: fields(controller, [
          ['name', 'Name'], ['description', 'Description'], ['commPath', 'Communication path'],
          ['processorType', 'Processor type'], ['serialNumber', 'Serial number'],
          ['createdDate', 'Created date'], ['modifiedDate', 'Modified date'],
          ['vendor', 'Vendor'], ['sourceFormat', 'Source format'],
        ]) },
        { title: 'Collections', fields: [
          { label: 'Controller tags', value: controller.tags.length, link: { type: 'controller-tags' } },
          { label: 'Programs', value: controller.programs.length },
          { label: 'Tasks', value: controller.tasks?.length ?? 0 },
          { label: 'AOI definitions', value: controller.aois.length },
          { label: 'Data types', value: catalog.length }, { label: 'Modules', value: controller.modules.length },
          { label: 'Trends', value: controller.trends?.length ?? 0, link: { type: 'trends' } },
          { label: 'Quick-watch lists', value: controller.quickWatchLists?.length ?? 0, link: { type: 'watch-lists' } },
        ] },
        { title: 'Vendor metadata', fields: scalarMetadata.map(([label, value]) => ({ label, value })) },
      ] };
    }
    case 'program': {
      const program = findProgram(controller.programs, target, ambiguousProgramUids);
      if (!program) return null;
      const programIndex = controller.programs.indexOf(program);
      const identity = programIdentity(controller.programs, program, ambiguousProgramUids);
      const properties = fields(program, [
        ['name', 'Name'], ['uid', 'UID'], ['parentUid', 'Parent UID'], ['useAsFolder', 'Use as folder'],
        ['programType', 'Type'], ['description', 'Description'], ['mainRoutineName', 'Main routine'],
        ['preStateRoutineName', 'Pre-state routine'], ['faultRoutineName', 'Fault routine'],
        ['executingTaskName', 'Executing task'], ['testEdits', 'Test edits'], ['verified', 'Verified'],
        ['editsExist', 'Edits exist'], ['disabled', 'Disabled'], ['initialStepIndex', 'Initial step index'],
        ['initialState', 'Initial state'], ['completeStateIfNotImplemented', 'Unimplemented state action'],
        ['lossOfCommunicationCommand', 'Loss of communication command'], ['externalRequestAction', 'External request action'],
        ['equipmentId', 'Equipment ID'], ['recipePhaseNames', 'Recipe phase names'],
        ['lastScanTime', 'Last scan time'], ['maxScanTime', 'Maximum scan time'],
        ['synchronizeRedundancyDataAfterExecution', 'Synchronize redundancy data after execution'],
      ]);
      for (const field of properties) {
        if (['Main routine', 'Pre-state routine', 'Fault routine'].includes(field.label)) {
          const routineIndex = program.routines.findIndex(routine => routine.name === field.value);
          if (routineIndex >= 0) field.link = { type: 'routine', programIndex, programName: program.name,
            programUid: identity.uid, programUidAmbiguous: identity.ambiguousUid, routineIndex, routineName: program.routines[routineIndex].name };
        }
        if (field.label === 'Executing task' && controller.tasks?.some(task => task.name === field.value)) {
          field.link = metadataLink({ kind: 'task', name: String(field.value) });
        }
        if (field.label === 'Parent UID') {
          const parent = typeof field.value === 'string' ? findProgram(controller.programs, { uid: field.value }, ambiguousProgramUids) : undefined;
          if (parent) field.link = metadataLink({ kind: 'program', ...programIdentity(controller.programs, parent, ambiguousProgramUids) });
        }
      }
      return { title: `${program.name} Metadata`, groups: [{ title: 'Program', fields: properties },
        { title: 'Views', fields: [{ label: 'Program tags', value: program.tags.length,
          link: { type: 'program-tags', programIndex, programName: program.name, programUid: identity.uid, programUidAmbiguous: identity.ambiguousUid } },
          { label: 'Local tags', value: program.localTags.length,
            link: { type: 'program-local-tags', programIndex, programName: program.name, programUid: identity.uid, programUidAmbiguous: identity.ambiguousUid } },
          { label: 'Parameters', value: program.parameters.length,
            link: { type: 'program-parameters', programIndex, programName: program.name, programUid: identity.uid, programUidAmbiguous: identity.ambiguousUid } }] }] };
    }
    case 'task': {
      const task = controller.tasks?.find(candidate => candidate.name === target.name);
      if (!task) return null;
      return { title: `${task.name} Metadata`, groups: [
        { title: 'Task', fields: fields(task, [['name', 'Name'], ['type', 'Type'], ['class', 'Class'],
          ['description', 'Description'], ['rate', 'Rate'], ['priority', 'Priority'], ['watchdog', 'Watchdog'],
          ['inhibited', 'Inhibited'], ['verified', 'Verified'], ['disableUpdateOutputs', 'Disable output updates']]) },
        { title: 'Event', fields: fields(task.event ?? {}, [['trigger', 'Trigger'], ['tag', 'Tag'], ['timeoutEnabled', 'Timeout enabled']]) },
        { title: 'Program schedule', fields: task.scheduledProgramNames.map((name, index) =>
          ({ label: `Program ${index + 1}`, value: name, link: programLink(name) })) },
      ] };
    }
    case 'aoi': {
      const aoi = controller.aois.find(candidate => candidate.name === target.name);
      if (!aoi) return null;
      return { title: `${aoi.name} Metadata`, groups: [
        { title: 'AOI definition', fields: fields(aoi, [['name', 'Name'], ['description', 'Description'],
          ['revision', 'Revision'], ['revisionExtension', 'Revision extension'], ['vendor', 'Vendor'],
          ['class', 'Class'], ['createdDate', 'Created date'], ['createdBy', 'Created by'],
          ['editedDate', 'Edited date'], ['editedBy', 'Edited by'], ['revisionNote', 'Revision notes'],
          ['helpText', 'Help'], ['executePrescan', 'Execute prescan'], ['executePostscan', 'Execute postscan'],
          ['executeEnableInFalse', 'Execute when EnableIn is false']]) },
        { title: 'Views', fields: [
          { label: 'Parameters', value: aoi.parameters.length, link: { type: 'aoi-parameters', aoiName: aoi.name } },
          { label: 'Local tags', value: aoi.localTags.length, link: { type: 'aoi-local-tags', aoiName: aoi.name } },
          ...aoi.routines.map((routine, routineIndex) => ({ label: `Routine ${routineIndex + 1}`, value: routine.name,
            link: { type: 'aoi-routine' as const, aoiName: aoi.name, routineIndex, routineName: routine.name } })),
        ] },
      ] };
    }
    case 'data-type': {
      const type = catalog.find(candidate => candidate.name === target.name);
      if (!type) return null;
      return { title: `${type.name} Metadata`, groups: [
        { title: 'Data type', fields: [...fields(type, [['name', 'Name'], ['description', 'Description'],
          ['family', 'Family'], ['class', 'Class'], ['category', 'Category'], ['resolution', 'Resolution'],
          ['usage', 'Usage'], ['provenance', 'Provenance']]),
          { label: 'Member structure', value: type.members.length, link: { type: 'data-type', dataTypeName: type.name, view: 'table' } }] },
        ...type.members.map((member, index) => ({ title: `Member ${index + 1}: ${member.name}`, fields: [
          { label: 'Data type', value: member.dataType, link: typeLink(member.dataType) },
          { label: 'Dimensions', value: formatMetadataDimensions(member.dimensions, member.dimension) },
          ...fields(member, [['name', 'Name'], ['description', 'Description'], ['radix', 'Radix'],
            ['hidden', 'Hidden'], ['externalAccess', 'External access'], ['usage', 'Usage'],
            ['tagType', 'Tag type'], ['required', 'Required'], ['visible', 'Visible'],
            ['defaultValue', 'Default value'], ['storageTarget', 'Storage target'], ['bitNumber', 'Bit number']]),
        ] })),
      ] };
    }
    case 'module': {
      const module = controller.modules.find(candidate => candidate.name === target.name);
      if (!module) return null;
      const properties = fields(module, [['name', 'Name'], ['id', 'Module ID'], ['description', 'Description'],
        ['catalogNumber', 'Catalog number'], ['category', 'Category'], ['usage', 'Usage'],
        ['vendorId', 'Vendor ID'], ['productType', 'Product type'], ['productCode', 'Product code'],
        ['majorRevision', 'Major revision'], ['minorRevision', 'Minor revision'], ['parentId', 'Parent ID'],
        ['parentModuleName', 'Parent module'], ['parentPortId', 'Parent port ID'], ['slot', 'Slot'],
        ['inhibited', 'Inhibited'], ['majorFault', 'Major fault'], ['safetyEnabled', 'Safety enabled'],
        ['eKeyState', 'Electronic keying'], ['comments', 'Comments']]);
      const parent = module.parentModuleName !== undefined
        ? controller.modules.find(candidate => candidate.name === module.parentModuleName)
        : controller.modules.find(candidate => candidate.id === module.parentId);
      for (const field of properties) {
        if (parent && ['Parent ID', 'Parent module'].includes(field.label) && field.value !== undefined)
          field.link = metadataLink({ kind: 'module', name: parent.name });
      }
      return { title: `${module.name} Metadata`, groups: [{ title: 'Module', fields: properties },
        { title: 'Views', fields: [{ label: 'Module configuration', value: module.name,
          link: { type: 'module', moduleId: module.id, moduleName: module.name } }] },
        ...module.ports.map((port, index) => ({ title: `Port ${index + 1}`, fields: fields(port,
          [['id', 'ID'], ['type', 'Type'], ['address', 'Address'], ['upstream', 'Upstream'], ['busSize', 'Bus size']]) })),
        ...module.connections.map((connection, index) => {
          const properties = fields(connection, [['name', 'Name'], ['type', 'Type'], ['rpiMicroseconds', 'RPI (microseconds)'],
            ['inputDataType', 'Input data type'], ['outputDataType', 'Output data type'], ['unicast', 'Unicast']]);
          for (const field of properties) {
            if (['Input data type', 'Output data type'].includes(field.label)) field.link = typeLink(field.value as string | undefined);
          }
          return { title: `Connection ${index + 1}`, fields: properties };
        }),
      ] };
    }
  }
}
