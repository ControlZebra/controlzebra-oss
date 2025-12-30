/**
 * Shared constants for the Rewind Logic frontend.
 * Centralizes configuration to ensure consistency across components.
 */

// ============================================================================
// ICON SIZES
// Standard icon sizes in pixels for consistent UI scaling.
// Use these instead of hardcoded values.
// ============================================================================
export const ICON_SIZES = {
  xs: 14,  // Extra small - status indicators, inline icons
  sm: 16,  // Small - default for most icons
  md: 20,  // Medium - activity bar, prominent actions
  lg: 24,  // Large - profile avatars, main visual elements
};

// ============================================================================
// VIEW TYPES
// Identifiers for sidebar views. Used by LayoutContext and navigation.
// ============================================================================
export const VIEWS = {
  EXPLORER: 'explorer',
  CHANGES: 'changes',
  HISTORY: 'history',
  SETTINGS: 'settings',
  PROFILE: 'profile',
};

// ============================================================================
// BOTTOM PANEL TYPES
// Identifiers for bottom panel tabs.
// ============================================================================
export const BOTTOM_PANELS = {
  COMMIT: 'commit',
  TERMINAL: 'terminal',
};

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
};

// Tailwind color classes for each file status
export const FILE_STATUS_COLORS = {
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
export const SETTINGS_CATEGORIES = [
  { id: 'git-config', name: 'Git Configuration', description: 'Name and email for commits' },
  { id: 'general', name: 'General', description: 'App preferences' },
  { id: 'accounts', name: 'Accounts', description: 'GitHub & GitLab' },
];

// ============================================================================
// FILE EXTENSION COLORS
// Color classes for file icons based on extension.
// ============================================================================
export const EXTENSION_COLORS = {
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
