/**
 * PDFDiffViewer — Visual page-by-page comparison of PDF files across git revisions.
 *
 * Three view modes:
 *  1. **Side-by-side** — Old and new pages rendered next to each other.
 *  2. **Diff highlight** — pixelmatch overlay showing changed pixels.
 *  3. **Overlay / swipe** — Drag a slider to reveal old vs new.
 *
 * The comparison is entirely frontend-driven:
 *  - PDFs are loaded as base64 from the Go backend
 *  - Pages are rendered via pdfjs into off-screen canvases
 *  - Pixel comparison via pixelmatch (browser-compatible, no Node.js)
 *  - Only the current page is compared at a time (lazy)
 *  - Results are cached per page to avoid redundant work
 *
 * Backend methods used:
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
  ChevronLeft,
  ChevronRight,
  Columns2,
  Layers,
  SlidersHorizontal,
  Plus,
  Minus,
  FileText,
  Equal,
  AlertTriangle,
} from 'lucide-react';
import { onEvent } from '../../../shared/runtime/events';

import { ICON_SIZES } from '../../../shared/constants';
import type { DiffSide } from '../../registry/diff-registry';
import { getPathFileName } from '../shared/path-utils';
import {
  loadBinarySide,
  serializeDiffSide,
} from './diff-side-loaders';
import {
  loadPdfFromBase64,
  renderPageToImageData,
  comparePages,
  computeSummary,
  type PDFDocumentProxy,
  type PageDiffResult,
  type PdfDiffSummary,
} from './pdf-diff-utils';

// ============================================================================
// Types
// ============================================================================

type DiffMode = 'side-by-side' | 'diff' | 'overlay';

export interface PDFDiffViewerProps {
  /** Absolute path to the git repository root. */
  repoPath: string;
  /** Path to the PDF file (repo-relative or absolute). */
  filePath: string;
  oldSide: DiffSide;
  newSide: DiffSide;
}

/** Internal state for the loaded PDF pair. */
interface PdfPair {
  oldDoc: PDFDocumentProxy | null;
  newDoc: PDFDocumentProxy | null;
  oldPageCount: number;
  newPageCount: number;
  status: 'added' | 'modified' | 'deleted';
}

// ============================================================================
// Cache — avoid re-fetching when switching tabs or modes
// ============================================================================

const pdfDiffCache = new Map<string, PdfPair>();

function cacheKey(
  repoPath: string,
  oldSide: DiffSide,
  newSide: DiffSide,
): string {
  return `pdf::${repoPath}::${serializeDiffSide(oldSide)}::${serializeDiffSide(newSide)}`;
}

/** Invalidate all working-tree PDF diff caches. */
export function invalidateWorkingTreePdfDiffCache(): void {
  for (const key of pdfDiffCache.keys()) {
    if (key.includes('::working:')) {
      pdfDiffCache.delete(key);
    }
  }
}

// ============================================================================
// Toolbar Button
// ============================================================================

interface ToolbarBtnProps {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

function ToolbarBtn({ active, onClick, title, children }: ToolbarBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-theme-accent/20 text-theme-accent'
          : 'text-theme-muted hover:text-theme-primary hover:bg-theme-elevated'
      }`}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Page Status Badge
// ============================================================================

function PageStatusBadge({ result, pageNum, oldPageCount, newPageCount }: {
  result: PageDiffResult | null;
  pageNum: number;
  oldPageCount: number;
  newPageCount: number;
}) {
  if (!result) return null;

  // Added page (only in new)
  if (pageNum > oldPageCount) {
    return (
      <span className="flex items-center gap-1 text-xs text-theme-added">
        <Plus size={12} /> Added
      </span>
    );
  }

  // Removed page (only in old)
  if (pageNum > newPageCount) {
    return (
      <span className="flex items-center gap-1 text-xs text-theme-removed">
        <Minus size={12} /> Removed
      </span>
    );
  }

  // Identical
  if (result.isEqual) {
    return (
      <span className="flex items-center gap-1 text-xs text-theme-added">
        <Equal size={12} /> Identical
      </span>
    );
  }

  // Changed
  const pct = result.totalPixels > 0
    ? ((result.diffPixelCount / result.totalPixels) * 100).toFixed(1)
    : '0';
  return (
    <span className="flex items-center gap-1 text-xs text-theme-modified">
      <AlertTriangle size={12} /> {pct}% changed
    </span>
  );
}

// ============================================================================
// Summary Bar
// ============================================================================

function SummaryBar({ summary }: { summary: PdfDiffSummary | null }) {
  if (!summary) return null;

  return (
    <div className="flex items-center gap-4 text-xs text-theme-muted px-1">
      <span>{summary.totalPages} page{summary.totalPages !== 1 ? 's' : ''}</span>
      {summary.changedPages > 0 && (
        <span className="text-theme-modified">{summary.changedPages} changed</span>
      )}
      {summary.addedPages > 0 && (
        <span className="text-theme-added">{summary.addedPages} added</span>
      )}
      {summary.removedPages > 0 && (
        <span className="text-theme-removed">{summary.removedPages} removed</span>
      )}
      {summary.unchangedPages > 0 && (
        <span className="text-theme-muted">{summary.unchangedPages} unchanged</span>
      )}
    </div>
  );
}

// ============================================================================
// Side-by-side View
// ============================================================================

const SideBySideView = memo(function SideBySideView({
  result,
  pageNum,
  oldPageCount,
  newPageCount,
}: {
  result: PageDiffResult;
  pageNum: number;
  oldPageCount: number;
  newPageCount: number;
}) {
  return (
    <div className="flex-1 flex gap-4 p-4 overflow-auto min-h-0">
      {/* Old page */}
      <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
        <span className="text-xs font-medium text-theme-muted uppercase tracking-wider">
          Before
        </span>
        {result.oldDataUrl ? (
          <div className="relative rounded-md overflow-hidden border border-theme-default shadow-md bg-theme-surface">
            <img
              src={result.oldDataUrl}
              alt={`Old page ${pageNum}`}
              className="max-w-full max-h-[calc(100cqh-4rem)] object-contain block"
              draggable={false}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-theme-muted text-sm italic min-h-[200px]">
            {pageNum > oldPageCount ? 'Page does not exist in old version' : 'No previous version'}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="w-px bg-theme-default shrink-0" />

      {/* New page */}
      <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
        <span className="text-xs font-medium text-theme-muted uppercase tracking-wider">
          After
        </span>
        {result.newDataUrl ? (
          <div className="relative rounded-md overflow-hidden border border-theme-default shadow-md bg-theme-surface">
            <img
              src={result.newDataUrl}
              alt={`New page ${pageNum}`}
              className="max-w-full max-h-[calc(100cqh-4rem)] object-contain block"
              draggable={false}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-theme-muted text-sm italic min-h-[200px]">
            {pageNum > newPageCount ? 'Page removed in new version' : 'No current version'}
          </div>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Diff Highlight View
// ============================================================================

const DiffHighlightView = memo(function DiffHighlightView({
  result,
  pageNum,
}: {
  result: PageDiffResult;
  pageNum: number;
}) {
  const imgSrc = result.diffDataUrl || result.newDataUrl || result.oldDataUrl;

  if (!imgSrc) {
    return (
      <div className="flex-1 flex items-center justify-center text-theme-muted text-sm">
        No diff data available for this page
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center gap-2 p-4 overflow-auto min-h-0">
      <span className="text-xs font-medium text-theme-muted uppercase tracking-wider">
        {result.diffDataUrl ? 'Diff Highlight' : result.newDataUrl ? 'New (no old to compare)' : 'Old (removed)'}
      </span>
      <div className="relative rounded-md overflow-hidden border border-theme-default shadow-md bg-theme-surface">
        <img
          src={imgSrc}
          alt={`Diff page ${pageNum}`}
          className="max-w-full max-h-[calc(100cqh-4rem)] object-contain block"
          draggable={false}
        />
      </div>
      {result.diffDataUrl && (
        <p className="text-xs text-theme-muted">
          Red/magenta pixels indicate changes · {result.diffPixelCount.toLocaleString()} pixels differ
        </p>
      )}
    </div>
  );
});

// ============================================================================
// Overlay / Swipe View
// ============================================================================

const OverlayView = memo(function OverlayView({
  result,
  pageNum,
}: {
  result: PageDiffResult;
  pageNum: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50); // percentage
  const isDragging = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, x)));
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  if (!result.oldDataUrl || !result.newDataUrl) {
    return (
      <div className="flex-1 flex items-center justify-center text-theme-muted text-sm">
        Overlay requires both old and new versions
      </div>
    );
  }

  const clipRight = `${100 - sliderPos}%`;

  return (
    <div className="flex-1 flex flex-col items-center gap-2 p-4 overflow-auto min-h-0">
      <span className="text-xs font-medium text-theme-muted uppercase tracking-wider">
        Overlay — drag slider to compare
      </span>
      <div
        ref={containerRef}
        className="relative inline-block rounded-md overflow-hidden border border-theme-default shadow-md bg-theme-surface select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Bottom layer: NEW image (fully visible) */}
        <img
          src={result.newDataUrl}
          alt={`New page ${pageNum}`}
          className="block max-w-full max-h-[calc(100cqh-4rem)] object-contain"
          draggable={false}
        />
        {/* Top layer: OLD image (clipped via clipPath — no resize) */}
        <img
          src={result.oldDataUrl}
          alt={`Old page ${pageNum}`}
          className="absolute inset-0 block max-w-full max-h-[calc(100cqh-4rem)] object-contain"
          style={{ clipPath: `inset(0 ${clipRight} 0 0)` }}
          draggable={false}
        />
        {/* Slider line */}
        <div
          className="absolute top-0 bottom-0 w-[2px] shadow-lg z-10"
          style={{
            left: `${sliderPos}%`,
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--color-accent-primary)',
          }}
        />
        {/* Slider handle */}
        <div
          className="absolute top-0 bottom-0 w-[10px] cursor-col-resize z-20"
          style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
          onPointerDown={handlePointerDown}
        >
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center shadow-lg"
            style={{ backgroundColor: 'var(--color-accent-primary)' }}
          >
            <SlidersHorizontal size={12} className="text-white" />
          </div>
        </div>
        {/* Side labels */}
        <span className="absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wider bg-theme-elevated text-theme-accent px-1.5 py-0.5 rounded">
          Before
        </span>
        <span className="absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wider bg-theme-elevated text-theme-added px-1.5 py-0.5 rounded">
          After
        </span>
      </div>
    </div>
  );
});

// ============================================================================
// Main PDFDiffViewer Component
// ============================================================================

function PDFDiffViewer({
  repoPath,
  filePath,
  oldSide,
  newSide,
}: PDFDiffViewerProps): JSX.Element {
  // ── State ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfPair, setPdfPair] = useState<PdfPair | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [mode, setMode] = useState<DiffMode>('side-by-side');
  const [showChangesOnly, setShowChangesOnly] = useState(false);
  const [pageResult, setPageResult] = useState<PageDiffResult | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [summary, setSummary] = useState<PdfDiffSummary | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Per-page diff cache (lives for the lifetime of this mount)
  const pageCacheRef = useRef<Map<number, PageDiffResult>>(new Map());

  // Track mounted state to avoid setState on unmounted component
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Total pages ────────────────────────────────────────────────────────
  const totalPages = pdfPair ? Math.max(pdfPair.oldPageCount, pdfPair.newPageCount) : 0;
  const usesWorkingTree = useMemo(
    () => oldSide.kind === 'working' || newSide.kind === 'working',
    [oldSide, newSide],
  );
  const activeCacheKey = useMemo(
    () => cacheKey(repoPath, oldSide, newSide),
    [repoPath, oldSide, newSide],
  );
  const normalizedTargetPath = useMemo(() => {
    const workingSide = newSide.kind === 'working'
      ? newSide
      : oldSide.kind === 'working'
        ? oldSide
        : null;
    return workingSide?.absolutePath.replace(/\\/g, '/').toLowerCase() ?? null;
  }, [newSide, oldSide]);

  const handleReload = useCallback(() => {
    pdfDiffCache.delete(activeCacheKey);
    pageCacheRef.current.clear();
    setPageResult(null);
    setSummary(null);
    setReloadNonce((n) => n + 1);
  }, [activeCacheKey]);

  // ── Load PDF pair on mount or when props change ────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setPdfPair(null);
      setCurrentPage(1);
      setShowChangesOnly(false);
      setSummary(null);
      pageCacheRef.current.clear();

      const key = cacheKey(repoPath, oldSide, newSide);

      // Check cache first
      const cached = pdfDiffCache.get(key);
      if (cached) {
        if (!cancelled && mountedRef.current) {
          setPdfPair(cached);
          setLoading(false);
        }
        return;
      }

      try {
        let oldDoc: PDFDocumentProxy | null = null;
        let newDoc: PDFDocumentProxy | null = null;
        let oldError: string | null = null;
        let newError: string | null = null;

        const [oldResult, newResult] = await Promise.allSettled([
          loadBinarySide(repoPath, oldSide),
          loadBinarySide(repoPath, newSide),
        ]);

        if (cancelled || !mountedRef.current) return;

        if (oldResult.status === 'rejected' || newResult.status === 'rejected') {
          const oldMessage = oldResult.status === 'rejected'
            ? oldResult.reason instanceof Error ? oldResult.reason.message : String(oldResult.reason)
            : null;
          const newMessage = newResult.status === 'rejected'
            ? newResult.reason instanceof Error ? newResult.reason.message : String(newResult.reason)
            : null;
          setError(newMessage || oldMessage || 'Could not load one of the PDF versions');
          setLoading(false);
          return;
        }

        if (oldResult.status === 'fulfilled' && oldResult.value) {
          try {
            oldDoc = await loadPdfFromBase64(oldResult.value.base64Data);
          } catch (e: any) {
            console.warn('[PDFDiffViewer] Failed to load old PDF:', e?.message);
            oldError = e?.message || 'Failed to parse old PDF';
          }
        }

        if (newResult.status === 'fulfilled' && newResult.value) {
          try {
            newDoc = await loadPdfFromBase64(newResult.value.base64Data);
          } catch (e: any) {
            console.warn('[PDFDiffViewer] Failed to load new PDF:', e?.message);
            newError = e?.message || 'Failed to parse new PDF';
          }
        }

        if (cancelled || !mountedRef.current) return;

        if (!oldDoc && !newDoc) {
          // Both sides failed — show the most relevant error
          const msg = newError || oldError || 'Could not load either version of the PDF';
          setError(msg);
          setLoading(false);
          return;
        }

        // Determine status
        let status: 'added' | 'modified' | 'deleted' = 'modified';
        if (!oldDoc) status = 'added';
        else if (!newDoc) status = 'deleted';

        const pair: PdfPair = {
          oldDoc,
          newDoc,
          oldPageCount: oldDoc?.numPages ?? 0,
          newPageCount: newDoc?.numPages ?? 0,
          status,
        };

        pdfDiffCache.set(key, pair);
        setPdfPair(pair);
      } catch (err: any) {
        if (!cancelled && mountedRef.current) {
          setError(err?.message || 'Failed to load PDFs');
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [filePath, newSide, oldSide, reloadNonce, repoPath]);

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

      pdfDiffCache.delete(activeCacheKey);
      pageCacheRef.current.clear();
      setReloadNonce((nonce) => nonce + 1);
    };

    const unsubscribe = onEvent('files-changed', handleFilesChanged);
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [activeCacheKey, normalizedTargetPath, usesWorkingTree]);

  // ── Compare current page whenever it changes ──────────────────────────
  useEffect(() => {
    if (!pdfPair || totalPages === 0) return;

    let cancelled = false;

    async function diffPage() {
      const pair = pdfPair; // capture for null safety
      if (!pair) return;

      // Check page cache first
      const cached = pageCacheRef.current.get(currentPage);
      if (cached) {
        if (!cancelled && mountedRef.current) {
          setPageResult(cached);
        }
        return;
      }

      setPageLoading(true);

      try {
        const scale = 1.5; // 108 DPI — good balance of quality vs performance

        const [oldData, newData] = await Promise.all([
          pair.oldDoc ? renderPageToImageData(pair.oldDoc, currentPage, scale) : Promise.resolve(null),
          pair.newDoc ? renderPageToImageData(pair.newDoc, currentPage, scale) : Promise.resolve(null),
        ]);

        if (cancelled || !mountedRef.current) return;

        const result = comparePages(oldData, newData);
        pageCacheRef.current.set(currentPage, result);
        setPageResult(result);
      } catch (err: any) {
        if (!cancelled && mountedRef.current) {
          setPageResult(null);
          console.error('Page diff failed:', err);
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setPageLoading(false);
        }
      }
    }

    diffPage();
    return () => { cancelled = true; };
  }, [pdfPair, currentPage, totalPages]);

  // ── Compute summary when enough pages have been diffed ────────────────
  // Lazily update summary as pages are diffed (don't block on all pages)
  useEffect(() => {
    if (!pdfPair) return;
    const cache = pageCacheRef.current;
    if (cache.size > 0) {
      setSummary(computeSummary(cache, pdfPair.oldPageCount, pdfPair.newPageCount));
    }
  }, [pdfPair, pageResult]); // re-compute when a new page result lands

  // ── Pre-diff all pages in background for summary ──────────────────────
  useEffect(() => {
    if (!pdfPair || totalPages === 0) return;
    let cancelled = false;

    async function diffAllPages() {
      const scale = 1.0; // lower scale for background summary (faster)
      const pair = pdfPair; // capture for null safety
      if (!pair) return;

      for (let i = 1; i <= totalPages; i++) {
        if (cancelled) return;
        if (pageCacheRef.current.has(i)) continue;

        try {
          const [oldData, newData] = await Promise.all([
            pair.oldDoc ? renderPageToImageData(pair.oldDoc, i, scale) : Promise.resolve(null),
            pair.newDoc ? renderPageToImageData(pair.newDoc, i, scale) : Promise.resolve(null),
          ]);

          if (cancelled) return;

          const result = comparePages(oldData, newData);
          pageCacheRef.current.set(i, result);
        } catch {
          // Skip failed pages in background scan
        }
      }

      if (!cancelled && mountedRef.current && pair) {
        setSummary(computeSummary(pageCacheRef.current, pair.oldPageCount, pair.newPageCount));
      }
    }

    // Delay background diff to not compete with the initial page render
    const timer = setTimeout(diffAllPages, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pdfPair, totalPages]);

  // ── Page navigation ────────────────────────────────────────────────────
  const changedPages = useMemo(() => {
    if (!pdfPair || totalPages === 0) return [] as number[];

    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const cached = pageCacheRef.current.get(i);
      if (!cached) continue;

      if (i > pdfPair.oldPageCount || i > pdfPair.newPageCount || !cached.isEqual) {
        pages.push(i);
      }
    }

    return pages;
  }, [pdfPair, totalPages, summary, pageResult]);

  const visiblePages = useMemo(() => {
    if (!showChangesOnly) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    return changedPages;
  }, [showChangesOnly, totalPages, changedPages]);

  useEffect(() => {
    if (!showChangesOnly) return;
    if (visiblePages.length === 0) return;
    if (visiblePages.includes(currentPage)) return;

    setCurrentPage(visiblePages[0]);
  }, [showChangesOnly, visiblePages, currentPage]);

  const goToPrev = useCallback(() => {
    if (showChangesOnly) {
      setCurrentPage(p => {
        const idx = visiblePages.indexOf(p);
        if (idx <= 0) return visiblePages[0] ?? p;
        return visiblePages[idx - 1];
      });
      return;
    }

    setCurrentPage(p => Math.max(1, p - 1));
  }, [showChangesOnly, visiblePages]);

  const goToNext = useCallback(() => {
    if (showChangesOnly) {
      setCurrentPage(p => {
        const idx = visiblePages.indexOf(p);
        if (idx < 0) return visiblePages[0] ?? p;
        if (idx >= visiblePages.length - 1) return visiblePages[visiblePages.length - 1] ?? p;
        return visiblePages[idx + 1];
      });
      return;
    }

    setCurrentPage(p => Math.min(totalPages, p + 1));
  }, [showChangesOnly, visiblePages, totalPages]);

  const currentVisibleIndex = visiblePages.indexOf(currentPage);
  const canGoPrev = showChangesOnly
    ? currentVisibleIndex > 0
    : currentPage > 1;
  const canGoNext = showChangesOnly
    ? currentVisibleIndex >= 0 && currentVisibleIndex < visiblePages.length - 1
    : currentPage < totalPages;

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToNext();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goToPrev, goToNext]);

  // ── Render ─────────────────────────────────────────────────────────────

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 size={ICON_SIZES.lg} className="animate-spin text-theme-secondary" />
        <span className="text-sm text-theme-muted">Loading PDFs for comparison…</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-theme-error">
        <AlertCircle size={ICON_SIZES.lg} />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  // No data
  if (!pdfPair) {
    return (
      <div className="flex items-center justify-center h-full text-theme-muted text-sm">
        No PDF data available
      </div>
    );
  }

  const fileName = getPathFileName(filePath);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-theme-default bg-theme-surface shrink-0">
        <div className="flex items-center gap-3">
          <FileText size={ICON_SIZES.sm} className="text-theme-secondary" />
          <span className="text-sm text-theme-primary font-medium truncate max-w-[300px]">{fileName}</span>
          <span className={`text-xs font-medium uppercase ${
            pdfPair.status === 'added' ? 'text-theme-added' :
            pdfPair.status === 'deleted' ? 'text-theme-removed' : 'text-theme-modified'
          }`}>
            {pdfPair.status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Summary stats */}
          <SummaryBar summary={summary} />

          {/* Page filter */}
          <div className="flex items-center border border-theme-default rounded-md p-0.5 ml-2">
            <ToolbarBtn
              active={showChangesOnly}
              onClick={() => setShowChangesOnly(v => !v)}
              title="Changes only"
            >
              <span className="text-xs px-1">Changes only</span>
            </ToolbarBtn>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 border border-theme-default rounded-md p-0.5 ml-2">
            <ToolbarBtn active={mode === 'side-by-side'} onClick={() => setMode('side-by-side')} title="Side by side">
              <Columns2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn active={mode === 'diff'} onClick={() => setMode('diff')} title="Diff highlight">
              <Layers size={14} />
            </ToolbarBtn>
            <ToolbarBtn active={mode === 'overlay'} onClick={() => setMode('overlay')} title="Overlay slider">
              <SlidersHorizontal size={14} />
            </ToolbarBtn>
          </div>

          <ToolbarBtn onClick={handleReload} title="Reload diff">
            <RefreshCw size={14} />
          </ToolbarBtn>
        </div>
      </div>

      {/* ── Page navigation bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-4 px-4 py-2 border-b border-theme-default bg-theme-elevated shrink-0">
        <button
          type="button"
          onClick={goToPrev}
          disabled={!canGoPrev}
          className="p-1 rounded hover:bg-theme-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-theme-secondary"
          title="Previous page (←)"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-theme-primary font-medium">
            Page {currentPage}
          </span>
          <span className="text-theme-muted">
            of {showChangesOnly ? visiblePages.length : totalPages}
          </span>
          {showChangesOnly && (
            <span className="text-xs text-theme-modified">(changed only)</span>
          )}
          {pdfPair.oldPageCount !== pdfPair.newPageCount && (
            <span className="text-xs text-theme-muted">
              (old: {pdfPair.oldPageCount}, new: {pdfPair.newPageCount})
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={goToNext}
          disabled={!canGoNext}
          className="p-1 rounded hover:bg-theme-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-theme-secondary"
          title="Next page (→)"
        >
          <ChevronRight size={18} />
        </button>

        {/* Page status badge */}
        <PageStatusBadge
          result={pageResult}
          pageNum={currentPage}
          oldPageCount={pdfPair.oldPageCount}
          newPageCount={pdfPair.newPageCount}
        />
      </div>

      {/* ── Page content ────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ containerType: 'size' }}>
        {showChangesOnly && visiblePages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-theme-muted text-sm">
            {summary && pageCacheRef.current.size >= totalPages
              ? 'No changed pages found'
              : 'Finding changed pages…'}
          </div>
        ) : pageLoading && !pageResult ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 size={ICON_SIZES.md} className="animate-spin text-theme-secondary" />
            <span className="text-sm text-theme-muted">Comparing page {currentPage}…</span>
          </div>
        ) : pageResult ? (
          <>
            {mode === 'side-by-side' && (
              <SideBySideView
                result={pageResult}
                pageNum={currentPage}
                oldPageCount={pdfPair.oldPageCount}
                newPageCount={pdfPair.newPageCount}
              />
            )}
            {mode === 'diff' && (
              <DiffHighlightView result={pageResult} pageNum={currentPage} />
            )}
            {mode === 'overlay' && (
              <OverlayView result={pageResult} pageNum={currentPage} />
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-theme-muted text-sm">
            Failed to compare this page
          </div>
        )}
      </div>

      {/* ── Page thumbnail strip (for quick navigation) ─────────────────── */}
      {visiblePages.length > 1 && totalPages <= 50 && (
        <div className="flex items-center gap-1 px-4 py-2 border-t border-theme-default bg-theme-surface overflow-x-auto shrink-0">
          {visiblePages.map(pageNum => {
            const cached = pageCacheRef.current.get(pageNum);
            const isActive = pageNum === currentPage;

            let dotColor = 'bg-theme-muted/30'; // unknown
            if (cached) {
              if (pageNum > pdfPair.oldPageCount) dotColor = 'bg-theme-added'; // added
              else if (pageNum > pdfPair.newPageCount) dotColor = 'bg-theme-removed'; // removed
              else if (cached.isEqual) dotColor = 'bg-theme-muted/50'; // unchanged
              else dotColor = 'bg-theme-modified'; // changed
            }

            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                className={`w-6 h-6 rounded text-[10px] font-medium transition-all ${
                  isActive
                    ? 'bg-theme-accent/20 text-theme-accent shadow-sm'
                    : 'hover:bg-theme-elevated text-theme-muted'
                }`}
                title={`Page ${pageNum}`}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span>{pageNum}</span>
                  {!isActive && <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(PDFDiffViewer);
