import { memo, useCallback, useMemo, useState, type CSSProperties } from 'react';
import { TagTable, type ColumnDefinition, type NormalizedTag, type PropertyChange } from 'ladder-visualizer';
import { Button } from '../../../../shared/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../shared/ui/table';
import MetadataInspector, { MetadataPropertyList } from '../../file/l5x/MetadataInspector';
import DeclarationView from '../../file/l5x/DeclarationView';
import OrderedItems from '../../file/l5x/OrderedItems';
import { formatMetadataValue } from '../../file/l5x/metadata-model';
import type { L5XDiffAggregateChangeKind, L5XDiffMetadataEntity, L5XDiffRenderableEntity } from './types';

type Entity = Exclude<L5XDiffRenderableEntity, { kind: 'routine' }>;
type TagsEntity = Extract<Entity, { kind: 'controller-tags' | 'program-tags' }>;
const changeTone = (kind: L5XDiffAggregateChangeKind) => kind === 'added' ? 'text-theme-added'
  : kind === 'removed' ? 'text-theme-removed' : 'text-theme-modified';
const changeLabel = (kind: L5XDiffAggregateChangeKind) => kind === 'mixed' ? 'Changed' : kind.charAt(0).toUpperCase() + kind.slice(1);

const ComparisonValue = memo(function ComparisonValue({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  if (value === null || typeof value !== 'object' || value instanceof Date) return <>{formatMetadataValue(value)}</>;
  return <div className="min-w-0 space-y-2">
    <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? 'Hide value' : 'Inspect value'}
    </Button>
    {expanded && (Array.isArray(value)
      ? <OrderedItems items={value} label="Value items" summary={(_, index) => `Item ${index + 1}`}>
        {item => <ComparisonValue value={item} />}
      </OrderedItems>
      : <OrderedItems items={Object.entries(value)} label="Value fields" summary={([name]) => name}>
        {([, item]) => <ComparisonValue value={item} />}
      </OrderedItems>)}
  </div>;
});

const PropertyChanges = memo(function PropertyChanges({ changes }: { changes: PropertyChange[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(changes.length / 50));
  const currentPage = Math.min(page, pages - 1);
  if (!changes.length) return null;
  return <div className="space-y-2">
    <Table aria-label="Changed fields" className="table-fixed text-xs">
      <TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Previous value</TableHead><TableHead>Current value</TableHead></TableRow></TableHeader>
      <TableBody>{changes.slice(currentPage * 50, (currentPage + 1) * 50).map((change, index) => <TableRow key={index}>
        <TableHead scope="row" className="break-words">{change.property}</TableHead>
        <TableCell style={{ backgroundColor: 'var(--color-removed-bg)' }} className="whitespace-pre-wrap break-words align-top [overflow-wrap:anywhere]"><ComparisonValue value={change.oldValue} /></TableCell>
        <TableCell style={{ backgroundColor: 'var(--color-added-bg)' }} className="whitespace-pre-wrap break-words align-top [overflow-wrap:anywhere]"><ComparisonValue value={change.newValue} /></TableCell>
      </TableRow>)}</TableBody>
    </Table>
    {pages > 1 && <nav aria-label="Changed field pages" className="flex items-center gap-2 text-xs">
      <Button variant="ghost" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous fields</Button>
      <span>Page {currentPage + 1} of {pages}</span>
      <Button variant="ghost" size="sm" disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>Next fields</Button>
    </nav>}
  </div>;
});

const TagComparison = memo(function TagComparison({ entity }: { entity: TagsEntity }) {
  const [selection, setSelection] = useState<string | null>(null);
  const diffs = useMemo(() => new Map(entity.changedTagDiffs.map(diff => [diff.name, diff])), [entity.changedTagDiffs]);
  const columns = useMemo<ColumnDefinition<NormalizedTag>[]>(() => [
    { key: 'diffKind', header: 'Change', sortKey: 'name', render: tag => {
      const diff = diffs.get(tag.name);
      return diff ? <span className={changeTone(diff.kind)}>{changeLabel(diff.kind)}</span> : null;
    } },
    { key: 'inspectChanges', header: 'Details', sortable: false, render: tag => diffs.has(tag.name)
      ? <Button variant="ghost" size="sm" aria-label={`Inspect changes for ${tag.name}`}
        onClick={() => setSelection(tag.name)}>Inspect changes</Button> : null },
    { key: 'propertyChanges', header: 'Changed Fields', sortKey: 'name',
      render: tag => diffs.get(tag.name)?.propertyChanges?.map(change => change.property).join(', ') || '-' },
  ], [diffs]);
  const rowStyle = useCallback((tag: NormalizedTag): CSSProperties | undefined => {
    const kind = diffs.get(tag.name)?.kind;
    return kind ? { '--table-cell-bg': `var(--color-${kind}-bg)` } as CSSProperties : undefined;
  }, [diffs]);
  const select = useCallback((tag: NormalizedTag) => setSelection(diffs.has(tag.name) ? tag.name : null), [diffs]);
  const sides = useMemo(() => [
    { label: 'Previous version', tags: entity.oldTags.filter(tag => diffs.has(tag.name)), catalog: entity.oldDataTypes },
    { label: 'Current version', tags: entity.newTags.filter(tag => diffs.has(tag.name)), catalog: entity.newDataTypes },
  ], [entity, diffs]);
  const selected = selection ? diffs.get(selection) : undefined;
  return <>
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
      {sides.map(side => <section key={side.label} aria-label={side.label} className="flex h-96 min-w-0 flex-col gap-2">
        <h3 className="text-xs font-semibold">{side.label}</h3>
        <TagTable tags={side.tags} dataTypes={side.catalog} extraColumns={columns} getRowStyle={rowStyle}
          onTagSelect={select} className="min-h-0 flex-1" />
      </section>)}
    </div>
    {selected ? <section aria-label={`${selected.name} changed fields`}>
      <h3 className="mb-2 text-xs font-semibold">{selected.name}: {changeLabel(selected.kind)}</h3>
      <PropertyChanges changes={selected.propertyChanges ?? []} />
    </section> : <p className="text-xs text-theme-secondary">Select a tag to inspect its changed fields.</p>}
  </>;
});

const MetadataComparison = memo(function MetadataComparison({ entity }: { entity: L5XDiffMetadataEntity }) {
  const sides = useMemo(() => [
    { label: 'Previous version', controller: entity.oldController, aoi: entity.aoiDiff?.oldAOI },
    { label: 'Current version', controller: entity.newController, aoi: entity.aoiDiff?.newAOI },
  ], [entity]);
  return <>
    <PropertyChanges changes={entity.propertyChanges} />
    {entity.aoiDiff && <section aria-label="AOI declaration summary" className="space-y-2 text-xs">
      {[['Parameters', entity.aoiDiff.parameterSummary], ['Local tags', entity.aoiDiff.localTagSummary]].map(([label, summary]) =>
        typeof summary === 'object' && summary && <p key={String(label)}>
          {String(label)}: {summary.added} added, {summary.removed} removed, {summary.modified} modified
        </p>)}
      <p className="text-theme-secondary">{entity.changeKind === 'modified' ? 'Declaration changes are reported as counts. ' : ''}Inspect the previous and current declarations below for their values and defaults.</p>
    </section>}
    {!!entity.memberDiffs?.length && <OrderedItems items={entity.memberDiffs} label="Changed members"
      summary={member => <span className={changeTone(member.kind)}>{member.name}: {changeLabel(member.kind)}</span>}>
      {member => <>
        <PropertyChanges changes={member.propertyChanges ?? []} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[{ label: 'Previous member', value: member.oldMember }, { label: 'Current member', value: member.newMember }].map(side =>
            <section key={side.label} aria-label={side.label} className="min-w-0">
              <h4 className="mb-2 text-xs font-semibold">{side.label}</h4>
              {side.value ? <MetadataPropertyList fields={Object.entries(side.value).map(([label, value]) => ({ label, value }))} />
                : <p className="text-xs text-theme-secondary">Not present</p>}
            </section>)}
        </div>
      </>}
    </OrderedItems>}
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
      {sides.map(side => <section key={side.label} aria-label={side.label} className="min-w-0 space-y-3 rounded border border-theme-default p-3">
        <h3 className="text-xs font-semibold">{side.label}</h3>
        {side.controller ? <>
          <MetadataInspector controller={side.controller} target={entity.target} />
          {side.aoi && <>
            <h4 className="text-xs font-semibold">Parameters</h4>
            <DeclarationView declarations={side.aoi.parameters} catalog={side.controller.dataTypeCatalog ?? side.controller.dataTypes} />
            <h4 className="text-xs font-semibold">Local tags</h4>
            <DeclarationView declarations={side.aoi.localTags} catalog={side.controller.dataTypeCatalog ?? side.controller.dataTypes} />
          </>}
        </> : <p className="text-xs text-theme-secondary">Not present</p>}
      </section>)}
    </div>
  </>;
});

export const EntityDiffInspector = memo(function EntityDiffInspector({ entity }: { entity: Entity }) {
  return <section aria-label={`${entity.tab.title} comparison`} className="h-full min-w-0 space-y-4 overflow-auto p-4 text-theme-primary">
    <header className="flex flex-wrap items-center gap-3 text-sm">
      <h2 className="font-semibold">{entity.tab.title}</h2>
      <span className={changeTone(entity.changeKind)}>{changeLabel(entity.changeKind)}</span>
    </header>
    {entity.kind === 'metadata' ? <MetadataComparison entity={entity} />
      : entity.kind === 'program-local-tags' ? <OrderedItems items={entity.changedLocalTagDiffs} label="Changed local tags"
        summary={tag => <span className={changeTone(tag.kind)}>{tag.name}: {changeLabel(tag.kind)}</span>}>
        {tag => <>
          <PropertyChanges changes={tag.propertyChanges ?? []} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {[{ label: 'Previous version', declaration: tag.oldTag, catalog: entity.oldDataTypes },
              { label: 'Current version', declaration: tag.newTag, catalog: entity.newDataTypes }].map(side =>
              <section key={side.label} aria-label={side.label} className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold">{side.label}</h3>
                {side.declaration ? <DeclarationView declarations={[side.declaration]} catalog={side.catalog} />
                  : <p className="text-xs text-theme-secondary">Not present</p>}
              </section>)}
          </div>
        </>}
      </OrderedItems> : <TagComparison entity={entity} />}
  </section>;
});
