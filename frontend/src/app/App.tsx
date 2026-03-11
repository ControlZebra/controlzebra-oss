import { useAuth } from '../context';
import { AppLayout } from '../widgets/layout';
import LoginView from '../features/auth/components/LoginView';
import Spinner from '../shared/ui/Spinner';
import { useLoginTheme } from '../shared/hooks/useLoginTheme';
import { AnalyticsProvider, AuthProvider, RepoProvider } from './providers';

function App(): JSX.Element {
  return (
    <AuthProvider>
      <AnalyticsProvider>
        <AuthGate />
      </AnalyticsProvider>
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
    </RepoProvider>
  );
}
