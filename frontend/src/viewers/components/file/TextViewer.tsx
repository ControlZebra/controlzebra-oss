/**
 * TextViewer - Displays text file content in a read-only view.
 * 
 * Features:
 * - Line numbers
 * - Scroll support for large files
 * - Loading and error states
 * - Monospace font for code readability
 * - Content caching for tab persistence
 * 
 * Note: The file header bar with "Open in Default App" is provided by ViewerRenderer.
 * 
 * Future enhancements:
 * - Syntax highlighting based on file extension
 * - Line wrapping toggle
 * - Search within file
 */
import { memo, useMemo, useCallback } from 'react';
import { FileText, AlertCircle } from 'lucide-react';
import { ReadTextFile } from '../../../../bindings/controlzebra/services/filesystemservice';
import { ICON_SIZES } from '../../../constants';
import type { ViewerProps } from '../../registry/viewer-registry';
import { useCachedContent } from '../../registry/viewer-cache';
import { getPathFileName } from '../shared/path-utils';

/**
 * TextViewer component for displaying text-based files.
 * Part of the multi-viewer architecture.
 * Uses cached content to persist across tab switches.
 */
function TextViewer({ filePath }: ViewerProps): JSX.Element {
  // Loader function for cached content
  const loadFile = useCallback(async (): Promise<string> => {
    const result = await ReadTextFile(filePath);
    if (!result.success) {
      throw new Error(result.error || 'Failed to read file');
    }
    return result.content || '';
  }, [filePath]);

  // Use cached content - persists across tab/view switches
  const { data: content, error, isLoading } = useCachedContent<string>(
    filePath,
    loadFile
  );

  // Extract filename from path
  const fileName = getPathFileName(filePath);

  // Memoize line splitting to avoid re-computation on re-renders
  // IMPORTANT: Must be called before any conditional returns to follow Rules of Hooks
  const lines = useMemo(() => content?.split('\n') || [], [content]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-theme-secondary">
        <div className="animate-pulse flex items-center gap-2">
          <FileText size={ICON_SIZES.md} />
          <span>Loading {fileName}...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-theme-secondary gap-3">
        <AlertCircle size={ICON_SIZES.lg} className="text-red-400" />
        <div className="text-center">
          <p className="text-theme-primary font-medium mb-1">Cannot display file</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Content area with line numbers */}
      <div className="flex-1 overflow-auto font-mono text-sm bg-theme-surface">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="hover:bg-theme-subtle">
                <td className="px-3 py-0 text-right text-theme-muted select-none border-r border-theme-default sticky left-0 bg-theme-elevated w-12">
                  {index + 1}
                </td>
                <td className="px-4 py-0 whitespace-pre text-theme-primary">
                  {line || '\u00A0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(TextViewer);
