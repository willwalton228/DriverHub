import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2,
  Mail, FileText, BarChart2, Filter, X,
  Play, ChevronDown, ChevronUp, Send, FlaskConical,
} from "lucide-react";
import { format } from "date-fns";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToMDY(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  try { return format(new Date(ts), "MM/dd/yy h:mm a"); } catch { return ts; }
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const s = status.toLowerCase();
  const cfg: Record<string, { cls: string; label: string }> = {
    success:   { cls: "bg-green-600 text-white",                           label: "Success"   },
    sent:      { cls: "bg-green-600 text-white",                           label: "Sent"      },
    failed:    { cls: "text-destructive border-destructive",               label: "Failed"    },
    skipped:   { cls: "text-amber-600 border-amber-400 dark:text-amber-400", label: "Skipped" },
    dry_run:   { cls: "text-blue-600 border-blue-400 dark:text-blue-400",  label: "Dry Run"   },
    pending:   { cls: "text-muted-foreground",                             label: "Pending"   },
    error:     { cls: "text-destructive border-destructive",               label: "Error"     },
  };
  const { cls, label } = cfg[s] ?? { cls: "text-muted-foreground", label: status };
  const isSolid = s === "success" || s === "sent";
  return (
    <Badge variant={isSolid ? "default" : "outline"} className={`text-xs ${cls}`}>
      {label}
    </Badge>
  );
}

function BoolCell({ val, trueLabel = "Yes", falseLabel = "No" }: {
  val: boolean | null | undefined; trueLabel?: string; falseLabel?: string;
}) {
  if (val == null) return <span className="text-muted-foreground text-xs">—</span>;
  return val
    ? <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><CheckCircle2 className="h-3.5 w-3.5" />{trueLabel}</span>
    : <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3.5 w-3.5" />{falseLabel}</span>;
}

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: number | string; sub?: string;
  icon: React.ComponentType<{ className?: string }>; accent?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${accent ?? ""}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="rounded-md bg-muted/60 p-2 shrink-0 mt-0.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

interface Filters {
  dateFrom: string;
  dateTo: string;
  status: string;
  accountId: string;
}

function defaultFilters(): Filters {
  const now   = new Date();
  const prior = new Date(now);
  prior.setDate(now.getDate() - 30);
  return {
    dateFrom:  prior.toISOString().split("T")[0],
    dateTo:    now.toISOString().split("T")[0],
    status:    "all",
    accountId: "all",
  };
}

function FilterBar({
  filters, onChange, accounts,
}: {
  filters: Filters; onChange: (f: Filters) => void;
  accounts: { id: string; name: string }[];
}) {
  function set(key: keyof Filters, val: string) { onChange({ ...filters, [key]: val }); }
  function reset() { onChange(defaultFilters()); }
  const isDirty = JSON.stringify(filters) !== JSON.stringify(defaultFilters());

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 px-4 py-3">
      <Filter className="h-4 w-4 text-muted-foreground mt-5 shrink-0" />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">From</Label>
        <Input type="date" value={filters.dateFrom} onChange={e => set("dateFrom", e.target.value)}
          className="w-36" data-testid="filter-date-from" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">To</Label>
        <Input type="date" value={filters.dateTo} onChange={e => set("dateTo", e.target.value)}
          className="w-36" data-testid="filter-date-to" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select value={filters.status} onValueChange={v => set("status", v)}>
          <SelectTrigger className="w-36" data-testid="filter-status">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Account</Label>
        <Select value={filters.accountId} onValueChange={v => set("accountId", v)}>
          <SelectTrigger className="w-48" data-testid="filter-account">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isDirty && (
        <Button variant="ghost" size="default" onClick={reset} className="self-end" data-testid="filter-reset">
          <X className="h-4 w-4 mr-1.5" />Clear
        </Button>
      )}
    </div>
  );
}

// ── Run Delivery Panel ────────────────────────────────────────────────────────

interface BatchResult {
  runAt:     string;
  dryRun:    boolean;
  weekStart: string;
  weekEnd:   string;
  evaluated: number;
  eligible:  number;
  sent:      number;
  skipped:   number;
  failed:    number;
  accounts:  {
    accountId:    string;
    accountName:  string;
    status:       string;
    skippedReason?: string;
    pdfGenerated: boolean;
    emailStatus:  string | null;
    emailError?:  string;
    recipients:   string[];
    weekStart:    string;
    weekEnd:      string;
    dryRun:       boolean;
  }[];
}

function RunDeliveryPanel({ onComplete }: { onComplete: () => void }) {
  const { toast } = useToast();
  const [open,       setOpen]       = useState(false);
  const [dryRun,     setDryRun]     = useState(true);
  const [forceSend,  setForceSend]  = useState(false);
  const [weekStart,  setWeekStart]  = useState("");
  const [weekEnd,    setWeekEnd]    = useState("");
  const [result,     setResult]     = useState<BatchResult | null>(null);

  const runMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/reports/weekly/run-delivery", {
        dryRun,
        forceSend: dryRun ? false : forceSend,
        ...(weekStart && weekEnd && { weekStart, weekEnd }),
      }) as Promise<BatchResult>,
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: data.dryRun ? "Dry Run Complete" : "Delivery Job Complete",
        description: data.dryRun
          ? `${data.eligible} account(s) would receive reports.`
          : `${data.sent} sent · ${data.skipped} skipped · ${data.failed} failed`,
      });
      if (!data.dryRun) onComplete();
    },
    onError: (err: any) => {
      toast({ title: "Job Failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-primary/10 p-2">
                <Send className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Run Delivery Job</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Send upcoming-week schedule PDFs to eligible DriverShift &amp; Hybrid accounts.
                </CardDescription>
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="default" data-testid="button-toggle-run-panel">
                {open
                  ? <><ChevronUp className="h-4 w-4 mr-1.5" />Collapse</>
                  : <><ChevronDown className="h-4 w-4 mr-1.5" />Configure &amp; Run</>}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-5">
            <Separator />

            {/* Options */}
            <div className="flex flex-wrap gap-6">
              {/* Dry Run */}
              <div className="flex items-center gap-3">
                <Switch
                  id="dry-run-toggle"
                  checked={dryRun}
                  onCheckedChange={v => { setDryRun(v); if (v) setForceSend(false); }}
                  data-testid="switch-dry-run"
                />
                <div>
                  <Label htmlFor="dry-run-toggle" className="text-sm font-medium flex items-center gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5 text-blue-500" />
                    Dry Run
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Check eligibility &amp; recipients without sending any emails.
                  </p>
                </div>
              </div>

              {/* Force Send */}
              {!dryRun && (
                <div className="flex items-center gap-3">
                  <Switch
                    id="force-send-toggle"
                    checked={forceSend}
                    onCheckedChange={setForceSend}
                    data-testid="switch-force-send"
                  />
                  <div>
                    <Label htmlFor="force-send-toggle" className="text-sm font-medium">Force Send</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Bypass the "already sent this week" deduplication check.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Week override */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-medium">
                Week Override (optional — defaults to upcoming Mon–Sun)
              </Label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Week Start (Mon)</Label>
                  <Input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
                    className="w-36" data-testid="input-week-start" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Week End (Sun)</Label>
                  <Input type="date" value={weekEnd} onChange={e => setWeekEnd(e.target.value)}
                    className="w-36" data-testid="input-week-end" />
                </div>
                {(weekStart || weekEnd) && (
                  <Button variant="ghost" size="default" className="self-end"
                    onClick={() => { setWeekStart(""); setWeekEnd(""); }}
                    data-testid="button-clear-week">
                    <X className="h-4 w-4 mr-1.5" />Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Run button */}
            <div className="flex items-center gap-3">
              <Button
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
                variant={dryRun ? "outline" : "default"}
                data-testid="button-run-delivery"
              >
                {runMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Running…</>
                  : dryRun
                    ? <><FlaskConical className="h-4 w-4 mr-1.5" />Run Dry Run</>
                    : <><Play className="h-4 w-4 mr-1.5" />Run Delivery Job</>}
              </Button>
              {runMutation.isPending && (
                <p className="text-xs text-muted-foreground">
                  Generating &amp; sending reports — this may take a minute…
                </p>
              )}
            </div>

            {/* Result */}
            {result && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {result.dryRun
                      ? <FlaskConical className="h-4 w-4 text-blue-500 shrink-0" />
                      : <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                    <p className="text-sm font-medium">
                      {result.dryRun ? "Dry Run Results" : "Delivery Results"}
                      <span className="text-xs text-muted-foreground font-normal ml-2">
                        {isoToMDY(result.weekStart)} – {isoToMDY(result.weekEnd)}
                        {" · "}{fmtTs(result.runAt)}
                      </span>
                    </p>
                  </div>

                  {/* Summary counts */}
                  <div className="grid grid-cols-5 gap-3">
                    {([
                      { label: "Evaluated", count: result.evaluated,                      cls: "" },
                      { label: "Eligible",  count: result.eligible,                       cls: "text-blue-600 dark:text-blue-400" },
                      { label: "Sent",      count: result.sent,                           cls: "text-green-600 dark:text-green-400" },
                      { label: "Skipped",   count: result.skipped,                        cls: "text-amber-600 dark:text-amber-400" },
                      { label: "Failed",    count: result.failed,                         cls: result.failed > 0 ? "text-destructive" : "" },
                    ] as const).map(({ label, count, cls }) => (
                      <div key={label} className="rounded-md border bg-muted/30 px-3 py-2 text-center">
                        <p className={`text-xl font-bold ${cls}`}>{count}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Per-account table */}
                  {result.accounts.length > 0 && (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-center">PDF</TableHead>
                            <TableHead>Recipients</TableHead>
                            <TableHead>Note</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.accounts.map((row) => {
                            const isFail = row.status === "failed";
                            return (
                              <TableRow
                                key={row.accountId}
                                className={isFail ? "bg-destructive/5 dark:bg-destructive/10" : ""}
                                data-testid={`row-run-result-${row.accountId}`}
                              >
                                <TableCell className="text-sm font-medium max-w-[180px] truncate">
                                  {row.accountName}
                                </TableCell>
                                <TableCell><StatusBadge status={row.status} /></TableCell>
                                <TableCell className="text-center">
                                  <BoolCell val={row.pdfGenerated} />
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground max-w-[240px]">
                                  {row.recipients.length > 0
                                    ? <span className="truncate block" title={row.recipients.join(", ")}>{row.recipients.join(", ")}</span>
                                    : "—"}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                                  <span className="truncate block" title={row.emailError || row.skippedReason || undefined}>
                                    {row.emailError || row.skippedReason || "—"}
                                  </span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ── Batch Reports Tab ─────────────────────────────────────────────────────────

function BatchReportsTab({ filters }: { filters: Filters }) {
  const qs = new URLSearchParams({
    ...(filters.dateFrom  && { dateFrom:   filters.dateFrom  }),
    ...(filters.dateTo    && { dateTo:     filters.dateTo    }),
    ...(filters.status    !== "all" && { status:    filters.status    }),
    ...(filters.accountId !== "all" && { accountId: filters.accountId }),
  }).toString();

  const { data = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/report-delivery-monitor/batch", filters],
    queryFn: () =>
      fetch(`/api/admin/report-delivery-monitor/batch?${qs}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : []),
  });

  const failed = data.filter(r => r.status === "failed" || r.status === "error").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : `${data.length} record${data.length !== 1 ? "s" : ""}${failed > 0 ? ` · ${failed} failed` : ""}`}
        </p>
        <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-batch">
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {failed > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{failed} failed report batch{failed !== 1 ? "es" : ""} in the selected period.</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />Loading batch reports…
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-md border bg-muted/30 py-12 text-center text-sm text-muted-foreground">
          No batch reports found for the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Week</TableHead>
                <TableHead className="text-center">PDF</TableHead>
                <TableHead className="text-center">Excel</TableHead>
                <TableHead className="text-center">Email Sent</TableHead>
                <TableHead>Email Status</TableHead>
                <TableHead>Overall Status</TableHead>
                <TableHead>Triggered By</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Generated At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row: any) => {
                const isFailure = row.status === "failed" || row.status === "error" ||
                                  row.emailStatus === "failed" || row.emailStatus === "error";
                return (
                  <TableRow
                    key={row.id}
                    className={isFailure ? "bg-destructive/5 dark:bg-destructive/10" : ""}
                    data-testid={`row-batch-${row.id}`}
                  >
                    <TableCell className="text-sm font-medium max-w-[180px] truncate">{row.accountName ?? "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{isoToMDY(row.reportWeek)}</TableCell>
                    <TableCell className="text-center"><BoolCell val={row.pdfGenerated} /></TableCell>
                    <TableCell className="text-center"><BoolCell val={row.excelGenerated} /></TableCell>
                    <TableCell className="text-center"><BoolCell val={row.emailSent} /></TableCell>
                    <TableCell><StatusBadge status={row.emailStatus} /></TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{row.triggeredBy ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                      <span className="truncate block" title={row.errorMessage || row.emailErrorMessage || undefined}>
                        {row.errorMessage || row.emailErrorMessage || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtTs(row.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Email Sends Tab ───────────────────────────────────────────────────────────

function EmailSendsTab({ filters }: { filters: Filters }) {
  const qs = new URLSearchParams({
    ...(filters.dateFrom  && { dateFrom:   filters.dateFrom  }),
    ...(filters.dateTo    && { dateTo:     filters.dateTo    }),
    ...(filters.status    !== "all" && { status:    filters.status    }),
    ...(filters.accountId !== "all" && { accountId: filters.accountId }),
  }).toString();

  const { data = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/admin/report-delivery-monitor/email", filters],
    queryFn: () =>
      fetch(`/api/admin/report-delivery-monitor/email?${qs}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : []),
  });

  const failed  = data.filter(r => r.status === "failed" || r.status === "error").length;
  const skipped = data.filter(r => r.status === "skipped").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading…"
            : `${data.length} send${data.length !== 1 ? "s" : ""}${failed > 0 ? ` · ${failed} failed` : ""}${skipped > 0 ? ` · ${skipped} skipped` : ""}`}
        </p>
        <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-email">
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {failed > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{failed} failed email send{failed !== 1 ? "s" : ""} in the selected period.</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />Loading email sends…
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-md border bg-muted/30 py-12 text-center text-sm text-muted-foreground">
          No email sends found for the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Week</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent To</TableHead>
                <TableHead>CC</TableHead>
                <TableHead className="text-center">Attachments</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Sent At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row: any) => {
                const isFailure = row.status === "failed" || row.status === "error";
                const isSkipped = row.status === "skipped";
                return (
                  <TableRow
                    key={row.id}
                    className={isFailure ? "bg-destructive/5 dark:bg-destructive/10" : isSkipped ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}
                    data-testid={`row-email-send-${row.id}`}
                  >
                    <TableCell className="text-sm font-medium max-w-[160px] truncate">{row.accountName ?? "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{isoToMDY(row.reportWeekStart)}</TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                      <span className="truncate block" title={row.emailTo || undefined}>{row.emailTo || "—"}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[160px]">
                      <span className="truncate block" title={row.emailCc || undefined}>{row.emailCc || "—"}</span>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{row.attachmentCount ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                      <span className="truncate block" title={row.errorMessage || undefined}>{row.errorMessage || "—"}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtTs(row.sentAt || row.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReportDeliveryMonitor() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const { data: accounts = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/admin/report-delivery-monitor/accounts"],
    queryFn: () =>
      fetch("/api/admin/report-delivery-monitor/accounts", { credentials: "include" })
        .then(r => r.ok ? r.json() : []),
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/admin/report-delivery-monitor/stats", filters],
    queryFn: () => {
      const qs = new URLSearchParams({
        ...(filters.dateFrom  && { dateFrom:   filters.dateFrom  }),
        ...(filters.dateTo    && { dateTo:     filters.dateTo    }),
        ...(filters.accountId !== "all" && { accountId: filters.accountId }),
      }).toString();
      return fetch(`/api/admin/report-delivery-monitor/stats?${qs}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : {});
    },
  });

  function refreshHistory() {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/report-delivery-monitor/batch"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/report-delivery-monitor/email"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/report-delivery-monitor/stats"] });
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="rounded-md bg-primary/10 p-2.5 mt-0.5">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Delivery Status</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor report generation and email delivery across all accounts.
          </p>
        </div>
      </div>

      {/* Run Delivery Panel */}
      <RunDeliveryPanel onComplete={refreshHistory} />

      {/* Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Runs (batch)" value={stats?.batchTotal ?? "—"} sub="in selected period" icon={BarChart2} />
        <StatCard label="Batch Successes"    value={stats?.batchSuccess ?? "—"} icon={CheckCircle2} accent="text-green-600 dark:text-green-400" />
        <StatCard label="Batch Failures"     value={stats?.batchFailed ?? "—"}  icon={XCircle}      accent={stats?.batchFailed > 0 ? "text-destructive" : ""} />
        <StatCard label="Email Sends"        value={stats?.emailTotal ?? "—"}   sub={stats?.emailFailed > 0 ? `${stats.emailFailed} failed` : "all OK"} icon={Mail} accent={stats?.emailFailed > 0 ? "text-amber-600 dark:text-amber-400" : ""} />
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onChange={setFilters} accounts={accounts} />

      {/* Tabs */}
      <Tabs defaultValue="batch">
        <TabsList data-testid="tabs-delivery-monitor">
          <TabsTrigger value="batch" data-testid="tab-batch-reports">
            <FileText className="h-3.5 w-3.5 mr-1.5" />Batch Reports
          </TabsTrigger>
          <TabsTrigger value="email" data-testid="tab-email-sends">
            <Mail className="h-3.5 w-3.5 mr-1.5" />Email Sends
          </TabsTrigger>
        </TabsList>
        <TabsContent value="batch" className="mt-4">
          <BatchReportsTab filters={filters} />
        </TabsContent>
        <TabsContent value="email" className="mt-4">
          <EmailSendsTab filters={filters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
