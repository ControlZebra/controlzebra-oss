import { memo, useId, useMemo, useState } from 'react';
import type { NormalizedController } from 'ladder-visualizer';
import { Button } from '../../../../shared/ui/button';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../../../../shared/ui/table';
import { buildMetadataModel, formatMetadataValue, metadataLinkTitle, type MetadataField, type MetadataTarget } from './metadata-model';
import type { TabData } from './useTabs';

/** The same property presentation can be used by later comparison inspectors. */
export const MetadataPropertyList = memo(function MetadataPropertyList({ fields, onOpen }: {
  fields: MetadataField[];
  onOpen: (data: TabData, title: string) => void;
}) {
  return <Table className="table-fixed text-xs" aria-label="Metadata fields"><TableBody>
    {fields.map((field, index) => <TableRow key={index}>
      <TableHead scope="row" className="h-auto w-2/5 break-words px-3 py-2 align-top">{field.label}</TableHead>
      <TableCell className="whitespace-pre-wrap break-words px-3 py-2 align-top [overflow-wrap:anywhere]">
        {field.link ? <Button type="button" variant="ghost" size="sm"
          className="h-auto max-w-full justify-start whitespace-pre-wrap break-words p-0 text-left text-accent-primary underline [overflow-wrap:anywhere]"
          aria-label={`Open ${field.label}: ${formatMetadataValue(field.value)}`}
          onClick={() => onOpen(field.link!, metadataLinkTitle(field.link!))}>{formatMetadataValue(field.value)}</Button>
          : formatMetadataValue(field.value)}
      </TableCell>
    </TableRow>)}
  </TableBody></Table>;
});

function MetadataInspector({ controller, target, onOpen, onShowRaw, ambiguousProgramUids }: {
  controller: NormalizedController;
  target: MetadataTarget;
  ambiguousProgramUids?: ReadonlySet<string>;
  onOpen: (data: TabData, title: string) => void;
  onShowRaw?: () => void;
}) {
  const headingId = useId();
  const model = useMemo(() => buildMetadataModel(controller, target, ambiguousProgramUids), [controller, target, ambiguousProgramUids]);
  const [page, setPage] = useState(0);
  // Bound rendering of long member/port/schedule inventories while preserving source order.
  const rows = useMemo(() => model?.groups.flatMap(group => group.fields.length
    ? group.fields.map(field => ({ group: group.title, field }))
    : [{ group: group.title, field: { label: 'Entries', value: 'None' } }]) ?? [], [model]);
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const groups = useMemo(() => {
    const result: Array<{ title: string; fields: MetadataField[] }> = [];
    for (const row of rows.slice(currentPage * 50, (currentPage + 1) * 50)) {
      if (result[result.length - 1]?.title !== row.group) result.push({ title: row.group, fields: [] });
      result[result.length - 1].fields.push(row.field);
    }
    return result;
  }, [rows, currentPage]);

  if (!model) return <section className="p-4 text-sm text-theme-secondary" aria-label="Missing metadata entity">
    <p>This entity is no longer in the file. Select another item in the Project Organizer.</p>
    {onShowRaw && <Button variant="ghost" size="sm" onClick={onShowRaw}>View Raw</Button>}
  </section>;

  return <section aria-labelledby={headingId} className="min-w-0 space-y-4 p-4 text-theme-primary">
    <h2 id={headingId} className="break-words text-sm font-semibold">{model.title}</h2>
    {groups.map((group, index) => <section key={index} className="overflow-hidden rounded-md border border-theme-default">
      <h3 className="bg-theme-elevated px-3 py-2 text-xs font-semibold [overflow-wrap:anywhere]">{group.title}</h3>
      <MetadataPropertyList fields={group.fields} onOpen={onOpen} />
    </section>)}
    {pageCount > 1 && <nav aria-label="Metadata pages" className="flex flex-wrap items-center gap-2 text-xs">
      <Button size="sm" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous fields</Button>
      <span>Page {currentPage + 1} of {pageCount}</span>
      <Button size="sm" variant="ghost" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next fields</Button>
    </nav>}
  </section>;
}

export default memo(MetadataInspector);
