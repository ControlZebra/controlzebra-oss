import { lazy } from 'react';

import { fileKindFromPath } from '../../shared/constants/file-types';
import { isImageFile } from '../../shared/constants/file-utils';
import TextDiffViewer from '../components/diff/TextDiffViewer';
import { registerDiffViewer, type DiffRenderRequest } from './diff-registry';

const L5XDiffViewer = lazy(() => import('../components/diff/l5x-diff/L5XDiffViewer'));
const L5XWorkingDiffViewer = lazy(() => import('../components/diff/l5x-diff/L5XWorkingDiffViewer'));
const ImageDiffViewer = lazy(() => import('../components/diff/ImageDiffViewer'));
const PDFDiffViewer = lazy(() => import('../components/diff/PDFDiffViewer'));
const Model3DDiffViewer = lazy(() => import('../components/diff/Model3DDiffViewer'));

function TextDiffEntry(request: DiffRenderRequest): JSX.Element {
  return (
    <TextDiffViewer
      repoPath={request.repoPath ?? ''}
      filePath={request.filePath}
      commitHash={request.mode === 'commit' ? request.commitHash : null}
      isWorkingTree={request.mode === 'working'}
      fileStatus={request.fileStatus}
      oldPath={request.oldPath}
      fileDiff={request.fileDiff as any}
      showHeader={request.showHeader}
    />
  );
}

function L5XCommitEntry(request: DiffRenderRequest): JSX.Element {
  return (
    <L5XDiffViewer
      repoPath={request.repoPath ?? ''}
      commitHash={request.commitHash ?? ''}
      parentHash={request.parentHash ?? undefined}
      filePath={request.filePath}
      oldPath={request.oldPath}
      fileStatus={request.fileStatus ?? 'modified'}
    />
  );
}

function L5XWorkingEntry(request: DiffRenderRequest): JSX.Element {
  return (
    <L5XWorkingDiffViewer
      repoPath={request.repoPath ?? ''}
      filePath={request.filePath}
      absoluteFilePath={request.absoluteFilePath ?? request.filePath}
      fileStatus={request.fileStatus ?? 'modified'}
    />
  );
}

function ImageDiffEntry(request: DiffRenderRequest): JSX.Element {
  return (
    <ImageDiffViewer
      repoPath={request.repoPath ?? ''}
      filePath={request.filePath}
      commitHash={request.mode === 'commit' ? request.commitHash : undefined}
      isWorkingTree={request.mode === 'working'}
    />
  );
}

function PdfDiffEntry(request: DiffRenderRequest): JSX.Element {
  return (
    <PDFDiffViewer
      repoPath={request.repoPath ?? ''}
      filePath={request.filePath}
      oldSide={request.oldSide}
      newSide={request.newSide}
      commitHash={request.mode === 'commit' ? request.commitHash : undefined}
      isWorkingTree={request.mode === 'working'}
    />
  );
}

function Model3DDiffEntry(request: DiffRenderRequest): JSX.Element {
  return (
    <Model3DDiffViewer
      repoPath={request.repoPath ?? ''}
      filePath={request.filePath}
      oldSide={request.oldSide}
      newSide={request.newSide}
      commitHash={request.mode === 'commit' ? request.commitHash : undefined}
      isWorkingTree={request.mode === 'working'}
    />
  );
}

function BinaryFallbackEntry(): JSX.Element {
  return (
    <div className="h-64 flex items-center justify-center text-theme-muted text-sm">
      Cannot preview this binary file
    </div>
  );
}

let builtInsRegistered = false;

export function ensureBuiltInDiffViewersRegistered(): void {
  if (builtInsRegistered) {
    return;
  }

  registerDiffViewer({
    id: 'l5x-working',
    name: 'L5X Working Diff Viewer',
    builtIn: true,
    priority: 60,
    canHandle: (request) => {
      const kind = fileKindFromPath(request.filePath);
      return kind === 'l5x'
        && request.mode === 'working'
        && !!request.repoPath
        && !!request.absoluteFilePath;
    },
    component: L5XWorkingEntry,
  });

  registerDiffViewer({
    id: 'l5x-commit',
    name: 'L5X Commit Diff Viewer',
    builtIn: true,
    priority: 50,
    canHandle: (request) => {
      const kind = fileKindFromPath(request.filePath);
      return kind === 'l5x'
        && request.mode === 'commit'
        && !!request.repoPath
        && !!request.commitHash;
    },
    component: L5XCommitEntry,
  });

  registerDiffViewer({
    id: 'image',
    name: 'Image Diff Viewer',
    builtIn: true,
    priority: 40,
    canHandle: (request) => {
      const kind = fileKindFromPath(request.filePath);
      return kind === 'image' && isImageFile(request.filePath) && !!request.repoPath;
    },
    component: ImageDiffEntry,
  });

  registerDiffViewer({
    id: 'pdf',
    name: 'PDF Diff Viewer',
    builtIn: true,
    priority: 30,
    canHandle: (request) => {
      const kind = fileKindFromPath(request.filePath);
      return kind === 'pdf' && !!request.repoPath;
    },
    component: PdfDiffEntry,
  });

  registerDiffViewer({
    id: 'model-3d',
    name: '3D Model Diff Viewer',
    builtIn: true,
    priority: 30,
    canHandle: (request) => {
      const kind = fileKindFromPath(request.filePath);
      return kind === 'model3d' && !!request.repoPath;
    },
    component: Model3DDiffEntry,
  });

  registerDiffViewer({
    id: 'binary-fallback',
    name: 'Binary Diff Fallback',
    builtIn: true,
    priority: -50,
    canHandle: (request) => !!request.binary,
    component: BinaryFallbackEntry,
  });

  registerDiffViewer({
    id: 'text',
    name: 'Text Diff Viewer',
    builtIn: true,
    priority: -100,
    canHandle: () => true,
    component: TextDiffEntry,
  });

  builtInsRegistered = true;
}

ensureBuiltInDiffViewersRegistered();
