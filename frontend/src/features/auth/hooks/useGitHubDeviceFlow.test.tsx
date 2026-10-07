import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGitHubDeviceFlow } from './useGitHubDeviceFlow';
import type { GitHubDeviceFlowResult } from '../../../domain/repo/context/RepoContext.types';

const { startGitHubLogin } = vi.hoisted(() => ({ startGitHubLogin: vi.fn() }));
vi.mock('../../../context', () => ({ useRepo: () => ({ startGitHubLogin }) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('useGitHubDeviceFlow', () => {
  beforeEach(() => vi.resetAllMocks());

  it('keeps a later Connect click from replacing a pending start', async () => {
    const pending = deferred<GitHubDeviceFlowResult>();
    startGitHubLogin.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useGitHubDeviceFlow());
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => { first = result.current.startDeviceFlow(); });
    act(() => { second = result.current.startDeviceFlow(); });
    expect(startGitHubLogin).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({ success: true, userCode: 'ABCD-1234' });
      await Promise.all([first, second]);
    });
    expect(result.current.deviceFlow.isOpen).toBe(true);
  });

  it('ignores a start response after the flow has been closed', async () => {
    const pending = deferred<GitHubDeviceFlowResult>();
    startGitHubLogin.mockReturnValue(pending.promise);
    const onStartError = vi.fn();
    const { result } = renderHook(() => useGitHubDeviceFlow({ onStartError }));
    let request!: Promise<boolean>;
    act(() => { request = result.current.startDeviceFlow(); });
    act(() => result.current.closeDeviceFlow());
    await act(async () => {
      pending.resolve({ success: false, error: 'stale cancellation failure' });
      await request;
    });
    expect(onStartError).not.toHaveBeenCalled();
    expect(result.current.deviceFlow.isOpen).toBe(false);
  });

  it('does not reopen a closed flow when its code arrives', async () => {
    const pending = deferred<GitHubDeviceFlowResult>();
    startGitHubLogin.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useGitHubDeviceFlow());
    let request!: Promise<boolean>;
    act(() => { request = result.current.startDeviceFlow(); });
    act(() => result.current.closeDeviceFlow());
    await act(async () => {
      pending.resolve({ success: true, userCode: 'ABCD-1234' });
      await request;
    });
    expect(result.current.deviceFlow.isOpen).toBe(false);
    expect(result.current.isStarting).toBe(false);
  });

  it('ignores errors after its caller unmounts', async () => {
    const pending = deferred<GitHubDeviceFlowResult>();
    startGitHubLogin.mockReturnValue(pending.promise);
    const onStartError = vi.fn();
    const { result, unmount } = renderHook(() => useGitHubDeviceFlow({ onStartError }));
    let request!: Promise<boolean>;
    act(() => { request = result.current.startDeviceFlow(); });
    unmount();
    pending.resolve({ success: false, error: 'stale failure' });
    await request;
    expect(onStartError).not.toHaveBeenCalled();
  });

  it('suppresses intentional cancellation and allows another start', async () => {
    startGitHubLogin.mockResolvedValueOnce({ success: false, cancelled: true })
      .mockResolvedValueOnce({ success: true, userCode: 'ABCD-1234' });
    const onStartError = vi.fn();
    const { result } = renderHook(() => useGitHubDeviceFlow({ onStartError }));
    await act(async () => { await result.current.startDeviceFlow(); });
    expect(onStartError).not.toHaveBeenCalled();
    expect(result.current.isStarting).toBe(false);
    await act(async () => { await result.current.startDeviceFlow(); });
    expect(result.current.deviceFlow.isOpen).toBe(true);
  });

  it('returns recovery guidance for a rejected request and permits retry', async () => {
    startGitHubLogin.mockRejectedValueOnce(new Error('private transport diagnostics'))
      .mockResolvedValueOnce({ success: true, userCode: 'ABCD-1234' });
    const onStartError = vi.fn();
    const { result } = renderHook(() => useGitHubDeviceFlow({ onStartError }));
    await act(async () => { await result.current.startDeviceFlow(); });
    expect(onStartError).toHaveBeenCalledWith('GitHub sign-in could not start. Try connecting again.');
    expect(result.current.isStarting).toBe(false);
    await act(async () => { await result.current.startDeviceFlow(); });
    expect(result.current.deviceFlow.isOpen).toBe(true);
  });
});
