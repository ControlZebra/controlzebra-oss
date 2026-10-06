import { memo, useMemo, useState } from 'react';
import type { NormalizedController } from 'ladder-visualizer';
import { Button } from '../../../shared/ui/button';
import { Input } from '../../../shared/ui/input';
import { metadataTargetId, type MetadataTarget } from '../file/l5x/metadata-model';

function L5XMetadataNavigator({ controller, selectedId, onSelect }: {
  controller: NormalizedController;
  selectedId?: string;
  onSelect: (target: MetadataTarget, title: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const entries = useMemo(() => [
    { label: `Controller: ${controller.name}`, target: { kind: 'controller' } as MetadataTarget },
    ...controller.programs.map(program => ({ label: `Program: ${program.name}`,
      target: { kind: 'program', name: program.name, uid: program.uid } as MetadataTarget })),
    ...(controller.tasks ?? []).map(task => ({ label: `Task: ${task.name}`, target: { kind: 'task', name: task.name } as MetadataTarget })),
    ...controller.aois.map(aoi => ({ label: `AOI: ${aoi.name}`, target: { kind: 'aoi', name: aoi.name } as MetadataTarget })),
    ...(controller.dataTypeCatalog ?? controller.dataTypes).map(type => ({ label: `Data type: ${type.name}`,
      target: { kind: 'data-type', name: type.name } as MetadataTarget })),
    ...controller.modules.map(module => ({ label: `Module: ${module.name}`, target: { kind: 'module', name: module.name } as MetadataTarget })),
  ].filter(entry => entry.label.toLowerCase().includes(search.toLowerCase())), [controller, search]);
  const pages = Math.max(1, Math.ceil(entries.length / 25));
  const currentPage = Math.min(page, pages - 1);

  return <details open className="shrink-0 border-t border-shell-divider text-xs text-theme-secondary">
    <summary className="cursor-pointer px-3 py-2 font-semibold text-theme-primary">Metadata</summary>
    <div className="px-2 pb-2">
      <Input aria-label="Find metadata entity" placeholder="Find an entity" className="mb-1 h-7 text-xs"
        value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
      <nav aria-label="Entity metadata" className="max-h-40 overflow-auto">
        {entries.slice(currentPage * 25, (currentPage + 1) * 25).map(entry => <Button key={metadataTargetId(entry.target)}
          type="button" variant="ghost" size="sm" title={entry.label} aria-label={`Inspect ${entry.label}`}
          aria-pressed={selectedId === metadataTargetId(entry.target)}
          className="w-full justify-start aria-pressed:bg-theme-muted aria-pressed:text-theme-primary"
          onClick={() => onSelect(entry.target, `${entry.label} Metadata`)}><span className="truncate">{entry.label}</span></Button>)}
        {entries.length === 0 && <p className="px-2 py-2">No matching entities. Try another name.</p>}
      </nav>
      {pages > 1 && <div className="mt-1 flex items-center justify-between gap-1">
        <Button size="sm" variant="ghost" aria-label="Previous metadata entities" disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}>Previous</Button>
        <span>{currentPage + 1} / {pages}</span>
        <Button size="sm" variant="ghost" aria-label="Next metadata entities" disabled={currentPage === pages - 1}
          onClick={() => setPage(currentPage + 1)}>Next</Button>
      </div>}
    </div>
  </details>;
}

export default memo(L5XMetadataNavigator);
