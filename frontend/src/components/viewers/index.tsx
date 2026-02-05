/**
 * Viewer Components - Main exports for the multi-viewer system.
 * 
 * This module provides:
 * - ViewerRenderer: The main component that renders viewers with Suspense + ErrorBoundary
 * - ViewerErrorBoundary: Exported for custom error boundary usage
 * - Re-exports of types from lib/viewers
 */
import { memo, Suspense, type ReactElement } from 'react';
import { Loader2 } from 'lucide-react';
import ViewerErrorBoundary from './ViewerErrorBoundary';
import type { ViewerConfig, ViewerProps } from '../../lib/viewers';
import { ICON_SIZES } from '../../constants';

// ============================================================================
// Loading Fallback
// ============================================================================

interface LoadingFallbackProps {
  fileName?: string;
}

/**
 * Loading spinner shown while lazy-loaded viewers are being fetched.
 */
function LoadingFallback({ fileName }: LoadingFallbackProps): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <Loader2 
        size={ICON_SIZES.lg} 
        className="animate-spin text-theme-secondary" 
      />
      <span className="text-sm text-theme-muted">
        {fileName ? `Loading viewer for ${fileName}...` : 'Loading viewer...'}
      </span>
    </div>
  );
}

// ============================================================================
// ViewerRenderer
// ============================================================================

interface ViewerRendererProps {
  /** The viewer configuration to use */
  viewer: ViewerConfig;
  /** Path to the file to display */
  filePath: string;
  /** Optional content peek for advanced matching */
  contentPeek?: Uint8Array;
  /** Optional callback when viewer errors */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * ViewerRenderer - Renders a viewer with Suspense and ErrorBoundary protection.
 * 
 * This component:
 * 1. Wraps the viewer in Suspense for lazy-loaded components
 * 2. Wraps in ErrorBoundary to catch crashes
 * 3. Passes standard ViewerProps to the viewer component
 * 
 * @example
 * const viewer = getViewerForFile('readme.md');
 * if (viewer) {
 *   return <ViewerRenderer viewer={viewer} filePath="/path/to/readme.md" />;
 * }
 */
function ViewerRendererInner({ 
  viewer, 
  filePath, 
  contentPeek,
  onError,
}: ViewerRendererProps): ReactElement {
  const ViewerComponent = viewer.component;
  const fileName = filePath.split('/').pop() || filePath;
  
  const viewerProps: ViewerProps = {
    filePath,
    contentPeek,
  };

  return (
    <ViewerErrorBoundary filePath={filePath} onError={onError}>
      <Suspense fallback={<LoadingFallback fileName={fileName} />}>
        <ViewerComponent {...viewerProps} />
      </Suspense>
    </ViewerErrorBoundary>
  );
}

/**
 * Memoized ViewerRenderer - only re-renders when props change.
 */
export const ViewerRenderer = memo(ViewerRendererInner);

// ============================================================================
// Exports
// ============================================================================

// Export error boundary for custom use cases
export { default as ViewerErrorBoundary } from './ViewerErrorBoundary';

// Export viewer components
export { default as TextViewer } from './TextViewer';
export { default as ImageViewer } from './ImageViewer';
export { default as UnsupportedViewer } from './UnsupportedViewer';

// Re-export types from lib/viewers for convenience
export type { ViewerProps, ViewerConfig } from '../../lib/viewers';

// Re-export registry functions for components that need them
export { 
  getViewerForFile, 
  getViewerById, 
  getAllViewers,
  registerViewer,
} from '../../lib/viewers';
