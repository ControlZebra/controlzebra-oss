import { useEffect, useRef } from 'react';
import { RepoProvider } from './context';
import { AppLayout } from './components/layout';
import { UpdateChecker } from './components/common';
import { initAnalytics, trackAppLaunched, trackAppClosed } from './lib/analytics';

// Check if this is first launch by looking for a stored flag
const isFirstLaunch = !localStorage.getItem('cz_has_launched');
if (isFirstLaunch) {
  localStorage.setItem('cz_has_launched', 'true');
}

// Detect platform
function getPlatform(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('win')) return 'windows';
  if (userAgent.includes('mac')) return 'macos';
  if (userAgent.includes('linux')) return 'linux';
  return 'unknown';
}

function App(): JSX.Element {
  const appStartTime = useRef<number>(Date.now());
  const reposOpened = useRef<number>(0);

  // Initialize analytics on app launch
  useEffect(() => {
    initAnalytics();

    trackAppLaunched({
      platform: getPlatform(),
      isFirstLaunch,
    });

    // Track app close on beforeunload
    const handleBeforeUnload = () => {
      const sessionDuration = Math.round((Date.now() - appStartTime.current) / 1000);
      trackAppClosed({
        sessionDurationSeconds: sessionDuration,
        reposOpened: reposOpened.current,
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return (
    <RepoProvider>
      <AppLayout />
      <UpdateChecker />
    </RepoProvider>
  );
}

export default App;
