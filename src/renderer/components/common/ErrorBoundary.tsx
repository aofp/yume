import React, { Component, ErrorInfo, ReactNode } from 'react';
import { appStorageKey } from '../../config/app';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string; // Name of the boundary for debugging
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorCount: 0
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { name = 'Unknown' } = this.props;
    
    // Log error details for debugging
    console.error(`[ErrorBoundary: ${name}] Component stack:`, errorInfo.componentStack);
    console.error(`[ErrorBoundary: ${name}] Error:`, error);
    
    // Update state with error details
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // Report to monitoring service
    this.reportError(error, errorInfo);
  }

  reportError(error: Error, errorInfo: ErrorInfo) {
    // Prepare error report
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      boundary: this.props.name || 'Unknown',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    // Store in localStorage for debugging
    try {
      const errorsKey = appStorageKey('errors');
      const errors = JSON.parse(localStorage.getItem(errorsKey) || '[]');
      errors.push(errorReport);
      // Keep only last 10 errors
      if (errors.length > 10) {
        errors.shift();
      }
      localStorage.setItem(errorsKey, JSON.stringify(errors));
    } catch (e) {
      console.error('Failed to store error report:', e);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    });
  };

  handleCopyError = async () => {
    const errorDetails = [
      `Error: ${this.state.error?.message || 'Unknown error'}`,
      `Boundary: ${this.props.name || 'Unknown'}`,
      `Timestamp: ${new Date().toISOString()}`,
      '',
      'Stack Trace:',
      this.state.error?.stack || 'No stack trace',
      '',
      'Component Stack:',
      this.state.errorInfo?.componentStack || 'No component stack'
    ].join('\n');

    try {
      await navigator.clipboard.writeText(errorDetails);
      // Brief visual feedback could be added here
    } catch (e) {
      console.error('Failed to copy error details:', e);
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      // Default error UI
      return (
        <div className="error-boundary-container">
          <div className="error-boundary-content">
            <div className="error-icon">⚠️</div>
            <h2>Something went wrong</h2>
            <p className="error-message">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            
            {/* Show component name if provided */}
            {this.props.name && (
              <p className="error-location">
                Error in: <code>{this.props.name}</code>
              </p>
            )}
            
            {/* Show error count if multiple errors */}
            {this.state.errorCount > 1 && (
              <p className="error-count">
                This error has occurred {this.state.errorCount} times
              </p>
            )}
            
            {/* Action buttons */}
            <div className="error-actions">
              <button
                className="error-btn-primary"
                onClick={this.handleReset}
              >
                Try Again
              </button>
              <button
                className="error-btn-secondary"
                onClick={() => window.location.reload()}
              >
                Reload App
              </button>
              <button
                className="error-btn-copy"
                onClick={this.handleCopyError}
              >
                Copy Error Details
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Functional component wrapper for easier use with hooks
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  boundaryName?: string,
  fallback?: ReactNode
) => {
  return React.forwardRef<any, P>((props, ref) => (
    <ErrorBoundary name={boundaryName} fallback={fallback}>
      <Component {...(props as any)} ref={ref} />
    </ErrorBoundary>
  ));
};

export default ErrorBoundary;
