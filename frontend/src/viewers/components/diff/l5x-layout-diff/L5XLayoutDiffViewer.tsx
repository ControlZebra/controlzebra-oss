import { memo, useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import {
  AlertCircle,
  Cpu,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  clearAOIs,
  ProgramNavigator,
  diffControllers,
  parseString,
  registerAOIsFromController,
  TagTable,
  type ColumnDefinition,
  type L5XDiff,
  type NormalizedController,
  type NormalizedProgram,
  type NormalizedTag,
} from 'ladder-visualizer';

import { useLayout } from '../../../../context/LayoutContext';
import { ICON_SIZES } from '../../../../shared/constants';
import { onEvent } from '../../../../shared/runtime/events';
import { TabBar } from '../../file/l5x';
import { ViewerHeader } from '../../shared/ViewerHeader';
import { getPathFileName } from '../../shared/path-utils';
import type { DiffSide } from '../../../registry/diff-registry';
import { loadTextSide, serializeDiffSide } from '../diff-side-loaders';
import { buildL5XDiffLayoutViewModel } from './adapter';
import { RoutineDiffInspector } from './RoutineDiffInspector';
import type { L5XDiffAggregateChangeKind, L5XDiffRenderableEntity } from './types';
import { useDiffTabs } from './useDiffTabs';

interface CachedController {
  controller: NormalizedController;
  timestamp: number;
}

interface CachedDiffBundle {
  diff: L5XDiff;
  oldController: NormalizedController;
  newController: NormalizedController;
  timestamp: number;
}

interface LoadState {
  phase: 'idle' | 'loading-old' | 'loading-new' | 'parsing' | 'diffing' | 'done' | 'error';
  error?: string;
}

export interface L5XLayoutDiffViewerProps {
  repoPath: string;
  filePath: string;
  oldSide: DiffSide;
  newSide: DiffSide;
  fileStatus: 'added' | 'modified' | 'deleted' | 'renamed' | string;
}

const controllerCache = new Map<string, CachedController>();
const diffCache = new Map<string, CachedDiffBundle>();

const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 20;

const emptyController: NormalizedController = {
  name: '',
  programs: [],
  tags: [],
  dataTypes: [],
  aois: [],
  modules: [],
};

const PHASE_LABELS: Record<string, string> = {
  'loading-old': 'Loading previous version…',
  'loading-new': 'Loading current version…',
  parsing: 'Parsing L5X data…',
  diffing: 'Preparing Phase 1 model…',
};

function buildControllerCacheKey(repoPath: string, side: DiffSide): string {
  return `${repoPath}|${serializeDiffSide(side)}`;
}

function buildDiffCacheKey(repoPath: string, oldSide: DiffSide, newSide: DiffSide): string {
  return `${repoPath}|${serializeDiffSide(oldSide)}|${serializeDiffSide(newSide)}`;
}

function getCachedController(key: string): NormalizedController | undefined {
  const entry = controllerCache.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) {
    controllerCache.delete(key);
    return undefined;
  }
  return entry.controller;
}

function setCachedController(key: string, controller: NormalizedController): void {
  if (controllerCache.size >= MAX_CACHE_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [candidateKey, candidateValue] of controllerCache) {
      if (candidateValue.timestamp < oldestTime) {
        oldestTime = candidateValue.timestamp;
        oldestKey = candidateKey;
      }
    }
    if (oldestKey) {
      controllerCache.delete(oldestKey);
    }
  }

  controllerCache.set(key, { controller, timestamp: Date.now() });
}

function getCachedDiffBundle(key: string): CachedDiffBundle | undefined {
  const entry = diffCache.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) {
    diffCache.delete(key);
    return undefined;
  }
  return entry;
}

function setCachedDiffBundle(key: string, bundle: Omit<CachedDiffBundle, 'timestamp'>): void {
  if (diffCache.size >= MAX_CACHE_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [candidateKey, candidateValue] of diffCache) {
      if (candidateValue.timestamp < oldestTime) {
        oldestTime = candidateValue.timestamp;
        oldestKey = candidateKey;
      }
    }
    if (oldestKey) {
      diffCache.delete(oldestKey);
    }
  }

  diffCache.set(key, { ...bundle, timestamp: Date.now() });
}

export function clearL5XLayoutDiffCache(): void {
  controllerCache.clear();
  diffCache.clear();
}

function parseL5X(content: string, label: string): NormalizedController {
  const result = parseString(content, 'l5x');
  if (!result.success || !result.data) {
    throw new Error(result.errors?.[0]?.message || `Failed to parse ${label} L5X content`);
  }
  return result.data;
}

function getChangeTone(kind: L5XDiffAggregateChangeKind): string {
  switch (kind) {
    case 'added':
      return 'border-theme-added/40 bg-theme-added/10 text-theme-added';
    case 'removed':
      return 'border-theme-removed/40 bg-theme-removed/10 text-theme-removed';
    case 'modified':
      return 'border-theme-modified/40 bg-theme-modified/10 text-theme-modified';
    default:
      return 'border-theme-default bg-theme-elevated text-theme-secondary';
  }
}

function formatChangeKind(kind: L5XDiffAggregateChangeKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function getTagRowStyle(tagDiffKind: L5XDiffAggregateChangeKind | undefined): CSSProperties | undefined {
  if (!tagDiffKind || tagDiffKind === 'mixed') {
    return undefined;
  }

  if (tagDiffKind === 'added') {
    return {
      ['--table-cell-bg' as '--table-cell-bg']: 'rgba(42, 123, 77, 0.12)',
    };
  }

  if (tagDiffKind === 'removed') {
    return {
      ['--table-cell-bg' as '--table-cell-bg']: 'rgba(167, 50, 63, 0.12)',
    };
  }

  return {
    ['--table-cell-bg' as '--table-cell-bg']: 'rgba(186, 127, 38, 0.12)',
  };
}

function buildTagDiffColumns(entity: Extract<L5XDiffRenderableEntity, { kind: 'controller-tags' | 'program-tags' }>): ColumnDefinition<NormalizedTag>[] {
  const tagDiffsByName = new Map(entity.changedTagDiffs.map((tagDiff) => [tagDiff.name, tagDiff]));

  return [
    {
      key: 'diffKind',
      header: 'Change',
      sortKey: 'name',
      render: (tag) => {
        const diff = tagDiffsByName.get(tag.name);
        if (!diff) {
          return <span className="text-theme-muted">Unchanged</span>;
        }

        return (
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${getChangeTone(diff.kind)}`}>
            {formatChangeKind(diff.kind)}
          </span>
        );
      },
      cellStyle: { width: '112px' },
    },
    {
      key: 'propertyChanges',
      header: 'Changed Fields',
      sortKey: 'name',
      render: (tag) => {
        const diff = tagDiffsByName.get(tag.name);
        if (!diff || !diff.propertyChanges || diff.propertyChanges.length === 0) {
          return <span className="text-theme-muted">-</span>;
        }

        return (
          <div className="flex flex-wrap gap-1">
            {diff.propertyChanges.map((propertyChange) => (
              <span
                key={`${tag.name}:${propertyChange.property}`}
                className="rounded border border-theme-default bg-theme-elevated px-1.5 py-0.5 text-[11px] text-theme-secondary"
              >
                {propertyChange.property}
              </span>
            ))}
          </div>
        );
      },
      cellStyle: { minWidth: '220px' },
    },
  ];
}

function buildNavigatorController(viewModel: NonNullable<ReturnType<typeof buildL5XDiffLayoutViewModel>>): NormalizedController {
  const routineEntities = Object.values(viewModel.entitiesByTabId).filter(
    (entity): entity is Extract<L5XDiffRenderableEntity, { kind: 'routine' }> => entity.kind === 'routine',
  );
  const programTagEntities = Object.values(viewModel.entitiesByTabId).filter(
    (entity): entity is Extract<L5XDiffRenderableEntity, { kind: 'program-tags' }> => entity.kind === 'program-tags',
  );
  const controllerTagsEntity = Object.values(viewModel.entitiesByTabId).find(
    (entity): entity is Extract<L5XDiffRenderableEntity, { kind: 'controller-tags' }> => entity.kind === 'controller-tags',
  );

  const programsByName = new Map<string, NormalizedProgram>();

  for (const routineEntity of routineEntities) {
    const sourceProgram = routineEntity.newProgram ?? routineEntity.oldProgram;
    const sourceRoutine = routineEntity.newRoutine ?? routineEntity.oldRoutine;
    if (!sourceProgram || !sourceRoutine) {
      continue;
    }

    const existingProgram = programsByName.get(routineEntity.programName);
    if (existingProgram) {
      existingProgram.routines.push(sourceRoutine);
      continue;
    }

    programsByName.set(routineEntity.programName, {
      ...sourceProgram,
      routines: [sourceRoutine],
      tags: [],
    });
  }

  for (const programTagEntity of programTagEntities) {
    const existingProgram = programsByName.get(programTagEntity.programName);
    if (existingProgram) {
      existingProgram.tags = programTagEntity.fullContextTags;
      continue;
    }

    const sourceProgram = programTagEntity.newProgram ?? programTagEntity.oldProgram;
    if (!sourceProgram) {
      continue;
    }

    programsByName.set(programTagEntity.programName, {
      ...sourceProgram,
      routines: [],
      tags: programTagEntity.fullContextTags,
    });
  }

  return {
    ...viewModel.newController,
    tags: controllerTagsEntity?.fullContextTags ?? [],
    programs: [...programsByName.values()].sort((left, right) => left.name.localeCompare(right.name)),
    aois: [],
    dataTypes: [],
    modules: [],
  };
}

function RenderEntityDetails({
  entity,
  isDarkMode,
}: {
  entity: L5XDiffRenderableEntity;
  isDarkMode: boolean;
}): JSX.Element {
  if (entity.kind === 'routine') {
    return (
      <div className="h-full min-h-0">
        <RoutineDiffInspector entity={entity} isDarkMode={isDarkMode} />
      </div>
    );
  }

  const tagDiffsByName = new Map(entity.changedTagDiffs.map((tagDiff) => [tagDiff.name, tagDiff]));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-4">
      <TagTable
        tags={entity.fullContextTags}
        extraColumns={buildTagDiffColumns(entity)}
        getRowStyle={(tag) => getTagRowStyle(tagDiffsByName.get(tag.name)?.kind)}
        className="h-full"
      />
    </div>
  );
}

function L5XLayoutDiffViewer({
  repoPath,
  filePath,
  oldSide,
  newSide,
  fileStatus,
}: L5XLayoutDiffViewerProps): JSX.Element {
  const { theme } = useLayout();
  const [loadState, setLoadState] = useState<LoadState>({ phase: 'idle' });
  const [bundle, setBundle] = useState<CachedDiffBundle | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showNavigator, setShowNavigator] = useState(true);

  const isDarkMode = useMemo(() => {
    if (theme === 'dark') {
      return true;
    }
    if (theme === 'light') {
      return false;
    }
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  }, [theme]);

  const cacheKeys = useMemo(() => ({
    oldController: buildControllerCacheKey(repoPath, oldSide),
    newController: buildControllerCacheKey(repoPath, newSide),
    diff: buildDiffCacheKey(repoPath, oldSide, newSide),
  }), [repoPath, oldSide, newSide]);
  const diffTabCacheKey = useMemo(() => `${repoPath}|${filePath}`, [repoPath, filePath]);
  const {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    selectTab,
    pruneTabs,
  } = useDiffTabs(diffTabCacheKey);

  const normalizedWorkingPaths = useMemo(
    () => [oldSide, newSide]
      .filter((side): side is Extract<DiffSide, { kind: 'working' }> => side.kind === 'working')
      .map((side) => side.absolutePath.replace(/\\/g, '/').toLowerCase()),
    [oldSide, newSide],
  );

  const handleRetry = useCallback(() => {
    setRetryCount((prev) => prev + 1);
  }, []);

  const handleReload = useCallback(() => {
    controllerCache.delete(cacheKeys.oldController);
    controllerCache.delete(cacheKeys.newController);
    diffCache.delete(cacheKeys.diff);
    setRetryCount((prev) => prev + 1);
  }, [cacheKeys]);

  const toggleNavigator = useCallback(() => {
    setShowNavigator((previousState) => !previousState);
  }, []);

  useEffect(() => {
    if (normalizedWorkingPaths.length === 0) {
      return undefined;
    }

    const unsubscribe = onEvent('files-changed', (event: {
      data?: { path?: string; eventType?: string; isDir?: boolean };
    }) => {
      const changedPath = event.data?.path?.replace(/\\/g, '/').toLowerCase();
      const eventType = event.data?.eventType;
      const isDir = event.data?.isDir;

      if (!changedPath || isDir) return;
      if (eventType !== 'write' && eventType !== 'rename' && eventType !== 'remove') return;
      if (!normalizedWorkingPaths.includes(changedPath)) return;

      handleReload();
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [handleReload, normalizedWorkingPaths]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const cachedBundle = getCachedDiffBundle(cacheKeys.diff);
      if (cachedBundle) {
        setBundle(cachedBundle);
        setLoadState({ phase: 'done' });
        return;
      }

      try {
        setLoadState({ phase: 'loading-old' });
        setBundle(null);

        let oldController: NormalizedController | undefined;
        if (fileStatus !== 'added') {
          oldController = getCachedController(cacheKeys.oldController);
          if (!oldController) {
            const oldContent = await loadTextSide(repoPath, oldSide);
            if (cancelled) return;
            if (oldContent !== null) {
              setLoadState({ phase: 'parsing' });
              oldController = parseL5X(oldContent, 'old');
              setCachedController(cacheKeys.oldController, oldController);
            }
          }
        }

        if (cancelled) return;

        setLoadState({ phase: 'loading-new' });

        let newController: NormalizedController | undefined;
        if (fileStatus !== 'deleted') {
          newController = getCachedController(cacheKeys.newController);
          if (!newController) {
            const newContent = await loadTextSide(repoPath, newSide);
            if (cancelled) return;
            if (newContent !== null) {
              setLoadState({ phase: 'parsing' });
              newController = parseL5X(newContent, 'new');
              setCachedController(cacheKeys.newController, newController);
            }
          }
        }

        if (cancelled) return;

        clearAOIs();
        if (newController) {
          registerAOIsFromController(newController);
        } else if (oldController) {
          registerAOIsFromController(oldController);
        }

        setLoadState({ phase: 'diffing' });

        const resolvedOldController = oldController ?? emptyController;
        const resolvedNewController = newController ?? emptyController;
        const diff = diffControllers(resolvedOldController, resolvedNewController);
        const nextBundle = {
          diff,
          oldController: resolvedOldController,
          newController: resolvedNewController,
        };

        if (cancelled) return;

        setCachedDiffBundle(cacheKeys.diff, nextBundle);
        setBundle({ ...nextBundle, timestamp: Date.now() });
        setLoadState({ phase: 'done' });
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[L5XLayoutDiffViewer] Error:', message);
          setLoadState({ phase: 'error', error: message });
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [cacheKeys, fileStatus, newSide, oldSide, repoPath, retryCount]);

  const viewModel = useMemo(() => {
    if (!bundle) {
      return null;
    }

    return buildL5XDiffLayoutViewModel({
      oldController: bundle.oldController,
      newController: bundle.newController,
      diff: bundle.diff,
    });
  }, [bundle]);

  useEffect(() => {
    if (!viewModel) {
      return;
    }

    pruneTabs(new Set(viewModel.tabs.map((tab) => tab.id)));
  }, [pruneTabs, viewModel]);

  useEffect(() => {
    if (!viewModel || tabs.length > 0 || !viewModel.initialTabId) {
      return;
    }

    const initialEntity = viewModel.entitiesByTabId[viewModel.initialTabId];
    if (initialEntity) {
      openTab(initialEntity.tab);
    }
  }, [openTab, tabs.length, viewModel]);

  const handleOpenItem = useCallback((tabId: string) => {
    if (!viewModel) {
      return;
    }

    const entity = viewModel.entitiesByTabId[tabId];
    if (!entity) {
      return;
    }

    openTab(entity.tab);
  }, [openTab, viewModel]);

  const activeEntity = activeTabId && viewModel ? viewModel.entitiesByTabId[activeTabId] : undefined;
  const unsupportedTotal = viewModel
    ? viewModel.unsupportedChanges.stRoutineCount + viewModel.unsupportedChanges.otherRoutineCount
    : 0;
  const navigatorController = useMemo(() => {
    if (!viewModel) {
      return null;
    }

    return buildNavigatorController(viewModel);
  }, [viewModel]);
  const controllerTagsEntity = useMemo(() => {
    if (!viewModel) {
      return undefined;
    }

    return Object.values(viewModel.entitiesByTabId).find(
      (entity): entity is Extract<L5XDiffRenderableEntity, { kind: 'controller-tags' }> => entity.kind === 'controller-tags',
    );
  }, [viewModel]);
  const programTagEntitiesByName = useMemo(() => {
    if (!viewModel) {
      return new Map<string, Extract<L5XDiffRenderableEntity, { kind: 'program-tags' }>>();
    }

    return new Map(
      Object.values(viewModel.entitiesByTabId)
        .filter((entity): entity is Extract<L5XDiffRenderableEntity, { kind: 'program-tags' }> => entity.kind === 'program-tags')
        .map((entity) => [entity.programName, entity]),
    );
  }, [viewModel]);
  const routineEntitiesByKey = useMemo(() => {
    if (!viewModel) {
      return new Map<string, Extract<L5XDiffRenderableEntity, { kind: 'routine' }>>();
    }

    return new Map(
      Object.values(viewModel.entitiesByTabId)
        .filter((entity): entity is Extract<L5XDiffRenderableEntity, { kind: 'routine' }> => entity.kind === 'routine')
        .map((entity) => [`${entity.programName}::${entity.routineName}`, entity]),
    );
  }, [viewModel]);

  const selectedNavigatorItemId = useMemo(() => {
    if (!activeEntity || !navigatorController) {
      return null;
    }

    if (activeEntity.kind === 'controller-tags') {
      return 'controller-tags';
    }

    const programIndex = navigatorController.programs.findIndex((program) => program.name === activeEntity.programName);
    if (programIndex < 0) {
      return null;
    }

    if (activeEntity.kind === 'program-tags') {
      return `program-tags-${programIndex}`;
    }

    const routineIndex = navigatorController.programs[programIndex]?.routines.findIndex((routine) => routine.name === activeEntity.routineName) ?? -1;
    if (routineIndex < 0) {
      return null;
    }

    return `routine-${programIndex}-${routineIndex}`;
  }, [activeEntity, navigatorController]);

  // Auto-expand only the ancestry paths of changed items
  const navigatorInitialExpanded = useMemo(() => {
    if (!navigatorController) {
      return undefined;
    }

    const keys = new Set<string>();
    const hasControllerTags = Boolean(controllerTagsEntity);

    if (hasControllerTags) {
      keys.add('controller');
    }

    // Check each program for changed routines or tags
    let hasAnyProgramChanges = false;
    navigatorController.programs.forEach((program, pIdx) => {
      const hasChangedRoutines = program.routines.some(
        (routine) => routineEntitiesByKey.has(`${program.name}::${routine.name}`),
      );
      const hasChangedTags = programTagEntitiesByName.has(program.name);

      if (hasChangedRoutines || hasChangedTags) {
        keys.add(`program-${pIdx}`);
        hasAnyProgramChanges = true;
      }
    });

    // Show Tasks > MainTask ancestry if any program has changes
    if (hasAnyProgramChanges) {
      keys.add('tasks');
      keys.add('mainTask');
    }

    return keys;
  }, [navigatorController, controllerTagsEntity, programTagEntitiesByName, routineEntitiesByKey]);

  if (loadState.phase !== 'done' && loadState.phase !== 'error') {
    const phaseLabel = PHASE_LABELS[loadState.phase] ?? 'Preparing…';
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-theme-secondary">
        <Loader2 size={ICON_SIZES.lg} className="animate-spin" />
        <div className="text-center">
          <p className="text-sm font-medium">{phaseLabel}</p>
          <p className="text-xs text-theme-muted mt-1">{getPathFileName(filePath)}</p>
        </div>
      </div>
    );
  }

  if (loadState.phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-theme-secondary">
        <AlertCircle size={ICON_SIZES.lg} className="text-theme-error" />
        <div className="text-center max-w-md">
          <p className="text-sm font-medium text-theme-primary mb-1">Cannot generate L5X diff</p>
          <p className="text-xs text-theme-muted mb-4">{loadState.error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-theme-primary bg-theme-elevated border border-theme-default rounded-md hover:bg-theme-muted/30 transition-colors"
          >
            <RefreshCw size={ICON_SIZES.sm} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!viewModel) {
    return (
      <div className="flex items-center justify-center h-full text-theme-muted text-sm">
        <FileWarning size={ICON_SIZES.md} className="mr-2" />
        No diff data available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-theme-bg">
      <ViewerHeader
        filePath={filePath}
        icon={Cpu}
        extraContent={(
          <button
            type="button"
            onClick={handleReload}
            title="Reload diff"
            className="rounded border border-theme-default bg-theme-elevated p-1.5 text-theme-muted transition-colors hover:bg-theme-muted hover:text-theme-primary"
          >
            <RefreshCw size={ICON_SIZES.sm} />
          </button>
        )}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        {viewModel.navigatorSections.length === 0 ? (
          <div className="flex h-full items-center justify-center text-theme-secondary">
            <div className="text-center">
              <p className="text-sm font-medium text-theme-primary">No changed routines or tags</p>
              <p className="mt-1 text-xs text-theme-muted">The Phase 1 model only surfaces changed routines and tag groups.</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 overflow-hidden">
            {showNavigator ? (
              <aside className="w-72 min-h-0 overflow-hidden border-r border-theme-default bg-theme-surface shrink-0">
                <ProgramNavigator
                  controller={navigatorController ?? emptyController}
                  programs={navigatorController?.programs ?? []}
                  selectedItemId={selectedNavigatorItemId}
                  initialExpanded={navigatorInitialExpanded}
                  filter={{
                    showController: Boolean(controllerTagsEntity),
                    showControllerTags: Boolean(controllerTagsEntity),
                    showPrograms: (program) => Boolean(programTagEntitiesByName.get(program.name) || program.routines.length > 0),
                    showProgramTags: (program) => Boolean(programTagEntitiesByName.get(program.name)),
                    showRoutine: (_program, _programIndex, routine, _routineIndex) => routineEntitiesByKey.has(`${_program.name}::${routine.name}`),
                    showUnscheduled: false,
                    showMotionGroups: false,
                    showAOIs: false,
                    showDataTypes: false,
                    showIO: false,
                  }}
                  badges={{
                    controllerTags: controllerTagsEntity ? `${controllerTagsEntity.changedTagDiffs.length} changed` : undefined,
                    programTags: (program) => {
                      const entity = programTagEntitiesByName.get(program.name);
                      return entity ? `${entity.changedTagDiffs.length} changed` : undefined;
                    },
                    routine: (program, _programIndex, routine) => {
                      const entity = routineEntitiesByKey.get(`${program.name}::${routine.name}`);
                      return entity ? formatChangeKind(entity.changeKind) : undefined;
                    },
                  }}
                  onControllerTagsSelect={() => {
                    const entity = controllerTagsEntity;
                    if (entity) {
                      handleOpenItem(entity.tab.id);
                    }
                  }}
                  onProgramTagsSelect={(programIndex) => {
                    const program = navigatorController?.programs[programIndex];
                    const entity = program ? programTagEntitiesByName.get(program.name) : undefined;
                    if (entity) {
                      handleOpenItem(entity.tab.id);
                    }
                  }}
                  onRoutineSelect={(programIndex, routineIndex, routine) => {
                    const program = navigatorController?.programs[programIndex];
                    if (!program) {
                      return;
                    }

                    const entity = routineEntitiesByKey.get(`${program.name}::${routine.name}`);
                    if (entity) {
                      handleOpenItem(entity.tab.id);
                    }
                  }}
                  className="h-full border-0"
                />
              </aside>
            ) : null}

            <button
              type="button"
              onClick={toggleNavigator}
              className="w-6 border-r border-theme-default bg-theme-surface hover:bg-theme-elevated transition-colors flex items-center justify-center shrink-0"
              title={showNavigator ? 'Hide navigator' : 'Show navigator'}
            >
              {showNavigator ? (
                <ChevronLeft size={ICON_SIZES.xs} className="text-theme-muted" />
              ) : (
                <ChevronRight size={ICON_SIZES.xs} className="text-theme-muted" />
              )}
            </button>

            <main className="flex-1 min-h-0 overflow-hidden bg-theme-bg">
              <TabBar
                tabs={tabs.map((tab) => ({ id: tab.id, title: tab.title }))}
                activeTabId={activeTabId}
                onTabSelect={selectTab}
                onTabClose={closeTab}
              />

              <div className="flex-1 overflow-hidden relative">
                {activeEntity ? (
                  <RenderEntityDetails entity={activeEntity} isDarkMode={isDarkMode} />
                ) : (
                  <div className="flex h-full items-center justify-center bg-theme-elevated text-theme-secondary">
                    Select a changed routine or tag group.
                  </div>
                )}
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(L5XLayoutDiffViewer);
