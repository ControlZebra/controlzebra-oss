import { memo } from 'react';
import { LayoutProvider, useRepo } from '../../context';
import { Toaster, ProgressModal } from '../ui';
import TopBar from './TopBar';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import MainArea from './MainArea';
import BottomPanel from './BottomPanel';
import StatusBar from './StatusBar';

// Inner component that has access to RepoContext
function AppLayoutInner() {
  const { progressModal, handleProgressComplete } = useRepo();

  return (
    <LayoutProvider>
      <div className="h-screen w-screen flex flex-col bg-theme-base text-theme-primary overflow-hidden">
        <TopBar />
        <Toaster />
        
        {/* Progress Modal for git operations */}
        <ProgressModal
          isOpen={progressModal.isOpen}
          operationId={progressModal.operationId}
          title={progressModal.title}
          onComplete={handleProgressComplete}
        />
        
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left side: Activity bar + Sidebar (full height) */}
          <ActivityBar />
          <Sidebar />
          
          {/* Right side: Main area + Bottom panel + Status bar */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <MainArea />
            <BottomPanel />
            <StatusBar />
          </div>
        </div>
      </div>
    </LayoutProvider>
  );
}

function AppLayout() {
  return <AppLayoutInner />;
}

export default memo(AppLayout);
