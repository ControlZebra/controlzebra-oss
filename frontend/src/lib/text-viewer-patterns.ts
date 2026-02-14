/**
 * Shared text-viewer matching patterns.
 *
 * Keep these in one place so viewer registration and other logic (like LFS
 * auto-track filtering) stay consistent.
 */

/** Extensions handled by the text viewer (lowercase, without dots). */
export const TEXT_VIEWER_EXTENSIONS = [
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
  // Industrial automation exports (text fallback/editing support)
  'l5x', 'l5k',
  // Make/Build
  'makefile', 'cmake', 'gradle',
] as const;

const TEXT_VIEWER_EXTENSION_SET = new Set<string>(TEXT_VIEWER_EXTENSIONS);

/** Returns true if extension is supported by the text viewer. */
export function isTextViewerExtension(extension: string): boolean {
  return TEXT_VIEWER_EXTENSION_SET.has(extension.toLowerCase());
}
