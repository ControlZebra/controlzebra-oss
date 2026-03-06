/**
 * L5X Diff Viewer — Barrel exports.
 *
 * Primary exports:
 * - L5XDiffViewer: For commit-to-commit diffs (history view)
 * - L5XWorkingDiffViewer: For working tree diffs (HEAD vs current file)
 *
 * Sub-components are also exported for potential reuse/testing.
 */
export { default as L5XDiffViewer, clearL5XDiffCache } from './L5XDiffViewer';
export type { L5XDiffViewerProps } from './L5XDiffViewer';

export { default as L5XWorkingDiffViewer } from './L5XWorkingDiffViewer';
export type { L5XWorkingDiffViewerProps } from './L5XWorkingDiffViewer';

export { default as DiffChangeStream } from './DiffChangeStream';
export { default as RoutineDiffSection } from './RoutineDiffSection';
export { default as RungChangeCard } from './RungChangeCard';
export { default as ContextRung } from './ContextRung';
export { default as CollapsedRange } from './CollapsedRange';
export { default as TagDiffSection } from './TagDiffSection';
