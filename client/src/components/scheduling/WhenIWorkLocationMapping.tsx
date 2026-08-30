/**
 * WhenIWork Location Mapping Console (Phase 4 – Platform Admin)
 *
 * Platform-wide view of all WIW location → DriverHub account mappings.
 * - Search by location name
 * - Filter by status (all / mapped / unmapped / ambiguous)
 * - Per-row: Map, Unmap, Reassign actions
 * - Bulk "Run Auto-Match"
 * - Paginated table
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  MapPin, RefreshCw, Search, Link2, Link2Off, AlertTriangle,
  CheckCircle2, XCircle, HelpCircle, ChevronLeft, ChevronRight,
  Hash, Building2, Clock,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type MappingStatus = "mapped" | "unmapped" | "ambiguous";
type MatchedBy = "store_number" | "exact_name" | "normalized_name" | "manual" | "unresolved";

interface LocationMapping {
  id: string;
  wiwWorkplaceId: number | null;
  wiwLocationId: string;
  wiwLocationName: string;
  driverHubAccountId: string | null;
  accountName: string | null;
  customerNumber: string | null;
  mappingStatus: MappingStatus;
  confidenceScore: number;
  matchReason: string | null;
  matchedBy: MatchedBy;
  notes: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
}

interface MappingResponse {
  mappings: LocationMapping[];
  total: number;
}

interface AutoMatchResult {
  processed: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  errors: number;
}

interface CustomerItem {
  id: string;
  customerName: string;
  customerNumber: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

function statusBadge(status: MappingStatus) {
  if (status === "mapped")
    return (
      <Badge className="gap-1 text-xs" variant="secondary" data-testid={`badge-status-${status}`}>
        <CheckCircle2 className="w-3 h-3 text-green-500" />
        Mapped
      </Badge>
    );
  if (status === "ambiguous")
    return (
      <Badge className="gap-1 text-xs" variant="secondary" data-testid={`badge-status-${status}`}>
        <HelpCircle className="w-3 h-3 text-amber-500" />
        Ambiguous
      </Badge>
    );
  return (
    <Badge className="gap-1 text-xs" variant="secondary" data-testid={`badge-status-${status}`}>
      <XCircle className="w-3 h-3 text-muted-foreground" />
      Unmapped
    </Badge>
  );
}

function matchedByLabel(m: MatchedBy) {
  const map: Record<MatchedBy, string> = {
    store_number:    "Store #",
    exact_name:      "Exact Name",
    normalized_name: "Normalized",
    manual:          "Manual",
    unresolved:      "—",
  };
  return map[m] ?? "—";
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function workplaceName(id: number | null) {
  if (!id) return "—";
  const names: Record<number, string> = {
    3725440: "Main",
    4244009: "IL & NY",
    4280572: "CA",
  };
  return names[id] ?? `WP ${id}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export function WhenIWorkLocationMapping() {
  const { toast } = useToast();

  const [filterStatus, setFilterStatus] = useState<"all" | MappingStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Reassign dialog state
  const [reassignRow, setReassignRow]   = useState<LocationMapping | null>(null);
  const [reassignAcct, setReassignAcct] = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data, isLoading, refetch } = useQuery<MappingResponse>({
    queryKey: ["/api/scheduling/wiw-location-map", filterStatus, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (filterStatus !== "all") params.set("status", filterStatus);
      const r = await fetch(`/api/scheduling/wiw-location-map?${params}`, { credentials: "include" });
      if (!r.ok) return { mappings: [], total: 0 };
      return r.json();
    },
  });

  const { data: customers = [] } = useQuery<CustomerItem[]>({
    queryKey: ["/api/corporate/customers", "minimal"],
    queryFn: async () => {
      const r = await fetch("/api/corporate/customers", { credentials: "include" });
      if (!r.ok) return [];
      const list = await r.json();
      return (Array.isArray(list) ? list : []).map((c: any) => ({
        id: c.id,
        customerName: c.customer_name ?? c.customerName ?? "",
        customerNumber: c.customer_number ?? c.customerNumber ?? null,
      }));
    },
  });

  const allMappings = data?.mappings ?? [];
  const total       = data?.total ?? 0;
  const pageCount   = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Client-side search filter on top of the server response
  const filtered = useMemo(() => {
    if (!search.trim()) return allMappings;
    const q = search.toLowerCase();
    return allMappings.filter(m =>
      m.wiwLocationName.toLowerCase().includes(q) ||
      (m.accountName ?? "").toLowerCase().includes(q) ||
      (m.customerNumber ?? "").includes(q) ||
      m.wiwLocationId.includes(q)
    );
  }, [allMappings, search]);

  // Summary counts
  const counts = useMemo(() => ({
    mapped:    allMappings.filter(m => m.mappingStatus === "mapped").length,
    unmapped:  allMappings.filter(m => m.mappingStatus === "unmapped").length,
    ambiguous: allMappings.filter(m => m.mappingStatus === "ambiguous").length,
  }), [allMappings]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/scheduling/wiw-location-map/auto-match", {
        dryRun: false, onlyUnmapped: false,
      });
      return r.json() as Promise<AutoMatchResult>;
    },
    onSuccess: (res) => {
      toast({ title: "Auto-match complete", description: `${res.matched} mapped, ${res.unmatched} unmapped, ${res.ambiguous} ambiguous.` });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw-location-map"] });
    },
    onError: () => toast({ variant: "destructive", title: "Auto-match failed" }),
  });

  const patchMutation = useMutation({
    mutationFn: async ({ mapId, accountId }: { mapId: string; accountId: string | null }) => {
      const r = await apiRequest("PATCH", `/api/scheduling/wiw-location-map/${mapId}`, {
        driverHubAccountId: accountId,
      });
      if (!r.ok) throw new Error("Failed to update mapping");
    },
    onSuccess: () => {
      toast({ title: "Mapping updated" });
      setReassignRow(null);
      setReassignAcct("");
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw-location-map"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts/wiw-location-map"] });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to update mapping" }),
  });

  function handleUnmap(row: LocationMapping) {
    patchMutation.mutate({ mapId: row.id, accountId: null });
  }

  function handleReassignSave() {
    if (!reassignRow) return;
    patchMutation.mutate({ mapId: reassignRow.id, accountId: reassignAcct || null });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" data-testid="wiw-location-mapping-console">

      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search location or account…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="pl-8"
              data-testid="input-location-search"
            />
          </div>
          <Tabs value={filterStatus} onValueChange={v => { setFilterStatus(v as any); setPage(0); }}>
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-loc-all">All <Badge variant="secondary" className="ml-1.5 text-xs">{total}</Badge></TabsTrigger>
              <TabsTrigger value="mapped" data-testid="tab-loc-mapped">
                Mapped <Badge variant="secondary" className="ml-1.5 text-xs">{counts.mapped}</Badge>
              </TabsTrigger>
              <TabsTrigger value="unmapped" data-testid="tab-loc-unmapped">
                Unmapped <Badge variant="secondary" className="ml-1.5 text-xs">{counts.unmapped}</Badge>
              </TabsTrigger>
              {counts.ambiguous > 0 && (
                <TabsTrigger value="ambiguous" data-testid="tab-loc-ambiguous">
                  Ambiguous <Badge variant="secondary" className="ml-1.5 text-xs">{counts.ambiguous}</Badge>
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => autoMatchMutation.mutate()}
          disabled={autoMatchMutation.isPending}
          data-testid="button-run-auto-match-console"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${autoMatchMutation.isPending ? "animate-spin" : ""}`} />
          {autoMatchMutation.isPending ? "Running…" : "Run Auto-Match"}
        </Button>
      </div>

      {/* Exception notice for unmapped */}
      {counts.unmapped > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            <span className="font-medium">{counts.unmapped} location{counts.unmapped !== 1 ? "s" : ""} unmapped.</span>
            {" "}Shifts and time records at these locations will be placed in the exception queue until mapped.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[30px] pl-4">#</TableHead>
              <TableHead>WIW Location</TableHead>
              <TableHead>Workplace</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Mapped Account</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Matched By</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead className="text-right pr-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  No locations found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row, idx) => (
                <TableRow key={row.id} data-testid={`row-loc-map-${row.id}`} className="text-sm">
                  <TableCell className="pl-4 text-muted-foreground text-xs">
                    {page * PAGE_SIZE + idx + 1}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium leading-tight">{row.wiwLocationName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Hash className="w-3 h-3" />{row.wiwLocationId}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {workplaceName(row.wiwWorkplaceId)}
                  </TableCell>
                  <TableCell>{statusBadge(row.mappingStatus)}</TableCell>
                  <TableCell>
                    {row.accountName ? (
                      <div>
                        <p className="font-medium leading-tight">{row.accountName}</p>
                        {row.customerNumber && (
                          <p className="text-xs text-muted-foreground">#{row.customerNumber}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.confidenceScore > 0 ? (
                      <span className={`text-sm font-medium ${
                        row.confidenceScore >= 90 ? "text-green-600 dark:text-green-400" :
                        row.confidenceScore >= 70 ? "text-amber-600 dark:text-amber-400" :
                        "text-muted-foreground"
                      }`}>
                        {row.confidenceScore}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{matchedByLabel(row.matchedBy)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{fmtDate(row.lastSeenAt)}</span>
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setReassignRow(row); setReassignAcct(row.driverHubAccountId ?? ""); }}
                        disabled={patchMutation.isPending}
                        data-testid={`button-reassign-${row.id}`}
                      >
                        <Building2 className="w-3.5 h-3.5 mr-1" />
                        {row.mappingStatus === "mapped" ? "Reassign" : "Map"}
                      </Button>
                      {row.mappingStatus === "mapped" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUnmap(row)}
                          disabled={patchMutation.isPending}
                          data-testid={`button-unmap-${row.id}`}
                        >
                          <Link2Off className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {Math.min(page * PAGE_SIZE + 1, total)}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="button-page-prev">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-2">{page + 1} / {pageCount}</span>
            <Button size="icon" variant="ghost" disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)} data-testid="button-page-next">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Reassign / Map dialog */}
      <Dialog open={!!reassignRow} onOpenChange={open => { if (!open) { setReassignRow(null); setReassignAcct(""); } }}>
        <DialogContent data-testid="dialog-reassign-location">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {reassignRow?.mappingStatus === "mapped" ? "Reassign" : "Map"} WIW Location
            </DialogTitle>
            <DialogDescription>
              Select the DriverHub account to map <strong>{reassignRow?.wiwLocationName}</strong> to.
              All shifts and time records at this location will be attributed to the selected account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Hash className="w-3.5 h-3.5" />
                <span>Location ID: {reassignRow?.wiwLocationId}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="w-3.5 h-3.5" />
                <span>Workplace: {workplaceName(reassignRow?.wiwWorkplaceId ?? null)}</span>
              </div>
              {reassignRow?.lastSeenAt && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Last seen: {fmtDate(reassignRow.lastSeenAt)}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Assign to Account</p>
              <Select value={reassignAcct || "__none__"} onValueChange={v => setReassignAcct(v === "__none__" ? "" : v)}>
                <SelectTrigger data-testid="select-reassign-account">
                  <SelectValue placeholder="Select an account…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unmap (no account)</SelectItem>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id} data-testid={`option-acct-${c.id}`}>
                      {c.customerName}{c.customerNumber ? ` — #${c.customerNumber}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setReassignRow(null); setReassignAcct(""); }}>Cancel</Button>
            <Button
              onClick={handleReassignSave}
              disabled={patchMutation.isPending}
              data-testid="button-confirm-reassign"
            >
              {patchMutation.isPending ? "Saving…" : "Save Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
