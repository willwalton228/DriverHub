import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Clock, CheckCircle, CalendarClock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AvailabilityAlert {
  id: string;
  candidateId: string;
  applicationId: string;
  previousAvailability: any;
  newAvailability: any;
  changedFields: string[];
  previousReadinessStatus: string;
  newReadinessStatus: string;
  status: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByEmail: string | null;
  resolutionNote: string | null;
  triggeredBy: string | null;
  triggeredByEmail: string | null;
  createdAt: string;
}

function formatFieldName(field: string): string {
  const map: Record<string, string> = {
    daysOfWeek: "Days",
    timeWindows: "Time Windows",
    preferredShiftType: "Shift Type",
    maxHoursPerWeek: "Max Hours",
    minHoursPerWeek: "Min Hours",
    preferredStartTime: "Start Time",
    notes: "Notes",
  };
  return map[field] || field;
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return "Not set";
  if (Array.isArray(val)) {
    if (val.length === 0) return "None";
    return val.join(", ");
  }
  return String(val);
}

export function AvailabilityAlertBanner({ applicationId }: { applicationId: string }) {
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<AvailabilityAlert | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [restoreReadiness, setRestoreReadiness] = useState(true);
  const { toast } = useToast();

  const { data: alerts = [] } = useQuery<AvailabilityAlert[]>({
    queryKey: ["/api/recruiting/applications", applicationId, "availability-alerts"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/availability-alerts`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ alertId, note, restore }: { alertId: string; note: string; restore: boolean }) => {
      return apiRequest("PATCH", `/api/recruiting/availability-alerts/${alertId}/resolve`, {
        resolutionNote: note,
        restoreReadiness: restore,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "availability-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
      setResolveDialogOpen(false);
      setSelectedAlert(null);
      setResolutionNote("");
      toast({ title: "Alert resolved", description: restoreReadiness ? "Readiness restored to Ready." : "Alert resolved. Readiness remains In Review." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resolve alert.", variant: "destructive" });
    },
  });

  const openAlerts = alerts.filter((a) => a.status === "open");

  if (openAlerts.length === 0) return null;

  const latestAlert = openAlerts[0];

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className="text-xs cursor-pointer gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
            data-testid={`badge-availability-alert-${applicationId}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedAlert(latestAlert);
              setResolveDialogOpen(true);
            }}
          >
            <CalendarClock className="h-3 w-3" />
            Availability Changed
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm font-medium">Availability was updated after reaching Ready status</p>
          <p className="text-xs text-muted-foreground mt-1">
            Changed: {latestAlert.changedFields?.map(formatFieldName).join(", ")}
          </p>
          <p className="text-xs text-muted-foreground">Click to review and resolve</p>
        </TooltipContent>
      </Tooltip>

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-availability-alert-resolve">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-600" />
              Availability Change Alert
            </DialogTitle>
            <DialogDescription>
              This candidate's availability was updated after being marked as Ready.
              Readiness has been set to In Review. Review the changes and resolve the alert.
            </DialogDescription>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">What Changed</p>
                <div className="grid gap-2">
                  {selectedAlert.changedFields?.map((field) => {
                    const prev = selectedAlert.previousAvailability?.[field];
                    const next = selectedAlert.newAvailability?.[field];
                    return (
                      <div key={field} className="rounded-md border p-3 text-sm" data-testid={`alert-change-${field}`}>
                        <p className="font-medium text-muted-foreground">{formatFieldName(field)}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-destructive line-through">{formatValue(prev)}</span>
                          <span className="text-muted-foreground">&rarr;</span>
                          <span className="text-green-700 dark:text-green-400">{formatValue(next)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Resolution Note (optional)</p>
                <Textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Add a note about this resolution..."
                  className="resize-none"
                  data-testid="input-resolution-note"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="restore-readiness"
                  checked={restoreReadiness}
                  onChange={(e) => setRestoreReadiness(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                  data-testid="checkbox-restore-readiness"
                />
                <label htmlFor="restore-readiness" className="text-sm">
                  Restore readiness status to Ready
                </label>
              </div>

              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Alert created {new Date(selectedAlert.createdAt).toLocaleString()}
                {selectedAlert.triggeredByEmail && ` by ${selectedAlert.triggeredByEmail}`}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setResolveDialogOpen(false)}
              data-testid="button-cancel-resolve"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedAlert) {
                  resolveMutation.mutate({
                    alertId: selectedAlert.id,
                    note: resolutionNote,
                    restore: restoreReadiness,
                  });
                }
              }}
              disabled={resolveMutation.isPending}
              data-testid="button-confirm-resolve"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {resolveMutation.isPending ? "Resolving..." : "Resolve Alert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
