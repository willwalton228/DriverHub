import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  ShieldAlert,
  UserX,
  FileWarning,
  RefreshCw,
  X,
  Loader2,
  Info,
} from "lucide-react";

interface RiskFlag {
  id: string;
  candidateId: string;
  flagType: string;
  severity: string;
  label: string;
  description: string | null;
  evidence: any;
  isDismissed: boolean;
  dismissedAt: string | null;
  dismissedBy: string | null;
  dismissReason: string | null;
  calculatedAt: string;
}

const FLAG_ICONS: Record<string, typeof AlertTriangle> = {
  prior_no_show: UserX,
  multiple_withdrawals: AlertTriangle,
  background_review_required: ShieldAlert,
};

const SEVERITY_STYLES: Record<string, string> = {
  high: "text-red-600 border-red-300 dark:text-red-400 dark:border-red-700",
  medium: "text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700",
  low: "text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700",
};

const SEVERITY_BG: Record<string, string> = {
  high: "bg-red-50 dark:bg-red-950/30",
  medium: "bg-amber-50 dark:bg-amber-950/30",
  low: "bg-blue-50 dark:bg-blue-950/30",
};

interface RiskFlagBadgeProps {
  candidateId: string;
}

export function RiskFlagBadge({ candidateId }: RiskFlagBadgeProps) {
  const { data: flags, isLoading } = useQuery<RiskFlag[]>({
    queryKey: ["/api/recruiting/candidates", candidateId, "risk-flags"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/candidates/${candidateId}/risk-flags`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  if (isLoading || !flags) return null;

  const activeFlags = flags.filter(f => !f.isDismissed);
  if (activeFlags.length === 0) return null;

  const hasHigh = activeFlags.some(f => f.severity === "high");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`ml-2 text-xs gap-1 ${hasHigh ? SEVERITY_STYLES.high : SEVERITY_STYLES.medium}`}
          data-testid={`badge-risk-flags-${candidateId}`}
        >
          <AlertTriangle className="h-3 w-3" />
          {activeFlags.length} Risk{activeFlags.length > 1 ? "s" : ""}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1">
          {activeFlags.map(flag => {
            const Icon = FLAG_ICONS[flag.flagType] || AlertTriangle;
            return (
              <div key={flag.id} className="flex items-start gap-2 text-sm">
                <Icon className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{flag.label}: {flag.description}</span>
              </div>
            );
          })}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface RiskFlagsPanelProps {
  candidateId: string;
  candidateName: string;
}

export function RiskFlagsPanel({ candidateId, candidateName }: RiskFlagsPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissFlagId, setDismissFlagId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");

  const { data: flags, isLoading } = useQuery<RiskFlag[]>({
    queryKey: ["/api/recruiting/candidates", candidateId, "risk-flags"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/candidates/${candidateId}/risk-flags`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/recruiting/candidates/${candidateId}/risk-flags/refresh`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "risk-flags"] });
      toast({ title: "Risk flags recalculated" });
    },
    onError: () => {
      toast({ title: "Failed to refresh risk flags", variant: "destructive" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ flagId, reason }: { flagId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/recruiting/risk-flags/${flagId}/dismiss`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "risk-flags"] });
      toast({ title: "Risk flag dismissed" });
      setDismissOpen(false);
      setDismissFlagId(null);
      setDismissReason("");
    },
    onError: () => {
      toast({ title: "Failed to dismiss risk flag", variant: "destructive" });
    },
  });

  const activeFlags = (flags || []).filter(f => !f.isDismissed);
  const dismissedFlags = (flags || []).filter(f => f.isDismissed);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading risk flags...
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid={`risk-flags-panel-${candidateId}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium">Risk Indicators</span>
          {activeFlags.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {activeFlags.length} active
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          data-testid="button-refresh-risk-flags"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          Recalculate
        </Button>
      </div>

      {activeFlags.length === 0 && dismissedFlags.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-md border">
          <Info className="h-4 w-4" />
          No risk indicators found for this candidate.
        </div>
      )}

      {activeFlags.length > 0 && (
        <div className="space-y-2">
          {activeFlags.map(flag => {
            const Icon = FLAG_ICONS[flag.flagType] || AlertTriangle;
            const severityStyle = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.medium;
            const bgStyle = SEVERITY_BG[flag.severity] || SEVERITY_BG.medium;

            return (
              <div
                key={flag.id}
                className={`flex items-start justify-between gap-3 p-3 rounded-md border ${severityStyle} ${bgStyle}`}
                data-testid={`risk-flag-${flag.flagType}-${candidateId}`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{flag.label}</span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${severityStyle}`}
                      >
                        {flag.severity}
                      </Badge>
                    </div>
                    <p className="text-xs mt-0.5 opacity-80">{flag.description}</p>
                  </div>
                </div>
                <Dialog open={dismissOpen && dismissFlagId === flag.id} onOpenChange={(open) => {
                  setDismissOpen(open);
                  if (!open) {
                    setDismissFlagId(null);
                    setDismissReason("");
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => {
                        setDismissFlagId(flag.id);
                        setDismissOpen(true);
                      }}
                      data-testid={`button-dismiss-risk-flag-${flag.id}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Dismiss Risk Flag</DialogTitle>
                      <DialogDescription>
                        Dismissing "{flag.label}" for {candidateName}. This flag will be hidden but can reappear if recalculated.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="dismiss-reason">Reason for dismissal</Label>
                        <Textarea
                          id="dismiss-reason"
                          value={dismissReason}
                          onChange={(e) => setDismissReason(e.target.value)}
                          placeholder="Why is this risk flag being dismissed?"
                          data-testid="input-dismiss-reason"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDismissOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          if (dismissFlagId) {
                            dismissMutation.mutate({ flagId: dismissFlagId, reason: dismissReason });
                          }
                        }}
                        disabled={!dismissReason.trim() || dismissMutation.isPending}
                        data-testid="button-confirm-dismiss"
                      >
                        {dismissMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Dismiss Flag
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            );
          })}
        </div>
      )}

      {dismissedFlags.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Dismissed ({dismissedFlags.length})</p>
          {dismissedFlags.map(flag => (
            <div
              key={flag.id}
              className="flex items-center gap-2 text-xs text-muted-foreground p-2 rounded-md border border-dashed opacity-60"
              data-testid={`risk-flag-dismissed-${flag.id}`}
            >
              <FileWarning className="h-3 w-3 shrink-0" />
              <span className="line-through">{flag.label}</span>
              {flag.dismissReason && (
                <span className="truncate">— {flag.dismissReason}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
