import { memo } from 'react';
import { VIEWS } from '../../constants';
import { useLayout } from '../../context';

const VIEW_HINTS = {
  [VIEWS.CHANGES]: 'Click on a file to view changes',
  [VIEWS.HISTORY]: 'Click on a commit to view details',
  [VIEWS.SETTINGS]: 'Select a settings category',
  [VIEWS.PROFILE]: 'Connect your accounts',
};

function MainArea() {
  const { activeView } = useLayout();

  return (
    <main className="flex-1 bg-gray-900 flex items-center justify-center min-w-0">
      <div className="text-center text-gray-600 px-4">
        <p className="text-base">Select an item from the sidebar</p>
        <p className="text-sm mt-1">{VIEW_HINTS[activeView]}</p>
      </div>
    </main>
  );
}

export default memo(MainArea);
