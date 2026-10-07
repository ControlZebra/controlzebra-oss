import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, FileCode, Tags } from 'lucide-react';
import { Button } from '../../../../shared/ui/button';
import { Input } from '../../../../shared/ui/input';
import { ICON_SIZES } from '../../../../shared/constants';
import type { L5XDiffNavigatorItem, L5XDiffNavigatorSection } from './types';

type Row = { section: L5XDiffNavigatorSection; item?: L5XDiffNavigatorItem };

/** Changed entries share the app organizer shell and count each routine once. */
export const L5XDiffNavigator = memo(function L5XDiffNavigator({ sections, activeTabId, onSelect }: {
  sections: L5XDiffNavigatorSection[];
  activeTabId: string | null;
  onSelect: (tabId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const toggle = useCallback((id: string) => setCollapsed(current => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  }), []);
  const rows = useMemo<Row[]>(() => sections.flatMap(section => {
    const search = query.trim().toLowerCase();
    const items = section.items.filter(item => `${section.title} ${item.title} ${item.badge}`.toLowerCase().includes(search));
    if (!items.length) return [];
    return [{ section }, ...(!search && collapsed.has(section.id) ? [] : items.map(item => ({ section, item })))];
  }), [sections, query, collapsed]);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current,
    estimateSize: () => 32, overscan: 8, getItemKey: index => rows[index].item?.id ?? rows[index].section.id });
  const visible = rows.length > 50 ? virtualizer.getVirtualItems().map(row => ({ ...rows[row.index], start: row.start }))
    : rows.map(row => ({ ...row, start: undefined }));
  return <div className="flex min-h-0 flex-1 flex-col text-xs text-theme-primary">
    <div className="shrink-0 p-2"><Input aria-label="Find changed entry" placeholder="Find an entry" className="h-7 text-xs"
      value={query} onChange={event => { setQuery(event.target.value); if (scrollRef.current) scrollRef.current.scrollTop = 0; }} /></div>
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <nav aria-label="Changed project entries" className="relative" style={rows.length > 50 ? { height: virtualizer.getTotalSize() } : undefined}>
        {visible.map(({ section, item, start }) => {
          const Icon = item?.kind === 'routine' ? FileCode : Tags;
          const Chevron = collapsed.has(section.id) && !query ? ChevronRight : ChevronDown;
          return <div key={item?.id ?? section.id} className={start === undefined ? '' : 'absolute left-0 top-0 w-full'}
            style={start === undefined ? undefined : { transform: `translateY(${start}px)` }}>
            {item ? <Button variant="ghost" size="sm" className={`h-8 w-full justify-start gap-1.5 rounded-none pl-6 text-xs ${activeTabId === item.tabId ? 'bg-theme-muted' : ''}`}
              title={`${section.title} / ${item.title}`} aria-label={`${section.title} / ${item.title}`}
              aria-pressed={activeTabId === item.tabId} onClick={() => onSelect(item.tabId)}>
              <Icon size={ICON_SIZES.sm} className="shrink-0 text-theme-secondary" />
              <span className="truncate">{item.title}</span>
              <span className="ml-auto shrink-0 text-theme-muted">{item.badge}</span>
              <span className={item.changeKind === 'added' ? 'text-theme-added' : item.changeKind === 'removed' ? 'text-theme-removed' : 'text-theme-modified'}>
                {item.changeKind === 'mixed' ? 'Changed' : item.changeKind.charAt(0).toUpperCase() + item.changeKind.slice(1)}
              </span>
            </Button> : <Button variant="ghost" size="sm" className="h-8 w-full justify-start gap-1.5 rounded-none text-xs font-semibold"
              aria-expanded={!collapsed.has(section.id) || !!query} onClick={() => toggle(section.id)}>
              <Chevron size={ICON_SIZES.xs} className="shrink-0" /><span className="truncate">{section.title}</span>
              <span className="ml-auto text-theme-muted">{section.itemCount} changed</span>
            </Button>}
          </div>;
        })}
        {!rows.length && <p className="p-3 text-theme-secondary">No matching entries. Try another name.</p>}
      </nav>
    </div>
  </div>;
});
