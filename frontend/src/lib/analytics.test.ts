import { beforeEach, describe, expect, it, vi } from 'vitest';

const { posthogMock } = vi.hoisted(() => ({
  posthogMock: {
    opt_in_capturing: vi.fn(),
    set_config: vi.fn(),
    stopSessionRecording: vi.fn(),
    startSessionRecording: vi.fn(),
    capture: vi.fn(),
  },
}));

vi.mock('posthog-js', () => ({
  default: posthogMock,
}));

import {
  setAnalyticsConsent,
  initAnalytics,
  trackSyncStarted,
  trackSyncFailed,
} from './analytics';

describe('analytics consent gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key);
      }),
      clear: vi.fn(() => {
        store.clear();
      }),
    });
  });

  it('enforces SDK config for minimal and full consent levels', () => {
    setAnalyticsConsent('minimal');

    expect(posthogMock.opt_in_capturing).toHaveBeenCalledTimes(1);
    expect(posthogMock.set_config).toHaveBeenCalledWith(
      expect.objectContaining({
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        enable_heatmaps: false,
        rageclick: false,
      }),
    );
    expect(posthogMock.stopSessionRecording).toHaveBeenCalledTimes(1);

    setAnalyticsConsent('full');

    expect(posthogMock.set_config).toHaveBeenLastCalledWith(
      expect.objectContaining({
        autocapture: true,
        capture_pageview: true,
        capture_pageleave: false,
        disable_session_recording: false,
        enable_heatmaps: false,
        rageclick: false,
      }),
    );
    expect(posthogMock.startSessionRecording).toHaveBeenCalledTimes(1);
  });

  it('filters usage events at minimal and allows error events', () => {
    setAnalyticsConsent('minimal');

    trackSyncStarted({ branchName: 'main', localAhead: 0, localBehind: 0 });
    trackSyncFailed({ errorType: 'sync_error', hadConflicts: false });

    expect(posthogMock.capture).toHaveBeenCalledTimes(1);
    expect(posthogMock.capture).toHaveBeenCalledWith(
      'sync_failed',
      expect.objectContaining({ event_category: 'error' }),
    );
  });

  it('defaults to standard consent on init and allows usage events', () => {
    initAnalytics();
    trackSyncStarted({ branchName: 'main', localAhead: 1, localBehind: 2 });

    expect(posthogMock.capture).toHaveBeenCalledWith(
      'sync_started',
      expect.objectContaining({
        event_category: 'usage',
        consent_level: 'standard',
      }),
    );
  });
});
