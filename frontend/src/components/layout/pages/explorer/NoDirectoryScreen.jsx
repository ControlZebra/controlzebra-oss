/**
 * NoDirectoryScreen - Welcome screen when no directory is opened.
 * Prompts user to open a folder to start tracking changes.
 * Shows recently opened folders for quick access.
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { Folder, FolderOpen, Clock, X } from 'lucide-react';
import { ICON_SIZES } from '../../../../constants';
import { Button } from '../../../ui';
import { getRecentFolders, removeRecentFolder, getFolderName, MAX_RECENT_DISPLAY } from '../../../../lib/recentFolders';

// Memoized icon styles to avoid recreating objects on each render
const iconStyleSm = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const iconStyleXs = { width: ICON_SIZES.xs, height: ICON_SIZES.xs };
const iconStyleLg = { width: 32, height: 32 };

function NoDirectoryScreen({ onOpenFolder, onOpenPath, isLoading }) {
  const [recentFolders, setRecentFolders] = useState([]);

  // Load recent folders on mount
  useEffect(() => {
    setRecentFolders(getRecentFolders());
  }, []);

  // Handle removing a recent folder
  const handleRemoveRecent = useCallback((e, path) => {
    e.stopPropagation();
    removeRecentFolder(path);
    setRecentFolders(getRecentFolders());
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-screen-enter">
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
                    <button
                      onClick={(e) => handleRemoveRecent(e, path)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-theme-subtle rounded transition-opacity"
                      title="Remove from recent"
                    >
                      <X style={iconStyleXs} className="text-theme-muted" />
                    </button>
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
}

export default memo(NoDirectoryScreen);
