/**
 * HistoryView - Commit history with toggle between compact list and git graph.
 * - Compact list: Space-efficient, shows time + truncated message with hover details
 * - Git graph: Visual branch/merge topology
 * Clicking a commit loads its details in MainArea.
 */
import { memo } from 'react';
import HistoryTimeline from './HistoryTimeline';

function HistoryView(): JSX.Element {
  return <HistoryTimeline showNoRepoState />;
}

export default memo(HistoryView);
