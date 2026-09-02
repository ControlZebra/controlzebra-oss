import { lazy, memo, Suspense } from 'react';
import { useLayout, useRepo } from '../../context';
import { Toaster, ProgressModal } from '../../shared/ui';
import RecoveryBanner from '../../shared/ui/RecoveryBanner';
import TitleBar from './TitleBar';
import TopBar from './TopBar';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import MainArea from './MainArea';
import StatusBar from './StatusBar';
import NonGitFolderPromptModal from './NonGitFolderPromptModal';
import AdditionalPackagesModal from './AdditionalPackagesModal';
import GitIdentityPromptModal from './GitIdentityPromptModal';
import DefaultBranchSyncConfirmModal from './DefaultBranchSyncConfirmModal';

// Mounted only while open so the merge/conflict bundle (including the ladder
// visualizer) is fetched on demand and unrelated repo updates cannot re-render it.
const ExplorerMergeModal = lazy(() => import('../../features/merge/components/ExplorerMergeModal'));

/**
 * AppLayoutInner - Inner component that has access to RepoContext and LayoutContext.
 */
function AppLayoutInner(): JSX.Element {
  const { progressModal, handleProgressComplete } = useRepo();
  const { explorerMergeModalOpen, setExplorerMergeModalOpen } = useLayout();

  return (
    <div className="h-screen w-screen flex flex-col bg-theme-base text-theme-primary overflow-hidden">
      <TitleBar />
      <TopBar />
      <RecoveryBanner />
      <Toaster />
      
      {/* Progress Modal for git operations */}
      <ProgressModal
        open={progressModal.isOpen}
        operationId={progressModal.operationId || ''}
        title={progressModal.title}
        onComplete={handleProgressComplete}
      />

      <NonGitFolderPromptModal />
      <AdditionalPackagesModal />
      <GitIdentityPromptModal />
      <DefaultBranchSyncConfirmModal />
      {explorerMergeModalOpen && (
        <Suspense fallback={null}>
          <ExplorerMergeModal
            open={explorerMergeModalOpen}
            onOpenChange={setExplorerMergeModalOpen}
          />
        </Suspense>
      )}
      
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left side: Activity bar + Sidebar (full height) */}
        <ActivityBar />
        <Sidebar />
        
        {/* Right side: Main area + Status bar */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <MainArea />
          <StatusBar />
        </div>
      </div>
    </div>
  );
}

/**
 * AppLayout - Root layout component for the application
 */
function AppLayout(): JSX.Element {
  return <AppLayoutInner />;
}

export default memo(AppLayout);
