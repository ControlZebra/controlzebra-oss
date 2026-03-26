import type { DiffTabData, DiffTabDescriptor } from './diff-view-model';
import {
  clearCachedPersistentTabState,
  getCachedPersistentTabState,
  usePersistentTabs,
} from '../../shared/usePersistentTabs';

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

const DIFF_TAB_CACHE_NAMESPACE = 'l5x-diff';

function createDiffTab(descriptor: DiffTabDescriptor): DiffTab {
  return {
    id: descriptor.id,
    type: descriptor.data.type,
    title: descriptor.title,
    subtitle: descriptor.subtitle,
    kind: descriptor.kind,
    changeCount: descriptor.changeCount,
    data: descriptor.data,
  };
}

export function getCachedDiffTabState(cacheKey: string): DiffTabStateCache | undefined {
  return getCachedPersistentTabState<DiffTab>(DIFF_TAB_CACHE_NAMESPACE, cacheKey);
}

export function clearCachedDiffTabState(cacheKey: string): void {
  clearCachedPersistentTabState(DIFF_TAB_CACHE_NAMESPACE, cacheKey);
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
  return usePersistentTabs<DiffTab, DiffTabDescriptor>({
    namespace: DIFF_TAB_CACHE_NAMESPACE,
    cacheKey,
    createTab: createDiffTab,
  });
}