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
import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { Cpu, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { ReadTextFile } from '../../../../bindings/controlzebra/services/filesystemservice';
import { ICON_SIZES } from '../../../shared/constants';
import { onEvent } from '../../../shared/runtime/events';
import type { ViewerProps } from '../../registry/viewer-registry';
import { invalidateCachedContent, useCachedContent } from '../../registry/viewer-cache';
import { getPathFileName } from '../shared/path-utils';
import L5XProjectOrganizer from '../shared/L5XProjectOrganizer';
import L5XDocumentStatus from '../shared/L5XDocumentStatus';
import { hasEncodedOnlyTargets, parseL5XDocument, type L5XDocumentResult } from '../shared/l5x-document';

// Import ladder-visualizer components and parsers
import {
  ControllerInfo,
  TagTable,
  AOIParameterTable,
  AOILocalTagTable,
  ModuleInfoTable,
  registerAOIsFromController,
  clearAOIs,
  type NormalizedRoutine,
  type NormalizedDataType,
  type NormalizedAOI,
  type NormalizedModule,
} from 'ladder-visualizer';

// Import local tab components
import { DataTypeTable, TabBar, useTabs, type TabData } from './l5x';
import { L5XRoutineViewer } from './l5x/L5XRoutineViewer';

// Note: ladder-visualizer CSS is imported via index.css to work with Vite's CSS handling

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
function L5XViewer({ filePath, onShowRaw }: ViewerProps & { onShowRaw?: () => void }): JSX.Element {
  // UI state (not cached - should reset on new file)
  const [uiState, setUIState] = useState<L5XViewerUIState>({
    showNavigator: true,
  });
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [fbdSheetIndices, setFbdSheetIndices] = useState<Record<string, number>>({});

  // Tab management - internal to L5X viewer, cached by filePath
  const { tabs, activeTabId, openTab, closeTab, selectTab } = useTabs(filePath);

  const normalizedFilePath = useMemo(() => filePath.replace(/\\/g, '/'), [filePath]);

  useEffect(() => {
    const handleFilesChanged = (event: {
      data?: {
        path?: string;
        eventType?: string;
        isDir?: boolean;
      };
    }) => {
      const changedPath = event.data?.path?.replace(/\\/g, '/');
      const eventType = event.data?.eventType;
      const isDir = event.data?.isDir;

      if (!changedPath || isDir) return;
      if (eventType !== 'write' && eventType !== 'rename' && eventType !== 'remove') return;

      const samePath =
        changedPath === normalizedFilePath ||
        changedPath.toLowerCase() === normalizedFilePath.toLowerCase();

      if (!samePath) return;

      invalidateCachedContent(filePath);
      invalidateCachedContent(`l5x:${filePath}`);
      setRefreshCounter((current) => current + 1);
    };

    const unsubscribe = onEvent('files-changed', handleFilesChanged);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [filePath, normalizedFilePath]);

  // Loader function for cached content - parses L5X file
  const loadAndParseFile = useCallback(async (): Promise<L5XDocumentResult> => {
    const result = await ReadTextFile(filePath);
    
    if (!result.success) {
      throw new Error(result.error?.includes('max 10MB')
        ? 'This file exceeds the 10 MB text viewer limit. Open it in the default app to inspect it.'
        : 'Cannot read this file. Check that it is available, then reopen it.');
    }

    return parseL5XDocument(result.content || '');
  }, [filePath]);

  // Use cached content - persists across tab/view switches
  const { data: documentResult, error, isLoading } = useCachedContent<L5XDocumentResult>(
    `l5x:${filePath}`,
    loadAndParseFile,
    [refreshCounter]
  );
  const controller = documentResult?.controller ?? null;

  // Register AOIs when controller data is available (from cache or fresh load)
  useEffect(() => {
    clearAOIs();
    if (controller) {
      // Re-register AOIs - needed for proper parameter labels
      registerAOIsFromController(controller);
    }
  }, [controller]);

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

  const selectedNavigatorItemId = useMemo(() => {
    if (activeTabData?.type === 'data-type') {
      return `dt-${activeTabData.dataTypeName}`;
    }
    return undefined;
  }, [activeTabData]);

  // ============================================================================
  // Tab Content Rendering
  // ============================================================================

  const renderTabContent = useCallback((tabData: TabData, isActive: boolean) => {
    if (!controller) return null;

    const containerClass = `flex-1 flex flex-col overflow-hidden h-full ${isActive ? '' : 'hidden'}`;
    const ladderContentClass = 'flex-1 overflow-hidden';
    const dataTypes = controller.dataTypeCatalog ?? controller.dataTypes;

    switch (tabData.type) {
      case 'controller-tags':
        return (
          <div key="controller-tags" className={containerClass}>
            <div className="flex-1 overflow-auto p-4">
              <TagTable tags={controller.tags} dataTypes={dataTypes} />
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
                <TagTable tags={tags} dataTypes={dataTypes} />
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
        const dataType = dataTypes.find(dt => dt.name === tabData.dataTypeName);
        if (dataType) {
          return (
            <div key={`data-type-${tabData.dataTypeName}`} className={containerClass}>
              <div className="flex-1 overflow-hidden p-4">
                <DataTypeTable
                  dataType={dataType}
                  allDataTypes={dataTypes}
                  onDataTypeSelect={handleDataTypeSelect}
                />
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
        const routineKey = `${normalizedFilePath}:aoi:${tabData.aoiName}:${tabData.routineIndex}`;
        if (aoi && routine) {
          return (
            <div key={`aoi-routine-${tabData.aoiName}-${tabData.routineIndex}`} className={containerClass}>
              <div className={ladderContentClass}>
                <L5XRoutineViewer
                  routine={routine}
                  fbdSheetIndex={fbdSheetIndices[routineKey] ?? 0}
                  onFbdSheetIndexChange={(sheetIndex) => {
                    setFbdSheetIndices((current) => ({ ...current, [routineKey]: sheetIndex }));
                  }}
                />
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
        const routineKey = `${normalizedFilePath}:program:${tabData.programIndex}:${tabData.routineIndex}`;
        if (routine) {
          return (
            <div key={`routine-${tabData.programIndex}-${tabData.routineIndex}`} className={containerClass}>
              <div className={ladderContentClass}>
                <L5XRoutineViewer
                  routine={routine}
                  fbdSheetIndex={fbdSheetIndices[routineKey] ?? 0}
                  onFbdSheetIndexChange={(sheetIndex) => {
                    setFbdSheetIndices((current) => ({ ...current, [routineKey]: sheetIndex }));
                  }}
                />
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
  }, [controller, fbdSheetIndices, handleDataTypeSelect, normalizedFilePath]);

  // ============================================================================
  // Main Content Rendering
  // ============================================================================

  const renderMainContent = () => {
    if (!controller) return null;

    if (tabs.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-theme-secondary gap-2 bg-theme-surface">
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
    const fileName = getPathFileName(filePath);
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
        <AlertCircle size={ICON_SIZES.lg} className="text-theme-error" />
        <div className="text-center">
          <p className="text-theme-primary font-medium mb-1">Cannot load L5X file</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!controller || documentResult?.status === 'failed' || (documentResult && hasEncodedOnlyTargets(documentResult))) {
    return (
      <div className="flex h-full flex-col bg-theme-surface text-theme-secondary">
        {documentResult && <L5XDocumentStatus result={documentResult} onShowRaw={onShowRaw} />}
        {documentResult?.status !== 'failed' && (
          <p className="p-4 text-sm">No structured view is available for this export target. Use Raw to inspect the file.</p>
        )}
      </div>
    );
  }

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <div className="h-full flex flex-col overflow-hidden bg-theme-surface">
      <L5XDocumentStatus result={documentResult} onShowRaw={onShowRaw} />
      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigator sidebar */}
        {uiState.showNavigator && (
          <div className="w-64 bg-theme-surface overflow-hidden flex flex-col">
            <L5XProjectOrganizer
              controller={controller}
              programs={controller.programs}
              selectedRoutine={selectedRoutine}
              selectedAOIRoutine={selectedAOIRoutine}
              selectedItemId={selectedNavigatorItemId}
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
          className="flex items-center justify-center w-5 bg-theme-surface border-r border-shell-divider hover:bg-theme-muted transition-colors"
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
