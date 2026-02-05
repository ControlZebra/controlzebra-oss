/**
 * LayoutContext - Global UI state management for the application layout.
 * 
 * Manages:
 * - Active sidebar view (Explorer, Changes, History, Settings, Profile)
 * - Sidebar collapse state and width
 * - Bottom panel collapse state, height, and active tab
 * - Theme preference (light/dark/system)
 * - Responsive auto-collapse based on window size
 */
import { 
  createContext, 
  useContext, 
  useState, 
  useCallback, 
  useMemo, 
  useEffect,
  useRef,
  type ReactNode 
} from 'react';
import { 
  VIEWS, 
  BOTTOM_PANELS, 
  FILE_BROWSER_TAB,
  type ViewType, 
  type BottomPanelType,
  type ExplorerTab 
} from '../constants';
import { trackViewChanged, trackSettingsOpened } from '../lib/analytics';
import { useWindowSize } from '../hooks/useWindowSize';

// ============================================================================
// Types
// ============================================================================

export type Theme = 'light' | 'dark' | 'system';

interface LayoutContextValue {
  // Sidebar
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  
  // Bottom panel
  bottomPanelCollapsed: boolean;
  setBottomPanelCollapsed: (collapsed: boolean) => void;
  bottomPanelHeight: number;
  setBottomPanelHeight: (height: number) => void;
  toggleBottomPanel: () => void;
  activeBottomPanel: BottomPanelType;
  setActiveBottomPanel: (panel: BottomPanelType) => void;
  
  // Settings
  selectedSettingsCategory: string;
  setSelectedSettingsCategory: (category: string) => void;
  
  // Repository Settings
  selectedRepoSettingsCategory: string;
  setSelectedRepoSettingsCategory: (category: string) => void;
  
  // Explorer Tabs
  explorerTabs: ExplorerTab[];
  activeExplorerTab: string;
  openExplorerTab: (tab: ExplorerTab) => void;
  closeExplorerTab: (tabId: string) => void;
  setActiveExplorerTab: (tabId: string) => void;
  
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

interface LayoutProviderProps {
  children: ReactNode;
}

// ============================================================================
// Context
// ============================================================================

const LayoutContext = createContext<LayoutContextValue | null>(null);

// Default layout values
const DEFAULT_SIDEBAR_WIDTH = 224;  // 14rem
const DEFAULT_BOTTOM_PANEL_HEIGHT = 160;  // 10rem

export function LayoutProvider({ children }: LayoutProviderProps): JSX.Element {
  // Responsive window size tracking
  const { shouldCollapseSidebar, shouldCollapseBottomPanel } = useWindowSize();
  
  // Track if user manually toggled panels (to not override their preference)
  const userToggledSidebar = useRef(false);
  const userToggledBottomPanel = useRef(false);
  
  // Sidebar state
  const [activeView, _setActiveView] = useState<ViewType>(VIEWS.EXPLORER);
  const previousView = useRef<ViewType>(VIEWS.EXPLORER);
  const [sidebarCollapsed, _setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  
  // Wrap setSidebarCollapsed to track user intent
  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    userToggledSidebar.current = true;
    _setSidebarCollapsed(collapsed);
  }, []);
  
  // Auto-collapse sidebar based on window size vs sidebar width (if user hasn't manually toggled)
  useEffect(() => {
    const shouldCollapse = shouldCollapseSidebar(sidebarWidth);
    if (!userToggledSidebar.current && shouldCollapse) {
      _setSidebarCollapsed(true);
    }
  }, [shouldCollapseSidebar, sidebarWidth]);
  
  // Reset user toggle flag when window becomes wide enough for current sidebar
  useEffect(() => {
    const shouldCollapse = shouldCollapseSidebar(sidebarWidth);
    if (!shouldCollapse) {
      userToggledSidebar.current = false;
    }
  }, [shouldCollapseSidebar, sidebarWidth]);
  
  // Wrap setActiveView to track view changes
  const setActiveView = useCallback((view: ViewType) => {
    if (view !== previousView.current) {
      trackViewChanged({
        fromView: previousView.current,
        toView: view,
      });
      
      // Track settings opened specifically
      if (view === VIEWS.SETTINGS) {
        trackSettingsOpened({ category: 'general' });
      }
      
      previousView.current = view;
    }
    _setActiveView(view);
  }, []);
  
  // Bottom panel state
  const [bottomPanelCollapsed, _setBottomPanelCollapsed] = useState(true);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(DEFAULT_BOTTOM_PANEL_HEIGHT);
  const [activeBottomPanel, setActiveBottomPanel] = useState<BottomPanelType>(BOTTOM_PANELS.TERMINAL);
  
  // Wrap setBottomPanelCollapsed to track user intent
  const setBottomPanelCollapsed = useCallback((collapsed: boolean) => {
    userToggledBottomPanel.current = true;
    _setBottomPanelCollapsed(collapsed);
  }, []);
  
  // Auto-collapse bottom panel based on window size (if user hasn't manually toggled)
  useEffect(() => {
    if (!userToggledBottomPanel.current && shouldCollapseBottomPanel) {
      _setBottomPanelCollapsed(true);
    }
  }, [shouldCollapseBottomPanel]);
  
  // Reset user toggle flag when window becomes wide enough
  useEffect(() => {
    if (!shouldCollapseBottomPanel) {
      userToggledBottomPanel.current = false;
    }
  }, [shouldCollapseBottomPanel]);
  
  // Settings category state (shared between sidebar and main area)
  const [selectedSettingsCategory, setSelectedSettingsCategory] = useState('git-config');
  
  // Repository settings category state (for repo-specific settings view)
  const [selectedRepoSettingsCategory, setSelectedRepoSettingsCategory] = useState('remote-sync');
  
  // Explorer tabs state - file browser is always the first (pinned) tab
  const [explorerTabs, setExplorerTabs] = useState<ExplorerTab[]>([FILE_BROWSER_TAB]);
  const [activeExplorerTab, setActiveExplorerTab] = useState<string>(FILE_BROWSER_TAB.id);
  
  // Theme state
  const [theme, setTheme] = useState<Theme>('system');

  // System theme detection and application
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const applyTheme = (): void => {
      const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('light', !isDark);
    };

    applyTheme();
    
    // Listen for system theme changes
    const handleChange = (): void => {
      if (theme === 'system') {
        applyTheme();
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Toggle handlers - memoized to prevent unnecessary re-renders
  const toggleSidebar = useCallback(() => {
    _setSidebarCollapsed(prev => !prev);
    userToggledSidebar.current = true;
  }, []);
  const toggleBottomPanel = useCallback(() => {
    _setBottomPanelCollapsed(prev => !prev);
    userToggledBottomPanel.current = true;
  }, []);

  // Explorer tab handlers
  const openExplorerTab = useCallback((tab: ExplorerTab) => {
    setExplorerTabs(prev => {
      // Check if tab already exists
      const existingTab = prev.find(t => t.id === tab.id);
      if (existingTab) {
        return prev;
      }
      // Add new tab
      return [...prev, tab];
    });
    setActiveExplorerTab(tab.id);
  }, []);

  const closeExplorerTab = useCallback((tabId: string) => {
    setExplorerTabs(prev => {
      const tab = prev.find(t => t.id === tabId);
      // Cannot close pinned tabs
      if (tab?.isPinned) return prev;
      
      const newTabs = prev.filter(t => t.id !== tabId);
      return newTabs;
    });
    
    // If closing active tab, switch to file browser
    setActiveExplorerTab(prev => {
      if (prev === tabId) {
        return FILE_BROWSER_TAB.id;
      }
      return prev;
    });
  }, []);

  // Memoized context value to prevent unnecessary re-renders
  const value = useMemo<LayoutContextValue>(() => ({
    // Sidebar
    activeView,
    setActiveView,
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    toggleSidebar,
    
    // Bottom panel
    bottomPanelCollapsed,
    setBottomPanelCollapsed,
    bottomPanelHeight,
    setBottomPanelHeight,
    toggleBottomPanel,
    activeBottomPanel,
    setActiveBottomPanel,
    
    // Settings
    selectedSettingsCategory,
    setSelectedSettingsCategory,
    
    // Repository Settings
    selectedRepoSettingsCategory,
    setSelectedRepoSettingsCategory,
    
    // Explorer Tabs
    explorerTabs,
    activeExplorerTab,
    openExplorerTab,
    closeExplorerTab,
    setActiveExplorerTab,
    
    // Theme
    theme,
    setTheme,
  }), [
    activeView, 
    sidebarCollapsed, 
    sidebarWidth, 
    bottomPanelCollapsed, 
    bottomPanelHeight, 
    activeBottomPanel,
    selectedSettingsCategory,
    selectedRepoSettingsCategory,
    explorerTabs,
    activeExplorerTab,
    openExplorerTab,
    closeExplorerTab,
    theme, 
    toggleSidebar, 
    toggleBottomPanel
  ]);

  return (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  );
}

/**
 * useLayout - Hook to access layout context.
 * Must be used within a LayoutProvider.
 */
export function useLayout(): LayoutContextValue {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}
