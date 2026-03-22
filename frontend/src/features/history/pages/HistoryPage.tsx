/**
 * HistoryPage - Main area content for Commit History view.
 * Shows commit details + file list, or file diff when viewing a specific file.
 */
import { memo, useCallback } from 'react';
import { VIEWS } from '../../../shared/constants';
import { useRepo } from '../../../context';
import EmptyState from '../../../shared/ui/EmptyState';
import CommitOverviewPanel from '../components/CommitOverviewPanel';

function HistoryPage(): JSX.Element {
  const { 
    repoPath,
    repoInfo,
    repoStatus,
    branches,
    graphCommits,
    selectedCommit,
    selectedCommitFile,
    currentDiff,
    isDiffLoading,
    loadCommitFileDiff,
    selectCommit,
    revertCommit,
  } = useRepo();

  // Handle clicking a file in commit detail view
  const handleCommitFileSelect = useCallback((filePath: string): void => {
    loadCommitFileDiff(filePath);
  }, [loadCommitFileDiff]);

  // Go back from file diff to commit overview
  const handleBackToCommit = useCallback((): void => {
    if (selectedCommit) {
      selectCommit(selectedCommit.hash);
    }
  }, [selectedCommit, selectCommit]);

  if (selectedCommit) {
    return (
      <CommitOverviewPanel
        repoPath={repoPath}
        commit={selectedCommit}
        graphCommits={graphCommits}
        branches={branches}
        repoStatus={repoStatus}
        repoInfo={repoInfo}
        selectedFilePath={selectedCommitFile}
        currentDiff={currentDiff}
        isDiffLoading={isDiffLoading}
        onSelectFile={handleCommitFileSelect}
        onBackToCommit={handleBackToCommit}
        onRestoreCommit={revertCommit}
      />
    );
  }

  return <EmptyState activeView={VIEWS.HISTORY} />;
}

export default memo(HistoryPage);
