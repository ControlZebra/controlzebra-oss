/**
 * TagDiffSection — Displays tag changes in L5X diff views using a table layout.
 *
 * Renders a collapsible section with a table matching the TagTable style:
 * - Columns: Status, Name, Type, Data Type, Style, Access
 * - Row tinting by change kind (green/red/yellow)
 * - Expandable property-change detail rows for modified tags
 * - Filter input and sorting (matching GenericTable patterns)
 *
 * Used for both controller-scoped and program-scoped tags.
 */
import { memo, useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, Tag, Plus, Minus, RefreshCw } from 'lucide-react';
import type { TagDiff, PropertyChange, NormalizedTag } from 'ladder-visualizer';
import { ICON_SIZES } from '../../../../constants';

// ============================================================================
// Types
// ============================================================================

export interface TagDiffSectionProps {
  /** Array of tag diffs to display. */
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
// Helpers
// ============================================================================

/** Badge classes for change kind indicators. */
const kindBadgeClasses = {
  added: 'text-theme-added bg-theme-added border-theme-added',
  removed: 'text-theme-removed bg-theme-removed border-theme-removed',
  modified: 'text-theme-modified bg-theme-modified border-theme-modified',
};

/** Subtle row tint classes by change kind. */
const kindRowTint = {
  added: 'bg-theme-added',
  removed: 'bg-theme-removed',
  modified: 'bg-theme-modified',
};

const kindIcons = {
  added: Plus,
  removed: Minus,
  modified: RefreshCw,
};

const kindSortOrder = { modified: 0, added: 1, removed: 2 };

/** Get the display tag from a TagDiff (prefer new, fall back to old). */
function getDisplayTag(td: TagDiff): NormalizedTag | undefined {
  return td.newTag ?? td.oldTag;
}

/** Format a property value for display. */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '(none)';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ============================================================================
// Table Styles (CSS custom-property based, matching ladder-visualizer tables)
// ============================================================================

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    minHeight: 0,
  },
  filterContainer: {
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
  tableContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'auto' as const,
    border: '1px solid var(--table-container-border, #a0a0a0)',
    backgroundColor: 'var(--table-cell-bg, #ffffff)',
    minHeight: 0,
    margin: '0 12px 12px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '12px',
    backgroundColor: 'var(--table-cell-bg, #ffffff)',
  },
  header: {
    padding: '6px 8px',
    textAlign: 'left' as const,
    cursor: 'pointer',
    background: 'var(--table-header-bg, linear-gradient(180deg, #f7f8fa 0%, #e3e7eb 100%))',
    borderBottom: '1px solid var(--table-header-border, #a0a0a0)',
    borderRight: '1px solid var(--table-header-border-right, #d0d0d0)',
    fontWeight: 600,
    fontSize: '12px',
    fontFamily: 'var(--lv-font-family, inherit)',
    userSelect: 'none' as const,
    color: 'var(--table-header-text, #1e1e1e)',
    whiteSpace: 'nowrap' as const,
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
  },
  cell: {
    padding: '4px 8px',
    borderBottom: '1px solid var(--table-cell-border, #e0e0e0)',
    borderRight: '1px solid var(--table-cell-border-right, #e8e8e8)',
    fontSize: '12px',
    fontFamily: 'var(--lv-font-family, inherit)',
    color: 'var(--table-cell-text, #1e1e1e)',
  },
  monoCell: {
    fontFamily: 'var(--lv-font-mono, var(--lv-font-family, inherit))',
  },
};

// ============================================================================
// Sub-components
// ============================================================================

/** Inline property change row shown inside expanded table detail row. */
const PropertyChangeRow = memo(function PropertyChangeRow({
  change,
}: {
  change: PropertyChange;
}): JSX.Element {
  const oldVal = formatValue(change.oldValue);
  const newVal = formatValue(change.newValue);

  return (
    <div className="flex items-start gap-3 text-xs py-1">
      <span className="font-semibold min-w-[90px] shrink-0" style={{ color: 'var(--table-header-text, #1e1e1e)' }}>
        {change.property}
      </span>
      <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
        {change.oldValue !== undefined && (
          <span className="text-theme-removed line-through truncate" title={oldVal}>
            {oldVal}
          </span>
        )}
        {change.oldValue !== undefined && change.newValue !== undefined && (
          <span style={{ color: 'var(--table-count-text, #888)' }}>→</span>
        )}
        {change.newValue !== undefined && (
          <span className="text-theme-added truncate" title={newVal}>
            {newVal}
          </span>
        )}
      </div>
    </div>
  );
});

/** Change kind badge cell content. */
const KindBadge = memo(function KindBadge({ kind }: { kind: TagDiff['kind'] }) {
  const Icon = kindIcons[kind];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border ${kindBadgeClasses[kind]}`}>
      <Icon size={10} />
      {kind}
    </span>
  );
});

/** A single tag diff table row + optional expanded detail row. */
const TagDiffRow = memo(function TagDiffRow({
  tagDiff,
  rowIndex,
}: {
  tagDiff: TagDiff;
  rowIndex: number;
}) {
  const hasDetails =
    tagDiff.kind === 'modified' &&
    tagDiff.propertyChanges &&
    tagDiff.propertyChanges.length > 0;

  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    if (hasDetails) setIsExpanded((prev) => !prev);
  }, [hasDetails]);

  const tag = getDisplayTag(tagDiff);
  const altBg = rowIndex % 2 === 1 ? 'var(--table-row-alt-bg, #f5f5f5)' : undefined;

  return (
    <>
      {/* Main data row */}
      <tr
        onClick={toggleExpand}
        style={{
          backgroundColor: altBg,
          cursor: hasDetails ? 'pointer' : 'default',
        }}
        className={`${kindRowTint[tagDiff.kind]} hover:brightness-95 transition-[filter]`}
      >
        {/* Expand indicator + Kind badge */}
        <td style={{ ...styles.cell, width: '90px', whiteSpace: 'nowrap' }}>
          <div className="flex items-center gap-1">
            {hasDetails ? (
              isExpanded ? (
                <ChevronDown size={12} className="shrink-0 text-theme-muted" />
              ) : (
                <ChevronRight size={12} className="shrink-0 text-theme-muted" />
              )
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <KindBadge kind={tagDiff.kind} />
          </div>
        </td>
        {/* Name */}
        <td style={{ ...styles.cell, ...styles.monoCell }}>
          {tagDiff.name}
        </td>
        {/* Type */}
        <td style={styles.cell}>
          {tag?.tagType ?? '-'}
        </td>
        {/* Data Type */}
        <td style={{ ...styles.cell, ...styles.monoCell }}>
          {tag?.dataType ?? '-'}
        </td>
        {/* Style (radix) */}
        <td style={styles.cell}>
          {tag?.radix ?? '-'}
        </td>
        {/* Access */}
        <td style={styles.cell}>
          {tag?.externalAccess ?? '-'}
        </td>
      </tr>

      {/* Expanded property changes row */}
      {isExpanded && hasDetails && tagDiff.propertyChanges && (
        <tr>
          <td
            colSpan={6}
            style={{
              ...styles.cell,
              padding: '8px 12px 8px 40px',
              backgroundColor: 'var(--table-row-alt-bg, #f5f5f5)',
            }}
          >
            <div className="space-y-0.5">
              {tagDiff.propertyChanges.map((pc, idx) => (
                <PropertyChangeRow key={`${pc.property}-${idx}`} change={pc} />
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

function TagDiffSection({
  tagDiffs,
  title,
  scopeName,
  defaultCollapsed = false,
  forceCollapsed,
}: TagDiffSectionProps): JSX.Element | null {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const collapsed = forceCollapsed ?? isCollapsed;
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('kind');
  const [sortAsc, setSortAsc] = useState(true);

  const toggleCollapse = useCallback(() => setIsCollapsed((prev) => !prev), []);

  // Handle column header click for sorting
  const handleSort = useCallback((column: SortKey) => {
    setSortBy((prev) => {
      if (prev === column) {
        setSortAsc((a) => !a);
        return prev;
      }
      setSortAsc(true);
      return column;
    });
  }, []);

  const getSortIndicator = useCallback(
    (column: SortKey) => {
      if (sortBy !== column) return '';
      return sortAsc ? ' ▲' : ' ▼';
    },
    [sortBy, sortAsc]
  );

  // Group tags by change kind for summary
  const summary = useMemo(() => {
    return tagDiffs.reduce(
      (acc, td) => {
        acc[td.kind]++;
        return acc;
      },
      { added: 0, removed: 0, modified: 0 }
    );
  }, [tagDiffs]);

  // Filter and sort tag diffs
  const filteredAndSorted = useMemo(() => {
    let result = tagDiffs;

    // Filter
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter((td) => {
        const tag = getDisplayTag(td);
        return (
          td.name.toLowerCase().includes(lowerFilter) ||
          td.kind.toLowerCase().includes(lowerFilter) ||
          (tag?.dataType?.toLowerCase().includes(lowerFilter) ?? false) ||
          (tag?.tagType?.toLowerCase().includes(lowerFilter) ?? false)
        );
      });
    }

    // Sort
    return [...result].sort((a, b) => {
      let cmp = 0;
      const tagA = getDisplayTag(a);
      const tagB = getDisplayTag(b);

      switch (sortBy) {
        case 'kind':
          cmp = kindSortOrder[a.kind] - kindSortOrder[b.kind];
          if (cmp === 0) cmp = a.name.localeCompare(b.name);
          break;
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'tagType':
          cmp = (tagA?.tagType ?? '').localeCompare(tagB?.tagType ?? '');
          break;
        case 'dataType':
          cmp = (tagA?.dataType ?? '').localeCompare(tagB?.dataType ?? '');
          break;
        case 'radix':
          cmp = (tagA?.radix ?? '').localeCompare(tagB?.radix ?? '');
          break;
        case 'externalAccess':
          cmp = (tagA?.externalAccess ?? '').localeCompare(tagB?.externalAccess ?? '');
          break;
      }

      return sortAsc ? cmp : -cmp;
    });
  }, [tagDiffs, filter, sortBy, sortAsc]);

  if (tagDiffs.length === 0) return null;

  // Column definitions for the header
  const columns: { key: SortKey; header: string }[] = [
    { key: 'kind', header: 'Status' },
    { key: 'name', header: 'Name' },
    { key: 'tagType', header: 'Type' },
    { key: 'dataType', header: 'Data Type' },
    { key: 'radix', header: 'Style' },
    { key: 'externalAccess', header: 'Access' },
  ];

  return (
    <div className="border border-theme-default rounded-lg overflow-hidden bg-theme-surface/50">
      {/* Section header */}
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
        {collapsed ? (
          <ChevronRight size={ICON_SIZES.sm} className="shrink-0 text-theme-secondary" />
        ) : (
          <ChevronDown size={ICON_SIZES.sm} className="shrink-0 text-theme-secondary" />
        )}

        <Tag size={ICON_SIZES.xs} className="shrink-0 text-theme-muted" />

        <span className="text-sm font-medium text-theme-primary">
          {scopeName ? `${scopeName} / ` : ''}{title}
        </span>

        <span className="text-xs text-theme-muted">
          ({tagDiffs.length} tag{tagDiffs.length !== 1 ? 's' : ''})
        </span>

        {/* Summary badges */}
        <span className="ml-auto text-xs shrink-0 flex items-center gap-2">
          {summary.added > 0 && (
            <span className="text-theme-added">+{summary.added}</span>
          )}
          {summary.removed > 0 && (
            <span className="text-theme-removed">-{summary.removed}</span>
          )}
          {summary.modified > 0 && (
            <span className="text-theme-modified">~{summary.modified}</span>
          )}
        </span>
      </button>

      {/* Table content */}
      {!collapsed && (
        <div style={styles.wrapper}>
          {/* Filter bar */}
          <div style={styles.filterContainer}>
            <input
              type="text"
              placeholder="Filter tags..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={styles.filterInput}
            />
            <span style={styles.countText}>
              {filteredAndSorted.length} of {tagDiffs.length} tags
            </span>
          </div>

          {/* Table */}
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      style={styles.header}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.header}{getSortIndicator(col.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((td, idx) => (
                  <TagDiffRow key={td.name} tagDiff={td} rowIndex={idx} />
                ))}
                {filteredAndSorted.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...styles.cell, textAlign: 'center', padding: '16px' }}>
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

export default memo(TagDiffSection);
