import { memo } from 'react';
import { LayoutProvider } from '../../context';
import { Toaster } from '../ui/sonner';
import TopBar from './TopBar';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import MainArea from './MainArea';
import BottomPanel from './BottomPanel';
import StatusBar from './StatusBar';

function AppLayout() {
  return (
    <LayoutProvider>
      <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden">
        <TopBar />
        <Toaster />
        
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

export default memo(AppLayout);
