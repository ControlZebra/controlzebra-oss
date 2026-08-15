/**
 * Sidebar section listing files that still need a conflict decision.
 *
 * It renders only when the queue is non-empty, so the sidebar is unchanged
 * during normal work and the list appears the moment a merge, pull, rebase or
 * cherry-pick leaves something unmerged.
 */
import { memo } from 'react';
import { AlertTriangle } from 'lucide-react';

import { ICON_SIZES } from '../../../../shared/constants';
import { TooltipProvider } from '../../../../shared/ui';
import type { ConflictQueueEntry } from '../../../../../bindings/controlzebra/services/models';
import { useConflictQueue } from '../../context/ConflictQueueContext';
import ConflictQueueRow from './ConflictQueueRow';

interface ConflictQueueSectionProps {
  onSelectFile: (entry: ConflictQueueEntry) => void;
}

function ConflictQueueSection({ onSelectFile }: ConflictQueueSectionProps): JSX.Element | null {
  const { entries, error, isEmpty } = useConflictQueue();

  if (isEmpty) {
    return null;
  }

  return (
    <section
      className="shrink-0 max-h-[40%] flex flex-col border-t border-theme-default"
      aria-label="Conflicts"
    >
      <header className="px-3 py-2 border-b border-theme-default shrink-0 flex items-center gap-2">
        <AlertTriangle
          style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }}
          className="shrink-0 text-theme-warning"
          aria-hidden="true"
        />
        <h3 className="text-theme-muted text-xs font-sans font-medium tracking-wide">
          Conflicts ({entries.length})
        </h3>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {error ? (
          <p className="px-3 py-2 text-xs text-theme-warning">
            This list may be out of date. Try again after your next action.
          </p>
        ) : null}
        <TooltipProvider delayDuration={300}>
          <ul>
            {entries.map((entry) => (
              <li key={entry.path}>
                <ConflictQueueRow entry={entry} onSelect={onSelectFile} />
              </li>
            ))}
          </ul>
        </TooltipProvider>
      </div>
    </section>
  );
}

export default memo(ConflictQueueSection);
