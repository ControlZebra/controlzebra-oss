/**
 * OpenFolderPage - Simple page to open an existing project folder.
 * 
 * Minimal page with a folder picker button and keyboard shortcut hint.
 * This replaces the old NoDirectoryScreen for the "Open Folder" category.
 */
import { memo, type CSSProperties } from 'react';
import { FolderOpen } from 'lucide-react';
import { ICON_STYLES } from '../../../lib/gitHelpers';
import { Button } from '../../../components/ui';

// ============================================================================
// Types
// ============================================================================

interface OpenFolderPageProps {
  onOpenFolder: () => void;
  isLoading?: boolean;
}

// ============================================================================
// Component
// ============================================================================

function OpenFolderPage({ onOpenFolder, isLoading = false }: OpenFolderPageProps): JSX.Element {
  // Detect platform for keyboard shortcut display
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const shortcutKey = isMac ? '⌘O' : 'Ctrl+O';

  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-screen-enter">
      <div className="max-w-lg text-center">
        {/* Large icon */}
        <div className="mb-6">
          <FolderOpen 
            style={{ width: 64, height: 64 } as CSSProperties} 
            className="text-theme-muted mx-auto" 
            strokeWidth={1} 
          />
        </div>

        {/* Title */}
        <h1 className="text-xl font-semibold text-theme-primary mb-2">
          Open an existing project folder
        </h1>
        <p className="text-theme-muted text-sm mb-8">
          Browse to a folder on your computer to start managing its version history.
        </p>

        {/* Browse button */}
        <Button size="lg" variant="secondary" onClick={onOpenFolder} loading={isLoading}>
          <FolderOpen style={ICON_STYLES.sm as CSSProperties} />
          Browse…
        </Button>

        {/* Keyboard shortcut hint */}
        <p className="text-xs text-theme-muted mt-6">
          Tip: Use{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-theme-muted text-theme-secondary">
            {shortcutKey}
          </kbd>{' '}
          to quickly open a folder
        </p>
      </div>
    </div>
  );
}

export default memo(OpenFolderPage);
