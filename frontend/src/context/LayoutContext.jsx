/**
 * LayoutContext - Global UI state management for the application layout.
 * 
 * Manages:
 * - Active sidebar view (Explorer, Changes, History, Settings, Profile)
 * - Sidebar collapse state and width
 * - Bottom panel collapse state, height, and active tab
 * - Theme preference (light/dark/system)
 */
import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { VIEWS, BOTTOM_PANELS } from '../constants';

const LayoutContext = createContext(null);

// Default layout values
const DEFAULT_SIDEBAR_WIDTH = 224;  // 14rem
const DEFAULT_BOTTOM_PANEL_HEIGHT = 160;  // 10rem

export function LayoutProvider({ children }) {
  // Sidebar state
  const [activeView, setActiveView] = useState(VIEWS.EXPLORER);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  
  // Bottom panel state
  const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState(true);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(DEFAULT_BOTTOM_PANEL_HEIGHT);
  const [activeBottomPanel, setActiveBottomPanel] = useState(BOTTOM_PANELS.TERMINAL);
  
  // Theme state
  const [theme, setTheme] = useState('system');

  // System theme detection and application
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const applyTheme = () => {
      const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('light', !isDark);
    };

    applyTheme();
    
    // Listen for system theme changes
    const handleChange = () => {
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
  const value = useMemo(() => ({
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
export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}
