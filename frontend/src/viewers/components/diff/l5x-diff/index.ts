/**
 * L5X Diff Viewer — Barrel exports.
 *
 * Primary exports:
 * - L5XDiffViewer: Unified old/new snapshot diff viewer
 *
 * Sub-components are also exported for potential reuse/testing.
 */
export { default as L5XDiffViewer, clearL5XDiffCache } from './L5XDiffViewer';
export type { L5XDiffViewerProps } from './L5XDiffViewer';

export { default as DiffChangeStream } from './DiffChangeStream';
export { default as DiffNavigator } from './DiffNavigator';
export { default as RoutineDiffSection } from './RoutineDiffSection';
export { default as RungChangeCard } from './RungChangeCard';
export { default as ContextRung } from './ContextRung';
export { default as CollapsedRange } from './CollapsedRange';
export { default as TagDiffSection } from './TagDiffSection';
export { buildDiffNavigatorModel, getDiffTabId, type DiffNavigatorModel, type DiffTabData, type DiffTabDescriptor } from './diff-view-model';
export { useDiffTabs, clearCachedDiffTabState, getCachedDiffTabState, type DiffTab } from './useDiffTabs';
