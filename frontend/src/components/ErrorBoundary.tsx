import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <AlertTriangle className="w-10 h-10 text-status-critical mb-3" />
            <h3 className="text-sm font-bold text-foreground mb-1">Something went wrong</h3>
            <p className="text-xs text-muted-foreground mb-4 max-w-md">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Try Again
            </Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-xs text-muted-foreground font-mono">{message}</p>
    </div>
  );
}

export function EmptyState({
  icon: Icon = AlertTriangle,
  message = 'No data available',
  description,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  message?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <Icon className="w-10 h-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}

export function BackendUnavailable({ retry }: { retry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <AlertTriangle className="w-10 h-10 text-status-warning mb-3" />
      <h3 className="text-sm font-bold text-foreground mb-1">Backend Unavailable</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Cannot connect to the server. Please ensure the backend is running.
      </p>
      {retry && (
        <Button size="sm" variant="outline" onClick={retry}>
          <RefreshCw className="w-3 h-3 mr-1" /> Retry
        </Button>
      )}
    </div>
  );
}
