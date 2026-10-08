import type { PlcDocument, PlcResource, PlcEncodedData, PlcVendorFragment } from 'ladder-visualizer';
import { collectAmbiguousProgramUids, programIdentityKey } from './program-identity';

const documentGenerations = new WeakMap<PlcDocument, number>();
let nextDocumentGeneration = 0;
function documentGeneration(document: PlcDocument): number {
  const existing = documentGenerations.get(document);
  if (existing !== undefined) return existing;
  const generation = ++nextDocumentGeneration;
  documentGenerations.set(document, generation);
  return generation;
}

const resourceLabels: Record<PlcResource['kind'], string> = {
  controller: 'Controller', program: 'Program', routine: 'Routine', rung: 'Rung',
  tag: 'Tag', dataType: 'Data type', aoi: 'AOI', module: 'Module',
};

export type DocumentSelection = { kind: 'source' } | { kind: 'resource' | 'encoded' | 'fragment'; key: string };
export interface DocumentRecord {
  selection: DocumentSelection;
  title: string;
  group: 'Targets' | 'Target content' | 'Context' | 'References' | 'Encoded' | 'Preserved';
  path: string;
  resource?: PlcResource;
  encoded?: PlcEncodedData;
  fragment?: PlcVendorFragment;
}

export function documentSelectionId(selection: DocumentSelection): string {
  return JSON.stringify(['document', selection]);
}

/** Resource keys include every owner and survive source-order changes. */
export function buildDocumentRecords(document: PlcDocument, ambiguousProgramUids: ReadonlySet<string> = new Set()): DocumentRecord[] {
  const ambiguousUids = collectAmbiguousProgramUids(document.resources.flatMap(resource => resource.kind === 'program' ? [resource.data] : []), ambiguousProgramUids);
  const byId = new Map(document.resources.map(resource => [resource.id, resource]));
  const keys = new Map<string, string>();
  const key = (resource: PlcResource): string => {
    const cached = keys.get(resource.id);
    if (cached) return cached;
    const owner = resource.ownerId ? byId.get(resource.ownerId) : undefined;
    const value = JSON.stringify([owner ? key(owner) : '', resource.kind,
      resource.kind === 'rung' ? resource.data.number : resource.kind === 'program'
        ? programIdentityKey({ name: resource.data.name, uid: resource.data.uid,
          ambiguousUid: resource.data.uid !== undefined && ambiguousUids.has(resource.data.uid) }) : resource.data.name]);
    keys.set(resource.id, value);
    return value;
  };
  const byPath = new Map(document.resources.map(resource => [resource.sourcePath, resource]));
  const namesByPath = new Map<string, string>();
  for (const mapping of document.mappings) {
    if (!mapping.sourcePath.endsWith('/@Name')) continue;
    let value: unknown = mapping.resourceId ? byId.get(mapping.resourceId)?.data : document.source;
    for (const field of mapping.field.split('.')) {
      value = typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, field)
        ? (value as Record<string, unknown>)[field] : undefined;
    }
    if (typeof value === 'string') namesByPath.set(mapping.sourcePath.slice(0, -6), value);
  }
  for (const fragment of document.fragments) {
    if (typeof fragment.value === 'object' && typeof fragment.value['@_Name'] === 'string') {
      namesByPath.set(fragment.path, fragment.value['@_Name']);
    }
  }
  const sourceKey = (path: string, identity: unknown): string => {
    let ownerPath = path;
    while (ownerPath && !byPath.has(ownerPath)) ownerPath = ownerPath.slice(0, ownerPath.lastIndexOf('/'));
    const owner = byPath.get(ownerPath);
    let currentPath = ownerPath;
    const steps = path.slice(ownerPath.length).split('/').filter(Boolean).map(part => {
      currentPath += `/${part}`;
      return { part, name: namesByPath.get(currentPath) };
    });
    const lastParent = steps.length - 1;
    const lastNamedOwner = steps.reduce((last, step, index) => index < lastParent && step.name !== undefined ? index : last, -1);
    const unidentifiedOwner = steps.some((step, index) => index < lastParent && index > lastNamedOwner && step.name === undefined);
    const location = steps.map((step, index) => index === lastParent ? step.part.replace(/\[\d+\]/g, '')
      : step.name !== undefined ? [step.part.replace(/\[\d+\]/g, ''), step.name] : step.part);
    // Unidentified intermediate owners are inspectable only within this parsed document.
    return JSON.stringify([owner ? key(owner) : '', location, identity, unidentifiedOwner ? documentGeneration(document) : null]);
  };
  const encodedKey = (encoded: PlcEncodedData): string => {
    // Names identify wrappers; revisions and payloads can change on refresh.
    const wrapper = encoded.attributes.Name
      ? ['named', encoded.attributes.Name, encoded.attributes.EncodedType, encoded.attributes.Type]
      : ['attributes', Object.keys(encoded.attributes).sort().map(name => [name, encoded.attributes[name]])];
    return sourceKey(encoded.containerPath, wrapper);
  };
  const fragmentKey = (fragment: PlcVendorFragment): string => {
    const value = fragment.value;
    const attributes = typeof value === 'object'
      ? Object.keys(value).filter(name => name.startsWith('@_')).sort().map(name => [name, value[name]]) : [];
    return sourceKey(fragment.path, [fragment.reason, attributes]);
  };
  const targets = new Set(document.targetIds);
  return [
    ...document.resources.map(resource => {
      const owner = resource.ownerId ? byId.get(resource.ownerId) : undefined;
      const name = resource.kind === 'rung' ? `Rung ${resource.data.number}` : resource.data.name;
      const ownerName = owner && owner.kind !== 'rung' ? owner.data.name : undefined;
      return { selection: { kind: 'resource' as const, key: key(resource) },
        title: `${owner && ownerName ? `${resourceLabels[owner.kind]} ${ownerName} / ` : ''}${name} (${resourceLabels[resource.kind]})`,
        group: targets.has(resource.id) ? 'Targets' as const : resource.role === 'target' ? 'Target content' as const
          : resource.role === 'context' ? 'Context' as const : 'References' as const,
        path: resource.sourcePath, resource };
    }),
    ...document.encodedData.map(encoded => ({ selection: { kind: 'encoded' as const, key: encodedKey(encoded) },
      title: `${encoded.attributes.Name ?? encoded.attributes.EncodedType ?? 'Encoded'} payload`,
      group: targets.has(encoded.sourcePath) ? 'Targets' as const : 'Encoded' as const,
      path: encoded.sourcePath, encoded })),
    ...document.fragments.map(fragment => ({ selection: { kind: 'fragment' as const, key: fragmentKey(fragment) },
      title: fragment.path.split('/').pop() ?? fragment.path, group: 'Preserved' as const, path: fragment.path, fragment })),
  ];
}

export function findDocumentRecord(records: DocumentRecord[], selection: DocumentSelection): DocumentRecord | undefined {
  const id = documentSelectionId(selection);
  const matches = records.filter(record => documentSelectionId(record.selection) === id);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Prefer the narrowest preserved record covering a diagnostic's element/attribute. */
export function findLocationRecord(records: DocumentRecord[], path?: string): DocumentRecord | undefined {
  if (!path) return undefined;
  const covering = records.filter(record => path === record.path || path.startsWith(`${record.path}/`));
  const preserved = covering.filter(record => record.fragment || record.encoded);
  return (preserved.length ? preserved : covering).sort((a, b) => b.path.length - a.path.length)[0];
}
