/**
 * Pages barrel export + View Registry.
 * 
 * The VIEW_REGISTRY maps view IDs to their page components.
 * MainArea uses this to render the correct page based on activeView.
 */
import { VIEWS } from '../../../constants';

// Page components
export { default as ExplorerPage } from './ExplorerPage';
export { default as ChangesPage } from './ChangesPage';
export { default as HistoryPage } from './HistoryPage';
export { default as ProfilePage } from './ProfilePage';
export { SettingsPage } from './settings';

// Import for registry
import ExplorerPage from './ExplorerPage';
import ChangesPage from './ChangesPage';
import HistoryPage from './HistoryPage';
import ProfilePage from './ProfilePage';
import { SettingsPage } from './settings';

/**
 * VIEW_REGISTRY - Maps view IDs to page components.
 * Add new views here when creating new pages.
 */
export const VIEW_REGISTRY = {
  [VIEWS.EXPLORER]: ExplorerPage,
  [VIEWS.CHANGES]: ChangesPage,
  [VIEWS.HISTORY]: HistoryPage,
  [VIEWS.SETTINGS]: SettingsPage,
  [VIEWS.PROFILE]: ProfilePage,
};
