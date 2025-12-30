import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { VIEWS, BOTTOM_PANELS } from '../constants';

const LayoutContext = createContext(null);

export function LayoutProvider({ children }) {
  const [activeView, setActiveView] = useState(VIEWS.CHANGES);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(224); // 14rem = 224px
  const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(160); // 10rem = 160px
  const [activeBottomPanel, setActiveBottomPanel] = useState(BOTTOM_PANELS.COMMIT);
  const [theme, setTheme] = useState('system');

  // System theme detection
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const applyTheme = () => {
      const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('light', !isDark);
    };

    applyTheme();
    
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme();
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const toggleSidebar = useCallback(() => setSidebarCollapsed(prev => !prev), []);
  const toggleBottomPanel = useCallback(() => setBottomPanelCollapsed(prev => !prev), []);

  const value = useMemo(() => ({
    activeView,
    setActiveView,
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    toggleSidebar,
    bottomPanelCollapsed,
    setBottomPanelCollapsed,
    bottomPanelHeight,
    setBottomPanelHeight,
    toggleBottomPanel,
    activeBottomPanel,
    setActiveBottomPanel,
    theme,
    setTheme,
  }), [activeView, sidebarCollapsed, sidebarWidth, bottomPanelCollapsed, bottomPanelHeight, activeBottomPanel, theme, toggleSidebar, toggleBottomPanel]);

  return (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}
