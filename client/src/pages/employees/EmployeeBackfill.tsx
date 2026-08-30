import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Users, CheckCircle2, AlertTriangle, ArrowRight,
  RefreshCw, Play, Eye, ShieldCheck, UserCheck, UserX,
  ClipboardList, Info, ChevronDown, ChevronRight,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

// ─── Status Card ─────────────────────────────────────────────────────────────

function StatusKpiCard({
  label, value, icon: Icon, cls,
}: {
  label: string; value: number | string; icon: any; cls?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className={`h-4 w-4 ${cls ?? "text-muted-foreground"}`} />
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        <p className={`text-2xl font-bold ${cls ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── Collapsible list ─────────────────────────────────────────────────────────

function CollapsibleList({ title, icon: Icon, items, renderItem, emptyMessage, defaultOpen = false }: {
  title: string; icon: any;
  items: any[];
  renderItem: (item: any) => React.ReactNode;
  emptyMessage?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-md overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover-elevate"
        onClick={() => setOpen(o => !o)}
        data-testid={`toggle-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <span>{title}</span>
          <Badge variant="secondary" className="text-xs border-transparent bg-muted">{items.length}</Badge>
        </div>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="border-t">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground px-4 py-3">{emptyMessage ?? "None"}</p>
          ) : (
            <div className="divide-y max-h-80 overflow-y-auto">
              {items.map((item, i) => (
                <div key={item.driverId ?? item.employeeId ?? i} className="px-4 py-2.5">
                  {renderItem(item)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmployeeBackfill() {
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<any | null>(null);
  const [showLog, setShowLog] = useState(false);

  // ── Status query ─────────────────────────────────────────────────────────
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery<any>({
    queryKey: ["/api/corporate/employees/backfill/status"],
    queryFn: async () => {
      const res = await fetch("/api/corporate/employees/backfill/status", { credentials: "include" });
      return res.json();
    },
  });

  // ── Sync log query ───────────────────────────────────────────────────────
  const { data: logData, isLoading: logLoading, refetch: refetchLog } = useQuery<any>({
    queryKey: ["/api/corporate/employees/backfill/log"],
    queryFn: async () => {
      const res = await fetch("/api/corporate/employees/backfill/log?limit=100", { credentials: "include" });
      return res.json();
    },
    enabled: showLog,
  });

  // ── Dry-run mutation ─────────────────────────────────────────────────────
  const dryRunMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/corporate/employees/backfill/run", { dryRun: true }),
    onSuccess: (data: any) => {
      setLastResult(data);
      toast({ title: `Dry run complete — would create ${data.created} Employee records` });
    },
    onError: (e: any) => toast({ title: e.message || "Dry run failed", variant: "destructive" }),
  });

  // ── Live run mutation ────────────────────────────────────────────────────
  const runMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/corporate/employees/backfill/run", { dryRun: false }),
    onSuccess: (data: any) => {
      setLastResult(data);
      refetchStatus();
      refetchLog();
      toast({
        title: `Backfill complete — ${data.created} created, ${data.skipped} already linked, ${data.exceptions.length} exceptions`,
      });
    },
    onError: (e: any) => toast({ title: e.message || "Backfill failed", variant: "destructive" }),
  });

  const anyPending = dryRunMutation.isPending || runMutation.isPending;
  const logs: any[] = logData?.logs ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4 sm:p-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Employee Record Backfill
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          One-time operation to create linked Employee records for all existing Drivers classified as Employees —
          required before Employee module go-live, payroll processing, or onboarding workflows.
        </p>
      </div>

      {/* ── Requirements callout ─────────────────────────────────────────── */}
      <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                This backfill must be completed BEFORE:
              </p>
              <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-0.5 ml-2">
                <li>• Employee module go-live / user adoption</li>
                <li>• Onboarding workflows tied to Employee records</li>
                <li>• Payroll / earnings processing tied to Employee records</li>
                <li>• Any reporting or integrations relying on Employee data</li>
              </ul>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                The operation is <strong>idempotent</strong> — running it multiple times is safe. Existing linked records are skipped or refreshed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Current Status ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Current Status</h2>
          <Button variant="ghost" size="icon" onClick={() => refetchStatus()} disabled={statusLoading}>
            <RefreshCw className={`h-4 w-4 ${statusLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {statusLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : status ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <StatusKpiCard label="Total Employee-Drivers" value={status.total ?? 0} icon={Users} />
              <StatusKpiCard
                label="Already Linked"
                value={status.linked ?? 0}
                icon={UserCheck}
                cls={status.linked > 0 ? "text-green-600 dark:text-green-400" : undefined}
              />
              <StatusKpiCard
                label="Missing Employee Record"
                value={status.unlinked ?? 0}
                icon={UserX}
                cls={status.unlinked > 0 ? "text-red-600 dark:text-red-400" : undefined}
              />
              <StatusKpiCard label="Terminated" value={status.terminated ?? 0} icon={Info} />
            </div>

            {status.readyToDeploy ? (
              <Card className="border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30">
                <CardContent className="pt-4 pb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      All employee-classified drivers have linked Employee records
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      System is ready for Employee module usage
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30">
                <CardContent className="pt-4 pb-3 flex items-center gap-2">
                  <UserX className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <div>
                    <p className="text-sm font-medium text-red-800 dark:text-red-200">
                      {status.unlinked} driver{status.unlinked !== 1 ? "s" : ""} still missing a linked Employee record
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Run the backfill below to create the missing records
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Unlinked drivers list */}
            {(status.unlinkedDrivers ?? []).length > 0 && (
              <div className="mt-4">
                <CollapsibleList
                  title="Drivers Needing Employee Records"
                  icon={UserX}
                  items={status.unlinkedDrivers}
                  defaultOpen={status.unlinked <= 20}
                  renderItem={(d: any) => (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium">{d.fullName || "(No Name)"}</p>
                        <p className="text-xs text-muted-foreground">{d.email || "No email"} · {d.status}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">#{d.driverNumber}</p>
                        {d.hireDate && <p className="text-xs text-muted-foreground">Hired {fmtDate(d.hireDate)}</p>}
                      </div>
                    </div>
                  )}
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">Failed to load status</p>
        )}
      </div>

      <Separator />

      {/* ── Run Controls ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold mb-1">Run Backfill</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Always run a <strong>Dry Run</strong> first to preview what will be created.
          Then execute the live run. Both operations are fully logged.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            onClick={() => dryRunMutation.mutate()}
            disabled={anyPending}
            data-testid="button-dry-run"
          >
            {dryRunMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Eye className="h-4 w-4 mr-2" />}
            Dry Run (Preview)
          </Button>

          <Button
            onClick={() => runMutation.mutate()}
            disabled={anyPending || status?.readyToDeploy}
            data-testid="button-run-backfill"
          >
            {runMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Play className="h-4 w-4 mr-2" />}
            Run Backfill
          </Button>

          {status?.readyToDeploy && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              No action needed — all records already linked
            </span>
          )}
        </div>
      </div>

      {/* ── Last Run Results ─────────────────────────────────────────────── */}
      {lastResult && (
        <>
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                {lastResult.dryRun ? "Dry Run" : "Backfill"} Results
              </h2>
              <Badge variant="secondary" className="text-xs border-transparent bg-muted">
                {lastResult.dryRun ? "Preview Only" : "Applied"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Total Processed", value: lastResult.total, icon: Users },
                { label: lastResult.dryRun ? "Would Create" : "Created", value: lastResult.created, icon: UserCheck, cls: lastResult.created > 0 ? "text-green-600 dark:text-green-400" : undefined },
                { label: "Skipped (Already Linked)", value: lastResult.skipped + (lastResult.updated ?? 0), icon: CheckCircle2 },
                { label: "Exceptions", value: lastResult.exceptions.length, icon: AlertTriangle, cls: lastResult.exceptions.length > 0 ? "text-red-600 dark:text-red-400" : undefined },
              ].map(({ label, value, icon: Icon, cls }) => (
                <StatusKpiCard key={label} label={label} value={value} icon={Icon} cls={cls} />
              ))}
            </div>

            <div className="space-y-3">
              {lastResult.createdList?.length > 0 && (
                <CollapsibleList
                  title={lastResult.dryRun ? "Would Create" : "Created Employee Records"}
                  icon={UserCheck}
                  items={lastResult.createdList}
                  defaultOpen
                  renderItem={(item: any) => (
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">{item.fullName || "(No Name)"}</p>
                      {!lastResult.dryRun && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ArrowRight className="h-3 w-3" />
                          <span className="font-mono">{item.employeeId.slice(0, 8)}…</span>
                        </div>
                      )}
                    </div>
                  )}
                  emptyMessage="None to create"
                />
              )}

              {lastResult.updatedList?.length > 0 && (
                <CollapsibleList
                  title="Updated (Fields Refreshed)"
                  icon={RefreshCw}
                  items={lastResult.updatedList}
                  renderItem={(item: any) => (
                    <div>
                      <p className="text-xs font-medium">{item.fullName || "(No Name)"}</p>
                      <p className="text-xs text-muted-foreground">{item.fields.join(", ")}</p>
                    </div>
                  )}
                />
              )}

              {lastResult.exceptions?.length > 0 && (
                <CollapsibleList
                  title="Exceptions — Require Review"
                  icon={AlertTriangle}
                  items={lastResult.exceptions}
                  defaultOpen
                  renderItem={(item: any) => (
                    <div>
                      <p className="text-xs font-medium text-red-700 dark:text-red-300">{item.fullName || "(No Name)"}</p>
                      <p className="text-xs text-muted-foreground">{item.email || "No email"}</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{item.reason}</p>
                    </div>
                  )}
                  emptyMessage="No exceptions"
                />
              )}

              <p className="text-xs text-muted-foreground">
                {lastResult.dryRun ? "Preview" : "Run"} started {new Date(lastResult.startedAt).toLocaleString()}
                {lastResult.completedAt ? ` · completed ${new Date(lastResult.completedAt).toLocaleString()}` : ""}
              </p>
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* ── Sync Log ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold">Sync Audit Log</h2>
          <Button
            variant="ghost"
            size="default"
            className="text-xs"
            onClick={() => { setShowLog(v => !v); if (!showLog) refetchLog(); }}
            data-testid="button-toggle-log"
          >
            {showLog ? "Hide" : "Show"} Log
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Every sync operation (including backfill runs) is logged here for audit purposes.
        </p>

        {showLog && (
          logLoading ? (
            <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No sync log entries yet</p>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium">Driver</th>
                    <th className="text-left py-2 px-3 font-medium">Operation</th>
                    <th className="text-left py-2 px-3 font-medium">Fields Changed</th>
                    <th className="text-left py-2 px-3 font-medium">Synced At</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => (
                    <tr key={log.id} className="border-b last:border-0" data-testid={`row-log-${log.id}`}>
                      <td className="py-2 px-3">{log.driverName?.trim() || log.driverId?.slice(0, 8)}</td>
                      <td className="py-2 px-3">
                        <Badge
                          variant="secondary"
                          className={`border-transparent ${log.operation === "created" ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" : "bg-muted text-muted-foreground"}`}
                        >
                          {log.operation}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground max-w-[200px] truncate">
                        {(log.changedFields as string[] ?? []).join(", ") || "—"}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                        {new Date(log.syncedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ── Post-Backfill Automation Note ────────────────────────────────── */}
      <Card className="border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div className="text-xs space-y-1">
              <p className="font-medium text-blue-800 dark:text-blue-200">Ongoing Automation Active</p>
              <p className="text-blue-700 dark:text-blue-300">
                After this backfill, any new Driver created or updated with classification = "Employee" will automatically
                have a linked Employee record created or refreshed on save — no manual intervention required.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
