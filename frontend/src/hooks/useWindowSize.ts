/**
 * useWindowSize - Hook for responsive behavior based on window dimensions.
 * 
 * Provides current window size and breakpoint helpers.
 * Used for auto-collapsing panels and showing/hiding responsive elements.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';

// Breakpoint thresholds (in pixels)
export const BREAKPOINTS = {
  /** Below this width, TopBar uses compact/burger menu */
  TOPBAR_COMPACT: 1280,
  /** Minimum supported width */
  MIN_WIDTH: 1024,
  /** Minimum main area width before sidebar should collapse */
  MIN_MAIN_AREA_WIDTH: 600,
  /** Activity bar width (fixed) */
  ACTIVITY_BAR_WIDTH: 40,
} as const;

interface WindowSize {
  width: number;
  height: number;
}

interface UseWindowSizeReturn extends WindowSize {
  /** True when TopBar should show burger menu instead of full buttons */
  isCompactTopBar: boolean;
  /** Check if sidebar should collapse based on its current width */
  shouldCollapseSidebar: (sidebarWidth: number) => boolean;
}

/**
 * Hook that tracks window size and provides responsive breakpoint flags.
 */
export function useWindowSize(): UseWindowSizeReturn {
  const [windowSize, setWindowSize] = useState<WindowSize>({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const handleResize = useCallback(() => {
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, []);

  useEffect(() => {
    // Add resize listener with debounce for performance
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const debouncedResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 100);
    };

    window.addEventListener('resize', debouncedResize);
    
    // Initial size
    handleResize();

    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(timeoutId);
    };
  }, [handleResize]);

  // Function to check if sidebar should collapse based on its width
  const shouldCollapseSidebar = useCallback((sidebarWidth: number): boolean => {
    // Available space for main area = window width - activity bar - sidebar
    const availableMainArea = windowSize.width - BREAKPOINTS.ACTIVITY_BAR_WIDTH - sidebarWidth;
    return availableMainArea < BREAKPOINTS.MIN_MAIN_AREA_WIDTH;
  }, [windowSize.width]);

  // Compute breakpoint flags
  const breakpointFlags = useMemo(() => ({
    isCompactTopBar: windowSize.width < BREAKPOINTS.TOPBAR_COMPACT,
  }), [windowSize.width]);

  return {
    ...windowSize,
    ...breakpointFlags,
    shouldCollapseSidebar,
  };
}
