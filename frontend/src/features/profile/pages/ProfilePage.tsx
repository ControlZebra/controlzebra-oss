/**
 * ProfilePage - Main area content for Profile view.
 * Full GitHub/GitLab account connection management.
 */
import { memo, useState, useCallback, type CSSProperties, type JSX } from 'react';
import {
  UserCircle,
  Github,
  Check,
  AlertCircle,
  Loader2,
  LogOut,
  Cloud,
  Settings2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ICON_SIZES } from '../../../shared/constants';
import { useAuth, useRepo } from '../../../context';
import GitLabIcon from '../../../shared/icons/GitLabIcon';
import GitHubDeviceFlowModal from '../../auth/components/GitHubDeviceFlowModal';
import { useGitHubDeviceFlow } from '../../auth/hooks/useGitHubDeviceFlow';
import LoginView from '../../auth/components/LoginView';
import AccountFeatureGate from '../../auth/components/AccountFeatureGate';
import { Badge, Button } from '../../../shared/ui';

interface FutureCloudFeature {
  title: string;
  description: string;
  Icon: LucideIcon;
}

const FUTURE_CLOUD_FEATURES: FutureCloudFeature[] = [
  {
    title: 'Settings Sync',
    description: 'Keep app preferences and safety defaults aligned across devices tied to your ControlZebra account.',
    Icon: Settings2,
  },
  {
    title: 'Shared Workspaces',
    description: 'Share project context and guided setup with teammates without changing the local Git workflow.',
    Icon: Users,
  },
  {
    title: 'Cloud Activity Feed',
    description: 'See account-backed handoff history and collaboration events separate from the repository timeline.',
    Icon: Cloud,
  },
];

function ProfilePage(): JSX.Element {
  const avatarSize = ICON_SIZES.lg * 3;
  const avatarStyle: CSSProperties = { width: avatarSize, height: avatarSize };
  const { isAuthenticated, isAuthAvailable, userEmail, userName, logout } = useAuth();

  const { 
    ghInstalled, 
    isInstallingPackages,
    installRequiredPackages,
    ghAuthStatus, 
    isCheckingGhAuth,
    logoutGitHub,
  } = useRepo();
  
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDisconnectingGitHub, setIsDisconnectingGitHub] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    deviceFlow,
    startDeviceFlow,
    closeDeviceFlow,
    handleDeviceFlowOpenChange,
  } = useGitHubDeviceFlow({ onStartError: setError });

  // Start the GitHub login flow
  const handleGitHubConnect = useCallback(async () => {
    setError(null);
    await startDeviceFlow();
  }, [startDeviceFlow]);

  // Disconnect from GitHub
  const handleGitHubDisconnect = useCallback(async () => {
    setError(null);
    setIsDisconnectingGitHub(true);
    try {
      const result = await logoutGitHub();
      if (!result.success) {
        setError(result.error || 'Logout failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsDisconnectingGitHub(false);
    }
  }, [logoutGitHub]);

  const handleAccountSignOut = useCallback(async () => {
    setError(null);
    setIsSigningOut(true);
    try {
      const result = await logout();
      if (!result.success && result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSigningOut(false);
    }
  }, [logout]);

  // Render GitHub status
  const renderGitHubStatus = () => {
    if (!ghInstalled) {
      return (
        <div className="flex items-center gap-2 text-yellow-400">
          <AlertCircle size={16} />
          <span className="text-sm">
            {isInstallingPackages ? 'Installing GitHub CLI… Please wait.' : 'GitHub CLI is required'}
          </span>
        </div>
      );
    }
    
    if (isCheckingGhAuth) {
      return <Loader2 className="animate-spin text-theme-muted" size={16} />;
    }
    
    if (ghAuthStatus?.loggedIn) {
      return (
        <div className="flex items-center gap-2 text-green-400">
          <Check size={16} />
          <span className="text-sm">@{ghAuthStatus.username}</span>
        </div>
      );
    }
    
    return <span className="text-theme-muted text-xs uppercase">Not connected</span>;
  };

  // Render GitHub action button
  const renderGitHubButton = () => {
    if (!ghInstalled) {
      return (
        <Button 
          variant="secondary" 
          size="sm"
          onClick={installRequiredPackages}
          loading={isInstallingPackages}
          disabled={isInstallingPackages}
        >
          <Github style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} />
          <span className="ml-1.5">{isInstallingPackages ? 'Installing...' : 'Install GitHub CLI'}</span>
        </Button>
      );
    }
    
    if (ghAuthStatus?.loggedIn) {
      return (
        <Button 
          variant="secondary" 
          size="sm"
          onClick={handleGitHubDisconnect}
          disabled={isDisconnectingGitHub}
        >
          {isDisconnectingGitHub ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <LogOut style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} />
          )}
          <span className="ml-1.5">
            {isDisconnectingGitHub ? 'Disconnecting...' : 'Disconnect'}
          </span>
        </Button>
      );
    }
    
    return (
      <Button 
        variant="secondary" 
        size="sm"
        onClick={handleGitHubConnect}
      >
        <Github style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} />
        <span className="ml-1.5">Connect</span>
      </Button>
    );
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <UserCircle style={avatarStyle} className="text-theme-muted mx-auto mb-4" />
          <h2 className="text-xl text-theme-primary font-medium">
            {isAuthenticated ? (userName || userEmail || 'Your Profile') : 'Accounts'}
          </h2>
          <p className="text-theme-muted mt-1">
            {isAuthenticated
              ? 'Manage optional account connections for this device.'
              : 'Use ControlZebra without an account, then connect optional services when you need them.'}
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3 mb-6">
            <AlertCircle className="text-red-400 shrink-0" size={20} />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        )}

        <div className="bg-theme-surface rounded-lg p-6 border border-theme-default mb-4">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-theme-primary font-medium">ControlZebra Account</h3>
              <p className="text-sm text-theme-muted mt-1">
                {isAuthenticated
                  ? 'Signed in for optional cloud features. Local Git workflows stay available even if you sign out.'
                  : 'A ControlZebra account is optional. Sign in here only when you need cloud-backed features.'}
              </p>
            </div>
            {isAuthenticated ? (
              <Button
                variant="secondary"
                size="sm"
                loading={isSigningOut}
                onClick={handleAccountSignOut}
              >
                <LogOut style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} />
                <span className="ml-1.5">Sign out</span>
              </Button>
            ) : (
              <span className="text-theme-muted text-xs uppercase tracking-wide">
                {isAuthAvailable ? 'Guest mode' : 'Unavailable'}
              </span>
            )}
          </div>

          {isAuthenticated ? (
            <div className="rounded-lg border border-theme-default bg-theme-base/40 px-4 py-3">
              <p className="text-sm text-theme-primary font-medium">{userName || 'ControlZebra User'}</p>
              <p className="text-sm text-theme-muted mt-1">{userEmail || 'Signed in'}</p>
            </div>
          ) : (
            <LoginView
              variant="embedded"
              title={isAuthAvailable ? 'Sign in later if you need it' : 'Account sign-in unavailable'}
              description={
                isAuthAvailable
                  ? 'Keep using ControlZebra as a guest for local work, or sign in to prepare for future cloud features.'
                  : 'This build still supports guest mode for local Git workflows.'
              }
            />
          )}
        </div>

        <div className="mb-4">
          <AccountFeatureGate
            title="Future cloud features"
            description="These features will check for a ControlZebra account at the feature entry point. Local Git work, Git identity, and GitHub sync stay separate."
            lockedMessage="Keep using guest mode for local work. Sign in from this page only when you want to prepare for cloud-backed features."
            readyMessage="Your account is connected. These cloud-backed features remain disabled until their implementation ships."
          >
            {FUTURE_CLOUD_FEATURES.map(({ title, description, Icon }) => (
              <div
                key={title}
                className="rounded-lg border border-theme-default bg-theme-base/40 px-4 py-3 flex items-start gap-3"
              >
                <div className="rounded-md border border-theme-default bg-theme-surface p-2 shrink-0">
                  <Icon size={ICON_SIZES.sm} className="text-theme-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-theme-primary">{title}</p>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                      Account required
                    </Badge>
                    <Badge variant="outline" className="border-theme-default text-theme-muted">
                      Coming soon
                    </Badge>
                  </div>
                  <p className="text-sm text-theme-muted mt-1">{description}</p>
                </div>
                <Button variant="secondary" size="sm" disabled>
                  <span>Coming soon</span>
                </Button>
              </div>
            ))}
          </AccountFeatureGate>
        </div>

        <div className="bg-theme-surface rounded-lg p-4 border border-theme-default mb-4">
          <div className="flex items-start gap-3">
            <Check size={ICON_SIZES.md} className="text-green-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-theme-primary font-medium">Still available in guest mode</h3>
              <p className="text-sm text-theme-muted mt-1">
                Open folders, start tracking, save changes, sync with GitHub, inspect history, and resolve merges without a ControlZebra account.
              </p>
            </div>
          </div>
        </div>
        
        {/* GitHub Section */}
        <div className="bg-theme-surface rounded-lg p-4 border border-theme-default mb-4">
          <div className="flex items-center gap-4">
            <Github style={{ width: 24, height: 24 }} className="text-theme-secondary shrink-0" />
            <h3 className="text-theme-primary font-medium flex-1">GitHub</h3>
            <div className="flex items-center gap-3">
              {renderGitHubStatus()}
              {renderGitHubButton()}
            </div>
          </div>
          <p className="text-sm text-theme-muted mt-3">
            GitHub connection is separate from your ControlZebra account and is only needed for GitHub sync.
          </p>
        </div>
        
        {/* GitLab Section */}
        <div className="bg-theme-surface rounded-lg p-4 border border-theme-default mb-6">
          <div className="flex items-center gap-4">
            <GitLabIcon style={{ width: 24, height: 24 }} className="text-theme-secondary shrink-0" />
            <h3 className="text-theme-primary font-medium flex-1">GitLab</h3>
            <div className="flex items-center gap-3">
              <span className="text-theme-muted text-xs uppercase">Coming soon</span>
              <Button variant="secondary" size="sm" disabled>
                <GitLabIcon style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} />
                <span className="ml-2">Connect</span>
              </Button>
            </div>
          </div>
        </div>
        

        {/* Device Flow Modal */}
        <GitHubDeviceFlowModal
          open={deviceFlow.isOpen}
          userCode={deviceFlow.userCode}
          verificationUrl={deviceFlow.verificationUrl}
          onComplete={closeDeviceFlow}
          onOpenChange={handleDeviceFlowOpenChange}
        />
      </div>
    </div>
  );
}

export default memo(ProfilePage);
