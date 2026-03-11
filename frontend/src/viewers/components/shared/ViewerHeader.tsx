/**
 * ViewerHeader - Common header bar for all file viewers.
 * 
 * Features:
 * - Displays the file path
 * - "Open in Default App" button to launch file with system default application
 * - Optional custom icon based on viewer type
 * - Optional extra content (e.g., image dimensions)
 * 
 * This component is rendered by ViewerRenderer to provide consistent
 * header UI across all viewers without code duplication.
 */
import { memo, useCallback, type ReactNode } from 'react';
import { FileText, ExternalLink, type LucideIcon } from 'lucide-react';
import { OpenFile } from '../../../../bindings/controlzebra/services/filesystemservice';
import { toast } from 'sonner';
import { ICON_SIZES } from '../../../shared/constants';

// ============================================================================
// Types
// ============================================================================

export interface ViewerHeaderProps {
  /** Absolute path to the file being viewed */
  filePath: string;
  /** Optional icon to display (defaults to FileText) */
  icon?: LucideIcon;
  /** Optional extra content to render before the button (e.g., dimensions) */
  extraContent?: ReactNode;
}

// ============================================================================
// ViewerHeader Component
// ============================================================================

/**
 * ViewerHeader - Renders the common header bar for file viewers.
 */
function ViewerHeaderInner({ 
  filePath, 
  icon: Icon = FileText,
  extraContent,
}: ViewerHeaderProps): JSX.Element {
  // Handle open in default app
  const handleOpenInDefaultApp = useCallback(async () => {
    try {
      const result = await OpenFile(filePath);
      if (!result.success) {
        toast.error(`Failed to open file: ${result.error}`);
      }
    } catch {
      toast.error('Failed to open file');
    }
  }, [filePath]);

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-theme-surface border-b border-theme-default text-sm text-theme-secondary">
      <Icon size={ICON_SIZES.sm} className="flex-shrink-0" />
      <span className="truncate flex-1">{filePath}</span>
      {extraContent}
      <button
        onClick={handleOpenInDefaultApp}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-accent-primary hover:bg-accent-primary/80 text-white rounded text-xs font-medium transition-colors flex-shrink-0"
        title="Open in default application"
      >
        <ExternalLink size={14} />
        Open in Default App
      </button>
    </div>
  );
}

export const ViewerHeader = memo(ViewerHeaderInner);
export default ViewerHeader;
