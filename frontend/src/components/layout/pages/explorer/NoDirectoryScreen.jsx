/**
 * NoDirectoryScreen - Welcome screen when no directory is opened.
 * Prompts user to open a folder to start tracking changes.
 * Shows recently opened folders for quick access.
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { Folder, FolderOpen, Clock, X } from 'lucide-react';
import { ICON_STYLES } from '../../../../lib/gitHelpers';
import { Button } from '../../../ui';
import { getRecentFolders, removeRecentFolder, getFolderName, MAX_RECENT_DISPLAY } from '../../../../lib/recentFolders';

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
    <div className="flex-1 flex items-center justify-center p-8 animate-screen-enter overflow-y-auto">
      <div className="max-w-lg text-center">
        <h1 className="text-5xl font-light text-theme-primary mb-2">Welcome!</h1>
        <p className="text-theme-secondary mb-8">Start version control for your project folder</p>

        <Button size="lg" variant="secondary" onClick={onOpenFolder} loading={isLoading}>
          <FolderOpen style={ICON_STYLES.sm} />
          Open Folder
        </Button>
        
        {/* Recent Folders Section */}
        {recentFolders.length > 0 && (
          <div className="mt-8 text-left">
            <div className="flex items-center gap-2 text-theme-muted text-xs uppercase tracking-wide mb-3">
              <Clock style={ICON_STYLES.xs} />
              <span>Recent</span>
            </div>
            <ul className="space-y-1">
              {recentFolders.slice(0, MAX_RECENT_DISPLAY).map((path) => (
                <li key={path}>
                  <button
                    onClick={() => onOpenPath(path)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover-bg-theme-interactive transition-colors group text-left"
                  >
                    <Folder style={ICON_STYLES.sm} className="text-yellow-500 shrink-0" />
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
                      <X style={ICON_STYLES.xs} className="text-theme-muted" />
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
}

export default memo(NoDirectoryScreen);
