/**
 * Pages barrel export + View Registry.
 * 
 * The VIEW_REGISTRY maps view IDs to their page components.
 * MainArea uses this to render the correct page based on activeView.
 */
import type { ComponentType } from 'react';
import { VIEWS, type ViewType } from '../../../constants';

// Page components
export { ExplorerPage } from './explorer';
export { default as HistoryPage } from './HistoryPage';
export { default as MergeChangesPage } from './MergeChangesPage';
export { default as ProfilePage } from './ProfilePage';
export { SettingsPage } from './settings';
export { RepoSettingsPage } from './repo-settings';

// Import for registry
import { ExplorerPage } from './explorer';
import HistoryPage from './HistoryPage';
import MergeChangesPage from './MergeChangesPage';
import ProfilePage from './ProfilePage';
import { SettingsPage } from './settings';
import { RepoSettingsPage } from './repo-settings';

/**
 * VIEW_REGISTRY - Maps view IDs to page components.
 * Add new views here when creating new pages.
 */
export const VIEW_REGISTRY: Partial<Record<ViewType, ComponentType>> = {
  [VIEWS.EXPLORER]: ExplorerPage,
  [VIEWS.HISTORY]: HistoryPage,
  [VIEWS.MERGE_CHANGES]: MergeChangesPage,
  [VIEWS.REPO_SETTINGS]: RepoSettingsPage,
  [VIEWS.SETTINGS]: SettingsPage,
  [VIEWS.PROFILE]: ProfilePage,
};
