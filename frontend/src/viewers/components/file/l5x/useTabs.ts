/**
 * Tab management hook for L5XViewer
 * Ported from ladder-visualizer demo
 * 
 * Supports optional caching of tab state by file path to persist
 * tabs across view switches.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { NormalizedController } from 'ladder-visualizer';
import { collectAmbiguousProgramUids, programIdentityKey } from './program-identity';
import { metadataTargetId, type MetadataTarget } from './metadata-model';

// ============================================================================
// TAB TYPES AND INTERFACES
// ============================================================================

export type TabType = 
  | 'routine' 
  | 'controller-tags' 
  | 'program-tags' 
  | 'controller-info' 
  | 'data-type' 
  | 'aoi-parameters' 
  | 'aoi-local-tags' 
  | 'aoi-routine'
  | 'metadata'
  | 'module';

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  data: TabData;
}

export type TabData = 
  | { type: 'routine'; programIndex: number; routineIndex: number; programName?: string; programUid?: string; programUidAmbiguous?: boolean; routineName?: string }
  | { type: 'controller-tags' }
  | { type: 'program-tags'; programIndex: number; programName: string; programUid?: string; programUidAmbiguous?: boolean }
  | { type: 'controller-info' }
  | { type: 'data-type'; dataTypeName: string }
  | { type: 'aoi-parameters'; aoiName: string }
  | { type: 'aoi-local-tags'; aoiName: string }
  | { type: 'aoi-routine'; aoiName: string; routineIndex: number; routineName?: string }
  | { type: 'metadata'; target: MetadataTarget }
  | { type: 'module'; moduleId: number; moduleName: string };

// ============================================================================
// TAB STATE CACHE
// Persists tab state per file path to survive view switches
// ============================================================================

interface TabStateCache {
  tabs: Tab[];
  activeTabId: string | null;
  ambiguousProgramUids?: ReadonlySet<string>;
}

/** Module-level cache for L5X viewer tab states, keyed by file path */
const tabStateCache = new Map<string, TabStateCache>();

/**
 * Get cached tab state for a file path.
 */
export function getCachedTabState(filePath: string): TabStateCache | undefined {
  return tabStateCache.get(filePath);
}

/**
 * Clear cached tab state for a file path.
 */
export function clearCachedTabState(filePath: string): void {
  tabStateCache.delete(filePath);
}

/**
 * Clear all cached tab states.
 */
export function clearAllTabStates(): void {
  tabStateCache.clear();
}

// ============================================================================
// TAB ID GENERATORS
// ============================================================================

export function generateTabId(data: TabData): string {
  switch (data.type) {
    case 'routine':
      if (data.programName && data.routineName) return JSON.stringify(['routine',
        programIdentityKey({ name: data.programName, uid: data.programUid, ambiguousUid: data.programUidAmbiguous }), data.routineName]);
      return `routine-${data.programIndex}-${data.routineIndex}`;
    case 'controller-tags':
      return 'controller-tags';
    case 'program-tags':
      return JSON.stringify(['program-tags', programIdentityKey({ name: data.programName, uid: data.programUid, ambiguousUid: data.programUidAmbiguous })]);
    case 'controller-info':
      return 'controller-info';
    case 'data-type':
      return `data-type-${data.dataTypeName}`;
    case 'aoi-parameters':
      return `aoi-parameters-${data.aoiName}`;
    case 'aoi-local-tags':
      return `aoi-local-tags-${data.aoiName}`;
    case 'aoi-routine':
      if (data.routineName) return JSON.stringify(['aoi-routine', data.aoiName, data.routineName]);
      return `aoi-routine-${data.aoiName}-${data.routineIndex}`;
    case 'module':
      return `module-${data.moduleName}`;
    case 'metadata':
      return metadataTargetId(data.target);
  }
}

// ============================================================================
// HOOK
// ============================================================================

export interface UseTabsResult {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (data: TabData, title: string, existingTabId?: string) => void;
  ambiguousProgramUids: ReadonlySet<string>;
  closeTab: (tabId: string) => void;
  selectTab: (tabId: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (tabId: string) => void;
  getActiveTabData: () => TabData | null;
  findTab: (tabId: string) => Tab | undefined;
}

/**
 * Hook for managing L5X viewer tabs.
 * 
 * @param filePath - Optional file path for caching tab state.
 *                   When provided, tab state persists across view switches.
 */
export function useTabs(filePath?: string, programs?: NormalizedController['programs']): UseTabsResult {
  // Initialize from cache if available
  const cachedState = filePath ? getCachedTabState(filePath) : undefined;
  
  const [tabs, setTabs] = useState<Tab[]>(cachedState?.tabs ?? []);
  const [activeTabId, setActiveTabId] = useState<string | null>(cachedState?.activeTabId ?? null);
  const [uidHistory, setUidHistory] = useState<ReadonlySet<string>>(cachedState?.ambiguousProgramUids ?? new Set());

  // Track the file path for cache updates
  const filePathRef = useRef(filePath);
  if (filePathRef.current !== filePath) {
    filePathRef.current = filePath;
    setTabs(cachedState?.tabs ?? []);
    setActiveTabId(cachedState?.activeTabId ?? null);
    setUidHistory(cachedState?.ambiguousProgramUids ?? new Set());
  }
  const ambiguousProgramUids = useMemo(() => programs ? collectAmbiguousProgramUids(programs, uidHistory) : uidHistory, [programs, uidHistory]);
  useEffect(() => { setUidHistory(ambiguousProgramUids); }, [ambiguousProgramUids]);

  // Persist tab state to cache whenever it changes
  useEffect(() => {
    if (filePathRef.current) {
      tabStateCache.set(filePathRef.current, { tabs, activeTabId, ambiguousProgramUids });
    }
  }, [tabs, activeTabId, ambiguousProgramUids]);

  /**
   * Open a new tab or switch to an existing one
   */
  const openTab = useCallback((data: TabData, title: string, existingTabId?: string) => {
    const id = existingTabId ?? generateTabId(data);
    
    setTabs((prevTabs) => {
      const existingTab = prevTabs.find(t => t.id === id);
      if (existingTab) {
        return prevTabs.map(tab => tab.id === id ? { ...tab, title, data } : tab);
      }
      
      const newTab: Tab = {
        id,
        type: data.type,
        title,
        data,
      };
      
      return [...prevTabs, newTab];
    });
    
    setActiveTabId(id);
  }, []);

  /**
   * Close a tab
   */
  const closeTab = useCallback((tabId: string) => {
    setTabs((prevTabs) => {
      const tabIndex = prevTabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) return prevTabs;
      
      const newTabs = prevTabs.filter(t => t.id !== tabId);
      
      // Use functional update for activeTabId to avoid stale closure
      setActiveTabId((currentActiveId) => {
        if (tabId === currentActiveId && newTabs.length > 0) {
          const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
          return newTabs[newActiveIndex].id;
        } else if (newTabs.length === 0) {
          return null;
        }
        return currentActiveId;
      });
      
      return newTabs;
    });
  }, []);

  /**
   * Select/activate a tab
   */
  const selectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  /**
   * Close all tabs
   */
  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
  }, []);

  /**
   * Close all tabs except the specified one
   */
  const closeOtherTabs = useCallback((tabId: string) => {
    setTabs((prevTabs) => {
      const tab = prevTabs.find(t => t.id === tabId);
      if (!tab) return prevTabs;
      return [tab];
    });
    setActiveTabId(tabId);
  }, []);

  /**
   * Get the data of the currently active tab
   */
  const getActiveTabData = useCallback((): TabData | null => {
    if (!activeTabId) return null;
    const tab = tabs.find(t => t.id === activeTabId);
    return tab?.data || null;
  }, [activeTabId, tabs]);

  /**
   * Find a tab by ID
   */
  const findTab = useCallback((tabId: string): Tab | undefined => {
    return tabs.find(t => t.id === tabId);
  }, [tabs]);

  return {
    tabs,
    activeTabId,
    openTab,
    ambiguousProgramUids,
    closeTab,
    selectTab,
    closeAllTabs,
    closeOtherTabs,
    getActiveTabData,
    findTab,
  };
}
