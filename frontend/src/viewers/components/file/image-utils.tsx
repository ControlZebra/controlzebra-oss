/**
 * Shared image utilities for ImageViewer and ImageDiffViewer.
 *
 * Extracted to avoid duplication between the single-image viewer
 * and the diff comparison viewer.
 */

// ---------------------------------------------------------------------------
// File Size Formatting
// ---------------------------------------------------------------------------

/** Human-readable file size string. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Checkerboard Transparency Pattern
// ---------------------------------------------------------------------------

/**
 * CSS inline style for the classic transparency checkerboard.
 * Apply to an image container so transparent areas are visible.
 */
export const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #404040 25%, transparent 25%), linear-gradient(-45deg, #404040 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #404040 75%), linear-gradient(-45deg, transparent 75%, #404040 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
};

// ---------------------------------------------------------------------------
// ToolbarIcon (for react-photo-view toolbar)
// ---------------------------------------------------------------------------

export interface ToolbarIconProps {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}

/**
 * Small icon button used inside `react-photo-view`'s toolbar.
 * Matches the library's expected class for consistent styling.
 */
export function ToolbarIcon({ children, onClick, title }: ToolbarIconProps) {
  return (
    <div
      className="PhotoView-Slider__toolbarIcon"
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </div>
  );
}
