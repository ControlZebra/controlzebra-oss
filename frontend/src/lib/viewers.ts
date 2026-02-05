/**
 * Viewer Registry - Core module for the multi-viewer architecture.
 * 
 * This module provides:
 * - Type definitions for viewers (ViewerProps, ViewerConfig)
 * - Registry functions to register and query viewers
 * - Helper functions for file extension and content matching
 * 
 * Viewers are matched by priority (highest first). The first viewer
 * whose `canHandle()` returns true will be used for a file.
 */
import type { ComponentType, LazyExoticComponent, ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

/**
 * Props passed to all viewer components.
 * All viewers receive at minimum the file path to display.
 */
export interface ViewerProps {
  /** Absolute path to the file being viewed */
  filePath: string;
  /** Optional content peek (first N bytes) for magic byte detection */
  contentPeek?: Uint8Array;
}

/**
 * Configuration for a viewer plugin.
 * Each viewer must have a unique ID and implement canHandle().
 */
export interface ViewerConfig {
  /** Unique identifier for this viewer (e.g., 'text', 'image', 'pdf') */
  id: string;
  
  /** Human-readable name for UI display */
  name: string;
  
  /** Optional description for settings/help UI */
  description?: string;
  
  /** Optional icon for tab bar and UI elements */
  icon?: LucideIcon;
  
  /**
   * The React component that renders this viewer.
   * Can be a regular component or a lazy-loaded component for code splitting.
   */
  component: ComponentType<ViewerProps> | LazyExoticComponent<ComponentType<ViewerProps>>;
  
  /**
   * Determines if this viewer can handle a given file.
   * 
   * @param fileName - The name of the file (used for extension matching)
   * @param contentPeek - Optional first N bytes for magic number detection
   * @returns true if this viewer should be used for the file
   */
  canHandle: (fileName: string, contentPeek?: Uint8Array) => boolean;
  
  /**
   * Priority for viewer selection. Higher values are checked first.
   * Use 0 for default viewers, positive for preferred viewers,
   * and negative for fallback viewers.
   * 
   * @default 0
   */
  priority?: number;
  
  /**
   * Whether this is a built-in viewer (vs external extension).
   * Built-in viewers cannot be uninstalled.
   * 
   * @default false
   */
  builtIn?: boolean;
}

// ============================================================================
// Registry
// ============================================================================

/** Internal viewer registry, sorted by priority (highest first) */
let viewers: ViewerConfig[] = [];

/**
 * Register a new viewer in the registry.
 * Viewers are automatically sorted by priority after registration.
 * 
 * @param config - The viewer configuration to register
 * @throws Error if a viewer with the same ID is already registered
 */
export function registerViewer(config: ViewerConfig): void {
  // Check for duplicate IDs
  if (viewers.some(v => v.id === config.id)) {
    throw new Error(`Viewer with id "${config.id}" is already registered`);
  }
  
  // Add default priority if not specified
  const viewerWithDefaults: ViewerConfig = {
    priority: 0,
    builtIn: false,
    ...config,
  };
  
  // Add to registry
  viewers.push(viewerWithDefaults);
  
  // Sort by priority (highest first)
  viewers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * Unregister a viewer by ID.
 * Cannot unregister built-in viewers.
 * 
 * @param id - The viewer ID to unregister
 * @returns true if viewer was removed, false if not found or built-in
 */
export function unregisterViewer(id: string): boolean {
  const index = viewers.findIndex(v => v.id === id);
  if (index === -1) return false;
  
  if (viewers[index].builtIn) {
    console.warn(`Cannot unregister built-in viewer: ${id}`);
    return false;
  }
  
  viewers.splice(index, 1);
  return true;
}

/**
 * Find the first viewer that can handle a file.
 * Viewers are checked in priority order (highest first).
 * 
 * @param fileName - The file name to match
 * @param contentPeek - Optional content bytes for magic number detection
 * @returns The matching ViewerConfig or undefined if no match
 */
export function getViewerForFile(fileName: string, contentPeek?: Uint8Array): ViewerConfig | undefined {
  return viewers.find(viewer => viewer.canHandle(fileName, contentPeek));
}

/**
 * Get a viewer by its ID.
 * 
 * @param id - The viewer ID to find
 * @returns The ViewerConfig or undefined if not found
 */
export function getViewerById(id: string): ViewerConfig | undefined {
  return viewers.find(v => v.id === id);
}

/**
 * Get all registered viewers as a readonly array.
 * Useful for settings UI or debug displays.
 * 
 * @returns Readonly copy of all registered viewers
 */
export function getAllViewers(): readonly ViewerConfig[] {
  return [...viewers];
}

/**
 * Clear all viewers from the registry.
 * Primarily used for testing.
 */
export function clearViewers(): void {
  viewers = [];
}

// ============================================================================
// Helper Functions for canHandle() implementations
// ============================================================================

/**
 * Create a canHandle function that matches file extensions.
 * 
 * @param extensions - Array of extensions to match (without dots)
 * @returns A canHandle function for use in ViewerConfig
 * 
 * @example
 * canHandle: extMatch(['js', 'jsx', 'ts', 'tsx'])
 */
export function extMatch(extensions: string[]): (fileName: string) => boolean {
  const extSet = new Set(extensions.map(e => e.toLowerCase()));
  
  return (fileName: string): boolean => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ext ? extSet.has(ext) : false;
  };
}

/**
 * Create a canHandle function that matches files by name patterns.
 * Supports exact names, dotfiles (files starting with .), and extension-less files.
 * 
 * @param options - Matching options
 * @returns A canHandle function for use in ViewerConfig
 * 
 * @example
 * canHandle: nameMatch({ dotfiles: true, extensionless: true, names: ['Makefile', 'Dockerfile'] })
 */
export function nameMatch(options: {
  /** Match files that start with a dot */
  dotfiles?: boolean;
  /** Match files without an extension */
  extensionless?: boolean;
  /** Exact file names to match (case-insensitive) */
  names?: string[];
}): (fileName: string) => boolean {
  const namesSet = new Set((options.names ?? []).map(n => n.toLowerCase()));
  
  return (fileName: string): boolean => {
    const lower = fileName.toLowerCase();
    
    // Check exact name matches
    if (namesSet.has(lower)) return true;
    
    // Check dotfiles (but not hidden extensions like .gitignore)
    if (options.dotfiles && fileName.startsWith('.') && !fileName.includes('.', 1)) {
      return true;
    }
    
    // Check extensionless files
    if (options.extensionless && !fileName.includes('.')) {
      return true;
    }
    
    return false;
  };
}

/**
 * Create a canHandle function that checks for magic bytes at the start of file content.
 * 
 * @param magicBytes - Array of magic byte sequences to check
 * @returns A canHandle function for use in ViewerConfig
 * 
 * @example
 * // Match PDF files by magic bytes
 * canHandle: magicMatch([[0x25, 0x50, 0x44, 0x46]]) // %PDF
 */
export function magicMatch(magicBytes: number[][]): (fileName: string, contentPeek?: Uint8Array) => boolean {
  return (_fileName: string, contentPeek?: Uint8Array): boolean => {
    if (!contentPeek || contentPeek.length === 0) return false;
    
    return magicBytes.some(magic => {
      if (contentPeek.length < magic.length) return false;
      return magic.every((byte, i) => contentPeek[i] === byte);
    });
  };
}

/**
 * Combine multiple canHandle functions with OR logic.
 * Returns true if ANY of the functions return true.
 * 
 * @param handlers - Array of canHandle functions to combine
 * @returns A combined canHandle function
 * 
 * @example
 * canHandle: anyMatch([
 *   extMatch(['pdf']),
 *   magicMatch([[0x25, 0x50, 0x44, 0x46]])
 * ])
 */
export function anyMatch(
  handlers: Array<(fileName: string, contentPeek?: Uint8Array) => boolean>
): (fileName: string, contentPeek?: Uint8Array) => boolean {
  return (fileName: string, contentPeek?: Uint8Array): boolean => {
    return handlers.some(handler => handler(fileName, contentPeek));
  };
}

/**
 * A canHandle function that always returns true.
 * Use for fallback/unsupported viewers with lowest priority.
 */
export function matchAll(): (fileName: string) => boolean {
  return () => true;
}
