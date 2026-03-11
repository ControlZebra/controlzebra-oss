/**
 * VIEW_REGISTRY - Maps view IDs to page components.
 * MainArea uses this to render the correct page based on activeView.
 */
import type { ComponentType } from 'react';
import { VIEWS, type ViewType } from '../../shared/constants';

// Page component imports
import { ExplorerPage } from '../../features/explorer/pages';
import HistoryPage from '../../features/history/pages/HistoryPage';
import MergeChangesPage from '../../features/merge/pages/MergeChangesPage';
import ProfilePage from '../../features/profile/pages/ProfilePage';
import DebugPage from '../../features/debug/pages/DebugPage';
import SettingsPage from '../../features/settings/pages/SettingsPage';
import { RepoSettingsPage } from '../../features/repo-settings/pages';

export const VIEW_REGISTRY: Partial<Record<ViewType, ComponentType>> = {
  [VIEWS.EXPLORER]: ExplorerPage,
  [VIEWS.HISTORY]: HistoryPage,
  [VIEWS.MERGE_CHANGES]: MergeChangesPage,
  [VIEWS.REPO_SETTINGS]: RepoSettingsPage,
  [VIEWS.SETTINGS]: SettingsPage,
  [VIEWS.PROFILE]: ProfilePage,
  [VIEWS.DEBUG]: DebugPage,
};

// Re-export page components for any direct consumers
export { ExplorerPage } from '../../features/explorer/pages';
export { default as HistoryPage } from '../../features/history/pages/HistoryPage';
export { default as MergeChangesPage } from '../../features/merge/pages/MergeChangesPage';
export { default as ProfilePage } from '../../features/profile/pages/ProfilePage';
export { default as DebugPage } from '../../features/debug/pages/DebugPage';
export { default as SettingsPage } from '../../features/settings/pages/SettingsPage';
export { RepoSettingsPage } from '../../features/repo-settings/pages';
