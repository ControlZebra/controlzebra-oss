/**
 * L5XDiffViewer — Domain-aware L5X diff viewer using explicit old/new sides.
 *
 * The viewer prefers the unified snapshot contract (`oldSide`/`newSide`) and
 * falls back to legacy commit/working-tree metadata during migration.
 */
import { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { Cpu, AlertCircle, ChevronLeft, ChevronRight, FileWarning, Loader2, RefreshCw } from 'lucide-react';
import {
  parseString,
  diffControllers,
  registerAOIsFromController,
  clearAOIs,
  DARK_THEME,
  type NormalizedController,
  type L5XDiff,
} from 'ladder-visualizer';
import { onEvent } from '../../../../shared/runtime/events';
import { ICON_SIZES } from '../../../../shared/constants';
import { useLayout } from '../../../../context/LayoutContext';
import { getPathFileName } from '../../shared/path-utils';
import type { DiffSide } from '../../../registry/diff-registry';
import { TabBar } from '../../file/l5x';
import { CONTROL_ZEBRA_LADDER_THEME } from '../../file/l5x/theme';
import {
  loadTextSide,
  serializeDiffSide,
} from '../diff-side-loaders';

import DiffNavigator from './DiffNavigator';
import RoutineDiffSection from './RoutineDiffSection';
import TagDiffSection from './TagDiffSection';
import { buildDiffNavigatorModel, type DiffTabData, type DiffTabDescriptor } from './diff-view-model';
import { useDiffTabs } from './useDiffTabs';

interface CachedController {
  controller: NormalizedController;
  timestamp: number;
}

interface CachedDiff {
  diff: L5XDiff;
  timestamp: number;
}

const controllerCache = new Map<string, CachedController>();
const diffCache = new Map<string, CachedDiff>();

const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 20;

function buildControllerCacheKey(repoPath: string, side: DiffSide): string {
  return `${repoPath}|${serializeDiffSide(side)}`;
}

function buildDiffCacheKey(repoPath: string, oldSide: DiffSide, newSide: DiffSide): string {
  return `${repoPath}|${serializeDiffSide(oldSide)}|${serializeDiffSide(newSide)}`;
}

function getCachedController(key: string): NormalizedController | undefined {
  const entry = controllerCache.get(key);
  if (!entry) return undefined;
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

function getCachedDiff(key: string): L5XDiff | undefined {
  const entry = diffCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) {
    diffCache.delete(key);
    return undefined;
  }
  return entry.diff;
}

function setCachedDiff(key: string, diff: L5XDiff): void {
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

  diffCache.set(key, { diff, timestamp: Date.now() });
}

export function clearL5XDiffCache(): void {
  controllerCache.clear();
  diffCache.clear();
}

export interface L5XDiffViewerProps {
  repoPath: string;
  filePath: string;
  oldSide: DiffSide;
  newSide: DiffSide;
  fileStatus: 'added' | 'modified' | 'deleted' | 'renamed' | string;
}

interface LoadState {
  phase: 'idle' | 'loading-old' | 'loading-new' | 'parsing' | 'diffing' | 'done' | 'error';
  error?: string;
}

function parseL5X(content: string, label: string): NormalizedController {
  const result = parseString(content, 'l5x');
  if (!result.success || !result.data) {
    throw new Error(result.errors?.[0]?.message || `Failed to parse ${label} L5X content`);
  }
  return result.data;
}

const PHASE_LABELS: Record<string, string> = {
  'loading-old': 'Loading previous version…',
  'loading-new': 'Loading current version…',
  parsing: 'Parsing L5X data…',
  diffing: 'Computing changes…',
};

const EMPTY_NAVIGATOR_MODEL = {
  routineGroups: [],
  tagGroups: [],
  totalItems: 0,
  validTabIds: [],
  unsupported: {
    stRoutineCount: 0,
    otherRoutineCount: 0,
    dataTypeCount: 0,
    aoiCount: 0,
    moduleCount: 0,
    controllerInfoChangeCount: 0,
  },
};

function L5XDiffViewer({
  repoPath,
  filePath,
  oldSide,
  newSide,
  fileStatus,
}: L5XDiffViewerProps): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>({ phase: 'idle' });
  const [diff, setDiff] = useState<L5XDiff | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showNavigator, setShowNavigator] = useState(true);

  const cacheKeys = useMemo(() => {
    return {
      oldController: buildControllerCacheKey(repoPath, oldSide),
      newController: buildControllerCacheKey(repoPath, newSide),
      diff: buildDiffCacheKey(repoPath, oldSide, newSide),
    };
  }, [repoPath, oldSide, newSide]);
  const normalizedWorkingPaths = useMemo(
    () => [oldSide, newSide]
      .filter((side): side is Extract<DiffSide, { kind: 'working' }> => side.kind === 'working')
      .map((side) => side.absolutePath.replace(/\\/g, '/').toLowerCase()),
    [oldSide, newSide],
  );

  const { theme } = useLayout();
  const isDarkMode = useMemo(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  }, [theme]);

  const ladderTheme = isDarkMode ? DARK_THEME : CONTROL_ZEBRA_LADDER_THEME;
  const diffTabCacheKey = useMemo(() => `${repoPath}|${filePath}`, [repoPath, filePath]);
  const {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    selectTab,
    pruneTabs,
  } = useDiffTabs(diffTabCacheKey);

  const handleRetry = useCallback(() => {
    setRetryCount((prev) => prev + 1);
  }, []);

  const handleReload = useCallback(() => {
    if (cacheKeys) {
      controllerCache.delete(cacheKeys.oldController);
      controllerCache.delete(cacheKeys.newController);
      diffCache.delete(cacheKeys.diff);
    }
    setRetryCount((prev) => prev + 1);
  }, [cacheKeys]);

  const toggleNavigator = useCallback(() => {
    setShowNavigator((previousState) => !previousState);
  }, []);

  useEffect(() => {
    if (normalizedWorkingPaths.length === 0) {
      return undefined;
    }

    const handleFilesChanged = (event: {
      data?: {
        path?: string;
        eventType?: string;
        isDir?: boolean;
      };
    }) => {
      const changedPath = event.data?.path?.replace(/\\/g, '/').toLowerCase();
      const eventType = event.data?.eventType;
      const isDir = event.data?.isDir;

      if (!changedPath || isDir) return;
      if (eventType !== 'write' && eventType !== 'rename' && eventType !== 'remove') return;
      if (!normalizedWorkingPaths.includes(changedPath)) return;

      handleReload();
    };

    const unsubscribe = onEvent('files-changed', handleFilesChanged);
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [handleReload, normalizedWorkingPaths]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const cachedDiff = getCachedDiff(cacheKeys.diff);
      if (cachedDiff) {
        setDiff(cachedDiff);
        setLoadState({ phase: 'done' });
        return;
      }

      try {
        setLoadState({ phase: 'loading-old' });
        setDiff(null);

        let oldController: NormalizedController | undefined;
        if (fileStatus !== 'added') {
          const cachedOld = getCachedController(cacheKeys.oldController);
          if (cachedOld) {
            oldController = cachedOld;
          } else {
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
          const cachedNew = getCachedController(cacheKeys.newController);
          if (cachedNew) {
            newController = cachedNew;
          } else {
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

        const emptyController: NormalizedController = {
          name: '',
          programs: [],
          tags: [],
          dataTypes: [],
          aois: [],
          modules: [],
        };

        const computedDiff = diffControllers(
          oldController ?? emptyController,
          newController ?? emptyController,
        );

        if (cancelled) return;

        setCachedDiff(cacheKeys.diff, computedDiff);
        setDiff(computedDiff);
        setLoadState({ phase: 'done' });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[L5XDiffViewer] Error:', message);
          setLoadState({ phase: 'error', error: message });
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [cacheKeys, fileStatus, newSide, oldSide, repoPath, retryCount]);

  const navigatorModel = useMemo(
    () => (diff ? buildDiffNavigatorModel(diff) : EMPTY_NAVIGATOR_MODEL),
    [diff],
  );

  useEffect(() => {
    pruneTabs(new Set(navigatorModel.validTabIds));
  }, [navigatorModel.validTabIds, pruneTabs]);

  const openDescriptor = useCallback((descriptor: DiffTabDescriptor) => {
    openTab(descriptor);
  }, [openTab]);

  const renderUnsupportedPhaseContent = useCallback((title: string, description: string) => {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-theme-secondary">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-medium text-theme-primary">{title}</p>
          <p className="text-xs text-theme-muted">{description}</p>
        </div>
      </div>
    );
  }, []);

  const renderTabContent = useCallback((tabData: DiffTabData, isActive: boolean) => {
    if (!diff) {
      return null;
    }

    const containerClass = `flex-1 min-h-0 overflow-auto bg-theme-elevated ${isActive ? '' : 'hidden'}`;

    if (tabData.type === 'controller-tags') {
      return (
        <div key="controller-tags" className={containerClass}>
          <div className="p-4">
            <TagDiffSection tagDiffs={diff.tags} title="Controller Tags" />
          </div>
        </div>
      );
    }

    if (tabData.type === 'program-tags') {
      const programDiff = diff.programs.find((program) => program.name === tabData.programName);

      if (!programDiff || programDiff.tagDiffs.length === 0) {
        return (
          <div key={`program-tags-${tabData.programName}`} className={containerClass}>
            {renderUnsupportedPhaseContent('Tag changes unavailable', 'This program no longer has tag changes in the current diff.')}
          </div>
        );
      }

      return (
        <div key={`program-tags-${tabData.programName}`} className={containerClass}>
          <div className="p-4">
            <TagDiffSection
              tagDiffs={programDiff.tagDiffs}
              title="Program Tags"
              scopeName={programDiff.name}
            />
          </div>
        </div>
      );
    }

    const programDiff = diff.programs.find((program) => program.name === tabData.programName);
    const routineDiff = programDiff?.routineDiffs.find((routine) => routine.name === tabData.routineName);

    if (!programDiff || !routineDiff) {
      return (
        <div key={`routine-${tabData.programName}-${tabData.routineName}`} className={containerClass}>
          {renderUnsupportedPhaseContent('Routine changes unavailable', 'This routine no longer exists in the current diff result.')}
        </div>
      );
    }

    const routineType = routineDiff.routineType ?? routineDiff.newRoutine?.type ?? routineDiff.oldRoutine?.type;
    if (routineType !== 'RLL') {
      return (
        <div key={`routine-${tabData.programName}-${tabData.routineName}`} className={containerClass}>
          {renderUnsupportedPhaseContent(
            'Routine diff not available in this phase',
            `${routineType ?? 'This'} routine type will move into the navigator after the RLL layout is complete.`,
          )}
        </div>
      );
    }

    return (
      <div key={`routine-${tabData.programName}-${tabData.routineName}`} className={containerClass}>
        <div className="p-4">
          <RoutineDiffSection
            routineDiff={routineDiff}
            programName={programDiff.name}
            theme={ladderTheme}
            isDarkMode={isDarkMode}
          />
        </div>
      </div>
    );
  }, [diff, isDarkMode, ladderTheme, renderUnsupportedPhaseContent]);

  const renderMainContent = useCallback(() => {
    if (navigatorModel.totalItems === 0) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-theme-secondary">
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-theme-primary">No changed routines or tags to inspect</p>
            <p className="text-xs text-theme-muted">
              This diff does not contain RLL routine or tag changes that Phase 2 can open in tabs yet.
            </p>
          </div>
        </div>
      );
    }

    if (tabs.length === 0) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-theme-secondary">
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-theme-primary">No diff tab selected</p>
            <p className="text-xs text-theme-muted">
              Choose a changed routine or tag group from the navigator to inspect it here.
            </p>
          </div>
        </div>
      );
    }

    return tabs.map((tab) => renderTabContent(tab.data, tab.id === activeTabId));
  }, [activeTabId, navigatorModel.totalItems, renderTabContent, tabs]);

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
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium
                       text-theme-primary bg-theme-elevated border border-theme-default
                       rounded-md hover:bg-theme-muted/30 transition-colors"
          >
            <RefreshCw size={ICON_SIZES.sm} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex items-center justify-center h-full text-theme-muted text-sm">
        <FileWarning size={ICON_SIZES.md} className="mr-2" />
        No diff data available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-2 bg-theme-surface border-b border-theme-default">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu size={ICON_SIZES.sm} className="text-theme-secondary shrink-0" />
          <span className="text-sm text-theme-primary font-medium shrink-0">L5X Diff</span>
          <span className="text-xs text-theme-muted truncate">{filePath}</span>
        </div>
        <button
          type="button"
          onClick={handleReload}
          title="Reload diff"
          className="p-1.5 rounded text-theme-muted hover:text-theme-primary hover:bg-theme-elevated transition-colors"
        >
          <RefreshCw size={ICON_SIZES.sm} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden min-h-0 flex">
        {showNavigator && (
          <div className="w-72 border-r border-theme-default bg-theme-surface overflow-hidden shrink-0">
            <DiffNavigator
              model={navigatorModel}
              activeTabId={activeTabId}
              onOpenItem={openDescriptor}
            />
          </div>
        )}

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

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-theme-elevated">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabSelect={selectTab}
            onTabClose={closeTab}
          />

          <div className="flex-1 min-h-0 overflow-hidden">
            {renderMainContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(L5XDiffViewer);
