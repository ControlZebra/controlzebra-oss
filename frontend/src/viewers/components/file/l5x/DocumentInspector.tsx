import { lazy, memo, Suspense, useMemo, useState } from 'react';
import { TagTable, type PlcDocument, type NormalizedController } from 'ladder-visualizer';
import { Button } from '../../../../shared/ui/button';
import LoadingState from '../../../../shared/ui/LoadingState';
import MetadataInspector, { MetadataPropertyList } from './MetadataInspector';
import { L5XRoutineViewer } from './L5XRoutineViewer';
import { findDocumentRecord, type DocumentSelection, type DocumentRecord } from './document-model';
import type { TabData } from './useTabs';

const CodeMirrorTextViewer = lazy(() => import('../../text/CodeMirrorTextViewer'));

type OpenTab = (data: TabData, title: string) => void;
const filters = ['All', 'Targets', 'Context', 'References', 'Encoded', 'Preserved'] as const;
const fieldList = (value: object) => Object.entries(value).map(([label, value]) => ({ label, value }));
function openRecord(record: DocumentRecord, onOpen: OpenTab) {
  onOpen({ type: 'document', selection: record.selection }, record.title);
}

const DocumentOverview = memo(function DocumentOverview({ document, records, onOpen }: {
  document: PlcDocument; records: DocumentRecord[]; onOpen: OpenTab;
}) {
  const [filter, setFilter] = useState<typeof filters[number]>('All');
  const [page, setPage] = useState(0);
  const entries = useMemo(() => records.filter(record => filter === 'All' || record.group === filter
    || (filter === 'Encoded' && record.encoded)), [records, filter]);
  const pages = Math.max(1, Math.ceil(entries.length / 50));
  const current = Math.min(page, pages - 1);
  return <section className="min-h-0 flex-1 overflow-auto p-4 text-theme-primary" aria-label="Document export and source">
    <h2 className="mb-3 text-sm font-semibold">Document export and source</h2>
    <MetadataPropertyList fields={[
      { label: 'Format', value: document.source.format },
      { label: 'Schema revision', value: document.source.schemaRevision },
      { label: 'Software revision', value: document.source.softwareRevision },
      { label: 'Target type', value: document.source.targetType },
      { label: 'Target name', value: document.source.targetName },
      { label: 'Target count', value: document.source.targetCount },
      { label: 'Contains context', value: document.source.containsContext },
    ]} onOpen={onOpen} />
    <nav aria-label="Document record filters" className="my-3 flex flex-wrap gap-1">
      {filters.map(value => <Button key={value} size="sm" variant="ghost" aria-pressed={filter === value}
        onClick={() => { setFilter(value); setPage(0); }}>{value}</Button>)}
    </nav>
    <ul className="space-y-2 text-xs">
      {entries.slice(current * 50, (current + 1) * 50).map(record => <li key={`${record.group}:${record.path}`} className="rounded border border-theme-default p-2">
        <p className="text-theme-secondary">{record.group === 'Targets' ? 'Declared target' : record.group}</p>
        <Button size="sm" variant="ghost" className="h-auto max-w-full whitespace-normal break-words text-left"
          onClick={() => openRecord(record, onOpen)}>{record.title}</Button>
        <p className="break-all text-theme-muted">{record.path}</p>
      </li>)}
    </ul>
    {entries.length === 0 && <p className="text-sm text-theme-secondary">No records in this group. Select another group or View Raw.</p>}
    {pages > 1 && <nav aria-label="Document record pages" className="mt-3 flex items-center gap-2 text-xs">
      <Button size="sm" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous records</Button>
      <span>Page {current + 1} of {pages}</span>
      <Button size="sm" variant="ghost" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>Next records</Button>
    </nav>}
  </section>;
});

function DocumentInspector({ document, records, controller, selection, onOpen, onShowRaw, fbdSheetIndex, onFbdSheetIndexChange }: {
  document: PlcDocument; records: DocumentRecord[]; controller: NormalizedController | null; selection: DocumentSelection;
  onOpen: OpenTab; onShowRaw?: () => void;
  fbdSheetIndex?: number; onFbdSheetIndexChange?: (index: number) => void;
}) {
  const record = useMemo(() => findDocumentRecord(records, selection), [records, selection]);
  if (selection.kind === 'source') return <DocumentOverview document={document} records={records} onOpen={onOpen} />;
  if (!record) return <div className="p-4 text-sm text-theme-secondary">
    <p>This source record is no longer available. Open Document to select another record.</p>
    {onShowRaw && <Button size="sm" variant="ghost" onClick={onShowRaw}>View Raw</Button>}
  </div>;

  const resource = record.resource;
  const metadataTarget = resource?.kind === 'controller' ? { kind: 'controller' as const }
    : resource?.kind === 'program' ? { kind: 'program' as const, name: resource.data.name, uid: resource.data.uid }
    : resource?.kind === 'aoi' || resource?.kind === 'module' ? { kind: resource.kind, name: resource.data.name }
    : resource?.kind === 'dataType' ? { kind: 'data-type' as const, name: resource.data.name } : undefined;
  const content = record.encoded ? record.encoded.payload
    : record.fragment ? JSON.stringify(record.fragment.value, null, 2)
      : resource?.kind === 'rung' ? resource.data.raw : undefined;
  const children = resource ? records.filter(item => item.resource?.ownerId === resource.id) : [];
  const properties = [
    { label: 'Source path', value: record.path }, { label: 'Group', value: record.group },
    ...(resource ? [{ label: 'Role', value: resource.role }, { label: 'Owner path', value: resource.ownerId }] : []),
    ...(record.encoded ? [{ label: 'Container path', value: record.encoded.containerPath },
      ...fieldList(record.encoded.attributes),
      { label: 'Payload inspection', value: record.encoded.capabilities.inspectPayload },
      { label: 'Decoded view', value: record.encoded.capabilities.decodedView },
      { label: 'Semantic queries', value: record.encoded.capabilities.semanticQuery }] : []),
    ...(record.fragment ? [{ label: 'Preservation reason', value: record.fragment.reason }] : []),
    ...(resource?.kind === 'rung' ? [{ label: 'Number', value: resource.data.number }, { label: 'Comment', value: resource.data.comment }] : []),
  ];
  return <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden text-theme-primary" aria-label={record.title}>
    <header className="max-h-[40%] shrink-0 overflow-auto border-b border-theme-default p-3 text-xs">
      <h2 className="mb-2 text-sm font-semibold">{record.title}</h2>
      <MetadataPropertyList fields={properties} onOpen={onOpen} />
      {record.encoded && <p className="mt-2 text-theme-secondary">Read-only opaque payload. Decoded visualization and semantic operations are unavailable.</p>}
      {record.fragment && <p className="mt-2 text-theme-secondary">Read-only parsed preserved representation. View Raw for the original whole-file text.</p>}
      {children.slice(0, 50).map(child => <Button key={child.path} size="sm" variant="ghost" onClick={() => openRecord(child, onOpen)}>{child.title}</Button>)}
      {children.length > 50 && <Button size="sm" variant="ghost"
        onClick={() => onOpen({ type: 'document', selection: { kind: 'source' } }, 'Document')}>More content in Document</Button>}
      {onShowRaw && <Button size="sm" variant="ghost" onClick={onShowRaw}>View Raw</Button>}
    </header>
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
      {content !== undefined ? <Suspense fallback={<LoadingState message="Loading source viewer..." />}><CodeMirrorTextViewer content={content} /></Suspense>
        : resource?.kind === 'routine' ? <L5XRoutineViewer routine={resource.data} fbdSheetIndex={fbdSheetIndex} onFbdSheetIndexChange={onFbdSheetIndexChange} />
          : resource?.kind === 'tag' ? <div className="h-full overflow-auto p-4"><TagTable tags={[resource.data]} dataTypes={controller?.dataTypeCatalog ?? controller?.dataTypes} /></div>
            : controller && metadataTarget ? <div className="h-full overflow-auto"><MetadataInspector controller={controller} target={metadataTarget} onOpen={onOpen} onShowRaw={onShowRaw} /></div>
              : null}
    </div>
  </section>;
}

export default memo(DocumentInspector);
