/**
 * L5XViewer - Displays Rockwell Automation L5X ladder logic files.
 * 
 * Features:
 * - Multi-tab interface for viewing different content types
 * - Ladder diagrams with virtualized rendering (RLL routines)
 * - Structured Text viewer (ST routines)
 * - Program navigation tree with full item selection
 * - Tag tables (controller and program-level)
 * - Controller information
 * - Data type structure viewer
 * - AOI parameters and local tags
 * - Module information
 * - Parsed data caching for tab persistence
 * 
 * Supports both light and dark themes via CSS custom properties.
 */
import React, { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { Cpu, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { ReadTextFile } from '../../../bindings/controlzebra/services/filesystemservice';
import { ICON_SIZES } from '../../constants';
import { useLayout } from '../../context/LayoutContext';
import type { ViewerProps } from '../../lib/viewers';
import { useCachedContent } from '../../lib/viewer-cache';

// Import ladder-visualizer components and parsers
import {
  parseString,
  VirtualizedLadderDiagram,
  ProgramNavigator,
  ControllerInfo,
  TagTable,
  StructuredTextViewer,
  AOIParameterTable,
  AOILocalTagTable,
  ModuleInfoTable,
  registerAOIsFromController,
  clearAOIs,
  DARK_THEME,
  type NormalizedController,
  type NormalizedRoutine,
  type NormalizedDataType,
  type NormalizedAOI,
  type NormalizedModule,
} from 'ladder-visualizer';

// Import local tab components
import { TabBar, useTabs, DataTypeTable, type TabData } from './l5x';

// Note: ladder-visualizer CSS is imported via index.css to work with Vite's CSS handling

// ============================================================================
// Theme Configuration
// ============================================================================

/**
 * ControlZebra theme for ladder-visualizer that uses CSS variables.
 * Maps ControlZebra's design system to ladder-visualizer colors.
 */
const CONTROL_ZEBRA_THEME = {
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

interface L5XViewerUIState {
  showNavigator: boolean;
}

// ============================================================================
// L5XViewer Component
// ============================================================================

/**
 * L5XViewer - Displays Rockwell Automation L5X ladder logic files.
 * Part of the multi-viewer architecture.
 * Uses cached parsed data to persist across tab switches.
 */
function L5XViewer({ filePath }: ViewerProps): JSX.Element {
  // UI state (not cached - should reset on new file)
  const [uiState, setUIState] = useState<L5XViewerUIState>({
    showNavigator: true,
  });

  // Tab management - internal to L5X viewer, cached by filePath
  const { tabs, activeTabId, openTab, closeTab, selectTab } = useTabs(filePath);

  // Track if we've auto-opened the first tab for this file
  const autoOpenedRef = React.useRef<string | null>(null);

  // Get theme from LayoutContext for reactive updates
  const { theme } = useLayout();
  
  // Compute isDarkMode based on theme setting
  const isDarkMode = useMemo(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  }, [theme]);

  // Loader function for cached content - parses L5X file
  const loadAndParseFile = useCallback(async (): Promise<NormalizedController> => {
    const result = await ReadTextFile(filePath);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to read file');
    }

    const parseResult = parseString(result.content || '', 'l5x');

    if (!parseResult.success || !parseResult.data) {
      throw new Error(parseResult.errors?.[0]?.message || 'Failed to parse L5X file');
    }

    return parseResult.data;
  }, [filePath]);

  // Use cached content - persists across tab/view switches
  const { data: controller, error, isLoading } = useCachedContent<NormalizedController>(
    filePath,
    loadAndParseFile
  );

  // Register AOIs when controller data is available (from cache or fresh load)
  useEffect(() => {
    if (controller) {
      // Re-register AOIs - needed for proper parameter labels
      clearAOIs();
      registerAOIsFromController(controller);
    }
  }, [controller]);

  // Auto-open first viewable routine when controller loads (only once per file, and only if no tabs from cache)
  useEffect(() => {
    // Skip if we already have tabs (from cache) or already auto-opened for this file
    if (tabs.length > 0 || !controller || autoOpenedRef.current === filePath) {
      return;
    }
    
    autoOpenedRef.current = filePath;
    
    // Find and open first viewable routine
    for (let pIdx = 0; pIdx < controller.programs.length; pIdx++) {
      const program = controller.programs[pIdx];
      for (let rIdx = 0; rIdx < program.routines.length; rIdx++) {
        const routine = program.routines[rIdx];
        if (routine.type === 'RLL' || routine.type === 'ST') {
          openTab(
            { type: 'routine', programIndex: pIdx, routineIndex: rIdx },
            routine.name
          );
          return;
        }
      }
    }
  }, [controller, filePath, openTab, tabs.length]);

  // Toggle navigator visibility
  const toggleNavigator = useCallback(() => {
    setUIState(prev => ({ ...prev, showNavigator: !prev.showNavigator }));
  }, []);

  // ============================================================================
  // Navigator Event Handlers
  // ============================================================================

  const handleRoutineSelect = useCallback((programIndex: number, routineIndex: number, routine: NormalizedRoutine) => {
    openTab(
      { type: 'routine', programIndex, routineIndex },
      routine.name
    );
  }, [openTab]);

  const handleControllerTagsSelect = useCallback(() => {
    openTab({ type: 'controller-tags' }, 'Controller Tags');
  }, [openTab]);

  const handleProgramTagsSelect = useCallback((programIndex: number) => {
    if (!controller) return;
    const program = controller.programs[programIndex];
    openTab(
      { type: 'program-tags', programIndex, programName: program.name },
      `${program.name} Tags`
    );
  }, [controller, openTab]);

  const handleControllerInfoSelect = useCallback(() => {
    openTab({ type: 'controller-info' }, 'Controller Info');
  }, [openTab]);

  const handleDataTypeSelect = useCallback((dataType: NormalizedDataType) => {
    openTab(
      { type: 'data-type', dataTypeName: dataType.name },
      dataType.name
    );
  }, [openTab]);

  const handleAOIParametersSelect = useCallback((aoi: NormalizedAOI) => {
    openTab(
      { type: 'aoi-parameters', aoiName: aoi.name },
      `${aoi.name} Parameters`
    );
  }, [openTab]);

  const handleAOILocalTagsSelect = useCallback((aoi: NormalizedAOI) => {
    openTab(
      { type: 'aoi-local-tags', aoiName: aoi.name },
      `${aoi.name} Local Tags`
    );
  }, [openTab]);

  const handleAOIRoutineSelect = useCallback((aoi: NormalizedAOI, routineIndex: number, routine: NormalizedRoutine) => {
    openTab(
      { type: 'aoi-routine', aoiName: aoi.name, routineIndex },
      `${aoi.name}:${routine.name}`
    );
  }, [openTab]);

  const handleModuleSelect = useCallback((module: NormalizedModule) => {
    openTab(
      { type: 'module', moduleId: module.id, moduleName: module.name },
      module.catalogNumber ? `${module.name} (${module.catalogNumber})` : module.name
    );
  }, [openTab]);

  // ============================================================================
  // Derive Navigator Selection from Active Tab
  // ============================================================================

  const activeTabData = useMemo(() => {
    if (!activeTabId) return null;
    const tab = tabs.find(t => t.id === activeTabId);
    return tab?.data || null;
  }, [activeTabId, tabs]);

  const selectedRoutine = useMemo(() => {
    if (activeTabData?.type === 'routine') {
      return { programIndex: activeTabData.programIndex, routineIndex: activeTabData.routineIndex };
    }
    return undefined;
  }, [activeTabData]);

  const selectedAOIRoutine = useMemo(() => {
    if (activeTabData?.type === 'aoi-routine') {
      return { aoiName: activeTabData.aoiName, routineIndex: activeTabData.routineIndex };
    }
    return undefined;
  }, [activeTabData]);

  // ============================================================================
  // Tab Content Rendering
  // ============================================================================

  // Helper to render unsupported routine type message (avoids duplication)
  const renderUnsupportedRoutineType = useCallback((routineType: string) => (
    <div className="flex flex-col items-center justify-center h-full text-theme-secondary gap-2">
      <p className="text-theme-primary font-medium">{routineType} Visualization Not Supported</p>
      <p className="text-sm">
        {routineType === 'FBD' 
          ? 'Function Block Diagram (FBD) visualization is not yet supported'
          : routineType === 'SFC'
            ? 'Sequential Function Chart (SFC) visualization is not yet supported'
            : `${routineType} routine visualization is not yet supported`
        }
      </p>
    </div>
  ), []);

  const renderTabContent = useCallback((tabData: TabData, isActive: boolean) => {
    if (!controller) return null;

    const containerClass = `flex-1 flex flex-col overflow-hidden h-full ${isActive ? '' : 'hidden'}`;
    const ladderContentClass = `flex-1 overflow-hidden ${isDarkMode ? 'ladder-visualizer-dark' : ''}`;

    switch (tabData.type) {
      case 'controller-tags':
        return (
          <div key="controller-tags" className={containerClass}>
            <div className="flex-1 overflow-auto p-4">
              <TagTable tags={controller.tags} />
            </div>
          </div>
        );

      case 'program-tags': {
        const program = controller.programs[tabData.programIndex];
        const tags = program?.tags ?? [];
        return (
          <div key={`program-tags-${tabData.programIndex}`} className={containerClass}>
            <div className="flex-1 overflow-auto p-4">
              {tags.length > 0 ? (
                <TagTable tags={tags} />
              ) : (
                <p className="text-center text-theme-secondary py-10">No program-specific tags defined</p>
              )}
            </div>
          </div>
        );
      }

      case 'controller-info':
        return (
          <div key="controller-info" className={containerClass}>
            <div className="flex-1 overflow-auto p-4">
              <ControllerInfo controller={controller} className="max-w-2xl" />
            </div>
          </div>
        );

      case 'data-type': {
        const dataType = controller.dataTypes.find(dt => dt.name === tabData.dataTypeName);
        if (dataType) {
          return (
            <div key={`data-type-${tabData.dataTypeName}`} className={containerClass}>
              <div className="flex-1 overflow-auto p-4">
                <DataTypeTable dataType={dataType} />
              </div>
            </div>
          );
        }
        return (
          <div key={`data-type-${tabData.dataTypeName}`} className={containerClass}>
            <p className="text-center text-theme-secondary py-10">Data type not found</p>
          </div>
        );
      }

      case 'aoi-parameters': {
        const aoi = controller.aois.find(a => a.name === tabData.aoiName);
        if (aoi) {
          return (
            <div key={`aoi-parameters-${tabData.aoiName}`} className={containerClass}>
              <div className="flex-1 overflow-auto p-4">
                <AOIParameterTable parameters={aoi.parameters} />
              </div>
            </div>
          );
        }
        return (
          <div key={`aoi-parameters-${tabData.aoiName}`} className={containerClass}>
            <p className="text-center text-theme-secondary py-10">AOI not found</p>
          </div>
        );
      }

      case 'aoi-local-tags': {
        const aoi = controller.aois.find(a => a.name === tabData.aoiName);
        if (aoi) {
          return (
            <div key={`aoi-local-tags-${tabData.aoiName}`} className={containerClass}>
              <div className="flex-1 overflow-auto p-4">
                <AOILocalTagTable localTags={aoi.localTags} />
              </div>
            </div>
          );
        }
        return (
          <div key={`aoi-local-tags-${tabData.aoiName}`} className={containerClass}>
            <p className="text-center text-theme-secondary py-10">AOI not found</p>
          </div>
        );
      }

      case 'aoi-routine': {
        const aoi = controller.aois.find(a => a.name === tabData.aoiName);
        const routine = aoi?.routines[tabData.routineIndex];
        if (aoi && routine) {
          return (
            <div key={`aoi-routine-${tabData.aoiName}-${tabData.routineIndex}`} className={containerClass}>
              <div className={ladderContentClass}>
                {routine.type === 'ST' ? (
                  <StructuredTextViewer routine={routine} className="h-full w-full" />
                ) : routine.type === 'RLL' ? (
                  <VirtualizedLadderDiagram
                    routine={routine}
                    theme={isDarkMode ? DARK_THEME : CONTROL_ZEBRA_THEME}
                    className="h-full"
                  />
                ) : (
                  renderUnsupportedRoutineType(routine.type)
                )}
              </div>
            </div>
          );
        }
        return (
          <div key={`aoi-routine-${tabData.aoiName}-${tabData.routineIndex}`} className={containerClass}>
            <p className="text-center text-theme-secondary py-10">AOI routine not found</p>
          </div>
        );
      }

      case 'routine': {
        const routine = controller.programs[tabData.programIndex]?.routines[tabData.routineIndex];
        if (routine) {
          return (
            <div key={`routine-${tabData.programIndex}-${tabData.routineIndex}`} className={containerClass}>
              <div className={ladderContentClass}>
                {routine.type === 'ST' ? (
                  <StructuredTextViewer routine={routine} className="h-full w-full" />
                ) : routine.type === 'RLL' ? (
                  <VirtualizedLadderDiagram
                    routine={routine}
                    theme={isDarkMode ? DARK_THEME : CONTROL_ZEBRA_THEME}
                    className="h-full"
                  />
                ) : (
                  renderUnsupportedRoutineType(routine.type)
                )}
              </div>
            </div>
          );
        }
        return (
          <div key={`routine-${tabData.programIndex}-${tabData.routineIndex}`} className={containerClass}>
            <p className="text-center text-theme-secondary py-10">Routine not found</p>
          </div>
        );
      }

      case 'module': {
        const module = controller.modules.find(m => m.id === tabData.moduleId);
        if (module) {
          return (
            <div key={`module-${tabData.moduleId}`} className={containerClass}>
              <div className="flex-1 overflow-auto p-4">
                <ModuleInfoTable module={module} />
              </div>
            </div>
          );
        }
        return (
          <div key={`module-${tabData.moduleId}`} className={containerClass}>
            <p className="text-center text-theme-secondary py-10">Module not found</p>
          </div>
        );
      }

      default:
        return null;
    }
  }, [controller, isDarkMode, renderUnsupportedRoutineType]);

  // ============================================================================
  // Main Content Rendering
  // ============================================================================

  const renderMainContent = () => {
    if (!controller) return null;

    if (tabs.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-theme-secondary gap-2 bg-theme-elevated">
          <p className="text-theme-primary font-medium">No Content Selected</p>
          <p className="text-sm">Select an item from the navigation panel to view its contents</p>
        </div>
      );
    }

    // Render all tabs (keeping inactive ones mounted but hidden)
    return (
      <>
        {tabs.map(tab => renderTabContent(tab.data, tab.id === activeTabId))}
      </>
    );
  };

  // ============================================================================
  // Render States
  // ============================================================================

  // Loading state
  if (isLoading) {
    const fileName = filePath.split('/').pop() || filePath;
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
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-theme-secondary gap-3">
        <AlertCircle size={ICON_SIZES.lg} className="text-red-400" />
        <div className="text-center">
          <p className="text-theme-primary font-medium mb-1">Cannot parse L5X file</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!controller) {
    return (
      <div className="flex items-center justify-center h-full text-theme-secondary">
        <p>No controller data found</p>
      </div>
    );
  }

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-theme-surface border-b border-theme-default text-sm">
        <Cpu size={ICON_SIZES.sm} className="text-theme-secondary" />
        <span className="text-theme-secondary truncate flex-1">{filePath}</span>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigator sidebar */}
        {uiState.showNavigator && (
          <div className="w-64 border-r border-theme-default bg-theme-surface overflow-hidden flex flex-col">
            <ProgramNavigator
              controller={controller}
              programs={controller.programs}
              selectedRoutine={selectedRoutine}
              selectedAOIRoutine={selectedAOIRoutine}
              onRoutineSelect={handleRoutineSelect}
              onControllerTagsSelect={handleControllerTagsSelect}
              onProgramTagsSelect={handleProgramTagsSelect}
              onControllerInfoSelect={handleControllerInfoSelect}
              onDataTypeSelect={handleDataTypeSelect}
              onModuleSelect={handleModuleSelect}
              onAOIParametersSelect={handleAOIParametersSelect}
              onAOILocalTagsSelect={handleAOILocalTagsSelect}
              onAOIRoutineSelect={handleAOIRoutineSelect}
              className="flex-1"
            />
          </div>
        )}

        {/* Toggle button for navigator */}
        <button
          onClick={toggleNavigator}
          className="flex items-center justify-center w-5 bg-theme-elevated border-r border-theme-default hover:bg-theme-muted transition-colors"
          title={uiState.showNavigator ? 'Hide navigator' : 'Show navigator'}
        >
          {uiState.showNavigator ? (
            <ChevronLeft size={14} className="text-theme-secondary" />
          ) : (
            <ChevronRight size={14} className="text-theme-secondary" />
          )}
        </button>

        {/* Content area with tabs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabSelect={selectTab}
            onTabClose={closeTab}
          />
          
          {/* Tab content */}
          <div className="flex-1 overflow-hidden relative">
            {renderMainContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(L5XViewer);
