import { l5xConflictVisualAdapter } from 'ladder-visualizer';
import type { VisualConflictFallback, VisualConflictRegion } from 'ladder-visualizer';

import type { ConflictRegion } from '../types';
import { expandRegionToSemanticUnit } from './l5x-region-expansion';

function joinRegionLines(lines: readonly string[], newline: string): string {
  return lines.join(newline);
}

/**
 * Classifies a Git conflict region for visual L5X presentation. Context is used
 * only to reconstruct a complete semantic unit for preview; the original region
 * lines remain authoritative for resolution and composition.
 */
export function classifyL5XRegion(
  region: ConflictRegion,
  newline: string,
): VisualConflictRegion | VisualConflictFallback {
  const expanded = expandRegionToSemanticUnit(region, newline);
  if (expanded) {
    const result = l5xConflictVisualAdapter.classifyRegion(expanded.current, expanded.incoming);
    if ('kind' in result) {
      return result;
    }
  }

  return l5xConflictVisualAdapter.classifyRegion(
    joinRegionLines(region.current, newline),
    joinRegionLines(region.incoming, newline),
  );
}
