import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ChevronRight, ArrowLeft, BarChart3, CheckCircle,
  RefreshCw, MinusCircle, XCircle, Copy, AlertTriangle, Building2, User, FileSearch,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ImportBatch {
  id: string;
  fileName: string;
  uploadedAt: string;
  processingStatus: string;
  processingDurationMs: number | null;
  totalRows: number;
  insertedRows: number;
  updatedRows: number;
  noChangeRows: number;
  rejectedRows: number;
  duplicateRows: number;
  testAccountRows: number;
  unmappedStatusRows: number;
  unmatchedAccountRows: number;
  unmatchedDriverRows: number;
}

interface ResultRow {
  rowNumber: number;
  itineraryId: string | null;
  tripId: string | null;
  sourceStatus: string | null;
  mappedStatus: string | null;
  resultType: string | null;
  errorMessage: string | null;
  accountDisplay: string | null;
  matchedAccountId: string | null;
  driverDisplay: string | null;
  matchedDriverId: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) { return (n ?? 0).toLocaleString(); }

function fmtDate(s?: string) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ── Result type metadata ───────────────────────────────────────────────────────
const RESULT_TYPES: {
  key: string; label: string; icon: React.ElementType;
  color: string; bgActive: string; counterKey: keyof ImportBatch | "all";
}[] = [
  { key: "all",               label: "All Rows",         icon: BarChart3,     color: "text-foreground",                       bgActive: "bg-muted",                          counterKey: "totalRows" },
  { key: "inserted",          label: "Inserted",          icon: CheckCircle,   color: "text-green-600 dark:text-green-400",    bgActive: "bg-green-100 dark:bg-green-900/30", counterKey: "insertedRows" },
  { key: "updated",           label: "Updated",           icon: RefreshCw,     color: "text-blue-600 dark:text-blue-400",      bgActive: "bg-blue-100 dark:bg-blue-900/30",   counterKey: "updatedRows" },
  { key: "no_change",         label: "No Change",         icon: MinusCircle,   color: "text-muted-foreground",                 bgActive: "bg-muted",                          counterKey: "noChangeRows" },
  { key: "unmatched_account", label: "Unmatched Account", icon: Building2,     color: "text-red-600 dark:text-red-400",        bgActive: "bg-red-100 dark:bg-red-900/30",     counterKey: "unmatchedAccountRows" },
  { key: "unmatched_driver",  label: "Unmatched Driver",  icon: User,          color: "text-amber-600 dark:text-amber-400",    bgActive: "bg-amber-100 dark:bg-amber-900/30", counterKey: "unmatchedDriverRows" },
  { key: "unmapped_status",   label: "Unmapped Status",   icon: AlertTriangle, color: "text-orange-600 dark:text-orange-400",  bgActive: "bg-orange-100 dark:bg-orange-900/30", counterKey: "unmappedStatusRows" },
  { key: "test_account",      label: "Test Account",      icon: FileSearch,    color: "text-violet-600 dark:text-violet-400",  bgActive: "bg-violet-100 dark:bg-violet-900/30", counterKey: "testAccountRows" },
  { key: "rejected",          label: "Rejected",          icon: XCircle,       color: "text-red-600 dark:text-red-400",        bgActive: "bg-red-100 dark:bg-red-900/30",     counterKey: "rejectedRows" },
  { key: "duplicate",         label: "Duplicate",         icon: Copy,          color: "text-orange-500 dark:text-orange-400",  bgActive: "bg-orange-100 dark:bg-orange-900/30", counterKey: "duplicateRows" },
];

function getBadgeStyle(resultType: string | null) {
  switch (resultType) {
    case "inserted":          return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "updated":           return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "no_change":         return "bg-muted text-muted-foreground";
    case "unmatched_account": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "unmatched_driver":  return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "unmapped_status":   return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    case "test_account":      return "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300";
    case "rejected":          return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "duplicate":         return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    default:                  return "bg-muted text-muted-foreground";
  }
}

function resultTypeLabel(rt: string | null) {
  return RESULT_TYPES.find(r => r.key === rt)?.label ?? rt ?? "—";
}

function BatchStatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Completed</Badge>;
  if (status === "completed_with_errors")
    return <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">Completed w/ Errors</Badge>;
  if (status === "failed")
    return <Badge variant="secondary" className="text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Failed</Badge>;
  if (status === "abandoned")
    return <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400">Abandoned</Badge>;
  return <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Processing</Badge>;
}

// ── Clickable KPI Summary ──────────────────────────────────────────────────────
function KpiSummary({
  batch,
  activeFilter,
  onFilter,
}: {
  batch: ImportBatch;
  activeFilter: string;
  onFilter: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {RESULT_TYPES.map(({ key, label, icon: Icon, color, bgActive, counterKey }) => {
        const count = counterKey === "all" ? batch.totalRows : (batch[counterKey] as number) ?? 0;
        const isActive = activeFilter === key;
        return (
          <Card
            key={key}
            className={`cursor-pointer transition-colors ${isActive ? `${bgActive} ring-2 ring-primary/30` : "hover-elevate"}`}
            onClick={() => onFilter(key)}
            data-testid={`kpi-filter-${key}`}
            title={`Filter by: ${label}`}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                <span className="text-xs text-muted-foreground leading-tight truncate">{label}</span>
              </div>
              <p className={`text-xl font-bold ${color}`}>{fmt(count)}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Detail Grid ────────────────────────────────────────────────────────────────
function DetailGrid({ batchId, resultType }: { batchId: string; resultType: string }) {
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Reset to page 1 whenever the filter changes so we never land on an empty page
  useEffect(() => { setPage(1); }, [resultType]);

  const { data, isLoading } = useQuery<{ rows: ResultRow[]; total: number }>({
    queryKey: ["/api/draiver-import/batches", batchId, "rows", resultType, page],
    queryFn: () => {
      const url = `/api/draiver-import/batches/${batchId}/rows?resultType=${encodeURIComponent(resultType)}&page=${page}&pageSize=${pageSize}`;
      return fetch(url, { credentials: "include" }).then(r => r.json());
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No rows match this filter.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-muted-foreground">
        Showing {fmt((page - 1) * pageSize + 1)}–{fmt(Math.min(page * pageSize, total))} of {fmt(total)} rows
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-muted-foreground text-left">
              <th className="px-3 py-2.5 font-medium w-16 text-right">Row</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Itinerary ID</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Trip ID</th>
              <th className="px-3 py-2.5 font-medium">Account</th>
              <th className="px-3 py-2.5 font-medium">Driver</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Source Status</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Mapped Status</th>
              <th className="px-3 py-2.5 font-medium">Result</th>
              <th className="px-3 py-2.5 font-medium">Error / Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.rowNumber}
                className="border-b last:border-0 hover:bg-muted/20"
                data-testid={`row-result-${row.rowNumber}`}
              >
                <td className="px-3 py-2.5 text-right text-muted-foreground font-mono text-xs">{row.rowNumber}</td>
                <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                  {row.itineraryId ?? <span className="text-muted-foreground italic">—</span>}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-muted-foreground">
                  {row.tripId ?? "—"}
                </td>
                <td className="px-3 py-2.5 max-w-40">
                  <div className="flex items-center gap-1">
                    {row.matchedAccountId && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" title="Matched" />
                    )}
                    <span className="truncate text-xs">{row.accountDisplay ?? <span className="text-muted-foreground italic">—</span>}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 max-w-36">
                  <div className="flex items-center gap-1">
                    {row.matchedDriverId && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" title="Matched" />
                    )}
                    <span className="truncate text-xs">{row.driverDisplay ?? <span className="text-muted-foreground italic">—</span>}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {row.sourceStatus ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {row.mappedStatus ? (
                    <Badge variant="secondary" className="text-xs font-mono">{row.mappedStatus}</Badge>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="secondary" className={`text-xs ${getBadgeStyle(row.resultType)}`}>
                    {resultTypeLabel(row.resultType)}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-64">
                  <span className="line-clamp-2" title={row.errorMessage ?? ""}>
                    {row.errorMessage ?? "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Results Page ──────────────────────────────────────────────────────────
export default function DraiverImportResults({ params }: { params: { batchId: string } }) {
  const batchId = params.batchId;
  const [, navigate] = useLocation();
  const [activeFilter, setActiveFilter] = useState("all");

  const { data: batch, isLoading: batchLoading } = useQuery<ImportBatch>({
    queryKey: ["/api/draiver-import/batches", batchId],
    queryFn: () =>
      fetch(`/api/draiver-import/batches/${batchId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!batchId,
  });

  const handleFilter = (key: string) => {
    setActiveFilter(key);
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">

      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/reports/draiver-import")}
          className="mt-0.5 shrink-0"
          data-testid="button-back-to-history"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Import History
        </Button>

        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Import Results</h1>
          {batchLoading ? (
            <Skeleton className="h-4 w-72 mt-1" />
          ) : batch ? (
            <p className="text-sm text-muted-foreground mt-0.5 truncate font-mono">
              {batch.fileName}
              <span className="font-sans font-normal ml-2 text-muted-foreground">·</span>
              <span className="font-sans ml-2">{fmtDate(batch.uploadedAt)}</span>
              {batch.processingDurationMs != null && (
                <>
                  <span className="font-sans font-normal ml-2 text-muted-foreground">·</span>
                  <span className="font-sans ml-2 text-xs">
                    {batch.processingDurationMs < 1000
                      ? `${batch.processingDurationMs}ms`
                      : `${(batch.processingDurationMs / 1000).toFixed(1)}s`} processing time
                  </span>
                </>
              )}
            </p>
          ) : null}
        </div>

        {batch && (
          <div className="ml-auto shrink-0">
            <BatchStatusBadge status={batch.processingStatus} />
          </div>
        )}
      </div>

      {/* KPI Summary */}
      {batchLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[1,2,3,4,5,6,7,8,9,10].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : batch ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Click a tile to filter the detail grid below.</p>
          <KpiSummary batch={batch} activeFilter={activeFilter} onFilter={handleFilter} />
        </div>
      ) : null}

      {/* Active filter label */}
      {activeFilter !== "all" && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            Showing: {RESULT_TYPES.find(r => r.key === activeFilter)?.label}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setActiveFilter("all")} className="h-7 text-xs">
            Clear filter
          </Button>
        </div>
      )}

      {/* Detail Grid */}
      <Card data-testid="card-detail-grid">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Row Detail</CardTitle>
          <CardDescription>
            Every row from the uploaded CSV — account matching, driver matching, status mapping, and outcome.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {batchId && <DetailGrid batchId={batchId} resultType={activeFilter} />}
        </CardContent>
      </Card>

    </div>
  );
}
