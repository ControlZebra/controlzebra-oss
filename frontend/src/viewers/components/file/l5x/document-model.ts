import type { PlcDocument, PlcResource, PlcEncodedData, PlcVendorFragment } from 'ladder-visualizer';
import { collectAmbiguousProgramUids, programIdentityKey } from './program-identity';

const resourceLabels: Record<PlcResource['kind'], string> = {
  controller: 'Controller', program: 'Program', routine: 'Routine', rung: 'Rung',
  tag: 'Tag', dataType: 'Data type', aoi: 'AOI', module: 'Module',
};

export type DocumentSelection = { kind: 'source' } | { kind: 'resource'; key: string }
  | { kind: 'encoded' | 'fragment'; path: string };
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
    ...document.encodedData.map(encoded => ({ selection: { kind: 'encoded' as const, path: encoded.sourcePath },
      title: `${encoded.attributes.Name ?? encoded.attributes.EncodedType ?? 'Encoded'} payload`,
      group: targets.has(encoded.sourcePath) ? 'Targets' as const : 'Encoded' as const,
      path: encoded.sourcePath, encoded })),
    ...document.fragments.map(fragment => ({ selection: { kind: 'fragment' as const, path: fragment.path },
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
