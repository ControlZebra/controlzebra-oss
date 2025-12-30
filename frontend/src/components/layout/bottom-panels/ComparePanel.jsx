/**
 * ComparePanel - Bottom panel for comparing file changes.
 * This is a placeholder component - functionality to be implemented.
 */
import { memo } from 'react';
import { GitCompare } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';

function ComparePanel() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-500">
      <GitCompare style={{ width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 }} className="mb-3 opacity-50" />
      <p className="text-sm font-medium">Compare Changes</p>
      <p className="text-xs mt-1">Select files to compare their changes</p>
      <p className="text-xs text-gray-600 mt-4">Coming soon...</p>
    </div>
  );
}

export default memo(ComparePanel);
