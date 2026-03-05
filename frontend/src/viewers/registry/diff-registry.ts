import type { ComponentType, LazyExoticComponent } from 'react';

export type DiffMode = 'working' | 'commit';

export interface DiffRenderRequest {
  repoPath?: string | null;
  filePath: string;
  mode: DiffMode;
  commitHash?: string | null;
  parentHash?: string | null;
  oldPath?: string;
  fileStatus?: string;
  absoluteFilePath?: string;
  fileDiff?: unknown;
  binary?: boolean;
  showHeader?: boolean;
}

export interface DiffViewerConfig {
  id: string;
  name: string;
  description?: string;
  component: ComponentType<DiffRenderRequest> | LazyExoticComponent<ComponentType<DiffRenderRequest>>;
  canHandle: (request: DiffRenderRequest) => boolean;
  priority?: number;
  builtIn?: boolean;
}

interface RegisteredDiffViewer extends DiffViewerConfig {
  _priority: number;
  _order: number;
}

let diffViewers: RegisteredDiffViewer[] = [];
let registrationCounter = 0;

export function registerDiffViewer(config: DiffViewerConfig): void {
  if (diffViewers.some((viewer) => viewer.id === config.id)) {
    throw new Error(`Diff viewer with id "${config.id}" is already registered`);
  }

  diffViewers.push({
    ...config,
    _priority: config.priority ?? 0,
    _order: registrationCounter++,
  });

  diffViewers.sort((a, b) => {
    if (a._priority === b._priority) {
      return a._order - b._order;
    }
    return b._priority - a._priority;
  });
}

export function resolveDiffViewer(request: DiffRenderRequest): DiffViewerConfig | undefined {
  return diffViewers.find((viewer) => viewer.canHandle(request));
}

export function getDiffViewerById(id: string): DiffViewerConfig | undefined {
  return diffViewers.find((viewer) => viewer.id === id);
}

export function getAllDiffViewers(): readonly DiffViewerConfig[] {
  return [...diffViewers];
}

export function clearDiffViewers(): void {
  diffViewers = [];
  registrationCounter = 0;
}
