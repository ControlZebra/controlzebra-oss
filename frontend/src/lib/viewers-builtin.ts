/**
 * Built-in Viewer Registrations
 * 
 * This module registers all built-in viewers for the multi-viewer architecture.
 * Import this file early in the app bootstrap (e.g., main.tsx) to ensure
 * viewers are registered before any components try to use them.
 * 
 * Viewer priority:
 * - Higher priority = checked first
 * - Use 0 for standard viewers
 * - Use negative for fallback viewers
 * - Use positive for preferred/specialized viewers
 */
import { lazy } from 'react';
import { FileText, Image as ImageIcon, FileQuestion, Cpu, Box } from 'lucide-react';
import { registerViewer, extMatch, nameMatch, anyMatch, magicMatch, matchAll } from './viewers';
import { TEXT_VIEWER_EXTENSIONS } from './text-viewer-patterns';
import { IMAGE_EXTENSIONS, L5X_EXTENSIONS, MODEL_3D_EXTENSIONS, PDF_EXTENSIONS } from '../shared/constants/file-types';
import TextViewer from '../components/viewers/TextViewer';
import ImageViewer from '../components/viewers/ImageViewer';
import UnsupportedViewer from '../components/viewers/UnsupportedViewer';

// ============================================================================
// Text Viewer
// Handles code files, config files, and plain text
// ============================================================================

/** Common file names without extensions that are text files */
const TEXT_FILE_NAMES = [
  'makefile',
  'dockerfile',
  'containerfile',
  'vagrantfile',
  'gemfile',
  'rakefile',
  'procfile',
  'brewfile',
  'justfile',
  'taskfile',
  'readme',
  'license',
  'changelog',
  'authors',
  'contributing',
  'copying',
];

registerViewer({
  id: 'text',
  name: 'Text Viewer',
  description: 'Displays text and code files with line numbers',
  icon: FileText,
  priority: 0,
  builtIn: true,
  canHandle: anyMatch([
    extMatch([...TEXT_VIEWER_EXTENSIONS]),
    nameMatch({
      dotfiles: true,         // .gitignore, .env, etc.
      extensionless: true,    // Makefile, LICENSE, etc.
      names: TEXT_FILE_NAMES,
    }),
  ]),
  component: TextViewer,
});

// ============================================================================
// Image Viewer
// Handles common image formats
// ============================================================================

registerViewer({
  id: 'image',
  name: 'Image Viewer',
  description: 'Displays images with dimensions info',
  icon: ImageIcon,
  priority: 0,
  builtIn: true,
  canHandle: extMatch(IMAGE_EXTENSIONS),
  component: ImageViewer,
});

// ============================================================================
// L5X/Industrial File Viewer
// Handles Rockwell Automation L5X ladder logic files
// ============================================================================

registerViewer({
  id: 'l5x-ladder',
  name: 'Ladder Logic Viewer',
  description: 'Displays Rockwell Automation L5X ladder logic',
  icon: Cpu,
  priority: 10, // Higher priority than text for .l5x files
  builtIn: true,
  managesOwnHeader: true, // L5X viewer has its own header with navigator toggle
  canHandle: extMatch(L5X_EXTENSIONS),
  component: lazy(() => import('../components/viewers/L5XViewer')),
});

// ============================================================================
// 3D Model Viewer
// Handles 3D model files (STL, OBJ, STEP, GLTF, etc.)
// Lazy-loaded for code splitting (online-3d-viewer + three.js are large)
// ============================================================================

registerViewer({
  id: 'model-3d',
  name: '3D Model Viewer',
  description: 'Displays 3D models with orbit, pan, and zoom',
  icon: Box,
  priority: 10, // Higher than text viewer to claim .obj files as 3D models
  builtIn: true,
  canHandle: extMatch(MODEL_3D_EXTENSIONS),
  component: lazy(() => import('../components/viewers/Model3DViewer')),
});

// ============================================================================
// Unsupported Viewer (Fallback)
// Catches all files not handled by other viewers
// ============================================================================

registerViewer({
  id: 'unsupported',
  name: 'Unsupported File',
  description: 'Fallback for files without a specific viewer',
  icon: FileQuestion,
  priority: -1000, // Lowest priority - checked last
  builtIn: true,
  canHandle: matchAll(),
  component: UnsupportedViewer,
});

// ============================================================================
// PDF Viewer
// Lazy loaded for code splitting (react-pdf + pdfjs-dist are large)
// ============================================================================

registerViewer({
  id: 'pdf',
  name: 'PDF Viewer',
  description: 'Displays PDF documents with page navigation and zoom',
  icon: FileText,
  priority: 0,
  builtIn: true,
  canHandle: anyMatch([
    extMatch([...PDF_EXTENSIONS]),
    // Magic bytes: %PDF (25 50 44 46)
    magicMatch([[0x25, 0x50, 0x44, 0x46]]),
  ]),
  component: lazy(() => import('../components/viewers/PDFViewer')),
});

// Log that viewers have been registered (helpful for debugging)
if (import.meta.env.DEV) {
  console.log('[viewers-builtin] Built-in viewers registered');
}
