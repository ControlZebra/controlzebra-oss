/**
 * Git-related utility functions and configurations.
 * Centralized helpers to avoid duplication across components.
 */
import {
  Plus,
  Pencil,
  Trash2,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { FILE_STATUS, FILE_STATUS_COLORS, ICON_SIZES } from '../constants';

// ============================================================================
// Types
// ============================================================================

export interface IconStyle {
  width: number;
  height: number;
}

export interface StatusConfigItem {
  Icon: LucideIcon;
  className: string;
  label: string;
  shortLabel: string;
}

// ============================================================================
// Icon Style Objects
// Centralized icon styles to avoid recreating objects on each render.
// ============================================================================
export const ICON_STYLES: Record<string, IconStyle> = {
  xs: { width: ICON_SIZES.xs, height: ICON_SIZES.xs },
  sm: { width: ICON_SIZES.sm, height: ICON_SIZES.sm },
  md: { width: ICON_SIZES.md, height: ICON_SIZES.md },
  lg: { width: ICON_SIZES.lg, height: ICON_SIZES.lg },
  xl: { width: 32, height: 32 },
  xxl: { width: 48, height: 48 },
};

// ============================================================================
// File Status Configuration
// Maps file status types to their visual representation.
// ============================================================================
export const STATUS_CONFIG: Record<string, StatusConfigItem> = {
  [FILE_STATUS.ADDED]: { 
    Icon: Plus, 
    className: FILE_STATUS_COLORS[FILE_STATUS.ADDED], 
    label: 'Added',
    shortLabel: 'A',
  },
  [FILE_STATUS.MODIFIED]: { 
    Icon: Pencil, 
    className: FILE_STATUS_COLORS[FILE_STATUS.MODIFIED], 
    label: 'Modified',
    shortLabel: 'M',
  },
  [FILE_STATUS.DELETED]: { 
    Icon: Trash2, 
    className: FILE_STATUS_COLORS[FILE_STATUS.DELETED], 
    label: 'Deleted',
    shortLabel: 'D',
  },
  [FILE_STATUS.RENAMED]: { 
    Icon: Pencil, 
    className: FILE_STATUS_COLORS[FILE_STATUS.RENAMED], 
    label: 'Renamed',
    shortLabel: 'R',
  },
  [FILE_STATUS.UNTRACKED]: { 
    Icon: HelpCircle, 
    className: FILE_STATUS_COLORS[FILE_STATUS.UNTRACKED], 
    label: 'New',
    shortLabel: '?',
  },
};

// ============================================================================
// Branch Name Utilities
// ============================================================================

/**
 * Generate default branch name from user info.
 * Format: [username]/[YYYY-MMM-DD]/changes
 * 
 * @param userName - User's name or email
 * @returns Generated branch name
 */
export function generateDefaultBranchName(userName: string): string {
  // Extract username from email (remove domain) or use name
  let user = 'user';
  if (userName) {
    if (userName.includes('@')) {
      // It's an email, extract the part before @
      user = userName.split('@')[0];
    } else {
      // Use the name, replace spaces with dashes and lowercase
      user = userName.toLowerCase().replace(/\s+/g, '-');
    }
  }
  
  // Format date as YYYY-MMM-DD
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${now.getFullYear()}-${months[now.getMonth()]}-${String(now.getDate()).padStart(2, '0')}`;
  
  return `${user}/${dateStr}/changes`;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Shorten a file path macOS-style: .../parent/file.ext
 * 
 * @param fullPath - The full file path
 * @param maxLength - Maximum length of the result
 * @returns Shortened path
 */
export function shortenPath(fullPath: string, maxLength: number = 30): string {
  if (!fullPath || fullPath.length <= maxLength) return fullPath;
  
  const parts = fullPath.split('/').filter(Boolean);
  if (parts.length === 0) return fullPath;
  
  const fileName = parts[parts.length - 1];
  
  if (fileName.length >= maxLength - 4) {
    return `.../${fileName.slice(0, maxLength - 4)}`;
  }
  
  if (parts.length >= 2) {
    const parent = parts[parts.length - 2];
    const shortPath = `.../${parent}/${fileName}`;
    if (shortPath.length <= maxLength) {
      return shortPath;
    }
  }
  
  return `.../${fileName}`;
}

/**
 * Extract folder name from a path.
 * 
 * @param path - Full path
 * @returns Just the folder/file name
 */
export function getFolderNameFromPath(path: string): string {
  if (!path) return '';
  return path.split('/').pop() || path;
}
