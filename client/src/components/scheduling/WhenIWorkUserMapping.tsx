/**
 * WhenIWorkUserMapping  (Ticket 2 — Full Active Driver Reconciliation)
 *
 * Reconciliation report: links WIW users to DriverHub drivers via four passes:
 *   1. employee_code  2. email  3. phone  4. name (ambiguity-aware)
 *
 * Each WIW user is shown with:
 *  - WIW user_id (external_user_id)
 *  - Full name + WIW status (active / inactive / deleted)
 *  - Email + phone
 *  - Match status: matched | unmatched | ambiguous
 *  - Match method: employee_code | email | phone | name | manual
 *  - Linked DriverHub driver (number + name)
 *  - Manual override button
 *
 * Ambiguous = name matched multiple drivers; driver_id is NOT written.
 * No duplicate DriverHub drivers are ever auto-created.
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Users, CheckCircle2, XCircle, AlertCircle, Loader2, Search, Link2, Link2Off,
  RefreshCw, Sparkles, AlertTriangle, Eye, ArrowRight, Mail, Hash, Phone,
  Zap, ShieldAlert, Activity, UserX, Building2, Clock4, CalendarCheck,
} from "lucide-react";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

type MatchMethod = "employee_code" | "email" | "phone" | "name" | "manual" | "unmatched";
type MatchStatus = "matched" | "unmatched" | "ambiguous";
type WiwIntegrationStatus = "ACTIVE_DRIVER" | "EXCLUDED_NON_DRIVER" | "PENDING_REVIEW";

interface WiwUserWithMatch {
  id: string;
  externalUserId: string;
  name: string;
  email: string | null;
  phone: string | null;
  employeeCode: string | null;
  driverId: string | null;
  matchMethod: MatchMethod | null;
  matchStatus: MatchStatus;
  syncedAt: string;
  wiwStatus: "active" | "inactive" | "deleted";
  wiwAccountId: number | null;
  driverName: string | null;
  driverNumber: string | null;
  driverStatus: string | null;
  driverEmail: string | null;
  driverPhone: string | null;
  lastSeenAt: string | null;
  workplaceName: string | null;
  wiwIntegrationStatus: WiwIntegrationStatus;
}

interface MappingSummary {
  total: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  matchRate: number;
  activeDriverCount?: number;
  excludedCount?: number;
  pendingReviewCount?: number;
}

interface MappingResponse {
  users: WiwUserWithMatch[];
  summary: MappingSummary;
}

interface DriverSearchItem {
  id: string;
  displayName: string;
  employeeId: string | null;
  status: string;
}

interface PreviewDetail {
  wiwUserId: string;
  wiwEmail: string | null;
  wiwPhone: string | null;
  name: string;
  method: MatchMethod | "skipped";
  matchStatus: MatchStatus;
  driverId: string | null;
  driverName: string | null;
  driverNumber: string | null;
  driverEmail: string | null;
  ambiguousCandidates?: string[];
}

interface PreviewResult {
  attempted: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  alreadyMatched: number;
  details: PreviewDetail[];
}

type FilterTab = "all" | "matched" | "unmatched" | "ambiguous" | "no_wiw" | "excluded";

interface DriverWithoutWiw {
  driverId: string;
  driverNumber: string | null;
  driverName: string;
  driverClassification: string;
  market: string;
  status: string;
  email: string | null;
  phone: string | null;
  accountName: string | null;
  wiwSyncStatus: string;
}

interface NoWiwResponse {
  total: number;
  employeeCount: number;
  icCount: number;
  drivers: DriverWithoutWiw[];
}

interface SyncValidation {
  linkedDrivers: number;
  totalActiveDrivers: number;
  unlinkedDrivers: number;
  linkRate: number;
  driversWithUpcomingShifts: number;
  driversWithClockActivity: number;
  accountsWithWiwCoverage: number;
  dataCutoff: string;
}

interface FullSyncResult {
  userSync: { fetched: number; inserted: number; updated: number; errors: number; errorMessages: string[] };
  matchResult: { attempted: number; matched: number; alreadyMatched: number; unmatched: number; ambiguous: number };
  summary: MappingSummary;
}

interface CreateAndLinkResult {
  driverId: string;
  driverNumber: string;
  wiwUserId: string;
  wiwExternalId: string;
  message: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLastSeen(iso: string | null): { label: string; isRecent: boolean; isStale: boolean } {
  if (!iso) return { label: "No activity", isRecent: false, isStale: true };
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return {
    label: `${mm}/${dd}/${yyyy}`,
    isRecent: diffDays <= 30,
    isStale: diffDays > 30,
  };
}

// ── Badge sub-components ──────────────────────────────────────────────────────

function WiwStatusBadge({ status }: { status: "active" | "inactive" | "deleted" }) {
  if (status === "active") return (
    <Badge className="text-xs bg-green-600 dark:bg-green-700 text-white border-0">active</Badge>
  );
  if (status === "deleted") return (
    <Badge variant="outline" className="text-xs text-rose-600 border-rose-300 dark:border-rose-700">deleted</Badge>
  );
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">inactive</Badge>
  );
}

function MatchStatusBadge({ status }: { status: MatchStatus }) {
  if (status === "matched") return (
    <Badge className="gap-1 bg-green-600 dark:bg-green-700 text-white border-0 text-xs whitespace-nowrap">
      <CheckCircle2 className="h-3 w-3" />
      Matched
    </Badge>
  );
  if (status === "ambiguous") return (
    <Badge className="gap-1 bg-orange-500 dark:bg-orange-600 text-white border-0 text-xs whitespace-nowrap">
      <AlertCircle className="h-3 w-3" />
      Ambiguous
    </Badge>
  );
  return (
    <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 text-xs whitespace-nowrap">
      <XCircle className="h-3 w-3" />
      Unmatched
    </Badge>
  );
}

function MethodBadge({ method }: { method: MatchMethod | null | "skipped" }) {
  if (!method || method === "unmatched" || method === "skipped") return null;
  if (method === "email") return (
    <Badge variant="outline" className="text-xs gap-1 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 whitespace-nowrap">
      <Mail className="h-3 w-3" />email
    </Badge>
  );
  if (method === "phone") return (
    <Badge variant="outline" className="text-xs gap-1 text-teal-600 dark:text-teal-400 border-teal-300 dark:border-teal-700 whitespace-nowrap">
      <Phone className="h-3 w-3" />phone
    </Badge>
  );
  if (method === "employee_code") return (
    <Badge variant="outline" className="text-xs gap-1 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700 whitespace-nowrap">
      <Hash className="h-3 w-3" />emp code
    </Badge>
  );
  if (method === "name") return (
    <Badge variant="outline" className="text-xs whitespace-nowrap">name</Badge>
  );
  if (method === "manual") return (
    <Badge variant="outline" className="text-xs gap-1 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700 whitespace-nowrap">
      <Link2 className="h-3 w-3" />manual
    </Badge>
  );
  return null;
}

// ── Preview Dialog ─────────────────────────────────────────────────────────────

interface PreviewDialogProps {
  preview: PreviewResult | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isConfirming: boolean;
  previewLimit: number;
  onChangeSampleSize: (n: number) => void;
  onReload: () => void;
  isLoading: boolean;
}

const SAMPLE_SIZES = [5, 10, 25, 50];

function PreviewDialog({
  preview, open, onClose, onConfirm, isConfirming,
  previewLimit, onChangeSampleSize, onReload, isLoading,
}: PreviewDialogProps) {
  const willLink   = preview?.details.filter(d => d.matchStatus === "matched") ?? [];
  const ambig      = preview?.details.filter(d => d.matchStatus === "ambiguous") ?? [];
  const noMatch    = preview?.details.filter(d => d.matchStatus === "unmatched") ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Preview Reconciliation — Sample of {previewLimit}
          </DialogTitle>
          <DialogDescription>
            Review proposed links before committing. Ambiguous name-only matches require manual assignment.
          </DialogDescription>
        </DialogHeader>

        {/* Sample size selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Sample size:</span>
          {SAMPLE_SIZES.map(n => (
            <Button
              key={n}
              variant="outline"
              size="sm"
              className={`h-7 px-2 text-xs ${previewLimit === n ? "bg-muted font-semibold" : ""}`}
              onClick={() => { onChangeSampleSize(n); onReload(); }}
              disabled={isLoading}
              data-testid={`button-sample-${n}`}
            >
              {n}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2 py-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : preview ? (
          <div className="space-y-4">
            {/* Summary strip */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-2">
                <p className="text-xl font-bold text-green-700 dark:text-green-300">{willLink.length}</p>
                <p className="text-xs text-muted-foreground">Will Link</p>
              </div>
              <div className={`rounded-lg p-2 ${ambig.length > 0 ? "bg-orange-50 dark:bg-orange-950/30" : "bg-muted/50"}`}>
                <p className={`text-xl font-bold ${ambig.length > 0 ? "text-orange-600 dark:text-orange-400" : ""}`}>{ambig.length}</p>
                <p className="text-xs text-muted-foreground">Ambiguous</p>
              </div>
              <div className={`rounded-lg p-2 ${noMatch.length > 0 ? "bg-amber-50 dark:bg-amber-950/30" : "bg-muted/50"}`}>
                <p className={`text-xl font-bold ${noMatch.length > 0 ? "text-amber-700 dark:text-amber-300" : ""}`}>{noMatch.length}</p>
                <p className="text-xs text-muted-foreground">No Match</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <p className="text-xl font-bold">{preview.alreadyMatched}</p>
                <p className="text-xs text-muted-foreground">Already Linked</p>
              </div>
            </div>

            {/* Match rows */}
            <ScrollArea className="h-72 rounded-md border">
              <div className="divide-y">
                {preview.details.map((d) => (
                  <div
                    key={d.wiwUserId}
                    className={`flex items-center gap-3 px-3 py-2.5 ${
                      d.matchStatus === "unmatched" ? "opacity-50" : ""
                    }`}
                    data-testid={`preview-row-${d.wiwUserId}`}
                  >
                    {/* WIW side */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[d.wiwEmail, d.wiwPhone].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>

                    {/* Status + method arrow */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <MatchStatusBadge status={d.matchStatus} />
                      {d.matchStatus !== "unmatched" && (
                        <>
                          <MethodBadge method={d.method} />
                          {d.matchStatus === "matched" && (
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </>
                      )}
                    </div>

                    {/* Driver side */}
                    {d.matchStatus === "matched" ? (
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-sm font-medium truncate">{d.driverName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[d.driverNumber, d.driverEmail].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    ) : d.matchStatus === "ambiguous" ? (
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-xs text-orange-600 dark:text-orange-400 italic">
                          {d.ambiguousCandidates?.length} drivers — assign manually
                        </p>
                      </div>
                    ) : (
                      <div className="flex-1" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {(noMatch.length > 0 || ambig.length > 0) && (
              <p className="text-xs text-muted-foreground">
                {ambig.length > 0 && (
                  <span className="text-orange-600 dark:text-orange-400 font-medium">
                    {ambig.length} ambiguous {ambig.length === 1 ? "record" : "records"} must be assigned manually.{" "}
                  </span>
                )}
                {noMatch.length > 0 && (
                  <span>
                    {noMatch.length} unmatched {noMatch.length === 1 ? "user" : "users"} can be linked manually below.
                  </span>
                )}
              </p>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={isConfirming}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onReload}
            disabled={isLoading || isConfirming}
            data-testid="button-preview-reload"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            New Sample
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isConfirming || isLoading || (willLink.length === 0)}
            data-testid="button-confirm-auto-match"
          >
            {isConfirming
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Link {willLink.length} Matched
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Driver picker dialog ───────────────────────────────────────────────────────

interface DriverPickerProps {
  wiwUser: WiwUserWithMatch | null;
  open: boolean;
  onClose: () => void;
  onSelect: (driverId: string | null) => void;
  isPending: boolean;
}

function DriverPickerDialog({ wiwUser, open, onClose, onSelect, isPending }: DriverPickerProps) {
  const [search, setSearch] = useState("");

  const { data: driverResults = [], isLoading: searching } = useQuery<DriverSearchItem[]>({
    queryKey: [`/api/drivers/search?q=${encodeURIComponent(search)}&active=true`],
    enabled: open && search.length >= 1,
  });

  const { data: recentDrivers = [] } = useQuery<DriverSearchItem[]>({
    queryKey: ["/api/drivers/search?q=&active=true"],
    enabled: open && search.length === 0,
  });

  const drivers = search.length >= 1 ? driverResults : recentDrivers.slice(0, 20);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" />
            Assign Driver
          </DialogTitle>
          <DialogDescription>
            {wiwUser
              ? `Linking WIW user "${wiwUser.name}"${wiwUser.email ? ` (${wiwUser.email})` : ""} to a DriverHub driver.`
              : "Search for a driver to link."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or employee ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              data-testid="input-driver-search"
              autoFocus
            />
          </div>

          <ScrollArea className="h-64 rounded-md border">
            {searching ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : drivers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                <Search className="h-6 w-6 mb-2 opacity-40" />
                <p className="text-sm">{search ? "No drivers found" : "Start typing to search"}</p>
              </div>
            ) : (
              <div className="p-1">
                {drivers.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onSelect(d.id)}
                    disabled={isPending}
                    className="w-full text-left px-3 py-2 rounded-md hover-elevate flex items-center justify-between gap-2 group"
                    data-testid={`driver-option-${d.id}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{d.displayName}</p>
                      {d.employeeId && (
                        <p className="text-xs text-muted-foreground">ID: {d.employeeId}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {d.status}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {wiwUser?.driverId && (
            <>
              <Separator />
              <Button
                variant="outline"
                className="w-full text-destructive border-destructive/30"
                onClick={() => onSelect(null)}
                disabled={isPending}
                data-testid="button-unmap-driver"
              >
                {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2Off className="h-4 w-4 mr-2" />}
                Remove existing mapping
              </Button>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function WhenIWorkUserMapping() {
  const { toast } = useToast();
  const [filterTab, setFilterTab]       = useState<FilterTab>("all");
  const [search, setSearch]             = useState("");
  const [pickerUser, setPickerUser]     = useState<WiwUserWithMatch | null>(null);
  const [previewOpen, setPreviewOpen]   = useState(false);
  const [previewLimit, setPreviewLimit] = useState(10);
  const [preview, setPreview]           = useState<PreviewResult | null>(null);
  const [fullSyncResult, setFullSyncResult] = useState<FullSyncResult | null>(null);
  const [noWiwSearch, setNoWiwSearch]   = useState("");
  const [workplaceFilter, setWorkplaceFilter] = useState<string>("all");
  const [lastSeenFilter, setLastSeenFilter]   = useState<"all" | "recent" | "stale">("all");
  const [createDriverOpen, setCreateDriverOpen] = useState(false);
  const [createDriverUser, setCreateDriverUser] = useState<WiwUserWithMatch | null>(null);
  const [createFirstName, setCreateFirstName]   = useState("");
  const [createLastName, setCreateLastName]     = useState("");
  const [createEmail, setCreateEmail]           = useState("");
  const [createPhone, setCreatePhone]           = useState("");

  // ── Query: load WIW users + summary ───────────────────────────────────────
  const isSpecialTab  = filterTab === "no_wiw" || filterTab === "excluded";
  const effectiveFilter = isSpecialTab ? "all" : filterTab;
  const integrationStatusParam = filterTab === "excluded" ? "EXCLUDED_NON_DRIVER" : "all";

  const { data, isLoading, refetch } = useQuery<MappingResponse>({
    queryKey: ["/api/scheduling/wheniwork/users", effectiveFilter, integrationStatusParam],
    queryFn: async () => {
      const res = await fetch(
        `/api/scheduling/wheniwork/users?filter=${effectiveFilter}&integrationStatus=${integrationStatusParam}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load WIW users");
      return res.json();
    },
    enabled: filterTab !== "no_wiw",
  });

  // ── Mutation: set integration status (Exclude / Restore) ──────────────────
  const integrationStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: WiwIntegrationStatus }) =>
      apiRequest("PATCH", `/api/scheduling/wheniwork/users/${id}/integration-status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/users"] });
      toast({ title: "Integration status updated" });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err?.message, variant: "destructive" }),
  });

  // ── Query: DriverHub drivers with no WIW match ─────────────────────────────
  const { data: noWiwData, isLoading: noWiwLoading, refetch: refetchNoWiw } = useQuery<NoWiwResponse>({
    queryKey: ["/api/scheduling/wheniwork/drivers-without-wiw"],
    enabled: filterTab === "no_wiw",
  });

  // ── Query: post-sync validation ────────────────────────────────────────────
  const { data: validation, isLoading: validationLoading, refetch: refetchValidation } = useQuery<SyncValidation>({
    queryKey: ["/api/scheduling/wheniwork/sync-validation"],
    staleTime: 5 * 60 * 1000,
  });

  // ── Mutation: preview (dry-run) ────────────────────────────────────────────
  const previewMut = useMutation({
    mutationFn: async (limit: number) => {
      const res = await apiRequest("POST", "/api/scheduling/wheniwork/users/preview-match", { limit });
      return res.json() as Promise<PreviewResult>;
    },
    onSuccess: (result) => setPreview(result),
    onError: (err: any) => {
      toast({ title: "Preview failed", description: err?.message, variant: "destructive" });
    },
  });

  const openPreview  = () => { setPreviewOpen(true); previewMut.mutate(previewLimit); };
  const reloadPreview = () => previewMut.mutate(previewLimit);

  // ── Mutation: full sync (users → auto-match in one shot) ──────────────────
  const fullSyncMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scheduling/wheniwork/full-sync", {});
      return res.json() as Promise<FullSyncResult>;
    },
    onSuccess: (result) => {
      setFullSyncResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/drivers-without-wiw"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/sync-validation"] });
      toast({
        title: "Full sync complete",
        description: `Fetched ${result.userSync.fetched} WIW users. Matched ${result.matchResult.matched} drivers.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Full sync failed", description: err?.message, variant: "destructive" });
    },
  });

  // ── Mutation: commit all matches ───────────────────────────────────────────
  const autoMatchMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scheduling/wheniwork/users/auto-match", {});
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/drivers-without-wiw"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/sync-validation"] });
      setPreviewOpen(false);
      setPreview(null);
      toast({
        title: "Reconciliation complete",
        description: `Linked ${result.matched}, ${result.ambiguous ?? 0} ambiguous (need manual), ${result.unmatched} unmatched.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Reconciliation failed", description: err?.message, variant: "destructive" });
    },
  });

  // ── Mutation: manual map ───────────────────────────────────────────────────
  const mapMut = useMutation({
    mutationFn: async ({ wiwUserId, driverId }: { wiwUserId: string; driverId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/scheduling/wheniwork/users/${wiwUserId}/map`, { driverId });
      return res.json();
    },
    onSuccess: (updated, { driverId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/users"] });
      setPickerUser(null);
      toast({
        title: driverId ? "Driver assigned" : "Mapping removed",
        description: driverId
          ? `"${updated.name}" is now linked to ${updated.driverName ?? "driver"}.`
          : `"${updated.name}" mapping cleared.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update mapping", description: err?.message, variant: "destructive" });
    },
  });

  // ── Mutation: create driver from WIW user and link ────────────────────────
  const createAndLinkMut = useMutation({
    mutationFn: async (payload: {
      wiwUserId: string; firstName: string; lastName: string;
      email: string; phone: string;
    }) => {
      const res = await apiRequest("POST", "/api/scheduling/wheniwork/create-and-link", payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(err.message ?? "Failed to create driver");
      }
      return res.json() as Promise<CreateAndLinkResult>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/sync-validation"] });
      setCreateDriverOpen(false);
      setCreateDriverUser(null);
      toast({
        title: "Driver created and linked",
        description: result.message,
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create driver", description: err?.message, variant: "destructive" });
    },
  });

  function openCreateDriver(user: WiwUserWithMatch) {
    const parts = user.name.trim().split(" ");
    const fn = parts.slice(0, -1).join(" ") || parts[0] || "";
    const ln = parts.length > 1 ? parts[parts.length - 1] : "";
    setCreateFirstName(fn);
    setCreateLastName(ln);
    setCreateEmail(user.email ?? "");
    setCreatePhone(user.phone ?? "");
    setCreateDriverUser(user);
    setCreateDriverOpen(true);
  }

  // ── Filtered + searched rows ───────────────────────────────────────────────
  const rows = useMemo(() => {
    let users = data?.users ?? [];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      users = users.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.phone ?? "").includes(q) ||
          (u.externalUserId ?? "").includes(q) ||
          (u.employeeCode ?? "").toLowerCase().includes(q) ||
          (u.driverName ?? "").toLowerCase().includes(q) ||
          (u.driverNumber ?? "").toLowerCase().includes(q)
      );
    }

    // Workplace filter (only active on unmatched tab)
    if (filterTab === "unmatched" && workplaceFilter !== "all") {
      users = users.filter(u => u.workplaceName === workplaceFilter);
    }

    // Last-seen filter (only active on unmatched tab)
    if (filterTab === "unmatched" && lastSeenFilter !== "all") {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      users = users.filter(u => {
        const ts = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : 0;
        if (lastSeenFilter === "recent") return ts >= cutoff;
        return ts < cutoff || ts === 0;
      });
    }

    return users;
  }, [data?.users, search, filterTab, workplaceFilter, lastSeenFilter]);

  const summary = data?.summary;

  return (
    <div className="space-y-5" data-testid="wiw-user-mapping">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-semibold text-sm">Driver Reconciliation Report</p>
            <p className="text-xs text-muted-foreground">
              Full active driver sync — all WIW workplaces, no pilot limitation. Email → phone → name matching.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetch(); refetchNoWiw(); refetchValidation(); }}
            disabled={isLoading || noWiwLoading}
            data-testid="button-refresh-mappings"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openPreview}
            disabled={previewMut.isPending || isLoading || filterTab === "no_wiw"}
            data-testid="button-preview-match"
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => autoMatchMut.mutate()}
            disabled={autoMatchMut.isPending || isLoading}
            data-testid="button-auto-match"
          >
            {autoMatchMut.isPending
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Re-Match Only
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                onClick={() => { setFullSyncResult(null); fullSyncMut.mutate(); }}
                disabled={fullSyncMut.isPending}
                data-testid="button-full-sync"
              >
                {fullSyncMut.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <Zap className="h-3.5 w-3.5 mr-1.5" />}
                Full Sync
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              Syncs all active WIW users from every workplace, then auto-matches them to DriverHub drivers.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* KPI strip */}
      {isLoading ? (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold">{summary.total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Active WIW Users</p>
          </div>
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 text-center">
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{summary.matched}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Matched Drivers</p>
          </div>
          <div className={`p-3 rounded-lg text-center ${(summary.ambiguous ?? 0) > 0 ? "bg-orange-50 dark:bg-orange-950/30" : "bg-muted/50"}`}>
            <p className={`text-2xl font-bold ${(summary.ambiguous ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : ""}`}>
              {summary.ambiguous ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Ambiguous</p>
          </div>
          <div className={`p-3 rounded-lg text-center ${summary.unmatched > 0 ? "bg-amber-50 dark:bg-amber-950/30" : "bg-muted/50"}`}>
            <p className={`text-2xl font-bold ${summary.unmatched > 0 ? "text-amber-700 dark:text-amber-300" : ""}`}>
              {summary.unmatched}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Unmatched</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold">{summary.activeDriverCount ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Active Drivers</p>
          </div>
          <div className={`p-3 rounded-lg text-center ${(summary.excludedCount ?? 0) > 0 ? "bg-slate-100 dark:bg-slate-900/40" : "bg-muted/50"}`}>
            <p className="text-2xl font-bold text-muted-foreground">{summary.excludedCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Excluded</p>
          </div>
        </div>
      ) : null}

      {/* Full Sync Result Banner */}
      {fullSyncResult && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Full Sync Result</p>
            </div>
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setFullSyncResult(null)}>
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">WIW users fetched</span><span className="font-medium">{fullSyncResult.userSync.fetched}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">New inserts</span><span className="font-medium">{fullSyncResult.userSync.inserted}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Updated</span><span className="font-medium">{fullSyncResult.userSync.updated}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sync errors</span><span className={`font-medium ${fullSyncResult.userSync.errors > 0 ? "text-destructive" : ""}`}>{fullSyncResult.userSync.errors}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Drivers matched</span><span className="font-medium text-green-700 dark:text-green-400">{fullSyncResult.matchResult.matched}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Already matched</span><span className="font-medium">{fullSyncResult.matchResult.alreadyMatched}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Ambiguous</span><span className={`font-medium ${fullSyncResult.matchResult.ambiguous > 0 ? "text-orange-600 dark:text-orange-400" : ""}`}>{fullSyncResult.matchResult.ambiguous}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Unmatched</span><span className={`font-medium ${fullSyncResult.matchResult.unmatched > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{fullSyncResult.matchResult.unmatched}</span></div>
          </div>
          {fullSyncResult.userSync.errorMessages.length > 0 && (
            <div className="text-xs text-destructive bg-destructive/10 rounded p-2 space-y-0.5">
              {fullSyncResult.userSync.errorMessages.slice(0, 3).map((m, i) => <p key={i}>{m}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Post-Sync Validation Panel */}
      {!validationLoading && validation && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Sync Coverage Validation</p>
              <span className="text-xs text-muted-foreground">(data from {validation.dataCutoff})</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetchValidation()} data-testid="button-refresh-validation">
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="rounded-md bg-muted/40 p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Driver → Scheduling</p>
              </div>
              <p className="text-xl font-bold">{validation.linkedDrivers}<span className="text-xs text-muted-foreground font-normal">/{validation.totalActiveDrivers}</span></p>
              <p className="text-xs text-muted-foreground mt-0.5">{validation.linkRate}% linked to WIW</p>
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Account → Scheduling</p>
              </div>
              <p className="text-xl font-bold">{validation.accountsWithWiwCoverage}</p>
              <p className="text-xs text-muted-foreground mt-0.5">accounts with WIW locations</p>
            </div>
            <div className={`rounded-md p-3 text-center ${validation.driversWithUpcomingShifts > 0 ? "bg-green-50 dark:bg-green-950/20" : "bg-muted/40"}`}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Upcoming Shifts</p>
              </div>
              <p className={`text-xl font-bold ${validation.driversWithUpcomingShifts > 0 ? "text-green-700 dark:text-green-400" : ""}`}>{validation.driversWithUpcomingShifts}</p>
              <p className="text-xs text-muted-foreground mt-0.5">drivers with shifts (14d)</p>
            </div>
            <div className={`rounded-md p-3 text-center ${validation.driversWithClockActivity > 0 ? "bg-green-50 dark:bg-green-950/20" : "bg-muted/40"}`}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <Clock4 className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Clock Activity</p>
              </div>
              <p className={`text-xl font-bold ${validation.driversWithClockActivity > 0 ? "text-green-700 dark:text-green-400" : ""}`}>{validation.driversWithClockActivity}</p>
              <p className="text-xs text-muted-foreground mt-0.5">drivers clocked in (14d)</p>
            </div>
            <div className={`rounded-md p-3 text-center ${validation.unlinkedDrivers === 0 ? "bg-green-50 dark:bg-green-950/20" : "bg-amber-50 dark:bg-amber-950/20"}`}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <UserX className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No WIW Match</p>
              </div>
              <p className={`text-xl font-bold ${validation.unlinkedDrivers > 0 ? "text-amber-700 dark:text-amber-300" : "text-green-700 dark:text-green-400"}`}>{validation.unlinkedDrivers}</p>
              <p className="text-xs text-muted-foreground mt-0.5">drivers without WIW link</p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && summary?.total === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground border border-dashed rounded-lg">
          <Users className="h-8 w-8 mb-3 opacity-30" />
          <p className="text-sm font-medium">No When I Work users found</p>
          <p className="text-xs mt-1 max-w-xs">
            Sync users from When I Work via the API connection above, or import a schedule file to populate this list.
          </p>
        </div>
      )}

      {/* Ambiguous tip banner */}
      {!isLoading && summary && (summary.ambiguous ?? 0) > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
          <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
          <div className="text-xs text-orange-700 dark:text-orange-300">
            <span className="font-semibold">{summary.ambiguous} user{(summary.ambiguous ?? 0) !== 1 ? "s" : ""}</span>{" "}
            matched multiple drivers by name and require manual assignment. No driver was auto-linked to prevent incorrect records.
          </div>
        </div>
      )}

      {/* Unmatched tip */}
      {!isLoading && summary && summary.unmatched > 0 && (summary.ambiguous ?? 0) === 0 && summary.total > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 dark:text-amber-300">
            <span className="font-semibold">{summary.unmatched} user{summary.unmatched !== 1 ? "s" : ""}</span>{" "}
            could not be matched automatically. Use <strong>Run Reconciliation</strong> to attempt matching or assign manually.
          </div>
        </div>
      )}

      {/* Filters + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={filterTab} onValueChange={(v) => { setFilterTab(v as FilterTab); setSearch(""); setNoWiwSearch(""); }}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs h-6 px-3" data-testid="tab-wiw-all">
              All {summary ? `(${summary.total})` : ""}
            </TabsTrigger>
            <TabsTrigger value="matched" className="text-xs h-6 px-3" data-testid="tab-wiw-matched">
              Matched {summary ? `(${summary.matched})` : ""}
            </TabsTrigger>
            <TabsTrigger value="ambiguous" className="text-xs h-6 px-3" data-testid="tab-wiw-ambiguous">
              Ambiguous {summary ? `(${summary.ambiguous ?? 0})` : ""}
            </TabsTrigger>
            <TabsTrigger value="unmatched" className="text-xs h-6 px-3" data-testid="tab-wiw-unmatched">
              Unmatched {summary ? `(${summary.unmatched})` : ""}
            </TabsTrigger>
            <TabsTrigger value="excluded" className="text-xs h-6 px-3" data-testid="tab-wiw-excluded">
              Excluded {summary ? `(${summary.excludedCount ?? 0})` : ""}
            </TabsTrigger>
            <TabsTrigger value="no_wiw" className="text-xs h-6 px-3" data-testid="tab-wiw-no-wiw">
              <UserX className="h-3 w-3 mr-1" />
              No WIW Match {noWiwData ? `(${noWiwData.total})` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {filterTab !== "no_wiw" && filterTab !== "excluded" && (
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search name, email, phone, WIW ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              data-testid="input-wiw-search"
            />
          </div>
        )}
        {filterTab === "unmatched" && (
          <>
            <select
              value={workplaceFilter}
              onChange={(e) => setWorkplaceFilter(e.target.value)}
              className="h-8 text-xs rounded-md border border-input bg-background px-2 pr-7 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="select-wiw-workplace"
            >
              <option value="all">All Workplaces</option>
              {Array.from(new Set((data?.users ?? []).filter(u => u.matchStatus === "unmatched").map(u => u.workplaceName).filter(Boolean))).map(wp => (
                <option key={wp} value={wp!}>{wp}</option>
              ))}
            </select>
            <select
              value={lastSeenFilter}
              onChange={(e) => setLastSeenFilter(e.target.value as "all" | "recent" | "stale")}
              className="h-8 text-xs rounded-md border border-input bg-background px-2 pr-7 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="select-wiw-last-seen"
            >
              <option value="all">All Activity</option>
              <option value="recent">Recent (last 30d)</option>
              <option value="stale">Stale (30d+)</option>
            </select>
          </>
        )}
        {filterTab === "no_wiw" && (
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, driver number…"
              value={noWiwSearch}
              onChange={(e) => setNoWiwSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              data-testid="input-no-wiw-search"
            />
          </div>
        )}
      </div>

      {/* ── No WIW Match table ─────────────────────────────────────────────── */}
      {filterTab === "no_wiw" && (
        <>
          {noWiwLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : noWiwData && noWiwData.total > 0 ? (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>{noWiwData.employeeCount} employee driver{noWiwData.employeeCount !== 1 ? "s" : ""} and {noWiwData.icCount} IC driver{noWiwData.icCount !== 1 ? "s" : ""} have no WIW link.</span>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Driver</TableHead>
                      <TableHead className="text-xs w-[100px]">Classification</TableHead>
                      <TableHead className="text-xs w-[90px]">Market</TableHead>
                      <TableHead className="text-xs">Account</TableHead>
                      <TableHead className="text-xs">Contact</TableHead>
                      <TableHead className="text-xs w-[100px]">Status</TableHead>
                      <TableHead className="text-xs w-[70px] text-right">Profile</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(noWiwData.drivers ?? [])
                      .filter(d => {
                        if (!noWiwSearch.trim()) return true;
                        const q = noWiwSearch.toLowerCase();
                        return (
                          d.driverName.toLowerCase().includes(q) ||
                          (d.driverNumber ?? "").toLowerCase().includes(q) ||
                          (d.email ?? "").toLowerCase().includes(q) ||
                          (d.market ?? "").toLowerCase().includes(q) ||
                          (d.accountName ?? "").toLowerCase().includes(q)
                        );
                      })
                      .map((d) => (
                        <TableRow key={d.driverId} data-testid={`no-wiw-row-${d.driverId}`}>
                          <TableCell>
                            <p className="text-sm font-medium">{d.driverName}</p>
                            {d.driverNumber && <p className="text-xs text-muted-foreground">{d.driverNumber}</p>}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-xs whitespace-nowrap ${d.driverClassification === "Employee" ? "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300" : ""}`}
                            >
                              {d.driverClassification}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.market !== "—" ? d.market : "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.accountName ?? "—"}</TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              {d.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3 shrink-0" /><span className="truncate max-w-[140px]">{d.email}</span></p>}
                              {d.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3 shrink-0" />{d.phone}</p>}
                              {!d.email && !d.phone && <span className="text-xs text-muted-foreground">—</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{d.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Link href={`/drivers/${d.driverId}`}>
                              <Button size="icon" variant="ghost" data-testid={`btn-no-wiw-profile-${d.driverId}`}>
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : noWiwData && noWiwData.total === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground border border-dashed rounded-lg">
              <CheckCircle2 className="h-8 w-8 mb-3 text-green-500 opacity-70" />
              <p className="text-sm font-medium">All active drivers are linked to WIW</p>
              <p className="text-xs mt-1">No drivers are missing a WIW match.</p>
            </div>
          ) : null}
        </>
      )}

      {/* Reconciliation table */}
      {filterTab !== "no_wiw" && !isLoading && rows.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px] text-xs">WIW ID</TableHead>
                <TableHead className="text-xs">WIW User</TableHead>
                <TableHead className="text-xs w-[100px]">Workplace</TableHead>
                <TableHead className="text-xs w-[80px]">WIW Status</TableHead>
                <TableHead className="text-xs">Contact</TableHead>
                <TableHead className="text-xs w-[100px]">Last Seen</TableHead>
                <TableHead className="text-xs w-[110px]">Match Status</TableHead>
                <TableHead className="text-xs w-[100px]">Match Method</TableHead>
                <TableHead className="text-xs">DriverHub Driver</TableHead>
                <TableHead className="text-xs w-[120px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((user) => {
                const seen = formatLastSeen(user.lastSeenAt);
                return (
                  <TableRow
                    key={user.id}
                    data-testid={`wiw-row-${user.id}`}
                    className={
                      user.wiwIntegrationStatus === "EXCLUDED_NON_DRIVER"
                        ? "opacity-60 bg-muted/30"
                        : user.matchStatus === "ambiguous"
                        ? "bg-orange-50/50 dark:bg-orange-950/10"
                        : user.matchStatus === "unmatched"
                        ? "bg-amber-50/30 dark:bg-amber-950/10"
                        : ""
                    }
                  >
                    {/* WIW ID */}
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default">{user.externalUserId}</span>
                        </TooltipTrigger>
                        <TooltipContent>WIW external user ID</TooltipContent>
                      </Tooltip>
                    </TableCell>

                    {/* Name */}
                    <TableCell>
                      <p className="text-sm font-medium">{user.name}</p>
                      {user.employeeCode && (
                        <p className="text-xs text-muted-foreground">Code: {user.employeeCode}</p>
                      )}
                    </TableCell>

                    {/* Workplace */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {user.workplaceName ?? "—"}
                    </TableCell>

                    {/* WIW status */}
                    <TableCell>
                      <WiwStatusBadge status={user.wiwStatus} />
                    </TableCell>

                    {/* Contact (email + phone) */}
                    <TableCell>
                      <div className="space-y-0.5">
                        {user.email ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[160px]">{user.email}</span>
                          </p>
                        ) : null}
                        {user.phone ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" />
                            {user.phone}
                          </p>
                        ) : null}
                        {!user.email && !user.phone && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Last Seen */}
                    <TableCell className="whitespace-nowrap">
                      <span className={`text-xs ${seen.isRecent ? "text-green-600 dark:text-green-400" : seen.isStale && user.lastSeenAt ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                        {seen.label}
                      </span>
                    </TableCell>

                    {/* Match status */}
                    <TableCell>
                      <MatchStatusBadge status={user.matchStatus} />
                    </TableCell>

                    {/* Match method */}
                    <TableCell>
                      <MethodBadge method={user.matchMethod} />
                    </TableCell>

                    {/* Driver */}
                    <TableCell>
                      {user.driverId ? (
                        <div>
                          <p className="text-sm font-medium">{user.driverName ?? user.driverNumber ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {[user.driverNumber, user.driverStatus].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      ) : user.matchStatus === "ambiguous" ? (
                        <span className="text-xs text-orange-600 dark:text-orange-400 italic">Multiple candidates — assign manually</span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Not assigned</span>
                      )}
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {user.wiwIntegrationStatus !== "EXCLUDED_NON_DRIVER" ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setPickerUser(user)}
                              data-testid={`button-assign-${user.id}`}
                            >
                              {user.driverId ? (
                                <><Link2 className="h-3 w-3 mr-1" />Change</>
                              ) : (
                                <><Link2 className="h-3 w-3 mr-1" />Assign</>
                              )}
                            </Button>
                            {user.matchStatus === "unmatched" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => openCreateDriver(user)}
                                    data-testid={`button-create-driver-${user.id}`}
                                  >
                                    <Users className="h-3 w-3 mr-1" />New
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Create a new DriverHub driver linked to this WIW user</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-muted-foreground"
                                  onClick={() => integrationStatusMut.mutate({ id: user.id, status: "EXCLUDED_NON_DRIVER" })}
                                  disabled={integrationStatusMut.isPending}
                                  data-testid={`button-exclude-${user.id}`}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />Exclude
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Mark as non-driver — exclude from matching, scheduling, and reporting</TooltipContent>
                            </Tooltip>
                          </>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => integrationStatusMut.mutate({ id: user.id, status: "PENDING_REVIEW" })}
                                disabled={integrationStatusMut.isPending}
                                data-testid={`button-restore-${user.id}`}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />Restore
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Restore this user to the review queue</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* No results for filter */}
      {filterTab !== "no_wiw" && !isLoading && rows.length === 0 && summary && summary.total > 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border border-dashed rounded-lg">
          <Search className="h-6 w-6 mb-2 opacity-30" />
          <p className="text-sm">No users match your current filter.</p>
        </div>
      )}

      {/* Preview dialog */}
      <PreviewDialog
        preview={preview}
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreview(null); }}
        onConfirm={() => autoMatchMut.mutate()}
        isConfirming={autoMatchMut.isPending}
        previewLimit={previewLimit}
        onChangeSampleSize={setPreviewLimit}
        onReload={reloadPreview}
        isLoading={previewMut.isPending}
      />

      {/* Driver picker dialog */}
      <DriverPickerDialog
        wiwUser={pickerUser}
        open={pickerUser !== null}
        onClose={() => setPickerUser(null)}
        onSelect={(driverId) => {
          if (!pickerUser) return;
          mapMut.mutate({ wiwUserId: pickerUser.id, driverId });
        }}
        isPending={mapMut.isPending}
      />

      {/* Create Driver dialog */}
      <Dialog open={createDriverOpen} onOpenChange={(o) => { if (!o) { setCreateDriverOpen(false); setCreateDriverUser(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Create New Driver
            </DialogTitle>
            <DialogDescription>
              Create a new DriverHub driver profile pre-filled from WIW user data, then automatically link them.
            </DialogDescription>
          </DialogHeader>

          {createDriverUser && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-medium text-sm">WIW Source: {createDriverUser.name}</p>
                <p className="text-muted-foreground">ID: {createDriverUser.externalUserId} · Workplace: {createDriverUser.workplaceName ?? "—"}</p>
                {createDriverUser.lastSeenAt && (
                  <p className="text-muted-foreground">Last seen: {formatLastSeen(createDriverUser.lastSeenAt).label}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">First Name</label>
                  <Input
                    value={createFirstName}
                    onChange={(e) => setCreateFirstName(e.target.value)}
                    placeholder="First"
                    className="h-8 text-sm"
                    data-testid="input-create-driver-first"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Last Name</label>
                  <Input
                    value={createLastName}
                    onChange={(e) => setCreateLastName(e.target.value)}
                    placeholder="Last"
                    className="h-8 text-sm"
                    data-testid="input-create-driver-last"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Email</label>
                <Input
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="email@example.com"
                  type="email"
                  className="h-8 text-sm"
                  data-testid="input-create-driver-email"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Phone</label>
                <Input
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  placeholder="(000) 000-0000"
                  className="h-8 text-sm"
                  data-testid="input-create-driver-phone"
                />
              </div>

              <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs text-amber-700 dark:text-amber-300">
                Driver will be created as an Independent Contractor with active status and auto-linked to this WIW user.
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setCreateDriverOpen(false); setCreateDriverUser(null); }}
              data-testid="button-create-driver-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={createAndLinkMut.isPending || (!createFirstName.trim() && !createLastName.trim())}
              onClick={() => {
                if (!createDriverUser) return;
                createAndLinkMut.mutate({
                  wiwUserId: createDriverUser.id,
                  firstName: createFirstName.trim(),
                  lastName: createLastName.trim(),
                  email: createEmail.trim(),
                  phone: createPhone.trim(),
                });
              }}
              data-testid="button-create-driver-confirm"
            >
              {createAndLinkMut.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</>
              ) : (
                <><Users className="h-3.5 w-3.5 mr-1.5" />Create &amp; Link</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
