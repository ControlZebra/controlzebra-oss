import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { startDeviceFlow, loadChangeRequests, closeDeviceFlow } = vi.hoisted(() => ({
  startDeviceFlow: vi.fn(),
  loadChangeRequests: vi.fn(),
  closeDeviceFlow: vi.fn(),
}));

const repoState = {
  changeRequestRepository: null,
  changeRequests: [],
  changeRequestsMayHaveMore: false,
  isLoadingChangeRequests: false,
  changeRequestError: { code: 'auth_required' as const },
  loadChangeRequests,
  installRequiredPackages: vi.fn(),
  isInstallingPackages: false,
};

vi.mock('../../../context', () => ({
  useRepo: () => repoState,
}));

vi.mock('../../auth/hooks/useGitHubDeviceFlow', () => ({
  useGitHubDeviceFlow: () => ({
    deviceFlow: { isOpen: false, userCode: '', verificationUrl: '' },
    startDeviceFlow,
    closeDeviceFlow,
    handleDeviceFlowOpenChange: vi.fn(),
  }),
}));

vi.mock('../../auth/components/GitHubDeviceFlowModal', () => ({
  default: () => null,
}));

import ReviewsPage from './ReviewsPage';

describe('ReviewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoState.changeRequestError = { code: 'auth_required' };
  });

  it('starts the shared GitHub device flow when authentication is required', () => {
    render(<ReviewsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }));

    expect(startDeviceFlow).toHaveBeenCalledOnce();
  });
});