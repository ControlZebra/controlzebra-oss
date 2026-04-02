import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  onMock: vi.fn(),
  isWindowsMock: vi.fn(),
  isMacMock: vi.fn(),
  isLinuxMock: vi.fn(),
  minimiseMock: vi.fn(),
  toggleMaximiseMock: vi.fn(),
  closeMock: vi.fn(),
  isMaximisedMock: vi.fn(),
}));

vi.mock('@wailsio/runtime', () => ({
  Events: {
    On: runtimeMocks.onMock,
  },
  System: {
    IsWindows: runtimeMocks.isWindowsMock,
    IsMac: runtimeMocks.isMacMock,
    IsLinux: runtimeMocks.isLinuxMock,
  },
  Window: {
    Minimise: runtimeMocks.minimiseMock,
    ToggleMaximise: runtimeMocks.toggleMaximiseMock,
    Close: runtimeMocks.closeMock,
    IsMaximised: runtimeMocks.isMaximisedMock,
  },
}));

import {
  closeCurrentWindow,
  getCurrentWindowIsMaximised,
  getDesktopPlatform,
  isMacDesktop,
  isWindowsDesktop,
  minimiseCurrentWindow,
  onCurrentWindowStateChange,
  toggleCurrentWindowMaximise,
} from './window';

describe('shared runtime window helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMocks.isWindowsMock.mockReturnValue(false);
    runtimeMocks.isMacMock.mockReturnValue(false);
    runtimeMocks.isLinuxMock.mockReturnValue(false);
    runtimeMocks.isMaximisedMock.mockResolvedValue(false);
    runtimeMocks.onMock.mockImplementation(() => vi.fn());
  });

  it('detects windows and mac platforms from the runtime', () => {
    runtimeMocks.isWindowsMock.mockReturnValue(true);
    expect(getDesktopPlatform()).toBe('windows');
    expect(isWindowsDesktop()).toBe(true);

    runtimeMocks.isWindowsMock.mockReturnValue(false);
    runtimeMocks.isMacMock.mockReturnValue(true);
    expect(getDesktopPlatform()).toBe('macos');
    expect(isMacDesktop()).toBe(true);
  });

  it('forwards window control operations to the runtime window API', async () => {
    await minimiseCurrentWindow();
    await toggleCurrentWindowMaximise();
    await closeCurrentWindow();
    await getCurrentWindowIsMaximised();

    expect(runtimeMocks.minimiseMock).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.toggleMaximiseMock).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.closeMock).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.isMaximisedMock).toHaveBeenCalledTimes(1);
  });

  it('subscribes to maximise-state events and tears them down', async () => {
    const callbacks: Array<() => Promise<void> | void> = [];
    const unsubscribes = [vi.fn(), vi.fn(), vi.fn()];

    runtimeMocks.onMock
      .mockImplementationOnce((_event, callback) => {
        callbacks.push(callback);
        return unsubscribes[0];
      })
      .mockImplementationOnce((_event, callback) => {
        callbacks.push(callback);
        return unsubscribes[1];
      })
      .mockImplementationOnce((_event, callback) => {
        callbacks.push(callback);
        return unsubscribes[2];
      });

    const listener = vi.fn();
    const cancel = onCurrentWindowStateChange(listener);

    expect(runtimeMocks.onMock).toHaveBeenCalledTimes(3);

    await callbacks[0]();
    await callbacks[1]();
    await callbacks[2]();

    expect(listener).toHaveBeenNthCalledWith(1, true);
    expect(listener).toHaveBeenNthCalledWith(2, false);
    expect(listener).toHaveBeenNthCalledWith(3, false);

    cancel();

    unsubscribes.forEach((unsubscribe) => {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });
});