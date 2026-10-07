import { memo, useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../../../../shared/ui/button';
import { ICON_SIZES } from '../../../../shared/constants';

/** Page direct children only. Collapsed entries never render their descendants. */
function OrderedItems<T>({ items, label, summary, children }: {
  items: readonly T[];
  label: string;
  summary: (item: T, index: number) => ReactNode;
  children: (item: T, index: number) => ReactNode;
}) {
  const [state, setState] = useState({ items, page: 0, expanded: -1 });
  // A refresh must not transfer an expanded position to a different declaration.
  if (state.items !== items) setState({ items, page: 0, expanded: -1 });
  const page = state.items === items ? state.page : 0;
  const expanded = state.items === items ? state.expanded : -1;
  const id = useId();
  const pageCount = Math.max(1, Math.ceil(items.length / 50));
  return <section aria-label={label} className="min-w-0 space-y-2">
    {items.length === 0 && <p className="px-3 py-2 text-xs text-theme-secondary">None</p>}
    <ol start={page * 50 + 1} className="overflow-hidden rounded-md border border-shell-divider [&>li+li]:border-t [&>li+li]:border-shell-divider">
      {items.slice(page * 50, (page + 1) * 50).map((item, offset) => {
        const index = page * 50 + offset;
        const open = index === expanded;
        const Icon = open ? ChevronDown : ChevronRight;
        return <li key={index}>
          <Button variant="ghost" size="sm" className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2 text-left text-xs"
            aria-expanded={open} aria-controls={`${id}-${index}`}
            onClick={() => setState({ items, page, expanded: open ? -1 : index })}>
            <Icon size={ICON_SIZES.xs} className="shrink-0" />
            <span className="shrink-0 text-theme-secondary">{index + 1}.</span>{' '}
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{summary(item, index)}</span>
          </Button>
          {open && <div id={`${id}-${index}`} className="min-w-0 space-y-3 border-t border-shell-divider p-3">{children(item, index)}</div>}
        </li>;
      })}
    </ol>
    {pageCount > 1 && <nav aria-label={`${label} pages`} className="flex flex-wrap items-center gap-2 text-xs">
      <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setState({ items, page: page - 1, expanded: -1 })}>Previous</Button>
      <span>Page {page + 1} of {pageCount}</span>
      <Button size="sm" variant="ghost" disabled={page + 1 === pageCount} onClick={() => setState({ items, page: page + 1, expanded: -1 })}>Next</Button>
    </nav>}
  </section>;
}

export default memo(OrderedItems) as typeof OrderedItems;
