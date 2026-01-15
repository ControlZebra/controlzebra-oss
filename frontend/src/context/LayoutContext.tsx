/**
 * LayoutContext - Global UI state management for the application layout.
 * 
 * Manages:
 * - Active sidebar view (Explorer, Changes, History, Settings, Profile)
 * - Sidebar collapse state and width
 * - Bottom panel collapse state, height, and active tab
 * - Theme preference (light/dark/system)
 */
import { 
  createContext, 
  useContext, 
  useState, 
  useCallback, 
  useMemo, 
  useEffect,
  type ReactNode 
} from 'react';
import { VIEWS, BOTTOM_PANELS, type ViewType, type BottomPanelType } from '../constants';

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
  // Sidebar state
  const [activeView, setActiveView] = useState<ViewType>(VIEWS.EXPLORER);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  
  // Bottom panel state
  const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState(true);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(DEFAULT_BOTTOM_PANEL_HEIGHT);
  const [activeBottomPanel, setActiveBottomPanel] = useState<BottomPanelType>(BOTTOM_PANELS.TERMINAL);
  
  // Settings category state (shared between sidebar and main area)
  const [selectedSettingsCategory, setSelectedSettingsCategory] = useState('git-config');
  
  // Repository settings category state (for repo-specific settings view)
  const [selectedRepoSettingsCategory, setSelectedRepoSettingsCategory] = useState('remote-sync');
  
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
  const toggleSidebar = useCallback(() => setSidebarCollapsed(prev => !prev), []);
  const toggleBottomPanel = useCallback(() => setBottomPanelCollapsed(prev => !prev), []);

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
