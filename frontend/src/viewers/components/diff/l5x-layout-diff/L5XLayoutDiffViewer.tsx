import { memo, useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  diffControllers,
  TagTable,
  type ColumnDefinition,
  type L5XDiff,
  type NormalizedController,
  type NormalizedTag,
} from 'ladder-visualizer';

import { useLayout } from '../../../../context/LayoutContext';
import { ICON_SIZES } from '../../../../shared/constants';
import { TabBar } from '../../file/l5x';
import { getPathFileName } from '../../shared/path-utils';
import L5XProjectOrganizer from '../../shared/L5XProjectOrganizer';
import L5XDocumentStatus from '../../shared/L5XDocumentStatus';
import { hasEncodedOnlyTargets, parseL5XDocument, type L5XDocumentResult } from '../../shared/l5x-document';
import type { DiffSide } from '../../../registry/diff-registry';
import { loadTextSide, serializeDiffSide } from '../diff-side-loaders';
import { buildL5XDiffLayoutViewModel } from './adapter';
import { RoutineDiffInspector } from './RoutineDiffInspector';
import { L5XDiffNavigator } from './L5XDiffNavigator';
import type { L5XDiffAggregateChangeKind, L5XDiffRenderableEntity } from './types';
import { useDiffTabs } from './useDiffTabs';

interface CachedDocument {
  document: L5XDocumentResult;
  timestamp: number;
}

interface CachedDiffBundle {
  diff: L5XDiff | null;
  oldDocument: L5XDocumentResult | null;
  newDocument: L5XDocumentResult | null;
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
  reloadToken?: number;
  onShowRaw?: () => void;
  fileStatus: 'added' | 'modified' | 'deleted' | 'renamed' | string;
}

const documentCache = new Map<string, CachedDocument>();
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
  tasks: [],
  trends: [],
  quickWatchLists: [],
};

const PHASE_LABELS: Record<string, string> = {
  'loading-old': 'Loading previous version…',
  'loading-new': 'Loading current version…',
  parsing: 'Parsing L5X data…',
  diffing: 'Preparing comparison…',
};

function buildControllerCacheKey(repoPath: string, side: DiffSide): string {
  return `${repoPath}|${serializeDiffSide(side)}`;
}

function buildDiffCacheKey(repoPath: string, oldSide: DiffSide, newSide: DiffSide): string {
  return `${repoPath}|${serializeDiffSide(oldSide)}|${serializeDiffSide(newSide)}`;
}

function getCachedDocument(key: string): L5XDocumentResult | undefined {
  const entry = documentCache.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) {
    documentCache.delete(key);
    return undefined;
  }
  return entry.document;
}

function setCachedDocument(key: string, document: L5XDocumentResult): void {
  if (documentCache.size >= MAX_CACHE_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [candidateKey, candidateValue] of documentCache) {
      if (candidateValue.timestamp < oldestTime) {
        oldestTime = candidateValue.timestamp;
        oldestKey = candidateKey;
      }
    }
    if (oldestKey) {
      documentCache.delete(oldestKey);
    }
  }

  documentCache.set(key, { document, timestamp: Date.now() });
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
  documentCache.clear();
  diffCache.clear();
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
      '--table-cell-bg': 'var(--color-added-bg)',
    } as CSSProperties;
  }

  if (tagDiffKind === 'removed') {
    return {
      '--table-cell-bg': 'var(--color-removed-bg)',
    } as CSSProperties;
  }

  return {
    '--table-cell-bg': 'var(--color-modified-bg)',
  } as CSSProperties;
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
  const changedTagNames = new Set(entity.changedTagDiffs.map((td) => td.name));
  const changedTags = entity.fullContextTags.filter((t) => changedTagNames.has(t.name));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-4">
      <TagTable
        tags={changedTags}
        dataTypes={entity.dataTypes}
        extraColumns={buildTagDiffColumns(entity)}
        getRowStyle={(tag) => getTagRowStyle(tagDiffsByName.get(tag.name)?.kind)}
        className="min-h-0 flex-1"
      />
    </div>
  );
}

function L5XLayoutDiffViewer({
  repoPath,
  filePath,
  oldSide,
  newSide,
  reloadToken = 0,
  onShowRaw,
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

  const handleRetry = useCallback(() => {
    setRetryCount((prev) => prev + 1);
  }, []);

  const handleReload = useCallback(() => {
    documentCache.delete(cacheKeys.oldController);
    documentCache.delete(cacheKeys.newController);
    diffCache.delete(cacheKeys.diff);
    setRetryCount((prev) => prev + 1);
  }, [cacheKeys]);

  useEffect(() => {
    if (reloadToken > 0) handleReload();
  }, [reloadToken, handleReload]);

  const toggleNavigator = useCallback(() => {
    setShowNavigator((previousState) => !previousState);
  }, []);

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

        const loadDocument = async (side: DiffSide, key: string): Promise<L5XDocumentResult | null> => {
          if (side.kind === 'missing') return null;
          const cached = getCachedDocument(key);
          if (cached) return cached;
          const content = await loadTextSide(repoPath, side);
          if (cancelled || content === null) return null;
          setLoadState({ phase: 'parsing' });
          const document = parseL5XDocument(content);
          setCachedDocument(key, document);
          return document;
        };
        const oldDocument = await loadDocument(oldSide, cacheKeys.oldController);

        if (cancelled) return;

        setLoadState({ phase: 'loading-new' });

        const newDocument = await loadDocument(newSide, cacheKeys.newController);

        if (cancelled) return;

        const oldController = oldDocument?.controller;
        const newController = newDocument?.controller;

        setLoadState({ phase: 'diffing' });

        const resolvedOldController = oldController ?? emptyController;
        const resolvedNewController = newController ?? emptyController;
        // Empty controllers are comparison inputs only for known absent sides.
        // A failed or encoded-only document must never look like a deletion.
        const canCompare = [oldDocument, newDocument].every(document =>
          document === null || (document.status !== 'failed' && document.controller && !hasEncodedOnlyTargets(document)));
        const diff = canCompare ? diffControllers(resolvedOldController, resolvedNewController) : null;
        const nextBundle = {
          diff,
          oldDocument,
          newDocument,
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
          setBundle(null);
          setLoadState({ phase: 'error', error: message.includes('max 10MB')
            ? 'This file exceeds the 10 MB text viewer limit. Open it in the default app to inspect it.'
            : 'Cannot load the comparison. Check that the files are available, then retry.' });
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [cacheKeys, newSide, oldSide, repoPath, retryCount]);

  const viewModel = useMemo(() => {
    if (!bundle?.diff) {
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
  // Keep opened FBD comparisons mounted so library sheet, view and viewport state survives tab switches.
  const fbdEntities = useMemo(() => tabs.map(tab => viewModel?.entitiesByTabId[tab.id]).filter(
    (entity): entity is Extract<L5XDiffRenderableEntity, { kind: 'routine' }> => entity?.kind === 'routine'
      && (entity.routineType === 'FBD' || entity.oldRoutine?.type === 'FBD'),
  ), [tabs, viewModel]);
  const activeFbd = fbdEntities.some(entity => entity.tab.id === activeTabId);

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

  if (!viewModel || !bundle) {
    return (
      <div className="flex h-full flex-col bg-theme-surface text-theme-secondary">
        {bundle && <>
          <L5XDocumentStatus result={bundle.oldDocument} label="Previous version" onShowRaw={onShowRaw} />
          <L5XDocumentStatus result={bundle.newDocument} label="Current version" onShowRaw={onShowRaw} />
        </>}
        <p className="p-4 text-sm">A structured comparison is unavailable. Use Raw to inspect the changes.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-theme-surface">
      <L5XDocumentStatus result={bundle.oldDocument} label="Previous version" onShowRaw={onShowRaw} />
      <L5XDocumentStatus result={bundle.newDocument} label="Current version" onShowRaw={onShowRaw} />
      {viewModel.unsupportedChanges.otherRoutineCount > 0 && <p role="status" className="shrink-0 border-b border-shell-divider px-3 py-2 text-xs text-theme-secondary">
        {viewModel.unsupportedChanges.otherRoutineCount} routine comparisons are unsupported. Use Raw to inspect their source.
      </p>}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewModel.navigatorSections.length === 0 ? (
          <div className="flex h-full items-center justify-center text-theme-secondary">
            <div className="text-center">
              <p className="text-sm font-medium text-theme-primary">No changed routines or tags</p>
              <p className="mt-1 text-xs text-theme-muted">This view compares RLL, ST, FBD routines and tag groups. Use Raw to inspect other content.</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 overflow-hidden">
            {showNavigator ? (
              <aside className="w-72 min-h-0 overflow-hidden bg-theme-surface shrink-0">
                <L5XProjectOrganizer programs={[]} className="h-full border-0">
                  <L5XDiffNavigator sections={viewModel.navigatorSections} activeTabId={activeTabId} onSelect={handleOpenItem} />
                </L5XProjectOrganizer>
              </aside>
            ) : null}

            <button
              type="button"
              onClick={toggleNavigator}
              className="w-6 border-r border-shell-divider bg-theme-surface hover:bg-theme-elevated transition-colors flex items-center justify-center shrink-0"
              title={showNavigator ? 'Hide navigator' : 'Show navigator'}
            >
              {showNavigator ? (
                <ChevronLeft size={ICON_SIZES.xs} className="text-theme-muted" />
              ) : (
                <ChevronRight size={ICON_SIZES.xs} className="text-theme-muted" />
              )}
            </button>

            <main className="flex h-full flex-1 min-h-0 flex-col overflow-hidden bg-theme-surface">
              <TabBar
                tabs={tabs.map((tab) => ({ id: tab.id, title: tab.subtitle ? `${tab.title} (${tab.subtitle})` : tab.title }))}
                activeTabId={activeTabId}
                onTabSelect={selectTab}
                onTabClose={closeTab}
              />

              <div className="relative flex-1 min-h-0 overflow-hidden">
                {fbdEntities.map(entity => <div key={entity.tab.id} className={entity.tab.id === activeTabId ? 'h-full' : 'hidden'}>
                  <RoutineDiffInspector entity={entity} isDarkMode={isDarkMode} />
                </div>)}
                {activeFbd ? null : activeEntity ? (
                  <RenderEntityDetails key={activeEntity.tab.id} entity={activeEntity} isDarkMode={isDarkMode} />
                ) : (
                  <div className="flex h-full items-center justify-center bg-theme-surface text-theme-secondary">
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
