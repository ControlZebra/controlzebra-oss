/**
 * ProfilePage - Main area content for Profile view.
 * Full GitHub/GitLab account connection management.
 */
import { memo, useState, useCallback, type CSSProperties, type JSX } from 'react';
import { UserCircle, Github, Check, AlertCircle, Loader2, LogOut } from 'lucide-react';
import { ICON_SIZES } from '../../../shared/constants';
import { useRepo } from '../../../context';
import GitLabIcon from '../../../shared/icons/GitLabIcon';
import GitHubDeviceFlowModal from '../../auth/components/GitHubDeviceFlowModal';
import { Button } from '../../../shared/ui';

interface DeviceFlowState {
  isOpen: boolean;
  userCode: string;
  verificationUrl: string;
}

function ProfilePage(): JSX.Element {
  const avatarSize = ICON_SIZES.lg * 3;
  const avatarStyle: CSSProperties = { width: avatarSize, height: avatarSize };

  const { 
    ghInstalled, 
    isInstallingPackages,
    installRequiredPackages,
    ghAuthStatus, 
    isCheckingGhAuth,
    startGitHubLogin,
    logoutGitHub,
  } = useRepo();
  
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState>({
    isOpen: false,
    userCode: '',
    verificationUrl: '',
  });

  // Start the GitHub login flow
  const handleGitHubConnect = useCallback(async () => {
    setError(null);
    const result = await startGitHubLogin();
    
    if (result.success && result.userCode) {
      setDeviceFlow({
        isOpen: true,
        userCode: result.userCode,
        verificationUrl: result.verificationUrl || 'https://github.com/login/device',
      });
    } else {
      setError(result.error || 'Failed to start authentication');
    }
  }, [startGitHubLogin]);

  // Handle device flow completion
  const handleDeviceFlowComplete = useCallback(() => {
    setDeviceFlow({ isOpen: false, userCode: '', verificationUrl: '' });
  }, []);

  // Handle device flow cancel
  const handleDeviceFlowCancel = useCallback(() => {
    setDeviceFlow({ isOpen: false, userCode: '', verificationUrl: '' });
  }, []);

  // Disconnect from GitHub
  const handleGitHubDisconnect = useCallback(async () => {
    setError(null);
    setIsLoggingOut(true);
    try {
      const result = await logoutGitHub();
      if (!result.success) {
        setError(result.error || 'Logout failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoggingOut(false);
    }
  }, [logoutGitHub]);

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
          disabled={isLoggingOut}
        >
          {isLoggingOut ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <LogOut style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} />
          )}
          <span className="ml-1.5">
            {isLoggingOut ? 'Disconnecting...' : 'Disconnect'}
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
          {ghAuthStatus?.loggedIn ? (
            <div className="relative inline-block mb-4">
              <Github style={avatarStyle} className="text-theme-secondary" />
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-500 rounded-full border-4 border-gray-900 flex items-center justify-center">
                <Check size={16} className="text-white" />
              </div>
            </div>
          ) : (
            <UserCircle style={avatarStyle} className="text-theme-muted mx-auto mb-4" />
          )}
          <h2 className="text-xl text-theme-primary font-medium">
            {ghAuthStatus?.loggedIn ? `@${ghAuthStatus.username}` : 'Your Profile'}
          </h2>
          <p className="text-theme-muted mt-1">
            {ghAuthStatus?.loggedIn ? 'Connected to GitHub' : 'Connect your accounts to push and pull'}
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3 mb-6">
            <AlertCircle className="text-red-400 shrink-0" size={20} />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        )}
        
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
          isOpen={deviceFlow.isOpen}
          userCode={deviceFlow.userCode}
          verificationUrl={deviceFlow.verificationUrl}
          onComplete={handleDeviceFlowComplete}
          onCancel={handleDeviceFlowCancel}
        />
      </div>
    </div>
  );
}

export default memo(ProfilePage);
