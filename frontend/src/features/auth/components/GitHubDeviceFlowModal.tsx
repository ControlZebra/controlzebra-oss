/**
 * GitHubDeviceFlowModal - Reusable GitHub device flow authentication modal.
 * Can be triggered from anywhere in the app.
 */
import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { Github, Check, Loader2, Copy, ExternalLink } from 'lucide-react';
import { useRepo } from '../../../context';
import { openExternalUrl } from '../../../shared/runtime/browser';
import { Button } from '../../../components/ui';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '../../../components/ui/alert-dialog';

const AUTH_POLL_INTERVAL = 2000;

export interface GitHubDeviceFlowModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** The user code to display */
  userCode: string;
  /** The verification URL to open */
  verificationUrl: string;
  /** Called when authentication completes successfully */
  onComplete: () => void;
  /** Called when the user cancels the flow */
  onCancel: () => void;
}

function GitHubDeviceFlowModal({
  isOpen,
  userCode,
  verificationUrl,
  onComplete,
  onCancel,
}: GitHubDeviceFlowModalProps) {
  const { completeGitHubLogin, cancelGitHubLogin } = useRepo();
  
  const [isWaiting, setIsWaiting] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Copy verification code
  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }, [userCode]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Open GitHub and start polling
  const handleOpenGitHub = useCallback(async () => {
    const didOpen = await openExternalUrl(verificationUrl, { allowHttpLocalhost: true });
    if (!didOpen) {
      console.error('Blocked unsafe GitHub verification URL:', verificationUrl);
      return;
    }

    setIsWaiting(true);
  }, [verificationUrl]);

  // Poll for auth completion
  useEffect(() => {
    if (!isWaiting || !isOpen) {
      stopPolling();
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      const result = await completeGitHubLogin();
      if (result.success) {
        stopPolling();
        setIsWaiting(false);
        onComplete();
      }
    }, AUTH_POLL_INTERVAL);

    return () => stopPolling();
  }, [isWaiting, isOpen, completeGitHubLogin, stopPolling, onComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsWaiting(false);
      setCopied(false);
    }
  }, [isOpen]);

  // Cancel device flow
  const handleCancelFlow = useCallback(async () => {
    stopPolling();
    await cancelGitHubLogin();
    setIsWaiting(false);
    onCancel();
  }, [cancelGitHubLogin, stopPolling, onCancel]);

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleCancelFlow()}>
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
                <code className="text-2xl font-bold text-theme-primary tracking-widest">
                  {userCode}
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

            {isWaiting && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-center gap-2">
                <Loader2 className="text-blue-400 shrink-0 animate-spin" size={16} />
                <span className="text-blue-400 text-sm">Waiting for authentication...</span>
              </div>
            )}

            <p className="text-sm">
              {isWaiting 
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
            disabled={isWaiting}
          >
            {isWaiting ? (
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
  );
}

export default memo(GitHubDeviceFlowModal);
