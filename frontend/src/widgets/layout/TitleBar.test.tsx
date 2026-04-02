import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeWindowMock = vi.hoisted(() => ({
  isWindowsDesktop: vi.fn(),
  isMacDesktop: vi.fn(),
  getCurrentWindowIsMaximised: vi.fn(),
  onCurrentWindowStateChange: vi.fn(),
  minimiseCurrentWindow: vi.fn(),
  toggleCurrentWindowMaximise: vi.fn(),
  closeCurrentWindow: vi.fn(),
}));

const repoMock = vi.hoisted(() => ({
  repoPath: '/tmp/factory-line',
  repoInfo: { branch: 'main', isRepo: true },
}));

vi.mock('../../shared/runtime/window', () => runtimeWindowMock);

vi.mock('../../context', () => ({
  useRepo: () => repoMock,
}));

import TitleBar from './TitleBar';

describe('TitleBar window chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeWindowMock.isWindowsDesktop.mockReturnValue(false);
    runtimeWindowMock.isMacDesktop.mockReturnValue(false);
    runtimeWindowMock.getCurrentWindowIsMaximised.mockResolvedValue(false);
    runtimeWindowMock.onCurrentWindowStateChange.mockReturnValue(() => {});
  });

  it('renders Windows caption controls in the title bar', async () => {
    runtimeWindowMock.isWindowsDesktop.mockReturnValue(true);

    render(<TitleBar />);

    expect(screen.getByText('ControlZebra Beta')).toBeInTheDocument();
    expect(screen.getByText('(factory-line)')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Minimize window' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maximize window' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close window' })).toBeInTheDocument();
    expect(screen.getByTestId('title-bar')).toHaveStyle({ '--wails-draggable': 'drag' });
    expect(runtimeWindowMock.onCurrentWindowStateChange).toHaveBeenCalledTimes(1);
  });

  it('keeps macOS title content offset from the native traffic lights', () => {
    runtimeWindowMock.isMacDesktop.mockReturnValue(true);

    const { container } = render(<TitleBar />);

    expect(screen.queryByRole('button', { name: 'Minimize window' })).not.toBeInTheDocument();
    const titleGroup = container.querySelector('[style*="padding-left: 76px"]');
    expect(titleGroup).not.toBeNull();
  });
});