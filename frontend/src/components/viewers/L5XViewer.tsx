/**
 * L5XViewer - Displays Rockwell Automation L5X ladder logic files.
 * 
 * Integrates with the ladder-visualizer package to parse and render:
 * - Ladder diagrams with virtualized rendering
 * - Program navigation tree
 * - Tag tables
 * - Controller information
 * 
 * Supports both light and dark themes via CSS custom properties.
 */
import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { Cpu, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { ReadTextFile } from '../../../bindings/controlzebra/services/filesystemservice';
import { ICON_SIZES } from '../../constants';
import { useLayout } from '../../context/LayoutContext';
import type { ViewerProps } from '../../lib/viewers';

// Import ladder-visualizer components and parsers
import {
  parseString,
  VirtualizedLadderDiagram,
  ProgramNavigator,
  ControllerInfo,
  TagTable,
  DARK_THEME,
  type NormalizedController,
  type NormalizedRoutine,
} from 'ladder-visualizer';

// Note: ladder-visualizer CSS is imported via index.css to work with Vite's CSS handling

// ============================================================================
// Theme Configuration
// ============================================================================

/**
 * ControlZebra theme for ladder-visualizer that uses CSS variables.
 * Maps ControlZebra's design system to ladder-visualizer colors.
 */
const CONTROL_ZEBRA_THEME = {
  // Use CSS variables from ControlZebra's theme system
  powerRailColor: 'var(--color-accent-primary)',
  wireColor: 'var(--color-text-secondary)',
  contactColor: 'var(--color-text-primary)',
  contactNCColor: '#d32f2f',
  coilColor: 'var(--color-text-primary)',
  boxBorderColor: 'var(--color-border-default)',
  boxBgColor: 'var(--color-bg-surface)',
  boxTextColor: 'var(--color-text-primary)',
  rungNumberBg: 'var(--color-bg-elevated)',
  rungNumberColor: 'var(--color-text-muted)',
  labelColor: 'var(--color-text-primary)',
  addressColor: 'var(--color-text-secondary)',
  branchConnectorColor: 'var(--color-text-secondary)',
  bgPrimary: 'var(--color-bg-surface)',
  borderColor: 'var(--color-border-default)',
  textMuted: 'var(--color-text-muted)',
};

// ============================================================================
// Types
// ============================================================================

type ViewMode = 'ladder' | 'tags' | 'info';

interface SelectedRoutine {
  programIndex: number;
  routineIndex: number;
}

interface L5XViewerState {
  controller: NormalizedController | null;
  selectedRoutine: SelectedRoutine | null;
  viewMode: ViewMode;
  error: string | null;
  isLoading: boolean;
  showNavigator: boolean;
}

// ============================================================================
// L5XViewer Component
// ============================================================================

/**
 * L5XViewer - Displays Rockwell Automation L5X ladder logic files.
 * Part of the multi-viewer architecture.
 */
function L5XViewer({ filePath }: ViewerProps): JSX.Element {
  const [state, setState] = useState<L5XViewerState>({
    controller: null,
    selectedRoutine: null,
    viewMode: 'ladder',
    error: null,
    isLoading: true,
    showNavigator: true,
  });

  // Get theme from LayoutContext for reactive updates
  const { theme } = useLayout();
  
  // Compute isDarkMode based on theme setting (reactive to theme changes)
  const isDarkMode = useMemo(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    // For 'system', check the actual document class which LayoutContext maintains
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  }, [theme]);

  // Load and parse the L5X file
  useEffect(() => {
    let mounted = true;

    async function loadFile(): Promise<void> {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      try {
        // Read file as text (L5X is XML)
        const result = await ReadTextFile(filePath);
        
        if (!mounted) return;
        
        if (!result.success) {
          setState(prev => ({ 
            ...prev, 
            error: result.error || 'Failed to read file',
            isLoading: false 
          }));
          return;
        }

        // Parse the L5X file content
        const parseResult = parseString(result.content || '', 'l5x');
        
        if (!mounted) return;

        if (!parseResult.success || !parseResult.data) {
          setState(prev => ({ 
            ...prev, 
            error: parseResult.errors?.[0]?.message || 'Failed to parse L5X file',
            isLoading: false 
          }));
          return;
        }

        const controller = parseResult.data;
        
        // Auto-select first RLL (ladder logic) routine
        let selectedRoutine: SelectedRoutine | null = null;
        for (let pIdx = 0; pIdx < controller.programs.length; pIdx++) {
          const program = controller.programs[pIdx];
          for (let rIdx = 0; rIdx < program.routines.length; rIdx++) {
            if (program.routines[rIdx].type === 'RLL') {
              selectedRoutine = { programIndex: pIdx, routineIndex: rIdx };
              break;
            }
          }
          if (selectedRoutine) break;
        }

        setState(prev => ({
          ...prev,
          controller,
          selectedRoutine,
          isLoading: false,
        }));

      } catch (err) {
        if (mounted) {
          setState(prev => ({
            ...prev,
            error: err instanceof Error ? err.message : 'Failed to parse file',
            isLoading: false,
          }));
        }
      }
    }

    loadFile();

    return () => {
      mounted = false;
    };
  }, [filePath]);

  // Handle routine selection from navigator
  const handleRoutineSelect = useCallback((programIndex: number, routineIndex: number, _routine: NormalizedRoutine) => {
    setState(prev => ({
      ...prev,
      selectedRoutine: { programIndex, routineIndex },
    }));
  }, []);

  // Toggle navigator visibility
  const toggleNavigator = useCallback(() => {
    setState(prev => ({ ...prev, showNavigator: !prev.showNavigator }));
  }, []);

  // Switch view mode
  const setViewMode = useCallback((mode: ViewMode) => {
    setState(prev => ({ ...prev, viewMode: mode }));
  }, []);

  // Get current selected routine object
  const currentRoutine = useMemo(() => {
    if (!state.controller || !state.selectedRoutine) return null;
    const program = state.controller.programs[state.selectedRoutine.programIndex];
    return program?.routines[state.selectedRoutine.routineIndex] || null;
  }, [state.controller, state.selectedRoutine]);

  // Extract filename from path
  const fileName = filePath.split('/').pop() || filePath;

  // Loading state
  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-theme-secondary">
        <div className="animate-pulse flex items-center gap-2">
          <Cpu size={ICON_SIZES.md} />
          <span>Parsing {fileName}...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (state.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-theme-secondary gap-3">
        <AlertCircle size={ICON_SIZES.lg} className="text-red-400" />
        <div className="text-center">
          <p className="text-theme-primary font-medium mb-1">Cannot parse L5X file</p>
          <p className="text-sm">{state.error}</p>
        </div>
      </div>
    );
  }

  if (!state.controller) {
    return (
      <div className="flex items-center justify-center h-full text-theme-secondary">
        <p>No controller data found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-theme-surface border-b border-theme-default text-sm">
        <Cpu size={ICON_SIZES.sm} className="text-theme-secondary" />
        <span className="text-theme-secondary truncate flex-1">{filePath}</span>
        
        {/* View mode tabs */}
        <div className="flex items-center gap-1 bg-theme-elevated rounded-md p-0.5">
          <button
            onClick={() => setViewMode('ladder')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              state.viewMode === 'ladder'
                ? 'bg-theme-surface text-theme-primary'
                : 'text-theme-secondary hover:text-theme-primary'
            }`}
          >
            Ladder
          </button>
          <button
            onClick={() => setViewMode('tags')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              state.viewMode === 'tags'
                ? 'bg-theme-surface text-theme-primary'
                : 'text-theme-secondary hover:text-theme-primary'
            }`}
          >
            Tags
          </button>
          <button
            onClick={() => setViewMode('info')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              state.viewMode === 'info'
                ? 'bg-theme-surface text-theme-primary'
                : 'text-theme-secondary hover:text-theme-primary'
            }`}
          >
            Info
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigator sidebar */}
        {state.showNavigator && state.viewMode === 'ladder' && (
          <div className="w-64 border-r border-theme-default bg-theme-surface overflow-hidden flex flex-col">
            <ProgramNavigator
              controller={state.controller}
              programs={state.controller.programs}
              selectedRoutine={state.selectedRoutine || undefined}
              onRoutineSelect={handleRoutineSelect}
              className="flex-1"
            />
          </div>
        )}

        {/* Toggle button for navigator */}
        {state.viewMode === 'ladder' && (
          <button
            onClick={toggleNavigator}
            className="flex items-center justify-center w-5 bg-theme-elevated border-r border-theme-default hover:bg-theme-muted transition-colors"
            title={state.showNavigator ? 'Hide navigator' : 'Show navigator'}
          >
            {state.showNavigator ? (
              <ChevronLeft size={14} className="text-theme-secondary" />
            ) : (
              <ChevronRight size={14} className="text-theme-secondary" />
            )}
          </button>
        )}

        {/* Content area */}
        <div className={`flex-1 overflow-hidden ${isDarkMode ? 'ladder-visualizer-dark' : ''}`}>
          {state.viewMode === 'ladder' && currentRoutine?.type === 'RLL' && (
            <VirtualizedLadderDiagram
              routine={currentRoutine}
              theme={isDarkMode ? DARK_THEME : CONTROL_ZEBRA_THEME}
              className="h-full"
            />
          )}

          {state.viewMode === 'ladder' && currentRoutine && currentRoutine.type !== 'RLL' && (
            <div className="flex items-center justify-center h-full text-theme-secondary">
              <p>
                {currentRoutine.name} is a {currentRoutine.type} routine (not ladder logic)
              </p>
            </div>
          )}

          {state.viewMode === 'ladder' && !currentRoutine && (
            <div className="flex items-center justify-center h-full text-theme-secondary">
              <p>Select a routine from the navigator</p>
            </div>
          )}

          {state.viewMode === 'tags' && (
            <div className="h-full overflow-auto p-4">
              <TagTable 
                tags={state.controller.tags}
                className="w-full"
              />
            </div>
          )}

          {state.viewMode === 'info' && (
            <div className="h-full overflow-auto p-4">
              <ControllerInfo 
                controller={state.controller}
                className="max-w-2xl"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(L5XViewer);
