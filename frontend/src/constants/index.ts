/**
 * Shared constants for the ControlZebra frontend.
 * Centralizes configuration to ensure consistency across components.
 */

// ============================================================================
// Types
// ============================================================================

export interface SettingsCategory {
  id: string;
  name: string;
  description: string;
}

export interface IconSizes {
  xs: number;
  sm: number;
  md: number;
  lg: number;
}

// ============================================================================
// ICON SIZES
// Standard icon sizes in pixels for consistent UI scaling.
// Use these instead of hardcoded values.
// ============================================================================
export const ICON_SIZES: IconSizes = {
  xs: 14,  // Extra small - status indicators, inline icons
  sm: 16,  // Small - default for most icons
  md: 20,  // Medium - activity bar, prominent actions
  lg: 24,  // Large - profile avatars, main visual elements
} as const;

// ============================================================================
// VIEW TYPES
// Identifiers for sidebar views. Used by LayoutContext and navigation.
// ============================================================================
export const VIEWS = {
  EXPLORER: 'explorer',
  HISTORY: 'history',
  MERGE_CHANGES: 'merge-changes',
  REPO_SETTINGS: 'repo-settings',
  SETTINGS: 'settings',
  PROFILE: 'profile',
} as const;

export type ViewType = typeof VIEWS[keyof typeof VIEWS];

// ============================================================================
// BOTTOM PANEL TYPES
// Identifiers for bottom panel tabs.
// ============================================================================
export const BOTTOM_PANELS = {
  REPOSITORY: 'repository',
  TERMINAL: 'terminal',
} as const;

export type BottomPanelType = typeof BOTTOM_PANELS[keyof typeof BOTTOM_PANELS];

// ============================================================================
// FILE STATUS
// Git file status types mapped from GitService.
// Each status has an associated color class for visual distinction.
// ============================================================================
export const FILE_STATUS = {
  ADDED: 'added',
  MODIFIED: 'modified',
  DELETED: 'deleted',
  RENAMED: 'renamed',
  UNTRACKED: 'untracked',
} as const;

export type FileStatusType = typeof FILE_STATUS[keyof typeof FILE_STATUS];

// Tailwind color classes for each file status
export const FILE_STATUS_COLORS: Record<FileStatusType, string> = {
  [FILE_STATUS.ADDED]: 'text-green-400',
  [FILE_STATUS.MODIFIED]: 'text-yellow-400',
  [FILE_STATUS.DELETED]: 'text-red-400',
  [FILE_STATUS.RENAMED]: 'text-blue-400',
  [FILE_STATUS.UNTRACKED]: 'text-gray-400',
};

// ============================================================================
// SETTINGS CATEGORIES
// Configuration for the settings view sidebar.
// ============================================================================
export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'git-config', name: 'Git Configuration', description: 'Name and email for commits' },
  { id: 'lfs-groups', name: 'LFS Groups', description: 'Custom file extension groups' },
  { id: 'general', name: 'General', description: 'App preferences' },
];

// ============================================================================
// REPOSITORY SETTINGS CATEGORIES
// Configuration for the repository-level settings view sidebar.
// Organized from user's perspective.
// ============================================================================
export const REPO_SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'remote-sync', name: 'Remote Sync', description: 'How and when to sync with remote' },
  { id: 'large-files', name: 'Large Files (LFS)', description: 'Storage and download settings for large files' },
  { id: 'branch-protection', name: 'Branch Protection', description: 'Prevent accidental commits to important branches' },
  { id: 'performance', name: 'Performance', description: 'Optimization and maintenance tasks' },
  { id: 'troubleshooting', name: 'Troubleshooting', description: 'Diagnose and fix repository issues' },
];

// ============================================================================
// TEXT FILE EXTENSIONS
// File extensions that can be displayed in the built-in file viewer.
// Used by file browser to determine if a file should open in a tab or external app.
// ============================================================================
export const TEXT_FILE_EXTENSIONS: readonly string[] = [
  // Code files
  'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'html', 'xml',
  'json', 'yaml', 'yml', 'toml',
  'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp',
  // Shell scripts
  'sh', 'bash', 'zsh', 'fish',
  // Config files
  'gitignore', 'gitattributes', 'env', 'ini', 'conf', 'cfg',
  // Text/docs
  'txt', 'md', 'log', 'csv',
  // Other
  'sql', 'graphql', 'vue', 'svelte',
] as const;

/**
 * Check if a file can be displayed as text based on its name.
 * @param fileName - The file name to check
 * @returns boolean - true if the file is likely a text file
 */
export function isTextFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return TEXT_FILE_EXTENSIONS.includes(ext) ||
         fileName.startsWith('.') || // Dotfiles like .gitignore
         !ext; // Files without extension
}

// ============================================================================
// EXPLORER TABS
// Tab types for the explorer main area with file browser as pinned tab.
// ============================================================================
export interface ExplorerTab {
  id: string;
  title: string;
  type: 'file-browser' | 'file';
  filePath?: string;
  isPinned?: boolean;
}

export const FILE_BROWSER_TAB: ExplorerTab = {
  id: 'file-browser',
  title: 'Quick Actions',
  type: 'file-browser',
  isPinned: true,
};

// ============================================================================
// PROTECTED BRANCHES
// Default protected branch names. These branches trigger nudges/warnings.
// Can be overridden by repository settings.
// ============================================================================
export const DEFAULT_PROTECTED_BRANCHES: string[] = ['main', 'master', 'develop', 'production'];

// Main branches (subset of protected) where merge requests aren't suggested
export const MAIN_BRANCHES: string[] = ['main', 'master'];

/**
 * Check if a branch name is in the protected list.
 * @param branchName - The branch name to check
 * @param protectedList - Optional custom list of protected branches
 * @returns boolean
 */
export function isProtectedBranch(branchName: string, protectedList: string[] = DEFAULT_PROTECTED_BRANCHES): boolean {
  if (!branchName) return false;
  return protectedList.includes(branchName.toLowerCase());
}

// ============================================================================
// FILE EXTENSION COLORS
// Color classes for file icons based on extension.
// ============================================================================
export const EXTENSION_COLORS: Record<string, string> = {
  js: 'text-yellow-400',
  jsx: 'text-blue-400',
  ts: 'text-blue-500',
  tsx: 'text-blue-400',
  json: 'text-yellow-500',
  md: 'text-gray-300',
  go: 'text-cyan-400',
  py: 'text-green-400',
  html: 'text-orange-400',
  css: 'text-blue-300',
  scss: 'text-pink-400',
  yml: 'text-red-400',
  yaml: 'text-red-400',
  xml: 'text-orange-300',
  txt: 'text-gray-400',
};
