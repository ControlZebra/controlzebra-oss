/**
 * EmptyState - Placeholder when nothing is selected.
 * Reusable across different views.
 */
import { memo } from 'react';
import { VIEWS } from '../../constants';

const VIEW_HINTS = {
  [VIEWS.EXPLORER]: 'Browse your project files',
  [VIEWS.CHANGES]: 'Click on a file to view changes',
  [VIEWS.HISTORY]: 'Click on a commit to view details',
  [VIEWS.SETTINGS]: 'Select a settings category',
  [VIEWS.PROFILE]: 'Connect your accounts',
};

function EmptyState({ activeView, customMessage }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center text-neutral-600 px-4">
        <p className="text-base">{customMessage || 'Select an item from the sidebar'}</p>
        <p className="text-sm mt-1">{VIEW_HINTS[activeView]}</p>
      </div>
    </div>
  );
}

export default memo(EmptyState);
