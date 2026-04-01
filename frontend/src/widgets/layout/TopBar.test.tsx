import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeWindowMock = vi.hoisted(() => ({
  isWindowsDesktop: vi.fn(),
  isMacDesktop: vi.fn(),
}));

const repoMock = vi.hoisted(() => ({
  repoPath: '/tmp/repo',
  repoInfo: { branch: 'main', isRepo: true },
  closeRepo: vi.fn(),
  commits: [{ hash: 'abc' }],
  undoLastCommit: vi.fn(),
  operationInProgress: false,
}));

const layoutMock = vi.hoisted(() => ({
  sidebarCollapsed: false,
  sidebarWidth: 280,
  toggleSidebar: vi.fn(),
  setActiveView: vi.fn(),
  setSidebarCollapsed: vi.fn(),
  setSelectedSettingsCategory: vi.fn(),
  accountDialogOpen: false,
  setAccountDialogOpen: vi.fn(),
  openAccountDialog: vi.fn(),
}));

const authMock = vi.hoisted(() => ({
  isAuthenticated: false,
  userEmail: '',
  userName: '',
  logout: vi.fn(),
}));

const updateMock = vi.hoisted(() => ({
  isBusy: false,
  isUpdateAvailable: false,
  readyToInstall: false,
  startUpdate: vi.fn(),
  status: 'idle',
}));

vi.mock('../../shared/runtime/window', () => runtimeWindowMock);

vi.mock('../../shared/runtime/browser', () => ({
  openExternalUrl: vi.fn(),
}));

vi.mock('../../context', () => ({
  useRepo: () => repoMock,
  useLayout: () => layoutMock,
  useAuth: () => authMock,
  useAppUpdate: () => updateMock,
}));

vi.mock('../../shared/hooks', () => ({
  useWindowSize: () => ({ isCompactTopBar: false }),
  BREAKPOINTS: {
    ACTIVITY_BAR_WIDTH: 48,
    TOPBAR_COMPACT: 900,
  },
}));

vi.mock('../../shared/ui', () => ({
  UndoLastSaveDialog: () => null,
}));

vi.mock('../../shared/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('../../features/auth/components/AccountDialog', () => ({
  default: () => null,
}));

vi.mock('./BranchModal', () => ({
  default: () => null,
}));

vi.mock('./SwitchProjectModal', () => ({
  default: () => null,
}));

import TopBar from './TopBar';

describe('TopBar window chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeWindowMock.isWindowsDesktop.mockReturnValue(false);
    runtimeWindowMock.isMacDesktop.mockReturnValue(false);
    updateMock.isBusy = false;
    updateMock.isUpdateAvailable = false;
    updateMock.readyToInstall = false;
    updateMock.status = 'idle';
  });

  it('no longer renders window controls inside the top bar', () => {
    render(<TopBar />);

    expect(screen.queryByRole('button', { name: 'Minimize window' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maximize window' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close window' })).not.toBeInTheDocument();
  });

  it('keeps the sidebar rail aligned without a macOS control inset', () => {
    const { container } = render(<TopBar />);

    const leftRail = container.querySelector('[style*="width: 328px"]');
    expect(leftRail).not.toBeNull();
  });

  it('shows the update button when an update is available', () => {
    updateMock.isUpdateAvailable = true;
    updateMock.readyToInstall = true;
    updateMock.status = 'ready';

    render(<TopBar />);

    expect(screen.getByRole('button', { name: 'Install update' })).toBeInTheDocument();
  });
});