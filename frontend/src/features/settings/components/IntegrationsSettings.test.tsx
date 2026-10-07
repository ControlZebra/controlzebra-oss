import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IntegrationsSettings from './IntegrationsSettings';
import type { GitHubDeviceFlowResult } from '../../../domain/repo/context/RepoContext.types';

const repo = vi.hoisted(() => ({
  ghInstalled: true,
  ghAuthStatus: null,
  isCheckingGhAuth: false,
  isInstallingPackages: false,
  installRequiredPackages: vi.fn(),
  logoutGitHub: vi.fn(),
  startGitHubLogin: vi.fn(),
}));

vi.mock('../../../context', () => ({ useRepo: () => repo }));
vi.mock('../../auth/components/GitHubDeviceFlowModal', () => ({
  default: ({ open }: { open: boolean }) => open ? <div role="dialog">GitHub verification</div> : null,
}));

describe('GitHub integration Connect', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('stays visibly pending and blocks a second click after 12 seconds', async () => {
    let resolve!: (result: GitHubDeviceFlowResult) => void;
    repo.startGitHubLogin.mockReturnValue(new Promise<GitHubDeviceFlowResult>((done) => { resolve = done; }));
    render(<IntegrationsSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByRole('button', { name: 'Connecting...' })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(12000); });
    fireEvent.click(screen.getByRole('button', { name: 'Connecting...' }));
    expect(repo.startGitHubLogin).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ success: true, userCode: 'ABCD-1234' }); });
    expect(screen.getByRole('dialog')).toHaveTextContent('GitHub verification');
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });

  it('shows recovery after startup failure and makes Connect available again', async () => {
    repo.startGitHubLogin.mockResolvedValue({ success: false, error: 'Check your internet connection and try connecting again.' });
    render(<IntegrationsSettings />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Connect' })); });
    expect(screen.getByText('Check your internet connection and try connecting again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });
});
