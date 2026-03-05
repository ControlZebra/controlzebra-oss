import { useEffect, useRef } from 'react';

interface UseStatusPollingOptions {
  enabled: boolean;
  intervalMs: number;
  onRefreshStatus: () => Promise<void> | void;
  onInitialRefresh?: () => Promise<void> | void;
}

export function useStatusPolling({
  enabled,
  intervalMs,
  onRefreshStatus,
  onInitialRefresh,
}: UseStatusPollingOptions): void {
  const inFlightRef = useRef(false);
  const refreshStatusRef = useRef(onRefreshStatus);
  const initialRefreshRef = useRef(onInitialRefresh);

  useEffect(() => {
    refreshStatusRef.current = onRefreshStatus;
  }, [onRefreshStatus]);

  useEffect(() => {
    initialRefreshRef.current = onInitialRefresh;
  }, [onInitialRefresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isUnmounted = false;

    const runRefreshStatus = async () => {
      if (inFlightRef.current || isUnmounted) {
        return;
      }

      inFlightRef.current = true;

      try {
        await refreshStatusRef.current();
      } finally {
        inFlightRef.current = false;
      }
    };

    void initialRefreshRef.current?.();

    const intervalId = setInterval(() => {
      void runRefreshStatus();
    }, intervalMs);

    return () => {
      isUnmounted = true;
      clearInterval(intervalId);
      inFlightRef.current = false;
    };
  }, [enabled, intervalMs]);
}
