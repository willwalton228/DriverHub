import AccountProductsTab from "@/pages/corporate/AccountProductsTab";
import { GroupRosterTab } from "@/pages/corporate/GroupRosterTab";
import AccountAnalyticsTab from "@/pages/corporate/AccountAnalyticsTab";
import AccountWeeklyReportTab from "@/pages/corporate/AccountWeeklyReportTab";
import { DocPreviewLink } from "@/components/DocPreviewLink";
import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { DeleteAttachmentDialog } from "@/components/DeleteAttachmentDialog";
import { useParams, useLocation, useSearch, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Building2, Save, FileText, TrendingUp, FileUp, Trash2, Download, Send, Upload, FolderOpen, Clock, User as UserIcon, Phone, Mail, Users, Heart, TrendingDown, Minus, AlertCircle, DollarSign, Activity, CalendarDays, RefreshCw, Settings, ExternalLink, Building, GitBranch, ShieldAlert, BarChart3, MapPin, Rocket, Target, CheckCircle, CheckCircle2, Plus, Lightbulb, ChevronDown, ChevronUp, ChevronRight, Info, Lock, Unlock, Gavel, MessageSquarePlus, Star, AlertTriangle, Eye, Bell, Flag, BookOpen, Edit, X, History, Car, Loader2, GitMerge, Shield, Library, Filter, CalendarRange, Timer, UserCheck, WifiOff, Truck, Percent, CalendarCheck, CalendarX2, Zap, Package, Copy, Check, Smartphone, BookUser, Briefcase, Video, Megaphone, Inbox } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDate, parseFormDate, parseDateSafe } from "@/lib/dateFormat";
import { cleanPhone, formatPhone } from "@/lib/phone";
import { PhoneInput } from "@/components/PhoneInput";
import type { Customer, InsertCustomer, User, AccountKnowledge, AccountKnowledgeHistory, AccountReadiness, AccountDealershipProfile, Trip } from "@shared/schema";
import { READINESS_ITEMS, ACCOUNT_NOTE_TYPES, DRIVER_MODEL_OPTIONS, PROGRAM_OPTIONS, REGION_OPTIONS, CUSTOMER_STATUS_VALUES, NETWORK_VALUES, type AccountNote } from "@shared/schema";
import { ExcelDownloadButton } from "@/components/ExcelDownloadButton";
import type { ExcelColumn } from "@/lib/excelExport";
import { insertCustomerSchema, updateCustomerSchema, createAccountSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { format } from "date-fns";
import { CustomerStatements } from "@/components/corporate/CustomerStatements";
import { z } from "zod";
import AccountPerformance from "./AccountPerformance";
import { CustomerPaymentMetrics } from "@/components/invoicing/CustomerPaymentMetrics";
import { MergeRecordsDialog } from "@/components/MergeRecordsDialog";
import { RecordWorkspaceTabs } from "@/components/RecordWorkspaceTabs";
import { UpsellEnginePanel } from "@/components/accounts/UpsellEnginePanel";
import { AccountContactsTab } from "@/components/accounts/AccountContactsTab";
import AccountServicesTab from "@/components/accounts/AccountServicesTab";
import AccountDepartmentsTab from "@/components/accounts/AccountDepartmentsTab";
import { AccountHolidayHistory } from "@/components/accounts/AccountHolidayHistory";
import { WiwLocationMappingSection } from "@/components/scheduling/WiwLocationMappingSection";
import { rechartsTooltipStyle } from "@/lib/chartUtils";

// ─── Touch Type helpers ────────────────────────────────────────────────────
const TOUCH_TYPE_LABELS: Record<string, string> = {
  call:               "Call",
  email:              "Email",
  meeting:            "Virtual Meeting",   // legacy DB value
  virtual_meeting:    "Virtual Meeting",
  text:               "Text",
  marketing_campaign: "Marketing Campaign",
  bulk_email:         "Bulk Email",
  in_person:          "In-Person",
  trade_event:        "Trade Event",
};

/** Maps raw stored activityType values in a summary string to human labels.
 *  e.g. "Touch logged: meeting" → "Touch logged: Virtual Meeting" */
function formatTouchSummary(summary: string): string {
  return summary.replace(/^(Touch logged:\s*)(.+)$/i, (_match, prefix, rawType) => {
    const key = rawType.trim().toLowerCase().replace(/\s+/g, "_");
    return prefix + (TOUCH_TYPE_LABELS[key] ?? rawType);
  });
}

// Activity type for account activities
interface AccountActivityItem {
  id: string;
  customerId: string;
  activityType: string;
  notes: string | null;
  previousValue: string | null;
  newValue: string | null;
  performedByUserId: string | null;
  performedByName?: string;
  activityDate: string;
  createdAt: string;
}

interface ActivityEvent {
  id: string;
  accountId: string;
  eventTs: string;
  category: string;
  eventType: string;
  summary: string;
  createdByUserId: string | null;
  createdByName?: string;
  metadata: string | null;
}

// ── Move Intelligence Tab ─────────────────────────────────────────────────────
interface AccountMoveStats {
  hasData: boolean;
  windowDays: number;
  volWindow: number;
  volPrev: number;
  pctChange: number;
  completionRate: number | null;
  exceptionRate: number | null;
  movesThisWeek: number;
  movesThisMonth: number;
  lastMoveDate: string | null;
  daysSinceLastMove: number | null;
  uniqueDrivers: number;
  totalDriversEver: number;
  driverUtilization: number | null;
  avgMovesPerDriver: number | null;
  allTimeTotal: number;
  atRisk: boolean;
  atRiskFlags: { decline: boolean; inactive: boolean; highExceptions: boolean };
  trend: Array<{ week_start: string; total: number; completed: number; exceptions: number }>;
}

function AccountMoveIntelligenceTab({ accountId }: { accountId: string }) {
  const [winSize, setWinSize] = useState<"30" | "60" | "90">("30");

  const { data: stats, isLoading } = useQuery<AccountMoveStats>({
    queryKey: ["/api/draiver-import/account-stats", accountId, winSize],
    queryFn: () =>
      fetch(`/api/draiver-import/account-stats?accountId=${accountId}&window=${winSize}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!accountId,
  });

  const windowLabel = winSize === "30" ? "Last 30 Days" : winSize === "60" ? "Last 60 Days" : "Last 90 Days";

  // Format week label for chart X axis
  const fmtWeek = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // KPI card helper
  const MICard = ({
    label, value, sub, icon, highlight, testId,
  }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ReactNode; highlight?: "green" | "yellow" | "red"; testId?: string }) => (
    <Card data-testid={testId}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1.5 gap-1">
          <p className="text-xs text-muted-foreground leading-tight truncate">{label}</p>
          <span className="shrink-0 text-muted-foreground">{icon}</span>
        </div>
        {isLoading ? (
          <Skeleton className="h-6 w-16" />
        ) : (
          <p className={`text-xl font-bold leading-tight ${
            highlight === "green" ? "text-green-600 dark:text-green-400" :
            highlight === "red"   ? "text-red-600 dark:text-red-400" :
            highlight === "yellow" ? "text-yellow-600 dark:text-yellow-400" : ""
          }`}>{value}</p>
        )}
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );

  if (!isLoading && stats && !stats.hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3" data-testid="move-intel-no-data">
        <Truck className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-base font-medium text-muted-foreground">No Draiver move data linked to this account</p>
        <p className="text-sm text-muted-foreground/70 max-w-md">
          Move intelligence populates automatically once Draiver import files are processed and matched to this account.
        </p>
      </div>
    );
  }

  const pctChange   = stats?.pctChange ?? 0;
  const pctColor    = pctChange > 0 ? "green" : pctChange < -10 ? "red" : "yellow";
  const compRate    = stats?.completionRate ?? null;
  const compColor   = compRate === null ? undefined : compRate >= 90 ? "green" : compRate >= 70 ? "yellow" : "red";
  const excRate     = stats?.exceptionRate ?? null;
  const excColor    = excRate === null ? undefined : excRate < 10 ? "green" : excRate < 25 ? "yellow" : "red";
  const lastMoveFmt = stats?.lastMoveDate
    ? new Date(stats.lastMoveDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  return (
    <div className="space-y-5 pt-1" data-testid="move-intelligence-tab">

      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Truck className="h-4 w-4 text-orange-500" />
            Move Intelligence
            <span className="text-xs font-normal text-muted-foreground">— Draiver import data</span>
          </h3>
        </div>
        <div className="flex items-center gap-1" data-testid="move-window-toggle">
          {(["30", "60", "90"] as const).map(w => (
            <Button
              key={w}
              variant={winSize === w ? "default" : "ghost"}
              size="sm"
              onClick={() => setWinSize(w)}
              data-testid={`btn-window-${w}`}
            >
              {w}d
            </Button>
          ))}
        </div>
      </div>

      {/* ── At-risk banner ──────────────────────────────────────────────── */}
      {stats?.atRisk && (
        <div className="flex items-start gap-3 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3" data-testid="at-risk-banner">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700 dark:text-red-400 space-y-0.5">
            <p className="font-semibold">Account flagged as at-risk</p>
            <ul className="text-xs space-y-0.5 text-red-600 dark:text-red-500 list-none">
              {stats.atRiskFlags.decline     && <li>Volume declined {Math.abs(pctChange)}% vs prior period</li>}
              {stats.atRiskFlags.inactive    && <li>No completed moves in {stats.daysSinceLastMove} days</li>}
              {stats.atRiskFlags.highExceptions && <li>Exception rate is {excRate}% — above 30% threshold</li>}
            </ul>
          </div>
        </div>
      )}

      {/* ── Row 1 KPIs ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MICard
          label="Moves This Week"
          value={isLoading ? "—" : stats?.movesThisWeek ?? 0}
          sub="completed"
          icon={<CalendarCheck className="w-4 h-4" />}
          testId="mi-moves-this-week"
        />
        <MICard
          label="Moves This Month"
          value={isLoading ? "—" : stats?.movesThisMonth ?? 0}
          sub="completed"
          icon={<CalendarDays className="w-4 h-4" />}
          testId="mi-moves-this-month"
        />
        <MICard
          label={`Volume (${windowLabel})`}
          value={isLoading ? "—" : stats?.volWindow ?? 0}
          sub={
            stats && !isLoading ? (
              <span className={pctChange > 0 ? "text-green-600 dark:text-green-400" : pctChange < 0 ? "text-red-500" : "text-muted-foreground"}>
                {pctChange > 0 ? "+" : ""}{pctChange}% vs prior period
              </span>
            ) : undefined
          }
          icon={pctChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          highlight={pctColor as any}
          testId="mi-vol-window"
        />
        <MICard
          label="Last Move Date"
          value={isLoading ? "—" : lastMoveFmt}
          sub={stats?.daysSinceLastMove !== null && stats?.daysSinceLastMove !== undefined
            ? `${stats.daysSinceLastMove}d ago`
            : undefined}
          icon={<CalendarX2 className="w-4 h-4" />}
          highlight={stats?.daysSinceLastMove !== null && stats?.daysSinceLastMove !== undefined
            ? stats.daysSinceLastMove >= 14 ? "red" : stats.daysSinceLastMove >= 7 ? "yellow" : "green"
            : undefined}
          testId="mi-last-move-date"
        />
      </div>

      {/* ── Row 2 KPIs ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MICard
          label="Completion Rate"
          value={compRate !== null ? `${compRate}%` : "—"}
          sub={`${windowLabel}`}
          icon={<CheckCircle className="w-4 h-4" />}
          highlight={compColor}
          testId="mi-completion-rate"
        />
        <MICard
          label="Exception Rate"
          value={excRate !== null ? `${excRate}%` : "—"}
          sub={`${windowLabel}`}
          icon={<AlertCircle className="w-4 h-4" />}
          highlight={excColor}
          testId="mi-exception-rate"
        />
        <MICard
          label="Driver Utilization"
          value={isLoading ? "—" : stats?.driverUtilization !== null && stats?.driverUtilization !== undefined ? `${stats.driverUtilization}%` : "—"}
          sub={isLoading || !stats ? undefined : stats.totalDriversEver > 0 ? `${stats.uniqueDrivers} of ${stats.totalDriversEver} drivers` : `${stats.uniqueDrivers} drivers active`}
          icon={<Users className="w-4 h-4" />}
          highlight={stats?.driverUtilization !== null && stats?.driverUtilization !== undefined ? stats.driverUtilization >= 70 ? "green" : stats.driverUtilization >= 40 ? "yellow" : "red" : undefined}
          testId="mi-driver-utilization"
        />
        <MICard
          label="Avg Moves / Driver"
          value={isLoading ? "—" : stats?.avgMovesPerDriver !== null && stats?.avgMovesPerDriver !== undefined ? stats.avgMovesPerDriver : "—"}
          sub={`${windowLabel}`}
          icon={<Zap className="w-4 h-4" />}
          testId="mi-avg-moves-driver"
        />
      </div>

      {/* ── Move Volume Trend chart ──────────────────────────────────────── */}
      <Card data-testid="move-volume-trend-chart">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 flex-wrap">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-orange-500" />
              Move Volume Trend
            </CardTitle>
            <CardDescription className="text-xs">Weekly totals — {windowLabel}</CardDescription>
          </div>
          {stats && !isLoading && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-400" />
                Total Moves
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
                Completed
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !stats?.trend?.length ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No trend data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.trend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f97316" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="week_start"
                  tickFormatter={fmtWeek}
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
                />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <RechartsTooltip
                  {...rechartsTooltipStyle}
                  formatter={(value: number, name: string) => [
                    value,
                    name === "total" ? "Total Moves" : name === "completed" ? "Completed" : "Exceptions",
                  ]}
                  labelFormatter={(label: string) => `Week of ${label}`}
                />
                <Area type="monotone" dataKey="total"     stroke="#f97316" strokeWidth={2} fill="url(#gradTotal)"     dot={false} name="total" />
                <Area type="monotone" dataKey="completed" stroke="#22c55e" strokeWidth={2} fill="url(#gradCompleted)" dot={false} name="completed" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

function AccountDriversTab({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [textComposeOpen, setTextComposeOpen] = useState(false);
  const [textMessage, setTextMessage] = useState("");
  const [textSendResult, setTextSendResult] = useState<any>(null);
  const [groupSignature, setGroupSignature] = useState<string>("");

  // Driver status filter — DH-002161
  // Persisted in sessionStorage so back-navigation from Driver Detail restores the selected view.
  // A fresh visit always defaults to "active".
  const sessionKey = `account-drivers-filter-${customerId}`;
  const [driverStatusFilter, setDriverStatusFilterRaw] = useState<"active" | "terminated" | "both">(() => {
    try {
      const v = sessionStorage.getItem(sessionKey);
      if (v === "terminated" || v === "both") return v;
    } catch {}
    return "active";
  });
  const setDriverStatusFilter = (v: "active" | "terminated" | "both") => {
    try { sessionStorage.setItem(sessionKey, v); } catch {}
    setDriverStatusFilterRaw(v);
  };

  // SMS readiness: check if Heymarket is configured and flag is enabled
  const { data: smsStatus } = useQuery<{ enabled: boolean; provider: string; configured: boolean }>({
    queryKey: ["/api/platform/texting-config"],
    queryFn: () => fetch("/api/platform/texting-config", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });
  const smsEnabled    = smsStatus?.enabled === true;
  const smsConfigured = smsStatus?.configured === true;
  const smsReady      = smsEnabled && smsConfigured;

  const sendTextMutation = useMutation({
    mutationFn: (vars: { driverIds: string[]; message: string; groupSignature: string }) =>
      apiRequest("POST", `/api/corporate/customers/${customerId}/drivers/text-selected`, {
        driverIds:       vars.driverIds,
        message:         vars.message,
        groupSignature:  vars.groupSignature || null,
        contextModule:   "accounts",
        contextEntityId: customerId,
      }).then(r => r.json()),
    onSuccess: (data: any) => {
      setTextSendResult(data);
      const sent   = data.sent   ?? 0;
      const failed = data.failed ?? 0;
      if (sent > 0) {
        toast({ title: "Messages sent", description: data.summary ?? `${sent} message(s) delivered.` });
      } else if (failed > 0) {
        const providerErr = data.recipientResults?.[0]?.error;
        toast({
          title: "Send failed",
          description: providerErr
            ? `Provider error: ${providerErr}`
            : (data.summary ?? `${failed} recipient(s) failed to receive the message.`),
          variant: "destructive",
        });
      } else {
        toast({ title: "Intent logged", description: data.summary ?? `${data.included ?? 0} recipient(s) queued.` });
      }
    },
    onError: () => toast({ title: "Send failed", description: "Could not process SMS request.", variant: "destructive" }),
  });

  const { data: assignedDrivers = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/corporate/customers", customerId, "drivers", driverStatusFilter],
    queryFn: () => fetch(`/api/corporate/customers/${customerId}/drivers?filter=${driverStatusFilter}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: allDriversRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/drivers"],
  });

  const allDriverOptions = Array.isArray(allDriversRaw)
    ? allDriversRaw
    : (allDriversRaw as any)?.rows ?? [];

  const assignMutation = useMutation({
    mutationFn: (driverId: string) =>
      apiRequest("POST", `/api/corporate/customers/${customerId}/drivers`, { driverId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", customerId, "drivers"] });
      setSearchOpen(false);
      setSearchQuery("");
      toast({ title: "Driver assigned" });
    },
    onError: () => toast({ title: "Failed to assign driver", variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (driverId: string) =>
      apiRequest("DELETE", `/api/corporate/customers/${customerId}/drivers/${driverId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", customerId, "drivers"] });
      toast({ title: "Driver removed" });
    },
    onError: () => toast({ title: "Failed to remove driver", variant: "destructive" }),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (driverId: string) =>
      apiRequest("PATCH", `/api/corporate/customers/${customerId}/drivers/${driverId}/set-primary`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", customerId, "drivers"] });
      toast({ title: "Primary driver updated" });
    },
    onError: () => toast({ title: "Failed to set primary", variant: "destructive" }),
  });

  const assignedDriverIds = new Set(assignedDrivers.map((d: any) => d.driverId));

  const availableDrivers = allDriverOptions.filter((d: any) => {
    if (assignedDriverIds.has(d.id)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = `${d.user?.firstName || ""} ${d.user?.lastName || ""}`.toLowerCase();
    const email = (d.user?.email || "").toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  const showPrimaryControls = assignedDrivers.length >= 2;

  // Clear selection when the filter changes (DH-002161)
  useEffect(() => {
    setSelectedDriverIds(new Set());
  }, [driverStatusFilter]);

  // ── Multi-select helpers ───────────────────────────────────────────────────
  const allIds = assignedDrivers.map((d: any) => d.driverId as string);
  const allSelected = allIds.length > 0 && allIds.every(id => selectedDriverIds.has(id));
  const someSelected = !allSelected && allIds.some(id => selectedDriverIds.has(id));

  const toggleDriver = (driverId: string) => {
    setSelectedDriverIds(prev => {
      const next = new Set(prev);
      next.has(driverId) ? next.delete(driverId) : next.add(driverId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedDriverIds(allSelected ? new Set() : new Set(allIds));
  };

  const selectedCount = selectedDriverIds.size;

  // Drivers selected who have email vs. those who don't
  const selectedDriverData = assignedDrivers.filter((d: any) => selectedDriverIds.has(d.driverId));
  const selectedWithEmail  = selectedDriverData.filter((d: any) => !!d.email);
  const selectedNoEmail    = selectedDriverData.filter((d: any) => !d.email);
  // Drivers selected who have a mobile number vs. those who don't
  const selectedWithPhone  = selectedDriverData.filter((d: any) => !!d.phoneNumber);
  const selectedNoPhone    = selectedDriverData.filter((d: any) => !d.phoneNumber);

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/corporate/customers/${customerId}/drivers/email-selected`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverIds: Array.from(selectedDriverIds),
          subject: emailSubject.trim(),
          body: emailBody.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail ? ` — ${data.detail}` : "";
        toast({ title: data.message || "Email failed", description: detail || undefined, variant: "destructive" });
      } else {
        toast({
          title: `Email sent to ${data.sent} driver${data.sent !== 1 ? "s" : ""}`,
          description: data.excluded > 0 ? `${data.excluded} driver(s) without email were excluded.` : undefined,
        });
        setComposeOpen(false);
        setEmailSubject("");
        setEmailBody("");
        setSelectedDriverIds(new Set());
      }
    } catch {
      toast({ title: "Failed to send email", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <>
    {/* ── Compose Email Dialog ────────────────────────────────────────────── */}
    <Dialog open={composeOpen} onOpenChange={open => { setComposeOpen(open); if (!open) { setEmailSubject(""); setEmailBody(""); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email Selected Drivers</DialogTitle>
          <DialogDescription>
            Sending from <span className="font-medium">dispatch@driverondemand.co</span> via Microsoft 365.
          </DialogDescription>
        </DialogHeader>

        {selectedNoEmail.length > 0 && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              {selectedNoEmail.length} driver{selectedNoEmail.length !== 1 ? "s" : ""} without an email address will be excluded from this send.
            </span>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground min-h-[36px]">
              {selectedWithEmail.length === 0
                ? <span className="italic">No drivers with email selected</span>
                : selectedWithEmail.map((d: any) => d.email).join(", ")}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="compose-subject">Subject</label>
            <Input
              id="compose-subject"
              placeholder="Enter subject…"
              value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
              data-testid="input-email-subject"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="compose-body">Message</label>
            <Textarea
              id="compose-body"
              placeholder="Enter your message…"
              rows={6}
              value={emailBody}
              onChange={e => setEmailBody(e.target.value)}
              data-testid="input-email-body"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setComposeOpen(false)} data-testid="button-compose-cancel">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSendEmail}
            disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim() || selectedWithEmail.length === 0}
            data-testid="button-compose-send"
          >
            {sendingEmail
              ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Sending…</>
              : <><Send className="h-3 w-3 mr-1.5" /> Send</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── Text Compose Dialog ─────────────────────────────────────────────── */}
    <Dialog open={textComposeOpen} onOpenChange={open => {
      setTextComposeOpen(open);
      if (!open) { setTextMessage(""); setTextSendResult(null); setGroupSignature(""); }
    }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Text Selected Drivers</DialogTitle>
          <DialogDescription>
            {smsReady
              ? "Send SMS via Heymarket to the selected drivers."
              : !smsEnabled
              ? "SMS feature is disabled. Messages will be logged as a pending intent, not delivered."
              : "Heymarket is not yet configured. Messages will be logged as a pending intent, not delivered."}
          </DialogDescription>
        </DialogHeader>

        {/* State banner — only when integration not ready */}
        {!smsReady && (
          <div className="flex items-start gap-2.5 rounded-md border bg-muted/40 px-3 py-2.5">
            <Smartphone className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="space-y-0.5">
              {!smsEnabled ? (
                <>
                  <p className="font-medium text-sm">SMS feature disabled</p>
                  <p className="text-xs text-muted-foreground">
                    The SMS feature flag is off. Enable it in Platform Admin → Communications to activate delivery. Messages logged now will be marked as pending intent.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-sm">Heymarket not configured</p>
                  <p className="text-xs text-muted-foreground">
                    Set up your Heymarket API token and inbox ID in Platform Admin → Communications. Messages logged now will be marked as pending intent.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Recipient summary */}
        {!textSendResult && (
          <div className="space-y-1">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <label className="text-xs font-medium text-muted-foreground">Recipients</label>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{selectedCount} selected</span>
                <span className="font-medium text-foreground">{selectedWithPhone.length} eligible</span>
                {selectedNoPhone.length > 0 && (
                  <span className="text-amber-600 dark:text-amber-500">{selectedNoPhone.length} excluded (no phone)</span>
                )}
              </div>
            </div>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground min-h-[36px] max-h-[72px] overflow-y-auto">
              {selectedWithPhone.length === 0
                ? <span className="italic">No drivers with a phone number selected.</span>
                : selectedWithPhone.map((d: any) => `${d.firstName} ${d.lastName} (${d.phoneNumber})`).join(", ")
              }
            </div>
          </div>
        )}

        {/* Result summary — driven entirely by real backend response */}
        {textSendResult && (() => {
          const resSent   = textSendResult.sent   ?? 0;
          const resFailed = textSendResult.failed ?? 0;
          const isFailure = resFailed > 0 && resSent === 0;
          const isPartial = resFailed > 0 && resSent > 0;
          const providerErr = textSendResult.recipientResults?.[0]?.error;
          return (
            <div className={`rounded-md border px-3 py-3 text-sm space-y-2 ${isFailure ? "bg-destructive/10 border-destructive/30" : "bg-muted/40"}`}>
              <p className="font-medium text-sm">
                {resSent > 0 && !isPartial
                  ? "Messages sent"
                  : isPartial
                  ? "Partial delivery"
                  : isFailure
                  ? "Send failed"
                  : "Intent logged"}
              </p>
              <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                <div>
                  <span className="block font-medium text-foreground">{textSendResult.included ?? 0}</span>
                  Included
                </div>
                <div>
                  <span className="block font-medium text-foreground">{resSent}</span>
                  Sent
                </div>
                <div>
                  <span className="block font-medium text-foreground">{resFailed}</span>
                  Failed
                </div>
                <div>
                  <span className="block font-medium text-foreground">{textSendResult.excluded ?? 0}</span>
                  Excluded
                </div>
              </div>
              {textSendResult.summary && (
                <p className="text-xs text-muted-foreground">{textSendResult.summary}</p>
              )}
              {isFailure && providerErr && (
                <p className="text-xs text-destructive font-medium">Provider error: {providerErr}</p>
              )}
            </div>
          );
        })()}

        {/* Compose area */}
        {!textSendResult && (
          <div className="space-y-3">
            {/* Group Signature — required for bulk sends only */}
            {selectedCount > 1 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="group-signature">
                  Group Signature <span className="text-destructive">*</span>
                </label>
                <Select value={groupSignature} onValueChange={setGroupSignature}>
                  <SelectTrigger id="group-signature" data-testid="select-group-signature">
                    <SelectValue placeholder="Choose a group signature…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recruiting">Recruiting - Driver on Demand</SelectItem>
                    <SelectItem value="dispatch">Dispatch - Driver on Demand</SelectItem>
                    <SelectItem value="support">Support - Driver on Demand</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This group signature appears as the sender identity for this message in Heymarket.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="text-body">Message</label>
              <Textarea
                id="text-body"
                placeholder="Enter your message…"
                rows={4}
                value={textMessage}
                onChange={e => setTextMessage(e.target.value)}
                data-testid="input-text-body"
              />
              <p className="text-xs text-muted-foreground text-right">{textMessage.length} chars</p>
            </div>

            {/* Network / API error — message draft preserved for retry */}
            {sendTextMutation.isError && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Request failed — {(sendTextMutation.error as any)?.message || "network error"}. Your message is preserved above.
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTextComposeOpen(false)}
            data-testid="button-text-compose-cancel"
          >
            {textSendResult ? "Close" : "Cancel"}
          </Button>
          {!textSendResult && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button
                    size="sm"
                    disabled={
                      sendTextMutation.isPending ||
                      selectedWithPhone.length === 0 ||
                      !textMessage.trim() ||
                      (selectedCount > 1 && !groupSignature)
                    }
                    onClick={() => sendTextMutation.mutate({
                      driverIds:      Array.from(selectedDriverIds),
                      message:        textMessage,
                      groupSignature: groupSignature,
                    })}
                    data-testid="button-text-compose-send"
                  >
                    <Smartphone className="h-3 w-3 mr-1.5" />
                    {sendTextMutation.isPending
                      ? (smsReady ? "Sending…" : "Logging…")
                      : smsReady
                      ? `Send to ${selectedWithPhone.length}`
                      : `Log Intent (${selectedWithPhone.length})`}
                  </Button>
                </span>
              </TooltipTrigger>
              {!smsReady && (
                <TooltipContent className="max-w-[240px] text-xs">
                  {!smsEnabled
                    ? "SMS feature is disabled — your message will be logged as a pending intent, not delivered."
                    : "Heymarket is not configured — your message will be logged as a pending intent, not delivered."}
                </TooltipContent>
              )}
            </Tooltip>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle>Assigned Drivers</CardTitle>
          <CardDescription>
            {assignedDrivers.length > 0
              ? `${assignedDrivers.length} driver${assignedDrivers.length !== 1 ? "s" : ""} — ${
                  driverStatusFilter === "active" ? "Current · Primary"
                  : driverStatusFilter === "terminated" ? "Past assignments"
                  : "Current + Past"
                }`
              : driverStatusFilter === "active"
                ? "No current primary drivers at this account"
                : driverStatusFilter === "terminated"
                  ? "No past driver assignments found for this account"
                  : "No drivers found for this account"}
          </CardDescription>
        </div>
        {/* DH-002161 Status filter — compact segmented control */}
        <div className="flex items-center rounded-md border divide-x text-xs overflow-hidden shrink-0 self-start mt-0.5">
          {(["active", "terminated", "both"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setDriverStatusFilter(v)}
              className={`px-3 py-1.5 capitalize leading-none transition-colors ${
                driverStatusFilter === v
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-card hover:bg-muted/60 text-muted-foreground"
              }`}
              data-testid={`filter-drivers-${v}`}
            >
              {v === "active" ? "Current" : v === "terminated" ? "Past" : "All"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {selectedCount > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-bulk-actions">
                  Actions ({selectedCount})
                  <ChevronDown className="h-3 w-3 ml-1.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={() => setComposeOpen(true)}
                  data-testid="button-email-selected"
                >
                  <Mail className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  Email Selected
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setTextComposeOpen(true)}
                  data-testid="button-text-selected"
                >
                  <Smartphone className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  Text Selected
                  {smsStatus !== undefined && !smsReady && (
                    <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-500">Not active</span>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" data-testid="button-add-driver">
              <Plus className="h-3 w-3 mr-1" /> Assign Driver
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="end">
            <Command>
              <CommandInput
                placeholder="Search by name or email..."
                value={searchQuery}
                onValueChange={setSearchQuery}
                data-testid="input-search-driver"
              />
              <CommandList>
                <CommandEmpty>No drivers found.</CommandEmpty>
                <CommandGroup>
                  {availableDrivers.slice(0, 60).map((d: any) => (
                    <CommandItem
                      key={d.id}
                      value={`${d.user?.firstName || ""} ${d.user?.lastName || ""}`}
                      onSelect={() => assignMutation.mutate(d.id)}
                      disabled={assignMutation.isPending}
                      data-testid={`option-driver-${d.id}`}
                    >
                      <Users className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{d.user?.firstName || ""} {d.user?.lastName || ""}</span>
                        {d.user?.email && <span className="text-xs text-muted-foreground truncate">{d.user.email}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : assignedDrivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <Users className="h-9 w-9 opacity-30" />
            <p className="text-sm">No drivers assigned to this account.</p>
            <Button size="sm" variant="outline" onClick={() => setSearchOpen(true)} data-testid="button-assign-driver-empty">
              <Plus className="h-3 w-3 mr-1" /> Assign Driver
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={allSelected}
                      data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
                      onCheckedChange={toggleAll}
                      aria-label="Select all drivers"
                      data-testid="checkbox-select-all-drivers"
                    />
                  </TableHead>
                  <TableHead className="text-xs pl-2">Driver</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Classification</TableHead>
                  <TableHead className="text-xs">Assignment</TableHead>
                  <TableHead className="text-xs">Email Address</TableHead>
                  <TableHead className="text-xs">Mobile</TableHead>
                  <TableHead className="text-xs">Last Trip</TableHead>
                  {(driverStatusFilter === "terminated" || driverStatusFilter === "both") && (
                    <TableHead className="text-xs">Termination Date</TableHead>
                  )}
                  <TableHead className="text-xs w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignedDrivers.map((d: any) => (
                  <TableRow
                    key={d.driverAccountId}
                    className={`text-sm ${selectedDriverIds.has(d.driverId) ? "bg-muted/40" : ""}`}
                    data-testid={`row-assigned-driver-${d.driverId}`}
                  >
                    <TableCell className="py-2 pl-4 w-10">
                      <Checkbox
                        checked={selectedDriverIds.has(d.driverId)}
                        onCheckedChange={() => toggleDriver(d.driverId)}
                        aria-label={`Select ${d.firstName} ${d.lastName}`}
                        data-testid={`checkbox-driver-${d.driverId}`}
                      />
                    </TableCell>
                    <TableCell className="py-2 pl-2">
                      <Link
                        href={`/drivers/${d.driverId}`}
                        className="font-medium hover:underline underline-offset-4 focus-visible:underline focus-visible:outline-none whitespace-nowrap"
                        data-testid={`link-driver-${d.driverId}`}
                      >
                        {d.firstName || ""} {d.lastName || ""}
                      </Link>
                    </TableCell>
                    <TableCell className="py-2">
                      <StatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {d.driverClassification || "—"}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="space-y-0.5 whitespace-nowrap">
                        {d.isPrimary ? (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                            Primary
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Secondary</span>
                        )}
                        {(d.assignmentStartedAt || d.assignmentEndedAt) && (
                          <p className="text-[11px] text-muted-foreground">
                            {d.assignmentStartedAt
                              ? `Started ${new Date(d.assignmentStartedAt).toLocaleDateString()}`
                              : "Start unavailable"}
                            {d.assignmentEndedAt && ` · Ended ${new Date(d.assignmentEndedAt).toLocaleDateString()}`}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground max-w-[200px] group">
                      {d.email ? (
                        <div className="flex items-center gap-1 min-w-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate cursor-default" data-testid={`text-driver-email-${d.driverId}`}>
                                {d.email}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">{d.email}</TooltipContent>
                          </Tooltip>
                          <CopyButton value={d.email} testId={`button-copy-email-${d.driverId}`} />
                        </div>
                      ) : (
                        <span>—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap group">
                      <div className="flex items-center gap-1">
                        <span data-testid={`text-driver-phone-${d.driverId}`}>{formatPhone(d.phoneNumber)}</span>
                        {d.phoneNumber && (
                          <CopyButton value={d.phoneNumber} testId={`button-copy-phone-${d.driverId}`} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {d.lastTripDate ? new Date(d.lastTripDate).toLocaleDateString() : "—"}
                    </TableCell>
                    {(driverStatusFilter === "terminated" || driverStatusFilter === "both") && (
                      <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {d.terminationDate
                          ? new Date(d.terminationDate).toLocaleDateString()
                          : d.status !== "active" && d.statusChangedAt
                            ? new Date(d.statusChangedAt).toLocaleDateString()
                            : "—"}
                      </TableCell>
                    )}
                    <TableCell className="py-2">
                      <div className="flex items-center gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link href={`/drivers/${d.driverId}`}>
                              <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-open-driver-${d.driverId}`}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent>Open driver record</TooltipContent>
                        </Tooltip>
                        {showPrimaryControls && !d.isPrimary && d.status === "active" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setPrimaryMutation.mutate(d.driverId)}
                                disabled={setPrimaryMutation.isPending}
                                data-testid={`button-set-primary-${d.driverId}`}
                              >
                                <Star className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Set as primary</TooltipContent>
                          </Tooltip>
                        )}
                        {!d.assignmentEndedAt && d.status === "active" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => removeMutation.mutate(d.driverId)}
                                disabled={removeMutation.isPending}
                                data-testid={`button-remove-driver-${d.driverId}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove assignment</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}

function DealershipTab({ customerId }: { customerId: string }) {
  const { toast } = useToast();

  const { data: profile, isLoading } = useQuery<AccountDealershipProfile | null>({
    queryKey: [`/api/corporate/accounts/${customerId}/dealership-profile`],
  });

  const [franchiseBrand, setFranchiseBrand] = useState("");
  const [dealerCode, setDealerCode] = useState("");
  const [storeNumber, setStoreNumber] = useState("");
  const [rooftopGroup, setRooftopGroup] = useState("");

  useEffect(() => {
    if (profile) {
      setFranchiseBrand(profile.franchiseBrand || "");
      setDealerCode(profile.dealerCode || "");
      setStoreNumber(profile.storeNumber || "");
      setRooftopGroup(profile.rooftopGroup || "");
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async (data: { franchiseBrand: string; dealerCode: string; storeNumber: string; rooftopGroup: string }) => {
      return apiRequest("PUT", `/api/corporate/accounts/${customerId}/dealership-profile`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/corporate/accounts/${customerId}/dealership-profile`] });
      toast({ title: "Dealership profile saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save dealership profile", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      franchiseBrand: franchiseBrand.trim(),
      dealerCode: dealerCode.trim(),
      storeNumber: storeNumber.trim(),
      rooftopGroup: rooftopGroup.trim(),
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dealership Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-10 bg-muted animate-pulse rounded-md" />
            <div className="h-10 bg-muted animate-pulse rounded-md" />
            <div className="h-10 bg-muted animate-pulse rounded-md" />
            <div className="h-10 bg-muted animate-pulse rounded-md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Dealership Profile</CardTitle>
          <CardDescription>Franchise dealership details for this account</CardDescription>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-dealership">
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="franchiseBrand">Franchise Brand</Label>
            <Input
              id="franchiseBrand"
              value={franchiseBrand}
              onChange={(e) => setFranchiseBrand(e.target.value)}
              placeholder="e.g. Toyota, Ford, Honda"
              data-testid="input-franchise-brand"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dealerCode">Dealer Code</Label>
            <Input
              id="dealerCode"
              value={dealerCode}
              onChange={(e) => setDealerCode(e.target.value)}
              placeholder="Enter dealer code"
              data-testid="input-dealer-code"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="storeNumber">Store Number</Label>
            <Input
              id="storeNumber"
              value={storeNumber}
              onChange={(e) => setStoreNumber(e.target.value)}
              placeholder="Enter store number"
              data-testid="input-store-number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rooftopGroup">Rooftop Group</Label>
            <Input
              id="rooftopGroup"
              value={rooftopGroup}
              onChange={(e) => setRooftopGroup(e.target.value)}
              placeholder="Enter rooftop group"
              data-testid="input-rooftop-group"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Account Scheduled Labor & Attendance Tab ──────────────────────────────────
type AcctDateWindow = "this_week" | "next_week" | "following_week" | "last_week" | "last_2_weeks" | "custom";

function isoToMDY(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function getThisMonday(from: Date = new Date()): Date {
  const day = from.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(from);
  m.setDate(from.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function acctWindowDates(window: AcctDateWindow, custom: { start: string; end: string }) {
  const today = new Date();
  const todayStr = toDateStr(today);
  const thisMonday = getThisMonday(today);
  if (window === "this_week") {
    return { start: toDateStr(thisMonday), end: toDateStr(addDays(thisMonday, 6)) };
  }
  if (window === "next_week") {
    const nextMon = addDays(thisMonday, 7);
    const nextSun = addDays(thisMonday, 13);
    return { start: toDateStr(nextMon), end: toDateStr(nextSun) };
  }
  if (window === "following_week") {
    const folMon = addDays(thisMonday, 14);
    const folSun = addDays(thisMonday, 20);
    return { start: toDateStr(folMon), end: toDateStr(folSun) };
  }
  if (window === "last_week") {
    const lastMon = addDays(thisMonday, -7);
    const lastSun = addDays(thisMonday, -1);
    return { start: toDateStr(lastMon), end: toDateStr(lastSun) };
  }
  if (window === "last_2_weeks") {
    const s = addDays(today, -14);
    return { start: toDateStr(s), end: todayStr };
  }
  return { start: custom.start, end: custom.end };
}

function ShiftStatusBadge({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    // Acceptance-state statuses (derived from WIW v2 flags)
    unpublished: "bg-muted text-muted-foreground",
    published:   "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    alerted:     "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    accepted:    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    // Attendance-state statuses (from WIW numeric status field)
    confirmed:   "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    denied:      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    late:        "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    absent:      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    started:     "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    finished:    "bg-muted text-muted-foreground",
    open:        "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  };
  const s = status ?? "unknown";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${map[s] ?? "bg-muted text-muted-foreground"}`}>
      {s.replace(/_/g, " ")}
    </span>
  );
}

function CustomerWIWTab({ accountId }: { accountId: string }) {
  const [dateWindow, setDateWindow]   = useState<AcctDateWindow>("this_week");
  const [customStart, setCustomStart] = useState(() => acctWindowDates("this_week", { start: "", end: "" }).start);
  const [customEnd, setCustomEnd]     = useState(() => acctWindowDates("this_week", { start: "", end: "" }).end);
  const [locationFilter, setLocationFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [locationMapOpen, setLocationMapOpen] = useState(false);
  const [pendingMappings, setPendingMappings] = useState<Record<string, string>>({}); 
  const [warningExpanded, setWarningExpanded] = useState(false);

  const { start, end } = acctWindowDates(dateWindow, { start: customStart, end: customEnd });

  function fmtDt(v: string | null) {
    if (!v) return "—";
    try { return format(new Date(v), "MMM d, h:mm a"); }
    catch { return v; }
  }
  function fmtDate(v: string | null) {
    if (!v) return "—";
    try { return format(new Date(v), "MM/dd/yyyy"); }
    catch { return v; }
  }
  function fmtHours(minutes: number | null) {
    if (minutes == null) return "—";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  /** Format an ISO timestamp using the account's IANA timezone with TZ suffix.
   *  includeDate=true  → "Mar 31, 11:00 AM CST"
   *  includeDate=false → "11:00 AM CST"
   *  Falls back to America/New_York when accountTz is not yet loaded. */
  function fmtWithTZ(iso: string | null, tz: string, includeDate = false): string {
    if (!iso) return "—";
    try {
      const opts: Intl.DateTimeFormatOptions = {
        timeZone: tz,
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        ...(includeDate ? { month: "short", day: "numeric" } : {}),
      };
      return new Intl.DateTimeFormat("en-US", opts).format(new Date(iso));
    } catch {
      return fmtDt(iso);
    }
  }

  // ── Account summary ───────────────────────────────────────────────────────
  const { data: summary, isLoading: summaryLoading } = useQuery<{
    scheduledHours: number;
    workedHours: number;
    approvedHours: number;
    attendanceExceptions: number;
    driversScheduledToday: number;
    driversClockInNow: number;
    mappedLocations: any[];
    unmappedLocations: any[];
    timezone: string | null;
  }>({
    queryKey: ["/api/scheduling/wheniwork/account-summary", accountId, start, end],
    queryFn: async () => {
      const p = new URLSearchParams({ accountId });
      if (start) p.set("start", start);
      if (end)   p.set("end", end);
      const r = await fetch(`/api/scheduling/wheniwork/account-summary?${p}`, { credentials: "include" });
      if (!r.ok) return { scheduledHours: 0, workedHours: 0, approvedHours: 0, attendanceExceptions: 0, driversScheduledToday: 0, driversClockInNow: 0, mappedLocations: [], unmappedLocations: [], timezone: null };
      return r.json();
    },
    enabled: !!accountId,
  });

  // ── WIW positions for filter dropdown ─────────────────────────────────────
  const { data: positionsData } = useQuery<{ records: any[] }>({
    queryKey: ["/api/scheduling/wheniwork/wiw-positions"],
    queryFn: async () => {
      const r = await fetch(`/api/scheduling/wheniwork/wiw-positions`, { credentials: "include" });
      if (!r.ok) return { records: [] };
      return r.json();
    },
    enabled: !!accountId,
  });

  // ── Scheduled shifts ──────────────────────────────────────────────────────
  const { data: shiftsData, isLoading: shiftsLoading } = useQuery<{ records: any[]; total: number }>({
    queryKey: ["/api/scheduling/wheniwork/shifts", accountId, start, end, locationFilter, positionFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ accountId, pageSize: "50" });
      if (start) p.set("start", start);
      if (end)   p.set("end", end);
      if (locationFilter !== "all") p.set("locationId", locationFilter);
      if (positionFilter !== "all") p.set("positionId", positionFilter);
      const r = await fetch(`/api/scheduling/wheniwork/shifts?${p}`, { credentials: "include" });
      if (!r.ok) return { records: [], total: 0 };
      return r.json();
    },
    enabled: !!accountId,
  });

  // ── Times (for worked time summary) ──────────────────────────────────────
  const { data: timesData, isLoading: timesLoading } = useQuery<{ records: any[] }>({
    queryKey: ["/api/scheduling/wheniwork/times", "account", accountId, start, end],
    queryFn: async () => {
      const p = new URLSearchParams({ accountId, pageSize: "100" });
      if (start) p.set("start", start);
      if (end)   p.set("end", end);
      const r = await fetch(`/api/scheduling/wheniwork/times?${p}`, { credentials: "include" });
      if (!r.ok) return { records: [] };
      return r.json();
    },
    enabled: !!accountId,
  });

  // ── Absences ──────────────────────────────────────────────────────────────
  const { data: absencesData, isLoading: absencesLoading } = useQuery<{ records: any[] }>({
    queryKey: ["/api/scheduling/wheniwork/absences", "account", accountId, start, end],
    queryFn: async () => {
      const p = new URLSearchParams({ accountId, pageSize: "50" });
      if (start) p.set("start", start);
      if (end)   p.set("end", end);
      const r = await fetch(`/api/scheduling/wheniwork/absences?${p}`, { credentials: "include" });
      if (!r.ok) return { records: [] };
      return r.json();
    },
    enabled: !!accountId,
  });

  // ── Notices ───────────────────────────────────────────────────────────────
  const { data: noticesData, isLoading: noticesLoading } = useQuery<{ records: any[] }>({
    queryKey: ["/api/scheduling/wheniwork/notices", "account", accountId, start, end],
    queryFn: async () => {
      const p = new URLSearchParams({ accountId, pageSize: "50" });
      if (start) p.set("start", start);
      if (end)   p.set("end", end);
      const r = await fetch(`/api/scheduling/wheniwork/notices?${p}`, { credentials: "include" });
      if (!r.ok) return { records: [] };
      return r.json();
    },
    enabled: !!accountId,
  });

  // ── WIW data availability range ───────────────────────────────────────────
  const { data: wiwRangeData } = useQuery<{ minShiftDate: string | null; maxShiftDate: string | null }>({
    queryKey: ["/api/scheduling/wheniwork/data-range"],
    queryFn: async () => {
      const r = await fetch("/api/scheduling/wheniwork/data-range", { credentials: "include" });
      if (!r.ok) return { minShiftDate: null, maxShiftDate: null };
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const maxShiftDate = wiwRangeData?.maxShiftDate ?? null;

  // ── Account location mappings (wiw_location_account_map) ─────────────────
  const { data: locationMapData } = useQuery<{
    mapped: any[]; unmappedCount: number; ambiguousCount: number;
  }>({
    queryKey: ["/api/accounts/wiw-location-map", accountId],
    queryFn: async () => {
      const r = await fetch(`/api/accounts/${accountId}/wiw-location-map`, { credentials: "include" });
      if (!r.ok) return { mapped: [], unmappedCount: 0, ambiguousCount: 0 };
      return r.json();
    },
    enabled: !!accountId,
  });

  // ── All unmapped/ambiguous locations for the mapping dialog ───────────────
  const { data: allMappingsData } = useQuery<{
    mappings: any[]; total: number;
  }>({
    queryKey: ["/api/scheduling/wiw-location-map", "unmapped-ambiguous"],
    queryFn: async () => {
      const r = await fetch(`/api/scheduling/wiw-location-map?limit=200`, { credentials: "include" });
      if (!r.ok) return { mappings: [], total: 0 };
      return r.json();
    },
    enabled: locationMapOpen || warningExpanded,
  });

  // ── Customers list for mapping dropdown ───────────────────────────────────
  const { data: customersForMap } = useQuery<any[]>({
    queryKey: ["/api/corporate/customers", "minimal"],
    queryFn: async () => {
      const r = await fetch(`/api/corporate/customers`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: locationMapOpen,
  });

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/scheduling/wiw-location-map/auto-match", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false, onlyUnmapped: false }),
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts/wiw-location-map", accountId] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw-location-map", "unmapped-ambiguous"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/account-summary", accountId] });
    },
  });

  const saveMapMutation = useMutation({
    mutationFn: async (pairs: Array<{ mapId: string; driverHubAccountId: string | null }>) => {
      await Promise.all(pairs.map(({ mapId, driverHubAccountId }) =>
        fetch(`/api/scheduling/wiw-location-map/${mapId}`, {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverHubAccountId }),
        })
      ));
    },
    onSuccess: () => {
      setPendingMappings({});
      setLocationMapOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/accounts/wiw-location-map", accountId] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wiw-location-map", "unmapped-ambiguous"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/wheniwork/account-summary", accountId] });
    },
  });

  const shifts   = shiftsData?.records  ?? [];
  const times    = timesData?.records   ?? [];
  const absences = absencesData?.records ?? [];
  const notices  = noticesData?.records  ?? [];
  const positions = positionsData?.records ?? [];
  const mappedLocations = summary?.mappedLocations ?? [];
  const unmappedLocations = summary?.unmappedLocations ?? [];
  // Priority: WIW location tz (from summary API) → Eastern fallback
  const accountTz = summary?.timezone ?? "America/New_York";

  const globalUnmappedCount = (locationMapData?.unmappedCount ?? 0) + (locationMapData?.ambiguousCount ?? 0);
  const allMappings         = allMappingsData?.mappings ?? [];
  const customerList        = Array.isArray(customersForMap) ? customersForMap : [];

  // Aggregate times per driver for the Worked Time Summary table
  const workedByDriver = Object.values(
    times.reduce((acc: Record<string, any>, t: any) => {
      const key = t.driver_id ?? t.wiw_user_name ?? "unknown";
      if (!acc[key]) {
        acc[key] = {
          driverId: t.driver_id,
          driverName: t.driver_name ?? t.wiw_user_name ?? "Unknown",
          totalMinutes: 0,
          approvedMinutes: 0,
          unreviewedCount: 0,
        };
      }
      acc[key].totalMinutes    += t.total_minutes ?? 0;
      if (t.approval_status === "approved") acc[key].approvedMinutes += t.total_minutes ?? 0;
      if (t.approval_status === "unreviewed") acc[key].unreviewedCount++;
      return acc;
    }, {})
  ) as any[];

  // Merge absences + notices for attendance issues table
  const issueRows: Array<{ id: string; _type: "absence" | "notice"; driverId: string | null; driverName: string; issueType: string; dateStr: string; location: string; details: string }> = [
    ...absences.map((a: any) => ({
      id: `abs-${a.id}`, _type: "absence" as const,
      driverId: a.driver_id, driverName: a.driver_name ?? a.wiw_user_name ?? "—",
      issueType: "Absence",
      dateStr: fmtDate(a.date),
      location: "—",
      details: [a.reason, a.duration_minutes ? `${a.duration_minutes} min` : null].filter(Boolean).join(" · "),
    })),
    ...notices.map((n: any) => ({
      id: `ntc-${n.id}`, _type: "notice" as const,
      driverId: n.driver_id, driverName: n.driver_name ?? n.wiw_user_name ?? "—",
      issueType: n.type?.replace(/_/g, " ") ?? "Notice",
      dateStr: fmtWithTZ(n.occurred_at, accountTz, true),
      location: "—",
      details: [n.minutes_late != null ? `${n.minutes_late} min late` : null, n.notes ?? null].filter(Boolean).join(" · "),
    })),
  ].sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  const noMappedLocations = mappedLocations.length === 0 && !summaryLoading;

  return (
    <div className="space-y-6" data-testid="account-wiw-tab">

      {/* ── Summary metrics ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Scheduled Hours",       value: summaryLoading ? null : `${summary?.scheduledHours ?? 0}h`,        icon: <CalendarRange className="w-4 h-4 text-muted-foreground" />,  testId: "metric-acct-wiw-scheduled" },
          { label: "Worked Hours",          value: summaryLoading ? null : `${summary?.workedHours ?? 0}h`,           icon: <Timer className="w-4 h-4 text-muted-foreground" />,           testId: "metric-acct-wiw-worked" },
          { label: "Approved Hours",        value: summaryLoading ? null : `${summary?.approvedHours ?? 0}h`,         icon: <CheckCircle className="w-4 h-4 text-muted-foreground" />,     testId: "metric-acct-wiw-approved" },
          { label: "Attendance Exceptions", value: summaryLoading ? null : String(summary?.attendanceExceptions ?? 0), icon: <AlertCircle className="w-4 h-4 text-muted-foreground" />,    testId: "metric-acct-wiw-exceptions", highlight: (summary?.attendanceExceptions ?? 0) > 0 },
          { label: "Scheduled Today",       value: summaryLoading ? null : String(summary?.driversScheduledToday ?? 0), icon: <Users className="w-4 h-4 text-muted-foreground" />,         testId: "metric-acct-wiw-today" },
          { label: "Clocked In Now",        value: summaryLoading ? null : String(summary?.driversClockInNow ?? 0),   icon: <UserCheck className="w-4 h-4 text-muted-foreground" />,      testId: "metric-acct-wiw-clocked" },
        ].map(({ label, value, icon, testId, highlight }) => (
          <Card key={label} data-testid={testId}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                {icon}
              </div>
              {value == null ? (
                <Skeleton className="h-6 w-12 mt-1" />
              ) : (
                <p className={`text-xl font-bold ${highlight ? "text-destructive" : ""}`}>{value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
            </div>
            {/* Date range presets + inline range display */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: "this_week",      label: "This Week" },
                  { key: "next_week",      label: "Next Week" },
                  { key: "following_week", label: "Following Week" },
                  { key: "last_week",      label: "Last Week" },
                  { key: "last_2_weeks",   label: "Last 2 Weeks" },
                  { key: "custom",         label: "Custom" },
                ] as { key: AcctDateWindow; label: string }[]
              ).map(({ key: w, label }) => {
                const windowRange = acctWindowDates(w, { start: customStart, end: customEnd });
                const isBeyondMax = maxShiftDate && windowRange.end > maxShiftDate;
                return (
                  <Button
                    key={w}
                    size="sm"
                    variant={dateWindow === w ? "default" : "outline"}
                    onClick={() => {
                      setDateWindow(w);
                      if (w !== "custom") {
                        const computed = acctWindowDates(w, { start: customStart, end: customEnd });
                        setCustomStart(computed.start);
                        setCustomEnd(computed.end);
                      }
                    }}
                    data-testid={`filter-acct-wiw-${w}`}
                    title={isBeyondMax ? `Limited data — schedules available through ${isoToMDY(maxShiftDate!)}` : undefined}
                  >
                    {label}
                  </Button>
                );
              })}
              {dateWindow !== "custom" && (start || end) && (
                <span className="text-xs font-medium text-foreground/70 px-1" data-testid="text-acct-wiw-date-range">
                  {isoToMDY(start)} – {isoToMDY(end)}
                </span>
              )}
            </div>
            {/* Guardrail: warn when selected window extends past available data */}
            {maxShiftDate && end > maxShiftDate && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-300" data-testid="banner-acct-wiw-beyond-range">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  No schedule data available beyond <strong>{isoToMDY(maxShiftDate)}</strong>. WIW schedules are typically published 1–2 weeks ahead.
                </span>
              </div>
            )}
            {dateWindow === "custom" && (
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={customStart} max={maxShiftDate ?? undefined} onChange={e => setCustomStart(e.target.value)} className="w-36 h-8 text-sm" data-testid="input-acct-wiw-start" />
                <span className="text-muted-foreground text-sm">to</span>
                <Input type="date" value={customEnd}   max={maxShiftDate ?? undefined} onChange={e => setCustomEnd(e.target.value)}   className="w-36 h-8 text-sm" data-testid="input-acct-wiw-end" />
                {maxShiftDate && (
                  <span className="text-xs text-muted-foreground" data-testid="text-acct-wiw-max-hint">
                    Data available through {isoToMDY(maxShiftDate)}
                  </span>
                )}
              </div>
            )}
            {/* Location filter */}
            {mappedLocations.length > 0 && (
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="h-8 w-44 text-sm" data-testid="select-acct-wiw-location">
                  <MapPin className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {mappedLocations.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Position filter */}
            {positions.length > 0 && (
              <Select value={positionFilter} onValueChange={setPositionFilter}>
                <SelectTrigger className="h-8 w-44 text-sm" data-testid="select-acct-wiw-position">
                  <SelectValue placeholder="All positions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All positions</SelectItem>
                  {positions.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Mapped WIW Locations card ───────────────────────────────────── */}
      {(locationMapData?.mapped ?? []).length > 0 && (
        <Card data-testid="card-wiw-mapped-locations">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Mapped WIW Locations
                <Badge variant="secondary" className="ml-1">{(locationMapData?.mapped ?? []).length}</Badge>
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setLocationMapOpen(true)} data-testid="button-manage-locations">
                Manage Mappings
              </Button>
            </div>
            <CardDescription>WIW locations currently mapped to this account. Shifts and time records at these locations appear in the tables below.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                  <th className="px-4 py-2.5 font-medium">WIW Location</th>
                  <th className="px-4 py-2.5 font-medium">Workplace</th>
                  <th className="px-4 py-2.5 font-medium">Confidence</th>
                  <th className="px-4 py-2.5 font-medium">Matched By</th>
                  <th className="px-4 py-2.5 font-medium">Last Seen</th>
                  <th className="px-4 py-2.5 w-16" />
                </tr>
              </thead>
              <tbody>
                {(locationMapData?.mapped ?? []).map((loc: any) => (
                  <tr key={loc.id} className="border-b last:border-0" data-testid={`row-mapped-loc-${loc.id}`}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium leading-tight">{loc.wiwLocationName}</p>
                      <p className="text-xs text-muted-foreground">ID: {loc.wiwLocationId}</p>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">
                      {loc.wiwWorkplaceId === 3725440 ? "Main" : loc.wiwWorkplaceId === 4244009 ? "IL & NY" : loc.wiwWorkplaceId === 4280572 ? "CA" : `WP ${loc.wiwWorkplaceId ?? "—"}`}
                    </td>
                    <td className="px-4 py-2.5">
                      {loc.confidenceScore > 0 ? (
                        <span className={`text-sm font-medium ${loc.confidenceScore >= 90 ? "text-green-600 dark:text-green-400" : loc.confidenceScore >= 70 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                          {loc.confidenceScore}%
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {loc.matchedBy === "store_number" ? "Store #" : loc.matchedBy === "normalized_name" ? "Normalized" : loc.matchedBy === "exact_name" ? "Exact Name" : loc.matchedBy === "manual" ? "Manual" : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {loc.lastSeenAt ? new Date(loc.lastSeenAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => saveMapMutation.mutate([{ mapId: loc.id, driverHubAccountId: null }])}
                        disabled={saveMapMutation.isPending}
                        data-testid={`button-unmap-loc-${loc.id}`}
                      >
                        Unmap
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Scheduled Drivers table ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Scheduled Drivers
            {(shiftsData?.total ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1">{shiftsData?.total}</Badge>
            )}
          </CardTitle>
          <CardDescription className="flex items-center gap-2 flex-wrap">
            Shifts at this account&apos;s WIW locations within the selected date window
            <Badge variant="secondary" className="text-xs">Location local time</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {shiftsLoading ? (
            <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : shifts.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No shifts found for this account in the selected range.</p>
              {noMappedLocations && (
                <p className="text-xs text-muted-foreground">Map WIW locations to this account to see shifts.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                    <th className="px-4 py-2.5 font-medium">Driver</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Shift Time</th>
                    <th className="px-4 py-2.5 font-medium">Location</th>
                    <th className="px-4 py-2.5 font-medium">Position</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s: any) => (
                    <tr key={s.id} className="border-b last:border-0 hover-elevate" data-testid={`row-acct-shift-${s.id}`}>
                      <td className="px-4 py-2.5 font-medium">
                        {s.driver_id ? (
                          <Link href={`/drivers/${s.driver_id}?tab=scheduling&returnTo=${encodeURIComponent(`/customers/${accountId}?tab=scheduling`)}`} className="text-primary hover:underline" data-testid={`link-driver-${s.driver_id}`}>
                            {s.driver_name ?? s.wiw_user_name ?? "—"}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{s.wiw_user_name ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(s.start_time)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                        {fmtWithTZ(s.start_time, s.location_timezone ?? accountTz)} – {fmtWithTZ(s.end_time, s.location_timezone ?? accountTz)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.location_name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{s.position_name ?? "—"}</td>
                      <td className="px-4 py-2.5"><ShiftStatusBadge status={s.status} /></td>
                      <td className="px-4 py-2.5">
                        <Link href={`/scheduling/shifts`} data-testid={`link-shift-${s.id}`}>
                          <Button size="icon" variant="ghost" className="h-7 w-7">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Worked Time Summary ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Worked Time Summary
          </CardTitle>
          <CardDescription>Per-driver hours within the selected date window</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {timesLoading ? (
            <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : workedByDriver.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No clock records found for this account in the selected range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                    <th className="px-4 py-2.5 font-medium">Driver</th>
                    <th className="px-4 py-2.5 font-medium">Worked Hours</th>
                    <th className="px-4 py-2.5 font-medium">Approved Hours</th>
                    <th className="px-4 py-2.5 font-medium">Unreviewed</th>
                    <th className="px-4 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {workedByDriver.map((row: any) => (
                    <tr key={row.driverId ?? row.driverName} className="border-b last:border-0 hover-elevate" data-testid={`row-acct-time-${row.driverId ?? row.driverName}`}>
                      <td className="px-4 py-2.5 font-medium">
                        {row.driverId ? (
                          <Link href={`/drivers/${row.driverId}?tab=scheduling&returnTo=${encodeURIComponent(`/customers/${accountId}?tab=scheduling`)}`} className="text-primary hover:underline">
                            {row.driverName}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{row.driverName}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">{fmtHours(row.totalMinutes)}</td>
                      <td className="px-4 py-2.5">
                        <span className={row.approvedMinutes > 0 ? "text-green-700 dark:text-green-400 font-medium" : "text-muted-foreground"}>
                          {fmtHours(row.approvedMinutes)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {row.unreviewedCount > 0 ? (
                          <Badge variant="secondary" className="text-xs">{row.unreviewedCount} pending</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.driverId && (
                          <Link href={`/drivers/${row.driverId}?tab=scheduling&returnTo=${encodeURIComponent(`/customers/${accountId}?tab=scheduling`)}`}>
                            <Button size="icon" variant="ghost" className="h-7 w-7">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Attendance Issues ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Attendance Issues
            {issueRows.length > 0 && (
              <Badge variant="secondary" className="ml-1">{issueRows.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>Absences and attendance notices for drivers at this account</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {(absencesLoading || noticesLoading) ? (
            <div className="space-y-2 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : issueRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No attendance issues in the selected date range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                    <th className="px-4 py-2.5 font-medium">Driver</th>
                    <th className="px-4 py-2.5 font-medium">Issue Type</th>
                    <th className="px-4 py-2.5 font-medium">Date / Time</th>
                    <th className="px-4 py-2.5 font-medium">Notes / Details</th>
                    <th className="px-4 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {issueRows.map(row => (
                    <tr key={row.id} className="border-b last:border-0 hover-elevate" data-testid={`row-acct-issue-${row.id}`}>
                      <td className="px-4 py-2.5 font-medium">
                        {row.driverId ? (
                          <Link href={`/drivers/${row.driverId}?tab=scheduling&returnTo=${encodeURIComponent(`/customers/${accountId}?tab=scheduling`)}`} className="text-primary hover:underline">
                            {row.driverName}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{row.driverName}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          row._type === "absence"
                            ? "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"
                        }`}>
                          {row.issueType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{row.dateStr}</td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-xs truncate">{row.details || "—"}</td>
                      <td className="px-4 py-2.5">
                        {row.driverId && (
                          <Link href={`/drivers/${row.driverId}?tab=scheduling&returnTo=${encodeURIComponent(`/customers/${accountId}?tab=scheduling`)}`}>
                            <Button size="icon" variant="ghost" className="h-7 w-7">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>


      {/* ── WIW Location Governance ─────────────────────────────────────── */}
      <WiwLocationMappingSection accountId={accountId} />
      {/* ── WIW Location Mapping Dialog ─────────────────────────────────── */}
      <Dialog open={locationMapOpen} onOpenChange={setLocationMapOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col" data-testid="dialog-wiw-location-map">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Map WIW Locations to DriverHub Accounts
            </DialogTitle>
            <DialogDescription>
              Assign each WIW workplace location to its corresponding DriverHub account. Shifts and time records are
              attributed to accounts through this mapping.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 pb-2">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{allMappings.filter((m: any) => m.mappingStatus === "mapped").length}</span> mapped
              </span>
              <span>
                <span className="font-medium text-foreground">{allMappings.filter((m: any) => m.mappingStatus === "unmapped").length}</span> unmapped
              </span>
              {allMappings.filter((m: any) => m.mappingStatus === "ambiguous").length > 0 && (
                <span>
                  <span className="font-medium text-destructive">{allMappings.filter((m: any) => m.mappingStatus === "ambiguous").length}</span> ambiguous
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => autoMatchMutation.mutate()}
              disabled={autoMatchMutation.isPending}
              data-testid="button-run-auto-match"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${autoMatchMutation.isPending ? "animate-spin" : ""}`} />
              {autoMatchMutation.isPending ? "Running..." : "Run Auto-Match"}
            </Button>
          </div>

          <div className="overflow-y-auto flex-1 border rounded-md">
            {allMappings.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                No WIW locations found. Sync locations first.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b bg-muted/40 text-muted-foreground text-left">
                    <th className="px-3 py-2.5 font-medium">WIW Location</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Assigned Account</th>
                    <th className="px-3 py-2.5 font-medium w-24">Confidence</th>
                    <th className="px-3 py-2.5 font-medium w-24">Matched By</th>
                    <th className="px-3 py-2.5 font-medium w-28">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {allMappings.map((m: any) => {
                    const pending = pendingMappings[m.id];
                    const effectiveAccountId = pending !== undefined ? pending : (m.driverHubAccountId ?? "");
                    const isMapped = m.mappingStatus === "mapped" && !pending;
                    const isModified = pending !== undefined;

                    return (
                      <tr
                        key={m.id}
                        className={`border-b last:border-0 ${isModified ? "bg-muted/20" : ""}`}
                        data-testid={`row-location-map-${m.id}`}
                      >
                        <td className="px-3 py-2">
                          <p className="font-medium leading-tight">{m.wiwLocationName}</p>
                          {m.matchReason && (
                            <p className="text-xs text-muted-foreground mt-0.5">{m.matchReason}</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {m.mappingStatus === "mapped" && !isModified ? (
                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Mapped</Badge>
                          ) : m.mappingStatus === "ambiguous" ? (
                            <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">Ambiguous</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Unmapped</Badge>
                          )}
                          {isModified && (
                            <Badge variant="outline" className="ml-1 text-xs">Modified</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 min-w-48">
                          <Select
                            value={effectiveAccountId}
                            onValueChange={(val) => {
                              setPendingMappings(prev => ({ ...prev, [m.id]: val === "__none__" ? "" : val }));
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs w-full" data-testid={`select-location-account-${m.id}`}>
                              <SelectValue placeholder="Select account..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">
                                <span className="text-muted-foreground">— Unmap —</span>
                              </SelectItem>
                              {customerList.map((c: any) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.customer_name ?? c.customerName} {c.customer_number ?? c.customerNumber ? `(${c.customer_number ?? c.customerNumber})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          {m.confidenceScore > 0 ? (
                            <span className={`text-xs font-medium ${
                              m.confidenceScore >= 90 ? "text-green-600 dark:text-green-400" :
                              m.confidenceScore >= 70 ? "text-blue-600 dark:text-blue-400" :
                              "text-muted-foreground"
                            }`}>
                              {Math.round(m.confidenceScore)}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {m.matchedBy === "store_number" ? "Store #" : m.matchedBy === "normalized_name" ? "Normalized" : m.matchedBy === "exact_name" ? "Exact Name" : m.matchedBy === "manual" ? "Manual" : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {m.lastSeenAt ? new Date(m.lastSeenAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={() => { setLocationMapOpen(false); setPendingMappings({}); }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const pairs = Object.entries(pendingMappings).map(([mapId, driverHubAccountId]) => ({
                  mapId,
                  driverHubAccountId: driverHubAccountId || null,
                }));
                if (pairs.length === 0) { setLocationMapOpen(false); return; }
                saveMapMutation.mutate(pairs);
              }}
              disabled={saveMapMutation.isPending || Object.keys(pendingMappings).length === 0}
              data-testid="button-save-location-map"
            >
              {saveMapMutation.isPending ? "Saving..." : `Save ${Object.keys(pendingMappings).length > 0 ? `${Object.keys(pendingMappings).length} Change${Object.keys(pendingMappings).length > 1 ? "s" : ""}` : "Changes"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── DriverShift Weekly Report Recipients ─────────────────────────────────────
function DriverShiftRecipientsField({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const [inputValue, setInputValue] = useState("");
  const [saved, setSaved] = useState(false);

  const { data: config, isLoading } = useQuery<any>({
    queryKey: ["/api/customers", customerId, "report-config"],
    queryFn: () => fetch(`/api/customers/${customerId}/report-config`, { credentials: "include" }).then(r => r.json()),
  });

  useEffect(() => {
    if (config) {
      const existing: string[] = Array.isArray(config.reportPrimaryEmails) && config.reportPrimaryEmails.length > 0
        ? config.reportPrimaryEmails
        : config.reportPrimaryEmail ? [config.reportPrimaryEmail] : [];
      setInputValue(existing.join(", "));
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const emails = inputValue
        .split(/[,\n]+/)
        .map((e: string) => e.trim())
        .filter((e: string) => e.includes("@"));
      const res = await apiRequest("PATCH", `/api/customers/${customerId}/report-config`, {
        reportPrimaryEmails: emails,
      });
      return res.json();
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "report-config"] });
      toast({ title: "Recipients saved" });
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="rounded-md border bg-muted/30 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">Weekly Report Recipients</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Email addresses that receive the automated weekly PDF and Excel report every Monday. Separate multiple addresses with commas.
        </p>
      </div>
      {isLoading ? (
        <div className="h-9 rounded-md bg-muted animate-pulse" />
      ) : (
        <div className="flex gap-2 flex-wrap">
          <Input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="service@dealer.com, gm@dealer.com"
            className="flex-1 min-w-48"
            data-testid="input-drivershift-recipients"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-drivershift-recipients"
          >
            {saveMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</>
              : saved
                ? <><CheckCircle2 className="h-4 w-4 mr-1.5 text-green-500" />Saved</>
                : "Save Recipients"
            }
          </Button>
        </div>
      )}
    </div>
  );
}

function CopyButton({ value, testId }: { value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover-elevate transition-opacity focus-visible:opacity-100 focus-visible:outline-none shrink-0"
          data-testid={testId}
        >
          {copied
            ? <Check className="h-3 w-3 text-green-500" />
            : <Copy className="h-3 w-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? "Copied!" : "Copy"}</TooltipContent>
    </Tooltip>
  );
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated, user, isCorporate } = useAuth();
  const { toast } = useToast();
  const isNewCustomer = !id || id === "new";
  const search = useSearch();
  const [activeTab, setActiveTab] = useState(() => {
    if (isNewCustomer) return "company-details";
    const p = new URLSearchParams(window.location.search);
    return p.get("tab") || "overview";
  });

  // Sync active tab whenever the URL search string changes (e.g. back-navigation from Driver Scheduling)
  useEffect(() => {
    const p = new URLSearchParams(search);
    const tabFromUrl = p.get("tab");
    if (tabFromUrl) {
      setActiveTab(tabFromUrl);
    }
  }, [search]);

  // Mirror DriverDetail: update both state AND URL so browser history always reflects the active tab
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (!isNewCustomer) {
      const p = new URLSearchParams(window.location.search);
      p.set("tab", tab);
      window.history.replaceState(null, "", `/customers/${id}?${p.toString()}`);
    }
  };

  const [logTouchDialogOpen, setLogTouchDialogOpen] = useState(false);
  const [weeklyReportOpen, setWeeklyReportOpen] = useState(false);
  const [touchType, setTouchType] = useState<string>("");
  const [touchNotes, setTouchNotes] = useState("");
  const [activityCategory, setActivityCategory] = useState<string>("all");
  const [showHealthExplanation, setShowHealthExplanation] = useState(false);
  const [healthOverrideDialogOpen, setHealthOverrideDialogOpen] = useState(false);
  const [overrideValue, setOverrideValue] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideExpiresAt, setOverrideExpiresAt] = useState("");
  const [removeOverrideDialogOpen, setRemoveOverrideDialogOpen] = useState(false);
  const [removeOverrideReason, setRemoveOverrideReason] = useState("");
  const [removeOverrideTargetId, setRemoveOverrideTargetId] = useState<string | null>(null);

  // Account Notes state
  const [noteAddDialogOpen, setNoteAddDialogOpen] = useState(false);
  const [noteForm, setNoteForm] = useState({
    noteType: "",
    content: "",
    noteDate: new Date().toISOString().split('T')[0],
    tripId: "",
    zendeskId: "",
  });
  const [noteAttachmentFile, setNoteAttachmentFile] = useState<File | null>(null);
  const [noteAttachmentUploading, setNoteAttachmentUploading] = useState(false);
  const [noteAttachmentDocId, setNoteAttachmentDocId] = useState<string | null>(null);
  const [noteAttachmentFileName, setNoteAttachmentFileName] = useState<string | null>(null);
  const [notesFilterType, setNotesFilterType] = useState("");
  const [notesFilterStartDate, setNotesFilterStartDate] = useState("");
  const [notesFilterEndDate, setNotesFilterEndDate] = useState("");
  const [notesFilterSubmittedBy, setNotesFilterSubmittedBy] = useState("");
  const [showNotesFilter, setShowNotesFilter] = useState(false);
  const [noteDeleteDialogOpen, setNoteDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<AccountNote | null>(null);
  const [noteDeleteReason, setNoteDeleteReason] = useState("");
  const [noteDeleteAlsoAttachment, setNoteDeleteAlsoAttachment] = useState(false);
  const [noteEditDialogOpen, setNoteEditDialogOpen] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<AccountNote | null>(null);
  const [noteEditContent, setNoteEditContent] = useState("");
  const [noteEditType, setNoteEditType] = useState("");
  const [noteEditDate, setNoteEditDate] = useState("");
  const [noteEditReason, setNoteEditReason] = useState("");
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  
  // Decision Journal state
  const [decisionDialogOpen, setDecisionDialogOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<string>("");
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionExpectedOutcome, setDecisionExpectedOutcome] = useState("");
  const [decisionEffectiveDate, setDecisionEffectiveDate] = useState("");
  const [decisionReviewDate, setDecisionReviewDate] = useState("");
  const [addendumDialogOpen, setAddendumDialogOpen] = useState(false);
  const [addendumDecisionId, setAddendumDecisionId] = useState<string>("");
  const [addendumContent, setAddendumContent] = useState("");
  const [expandedDecisions, setExpandedDecisions] = useState<Set<string>>(new Set());
  
  // Knowledge Base state
  const [knowledgeEditMode, setKnowledgeEditMode] = useState(false);
  const [knowledgeBeforeServicing, setKnowledgeBeforeServicing] = useState("");
  const [knowledgeWhatNotToDo, setKnowledgeWhatNotToDo] = useState("");
  const [knowledgeKnownLandmines, setKnowledgeKnownLandmines] = useState("");
  const [knowledgePreferredPractices, setKnowledgePreferredPractices] = useState("");
  const [showKnowledgeHistory, setShowKnowledgeHistory] = useState(false);

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/corporate/customers", id],
    enabled: isAuthenticated && !isNewCustomer,
  });

  // Driver count for header badge — DH-002161: always shows Active·Primary count (filter=active)
  const { data: assignedDriversHeader = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/customers", id, "drivers", "active"],
    queryFn: () => fetch(`/api/corporate/customers/${id}/drivers?filter=active`, { credentials: "include" }).then(r => r.json()),
    enabled: isAuthenticated && !isNewCustomer && !!id,
  });

  const { data: allCustomers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/corporate/customers"],
    enabled: isAuthenticated,
  });

  // Billing rates summary for Company Details — reads from account_service_rates (single source of truth)
  const { data: accountBillingRates = [] } = useQuery<any[]>({
    queryKey: ["/api/accounts/billing-rates", id, "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/accounts/billing-rates?customerId=${id}&activeOnly=true`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated && !isNewCustomer && !!id,
    staleTime: 60_000,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/corporate/users"],
    enabled: isAuthenticated,
  });

  // Fetch account activities (old endpoint - keep for compatibility)
  const { data: activities = [], isLoading: activitiesLoading } = useQuery<AccountActivityItem[]>({
    queryKey: ["/api/corporate/customers", id, "activities"],
    enabled: isAuthenticated && !isNewCustomer,
  });

  // Fetch activity events (new unified timeline)
  const activityEventsUrl = activityCategory !== 'all' 
    ? `/api/accounts/${id}/activity?category=${activityCategory}` 
    : `/api/accounts/${id}/activity`;
  const { data: activityEvents = [], isLoading: activityEventsLoading } = useQuery<ActivityEvent[]>({
    queryKey: ["/api/accounts", id, "activity", activityCategory],
    queryFn: async () => {
      const response = await fetch(activityEventsUrl, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch activity events');
      return response.json();
    },
    enabled: isAuthenticated && !isNewCustomer,
  });

  // Parent/Child Hierarchy queries
  const { data: isParentData } = useQuery<{ isParent: boolean }>({
    queryKey: ["/api/accounts", id, "is-parent"],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${id}/is-parent`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to check parent status');
      return response.json();
    },
    enabled: isAuthenticated && !isNewCustomer,
  });

  const isParentAccount = isParentData?.isParent ?? false;

  const { data: childAccounts = [] } = useQuery<Customer[]>({
    queryKey: ["/api/accounts", id, "children"],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${id}/children`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch child accounts');
      return response.json();
    },
    enabled: isAuthenticated && !isNewCustomer && isParentAccount,
  });

  const { data: parentAccount } = useQuery<Customer | null>({
    queryKey: ["/api/accounts", id, "parent"],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${id}/parent`, { credentials: 'include' });
      if (!response.ok) return null;
      const data = await response.json();
      return data;
    },
    enabled: isAuthenticated && !isNewCustomer && !!customer?.parentAccountId,
  });

  interface RollupMetrics {
    totalRevenue30: number;
    totalRevenue90: number;
    totalCosts30: number;
    totalCosts90: number;
    totalMargin: number;
    openAR: number;
    childCount: number;
    rolledUpHealth: string;
    rolledUpHealthTrend: string;
  }

  const { data: rollupMetrics } = useQuery<RollupMetrics>({
    queryKey: ["/api/accounts", id, "rollup-metrics"],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${id}/rollup-metrics`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch rollup metrics');
      return response.json();
    },
    enabled: isAuthenticated && !isNewCustomer && isParentAccount,
  });

  const isChildAccount = !!customer?.parentAccountId;

  // Health explanation and overrides
  interface HealthSubScore {
    status: string;
    details: string;
    [key: string]: unknown;
  }
  interface HealthExplanation {
    health: string;
    healthTrend: string;
    reasons: string[];
    subScores?: { [key: string]: HealthSubScore };
    calculatedAt?: string;
    activeOverride?: {
      id: string;
      overrideValue: string;
      reason: string;
      expiresAt: string;
      createdAt: string;
      createdByName?: string;
    };
  }

  interface DecisionAddendum {
    id: string;
    decisionId: string;
    content: string;
    addedBy: string | null;
    addedByName: string | null;
    createdAt: string;
  }

  interface AccountDecision {
    id: string;
    accountId: string;
    decisionType: string;
    reason: string;
    expectedOutcome: string | null;
    effectiveDate: string;
    reviewDate: string | null;
    enteredBy: string | null;
    enteredByName: string | null;
    createdAt: string;
    addendums: DecisionAddendum[];
  }

  const { data: healthExplanation, isLoading: healthExplanationLoading } = useQuery<HealthExplanation>({
    queryKey: ["/api/accounts", id, "health-explanation"],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${id}/health-explanation`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch health explanation');
      return response.json();
    },
    enabled: isAuthenticated && !isNewCustomer && showHealthExplanation,
  });

  // Canonical account move stats — reads from trips table (not partner_move_staging).
  const { data: draiverHealthStats } = useQuery<AccountMoveStats>({
    queryKey: ["/api/corporate/accounts", id, "move-stats"],
    queryFn: () =>
      fetch(`/api/corporate/accounts/${id}/move-stats`, { credentials: "include" })
        .then(r => r.json()),
    enabled: isAuthenticated && !isNewCustomer && !!id,
    staleTime: 5 * 60 * 1000,
  });

  // Compute health, trend, and top reasons from Draiver move data
  const draiverDerivedHealth = (() => {
    if (!draiverHealthStats?.hasData) return null;
    const { pctChange, daysSinceLastMove, exceptionRate } = draiverHealthStats;
    const isAtRisk    = draiverHealthStats.atRisk;
    const isWatch     = !isAtRisk && (pctChange < -10 || (daysSinceLastMove !== null && daysSinceLastMove >= 7) || (exceptionRate !== null && exceptionRate >= 15));
    const status      = isAtRisk ? "At Risk" : isWatch ? "Watch" : "Healthy";
    const trend       = pctChange >= 10 ? "Improving" : pctChange <= -10 ? "Declining" : "Flat";
    const reasons: string[] = [];
    // Volume
    if (pctChange > 10)      reasons.push(`Volume up ${pctChange}% vs prior 30 days`);
    else if (pctChange < -10) reasons.push(`Volume down ${Math.abs(pctChange)}% vs prior 30 days`);
    else                     reasons.push("Volume steady vs prior 30 days");
    // Activity
    if (daysSinceLastMove === null)       reasons.push("No completed moves on record");
    else if (daysSinceLastMove === 0)     reasons.push("Active — move completed today");
    else if (daysSinceLastMove < 7)       reasons.push(`Active — last move ${daysSinceLastMove}d ago`);
    else if (daysSinceLastMove < 14)      reasons.push(`Reduced activity — last move ${daysSinceLastMove}d ago`);
    else                                  reasons.push(`No activity in ${daysSinceLastMove} days`);
    // Exception rate
    if (exceptionRate !== null) {
      if (exceptionRate < 15)       reasons.push(`Low exception rate (${exceptionRate}%)`);
      else if (exceptionRate < 30)  reasons.push(`Moderate exception rate (${exceptionRate}%)`);
      else                          reasons.push(`High exception rate (${exceptionRate}%) — review needed`);
    }
    return { status, trend, reasons: reasons.slice(0, 3), hasData: true };
  })();

  interface HealthOverride {
    id: string;
    accountId: string;
    overrideValue: string;
    reason: string;
    expiresAt: string;
    createdByUserId: string;
    createdByName?: string;
    createdAt: string;
    removedAt?: string;
    removedByUserId?: string;
    removedByName?: string;
    removalReason?: string;
  }

  const { data: healthOverrides = [] } = useQuery<HealthOverride[]>({
    queryKey: ["/api/accounts", id, "health-overrides"],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${id}/health-overrides`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch health overrides');
      return response.json();
    },
    enabled: isAuthenticated && !isNewCustomer,
  });

  const activeOverride = healthOverrides.find(o => o.isActive && new Date(o.expiresAt) > new Date());

  // Account Notes query
  const { data: accountNotes = [], isLoading: notesLoading, refetch: refetchNotes } = useQuery<AccountNote[]>({
    queryKey: ["/api/accounts", id, "notes", notesFilterType, notesFilterStartDate, notesFilterEndDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (notesFilterType) params.set("note_type", notesFilterType);
      if (notesFilterStartDate) params.set("start_date", notesFilterStartDate);
      if (notesFilterEndDate) params.set("end_date", notesFilterEndDate);
      const response = await fetch(`/api/accounts/${id}/notes?${params.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch notes');
      return response.json();
    },
    enabled: isAuthenticated && !isNewCustomer,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { noteType: string; content: string; noteDate: string; tripId?: string; zendeskId?: string; attachmentDocumentId?: string | null; attachmentFileName?: string | null }) => {
      return apiRequest("POST", `/api/accounts/${id}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", id, "documents"] });
      toast({ title: "Note saved successfully" });
      setNoteAddDialogOpen(false);
      setNoteForm({ noteType: "", content: "", noteDate: new Date().toISOString().split('T')[0], tripId: "", zendeskId: "" });
      setNoteAttachmentFile(null);
      setNoteAttachmentDocId(null);
      setNoteAttachmentFileName(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save note", description: error.message, variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async ({ noteId, reason, deleteAttachment }: { noteId: string; reason: string; deleteAttachment: boolean }) => {
      return apiRequest("DELETE", `/api/accounts/${id}/notes/${noteId}`, { reason, deleteAttachment });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "documents"] });
      if (data?.attachmentDeleteError) {
        toast({
          title: "Note deleted — attachment error",
          description: `The note was deleted, but the attached document could not be removed: ${data.attachmentDeleteError}`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Note deleted", description: "The note has been soft-deleted and logged." });
      }
      setNoteDeleteDialogOpen(false);
      setNoteToDelete(null);
      setNoteDeleteReason("");
      setNoteDeleteAlsoAttachment(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete note", description: error.message, variant: "destructive" });
    },
  });

  const editNoteMutation = useMutation({
    mutationFn: async ({ noteId, content, noteType, noteDate, reason }: { noteId: string; content: string; noteType: string; noteDate: string; reason: string }) => {
      return apiRequest("PATCH", `/api/accounts/${id}/notes/${noteId}`, { content, noteType, noteDate, reason }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "activity"] });
      toast({ title: "Note updated", description: "Your changes have been saved." });
      setNoteEditDialogOpen(false);
      setNoteToEdit(null);
      setNoteEditContent("");
      setNoteEditType("");
      setNoteEditDate("");
      setNoteEditReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update note", description: error.message, variant: "destructive" });
    },
  });

  const handleNoteAttachmentUpload = async (file: File) => {
    setNoteAttachmentUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uploadRes = await fetch("/api/documents/upload", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "x-owner-type": "account",
          "x-owner-id": id || "",
          "x-category": "note_attachment",
          "x-title": file.name,
          "x-filename": encodeURIComponent(file.name),
        },
        body: arrayBuffer,
        credentials: "include",
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      const { document: doc } = await uploadRes.json();
      setNoteAttachmentDocId(doc.id);
      setNoteAttachmentFileName(file.name);
      toast({ title: "Attachment uploaded" });
    } catch (err: any) {
      toast({ title: "Attachment upload failed", description: err.message, variant: "destructive" });
      setNoteAttachmentFile(null);
    } finally {
      setNoteAttachmentUploading(false);
    }
  };

  const handleSubmitNote = () => {
    if (!noteForm.noteType) {
      toast({ title: "Please select a Notes Type", variant: "destructive" });
      return;
    }
    if (!noteForm.content.trim()) {
      toast({ title: "Please enter note content", variant: "destructive" });
      return;
    }
    createNoteMutation.mutate({
      noteType: noteForm.noteType,
      content: noteForm.content.trim(),
      noteDate: noteForm.noteDate,
      tripId: noteForm.tripId || undefined,
      zendeskId: noteForm.zendeskId || undefined,
      attachmentDocumentId: noteAttachmentDocId,
      attachmentFileName: noteAttachmentFileName,
    });
  };

  const createOverrideMutation = useMutation({
    mutationFn: async (data: { overrideValue: string; reason: string; expiresAt: string }) => {
      return apiRequest("POST", `/api/accounts/${id}/health-override`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "health-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "health-explanation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "activity"] });
      toast({ title: "Health override created successfully" });
      setHealthOverrideDialogOpen(false);
      setOverrideValue("");
      setOverrideReason("");
      setOverrideExpiresAt("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create health override",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeOverrideMutation = useMutation({
    mutationFn: async ({ overrideId, reason }: { overrideId: string; reason: string }) => {
      return apiRequest("DELETE", `/api/health-overrides/${overrideId}`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "health-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "health-explanation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "activity"] });
      toast({ title: "Health override removed successfully" });
      setRemoveOverrideDialogOpen(false);
      setRemoveOverrideReason("");
      setRemoveOverrideTargetId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove health override",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Account Moves — paginated, filtered, sortable
  const [movesPage, setMovesPage]               = useState(1);
  const [movesStatusFilter, setMovesStatusFilter] = useState("");
  const [movesTypeFilter, setMovesTypeFilter]   = useState("");
  const [movesStartDate, setMovesStartDate]     = useState("");
  const [movesEndDate, setMovesEndDate]         = useState("");
  const [movesSortBy, setMovesSortBy]           = useState("tripDate");
  const [movesSortDir, setMovesSortDir]         = useState<"asc" | "desc">("desc");
  const MOVES_PAGE_LIMIT = 25;

  const { data: accountMovesData, isLoading: accountMovesLoading } = useQuery<{ trips: Trip[]; total: number; page: number; limit: number }>({
    queryKey: ["/api/corporate/customers", id, "trips", movesPage, movesStatusFilter, movesTypeFilter, movesStartDate, movesEndDate, movesSortBy, movesSortDir],
    queryFn: async () => {
      const params = new URLSearchParams({
        page:    String(movesPage),
        limit:   String(MOVES_PAGE_LIMIT),
        sortBy:  movesSortBy,
        sortDir: movesSortDir,
        ...(movesStatusFilter && { status: movesStatusFilter }),
        ...(movesTypeFilter   && { moveType: movesTypeFilter }),
        ...(movesStartDate    && { startDate: movesStartDate }),
        ...(movesEndDate      && { endDate: movesEndDate }),
      });
      const response = await fetch(`/api/corporate/customers/${id}/trips?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch moves');
      return response.json();
    },
    enabled: isAuthenticated && !isNewCustomer && activeTab === 'moves',
  });
  const accountMoves      = accountMovesData?.trips ?? [];
  const accountMovesTotal = accountMovesData?.total ?? 0;
  const movesTotalPages   = Math.max(1, Math.ceil(accountMovesTotal / MOVES_PAGE_LIMIT));

  const { data: accountDecisions = [], isLoading: decisionsLoading } = useQuery<AccountDecision[]>({
    queryKey: ["/api/accounts", id, "decisions"],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${id}/decisions`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch decisions');
      return response.json();
    },
    enabled: isAuthenticated && !isNewCustomer && activeTab === 'decisions',
  });

  const createDecisionMutation = useMutation({
    mutationFn: async (data: { decisionType: string; reason: string; expectedOutcome?: string; effectiveDate: string; reviewDate?: string }) => {
      return apiRequest("POST", `/api/accounts/${id}/decisions`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "decisions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "activity"] });
      toast({ title: "Decision logged successfully" });
      setDecisionDialogOpen(false);
      setDecisionType("");
      setDecisionReason("");
      setDecisionExpectedOutcome("");
      setDecisionEffectiveDate("");
      setDecisionReviewDate("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to log decision",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createAddendumMutation = useMutation({
    mutationFn: async (data: { decisionId: string; content: string }) => {
      return apiRequest("POST", `/api/decisions/${data.decisionId}/addendum`, { content: data.content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "decisions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "activity"] });
      toast({ title: "Addendum added successfully" });
      setAddendumDialogOpen(false);
      setAddendumDecisionId("");
      setAddendumContent("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add addendum",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateDecision = () => {
    if (!decisionType) {
      toast({ title: "Please select a decision type", variant: "destructive" });
      return;
    }
    if (!decisionReason.trim()) {
      toast({ title: "Please provide a reason", variant: "destructive" });
      return;
    }
    if (!decisionEffectiveDate) {
      toast({ title: "Please select an effective date", variant: "destructive" });
      return;
    }
    createDecisionMutation.mutate({
      decisionType,
      reason: decisionReason.trim(),
      expectedOutcome: decisionExpectedOutcome.trim() || undefined,
      effectiveDate: decisionEffectiveDate,
      reviewDate: decisionReviewDate || undefined,
    });
  };

  const handleAddAddendum = () => {
    if (!addendumContent.trim()) {
      toast({ title: "Please provide addendum content", variant: "destructive" });
      return;
    }
    createAddendumMutation.mutate({
      decisionId: addendumDecisionId,
      content: addendumContent.trim(),
    });
  };

  const toggleDecisionExpanded = (decisionId: string) => {
    setExpandedDecisions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(decisionId)) {
        newSet.delete(decisionId);
      } else {
        newSet.add(decisionId);
      }
      return newSet;
    });
  };

  const handleCreateOverride = () => {
    if (!overrideValue) {
      toast({ title: "Please select an override value", variant: "destructive" });
      return;
    }
    if (!overrideReason.trim()) {
      toast({ title: "Please provide a reason", variant: "destructive" });
      return;
    }
    if (!overrideExpiresAt) {
      toast({ title: "Please select an expiration date", variant: "destructive" });
      return;
    }
    const expiresAtDate = new Date(overrideExpiresAt + 'T23:59:59');
    if (expiresAtDate <= new Date()) {
      toast({ title: "Expiration date must be in the future", variant: "destructive" });
      return;
    }
    createOverrideMutation.mutate({ overrideValue, reason: overrideReason.trim(), expiresAt: overrideExpiresAt + 'T23:59:59' });
  };

  const adminRoles = ['super_user', 'super_admin', 'admin', 'corporate_admin', 'Admin'];
  const canManageOverrides = adminRoles.includes(user?.role || '');
  const canManageFlags = adminRoles.includes(user?.role || '');
  const isRootSuperAdmin = !!(user as any)?.isRootSuperAdmin;
  const canAddNotes = !!user;

  // Knowledge Base - uses types from @shared/schema
  // Any user with corporate access can view; any authenticated user can edit (follows health/activity patterns)

  // Knowledge Base query
  const { data: accountKnowledge, isLoading: knowledgeLoading } = useQuery<AccountKnowledge | null>({
    queryKey: ["/api/accounts", id, "knowledge"],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${id}/knowledge`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch knowledge');
      return response.json();
    },
    enabled: isAuthenticated && !isNewCustomer,
  });

  // Knowledge history query
  const { data: knowledgeHistory = [] } = useQuery<AccountKnowledgeHistory[]>({
    queryKey: ["/api/accounts", id, "knowledge", "history"],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${id}/knowledge/history`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch knowledge history');
      return response.json();
    },
    enabled: isAuthenticated && !isNewCustomer && showKnowledgeHistory,
  });

  // Knowledge Base update mutation
  const updateKnowledgeMutation = useMutation({
    mutationFn: async (data: { beforeServicing?: string; whatNotToDo?: string; knownLandmines?: string; preferredPractices?: string }) => {
      return apiRequest("PUT", `/api/accounts/${id}/knowledge`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "knowledge"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "knowledge", "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "activity"] });
      toast({ title: "Knowledge base updated successfully" });
      setKnowledgeEditMode(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update knowledge base",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Initialize knowledge form when data loads or entering edit mode
  useEffect(() => {
    if (accountKnowledge && knowledgeEditMode) {
      setKnowledgeBeforeServicing(accountKnowledge.beforeServicing || "");
      setKnowledgeWhatNotToDo(accountKnowledge.whatNotToDo || "");
      setKnowledgeKnownLandmines(accountKnowledge.knownLandmines || "");
      setKnowledgePreferredPractices(accountKnowledge.preferredPractices || "");
    }
  }, [accountKnowledge, knowledgeEditMode]);

  const handleSaveKnowledge = () => {
    updateKnowledgeMutation.mutate({
      beforeServicing: knowledgeBeforeServicing.trim() || undefined,
      whatNotToDo: knowledgeWhatNotToDo.trim() || undefined,
      knownLandmines: knowledgeKnownLandmines.trim() || undefined,
      preferredPractices: knowledgePreferredPractices.trim() || undefined,
    });
  };

  const handleCancelKnowledgeEdit = () => {
    setKnowledgeEditMode(false);
    // Reset to original values
    if (accountKnowledge) {
      setKnowledgeBeforeServicing(accountKnowledge.beforeServicing || "");
      setKnowledgeWhatNotToDo(accountKnowledge.whatNotToDo || "");
      setKnowledgeKnownLandmines(accountKnowledge.knownLandmines || "");
      setKnowledgePreferredPractices(accountKnowledge.preferredPractices || "");
    } else {
      setKnowledgeBeforeServicing("");
      setKnowledgeWhatNotToDo("");
      setKnowledgeKnownLandmines("");
      setKnowledgePreferredPractices("");
    }
  };

  // Account Readiness query
  const { data: accountReadiness, isLoading: isReadinessLoading } = useQuery<AccountReadiness>({
    queryKey: [`/api/accounts/${id}/readiness`],
    enabled: isAuthenticated && !isNewCustomer,
  });

  // Open Work aggregation
  const { data: openWork } = useQuery<{
    openClaims: number;
    pastDueInvoices: number;
    openTasks: number;
    nextRequiredTouchDate: string | null;
  }>({
    queryKey: ["/api/corporate/accounts", id, "open-work"],
    enabled: isAuthenticated && !isNewCustomer,
    refetchInterval: 30_000,
  });

  // Update Readiness mutation
  const updateReadinessMutation = useMutation({
    mutationFn: async (data: Record<string, boolean>) => {
      return apiRequest("PUT", `/api/accounts/${id}/readiness`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${id}/readiness`] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "activity"] });
      toast({ title: "Readiness checklist updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update readiness",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update Flags mutation
  const updateFlagsMutation = useMutation({
    mutationFn: async (flags: { isStrategicAccount?: boolean; isHighSensitivity?: boolean; isCarrierVisible?: boolean; requiresExecAttention?: boolean }) => {
      return apiRequest("PATCH", `/api/accounts/${id}/flags`, flags);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "activity"] });
      toast({ title: "Account flags updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update flags",
        description: error.message,
        variant: "destructive",
      });
    },
  });


  // AI Score query
  interface AIScoreData {
    customerId: string;
    score: number | null;
    tier: 'healthy' | 'watchlist' | 'at_risk' | 'collections_candidate' | null;
    explanation: string[];
    lastScoredAt: string | null;
    hasScore: boolean;
  }
  const { data: aiScoreData, isLoading: aiScoreLoading, refetch: refetchAIScore } = useQuery<AIScoreData>({
    queryKey: ["/api/customers", id, "ai-score"],
    enabled: isAuthenticated && !isNewCustomer && (user?.role === 'admin' || user?.role === 'finance' || user?.role === 'corporate'),
  });

  // Recalculate AI Score mutation
  const recalculateAIScoreMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/customers/\${id}/ai-score`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "ai-score"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", id] });
      toast({ title: "AI Score recalculated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to recalculate AI Score",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  // Log Touch mutation
  const logTouchMutation = useMutation({
    mutationFn: async (data: { activityType: string; notes: string | null }) => {
      return apiRequest("POST", `/api/corporate/customers/${id}/log-touch`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", id, "activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", id, "activity"] });
      toast({ title: "Touch logged successfully" });
      setLogTouchDialogOpen(false);
      setTouchType("");
      setTouchNotes("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to log touch",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogTouch = () => {
    if (!touchType) {
      toast({ title: "Please select a touch type", variant: "destructive" });
      return;
    }
    logTouchMutation.mutate({
      activityType: touchType,
      notes: touchNotes || null,
    });
  };

  // Form for create/update with proper schema validation
  const formSchema = isNewCustomer 
    ? createAccountSchema
    : updateCustomerSchema;

  type FormData = z.infer<typeof formSchema>;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: "",
      customerNumber: "",
      dealerId: "",
      nearestAirportCode: "",
      status: "Active",
      customerType: "",
      customerLegalName: "",
      customerGroup: "",
      customerAddress: "",
      customerCity: "",
      customerState: "",
      customerZip: "",
      timezone: "",
      implementationDate: "",
      cancellationDate: "",
      cancellationReason: "",
      productsRatePrice: "",
      arStatus: "",
      lastInvoiceDate: "",
      lastInvoicePdfUrl: "",
      customerLatitude: "",
      customerLongitude: "",
      network: "",
      potentialRisk: "",
      driverModel: "",
      program: "",
      region: "",
      shiftBillRate: "",
      customerWebsite: "",
      primaryContactName: "",
      primaryContactNumber: "",
      primaryContactCell: "",
      primaryContactEmail: "",
      billingContactName: "",
      billingContactNumber: "",
      billingContactEmail: "",
      health: "",
      healthTrend: "",
      parentAccountId: "",
      lastActivityDate: "",
      nextRequiredTouchDate: "",
      accountOwnerId: "",
    },
  });

  // Reset form when customer data loads.
  // After an auto-save, onSuccess increments suppressResetCountRef and calls
  // form.reset(currentValues) synchronously.  The subsequent query refetch still
  // updates `customer`, which would re-trigger this effect and call form.reset()
  // again — overwriting any edits the user made while the save was in flight.
  // The counter lets us skip exactly as many post-save resets as saves fired.
  useEffect(() => {
    if (customer) {
      if (suppressResetCountRef.current > 0) {
        suppressResetCountRef.current -= 1;
        return; // form was already reset inline in updateMutation.onSuccess
      }
      form.reset({
        customerName: customer.customerName || "",
        customerNumber: customer.customerNumber || "",
        dealerId: (customer as any).dealerId || "",
        nearestAirportCode: (customer as any).nearestAirportCode || "",
        status: customer.status || "Active",
        customerType: customer.customerType || "",
        customerLegalName: customer.customerLegalName || "",
        customerGroup: customer.customerGroup || "",
        customerAddress: customer.customerAddress || "",
        customerCity: customer.customerCity || "",
        customerState: customer.customerState || "",
        timezone: (customer as any).timezone || "",
        customerZip: customer.customerZip || "",
        implementationDate: customer.implementationDate ? parseFormDate(customer.implementationDate) : "",
        cancellationDate: customer.cancellationDate ? parseFormDate(customer.cancellationDate) : "",
        cancellationReason: customer.cancellationReason || "",
        productsRatePrice: customer.productsRatePrice || "",
        arStatus: customer.arStatus || "",
        lastInvoiceDate: customer.lastInvoiceDate ? parseFormDate(customer.lastInvoiceDate) : "",
        lastInvoicePdfUrl: customer.lastInvoicePdfUrl || "",
        customerLatitude: customer.customerLatitude?.toString() || "",
        customerLongitude: customer.customerLongitude?.toString() || "",
        network: customer.network || "",
        potentialRisk: customer.potentialRisk || "",
        driverModel: customer.driverModel || "",
        program: customer.program || "",
        region: (customer as any).region || "",
        shiftBillRate: (customer as any).shiftBillRate || "",
        customerWebsite: customer.customerWebsite || "",
        primaryContactName: customer.primaryContactName || "",
        primaryContactNumber: formatPhone(customer.primaryContactNumber) || "",
        primaryContactCell: formatPhone(customer.primaryContactCell) || "",
        primaryContactEmail: customer.primaryContactEmail || "",
        billingContactName: customer.billingContactName || "",
        billingContactNumber: formatPhone(customer.billingContactNumber) || "",
        billingContactEmail: customer.billingContactEmail || "",
        health: customer.health || "",
        healthTrend: customer.healthTrend || "",
        parentAccountId: customer.parentAccountId || "",
        lastActivityDate: customer.lastActivityDate ? parseFormDate(customer.lastActivityDate) : "",
        nextRequiredTouchDate: customer.nextRequiredTouchDate ? parseFormDate(customer.nextRequiredTouchDate) : "",
        accountOwnerId: customer.accountOwnerId || "",
      });
    }
  }, [customer]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch("/api/corporate/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Failed to create account" }));
        const err = new Error(body.message || "Failed to create account");
        (err as any).fieldErrors = body.fieldErrors;
        (err as any).status = res.status;
        throw err;
      }
      return res.json();
    },
    onSuccess: (newCustomer: Customer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers"] });
      toast({ title: "Account created successfully" });
      setLocation(`/customers/${newCustomer.id}`);
    },
    onError: (error: any) => {
      if (error.fieldErrors) {
        const fieldNames: string[] = [];
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          form.setError(field as any, { type: "server", message: message as string });
          fieldNames.push(field);
        }
        toast({ 
          title: "Please fix the required fields", 
          description: `${fieldNames.length} field(s) need attention`,
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Failed to create account", 
          description: error.message,
          variant: "destructive" 
        });
      }
    },
  });

  // ── Auto-save state ──────────────────────────────────────────────────────────
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable ref to the mutation so the auto-save effect does NOT list it as a
  // dependency.  React Query recreates the mutation object on every render;
  // including it in deps causes the effect to re-run on every render and
  // immediately cancel the pending debounce timer — which is why saves never fire.
  const updateMutationRef = useRef<typeof updateMutation>(null as any);

  // Counter that lets us skip the form.reset() that is triggered by the query
  // refetch after a successful save.  Without this, the refetch resets the form
  // → isDirty becomes false → the NEXT change is swallowed by the guard.
  const suppressResetCountRef = useRef(0);

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("PATCH", `/api/corporate/customers/${id}`, data);
    },
    onSuccess: () => {
      // Immediately reset the form to the current values so isDirty becomes false.
      // This must happen BEFORE the query invalidation refetch arrives; otherwise the
      // async refetch completes, customer data changes, and the useEffect([customer])
      // below calls form.reset() with server data — which also clears isDirty and
      // can clobber any edits the user made while the save was in flight.
      suppressResetCountRef.current += 1;
      form.reset(form.getValues());

      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers"] });
      // Toast suppressed for auto-save; feedback is shown via the save-state indicator.
      // Manual saves (new account creation) still show toast via createMutation.
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update account", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Keep the ref in sync on every render (after the mutation is defined).
  updateMutationRef.current = updateMutation;

  // ── Auto-save (existing accounts only) ───────────────────────────────────────
  const buildTransformedData = useCallback((data: FormData) => ({
    ...data,
    primaryContactNumber: cleanPhone(data.primaryContactNumber as string),
    primaryContactCell:   cleanPhone(data.primaryContactCell   as string),
    billingContactNumber: cleanPhone(data.billingContactNumber as string),
    implementationDate:   data.implementationDate  ? new Date(data.implementationDate)  : undefined,
    cancellationDate:     data.cancellationDate    ? new Date(data.cancellationDate)    : undefined,
    lastInvoiceDate:      data.lastInvoiceDate     ? new Date(data.lastInvoiceDate)     : undefined,
    lastActivityDate:     data.lastActivityDate    ? new Date(data.lastActivityDate)    : undefined,
    nextRequiredTouchDate:data.nextRequiredTouchDate ? new Date(data.nextRequiredTouchDate) : undefined,
    customerLatitude:     data.customerLatitude    ? parseFloat(data.customerLatitude  as string) : null,
    customerLongitude:    data.customerLongitude   ? parseFloat(data.customerLongitude as string) : null,
    shiftBillRate:        (data as any).shiftBillRate !== "" && (data as any).shiftBillRate != null
                            ? parseFloat((data as any).shiftBillRate as string)
                            : null,
    parentAccountId:      data.parentAccountId || null,
    accountOwnerId:       data.accountOwnerId  || null,
    network: (data as any).network === "__none__" ? null : (data as any).network || null,
  }), []);

  // Shared immediate-save handler for non-text fields: selects, dropdowns, dates, toggles.
  // Cancels any pending debounce timer and fires the save right away without the 1500ms wait.
  // Text fields continue to trigger saves via the form.watch() subscription below.
  const triggerImmediateSave = useCallback(async () => {
    if (isNewCustomer || !id) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const valid = await form.trigger();
    if (!valid) { setAutoSaveState("error"); return; }
    setAutoSaveState("saving");
    try {
      await updateMutationRef.current.mutateAsync(buildTransformedData(form.getValues()));
      setAutoSaveState("saved");
      setTimeout(() => setAutoSaveState("idle"), 2500);
    } catch {
      setAutoSaveState("error");
    }
  }, [isNewCustomer, id, form, buildTransformedData]);

  useEffect(() => {
    if (isNewCustomer) return;
    const subscription = form.watch(() => {
      // isDirty is false immediately after form.reset() (triggered by query refetch
      // after a successful save). This prevents re-triggering auto-save after save.
      if (!form.formState.isDirty) return;

      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      setAutoSaveState("idle");

      autoSaveTimerRef.current = setTimeout(async () => {
        if (!form.formState.isDirty) return; // double-check before firing
        const valid = await form.trigger();
        if (!valid) {
          // Surface validation errors instead of silently discarding the change.
          setAutoSaveState("error");
          return;
        }

        setAutoSaveState("saving");
        try {
          const values = form.getValues();
          // Use the stable ref so this effect does NOT need updateMutation in its
          // dependency array.  Including a React Query mutation in deps causes the
          // effect to re-run (and cancel the pending timer) on every render.
          await updateMutationRef.current.mutateAsync(buildTransformedData(values));
          setAutoSaveState("saved");
          setTimeout(() => setAutoSaveState("idle"), 2500);
        } catch {
          setAutoSaveState("error");
        }
      }, 1500);
    });
    return () => {
      subscription.unsubscribe();
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  // updateMutation deliberately omitted — accessed via updateMutationRef to prevent
  // the effect from re-running (and cancelling the debounce) on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, isNewCustomer, buildTransformedData]);

  const onSubmit = (data: FormData) => {
    // Convert string inputs to proper types for backend
    const transformedData = {
      ...data,
      primaryContactNumber: cleanPhone(data.primaryContactNumber as string),
      primaryContactCell: cleanPhone(data.primaryContactCell as string),
      billingContactNumber: cleanPhone(data.billingContactNumber as string),
      implementationDate: data.implementationDate ? new Date(data.implementationDate) : undefined,
      cancellationDate: data.cancellationDate ? new Date(data.cancellationDate) : undefined,
      lastInvoiceDate: data.lastInvoiceDate ? new Date(data.lastInvoiceDate) : undefined,
      lastActivityDate: data.lastActivityDate ? new Date(data.lastActivityDate) : undefined,
      nextRequiredTouchDate: data.nextRequiredTouchDate ? new Date(data.nextRequiredTouchDate) : undefined,
      customerLatitude: data.customerLatitude ? parseFloat(data.customerLatitude as string) : undefined,
      customerLongitude: data.customerLongitude ? parseFloat(data.customerLongitude as string) : undefined,
      parentAccountId: data.parentAccountId || null,
      accountOwnerId: data.accountOwnerId || null,
      network: (data as any).network === "__none__" ? null : (data as any).network || null,
    };

    if (isNewCustomer) {
      createMutation.mutate(transformedData);
    } else {
      updateMutation.mutate(transformedData);
    }
  };

  if (isLoading && !isNewCustomer) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  const displayData = customer || {};
  const isPending = createMutation.isPending || updateMutation.isPending;

  const customerExportColumns: ExcelColumn[] = [
    { header: "Account Name", key: "customerName", width: 25 },
    { header: "Account Number", key: "customerNumber", width: 15 },
    { header: "Status", key: "status", width: 12 },
    { header: "Account Type", key: "customerType", width: 15 },
    { header: "Driver Model", key: "driverModel", width: 22 },
    { header: "Program", key: "program", width: 18 },
    { header: "Region", key: "region", width: 14 },
    { header: "Shift Bill Rate", key: "shiftBillRate", width: 16 },
    { header: "Legal Name", key: "customerLegalName", width: 25 },
    { header: "Group", key: "customerGroup", width: 15 },
    { header: "Address", key: "customerAddress", width: 30 },
    { header: "City", key: "customerCity", width: 15 },
    { header: "State", key: "customerState", width: 10 },
    { header: "Zip", key: "customerZip", width: 10 },
    { header: "Launch Date", key: "implementationDate", width: 18 },
    { header: "A/R Status", key: "arStatus", width: 12 },
    { header: "Primary Contact", key: "primaryContactName", width: 20 },
    { header: "Primary Email", key: "primaryContactEmail", width: 25 },
    { header: "Primary Phone", key: "primaryContactPhone", width: 15 },
  ];

  const customerExportData = customer ? [{
    customerName: customer.customerName || "",
    customerNumber: customer.customerNumber || "",
    status: customer.status || "",
    customerType: customer.customerType || "",
    driverModel: DRIVER_MODEL_OPTIONS.find(o => o.value === customer.driverModel)?.label || customer.driverModel || "",
    program: (customer as any).program || "",
    region: (customer as any).region || "",
    shiftBillRate: (customer as any).shiftBillRate ? `$${parseFloat((customer as any).shiftBillRate).toFixed(2)}` : "",
    customerLegalName: customer.customerLegalName || "",
    customerGroup: customer.customerGroup || "",
    customerAddress: customer.customerAddress || "",
    customerCity: customer.customerCity || "",
    customerState: customer.customerState || "",
    customerZip: customer.customerZip || "",
    implementationDate: formatDate(customer.implementationDate),
    arStatus: customer.arStatus || "",
    primaryContactName: customer.primaryContactName || "",
    primaryContactEmail: customer.primaryContactEmail || "",
    primaryContactPhone: customer.primaryContactPhone || "",
  }] : [];

  const accountWorkspaceTabs = [
    { value: "overview", label: "Overview", hidden: isNewCustomer },
    { value: "company-details", label: "Company Details" },
    { value: "activity", label: "Activity", hidden: isNewCustomer },
    { value: "performance", label: "Account Performance", hidden: isNewCustomer },
    { value: "documents", label: "Documents", hidden: isNewCustomer },
    { value: "sla-services", label: "SLA & Services", hidden: isNewCustomer },
    { value: "claims", label: "Claims", hidden: isNewCustomer },
    { value: "decisions", label: "Decisions", hidden: isNewCustomer },
    { value: "notes", label: "Notes", hidden: isNewCustomer, badge: isNewCustomer ? 0 : accountNotes.length },
    { value: "statements", label: "Statements", hidden: isNewCustomer },
    { value: "dealership", label: "Dealership", hidden: isNewCustomer || customer?.customerType !== "Franchise Dealer" },
    { value: "drivers", label: "Drivers", hidden: isNewCustomer },
    { value: "scheduling", label: "Scheduling", hidden: isNewCustomer },
    { value: "moves", label: "Moves", hidden: isNewCustomer },
    { value: "analytics", label: "Analytics", hidden: isNewCustomer },
    { value: "move-intelligence", label: "Move Intelligence", hidden: isNewCustomer },
    { value: "products", label: "Products", hidden: isNewCustomer },
    { value: "services-billing", label: "Services & Billing", hidden: isNewCustomer },
    { value: "group-roster", label: "Group Roster", hidden: isNewCustomer || !isParentAccount },
    { value: "contacts", label: "Contacts", hidden: isNewCustomer },
    { value: "departments", label: "Departments", hidden: isNewCustomer },
  ];

  return (
    <div className="p-6 space-y-6">

      {/* ── Sticky identity header + workspace nav ── */}
      <div className="sticky top-0 z-50 bg-background -mx-6 px-6 border-b border-border">
        <div className="flex items-center justify-between gap-3 py-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.history.back()}
              data-testid="button-back-to-customers-sticky"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold truncate" data-testid="text-account-name-sticky">
                  {isNewCustomer ? "New Account" : displayData.customerName || "Account Details"}
                </h1>
                {!isNewCustomer && customer?.customerNumber && (
                  <span className="text-xs font-mono text-muted-foreground" data-testid="text-account-number-sticky">
                    #{customer.customerNumber}
                  </span>
                )}
                {!isNewCustomer && customer?.status && (
                  <StatusBadge
                    status={customer.status}
                    data-testid="badge-account-status-sticky"
                  />
                )}
                {!isNewCustomer && customer?.health && (
                  <Badge
                    data-testid="badge-account-health-sticky"
                    className={
                      customer.health === "green" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" :
                      customer.health === "yellow" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                      customer.health === "red" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                      "bg-muted text-muted-foreground"
                    }
                  >
                    <Heart className="h-3 w-3 mr-1" />
                    {customer.health === "green" ? "Healthy" : customer.health === "yellow" ? "Watch" : customer.health === "red" ? "At Risk" : customer.health}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          {!isNewCustomer && customer && (
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => handleTabChange("company-details")} data-testid="button-edit-account-sticky">
                <Edit className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
              <ExcelDownloadButton
                data={customerExportData}
                columns={customerExportColumns}
                filename={`Account_${customer.customerName?.replace(/\s+/g, "_") || "Details"}`}
                label="Export"
              />
            </div>
          )}
        </div>
        <RecordWorkspaceTabs
          tabs={accountWorkspaceTabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      </div>

      {/* ── Enhanced Record Header ───────────────────────────────────────────── */}
      <div className="border border-border rounded-md p-4 bg-card space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* LEFT: Back button + account identity */}
          <div className="flex items-start gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.history.back()}
              data-testid="button-back-to-customers"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold" data-testid="text-account-name">
                  {isNewCustomer ? "New Account" : displayData.customerName || "Account Details"}
                </h1>
                {!isNewCustomer && customer?.customerNumber && (
                  <span className="text-sm font-mono text-muted-foreground" data-testid="text-account-number">
                    #{customer.customerNumber}
                  </span>
                )}
              </div>
              {!isNewCustomer && customer && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {customer.customerType && (
                    <Badge variant="outline" className="text-xs" data-testid="badge-account-type">
                      {customer.customerType}
                    </Badge>
                  )}
                  {customer.region && (
                    <Badge variant="outline" className="text-xs" data-testid="badge-region">
                      <MapPin className="h-3 w-3 mr-1" />
                      {customer.region}
                    </Badge>
                  )}
                  {customer.program && (
                    <Badge variant="outline" className="text-xs" data-testid="badge-program">
                      {customer.program}
                    </Badge>
                  )}
                  {customer.driverModel && (
                    <Badge variant="outline" className="text-xs" data-testid="badge-driver-model-header">
                      <Car className="h-3 w-3 mr-1" />
                      {DRIVER_MODEL_OPTIONS.find(o => o.value === customer.driverModel)?.label || "—"}
                    </Badge>
                  )}
                  <button
                    type="button"
                    onClick={() => handleTabChange("drivers")}
                    className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-0.5 text-xs font-medium text-foreground hover-elevate focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    data-testid="badge-assigned-driver-count"
                    aria-label={`${assignedDriversHeader.length} assigned driver${assignedDriversHeader.length !== 1 ? "s" : ""} — click to view`}
                  >
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span>{assignedDriversHeader.length} Driver{assignedDriversHeader.length !== 1 ? "s" : ""}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Status + Health + Owner + Action bar */}
          {!isNewCustomer && customer && (
            <div className="flex flex-col items-end gap-2">
              {/* Status · Health · Owner row */}
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <StatusBadge
                  status={customer.status}
                  data-testid="badge-account-status"
                />
                {customer.health && (
                  <Badge
                    data-testid="badge-account-health"
                    className={
                      customer.health === "green" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" :
                      customer.health === "yellow" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                      customer.health === "red" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                      "bg-muted text-muted-foreground"
                    }
                  >
                    <Heart className="h-3 w-3 mr-1" />
                    {customer.health === "green" ? "Healthy" : customer.health === "yellow" ? "Watch" : customer.health === "red" ? "At Risk" : customer.health}
                  </Badge>
                )}
                {customer.accountOwnerId && users.length > 0 && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1" data-testid="text-account-owner">
                    <UserIcon className="h-3.5 w-3.5" />
                    {[
                      users.find(u => u.id === customer.accountOwnerId)?.firstName,
                      users.find(u => u.id === customer.accountOwnerId)?.lastName,
                    ].filter(Boolean).join(" ") || "Unassigned"}
                  </span>
                )}
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTabChange("documents")}
                  data-testid="button-documents-detail"
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Documents
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTabChange("company-details")}
                  data-testid="button-edit-account"
                >
                  <Edit className="h-3.5 w-3.5 mr-1.5" />
                  Edit Account
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLogTouchDialogOpen(true)}
                  data-testid="button-log-activity"
                >
                  <Activity className="h-3.5 w-3.5 mr-1.5" />
                  Log Activity
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setWeeklyReportOpen(true)}
                  data-testid="button-weekly-report"
                >
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                  Weekly Report
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLocation(`/work-plan?category=tasks`)}
                  data-testid="button-create-task"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create Task
                </Button>
                <ExcelDownloadButton
                  data={customerExportData}
                  columns={customerExportColumns}
                  filename={`Account_${customer.customerName?.replace(/\s+/g, "_") || "Details"}`}
                  label="Export"
                />
                {isRootSuperAdmin && !(customer as any).mergedIntoId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMergeDialogOpen(true)}
                    data-testid="button-merge-account"
                    className="text-orange-600 border-orange-300"
                  >
                    <GitMerge className="h-3.5 w-3.5 mr-1.5" />
                    Merge
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Merged record banner */}
      {!isNewCustomer && customer && (customer as any).mergedIntoId && (
        <div className="flex items-center gap-2 rounded-md border border-orange-400/40 bg-orange-50 dark:bg-orange-950/20 px-4 py-2.5 text-sm text-orange-700 dark:text-orange-400" data-testid="banner-account-merged">
          <GitMerge className="h-4 w-4 shrink-0" />
          <span>This account record has been <strong>merged</strong> into another record and is retired. All linked records have been moved to the primary account.</span>
        </div>
      )}

      {/* ── Open Work Panel ──────────────────────────────────────────────────── */}
      {!isNewCustomer && customer && (
        <Card data-testid="card-open-work">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Open Work
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!openWork || (openWork.openClaims === 0 && openWork.pastDueInvoices === 0 && openWork.openTasks === 0 && !openWork.nextRequiredTouchDate)) ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-open-work">
                No open work for this account.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Open Claims */}
                <a
                  href={`/safety?customerId=${id}&status=active`}
                  className="flex flex-col gap-1 p-3 rounded-md bg-muted/50 hover-elevate transition-all"
                  data-testid="link-open-claims"
                >
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Open Claims
                  </span>
                  <span className={`text-2xl font-bold ${openWork.openClaims > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                    {openWork.openClaims}
                  </span>
                  <span className="text-xs text-muted-foreground">View claims →</span>
                </a>

                {/* Open Tasks */}
                <a
                  href={`/work-plan?category=tasks`}
                  className="flex flex-col gap-1 p-3 rounded-md bg-muted/50 hover-elevate transition-all"
                  data-testid="link-open-tasks"
                >
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Open Tasks
                  </span>
                  <span className={`text-2xl font-bold ${openWork.openTasks > 0 ? "text-violet-600 dark:text-violet-400" : "text-foreground"}`}>
                    {openWork.openTasks}
                  </span>
                  <span className="text-xs text-muted-foreground">View tasks →</span>
                </a>

                {/* Past Due Invoices */}
                <a
                  href={`/invoices?customerId=${id}&status=overdue`}
                  className="flex flex-col gap-1 p-3 rounded-md bg-muted/50 hover-elevate transition-all"
                  data-testid="link-past-due-invoices"
                >
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    Past Due Invoices
                  </span>
                  <span className={`text-2xl font-bold ${openWork.pastDueInvoices > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                    {openWork.pastDueInvoices}
                  </span>
                  <span className="text-xs text-muted-foreground">View invoices →</span>
                </a>

                {/* Next Required Touch */}
                <button
                  onClick={() => setLogTouchDialogOpen(true)}
                  className="flex flex-col gap-1 p-3 rounded-md bg-muted/50 hover-elevate transition-all text-left"
                  data-testid="button-next-touch"
                >
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Next Required Touch
                  </span>
                  <span className={`text-base font-semibold leading-tight ${
                    openWork?.nextRequiredTouchDate && new Date(openWork.nextRequiredTouchDate) < new Date()
                      ? "text-red-600 dark:text-red-400"
                      : openWork?.nextRequiredTouchDate && new Date(openWork.nextRequiredTouchDate).toDateString() === new Date().toDateString()
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-foreground"
                  }`}>
                    {!openWork?.nextRequiredTouchDate
                      ? "Not Set"
                      : new Date(openWork.nextRequiredTouchDate).toDateString() === new Date().toDateString()
                      ? "Today"
                      : new Date(openWork.nextRequiredTouchDate) < new Date()
                      ? `Overdue`
                      : formatDate(openWork.nextRequiredTouchDate)
                    }
                  </span>
                  {openWork?.nextRequiredTouchDate && new Date(openWork.nextRequiredTouchDate) < new Date() && (
                    <span className="text-xs text-red-500 dark:text-red-400">{formatDate(openWork.nextRequiredTouchDate)}</span>
                  )}
                  <span className="text-xs text-muted-foreground mt-0.5">Log activity →</span>
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ LAYER 3: Entity Workspace ═══ */}
      <Tabs value={activeTab} onValueChange={handleTabChange} data-testid="tabs-customer-detail">
        <TabsList className="hidden">
          {!isNewCustomer && (
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Heart className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
          )}
          <TabsTrigger value="company-details" data-testid="tab-company-details">
            <Building2 className="h-4 w-4 mr-2" />
            Company Details
          </TabsTrigger>
          {!isNewCustomer && (
            <TabsTrigger value="activity" data-testid="tab-activity">
              <Activity className="h-4 w-4 mr-2" />
              Activity
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="performance" data-testid="tab-performance">
              <TrendingUp className="h-4 w-4 mr-2" />
              Account Performance
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FolderOpen className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="sla-services" data-testid="tab-sla-services">
              <Settings className="h-4 w-4 mr-2" />
              SLA & Services
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="claims" data-testid="tab-claims">
              <ShieldAlert className="h-4 w-4 mr-2" />
              Claims
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="decisions" data-testid="tab-decisions">
              <Gavel className="h-4 w-4 mr-2" />
              Decisions
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="notes" data-testid="tab-notes">
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              Notes
              {accountNotes.length > 0 && (
                <Badge className="ml-1.5 text-xs" variant="secondary">{accountNotes.length}</Badge>
              )}
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="statements" data-testid="tab-statements">
              <FileText className="h-4 w-4 mr-2" />
              Statements
            </TabsTrigger>
          )}
          {!isNewCustomer && customer?.customerType === "Franchise Dealer" && (
            <TabsTrigger value="dealership" data-testid="tab-dealership">
              <Car className="h-4 w-4 mr-2" />
              Dealership
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="drivers" data-testid="tab-drivers">
              <Users className="h-4 w-4 mr-2" />
              Drivers
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="scheduling" data-testid="tab-scheduling">
              <Clock className="h-4 w-4 mr-2" />
              Scheduling
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="holidays" data-testid="tab-holidays">
              <CalendarDays className="h-4 w-4 mr-2" />
              Holidays
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="moves" data-testid="tab-moves">
              <Truck className="h-4 w-4 mr-2" />
              Moves
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="analytics" data-testid="tab-analytics">
              <TrendingUp className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="products" data-testid="tab-products">
              <Package className="h-4 w-4 mr-2" />
              Products
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="services-billing" data-testid="tab-services-billing">
              <Briefcase className="h-4 w-4 mr-2" />
              Services &amp; Billing
            </TabsTrigger>
          )}
          {!isNewCustomer && isParentAccount && (
            <TabsTrigger value="group-roster" data-testid="tab-group-roster">
              <Users className="h-4 w-4 mr-2" />
              Group Roster
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="contacts" data-testid="tab-contacts">
              <BookUser className="h-4 w-4 mr-2" />
              Contacts
            </TabsTrigger>
          )}
          {!isNewCustomer && (
            <TabsTrigger value="departments" data-testid="tab-departments">
              <Building2 className="h-4 w-4 mr-2" />
              Departments
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="company-details">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Company Details Section */}
          <Card>
            <CardHeader>
              <CardTitle>Company Details</CardTitle>
              <CardDescription>Basic customer and company information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Account Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter customer name" data-testid="input-customer-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customerNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account #</FormLabel>
                      <FormControl>
                        {isNewCustomer ? (
                          <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground" data-testid="text-account-number-placeholder">
                            Assigned on Save
                          </div>
                        ) : (
                          <Input 
                            {...field} 
                            readOnly 
                            className="bg-muted cursor-not-allowed" 
                            data-testid="input-customer-number" 
                          />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dealerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dealer ID</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Enter dealer ID"
                          data-testid="input-dealer-id"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nearestAirportCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nearest Airport Code</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="e.g. DFW"
                          maxLength={10}
                          className="uppercase"
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          data-testid="input-nearest-airport-code"
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Used to auto-generate the Campaign code on recruiting requests (e.g. DFW + 8613 → DFW8613).</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value ?? ""} onValueChange={(val) => { field.onChange(val); triggerImmediateSave(); }}>
                        <FormControl>
                          <SelectTrigger data-testid="select-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CUSTOMER_STATUS_VALUES.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="health"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Health</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          {field.value && (
                            <span 
                              className={`w-4 h-4 rounded-full flex-shrink-0 ${
                                field.value === 'green' ? 'bg-green-500' :
                                field.value === 'yellow' ? 'bg-yellow-500' :
                                field.value === 'red' ? 'bg-red-500' : ''
                              }`}
                              data-testid="health-indicator"
                            />
                          )}
                          <select
                            {...field}
                            onChange={(e) => { field.onChange(e); triggerImmediateSave(); }}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            data-testid="select-health"
                          >
                            <option value="">Select health</option>
                            <option value="green">Healthy</option>
                            <option value="yellow">Watch</option>
                            <option value="red">At Risk</option>
                          </select>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="healthTrend"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Health Trend</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          onChange={(e) => { field.onChange(e); triggerImmediateSave(); }}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          data-testid="select-health-trend"
                        >
                          <option value="">Select trend</option>
                          <option value="improving">Improving</option>
                          <option value="stable">Flat</option>
                          <option value="declining">Declining</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="parentAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parent Account</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          onChange={(e) => { field.onChange(e); triggerImmediateSave(); }}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          data-testid="select-parent-account"
                        >
                          <option value="">None (Top-level account)</option>
                          {allCustomers
                            .filter(c => c.id !== id)
                            .map(c => (
                              <option key={c.id} value={c.id}>{c.customerName}</option>
                            ))
                          }
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accountOwnerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Owner</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          onChange={(e) => { field.onChange(e); triggerImmediateSave(); }}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          data-testid="select-account-owner"
                        >
                          <option value="">Unassigned</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>
                              {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lastActivityDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Activity Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          onChange={(e) => { field.onChange(e); triggerImmediateSave(); }}
                          data-testid="input-last-activity-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nextRequiredTouchDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Next Required Touch</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          onChange={(e) => { field.onChange(e); triggerImmediateSave(); }}
                          data-testid="input-next-required-touch"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customerType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Type</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          onChange={(e) => { field.onChange(e); triggerImmediateSave(); }}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          data-testid="select-customer-type"
                        >
                          <option value="">Select type</option>
                          <option value="Association">Association</option>
                          <option value="Auction">Auction</option>
                          <option value="Body Shop">Body Shop</option>
                          <option value="Bus">Bus</option>
                          <option value="Car Sharing">Car Sharing</option>
                          <option value="Dealership">Dealership</option>
                          <option value="Fleet Company">Fleet Company</option>
                          <option value="Franchise Dealer">Franchise Dealer</option>
                          <option value="Group">Group</option>
                          <option value="Heavy Truck">Heavy Truck</option>
                          <option value="Lender">Lender</option>
                          <option value="Logistics">Logistics</option>
                          <option value="OEM / Manufacturer">OEM / Manufacturer</option>
                          <option value="Other">Other</option>
                          <option value="Other Delivery">Other Delivery</option>
                          <option value="Partner">Partner</option>
                          <option value="Parts Delivery">Parts Delivery</option>
                          <option value="Port Yard">Port Yard</option>
                          <option value="Rail Yard">Rail Yard</option>
                          <option value="Remarketing">Remarketing</option>
                          <option value="Rental">Rental</option>
                          <option value="Service Center">Service Center</option>
                          <option value="Transport">Transport</option>
                          <option value="Vendor">Vendor</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="driverModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Driver Model (Customer)</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          onChange={(e) => { field.onChange(e); triggerImmediateSave(); }}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          data-testid="select-driver-model"
                        >
                          <option value="">— Select Model —</option>
                          {DRIVER_MODEL_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* ── DriverShift Weekly Report Recipients ─────────────────── */}
                {(form.watch("driverModel") === "drivershift" || customer?.driverModel === "drivershift") && id && !isNewCustomer && (
                  <div className="lg:col-span-3 pt-2">
                    <DriverShiftRecipientsField customerId={id} />
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="program"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Program</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          onChange={(e) => { field.onChange(e); triggerImmediateSave(); }}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          data-testid="select-program"
                        >
                          <option value="">— Select Program —</option>
                          {PROGRAM_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Region</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          onChange={(e) => { field.onChange(e); triggerImmediateSave(); }}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          data-testid="select-region"
                        >
                          <option value="">— Select Region —</option>
                          {REGION_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Billing Rates — read-only derived from account_service_rates (DH-002073).
                    Manage rates in Services & Billing tab. The legacy shiftBillRate field
                    remains in form state (hidden) so existing values are not cleared on save. */}
                <input type="hidden" {...form.register("shiftBillRate")} />
                {(() => {
                  // Group active rate rows by product name
                  const ratesByProduct = new Map<string, any[]>();
                  for (const r of accountBillingRates) {
                    if (!r.rate_id) continue;
                    if (!ratesByProduct.has(r.product_name)) ratesByProduct.set(r.product_name, []);
                    ratesByProduct.get(r.product_name)!.push(r);
                  }
                  const legacyRate = (customer as any)?.shiftBillRate;
                  const hasLegacyOnly = ratesByProduct.size === 0 && legacyRate && parseFloat(legacyRate) > 0;
                  return (
                    <div className="space-y-1.5" data-testid="billing-rates-summary">
                      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Account Billing Rates
                      </label>
                      <div className="min-h-[40px] rounded-md border border-input bg-muted/30 px-3 py-2 text-sm" data-testid="billing-rates-display">
                        {ratesByProduct.size > 0 ? (
                          <div className="space-y-2">
                            {[...ratesByProduct.entries()].map(([productName, rates]) => (
                              <div key={productName}>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{productName}</p>
                                {rates.map((r: any) => (
                                  <div key={r.rate_id} className="flex items-center gap-2 text-xs">
                                    <span className="font-medium">{r.position_name || "Standard"}</span>
                                    <span className="font-mono text-foreground">
                                      ${parseFloat(r.bill_rate || "0").toFixed(2)}/{r.billing_unit || "hr"}
                                    </span>
                                    {r.rate_type && r.rate_type !== "regular" && (
                                      <span className="text-muted-foreground capitalize">({r.rate_type})</span>
                                    )}
                                    {!r.rate_active && <span className="text-muted-foreground">(inactive)</span>}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        ) : hasLegacyOnly ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground">Shift Bill Rate (legacy):</span>
                              <span className="font-mono font-semibold">${parseFloat(legacyRate).toFixed(2)}/hr</span>
                            </div>
                            <span className="text-amber-600 text-[10px] font-medium">Not yet migrated to Services & Billing</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">No rates configured.</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Rates are managed in the{" "}
                        <button
                          type="button"
                          className="underline text-primary font-medium hover:opacity-80"
                          onClick={() => handleTabChange("services-billing")}
                        >
                          Services &amp; Billing
                        </button>{" "}
                        tab. Use the{" "}
                        <Link href="/accounts/billing-rates" className="underline text-primary font-medium hover:opacity-80">
                          centralized billing-rate view
                        </Link>{" "}
                        to manage rates across all accounts.
                      </p>
                    </div>
                  );
                })()}

                <FormField
                  control={form.control}
                  name="customerLegalName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Legal Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Legal business name" data-testid="input-customer-legal-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customerGroup"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Group</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Enterprise, SMB" data-testid="input-customer-group" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customerWebsite"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Website</FormLabel>
                      <FormControl>
                        <Input {...field} type="url" placeholder="https://example.com" data-testid="input-customer-website" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Address Section */}
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold mb-4">Address Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="customerAddress"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2 lg:col-span-3">
                        <FormLabel>Account Address</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Street address" data-testid="input-customer-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="customerCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account City</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="City" data-testid="input-customer-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="customerState"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account State</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="State" data-testid="input-customer-state" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Timezone</FormLabel>
                        <Select onValueChange={(val) => { field.onChange(val); triggerImmediateSave(); }} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-timezone">
                              <SelectValue placeholder="Select timezone" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="America/New_York">Eastern (America/New_York)</SelectItem>
                            <SelectItem value="America/Chicago">Central (America/Chicago)</SelectItem>
                            <SelectItem value="America/Denver">Mountain (America/Denver)</SelectItem>
                            <SelectItem value="America/Phoenix">Arizona (America/Phoenix)</SelectItem>
                            <SelectItem value="America/Los_Angeles">Pacific (America/Los_Angeles)</SelectItem>
                            <SelectItem value="America/Anchorage">Alaska (America/Anchorage)</SelectItem>
                            <SelectItem value="Pacific/Honolulu">Hawaii (Pacific/Honolulu)</SelectItem>
                            <SelectItem value="America/Detroit">Michigan (America/Detroit)</SelectItem>
                            <SelectItem value="America/Indiana/Indianapolis">Indiana (America/Indiana/Indianapolis)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="customerZip"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Zip</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Zip code" data-testid="input-customer-zip" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="customerLatitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Latitude</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.0000001" placeholder="e.g., 40.7128" data-testid="input-customer-latitude" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="customerLongitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Longitude</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.0000001" placeholder="e.g., -74.0060" data-testid="input-customer-longitude" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Dates & Timeline Section */}
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold mb-4">Timeline & Dates</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="implementationDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Launch Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" onChange={(e) => { field.onChange(e); triggerImmediateSave(); }} data-testid="input-implementation-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cancellationDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cancellation Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" onChange={(e) => { field.onChange(e); triggerImmediateSave(); }} data-testid="input-cancellation-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cancellationReason"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2 lg:col-span-3">
                        <FormLabel>Cancellation Reason</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Enter reason for cancellation" rows={2} data-testid="input-cancellation-reason" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Financial Information Section */}
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold mb-4">Financial Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="productsRatePrice"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2 lg:col-span-3">
                        <FormLabel>Products, Rate, Price</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Enter product details, rates, and pricing" rows={3} data-testid="input-products-rate-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="arStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>A/R Status</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., Current, 30 Days Past Due" data-testid="input-ar-status" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lastInvoiceDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Invoice Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" onChange={(e) => { field.onChange(e); triggerImmediateSave(); }} data-testid="input-last-invoice-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lastInvoicePdfUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Invoice (PDF URL)</FormLabel>
                        <FormControl>
                          <Input {...field} type="url" placeholder="PDF URL" data-testid="input-last-invoice-pdf-url" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Operations Section */}
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold mb-4">Operations</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="network"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Network</FormLabel>
                        <Select onValueChange={(val) => { field.onChange(val); triggerImmediateSave(); }} value={field.value || "__none__"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-network">
                              <SelectValue placeholder="Select network" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">— None —</SelectItem>
                            {NETWORK_VALUES.map((n) => (
                              <SelectItem key={n} value={n}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="potentialRisk"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Potential Risk</FormLabel>
                        <FormControl>
                          <select
                            {...field}
                            onChange={(e) => { field.onChange(e); triggerImmediateSave(); }}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            data-testid="select-potential-risk"
                          >
                            <option value="">Select risk level</option>
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Primary Contact Section */}
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold mb-4">Primary Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="primaryContactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required={isNewCustomer}>Primary Contact Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Contact name" data-testid="input-primary-contact-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="primaryContactNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required={isNewCustomer}>Primary Contact Number</FormLabel>
                        <FormControl>
                          <PhoneInput {...field} data-testid="input-primary-contact-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="primaryContactCell"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required={isNewCustomer}>Primary Contact Cell</FormLabel>
                        <FormControl>
                          <PhoneInput {...field} data-testid="input-primary-contact-cell" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="primaryContactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required={isNewCustomer}>Primary Contact Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="email@example.com" data-testid="input-primary-contact-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Billing Contact Section */}
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold mb-4">Billing Contact</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="billingContactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required={isNewCustomer}>Billing Contact Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Contact name" data-testid="input-billing-contact-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="billingContactNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required={isNewCustomer}>Billing Contact Number</FormLabel>
                        <FormControl>
                          <PhoneInput {...field} data-testid="input-billing-contact-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="billingContactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required={isNewCustomer}>Billing Contact Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="billing@example.com" data-testid="input-billing-contact-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit / Auto-save indicator */}
          <div className="flex justify-end gap-2 items-center">
            {isNewCustomer ? (
              // New account: keep manual Create button
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/customers")}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  data-testid="button-save-customer"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isPending ? "Saving..." : "Create Account"}
                </Button>
              </>
            ) : (
              // Existing account: auto-save, show subtle state indicator
              <div className="flex items-center gap-3">
                <span className={`text-xs flex items-center gap-1.5 transition-all ${
                  autoSaveState === "saving" ? "text-muted-foreground"
                  : autoSaveState === "saved"  ? "text-emerald-600"
                  : autoSaveState === "error"  ? "text-red-600"
                  : "text-transparent"
                }`}>
                  {autoSaveState === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
                  {autoSaveState === "saved"  && <CheckCircle2 className="h-3 w-3" />}
                  {autoSaveState === "error"  && <AlertCircle className="h-3 w-3" />}
                  {autoSaveState === "saving" ? "Saving…"
                    : autoSaveState === "saved"  ? "Saved"
                    : autoSaveState === "error"  ? "Unable to save"
                    : "Saved"}
                </span>
                {/* Save now button removed — auto-save handles all persistence. */}
              </div>
            )}
          </div>
        </form>
      </Form>
        </TabsContent>

        {/* Overview Tab */}
        <TabsContent value="overview">
          {!isNewCustomer && customer && (
            <>
            {/* Key Account Details Strip */}
            <div className="flex flex-wrap gap-3 mb-6 p-4 rounded-md border bg-muted/30" data-testid="section-account-key-details">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground font-medium">Account Type:</span>
                <span className="font-semibold">{customer.customerType || "—"}</span>
              </div>
              <span className="text-border">|</span>
              <div className="flex items-center gap-2 text-sm">
                <Car className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground font-medium">Driver Model:</span>
                <Badge variant="secondary" className="text-xs" data-testid="badge-driver-model-overview">
                  {DRIVER_MODEL_OPTIONS.find(o => o.value === customer.driverModel)?.label || "—"}
                </Badge>
              </div>
              {customer.status && (
                <>
                  <span className="text-border">|</span>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground font-medium">Status:</span>
                    <Badge
                      variant={
                        customer.status?.toLowerCase() === "active" ? "default" :
                        customer.status?.toLowerCase() === "suspended" ? "destructive" :
                        "outline"
                      }
                      className="text-xs"
                      data-testid="badge-status-overview"
                    >
                      {customer.status}
                    </Badge>
                  </div>
                </>
              )}
              {customer.implementationDate && (
                <>
                  <span className="text-border">|</span>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground font-medium">Since:</span>
                    <span className="font-semibold">{formatDate(customer.implementationDate)}</span>
                  </div>
                </>
              )}
              {(customer as any).shiftBillRate && (
                <>
                  <span className="text-border">|</span>
                  <div className="flex items-center gap-2 text-sm" data-testid="overview-shift-bill-rate">
                    <span className="text-muted-foreground font-medium">Shift Bill Rate:</span>
                    <span className="font-semibold">${parseFloat((customer as any).shiftBillRate).toFixed(2)}/hr</span>
                  </div>
                </>
              )}
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Health Card */}
              <Card data-testid="card-health">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Heart className="h-5 w-5" />
                    Health Status
                    {activeOverride && (
                      <Badge variant="outline" className="ml-2 text-xs" data-testid="badge-override-active">
                        <Lock className="h-3 w-3 mr-1" />
                        Override Active
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Status + Trend row */}
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    {/* Status badge — use Draiver-derived status when available, else stored */}
                    <Badge
                      className={`text-sm px-3 py-1 font-semibold ${
                        (draiverDerivedHealth?.status ?? customer.health) === "At Risk" || customer.health === "red"
                          ? "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200"
                          : (draiverDerivedHealth?.status ?? customer.health) === "Watch" || customer.health === "yellow"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
                          : (draiverDerivedHealth?.status ?? "") === "Healthy" || customer.health === "green"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
                          : "bg-muted text-muted-foreground"
                      }`}
                      data-testid="badge-health"
                    >
                      <Heart className="h-3 w-3 mr-1.5 inline" />
                      {draiverDerivedHealth?.status
                        ?? (customer.health === "green" ? "Healthy" : customer.health === "yellow" ? "Watch" : customer.health === "red" ? "At Risk" : "Not Set")}
                    </Badge>

                    {/* Trend — Draiver-derived when available, else stored */}
                    {(draiverDerivedHealth?.trend ?? customer.healthTrend) && (
                      <div className="flex items-center gap-1 text-muted-foreground text-sm" data-testid="text-health-trend">
                        <span className="text-xs text-muted-foreground">Trend:</span>
                        {(draiverDerivedHealth?.trend ?? customer.healthTrend) === "Improving" || customer.healthTrend === "improving"
                          ? <TrendingUp className="h-4 w-4 text-green-500" />
                          : (draiverDerivedHealth?.trend ?? customer.healthTrend) === "Declining" || customer.healthTrend === "declining"
                          ? <TrendingDown className="h-4 w-4 text-red-500" />
                          : <Minus className="h-4 w-4 text-muted-foreground" />}
                        <span className="font-medium">
                          {draiverDerivedHealth?.trend
                            ?? (customer.healthTrend === "stable" ? "Flat" : customer.healthTrend === "improving" ? "Improving" : customer.healthTrend === "declining" ? "Declining" : customer.healthTrend)}
                        </span>
                      </div>
                    )}

                    {/* Draiver data badge */}
                    {draiverDerivedHealth && (
                      <span className="text-[10px] text-orange-500 font-semibold uppercase tracking-wide border border-orange-200 dark:border-orange-800 rounded px-1.5 py-0.5" data-testid="badge-draiver-computed">
                        Draiver data
                      </span>
                    )}
                  </div>

                  {/* Active Override Banner */}
                  {activeOverride && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 mb-4" data-testid="banner-active-override">
                      <div className="flex items-start gap-2">
                        <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Manual Override Active</p>
                          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                            Reason: {activeOverride.reason}
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            Expires: {formatDate(activeOverride.expiresAt)} · Set by: {activeOverride.createdByName || 'Admin'}
                          </p>
                        </div>
                        {canManageOverrides && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRemoveOverrideTargetId(activeOverride.id);
                              setRemoveOverrideReason("");
                              setRemoveOverrideDialogOpen(true);
                            }}
                            disabled={removeOverrideMutation.isPending}
                            data-testid="button-remove-override"
                          >
                            <Unlock className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Top Reasons</h4>
                    {draiverDerivedHealth ? (
                      <ul className="text-sm space-y-1.5" data-testid="text-top-reasons">
                        {draiverDerivedHealth.reasons.map((reason, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    ) : customer.healthReasons ? (
                      <ul className="text-sm space-y-1" data-testid="text-top-reasons">
                        {(() => {
                          try {
                            const reasons = JSON.parse(customer.healthReasons as string);
                            return Array.isArray(reasons) ? reasons.map((reason: string, i: number) => (
                              <li key={i} className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                                {reason}
                              </li>
                            )) : <li>No reasons specified</li>;
                          } catch {
                            return <li className="text-muted-foreground italic">No reasons specified</li>;
                          }
                        })()}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground italic" data-testid="text-top-reasons-empty">No reasons specified</p>
                    )}
                  </div>

                  {/* "Why this score?" Expandable Section */}
                  <div className="mt-4 border-t pt-4">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full"
                      onClick={() => setShowHealthExplanation(!showHealthExplanation)}
                      data-testid="button-why-this-score"
                    >
                      <Info className="h-4 w-4" />
                      <span>Why this score?</span>
                      {showHealthExplanation ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
                    </button>
                    
                    {showHealthExplanation && (
                      <div className="mt-3 space-y-3" data-testid="section-health-explanation">
                        {healthExplanationLoading ? (
                          <p className="text-sm text-muted-foreground italic">Loading explanation...</p>
                        ) : healthExplanation?.subScores ? (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground mb-2">
                              Last calculated: {healthExplanation.calculatedAt ? formatDate(healthExplanation.calculatedAt) : 'Unknown'}
                            </p>
                            {Object.entries(healthExplanation.subScores).map(([key, score]) => (
                              <div key={key} className="flex items-center gap-2 text-sm" data-testid={`subscore-${key}`}>
                                <span className={`w-2 h-2 rounded-full ${
                                  score.status === 'green' ? 'bg-green-500' :
                                  score.status === 'yellow' ? 'bg-yellow-500' :
                                  score.status === 'red' ? 'bg-red-500' :
                                  'bg-gray-400'
                                }`} />
                                <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                                <span className="text-muted-foreground">{score.details}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No detailed breakdown available</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Override Management for Admins */}
                  {canManageOverrides && !activeOverride && (
                    <div className="mt-4 pt-4 border-t">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setHealthOverrideDialogOpen(true)}
                        data-testid="button-create-override"
                      >
                        <Lock className="h-4 w-4 mr-2" />
                        Set Manual Override
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Strategic & Sensitivity Flags Card */}
              <Card data-testid="card-strategic-flags">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Flag className="h-5 w-5" />
                    Strategic & Sensitivity Flags
                  </CardTitle>
                  <CardDescription>
                    Manual flags for prioritization and escalation routing
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Flag display badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {customer.requiresExecAttention && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="destructive" className="flex items-center gap-1" data-testid="badge-exec-attention">
                            <Bell className="h-3 w-3" />
                            Executive Attention
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>This account requires executive oversight</TooltipContent>
                      </Tooltip>
                    )}
                    {customer.isStrategicAccount && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 flex items-center gap-1" data-testid="badge-strategic">
                            <Star className="h-3 w-3" />
                            Strategic Account
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>High-value strategic account</TooltipContent>
                      </Tooltip>
                    )}
                    {customer.isHighSensitivity && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 flex items-center gap-1" data-testid="badge-sensitivity">
                            <AlertTriangle className="h-3 w-3" />
                            High Sensitivity
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>Handle with extra care - sensitive account</TooltipContent>
                      </Tooltip>
                    )}
                    {customer.isCarrierVisible && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center gap-1" data-testid="badge-carrier-visible">
                            <Eye className="h-3 w-3" />
                            Carrier Visible
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>Visible to insurance carriers</TooltipContent>
                      </Tooltip>
                    )}
                    {!customer.requiresExecAttention && !customer.isStrategicAccount && !customer.isHighSensitivity && !customer.isCarrierVisible && (
                      <span className="text-sm text-muted-foreground italic">No flags set</span>
                    )}
                  </div>

                  {/* Flag controls for Admin/Exec */}
                  {canManageFlags && (
                    <div className="border-t pt-4 space-y-3">
                      <p className="text-xs text-muted-foreground">Admin controls:</p>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bell className="h-4 w-4 text-destructive" />
                          <Label htmlFor="flag-exec-attention" className="text-sm">Executive Attention Required</Label>
                        </div>
                        <Switch
                          id="flag-exec-attention"
                          checked={customer.requiresExecAttention || false}
                          onCheckedChange={(checked) => updateFlagsMutation.mutate({ requiresExecAttention: checked })}
                          disabled={updateFlagsMutation.isPending}
                          data-testid="switch-exec-attention"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          <Label htmlFor="flag-strategic" className="text-sm">Strategic Account</Label>
                        </div>
                        <Switch
                          id="flag-strategic"
                          checked={customer.isStrategicAccount || false}
                          onCheckedChange={(checked) => updateFlagsMutation.mutate({ isStrategicAccount: checked })}
                          disabled={updateFlagsMutation.isPending}
                          data-testid="switch-strategic"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          <Label htmlFor="flag-sensitivity" className="text-sm">High Sensitivity</Label>
                        </div>
                        <Switch
                          id="flag-sensitivity"
                          checked={customer.isHighSensitivity || false}
                          onCheckedChange={(checked) => updateFlagsMutation.mutate({ isHighSensitivity: checked })}
                          disabled={updateFlagsMutation.isPending}
                          data-testid="switch-sensitivity"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-blue-500" />
                          <Label htmlFor="flag-carrier-visible" className="text-sm">Carrier Visible</Label>
                        </div>
                        <Switch
                          id="flag-carrier-visible"
                          checked={customer.isCarrierVisible || false}
                          onCheckedChange={(checked) => updateFlagsMutation.mutate({ isCarrierVisible: checked })}
                          disabled={updateFlagsMutation.isPending}
                          data-testid="switch-carrier-visible"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Move Snapshot — full-width quick-access widget (uses Draiver 30-day stats already loaded) */}
              {draiverHealthStats?.hasData && (
                <div className="md:col-span-2" data-testid="card-move-snapshot">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2 flex-wrap">
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Truck className="h-4 w-4 text-orange-500" />
                          Move Snapshot
                        </CardTitle>
                        <CardDescription className="text-xs">Draiver data · last 30 days — <button type="button" className="text-orange-500 underline-offset-2 hover:underline" onClick={() => handleTabChange("move-intelligence")}>view full intelligence →</button></CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleTabChange("moves")} data-testid="btn-view-all-moves">
                        View All Moves
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 divide-x divide-border">
                        {[
                          {
                            label: "This Week",
                            value: draiverHealthStats.movesThisWeek,
                            sub: "completed",
                            color: undefined as "green" | "yellow" | "red" | undefined,
                          },
                          {
                            label: "This Month",
                            value: draiverHealthStats.movesThisMonth,
                            sub: "completed",
                            color: undefined as "green" | "yellow" | "red" | undefined,
                          },
                          {
                            label: "Vol Change",
                            value: `${draiverHealthStats.pctChange > 0 ? "+" : ""}${draiverHealthStats.pctChange}%`,
                            sub: "vs prior 30d",
                            color: (draiverHealthStats.pctChange > 0 ? "green" : draiverHealthStats.pctChange < -10 ? "red" : "yellow") as "green" | "yellow" | "red",
                          },
                          {
                            label: "Completion",
                            value: draiverHealthStats.completionRate !== null ? `${draiverHealthStats.completionRate}%` : "—",
                            sub: "rate",
                            color: (draiverHealthStats.completionRate !== null ? draiverHealthStats.completionRate >= 90 ? "green" : draiverHealthStats.completionRate >= 70 ? "yellow" : "red" : undefined) as "green" | "yellow" | "red" | undefined,
                          },
                          {
                            label: "Exceptions",
                            value: draiverHealthStats.exceptionRate !== null ? `${draiverHealthStats.exceptionRate}%` : "—",
                            sub: "rate",
                            color: (draiverHealthStats.exceptionRate !== null ? draiverHealthStats.exceptionRate < 10 ? "green" : draiverHealthStats.exceptionRate < 25 ? "yellow" : "red" : undefined) as "green" | "yellow" | "red" | undefined,
                          },
                          {
                            label: "Last Move",
                            value: draiverHealthStats.daysSinceLastMove !== null ? `${draiverHealthStats.daysSinceLastMove}d ago` : "—",
                            sub: draiverHealthStats.lastMoveDate ? new Date(draiverHealthStats.lastMoveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "no data",
                            color: (draiverHealthStats.daysSinceLastMove !== null ? draiverHealthStats.daysSinceLastMove >= 14 ? "red" : draiverHealthStats.daysSinceLastMove >= 7 ? "yellow" : "green" : undefined) as "green" | "yellow" | "red" | undefined,
                          },
                        ].map(({ label, value, sub, color }) => (
                          <div key={label} className="text-center px-2 first:pl-0 last:pr-0">
                            <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
                            <p className={`text-lg font-bold leading-tight ${color === "green" ? "text-green-600 dark:text-green-400" : color === "red" ? "text-red-600 dark:text-red-400" : color === "yellow" ? "text-yellow-600 dark:text-yellow-400" : ""}`}>
                              {value}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Readiness Score Card */}
              <Card data-testid="card-readiness-score">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Readiness Score
                  </CardTitle>
                  <CardDescription>
                    Onboarding & expansion readiness checklist
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Score Display */}
                  {isReadinessLoading ? (
                    <div className="animate-pulse space-y-3">
                      <div className="h-10 w-20 bg-muted rounded" />
                      <div className="h-4 w-32 bg-muted rounded" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between mb-4 pb-4 border-b">
                      <div className="flex items-center gap-3">
                        <div className={`text-4xl font-bold ${
                          (accountReadiness?.readinessScore ?? 0) >= 80 ? 'text-green-600 dark:text-green-400' :
                          (accountReadiness?.readinessScore ?? 0) >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-red-600 dark:text-red-400'
                        }`} data-testid="text-readiness-score">
                          {accountReadiness?.readinessScore ?? 0}
                        </div>
                        <div className="text-muted-foreground text-sm">/100</div>
                      </div>
                      {accountReadiness?.activationBlocked ? (
                        <Badge variant="destructive" className="flex items-center gap-1" data-testid="badge-activation-blocked">
                          <AlertCircle className="h-3 w-3" />
                          Activation Blocked
                        </Badge>
                      ) : (
                        <Badge variant="default" className="flex items-center gap-1" data-testid="badge-activation-ready">
                          <CheckCircle className="h-3 w-3" />
                          Ready for Activation
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Blocking Reason */}
                  {accountReadiness?.activationBlocked && accountReadiness?.activationBlockedReason && (
                    <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md p-3 mb-4 text-sm" data-testid="text-blocked-reason">
                      <div className="font-medium text-red-800 dark:text-red-200 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Blocking Reason
                      </div>
                      <p className="text-red-700 dark:text-red-300 mt-1">
                        {accountReadiness.activationBlockedReason}
                      </p>
                    </div>
                  )}

                  {/* Checklist Items */}
                  <div className="space-y-3">
                    {READINESS_ITEMS.map((item) => {
                      const key = item.key as keyof typeof accountReadiness;
                      const isChecked = accountReadiness?.[key] === true;
                      return (
                        <div key={item.key} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`readiness-${item.key}`}
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                updateReadinessMutation.mutate({ [item.key]: checked === true });
                              }}
                              disabled={updateReadinessMutation.isPending}
                              data-testid={`checkbox-readiness-${item.key}`}
                            />
                            <Label 
                              htmlFor={`readiness-${item.key}`} 
                              className={`text-sm cursor-pointer ${isChecked ? 'text-muted-foreground line-through' : ''}`}
                            >
                              {item.label}
                              {item.critical && (
                                <span className="ml-1 text-red-500 text-xs">(Required)</span>
                              )}
                            </Label>
                          </div>
                          <Badge 
                            variant={isChecked ? "default" : "secondary"} 
                            className="text-xs"
                          >
                            {item.weight}%
                          </Badge>
                        </div>
                      );
                    })}
                  </div>

                  {/* Last Updated */}
                  {accountReadiness?.lastUpdatedAt && (
                    <div className="mt-4 pt-3 border-t text-xs text-muted-foreground" data-testid="text-readiness-last-updated">
                      Last updated: {format(new Date(accountReadiness.lastUpdatedAt), 'MMM d, yyyy h:mm a')}
                      {accountReadiness.lastUpdatedByName && ` by ${accountReadiness.lastUpdatedByName}`}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Account Knowledge Base Card */}
              <Card data-testid="card-knowledge-base" className="md:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      Operational Knowledge Base
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {!knowledgeEditMode && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setKnowledgeEditMode(true)}
                          data-testid="button-edit-knowledge"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      )}
                      {knowledgeEditMode && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelKnowledgeEdit}
                            data-testid="button-cancel-knowledge"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveKnowledge}
                            disabled={updateKnowledgeMutation.isPending}
                            data-testid="button-save-knowledge"
                          >
                            <Save className="h-4 w-4 mr-2" />
                            Save
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <CardDescription>
                    Critical operational notes for servicing this account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {knowledgeLoading ? (
                    <p className="text-sm text-muted-foreground italic">Loading...</p>
                  ) : knowledgeEditMode ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="knowledge-before-servicing" className="font-medium">Before Servicing</Label>
                        <Textarea
                          id="knowledge-before-servicing"
                          placeholder="Steps to complete before servicing this account..."
                          value={knowledgeBeforeServicing}
                          onChange={(e) => setKnowledgeBeforeServicing(e.target.value)}
                          rows={4}
                          data-testid="textarea-before-servicing"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="knowledge-what-not-to-do" className="font-medium text-red-600 dark:text-red-400">What NOT to Do</Label>
                        <Textarea
                          id="knowledge-what-not-to-do"
                          placeholder="Things to avoid when servicing this account..."
                          value={knowledgeWhatNotToDo}
                          onChange={(e) => setKnowledgeWhatNotToDo(e.target.value)}
                          rows={4}
                          data-testid="textarea-what-not-to-do"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="knowledge-known-landmines" className="font-medium text-orange-600 dark:text-orange-400">Known Landmines</Label>
                        <Textarea
                          id="knowledge-known-landmines"
                          placeholder="Potential issues or sensitive areas to be aware of..."
                          value={knowledgeKnownLandmines}
                          onChange={(e) => setKnowledgeKnownLandmines(e.target.value)}
                          rows={4}
                          data-testid="textarea-known-landmines"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="knowledge-preferred-practices" className="font-medium text-green-600 dark:text-green-400">Preferred Practices</Label>
                        <Textarea
                          id="knowledge-preferred-practices"
                          placeholder="Best practices and preferences for this account..."
                          value={knowledgePreferredPractices}
                          onChange={(e) => setKnowledgePreferredPractices(e.target.value)}
                          rows={4}
                          data-testid="textarea-preferred-practices"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Before Servicing</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-before-servicing">
                          {accountKnowledge?.beforeServicing || <span className="italic">No notes</span>}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-red-600 dark:text-red-400">What NOT to Do</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-what-not-to-do">
                          {accountKnowledge?.whatNotToDo || <span className="italic">No notes</span>}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-orange-600 dark:text-orange-400">Known Landmines</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-known-landmines">
                          {accountKnowledge?.knownLandmines || <span className="italic">No notes</span>}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-green-600 dark:text-green-400">Preferred Practices</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-preferred-practices">
                          {accountKnowledge?.preferredPractices || <span className="italic">No notes</span>}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Last updated info and version history toggle */}
                  {accountKnowledge && !knowledgeEditMode && (
                    <div className="mt-4 pt-4 border-t flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground" data-testid="text-knowledge-last-updated">
                        Last updated: {formatDate(accountKnowledge.lastUpdatedAt)} by {accountKnowledge.lastUpdatedByName || 'Unknown'}
                        {accountKnowledge.version > 1 && ` (v${accountKnowledge.version})`}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowKnowledgeHistory(!showKnowledgeHistory)}
                        data-testid="button-toggle-knowledge-history"
                      >
                        <History className="h-4 w-4 mr-2" />
                        {showKnowledgeHistory ? 'Hide' : 'Show'} History
                      </Button>
                    </div>
                  )}

                  {/* Version History */}
                  {showKnowledgeHistory && knowledgeHistory.length > 0 && (
                    <div className="mt-4 space-y-3" data-testid="section-knowledge-history">
                      <h4 className="text-sm font-medium">Version History</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {knowledgeHistory.map((entry) => (
                          <div 
                            key={entry.id} 
                            className="p-3 bg-muted/50 rounded-md text-sm"
                            data-testid={`knowledge-history-entry-${entry.version}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">v{entry.version}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(entry.editedAt)} by {entry.editedByName || 'Unknown'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {showKnowledgeHistory && knowledgeHistory.length === 0 && (
                    <div className="mt-4 text-sm text-muted-foreground italic" data-testid="text-no-history">
                      No previous versions
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Touch Cadence Card */}
              <Card data-testid="card-touch-cadence">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    Touch Cadence
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Last Activity Date</span>
                      <span className="font-medium" data-testid="text-last-activity-date">
                        {customer.lastActivityDate ? formatDate(customer.lastActivityDate) : 'Never'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Next Required Touch</span>
                      <span 
                        className={`font-medium ${
                          customer.nextRequiredTouchDate && new Date(customer.nextRequiredTouchDate) <= new Date() 
                            ? 'text-red-500' 
                            : ''
                        }`}
                        data-testid="text-next-required-touch"
                      >
                        {customer.nextRequiredTouchDate ? formatDate(customer.nextRequiredTouchDate) : 'Not Set'}
                      </span>
                    </div>
                    <Button 
                      className="w-full mt-4" 
                      onClick={() => setLogTouchDialogOpen(true)}
                      data-testid="button-log-touch"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      Log Touch
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Open Items Card (Placeholder) */}
              <Card data-testid="card-open-items">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Open Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Open Claims</span>
                      <Badge variant="secondary" data-testid="text-open-claims">0</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Open Support Tickets</span>
                      <Badge variant="secondary" data-testid="text-open-tickets">0</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Financial Snapshot Card (Placeholder) */}
              <Card data-testid="card-financial-snapshot">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Financial Snapshot
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Open A/R</span>
                      <span className="font-medium text-lg" data-testid="text-open-ar">$0</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Claims Snapshot Card */}
              <ClaimsSnapshotCard customerId={id!} />

              {/* Volume Momentum Card */}
              <VolumeMomentumCard customerId={id!} />

              {/* Parent Account Link - if this is a child account */}
              {isChildAccount && parentAccount && (
                <Card data-testid="card-parent-account" className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="h-5 w-5" />
                      Parent Account
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Link href={`/customers/${parentAccount.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer">
                        <div className="flex items-center gap-3">
                          <Building2 className="h-8 w-8 text-muted-foreground" />
                          <div>
                            <p className="font-medium" data-testid="text-parent-name">{parentAccount.customerName}</p>
                            <p className="text-sm text-muted-foreground" data-testid="text-parent-number">
                              Account #{parentAccount.customerNumber || 'N/A'}
                            </p>
                          </div>
                        </div>
                        <ExternalLink className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
            
            {/* Opportunities Section - for all accounts */}
            <div className="mt-6">
              <OpportunitiesSection accountId={id!} />
            </div>

            {/* Parent Account Rollup Section - if this is a parent account */}
            {isParentAccount && rollupMetrics && (
              <div className="mt-6 space-y-6">
                {/* Rolled-up Metrics Grid */}
                <div className="grid gap-4 md:grid-cols-4">
                  <Card data-testid="card-rollup-revenue-30">
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold" data-testid="text-revenue-30">
                        ${rollupMetrics.totalRevenue30.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <p className="text-sm text-muted-foreground">Revenue (30 days)</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-rollup-revenue-90">
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold" data-testid="text-revenue-90">
                        ${rollupMetrics.totalRevenue90.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <p className="text-sm text-muted-foreground">Revenue (90 days)</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-rollup-margin">
                    <CardContent className="pt-6">
                      <div className={`text-2xl font-bold ${rollupMetrics.totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-total-margin">
                        ${rollupMetrics.totalMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <p className="text-sm text-muted-foreground">Total Margin</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-rollup-ar">
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold" data-testid="text-open-ar-rollup">
                        ${rollupMetrics.openAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <p className="text-sm text-muted-foreground">Open A/R</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Rolled-up Health */}
                <Card data-testid="card-rollup-health">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <GitBranch className="h-5 w-5" />
                      Rolled-up Health ({rollupMetrics.childCount} Child Accounts)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <Badge 
                        className={`text-lg px-4 py-2 ${
                          rollupMetrics.rolledUpHealth === 'green' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          rollupMetrics.rolledUpHealth === 'yellow' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          rollupMetrics.rolledUpHealth === 'red' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                        }`}
                        data-testid="badge-rollup-health"
                      >
                        {rollupMetrics.rolledUpHealth.charAt(0).toUpperCase() + rollupMetrics.rolledUpHealth.slice(1)}
                      </Badge>
                      <div className="flex items-center gap-1 text-muted-foreground" data-testid="text-rollup-trend">
                        {rollupMetrics.rolledUpHealthTrend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                        {rollupMetrics.rolledUpHealthTrend === 'flat' && <Minus className="h-4 w-4 text-gray-500" />}
                        {rollupMetrics.rolledUpHealthTrend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
                        <span className="text-sm capitalize">{rollupMetrics.rolledUpHealthTrend}</span>
                      </div>
                      <span className="text-sm text-muted-foreground ml-auto">
                        Parent health reflects the worst child health
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Claims Metrics Rollup */}
                {rollupMetrics.claimsMetrics && (
                  <Card data-testid="card-claims-rollup">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5" />
                        Claims Metrics Rollup
                      </CardTitle>
                      <CardDescription>Aggregated claims data across all child accounts</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className="text-2xl font-bold" data-testid="text-rollup-claims-per-1000-30">
                            {rollupMetrics.claimsMetrics.claimsPer1000Moves30.toFixed(1)}
                          </div>
                          <div className="text-xs text-muted-foreground">Claims/1K Moves (30d)</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className="text-2xl font-bold" data-testid="text-rollup-claim-dollar-30">
                            ${rollupMetrics.claimsMetrics.claimDollarPerMove30.toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">$/Move (30d)</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className="text-2xl font-bold" data-testid="text-rollup-total-claims-30">
                            {rollupMetrics.claimsMetrics.totalClaims30}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Claims (30d)</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className="text-2xl font-bold" data-testid="text-rollup-total-cost-30">
                            ${rollupMetrics.claimsMetrics.totalClaimsCost30.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Cost (30d)</div>
                        </div>
                      </div>

                      {/* Child Concentration */}
                      {rollupMetrics.claimsMetrics.childConcentration.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-3">Claims Concentration by Child Account</h4>
                          <div className="space-y-2">
                            {rollupMetrics.claimsMetrics.childConcentration.map((child, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <span 
                                  className="text-sm text-primary cursor-pointer hover:underline truncate w-32"
                                  onClick={() => setLocation(`/customers/${child.childId}`)}
                                  data-testid={`link-child-concentration-${i}`}
                                >
                                  {child.childName}
                                </span>
                                <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                                  <div
                                    className="h-full bg-orange-500 transition-all"
                                    style={{ width: `${child.percentage}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium w-16 text-right">
                                  {child.percentage.toFixed(0)}% (${child.claimsCost.toLocaleString()})
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Top 5 child accounts by claims cost concentration (30-day period)
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Child Accounts Table */}
                <Card data-testid="card-child-accounts">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Child Accounts
                    </CardTitle>
                    <CardDescription>All accounts under this parent organization</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {childAccounts.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Building className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No child accounts found</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Account Number</TableHead>
                            <TableHead>Account Name</TableHead>
                            <TableHead>Health</TableHead>
                            <TableHead>Last Activity</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {childAccounts.map((child) => (
                            <TableRow 
                              key={child.id} 
                              className="cursor-pointer hover-elevate"
                              onClick={() => setLocation(`/customers/${child.id}`)}
                              data-testid={`row-child-${child.id}`}
                            >
                              <TableCell className="font-medium" data-testid={`text-child-number-${child.id}`}>
                                {child.customerNumber || 'N/A'}
                              </TableCell>
                              <TableCell data-testid={`text-child-name-${child.id}`}>
                                {child.customerName}
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  className={`${
                                    child.health === 'green' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                    child.health === 'yellow' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                    child.health === 'red' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                                  }`}
                                  data-testid={`badge-child-health-${child.id}`}
                                >
                                  {child.health ? child.health.charAt(0).toUpperCase() + child.health.slice(1) : 'N/A'}
                                </Badge>
                              </TableCell>
                              <TableCell data-testid={`text-child-activity-${child.id}`}>
                                {child.lastActivityDate ? formatDate(child.lastActivityDate) : 'Never'}
                              </TableCell>
                              <TableCell>
                                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* Payment Behavior Metrics - AI Timeliness Signals */}
            <div className="mt-6">
              <CustomerPaymentMetrics customerId={id!} />
            </div>

            {/* AI Payment Timeliness Score */}
            {(user?.role === 'admin' || user?.role === 'finance' || user?.role === 'corporate') && (
            <div className="mt-6">
              <Card data-testid="card-ai-score">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-lg">Payment Timeliness Score</CardTitle>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => recalculateAIScoreMutation.mutate()}
                      disabled={recalculateAIScoreMutation.isPending}
                      data-testid="button-recalculate-ai-score"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${recalculateAIScoreMutation.isPending ? 'animate-spin' : ''}`} />
                      {recalculateAIScoreMutation.isPending ? 'Calculating...' : 'Recalculate'}
                    </Button>
                  </div>
                  <CardDescription>
                    AI-driven risk assessment based on payment behavior patterns
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {aiScoreLoading ? (
                    <div className="animate-pulse">
                      <div className="h-16 bg-muted rounded-md" />
                    </div>
                  ) : !aiScoreData?.hasScore ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No score calculated yet</p>
                      <p className="text-sm mt-1">Click "Recalculate" to generate an AI score based on payment history</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <div className={`text-4xl font-bold ${
                              (aiScoreData.score || 0) >= 70 ? 'text-green-600 dark:text-green-400' :
                              (aiScoreData.score || 0) >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                              (aiScoreData.score || 0) >= 30 ? 'text-orange-600 dark:text-orange-400' :
                              'text-red-600 dark:text-red-400'
                            }`} data-testid="text-ai-score-value">
                              {aiScoreData.score}
                            </div>
                            <div className="text-xs text-muted-foreground">out of 100</div>
                          </div>
                          <Badge 
                            variant={
                              aiScoreData.tier === 'healthy' ? 'default' :
                              aiScoreData.tier === 'watchlist' ? 'secondary' :
                              aiScoreData.tier === 'at_risk' ? 'warning' :
                              'destructive'
                            }
                            className={`${
                              aiScoreData.tier === 'healthy' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                              aiScoreData.tier === 'watchlist' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                              aiScoreData.tier === 'at_risk' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                              'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}
                            data-testid="badge-ai-tier"
                          >
                            {aiScoreData.tier === 'healthy' ? 'Healthy' :
                             aiScoreData.tier === 'watchlist' ? 'Watchlist' :
                             aiScoreData.tier === 'at_risk' ? 'At Risk' :
                             'Collections Candidate'}
                          </Badge>
                        </div>
                        {aiScoreData.lastScoredAt && (
                          <div className="text-sm text-muted-foreground">
                            Last updated: {formatDate(aiScoreData.lastScoredAt)}
                          </div>
                        )}
                      </div>
                      
                      {aiScoreData.explanation && aiScoreData.explanation.length > 0 && (
                        <div className="mt-4">
                          <div className="text-sm font-medium mb-2">Key Factors:</div>
                          <ul className="space-y-1">
                            {aiScoreData.explanation.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Info className="h-3 w-3" />
                          Score is calculated from on-time %, avg days to pay, dispute rate, reminder dependency, and DSO trends
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            )}
            {/* Upsell Engine */}
            <div className="mt-6">
              <UpsellEnginePanel customerId={customer.id} />
            </div>
            </>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          {!isNewCustomer && id && (
            <Card data-testid="card-activity-history">
              <CardHeader>
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <CardTitle>Activity Timeline</CardTitle>
                    <CardDescription>All interactions and system events for this account</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={activityCategory} onValueChange={setActivityCategory}>
                      <SelectTrigger className="w-[140px]" data-testid="select-activity-category">
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="touch">Touch</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={() => setLogTouchDialogOpen(true)} data-testid="button-log-touch-activity">
                      <Phone className="h-4 w-4 mr-2" />
                      Log Touch
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {activityEventsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading activities...</div>
                ) : activityEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No activities recorded yet</p>
                    <p className="text-sm mt-1">Log a touch to start tracking interactions</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activityEvents.map((event) => (
                      <div 
                        key={event.id} 
                        className="flex items-start gap-4 p-4 rounded-lg border bg-card"
                        data-testid={`row-activity-${event.id}`}
                      >
                        <div className="flex-shrink-0">
                          {event.category === 'touch' && (
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                              <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                          )}
                          {event.category === 'status' && (
                            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                              <RefreshCw className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            </div>
                          )}
                          {event.category === 'system' && (
                            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                              <Settings className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="capitalize text-xs">
                              {event.category}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {formatDate(event.eventTs)}
                            </span>
                          </div>
                          <p className="font-medium" data-testid={`text-event-summary-${event.id}`}>
                            {formatTouchSummary(event.summary)}
                          </p>
                          {event.createdByName && (
                            <p className="text-sm text-muted-foreground mt-1">
                              by {event.createdByName}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance">
          {!isNewCustomer && id && <AccountPerformance customerId={id} />}
        </TabsContent>
        
        <TabsContent value="documents">
          {!isNewCustomer && id && <DocumentsTab customerId={id} customerName={customer?.customerName || ''} />}
        </TabsContent>

        <TabsContent value="sla-services">
          {!isNewCustomer && id && customer && (
            <SlaServicesTab customerId={id} customer={customer} />
          )}
        </TabsContent>

        <TabsContent value="claims">
          {!isNewCustomer && id && (
            <ClaimsTab customerId={id} />
          )}
        </TabsContent>

        <TabsContent value="decisions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Gavel className="h-5 w-5" />
                  Decision Journal
                </CardTitle>
                <CardDescription>Log and track key account decisions for auditability and learning</CardDescription>
              </div>
              <Button onClick={() => setDecisionDialogOpen(true)} data-testid="button-log-decision">
                <Plus className="h-4 w-4 mr-2" />
                Log Decision
              </Button>
            </CardHeader>
            <CardContent>
              {decisionsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading decisions...</div>
              ) : accountDecisions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="empty-decisions">
                  <Gavel className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No decisions recorded yet</p>
                  <p className="text-sm mt-1">Log important decisions like pricing changes, SLA updates, or risk overrides</p>
                </div>
              ) : (
                <div className="space-y-4" data-testid="decisions-list">
                  {accountDecisions.map((decision) => (
                    <div 
                      key={decision.id} 
                      className="border rounded-lg p-4"
                      data-testid={`decision-item-${decision.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge 
                              variant={
                                decision.decisionType === 'Exit' ? 'destructive' :
                                decision.decisionType === 'Risk Override' ? 'secondary' :
                                'outline'
                              }
                              data-testid={`badge-decision-type-${decision.id}`}
                            >
                              {decision.decisionType}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Effective: {formatDate(decision.effectiveDate)}
                            </span>
                            {decision.reviewDate && (
                              <span className="text-sm text-muted-foreground">
                                · Review: {formatDate(decision.reviewDate)}
                              </span>
                            )}
                          </div>
                          <p className="font-medium">{decision.reason}</p>
                          {decision.expectedOutcome && (
                            <p className="text-sm text-muted-foreground mt-1">
                              <span className="font-medium">Expected outcome:</span> {decision.expectedOutcome}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <UserIcon className="h-3 w-3" />
                              {decision.enteredByName || 'Unknown'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(decision.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAddendumDecisionId(decision.id);
                              setAddendumDialogOpen(true);
                            }}
                            data-testid={`button-add-addendum-${decision.id}`}
                          >
                            <MessageSquarePlus className="h-4 w-4 mr-1" />
                            Addendum
                          </Button>
                          {decision.addendums.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleDecisionExpanded(decision.id)}
                              data-testid={`button-toggle-addendums-${decision.id}`}
                            >
                              {expandedDecisions.has(decision.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                              {decision.addendums.length}
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Addendums */}
                      {expandedDecisions.has(decision.id) && decision.addendums.length > 0 && (
                        <div className="mt-4 pl-4 border-l-2 border-muted space-y-3" data-testid={`addendums-${decision.id}`}>
                          {decision.addendums.map((addendum) => (
                            <div key={addendum.id} className="text-sm" data-testid={`addendum-item-${addendum.id}`}>
                              <p>{addendum.content}</p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                <span>{addendum.addedByName || 'Unknown'}</span>
                                <span>·</span>
                                <span>{formatDate(addendum.createdAt)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Account Notes Tab ──────────────────────────────────────────── */}
        <TabsContent value="notes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquarePlus className="h-5 w-5" />
                  Account Notes
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Structured operational notes with categorization</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNotesFilter(!showNotesFilter)}
                  data-testid="button-toggle-notes-filter"
                >
                  <Flag className="h-4 w-4 mr-1" />
                  Filter
                  {(notesFilterType || notesFilterStartDate || notesFilterEndDate || notesFilterSubmittedBy) && (
                    <Badge variant="secondary" className="ml-1 text-xs">On</Badge>
                  )}
                </Button>
                {canAddNotes && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setNoteForm({ noteType: "", content: "", noteDate: new Date().toISOString().split('T')[0], tripId: "", zendeskId: "" });
                      setNoteAttachmentFile(null);
                      setNoteAttachmentDocId(null);
                      setNoteAttachmentFileName(null);
                      setNoteAddDialogOpen(true);
                    }}
                    data-testid="button-add-note"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Note
                  </Button>
                )}
              </div>
            </CardHeader>

            {/* Filter Panel */}
            {showNotesFilter && (
              <div className="px-6 pb-4">
                <div className="bg-muted/40 rounded-md p-4 space-y-3">
                  <h4 className="text-sm font-medium">Filter Notes</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">Notes Type</Label>
                      <Select value={notesFilterType || "__all__"} onValueChange={(v) => setNotesFilterType(v === "__all__" ? "" : v)}>
                        <SelectTrigger data-testid="select-filter-note-type">
                          <SelectValue placeholder="All types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All types</SelectItem>
                          {ACCOUNT_NOTE_TYPES.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Submitted By</Label>
                      <Input
                        type="text"
                        value={notesFilterSubmittedBy}
                        onChange={e => setNotesFilterSubmittedBy(e.target.value)}
                        placeholder="Search by name..."
                        data-testid="input-filter-submitted-by"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Start Date</Label>
                      <Input
                        type="date"
                        value={notesFilterStartDate}
                        onChange={e => setNotesFilterStartDate(e.target.value)}
                        data-testid="input-filter-start-date"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">End Date</Label>
                      <Input
                        type="date"
                        value={notesFilterEndDate}
                        onChange={e => setNotesFilterEndDate(e.target.value)}
                        data-testid="input-filter-end-date"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setNotesFilterType(""); setNotesFilterStartDate(""); setNotesFilterEndDate(""); setNotesFilterSubmittedBy(""); }}
                      data-testid="button-clear-notes-filter"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Clear Filters
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <CardContent>
              {notesLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Loading notes...
                </div>
              ) : accountNotes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="empty-notes">
                  <MessageSquarePlus className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No notes yet</p>
                  <p className="text-sm mt-1">Add structured notes to track operational activity</p>
                  {canAddNotes && (
                    <Button
                      className="mt-4"
                      size="sm"
                      onClick={() => setNoteAddDialogOpen(true)}
                      data-testid="button-add-first-note"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add First Note
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3" data-testid="notes-list">
                  {accountNotes
                    .filter(note => !notesFilterSubmittedBy.trim() || (note.submittedByName || '').toLowerCase().includes(notesFilterSubmittedBy.toLowerCase()))
                    .map((note) => (
                    <div
                      key={note.id}
                      className="border rounded-md p-4 space-y-2 hover-elevate"
                      data-testid={`note-item-${note.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs font-medium" data-testid={`note-type-${note.id}`}>
                            {note.noteType}
                          </Badge>
                          {note.attachmentDocumentId && note.attachmentFileName && (
                            <DocPreviewLink
                              documentId={note.attachmentDocumentId}
                              fileName={note.attachmentFileName}
                              testId={`link-note-attachment-${note.id}`}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDate(note.noteDate)}
                          </span>
                          <span className="flex items-center gap-1">
                            <UserIcon className="h-3 w-3" />
                            {note.submittedByName || 'Unknown'}
                          </span>
                          {isCorporate && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground opacity-60 hover:opacity-100"
                                onClick={() => {
                                  setNoteToEdit(note);
                                  setNoteEditContent(note.content);
                                  setNoteEditType(note.noteType);
                                  setNoteEditDate(note.noteDate);
                                  setNoteEditReason("");
                                  setNoteEditDialogOpen(true);
                                }}
                                data-testid={`button-edit-note-${note.id}`}
                                title="Edit note"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive opacity-60 hover:opacity-100"
                                onClick={() => { setNoteToDelete(note); setNoteDeleteReason(""); setNoteDeleteAlsoAttachment(false); setNoteDeleteDialogOpen(true); }}
                                data-testid={`button-delete-note-${note.id}`}
                                title="Delete note"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-foreground line-clamp-3" data-testid={`note-content-${note.id}`}>
                        {note.content}
                      </p>
                      {(note.editedAt || note.tripId || note.zendeskId) && (
                        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 flex-wrap">
                          {note.tripId && <span>Trip: <span className="font-mono">{note.tripId}</span></span>}
                          {note.zendeskId && <span>Zendesk: <span className="font-mono">{note.zendeskId}</span></span>}
                          {note.editedAt && (
                            <span className="flex items-center gap-1 italic" data-testid={`note-edited-${note.id}`}>
                              <Edit className="h-3 w-3" />
                              edited {formatDate(String(note.editedAt))}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statements">
          {customer && <CustomerStatements customerId={customer.id} customerName={customer.customerName || ''} />}
        </TabsContent>

        <TabsContent value="dealership">
          {customer?.customerType === "Franchise Dealer" && <DealershipTab customerId={customer.id} />}
        </TabsContent>

        <TabsContent value="drivers">
          {customer && <AccountDriversTab customerId={customer.id} />}
        </TabsContent>

        <TabsContent value="scheduling">
          <CustomerWIWTab accountId={id ?? ""} />
        </TabsContent>

        <TabsContent value="holidays">
          {!isNewCustomer && id && <AccountHolidayHistory accountId={id} />}
        </TabsContent>

        <TabsContent value="analytics">
          {!isNewCustomer && id && <AccountAnalyticsTab accountId={id} />}
        </TabsContent>

        <TabsContent value="move-intelligence">
          {!isNewCustomer && id && <AccountMoveIntelligenceTab accountId={id} />}
        </TabsContent>

        <TabsContent value="products">
          {!isNewCustomer && id && <AccountProductsTab customerId={id} />}
        </TabsContent>

        <TabsContent value="services-billing">
          {!isNewCustomer && id && <AccountServicesTab accountId={id} />}
        </TabsContent>

        <TabsContent value="group-roster">
          {!isNewCustomer && id && isParentAccount && <GroupRosterTab accountId={id} />}
        </TabsContent>

        <TabsContent value="departments">
          {!isNewCustomer && id && <AccountDepartmentsTab accountId={id} />}
        </TabsContent>

        <TabsContent value="contacts">
          {!isNewCustomer && id && <AccountContactsTab accountId={id} />}
        </TabsContent>

        <TabsContent value="moves">
          <div className="space-y-3">
            {/* Header row: title + export */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Truck className="h-4 w-4 text-orange-500" />
                  Move History
                </h3>
                {!accountMovesLoading && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {accountMovesTotal.toLocaleString()} total move{accountMovesTotal !== 1 ? "s" : ""} for this account
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams({
                    customerId: id ?? "",
                    sortBy: movesSortBy,
                    sortDir: movesSortDir,
                    ...(movesStatusFilter && { status: movesStatusFilter }),
                    ...(movesTypeFilter   && { moveType: movesTypeFilter }),
                    ...(movesStartDate    && { startDate: movesStartDate }),
                    ...(movesEndDate      && { endDate: movesEndDate }),
                  });
                  window.open(`/api/corporate/trips/export?${params}`, "_blank");
                }}
                data-testid="button-export-account-moves"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export
              </Button>
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap gap-2 p-3 rounded-md border bg-muted/30">
              <Select value={movesStatusFilter} onValueChange={(v) => { setMovesStatusFilter(v === "_all" ? "" : v); setMovesPage(1); }}>
                <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-moves-status">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="exception">Exception</SelectItem>
                </SelectContent>
              </Select>

              <input
                type="text"
                placeholder="Move Type"
                value={movesTypeFilter}
                onChange={(e) => { setMovesTypeFilter(e.target.value); setMovesPage(1); }}
                className="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="input-moves-type"
              />

              <input
                type="date"
                value={movesStartDate}
                onChange={(e) => { setMovesStartDate(e.target.value); setMovesPage(1); }}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="input-moves-start"
              />
              <span className="self-center text-xs text-muted-foreground">–</span>
              <input
                type="date"
                value={movesEndDate}
                onChange={(e) => { setMovesEndDate(e.target.value); setMovesPage(1); }}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="input-moves-end"
              />

              <Select value={`${movesSortBy}-${movesSortDir}`} onValueChange={(v) => {
                const [by, dir] = v.split("-");
                setMovesSortBy(by);
                setMovesSortDir(dir as "asc" | "desc");
                setMovesPage(1);
              }}>
                <SelectTrigger className="h-8 w-44 text-xs" data-testid="select-moves-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tripDate-desc">Date: Newest First</SelectItem>
                  <SelectItem value="tripDate-asc">Date: Oldest First</SelectItem>
                  <SelectItem value="status-asc">Status A–Z</SelectItem>
                  <SelectItem value="moveType-asc">Move Type A–Z</SelectItem>
                  <SelectItem value="moveNumber-asc">Move # Ascending</SelectItem>
                </SelectContent>
              </Select>

              {(movesStatusFilter || movesTypeFilter || movesStartDate || movesEndDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setMovesStatusFilter("");
                    setMovesTypeFilter("");
                    setMovesStartDate("");
                    setMovesEndDate("");
                    setMovesPage(1);
                  }}
                  data-testid="button-clear-moves-filters"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {accountMovesLoading ? (
                  <div className="p-4 space-y-2">
                    {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
                  </div>
                ) : accountMoves.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Truck className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Moves Found</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      {movesStatusFilter || movesTypeFilter || movesStartDate || movesEndDate
                        ? "No moves match the current filters. Try clearing some filters."
                        : "No moves have been linked to this account yet. Import a Move Report to populate this section."
                      }
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28 text-xs">Move #</TableHead>
                        <TableHead className="w-24 text-xs">Date</TableHead>
                        <TableHead className="w-28 text-xs">Status</TableHead>
                        <TableHead className="w-32 text-xs">Move Type</TableHead>
                        <TableHead className="text-xs">Driver</TableHead>
                        <TableHead className="text-xs">Route</TableHead>
                        <TableHead className="w-20 text-xs">Duration</TableHead>
                        <TableHead className="w-24 text-right text-xs">Move Cost</TableHead>
                        <TableHead className="w-24 text-xs">Claim #</TableHead>
                        <TableHead className="w-10 text-right">
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => handleTabChange("move-intelligence")}
                          >
                            Intel ↗
                          </button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accountMoves.map((move: any) => {
                        const driverName = [move.driverFirstName, move.driverLastName].filter(Boolean).join(' ');
                        const moveMinutes: number | null = move.moveMinutes ?? null;
                        let durationDisplay = "—";
                        if (moveMinutes) {
                          const h = Math.floor(moveMinutes / 60);
                          const m = moveMinutes % 60;
                          durationDisplay = h === 0 ? `${m}m` : `${h}h ${m.toString().padStart(2, "0")}m`;
                        }
                        const claims: {id: string; displayClaimId: string | null}[] = move.claims ?? [];
                        return (
                          <TableRow
                            key={move.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setLocation(`/trips/${move.id}`)}
                          >
                            <TableCell className="font-mono text-xs">{move.moveNumber || "—"}</TableCell>
                            <TableCell className="text-xs">{move.tripDate ? new Date(move.tripDate).toLocaleDateString() : "—"}</TableCell>
                            <TableCell>
                              <StatusBadge status={move.status ?? "scheduled"} />
                            </TableCell>
                            <TableCell className="text-xs">{move.moveType || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {driverName ? (
                                <a
                                  href={`/drivers/${move.driverId}`}
                                  className="hover:underline hover:text-foreground"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {driverName}
                                </a>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {move.origin && move.destination
                                ? `${move.origin} → ${move.destination}`
                                : move.origin || move.destination || "—"}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">{durationDisplay}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-muted-foreground">—</TableCell>
                            <TableCell className="text-xs">
                              {claims.length === 0
                                ? <span className="text-muted-foreground">—</span>
                                : claims.length === 1
                                ? (
                                  <a
                                    href={`/accidents/${claims[0].id}`}
                                    className="hover:underline hover:text-foreground text-muted-foreground"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {claims[0].displayClaimId || claims[0].id.slice(0, 8)}
                                  </a>
                                )
                                : (
                                  <span className="flex items-center gap-1">
                                    <a
                                      href={`/accidents/${claims[0].id}`}
                                      className="hover:underline hover:text-foreground text-muted-foreground"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {claims[0].displayClaimId || claims[0].id.slice(0, 8)}
                                    </a>
                                    <span className="text-muted-foreground/60">+{claims.length - 1}</span>
                                  </span>
                                )
                              }
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setLocation(`/trips/${move.id}`); }} data-testid={`btn-open-move-${move.id}`}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Pagination */}
            {!accountMovesLoading && accountMovesTotal > MOVES_PAGE_LIMIT && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">
                  Page {movesPage} of {movesTotalPages} · {accountMovesTotal.toLocaleString()} moves
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMovesPage(p => Math.max(1, p - 1))}
                    disabled={movesPage <= 1}
                    data-testid="button-moves-prev"
                  >
                    ‹ Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMovesPage(p => Math.min(movesTotalPages, p + 1))}
                    disabled={movesPage >= movesTotalPages}
                    data-testid="button-moves-next"
                  >
                    Next ›
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

      </Tabs>

      {/* Log Touch Dialog */}
      <Dialog open={logTouchDialogOpen} onOpenChange={setLogTouchDialogOpen}>
        <DialogContent data-testid="dialog-log-touch">
          <DialogHeader>
            <DialogTitle>Log Touch</DialogTitle>
            <DialogDescription>Record a customer interaction. This will update the Last Activity Date and set the Next Required Touch to 30 days from now.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label required>Touch Type</Label>
              <Select value={touchType} onValueChange={setTouchType}>
                <SelectTrigger data-testid="select-touch-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Call
                    </div>
                  </SelectItem>
                  <SelectItem value="email">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </div>
                  </SelectItem>
                  <SelectItem value="virtual_meeting">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      Virtual Meeting
                    </div>
                  </SelectItem>
                  <SelectItem value="in_person">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4" />
                      In-Person
                    </div>
                  </SelectItem>
                  <SelectItem value="text">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      Text
                    </div>
                  </SelectItem>
                  <SelectItem value="bulk_email">
                    <div className="flex items-center gap-2">
                      <Inbox className="h-4 w-4" />
                      Bulk Email
                    </div>
                  </SelectItem>
                  <SelectItem value="marketing_campaign">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4" />
                      Marketing Campaign
                    </div>
                  </SelectItem>
                  <SelectItem value="trade_event">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Trade Event
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={touchNotes}
                onChange={(e) => setTouchNotes(e.target.value)}
                placeholder="Optional notes about this interaction..."
                data-testid="input-touch-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogTouchDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleLogTouch} 
              disabled={logTouchMutation.isPending || !touchType}
              data-testid="button-confirm-log-touch"
            >
              {logTouchMutation.isPending ? "Logging..." : "Log Touch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Weekly Report Sheet */}
      <Sheet open={weeklyReportOpen} onOpenChange={setWeeklyReportOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto" data-testid="sheet-weekly-report">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Weekly Report
            </SheetTitle>
            <SheetDescription>
              {customer?.customerName
                ? `Generate on-demand reports for ${customer.customerName}`
                : "Generate on-demand shift and hours reports"}
            </SheetDescription>
          </SheetHeader>
          <div className="pt-5">
            {id && <AccountWeeklyReportTab customerId={id} compact />}
          </div>
        </SheetContent>
      </Sheet>

      {/* Health Override Dialog */}
      <Dialog open={healthOverrideDialogOpen} onOpenChange={setHealthOverrideDialogOpen}>
        <DialogContent data-testid="dialog-health-override">
          <DialogHeader>
            <DialogTitle>Set Health Override</DialogTitle>
            <DialogDescription>
              Manually override the calculated health score. This will bypass automatic calculations until the expiration date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label required>Override Value</Label>
              <Select value={overrideValue} onValueChange={setOverrideValue}>
                <SelectTrigger data-testid="select-override-value">
                  <SelectValue placeholder="Select health status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="green">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-green-500" />
                      Healthy
                    </div>
                  </SelectItem>
                  <SelectItem value="yellow">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-amber-500" />
                      Watch
                    </div>
                  </SelectItem>
                  <SelectItem value="red">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500" />
                      At Risk
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label required>Reason</Label>
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Explain why this override is necessary..."
                data-testid="input-override-reason"
              />
            </div>
            <div>
              <Label required>Expiration Date</Label>
              <Input
                type="date"
                value={overrideExpiresAt}
                onChange={(e) => setOverrideExpiresAt(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                data-testid="input-override-expires"
              />
              <p className="text-xs text-muted-foreground mt-1">Override will automatically expire on this date</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHealthOverrideDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleCreateOverride} 
              disabled={createOverrideMutation.isPending || !overrideValue || !overrideReason.trim() || !overrideExpiresAt}
              data-testid="button-confirm-override"
            >
              {createOverrideMutation.isPending ? "Creating..." : "Create Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Account Note Dialog */}
      <Dialog open={noteAddDialogOpen} onOpenChange={(open) => {
        setNoteAddDialogOpen(open);
        if (!open) {
          setNoteAttachmentFile(null);
          setNoteAttachmentDocId(null);
          setNoteAttachmentFileName(null);
        }
      }}>
        <DialogContent className="max-w-lg" data-testid="dialog-add-note">
          <DialogHeader>
            <DialogTitle>Add Account Note</DialogTitle>
            <DialogDescription>
              Create a structured note for this account. Notes Type and content are required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Note Date</Label>
                <Input
                  type="date"
                  value={noteForm.noteDate}
                  onChange={e => setNoteForm(f => ({ ...f, noteDate: e.target.value }))}
                  data-testid="input-note-date"
                />
              </div>
              <div>
                <Label required>Notes Type</Label>
                <Select value={noteForm.noteType} onValueChange={v => setNoteForm(f => ({ ...f, noteType: v }))}>
                  <SelectTrigger data-testid="select-note-type">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_NOTE_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label required>Note Content</Label>
              <Textarea
                value={noteForm.content}
                onChange={e => setNoteForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Enter note details..."
                className="min-h-[100px]"
                data-testid="input-note-content"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Trip ID (optional)</Label>
                <Input
                  value={noteForm.tripId}
                  onChange={e => setNoteForm(f => ({ ...f, tripId: e.target.value }))}
                  placeholder="e.g. TRP-12345"
                  data-testid="input-note-trip-id"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Zendesk ID (optional)</Label>
                <Input
                  value={noteForm.zendeskId}
                  onChange={e => setNoteForm(f => ({ ...f, zendeskId: e.target.value }))}
                  placeholder="e.g. ZD-67890"
                  data-testid="input-note-zendesk-id"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Attachment (optional)</Label>
              {noteAttachmentDocId ? (
                <div className="flex items-center gap-2 mt-1 p-2 bg-muted/40 rounded-md">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm flex-1 truncate">{noteAttachmentFileName}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setNoteAttachmentDocId(null); setNoteAttachmentFileName(null); setNoteAttachmentFile(null); }}
                    data-testid="button-remove-attachment"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="mt-1">
                  <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded-md p-3 hover-elevate">
                    {noteAttachmentUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Upload className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm text-muted-foreground">
                      {noteAttachmentUploading ? "Uploading..." : "Click to attach file"}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      disabled={noteAttachmentUploading}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { setNoteAttachmentFile(f); handleNoteAttachmentUpload(f); }
                      }}
                      data-testid="input-note-attachment"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteAddDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmitNote}
              disabled={createNoteMutation.isPending || noteAttachmentUploading || !noteForm.noteType || !noteForm.content.trim()}
              data-testid="button-confirm-add-note"
            >
              {createNoteMutation.isPending ? "Saving..." : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Note Dialog */}
      <Dialog open={noteDeleteDialogOpen} onOpenChange={(open) => {
        setNoteDeleteDialogOpen(open);
        if (!open) { setNoteToDelete(null); setNoteDeleteReason(""); setNoteDeleteAlsoAttachment(false); }
      }}>
        <DialogContent className="max-w-md" data-testid="dialog-delete-note">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete Note
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. The note will be soft-deleted and this deletion will be permanently logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason for deletion <span className="text-destructive">*</span></Label>
              <Textarea
                value={noteDeleteReason}
                onChange={e => setNoteDeleteReason(e.target.value)}
                placeholder="Provide a reason for deleting this note (minimum 10 characters)..."
                className="min-h-[80px] mt-1"
                data-testid="input-delete-note-reason"
              />
              <p className="text-xs text-muted-foreground mt-1">{noteDeleteReason.trim().length}/10 characters minimum</p>
            </div>
            {noteToDelete?.attachmentDocumentId && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm font-medium text-destructive">This note has an attached document.</p>
                <p className="text-xs text-muted-foreground">
                  By default, the attached document will be retained in Account Documents. Check the box below to also delete it.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="also-delete-attachment"
                    checked={noteDeleteAlsoAttachment}
                    onCheckedChange={(checked) => setNoteDeleteAlsoAttachment(checked === true)}
                    data-testid="checkbox-delete-note-attachment"
                  />
                  <Label htmlFor="also-delete-attachment" className="text-sm cursor-pointer">
                    Also delete attached document
                    {noteToDelete.attachmentFileName && (
                      <span className="ml-1 text-muted-foreground font-normal">({noteToDelete.attachmentFileName})</span>
                    )}
                  </Label>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDeleteDialogOpen(false)} data-testid="button-cancel-delete-note">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (noteToDelete) deleteNoteMutation.mutate({
                  noteId: noteToDelete.id,
                  reason: noteDeleteReason,
                  deleteAttachment: noteDeleteAlsoAttachment,
                });
              }}
              disabled={deleteNoteMutation.isPending || noteDeleteReason.trim().length < 10}
              data-testid="button-confirm-delete-note"
            >
              {deleteNoteMutation.isPending ? "Deleting..." : "Delete Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account Note Dialog */}
      <Dialog open={noteEditDialogOpen} onOpenChange={(open) => {
        setNoteEditDialogOpen(open);
        if (!open) { setNoteToEdit(null); setNoteEditContent(""); setNoteEditType(""); setNoteEditDate(""); setNoteEditReason(""); }
      }}>
        <DialogContent className="max-w-lg" data-testid="dialog-edit-note">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-4 w-4" />
              Edit Note
            </DialogTitle>
            <DialogDescription>
              Changes are recorded in the audit trail. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Note Type <span className="text-destructive">*</span></Label>
              <Select value={noteEditType} onValueChange={setNoteEditType}>
                <SelectTrigger className="mt-1" data-testid="select-edit-note-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {["Dealer Update","Dealer Cancellation","Dealer Complaint","Damage Complaint","System Setting Request","Additional Driver Request","Driver Availability","Accounting Question","Implementation"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={noteEditDate} onChange={e => setNoteEditDate(e.target.value)} className="mt-1" data-testid="input-edit-note-date" />
            </div>
            <div>
              <Label>Content <span className="text-destructive">*</span></Label>
              <Textarea
                value={noteEditContent}
                onChange={e => setNoteEditContent(e.target.value)}
                placeholder="Note content..."
                className="min-h-[120px] mt-1"
                data-testid="input-edit-note-content"
              />
            </div>
            <div>
              <Label>Reason for edit <span className="text-destructive">*</span></Label>
              <Textarea
                value={noteEditReason}
                onChange={e => setNoteEditReason(e.target.value)}
                placeholder="Explain what changed and why (minimum 10 characters)..."
                className="min-h-[70px] mt-1"
                data-testid="input-edit-note-reason"
              />
              <p className="text-xs text-muted-foreground mt-1">{noteEditReason.trim().length}/10 characters minimum</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteEditDialogOpen(false)} data-testid="button-cancel-edit-note">Cancel</Button>
            <Button
              onClick={() => {
                if (noteToEdit) editNoteMutation.mutate({
                  noteId: noteToEdit.id,
                  content: noteEditContent,
                  noteType: noteEditType,
                  noteDate: noteEditDate,
                  reason: noteEditReason,
                });
              }}
              disabled={editNoteMutation.isPending || noteEditReason.trim().length < 10 || !noteEditContent.trim() || !noteEditType || !noteEditDate}
              data-testid="button-confirm-edit-note"
            >
              {editNoteMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Health Override Dialog */}
      <Dialog open={removeOverrideDialogOpen} onOpenChange={(open) => {
        setRemoveOverrideDialogOpen(open);
        if (!open) { setRemoveOverrideReason(""); setRemoveOverrideTargetId(null); }
      }}>
        <DialogContent data-testid="dialog-remove-override">
          <DialogHeader>
            <DialogTitle>Remove Health Override</DialogTitle>
            <DialogDescription>
              Removing this override will allow the system to resume automatic health score calculation. Please provide a reason for the removal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label required>Reason for Removal</Label>
              <Textarea
                value={removeOverrideReason}
                onChange={(e) => setRemoveOverrideReason(e.target.value)}
                placeholder="Explain why this override is being removed..."
                data-testid="input-remove-override-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOverrideDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!removeOverrideTargetId) return;
                if (!removeOverrideReason.trim() || removeOverrideReason.trim().length < 10) {
                  toast({ title: "Please provide a reason (min 10 characters)", variant: "destructive" });
                  return;
                }
                removeOverrideMutation.mutate({ overrideId: removeOverrideTargetId, reason: removeOverrideReason.trim() });
              }}
              disabled={removeOverrideMutation.isPending || !removeOverrideReason.trim()}
              data-testid="button-confirm-remove-override"
            >
              {removeOverrideMutation.isPending ? "Removing..." : "Remove Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Decision Dialog */}
      <Dialog open={decisionDialogOpen} onOpenChange={setDecisionDialogOpen}>
        <DialogContent data-testid="dialog-log-decision">
          <DialogHeader>
            <DialogTitle>Log Decision</DialogTitle>
            <DialogDescription>
              Record a key account decision. Decisions are immutable after creation - use addendums for updates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label required>Decision Type</Label>
              <Select value={decisionType} onValueChange={setDecisionType}>
                <SelectTrigger data-testid="select-decision-type">
                  <SelectValue placeholder="Select decision type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Repricing">Repricing</SelectItem>
                  <SelectItem value="SLA change">SLA change</SelectItem>
                  <SelectItem value="Risk Override">Risk Override</SelectItem>
                  <SelectItem value="Exit">Exit</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label required>Reason / Description</Label>
              <Textarea
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                placeholder="Describe the decision and rationale..."
                data-testid="input-decision-reason"
              />
            </div>
            <div>
              <Label>Expected Outcome</Label>
              <Textarea
                value={decisionExpectedOutcome}
                onChange={(e) => setDecisionExpectedOutcome(e.target.value)}
                placeholder="What outcome do you expect from this decision?"
                data-testid="input-decision-expected-outcome"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label required>Effective Date</Label>
                <Input
                  type="date"
                  value={decisionEffectiveDate}
                  onChange={(e) => setDecisionEffectiveDate(e.target.value)}
                  data-testid="input-decision-effective-date"
                />
              </div>
              <div>
                <Label>Review Date</Label>
                <Input
                  type="date"
                  value={decisionReviewDate}
                  onChange={(e) => setDecisionReviewDate(e.target.value)}
                  data-testid="input-decision-review-date"
                />
                <p className="text-xs text-muted-foreground mt-1">Optional date to review decision impact</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleCreateDecision} 
              disabled={createDecisionMutation.isPending || !decisionType || !decisionReason.trim() || !decisionEffectiveDate}
              data-testid="button-confirm-decision"
            >
              {createDecisionMutation.isPending ? "Logging..." : "Log Decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Addendum Dialog */}
      <Dialog open={addendumDialogOpen} onOpenChange={setAddendumDialogOpen}>
        <DialogContent data-testid="dialog-add-addendum">
          <DialogHeader>
            <DialogTitle>Add Addendum</DialogTitle>
            <DialogDescription>
              Add a note or update to this decision. The original decision remains unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label required>Addendum Content</Label>
              <Textarea
                value={addendumContent}
                onChange={(e) => setAddendumContent(e.target.value)}
                placeholder="Enter your addendum..."
                data-testid="input-addendum-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddendumDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleAddAddendum} 
              disabled={createAddendumMutation.isPending || !addendumContent.trim()}
              data-testid="button-confirm-addendum"
            >
              {createAddendumMutation.isPending ? "Adding..." : "Add Addendum"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Records Dialog (Super Admin only) */}
      {isRootSuperAdmin && customer && (
        <MergeRecordsDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          entityType="account"
          primaryId={customer.id}
          primaryLabel={customer.customerName ?? customer.id}
          onMergeComplete={() => queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", id] })}
        />
      )}

    </div>
  );
}

// Document category type
type DocumentCategory = "Contract" | "Pricing/Quote" | "Compliance" | "Reports" | "Other";

// Account document type
interface AccountDocument {
  id: string;
  customerId: string;
  filename: string;
  originalFilename: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  category: DocumentCategory;
  label: string | null;
  docType: string | null;
  issueDate: string | null;
  expirationDate: string | null;
  status: string | null;
  notes: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  updatedBy: string | null;
  uploadedAt: string;
  uploadedByUserId: string | null;
  uploadedByName?: string;
  unifiedDocumentId: string | null;
}

// Standard document type
interface StandardDocument {
  id: string;
  name: string;
  description: string | null;
  filename: string;
  originalFilename: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  uploadedByUserId: string | null;
}

// Document packet log type
interface DocumentPacketLog {
  id: string;
  customerId: string;
  standardDocumentIds: string;
  documentNames: string;
  recipientEmails: string;
  status: string;
  errorMessage: string | null;
  sentAt: string;
  sentByUserId: string | null;
  sentByName?: string;
}

// SLA Services Configuration
const SERVICE_OPTIONS = [
  { value: "pickup_delivery", label: "Pickup & Delivery" },
  { value: "parts_delivery", label: "Parts Delivery" },
  { value: "dealer_transfers", label: "Dealer Transfers" },
  { value: "transport", label: "Transport" },
  { value: "other", label: "Other" },
] as const;

const DAYS_OF_WEEK = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
] as const;

interface OperatingHoursDay {
  enabled: boolean;
  start: string;
  end: string;
}

// Opportunities Section Component
function OpportunitiesSection({ accountId }: { accountId: string }) {
  const { toast } = useToast();
  
  const { data: opportunities, isLoading, error } = useQuery<{
    expansionOpportunities: { type: string; title: string; description: string; priority: number }[];
    renewalRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    renewalIndicators: {
      slaPerformance: { score: number; summary: string };
      claimsTrend: { direction: string; summary: string };
      marginTrend: { direction: string; summary: string };
    };
  }>({
    queryKey: ['/api/accounts', accountId, 'opportunities'],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${accountId}/opportunities`);
      if (!response.ok) throw new Error('Failed to fetch opportunities');
      return response.json();
    },
    enabled: !!accountId,
  });

  const createTaskMutation = useMutation({
    mutationFn: async ({ taskType, opportunityDetails }: { taskType: 'expansion' | 'renewal'; opportunityDetails: string }) => {
      return apiRequest("POST", `/api/accounts/${accountId}/opportunity-task`, { taskType, opportunityDetails });
    },
    onSuccess: (_, variables) => {
      toast({
        title: `${variables.taskType === 'expansion' ? 'Expansion' : 'Renewal'} Task Created`,
        description: "Task has been added to the activity timeline",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts', accountId, 'activity'], exact: false });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="card-opportunities">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading opportunities...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !opportunities) {
    return null;
  }

  const getRiskBadgeStyle = (risk: string) => {
    switch (risk) {
      case 'LOW':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'HIGH':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getTrendIcon = (direction: string) => {
    if (direction === 'improving' || direction === 'decreasing') return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (direction === 'declining' || direction === 'increasing') return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Expansion Opportunities Card */}
      <Card data-testid="card-expansion-opportunities">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Expansion Opportunities
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => createTaskMutation.mutate({ 
                taskType: 'expansion', 
                opportunityDetails: opportunities.expansionOpportunities.map(o => o.title).join(', ') || 'General expansion review' 
              })}
              disabled={createTaskMutation.isPending}
              data-testid="button-create-expansion-task"
            >
              <Plus className="h-4 w-4 mr-1" />
              Create Task
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {opportunities.expansionOpportunities.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-opportunities">
              No expansion opportunities detected at this time
            </div>
          ) : (
            <div className="space-y-3" data-testid="list-expansion-opportunities">
              {opportunities.expansionOpportunities.map((opp, index) => (
                <div 
                  key={index} 
                  className="p-3 rounded-lg border bg-muted/30"
                  data-testid={`item-opportunity-${index}`}
                >
                  <div className="flex items-start gap-2">
                    <Target className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <div>
                      <p className="font-medium text-sm">{opp.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{opp.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Renewal Readiness Card */}
      <Card data-testid="card-renewal-readiness">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-5 w-5" />
              Renewal Readiness
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => createTaskMutation.mutate({ 
                taskType: 'renewal', 
                opportunityDetails: `Renewal Risk: ${opportunities.renewalRisk}` 
              })}
              disabled={createTaskMutation.isPending}
              data-testid="button-create-renewal-task"
            >
              <Plus className="h-4 w-4 mr-1" />
              Create Task
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Renewal Risk Badge */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Renewal Risk</span>
              <Badge 
                className={getRiskBadgeStyle(opportunities.renewalRisk)}
                data-testid="badge-renewal-risk"
              >
                {opportunities.renewalRisk}
              </Badge>
            </div>

            <div className="border-t pt-4 space-y-3">
              {/* SLA Performance */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">SLA Performance</span>
                <div className="flex items-center gap-2">
                  <span className={opportunities.renewalIndicators.slaPerformance.score >= 90 ? 'text-green-600' : opportunities.renewalIndicators.slaPerformance.score >= 70 ? 'text-yellow-600' : 'text-red-600'}>
                    {opportunities.renewalIndicators.slaPerformance.score}%
                  </span>
                </div>
              </div>

              {/* Claims Trend */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Claims Trend</span>
                <div className="flex items-center gap-1">
                  {getTrendIcon(opportunities.renewalIndicators.claimsTrend.direction)}
                  <span className="capitalize">{opportunities.renewalIndicators.claimsTrend.direction}</span>
                </div>
              </div>

              {/* Margin Trend */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Margin Trend</span>
                <div className="flex items-center gap-1">
                  {getTrendIcon(opportunities.renewalIndicators.marginTrend.direction)}
                  <span className="capitalize">{opportunities.renewalIndicators.marginTrend.direction}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface SlaFormData {
  enabledServices: string[];
  operatingHours: Record<string, OperatingHoursDay>;
  coverageExpectation: string;
  icAllowed: boolean;
  employeeOnly: boolean;
  driverTier: string;
  techPartnerName: string;
  techPartnerAccountId: string;
}

// SLA & Services Tab Component
function SlaServicesTab({ customerId, customer }: { customerId: string; customer: Customer }) {
  const { toast } = useToast();
  
  const parseEnabledServices = (): string[] => {
    try {
      return customer.enabledServices ? JSON.parse(customer.enabledServices) : [];
    } catch { return []; }
  };
  
  const parseOperatingHours = (): Record<string, OperatingHoursDay> => {
    const defaultHours: Record<string, OperatingHoursDay> = {};
    DAYS_OF_WEEK.forEach(day => {
      defaultHours[day] = { enabled: day !== "saturday" && day !== "sunday", start: "08:00", end: "17:00" };
    });
    try {
      return customer.operatingHours ? { ...defaultHours, ...JSON.parse(customer.operatingHours) } : defaultHours;
    } catch { return defaultHours; }
  };
  
  const [formData, setFormData] = useState<SlaFormData>({
    enabledServices: parseEnabledServices(),
    operatingHours: parseOperatingHours(),
    coverageExpectation: customer.coverageExpectation || "best_effort",
    icAllowed: customer.icAllowed ?? true,
    employeeOnly: customer.employeeOnly ?? false,
    driverTier: customer.driverTier || "any",
    techPartnerName: (customer as any).techPartnerName || "",
    techPartnerAccountId: (customer as any).techPartnerAccountId || "",
  });

  // Auto-save state for the SLA section.
  const [slaSaveState, setSlaSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const slaAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slaFirstRender = useRef(true);
  const slaIsAutoSave = useRef(false);
  
  const saveMutation = useMutation({
    mutationFn: async (data: SlaFormData) => {
      const res = await apiRequest("PATCH", `/api/accounts/${customerId}/sla-settings`, {
        enabledServices: JSON.stringify(data.enabledServices),
        operatingHours: JSON.stringify(data.operatingHours),
        coverageExpectation: data.coverageExpectation,
        icAllowed: data.icAllowed,
        employeeOnly: data.employeeOnly,
        driverTier: data.driverTier,
        techPartnerName: data.techPartnerName || null,
        techPartnerAccountId: data.techPartnerAccountId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", customerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", customerId, "activity"], exact: false });
      // Toast only for manual saves — auto-save uses the slaSaveState indicator instead.
      if (!slaIsAutoSave.current) {
        toast({ title: "SLA settings saved successfully" });
      }
    },
    onError: (error: Error) => {
      if (slaIsAutoSave.current) {
        setSlaSaveState("error");
      } else {
        toast({ title: "Error saving SLA settings", description: error.message, variant: "destructive" });
      }
    },
  });

  // Stable ref so the auto-save effect does not need saveMutation in its dep array.
  const slaSaveMutationRef = useRef(saveMutation);
  slaSaveMutationRef.current = saveMutation;

  // Auto-save whenever formData changes (skip the very first render so we don't
  // save the initial customer data back to the server immediately on mount).
  useEffect(() => {
    if (slaFirstRender.current) { slaFirstRender.current = false; return; }
    if (slaAutoSaveTimerRef.current) clearTimeout(slaAutoSaveTimerRef.current);
    slaAutoSaveTimerRef.current = setTimeout(async () => {
      slaIsAutoSave.current = true;
      setSlaSaveState("saving");
      try {
        await slaSaveMutationRef.current.mutateAsync(formData);
        setSlaSaveState("saved");
        setTimeout(() => { setSlaSaveState("idle"); slaIsAutoSave.current = false; }, 2500);
      } catch {
        setSlaSaveState("error");
        slaIsAutoSave.current = false;
      }
    }, 800);
    return () => { if (slaAutoSaveTimerRef.current) clearTimeout(slaAutoSaveTimerRef.current); };
  // slaSaveMutationRef is stable; formData is the only real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);
  
  const toggleService = (value: string) => {
    setFormData(prev => ({
      ...prev,
      enabledServices: prev.enabledServices.includes(value)
        ? prev.enabledServices.filter(s => s !== value)
        : [...prev.enabledServices, value],
    }));
  };
  
  const updateOperatingHours = (day: string, field: keyof OperatingHoursDay, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        [day]: { ...prev.operatingHours[day], [field]: value },
      },
    }));
  };
  
  return (
    <div className="space-y-6">
      <Card data-testid="card-enabled-services">
        <CardHeader>
          <CardTitle>Enabled Services</CardTitle>
          <CardDescription>Select which services are active for this account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {SERVICE_OPTIONS.map(({ value, label }) => (
              <div key={value} className="flex items-center space-x-2">
                <Checkbox
                  id={`service-${value}`}
                  checked={formData.enabledServices.includes(value)}
                  onCheckedChange={() => toggleService(value)}
                  data-testid={`checkbox-service-${value}`}
                />
                <Label htmlFor={`service-${value}`} className="cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-operating-hours">
        <CardHeader>
          <CardTitle>Operating Hours</CardTitle>
          <CardDescription>Define operating hours for each day</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {DAYS_OF_WEEK.map(day => (
              <div key={day} className="flex items-center gap-4 flex-wrap">
                <div className="w-28 flex items-center space-x-2">
                  <Checkbox
                    id={`hours-${day}`}
                    checked={formData.operatingHours[day]?.enabled ?? false}
                    onCheckedChange={(checked) => updateOperatingHours(day, "enabled", !!checked)}
                    data-testid={`checkbox-day-${day}`}
                  />
                  <Label htmlFor={`hours-${day}`} className="cursor-pointer capitalize">{day}</Label>
                </div>
                {formData.operatingHours[day]?.enabled && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={formData.operatingHours[day]?.start || "08:00"}
                      onChange={(e) => updateOperatingHours(day, "start", e.target.value)}
                      className="w-32"
                      data-testid={`input-start-${day}`}
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={formData.operatingHours[day]?.end || "17:00"}
                      onChange={(e) => updateOperatingHours(day, "end", e.target.value)}
                      className="w-32"
                      data-testid={`input-end-${day}`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-coverage-expectations">
        <CardHeader>
          <CardTitle>Coverage Expectations</CardTitle>
          <CardDescription>Define the level of service commitment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>Coverage Type</Label>
              <Select
                value={formData.coverageExpectation}
                onValueChange={(value) => setFormData(prev => ({ ...prev, coverageExpectation: value }))}
              >
                <SelectTrigger data-testid="select-coverage-expectation" className="w-64">
                  <SelectValue placeholder="Select coverage type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guaranteed">Guaranteed</SelectItem>
                  <SelectItem value="best_effort">Best Effort</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-driver-requirements">
        <CardHeader>
          <CardTitle>Driver Requirements</CardTitle>
          <CardDescription>Configure driver eligibility for this account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="ic-allowed"
                checked={formData.icAllowed}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, icAllowed: !!checked }))}
                data-testid="checkbox-ic-allowed"
              />
              <Label htmlFor="ic-allowed" className="cursor-pointer">IC (Independent Contractor) Allowed</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="employee-only"
                checked={formData.employeeOnly}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, employeeOnly: !!checked }))}
                data-testid="checkbox-employee-only"
              />
              <Label htmlFor="employee-only" className="cursor-pointer">Employee Only</Label>
            </div>
            <div>
              <Label>Driver Tier</Label>
              <Select
                value={formData.driverTier}
                onValueChange={(value) => setFormData(prev => ({ ...prev, driverTier: value }))}
              >
                <SelectTrigger data-testid="select-driver-tier" className="w-64">
                  <SelectValue placeholder="Select driver tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="tier_1">Tier 1</SelectItem>
                  <SelectItem value="tier_2">Tier 2</SelectItem>
                  <SelectItem value="tier_3">Tier 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-sla-metrics">
        <CardHeader>
          <CardTitle>SLA Metrics</CardTitle>
          <CardDescription>Performance against SLA expectations (v1 - placeholder metrics)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-md">
              <div className="text-2xl font-bold" data-testid="text-late-pickups">
                {customer.slaLatePickups ?? 0}
              </div>
              <p className="text-sm text-muted-foreground">Late Pickups</p>
            </div>
            <div className="p-4 border rounded-md">
              <div className="text-2xl font-bold" data-testid="text-missed-coverage">
                {customer.slaMissedCoverage ?? 0}
              </div>
              <p className="text-sm text-muted-foreground">Missed Coverage</p>
            </div>
            <div className="p-4 border rounded-md">
              <div className="text-2xl font-bold" data-testid="text-escalations">
                {customer.slaEscalations ?? 0}
              </div>
              <p className="text-sm text-muted-foreground">Escalations</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-technology-partner">
        <CardHeader>
          <CardTitle>Technology Partner</CardTitle>
          <CardDescription>Link this account to a third-party technology partner platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="tech-partner-name">Partner Name</Label>
              <Select
                value={formData.techPartnerName}
                onValueChange={(value) => setFormData(prev => ({ ...prev, techPartnerName: value }))}
              >
                <SelectTrigger id="tech-partner-name" data-testid="select-tech-partner-name" className="w-full">
                  <SelectValue placeholder="Select a partner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RedCap">RedCap</SelectItem>
                  <SelectItem value="Draiver">Draiver</SelectItem>
                  <SelectItem value="DriverConnect">DriverConnect</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tech-partner-account-id">Account ID</Label>
              <Input
                id="tech-partner-account-id"
                value={formData.techPartnerAccountId}
                onChange={(e) => setFormData(prev => ({ ...prev, techPartnerAccountId: e.target.value }))}
                placeholder="Partner-assigned account identifier"
                data-testid="input-tech-partner-account-id"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {/* Auto-save indicator — mirrors the Account detail page's Saving/Saved pattern */}
        {slaSaveState !== "idle" && (
          <span className={`flex items-center gap-1 text-xs ${
            slaSaveState === "saving" ? "text-muted-foreground"
            : slaSaveState === "saved"  ? "text-emerald-600"
            : "text-red-600"
          }`}>
            {slaSaveState === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
            {slaSaveState === "saved"  && <CheckCircle2 className="h-3 w-3" />}
            {slaSaveState === "error"  && <AlertCircle className="h-3 w-3" />}
            {slaSaveState === "saving" ? "Saving…"
              : slaSaveState === "saved"  ? "Saved"
              : "Unable to save"}
          </span>
        )}
        <Button
          onClick={() => { slaIsAutoSave.current = false; saveMutation.mutate(formData); }}
          disabled={saveMutation.isPending}
          data-testid="button-save-sla"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save SLA Settings"}
        </Button>
      </div>
    </div>
  );
}

// Claims Efficiency Types
interface ClaimsEfficiencyData {
  period30: {
    claimsPer1000Moves: number;
    claimDollarPerMove: number;
    totalClaimsCost: number;
    claimsCount: number;
    movesCount: number;
    trends: {
      claimsPer1000: { direction: 'up' | 'down' | 'flat'; change: number };
      claimDollarPerMove: { direction: 'up' | 'down' | 'flat'; change: number };
      totalCost: { direction: 'up' | 'down' | 'flat'; change: number };
    };
  };
  period90: {
    claimsPer1000Moves: number;
    claimDollarPerMove: number;
    totalClaimsCost: number;
    claimsCount: number;
    movesCount: number;
    trends: {
      claimsPer1000: { direction: 'up' | 'down' | 'flat'; change: number };
      claimDollarPerMove: { direction: 'up' | 'down' | 'flat'; change: number };
      totalCost: { direction: 'up' | 'down' | 'flat'; change: number };
    };
  };
  monthlyTrend: {
    month: string;
    claims: number;
    moves: number;
    claimsPer1000: number;
    claimDollarPerMove: number;
    totalCost: number;
  }[];
}

// Trend indicator component
function TrendIndicator({ direction, change }: { direction: 'up' | 'down' | 'flat'; change: number }) {
  const absChange = Math.abs(change);
  if (direction === 'flat') {
    return (
      <div className="flex items-center gap-1 text-muted-foreground" data-testid="trend-flat">
        <Minus className="h-3 w-3" />
        <span className="text-xs">Flat</span>
      </div>
    );
  }
  if (direction === 'down') {
    return (
      <div className="flex items-center gap-1 text-green-600" data-testid="trend-down">
        <TrendingDown className="h-3 w-3" />
        <span className="text-xs">{absChange.toFixed(0)}%</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-red-600" data-testid="trend-up">
      <TrendingUp className="h-3 w-3" />
      <span className="text-xs">{absChange.toFixed(0)}%</span>
    </div>
  );
}

// Claims Snapshot Card for Account Overview
function ClaimsSnapshotCard({ customerId }: { customerId: string }) {
  const [period, setPeriod] = useState<'30' | '90'>('30');
  
  const { data, isLoading, error } = useQuery<ClaimsEfficiencyData>({
    queryKey: ['/api/accounts', customerId, 'claims-efficiency'],
    queryFn: async () => {
      const res = await fetch(`/api/accounts/${customerId}/claims-efficiency`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch claims efficiency');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="card-claims-snapshot">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Claims Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card data-testid="card-claims-snapshot">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Claims Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load claims data</p>
        </CardContent>
      </Card>
    );
  }

  const periodData = period === '30' ? data.period30 : data.period90;

  return (
    <Card data-testid="card-claims-snapshot">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Claims Snapshot
          </CardTitle>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={period === '30' ? 'default' : 'outline'}
              onClick={() => setPeriod('30')}
              className="h-7 px-2 text-xs"
              data-testid="button-period-30"
            >
              30 Days
            </Button>
            <Button
              size="sm"
              variant={period === '90' ? 'default' : 'outline'}
              onClick={() => setPeriod('90')}
              className="h-7 px-2 text-xs"
              data-testid="button-period-90"
            >
              90 Days
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Claims per 1,000 Moves */}
          <div className="flex justify-between items-center group relative">
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">Claims per 1,000 Moves</span>
              <div className="relative">
                <AlertCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none border">
                  Claims per 1,000 Moves measures how often incidents occur.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold" data-testid="text-claims-per-1000">{periodData.claimsPer1000Moves.toFixed(1)}</span>
              <TrendIndicator direction={periodData.trends.claimsPer1000.direction} change={periodData.trends.claimsPer1000.change} />
            </div>
          </div>

          {/* Claim $ per Move */}
          <div className="flex justify-between items-center group relative">
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">Claim $ per Move</span>
              <div className="relative">
                <AlertCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none border">
                  Claim $ per Move measures how costly incidents are per move.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold" data-testid="text-claim-dollar-per-move">${periodData.claimDollarPerMove.toFixed(2)}</span>
              <TrendIndicator direction={periodData.trends.claimDollarPerMove.direction} change={periodData.trends.claimDollarPerMove.change} />
            </div>
          </div>

          {/* Total Claims $ */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Claims $</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold" data-testid="text-total-claims-cost">${periodData.totalClaimsCost.toLocaleString()}</span>
              <TrendIndicator direction={periodData.trends.totalCost.direction} change={periodData.trends.totalCost.change} />
            </div>
          </div>

          {/* Context: Moves volume */}
          <div className="pt-2 border-t">
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Based on {periodData.movesCount.toLocaleString()} moves</span>
              <span>{periodData.claimsCount} claims</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Volume Momentum Type
interface VolumeMomentumData {
  score: number;
  label: 'Growing' | 'Flat' | 'Declining';
  yoyChange: number;
  qoqChange: number;
  volatility: number;
  currentYearMoves: number;
  priorYearMoves: number;
  currentQuarterMoves: number;
  priorQuarterMoves: number;
  monthlyVolumes: { month: string; moves: number }[];
}

// Volume Momentum Card for Account Overview
function VolumeMomentumCard({ customerId }: { customerId: string }) {
  const { data, isLoading, error } = useQuery<VolumeMomentumData>({
    queryKey: ['/api/accounts', customerId, 'volume-momentum'],
    queryFn: async () => {
      const res = await fetch(`/api/accounts/${customerId}/volume-momentum`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch volume momentum');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="card-volume-momentum">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Volume Momentum
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card data-testid="card-volume-momentum">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Volume Momentum
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load volume data</p>
        </CardContent>
      </Card>
    );
  }

  // Get color based on score/label
  const getMomentumColor = () => {
    if (data.label === 'Growing')   return 'text-green-600 dark:text-green-400';
    if (data.label === 'Declining') return 'text-red-600 dark:text-red-400';
    return 'text-yellow-600 dark:text-yellow-400';
  };

  const getMomentumBadgeClass = () => {
    if (data.label === 'Growing')   return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (data.label === 'Declining') return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  };

  const getMomentumIcon = () => {
    if (data.label === 'Growing')   return <TrendingUp className="h-4 w-4" />;
    if (data.label === 'Declining') return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  return (
    <Card data-testid="card-volume-momentum">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Volume Momentum
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Score and Label */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`text-3xl font-bold ${getMomentumColor()}`} data-testid="text-volume-score">
                {data.score}
              </div>
              <Badge className={getMomentumBadgeClass()} data-testid="text-volume-label">
                {getMomentumIcon()}
                <span className="ml-1">{data.label}</span>
              </Badge>
            </div>
          </div>

          {/* YoY Change - Primary Context */}
          <div className="flex justify-between items-center group relative">
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">Year-over-Year Change</span>
              <div className="relative">
                <AlertCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none border">
                  Compares move volume to the same period last year.
                </div>
              </div>
            </div>
            <div className={`flex items-center gap-1 font-semibold ${data.yoyChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-yoy-change">
              {data.yoyChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {data.yoyChange >= 0 ? '+' : ''}{data.yoyChange.toFixed(1)}%
            </div>
          </div>

          {/* QoQ Change */}
          <div className="flex justify-between items-center group relative">
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">Quarter-over-Quarter</span>
              <div className="relative">
                <AlertCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none border">
                  Compares current quarter to the prior quarter.
                </div>
              </div>
            </div>
            <div className={`flex items-center gap-1 text-sm ${data.qoqChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-qoq-change">
              {data.qoqChange >= 0 ? '+' : ''}{data.qoqChange.toFixed(1)}%
            </div>
          </div>

          {/* Volatility */}
          <div className="flex justify-between items-center group relative">
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">Volatility</span>
              <div className="relative">
                <AlertCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none border">
                  How much volume varies month-to-month. Lower is more stable.
                </div>
              </div>
            </div>
            <div className="text-sm" data-testid="text-volatility">
              <span className={data.volatility > 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'}>
                {data.volatility.toFixed(1)}%
              </span>
              {data.volatility > 50 && <span className="text-xs ml-1">(High)</span>}
            </div>
          </div>

          {/* Volume Summary */}
          <div className="pt-2 border-t">
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>YTD: {data.currentYearMoves.toLocaleString()} moves</span>
              <span>Prior Year: {data.priorYearMoves.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Claims Efficiency Section for Claims Tab
function ClaimsEfficiencySection({ customerId }: { customerId: string }) {
  const { data, isLoading, error } = useQuery<ClaimsEfficiencyData>({
    queryKey: ['/api/accounts', customerId, 'claims-efficiency'],
    queryFn: async () => {
      const res = await fetch(`/api/accounts/${customerId}/claims-efficiency`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch claims efficiency');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="card-claims-efficiency">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Claims Efficiency
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card data-testid="card-claims-efficiency">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Claims Efficiency
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">Unable to load claims efficiency data</p>
        </CardContent>
      </Card>
    );
  }

  const maxClaimsPer1000 = Math.max(...data.monthlyTrend.map(m => m.claimsPer1000), 1);
  const maxClaimDollarPerMove = Math.max(...data.monthlyTrend.map(m => m.claimDollarPerMove), 1);
  const maxTotalCost = Math.max(...data.monthlyTrend.map(m => m.totalCost), 1);

  return (
    <Card data-testid="card-claims-efficiency">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Claims Efficiency
        </CardTitle>
        <CardDescription>6-month trend of claims efficiency metrics</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Claims per 1,000 Moves Trend */}
          <div>
            <div className="flex items-center gap-1 mb-3">
              <h4 className="text-sm font-medium">Claims per 1,000 Moves</h4>
              <div className="relative group">
                <AlertCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none border">
                  Claims per 1,000 Moves measures how often incidents occur.
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {data.monthlyTrend.map((month, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-10">{month.month}</span>
                  <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-orange-500 transition-all"
                      style={{ width: `${(month.claimsPer1000 / maxClaimsPer1000) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-10 text-right">{month.claimsPer1000.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Claim $ per Move Trend */}
          <div>
            <div className="flex items-center gap-1 mb-3">
              <h4 className="text-sm font-medium">Claim $ per Move</h4>
              <div className="relative group">
                <AlertCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none border">
                  Claim $ per Move measures how costly incidents are per move.
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {data.monthlyTrend.map((month, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-10">{month.month}</span>
                  <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${(month.claimDollarPerMove / maxClaimDollarPerMove) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-12 text-right">${month.claimDollarPerMove.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Moves Volume Context */}
          <div>
            <h4 className="text-sm font-medium mb-3">Moves Volume</h4>
            <div className="space-y-2">
              {data.monthlyTrend.map((month, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-10">{month.month}</span>
                  <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: `${(month.moves / Math.max(...data.monthlyTrend.map(m => m.moves), 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-10 text-right">{month.moves}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-lg font-bold" data-testid="text-efficiency-claims-per-1000-30">
              {data.period30.claimsPer1000Moves.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground">Claims/1K (30d)</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold" data-testid="text-efficiency-claim-dollar-30">
              ${data.period30.claimDollarPerMove.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">$/Move (30d)</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold" data-testid="text-efficiency-claims-per-1000-90">
              {data.period90.claimsPer1000Moves.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground">Claims/1K (90d)</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold" data-testid="text-efficiency-claim-dollar-90">
              ${data.period90.claimDollarPerMove.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">$/Move (90d)</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Claims Intelligence Tab Component
interface ClaimsIntelligence {
  summary: {
    totalClaims: number;
    openClaims: number;
    claimsLast30Days: number;
    claimsLast90Days: number;
    totalPaid: number;
    totalReserved: number;
  };
  severityBuckets: {
    low: number;
    medium: number;
    high: number;
    critical: number;
    unclassified: number;
  };
  topClaimTypes: { type: string; count: number }[];
  problemLocations: { location: string; count: number }[];
  monthlyTrend: { month: string; count: number }[];
  narrative: string;
  riskScore: number;
  riskLevel: string;
  claims: any[];
}

interface ClaimsHistoryData {
  summary: {
    total: number;
    open: number;
    closed: number;
    preventable: number;
    nonPreventable: number;
  };
  financial: {
    estimatedTotal: number;
    actualPaidTotal: number;
  };
  claims: {
    id: string;
    date: string | null;
    driverName: string;
    incidentType: string | null;
    severity: string | null;
    preventability: string | null;
    handlingType: string | null;
    status: string;
    estimatedDamage: number;
  }[];
}

function getClaimStatusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "PAID" || status === "CLOSED") return "secondary";
  if (status === "DENIED") return "destructive";
  if (status === "APPROVED" || status === "SENT_TO_CARRIER") return "default";
  return "outline";
}

function getPreventabilityVariant(val: string | null): "destructive" | "secondary" | "outline" {
  if (val === "Preventable") return "destructive";
  if (val === "Non-Preventable") return "secondary";
  return "outline";
}

function getSeverityVariant(val: string | null): "destructive" | "default" | "secondary" | "outline" {
  if (!val) return "outline";
  const v = val.toUpperCase();
  if (v === "CATASTROPHIC" || v === "CRITICAL") return "destructive";
  if (v === "MAJOR" || v === "HIGH") return "destructive";
  if (v === "MODERATE" || v === "MEDIUM") return "default";
  return "secondary";
}

function ClaimsTab({ customerId }: { customerId: string }) {
  const { data: claimsData, isLoading, error } = useQuery<ClaimsIntelligence>({
    queryKey: ["/api/accounts", customerId, "claims-intelligence"],
    queryFn: async () => {
      const res = await fetch(`/api/accounts/${customerId}/claims-intelligence`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch claims data");
      return res.json();
    },
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<ClaimsHistoryData>({
    queryKey: ["/api/accounts", customerId, "claims-history"],
    queryFn: async () => {
      const res = await fetch(`/api/accounts/${customerId}/claims-history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch claims history");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Card data-testid="card-claims-loading">
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading claims intelligence...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="card-claims-error">
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-muted-foreground">Failed to load claims data</p>
        </CardContent>
      </Card>
    );
  }

  const data = claimsData!;
  const maxMonthlyCount = Math.max(...data.monthlyTrend.map(m => m.count), 1);

  return (
    <div className="space-y-6">
      {/* ── Claims History Section ───────────────────────────────────── */}
      <Card data-testid="card-claims-history">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold">Claims History</CardTitle>
          </div>
          <CardDescription>All claims associated with this account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">Loading claims history...</span>
            </div>
          ) : historyData ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="claims-history-summary">
                <div className="rounded-md border p-3 text-center" data-testid="stat-total-claims">
                  <div className="text-2xl font-bold">{historyData.summary.total}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Total Claims</div>
                </div>
                <div className="rounded-md border p-3 text-center" data-testid="stat-open-claims">
                  <div className={`text-2xl font-bold ${historyData.summary.open > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                    {historyData.summary.open}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Open Claims</div>
                </div>
                <div className="rounded-md border p-3 text-center" data-testid="stat-closed-claims">
                  <div className="text-2xl font-bold text-muted-foreground">{historyData.summary.closed}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Closed Claims</div>
                </div>
                <div className="rounded-md border p-3 text-center" data-testid="stat-preventable-claims">
                  <div className={`text-2xl font-bold ${historyData.summary.preventable > 0 ? "text-destructive" : ""}`}>
                    {historyData.summary.preventable}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Preventable</div>
                </div>
                <div className="rounded-md border p-3 text-center" data-testid="stat-non-preventable-claims">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{historyData.summary.nonPreventable}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Non-Preventable</div>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="grid grid-cols-2 gap-3" data-testid="claims-history-financial">
                <div className="rounded-md border p-3" data-testid="stat-estimated-damage-total">
                  <div className="text-xs text-muted-foreground mb-1">Estimated Damage Total</div>
                  <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                    ${historyData.financial.estimatedTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="rounded-md border p-3" data-testid="stat-actual-paid-total">
                  <div className="text-xs text-muted-foreground mb-1">Actual Paid Damage Total</div>
                  <div className="text-xl font-bold text-foreground">
                    ${historyData.financial.actualPaidTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>

              {/* Claims Table */}
              {historyData.claims.length === 0 ? (
                <div className="py-8 text-center" data-testid="claims-history-empty">
                  <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                  <p className="text-sm text-muted-foreground font-medium">No claims found for this account</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-hidden" data-testid="claims-history-table-wrapper">
                  <Table data-testid="table-claims-history">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Claim ID</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Driver</TableHead>
                        <TableHead className="text-xs">Incident Type</TableHead>
                        <TableHead className="text-xs">Severity</TableHead>
                        <TableHead className="text-xs">Preventability</TableHead>
                        <TableHead className="text-xs">Handling</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Est. Damage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyData.claims.map((claim) => (
                        <TableRow
                          key={claim.id}
                          className="cursor-pointer hover-elevate"
                          onClick={() => window.location.href = `/accidents/${claim.id}`}
                          data-testid={`row-claim-history-${claim.id}`}
                        >
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {claim.id.slice(0, 8).toUpperCase()}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {claim.date ? formatDate(claim.date) : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {claim.driverName}
                          </TableCell>
                          <TableCell>
                            {claim.incidentType ? (
                              <Badge variant="outline" className="text-xs whitespace-nowrap">
                                {claim.incidentType.replace(/_/g, " ")}
                              </Badge>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            {claim.severity ? (
                              <Badge variant={getSeverityVariant(claim.severity)} className="text-xs">
                                {claim.severity}
                              </Badge>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            {claim.preventability ? (
                              <Badge variant={getPreventabilityVariant(claim.preventability)} className="text-xs whitespace-nowrap">
                                {claim.preventability}
                              </Badge>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            {claim.handlingType ? (
                              <Badge variant="outline" className="text-xs">{claim.handlingType}</Badge>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getClaimStatusVariant(claim.status)} className="text-xs">
                              {claim.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {claim.estimatedDamage > 0
                              ? `$${claim.estimatedDamage.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Claims Efficiency Section */}
      <ClaimsEfficiencySection customerId={customerId} />

      {/* Claims Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="claims-summary-cards">
        <Card data-testid="card-open-claims">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-orange-500">{data.summary.openClaims}</div>
            <p className="text-xs text-muted-foreground">Open Claims</p>
          </CardContent>
        </Card>
        <Card data-testid="card-claims-30d">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{data.summary.claimsLast30Days}</div>
            <p className="text-xs text-muted-foreground">Last 30 Days</p>
          </CardContent>
        </Card>
        <Card data-testid="card-claims-90d">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{data.summary.claimsLast90Days}</div>
            <p className="text-xs text-muted-foreground">Last 90 Days</p>
          </CardContent>
        </Card>
        <Card data-testid="card-total-claims">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{data.summary.totalClaims}</div>
            <p className="text-xs text-muted-foreground">Total Claims</p>
          </CardContent>
        </Card>
        <Card data-testid="card-total-paid">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">${data.summary.totalPaid.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total Paid</p>
          </CardContent>
        </Card>
        <Card data-testid="card-total-reserved">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600">${data.summary.totalReserved.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total Reserved</p>
          </CardContent>
        </Card>
      </div>

      {/* Narrative Block */}
      <Card data-testid="card-claims-narrative">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Risk Narrative
          </CardTitle>
          <CardDescription>Auto-generated insights based on claims data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-sm leading-relaxed">{data.narrative}</p>
            </div>
            <Badge 
              variant={data.riskLevel === "HIGH" ? "destructive" : data.riskLevel === "MEDIUM" ? "default" : "secondary"}
              className="shrink-0"
              data-testid="badge-risk-level"
            >
              {data.riskLevel} RISK
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend Chart */}
        <Card data-testid="card-monthly-trend">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Monthly Claims Trend
            </CardTitle>
            <CardDescription>Claims count over the last 12 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.monthlyTrend.map((month, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16">{month.month}</span>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full bg-orange-500 transition-all"
                      style={{ width: `${(month.count / maxMonthlyCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-6 text-right">{month.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Severity Distribution */}
        <Card data-testid="card-severity-distribution">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Severity Distribution
            </CardTitle>
            <CardDescription>Claims by severity level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-600" />
                  <span className="text-sm">Critical</span>
                </div>
                <span className="font-bold">{data.severityBuckets.critical}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="text-sm">High</span>
                </div>
                <span className="font-bold">{data.severityBuckets.high}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-sm">Medium</span>
                </div>
                <span className="font-bold">{data.severityBuckets.medium}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm">Low</span>
                </div>
                <span className="font-bold">{data.severityBuckets.low}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400" />
                  <span className="text-sm">Unclassified</span>
                </div>
                <span className="font-bold">{data.severityBuckets.unclassified}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Claim Types */}
        <Card data-testid="card-top-claim-types">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Claim Types
            </CardTitle>
            <CardDescription>Most frequent claim categories</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topClaimTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No claims recorded</p>
            ) : (
              <div className="space-y-3">
                {data.topClaimTypes.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Badge variant="outline">{item.type.replace("_", " ")}</Badge>
                    <span className="font-semibold">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Problem Locations */}
        <Card data-testid="card-problem-locations">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Problem Locations
            </CardTitle>
            <CardDescription>Locations with repeated issues (2+ claims)</CardDescription>
          </CardHeader>
          <CardContent>
            {data.problemLocations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No repeated location issues detected</p>
            ) : (
              <div className="space-y-3">
                {data.problemLocations.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm truncate flex-1 mr-2">{item.location}</span>
                    <Badge variant="destructive">{item.count} claims</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Claims Table */}
      {data.claims.length > 0 && (
        <Card data-testid="card-recent-claims">
          <CardHeader>
            <CardTitle>Recent Claims</CardTitle>
            <CardDescription>Latest 10 claims for this account</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.claims.map((claim: any) => (
                  <TableRow key={claim.id} data-testid={`row-claim-${claim.id}`}>
                    <TableCell>{formatDate(claim.incidentDate || claim.accidentDate)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{claim.claimType || "N/A"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={
                          claim.claimSeverity === "CRITICAL" ? "destructive" :
                          claim.claimSeverity === "HIGH" ? "destructive" :
                          claim.claimSeverity === "MEDIUM" ? "default" : "secondary"
                        }
                      >
                        {claim.claimSeverity || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell>{claim.claimStatus || claim.status || "N/A"}</TableCell>
                    <TableCell className="max-w-[150px] truncate">{claim.location}</TableCell>
                    <TableCell className="text-right">
                      ${(parseFloat(claim.insurancePaid) || parseFloat(claim.insuranceReserve) || 0).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Documents Tab Component
function DocumentsTab({ customerId, customerName }: { customerId: string; customerName: string }) {
  const { toast } = useToast();
  const { user, isSuperAdmin, isRootSuperAdmin } = useAuth();
  const canDelete = isSuperAdmin || isRootSuperAdmin;
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fileName: string } | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [sendPacketDialogOpen, setSendPacketDialogOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    category: "" as DocumentCategory | "",
    notes: "",
    file: null as File | null,
  });
  const [selectedStandardDocs, setSelectedStandardDocs] = useState<string[]>([]);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientEmails, setRecipientEmails] = useState<string[]>([]);
  const [selectedDocDetail, setSelectedDocDetail] = useState<any>(null);
  const [docDetailSaving, setDocDetailSaving] = useState(false);
  const [docAuditEvents, setDocAuditEvents] = useState<any[]>([]);
  const [docAuditLoading, setDocAuditLoading] = useState(false);

  const formatEventType = (type: string) => {
    const map: Record<string, string> = {
      "document.upload_requested": "Upload Requested",
      "document.upload_completed": "Uploaded",
      "document.viewed": "Viewed",
      "document.updated": "Metadata Updated",
      "document.deleted": "Deleted",
      "uploaded": "Uploaded",
      "viewed": "Viewed",
      "downloaded": "Downloaded",
      "deleted": "Deleted",
    };
    return map[type] || type;
  };

  const fetchDocAuditEvents = async (docId: string) => {
    setDocAuditLoading(true);
    try {
      const res = await fetch("/api/documents/" + docId + "/events", { credentials: "include" });
      if (res.ok) {
        const events = await res.json();
        setDocAuditEvents(Array.isArray(events) ? events : []);
      } else {
        setDocAuditEvents([]);
      }
    } catch {
      setDocAuditEvents([]);
    } finally {
      setDocAuditLoading(false);
    }
  };

  // Fetch account documents
  const { data: accountDocuments = [], isLoading: docsLoading } = useQuery<AccountDocument[]>({
    queryKey: ["/api/corporate/customers", customerId, "documents"],
  });

  // Fetch standard documents library
  const { data: standardDocuments = [], isLoading: standardDocsLoading } = useQuery<StandardDocument[]>({
    queryKey: ["/api/corporate/standard-documents"],
  });

  // Fetch document packet logs
  const { data: packetLogs = [], isLoading: logsLoading } = useQuery<DocumentPacketLog[]>({
    queryKey: ["/api/corporate/customers", customerId, "document-packets"],
  });

  // Upload document mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: { filename: string; originalFilename: string; fileUrl: string; fileSize: number; mimeType: string; category: DocumentCategory; notes: string; unifiedDocumentId?: string }) => {
      const res = await apiRequest("POST", `/api/corporate/customers/${customerId}/documents`, formData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", customerId, "documents"] });
      toast({ title: "Document uploaded successfully" });
      setUploadDialogOpen(false);
      setUploadForm({ category: "", notes: "", file: null });
    },
    onError: (error: Error) => {
      toast({ title: "Error uploading document", description: error.message, variant: "destructive" });
    },
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await apiRequest("DELETE", `/api/corporate/customers/${customerId}/documents/${id}`, { deletionReason: reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", customerId, "documents"] });
      setDeleteTarget(null);
      toast({ title: "Document removed", description: "The document has been removed and an audit record created." });
    },
    onError: (error: any) => {
      toast({ title: "Error removing document", description: error.message || "Failed to remove document", variant: "destructive" });
    },
  });

  // Send document packet mutation
  const sendPacketMutation = useMutation({
    mutationFn: async (data: { standardDocumentIds: string[]; recipientEmails: string[] }) => {
      const res = await apiRequest("POST", `/api/corporate/customers/${customerId}/send-document-packet`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", customerId, "document-packets"] });
      toast({ title: "Document packet sent successfully" });
      setSendPacketDialogOpen(false);
      setSelectedStandardDocs([]);
      setRecipientEmails([]);
      setRecipientEmail("");
    },
    onError: (error: Error) => {
      toast({ title: "Error sending document packet", description: error.message, variant: "destructive" });
    },
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [previewMimeType, setPreviewMimeType] = useState<string>("application/octet-stream");
  const [previewTextContent, setPreviewTextContent] = useState<string | null>(null);
  const [previewDocDownloadInfo, setPreviewDocDownloadInfo] = useState<{ fileUrl: string; unifiedDocId?: string | null; docId?: string } | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [previewingDocId, setPreviewingDocId] = useState<string | null>(null);

  const fetchWithRetry = async (url: string, maxAttempts = 3, baseDelayMs = 800): Promise<Response> => {
    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(url, { credentials: 'include' });
        if (response.ok) return response;
        // 404 is definitive — stop retrying immediately (backend already retries internally)
        if (response.status === 404) return response;
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, baseDelayMs * attempt));
          continue;
        }
        return response;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, baseDelayMs * attempt));
        }
      }
    }
    throw lastErr || new Error("All retry attempts failed");
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleDocumentDownload = async (fileUrl: string, filename: string, unifiedDocId?: string | null, docId?: string) => {
    const trackId = docId || unifiedDocId || filename;
    setDownloadingDocId(trackId);
    try {
      // Primary path: unified document service (backend handles retries internally)
      if (unifiedDocId) {
        const response = await fetch(`/api/documents/${unifiedDocId}/download`, { credentials: 'include' });
        if (response.ok) {
          const blob = await response.blob();
          triggerBlobDownload(blob, filename);
          return;
        }
        // Only fall through on 404 (not found in storage) or other failures —
        // the backend already exhausted its own retries before returning.
        console.warn(`[DocDownload] Unified download returned ${response.status}, trying legacy path`);
      }

      // Legacy fallback: /objects/ proxy route (also backed by retry logic server-side)
      const normalizedFileUrl = fileUrl.startsWith("/objects/") ? fileUrl : `/objects/${fileUrl.replace(/^\//, "")}`;
      const legacyResponse = await fetchWithRetry(normalizedFileUrl, 2, 600);
      if (!legacyResponse.ok) {
        let errorDetail = "";
        try {
          const errData = await legacyResponse.json();
          errorDetail = errData.message || errData.error_code || "";
        } catch {}
        toast({ title: "Document failed to load", description: errorDetail || "The file could not be retrieved. Try again or contact support.", variant: "destructive" });
        return;
      }
      const blob = await legacyResponse.blob();
      triggerBlobDownload(blob, filename);
    } catch {
      toast({ title: "Document failed to load", description: "A network error occurred. Please check your connection and try again.", variant: "destructive" });
    } finally {
      setDownloadingDocId(null);
    }
  };

  const isPreviewable = (mimeType: string | null | undefined) => {
    if (!mimeType) return true; // assume previewable when unknown — let preview handle fallback
    return (
      mimeType.startsWith("image/") ||
      mimeType.startsWith("text/") ||
      mimeType === "application/pdf"
    );
  };

  const isOfficeMime = (mime: string, filename: string): boolean => {
    const lower = filename.toLowerCase();
    return (
      mime.includes("spreadsheet") || mime.includes("excel") ||
      mime.includes("wordprocessing") || mime.includes("msword") ||
      mime.includes("presentation") || mime.includes("powerpoint") ||
      lower.endsWith(".xlsx") || lower.endsWith(".xls") ||
      lower.endsWith(".docx") || lower.endsWith(".doc") ||
      lower.endsWith(".pptx") || lower.endsWith(".ppt")
    );
  };

  const openPreview = (blobUrl: string | null, filename: string, mime: string, textContent?: string | null) => {
    setPreviewUrl(blobUrl);
    setPreviewFileName(filename);
    setPreviewMimeType(mime || "application/octet-stream");
    setPreviewTextContent(textContent ?? null);
  };

  const resolveFetchedContent = async (response: Response, filename: string, fallbackMime: string) => {
    const serverCt = response.headers.get("content-type")?.split(";")[0]?.trim() || fallbackMime;
    const lower = filename.toLowerCase();

    // Use filename extension as a reliable fallback when server MIME is generic
    const isCSV = serverCt.includes("csv") || lower.endsWith(".csv");
    const isText = !isCSV && (serverCt.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".html"));
    const isPDF = serverCt === "application/pdf" || lower.endsWith(".pdf");
    const isImage = serverCt.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(lower);

    if (isCSV) {
      const text = await response.text();
      openPreview(null, filename, "text/csv", text);
    } else if (isText) {
      const text = await response.text();
      openPreview(null, filename, serverCt.startsWith("text/") ? serverCt : "text/plain", text);
    } else if (isPDF) {
      const blob = await response.blob();
      openPreview(URL.createObjectURL(blob), filename, "application/pdf");
    } else if (isImage) {
      const blob = await response.blob();
      const effectiveMime = serverCt.startsWith("image/") ? serverCt : "image/jpeg";
      openPreview(URL.createObjectURL(blob), filename, effectiveMime);
    } else {
      // Non-previewable type (Excel, Word, zip, etc.) — show in-app fallback message
      // Do NOT window.open or auto-download; user must use the download icon
      openPreview(null, filename, "unsupported");
    }
  };

  const handleDocumentPreview = async (fileUrl: string, filename: string, mimeType?: string | null, unifiedDocId?: string | null, docId?: string) => {
    const trackId = docId || unifiedDocId || filename;
    setPreviewingDocId(trackId);
    setPreviewDocDownloadInfo({ fileUrl, unifiedDocId, docId });

    try {
      if (unifiedDocId) {
        const previewRes = await fetch(`/api/documents/${unifiedDocId}/preview`, { credentials: 'include' });
        if (previewRes.ok) {
          const data = await previewRes.json();
          const effectiveMime = data.contentType || mimeType || "application/octet-stream";

          if (!data.previewSupported) {
            // Server says type can't be previewed — show controlled in-app fallback, no download
            openPreview(null, filename, "unsupported");
            return;
          }

          // Office files (xlsx, docx, pptx, etc.) — open via Microsoft Office Online viewer
          // Office Online needs a publicly-accessible URL, which the signed URL provides
          if (isOfficeMime(effectiveMime, filename)) {
            if (data.previewUrl && !data.useServerProxy) {
              window.open(
                `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(data.previewUrl)}`,
                "_blank",
                "noopener"
              );
            } else {
              // Server proxy required — signed URL not public, Office Online can't access it
              openPreview(null, filename, "unsupported");
            }
            return;
          }

          if (data.previewUrl && !data.useServerProxy) {
            const assetRes = await fetch(data.previewUrl);
            if (assetRes.ok) {
              await resolveFetchedContent(assetRes, filename, effectiveMime);
              return;
            }
          }

          const downloadRes = await fetch(`/api/documents/${unifiedDocId}/download?disposition=inline`, { credentials: 'include' });
          if (downloadRes.ok) {
            await resolveFetchedContent(downloadRes, filename, effectiveMime);
            return;
          }
        }
        // If all preview attempts fail — show in-app fallback, never trigger external action
        openPreview(null, filename, "unsupported");
        return;
      }

      if (!fileUrl) {
        openPreview(null, filename, "unsupported");
        return;
      }

      const normalizedUrl = fileUrl.startsWith("/objects/") ? fileUrl : `/objects/${fileUrl.replace(/^\//, "")}`;
      const response = await fetchWithRetry(normalizedUrl, 2, 600);
      if (!response.ok) {
        openPreview(null, filename, "unsupported");
        return;
      }
      await resolveFetchedContent(response, filename, mimeType || "application/octet-stream");
    } catch {
      openPreview(null, filename, "unsupported");
    } finally {
      setPreviewingDocId(null);
    }
  };

  const saveDocMetadata = async (docId: string, updates: any) => {
    setDocDetailSaving(true);
    try {
      const res = await apiRequest("PATCH", `/api/documents/${docId}`, updates);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to save");
      }
      const data = await res.json();
      setSelectedDocDetail(data.document);
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/customers", customerId, "documents"] });
      toast({ title: "Document metadata saved" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setDocDetailSaving(false);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadForm.file || !uploadForm.category) {
      toast({ title: "Please select a file and category", variant: "destructive" });
      return;
    }

    setIsUploadingFile(true);
    try {
      const arrayBuffer = await uploadForm.file.arrayBuffer();

      // Atomic upload: stores the file AND creates the unified document record
      // in one transaction, eliminating the race condition in the old two-step approach.
      const uploadRes = await fetch("/api/documents/upload", {
        method: "POST",
        headers: {
          "Content-Type": uploadForm.file.type || "application/octet-stream",
          "x-owner-type": "account",
          "x-owner-id": customerId,
          "x-category": uploadForm.category,
          "x-title": uploadForm.file.name,
          "x-filename": encodeURIComponent(uploadForm.file.name),
        },
        body: arrayBuffer,
        credentials: "include",
      });

      if (!uploadRes.ok) {
        let errorMsg = "Failed to upload file";
        try {
          const errData = await uploadRes.json();
          errorMsg = errData.message || errData.error_code || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const { document: unifiedDoc } = await uploadRes.json();

      // Register in the legacy account documents table with the pre-existing unified ID
      // so the account document route skips creating a duplicate unified record.
      await uploadMutation.mutateAsync({
        filename: uploadForm.file.name,
        originalFilename: uploadForm.file.name,
        fileUrl: `/objects/${unifiedDoc.storageKey}`,
        fileSize: uploadForm.file.size,
        mimeType: uploadForm.file.type,
        category: uploadForm.category as DocumentCategory,
        notes: uploadForm.notes,
        unifiedDocumentId: unifiedDoc.id,
      });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setIsUploadingFile(false);
    }
  };

  // Add recipient email
  const addRecipientEmail = () => {
    if (recipientEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      if (!recipientEmails.includes(recipientEmail)) {
        setRecipientEmails([...recipientEmails, recipientEmail]);
      }
      setRecipientEmail("");
    } else {
      toast({ title: "Invalid email address", variant: "destructive" });
    }
  };

  // Get category color
  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Contract": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "Pricing/Quote": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "Compliance": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "Reports": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  // Format file size
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "N/A";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Account Documents Section */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <CardTitle>Account Documents</CardTitle>
              <CardDescription>Documents specific to this customer account</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-document">
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
              <Button variant="outline" onClick={() => setSendPacketDialogOpen(true)} data-testid="button-send-packet">
                <Send className="h-4 w-4 mr-2" />
                Send Document Packet
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {docsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
          ) : accountDocuments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No documents uploaded yet</p>
              <p className="text-sm mt-1">Upload documents to keep track of contracts, quotes, and more</p>
              <Button variant="outline" className="mt-4" onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-empty-state">
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expiration</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountDocuments.map((doc: any) => {
                  const isExpired = doc.expirationDate && parseDateSafe(doc.expirationDate) < new Date();
                  const isExpiringSoon = doc.expirationDate && !isExpired && parseDateSafe(doc.expirationDate) < new Date(Date.now() + 30 * 86400000);
                  return (
                  <TableRow key={doc.id} data-testid={`row-document-${doc.id}`} className="hover-elevate" onClick={() => setSelectedDocDetail({ ...doc })}>
                    <TableCell>
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left hover:text-primary transition-colors cursor-pointer w-full"
                        onClick={(e) => { e.stopPropagation(); handleDocumentPreview(doc.fileUrl, doc.originalFilename || doc.filename, doc.mimeType, doc.unifiedDocumentId, doc.id); }}
                        data-testid={`button-preview-filename-${doc.id}`}
                        title="Click to preview"
                        disabled={previewingDocId === doc.id}
                      >
                        {previewingDocId === doc.id
                          ? <span className="h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin" />
                          : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <div>
                          <div className="font-medium">{doc.label || doc.originalFilename}</div>
                          {doc.label && <div className="text-xs text-muted-foreground">{doc.originalFilename}</div>}
                        </div>
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge className={getCategoryColor(doc.category)}>{doc.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : "outline"} data-testid={`badge-doc-status-${doc.id}`}>
                        {doc.status || "pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {doc.expirationDate ? (
                        <span className={isExpired ? "text-destructive font-medium" : isExpiringSoon ? "text-orange-600 dark:text-orange-400 font-medium" : ""} data-testid={`text-doc-expiration-${doc.id}`}>
                          {formatDate(doc.expirationDate)}
                          {isExpired && " (Expired)"}
                          {isExpiringSoon && " (Soon)"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{formatDate(doc.uploadedAt)}</div>
                      <div className="text-xs text-muted-foreground">{doc.uploadedByName || "Unknown"}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setSelectedDocDetail({ ...doc }); }}
                          data-testid={`button-edit-${doc.id}`}
                          title="Details / Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={downloadingDocId === doc.id}
                          onClick={(e) => { e.stopPropagation(); handleDocumentDownload(doc.fileUrl, doc.originalFilename || doc.filename, doc.unifiedDocumentId, doc.id); }}
                          data-testid={`button-download-${doc.id}`}
                        >
                          {downloadingDocId === doc.id ? <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <Download className="h-4 w-4" />}
                        </Button>
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: doc.id, fileName: doc.originalFilename || doc.filename }); }}
                            data-testid={`button-delete-${doc.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Standard Documents Library */}
      <Card>
        <CardHeader>
          <CardTitle>Standard Documents Library</CardTitle>
          <CardDescription>Global documents available for all accounts</CardDescription>
        </CardHeader>
        <CardContent>
          {standardDocsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading library...</div>
          ) : standardDocuments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No standard documents available</p>
              <p className="text-sm mt-1">Admins can add documents to the library</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {standardDocuments.map((doc) => (
                <Card key={doc.id} className="p-4" data-testid={`card-standard-doc-${doc.id}`}>
                  <div className="flex items-start gap-3">
                    <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">{doc.name}</h4>
                      {doc.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{doc.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(doc.fileSize)}</span>
                        <span>•</span>
                        <span>{formatDate(doc.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDocumentPreview(doc.fileUrl, doc.originalFilename || doc.filename || doc.name, doc.mimeType, null, doc.id)}
                        disabled={previewingDocId === doc.id}
                        title="Preview"
                        data-testid={`button-preview-standard-${doc.id}`}
                      >
                        {previewingDocId === doc.id ? <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDocumentDownload(doc.fileUrl, doc.originalFilename || doc.filename || doc.name, null, doc.id)}
                        disabled={downloadingDocId === doc.id}
                        title="Download"
                        data-testid={`button-download-standard-${doc.id}`}
                      >
                        {downloadingDocId === doc.id ? <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <Download className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Packet Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle>Document Packet Activity</CardTitle>
          <CardDescription>History of document packets sent to this customer</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading activity...</div>
          ) : packetLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No document packets sent yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documents</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent By</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packetLogs.map((log) => {
                  const docNames = JSON.parse(log.documentNames) as string[];
                  const emails = JSON.parse(log.recipientEmails) as string[];
                  return (
                    <TableRow key={log.id} data-testid={`row-packet-log-${log.id}`}>
                      <TableCell>
                        <div className="space-y-1">
                          {docNames.map((name, i) => (
                            <div key={i} className="text-sm">{name}</div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {emails.map((email, i) => (
                            <div key={i} className="text-sm">{email}</div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.status === "sent" ? "default" : "destructive"}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{log.sentByName || "Unknown"}</TableCell>
                      <TableCell>{formatDate(log.sentAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Document Detail / Edit Metadata Dialog */}
      <Dialog open={!!selectedDocDetail} onOpenChange={(open) => { if (!open) { setSelectedDocDetail(null); setDocAuditEvents([]); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-document-detail">
          <DialogHeader>
            <DialogTitle>Document Detail</DialogTitle>
            <DialogDescription>View and edit document metadata</DialogDescription>
          </DialogHeader>
          {selectedDocDetail && (() => {
            const doc = selectedDocDetail;
            const isExpired = doc.expirationDate && parseDateSafe(doc.expirationDate) < new Date();
            const isExpiringSoon = doc.expirationDate && !isExpired && parseDateSafe(doc.expirationDate) < new Date(Date.now() + 30 * 86400000);
            return (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold" data-testid="text-doc-detail-filename">{doc.originalFilename}</p>
                    <p className="text-sm text-muted-foreground">{doc.category} · {doc.mimeType || "Unknown type"} · {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {isExpired && <Badge variant="destructive" data-testid="badge-doc-detail-expired">Expired</Badge>}
                    {isExpiringSoon && <Badge variant="outline" className="border-orange-500 text-orange-600 dark:text-orange-400" data-testid="badge-doc-detail-expiring-soon">Expiring Soon</Badge>}
                    <Badge variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : "outline"} data-testid="badge-doc-detail-status">
                      {doc.status || "pending"}
                    </Badge>
                  </div>
                </div>

                {doc.verifiedBy && doc.verifiedAt && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3" data-testid="text-doc-detail-verified">
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span>Approved on {new Date(doc.verifiedAt).toLocaleDateString()} at {new Date(doc.verifiedAt).toLocaleTimeString()}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="acct-doc-label" className="text-xs font-medium">Label</Label>
                    <Input
                      id="acct-doc-label"
                      value={doc.label || ""}
                      onChange={(e) => setSelectedDocDetail({ ...doc, label: e.target.value })}
                      placeholder="e.g. Certificate of Insurance 2026"
                      data-testid="input-doc-label"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="acct-doc-type" className="text-xs font-medium">Document Type</Label>
                    <Input
                      id="acct-doc-type"
                      value={doc.docType || ""}
                      onChange={(e) => setSelectedDocDetail({ ...doc, docType: e.target.value })}
                      placeholder="e.g. COI, W-9, Contract"
                      data-testid="input-doc-type"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="acct-doc-issue-date" className="text-xs font-medium">Issue Date</Label>
                    <Input
                      id="acct-doc-issue-date"
                      type="date"
                      value={doc.issueDate || ""}
                      onChange={(e) => setSelectedDocDetail({ ...doc, issueDate: e.target.value || null })}
                      data-testid="input-doc-issue-date"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="acct-doc-expiration-date" className="text-xs font-medium">Expiration Date</Label>
                    <Input
                      id="acct-doc-expiration-date"
                      type="date"
                      value={doc.expirationDate || ""}
                      onChange={(e) => setSelectedDocDetail({ ...doc, expirationDate: e.target.value || null })}
                      data-testid="input-doc-expiration-date"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="acct-doc-status" className="text-xs font-medium">Status</Label>
                    <Select value={doc.status || "pending"} onValueChange={(v) => setSelectedDocDetail({ ...doc, status: v })}>
                      <SelectTrigger data-testid="select-doc-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="acct-doc-notes" className="text-xs font-medium">Notes</Label>
                  <Textarea
                    id="acct-doc-notes"
                    value={doc.notes || ""}
                    onChange={(e) => setSelectedDocDetail({ ...doc, notes: e.target.value })}
                    placeholder="Add notes about this document..."
                    className="resize-none"
                    rows={3}
                    data-testid="textarea-doc-notes"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Activity History</Label>
                  {docAuditLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</div>
                  ) : docAuditEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No activity recorded yet.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border rounded-md divide-y" data-testid="list-doc-audit-events">
                      {docAuditEvents.map((evt: any, idx: number) => (
                        <div key={evt.id || idx} className="px-3 py-2 text-xs space-y-0.5" data-testid={`item-doc-audit-event-${idx}`}>
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-medium">{formatEventType(evt.eventType)}</span>
                            <span className="text-muted-foreground">{new Date(evt.createdAt).toLocaleString()}</span>
                          </div>
                          {evt.metadata?.changes && (
                            <div className="text-muted-foreground">
                              {Object.entries(evt.metadata.changes as Record<string, any>).map(([field, change]: [string, any]) => (
                                <div key={field}>{field}: {String(change.before ?? '\u2014')} \u2192 {String(change.after ?? '\u2014')}</div>
                              ))}
                            </div>
                          )}
                          {evt.metadata?.fileName && !evt.metadata?.changes && (
                            <div className="text-muted-foreground">{evt.metadata.fileName}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" disabled={previewingDocId === doc.id} onClick={(e) => { e.stopPropagation(); handleDocumentPreview(doc.fileUrl, doc.originalFilename || doc.filename, doc.mimeType, doc.unifiedDocumentId, doc.id); }} data-testid="button-doc-detail-preview">
                    {previewingDocId === doc.id ? <span className="mr-1.5 h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <Eye className="mr-1 h-4 w-4" />}
                    Preview
                  </Button>
                  <Button variant="outline" disabled={downloadingDocId === doc.id} onClick={(e) => { e.stopPropagation(); handleDocumentDownload(doc.fileUrl, doc.originalFilename || doc.filename, doc.unifiedDocumentId, doc.id); }} data-testid="button-doc-detail-download">
                    {downloadingDocId === doc.id ? <span className="mr-1.5 h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
                    Download
                  </Button>
                  <div className="flex-1" />
                  <Button variant="outline" onClick={() => setSelectedDocDetail(null)} data-testid="button-doc-detail-cancel">Cancel</Button>
                  <Button
                    disabled={docDetailSaving}
                    onClick={() => saveDocMetadata(doc.id, {
                      label: doc.label || null,
                      docType: doc.docType || null,
                      issueDate: doc.issueDate || null,
                      expirationDate: doc.expirationDate || null,
                      status: doc.status || "pending",
                      notes: doc.notes || null,
                    })}
                    data-testid="button-doc-detail-save"
                  >
                    {docDetailSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent data-testid="dialog-upload-document">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Upload a document to this customer's account</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label required>File</Label>
              <Input
                type="file"
                onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                data-testid="input-upload-file"
              />
            </div>
            <div>
              <Label required>Category</Label>
              <Select
                value={uploadForm.category}
                onValueChange={(value) => setUploadForm({ ...uploadForm, category: value as DocumentCategory })}
              >
                <SelectTrigger data-testid="select-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Contract">Contract</SelectItem>
                  <SelectItem value="Pricing/Quote">Pricing/Quote</SelectItem>
                  <SelectItem value="Compliance">Compliance</SelectItem>
                  <SelectItem value="Reports">Reports</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={uploadForm.notes}
                onChange={(e) => setUploadForm({ ...uploadForm, notes: e.target.value })}
                placeholder="Optional notes about this document"
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleFileUpload} disabled={isUploadingFile || uploadMutation.isPending} data-testid="button-confirm-upload">
              {(isUploadingFile || uploadMutation.isPending) ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Document Packet Dialog */}
      <Dialog open={sendPacketDialogOpen} onOpenChange={setSendPacketDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-send-packet">
          <DialogHeader>
            <DialogTitle>Send Document Packet</DialogTitle>
            <DialogDescription>Select standard documents to send to external recipients</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Documents</Label>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2 mt-2">
                {standardDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`doc-${doc.id}`}
                      checked={selectedStandardDocs.includes(doc.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedStandardDocs([...selectedStandardDocs, doc.id]);
                        } else {
                          setSelectedStandardDocs(selectedStandardDocs.filter(id => id !== doc.id));
                        }
                      }}
                      data-testid={`checkbox-doc-${doc.id}`}
                    />
                    <label htmlFor={`doc-${doc.id}`} className="text-sm cursor-pointer">
                      {doc.name}
                    </label>
                  </div>
                ))}
                {standardDocuments.length === 0 && (
                  <p className="text-sm text-muted-foreground">No standard documents available</p>
                )}
              </div>
            </div>

            <div>
              <Label>Recipient Emails</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="email@example.com"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRecipientEmail())}
                  data-testid="input-recipient-email"
                />
                <Button type="button" variant="outline" onClick={addRecipientEmail} data-testid="button-add-email">
                  Add
                </Button>
              </div>
              {recipientEmails.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {recipientEmails.map((email, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {email}
                      <button
                        onClick={() => setRecipientEmails(recipientEmails.filter((_, idx) => idx !== i))}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendPacketDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendPacketMutation.mutate({ standardDocumentIds: selectedStandardDocs, recipientEmails })}
              disabled={sendPacketMutation.isPending || selectedStandardDocs.length === 0 || recipientEmails.length === 0}
              data-testid="button-confirm-send"
            >
              {sendPacketMutation.isPending ? "Sending..." : "Send Packet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!previewFileName}
        onOpenChange={(open) => {
          if (!open) {
            if (previewUrl) setTimeout(() => URL.revokeObjectURL(previewUrl!), 500);
            setPreviewUrl(null);
            setPreviewFileName("");
            setPreviewMimeType("application/octet-stream");
            setPreviewTextContent(null);
            setPreviewDocDownloadInfo(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden" data-testid="dialog-document-preview">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-semibold truncate">{previewFileName}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {previewDocDownloadInfo && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Download"
                  data-testid="button-preview-dialog-download"
                  onClick={() => handleDocumentDownload(
                    previewDocDownloadInfo.fileUrl,
                    previewFileName,
                    previewDocDownloadInfo.unifiedDocId,
                    previewDocDownloadInfo.docId,
                  )}
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                title="Close"
                onClick={() => setPreviewFileName("")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto min-h-0">
            {previewMimeType === "unsupported" && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
                <Info className="h-10 w-10 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium text-foreground">
                  Preview is not available for this file type.
                </p>
                <p className="text-xs text-muted-foreground">
                  Use the download icon above to save and open the file on your device.
                </p>
              </div>
            )}
            {previewUrl && previewMimeType === "application/pdf" && (
              <iframe
                src={previewUrl}
                title={previewFileName}
                className="w-full border-0"
                style={{ height: "80vh" }}
                data-testid="iframe-document-preview"
              />
            )}
            {previewUrl && previewMimeType.startsWith("image/") && (
              <div className="flex items-center justify-center p-6 min-h-[40vh]">
                <img
                  src={previewUrl}
                  alt={previewFileName}
                  className="max-w-full max-h-[75vh] object-contain rounded-md"
                  data-testid="img-document-preview"
                />
              </div>
            )}
            {previewTextContent !== null && (() => {
              const isCSV = previewMimeType.includes("csv") || previewFileName.toLowerCase().endsWith(".csv");
              if (isCSV) {
                const rows = previewTextContent.trim().split("\n").map(r => r.split(",").map(c => c.trim().replace(/^"(.*)"$/, "$1")));
                return (
                  <div className="overflow-auto p-4 max-h-[75vh]">
                    <table className="text-xs w-full border-collapse" data-testid="table-csv-preview">
                      <thead>
                        <tr>{rows[0]?.map((cell, i) => <th key={i} className="border border-border bg-muted px-2 py-1 text-left font-semibold text-foreground whitespace-nowrap">{cell}</th>)}</tr>
                      </thead>
                      <tbody>
                        {rows.slice(1).map((row, ri) => (
                          <tr key={ri} className="even:bg-muted/40">
                            {row.map((cell, ci) => <td key={ci} className="border border-border px-2 py-1 text-muted-foreground whitespace-nowrap">{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }
              return (
                <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted p-4 m-4 rounded overflow-auto max-h-[75vh]" data-testid="pre-text-preview">
                  {previewTextContent}
                </pre>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <DeleteAttachmentDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        fileName={deleteTarget?.fileName ?? ''}
        context="Account Document"
        onConfirm={(reason) => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id, reason })}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
