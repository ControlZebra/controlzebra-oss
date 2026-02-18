/**
 * L5XWorkingDiffViewer — Domain-aware diff viewer for working tree L5X files.
 *
 * This variant handles diffs between HEAD and the current working tree version.
 * Unlike L5XDiffViewer (which works with commit hashes), this compares:
 * - Old: HEAD version of the file
 * - New: Current file on disk (working tree)
 *
 * Flow:
 * 1. Load HEAD version via git show HEAD:<path>
 * 2. Load current file from disk via ReadTextFile
 * 3. Parse both with ladder-visualizer's parseString()
 * 4. Run diffControllers() to produce a structured L5XDiff
 * 5. Render DiffChangeStream with the result
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
import { ReadFileAtRevision } from '../../../../bindings/controlzebra/services/gitservice';
import { ReadTextFile } from '../../../../bindings/controlzebra/services/filesystemservice';
import { ICON_SIZES } from '../../../constants';
import { useLayout } from '../../../context/LayoutContext';
import { getPathFileName } from '../path-utils';

import DiffChangeStream from './DiffChangeStream';

// ============================================================================
// Types
// ============================================================================

export interface L5XWorkingDiffViewerProps {
  /** Absolute path to the repository root. */
  repoPath: string;
  /** Path to the file within the repo. */
  filePath: string;
  /** Absolute path to the file on disk. */
  absoluteFilePath: string;
  /** Status of the file in working tree. */
  fileStatus: 'added' | 'modified' | 'deleted' | string;
}

interface LoadState {
  phase: 'idle' | 'loading-head' | 'loading-working' | 'parsing' | 'diffing' | 'done' | 'error';
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
  'loading-head': 'Loading committed version…',
  'loading-working': 'Loading current version…',
  parsing: 'Parsing L5X data…',
  diffing: 'Computing changes…',
};

// ============================================================================
// Component
// ============================================================================

function L5XWorkingDiffViewer({
  repoPath,
  filePath,
  absoluteFilePath,
  fileStatus,
}: L5XWorkingDiffViewerProps): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>({ phase: 'idle' });
  const [diff, setDiff] = useState<L5XDiff | null>(null);
  const [retryCount, setRetryCount] = useState(0);
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

  // Retry handler for error state
  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1);
  }, []);

  const handleReload = useCallback(() => {
    setRetryCount(prev => prev + 1);
  }, []);

  // ========================================================================
  // Load, parse, and diff
  // ========================================================================

  useEffect(() => {
    abortRef.current = false;
    let cancelled = false;

    async function run() {
      try {
        setLoadState({ phase: 'loading-head' });
        setDiff(null);

        // ---------- Load HEAD version ----------
        let headController: NormalizedController | undefined;

        if (fileStatus !== 'added') {
          const headResult = await ReadFileAtRevision(repoPath, filePath, 'HEAD');
          if (cancelled) return;

          if (headResult.hasError) {
            // If file doesn't exist at HEAD, it's effectively an added file
            if (headResult.error?.includes('does not exist')) {
              // OK — no HEAD content
            } else {
              throw new Error(`Failed to load HEAD version: ${headResult.error}`);
            }
          } else {
            setLoadState({ phase: 'parsing' });
            headController = parseL5X(headResult.content, 'HEAD');
          }
        }

        if (cancelled) return;

        // ---------- Load working tree version ----------
        setLoadState({ phase: 'loading-working' });
        let workingController: NormalizedController | undefined;

        if (fileStatus !== 'deleted') {
          const workingResult = await ReadTextFile(absoluteFilePath);
          if (cancelled) return;

          if (!workingResult.success || !workingResult.content) {
            throw new Error(`Failed to load working file: ${workingResult.error || 'No content'}`);
          }

          setLoadState({ phase: 'parsing' });
          workingController = parseL5X(workingResult.content, 'working');
        }

        if (cancelled) return;

        // ---------- Register AOIs for proper rendering ----------
        clearAOIs();
        if (workingController) {
          registerAOIsFromController(workingController);
        } else if (headController) {
          registerAOIsFromController(headController);
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
          headController ?? emptyController,
          workingController ?? emptyController,
        );

        if (cancelled) return;

        setDiff(l5xDiff);
        setLoadState({ phase: 'done' });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[L5XWorkingDiffViewer] Error:', message);
          setLoadState({ phase: 'error', error: message });
        }
      }
    }

    run();

    return () => {
      cancelled = true;
      abortRef.current = true;
    };
  }, [repoPath, filePath, absoluteFilePath, fileStatus, retryCount]);

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
      <div className="flex items-center justify-between px-4 py-2 bg-theme-surface border-b border-theme-default">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu size={ICON_SIZES.sm} className="text-theme-secondary shrink-0" />
          <span className="text-sm text-theme-primary font-medium shrink-0">
            L5X Working Changes
          </span>
          <span className="text-xs text-theme-muted truncate">
            {filePath}
          </span>
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

export default memo(L5XWorkingDiffViewer);
