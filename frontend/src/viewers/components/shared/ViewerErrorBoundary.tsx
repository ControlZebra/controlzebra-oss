/**
 * ViewerErrorBoundary - Catches errors in viewer components.
 * 
 * This React error boundary prevents viewer crashes from breaking the entire app.
 * When a viewer throws an error:
 * - The error is caught and logged
 * - A friendly error message is shown to the user
 * - A "Try Again" button allows recovery
 * 
 * Usage:
 * <ViewerErrorBoundary filePath="/path/to/file.txt">
 *   <TextViewer filePath="/path/to/file.txt" />
 * </ViewerErrorBoundary>
 */
import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { getPathFileName } from './path-utils';

interface ViewerErrorBoundaryProps {
  /** The file path being viewed (for error display) */
  filePath: string;
  /** The viewer component to render */
  children: ReactNode;
  /** Optional callback when error occurs */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ViewerErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ViewerErrorBoundary extends Component<ViewerErrorBoundaryProps, ViewerErrorBoundaryState> {
  constructor(props: ViewerErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ViewerErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error details for debugging
    console.error('[ViewerErrorBoundary] Viewer crashed:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      filePath: this.props.filePath,
    });

    // Call optional error callback
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ViewerErrorBoundaryProps): void {
    // Reset error state when filePath changes (user opens different file)
    if (prevProps.filePath !== this.props.filePath && this.state.hasError) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const fileName = getPathFileName(this.props.filePath);
      
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <AlertTriangle 
            size={ICON_SIZES.lg * 2} 
            className="text-amber-400 mb-4" 
          />
          
          <h2 className="text-lg font-semibold text-theme-primary mb-2">
            Unable to display file
          </h2>
          
          <p className="text-sm text-theme-secondary mb-1 max-w-md">
            Something went wrong while trying to display{' '}
            <span className="font-mono text-theme-primary">{fileName}</span>
          </p>
          
          <p className="text-xs text-theme-muted mb-6 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          
          <button
            onClick={this.resetError}
            className="flex items-center gap-2 px-4 py-2 bg-theme-subtle hover:bg-theme-muted rounded-md text-sm text-theme-primary transition-colors"
          >
            <RotateCcw size={ICON_SIZES.sm} />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ViewerErrorBoundary;
