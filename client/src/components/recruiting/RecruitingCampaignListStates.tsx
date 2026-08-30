import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

type CampaignListKind = "active" | "closed";

export function RecruitingCampaignListLoading({
  kind,
}: {
  kind: CampaignListKind;
}) {
  return (
    <Card data-testid={`loading-${kind}-campaigns`}>
      <CardContent className="space-y-3 p-4">
        <Skeleton className="h-4 w-44" />
        <div className="space-y-2">
          {[...Array(6)].map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


export function RecruitingCampaignListError({
  kind,
  isRetrying,
  onRetry,
}: {
  kind: CampaignListKind;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <Alert
      variant="destructive"
      className="flex items-start gap-3"
      data-testid={`error-${kind}-campaigns`}
    >
      <AlertCircle className="h-5 w-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <AlertTitle>Unable to load Recruiting campaigns.</AlertTitle>
            <AlertDescription>
              Campaign data is unavailable right now. Try again to reload this list.
            </AlertDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onRetry}
            disabled={isRetrying}
            data-testid={`button-retry-${kind}-campaigns`}
          >
            {isRetrying ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isRetrying ? "Retrying…" : "Retry"}
          </Button>
        </div>
      </div>
    </Alert>
  );
}