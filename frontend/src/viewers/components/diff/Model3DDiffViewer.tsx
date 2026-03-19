/**
 * Model3DDiffViewer — Visual comparison of 3D model files across git revisions.
 *
 * Two view modes:
 *  1. **Side-by-side** — Two independent 3D viewers, old (left) and new (right).
 *     Each viewer can be orbited, panned, and zoomed independently.
 *  2. **Overlay** — A single 3D viewer where the old model is rendered in red
 *     (50% opacity) and the new model in blue (50% opacity). Where geometry
 *     overlaps, it appears purple, instantly highlighting additions/removals.
 *
 * Uses the Online3DViewer (OV) library which wraps three.js and supports 18+
 * import formats. File content is loaded through the Go backend as base64
 * (Wails webviews cannot access file:// URLs) and converted to browser File
 * objects for OV's LoadModelFromFileList API.
 *
 * Backend methods:
 *  - Shared diff-side loaders backed by the GitService/FileSystemService
 */
import {
  memo,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Columns2,
  Layers,
  FileText,
  Plus,
  Minus,
  Box,
} from 'lucide-react';
import { onEvent } from '../../../shared/runtime/events';

import { ICON_SIZES } from '../../../shared/constants';
import type { DiffSide } from '../../registry/diff-registry';
import { base64ToFile } from '../file/model3d-utils';
import { getPathFileName } from '../shared/path-utils';
import {
  loadBinarySide,
  resolveDiffSidePair,
  serializeDiffSide,
} from './diff-side-loaders';

// ============================================================================
// Types
// ============================================================================

type DiffMode = 'side-by-side' | 'overlay';

export interface Model3DDiffViewerProps {
  /** Absolute path to the git repository root. */
  repoPath: string;
  /** Path to the 3D model file (repo-relative). */
  filePath: string;
  oldSide?: DiffSide;
  newSide?: DiffSide;
  /** For commit diffs: the commit hash. Omit / null for working tree diffs. */
  commitHash?: string | null;
  /** True when comparing the working tree against HEAD. */
  isWorkingTree?: boolean;
  /** Absolute working-tree file path for legacy non-side requests. */
  absoluteFilePath?: string;
}

/** Internal state for the loaded model pair. */
interface ModelPair {
  oldFile: File | null;
  newFile: File | null;
  status: 'added' | 'modified' | 'deleted';
}

// ============================================================================
// Cache — avoid re-fetching when switching tabs or modes
// ============================================================================

const modelDiffCache = new Map<string, ModelPair>();

function makeCacheKey(
  repoPath: string,
  oldSide: DiffSide,
  newSide: DiffSide,
): string {
  return `3d::${repoPath}::${serializeDiffSide(oldSide)}::${serializeDiffSide(newSide)}`;
}

/** Invalidate all working-tree 3D diff caches. */
export function invalidateWorkingTree3DDiffCache(): void {
  for (const key of modelDiffCache.keys()) {
    if (key.endsWith('::working')) {
      modelDiffCache.delete(key);
    }
  }
}

/** Invalidate a specific file's cache entry. */
export function invalidate3DDiffCacheForFile(_repoPath: string, filePath: string): void {
  // Remove both working and any commit-based cache
  for (const key of modelDiffCache.keys()) {
    if (key.includes(`::${filePath}::`)) {
      modelDiffCache.delete(key);
    }
  }
}

// ============================================================================
// Toolbar Button
// ============================================================================

interface ToolbarBtnProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

function ToolbarBtn({ active, disabled, onClick, title, children }: ToolbarBtnProps) {
  return (
    <button
      type="button"
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-theme-accent/20 text-theme-accent'
          : 'text-theme-muted hover:text-theme-primary hover:bg-theme-elevated'
      } ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Side-by-Side View
// ============================================================================

interface SideBySideProps {
  oldFile: File | null;
  newFile: File | null;
}

const SideBySideView = memo(function SideBySideView({ oldFile, newFile }: SideBySideProps) {
  const oldContainerRef = useRef<HTMLDivElement>(null);
  const newContainerRef = useRef<HTMLDivElement>(null);
  const oldViewerRef = useRef<any>(null);
  const newViewerRef = useRef<any>(null);
  const ovRef = useRef<any>(null);

  const [oldLoading, setOldLoading] = useState(!!oldFile);
  const [newLoading, setNewLoading] = useState(!!newFile);

  // Destroy helpers
  const destroyViewers = useCallback(() => {
    try { oldViewerRef.current?.Destroy(); } catch { /* safe */ }
    try { newViewerRef.current?.Destroy(); } catch { /* safe */ }
    oldViewerRef.current = null;
    newViewerRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      destroyViewers();

      // Dynamic import (large dep, only when needed)
      if (!ovRef.current) {
        ovRef.current = await import('online-3d-viewer');
      }
      const OV = ovRef.current;

      if (cancelled) return;

      // Initialize old viewer
      if (oldContainerRef.current && oldFile) {
        setOldLoading(true);
        const viewer = new OV.EmbeddedViewer(oldContainerRef.current, {
          backgroundColor: new OV.RGBAColor(30, 30, 30, 255),
          defaultColor: new OV.RGBColor(180, 180, 180),
          onModelLoaded: () => { if (!cancelled) setOldLoading(false); },
          onModelLoadFailed: () => { if (!cancelled) setOldLoading(false); },
        });
        oldViewerRef.current = viewer;
        viewer.LoadModelFromFileList([oldFile]);
      } else {
        setOldLoading(false);
      }

      // Initialize new viewer
      if (newContainerRef.current && newFile) {
        setNewLoading(true);
        const viewer = new OV.EmbeddedViewer(newContainerRef.current, {
          backgroundColor: new OV.RGBAColor(30, 30, 30, 255),
          defaultColor: new OV.RGBColor(180, 180, 180),
          onModelLoaded: () => { if (!cancelled) setNewLoading(false); },
          onModelLoadFailed: () => { if (!cancelled) setNewLoading(false); },
        });
        newViewerRef.current = viewer;
        viewer.LoadModelFromFileList([newFile]);
      } else {
        setNewLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      destroyViewers();
    };
  }, [oldFile, newFile, destroyViewers]);

  // Resize observers
  useEffect(() => {
    const observers: ResizeObserver[] = [];

    if (oldContainerRef.current) {
      const ro = new ResizeObserver(() => oldViewerRef.current?.Resize());
      ro.observe(oldContainerRef.current);
      observers.push(ro);
    }
    if (newContainerRef.current) {
      const ro = new ResizeObserver(() => newViewerRef.current?.Resize());
      ro.observe(newContainerRef.current);
      observers.push(ro);
    }

    return () => observers.forEach(ro => ro.disconnect());
  }, []);

  return (
    <div className="flex-1 flex gap-1 min-h-0">
      {/* Old (Before) */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="text-xs text-center py-1 text-theme-muted uppercase tracking-wider font-medium border-b border-theme-default bg-theme-surface">
          Before
        </div>
        <div className="flex-1 relative min-h-0">
          {oldLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-[rgb(30,30,30)]">
              <Loader2 size={ICON_SIZES.md} className="animate-spin text-theme-secondary" />
            </div>
          )}
          {oldFile ? (
            <div ref={oldContainerRef} className="h-full w-full" />
          ) : (
            <div className="flex items-center justify-center h-full text-theme-muted text-sm italic">
              No previous version
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-theme-default shrink-0" />

      {/* New (After) */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="text-xs text-center py-1 text-theme-muted uppercase tracking-wider font-medium border-b border-theme-default bg-theme-surface">
          After
        </div>
        <div className="flex-1 relative min-h-0">
          {newLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-[rgb(30,30,30)]">
              <Loader2 size={ICON_SIZES.md} className="animate-spin text-theme-secondary" />
            </div>
          )}
          {newFile ? (
            <div ref={newContainerRef} className="h-full w-full" />
          ) : (
            <div className="flex items-center justify-center h-full text-theme-muted text-sm italic">
              File deleted
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// Overlay View
// ============================================================================

interface OverlayProps {
  oldFile: File | null;
  newFile: File | null;
}

/**
 * Recolor all meshes in a three.js scene to a given color and opacity.
 * Enables transparency and disables depth-write for correct blending.
 */
function recolorMeshes(scene: any, color: number, opacity: number): void {
  scene.traverse((obj: any) => {
    if (obj.isMesh) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      obj.material = materials.map((mat: any) => {
        const newMat = mat.clone();
        newMat.color.set(color);
        newMat.opacity = opacity;
        newMat.transparent = true;
        newMat.depthWrite = false;
        newMat.needsUpdate = true;
        return newMat;
      });
    }
  });
}

const OverlayView = memo(function OverlayView({ oldFile, newFile }: OverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const ovRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [overlayError, setOverlayError] = useState<string | null>(null);

  // Destroy helper
  const destroyViewer = useCallback(() => {
    try { viewerRef.current?.Destroy(); } catch { /* safe */ }
    viewerRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      destroyViewer();
      setIsLoading(true);
      setOverlayError(null);

      if (!containerRef.current) return;

      // Need at least one file to show anything
      if (!oldFile && !newFile) {
        setOverlayError('No model data available for overlay.');
        setIsLoading(false);
        return;
      }

      // Dynamic import
      if (!ovRef.current) {
        ovRef.current = await import('online-3d-viewer');
      }
      const OV = ovRef.current;

      if (cancelled || !containerRef.current) return;

      // Load the "primary" model (new, or old if new doesn't exist)
      const primaryFile = newFile || oldFile;
      const secondaryFile = newFile ? oldFile : null;
      const primaryColor = newFile ? 0x4488ff : 0xff4444; // blue for new, red for old-only
      const secondaryColor = 0xff4444; // red for old

      const viewer = new OV.EmbeddedViewer(containerRef.current, {
        backgroundColor: new OV.RGBAColor(30, 30, 30, 255),
        defaultColor: new OV.RGBColor(180, 180, 180),
        onModelLoaded: () => {
          if (cancelled) return;

          try {
            // Recolor primary model
            const innerViewer = viewer.GetViewer();
            const scene = innerViewer.GetScene();
            recolorMeshes(scene, primaryColor, 0.5);
            innerViewer.Render();

            // If we have a secondary model (old), load it via a hidden viewer
            // and inject its geometry into the main scene
            if (secondaryFile) {
              loadSecondaryOverlay(OV, viewer, secondaryFile, secondaryColor, 0.5, cancelled);
            }
          } catch (err: any) {
            console.warn('[Model3DDiffViewer] Overlay recolor failed:', err?.message);
          }

          if (!cancelled) setIsLoading(false);
        },
        onModelLoadFailed: () => {
          if (!cancelled) {
            setOverlayError('Failed to load 3D model for overlay comparison.');
            setIsLoading(false);
          }
        },
      });

      viewerRef.current = viewer;
      viewer.LoadModelFromFileList([primaryFile!]);
    }

    init();

    return () => {
      cancelled = true;
      destroyViewer();
    };
  }, [oldFile, newFile, destroyViewer]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => viewerRef.current?.Resize());
    ro.observe(container);

    return () => ro.disconnect();
  }, []);

  if (overlayError) {
    return (
      <div className="flex-1 flex items-center justify-center text-theme-muted text-sm">
        {overlayError}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="text-xs text-center py-1 text-theme-muted border-b border-theme-default bg-theme-surface">
        <span className="text-red-400">■ Before (red)</span>
        <span className="mx-2">·</span>
        <span className="text-blue-400">■ After (blue)</span>
        <span className="mx-2">·</span>
        <span className="text-purple-400">■ Overlap (purple)</span>
      </div>
      <div className="flex-1 relative min-h-0">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-[rgb(30,30,30)]">
            <Loader2 size={ICON_SIZES.lg} className="animate-spin text-theme-secondary" />
            <span className="text-sm text-theme-muted mt-3">Loading overlay…</span>
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
});

/**
 * Load a secondary model into a hidden off-screen viewer, then inject its
 * geometry (recolored) into the main viewer's three.js scene.
 */
async function loadSecondaryOverlay(
  OV: any,
  mainViewer: any,
  secondaryFile: File,
  color: number,
  opacity: number,
  cancelled: boolean,
): Promise<void> {
  return new Promise<void>((resolve) => {
    // Create a temporary hidden container for the secondary viewer
    const tempDiv = document.createElement('div');
    tempDiv.style.width = '1px';
    tempDiv.style.height = '1px';
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '-9999px';
    document.body.appendChild(tempDiv);

    const cleanup = () => {
      try {
        tempViewer.Destroy();
      } catch { /* safe */ }
      try {
        document.body.removeChild(tempDiv);
      } catch { /* safe */ }
    };

    const tempViewer = new OV.EmbeddedViewer(tempDiv, {
      backgroundColor: new OV.RGBAColor(0, 0, 0, 0),
      defaultColor: new OV.RGBColor(180, 180, 180),
      onModelLoaded: () => {
        if (cancelled) {
          cleanup();
          resolve();
          return;
        }

        try {
          // Get the root object from the temp viewer's scene
          const tempInner = tempViewer.GetViewer();
          const tempScene = tempInner.GetScene();

          // Clone all mesh children from the temp scene
          const clonedMeshes: any[] = [];
          tempScene.traverse((obj: any) => {
            if (obj.isMesh) {
              const clone = obj.clone(true);
              // Recolor to overlay color
              const materials = Array.isArray(clone.material) ? clone.material : [clone.material];
              clone.material = materials.map((mat: any) => {
                const newMat = mat.clone();
                newMat.color.set(color);
                newMat.opacity = opacity;
                newMat.transparent = true;
                newMat.depthWrite = false;
                newMat.needsUpdate = true;
                return newMat;
              });
              clonedMeshes.push(clone);
            }
          });

          // Add cloned meshes to the main viewer's scene
          const mainInner = mainViewer.GetViewer();
          const mainScene = mainInner.GetScene();
          for (const mesh of clonedMeshes) {
            mainScene.add(mesh);
          }
          mainInner.Render();
        } catch (err: any) {
          console.warn('[Model3DDiffViewer] Failed to inject overlay model:', err?.message);
        }

        cleanup();
        resolve();
      },
      onModelLoadFailed: () => {
        console.warn('[Model3DDiffViewer] Failed to load secondary model for overlay.');
        cleanup();
        resolve();
      },
    });

    tempViewer.LoadModelFromFileList([secondaryFile]);
  });
}

// ============================================================================
// Main Component
// ============================================================================

function Model3DDiffViewer({
  repoPath,
  filePath,
  oldSide,
  newSide,
  commitHash,
  isWorkingTree,
  absoluteFilePath,
}: Model3DDiffViewerProps): JSX.Element {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

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
  const key = useMemo(
    () => resolvedSides ? makeCacheKey(repoPath, resolvedSides.oldSide, resolvedSides.newSide) : '',
    [repoPath, resolvedSides],
  );
  const cached = modelDiffCache.get(key);

  const [modelPair, setModelPair] = useState<ModelPair | null>(cached ?? null);
  const [isLoading, setIsLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Persist mode preference
  const [mode, setMode] = useState<DiffMode>(
    () => (localStorage.getItem('3d-diff-mode') as DiffMode) || 'side-by-side',
  );

  const mountedRef = useRef(true);

  const fileName = useMemo(
    () => getPathFileName(filePath),
    [filePath],
  );
  const usesWorkingTree = useMemo(
    () => resolvedSides != null && (resolvedSides.oldSide.kind === 'working' || resolvedSides.newSide.kind === 'working'),
    [resolvedSides],
  );
  const normalizedTargetPath = useMemo(() => {
    const workingSide = resolvedSides?.newSide.kind === 'working'
      ? resolvedSides.newSide
      : resolvedSides?.oldSide.kind === 'working'
        ? resolvedSides.oldSide
        : null;
    return workingSide?.absolutePath.replace(/\\/g, '/').toLowerCase() ?? null;
  }, [resolvedSides]);

  // ---------------------------------------------------------------------------
  // File change subscription (for working tree diffs)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!usesWorkingTree || !normalizedTargetPath) return;

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
      if (changedPath !== normalizedTargetPath) return;

      modelDiffCache.delete(key);
      setRefreshCounter((c) => c + 1);
    };

    const unsubscribe = onEvent('files-changed', handleFilesChanged);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [key, normalizedTargetPath, usesWorkingTree]);

  // ---------------------------------------------------------------------------
  // Mode change handler — persist to localStorage
  // ---------------------------------------------------------------------------

  const handleModeChange = useCallback((m: DiffMode) => {
    setMode(m);
    localStorage.setItem('3d-diff-mode', m);
  }, []);

  const handleReload = useCallback(() => {
    modelDiffCache.delete(key);
    setRefreshCounter((c) => c + 1);
  }, [key]);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts: 1/2 to switch modes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      if (e.key === '1') handleModeChange('side-by-side');
      else if (e.key === '2') handleModeChange('overlay');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleModeChange]);

  // ---------------------------------------------------------------------------
  // Fetch old + new model data from backend
  // ---------------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;

    if (!resolvedSides) {
      setError('Unable to determine which 3D model revisions to compare.');
      setIsLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    // Use cache when available
    if (modelDiffCache.has(key)) {
      const c = modelDiffCache.get(key)!;
      setModelPair(c);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setModelPair(null);
    const activeSides = resolvedSides;

    async function load() {
      try {
        let oldData: string | null = null;
        let newData: string | null = null;

        const [oldResult, newResult] = await Promise.allSettled([
          loadBinarySide(repoPath, activeSides.oldSide),
          loadBinarySide(repoPath, activeSides.newSide),
        ]);

        if (cancelled || !mountedRef.current) return;

        if (oldResult.status === 'rejected' || newResult.status === 'rejected') {
          const oldMessage = oldResult.status === 'rejected'
            ? oldResult.reason instanceof Error ? oldResult.reason.message : String(oldResult.reason)
            : null;
          const newMessage = newResult.status === 'rejected'
            ? newResult.reason instanceof Error ? newResult.reason.message : String(newResult.reason)
            : null;
          setError(newMessage || oldMessage || 'Could not load one of the 3D model versions.');
          setIsLoading(false);
          return;
        }

        if (oldResult.status === 'fulfilled' && oldResult.value) {
          oldData = oldResult.value.base64Data;
        }
        if (newResult.status === 'fulfilled' && newResult.value) {
          newData = newResult.value.base64Data;
        }

        if (cancelled || !mountedRef.current) return;

        // Both sides failed
        if (!oldData && !newData) {
          setError('Could not load either version of the 3D model.');
          setIsLoading(false);
          return;
        }

        // Convert base64 to File objects
        const oldFile = oldData ? base64ToFile(oldData, `old_${fileName}`) : null;
        const newFile = newData ? base64ToFile(newData, fileName) : null;

        // Determine status
        let status: 'added' | 'modified' | 'deleted' = 'modified';
        if (!oldData && newData) status = 'added';
        else if (oldData && !newData) status = 'deleted';

        const pair: ModelPair = { oldFile, newFile, status };

        // Cache for tab-switch performance
        modelDiffCache.set(key, pair);
        setModelPair(pair);
        setIsLoading(false);
      } catch (err: any) {
        if (!cancelled && mountedRef.current) {
          setError(`Failed to load 3D model diff: ${err?.message || err}`);
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [key, repoPath, resolvedSides, refreshCounter, fileName]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const hasBothSides = Boolean(modelPair?.oldFile && modelPair?.newFile);

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-theme-secondary gap-3">
        <AlertCircle size={ICON_SIZES.lg} className="text-red-400" />
        <div className="text-center max-w-md">
          <p className="text-theme-primary font-medium mb-1">
            Cannot display 3D model diff
          </p>
          <p className="text-sm">{error}</p>
          <p className="text-xs text-theme-muted mt-2">{fileName}</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (isLoading || !modelPair) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2
          size={ICON_SIZES.lg}
          className="animate-spin text-theme-secondary"
        />
        <span className="text-sm text-theme-muted">
          Loading 3D model diff for {fileName}…
        </span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-theme-default bg-theme-surface shrink-0">
        <div className="flex items-center gap-3">
          <Box size={ICON_SIZES.sm} className="text-theme-secondary" />
          <span className="text-sm text-theme-primary font-medium truncate max-w-[300px]">{fileName}</span>
          <span className={`text-xs font-medium uppercase ${
            modelPair.status === 'added' ? 'text-theme-added' :
            modelPair.status === 'deleted' ? 'text-theme-removed' : 'text-theme-modified'
          }`}>
            {modelPair.status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 border border-theme-default rounded-md p-0.5">
            <ToolbarBtn
              active={mode === 'side-by-side'}
              onClick={() => handleModeChange('side-by-side')}
              title="Side by side (1)"
            >
              <Columns2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn
              active={mode === 'overlay'}
              disabled={!hasBothSides}
              onClick={() => handleModeChange('overlay')}
              title="Overlay comparison (2)"
            >
              <Layers size={14} />
            </ToolbarBtn>
          </div>

          <ToolbarBtn
            onClick={handleReload}
            title="Reload diff"
          >
            <RefreshCw size={14} />
          </ToolbarBtn>

          {/* Controls hint */}
          <span className="text-xs text-theme-muted/60 hidden sm:inline">
            Orbit: drag · Zoom: scroll · Pan: right-drag
          </span>
        </div>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-1 bg-theme-surface border-b border-theme-default text-xs text-theme-muted shrink-0">
        {modelPair.status === 'added' && (
          <span className="flex items-center gap-1 text-green-400 font-medium">
            <Plus size={ICON_SIZES.xs} /> Added
          </span>
        )}
        {modelPair.status === 'deleted' && (
          <span className="flex items-center gap-1 text-red-400 font-medium">
            <Minus size={ICON_SIZES.xs} /> Deleted
          </span>
        )}
        {modelPair.status === 'modified' && (
          <span className="flex items-center gap-1 text-theme-modified font-medium">
            <FileText size={ICON_SIZES.xs} /> Modified
          </span>
        )}
      </div>

      {/* ── Active mode view ────────────────────────────────────────────── */}
      {mode === 'side-by-side' && (
        <SideBySideView oldFile={modelPair.oldFile} newFile={modelPair.newFile} />
      )}
      {mode === 'overlay' && (
        <OverlayView oldFile={modelPair.oldFile} newFile={modelPair.newFile} />
      )}
    </div>
  );
}

export default memo(Model3DDiffViewer);
