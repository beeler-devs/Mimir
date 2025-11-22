'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/common';

interface Props {
  children: ReactNode;
  componentType?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary for individual Focus View components
 *
 * Isolates errors to prevent entire workspace crashes.
 * Provides user-friendly error UI with recovery options.
 */
export class ComponentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      error,
      errorInfo,
    });

    // Log to console for debugging
    console.error('Component Error Boundary caught error:', error, errorInfo);

    // TODO: Send to error tracking service (e.g., Sentry)
    // if (process.env.NODE_ENV === 'production') {
    //   Sentry.captureException(error, { extra: errorInfo });
    // }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center p-8 bg-destructive/5">
          <div className="max-w-md text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">
                {this.props.componentType
                  ? `${this.props.componentType} Error`
                  : 'Component Error'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                This component encountered an error and couldn't be displayed.
              </p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="text-left bg-muted/50 p-3 rounded-lg mb-4">
                  <summary className="text-xs font-mono cursor-pointer hover:text-foreground">
                    Error Details
                  </summary>
                  <div className="mt-2 text-xs font-mono text-destructive">
                    <p className="font-semibold">{this.state.error.name}:</p>
                    <p className="whitespace-pre-wrap break-words">
                      {this.state.error.message}
                    </p>
                    {this.state.errorInfo && (
                      <pre className="mt-2 text-xs overflow-auto max-h-40">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                </details>
              )}
            </div>

            <div className="flex gap-2 justify-center">
              <Button
                onClick={this.handleReset}
                variant="default"
                size="sm"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
              >
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
