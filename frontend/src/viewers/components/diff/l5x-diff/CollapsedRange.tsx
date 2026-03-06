/**
 * CollapsedRange — "N rungs unchanged" expandable indicator.
 *
 * Displayed in the rung change stream between groups of changed/context rungs
 * to represent a contiguous block of unchanged rungs that has been collapsed.
 * Clicking expands to reveal the hidden rungs.
 */
import { memo, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { ICON_SIZES } from '../../../../constants';

// ============================================================================
// Types
// ============================================================================

export interface CollapsedRangeProps {
  /** First rung number in the collapsed range (0-indexed). */
  startRung: number;
  /** Last rung number in the collapsed range (0-indexed, inclusive). */
  endRung: number;
  /** Whether this range is currently expanded. */
  isExpanded: boolean;
  /** Called when the user clicks to expand/collapse. */
  onToggle: () => void;
}

// ============================================================================
// Component
// ============================================================================

function CollapsedRange({ startRung, endRung, isExpanded, onToggle }: CollapsedRangeProps): JSX.Element {
  const count = endRung - startRung + 1;
  const handleClick = useCallback(() => onToggle(), [onToggle]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="
        w-full flex items-center gap-2 px-4 py-1.5
        text-xs text-theme-muted
        bg-theme-surface/50 hover:bg-theme-muted/30
        border-y border-theme-muted/20
        transition-colors cursor-pointer select-none
      "
      aria-expanded={isExpanded}
    >
      {isExpanded ? (
        <ChevronDown size={ICON_SIZES.xs} className="shrink-0" />
      ) : (
        <ChevronRight size={ICON_SIZES.xs} className="shrink-0" />
      )}
      <span className="font-mono">
        {count} rung{count !== 1 ? 's' : ''} unchanged
      </span>
      <span className="text-theme-muted/60">
        (#{startRung}–#{endRung})
      </span>
    </button>
  );
}

export default memo(CollapsedRange);
