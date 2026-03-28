/**
 * DiffTagTable — Displays only added/modified/deleted tag rows for L5X diffs.
 *
 * Replaces TagDiffSection with a focused diff-only table:
 * - Columns: Status, Name, Type, Data Type, Style, Access
 * - Row tinting by change kind (green/red/yellow via theme tokens)
 * - Expandable property-change detail rows for modified tags
 * - Filter by name/kind/dataType/tagType and sortable columns
 * - Collapsible section wrapper with summary badges
 *
 * Takes TagDiff[] — only changed tags, never unchanged rows.
 */
import { memo, useState, useMemo, useCallback, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight, Tag, Plus, Minus, RefreshCw } from 'lucide-react';
import type { TagDiff, PropertyChange, NormalizedTag } from 'ladder-visualizer';
import { ICON_SIZES } from '../../../../shared/constants';

// ============================================================================
// Types
// ============================================================================

export interface DiffTagTableProps {
  /** Array of tag diffs (only changed tags). */
  tagDiffs: TagDiff[];
  /** Section title (e.g., "Controller Tags", "Program Tags"). */
  title: string;
  /** Optional parent scope name (e.g., program name). */
  scopeName?: string;
  /** Whether section starts collapsed (default: false). */
  defaultCollapsed?: boolean;
  /** Force collapsed state from parent. */
  forceCollapsed?: boolean;
}

type SortKey = 'kind' | 'name' | 'tagType' | 'dataType' | 'radix' | 'externalAccess';

// ============================================================================
// Constants
// ============================================================================

const KIND_BADGE_CLASSES = {
  added: 'text-theme-added bg-theme-added border-theme-added',
  removed: 'text-theme-removed bg-theme-removed border-theme-removed',
  modified: 'text-theme-modified bg-theme-modified border-theme-modified',
} as const;

const KIND_ROW_TINT = {
  added: 'bg-theme-added',
  removed: 'bg-theme-removed',
  modified: 'bg-theme-modified',
} as const;

const KIND_ICONS = { added: Plus, removed: Minus, modified: RefreshCw } as const;
const KIND_SORT_ORDER = { modified: 0, added: 1, removed: 2 } as const;

const COLUMNS: { key: SortKey; header: string }[] = [
  { key: 'kind', header: 'Status' },
  { key: 'name', header: 'Name' },
  { key: 'tagType', header: 'Type' },
  { key: 'dataType', header: 'Data Type' },
  { key: 'radix', header: 'Style' },
  { key: 'externalAccess', header: 'Access' },
];

// ============================================================================
// Table Styles (CSS custom-property based, matching ladder-visualizer tables)
// ============================================================================

const S: Record<string, CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
  },
  filterBar: {
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  filterInput: {
    padding: '4px 8px',
    width: '100%',
    maxWidth: '250px',
    border: '1px solid var(--table-filter-border, #7a7a7a)',
    borderRadius: '0px',
    fontSize: '12px',
    fontFamily: 'var(--lv-font-family, inherit)',
    backgroundColor: 'var(--table-filter-bg, #ffffff)',
    color: 'var(--table-filter-text, #1e1e1e)',
  },
  countText: {
    color: 'var(--table-count-text, #444444)',
    fontSize: '12px',
    fontFamily: 'var(--lv-font-family, inherit)',
  },
  tableScroll: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'auto',
    border: '1px solid var(--table-container-border, #a0a0a0)',
    backgroundColor: 'var(--table-cell-bg, #ffffff)',
    minHeight: 0,
    margin: '0 12px 12px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
    backgroundColor: 'var(--table-cell-bg, #ffffff)',
  },
  th: {
    padding: '6px 8px',
    textAlign: 'left',
    cursor: 'pointer',
    background: 'var(--table-header-bg, linear-gradient(180deg, #f7f8fa 0%, #e3e7eb 100%))',
    borderBottom: '1px solid var(--table-header-border, #a0a0a0)',
    borderRight: '1px solid var(--table-header-border-right, #d0d0d0)',
    fontWeight: 600,
    fontSize: '12px',
    fontFamily: 'var(--lv-font-family, inherit)',
    userSelect: 'none',
    color: 'var(--table-header-text, #1e1e1e)',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  td: {
    padding: '4px 8px',
    borderBottom: '1px solid var(--table-cell-border, #e0e0e0)',
    borderRight: '1px solid var(--table-cell-border-right, #e8e8e8)',
    fontSize: '12px',
    fontFamily: 'var(--lv-font-family, inherit)',
    color: 'var(--table-cell-text, #1e1e1e)',
  },
  mono: {
    fontFamily: 'var(--lv-font-mono, var(--lv-font-family, inherit))',
  },
};

// ============================================================================
// Helpers
// ============================================================================

function displayTag(td: TagDiff): NormalizedTag | undefined {
  return td.newTag ?? td.oldTag;
}

function fmtValue(v: unknown): string {
  if (v === undefined || v === null) return '(none)';
  if (typeof v === 'object') {
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }
  return String(v);
}

// ============================================================================
// Sub-components
// ============================================================================

/** Inline property change shown inside an expanded detail row. */
const PropertyChangeRow = memo(function PropertyChangeRow({ change }: { change: PropertyChange }) {
  const oldVal = fmtValue(change.oldValue);
  const newVal = fmtValue(change.newValue);
  return (
    <div className="flex items-start gap-3 text-xs py-1">
      <span className="font-semibold min-w-[90px] shrink-0" style={{ color: 'var(--table-header-text, #1e1e1e)' }}>
        {change.property}
      </span>
      <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
        {change.oldValue !== undefined && (
          <span className="text-theme-removed line-through truncate" title={oldVal}>{oldVal}</span>
        )}
        {change.oldValue !== undefined && change.newValue !== undefined && (
          <span style={{ color: 'var(--table-count-text, #888)' }}>→</span>
        )}
        {change.newValue !== undefined && (
          <span className="text-theme-added truncate" title={newVal}>{newVal}</span>
        )}
      </div>
    </div>
  );
});

/** Change kind badge. */
const KindBadge = memo(function KindBadge({ kind }: { kind: TagDiff['kind'] }) {
  const Icon = KIND_ICONS[kind];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border ${KIND_BADGE_CLASSES[kind]}`}>
      <Icon size={10} />
      {kind}
    </span>
  );
});

/** Single diff row + optional expandable detail row for property changes. */
const DiffRow = memo(function DiffRow({ tagDiff, rowIndex }: { tagDiff: TagDiff; rowIndex: number }) {
  const hasDetails = tagDiff.kind === 'modified' && (tagDiff.propertyChanges?.length ?? 0) > 0;
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => { if (hasDetails) setExpanded(p => !p); }, [hasDetails]);
  const tag = displayTag(tagDiff);
  const altBg = rowIndex % 2 === 1 ? 'var(--table-row-alt-bg, #f5f5f5)' : undefined;

  return (
    <>
      <tr
        onClick={toggle}
        style={{ backgroundColor: altBg, cursor: hasDetails ? 'pointer' : 'default' }}
        className={`${KIND_ROW_TINT[tagDiff.kind]} hover:brightness-95 transition-[filter]`}
      >
        <td style={{ ...S.td, width: '90px', whiteSpace: 'nowrap' }}>
          <div className="flex items-center gap-1">
            {hasDetails ? (
              expanded
                ? <ChevronDown size={12} className="shrink-0 text-theme-muted" />
                : <ChevronRight size={12} className="shrink-0 text-theme-muted" />
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <KindBadge kind={tagDiff.kind} />
          </div>
        </td>
        <td style={{ ...S.td, ...S.mono }}>{tagDiff.name}</td>
        <td style={S.td}>{tag?.tagType ?? '-'}</td>
        <td style={{ ...S.td, ...S.mono }}>{tag?.dataType ?? '-'}</td>
        <td style={S.td}>{tag?.radix ?? '-'}</td>
        <td style={S.td}>{tag?.externalAccess ?? '-'}</td>
      </tr>

      {expanded && hasDetails && tagDiff.propertyChanges && (
        <tr>
          <td
            colSpan={6}
            style={{ ...S.td, padding: '8px 12px 8px 40px', backgroundColor: 'var(--table-row-alt-bg, #f5f5f5)' }}
          >
            <div className="space-y-0.5">
              {tagDiff.propertyChanges.map((pc, i) => (
                <PropertyChangeRow key={`${pc.property}-${i}`} change={pc} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

// ============================================================================
// Main Component
// ============================================================================

function DiffTagTable({
  tagDiffs,
  title,
  scopeName,
  defaultCollapsed = false,
  forceCollapsed,
}: DiffTagTableProps): JSX.Element | null {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const collapsed = forceCollapsed ?? isCollapsed;
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('kind');
  const [sortAsc, setSortAsc] = useState(true);

  const toggleCollapse = useCallback(() => setIsCollapsed(p => !p), []);

  const handleSort = useCallback((col: SortKey) => {
    setSortBy(prev => {
      if (prev === col) { setSortAsc(a => !a); return prev; }
      setSortAsc(true);
      return col;
    });
  }, []);

  const sortIndicator = useCallback(
    (col: SortKey) => (sortBy !== col ? '' : sortAsc ? ' ▲' : ' ▼'),
    [sortBy, sortAsc],
  );

  const summary = useMemo(
    () => tagDiffs.reduce(
      (acc, td) => { acc[td.kind]++; return acc; },
      { added: 0, removed: 0, modified: 0 },
    ),
    [tagDiffs],
  );

  const rows = useMemo(() => {
    let result = tagDiffs;

    if (filter) {
      const lf = filter.toLowerCase();
      result = result.filter(td => {
        const tag = displayTag(td);
        return (
          td.name.toLowerCase().includes(lf) ||
          td.kind.toLowerCase().includes(lf) ||
          (tag?.dataType?.toLowerCase().includes(lf) ?? false) ||
          (tag?.tagType?.toLowerCase().includes(lf) ?? false)
        );
      });
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      const tA = displayTag(a);
      const tB = displayTag(b);
      switch (sortBy) {
        case 'kind':
          cmp = KIND_SORT_ORDER[a.kind] - KIND_SORT_ORDER[b.kind];
          if (cmp === 0) cmp = a.name.localeCompare(b.name);
          break;
        case 'name':          cmp = a.name.localeCompare(b.name); break;
        case 'tagType':       cmp = (tA?.tagType ?? '').localeCompare(tB?.tagType ?? ''); break;
        case 'dataType':      cmp = (tA?.dataType ?? '').localeCompare(tB?.dataType ?? ''); break;
        case 'radix':         cmp = (tA?.radix ?? '').localeCompare(tB?.radix ?? ''); break;
        case 'externalAccess': cmp = (tA?.externalAccess ?? '').localeCompare(tB?.externalAccess ?? ''); break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [tagDiffs, filter, sortBy, sortAsc]);

  if (tagDiffs.length === 0) return null;

  return (
    <div className="border border-theme-default rounded-lg overflow-hidden bg-theme-surface/50">
      {/* Collapsible section header */}
      <button
        type="button"
        onClick={toggleCollapse}
        className="
          w-full flex items-center gap-2 px-4 py-2.5
          bg-theme-elevated hover:bg-theme-muted/30
          border-b border-theme-default
          transition-colors cursor-pointer select-none
        "
      >
        {collapsed
          ? <ChevronRight size={ICON_SIZES.sm} className="shrink-0 text-theme-secondary" />
          : <ChevronDown size={ICON_SIZES.sm} className="shrink-0 text-theme-secondary" />}

        <Tag size={ICON_SIZES.xs} className="shrink-0 text-theme-muted" />

        <span className="text-sm font-medium text-theme-primary">
          {scopeName ? `${scopeName} / ` : ''}{title}
        </span>

        <span className="text-xs text-theme-muted">
          ({tagDiffs.length} tag{tagDiffs.length !== 1 ? 's' : ''})
        </span>

        <span className="ml-auto text-xs shrink-0 flex items-center gap-2">
          {summary.added > 0 && <span className="text-theme-added">+{summary.added}</span>}
          {summary.removed > 0 && <span className="text-theme-removed">-{summary.removed}</span>}
          {summary.modified > 0 && <span className="text-theme-modified">~{summary.modified}</span>}
        </span>
      </button>

      {/* Table content */}
      {!collapsed && (
        <div style={S.wrapper}>
          <div style={S.filterBar}>
            <input
              type="text"
              placeholder="Filter tags..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={S.filterInput}
            />
            <span style={S.countText}>
              {rows.length} of {tagDiffs.length} tags
            </span>
          </div>

          <div style={S.tableScroll}>
            <table style={S.table}>
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th key={col.key} style={S.th} onClick={() => handleSort(col.key)}>
                      {col.header}{sortIndicator(col.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((td, idx) => (
                  <DiffRow key={td.name} tagDiff={td} rowIndex={idx} />
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...S.td, textAlign: 'center', padding: '16px' }}>
                      <span style={{ color: 'var(--table-count-text, #888)' }}>
                        No tags match the filter
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(DiffTagTable);
