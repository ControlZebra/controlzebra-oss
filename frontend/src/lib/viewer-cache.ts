/**
 * Viewer Cache - Caches parsed/loaded content for file viewers.
 * 
 * This module provides a centralized cache that persists across:
 * - Tab switches (active tab changes)
 * - View changes (sidebar view changes)
 * - Component re-renders
 * 
 * Cache is keyed by file path, and entries include a timestamp for
 * potential future cache invalidation strategies.
 * 
 * Usage in viewers:
 * ```tsx
 * const cachedData = useCachedContent<MyDataType>(filePath, async () => {
 *   const raw = await loadFile(filePath);
 *   return parseData(raw);
 * });
 * ```
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

interface CacheEntry<T> {
  /** The cached data */
  data: T;
  /** Timestamp when data was cached */
  timestamp: number;
  /** Optional file modification time for future invalidation */
  mtime?: number;
}

interface CacheState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

// ============================================================================
// Global Cache Store
// ============================================================================

/**
 * Global cache store for viewer content.
 * Using a Map provides O(1) lookups by file path.
 */
const viewerCache = new Map<string, CacheEntry<unknown>>();

/**
 * Maximum number of entries to keep in cache.
 * When exceeded, oldest entries are evicted.
 */
const MAX_CACHE_ENTRIES = 50;

/**
 * Cache entry age in milliseconds before it's considered stale.
 * Stale entries will be refreshed on next access.
 * Default: 5 minutes
 */
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

// ============================================================================
// Cache Functions
// ============================================================================

/**
 * Get a cached entry by file path.
 * 
 * @param filePath - The file path key
 * @returns The cached data or undefined if not found/stale
 */
export function getCachedContent<T>(filePath: string): T | undefined {
  const entry = viewerCache.get(filePath) as CacheEntry<T> | undefined;
  
  if (!entry) {
    return undefined;
  }
  
  // Check if entry is stale
  const age = Date.now() - entry.timestamp;
  if (age > CACHE_MAX_AGE_MS) {
    viewerCache.delete(filePath);
    return undefined;
  }
  
  return entry.data;
}

/**
 * Set a cache entry for a file path.
 * 
 * @param filePath - The file path key
 * @param data - The data to cache
 * @param mtime - Optional file modification time
 */
export function setCachedContent<T>(filePath: string, data: T, mtime?: number): void {
  // Evict oldest entries if cache is full
  if (viewerCache.size >= MAX_CACHE_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    
    for (const [key, entry] of viewerCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      viewerCache.delete(oldestKey);
    }
  }
  
  viewerCache.set(filePath, {
    data,
    timestamp: Date.now(),
    mtime,
  });
}

/**
 * Remove a specific entry from the cache.
 * 
 * @param filePath - The file path to remove
 * @returns true if entry existed and was removed
 */
export function invalidateCachedContent(filePath: string): boolean {
  return viewerCache.delete(filePath);
}

/**
 * Clear all entries from the cache.
 * Useful when switching repositories or for testing.
 */
export function clearViewerCache(): void {
  viewerCache.clear();
}

/**
 * Get current cache statistics.
 * Useful for debugging and monitoring.
 */
export function getCacheStats(): { size: number; maxSize: number } {
  return {
    size: viewerCache.size,
    maxSize: MAX_CACHE_ENTRIES,
  };
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * Hook for using cached content in viewers.
 * 
 * This hook provides:
 * - Automatic cache lookup on mount
 * - Loading state management
 * - Error handling
 * - Automatic cache population on successful load
 * 
 * @param filePath - The file path to load/cache
 * @param loader - Async function to load and parse the content
 * @param deps - Additional dependencies that should trigger reload
 * @returns Object with data, error, isLoading, and refresh function
 * 
 * @example
 * ```tsx
 * function TextViewer({ filePath }: ViewerProps) {
 *   const { data: content, error, isLoading, refresh } = useCachedContent(
 *     filePath,
 *     async () => {
 *       const result = await ReadTextFile(filePath);
 *       if (!result.success) throw new Error(result.error);
 *       return result.content;
 *     }
 *   );
 * 
 *   if (isLoading) return <Loading />;
 *   if (error) return <Error message={error} />;
 *   return <Content data={content} />;
 * }
 * ```
 */
export function useCachedContent<T>(
  filePath: string,
  loader: () => Promise<T>,
  deps: React.DependencyList = []
): CacheState<T> & { refresh: () => void } {
  const [state, setState] = useState<CacheState<T>>(() => {
    // Check cache on initial render
    const cached = getCachedContent<T>(filePath);
    if (cached !== undefined) {
      return { data: cached, error: null, isLoading: false };
    }
    return { data: null, error: null, isLoading: true };
  });

  // Track if component is mounted
  const mountedRef = useRef(true);
  
  // Track current file path to handle rapid switches
  const currentFileRef = useRef(filePath);

  /**
   * Load content from source and cache it.
   */
  const loadContent = useCallback(async (forceRefresh = false) => {
    const targetPath = filePath;
    currentFileRef.current = targetPath;
    
    // Check cache first (unless force refreshing)
    if (!forceRefresh) {
      const cached = getCachedContent<T>(targetPath);
      if (cached !== undefined) {
        if (mountedRef.current && currentFileRef.current === targetPath) {
          setState({ data: cached, error: null, isLoading: false });
        }
        return;
      }
    }

    // Start loading
    if (mountedRef.current && currentFileRef.current === targetPath) {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
    }

    try {
      const data = await loader();
      
      // Cache the result
      setCachedContent(targetPath, data);
      
      // Update state if still mounted and file hasn't changed
      if (mountedRef.current && currentFileRef.current === targetPath) {
        setState({ data, error: null, isLoading: false });
      }
    } catch (err) {
      if (mountedRef.current && currentFileRef.current === targetPath) {
        setState({
          data: null,
          error: err instanceof Error ? err.message : 'Failed to load content',
          isLoading: false,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, loader, ...deps]);

  /**
   * Force refresh content, bypassing cache.
   */
  const refresh = useCallback(() => {
    invalidateCachedContent(filePath);
    loadContent(true);
  }, [filePath, loadContent]);

  // Load content on mount and when filePath changes
  useEffect(() => {
    mountedRef.current = true;
    
    // Check if we already have cached data for this file
    const cached = getCachedContent<T>(filePath);
    if (cached !== undefined) {
      setState({ data: cached, error: null, isLoading: false });
    } else {
      loadContent();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [filePath, loadContent]);

  return { ...state, refresh };
}

/**
 * Hook to memoize parsed data within a viewer component.
 * Use this when you need to derive data from cached content.
 * 
 * @param data - The source data (typically from useCachedContent)
 * @param parser - Function to parse/transform the data
 * @param deps - Additional dependencies
 * @returns The memoized parsed result
 * 
 * @example
 * ```tsx
 * const { data: rawContent } = useCachedContent(filePath, loadFile);
 * const lines = useMemoizedParse(rawContent, content => content?.split('\n') || [], []);
 * ```
 */
export function useMemoizedParse<TSource, TResult>(
  data: TSource | null,
  parser: (data: TSource) => TResult,
  deps: React.DependencyList = []
): TResult | null {
  return useMemo(() => {
    if (data === null) return null;
    return parser(data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ...deps]);
}
