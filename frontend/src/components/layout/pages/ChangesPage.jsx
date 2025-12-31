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
    return <DiffViewer fileDiff={currentDiff} showHeader={true} />;
  }

  return <EmptyState activeView={VIEWS.CHANGES} />;
}

export default memo(ChangesPage);
