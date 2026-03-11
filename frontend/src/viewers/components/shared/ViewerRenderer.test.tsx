/**
 * Tests for ViewerErrorBoundary and ViewerRenderer components.
 * 
 * Run with: npx vitest run viewers.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewerRenderer, ViewerErrorBoundary } from './ViewerRenderer';
import { clearViewers, type ViewerConfig, type ViewerProps } from '../../registry/viewer-registry';

// ============================================================================
// Test Utilities
// ============================================================================

// Simple working viewer component
function WorkingViewer({ filePath }: ViewerProps) {
  return <div data-testid="working-viewer">Viewing: {filePath}</div>;
}

// Viewer that always throws
function CrashingViewer({ filePath }: ViewerProps): JSX.Element {
  throw new Error(`Viewer crashed for ${filePath}`);
}

// Create a test viewer config
function createTestViewer(overrides: Partial<ViewerConfig> = {}): ViewerConfig {
  return {
    id: 'test-viewer',
    name: 'Test Viewer',
    component: WorkingViewer,
    canHandle: () => true,
    builtIn: true,
    ...overrides,
  };
}

// ============================================================================
// ViewerErrorBoundary Tests
// ============================================================================

describe('ViewerErrorBoundary', () => {
  beforeEach(() => {
    // Suppress console.error for expected errors
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should render children when no error', () => {
    render(
      <ViewerErrorBoundary filePath="/test/file.txt">
        <div data-testid="child">Child content</div>
      </ViewerErrorBoundary>
    );
    
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('should catch errors and show error UI', () => {
    render(
      <ViewerErrorBoundary filePath="/test/file.txt">
        <CrashingViewer filePath="/test/file.txt" />
      </ViewerErrorBoundary>
    );
    
    // Should show error UI
    expect(screen.getByText('Unable to display file')).toBeInTheDocument();
    expect(screen.getByText('file.txt')).toBeInTheDocument();
    expect(screen.getByText(/Viewer crashed for/)).toBeInTheDocument();
  });

  it('should show retry button that resets error state', () => {
    render(
      <ViewerErrorBoundary filePath="/test/file.txt">
        <CrashingViewer filePath="/test/file.txt" />
      </ViewerErrorBoundary>
    );
    
    // Should show error with retry button
    expect(screen.getByText('Unable to display file')).toBeInTheDocument();
    const retryButton = screen.getByText('Try Again');
    expect(retryButton).toBeInTheDocument();
    
    // Click retry - will re-render and crash again since component still crashes
    fireEvent.click(retryButton);
    
    // After retry, error should still show because CrashingViewer always crashes
    expect(screen.getByText('Unable to display file')).toBeInTheDocument();
  });

  it('should call onError callback when error occurs', () => {
    const onError = vi.fn();
    
    render(
      <ViewerErrorBoundary filePath="/test/file.txt" onError={onError}>
        <CrashingViewer filePath="/test/file.txt" />
      </ViewerErrorBoundary>
    );
    
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
      })
    );
  });

  it('should reset error state when filePath changes', () => {
    const { rerender } = render(
      <ViewerErrorBoundary filePath="/test/crash.txt">
        <CrashingViewer filePath="/test/crash.txt" />
      </ViewerErrorBoundary>
    );
    
    // Error shown for first file
    expect(screen.getByText('Unable to display file')).toBeInTheDocument();
    
    // Change to a working viewer with different path
    rerender(
      <ViewerErrorBoundary filePath="/test/working.txt">
        <WorkingViewer filePath="/test/working.txt" />
      </ViewerErrorBoundary>
    );
    
    // Error should be cleared, working viewer should show
    expect(screen.queryByText('Unable to display file')).not.toBeInTheDocument();
    expect(screen.getByTestId('working-viewer')).toBeInTheDocument();
  });
});

// ============================================================================
// ViewerRenderer Tests
// ============================================================================

describe('ViewerRenderer', () => {
  beforeEach(() => {
    clearViewers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should render the viewer component', () => {
    const viewer = createTestViewer({ component: WorkingViewer });
    
    render(<ViewerRenderer viewer={viewer} filePath="/test/file.txt" />);
    
    expect(screen.getByTestId('working-viewer')).toBeInTheDocument();
    expect(screen.getByText('Viewing: /test/file.txt')).toBeInTheDocument();
  });

  it('should wrap viewer in error boundary', () => {
    const viewer = createTestViewer({ 
      id: 'crashing-viewer',
      component: CrashingViewer,
    });
    
    render(<ViewerRenderer viewer={viewer} filePath="/test/file.txt" />);
    
    // Error should be caught by boundary
    expect(screen.getByText('Unable to display file')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('should pass onError callback to error boundary', () => {
    const onError = vi.fn();
    const viewer = createTestViewer({ component: CrashingViewer });
    
    render(<ViewerRenderer viewer={viewer} filePath="/test/file.txt" onError={onError} />);
    
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('should pass contentPeek to viewer', () => {
    function ViewerWithPeek({ filePath: _filePath, contentPeek }: ViewerProps) {
      return (
        <div data-testid="peek-viewer">
          {contentPeek ? `Has ${contentPeek.length} bytes` : 'No peek'}
        </div>
      );
    }
    
    const viewer = createTestViewer({ component: ViewerWithPeek });
    const contentPeek = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"
    
    render(<ViewerRenderer viewer={viewer} filePath="/test/file.txt" contentPeek={contentPeek} />);
    
    expect(screen.getByText('Has 5 bytes')).toBeInTheDocument();
  });
});
