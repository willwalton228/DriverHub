import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  FileText, FileSpreadsheet, Download, Loader2, RefreshCw,
  BarChart2, Calendar, Mail, CheckCircle2, XCircle, AlertTriangle,
  Eye, Send, Users, X, Settings2, Clock, CalendarCheck, Lock,
} from "lucide-react";
import { format } from "date-fns";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDefaultWeekStart(): string {
  const now = new Date();
  const dow = now.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  return mon.toISOString().split("T")[0];
}

function getWeekEnd(ws: string): string {
  const d = new Date(ws + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().split("T")[0];
}

function isoToMDY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function parseEmails(raw: string): string[] {
  return raw.split(",").map(e => e.trim()).filter(Boolean);
}

// ── Scheduling constants ───────────────────────────────────────────────────────

const SEND_DAY_OPTIONS = [
  { value: "monday",    label: "Monday" },
  { value: "tuesday",   label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday",  label: "Thursday" },
  { value: "friday",    label: "Friday" },
  { value: "saturday",  label: "Saturday" },
  { value: "sunday",    label: "Sunday" },
];

const TIMEZONE_OPTIONS = [
  { value: "America/New_York",    label: "Eastern (ET)" },
  { value: "America/Chicago",     label: "Central (CT)" },
  { value: "America/Denver",      label: "Mountain (MT)" },
  { value: "America/Phoenix",     label: "Arizona (MST, no DST)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage",   label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HST)" },
];

const ELIGIBLE_MODELS = new Set(["drivershift", "hybrid"]);

function computeNextSendLabel(dayStr: string, timeStr: string, timezone: string): string {
  try {
    const DAY_MAP: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };
    const WD_NAME_MAP: Record<string, number> = {
      Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
      Thursday: 4, Friday: 5, Saturday: 6,
    };
    const targetDow = DAY_MAP[dayStr?.toLowerCase() ?? "monday"] ?? 1;
    const [hh = 8, mm = 0] = (timeStr || "08:00").split(":").map(Number);
    const now = new Date();
    const tzFmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...opts }).format(d);

    const curDowName = tzFmt(now, { weekday: "long" });
    const curDow = WD_NAME_MAP[curDowName] ?? 0;

    const timeParts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
    const tpMap = Object.fromEntries(timeParts.map(p => [p.type, p.value]));
    const curHour = parseInt(tpMap.hour === "24" ? "0" : (tpMap.hour ?? "0"));
    const curMin  = parseInt(tpMap.minute ?? "0");

    let daysUntil = targetDow - curDow;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0 && (hh < curHour || (hh === curHour && mm <= curMin))) daysUntil = 7;

    const nextDate = new Date(now.getTime() + daysUntil * 86_400_000);
    const dateLabel = tzFmt(nextDate, { weekday: "short", month: "short", day: "numeric" });
    const h12 = hh % 12 || 12;
    const ampm = hh < 12 ? "AM" : "PM";
    const tzAbbrev = tzFmt(now, { timeZoneName: "short" }).split(", ").pop()?.split(" ").pop() ?? "";
    return `${dateLabel} at ${h12}:${String(mm).padStart(2, "0")} ${ampm} ${tzAbbrev}`;
  } catch {
    return "—";
  }
}

// ── Card 0 — Automated Delivery Schedule ─────────────────────────────────────

function ReportingScheduleCard({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Local form state
  const [sendEnabled, setSendEnabled] = useState(false);
  const [sendDay, setSendDay]         = useState("monday");
  const [sendTime, setSendTime]       = useState("08:00");
  const [includePdf, setIncludePdf]   = useState(true);
  const [includeExcel, setIncludeExcel] = useState(true);
  const [dirty, setDirty]             = useState(false);

  // Fetch config (shared cache key with EmailPreviewSendCard)
  const { data: config, isLoading } = useQuery<any>({
    queryKey: ["/api/customers", customerId, "report-config"],
    queryFn: () =>
      fetch(`/api/customers/${customerId}/report-config`, { credentials: "include" })
        .then(r => r.json()),
  });

  // Fetch delivery log for "Last Sent"
  const { data: deliveryLog = [] } = useQuery<any[]>({
    queryKey: ["/api/customers", customerId, "delivery-log"],
    queryFn: () =>
      fetch(`/api/customers/${customerId}/report-delivery/log`, { credentials: "include" })
        .then(r => r.ok ? r.json() : []),
  });

  // Sync config into form whenever it loads (skip if user has made unsaved edits)
  useEffect(() => {
    if (config && !dirty) {
      setSendEnabled(config.sendWeeklyReport ?? false);
      setSendDay(config.reportSendDay ?? "monday");
      setSendTime(config.reportSendTime ?? "08:00");
      setIncludePdf(config.includeSchedulePdf !== false);
      setIncludeExcel(config.includeHoursExcel !== false);
    }
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  const isEligible = config ? ELIGIBLE_MODELS.has(config.driverModel ?? "") : true;
  const timezone   = config?.reportTimezone ?? "America/Chicago";

  const lastSuccessful = deliveryLog.find((r: any) => r.status === "success");
  const nextSendLabel  = sendEnabled && isEligible
    ? computeNextSendLabel(sendDay, sendTime, timezone)
    : "—";

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/customers/${customerId}/report-config`, {
        sendWeeklyReport:  sendEnabled,
        reportSendDay:     sendDay,
        reportSendTime:    sendTime,
        includeSchedulePdf: includePdf,
        includeHoursExcel:  includeExcel,
      }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/customers", customerId, "report-config"] });
      toast({ title: "Settings saved", description: "Automated delivery settings updated." });
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true); };
  }

  const lastSuccessfulRecipientCount = lastSuccessful?.recipientCount ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-indigo-500/10 p-2 mt-0.5">
            <Settings2 className="h-5 w-5 text-indigo-500" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">Automated Weekly Report</CardTitle>
            <CardDescription className="mt-1">
              Configure automated weekly report delivery for this account.
            </CardDescription>
          </div>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-1 shrink-0" />}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">

        {/* Delivery name + status summary bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3">
          <div className="space-y-0.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Delivery Name</p>
            <p className="text-sm font-medium" data-testid="text-delivery-name">Weekly Driver Schedule Report</p>
          </div>
          <Badge
            variant={sendEnabled && isEligible ? "default" : "secondary"}
            data-testid="badge-delivery-status"
          >
            {sendEnabled && isEligible ? "Enabled" : "Disabled"}
          </Badge>
        </div>

        {/* Eligibility warning */}
        {!isLoading && !isEligible && (
          <div className="flex items-start gap-2.5 rounded-md bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            <Lock className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">Not eligible for automated delivery.</span>
              {" "}This feature is only available to <strong>DriverShift</strong> and <strong>Hybrid</strong> accounts.
              The account's current driver model is{" "}
              <strong>{config?.driverModel ?? "not set"}</strong>.
            </div>
          </div>
        )}

        {/* Stats row — Last Sent / Emails Sent / Next Scheduled */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Last Sent
            </div>
            <p className="text-sm" data-testid="text-last-sent">
              {lastSuccessful
                ? format(new Date(lastSuccessful.sentAt), "MMM d, yyyy h:mm a")
                : <span className="text-muted-foreground">Never</span>
              }
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Emails Sent
            </div>
            <p className="text-sm" data-testid="text-emails-sent">
              {lastSuccessful
                ? <>{lastSuccessfulRecipientCount} recipient{lastSuccessfulRecipientCount !== 1 ? "s" : ""}</>
                : <span className="text-muted-foreground">—</span>
              }
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarCheck className="h-3.5 w-3.5" />
              Next Scheduled Send
            </div>
            <p className="text-sm" data-testid="text-next-send">
              {sendEnabled && isEligible
                ? nextSendLabel
                : <span className="text-muted-foreground">Disabled</span>
              }
            </p>
          </div>
        </div>

        <Separator />

        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Enable Automated Weekly Send</Label>
            <p className="text-xs text-muted-foreground">
              Automatically deliver the weekly schedule report on the configured day and time.
            </p>
          </div>
          <Switch
            checked={sendEnabled}
            onCheckedChange={markDirty(setSendEnabled)}
            disabled={!isEligible || isLoading}
            data-testid="switch-send-enabled"
          />
        </div>

        <Separator />

        {/* Schedule config */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Schedule Config</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Send Day</Label>
              <Select
                value={sendDay}
                onValueChange={markDirty(setSendDay)}
                disabled={!isEligible || isLoading}
              >
                <SelectTrigger data-testid="select-send-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEND_DAY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Send Time</Label>
              <Input
                type="time"
                value={sendTime}
                onChange={e => markDirty(setSendTime)(e.target.value)}
                disabled={!isEligible || isLoading}
                data-testid="input-send-time"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Time Zone</Label>
              <div
                className="flex h-9 w-full items-center rounded-md border border-input bg-muted/40 px-3 py-1 text-sm text-muted-foreground cursor-not-allowed"
                data-testid="display-timezone"
              >
                {TIMEZONE_OPTIONS.find(o => o.value === timezone)?.label ?? timezone}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Inherited from account timezone. Edit in Company Details.
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Attachment toggles */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Attachments</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
              <div className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Schedule PDF</p>
                  <p className="text-xs text-muted-foreground">Weekly shift schedule</p>
                </div>
              </div>
              <Switch
                checked={includePdf}
                onCheckedChange={markDirty(setIncludePdf)}
                disabled={!isEligible || isLoading}
                data-testid="switch-include-pdf"
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Hours Excel</p>
                  <p className="text-xs text-muted-foreground">Driver hours workbook</p>
                </div>
              </div>
              <Switch
                checked={includeExcel}
                onCheckedChange={markDirty(setIncludeExcel)}
                disabled={!isEligible || isLoading}
                data-testid="switch-include-excel"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Save */}
        <div className="flex items-center gap-3 pt-1">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending || !isEligible || isLoading}
            data-testid="button-save-report-schedule"
          >
            {saveMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
              : "Save Settings"
            }
          </Button>
          {dirty && !saveMutation.isPending && (
            <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
          )}
        </div>

      </CardContent>
    </Card>
  );
}

// ── Card 1 — Legacy Shift Report (comparison PDF) ─────────────────────────────

function PdfReportCard({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState(getDefaultWeekStart);
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    const ws = weekStart || getDefaultWeekStart();
    const we = getWeekEnd(ws);
    setIsGenerating(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/weekly-shift-report/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ weekStart: ws, weekEnd: we }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const shiftCount     = res.headers.get("X-Shift-Count")     ?? "?";
      const driverCount    = res.headers.get("X-Driver-Count")    ?? "?";
      const exceptionCount = res.headers.get("X-Exception-Count") ?? "0";
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `WeeklyShiftReport_${ws}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Weekly Shift Report ready",
        description: `${shiftCount} shifts · ${driverCount} drivers · ${exceptionCount} exceptions`,
      });
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 mt-0.5">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">Weekly Shift Report</CardTitle>
            <CardDescription className="mt-1">
              Internal report comparing scheduled vs worked shifts with exceptions summary.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Week starting (Mon)</p>
            <Input
              type="date"
              value={weekStart}
              onChange={e => setWeekStart(e.target.value)}
              className="w-44"
              data-testid="input-pdf-week-start"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleGenerate}
            disabled={isGenerating}
            data-testid="button-generate-pdf-report"
          >
            {isGenerating
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
              : <><Download className="h-4 w-4 mr-1.5" />Download PDF</>
            }
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Card 2 — Hours Excel Export ───────────────────────────────────────────────

function ExcelReportCard({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(getDefaultWeekStart);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: reports = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/customers", customerId, "hours-report-list"],
    queryFn: () =>
      fetch(`/api/customers/${customerId}/hours-report/list?limit=10`)
        .then(r => r.json()),
  });

  const generateMutation = useMutation({
    mutationFn: async (opts: { weekStart?: string; force?: boolean }) => {
      const res = await apiRequest(
        "POST",
        `/api/customers/${customerId}/hours-report/generate`,
        opts,
      );
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/customers", customerId, "hours-report-list"],
      });
      if (data.alreadyExists) {
        toast({ title: "Report already exists", description: "Use the force option to regenerate." });
      } else {
        toast({ title: "Hours Excel generated", description: `${data.shiftCount} shifts · ${data.driverCount} drivers` });
      }
    },
    onError: (e: any) => {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    },
  });

  async function handleDownload(docId: string) {
    setDownloadingId(docId);
    try {
      const res = await fetch(`/api/customers/${customerId}/hours-report/${docId}/download`);
      const data = await res.json();
      if (!data.url) throw new Error("No download URL returned");
      window.open(data.url, "_blank");
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-md bg-emerald-500/10 p-2 mt-0.5">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">Shift Detail Export</CardTitle>
              <CardDescription className="mt-1">
                Two-sheet Excel workbook — summary + raw shift entries.
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-excel-list">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Week starting (Mon)</p>
            <Input
              type="date"
              value={weekStart}
              onChange={e => setWeekStart(e.target.value)}
              className="w-44"
              data-testid="input-excel-week-start"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => generateMutation.mutate({ weekStart: weekStart || getDefaultWeekStart() })}
            disabled={generateMutation.isPending}
            data-testid="button-generate-excel-report"
          >
            {generateMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
              : <><FileSpreadsheet className="h-4 w-4 mr-1.5" />Generate Excel</>
            }
          </Button>
        </div>

        {isLoading ? (
          <div className="py-6 flex items-center justify-center text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />Loading report history…
          </div>
        ) : reports.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground text-sm">No Excel reports generated yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Drivers</TableHead>
                  <TableHead className="text-right">Total Hrs</TableHead>
                  <TableHead className="text-right">OT Hrs</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r: any) => (
                  <TableRow key={r.id} data-testid={`row-excel-report-${r.id}`}>
                    <TableCell className="text-sm font-medium whitespace-nowrap">
                      {r.weekStart ? isoToMDY(r.weekStart) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right">{r.entryCount ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right">{r.driverCount ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right">{r.totalHours ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right">
                      {(r.totalOtHours ?? 0) > 0
                        ? <Badge variant="outline" className="text-amber-600 border-amber-400 dark:text-amber-400">{r.totalOtHours}h OT</Badge>
                        : <span className="text-muted-foreground">{r.totalOtHours ?? 0}</span>
                      }
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {r.createdAt ? format(new Date(r.createdAt), "MMM d, h:mm a") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="default"
                        onClick={() => handleDownload(r.id)}
                        disabled={downloadingId === r.id}
                        data-testid={`button-download-excel-${r.id}`}
                      >
                        {downloadingId === r.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <><Download className="h-4 w-4 mr-1.5" />Download</>
                        }
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Card 3 — Email Preview & Manual Send ─────────────────────────────────────

function EmailPreviewSendCard({ customerId }: { customerId: string }) {
  const { toast } = useToast();

  const [weekStart, setWeekStart]             = useState(getDefaultWeekStart);
  const [previewOpen, setPreviewOpen]         = useState(false);
  const [previewSrc, setPreviewSrc]           = useState<string | null>(null);
  const [recipientOverride, setRecipientOverride] = useState("");
  const [ccOverride, setCcOverride]           = useState("");
  const [sendResult, setSendResult]           = useState<any | null>(null);

  const weekEnd = getWeekEnd(weekStart);

  const { data: config } = useQuery<any>({
    queryKey: ["/api/customers", customerId, "report-config"],
    queryFn: () => fetch(`/api/customers/${customerId}/report-config`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: graphStatus } = useQuery<any>({
    queryKey: ["/api/reports/weekly/graph-status"],
    queryFn: () => fetch("/api/reports/weekly/graph-status", { credentials: "include" }).then(r => r.json()),
  });

  const { data: deliveryLog = [], isLoading: logLoading, refetch: refetchLog } = useQuery<any[]>({
    queryKey: ["/api/customers", customerId, "delivery-log"],
    queryFn: () =>
      fetch(`/api/customers/${customerId}/report-delivery/log`, { credentials: "include" })
        .then(r => r.ok ? r.json() : []),
  });

  const graphConfigured = graphStatus?.configured === true;

  const configuredToList: string[] = Array.isArray(config?.reportPrimaryEmails) && config.reportPrimaryEmails.length > 0
    ? config.reportPrimaryEmails
    : config?.reportPrimaryEmail
      ? [config.reportPrimaryEmail]
      : config?.primaryContactEmail
        ? [config.primaryContactEmail]
        : [];
  const configuredCcList: string[] = Array.isArray(config?.reportCcEmails) ? config.reportCcEmails : [];

  const overrideToList  = recipientOverride.trim() ? parseEmails(recipientOverride) : [];
  const overrideCcList  = ccOverride.trim()        ? parseEmails(ccOverride)        : [];
  const effectiveTo     = overrideToList.length > 0 ? overrideToList : configuredToList;
  const hasRecipient    = effectiveTo.length > 0;

  function handleWeekChange(val: string) {
    setWeekStart(val);
    setPreviewOpen(false);
    setPreviewSrc(null);
    setSendResult(null);
  }

  function handlePreview() {
    const url = `/api/customers/${customerId}/report-preview/pdf?weekStart=${weekStart}&weekEnd=${weekEnd}`;
    setPreviewSrc(url);
    setPreviewOpen(true);
  }

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/report-delivery/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          weekStart,
          weekEnd,
          recipientOverrides: overrideToList.length > 0 ? overrideToList : undefined,
          ccOverrides:        overrideCcList.length > 0 ? overrideCcList : undefined,
        }),
      });
      const data = await res.json();
      // treat blocked (503) and server errors (5xx) the same as success path
      // so we can render the result in the UI instead of just a toast
      return { ...data, _httpStatus: res.status };
    },
    onSuccess: (data: any) => {
      setSendResult(data);
      refetchLog();
      if (data.status === "success") {
        toast({ title: "Report sent", description: `Delivered to ${data.emailTo}` });
      } else if (data.blocked) {
        toast({ title: "Send blocked", description: data.error ?? data.message, variant: "destructive" });
      } else if (data.status === "skipped") {
        toast({ title: "Send skipped", description: data.error, variant: "default" });
      } else {
        toast({ title: "Send failed", description: data.error ?? data.message, variant: "destructive" });
      }
    },
    onError: (e: any) => {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-blue-500/10 p-2 mt-0.5">
            <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">Email Report</CardTitle>
            <CardDescription className="mt-1">
              Preview the weekly PDF and send it directly to account contacts.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">

        {/* ── Week picker + Preview ── */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Week starting (Mon)</p>
            <Input
              type="date"
              value={weekStart}
              onChange={e => handleWeekChange(e.target.value)}
              className="w-44"
              data-testid="input-email-week-start"
            />
          </div>
          <Button
            variant="outline"
            onClick={handlePreview}
            data-testid="button-preview-pdf"
          >
            <Eye className="h-4 w-4 mr-1.5" />Preview PDF
          </Button>
        </div>

        {/* ── PDF Preview panel ── */}
        {previewOpen && previewSrc && (
          <div className="rounded-md border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
              <span className="text-xs font-medium text-muted-foreground">
                PDF Preview — Week of {isoToMDY(weekStart)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPreviewOpen(false)}
                data-testid="button-close-preview"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <iframe
              src={previewSrc}
              className="w-full"
              style={{ height: 520 }}
              title="Weekly Report Preview"
              data-testid="iframe-pdf-preview"
            />
          </div>
        )}

        <Separator />

        {/* ── Recipients ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Recipients</span>
          </div>

          {/* Configured recipients display */}
          <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground font-medium w-6 shrink-0">To:</span>
              {configuredToList.length > 0
                ? <span className="break-all">{configuredToList.join(", ")}</span>
                : <em className="text-muted-foreground">No recipient configured</em>
              }
            </div>
            {configuredCcList.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground font-medium w-6 shrink-0">CC:</span>
                <span className="break-all">{configuredCcList.join(", ")}</span>
              </div>
            )}
          </div>

          {/* Override fields */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Override To <span className="italic">(optional)</span></Label>
              <Input
                placeholder="email@example.com, email2@example.com"
                value={recipientOverride}
                onChange={e => setRecipientOverride(e.target.value)}
                data-testid="input-override-to"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Override CC <span className="italic">(optional)</span></Label>
              <Input
                placeholder="cc@example.com"
                value={ccOverride}
                onChange={e => setCcOverride(e.target.value)}
                data-testid="input-override-cc"
              />
            </div>
          </div>

          {(overrideToList.length > 0 || overrideCcList.length > 0) && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Override active — this send will use the addresses above instead of configured recipients.
            </p>
          )}
        </div>

        <Separator />

        {/* ── Attachments ── */}
        <div className="space-y-2.5">
          <p className="text-sm font-medium">Attachments</p>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm">Schedule PDF</span>
              <Badge variant="secondary" className="text-xs">Included</Badge>
            </div>
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="text-sm">Hours Excel</span>
              <Badge variant="outline" className="text-xs">Coming soon</Badge>
            </div>
          </div>
        </div>

        {/* ── M365 warning ── */}
        {!graphConfigured && (
          <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Microsoft 365 is not configured. Set up credentials under <strong>Platform Admin → Microsoft 365 Email</strong> before sending.</span>
          </div>
        )}

        {/* ── Send Now ── */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !graphConfigured || !hasRecipient}
            data-testid="button-send-report-email"
          >
            {sendMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
              : <><Send className="h-4 w-4 mr-1.5" />Send Now</>
            }
          </Button>
          {overrideToList.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Will send to: {overrideToList.join(", ")}
            </span>
          )}
          {!hasRecipient && (
            <span className="text-xs text-muted-foreground">
              Configure a recipient in Company Details to enable sending.
            </span>
          )}
        </div>

        {/* ── Send result ── */}
        {sendResult && (
          <div
            className={`flex items-start gap-2 rounded-md px-4 py-3 text-sm ${
              sendResult.status === "success"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : sendResult.blocked
                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
            }`}
            data-testid="result-email-send"
          >
            {sendResult.status === "success"
              ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            }
            <span>
              {sendResult.status === "success"
                ? `Sent successfully to ${sendResult.emailTo}`
                : sendResult.blocked
                ? `Mailbox blocked: ${sendResult.error ?? sendResult.message ?? "Sender mailbox is not operational. Check Microsoft 365 Email admin."}`
                : sendResult.error ?? sendResult.message ?? "Send skipped"
              }
            </span>
          </div>
        )}

        {/* ── Delivery history ── */}
        {deliveryLog.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Recent Sends</p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => refetchLog()}
                  disabled={logLoading}
                  data-testid="button-refresh-delivery-log"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${logLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Week</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent To</TableHead>
                      <TableHead>Sent At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveryLog.slice(0, 8).map((row: any) => (
                      <TableRow key={row.id} data-testid={`row-delivery-log-${row.id}`}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {row.reportWeekStart ? isoToMDY(row.reportWeekStart) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.status === "success" ? "default" : "outline"}
                            className={`text-xs ${
                              row.status === "success"
                                ? "bg-green-600 text-white"
                                : row.status === "failed"
                                  ? "text-destructive border-destructive"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {row.emailTo || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {row.sentAt ? format(new Date(row.sentAt), "MMM d, h:mm a") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface AccountWeeklyReportTabProps {
  customerId: string;
  compact?: boolean;
}

export default function AccountWeeklyReportTab({ customerId, compact }: AccountWeeklyReportTabProps) {
  return (
    <div className={compact ? "space-y-5" : "space-y-6 p-6"}>
      {!compact && (
        <>
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2">
              <BarChart2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Weekly Reporting</h2>
              <p className="text-sm text-muted-foreground">
                Generate on-demand reports and send directly to account contacts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Defaults to current week. Select any Monday to generate historical reports.
            </span>
          </div>
        </>
      )}

      {/* Automated delivery settings */}
      <ReportingScheduleCard customerId={customerId} />

      {/* Internal download cards */}
      <div className={`grid gap-5 ${compact ? "grid-cols-1" : "md:grid-cols-2"}`}>
        <PdfReportCard customerId={customerId} />
        <ExcelReportCard customerId={customerId} />
      </div>

      {/* Customer-facing email send + preview */}
      <EmailPreviewSendCard customerId={customerId} />
    </div>
  );
}
