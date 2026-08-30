import { Component, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface ClaimErrorBoundaryProps {
  children: ReactNode;
  claimId?: string;
}

interface ClaimErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ClaimErrorBoundary extends Component<ClaimErrorBoundaryProps, ClaimErrorBoundaryState> {
  constructor(props: ClaimErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ClaimErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("Claim detail crashed:", error);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[400px] p-6" data-testid="claim-error-boundary">
          <Card className="max-w-md w-full">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="text-lg font-medium text-foreground">Claim failed to load</p>
                  {this.props.claimId && (
                    <p className="text-sm text-muted-foreground mt-1">Claim ID: {this.props.claimId}</p>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">
                    {this.state.error?.message || "An unexpected error occurred"}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-center">
                  <Button
                    variant="default"
                    onClick={this.handleRetry}
                    data-testid="button-retry-claim"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                  <Link href="/safety">
                    <Button variant="outline" data-testid="button-back-to-safety-error">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Safety
                    </Button>
                  </Link>
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
