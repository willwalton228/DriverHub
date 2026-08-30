import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ShieldCheck, Clock, CheckCircle2, XCircle, AlertTriangle,
  Search, X, ExternalLink, FileWarning, RefreshCw,
} from "lucide-react";

interface LicenseSubmission {
  id: number;
  driver_id: string;
  driver_name: string;
  submitted_by: string;
  submitted_at: string;
  status: string;
  proposed_license_state: string;
  proposed_license_expiration: string | null;
  proposed_license_class: string | null;
  current_license_state: string | null;
  current_license_expiration: string | null;
  priority: string;
  reviewer_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

const STATUS_CONFIGS: Record<string, { label: string; icon: React.ElementType; badge: string }> = {
  pending_review:        { label: "Pending Review",        icon: Clock,         badge: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40" },
  approved:              { label: "Approved",              icon: CheckCircle2,  badge: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/40" },
  rejected:              { label: "Rejected",              icon: XCircle,       badge: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/40" },
  requires_resubmission: { label: "Needs Resubmission",   icon: AlertTriangle, badge: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800/40" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIGS[status] ?? { label: status, icon: Clock, badge: "" };
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`flex items-center gap-1 w-fit text-xs ${cfg.badge}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "urgent") return <Badge variant="outline" className="text-xs text-red-600 border-red-300 dark:text-red-400 dark:border-red-800">Urgent</Badge>;
  return <Badge variant="outline" className="text-xs text-muted-foreground">Normal</Badge>;
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return v; }
}

function fmtDateTime(v: string | null | undefined) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return v; }
}

export default function LicenseReviewQueue() {
  const { isSuperAdmin, isCorporate } = useAuth();
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [search, setSearch] = useState("");

  const { data: submissions = [], isLoading, refetch, isRefetching } = useQuery<LicenseSubmission[]>({
    queryKey: ["/api/compliance/license-submissions", statusFilter],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (statusFilter !== "all") p.set("status", statusFilter);
      const r = await fetch(`/api/compliance/license-submissions?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
    enabled: isSuperAdmin || isCorporate,
    refetchInterval: 30_000,
  });

  const pending   = submissions.filter(s => s.status === "pending_review").length;
  const needsResub = submissions.filter(s => s.status === "requires_resubmission").length;
  const approved  = submissions.filter(s => s.status === "approved").length;
  const rejected  = submissions.filter(s => s.status === "rejected").length;

  const filtered = submissions.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (s.driver_name || "").toLowerCase().includes(q) ||
           (s.driver_id || "").toLowerCase().includes(q) ||
           (s.proposed_license_state || "").toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            License Review Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Driver license compliance submissions from MNM — review, approve, or reject.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          data-testid="button-refresh-queue"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pending Review",      value: pending,    color: "text-amber-600 dark:text-amber-400",   icon: Clock        },
          { label: "Needs Resubmission",  value: needsResub, color: "text-orange-600 dark:text-orange-400", icon: AlertTriangle },
          { label: "Approved",            value: approved,   color: "text-green-600 dark:text-green-400",   icon: CheckCircle2 },
          { label: "Rejected",            value: rejected,   color: "text-red-600 dark:text-red-400",       icon: XCircle      },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Icon className={`h-5 w-5 shrink-0 ${stat.color}`} />
                <div>
                  <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter} data-testid="select-status-filter">
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="requires_resubmission">Needs Resubmission</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All Submissions</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search driver name or state…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-search"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} submission{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-14">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14">
              <FileWarning className="h-10 w-10 mx-auto text-muted-foreground opacity-30 mb-3" />
              <p className="text-sm text-muted-foreground">No submissions found.</p>
              {statusFilter !== "all" && (
                <p className="text-xs text-muted-foreground mt-1">Try changing the status filter.</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>License State</TableHead>
                  <TableHead>Proposed Expiry</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(sub => (
                  <TableRow key={sub.id} data-testid={`row-submission-${sub.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{sub.driver_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{sub.driver_id}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {sub.proposed_license_state
                        ? <Badge variant="outline" className="font-mono font-medium">{sub.proposed_license_state}</Badge>
                        : <span className="text-muted-foreground text-sm">—</span>
                      }
                    </TableCell>
                    <TableCell className="text-sm">{fmtDate(sub.proposed_license_expiration)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDateTime(sub.submitted_at)}</TableCell>
                    <TableCell><PriorityBadge priority={sub.priority} /></TableCell>
                    <TableCell><StatusBadge status={sub.status} /></TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        data-testid={`button-review-${sub.id}`}
                      >
                        <a href={`/compliance/license-review/${sub.id}`}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Review
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
