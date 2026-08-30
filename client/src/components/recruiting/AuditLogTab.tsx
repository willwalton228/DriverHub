import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Search, Download, ChevronDown, ChevronRight, Clock, User, Activity,
  FileText, Loader2, ArrowRight, Filter, X
} from "lucide-react";

interface AuditDiff {
  field: string;
  before: any;
  after: any;
}

interface AuditEvent {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string;
  userId: string | null;
  userEmail: string | null;
  actorRole: string | null;
  source: string | null;
  previousValue: string | null;
  newValue: string | null;
  changedFields: string[] | null;
  reason: string | null;
  metadata: any;
  occurredAt: string;
  diffs?: AuditDiff[];
}

interface AuditFiltersData {
  actionTypes: string[];
  entityTypes: string[];
  sources: string[];
}

function formatActionType(actionType: string): string {
  return actionType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function formatEntityType(entityType: string): string {
  return entityType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function DiffRow({ diff }: { diff: AuditDiff }) {
  return (
    <div className="flex items-start gap-2 py-1.5 text-sm border-b last:border-b-0" data-testid={`diff-row-${diff.field}`}>
      <span className="font-mono text-xs text-muted-foreground min-w-[120px] shrink-0 pt-0.5">{diff.field}</span>
      <div className="flex items-start gap-1 flex-wrap min-w-0">
        <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-1.5 py-0.5 rounded text-xs font-mono break-all">
          {formatValue(diff.before)}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
        <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-1.5 py-0.5 rounded text-xs font-mono break-all">
          {formatValue(diff.after)}
        </span>
      </div>
    </div>
  );
}

function AuditEventRow({ event }: { event: AuditEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiffs = event.diffs && event.diffs.length > 0;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="border-b last:border-b-0">
        <CollapsibleTrigger asChild>
          <div
            className="flex items-center gap-3 p-3 hover-elevate cursor-pointer"
            data-testid={`audit-row-${event.id}`}
          >
            <div className="shrink-0">
              {hasDiffs ? (
                expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <div className="w-4" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs" data-testid={`badge-action-${event.id}`}>
                  {formatActionType(event.actionType)}
                </Badge>
                <Badge variant="secondary" className="text-xs" data-testid={`badge-entity-${event.id}`}>
                  {formatEntityType(event.entityType)}
                </Badge>
                {event.source && (
                  <Badge variant="secondary" className="text-xs" data-testid={`badge-source-${event.id}`}>
                    {event.source.toUpperCase()}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {event.userEmail || "System"}
                  {event.actorRole && (
                    <span className="text-muted-foreground">({event.actorRole})</span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(event.occurredAt).toLocaleString()}
                </span>
                <span className="font-mono text-muted-foreground/60 text-[10px]">
                  {event.entityId.substring(0, 8)}...
                </span>
              </div>
            </div>

            {hasDiffs && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {event.diffs!.length} change{event.diffs!.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pl-10" data-testid={`audit-diffs-${event.id}`}>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">Field-Level Changes</div>
                {event.diffs && event.diffs.length > 0 ? (
                  event.diffs.map((diff, idx) => (
                    <DiffRow key={idx} diff={diff} />
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground">No detailed diff available</div>
                )}
                {event.reason && (
                  <div className="mt-2 pt-2 border-t">
                    <span className="text-xs text-muted-foreground">Reason: </span>
                    <span className="text-xs">{event.reason}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function AuditLogTab() {
  const { toast } = useToast();
  const [entityType, setEntityType] = useState<string>("");
  const [actionType, setActionType] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const pageSize = 50;

  const { data: filters } = useQuery<AuditFiltersData>({
    queryKey: ["/api/recruiting/audit/filters"],
  });

  const queryParams = new URLSearchParams();
  if (entityType) queryParams.set("entityType", entityType);
  if (actionType) queryParams.set("actionType", actionType);
  if (source) queryParams.set("source", source);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  queryParams.set("includeDiffs", "true");
  queryParams.set("limit", String(pageSize));
  queryParams.set("offset", String(page * pageSize));

  const { data, isLoading } = useQuery<{ events: AuditEvent[]; total: number }>({
    queryKey: ["/api/recruiting/audit", queryParams.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/audit?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit events");
      return res.json();
    },
  });

  const events = data?.events || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);
  const hasActiveFilters = !!(entityType || actionType || source || dateFrom || dateTo);

  const filteredEvents = searchQuery
    ? events.filter(e =>
        e.userEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.actionType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.entityId.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : events;

  function clearFilters() {
    setEntityType("");
    setActionType("");
    setSource("");
    setDateFrom("");
    setDateTo("");
    setSearchQuery("");
    setPage(0);
  }

  async function handleExport(format: "csv" | "json") {
    setExporting(true);
    try {
      const filterPayload: any = {};
      if (entityType) filterPayload.entityType = entityType;
      if (actionType) filterPayload.actionType = actionType;
      if (dateFrom) filterPayload.dateFrom = dateFrom;
      if (dateTo) filterPayload.dateTo = dateTo;

      const res = await fetch("/api/recruiting/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          exportType: "audit_log",
          filters: filterPayload,
          exportFormat: format,
          reason: "Audit log export from UI",
        }),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_log_export_${new Date().toISOString().split("T")[0]}.${format === "json" ? "json" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({ title: `Audit log exported as ${format.toUpperCase()}` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2" data-testid="text-audit-log-title">
              <Activity className="h-5 w-5" />
              Audit Log
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {total} event{total !== 1 ? "s" : ""} recorded
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("csv")}
              disabled={exporting}
              data-testid="button-export-csv"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">CSV</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("json")}
              disabled={exporting}
              data-testid="button-export-json"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">JSON</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email, action, or entity ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-audit-search"
              />
            </div>
            <Select value={entityType} onValueChange={(v) => { setEntityType(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger className="w-[160px]" data-testid="select-entity-type">
                <SelectValue placeholder="Entity Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {filters?.entityTypes.map(et => (
                  <SelectItem key={et} value={et}>{formatEntityType(et)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionType} onValueChange={(v) => { setActionType(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger className="w-[180px]" data-testid="select-action-type">
                <SelectValue placeholder="Action Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {filters?.actionTypes.map(at => (
                  <SelectItem key={at} value={at}>{formatActionType(at)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(v) => { setSource(v === "all" ? "" : v); setPage(0); }}>
              <SelectTrigger className="w-[130px]" data-testid="select-source">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {filters?.sources.map(s => (
                  <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="w-[140px]"
              data-testid="input-date-from"
              placeholder="From"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="w-[140px]"
              data-testid="input-date-to"
              placeholder="To"
            />
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-audit-events">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No audit events found</p>
              {hasActiveFilters && <p className="text-xs mt-1">Try adjusting your filters</p>}
            </div>
          ) : (
            <div className="border rounded-md" data-testid="container-audit-events">
              {filteredEvents.map(event => (
                <AuditEventRow key={event.id} event={event} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted-foreground" data-testid="text-audit-page-info">
                Page {page + 1} of {totalPages} ({total} total)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  data-testid="button-prev-page"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
