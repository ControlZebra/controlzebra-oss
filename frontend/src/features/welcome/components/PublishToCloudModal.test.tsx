import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PublishToCloudModal from './PublishToCloudModal';

describe('PublishToCloudModal', () => {
  it('shows only the connect action when GitHub is not connected', () => {
    const onConnectGitHub = vi.fn();

    render(
      <PublishToCloudModal
        open
        onOpenChange={vi.fn()}
        onConnectGitHub={onConnectGitHub}
        ghInstalled
        ghAuthStatus={{ loggedIn: false, username: '' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }));

    expect(onConnectGitHub).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish to Cloud' })).not.toBeInTheDocument();
  });

  it('shows the install action instead of a disabled connect button when GitHub CLI is missing', () => {
    render(
      <PublishToCloudModal
        open
        onOpenChange={vi.fn()}
        onInstallRequiredPackages={vi.fn()}
        ghInstalled={false}
        ghAuthStatus={{ loggedIn: false, username: '' }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Install GitHub CLI' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect GitHub' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
});