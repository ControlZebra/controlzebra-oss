import { useState, useCallback, useEffect, useRef } from 'react';

import type { DiffTabData, DiffTabDescriptor } from './diff-view-model';

export interface DiffTab {
  id: string;
  type: DiffTabData['type'];
  title: string;
  subtitle?: string;
  kind: DiffTabDescriptor['kind'];
  changeCount: number;
  data: DiffTabData;
}

interface DiffTabStateCache {
  tabs: DiffTab[];
  activeTabId: string | null;
}

const diffTabStateCache = new Map<string, DiffTabStateCache>();

export function getCachedDiffTabState(cacheKey: string): DiffTabStateCache | undefined {
  return diffTabStateCache.get(cacheKey);
}

export function clearCachedDiffTabState(cacheKey: string): void {
  diffTabStateCache.delete(cacheKey);
}

export interface UseDiffTabsResult {
  tabs: DiffTab[];
  activeTabId: string | null;
  openTab: (descriptor: DiffTabDescriptor) => void;
  closeTab: (tabId: string) => void;
  selectTab: (tabId: string) => void;
  pruneTabs: (validTabIds: Set<string>) => void;
}

export function useDiffTabs(cacheKey?: string): UseDiffTabsResult {
  const cachedState = cacheKey ? getCachedDiffTabState(cacheKey) : undefined;

  const [tabs, setTabs] = useState<DiffTab[]>(cachedState?.tabs ?? []);
  const [activeTabId, setActiveTabId] = useState<string | null>(cachedState?.activeTabId ?? null);

  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  useEffect(() => {
    if (cacheKeyRef.current) {
      diffTabStateCache.set(cacheKeyRef.current, { tabs, activeTabId });
    }
  }, [tabs, activeTabId]);

  const openTab = useCallback((descriptor: DiffTabDescriptor) => {
    setTabs((previousTabs) => {
      const existingTab = previousTabs.find((tab) => tab.id === descriptor.id);
      if (existingTab) {
        return previousTabs;
      }

      return [
        ...previousTabs,
        {
          id: descriptor.id,
          type: descriptor.data.type,
          title: descriptor.title,
          subtitle: descriptor.subtitle,
          kind: descriptor.kind,
          changeCount: descriptor.changeCount,
          data: descriptor.data,
        },
      ];
    });

    setActiveTabId(descriptor.id);
  }, []);

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