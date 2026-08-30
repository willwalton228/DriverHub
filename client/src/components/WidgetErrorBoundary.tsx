import { Component, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface WidgetErrorBoundaryProps {
  children: ReactNode;
  widgetName: string;
  onError?: (error: Error, widgetName: string) => void;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class WidgetErrorBoundary extends Component<WidgetErrorBoundaryProps, WidgetErrorBoundaryState> {
  constructor(props: WidgetErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): WidgetErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    if (this.props.onError) {
      this.props.onError(error, this.props.widgetName);
    }
    console.error(`Widget "${this.props.widgetName}" crashed:`, error);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-destructive/50 bg-destructive/5" data-testid={`widget-error-${this.props.widgetName.toLowerCase().replace(/\s+/g, '-')}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">
                  {this.props.widgetName} failed to load
                </p>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {this.state.error?.message || "An unexpected error occurred"}
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3"
                  onClick={this.handleRetry}
                  data-testid={`button-retry-${this.props.widgetName.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <RefreshCw className="h-3 w-3 mr-1.5" />
                  Retry
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

interface DashboardHealthBannerProps {
  failedWidgets: string[];
  onDismiss?: () => void;
}

export function DashboardHealthBanner({ failedWidgets, onDismiss }: DashboardHealthBannerProps) {
  if (failedWidgets.length === 0) return null;

  return (
    <div 
      className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between gap-3"
      data-testid="dashboard-health-banner"
    >
      <div className="flex items-center gap-3 min-w-0">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Dashboard partially loaded
          </p>
          <p className="text-xs text-amber-600/80 dark:text-amber-500/80 truncate">
            {failedWidgets.length === 1 
              ? `"${failedWidgets[0]}" widget failed to load`
              : `${failedWidgets.length} widgets failed: ${failedWidgets.join(", ")}`
            }
          </p>
        </div>
      </div>
      {onDismiss && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onDismiss}
          className="shrink-0 text-amber-700 hover:text-amber-800 dark:text-amber-400"
          data-testid="button-dismiss-health-banner"
        >
          Dismiss
        </Button>
      )}
    </div>
  );
}
