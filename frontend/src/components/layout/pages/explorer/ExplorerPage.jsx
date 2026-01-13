/**
 * ExplorerPage - Main area showing file tree or welcome screen.
 * 
 * When no folder is open: Shows welcome screen with open folder option
 * When folder is open: Shows file tree explorer
 */
import { memo, useState, useCallback, useEffect } from 'react';
import { FolderOpen, Clock, Folder, X } from 'lucide-react';
import { ICON_SIZES } from '../../../../constants';
import { useRepo } from '../../../../context';
import { OpenFolderDialog } from '../../../../../bindings/changeme/services/filedialogservice';
import { Button } from '../../../ui';
import { FileTreeView } from '../../../common';
import { getRecentFolders, removeRecentFolder, getFolderName, MAX_RECENT_DISPLAY } from '../../../../lib/recentFolders';

const iconStyleSm = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconStyleXs = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };

/**
 * WelcomeScreen - Shown when no folder is open.
 */
const WelcomeScreen = memo(function WelcomeScreen({ onOpenFolder, onOpenPath, isLoading }) {
  const [recentFolders, setRecentFolders] = useState([]);

  useEffect(() => {
    setRecentFolders(getRecentFolders());
  }, []);

  const handleRemoveRecent = useCallback((e, path) => {
    e.stopPropagation();
    removeRecentFolder(path);
    setRecentFolders(getRecentFolders());
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-screen-enter overflow-y-auto">
      <div className="max-w-lg text-center">
        <h1 className="text-5xl font-light text-theme-primary mb-2">Welcome!</h1>
        <p className="text-theme-secondary mb-8">Start version control for your project folder</p>

        <Button size="lg" variant="secondary" onClick={onOpenFolder} loading={isLoading}>
          <FolderOpen style={iconStyleSm} />
          Open Folder
        </Button>
        
        {/* Recent Folders Section */}
        {recentFolders.length > 0 && (
          <div className="mt-8 text-left">
            <div className="flex items-center gap-2 text-theme-muted text-xs uppercase tracking-wide mb-3">
              <Clock style={iconStyleXs} />
              <span>Recent</span>
            </div>
            <ul className="space-y-1">
              {recentFolders.slice(0, MAX_RECENT_DISPLAY).map((path) => (
                <li key={path}>
                  <button
                    onClick={() => onOpenPath(path)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover-bg-theme-interactive transition-colors group text-left"
                  >
                    <Folder style={iconStyleSm} className="text-yellow-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-theme-primary text-sm truncate">
                        {getFolderName(path)}
                      </div>
                      <div className="text-theme-muted text-xs truncate">
                        {path}
                      </div>
                    </div>
                    <span
                      onClick={(e) => handleRemoveRecent(e, path)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && handleRemoveRecent(e, path)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-theme-subtle rounded transition-opacity"
                      title="Remove from recent"
                    >
                      <X style={iconStyleXs} className="text-theme-muted" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <p className="text-xs text-theme-muted mt-6">
          Tip: Use <kbd className="px-1.5 py-0.5 rounded bg-theme-muted text-theme-secondary">⌘O</kbd> to quickly open a folder
        </p>
      </div>
    </div>
  );
});

function ExplorerPage() {
  const { repoPath, openRepo } = useRepo();
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);

  const handleOpenFolder = useCallback(async () => {
    setIsOpeningFolder(true);
    try {
      const result = await OpenFolderDialog();
      if (result.selected && result.path) {
        await openRepo(result.path);
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
    setIsOpeningFolder(false);
  }, [openRepo]);

  // No folder open - show welcome screen
  if (!repoPath) {
    return (
      <WelcomeScreen 
        onOpenFolder={handleOpenFolder} 
        onOpenPath={openRepo}
        isLoading={isOpeningFolder} 
      />
    );
  }

  // Folder open - show file tree
  return <FileTreeView repoPath={repoPath} />;
}

export default memo(ExplorerPage);
