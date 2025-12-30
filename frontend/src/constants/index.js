// Shared constants for consistent styling
export const ICON_SIZES = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
};

// View types
export const VIEWS = {
  EXPLORER: 'explorer',
  CHANGES: 'changes',
  HISTORY: 'history',
  SETTINGS: 'settings',
  PROFILE: 'profile',
};

// Bottom panel types
export const BOTTOM_PANELS = {
  COMMIT: 'commit',
  TERMINAL: 'terminal',
};

// File status types (maps to GitService status values)
export const FILE_STATUS = {
  ADDED: 'added',
  MODIFIED: 'modified',
  DELETED: 'deleted',
  RENAMED: 'renamed',
  UNTRACKED: 'untracked',
};

// Settings categories for the settings view
export const SETTINGS_CATEGORIES = [
  { id: 'git-config', name: 'Git Configuration', description: 'Name and email for commits' },
  { id: 'general', name: 'General', description: 'App preferences' },
  { id: 'accounts', name: 'Accounts', description: 'GitHub & GitLab' },
];
