import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle, CheckCircle2, XCircle, Clock, Mail, Send, Settings2, X, Plus, RefreshCw,
  FileText, AlertTriangle, Download, CalendarDays, Users, Loader2,
  ShieldAlert, BarChart3, Eye, FileSpreadsheet,
} from "lucide-react";
import { format } from "date-fns";

// ── Schema & types ────────────────────────────────────────────────────────────
const SENDER_PROFILES = ["Reports", "Data", "Support", "Dispatch", "Recruiting"] as const;

const configSchema = z.object({
  reportContactName:   z.string().max(255).optional(),
  sendWeeklyReport:    z.boolean(),
  reportSendDay:       z.string(),
  reportSendTime:      z.string(),
  includeSchedulePdf:  z.boolean(),
  includeHoursExcel:   z.boolean(),
  reportSenderProfile: z.enum(SENDER_PROFILES).default("Reports"),
});

type ConfigFormValues = z.infer<typeof configSchema>;

const DAY_OPTIONS = [
  { value: "monday",    label: "Monday" },
  { value: "tuesday",   label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday",  label: "Thursday" },
  { value: "friday",    label: "Friday" },
  { value: "saturday",  label: "Saturday" },
  { value: "sunday",    label: "Sunday" },
];

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  success:  { label: "Sent",    variant: "default",     icon: CheckCircle2 },
  failed:   { label: "Failed",  variant: "destructive", icon: AlertCircle  },
  skipped:  { label: "Skipped", variant: "secondary",   icon: AlertTriangle },
  pending:  { label: "Pending", variant: "outline",     icon: Clock        },
};

// ── Email tag input (CC / additional recipients) ──────────────────────────────
function EmailTagInput({
  value, onChange, placeholder = "email@example.com", testPrefix = "email",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  testPrefix?: string;
}) {
  const [draft, setDraft] = useState("");

  function addEmail() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!isValid) return;
    if (value.includes(trimmed)) { setDraft(""); return; }
    onChange([...value, trimmed]);
    setDraft("");
  }

  function removeEmail(email: string) {
    onChange(value.filter(e => e !== email));
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          data-testid={`input-${testPrefix}-draft`}
          placeholder={placeholder}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
          className="flex-1"
        />
        <Button type="button" size="default" variant="outline" onClick={addEmail} data-testid={`button-add-${testPrefix}`}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(email => (
            <Badge key={email} variant="secondary" className="gap-1 pr-1" data-testid={`badge-${testPrefix}-${email}`}>
              {email}
              <button
                type="button"
                onClick={() => removeEmail(email)}
                className="ml-0.5 rounded-sm opacity-70 hover:opacity-100"
                data-testid={`button-remove-${testPrefix}-${email}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Contact quick-select chip ─────────────────────────────────────────────────
function ContactChip({
  name, email, selected, onToggle,
}: { name: string | null; email: string | null; selected: boolean; onToggle: () => void }) {
  if (!email) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={`button-contact-chip-${email}`}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors
        ${selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
        }`}
    >
      <Users className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium">{name ?? email}</span>
      {name && <span className="text-xs opacity-60 truncate max-w-[140px]">{email}</span>}
      {selected && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}

// ── Config status / health panel (Section 4) ──────────────────────────────────
function ConfigStatusPanel({
  config, primaryRecipients, graphConfigured, mailboxBlocked,
}: {
  config: any;
  primaryRecipients: string[];
  graphConfigured: boolean;
  mailboxBlocked?: { profile: string; checks: string[] } | null;
}) {
  const warnings: { message: string; key: string; isMailboxBlock?: boolean }[] = [];

  if (!graphConfigured) {
    warnings.push({ key: "graph", message: "Microsoft 365 Email is not configured. Reports cannot be delivered by email." });
  }
  if (mailboxBlocked) {
    const detail = mailboxBlocked.checks.length > 0 ? ` (${mailboxBlocked.checks.join("; ")})` : "";
    warnings.push({
      key: "mailbox",
      message: `Sender mailbox "${mailboxBlocked.profile}" is not operational — report sends are blocked.${detail}`,
      isMailboxBlock: true,
    });
  }
  if (primaryRecipients.length === 0 && !config?.reportPrimaryEmail && !config?.primaryContactEmail) {
    warnings.push({ key: "recipients", message: "No primary recipient configured. Reports will not be sent until an email address is added." });
  }
  if (!config?.includeSchedulePdf && !config?.includeHoursExcel) {
    warnings.push({ key: "attachments", message: "No attachments selected. Enable at least one report type to include meaningful content." });
  }
  if (!config?.sendWeeklyReport) {
    warnings.push({ key: "disabled", message: "Weekly report sending is disabled for this account." });
  }

  if (warnings.length === 0) {
    return (
      <Card>
        <CardContent className="py-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-medium">Report configuration looks good</p>
            <p className="text-xs text-muted-foreground">
              Reports will be delivered to{" "}
              <span className="font-medium text-foreground">
                {primaryRecipients.length > 0 ? primaryRecipients.join(", ") : (config?.reportPrimaryEmail ?? config?.primaryContactEmail ?? "—")}
              </span>
              {config?.reportCcEmails?.length > 0 && ` + ${config.reportCcEmails.length} CC`}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <ShieldAlert className="h-4 w-4" />
          Configuration Issues
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-2">
        {warnings.map(w => (
          <div key={w.key} className="flex items-start gap-2">
            {w.isMailboxBlock
              ? <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            }
            <p className={`text-sm ${w.isMailboxBlock ? "text-destructive" : "text-muted-foreground"}`}>
              {w.message}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Schedule PDF Panel (Section 2 sub-panel) ──────────────────────────────────
function SchedulePdfPanel({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [forceRegen, setForceRegen] = useState(false);

  const { data: reports = [], isLoading: reportsLoading, refetch: refetchReports } = useQuery<any[]>({
    queryKey: ["/api/customers", customerId, "schedule-report-list"],
    queryFn: () => fetch(`/api/customers/${customerId}/schedule-report/list?limit=10`).then(r => r.json()),
  });

  const generateMutation = useMutation({
    mutationFn: async (opts: { weekStart?: string; force?: boolean }) => {
      const res = await apiRequest("POST", `/api/customers/${customerId}/schedule-report/generate`, opts);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "schedule-report-list"] });
      if (data.alreadyExists) {
        toast({ title: "Report already exists", description: "Use force to regenerate.", variant: "default" });
      } else {
        toast({
          title: "Schedule PDF generated",
          description: `${data.shiftCount ?? 0} shifts · ${data.driverCount ?? 0} drivers`,
        });
      }
    },
    onError: (e: any) => { toast({ title: "Generation failed", description: e.message, variant: "destructive" }); },
  });

  async function handleDownload(docId: string) {
    setDownloadingId(docId);
    try {
      const res = await fetch(`/api/customers/${customerId}/schedule-report/${docId}/download`);
      const data = await res.json();
      if (!data.url) throw new Error("No download URL returned");
      window.open(data.url, "_blank");
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  }

  function getDefaultWeekStart() {
    const now = new Date();
    const dow = now.getDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(now); mon.setDate(now.getDate() + diffToMon);
    return mon.toISOString().split("T")[0];
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Schedule PDF Reports
          </CardTitle>
          <CardDescription>Generate and download weekly schedule PDF reports.</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetchReports()} disabled={reportsLoading} data-testid="button-refresh-pdf-list">
          <RefreshCw className={`h-4 w-4 ${reportsLoading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Week Starting (Mon)</p>
            <Input type="date" value={weekStart || getDefaultWeekStart()} onChange={e => setWeekStart(e.target.value)} className="w-44" data-testid="input-pdf-week-start" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="force-pdf" checked={forceRegen} onChange={e => setForceRegen(e.target.checked)} className="rounded" data-testid="checkbox-force-pdf" />
            <label htmlFor="force-pdf" className="text-xs text-muted-foreground">Force regenerate</label>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => generateMutation.mutate({ weekStart: weekStart || getDefaultWeekStart(), force: forceRegen })}
            disabled={generateMutation.isPending}
            data-testid="button-generate-pdf"
          >
            {generateMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</> : <><FileText className="h-4 w-4 mr-1.5" />Generate PDF</>}
          </Button>
        </div>

        {reportsLoading ? (
          <div className="py-6 flex items-center justify-center text-muted-foreground text-sm"><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Loading…</div>
        ) : reports.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-sm">No PDF reports generated yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Shifts</TableHead>
                  <TableHead>Drivers</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r: any) => (
                  <TableRow key={r.id} data-testid={`row-pdf-report-${r.id}`}>
                    <TableCell className="text-sm font-medium whitespace-nowrap">{r.weekStart ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.shiftCount ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.driverCount ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {r.createdAt ? format(new Date(r.createdAt), "MMM d, h:mm a") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="default" onClick={() => handleDownload(r.id)} disabled={downloadingId === r.id} data-testid={`button-download-pdf-${r.id}`}>
                        {downloadingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="h-4 w-4 mr-1.5" />Download</>}
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

// ── Hours Excel Panel ─────────────────────────────────────────────────────────
function HoursReportPanel({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: reports = [], isLoading: reportsLoading, refetch: refetchReports } = useQuery<any[]>({
    queryKey: ["/api/customers", customerId, "hours-report-list"],
    queryFn: () => fetch(`/api/customers/${customerId}/hours-report/list?limit=10`).then(r => r.json()),
  });

  const generateMutation = useMutation({
    mutationFn: async (opts: { weekStart?: string; force?: boolean }) => {
      const res = await apiRequest("POST", `/api/customers/${customerId}/hours-report/generate`, opts);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "hours-report-list"] });
      if (data.alreadyExists) {
        toast({ title: "Report already exists", description: "Use force to regenerate.", variant: "default" });
      } else {
        toast({
          title: "Hours Excel generated",
          description: `${data.entryCount} entries · ${data.driverCount} drivers · ${data.totalHours}h`,
        });
      }
    },
    onError: (e: any) => { toast({ title: "Generation failed", description: e.message, variant: "destructive" }); },
  });

  async function handleDownload(docId: string) {
    setDownloadingId(docId);
    try {
      const res = await fetch(`/api/customers/${customerId}/hours-report/${docId}/download`);
      const data = await res.json();
      if (!data.url) throw new Error("No download URL");
      window.open(data.url, "_blank");
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  }

  function getDefaultWeekStart() {
    const now = new Date();
    const dow = now.getDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(now); mon.setDate(now.getDate() + diffToMon);
    return mon.toISOString().split("T")[0];
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            Hours Excel Reports
          </CardTitle>
          <CardDescription>Generate and download weekly hours Excel workbooks.</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetchReports()} disabled={reportsLoading} data-testid="button-refresh-hours-list">
          <RefreshCw className={`h-4 w-4 ${reportsLoading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Week Starting (Mon)</p>
            <Input type="date" value={weekStart || getDefaultWeekStart()} onChange={e => setWeekStart(e.target.value)} className="w-44" data-testid="input-hours-week-start" />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => generateMutation.mutate({ weekStart: weekStart || getDefaultWeekStart() })}
            disabled={generateMutation.isPending}
            data-testid="button-generate-hours"
          >
            {generateMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</> : <><FileSpreadsheet className="h-4 w-4 mr-1.5" />Generate Excel</>}
          </Button>
        </div>

        {reportsLoading ? (
          <div className="py-6 flex items-center justify-center text-muted-foreground text-sm"><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Loading…</div>
        ) : reports.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-sm">No Excel reports generated yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Entries</TableHead>
                  <TableHead>Drivers</TableHead>
                  <TableHead>Total Hrs</TableHead>
                  <TableHead>OT Hrs</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r: any) => (
                  <TableRow key={r.id} data-testid={`row-hours-report-${r.id}`}>
                    <TableCell className="text-sm font-medium whitespace-nowrap">{r.weekStart ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.entryCount ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.driverCount ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.totalHours ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.totalOtHours ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {r.createdAt ? format(new Date(r.createdAt), "MMM d, h:mm a") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="default" onClick={() => handleDownload(r.id)} disabled={downloadingId === r.id} data-testid={`button-download-hours-${r.id}`}>
                        {downloadingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="h-4 w-4 mr-1.5" />Download</>}
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

// ── Weekly Shift Report Panel ─────────────────────────────────────────────────
function WeeklyShiftReportPanel({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  function getDefaultWeekStart() {
    const now = new Date();
    const dow = now.getDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(now); mon.setDate(now.getDate() + diffToMon);
    return mon.toISOString().split("T")[0];
  }

  function getWeekEnd(ws: string): string {
    const d = new Date(ws + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 6);
    return d.toISOString().split("T")[0];
  }

  async function handleGenerate() {
    const ws = weekStart || getDefaultWeekStart();
    const we = getWeekEnd(ws);
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/weekly-shift-report/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ weekStart: ws, weekEnd: we }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const shiftCount     = res.headers.get("X-Shift-Count")     ?? "?";
      const driverCount    = res.headers.get("X-Driver-Count")    ?? "?";
      const exceptionCount = res.headers.get("X-Exception-Count") ?? "0";
      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const fileName = `WeeklyShiftReport_${ws}.pdf`;
      const a        = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
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
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Weekly Shift Report
        </CardTitle>
        <CardDescription>Generate a PDF comparing scheduled vs worked hours, with exceptions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Week Starting (Mon)</p>
            <Input
              type="date"
              value={weekStart || getDefaultWeekStart()}
              onChange={e => setWeekStart(e.target.value)}
              className="w-44"
              data-testid="input-weekly-shift-week-start"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleGenerate}
            disabled={isGenerating}
            data-testid="button-generate-weekly-shift-report"
          >
            {isGenerating
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
              : <><Download className="h-4 w-4 mr-1.5" />Generate &amp; Download</>
            }
          </Button>
        </div>
        <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground text-sm">Report includes:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Executive summary — scheduled vs worked hours, variance, exceptions</li>
            <li>Daily sections — driver name, scheduled time, worked time, status</li>
            <li>Exceptions section — missed shifts, late arrivals, early departures</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function GenerationLogPanel({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState("");

  const { data: logs = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/customers", customerId, "account-report-logs"],
    queryFn: () => fetch(`/api/customers/${customerId}/account-report-logs?limit=30`).then(r => r.json()),
  });

  const generateMutation = useMutation({
    mutationFn: async (opts: { weekStart?: string }) => {
      const res = await apiRequest("POST", `/api/customers/${customerId}/account-report-logs/generate`, opts);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "account-report-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "schedule-report-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "hours-report-list"] });
      const status = data.status ?? "unknown";
      const emailNote = data.emailStatus === "success" ? " · Email sent"
        : data.emailStatus === "failed" ? ` · Email failed: ${data.emailError ?? "unknown"}`
        : data.emailStatus === "skipped" ? " · Email skipped" : "";
      if (status === "success") {
        toast({ title: "Reports generated", description: `PDF ${data.pdfGenerated ? "✓" : "skipped"} · Excel ${data.excelGenerated ? "✓" : "skipped"}${emailNote}` });
      } else if (status === "partial") {
        toast({ title: "Partially generated", description: (data.errors?.join("; ") ?? "One or more files had errors.") + emailNote, variant: "default" });
      } else {
        toast({ title: "Generation failed", description: data.errors?.join("; ") ?? "Unknown error", variant: "destructive" });
      }
    },
    onError: (e: any) => { toast({ title: "Generation failed", description: e.message, variant: "destructive" }); },
  });

  function getDefaultWeekStart() {
    const now = new Date();
    const dow = now.getDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(now); mon.setDate(now.getDate() + diffToMon);
    return mon.toISOString().split("T")[0];
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      partial: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      failed:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      skipped: "bg-muted text-muted-foreground",
      pending: "bg-muted text-muted-foreground",
    };
    return (
      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${map[status] ?? map.pending}`}>
        {status}
      </span>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Report History
          </CardTitle>
          <CardDescription>Per-week generation and email delivery log. Trigger manual generation below.</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-generation-log">
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Manual trigger */}
        <div className="flex flex-wrap items-end gap-3 pb-2 border-b">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Generate for week starting</p>
            <Input type="date" value={weekStart || getDefaultWeekStart()} onChange={e => setWeekStart(e.target.value)} className="w-44" data-testid="input-gen-week-start" />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => generateMutation.mutate({ weekStart: weekStart || getDefaultWeekStart() })}
            disabled={generateMutation.isPending}
            data-testid="button-manual-generate"
          >
            {generateMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
              : <><Eye className="h-4 w-4 mr-1.5" />Generate &amp; Send</>}
          </Button>
        </div>

        {isLoading ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground text-sm">
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />Loading history…
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">No report history yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>PDF</TableHead>
                  <TableHead>Excel</TableHead>
                  <TableHead>Gen Status</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Triggered By</TableHead>
                  <TableHead>Generated At</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: any) => {
                  const emailStatusColors: Record<string, string> = {
                    success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                    failed:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                    skipped: "bg-muted text-muted-foreground",
                  };
                  const emailBadge = log.email_status ? (
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${emailStatusColors[log.email_status] ?? "bg-muted text-muted-foreground"}`}
                      title={log.email_error_message ?? undefined}
                    >
                      {log.email_status}
                    </span>
                  ) : <span className="text-xs text-muted-foreground">—</span>;

                  const notes = [log.error_message, log.email_error_message].filter(Boolean).join(" | ") || "—";

                  return (
                    <TableRow key={log.id} data-testid={`row-gen-log-${log.id}`}>
                      <TableCell className="text-sm font-medium whitespace-nowrap">{log.report_week ?? "—"}</TableCell>
                      <TableCell>
                        {log.pdf_generated
                          ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                          : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                      </TableCell>
                      <TableCell>
                        {log.excel_generated
                          ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                          : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                      </TableCell>
                      <TableCell>{statusBadge(log.status)}</TableCell>
                      <TableCell>{emailBadge}</TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">{log.triggered_by ?? "scheduler"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {log.created_at ? format(new Date(log.created_at), "MMM d, yyyy h:mm a") : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={notes}>{notes}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface AccountReportConfigTabProps {
  customerId: string;
}

export default function AccountReportConfigTab({ customerId }: AccountReportConfigTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [primaryRecipients, setPrimaryRecipients] = useState<string[]>([]);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [sendingManual, setSendingManual] = useState(false);
  const [sendResult, setSendResult] = useState<{
    status: "success" | "blocked" | "failed";
    message: string;
    blockedChecks?: string[];
  } | null>(null);

  // ── Config query ──────────────────────────────────────────────────────────
  const { data: config, isLoading: configLoading } = useQuery<any>({
    queryKey: ["/api/customers", customerId, "report-config"],
    queryFn: () => fetch(`/api/customers/${customerId}/report-config`).then(r => r.json()),
  });

  // ── MS Graph status ───────────────────────────────────────────────────────
  const { data: graphStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/reports/weekly/graph-status"],
  });
  const graphConfigured = graphStatus?.configured ?? false;

  // ── Form ──────────────────────────────────────────────────────────────────
  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      reportContactName:   "",
      sendWeeklyReport:    false,
      reportSendDay:       "monday",
      reportSendTime:      "06:00",
      includeSchedulePdf:  true,
      includeHoursExcel:   true,
      reportSenderProfile: "Reports",
    },
  });

  // Populate form when config loads
  useEffect(() => {
    if (!config) return;
    form.reset({
      reportContactName:   config.reportContactName ?? "",
      sendWeeklyReport:    config.sendWeeklyReport ?? false,
      reportSendDay:       config.reportSendDay ?? "monday",
      reportSendTime:      config.reportSendTime ?? "06:00",
      includeSchedulePdf:  config.includeSchedulePdf !== false,
      includeHoursExcel:   config.includeHoursExcel  !== false,
      reportSenderProfile: (SENDER_PROFILES as readonly string[]).includes(config.reportSenderProfile ?? "")
        ? config.reportSenderProfile
        : "Reports",
    });
    setPrimaryRecipients(Array.isArray(config.reportPrimaryEmails) ? config.reportPrimaryEmails : []);
    setCcEmails(Array.isArray(config.reportCcEmails) ? config.reportCcEmails : []);
  }, [config]);

  // ── Save mutation ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (data: ConfigFormValues) =>
      apiRequest("PATCH", `/api/customers/${customerId}/report-config`, {
        ...data,
        reportContactName:    data.reportContactName || null,
        reportPrimaryEmails:  primaryRecipients,
        reportCcEmails:       ccEmails,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "report-config"] });
      toast({ title: "Report settings saved", description: "Reporting configuration updated." });
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  function onSubmit(data: ConfigFormValues) {
    saveMutation.mutate(data);
  }

  // ── Manual send ───────────────────────────────────────────────────────────
  async function handleManualSend() {
    setSendingManual(true);
    setSendResult(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/report-delivery/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (data.success || data.status === "success") {
        setSendResult({ status: "success", message: `Report sent successfully to ${data.emailTo ?? "recipient"}.` });
        toast({ title: "Report sent", description: "Weekly report delivered successfully." });
      } else if (data.blocked) {
        const msg = data.error ?? data.message ?? "Report blocked. Selected sender mailbox is not operational.";
        setSendResult({ status: "blocked", message: msg, blockedChecks: data.blockedChecks ?? [] });
        toast({ title: "Send blocked", description: msg, variant: "destructive" });
      } else {
        const msg = data.error ?? data.message ?? "Send failed.";
        setSendResult({ status: "failed", message: msg });
        toast({ title: "Send failed", description: msg, variant: "destructive" });
      }
    } catch (e: any) {
      const msg = e.message ?? "An unexpected error occurred.";
      setSendResult({ status: "failed", message: msg });
      toast({ title: "Send failed", description: msg, variant: "destructive" });
    } finally {
      setSendingManual(false);
    }
  }

  // ── Known contacts from account for quick-pick ────────────────────────────
  const knownContacts: { name: string | null; email: string | null; label: string }[] = [];
  if (config?.primaryContactEmail) {
    knownContacts.push({ name: config.primaryContactName, email: config.primaryContactEmail, label: "Primary Contact" });
  }
  if (config?.billingContactEmail && config.billingContactEmail !== config.primaryContactEmail) {
    knownContacts.push({ name: config.billingContactName, email: config.billingContactEmail, label: "Billing Contact" });
  }

  // Effective recipient display
  const effectiveRecipients = primaryRecipients.length > 0
    ? primaryRecipients
    : config?.primaryContactEmail
    ? [config.primaryContactEmail]
    : [];

  if (configLoading) {
    return (
      <div className="py-20 flex items-center justify-center text-muted-foreground text-sm gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading report configuration…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl">

      {/* ── Section 4: Config Status (shown first for visibility) ───────────── */}
      <ConfigStatusPanel
        config={config}
        primaryRecipients={primaryRecipients}
        graphConfigured={graphConfigured}
        mailboxBlocked={
          sendResult?.status === "blocked"
            ? {
                profile: config?.reportSenderProfile ?? "Reports",
                checks:  sendResult.blockedChecks ?? [],
              }
            : null
        }
      />

      {/* ── Section 1: Report Settings ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            Report Settings
          </CardTitle>
          <CardDescription>
            Configure the weekly report schedule, content, and recipient list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              {/* Enable toggle */}
              <FormField
                control={form.control}
                name="sendWeeklyReport"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">Send Weekly Reports</FormLabel>
                      <FormDescription className="text-xs">
                        When enabled, reports are generated and emailed automatically on the configured day and time.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-send-weekly-report" />
                    </FormControl>
                  </FormItem>
                )}
              />

              <Separator />

              {/* Schedule: day + time */}
              <div>
                <p className="text-sm font-medium mb-3">Delivery Schedule</p>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="reportSendDay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Report Day</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-report-send-day">
                              <SelectValue placeholder="Select day" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {DAY_OPTIONS.map(d => (
                              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Day of the week the report is sent.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reportSendTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Report Time (CT)</FormLabel>
                        <FormControl>
                          <Input type="time" data-testid="input-report-send-time" {...field} />
                        </FormControl>
                        <FormDescription>Time in Central Time (24h).</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Sender Mailbox Profile */}
              <div>
                <p className="text-sm font-medium mb-3">Sender Mailbox</p>
                <FormField
                  control={form.control}
                  name="reportSenderProfile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Send Reports From</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-52" data-testid="select-report-sender-profile">
                            <SelectValue placeholder="Select mailbox" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SENDER_PROFILES.map(p => (
                            <SelectItem key={p} value={p} data-testid={`option-sender-profile-${p.toLowerCase()}`}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Reports for this account are sent from the selected @driverondemand.co mailbox.
                        The mailbox must have a passing Mail.Send test before reports will send.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* Attachments */}
              <div>
                <p className="text-sm font-medium mb-3">Included Attachments</p>
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="includeSchedulePdf"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm">Schedule PDF</FormLabel>
                          <FormDescription className="text-xs">Weekly shift schedule as a branded PDF.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-include-schedule-pdf" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="includeHoursExcel"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm">Hours Excel</FormLabel>
                          <FormDescription className="text-xs">Weekly hours workbook with OT flagging (Summary + Detail sheets).</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-include-hours-excel" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Recipients */}
              <div className="space-y-4">
                <p className="text-sm font-medium">Recipients</p>

                {/* Quick-select from account contacts */}
                {knownContacts.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground font-medium">Account Contacts</p>
                    <div className="flex flex-wrap gap-2">
                      {knownContacts.map(c => (
                        <ContactChip
                          key={c.email}
                          name={c.name}
                          email={c.email}
                          selected={primaryRecipients.includes(c.email!)}
                          onToggle={() => {
                            if (primaryRecipients.includes(c.email!)) {
                              setPrimaryRecipients(primaryRecipients.filter(e => e !== c.email));
                            } else {
                              setPrimaryRecipients([...primaryRecipients, c.email!]);
                            }
                          }}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Click a contact to add or remove them as a primary recipient.</p>
                  </div>
                )}

                {/* Primary recipients (To:) */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Primary Recipients (To:)</p>
                  <EmailTagInput
                    value={primaryRecipients}
                    onChange={setPrimaryRecipients}
                    placeholder="recipient@example.com"
                    testPrefix="primary-recipient"
                  />
                  <p className="text-xs text-muted-foreground">
                    Main recipients of the weekly report email.
                    {effectiveRecipients.length === 0 && config?.primaryContactEmail && (
                      <> Falls back to account primary contact: <span className="font-medium text-foreground">{config.primaryContactEmail}</span>.</>
                    )}
                  </p>
                </div>

                {/* CC emails */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">CC Recipients</p>
                  <EmailTagInput
                    value={ccEmails}
                    onChange={setCcEmails}
                    placeholder="cc@example.com"
                    testPrefix="cc-email"
                  />
                  <p className="text-xs text-muted-foreground">Additional email addresses copied on the report email.</p>
                </div>

                {/* Greeting name */}
                <FormField
                  control={form.control}
                  name="reportContactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        Greeting Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder={config?.primaryContactName ?? "e.g. Sarah Johnson"}
                          data-testid="input-report-contact-name"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Used in the email greeting "Hi {"{"}Name{"}"}". Leave blank to use the account's primary contact name.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* Save + send now */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-report-config">
                  {saveMutation.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save Settings"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleManualSend}
                  disabled={sendingManual || effectiveRecipients.length === 0}
                  data-testid="button-send-report-now"
                >
                  {sendingManual ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Sending…</> : <><Send className="h-4 w-4 mr-2" />Send Now</>}
                </Button>
                {effectiveRecipients.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Will send to <span className="font-medium text-foreground">{effectiveRecipients.join(", ")}</span>
                    {ccEmails.length > 0 && ` + ${ccEmails.length} CC`}
                  </p>
                )}
              </div>

              {/* ── Inline send result ── */}
              {sendResult && (
                <div
                  className={`flex items-start gap-2 rounded-md px-4 py-3 text-sm ${
                    sendResult.status === "success"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                  }`}
                  data-testid="result-manual-send"
                >
                  {sendResult.status === "success"
                    ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  }
                  <div className="space-y-1 min-w-0">
                    <p>{sendResult.message}</p>
                    {sendResult.blockedChecks && sendResult.blockedChecks.length > 0 && (
                      <ul className="space-y-0.5">
                        {sendResult.blockedChecks.map((c, i) => (
                          <li key={i} className="text-xs opacity-80">• {c}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* ── Section 2: Report Preview & Downloads ───────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Report Preview
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <SchedulePdfPanel customerId={customerId} />
          <HoursReportPanel customerId={customerId} />
          <WeeklyShiftReportPanel customerId={customerId} />
        </div>
      </div>

      {/* ── Section 3: Report History ────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Report History
        </h3>
        <GenerationLogPanel customerId={customerId} />
      </div>

    </div>
  );
}
