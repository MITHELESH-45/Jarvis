import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-white p-4">
          <h1 className="text-3xl font-bold mb-4 text-electricBlue">Oops, something went wrong.</h1>
          <p className="mb-4 text-slateGray text-center max-w-md">
            The application encountered an unexpected error. Please try refreshing the page.
          </p>
          <pre className="bg-slate-100 dark:bg-slate-800 text-red-500 p-4 rounded text-sm overflow-auto max-w-full">
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-electricBlue text-slate-900 font-semibold rounded hover:opacity-90 transition-opacity"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
