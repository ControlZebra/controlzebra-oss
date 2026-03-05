export { DiffRenderer } from './components/shared/DiffRenderer';

export {
  registerDiffViewer,
  resolveDiffViewer,
  getDiffViewerById,
  getAllDiffViewers,
  clearDiffViewers,
  type DiffMode,
  type DiffRenderRequest,
  type DiffViewerConfig,
} from './registry/diff-registry';

export { ensureBuiltInDiffViewersRegistered } from './registry/diff-builtins';
