import { lazy } from 'react';

import { fileKindFromPath } from '../../shared/constants/file-types';
import { isImageFile } from '../../shared/constants/file-utils';
import TextDiffViewer from '../components/diff/TextDiffViewer';
import { registerDiffViewer, type DiffRenderRequest } from './diff-registry';

const L5XDiffViewer = lazy(() => import('../components/diff/l5x-layout-diff/L5XLayoutDiffViewer'));
const ImageDiffViewer = lazy(() => import('../components/diff/ImageDiffViewer'));
const PDFDiffViewer = lazy(() => import('../components/diff/PDFDiffViewer'));
const Model3DDiffViewer = lazy(() => import('../components/diff/Model3DDiffViewer'));

function TextDiffEntry(request: DiffRenderRequest): JSX.Element {
  return (
    <TextDiffViewer
      repoPath={request.repoPath ?? ''}
      filePath={request.filePath}
      oldSide={request.oldSide}
      newSide={request.newSide}
      fileStatus={request.fileStatus}
      oldPath={request.oldPath}
      fileDiff={request.fileDiff as any}
      showHeader={request.showHeader}
    />
  );
}

function L5XDiffEntry(request: DiffRenderRequest): JSX.Element {
  if (!request.oldSide || !request.newSide) {
    return <TextDiffEntry {...request} />;
  }

  return (
    <L5XDiffViewer
      repoPath={request.repoPath ?? ''}
      filePath={request.filePath}
      oldSide={request.oldSide}
      newSide={request.newSide}
      fileStatus={request.fileStatus ?? 'modified'}
    />
  );
}

function ImageDiffEntry(request: DiffRenderRequest): JSX.Element {
  if (!request.oldSide || !request.newSide) {
    return <BinaryFallbackEntry />;
  }

  return (
    <ImageDiffViewer
      repoPath={request.repoPath ?? ''}
      filePath={request.filePath}
      oldSide={request.oldSide}
      newSide={request.newSide}
    />
  );
}

function PdfDiffEntry(request: DiffRenderRequest): JSX.Element {
  if (!request.oldSide || !request.newSide) {
    return <BinaryFallbackEntry />;
  }

  return (
    <PDFDiffViewer
      repoPath={request.repoPath ?? ''}
      filePath={request.filePath}
      oldSide={request.oldSide}
      newSide={request.newSide}
    />
  );
}

function Model3DDiffEntry(request: DiffRenderRequest): JSX.Element {
  if (!request.oldSide || !request.newSide) {
    return <BinaryFallbackEntry />;
  }

  return (
    <Model3DDiffViewer
      repoPath={request.repoPath ?? ''}
      filePath={request.filePath}
      oldSide={request.oldSide}
      newSide={request.newSide}
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
    id: 'l5x',
    name: 'L5X Diff Viewer',
    builtIn: true,
    priority: 60,
    canHandle: (request) => {
      const kind = fileKindFromPath(request.filePath);
      return kind === 'l5x' && !!request.repoPath;
    },
    component: L5XDiffEntry,
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
