/**
 * L5XDiffViewer — Domain-aware L5X diff viewer using explicit old/new sides.
 *
 * The viewer prefers the unified snapshot contract (`oldSide`/`newSide`) and
 * falls back to legacy commit/working-tree metadata during migration.
 */
import { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { Cpu, AlertCircle, FileWarning, Loader2, RefreshCw } from 'lucide-react';
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
import {
  loadTextSide,
  resolveDiffSidePair,
  serializeDiffSide,
} from '../diff-side-loaders';

import DiffChangeStream from './DiffChangeStream';

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
  oldSide?: DiffSide;
  newSide?: DiffSide;
  commitHash?: string;
  parentHash?: string;
  isWorkingTree?: boolean;
  absoluteFilePath?: string;
  oldPath?: string;
  fileStatus: 'added' | 'modified' | 'deleted' | 'renamed' | string;
}

interface LoadState {
  phase: 'idle' | 'loading-old' | 'loading-new' | 'parsing' | 'diffing' | 'done' | 'error';
  error?: string;
}

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

function L5XDiffViewer({
  repoPath,
  filePath,
  oldSide,
  newSide,
  commitHash,
  isWorkingTree,
  absoluteFilePath,
  fileStatus,
}: L5XDiffViewerProps): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>({ phase: 'idle' });
  const [diff, setDiff] = useState<L5XDiff | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const resolvedSides = useMemo(
    () => resolveDiffSidePair({
      repoPath,
      filePath,
      oldSide,
      newSide,
      commitHash,
      isWorkingTree,
      absoluteFilePath,
    }),
    [repoPath, filePath, oldSide, newSide, commitHash, isWorkingTree, absoluteFilePath],
  );
  const cacheKeys = useMemo(() => {
    if (!resolvedSides) {
      return null;
    }

    return {
      oldController: buildControllerCacheKey(repoPath, resolvedSides.oldSide),
      newController: buildControllerCacheKey(repoPath, resolvedSides.newSide),
      diff: buildDiffCacheKey(repoPath, resolvedSides.oldSide, resolvedSides.newSide),
    };
  }, [repoPath, resolvedSides]);
  const normalizedWorkingPaths = useMemo(
    () => (resolvedSides
      ? [resolvedSides.oldSide, resolvedSides.newSide]
        .filter((side): side is Extract<DiffSide, { kind: 'working' }> => side.kind === 'working')
        .map((side) => side.absolutePath.replace(/\\/g, '/').toLowerCase())
      : []),
    [resolvedSides],
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

  const ladderTheme = isDarkMode ? DARK_THEME : CONTROL_ZEBRA_THEME;

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
      if (!resolvedSides || !cacheKeys) {
        setDiff(null);
        setLoadState({ phase: 'error', error: 'Unable to determine which L5X snapshots to compare.' });
        return;
      }

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
            const oldContent = await loadTextSide(repoPath, resolvedSides.oldSide);
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
            const newContent = await loadTextSide(repoPath, resolvedSides.newSide);
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
  }, [cacheKeys, fileStatus, repoPath, resolvedSides, retryCount]);

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

      <div className="flex-1 overflow-hidden min-h-0">
        <DiffChangeStream diff={diff} theme={ladderTheme} isDarkMode={isDarkMode} />
      </div>
    </div>
  );
}

export default memo(L5XDiffViewer);
