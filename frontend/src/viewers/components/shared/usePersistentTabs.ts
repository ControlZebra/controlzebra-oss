import { useCallback, useEffect, useRef, useState } from 'react';

interface PersistentTabState<TTab> {
  tabs: TTab[];
  activeTabId: string | null;
}

const persistentTabStateCaches = new Map<string, Map<string, PersistentTabState<unknown>>>();

function getPersistentTabCache(namespace: string): Map<string, PersistentTabState<unknown>> {
  const existingCache = persistentTabStateCaches.get(namespace);
  if (existingCache) {
    return existingCache;
  }

  const nextCache = new Map<string, PersistentTabState<unknown>>();
  persistentTabStateCaches.set(namespace, nextCache);
  return nextCache;
}

export function getCachedPersistentTabState<TTab>(namespace: string, cacheKey: string): PersistentTabState<TTab> | undefined {
  return getPersistentTabCache(namespace).get(cacheKey) as PersistentTabState<TTab> | undefined;
}

export function clearCachedPersistentTabState(namespace: string, cacheKey: string): void {
  getPersistentTabCache(namespace).delete(cacheKey);
}

export interface UsePersistentTabsOptions<TTab extends { id: string }, TDescriptor> {
  namespace: string;
  cacheKey?: string;
  createTab: (descriptor: TDescriptor) => TTab;
}

export interface UsePersistentTabsResult<TTab, TDescriptor> {
  tabs: TTab[];
  activeTabId: string | null;
  openTab: (descriptor: TDescriptor) => void;
  closeTab: (tabId: string) => void;
  selectTab: (tabId: string) => void;
  pruneTabs: (validTabIds: Set<string>) => void;
}

export function usePersistentTabs<TTab extends { id: string }, TDescriptor>({
  namespace,
  cacheKey,
  createTab,
}: UsePersistentTabsOptions<TTab, TDescriptor>): UsePersistentTabsResult<TTab, TDescriptor> {
  const readCachedState = useCallback((key?: string): PersistentTabState<TTab> | undefined => {
    if (!key) {
      return undefined;
    }

    return getCachedPersistentTabState<TTab>(namespace, key);
  }, [namespace]);

  const initialState = readCachedState(cacheKey);
  const [tabs, setTabs] = useState<TTab[]>(initialState?.tabs ?? []);
  const [activeTabId, setActiveTabId] = useState<string | null>(initialState?.activeTabId ?? null);

  const cacheKeyRef = useRef(cacheKey);
  const previousCacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  useEffect(() => {
    if (!cacheKeyRef.current) {
      return;
    }

    getPersistentTabCache(namespace).set(cacheKeyRef.current, { tabs, activeTabId });
  }, [activeTabId, namespace, tabs]);

  useEffect(() => {
    if (previousCacheKeyRef.current === cacheKey) {
      return;
    }

    previousCacheKeyRef.current = cacheKey;
    const cachedState = readCachedState(cacheKey);
    setTabs(cachedState?.tabs ?? []);
    setActiveTabId(cachedState?.activeTabId ?? null);
  }, [cacheKey, readCachedState]);

  const openTab = useCallback((descriptor: TDescriptor) => {
    const nextTab = createTab(descriptor);

    setTabs((previousTabs) => {
      if (previousTabs.some((tab) => tab.id === nextTab.id)) {
        return previousTabs;
      }

      return [...previousTabs, nextTab];
    });

    setActiveTabId(nextTab.id);
  }, [createTab]);

  const closeTab = useCallback((tabId: string) => {
    setTabs((previousTabs) => {
      const tabIndex = previousTabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1) {
        return previousTabs;
      }

      const nextTabs = previousTabs.filter((tab) => tab.id !== tabId);

      setActiveTabId((currentActiveTabId) => {
        if (currentActiveTabId !== tabId) {
          return currentActiveTabId;
        }

        if (nextTabs.length === 0) {
          return null;
        }

        return nextTabs[Math.min(tabIndex, nextTabs.length - 1)].id;
      });

      return nextTabs;
    });
  }, []);

  const selectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const pruneTabs = useCallback((validTabIds: Set<string>) => {
    setTabs((previousTabs) => previousTabs.filter((tab) => validTabIds.has(tab.id)));
    setActiveTabId((currentActiveTabId) => {
      if (!currentActiveTabId || validTabIds.has(currentActiveTabId)) {
        return currentActiveTabId;
      }

      return null;
    });
  }, []);

  return {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    selectTab,
    pruneTabs,
  };
}