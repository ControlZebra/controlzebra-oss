/**
 * One row in the sidebar conflict list.
 *
 * Rows show the filename only; everything else the user might need — what
 * happened, why the app can't open it, and the full path — lives in the
 * tooltip so the narrow sidebar stays readable.
 */
import { memo } from 'react';
import { FileWarning } from 'lucide-react';

import { ICON_SIZES } from '../../../../shared/constants';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../shared/ui';
import type { ConflictQueueEntry } from '../../../../../bindings/controlzebra/services/models';
import {
  getConflictFileName,
  getConflictTooltip,
  isConflictEntryResolvable,
} from '../../lib/conflict-queue-presentation';

interface ConflictQueueRowProps {
  entry: ConflictQueueEntry;
  onSelect: (entry: ConflictQueueEntry) => void;
}

function ConflictQueueRow({ entry, onSelect }: ConflictQueueRowProps): JSX.Element {
  const isResolvable = isConflictEntryResolvable(entry);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(entry)}
          aria-label={getConflictTooltip(entry)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs rounded-none hover:bg-theme-elevated ${
            isResolvable ? 'text-theme-primary' : 'text-theme-muted'
          }`}
        >
          <FileWarning
            style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }}
            className="shrink-0 text-theme-warning"
            aria-hidden="true"
          />
          <span className="truncate">{getConflictFileName(entry)}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs whitespace-pre-line">
        {getConflictTooltip(entry)}
      </TooltipContent>
    </Tooltip>
  );
}

export default memo(ConflictQueueRow);
