// Shared constants for consistent styling
export const ICON_SIZES = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
};

// View types
export const VIEWS = {
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

// File status types
export const FILE_STATUS = {
  ADDED: 'added',
  MODIFIED: 'modified',
  DELETED: 'deleted',
};

// Mock data - should be moved to a data layer in production
export const MOCK_CHANGED_FILES = [
  { id: '1', name: 'config.yaml', status: FILE_STATUS.MODIFIED, path: 'src/' },
  { id: '2', name: 'plc_settings.json', status: FILE_STATUS.ADDED, path: 'configs/' },
  { id: '3', name: 'old_module.ts', status: FILE_STATUS.DELETED, path: 'src/modules/' },
];

export const MOCK_COMMITS = [
  { id: '1', message: 'Update PLC configuration', hash: 'a1b2c3d', time: '2 hours ago' },
  { id: '2', message: 'Add new HMI screen layout', hash: 'e4f5g6h', time: '5 hours ago' },
  { id: '3', message: 'Fix actuator timing settings', hash: 'i7j8k9l', time: 'Yesterday' },
  { id: '4', message: 'Initial setup', hash: 'm0n1o2p', time: '2 days ago' },
];

export const SETTINGS_CATEGORIES = [
  { id: '1', name: 'General', description: 'App preferences' },
  { id: '2', name: 'Git Configuration', description: 'Name, email, credentials' },
  { id: '3', name: 'Accounts', description: 'GitHub & GitLab' },
  { id: '4', name: 'Custom Commands', description: 'YAML configuration' },
];
