/**
 * Common components barrel export.
 * Re-exports shared UI components for easy importing.
 * 
 * Note: ChonkyFileBrowser is NOT exported here - it should be lazy loaded
 * directly to keep it in a separate chunk for better performance.
 */
export { default as DiffViewer } from './DiffViewer';
export { default as Spinner } from './Spinner';
export { default as EmptyState } from './EmptyState';
export { default as LoadingState } from './LoadingState';
export { default as GitLabIcon } from './GitLabIcon';
export { default as MasterBranchNudge } from './MasterBranchNudge';
export { default as RecoveryBanner } from './RecoveryBanner';
export { default as GitGraph } from './GitGraph';
export { default as SimpleFileBrowser } from './SimpleFileBrowser';
// ChonkyFileBrowser excluded - lazy load via: lazy(() => import('./ChonkyFileBrowser'))
