/**
 * WIW Location Mapping Section
 * Account-level governance UI — shown within the Account Scheduling tab.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2, Clock, AlertTriangle, MapPin, MoreHorizontal, RefreshCw,
  XCircle, FlaskConical, Ban, Loader2, ChevronDown, ChevronRight, ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  active_mapped:      { label: "Active Mapped",       color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",  icon: CheckCircle2 },
  pending_mapping:    { label: "Pending Mapping",     color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",     icon: Clock },
  unmapped:           { label: "Unmapped",            color: "bg-muted text-muted-foreground",                                       icon: AlertTriangle },
  test_location:      { label: "Test Location",       color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: FlaskConical },
  cancelled_inactive: { label: "Cancelled/Inactive",  color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",        icon: Ban },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.unmapped;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${m.color}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {m.label}
    </span>
  );
}

function workplaceLabel(id: number | null | undefined) {
  if (!id) return "—";
  const m: Record<number, string> = { 3725440: "Main", 4244009: "IL & NY", 4280572: "CA" };
  return m[id] ?? `WP ${id}`;
}

// ── Status change dialog ──────────────────────────────────────────────────────
interface StatusChangeDialogProps {
  open: boolean;
  location: any;
  targetStatus: string;
  accountId: string;
  onConfirm: (reason: string | null) => void;
  onClose: () => void;
  isPending: boolean;
}

function StatusChangeDialog({ open, location, targetStatus, accountId, onConfirm, onClose, isPending }: StatusChangeDialogProps) {
  const [reason, setReason] = useState("");
  const meta = STATUS_META[targetStatus] ?? STATUS_META.unmapped;
  const Icon = meta.icon;

  const actionText = targetStatus === "active_mapped"
    ? "Map to This Account"
    : targetStatus === "pending_mapping" ? "Set Pending Mapping"
    : targetStatus === "test_location"   ? "Mark as Test Location"
    : targetStatus === "cancelled_inactive" ? "Mark as Cancelled/Inactive"
    : "Reset to Unmapped";

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-wiw-status-change">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {actionText}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{location?.wiwLocationName}</span>
            {" — "}WIW ID: {location?.wiwExternalId ?? location?.wiwLocationId ?? "—"}
            {targetStatus === "active_mapped" && (
              <span className="block mt-1 text-xs">
                This will map the location to this account and include its data in live reporting.
              </span>
            )}
            {(targetStatus === "test_location" || targetStatus === "cancelled_inactive") && (
              <span className="block mt-1 text-xs">
                This will exclude the location from all live reporting and operational views.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Reason (optional)</p>
            <Textarea
              placeholder="Add a note explaining this classification…"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="text-sm h-20"
              data-testid="input-status-reason"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={() => onConfirm(reason || null)} disabled={isPending} data-testid="button-confirm-status-change">
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating…</> : actionText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Location row ──────────────────────────────────────────────────────────────
function LocationRow({
  loc, accountId, onAction,
}: { loc: any; accountId: string; onAction: (loc: any, action: string) => void }) {
  return (
    <TableRow data-testid={`row-wiw-loc-${loc.mapId}`}>
      <TableCell>
        <p className="text-sm font-medium">{loc.wiwLocationName}</p>
        <p className="text-xs text-muted-foreground">ID: {loc.wiwExternalId ?? loc.wiwLocationId ?? "—"}</p>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{loc.wiwWorkplaceName}</TableCell>
      <TableCell><StatusBadge status={loc.wiwLocationStatus} /></TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {loc.lastActivityAt ? format(new Date(loc.lastActivityAt), "MMM d, yyyy") : "—"}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid={`button-loc-actions-${loc.mapId}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {loc.wiwLocationStatus !== "active_mapped" && (
              <DropdownMenuItem
                onClick={() => onAction(loc, "active_mapped")}
                data-testid={`action-map-${loc.mapId}`}
              >
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                Map to This Account
              </DropdownMenuItem>
            )}
            {loc.wiwLocationStatus !== "pending_mapping" && (
              <DropdownMenuItem onClick={() => onAction(loc, "pending_mapping")} data-testid={`action-pending-${loc.mapId}`}>
                <Clock className="h-4 w-4 mr-2 text-blue-500" />
                Set Pending Mapping
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {loc.wiwLocationStatus !== "test_location" && (
              <DropdownMenuItem onClick={() => onAction(loc, "test_location")} data-testid={`action-test-${loc.mapId}`}>
                <FlaskConical className="h-4 w-4 mr-2 text-purple-500" />
                Mark as Test Location
              </DropdownMenuItem>
            )}
            {loc.wiwLocationStatus !== "cancelled_inactive" && (
              <DropdownMenuItem onClick={() => onAction(loc, "cancelled_inactive")} data-testid={`action-cancelled-${loc.mapId}`}>
                <Ban className="h-4 w-4 mr-2 text-red-500" />
                Mark as Cancelled/Inactive
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {loc.wiwLocationStatus === "active_mapped" && (
              <DropdownMenuItem
                onClick={() => onAction(loc, "remove_mapping")}
                className="text-destructive"
                data-testid={`action-remove-${loc.mapId}`}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Remove Mapping
              </DropdownMenuItem>
            )}
            {loc.wiwLocationStatus !== "unmapped" && (
              <DropdownMenuItem onClick={() => onAction(loc, "unmapped")} data-testid={`action-reset-${loc.mapId}`}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset to Unmapped
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────
function LocationSection({
  title, icon: Icon, iconColor, locations, count, accountId, onAction, defaultOpen = true,
}: {
  title: string; icon: any; iconColor: string; locations: any[];
  count: number; accountId: string; onAction: (loc: any, action: string) => void; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover-elevate"
        onClick={() => setOpen(o => !o)}
        data-testid={`section-toggle-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconColor}`} />
          <span className="text-sm font-medium">{title}</span>
          <span className="ml-1 inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{count}</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>WIW Location</TableHead>
              <TableHead>Workplace</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Activity</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map(loc => (
              <LocationRow key={loc.mapId} loc={loc} accountId={accountId} onAction={onAction} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function WiwLocationMappingSection({ accountId }: { accountId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [dialogLoc, setDialogLoc]       = useState<any>(null);
  const [dialogStatus, setDialogStatus] = useState<string>("");

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/accounts", accountId, "wiw-governance-summary"],
    queryFn: () => fetch(`/api/accounts/${accountId}/wiw-governance-summary`, { credentials: "include" }).then(r => r.json()),
    enabled: !!accountId,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ mapId, wiwLocationStatus, statusReason, driverHubAccountId }: {
      mapId: string; wiwLocationStatus: string; statusReason: string | null; driverHubAccountId?: string | null;
    }) => {
      const body: any = { wiwLocationStatus, statusReason };
      if (driverHubAccountId !== undefined) body.driverHubAccountId = driverHubAccountId;
      const res = await apiRequest("PATCH", `/api/scheduling/wiw-governance/${mapId}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", accountId, "wiw-governance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw-governance"] });
      toast({ title: "Location status updated" });
      setDialogLoc(null);
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });

  function handleAction(loc: any, action: string) {
    if (action === "remove_mapping") {
      // Directly remove without dialog
      updateMutation.mutate({
        mapId: loc.mapId,
        wiwLocationStatus: "unmapped",
        statusReason: "Mapping removed by user",
        driverHubAccountId: null,
      });
      return;
    }
    setDialogLoc(loc);
    setDialogStatus(action);
  }

  function handleConfirm(reason: string | null) {
    if (!dialogLoc) return;
    const isMapping = dialogStatus === "active_mapped";
    updateMutation.mutate({
      mapId: dialogLoc.mapId,
      wiwLocationStatus: dialogStatus,
      statusReason: reason,
      driverHubAccountId: isMapping ? accountId : (dialogStatus === "unmapped" ? null : undefined),
    });
  }

  const locations: any[]   = data?.locations ?? [];
  const unclaimed: any[]   = data?.unclaimedLocations ?? [];
  const counts             = data?.counts ?? {};
  const syswidePending     = data?.syswidePending ?? 0;
  const syswideUnmapped    = data?.syswideUnmapped ?? 0;

  const active    = locations.filter(l => l.wiwLocationStatus === "active_mapped");
  const pending   = locations.filter(l => l.wiwLocationStatus === "pending_mapping");
  const unmapped  = locations.filter(l => l.wiwLocationStatus === "unmapped");
  const other     = locations.filter(l => ["test_location", "cancelled_inactive"].includes(l.wiwLocationStatus));

  const totalAlerts = (counts.pendingMapping ?? 0) + (counts.unmapped ?? 0);

  return (
    <Card data-testid="card-wiw-location-mapping">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            WIW Location Mapping
            {totalAlerts > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                {totalAlerts} need{totalAlerts === 1 ? "s" : ""} attention
              </span>
            )}
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            Govern which WIW locations feed scheduling data to this account.
            Only <span className="font-medium">Active Mapped</span> locations appear in reports, OT calculations, and account metrics.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-wiw-governance">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="default" onClick={() => navigate("/scheduling/wiw-governance")} data-testid="button-open-governance-console">
            <ExternalLink className="h-4 w-4 mr-1.5" />
            Governance Console
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Summary badges */}
        {!isLoading && (
          <div className="flex flex-wrap gap-2 pb-1">
            <span className="inline-flex items-center gap-1 rounded-md bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2.5 py-1 text-xs font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {counts.activeMapped ?? 0} Active Mapped
            </span>
            {(counts.pendingMapping ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2.5 py-1 text-xs font-medium">
                <Clock className="h-3.5 w-3.5" />
                {counts.pendingMapping} Pending Mapping
              </span>
            )}
            {(counts.unmapped ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2.5 py-1 text-xs font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                {counts.unmapped} Unmapped
              </span>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading locations…
          </div>
        ) : (
          <div className="space-y-3">
            {/* A. Active Mapped */}
            <LocationSection
              title="Active Mapped"
              icon={CheckCircle2}
              iconColor="text-green-500"
              locations={active}
              count={active.length}
              accountId={accountId}
              onAction={handleAction}
              defaultOpen
            />

            {/* B. Pending Mapping */}
            <LocationSection
              title="Pending Mapping"
              icon={Clock}
              iconColor="text-blue-500"
              locations={pending}
              count={pending.length}
              accountId={accountId}
              onAction={handleAction}
              defaultOpen
            />

            {/* C. Unmapped / Needs Review */}
            <LocationSection
              title="Unmapped / Needs Review"
              icon={AlertTriangle}
              iconColor="text-amber-500"
              locations={unmapped}
              count={unmapped.length}
              accountId={accountId}
              onAction={handleAction}
              defaultOpen
            />

            {/* Unclaimed (system-wide unmapped/pending with no account) */}
            {unclaimed.length > 0 && (
              <LocationSection
                title={`Unclaimed System-Wide (${unclaimed.length})`}
                icon={AlertTriangle}
                iconColor="text-muted-foreground"
                locations={unclaimed}
                count={unclaimed.length}
                accountId={accountId}
                onAction={handleAction}
                defaultOpen={false}
              />
            )}

            {/* Other (test/cancelled) */}
            <LocationSection
              title="Excluded (Test / Cancelled)"
              icon={Ban}
              iconColor="text-muted-foreground"
              locations={other}
              count={other.length}
              accountId={accountId}
              onAction={handleAction}
              defaultOpen={false}
            />

            {locations.length === 0 && unclaimed.length === 0 && (
              <div className="py-8 text-center text-muted-foreground text-sm">
                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No WIW locations found for this account.
                <p className="text-xs mt-1">
                  WIW locations are synced automatically. Use the Governance Console to assign unclaimed locations.
                </p>
              </div>
            )}
          </div>
        )}

        {/* System-wide alerts (compact, not warning banners) */}
        {!isLoading && (syswidePending > 0 || syswideUnmapped > 0) && (
          <div className="flex flex-wrap gap-2 pt-1 border-t">
            <p className="text-xs text-muted-foreground w-full">System-wide unresolved:</p>
            {syswidePending > 0 && (
              <button
                type="button"
                onClick={() => navigate("/scheduling/wiw-governance?status=pending_mapping")}
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                data-testid="link-syswide-pending"
              >
                <Clock className="h-3 w-3" />
                {syswidePending} WIW location{syswidePending !== 1 ? "s" : ""} pending mapping
              </button>
            )}
            {syswideUnmapped > 0 && (
              <button
                type="button"
                onClick={() => navigate("/scheduling/wiw-governance?status=unmapped")}
                className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline"
                data-testid="link-syswide-unmapped"
              >
                <AlertTriangle className="h-3 w-3" />
                {syswideUnmapped} WIW location{syswideUnmapped !== 1 ? "s" : ""} need{syswideUnmapped === 1 ? "s" : ""} review
              </button>
            )}
          </div>
        )}
      </CardContent>

      {/* Status change confirmation dialog */}
      <StatusChangeDialog
        open={!!dialogLoc}
        location={dialogLoc}
        targetStatus={dialogStatus}
        accountId={accountId}
        onConfirm={handleConfirm}
        onClose={() => setDialogLoc(null)}
        isPending={updateMutation.isPending}
      />
    </Card>
  );
}
