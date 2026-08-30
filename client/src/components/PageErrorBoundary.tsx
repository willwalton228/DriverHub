import { Component, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface PageErrorBoundaryProps {
  children: ReactNode;
  backTo?: string;
  backLabel?: string;
  pageLabel?: string;
}

interface PageErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Errors thrown when a lazy-loaded route's JS chunk can't be fetched — most
// commonly because the browser still has an old index.html referencing a
// hashed filename that no longer exists after a new deployment. Resetting
// component state does NOT fix this (the dynamic import() promise is cached
// as rejected for the lifetime of the page), so these require a full reload.
function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
    error.message || "",
  );
}

function isRateLimitError(error: Error | null): boolean {
  if (!error) return false;
  return /(?:^|\D)429(?:\D|$)|too many requests|rate.?limit(?:ed| exceeded)?/i.test(error.message || "");
}

export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error(`[PageErrorBoundary] ${this.props.pageLabel || "Page"} crashed:`, error);
  }

  handleRetry = () => {
    if (isChunkLoadError(this.state.error)) {
      // A simple state reset would immediately re-throw since the browser
      // caches the failed module fetch — force a full reload instead so the
      // fresh (post-deploy) asset manifest is used.
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[400px] p-6" data-testid="page-error-boundary">
          <Card className="max-w-md w-full">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="text-lg font-medium text-foreground">
                    {this.props.pageLabel ? `${this.props.pageLabel} failed to load` : "Page failed to load"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {isRateLimitError(this.state.error)
                      ? "DriverHub received too many requests at once. Your work is safe. Wait a moment, then retry this page."
                      : isChunkLoadError(this.state.error)
                      ? "A new version of the app was published. Refresh to load the latest version."
                      : this.state.error?.message || "An unexpected error occurred"}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-center">
                  <Button
                    variant="default"
                    onClick={this.handleRetry}
                    data-testid="button-retry-page"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {isChunkLoadError(this.state.error) ? "Refresh" : "Retry"}
                  </Button>
                  {this.props.backTo && (
                    <Link href={this.props.backTo}>
                      <Button variant="outline" data-testid="button-back-from-error">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        {this.props.backLabel || "Go Back"}
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
