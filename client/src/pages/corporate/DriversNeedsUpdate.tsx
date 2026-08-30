import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  UserCog,
  ChevronDown,
  ChevronUp,
  ClipboardList,
} from "lucide-react";

interface FlaggedDriver {
  id: string;
  driverNumber: string | null;
  phoneNumber: string | null;
  market: string | null;
  driverType: string | null;
  needsUpdateReasons: string[] | null;
  needsUpdateImportBatchId: string | null;
  createdAt: string | null;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export default function DriversNeedsUpdate() {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ drivers: FlaggedDriver[]; total: number }>({
    queryKey: ["/api/drivers/needs-update"],
  });

  const clearMutation = useMutation({
    mutationFn: async (driverId: string) => {
      await apiRequest("PATCH", `/api/drivers/${driverId}/clear-needs-update`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drivers/needs-update"] });
      queryClient.invalidateQueries({ queryKey: ["/api/drivers/needs-update/summary"] });
      toast({ title: "Driver flag cleared", description: "The driver has been marked as complete." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear update flag.", variant: "destructive" });
    },
  });

  const drivers = data?.drivers || [];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-amber-500" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Needs Update Work Queue</h1>
        </div>
        <Badge variant="outline" className="border-amber-500 text-amber-600" data-testid="badge-total-count">
          {data?.total || 0} driver(s)
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        These drivers were imported with incomplete data and need follow-up to complete their profiles.
        Review each driver, update their information, then mark them as resolved.
      </p>

      {isLoading ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading work queue...</p>
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {(error as any)?.status === 403
                ? "You don't have permission to view this page. Admin access is required."
                : "Failed to load drivers needing update."}
            </p>
          </CardContent>
        </Card>
      ) : drivers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-lg font-medium">All caught up</p>
            <p className="text-sm text-muted-foreground mt-1">No drivers currently need profile updates.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {drivers.map((driver) => {
            const isExpanded = expandedId === driver.id;
            const displayName = [driver.firstName, driver.lastName].filter(Boolean).join(" ") || "Unnamed Driver";
            return (
              <Card key={driver.id} data-testid={`card-driver-${driver.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserCog className="h-5 w-5 text-amber-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate" data-testid={`text-driver-name-${driver.id}`}>{displayName}</p>
                        <p className="text-xs text-muted-foreground truncate" data-testid={`text-driver-email-${driver.id}`}>
                          {driver.email || "No email"}
                          {driver.driverNumber ? ` | #${driver.driverNumber}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-amber-500 text-amber-600 shrink-0">
                        {(driver.needsUpdateReasons || []).length} issue(s)
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExpandedId(isExpanded ? null : driver.id)}
                        data-testid={`button-expand-${driver.id}`}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Market</p>
                          <p data-testid={`text-driver-market-${driver.id}`}>{driver.market || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Driver Type</p>
                          <p data-testid={`text-driver-type-${driver.id}`}>{driver.driverType || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Phone</p>
                          <p data-testid={`text-driver-phone-${driver.id}`}>{driver.phoneNumber || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Imported</p>
                          <p>{driver.createdAt ? new Date(driver.createdAt).toLocaleDateString() : "-"}</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Missing / Incomplete Fields:</p>
                        <div className="space-y-1">
                          {(driver.needsUpdateReasons || []).map((reason, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                              <span data-testid={`text-reason-${driver.id}-${i}`}>{reason}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => clearMutation.mutate(driver.id)}
                          disabled={clearMutation.isPending}
                          data-testid={`button-resolve-${driver.id}`}
                        >
                          {clearMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          )}
                          Mark as Resolved
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Update the driver profile first, then mark resolved to clear this flag.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
