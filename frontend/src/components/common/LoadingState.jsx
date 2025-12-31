/**
 * LoadingState - Shows while loading diff/commit data.
 */
import { memo } from 'react';

function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-neutral-500 text-sm">{message}</div>
    </div>
  );
}

export default memo(LoadingState);
