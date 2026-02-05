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
import { FileText, Image as ImageIcon, FileQuestion } from 'lucide-react';
import { registerViewer, extMatch, nameMatch, anyMatch, matchAll } from './viewers';
import TextViewer from '../components/viewers/TextViewer';
import ImageViewer from '../components/viewers/ImageViewer';
import UnsupportedViewer from '../components/viewers/UnsupportedViewer';

// ============================================================================
// Text Viewer
// Handles code files, config files, and plain text
// ============================================================================

/** Extensions handled by the text viewer */
const TEXT_EXTENSIONS = [
  // JavaScript/TypeScript
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  // Web
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  // Data/Config
  'json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'conf', 'cfg',
  // Languages
  'go', 'py', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs',
  'rb', 'php', 'swift', 'kt', 'scala',
  // Shell
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  // Git/Config
  'gitignore', 'gitattributes', 'env', 'editorconfig', 'prettierrc',
  // Text/Docs
  'txt', 'md', 'markdown', 'rst', 'log', 'csv',
  // Other
  'sql', 'graphql', 'gql', 'vue', 'svelte', 'astro',
  // Make/Build
  'makefile', 'cmake', 'gradle',
];

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
    extMatch(TEXT_EXTENSIONS),
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

/** Extensions handled by the image viewer */
const IMAGE_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg',
  'tiff', 'tif', 'avif',
];

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
// Future Viewers (Commented placeholders)
// ============================================================================

/*
// PDF Viewer - Lazy loaded for code splitting
import { lazy } from 'react';
import { FileType } from 'lucide-react';

registerViewer({
  id: 'pdf',
  name: 'PDF Viewer',
  description: 'Displays PDF documents',
  icon: FileType,
  priority: 0,
  builtIn: true,
  canHandle: anyMatch([
    extMatch(['pdf']),
    // Magic bytes: %PDF (25 50 44 46)
    magicMatch([[0x25, 0x50, 0x44, 0x46]]),
  ]),
  component: lazy(() => import('../components/viewers/PDFViewer')),
});
*/

/*
// Industrial File Viewers - L5X, ACD, etc.
// These would be registered by the ladder-visualizer integration
registerViewer({
  id: 'l5x-ladder',
  name: 'Ladder Logic Viewer',
  description: 'Displays Rockwell Automation L5X ladder logic',
  icon: Cpu,
  priority: 10, // Higher priority than text for .l5x files
  builtIn: true,
  canHandle: extMatch(['l5x']),
  component: lazy(() => import('../components/viewers/L5XViewer')),
});
*/

// Log that viewers have been registered (helpful for debugging)
if (import.meta.env.DEV) {
  console.log('[viewers-builtin] Built-in viewers registered');
}
