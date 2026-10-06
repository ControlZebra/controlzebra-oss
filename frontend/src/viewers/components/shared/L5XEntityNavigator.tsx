import { memo, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Boxes, ChevronDown, ChevronRight, Clock, Code, Cpu, FileCode, Folder, FolderOpen, Network, Tags } from 'lucide-react';
import type { NormalizedController } from 'ladder-visualizer';
import { Button } from '../../../shared/ui/button';
import { Input } from '../../../shared/ui/input';
import { ICON_SIZES } from '../../../shared/constants';
import { cn } from '../../../shared/utils/misc';
import { generateTabId, type TabData } from '../file/l5x/useTabs';
import { buildOrganizerTree, organizerSelectionId, organizerTabTitle, type OrganizerNode } from './l5x-organizer-model';

const icons = { controller: Cpu, task: Clock, program: Folder, aoi: Boxes, type: Code, module: Network, tags: Tags, routine: FileCode, folder: Folder };
interface Row { node: OrganizerNode; depth: number; path: string; expanded: boolean }

function L5XEntityNavigator({ controller, activeTabData, onOpen, ambiguousProgramUids }: {
  controller: NormalizedController;
  ambiguousProgramUids?: ReadonlySet<string>;
  activeTabData?: TabData | null;
  onOpen: (data: TabData, title: string) => void;
}) {
  const tree = useMemo(() => buildOrganizerTree(controller, ambiguousProgramUids), [controller, ambiguousProgramUids]);
  const [expansion, setExpansion] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedId = organizerSelectionId(controller, activeTabData, ambiguousProgramUids);
  const rows = useMemo(() => {
    const result: Row[] = [];
    const query = search.trim().toLowerCase();
    const matches = (node: OrganizerNode): boolean => node.label.toLowerCase().includes(query)
      || !!node.children?.some(matches);
    const visit = (nodes: OrganizerNode[], depth: number, parentPath: string) => nodes.forEach(node => {
      if (query && !matches(node)) return;
      const path = JSON.stringify([parentPath, node.key]);
      const expanded = query !== '' || (expansion[path] ?? node.defaultExpanded ?? false);
      result.push({ node, depth, path, expanded });
      if (expanded && node.children) visit(node.children, depth + 1, path);
    });
    visit(tree, 0, '');
    return result;
  }, [tree, expansion, search]);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current,
    getItemKey: index => rows[index].path, estimateSize: () => 28, overscan: 8 });
  const visibleRows = rows.length > 50 ? virtualizer.getVirtualItems().map(item => ({ ...rows[item.index], start: item.start }))
    : rows.map(row => ({ ...row, start: undefined }));
  const toggle = (row: Row) => {
    setSearch('');
    setExpansion(current => ({ ...current, [row.path]: !row.expanded }));
  };

  return <div className="flex min-h-0 flex-1 flex-col text-xs text-theme-primary">
    <div className="shrink-0 px-2 py-2">
      <Input aria-label="Find organizer entry" placeholder="Find an entry" className="h-7 text-xs" value={search}
        onChange={event => { setSearch(event.target.value); if (scrollRef.current) scrollRef.current.scrollTop = 0; }} />
    </div>
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <nav aria-label="Project entries" className="relative py-1" style={rows.length > 50 ? { height: virtualizer.getTotalSize() } : undefined}>
        {visibleRows.map(row => {
          const { node, depth, path, expanded } = row;
          const expandable = !!node.children?.length;
          const selected = node.data !== undefined && generateTabId(node.data) === selectedId;
          const Icon = node.icon === 'folder' && expanded ? FolderOpen : icons[node.icon];
          const Chevron = expanded ? ChevronDown : ChevronRight;
          return <div key={path} className={cn('flex h-7 w-full items-center border-l-2',
            selected ? 'border-accent-primary bg-theme-muted' : 'border-transparent',
            row.start !== undefined && 'absolute left-0 top-0')}
            style={{ paddingLeft: depth * 16, transform: row.start !== undefined ? `translateY(${row.start}px)` : undefined }}>
            {expandable ? <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0"
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.label}`} aria-expanded={expanded}
              onClick={() => toggle(row)}><Chevron size={ICON_SIZES.xs} /></Button> : <span className="w-6 shrink-0" />}
            <Button type="button" variant="ghost" size="sm" className="h-7 min-w-0 flex-1 justify-start gap-1.5 px-1 text-xs"
              title={node.label} aria-label={node.label} aria-pressed={node.data ? selected : undefined}
              aria-expanded={!node.data && expandable ? expanded : undefined} disabled={!node.data && !expandable}
              onClick={() => node.data ? onOpen(node.data, organizerTabTitle(node.data)) : toggle(row)}>
              <Icon size={ICON_SIZES.sm} className="shrink-0 text-theme-secondary" />
              <span className="truncate">{node.label}</span>
            </Button>
          </div>;
        })}
        {rows.length === 0 && <p className="px-3 py-2 text-theme-secondary">No matching entries. Try another name.</p>}
      </nav>
    </div>
  </div>;
}

export default memo(L5XEntityNavigator);
