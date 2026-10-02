import { useEffect, useRef } from 'react';

interface UseStatusPollingOptions {
  enabled: boolean;
  repositoryKey?: string | null;
  intervalMs: number;
  onRefreshStatus: () => Promise<void> | void;
  onInitialRefresh?: () => Promise<void> | void;
}

export function useStatusPolling({
  enabled,
  repositoryKey,
  intervalMs,
  onRefreshStatus,
  onInitialRefresh,
}: UseStatusPollingOptions): void {
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
    let inFlight = false;

    const runRefreshStatus = async () => {
      if (inFlight || isUnmounted) {
        return;
      }

      inFlight = true;

      try {
        await refreshStatusRef.current();
      } finally {
        inFlight = false;
      }
    };

    void initialRefreshRef.current?.();

    const intervalId = setInterval(() => {
      void runRefreshStatus();
    }, intervalMs);

    return () => {
      isUnmounted = true;
      clearInterval(intervalId);
    };
  }, [enabled, intervalMs, repositoryKey]);
}
