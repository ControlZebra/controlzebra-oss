/**
 * Tests for the viewer registry system.
 * 
 * Run with: npx vitest run viewers.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerViewer,
  getViewerForFile,
  getViewerById,
  getAllViewers,
  clearViewers,
  extMatch,
  nameMatch,
  magicMatch,
  anyMatch,
  matchAll,
  type ViewerConfig,
  type ViewerProps,
} from './viewer-registry';

// Mock viewer component for testing
const MockComponent = ({ filePath: _filePath }: ViewerProps) => null;

describe('Viewer Registry', () => {
  beforeEach(() => {
    // Clear registry before each test
    clearViewers();
  });

  describe('registerViewer', () => {
    it('should register a viewer', () => {
      const viewer: ViewerConfig = {
        id: 'test',
        name: 'Test Viewer',
        component: MockComponent,
        canHandle: () => true,
      };
      
      registerViewer(viewer);
      
      expect(getAllViewers()).toHaveLength(1);
      expect(getAllViewers()[0].id).toBe('test');
    });

    it('should throw on duplicate ID', () => {
      const viewer: ViewerConfig = {
        id: 'test',
        name: 'Test Viewer',
        component: MockComponent,
        canHandle: () => true,
      };
      
      registerViewer(viewer);
      expect(() => registerViewer(viewer)).toThrow('already registered');
    });

    it('should sort viewers by priority (highest first)', () => {
      registerViewer({
        id: 'low',
        name: 'Low Priority',
        component: MockComponent,
        canHandle: () => true,
        priority: -10,
      });
      
      registerViewer({
        id: 'high',
        name: 'High Priority',
        component: MockComponent,
        canHandle: () => true,
        priority: 10,
      });
      
      registerViewer({
        id: 'medium',
        name: 'Medium Priority',
        component: MockComponent,
        canHandle: () => true,
        priority: 0,
      });
      
      const viewers = getAllViewers();
      expect(viewers[0].id).toBe('high');
      expect(viewers[1].id).toBe('medium');
      expect(viewers[2].id).toBe('low');
    });

    it('should apply default values', () => {
      registerViewer({
        id: 'test',
        name: 'Test',
        component: MockComponent,
        canHandle: () => true,
      });
      
      const viewer = getViewerById('test');
      expect(viewer?.priority).toBe(0);
      expect(viewer?.builtIn).toBe(false);
    });
  });

  describe('getViewerForFile', () => {
    it('should return first matching viewer', () => {
      registerViewer({
        id: 'text',
        name: 'Text',
        component: MockComponent,
        canHandle: extMatch(['txt', 'md']),
      });
      
      const viewer = getViewerForFile('readme.md');
      expect(viewer?.id).toBe('text');
    });

    it('should return undefined if no match', () => {
      registerViewer({
        id: 'text',
        name: 'Text',
        component: MockComponent,
        canHandle: extMatch(['txt']),
      });
      
      const viewer = getViewerForFile('image.png');
      expect(viewer).toBeUndefined();
    });

    it('should respect priority order', () => {
      registerViewer({
        id: 'fallback',
        name: 'Fallback',
        component: MockComponent,
        canHandle: matchAll(),
        priority: -1000,
      });
      
      registerViewer({
        id: 'text',
        name: 'Text',
        component: MockComponent,
        canHandle: extMatch(['txt']),
        priority: 0,
      });
      
      // Text viewer should match first for .txt files
      expect(getViewerForFile('file.txt')?.id).toBe('text');
      
      // Fallback should match for unknown files
      expect(getViewerForFile('file.xyz')?.id).toBe('fallback');
    });
  });

  describe('getViewerById', () => {
    it('should find viewer by ID', () => {
      registerViewer({
        id: 'test',
        name: 'Test',
        component: MockComponent,
        canHandle: () => true,
      });
      
      expect(getViewerById('test')?.name).toBe('Test');
    });

    it('should return undefined for unknown ID', () => {
      expect(getViewerById('unknown')).toBeUndefined();
    });
  });
});

describe('Helper Functions', () => {
  describe('extMatch', () => {
    const matcher = extMatch(['js', 'ts', 'tsx']);
    
    it('should match file extensions', () => {
      expect(matcher('app.js')).toBe(true);
      expect(matcher('utils.ts')).toBe(true);
      expect(matcher('Component.tsx')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(matcher('App.JS')).toBe(true);
      expect(matcher('FILE.TS')).toBe(true);
    });

    it('should not match wrong extensions', () => {
      expect(matcher('image.png')).toBe(false);
      expect(matcher('data.json')).toBe(false);
    });

    it('should not match files without extension', () => {
      expect(matcher('Makefile')).toBe(false);
    });
  });

  describe('nameMatch', () => {
    it('should match exact names', () => {
      const matcher = nameMatch({ names: ['Makefile', 'Dockerfile'] });
      
      expect(matcher('Makefile')).toBe(true);
      expect(matcher('dockerfile')).toBe(true); // case insensitive
      expect(matcher('Rakefile')).toBe(false);
    });

    it('should match dotfiles', () => {
      const matcher = nameMatch({ dotfiles: true });
      
      // Dotfiles should match (they're config files that should be viewable as text)
      expect(matcher('.gitignore')).toBe(true);
      expect(matcher('.env')).toBe(true);
      expect(matcher('.bashrc')).toBe(true);
      
      // Regular files with extensions should not match via dotfiles option alone
      expect(matcher('readme.md')).toBe(false);
    });

    it('should match extensionless files', () => {
      const matcher = nameMatch({ extensionless: true });
      
      expect(matcher('Makefile')).toBe(true);
      expect(matcher('LICENSE')).toBe(true);
      expect(matcher('README.md')).toBe(false);
    });
  });

  describe('magicMatch', () => {
    it('should match magic bytes', () => {
      const pdfMagic = [0x25, 0x50, 0x44, 0x46]; // %PDF
      const matcher = magicMatch([pdfMagic]);
      
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]);
      expect(matcher('file.pdf', pdfBytes)).toBe(true);
      
      const textBytes = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // Hello
      expect(matcher('file.pdf', textBytes)).toBe(false);
    });

    it('should return false without content peek', () => {
      const matcher = magicMatch([[0x25, 0x50, 0x44, 0x46]]);
      expect(matcher('file.pdf')).toBe(false);
      expect(matcher('file.pdf', undefined)).toBe(false);
    });

    it('should handle multiple magic sequences', () => {
      const pngMagic = [0x89, 0x50, 0x4E, 0x47];
      const gifMagic = [0x47, 0x49, 0x46, 0x38];
      const matcher = magicMatch([pngMagic, gifMagic]);
      
      expect(matcher('img.png', new Uint8Array([0x89, 0x50, 0x4E, 0x47]))).toBe(true);
      expect(matcher('img.gif', new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe(true);
    });
  });

  describe('anyMatch', () => {
    it('should combine matchers with OR logic', () => {
      const matcher = anyMatch([
        extMatch(['pdf']),
        magicMatch([[0x25, 0x50, 0x44, 0x46]]),
      ]);
      
      // Match by extension
      expect(matcher('document.pdf')).toBe(true);
      
      // Match by magic bytes
      expect(matcher('unknown', new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(true);
      
      // No match
      expect(matcher('image.png')).toBe(false);
    });
  });

  describe('matchAll', () => {
    it('should always return true', () => {
      const matcher = matchAll();
      
      expect(matcher('anything.xyz')).toBe(true);
      expect(matcher('')).toBe(true);
      expect(matcher('no-extension')).toBe(true);
    });
  });
});
