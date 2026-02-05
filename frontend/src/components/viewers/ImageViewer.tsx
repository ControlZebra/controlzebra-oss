/**
 * ImageViewer - Displays image files with zoom and pan support.
 * 
 * Features:
 * - Supports common image formats (PNG, JPG, GIF, WebP, SVG, BMP, ICO)
 * - Centers image with max-width/height constraints
 * - Loading and error states
 * - Displays image dimensions when loaded
 * 
 * Future enhancements:
 * - Zoom controls
 * - Pan/drag support
 * - Fit/fill toggle
 * - Background color toggle (checkerboard for transparency)
 */
import { memo, useState, useCallback } from 'react';
import { Image as ImageIcon, AlertCircle, Loader2 } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import type { ViewerProps } from '../../lib/viewers';

/**
 * ImageViewer component for displaying image files.
 * Part of the multi-viewer architecture.
 */
function ImageViewer({ filePath }: ViewerProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  // Extract filename from path
  const fileName = filePath.split('/').pop() || filePath;

  // Convert file path to a URL that Wails can serve
  // For local files, we use the wails asset protocol or file:// scheme
  const imageUrl = `file://${filePath}`;

  const handleLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    setDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight,
    });
    setIsLoading(false);
    setError(null);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setError('Failed to load image. The file may be corrupted or inaccessible.');
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-theme-secondary gap-3">
        <AlertCircle size={ICON_SIZES.lg} className="text-red-400" />
        <div className="text-center">
          <p className="text-theme-primary font-medium mb-1">Cannot display image</p>
          <p className="text-sm">{error}</p>
          <p className="text-xs text-theme-muted mt-2">{fileName}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* File info header */}
      <div className="flex items-center justify-between px-4 py-2 bg-theme-surface border-b border-theme-default text-sm text-theme-secondary">
        <div className="flex items-center gap-2 min-w-0">
          <ImageIcon size={ICON_SIZES.sm} className="flex-shrink-0" />
          <span className="truncate">{filePath}</span>
        </div>
        {dimensions && (
          <span className="text-theme-muted text-xs flex-shrink-0 ml-4">
            {dimensions.width} × {dimensions.height}
          </span>
        )}
      </div>
      
      {/* Image display area */}
      <div className="flex-1 overflow-auto bg-theme-surface flex items-center justify-center p-4">
        {/* Checkerboard background for transparency */}
        <div 
          className="relative"
          style={{
            backgroundImage: 'linear-gradient(45deg, #404040 25%, transparent 25%), linear-gradient(-45deg, #404040 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #404040 75%), linear-gradient(-45deg, transparent 75%, #404040 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-theme-surface/80 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={ICON_SIZES.lg} className="animate-spin text-theme-secondary" />
                <span className="text-sm text-theme-muted">Loading {fileName}...</span>
              </div>
            </div>
          )}
          <img
            src={imageUrl}
            alt={fileName}
            onLoad={handleLoad}
            onError={handleError}
            className="max-w-full max-h-[calc(100vh-200px)] object-contain"
            style={{
              // Ensure crisp rendering for pixel art / small images
              imageRendering: dimensions && dimensions.width < 200 ? 'pixelated' : 'auto',
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default memo(ImageViewer);
