import type { L5XDiffTabDescriptor } from './types';
import {
  clearCachedPersistentTabState,
  getCachedPersistentTabState,
  usePersistentTabs,
} from '../../shared/usePersistentTabs';

export interface L5XDiffTabState {
  tabs: L5XDiffTabDescriptor[];
  activeTabId: string | null;
}

const DIFF_TAB_CACHE_NAMESPACE = 'l5x-layout-diff';

export function getCachedL5XDiffTabState(cacheKey: string): L5XDiffTabState | undefined {
  return getCachedPersistentTabState<L5XDiffTabDescriptor>(DIFF_TAB_CACHE_NAMESPACE, cacheKey);
}

export function clearCachedL5XDiffTabState(cacheKey: string): void {
  clearCachedPersistentTabState(DIFF_TAB_CACHE_NAMESPACE, cacheKey);
}

export interface UseL5XDiffTabsResult {
  tabs: L5XDiffTabDescriptor[];
  activeTabId: string | null;
  openTab: (tab: L5XDiffTabDescriptor) => void;
  closeTab: (tabId: string) => void;
  selectTab: (tabId: string) => void;
  pruneTabs: (validTabIds: Set<string>) => void;
}

export function useDiffTabs(cacheKey?: string): UseL5XDiffTabsResult {
  return usePersistentTabs<L5XDiffTabDescriptor, L5XDiffTabDescriptor>({
    namespace: DIFF_TAB_CACHE_NAMESPACE,
    cacheKey,
    createTab: (tab) => tab,
  });
}
