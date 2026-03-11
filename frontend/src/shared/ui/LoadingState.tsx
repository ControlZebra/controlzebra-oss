/**
 * LoadingState - Shows while loading diff/commit data.
 */
import { memo } from 'react';

interface LoadingStateProps {
  message?: string;
}

function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-theme-muted text-sm">{message}</div>
    </div>
  );
}

export default memo(LoadingState);
