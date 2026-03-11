/**
 * LogFilterBar - Search input + category filter tabs for the debug log view.
 * Manages filter state locally and passes the active filter up via callback.
 */
import { memo, useCallback, type CSSProperties } from 'react';
import { Search, X } from 'lucide-react';
import { ICON_SIZES } from '../../../shared/constants';

// Category tab definitions
const CATEGORIES = [
  { id: '', label: 'All' },
  { id: 'command', label: 'Command' },
  { id: 'method', label: 'Method' },
  { id: 'error', label: 'Error' },
  { id: 'lifecycle', label: 'Lifecycle' },
] as const;

interface LogFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

const iconStyle: CSSProperties = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

function LogFilterBar({
  search,
  onSearchChange,
  activeCategory,
  onCategoryChange,
}: LogFilterBarProps): JSX.Element {
  const handleClear = useCallback(() => onSearchChange(''), [onSearchChange]);

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5 border-b border-theme-default shrink-0">
      {/* Search bar */}
      <div className="relative">
        <Search
          style={iconStyle}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search logs..."
          className="w-full h-7 pl-7 pr-7 text-xs bg-theme-surface border border-theme-default rounded
                     text-theme-primary placeholder:text-theme-muted
                     focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50"
        />
        {search && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-secondary"
            aria-label="Clear search"
          >
            <X style={iconStyle} />
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-0.5">
        {CATEGORIES.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onCategoryChange(id)}
            className={`
              px-2 py-0.5 text-[11px] rounded transition-colors
              ${activeCategory === id
                ? 'bg-blue-600/20 text-blue-400 font-medium'
                : 'text-theme-muted hover:text-theme-secondary hover:bg-theme-muted/50'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default memo(LogFilterBar);
