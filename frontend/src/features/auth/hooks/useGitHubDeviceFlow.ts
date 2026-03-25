import { useCallback, useState } from 'react';
import { useRepo } from '../../../context';
import type { GitHubDeviceFlowResult } from '../../../domain/repo/context/RepoContext.types';

export interface GitHubDeviceFlowState {
  isOpen: boolean;
  userCode: string;
  verificationUrl: string;
}

const CLOSED_DEVICE_FLOW_STATE: GitHubDeviceFlowState = {
  isOpen: false,
  userCode: '',
  verificationUrl: '',
};

function toOpenDeviceFlowState(result: GitHubDeviceFlowResult): GitHubDeviceFlowState {
  return {
    isOpen: true,
    userCode: result.userCode || '',
    verificationUrl: result.verificationUrl || 'https://github.com/login/device',
  };
}

interface UseGitHubDeviceFlowOptions {
  onStartError?: (message: string) => void;
}

interface UseGitHubDeviceFlowResult {
  deviceFlow: GitHubDeviceFlowState;
  startDeviceFlow: () => Promise<boolean>;
  closeDeviceFlow: () => void;
  handleDeviceFlowOpenChange: (open: boolean) => void;
}

export function useGitHubDeviceFlow(
  options: UseGitHubDeviceFlowOptions = {},
): UseGitHubDeviceFlowResult {
  const { startGitHubLogin } = useRepo();
  const [deviceFlow, setDeviceFlow] = useState<GitHubDeviceFlowState>(CLOSED_DEVICE_FLOW_STATE);

  const closeDeviceFlow = useCallback((): void => {
    setDeviceFlow(CLOSED_DEVICE_FLOW_STATE);
  }, []);

  const startDeviceFlow = useCallback(async (): Promise<boolean> => {
    const result = await startGitHubLogin();
    if (result.success && result.userCode) {
      setDeviceFlow(toOpenDeviceFlowState(result));
      return true;
    }

    options.onStartError?.(result.error || 'Failed to start GitHub authentication');
    return false;
  }, [options, startGitHubLogin]);

  const handleDeviceFlowOpenChange = useCallback((open: boolean): void => {
    if (!open) {
      closeDeviceFlow();
    }
  }, [closeDeviceFlow]);

  return {
    deviceFlow,
    startDeviceFlow,
    closeDeviceFlow,
    handleDeviceFlowOpenChange,
  };
}