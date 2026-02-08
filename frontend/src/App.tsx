import { useEffect, useRef } from 'react';
import { AuthProvider, useAuth, RepoProvider } from './context';
import { AppLayout } from './components/layout';
import { UpdateChecker } from './components/common';
import { initAnalytics, trackAppLaunched, trackAppClosed } from './lib/analytics';
import LoginView from './components/layout/views/LoginView';
import Spinner from './components/common/Spinner';
import { useLoginTheme } from './hooks/useLoginTheme';

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
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

export default App;

function AuthGate(): JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();

  // Apply theme before LayoutProvider is available (pre-auth screens)
  useLoginTheme();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-theme-base text-theme-primary">
        <div className="flex items-center gap-2 text-sm text-theme-muted">
          <Spinner size={16} />
          <span>Loading session…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <RepoProvider>
      <AppLayout />
      <UpdateChecker />
    </RepoProvider>
  );
}
