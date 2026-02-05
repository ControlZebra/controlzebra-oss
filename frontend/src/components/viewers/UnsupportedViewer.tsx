/**
 * UnsupportedViewer - Fallback viewer for files without a registered viewer.
 * 
 * This viewer is shown when:
 * - No other viewer's canHandle() returns true
 * - The file type is not recognized
 * 
 * Features:
 * - Shows file name and extension
 * - Non-alarming, informative design
 * - Suggests alternative actions
 * 
 * Future enhancements:
 * - "Open with system default" button
 * - File size and metadata display
 * - Hex preview for binary files
 */
import { memo } from 'react';
import { FileQuestion } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import type { ViewerProps } from '../../lib/viewers';

/**
 * Extract file extension from a file path.
 */
function getFileExtension(filePath: string): string | null {
  const fileName = filePath.split('/').pop() || filePath;
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) {
    return null;
  }
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * UnsupportedViewer component for files without a registered viewer.
 * Part of the multi-viewer architecture.
 */
function UnsupportedViewer({ filePath }: ViewerProps): JSX.Element {
  // Extract filename and extension
  const fileName = filePath.split('/').pop() || filePath;
  const extension = getFileExtension(filePath);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* File path header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-theme-surface border-b border-theme-default text-sm text-theme-secondary">
        <FileQuestion size={ICON_SIZES.sm} />
        <span className="truncate">{filePath}</span>
      </div>
      
      {/* Content area */}
      <div className="flex-1 flex items-center justify-center bg-theme-surface">
        <div className="flex flex-col items-center text-center p-8 max-w-md">
          <div className="w-20 h-20 rounded-2xl bg-theme-elevated flex items-center justify-center mb-6">
            <FileQuestion size={ICON_SIZES.lg * 1.5} className="text-theme-muted" />
          </div>
          
          <h2 className="text-lg font-semibold text-theme-primary mb-2">
            Preview not available
          </h2>
          
          <p className="text-sm text-theme-secondary mb-1">
            <span className="font-mono bg-theme-elevated px-2 py-0.5 rounded">
              {fileName}
            </span>
          </p>
          
          {extension && (
            <p className="text-xs text-theme-muted mb-6">
              .{extension} files cannot be previewed in ControlZebra
            </p>
          )}
          
          {!extension && (
            <p className="text-xs text-theme-muted mb-6">
              This file type cannot be previewed in ControlZebra
            </p>
          )}
          
          <div className="text-xs text-theme-muted space-y-2">
            <p>You can:</p>
            <ul className="list-disc list-inside text-left space-y-1">
              <li>Open this file with an external application</li>
              <li>View changes in the Changes panel</li>
              <li>Commit changes without previewing</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(UnsupportedViewer);
