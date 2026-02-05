/**
 * FileContentViewer - Displays file content in a read-only view.
 * 
 * Features:
 * - Syntax highlighting based on file extension (future)
 * - Line numbers
 * - Scroll support for large files
 * - Loading and error states
 */
import { memo, useState, useEffect } from 'react';
import { FileText, AlertCircle } from 'lucide-react';
import { ReadTextFile } from '../../../bindings/controlzebra/services/filesystemservice';
import { ICON_SIZES } from '../../constants';

interface FileContentViewerProps {
  filePath: string;
}

function FileContentViewer({ filePath }: FileContentViewerProps): JSX.Element {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadFile(): Promise<void> {
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await ReadTextFile(filePath);
        if (mounted) {
          if (result.success) {
            setContent(result.content || '');
          } else {
            setError(result.error || 'Failed to read file');
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to read file');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadFile();

    return () => {
      mounted = false;
    };
  }, [filePath]);

  // Extract filename from path
  const fileName = filePath.split('/').pop() || filePath;

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

  const lines = content?.split('\n') || [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* File path header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-theme-surface border-b border-theme-default text-sm text-theme-secondary">
        <FileText size={ICON_SIZES.sm} />
        <span className="truncate">{filePath}</span>
      </div>
      
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

export default memo(FileContentViewer);
