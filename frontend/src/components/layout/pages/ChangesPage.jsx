/**
 * ChangesPage - Main area content for Changes/Source Control view.
 * Shows file diff when a changed file is selected.
 */
import { memo } from 'react';
import { VIEWS } from '../../../constants';
import { useRepo } from '../../../context';
import { DiffViewer, EmptyState, LoadingState } from '../../common';

function ChangesPage() {
  const { selectedFileIndex, currentDiff, isDiffLoading } = useRepo();

  if (isDiffLoading) {
    return <LoadingState />;
  }

  // Working tree file selected
  if (selectedFileIndex !== null && currentDiff) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden">
        <DiffViewer fileDiff={currentDiff} showHeader={true} />
      </div>
    );
  }

  return <EmptyState activeView={VIEWS.CHANGES} />;
}

export default memo(ChangesPage);
