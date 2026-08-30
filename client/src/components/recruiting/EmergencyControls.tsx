import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, ShieldOff, Globe, MapPin, UserX, MessageSquareOff, History, AlertTriangle } from "lucide-react";

interface KillSwitchSummary {
  publicApplyDisabled: boolean;
  outboundCommsDisabled: boolean;
  activeMarketOverrides: { key: string; market: string }[];
}

interface KillSwitchFlag {
  id: string;
  flagKey: string;
  name: string;
  description: string | null;
  scope: "global" | "market";
  market: string | null;
  isEnabled: boolean;
  updatedAt: string;
  updatedByEmail: string | null;
  createdByEmail: string | null;
}

interface EmergencyControlsProps {
  isAdmin: boolean;
}

export function EmergencyControls({ isAdmin }: EmergencyControlsProps) {
  const { toast } = useToast();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    key: string;
    label: string;
    isActivating: boolean;
    scope: "global" | "market";
    market: string | null;
  }>({
    open: false,
    key: "",
    label: "",
    isActivating: false,
    scope: "global",
    market: null,
  });

  const [marketScope, setMarketScope] = useState<string>("global");
  const [selectedMarket, setSelectedMarket] = useState<string>("");

  const { data: status, isLoading: statusLoading } = useQuery<KillSwitchSummary>({
    queryKey: ["/api/recruiting/kill-switches/status"],
    refetchInterval: 15000,
  });

  const { data: auditLog = [], isLoading: auditLoading } = useQuery<KillSwitchFlag[]>({
    queryKey: ["/api/recruiting/kill-switches/audit-log"],
    enabled: isAdmin,
  });

  const { data: markets = [] } = useQuery<{ market: string }[]>({
    queryKey: ["/api/recruiting/requisitions/markets"],
  });

  const toggleMutation = useMutation({
    mutationFn: async (params: { key: string; isActive: boolean; scope: string; market: string | null }) => {
      return apiRequest("POST", "/api/recruiting/kill-switches/toggle", params);
    },
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/kill-switches/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/kill-switches/audit-log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/feature-flags"] });
      toast({
        title: variables.isActive ? "Kill Switch Activated" : "Kill Switch Deactivated",
        description: variables.isActive
          ? "The kill switch has been activated. Affected operations are now blocked."
          : "The kill switch has been deactivated. Operations have resumed.",
        variant: variables.isActive ? "destructive" : "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to toggle kill switch",
        variant: "destructive",
      });
    },
  });

  const handleToggle = (key: string, label: string, currentlyActive: boolean) => {
    const scope = marketScope === "global" ? "global" as const : "market" as const;
    const market = scope === "market" ? selectedMarket : null;

    if (scope === "market" && !market) {
      toast({
        title: "Select a Market",
        description: "Please select a market before toggling a market-level kill switch.",
        variant: "destructive",
      });
      return;
    }

    setConfirmDialog({
      open: true,
      key,
      label,
      isActivating: !currentlyActive,
      scope,
      market,
    });
  };

  const confirmToggle = () => {
    toggleMutation.mutate({
      key: confirmDialog.key,
      isActive: confirmDialog.isActivating,
      scope: confirmDialog.scope,
      market: confirmDialog.market,
    });
    setConfirmDialog({ ...confirmDialog, open: false });
  };

  const isPublicApplyActive = status?.publicApplyDisabled ?? false;
  const isOutboundCommsActive = status?.outboundCommsDisabled ?? false;
  const hasActiveOverrides = (status?.activeMarketOverrides?.length ?? 0) > 0;
  const uniqueMarkets = Array.from(new Set(markets.map((m) => m.market)));

  const anyActive = isPublicApplyActive || isOutboundCommsActive || hasActiveOverrides;

  if (statusLoading) {
    return (
      <Card data-testid="card-emergency-controls">
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {anyActive && (
        <Card className="border-destructive bg-destructive/5" data-testid="card-emergency-active-banner">
          <CardContent className="flex items-center gap-3 py-4">
            <ShieldAlert className="h-6 w-6 text-destructive flex-shrink-0" />
            <div>
              <p className="font-semibold text-destructive">Emergency Controls Active</p>
              <p className="text-sm text-muted-foreground">
                {isPublicApplyActive && "Public applications are disabled. "}
                {isOutboundCommsActive && "Outbound communications are disabled. "}
                {hasActiveOverrides && `${status!.activeMarketOverrides.length} market override(s) active.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-emergency-controls">
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                Emergency Controls
              </CardTitle>
              <CardDescription>
                Instantly disable recruiting intake or communications without a redeploy.
                Existing data and read access remain unaffected.
              </CardDescription>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={marketScope} onValueChange={(v) => { setMarketScope(v); setSelectedMarket(""); }} data-testid="select-kill-scope">
                  <SelectTrigger className="w-[140px]" data-testid="select-kill-scope-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    <SelectItem value="market">By Market</SelectItem>
                  </SelectContent>
                </Select>
                {marketScope === "market" && (
                  <Select value={selectedMarket} onValueChange={setSelectedMarket}>
                    <SelectTrigger className="w-[160px]" data-testid="select-kill-market">
                      <SelectValue placeholder="Select market" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueMarkets.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Card className={`${isPublicApplyActive ? "border-destructive" : ""}`} data-testid="card-kill-public-apply">
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-md ${isPublicApplyActive ? "bg-destructive/10" : "bg-muted"}`}>
                  <UserX className={`h-5 w-5 ${isPublicApplyActive ? "text-destructive" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="font-medium">Disable Public Apply Intake</p>
                  <p className="text-sm text-muted-foreground">
                    Blocks all new public job applications. Existing applications remain accessible.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Badge variant={isPublicApplyActive ? "destructive" : "secondary"} data-testid="badge-public-apply-status">
                  {isPublicApplyActive ? "ACTIVE" : "Inactive"}
                </Badge>
                {isAdmin && (
                  <Switch
                    checked={isPublicApplyActive}
                    onCheckedChange={() => handleToggle("kill_switch_public_apply", "Public Apply Intake", isPublicApplyActive)}
                    data-testid="switch-kill-public-apply"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={`${isOutboundCommsActive ? "border-destructive" : ""}`} data-testid="card-kill-outbound-comms">
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-md ${isOutboundCommsActive ? "bg-destructive/10" : "bg-muted"}`}>
                  <MessageSquareOff className={`h-5 w-5 ${isOutboundCommsActive ? "text-destructive" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="font-medium">Disable Outbound Communications</p>
                  <p className="text-sm text-muted-foreground">
                    Suppresses all automated nudges, follow-ups, and candidate notifications.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Badge variant={isOutboundCommsActive ? "destructive" : "secondary"} data-testid="badge-outbound-comms-status">
                  {isOutboundCommsActive ? "ACTIVE" : "Inactive"}
                </Badge>
                {isAdmin && (
                  <Switch
                    checked={isOutboundCommsActive}
                    onCheckedChange={() => handleToggle("kill_switch_outbound_comms", "Outbound Communications", isOutboundCommsActive)}
                    data-testid="switch-kill-outbound-comms"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {hasActiveOverrides && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Active Market Overrides
              </p>
              <div className="flex flex-wrap gap-2">
                {status!.activeMarketOverrides.map((o, i) => (
                  <Badge key={i} variant="destructive" className="flex items-center gap-1" data-testid={`badge-market-override-${i}`}>
                    <MapPin className="h-3 w-3" />
                    {o.market}: {o.key === "kill_switch_public_apply" ? "Apply Disabled" : "Comms Disabled"}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card data-testid="card-kill-switch-audit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-5 w-5" />
              Kill Switch Audit Log
            </CardTitle>
            <CardDescription>
              Record of all kill switch activations and deactivations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {auditLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : auditLog.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShieldOff className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No kill switch activity recorded yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kill Switch</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Changed By</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.map((entry) => (
                    <TableRow key={entry.id} data-testid={`row-audit-${entry.id}`}>
                      <TableCell>
                        <div className="font-medium">{entry.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{entry.flagKey}</div>
                      </TableCell>
                      <TableCell>
                        {entry.scope === "global" ? (
                          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                            <Globe className="h-3 w-3" />
                            Global
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            <MapPin className="h-3 w-3" />
                            {entry.market}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.isEnabled ? "destructive" : "secondary"}>
                          {entry.isEnabled ? "ACTIVE" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.updatedByEmail || entry.createdByEmail || "System"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(entry.updatedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className={`h-5 w-5 ${confirmDialog.isActivating ? "text-destructive" : "text-green-600"}`} />
              {confirmDialog.isActivating ? "Activate" : "Deactivate"} Kill Switch
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                You are about to <strong>{confirmDialog.isActivating ? "activate" : "deactivate"}</strong> the{" "}
                <strong>{confirmDialog.label}</strong> kill switch
                {confirmDialog.scope === "market" && confirmDialog.market && (
                  <> for market <strong>{confirmDialog.market}</strong></>
                )}
                {confirmDialog.scope === "global" && <> <strong>globally</strong></>}.
              </span>
              {confirmDialog.isActivating ? (
                <span className="block text-destructive font-medium">
                  This will immediately block affected operations. Existing data will remain accessible.
                </span>
              ) : (
                <span className="block text-green-600 dark:text-green-400 font-medium">
                  This will resume normal operations for the affected area.
                </span>
              )}
              <span className="block text-muted-foreground text-xs">
                This action will be logged in the audit trail.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-toggle">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggle}
              className={confirmDialog.isActivating ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              data-testid="button-confirm-toggle"
            >
              {confirmDialog.isActivating ? "Activate Kill Switch" : "Deactivate Kill Switch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
