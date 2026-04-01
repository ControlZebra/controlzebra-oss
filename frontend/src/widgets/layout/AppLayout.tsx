import { memo } from 'react';
import { LayoutProvider, UpdateProvider, useLayout, useRepo } from '../../context';
import { Toaster, ProgressModal } from '../../shared/ui';
import RecoveryBanner from '../../shared/ui/RecoveryBanner';
import ExplorerMergeModal from '../../features/merge/components/ExplorerMergeModal';
import TitleBar from './TitleBar';
import TopBar from './TopBar';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import MainArea from './MainArea';
import StatusBar from './StatusBar';
import NonGitFolderPromptModal from './NonGitFolderPromptModal';
import AdditionalPackagesModal from './AdditionalPackagesModal';
import GitIdentityPromptModal from './GitIdentityPromptModal';

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
      <ExplorerMergeModal
        open={explorerMergeModalOpen}
        onOpenChange={setExplorerMergeModalOpen}
      />
      
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
  return (
    <UpdateProvider>
      <LayoutProvider>
        <AppLayoutInner />
      </LayoutProvider>
    </UpdateProvider>
  );
}

export default memo(AppLayout);
