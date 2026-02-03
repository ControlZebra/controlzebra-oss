/**
 * ProfilePage - Main area content for Profile view.
 * Full GitHub/GitLab account connection management.
 */
import { memo, useState, useCallback, useEffect, useRef, type CSSProperties, type JSX } from 'react';
import { UserCircle, Github, Check, AlertCircle, Loader2, Copy, ExternalLink, LogOut } from 'lucide-react';
import { Browser } from '@wailsio/runtime';
import { ICON_SIZES } from '../../../constants';
import { useRepo } from '../../../context';
import { GitLabIcon } from '../../common';
import { Button } from '../../ui';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '../../ui/alert-dialog';

const buttonIconStyle: CSSProperties = { width: ICON_SIZES.md, height: ICON_SIZES.md };

interface DeviceFlowState {
  isOpen: boolean;
  userCode: string;
  verificationUrl: string;
  isWaiting: boolean;
}

const AUTH_POLL_INTERVAL = 2000;

function ProfilePage(): JSX.Element {
  const avatarSize = ICON_SIZES.lg * 3;
  const avatarStyle: CSSProperties = { width: avatarSize, height: avatarSize };

  const { 
    ghInstalled, 
    ghAuthStatus, 
    isCheckingGhAuth,
    startGitHubLogin,
    completeGitHubLogin,
    cancelGitHubLogin,
    logoutGitHub,
  } = useRepo();
  
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState>({
    isOpen: false,
    userCode: '',
    verificationUrl: '',
    isWaiting: false,
  });

  // Start the GitHub login flow
  const handleGitHubConnect = useCallback(async () => {
    setError(null);
    setCopied(false);
    const result = await startGitHubLogin();
    
    if (result.success && result.userCode) {
      setDeviceFlow({
        isOpen: true,
        userCode: result.userCode,
        verificationUrl: result.verificationUrl || 'https://github.com/login/device',
        isWaiting: false,
      });
    } else {
      setError(result.error || 'Failed to start authentication');
    }
  }, [startGitHubLogin]);

  // Copy verification code
  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(deviceFlow.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }, [deviceFlow.userCode]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Open GitHub and start polling
  const handleOpenGitHub = useCallback(() => {
    Browser.OpenURL(deviceFlow.verificationUrl);
    setDeviceFlow(prev => ({ ...prev, isWaiting: true }));
  }, [deviceFlow.verificationUrl]);

  // Poll for auth completion
  useEffect(() => {
    if (!deviceFlow.isWaiting || !deviceFlow.isOpen) {
      stopPolling();
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      const result = await completeGitHubLogin();
      if (result.success) {
        stopPolling();
        setDeviceFlow({ isOpen: false, userCode: '', verificationUrl: '', isWaiting: false });
      }
    }, AUTH_POLL_INTERVAL);

    return () => stopPolling();
  }, [deviceFlow.isWaiting, deviceFlow.isOpen, completeGitHubLogin, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Cancel device flow
  const handleCancelFlow = useCallback(async () => {
    stopPolling();
    await cancelGitHubLogin();
    setDeviceFlow({ isOpen: false, userCode: '', verificationUrl: '', isWaiting: false });
  }, [cancelGitHubLogin, stopPolling]);

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
          <span className="text-sm">GitHub CLI not installed</span>
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
          onClick={() => Browser.OpenURL('https://cli.github.com')}
        >
          <Github style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} />
          <span className="ml-1.5">Install CLI</span>
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
        <AlertDialog open={deviceFlow.isOpen} onOpenChange={(open) => !open && handleCancelFlow()}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Github size={24} />
                Connect to GitHub
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-4 pt-2">
                <p>Copy this code and enter it on GitHub:</p>
                
                <div className="bg-gray-900 rounded-lg p-4 border border-theme-default">
                  <div className="flex items-center justify-between gap-3">
                    <code className="text-2xl font-mono font-bold text-theme-primary tracking-widest">
                      {deviceFlow.userCode}
                    </code>
                    <Button variant="secondary" size="sm" onClick={handleCopyCode} className="shrink-0">
                      {copied ? (
                        <>
                          <Check size={16} className="text-green-400" />
                          <span className="ml-1 text-green-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={16} />
                          <span className="ml-1">Copy</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {deviceFlow.isWaiting && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-center gap-2">
                    <Loader2 className="text-blue-400 shrink-0 animate-spin" size={16} />
                    <span className="text-blue-400 text-sm">Waiting for authentication...</span>
                  </div>
                )}

                <p className="text-sm">
                  {deviceFlow.isWaiting 
                    ? 'This window will close automatically once you sign in.'
                    : 'Click below to open GitHub, then paste the code.'
                  }
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
              <Button 
                onClick={handleOpenGitHub}
                className="w-full sm:w-auto"
                disabled={deviceFlow.isWaiting}
              >
                {deviceFlow.isWaiting ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span className="ml-2">Waiting...</span>
                  </>
                ) : (
                  <>
                    <ExternalLink size={16} />
                    <span className="ml-2">Open GitHub</span>
                  </>
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export default memo(ProfilePage);
