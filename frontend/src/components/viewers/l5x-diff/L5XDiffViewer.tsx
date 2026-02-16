/**
 * L5XDiffViewer — Orchestrator for domain-aware L5X file diffs.
 *
 * Flow:
 * 1. Load old + new L5X file content via ReadFileAtRevisionLarge.
 * 2. Parse both with ladder-visualizer's parseString().
 * 3. Run diffControllers() to produce a structured L5XDiff.
 * 4. Render DiffChangeStream with the result.
 *
 * Handles edge cases:
 * - Added files (no old content)
 * - Deleted files (no new content)
 * - Renamed files (different old/new paths)
 * - Parse errors (falls back to error state)
 * - Loading states with progress indication
 *
 * Caching (Phase 4):
 * - Parsed controllers are cached by (repoPath, filePath, revision)
 * - Diff results are cached by (oldHash + newHash + filePath)
 */
import { memo, useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { ReadFileAtRevisionLarge } from '../../../../bindings/controlzebra/services/gitservice';
import { ICON_SIZES } from '../../../constants';
import { useLayout } from '../../../context/LayoutContext';
import { getPathFileName } from '../path-utils';

import DiffChangeStream from './DiffChangeStream';

// ============================================================================
// L5X Diff Cache — Phase 4
// ============================================================================

interface CachedController {
  controller: NormalizedController;
  timestamp: number;
}

interface CachedDiff {
  diff: L5XDiff;
  timestamp: number;
}

/** Cache for parsed NormalizedController instances. Key: "repoPath|filePath|revision" */
const controllerCache = new Map<string, CachedController>();

/** Cache for computed L5XDiff results. Key: "repoPath|filePath|oldRev|newRev" */
const diffCache = new Map<string, CachedDiff>();

/** Max age for cache entries (5 minutes). */
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

/** Max number of entries per cache. */
const MAX_CACHE_ENTRIES = 20;

/** Build cache key for controllers. */
function buildControllerCacheKey(repoPath: string, filePath: string, revision: string): string {
  return `${repoPath}|${filePath}|${revision}`;
}

/** Build cache key for diffs. */
function buildDiffCacheKey(repoPath: string, filePath: string, oldRev: string, newRev: string): string {
  return `${repoPath}|${filePath}|${oldRev}|${newRev}`;
}

/** Get cached controller if valid. */
function getCachedController(key: string): NormalizedController | undefined {
  const entry = controllerCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) {
    controllerCache.delete(key);
    return undefined;
  }
  return entry.controller;
}

/** Set controller in cache with LRU eviction. */
function setCachedController(key: string, controller: NormalizedController): void {
  if (controllerCache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest entry
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [k, v] of controllerCache) {
      if (v.timestamp < oldestTime) {
        oldestTime = v.timestamp;
        oldestKey = k;
      }
    }
    if (oldestKey) controllerCache.delete(oldestKey);
  }
  controllerCache.set(key, { controller, timestamp: Date.now() });
}

/** Get cached diff if valid. */
function getCachedDiff(key: string): L5XDiff | undefined {
  const entry = diffCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) {
    diffCache.delete(key);
    return undefined;
  }
  return entry.diff;
}

/** Set diff in cache with LRU eviction. */
function setCachedDiff(key: string, diff: L5XDiff): void {
  if (diffCache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest entry
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [k, v] of diffCache) {
      if (v.timestamp < oldestTime) {
        oldestTime = v.timestamp;
        oldestKey = k;
      }
    }
    if (oldestKey) diffCache.delete(oldestKey);
  }
  diffCache.set(key, { diff, timestamp: Date.now() });
}

/** Clear all L5X diff caches. Useful when switching repos. */
export function clearL5XDiffCache(): void {
  controllerCache.clear();
  diffCache.clear();
}

// ============================================================================
// Types
// ============================================================================

export interface L5XDiffViewerProps {
  /** Absolute path to the repository root. */
  repoPath: string;
  /** Commit hash being viewed. */
  commitHash: string;
  /** Parent commit hash (for loading old content). */
  parentHash?: string;
  /** Path to the file within the repo. */
  filePath: string;
  /** Old path if the file was renamed. */
  oldPath?: string;
  /** Status of the file in this commit. */
  fileStatus: 'added' | 'modified' | 'deleted' | 'renamed' | string;
}

interface LoadState {
  phase: 'idle' | 'loading-old' | 'loading-new' | 'parsing' | 'diffing' | 'done' | 'error';
  error?: string;
}

// ============================================================================
// Theme (reused from L5XViewer)
// ============================================================================

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
// Helpers
// ============================================================================

/** Parse L5X content string → NormalizedController. Throws on failure. */
function parseL5X(content: string, label: string): NormalizedController {
  const result = parseString(content, 'l5x');
  if (!result.success || !result.data) {
    throw new Error(
      result.errors?.[0]?.message || `Failed to parse ${label} L5X content`,
    );
  }
  return result.data;
}

/** Phase labels for the loading indicator. */
const PHASE_LABELS: Record<string, string> = {
  'loading-old': 'Loading previous version…',
  'loading-new': 'Loading current version…',
  parsing:       'Parsing L5X data…',
  diffing:       'Computing changes…',
};

// ============================================================================
// Component
// ============================================================================

function L5XDiffViewer({
  repoPath,
  commitHash,
  parentHash,
  filePath,
  oldPath,
  fileStatus,
}: L5XDiffViewerProps): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>({ phase: 'idle' });
  const [diff, setDiff] = useState<L5XDiff | null>(null);
  const [retryCount, setRetryCount] = useState(0); // Used to trigger re-runs
  const abortRef = useRef(false);

  // Theme
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

  // Determine effective paths for old/new
  const effectiveOldPath = oldPath || filePath;
  
  // Compute revision strings for cache keys
  const oldRevision = useMemo(() => {
    if (fileStatus === 'added') return '';
    return parentHash || `${commitHash}~1`;
  }, [fileStatus, parentHash, commitHash]);
  
  const newRevision = useMemo(() => {
    if (fileStatus === 'deleted') return '';
    return commitHash;
  }, [fileStatus, commitHash]);

  // Retry handler for error state
  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1);
  }, []);

  // ========================================================================
  // Load, parse, and diff (with caching)
  // ========================================================================

  useEffect(() => {
    abortRef.current = false;
    let cancelled = false;

    async function run() {
      // Check diff cache first
      const diffCacheKey = buildDiffCacheKey(repoPath, filePath, oldRevision, newRevision);
      const cachedDiff = getCachedDiff(diffCacheKey);
      if (cachedDiff) {
        setDiff(cachedDiff);
        setLoadState({ phase: 'done' });
        return;
      }

      try {
        setLoadState({ phase: 'loading-old' });
        setDiff(null);

        // ---------- Load old content (with cache) ----------
        let oldController: NormalizedController | undefined;

        if (fileStatus !== 'added' && oldRevision) {
          const oldCacheKey = buildControllerCacheKey(repoPath, effectiveOldPath, oldRevision);
          const cachedOld = getCachedController(oldCacheKey);
          
          if (cachedOld) {
            oldController = cachedOld;
          } else {
            const oldResult = await ReadFileAtRevisionLarge(
              repoPath,
              effectiveOldPath,
              oldRevision,
            );
            if (cancelled) return;

            if (oldResult.hasError) {
              // If the file doesn't exist at the parent, treat as added
              if (oldResult.error?.includes('does not exist')) {
                // OK — no old content
              } else {
                throw new Error(`Failed to load old version: ${oldResult.error}`);
              }
            } else {
              setLoadState({ phase: 'parsing' });
              oldController = parseL5X(oldResult.content, 'old');
              setCachedController(oldCacheKey, oldController);
            }
          }
        }

        if (cancelled) return;

        // ---------- Load new content (with cache) ----------
        setLoadState({ phase: 'loading-new' });
        let newController: NormalizedController | undefined;

        if (fileStatus !== 'deleted' && newRevision) {
          const newCacheKey = buildControllerCacheKey(repoPath, filePath, newRevision);
          const cachedNew = getCachedController(newCacheKey);
          
          if (cachedNew) {
            newController = cachedNew;
          } else {
            const newResult = await ReadFileAtRevisionLarge(
              repoPath,
              filePath,
              newRevision,
            );
            if (cancelled) return;

            if (newResult.hasError) {
              if (newResult.error?.includes('does not exist')) {
                // OK — no new content
              } else {
                throw new Error(`Failed to load new version: ${newResult.error}`);
              }
            } else {
              setLoadState({ phase: 'parsing' });
              newController = parseL5X(newResult.content, 'new');
              setCachedController(newCacheKey, newController);
            }
          }
        }

        if (cancelled) return;

        // ---------- Register AOIs for proper rendering ----------
        clearAOIs();
        if (newController) {
          registerAOIsFromController(newController);
        } else if (oldController) {
          registerAOIsFromController(oldController);
        }

        // ---------- Diff ----------
        setLoadState({ phase: 'diffing' });

        // If one side is missing, create an empty placeholder controller
        const emptyController: NormalizedController = {
          name: '',
          programs: [],
          tags: [],
          dataTypes: [],
          aois: [],
          modules: [],
        };

        const l5xDiff = diffControllers(
          oldController ?? emptyController,
          newController ?? emptyController,
        );

        if (cancelled) return;

        // Cache the diff result
        setCachedDiff(diffCacheKey, l5xDiff);

        setDiff(l5xDiff);
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
      abortRef.current = true;
    };
  }, [repoPath, commitHash, parentHash, filePath, effectiveOldPath, fileStatus, oldRevision, newRevision, retryCount]);

  // ========================================================================
  // Render
  // ========================================================================

  // Loading state
  if (loadState.phase !== 'done' && loadState.phase !== 'error') {
    const phaseLabel = PHASE_LABELS[loadState.phase] ?? 'Preparing…';
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-theme-secondary">
        <Loader2 size={ICON_SIZES.lg} className="animate-spin" />
        <div className="text-center">
          <p className="text-sm font-medium">{phaseLabel}</p>
          <p className="text-xs text-theme-muted mt-1">
            {getPathFileName(filePath)}
          </p>
        </div>
      </div>
    );
  }

  // Error state with retry button
  if (loadState.phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-theme-secondary">
        <AlertCircle size={ICON_SIZES.lg} className="text-theme-error" />
        <div className="text-center max-w-md">
          <p className="text-sm font-medium text-theme-primary mb-1">
            Cannot generate L5X diff
          </p>
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

  // No diff data (shouldn't happen if phase is 'done', but guard)
  if (!diff) {
    return (
      <div className="flex items-center justify-center h-full text-theme-muted text-sm">
        <FileWarning size={ICON_SIZES.md} className="mr-2" />
        No diff data available
      </div>
    );
  }

  // Success — render the change stream
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-theme-surface border-b border-theme-default">
        <Cpu size={ICON_SIZES.sm} className="text-theme-secondary" />
        <span className="text-sm text-theme-primary font-medium">
          L5X Diff
        </span>
        <span className="text-xs text-theme-muted truncate">
          {filePath}
        </span>
      </div>

      {/* Change stream */}
      <div className="flex-1 overflow-hidden min-h-0">
        <DiffChangeStream
          diff={diff}
          theme={ladderTheme}
          isDarkMode={isDarkMode}
        />
      </div>
    </div>
  );
}

export default memo(L5XDiffViewer);
