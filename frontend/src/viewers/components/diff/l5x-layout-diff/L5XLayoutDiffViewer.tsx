import { memo, useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertCircle,
  Cpu,
  FileWarning,
  GitCompareArrows,
  Loader2,
  RefreshCw,
  Tags,
  Workflow,
} from 'lucide-react';
import {
  clearAOIs,
  diffControllers,
  parseString,
  registerAOIsFromController,
  type L5XDiff,
  type NormalizedController,
} from 'ladder-visualizer';

import { ICON_SIZES } from '../../../../shared/constants';
import { onEvent } from '../../../../shared/runtime/events';
import { getPathFileName } from '../../shared/path-utils';
import type { DiffSide } from '../../../registry/diff-registry';
import { loadTextSide, serializeDiffSide } from '../diff-side-loaders';
import { buildL5XDiffLayoutViewModel } from './adapter';
import type { L5XDiffAggregateChangeKind, L5XDiffRenderableEntity } from './types';

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

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: JSX.Element;
}): JSX.Element {
  return (
    <div className="rounded-md border border-theme-default bg-theme-surface px-3 py-2">
      <div className="flex items-center gap-2 text-theme-secondary text-xs uppercase tracking-wide">
        {icon}
        <span>{title}</span>
      </div>
      <div className="mt-2 text-lg font-semibold text-theme-primary">{value}</div>
    </div>
  );
}

function RenderEntityDetails({ entity }: { entity: L5XDiffRenderableEntity }): JSX.Element {
  if (entity.kind === 'routine') {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-theme-default bg-theme-surface p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-theme-secondary">Routine</p>
              <h3 className="text-lg font-semibold text-theme-primary">{entity.routineName}</h3>
              <p className="text-sm text-theme-secondary">{entity.programName}</p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getChangeTone(entity.changeKind)}`}>
              {entity.changeKind}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatCard title="Stable Tab Id" value={entity.tab.id} icon={<Workflow size={14} />} />
            <StatCard title="Old Rungs" value={entity.oldRoutine?.rungs.length ?? 0} icon={<GitCompareArrows size={14} />} />
            <StatCard title="New Rungs" value={entity.newRoutine?.rungs.length ?? 0} icon={<GitCompareArrows size={14} />} />
          </div>
        </div>

        <div className="rounded-md border border-theme-default bg-theme-surface p-4">
          <p className="text-sm font-medium text-theme-primary">Changed Rungs</p>
          {entity.changedRungNumbers.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {entity.changedRungNumbers.map((rungNumber) => (
                <span
                  key={rungNumber}
                  className="rounded border border-theme-default bg-theme-elevated px-2 py-1 text-xs text-theme-secondary"
                >
                  Rung {rungNumber}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-theme-secondary">No rung-level changes were emitted for this routine diff.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-theme-default bg-theme-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-theme-secondary">Tag Group</p>
            <h3 className="text-lg font-semibold text-theme-primary">{entity.title}</h3>
            {entity.kind === 'program-tags' ? (
              <p className="text-sm text-theme-secondary">{entity.programName}</p>
            ) : null}
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getChangeTone(entity.changeKind)}`}>
            {entity.changeKind}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard title="Stable Tab Id" value={entity.tab.id} icon={<Workflow size={14} />} />
          <StatCard title="Changed Tags" value={entity.changedTagDiffs.length} icon={<Tags size={14} />} />
          <StatCard title="Full Context Tags" value={entity.fullContextTags.length} icon={<Tags size={14} />} />
        </div>
      </div>

      <div className="rounded-md border border-theme-default bg-theme-surface overflow-hidden">
        <div className="border-b border-theme-default px-4 py-3">
          <p className="text-sm font-medium text-theme-primary">Changed Tags</p>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="min-w-full divide-y divide-theme-default text-sm">
            <thead className="bg-theme-elevated">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-theme-secondary">Tag</th>
                <th className="px-4 py-2 text-left font-medium text-theme-secondary">Change</th>
                <th className="px-4 py-2 text-left font-medium text-theme-secondary">Property Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-default bg-theme-surface">
              {entity.changedTagDiffs.map((tagDiff) => (
                <tr key={tagDiff.name}>
                  <td className="px-4 py-2 text-theme-primary">{tagDiff.name}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getChangeTone(tagDiff.kind)}`}>
                      {tagDiff.kind}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-theme-secondary">{tagDiff.propertyChanges?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
  const [loadState, setLoadState] = useState<LoadState>({ phase: 'idle' });
  const [bundle, setBundle] = useState<CachedDiffBundle | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const cacheKeys = useMemo(() => ({
    oldController: buildControllerCacheKey(repoPath, oldSide),
    newController: buildControllerCacheKey(repoPath, newSide),
    diff: buildDiffCacheKey(repoPath, oldSide, newSide),
  }), [repoPath, oldSide, newSide]);

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

    setActiveTabId((current) => {
      if (current && viewModel.entitiesByTabId[current]) {
        return current;
      }
      return viewModel.initialTabId;
    });
  }, [viewModel]);

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

  const activeEntity = activeTabId ? viewModel.entitiesByTabId[activeTabId] : undefined;
  const unsupportedTotal = viewModel.unsupportedChanges.stRoutineCount + viewModel.unsupportedChanges.otherRoutineCount;

  return (
    <div className="flex flex-col h-full min-h-0 bg-theme-bg">
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

      {viewModel.tabs.length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-theme-default bg-theme-elevated px-3 py-2">
          {viewModel.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={[
                'rounded-md border px-3 py-1.5 text-sm transition-colors whitespace-nowrap',
                activeTabId === tab.id
                  ? 'border-accent-primary bg-theme-surface text-theme-primary'
                  : 'border-theme-default bg-theme-elevated text-theme-secondary hover:bg-theme-surface',
              ].join(' ')}
              title={tab.subtitle ? `${tab.title} · ${tab.subtitle}` : tab.title}
            >
              {tab.title}
            </button>
          ))}
        </div>
      ) : null}

      {unsupportedTotal > 0 ? (
        <div className="border-b border-theme-default bg-theme-warning/10 px-4 py-2 text-xs text-theme-secondary">
          Phase 1 only maps RLL routine changes. Hidden routine changes: {viewModel.unsupportedChanges.stRoutineCount} ST, {viewModel.unsupportedChanges.otherRoutineCount} other.
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-hidden">
        {viewModel.navigatorSections.length === 0 ? (
          <div className="flex h-full items-center justify-center text-theme-secondary">
            <div className="text-center">
              <p className="text-sm font-medium text-theme-primary">No changed routines or tags</p>
              <p className="mt-1 text-xs text-theme-muted">The Phase 1 model only surfaces changed routines and tag groups.</p>
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-auto border-r border-theme-default bg-theme-surface">
              <div className="p-3 space-y-4">
                {viewModel.navigatorSections.map((section) => (
                  <section key={section.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">{section.title}</h2>
                      <span className="text-xs text-theme-muted">{section.itemCount}</span>
                    </div>
                    <div className="space-y-1">
                      {section.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveTabId(item.tabId)}
                          className={[
                            'w-full rounded-md border px-3 py-2 text-left transition-colors',
                            activeTabId === item.tabId
                              ? 'border-accent-primary bg-theme-elevated'
                              : 'border-theme-default bg-theme-surface hover:bg-theme-elevated',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-theme-primary">{item.title}</p>
                              {item.description ? (
                                <p className="truncate text-xs text-theme-secondary">{item.description}</p>
                              ) : null}
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getChangeTone(item.changeKind)}`}>
                              {item.badge ?? item.changeKind}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-theme-muted">
                            <span>{item.changedCount} changed</span>
                            {item.totalCount !== undefined ? <span>{item.totalCount} total</span> : null}
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </aside>

            <main className="min-h-0 overflow-auto bg-theme-bg p-4">
              <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
                <StatCard title="Total Changes" value={viewModel.diff.summary.totalChanges} icon={<GitCompareArrows size={14} />} />
                <StatCard title="Changed Routines" value={viewModel.navigatorSections.find((section) => section.kind === 'routines')?.itemCount ?? 0} icon={<Workflow size={14} />} />
                <StatCard title="Controller Tag Groups" value={viewModel.navigatorSections.find((section) => section.kind === 'controller-tags')?.itemCount ?? 0} icon={<Tags size={14} />} />
                <StatCard title="Program Tag Groups" value={viewModel.navigatorSections.find((section) => section.kind === 'program-tags')?.itemCount ?? 0} icon={<Tags size={14} />} />
              </div>

              {activeEntity ? (
                <RenderEntityDetails entity={activeEntity} />
              ) : (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed border-theme-default bg-theme-surface text-theme-secondary">
                  Select a changed routine or tag group.
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(L5XLayoutDiffViewer);
