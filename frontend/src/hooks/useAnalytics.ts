/**
 * React hooks for analytics tracking
 *
 * Provides convenient hooks for common tracking patterns.
 */

import { useEffect, useRef, useCallback } from 'react';
import { trackEvent, trackViewChange } from '../lib/analytics';

/**
 * Track a view when component mounts
 * @param viewName - The name of the view to track
 */
export function useTrackView(viewName: string): void {
  useEffect(() => {
    trackViewChange(viewName);
  }, [viewName]);
}

/**
 * Hook to track timed events (for measuring duration)
 * @param eventName - The name of the event to track when completed
 * @returns Object with `complete` function to call when event is done
 */
export function useTrackTiming(eventName: string): {
  complete: (properties?: Record<string, unknown>) => void;
  reset: () => void;
} {
  const startTime = useRef<number>(Date.now());

  const reset = useCallback(() => {
    startTime.current = Date.now();
  }, []);

  const complete = useCallback(
    (properties?: Record<string, unknown>) => {
      const duration = Date.now() - startTime.current;
      trackEvent(eventName, { duration_ms: duration, ...properties });
    },
    [eventName],
  );

  return { complete, reset };
}

/**
 * Track an event when a value changes
 * @param value - The value to watch
 * @param eventName - The event name to track
 * @param getProperties - Function to generate properties from old and new values
 */
export function useTrackOnChange<T>(
  value: T,
  eventName: string,
  getProperties: (oldValue: T | undefined, newValue: T) => Record<string, unknown> | null,
): void {
  const prevValue = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (prevValue.current !== undefined) {
      const properties = getProperties(prevValue.current, value);
      if (properties !== null) {
        trackEvent(eventName, properties);
      }
    }
    prevValue.current = value;
  }, [value, eventName, getProperties]);
}

/**
 * Create a tracked callback that measures execution time
 * @param callback - The callback to wrap
 * @param eventName - The event name to track
 * @param getProperties - Function to generate properties from the callback result
 */
export function useTrackedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  eventName: string,
  getProperties?: (result: ReturnType<T>, args: Parameters<T>) => Record<string, unknown>,
): T {
  return useCallback(
    ((...args: Parameters<T>) => {
      const startTime = Date.now();
      const result = callback(...args);

      // Handle promises
      if (result instanceof Promise) {
        return result.then((res) => {
          const duration = Date.now() - startTime;
          const properties = getProperties?.(res as ReturnType<T>, args) ?? {};
          trackEvent(eventName, { duration_ms: duration, ...properties });
          return res;
        });
      }

      const duration = Date.now() - startTime;
      const properties = getProperties?.(result as ReturnType<T>, args) ?? {};
      trackEvent(eventName, { duration_ms: duration, ...properties });
      return result;
    }) as T,
    [callback, eventName, getProperties],
  );
}

/**
 * Track session duration on unmount
 * @param sessionName - Name for the session (e.g., 'repo_session')
 */
export function useTrackSession(sessionName: string): void {
  const startTime = useRef<number>(Date.now());

  useEffect(() => {
    return () => {
      const duration = Math.round((Date.now() - startTime.current) / 1000);
      trackEvent(`${sessionName}_ended`, {
        session_duration_seconds: duration,
      });
    };
  }, [sessionName]);
}

/**
 * Track when component mounts (useful for feature usage tracking)
 * @param eventName - The event name to track
 * @param properties - Optional properties to include
 */
export function useTrackMount(eventName: string, properties?: Record<string, unknown>): void {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!hasTracked.current) {
      trackEvent(eventName, properties);
      hasTracked.current = true;
    }
  }, [eventName, properties]);
}
