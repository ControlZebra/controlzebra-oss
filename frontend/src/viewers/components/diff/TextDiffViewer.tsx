/**
 * TextDiffViewer - Displays a unified text diff for a single file.
 *
 * Used in:
 * - History/Commit view (commit vs parent)
 * - Explorer diff tabs (working tree vs HEAD)
 *
 * This component owns diff loading (unless `fileDiff` is provided) and then
 * delegates rendering to the shared `DiffViewer` component.
 */
import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';

import { ICON_SIZES } from '../../../shared/constants';
import DiffViewer from '../../../features/explorer/components/DiffViewer';

import {
  DiffCommitFileRaw,
  DiffWorkingRaw,
} from '../../../../bindings/controlzebra/services/gitservice';
import type { RawDiffResult } from '../../../../bindings/controlzebra/services/models';

// ============================================================================
// Types
// ============================================================================

export type TextDiffStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface TextDiffViewerProps {
  /** Absolute path to the git repository root. */
  repoPath: string;
  /** Repository-relative file path (preferred). */
  filePath: string;

  /** For commit diffs: the commit hash. Omit/null for working tree diffs. */
  commitHash?: string | null;
  /** True when comparing the working tree against HEAD. */
  isWorkingTree?: boolean;

  /** Optional status override (e.g., from status list). */
  fileStatus?: string;
  /** Optional old path (for renamed files). */
  oldPath?: string;

  /** Optional preloaded diff (skips fetching). */
  fileDiff?: RawDiffResult | null;

  /** Whether to show the diff header (default: true). */
  showHeader?: boolean;
}

// ============================================================================
// Cache
// ============================================================================

const textDiffCache = new Map<string, RawDiffResult>();

function cacheKey(repoPath: string, filePath: string, commitHash?: string | null): string {
  return `textdiff::${repoPath}::${filePath}::${commitHash || 'working'}`;
}

function normalizeStatus(status?: string): TextDiffStatus {
  const s = (status || '').toLowerCase();
  if (s === 'untracked') return 'added';
  if (s === 'added') return 'added';
  if (s === 'deleted') return 'deleted';
  if (s === 'renamed') return 'renamed';
  return 'modified';
}

function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, '/');
}

// ============================================================================
// Component
// ============================================================================

function TextDiffViewer({
  repoPath,
  filePath,
  commitHash,
  isWorkingTree,
  fileStatus,
  oldPath,
  fileDiff,
  showHeader = true,
}: TextDiffViewerProps): JSX.Element {
  const repoRelativePath = useMemo((): string => {
    if (!filePath) return '';

    const normalizedFilePath = normalizePathSeparators(filePath);
    const normalizedRepoPath = normalizePathSeparators(repoPath || '').replace(/\/+$/, '');

    // Some callers may pass an absolute path (e.g., explorer tabs store absoluteFilePath).
    // GitService diff APIs expect repo-relative paths.
    const prefix = normalizedRepoPath ? `${normalizedRepoPath}/` : '';
    if (prefix && normalizedFilePath.startsWith(prefix)) {
      return normalizedFilePath.slice(prefix.length);
    }
    return normalizedFilePath;
  }, [repoPath, filePath]);

  const [diff, setDiff] = useState<RawDiffResult | null>(fileDiff ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(!fileDiff);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const resolvedCommitHash = commitHash || null;
  const mode: 'commit' | 'working' = resolvedCommitHash ? 'commit' : 'working';

  const effectiveIsWorkingTree = useMemo((): boolean => {
    if (typeof isWorkingTree === 'boolean') return isWorkingTree;
    return mode === 'working';
  }, [isWorkingTree, mode]);

  const applyOverrides = useCallback((incoming: RawDiffResult): RawDiffResult => {
    const status = normalizeStatus(fileStatus || (incoming as any).status);
    const path = repoRelativePath || (incoming as any).path;

    // The bindings type should already match these fields, but keep this tolerant
    // to allow partial objects (e.g., tests/mocks).
    return {
      ...(incoming as RawDiffResult),
      path,
      status,
      ...(oldPath ? { oldPath } : null),
    } as RawDiffResult;
  }, [repoRelativePath, fileStatus, oldPath]);

  useEffect(() => {
    // If caller provides diff, just render it.
    if (fileDiff) {
      setDiff(applyOverrides(fileDiff));
      setIsLoading(false);
      setError(null);
      return;
    }

    if (!repoPath || !repoRelativePath) {
      setDiff(null);
      setIsLoading(false);
      setError('No file selected');
      return;
    }

    let cancelled = false;
    const key = cacheKey(repoPath, repoRelativePath, resolvedCommitHash);
    const cached = textDiffCache.get(key);

    if (cached) {
      setDiff(applyOverrides(cached));
      setIsLoading(false);
      setError(cached.hasError ? (cached.error || 'Failed to load diff') : null);
      // Still allow explicit reload to re-fetch.
      if (reloadNonce === 0) return;
    }

    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const result = resolvedCommitHash
          ? await DiffCommitFileRaw(repoPath, resolvedCommitHash, repoRelativePath)
          : await DiffWorkingRaw(repoPath, repoRelativePath);

        if (cancelled) return;

        const normalized = applyOverrides(result as unknown as RawDiffResult);
        textDiffCache.set(key, normalized);
        setDiff(normalized);
        setError(normalized.hasError ? (normalized.error || 'Failed to load diff') : null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setDiff({
          path: repoRelativePath,
          status: normalizeStatus(fileStatus),
          binary: false,
          rawDiff: '',
          hasError: true,
          error: message || 'Failed to load diff',
        } as RawDiffResult);
        setError(message || 'Failed to load diff');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    repoPath,
    repoRelativePath,
    resolvedCommitHash,
    fileStatus,
    oldPath,
    fileDiff,
    applyOverrides,
    reloadNonce,
  ]);

  // Loading state (only when we don't already have something to show)
  if (isLoading && !diff) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-theme-secondary">
        <Loader2 size={ICON_SIZES.md} className="animate-spin" />
        <span className="text-sm">Loading diff…</span>
      </div>
    );
  }

  // Hard error state (no diff object available)
  if (!diff) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-theme-error text-sm">
          <AlertCircle size={ICON_SIZES.sm} />
          <span>{error || 'Unable to load diff'}</span>
          <button
            type="button"
            className="ml-2 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-theme-muted text-theme-secondary"
            onClick={() => setReloadNonce((n) => n + 1)}
            title="Try again"
          >
            <RotateCcw size={ICON_SIZES.xs} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Delegate rendering to shared DiffViewer.
  return (
    <DiffViewer
      fileDiff={diff as any}
      showHeader={showHeader}
      repoPath={repoPath}
      commitHash={effectiveIsWorkingTree ? undefined : (resolvedCommitHash ?? undefined)}
    />
  );
}

export default memo(TextDiffViewer);
