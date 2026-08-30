import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  Clock, 
  MapPin, 
  Truck, 
  Package, 
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  AlertTriangle,
  Info
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { format } from "date-fns";
import { parseDateSafe } from "@/lib/dateFormat";

// Canonical status types from backend
type CanonicalMoveStatus = 
  | 'CREATED' 
  | 'OFFERED' 
  | 'ASSIGNED' 
  | 'IN_PROGRESS' 
  | 'WAITING' 
  | 'COMPLETED' 
  | 'CANCELLED_BY_CUSTOMER' 
  | 'CANCELLED_BY_OPS';

interface TimelineEvent {
  at: string;
  canonical_status: CanonicalMoveStatus;
  label: string;
  note_public?: string;
}

interface MoveException {
  id: string;
  type: string;
  severity: string;
  message: string;
  created_at: string;
}

interface MoveTimelineData {
  move_id: string;
  move_number: string;
  current_status: CanonicalMoveStatus;
  current_status_label: string;
  eta_text: string | null;
  last_updated_at: string;
  origin: string;
  destination: string;
  trip_date: string;
  customer_instructions: string | null;
  events: TimelineEvent[];
  server_time: string;
}

interface ExceptionsData {
  exceptions: MoveException[];
  server_time: string;
}

function getStatusIcon(status: CanonicalMoveStatus) {
  if (status === 'COMPLETED') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === 'CANCELLED_BY_CUSTOMER' || status === 'CANCELLED_BY_OPS') {
    return <AlertCircle className="h-5 w-5 text-destructive" />;
  }
  if (status === 'IN_PROGRESS') return <Truck className="h-5 w-5 text-primary" />;
  if (status === 'WAITING') return <Clock className="h-5 w-5 text-amber-500" />;
  if (status === 'ASSIGNED') return <Package className="h-5 w-5 text-blue-500" />;
  if (status === 'OFFERED') return <RefreshCw className="h-5 w-5 text-muted-foreground" />;
  return <Clock className="h-5 w-5 text-muted-foreground" />;
}

function getStatusBadgeVariant(status: CanonicalMoveStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === 'COMPLETED') return "default";
  if (status === 'CANCELLED_BY_CUSTOMER' || status === 'CANCELLED_BY_OPS') return "destructive";
  if (status === 'IN_PROGRESS' || status === 'WAITING') return "secondary";
  return "outline";
}

function getSeverityIcon(severity: string) {
  if (severity === 'HIGH') return <AlertTriangle className="h-4 w-4 text-destructive" />;
  if (severity === 'MEDIUM') return <AlertCircle className="h-4 w-4 text-amber-500" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

function formatEventTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return format(date, "MMM d, yyyy 'at' h:mm a");
  } catch {
    return isoString;
  }
}

function TimelineItem({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-border bg-background">
          {getStatusIcon(event.canonical_status)}
        </div>
        {!isLast && (
          <div className="w-0.5 flex-1 bg-border my-2" />
        )}
      </div>
      <div className="flex-1 pb-6">
        <div className="flex flex-col gap-1">
          <span className="font-medium">{event.label}</span>
          <span className="text-sm text-muted-foreground">
            {formatEventTime(event.at)}
          </span>
          {event.note_public && (
            <p className="text-sm text-muted-foreground mt-1 p-2 bg-muted rounded-md">
              {event.note_public}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ExceptionItem({ exception }: { exception: MoveException }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md" data-testid={`exception-${exception.id}`}>
      {getSeverityIcon(exception.severity)}
      <div className="flex-1">
        <p className="text-sm">{exception.message}</p>
        <span className="text-xs text-muted-foreground">
          {formatEventTime(exception.created_at)}
        </span>
      </div>
    </div>
  );
}

export default function MoveTimeline() {
  const params = useParams<{ moveId: string }>();
  const moveId = params.moveId;

  const { data, isLoading, error, refetch } = useQuery<MoveTimelineData>({
    queryKey: ['/api/customer/moves', moveId, 'timeline'],
    queryFn: async () => {
      const response = await fetch(`/api/customer/moves/${moveId}/timeline`, {
        credentials: 'include'
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to load move timeline');
      }
      return response.json();
    },
    enabled: !!moveId,
    refetchInterval: 30000,
  });

  const { data: exceptionsData } = useQuery<ExceptionsData>({
    queryKey: ['/api/customer/moves', moveId, 'exceptions'],
    queryFn: async () => {
      const response = await fetch(`/api/customer/moves/${moveId}/exceptions`, {
        credentials: 'include'
      });
      if (!response.ok) {
        return { exceptions: [], server_time: new Date().toISOString() };
      }
      return response.json();
    },
    enabled: !!moveId,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-6 w-6 text-primary" />
              <span className="font-semibold">Move Tracking</span>
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-6 w-6 text-primary" />
              <span className="font-semibold">Move Tracking</span>
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <AlertCircle className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-semibold">Unable to Load Move</h2>
                <p className="text-muted-foreground">
                  {error instanceof Error ? error.message : 'An error occurred while loading the move timeline.'}
                </p>
                <Button onClick={() => refetch()} data-testid="button-retry">
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const sortedEvents = [...data.events].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Truck className="h-6 w-6 text-primary" />
              <span className="font-semibold">Move Tracking</span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <Card className="mb-6" data-testid="card-move-header">
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-2xl" data-testid="text-move-number">
                  Move #{data.move_number}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {data.trip_date ? format(parseDateSafe(data.trip_date), "EEEE, MMMM d, yyyy") : 'Date pending'}
                </p>
              </div>
              <Badge 
                variant={getStatusBadgeVariant(data.current_status)}
                className="text-sm"
                data-testid="badge-current-status"
              >
                {data.current_status_label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Pickup</p>
                  <p className="font-medium" data-testid="text-origin">{data.origin}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Destination</p>
                  <p className="font-medium" data-testid="text-destination">{data.destination}</p>
                </div>
              </div>
              {data.eta_text && (
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated Arrival</p>
                    <p className="font-medium">{data.eta_text}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {data.customer_instructions && (
          <Card className="mb-6" data-testid="card-instructions">
            <CardHeader>
              <CardTitle className="text-lg">Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground" data-testid="text-instructions">
                {data.customer_instructions}
              </p>
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-timeline">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Timeline</CardTitle>
              <span className="text-xs text-muted-foreground">
                Last updated: {formatEventTime(data.last_updated_at)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {sortedEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No timeline events yet
              </p>
            ) : (
              <div className="space-y-0">
                {sortedEvents.map((event, index) => (
                  <TimelineItem 
                    key={`${event.at}-${event.canonical_status}-${index}`} 
                    event={event} 
                    isLast={index === sortedEvents.length - 1}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {exceptionsData && exceptionsData.exceptions.length > 0 && (
          <Card className="mt-6" data-testid="card-updates">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Updates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {exceptionsData.exceptions.map((exception) => (
                  <ExceptionItem key={exception.id} exception={exception} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          Auto-refreshes every 30 seconds
        </p>
      </main>
    </div>
  );
}
