import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
  showHomeButton?: boolean;
  compact?: boolean;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Explicit typed class extending React.Component compatible with React 19 without requiring separate @types/react packages
export class ErrorBoundary extends (React.Component as unknown as {
  new (props: ErrorBoundaryProps): {
    props: ErrorBoundaryProps;
    state: ErrorBoundaryState;
    setState(state: Partial<ErrorBoundaryState> | ((prev: ErrorBoundaryState) => Partial<ErrorBoundaryState>)): void;
  };
}) {
  props: ErrorBoundaryProps;
  state: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    // If it's a chunk loading error, reloading the page or cache-busting helps
    if (
      this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
      this.state.error?.message?.includes('Importing a module script failed') ||
      this.state.error?.message?.includes('Loading chunk')
    ) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const isChunkLoadError =
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('Importing a module script failed') ||
        this.state.error?.message?.includes('Loading chunk');

      const title =
        this.props.fallbackTitle ||
        (isChunkLoadError ? 'New Version Available' : 'Something went wrong');

      const message =
        this.props.fallbackMessage ||
        (isChunkLoadError
          ? 'A newer version of this page is available. Please reload to fetch the latest update.'
          : 'We encountered an unexpected error while loading this content. Please try again.');

      if (this.props.compact) {
        return (
          <div className="p-4 my-2 rounded-2xl bg-rose-50/80 border border-rose-200/90 text-slate-800 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-rose-600 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{title}</span>
            </div>
            <p className="text-[11px] text-slate-600 max-w-sm mx-auto">{message}</p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Try Again</span>
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-[340px] py-12 px-4 flex items-center justify-center">
          <div className="max-w-md w-full text-center space-y-4 p-6 sm:p-8 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-2xs">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="font-display font-bold text-lg text-slate-900">{title}</h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">{message}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isChunkLoadError ? 'Reload Page' : 'Try Again'}</span>
              </button>
              {(this.props.showHomeButton ?? true) && (
                <button
                  type="button"
                  onClick={this.handleGoHome}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5 text-slate-500" />
                  <span>Return to Home</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
