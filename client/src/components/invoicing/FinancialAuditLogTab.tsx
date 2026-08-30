import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

interface AuditEntry {
  id: string;
  eventType: string;
  actorUserId: string | null;
  actorUserEmail: string | null;
  targetEntityType: string;
  targetEntityId: string;
  targetEntityLabel: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  entries: AuditEntry[];
  total: number;
}

const EVENT_TYPE_OPTIONS = [
  { value: "all", label: "All Events" },
  { value: "financial.payment.created", label: "Payment Created" },
  { value: "financial.payment.deleted", label: "Payment Deleted" },
  { value: "financial.deposit_batch.mark_balanced", label: "Batch Balanced" },
  { value: "financial.deposit_batch.submit", label: "Batch Submitted" },
  { value: "financial.deposit_batch.lock", label: "Batch Locked" },
  { value: "financial.deposit_batch.reconcile", label: "Batch Reconciled" },
  { value: "financial.invoice.status_changed", label: "Invoice Status Changed" },
];

const ENTITY_TYPE_OPTIONS = [
  { value: "all", label: "All Entities" },
  { value: "payment", label: "Payment" },
  { value: "invoice", label: "Invoice" },
  { value: "deposit_batch", label: "Deposit Batch" },
];

function eventTypeBadge(eventType: string) {
  if (eventType.includes("payment")) return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">{eventType.replace("financial.", "")}</Badge>;
  if (eventType.includes("deposit_batch")) return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-xs">{eventType.replace("financial.", "")}</Badge>;
  if (eventType.includes("invoice")) return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">{eventType.replace("financial.", "")}</Badge>;
  return <Badge variant="secondary" className="text-xs">{eventType}</Badge>;
}

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch { return ts; }
}

export function FinancialAuditLogTab() {
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [page, setPage] = useState(0);
  const [fetchKey, setFetchKey] = useState(0);
  const pageSize = 50;

  const params = new URLSearchParams({
    limit: String(pageSize),
    offset: String(page * pageSize),
    fromDate,
    toDate,
  });
  if (eventTypeFilter !== "all") params.set("eventType", eventTypeFilter);
  if (entityTypeFilter !== "all") params.set("targetEntityType", entityTypeFilter);

  const { data, isLoading, isFetching } = useQuery<AuditLogResponse>({
    queryKey: ["/api/corporate/invoicing/financial-audit-log", eventTypeFilter, entityTypeFilter, fromDate, toDate, page, fetchKey],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/invoicing/financial-audit-log?${params}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" />
            Financial Audit Log
          </h2>
          <p className="text-sm text-muted-foreground">
            Immutable record of all financial mutations — payments, invoices, deposit batches.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => { setFetchKey(k => k + 1); setPage(0); }}
          disabled={isLoading || isFetching}
          data-testid="button-refresh-audit-log"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label>Event Type</Label>
              <Select value={eventTypeFilter} onValueChange={v => { setEventTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-52" data-testid="select-event-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Entity Type</Label>
              <Select value={entityTypeFilter} onValueChange={v => { setEntityTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-44" data-testid="select-entity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>From</Label>
              <Input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(0); }} className="w-40" data-testid="input-from-date" />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(0); }} className="w-40" data-testid="input-to-date" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {data ? `${data.total.toLocaleString()} event(s)` : "Loading…"}
          </CardTitle>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">Prev</Button>
              <span className="text-muted-foreground">{page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">Next</Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Timestamp</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Before → After</TableHead>
                  <TableHead className="w-28">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data?.entries || data.entries.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No audit events found for the selected filters.</TableCell>
                  </TableRow>
                ) : data.entries.map(entry => (
                  <TableRow key={entry.id} data-testid={`audit-row-${entry.id}`}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatTs(entry.createdAt)}</TableCell>
                    <TableCell>{eventTypeBadge(entry.eventType)}</TableCell>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground text-xs">{entry.targetEntityType}</span>
                      <br />
                      <span className="font-medium">{entry.targetEntityLabel || entry.targetEntityId.slice(0, 12)}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.actorUserEmail || entry.actorUserId || "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-xs">
                      {entry.previousValue || entry.newValue ? (
                        <div className="font-mono space-y-0.5">
                          {entry.previousValue && (
                            <div className="text-muted-foreground line-clamp-1">− {JSON.stringify(entry.previousValue).slice(0, 80)}</div>
                          )}
                          {entry.newValue && (
                            <div className="line-clamp-1">+ {JSON.stringify(entry.newValue).slice(0, 80)}</div>
                          )}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entry.ipAddress || "—"}</TableCell>
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
