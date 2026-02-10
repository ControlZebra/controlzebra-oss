/**
 * ExplorerPage - Main area showing tabs with file browser and opened files.
 * 
 * Features:
 * - Tabs bar at the top with file browser as pinned tab
 * - File browser shows when that tab is active
 * - File content shows when file tabs are active (using multi-viewer architecture)
 * - Diff tabs for L5X files show the domain-aware diff viewer
 * - When no folder is open: Shows welcome pages based on selected category
 * - Non-git / no-remote folders: Shows ProjectSetupBanner with state-aware CTA
 * - All open tabs are kept mounted (but hidden) to preserve viewer state/cache
 */
import { memo, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useRepo, useLayout } from '../../../../context';
import { OpenFolderDialog } from '../../../../../bindings/controlzebra/services/filedialogservice';
import { RecentProjectsPage, NewProjectPage, CloneProjectPage, OpenFolderPage } from '../welcome';
import SimpleFileBrowser from '../../../common/SimpleFileBrowser';
import ExplorerTabsBar from '../../../common/ExplorerTabsBar';
import { ProjectSetupBanner } from '../../../common';
import { PROJECT_STATES, ICON_SIZES, type ProjectState, type ExplorerTab } from '../../../../constants';
import { ViewerRenderer, getViewerForFile, getViewerById } from '../../../viewers';
import { isL5XFile, isImageFile } from '../../../../lib/file-utils';

// Lazy-load heavy diff viewers for code splitting
const L5XWorkingDiffViewer = lazy(() => import('../../../viewers/l5x-diff/L5XWorkingDiffViewer'));
const ImageDiffViewer = lazy(() => import('../../../viewers/ImageDiffViewer'));

function ExplorerPage(): JSX.Element {
  const {
    repoPath,
    repoInfo,
    repoStatus,
    openRepo,
    startTracking,
    publishToGitHub,
    startGitHubLogin,
    loadUserOrganizations,
    refreshRemotes,
    hasRemote,
    isLoading,
    ghInstalled,
    ghAuthStatus,
  } = useRepo();
  const { activeExplorerTab, explorerTabs, selectedWelcomeCategory } = useLayout();
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const handleOpenFolder = useCallback(async (): Promise<void> => {
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

  // Derive project state for the setup banner (Phase 12.1, Phase 14 nested-repo check)
  const projectState = useMemo((): ProjectState | null => {
    if (!repoPath) return null;
    if (!repoInfo?.isRepo) {
      const fileCount = repoStatus?.changedFiles?.length || 0;
      return fileCount > 0
        ? PROJECT_STATES.HAS_FILES_UNTRACKED
        : PROJECT_STATES.EMPTY_UNTRACKED;
    }
    // Nested repo check: if the detected repo root differs from the opened path,
    // this folder is inside another repository — suppress setup CTA (Phase 14)
    if (repoInfo.path && repoInfo.path !== repoPath) {
      return PROJECT_STATES.NESTED_REPO;
    }
    if (!hasRemote) return PROJECT_STATES.TRACKED_NO_REMOTE;
    return PROJECT_STATES.TRACKED_WITH_REMOTE;
  }, [repoPath, repoInfo?.isRepo, repoInfo?.path, hasRemote, repoStatus?.changedFiles?.length]);

  // Handle publish to GitHub with form data from the banner
  const handlePublishFromBanner = useCallback(async (
    name: string,
    isPrivate: boolean,
    owner: string
  ): Promise<void> => {
    setIsPublishing(true);
    try {
      const result = await publishToGitHub(name, '', isPrivate, owner);
      if (result.success) {
        await refreshRemotes();
      }
    } finally {
      setIsPublishing(false);
    }
  }, [publishToGitHub, refreshRemotes]);

  // Handle GitHub connect from banner
  const handleConnectGitHub = useCallback(async (): Promise<void> => {
    await startGitHubLogin();
  }, [startGitHubLogin]);

  // Memoize file tabs - must be called before any conditional returns (Rules of Hooks)
  const fileTabs = useMemo(() => 
    explorerTabs.filter(tab => tab.type === 'file' && tab.filePath),
    [explorerTabs]
  );

  // Memoize diff tabs
  const diffTabs = useMemo(() =>
    explorerTabs.filter(tab => tab.type === 'diff' && tab.diffContext),
    [explorerTabs]
  );

  // Check if file browser is active
  const isFileBrowserActive = activeExplorerTab === 'file-browser';

  // Memoize rendered file tabs to avoid recreating elements on every render
  // This keeps viewer components mounted and their caches intact
  // Must be called before any conditional returns (Rules of Hooks)
  const renderedFileTabs = useMemo(() => {
    return fileTabs.map(tab => {
      const viewer = tab.viewerId 
        ? getViewerById(tab.viewerId)
        : getViewerForFile(tab.title);
      
      if (!viewer || !tab.filePath) return null;
      
      const isActive = tab.id === activeExplorerTab;
      
      return (
        <div 
          key={tab.id} 
          className="h-full"
          style={{ display: isActive ? 'block' : 'none' }}
        >
          <ViewerRenderer viewer={viewer} filePath={tab.filePath} />
        </div>
      );
    }).filter(Boolean) as JSX.Element[];
  }, [fileTabs, activeExplorerTab]);

  // Memoize rendered diff tabs
  const renderedDiffTabs = useMemo(() => {
    return diffTabs.map((tab: ExplorerTab) => {
      if (!tab.diffContext || !repoPath) return null;
      
      const isActive = tab.id === activeExplorerTab;
      const { diffContext } = tab;
      const filePath = diffContext.relativePath || tab.filePath || '';
      const isL5X = isL5XFile(filePath);
      const isImage = isImageFile(filePath);

      return (
        <div
          key={tab.id}
          className="h-full"
          style={{ display: isActive ? 'block' : 'none' }}
        >
          {diffContext.type === 'working' && isL5X && diffContext.absolutePath ? (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full gap-2 text-theme-secondary">
                  <Loader2 size={ICON_SIZES.md} className="animate-spin" />
                  <span className="text-sm">Loading L5X diff viewer…</span>
                </div>
              }
            >
              <L5XWorkingDiffViewer
                repoPath={repoPath}
                filePath={filePath}
                absoluteFilePath={diffContext.absolutePath}
                fileStatus={diffContext.status ?? 'modified'}
              />
            </Suspense>
          ) : diffContext.type === 'working' && isImage ? (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full gap-2 text-theme-secondary">
                  <Loader2 size={ICON_SIZES.md} className="animate-spin" />
                  <span className="text-sm">Loading image diff viewer…</span>
                </div>
              }
            >
              <ImageDiffViewer
                repoPath={repoPath}
                filePath={filePath}
                isWorkingTree
              />
            </Suspense>
          ) : (
            // Fallback to standard text diff viewer for non-L5X/non-image files
            // This requires loading the diff data - for now show placeholder
            <div className="flex items-center justify-center h-full text-theme-muted text-sm">
              Diff view for {filePath}
            </div>
          )}
        </div>
      );
    }).filter(Boolean) as JSX.Element[];
  }, [diffTabs, activeExplorerTab, repoPath]);

  // No folder open - show welcome page based on selected category
  if (!repoPath) {
    switch (selectedWelcomeCategory) {
      case 'new-project':     return <NewProjectPage />;
      case 'clone-project':   return <CloneProjectPage />;
      case 'open-folder':     return <OpenFolderPage onOpenFolder={handleOpenFolder} isLoading={isOpeningFolder} />;
      case 'recent-projects':
      default:                return <RecentProjectsPage onOpenPath={openRepo} />;
    }
  }

  // Folder open - show tabs and content, with optional setup banner
  // Hide banner for fully-set-up projects and nested repos (Phase 14)
  const folderName = repoPath.split('/').pop() || '';
  const showBanner = projectState != null 
    && projectState !== PROJECT_STATES.TRACKED_WITH_REMOTE
    && projectState !== PROJECT_STATES.NESTED_REPO;

  return (
    <div className="flex flex-col h-full">
      <ExplorerTabsBar />

      {/* State-aware project setup banner (Phase 12.2 / 12.4) */}
      {showBanner && isFileBrowserActive && (
        <ProjectSetupBanner
          projectState={projectState}
          folderName={folderName}
          repoPath={repoPath}
          fileCount={repoStatus?.changedFiles?.length}
          onEnableVersionControl={startTracking}
          onPublishToGitHub={handlePublishFromBanner}
          onConnectGitHub={handleConnectGitHub}
          onLoadOrganizations={loadUserOrganizations}
          isLoading={isLoading}
          isPublishing={isPublishing}
          ghInstalled={ghInstalled}
          ghAuthStatus={ghAuthStatus}
        />
      )}

      <div className="flex-1 min-h-0 overflow-hidden relative">
        {/* File browser - always mounted, shown when active */}
        <div 
          className="h-full"
          style={{ display: isFileBrowserActive ? 'block' : 'none' }}
        >
          <SimpleFileBrowser repoPath={repoPath} />
        </div>
        
        {/* All file tabs - mounted but hidden when not active */}
        {renderedFileTabs}
        
        {/* All diff tabs - mounted but hidden when not active */}
        {renderedDiffTabs}
      </div>
    </div>
  );
}

export default memo(ExplorerPage);
