/**
 * WIW Location Governance Console
 * Global admin view for all WIW locations and their governance status.
 * Route: /scheduling/wiw-governance
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  CheckCircle2, Clock, AlertTriangle, MoreHorizontal, RefreshCw,
  XCircle, FlaskConical, Ban, Loader2, Search, Shield, Building2,
  ChevronLeft, ChevronRight, Globe,
} from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { US_TIMEZONES } from "@/lib/timezoneUtils";

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  active_mapped:      { label: "Active Mapped",       color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",  icon: CheckCircle2 },
  pending_mapping:    { label: "Pending Mapping",     color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",     icon: Clock },
  unmapped:           { label: "Unmapped",            color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: AlertTriangle },
  test_location:      { label: "Test Location",       color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: FlaskConical },
  cancelled_inactive: { label: "Cancelled/Inactive",  color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",        icon: Ban },
};

const ALL_STATUSES = [
  { value: "all",               label: "All Statuses" },
  { value: "active_mapped",     label: "Active Mapped" },
  { value: "pending_mapping",   label: "Pending Mapping" },
  { value: "unmapped",          label: "Unmapped" },
  { value: "test_location",     label: "Test Location" },
  { value: "cancelled_inactive", label: "Cancelled/Inactive" },
  { value: "missing_timezone",  label: "Missing Timezone" },
];

const WORKPLACES = [
  { value: "all",      label: "All Workplaces" },
  { value: "3725440",  label: "Main" },
  { value: "4244009",  label: "IL & NY" },
  { value: "4280572",  label: "CA" },
];

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

// ── Account search for mapping dialog ─────────────────────────────────────────
function AccountSearchDialog({
  open, onSelect, onClose,
}: { open: boolean; onSelect: (account: any) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery<{ records: any[] }>({
    queryKey: ["/api/customers", "governance-search", debouncedSearch],
    queryFn: () => fetch(
      `/api/customers?limit=20&search=${encodeURIComponent(debouncedSearch)}`,
      { credentials: "include" }
    ).then(r => r.json()),
    enabled: open,
  });

  const accounts: any[] = data?.records ?? [];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-account-search">
        <DialogHeader>
          <DialogTitle>Select Account to Map</DialogTitle>
          <DialogDescription>Search for the DriverHub account this WIW location belongs to.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by account name or number…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              data-testid="input-account-search"
            />
          </div>
          {isLoading ? (
            <div className="py-6 flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />Loading…
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">No accounts found.</div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1">
              {accounts.map(acc => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => onSelect(acc)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover-elevate"
                  data-testid={`button-select-account-${acc.id}`}
                >
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{acc.customerName ?? acc.customer_name}</p>
                    <p className="text-xs text-muted-foreground">#{acc.customerNumber ?? acc.customer_number}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Status change dialog ──────────────────────────────────────────────────────
interface StatusChangeDialogState {
  open: boolean;
  location: any;
  targetStatus: string;
  targetAccount?: any;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WiwGovernanceConsole() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [location] = useLocation();

  // Parse URL params
  const urlParams = new URLSearchParams(location.split("?")[1] ?? "");
  const [statusFilter,    setStatusFilter]    = useState(urlParams.get("status") || "all");
  const [workplaceFilter, setWorkplaceFilter] = useState("all");
  const [searchTerm,      setSearchTerm]      = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page,            setPage]            = useState(0);
  const PAGE_SIZE = 50;

  // Dialog states
  const [statusDialog, setStatusDialog] = useState<StatusChangeDialogState>({ open: false, location: null, targetStatus: "" });
  const [reasonText,   setReasonText]   = useState("");
  const [accountSearch, setAccountSearch] = useState(false);
  const [pendingMapping, setPendingMapping] = useState<{ location: any; targetStatus: string } | null>(null);

  // Timezone edit state
  const [tzEditTarget, setTzEditTarget] = useState<any | null>(null);
  const [tzValue, setTzValue] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const { data, isLoading, isError, refetch } = useQuery<{ total: number; records: any[] }>({
    queryKey: ["/api/scheduling/wiw-governance", statusFilter, workplaceFilter, debouncedSearch, page],
    queryFn: () => {
      const p = new URLSearchParams();
      if (statusFilter    !== "all") p.set("status",      statusFilter);
      if (workplaceFilter !== "all") p.set("workplaceId", workplaceFilter);
      if (debouncedSearch)           p.set("search",      debouncedSearch);
      p.set("limit",  String(PAGE_SIZE));
      p.set("offset", String(page * PAGE_SIZE));
      return fetch(`/api/scheduling/wiw-governance?${p}`, { credentials: "include" }).then(r => r.json());
    },
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
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw-governance"] });
      toast({ title: "Location status updated" });
      setStatusDialog({ open: false, location: null, targetStatus: "" });
      setReasonText("");
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });

  const tzMutation = useMutation({
    mutationFn: async ({ wiwLocationId, timezone }: { wiwLocationId: string; timezone: string | null }) => {
      const res = await apiRequest("PATCH", `/api/scheduling/wheniwork/wiw-locations/${wiwLocationId}/timezone`, { timezone });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw-governance"] });
      toast({ title: "Timezone updated", description: "Location timezone saved successfully." });
      setTzEditTarget(null);
      setTzValue("");
    },
    onError: (e: any) => {
      toast({ title: "Timezone update failed", description: e.message, variant: "destructive" });
    },
  });

  function openStatusDialog(loc: any, targetStatus: string) {
    if (targetStatus === "active_mapped") {
      setPendingMapping({ location: loc, targetStatus });
      setAccountSearch(true);
    } else {
      setStatusDialog({ open: true, location: loc, targetStatus });
      setReasonText("");
    }
  }

  function handleAccountSelected(account: any) {
    setAccountSearch(false);
    if (pendingMapping) {
      setStatusDialog({ open: true, location: pendingMapping.location, targetStatus: "active_mapped", targetAccount: account });
      setReasonText("");
    }
    setPendingMapping(null);
  }

  function handleConfirmStatusChange() {
    if (!statusDialog.location) return;
    const isMapping = statusDialog.targetStatus === "active_mapped";
    updateMutation.mutate({
      mapId:             statusDialog.location.id,
      wiwLocationStatus: statusDialog.targetStatus,
      statusReason:      reasonText || null,
      driverHubAccountId: isMapping
        ? (statusDialog.targetAccount?.id ?? null)
        : statusDialog.targetStatus === "unmapped" ? null : undefined,
    });
  }

  const records: any[] = data?.records ?? [];
  const total          = data?.total ?? 0;
  const totalPages     = Math.ceil(total / PAGE_SIZE);

  const actionLabel: Record<string, string> = {
    active_mapped:      "Map to Account",
    pending_mapping:    "Set Pending Mapping",
    unmapped:           "Reset to Unmapped",
    test_location:      "Mark as Test Location",
    cancelled_inactive: "Mark as Cancelled/Inactive",
  };

  // Summary counts from current data
  const statusCounts = records.reduce((acc, r) => {
    acc[r.wiwLocationStatus] = (acc[r.wiwLocationStatus] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            WIW Location Governance Console
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Classify and manage all WIW locations. Only <span className="font-medium text-foreground">Active Mapped</span> locations feed live reporting.
          </p>
        </div>
        <Button variant="ghost" size="default" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-governance">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px] space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Search</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Location name or WIW ID…"
                  className="pl-9"
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
                  data-testid="input-governance-search"
                />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Status</p>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-48" data-testid="select-gov-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Workplace</p>
              <Select value={workplaceFilter} onValueChange={v => { setWorkplaceFilter(v); setPage(0); }}>
                <SelectTrigger className="w-44" data-testid="select-gov-workplace-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKPLACES.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">
              {isLoading ? "Loading…" : `${total} WIW Location${total !== 1 ? "s" : ""}`}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusCounts).map(([s, n]) => (
                <StatusBadge key={s} status={s} />
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 flex items-center justify-center text-muted-foreground text-sm gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />Loading…
            </div>
          ) : isError ? (
            <div className="py-8 flex items-center justify-center gap-2 text-sm" data-testid="error-governance">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
              <span className="text-muted-foreground">Unable to load locations.</span>
              <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : records.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              <Shield className="h-10 w-10 mx-auto mb-3 opacity-20" />
              No locations found for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>WIW Location</TableHead>
                    <TableHead>Workplace</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Timezone</TableHead>
                    <TableHead>Mapped Account</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Reviewed</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map(loc => (
                    <TableRow key={loc.id} data-testid={`row-governance-${loc.id}`}>
                      <TableCell>
                        <p className="text-sm font-medium">{loc.wiwLocationName}</p>
                        <p className="text-xs text-muted-foreground">WIW ID: {loc.wiwExternalId ?? loc.wiwLocationId ?? "—"}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{loc.wiwWorkplaceName ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={loc.wiwLocationStatus} /></TableCell>
                      <TableCell>
                        {loc.locationTimezone ? (
                          <span className="text-xs font-mono text-foreground">{loc.locationTimezone}</span>
                        ) : (
                          <button
                            onClick={() => { setTzEditTarget(loc); setTzValue(""); }}
                            className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover-elevate rounded px-1 py-0.5"
                            data-testid={`button-set-tz-${loc.id}`}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Not Set
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        {loc.accountName ? (
                          <div>
                            <p className="text-sm font-medium">{loc.accountName}</p>
                            {loc.customerNumber && <p className="text-xs text-muted-foreground">#{loc.customerNumber}</p>}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {loc.lastActivityAt ? format(new Date(loc.lastActivityAt), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={loc.statusReason ?? undefined}>
                        {loc.statusReason ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {loc.lastReviewedAt ? format(new Date(loc.lastReviewedAt), "MMM d") : "—"}
                        {loc.reviewedByName && <span className="block opacity-70">{loc.reviewedByName}</span>}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-gov-actions-${loc.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openStatusDialog(loc, "active_mapped")} data-testid={`gov-action-map-${loc.id}`}>
                              <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                              Map to Account
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openStatusDialog(loc, "pending_mapping")} data-testid={`gov-action-pending-${loc.id}`}>
                              <Clock className="h-4 w-4 mr-2 text-blue-500" />
                              Set Pending Mapping
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openStatusDialog(loc, "test_location")} data-testid={`gov-action-test-${loc.id}`}>
                              <FlaskConical className="h-4 w-4 mr-2 text-purple-500" />
                              Mark as Test Location
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openStatusDialog(loc, "cancelled_inactive")} data-testid={`gov-action-cancelled-${loc.id}`}>
                              <Ban className="h-4 w-4 mr-2 text-red-500" />
                              Mark as Cancelled/Inactive
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openStatusDialog(loc, "unmapped")} data-testid={`gov-action-reset-${loc.id}`}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Reset to Unmapped
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => { setTzEditTarget(loc); setTzValue(loc.locationTimezone ?? ""); }}
                              data-testid={`gov-action-tz-${loc.id}`}
                            >
                              <Globe className="h-4 w-4 mr-2 text-blue-500" />
                              {loc.locationTimezone ? "Edit Timezone" : "Set Timezone"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="default" onClick={() => setPage(p => p - 1)} disabled={page === 0} data-testid="button-prev-page">
                  <ChevronLeft className="h-4 w-4 mr-1" />Prev
                </Button>
                <Button variant="outline" size="default" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1} data-testid="button-next-page">
                  Next<ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account search dialog (for Map to Account action) */}
      <AccountSearchDialog
        open={accountSearch}
        onSelect={handleAccountSelected}
        onClose={() => { setAccountSearch(false); setPendingMapping(null); }}
      />

      {/* Status change confirmation dialog */}
      <Dialog open={statusDialog.open} onOpenChange={v => { if (!v) setStatusDialog(d => ({ ...d, open: false })); }}>
        <DialogContent className="max-w-md" data-testid="dialog-gov-status-change">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {statusDialog.targetStatus && (() => {
                const m = STATUS_META[statusDialog.targetStatus];
                const Icon = m?.icon;
                return Icon ? <Icon className="h-4 w-4" /> : null;
              })()}
              {actionLabel[statusDialog.targetStatus] ?? "Update Status"}
            </DialogTitle>
            <DialogDescription>
              {statusDialog.location && (
                <>
                  <span className="font-medium">{statusDialog.location.wiwLocationName}</span>
                  {statusDialog.targetStatus === "active_mapped" && statusDialog.targetAccount && (
                    <span className="block mt-1 text-xs">
                      Mapping to: <span className="font-medium">{statusDialog.targetAccount.customerName ?? statusDialog.targetAccount.customer_name}</span>
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Reason (optional)</p>
            <Textarea
              placeholder="Add a classification note…"
              value={reasonText}
              onChange={e => setReasonText(e.target.value)}
              className="text-sm h-20"
              data-testid="input-gov-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(d => ({ ...d, open: false }))} disabled={updateMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleConfirmStatusChange} disabled={updateMutation.isPending} data-testid="button-confirm-gov-action">
              {updateMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating…</>
                : actionLabel[statusDialog.targetStatus] ?? "Confirm"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Timezone edit dialog */}
      <Dialog open={!!tzEditTarget} onOpenChange={v => { if (!v) { setTzEditTarget(null); setTzValue(""); } }}>
        <DialogContent className="max-w-md" data-testid="dialog-tz-edit">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" />
              Set Location Timezone
            </DialogTitle>
            <DialogDescription>
              Enter the IANA timezone for <span className="font-medium">{tzEditTarget?.wiwLocationName}</span>.
              This corrects time display when WhenIWork did not supply a timezone for this location.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Timezone</p>
              <Select value={tzValue} onValueChange={setTzValue} data-testid="select-tz-value">
                <SelectTrigger data-testid="trigger-tz-value">
                  <SelectValue placeholder="Select a timezone…" />
                </SelectTrigger>
                <SelectContent>
                  {US_TIMEZONES.map(({ iana, label, note }) => (
                    <SelectItem key={iana} value={iana} data-testid={`tz-option-${iana.replace(/\//g, "-")}`}>
                      <span className="flex flex-col">
                        <span>{label}</span>
                        {note && <span className="text-xs text-muted-foreground">{note}</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {tzValue && (
              <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium">IANA identifier: </span>
                <span className="font-mono">{tzValue}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTzEditTarget(null); setTzValue(""); }} disabled={tzMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => tzMutation.mutate({ wiwLocationId: tzEditTarget?.wiwLocationId, timezone: tzValue.trim() || null })}
              disabled={tzMutation.isPending || !tzValue.trim()}
              data-testid="button-confirm-tz"
            >
              {tzMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save Timezone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
