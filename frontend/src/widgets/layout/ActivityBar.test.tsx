import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityBar from './ActivityBar';

const layoutMock = vi.hoisted(() => ({
  activeView: 'explorer',
  setActiveView: vi.fn(),
  sidebarCollapsed: false,
  setSidebarCollapsed: vi.fn(),
  developerModeEnabled: false,
}));

const repoMock = vi.hoisted(() => ({
  repoInfo: { isRepo: true },
  repoStatus: { hasChanges: false },
}));

vi.mock('../../context', () => ({
  useLayout: () => layoutMock,
  useRepo: () => repoMock,
}));

vi.mock('../../shared/runtime/browser', () => ({
  openExternalUrl: vi.fn(),
}));

describe('ActivityBar Developer Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layoutMock.developerModeEnabled = false;
  });

  it('shows Debug Logs only when Developer Mode is enabled', () => {
    const { unmount } = render(<ActivityBar />);

    expect(screen.queryByRole('button', { name: 'Debug Logs' })).not.toBeInTheDocument();

    layoutMock.developerModeEnabled = true;
    unmount();
    render(<ActivityBar />);

    expect(screen.getByRole('button', { name: 'Debug Logs' })).toBeInTheDocument();
  });
});