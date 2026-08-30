import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Check, RefreshCw, Shield, Clock, FileWarning } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@/lib/dateFormat";

interface SafetyFlag {
  id: string;
  driverId: string;
  flagType: string;
  thresholdValue: number;
  lookbackDays: number;
  actualValue: number | null;
  triggeredAt: string;
  resolvedAt: string | null;
  note: string | null;
  resolvedByUserId: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
}

interface DriverSafetyFlagsProps {
  driverId: string;
  showCompact?: boolean;
}

function getFlagTypeInfo(flagType: string) {
  switch (flagType) {
    case 'INCIDENT_COUNT':
      return {
        label: 'Incident Count',
        description: 'High number of reported incidents',
        icon: AlertTriangle,
        color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      };
    case 'CLAIM_COUNT':
      return {
        label: 'Claim Count',
        description: 'High number of insurance claims',
        icon: FileWarning,
        color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      };
    case 'SEVERITY_EVENT':
      return {
        label: 'Severity Event',
        description: 'Serious safety event recorded',
        icon: Shield,
        color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      };
    default:
      return {
        label: flagType,
        description: 'Safety concern flagged',
        icon: AlertTriangle,
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      };
  }
}

function ResolveFlagDialog({ flag, onResolved }: { flag: SafetyFlag; onResolved: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { toast } = useToast();

  const resolveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/corporate/safety-flags/${flag.id}/resolve`, { note });
    },
    onSuccess: () => {
      toast({ title: "Flag Resolved", description: "The safety flag has been resolved successfully." });
      setOpen(false);
      setNote("");
      onResolved();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid={`button-resolve-flag-${flag.id}`}>
          <Check className="h-3 w-3 mr-1" />
          Resolve
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve Safety Flag</DialogTitle>
          <DialogDescription>
            Add an optional note explaining how this flag was addressed.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder="Resolution notes (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="input-resolution-note"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-resolve">
            Cancel
          </Button>
          <Button 
            onClick={() => resolveMutation.mutate()} 
            disabled={resolveMutation.isPending}
            data-testid="button-confirm-resolve"
          >
            {resolveMutation.isPending ? "Resolving..." : "Confirm Resolution"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DriverSafetyFlags({ driverId, showCompact = false }: DriverSafetyFlagsProps) {
  const { toast } = useToast();

  const { data: flags, isLoading, refetch } = useQuery<SafetyFlag[]>({
    queryKey: ['/api/corporate/drivers', driverId, 'safety-flags'],
    queryFn: async () => {
      const response = await fetch(`/api/corporate/drivers/${driverId}/safety-flags`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch safety flags');
      return response.json();
    },
    enabled: !!driverId,
  });

  const checkMutation = useMutation({
    mutationFn: async (): Promise<{ triggered: boolean; message: string }> => {
      const response = await apiRequest('POST', `/api/corporate/drivers/${driverId}/safety-flags/check`, {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: data.triggered ? "New Flags Triggered" : "Check Complete", 
        description: data.message 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/corporate/drivers', driverId, 'safety-flags'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const activeFlags = flags?.filter(f => !f.resolvedAt) || [];
  const resolvedFlags = flags?.filter(f => f.resolvedAt) || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Safety Flags
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (showCompact) {
    if (activeFlags.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1" data-testid="compact-safety-flags">
        {activeFlags.map((flag) => {
          const info = getFlagTypeInfo(flag.flagType);
          const Icon = info.icon;
          return (
            <Badge key={flag.id} className={info.color} data-testid={`badge-safety-flag-${flag.id}`}>
              <Icon className="h-3 w-3 mr-1" />
              {info.label}
            </Badge>
          );
        })}
      </div>
    );
  }

  return (
    <Card data-testid="card-driver-safety-flags">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Safety Flags
          {activeFlags.length > 0 && (
            <Badge variant="destructive" data-testid="badge-active-flag-count">
              {activeFlags.length} Active
            </Badge>
          )}
        </CardTitle>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => checkMutation.mutate()}
          disabled={checkMutation.isPending}
          data-testid="button-check-flags"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${checkMutation.isPending ? 'animate-spin' : ''}`} />
          Check Flags
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeFlags.length === 0 && resolvedFlags.length === 0 && (
          <p className="text-muted-foreground text-sm" data-testid="text-no-flags">
            No safety flags on record for this driver.
          </p>
        )}

        {activeFlags.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Active Flags</h4>
            {activeFlags.map((flag) => {
              const info = getFlagTypeInfo(flag.flagType);
              const Icon = info.icon;
              return (
                <div 
                  key={flag.id} 
                  className="flex items-start justify-between gap-3 p-3 rounded-md border bg-destructive/5"
                  data-testid={`flag-active-${flag.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-md ${info.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{info.label}</p>
                      <p className="text-sm text-muted-foreground">{flag.note || info.description}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Triggered {formatDateTime(flag.triggeredAt)}
                      </div>
                      {flag.actualValue !== null && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Count: {flag.actualValue} / Threshold: {flag.thresholdValue} in {flag.lookbackDays} days
                        </p>
                      )}
                    </div>
                  </div>
                  <ResolveFlagDialog 
                    flag={flag} 
                    onResolved={() => refetch()}
                  />
                </div>
              );
            })}
          </div>
        )}

        {resolvedFlags.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Resolved Flags</h4>
            {resolvedFlags.slice(0, 5).map((flag) => {
              const info = getFlagTypeInfo(flag.flagType);
              return (
                <div 
                  key={flag.id} 
                  className="flex items-start gap-3 p-3 rounded-md border bg-muted/30"
                  data-testid={`flag-resolved-${flag.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="font-medium">{info.label}</span>
                      <Badge variant="outline" className="text-xs">Resolved</Badge>
                    </div>
                    {flag.resolutionNote && (
                      <p className="text-sm text-muted-foreground mt-1">{flag.resolutionNote}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Resolved by {flag.resolvedByName || 'Unknown'} on {formatDateTime(flag.resolvedAt!)}
                    </p>
                  </div>
                </div>
              );
            })}
            {resolvedFlags.length > 5 && (
              <p className="text-sm text-muted-foreground text-center">
                + {resolvedFlags.length - 5} more resolved flags
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ActiveSafetyFlagsBadges({ driverId }: { driverId: string }) {
  const { data: flags, isLoading } = useQuery<SafetyFlag[]>({
    queryKey: ['/api/corporate/drivers', driverId, 'safety-flags', 'active'],
    queryFn: async () => {
      const response = await fetch(`/api/corporate/drivers/${driverId}/safety-flags/active`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch active safety flags');
      return response.json();
    },
    enabled: !!driverId,
  });

  if (isLoading || !flags || flags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1" data-testid="active-safety-flags-badges">
      {flags.map((flag) => {
        const info = getFlagTypeInfo(flag.flagType);
        const Icon = info.icon;
        return (
          <Badge key={flag.id} variant="destructive" data-testid={`badge-active-flag-${flag.id}`}>
            <Icon className="h-3 w-3 mr-1" />
            {info.label}
          </Badge>
        );
      })}
    </div>
  );
}
