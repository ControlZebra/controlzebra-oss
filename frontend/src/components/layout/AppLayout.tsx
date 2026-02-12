import { memo } from 'react';
import { LayoutProvider, useRepo } from '../../context';
import { Toaster, ProgressModal } from '../ui';
import { RecoveryBanner } from '../common';
import TopBar from './TopBar';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import MainArea from './MainArea';
import StatusBar from './StatusBar';
import NonGitFolderPromptModal from './NonGitFolderPromptModal';

/**
 * AppLayoutInner - Inner component that has access to RepoContext
 */
function AppLayoutInner(): JSX.Element {
  const { progressModal, handleProgressComplete } = useRepo();

  return (
    <LayoutProvider>
      <div className="h-screen w-screen flex flex-col bg-theme-base text-theme-primary overflow-hidden">
        <TopBar />
        <RecoveryBanner />
        <Toaster />
        
        {/* Progress Modal for git operations */}
        <ProgressModal
          isOpen={progressModal.isOpen}
          operationId={progressModal.operationId || ''}
          title={progressModal.title}
          onComplete={handleProgressComplete}
        />

        <NonGitFolderPromptModal />
        
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
    </LayoutProvider>
  );
}

/**
 * AppLayout - Root layout component for the application
 */
function AppLayout(): JSX.Element {
  return <AppLayoutInner />;
}

export default memo(AppLayout);
