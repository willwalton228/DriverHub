import { useState, useRef, useCallback } from "react";
import { formatDate } from "@/lib/dateFormat";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Upload, AlertTriangle, CheckCircle2, TrendingUp, Users, DollarSign,
  Clock, RefreshCw, ChevronRight, Eye, XCircle, FileText, Download,
  BarChart3, Building2, Wrench, Search, History, Filter, Info, ScanSearch,
} from "lucide-react";
import { FileDropZone } from "@/components/ui/FileDropZone";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ImportBatch {
  id: string; sourceFileName: string; sourceFileType: string;
  processingStatus: string; settlementPeriodStart: string | null;
  settlementPeriodEnd: string | null; totalRows: number | null;
  parsedRows: number; matchedRows: number; exceptionRows: number;
  resolvedRows: number | null; unresolvedRows: number | null;
  totalGrossPay: string | null; totalNetPay: string | null;
  uploadedAt: string; notes: string | null;
}
interface Transaction {
  id: string; openforceId: string | null; rawDriverName: string | null;
  periodStart: string | null; periodEnd: string | null;
  hoursWorked: string | null; tripsCompleted: number | null;
  grossPay: string | null; netPay: string | null; deductions: string | null;
  effectiveHourlyRate: string | null; effectivePerTripRate: string | null;
  costPerMove: string | null; matchStatus: string; hasException: boolean;
  exceptionType: string | null; exceptionNote: string | null;
  linkedAccountName: string | null; billingStatus: string | null;
  exceptionResolvedAt: string | null; exceptionResolution: string | null;
}
interface Summary {
  kpis: {
    total_transactions: number; matched_drivers: number;
    total_exceptions: number; open_exceptions: number;
    total_gross_pay: string; total_net_pay: string;
    avg_hourly_rate: string; total_trips: number;
  };
  recentBatches: ImportBatch[];
}
interface PreviewRow {
  rowNumber: number;
  openforceId: string | null;
  driverName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  grossPay: number | null;
  hoursWorked: number | null;
  trips: number | null;
  matchStatus: "matched" | "exception";
  matchedDriverName: string | null;
  exceptionReason: string | null;
}
interface PreviewSummary {
  totalRows: number;
  previewCount: number;
  matchedCount: number;
  exceptionCount: number;
  detectedHeaderRow: number;
  lowConfidence: boolean;
}
interface ImportResult {
  batchId: string;
  totalRows: number;
  matched: number;
  exceptions: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtCurrency = (v: string | number | null | undefined) => {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
};
const fmtNum = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString();
const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s + (s.includes("T") ? "" : "T00:00:00"));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const fmtPeriod = (s: string | null, e: string | null) =>
  s && e ? `${fmtDate(s)} – ${fmtDate(e)}` : s ? `From ${fmtDate(s)}` : "—";
const statusColor = (s: string) => ({
  matched: "default", unmatched: "secondary", exception: "destructive",
  excluded: "outline", committed: "default", failed: "destructive",
  uploaded: "secondary", parsing: "secondary", parsed: "secondary",
  matching: "secondary", pending: "secondary", verified: "default",
}[s] ?? "secondary") as "default" | "secondary" | "destructive" | "outline";

const EXCEPTION_LABELS: Record<string, { label: string; priority: "high" | "medium" | "low" }> = {
  driver_not_marked_as_ic:  { label: "Not Marked as IC",      priority: "high" },
  openforce_id_not_found:   { label: "Driver Not Found",       priority: "medium" },
  duplicate_openforce_id:   { label: "Duplicate OF ID",        priority: "medium" },
  duplicate_transaction:    { label: "Duplicate Transaction",  priority: "medium" },
  missing_openforce_id:     { label: "No OpenForce ID",        priority: "low" },
  missing_required_fields:  { label: "Missing Fields",         priority: "low" },
  abnormal_rate:            { label: "Abnormal Rate",          priority: "medium" },
  // Legacy types (backward-compat display)
  missing_driver:  { label: "Missing Driver",  priority: "medium" },
  not_ic:          { label: "Not IC",          priority: "high" },
  duplicate:       { label: "Duplicate",       priority: "medium" },
  missing_hours:   { label: "Missing Hours",   priority: "low" },
};

const EXCEPTION_TYPE_OPTIONS = [
  { value: "__all__", label: "All Types" },
  { value: "driver_not_marked_as_ic",  label: "Not Marked as IC" },
  { value: "openforce_id_not_found",   label: "Driver Not Found" },
  { value: "duplicate_openforce_id",   label: "Duplicate OF ID" },
  { value: "duplicate_transaction",    label: "Duplicate Transaction" },
  { value: "missing_openforce_id",     label: "No OpenForce ID" },
  { value: "missing_required_fields",  label: "Missing Fields" },
  { value: "abnormal_rate",            label: "Abnormal Rate" },
];

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ title, value, icon: Icon, sub, variant = "default" }: {
  title: string; value: string | number; icon: any; sub?: string;
  variant?: "default" | "warning" | "success" | "danger";
}) {
  const colors = {
    default: "text-foreground",
    warning: "text-yellow-600 dark:text-yellow-400",
    success: "text-green-600 dark:text-green-400",
    danger:  "text-red-600 dark:text-red-400",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground truncate">{title}</p>
            <p className={`text-2xl font-bold mt-1 ${colors[variant]}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="rounded-md bg-muted p-2 shrink-0">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Batch Status Badge ───────────────────────────────────────────────────────
function BatchStatusBadge({ status }: { status: string }) {
  return <Badge variant={statusColor(status)} className="capitalize">{status}</Badge>;
}

// ─── Exception Type Badge ─────────────────────────────────────────────────────
function ExceptionBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const info = EXCEPTION_LABELS[type];
  const label = info?.label ?? type.replace(/_/g, " ");
  const priority = info?.priority ?? "medium";
  const cls = priority === "high"
    ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-700"
    : priority === "medium"
    ? "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-300 dark:border-orange-700"
    : "bg-muted text-muted-foreground border border-border";
  return <Badge variant="outline" className={`text-xs capitalize ${cls}`}>{label}</Badge>;
}

// ─── Reconciliation Status Badge ─────────────────────────────────────────────
function ReconStatusBadge({ status, anomalyCodes }: { status: string | null; anomalyCodes?: string | null }) {
  if (!status || status === "pending") return <Badge variant="secondary" className="text-xs">Pending</Badge>;
  if (status === "reconciled") return <Badge variant="outline" className="text-xs text-green-700 dark:text-green-400 border-green-300 dark:border-green-700">Reconciled</Badge>;
  if (status === "anomaly") return (
    <Badge variant="outline" className="text-xs bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400"
      title={anomalyCodes?.replace(/\|/g, ", ") ?? ""}>
      Anomaly
    </Badge>
  );
  if (status === "variance") return <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-950/30 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400">Variance</Badge>;
  return <Badge variant="secondary" className="text-xs capitalize">{status}</Badge>;
}

// ─── Priority Indicator Dot ───────────────────────────────────────────────────
function PriorityDot({ type }: { type: string | null }) {
  if (!type) return null;
  const priority = EXCEPTION_LABELS[type]?.priority ?? "medium";
  return (
    <span title={`${priority} priority`}
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
        priority === "high" ? "bg-red-500" : priority === "medium" ? "bg-orange-400" : "bg-muted-foreground/40"
      }`}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OpenForceReconciliation() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [headerRow, setHeaderRow] = useState<string>("auto");
  const [mappingTemplate, setMappingTemplate] = useState<string>("openforce_standard");
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [batchDetailOpen, setBatchDetailOpen] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveTx, setResolveTx] = useState<Transaction | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [excludeNote, setExcludeNote] = useState("");
  const [resolveDriverId, setResolveDriverId] = useState<string>("");
  const [reconciliationFilter, setReconciliationFilter] = useState("__all__");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Exception queue filters
  const [exFilterType, setExFilterType] = useState("__all__");
  const [exFilterResolved, setExFilterResolved] = useState("false");
  const [exFilterPeriodFrom, setExFilterPeriodFrom] = useState("");
  const [exFilterPeriodTo, setExFilterPeriodTo] = useState("");
  const [auditTx, setAuditTx] = useState<Transaction | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  // Pay Reconciliation filters
  const [prFilterBatch, setPrFilterBatch] = useState("__all__");
  const [prFilterStatus, setPrFilterStatus] = useState("__all__");
  const [prFilterAnomaly, setPrFilterAnomaly] = useState("__all__");
  const [prFilterPeriodFrom, setPrFilterPeriodFrom] = useState("");
  const [prFilterPeriodTo, setPrFilterPeriodTo] = useState("");
  const [prHighVarianceOnly, setPrHighVarianceOnly] = useState(false);
  const [prDetailRow, setPrDetailRow] = useState<any | null>(null);
  const [prDetailOpen, setPrDetailOpen] = useState(false);

  // Queries
  const summaryQ = useQuery<Summary>({ queryKey: ["/api/corporate/openforce/summary"] });
  const batchesQ = useQuery<{ batches: ImportBatch[] }>({ queryKey: ["/api/corporate/openforce/batches"] });
  const exceptionsQ = useQuery<{ exceptions: any[] }>({
    queryKey: ["/api/corporate/openforce/exceptions", exFilterType, exFilterResolved, exFilterPeriodFrom, exFilterPeriodTo],
    queryFn: () => {
      const p = new URLSearchParams();
      if (exFilterResolved !== "__all__") p.set("resolved", exFilterResolved);
      if (exFilterType !== "__all__") p.set("exceptionType", exFilterType);
      if (exFilterPeriodFrom) p.set("periodFrom", exFilterPeriodFrom);
      if (exFilterPeriodTo)   p.set("periodTo", exFilterPeriodTo);
      return fetch(`/api/corporate/openforce/exceptions?${p}`).then(r => r.json());
    },
  });
  const auditLogQ = useQuery<{ auditLog: any[] }>({
    queryKey: ["/api/corporate/openforce/exceptions", auditTx?.id, "audit-log"],
    queryFn: () => fetch(`/api/corporate/openforce/exceptions/${auditTx!.id}/audit-log`).then(r => r.json()),
    enabled: !!auditTx?.id && auditOpen,
  });
  const payReconSummaryQ = useQuery<{ kpis: any; anomalyBreakdown: any[] }>({
    queryKey: ["/api/corporate/openforce/pay-reconciliation/summary", prFilterBatch, prFilterPeriodFrom, prFilterPeriodTo],
    queryFn: () => {
      const p = new URLSearchParams();
      if (prFilterBatch !== "__all__") p.set("batchId", prFilterBatch);
      if (prFilterPeriodFrom) p.set("periodFrom", prFilterPeriodFrom);
      if (prFilterPeriodTo)   p.set("periodTo", prFilterPeriodTo);
      return fetch(`/api/corporate/openforce/pay-reconciliation/summary?${p}`).then(r => r.json());
    },
  });
  const payReconQ = useQuery<{ rows: any[]; total: number }>({
    queryKey: ["/api/corporate/openforce/pay-reconciliation", prFilterBatch, prFilterStatus,
               prFilterAnomaly, prFilterPeriodFrom, prFilterPeriodTo, prHighVarianceOnly],
    queryFn: () => {
      const p = new URLSearchParams();
      if (prFilterBatch !== "__all__")   p.set("batchId", prFilterBatch);
      if (prFilterStatus !== "__all__")  p.set("reconciliationStatus", prFilterStatus);
      if (prFilterAnomaly !== "__all__") p.set("anomalyCode", prFilterAnomaly);
      if (prFilterPeriodFrom)            p.set("periodFrom", prFilterPeriodFrom);
      if (prFilterPeriodTo)              p.set("periodTo", prFilterPeriodTo);
      if (prHighVarianceOnly)            p.set("highVarianceOnly", "true");
      return fetch(`/api/corporate/openforce/pay-reconciliation?${p}`).then(r => r.json());
    },
  });
  const reconciliationQ = useQuery<{ rows: any[] }>({
    queryKey: ["/api/corporate/openforce/reconciliation", reconciliationFilter, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (reconciliationFilter !== "__all__") params.set("matchStatus", reconciliationFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo)   params.set("dateTo", dateTo);
      return fetch(`/api/corporate/openforce/reconciliation?${params}`).then(r => r.json());
    },
  });
  const accountSummaryQ = useQuery<{ accounts: any[] }>({
    queryKey: ["/api/corporate/openforce/account-summary", dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo)   params.set("dateTo", dateTo);
      return fetch(`/api/corporate/openforce/account-summary?${params}`).then(r => r.json());
    },
  });
  const costPerMoveQ = useQuery<{ accounts: any[]; drivers: any[] }>({
    queryKey: ["/api/corporate/openforce/cost-per-move", dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo)   params.set("dateTo", dateTo);
      return fetch(`/api/corporate/openforce/cost-per-move?${params}`).then(r => r.json());
    },
  });
  const batchDetailQ = useQuery<{ batch: ImportBatch; transactions: Transaction[] }>({
    queryKey: ["/api/corporate/openforce/batches", selectedBatch?.id],
    queryFn: () => fetch(`/api/corporate/openforce/batches/${selectedBatch!.id}`).then(r => r.json()),
    enabled: !!selectedBatch?.id && batchDetailOpen,
  });
  const driversQ = useQuery<{ rows: Array<{ id: string; firstName: string; lastName: string; openforceId: string | null }> }>({
    queryKey: ["/api/corporate/drivers", "openforce-assign"],
    queryFn: () => fetch("/api/corporate/drivers?limit=1000", { credentials: "include" }).then(r => r.json()),
    enabled: resolveDialogOpen,
  });

  // Mutations
  const rematchMut = useMutation({
    mutationFn: (batchId: string) => apiRequest("POST", `/api/corporate/openforce/batches/${batchId}/rematch`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/corporate/openforce"] }); toast({ title: "Re-matching complete" }); },
  });
  const deleteBatchMut = useMutation({
    mutationFn: (batchId: string) => apiRequest("DELETE", `/api/corporate/openforce/batches/${batchId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/corporate/openforce"] }); toast({ title: "Batch archived" }); setBatchDetailOpen(false); },
  });
  const resolveMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("POST", `/api/corporate/openforce/exceptions/${id}/resolve`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/openforce"] });
      toast({ title: "Exception resolved" }); setResolveDialogOpen(false); setResolveTx(null); setResolveNote(""); setResolveDriverId("");
    },
  });
  const excludeMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => apiRequest("POST", `/api/corporate/openforce/exceptions/${id}/exclude`, { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/openforce"] });
      toast({ title: "Transaction excluded" }); setResolveDialogOpen(false); setResolveTx(null);
    },
  });
  const reconcileBatchMut = useMutation({
    mutationFn: (batchId: string) => apiRequest("POST", `/api/corporate/openforce/batches/${batchId}/reconcile`),
    onSuccess: (_, batchId) => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/openforce/pay-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["/api/corporate/openforce/cost-per-move"] });
      toast({ title: "Pay reconciliation complete", description: `Batch ${batchId.slice(0, 8)}… processed` });
    },
    onError: () => toast({ title: "Reconciliation failed", variant: "destructive" }),
  });

  // ── Cost Per Move Engine state ─────────────────────────────────────────────
  const [cpmBatch,      setCpmBatch]      = useState("__all__");
  const [cpmPeriodFrom, setCpmPeriodFrom] = useState("");
  const [cpmPeriodTo,   setCpmPeriodTo]   = useState("");
  const [cpmDriverType, setCpmDriverType] = useState("__all__");
  const [cpmAnomalyOnly, setCpmAnomalyOnly] = useState(false);
  const [cpmHighCostOnly, setCpmHighCostOnly] = useState(false);
  const [cpmDetailRow,  setCpmDetailRow]  = useState<any | null>(null);
  const [cpmDetailOpen, setCpmDetailOpen] = useState(false);

  const cpmSummaryQ = useQuery<{ kpis: any; anomalyBreakdown: any[] }>({
    queryKey: ["/api/corporate/openforce/cost-per-move/engine-summary", cpmBatch, cpmPeriodFrom, cpmPeriodTo, cpmDriverType],
    queryFn: () => {
      const p = new URLSearchParams();
      if (cpmBatch !== "__all__") p.set("batchId", cpmBatch);
      if (cpmPeriodFrom) p.set("periodFrom", cpmPeriodFrom);
      if (cpmPeriodTo)   p.set("periodTo",   cpmPeriodTo);
      if (cpmDriverType !== "__all__") p.set("driverType", cpmDriverType);
      return fetch(`/api/corporate/openforce/cost-per-move/engine-summary?${p}`).then(r => r.json());
    },
  });
  const cpmDriverQ = useQuery<{ rows: any[]; total: number }>({
    queryKey: ["/api/corporate/openforce/cost-per-move/driver-summary", cpmBatch, cpmPeriodFrom, cpmPeriodTo, cpmDriverType, cpmAnomalyOnly, cpmHighCostOnly],
    queryFn: () => {
      const p = new URLSearchParams();
      if (cpmBatch !== "__all__") p.set("batchId", cpmBatch);
      if (cpmPeriodFrom) p.set("periodFrom", cpmPeriodFrom);
      if (cpmPeriodTo)   p.set("periodTo",   cpmPeriodTo);
      if (cpmDriverType !== "__all__") p.set("driverType", cpmDriverType);
      if (cpmAnomalyOnly)  p.set("anomalyOnly",  "true");
      if (cpmHighCostOnly) p.set("highCostOnly",  "true");
      return fetch(`/api/corporate/openforce/cost-per-move/driver-summary?${p}`).then(r => r.json());
    },
  });
  const cpmAccountQ = useQuery<{ accounts: any[] }>({
    queryKey: ["/api/corporate/openforce/cost-per-move/account-aggregation", cpmBatch, cpmPeriodFrom, cpmPeriodTo],
    queryFn: () => {
      const p = new URLSearchParams();
      if (cpmBatch !== "__all__") p.set("batchId", cpmBatch);
      if (cpmPeriodFrom) p.set("periodFrom", cpmPeriodFrom);
      if (cpmPeriodTo)   p.set("periodTo",   cpmPeriodTo);
      return fetch(`/api/corporate/openforce/cost-per-move/account-aggregation?${p}`).then(r => r.json());
    },
  });
  const cpmMoveDetailQ = useQuery<{ moves: any[] }>({
    queryKey: ["/api/corporate/openforce/cost-per-move/move-detail", cpmDetailRow?.driver_id, cpmDetailRow?.pay_period_start, cpmDetailRow?.pay_period_end],
    queryFn: () => {
      const p = new URLSearchParams({ driverId: cpmDetailRow!.driver_id });
      if (cpmDetailRow?.pay_period_start) p.set("payPeriodStart", cpmDetailRow.pay_period_start);
      if (cpmDetailRow?.pay_period_end)   p.set("payPeriodEnd",   cpmDetailRow.pay_period_end);
      return fetch(`/api/corporate/openforce/cost-per-move/move-detail?${p}`).then(r => r.json());
    },
    enabled: !!cpmDetailRow?.driver_id && cpmDetailOpen,
  });
  const runCostEngineMut = useMutation({
    mutationFn: (batchId: string) => apiRequest("POST", `/api/corporate/openforce/batches/${batchId}/run-cost-engine`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/openforce/cost-per-move"] });
      toast({ title: "Cost Per Move engine complete" });
    },
    onError: () => toast({ title: "Cost engine failed", variant: "destructive" }),
  });

  const resetUploadState = useCallback(() => {
    setPendingFile(null);
    setPreviewRows(null);
    setPreviewSummary(null);
    setImportResult(null);
    setHeaderRow("auto");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // Preview file — parse + trial match, no DB writes
  const previewFile = useCallback(async (file: File) => {
    setPreviewing(true);
    setPreviewRows(null);
    setPreviewSummary(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mappingTemplate", mappingTemplate);
      formData.append("headerRow", headerRow);
      const resp = await fetch("/api/corporate/openforce/preview", { method: "POST", body: formData });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || "Preview failed");
      if (data.lowConfidence) {
        toast({
          title: "Header row uncertain",
          description: `Low confidence (score ${data.confidence}). Detected Row ${data.detectedHeaderRow}. If the preview looks wrong, select the header row manually.`,
          variant: "destructive",
        });
      }
      setPreviewRows(data.preview);
      setPreviewSummary({
        totalRows: data.totalRows,
        previewCount: data.previewCount,
        matchedCount: data.matchedCount,
        exceptionCount: data.exceptionCount,
        detectedHeaderRow: data.detectedHeaderRow,
        lowConfidence: data.lowConfidence,
      });
    } catch (err: any) {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  }, [mappingTemplate, headerRow, toast]);

  // Upload handler — accepts a File directly, runs after preview confirmation
  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mappingTemplate", mappingTemplate);
      formData.append("headerRow", headerRow);
      const resp = await fetch("/api/corporate/openforce/upload", { method: "POST", body: formData });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || "Upload failed");
      setImportResult({ batchId: data.batchId, totalRows: data.totalRows, matched: data.matched, exceptions: data.exceptions });
      setPreviewRows(null);
      setPreviewSummary(null);
      setPendingFile(null);
      qc.invalidateQueries({ queryKey: ["/api/corporate/openforce"] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [mappingTemplate, headerRow, qc, toast]);

  // Legacy handler for the hidden input (header button)
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    resetUploadState();
    setPendingFile(file);
    setActiveTab("imports");
  }, [resetUploadState]);

  const kpis = summaryQ.data?.kpis;

  // Filter helper for reconciliation table
  const reconRows = (reconciliationQ.data?.rows ?? []).filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (r.raw_driver_name || "").toLowerCase().includes(term)
      || (r.openforce_id || "").toLowerCase().includes(term)
      || (r.linked_account_name || "").toLowerCase().includes(term);
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">OpenForce Reconciliation</h1>
          <p className="text-muted-foreground text-sm mt-1">
            IC labor cost ingestion, driver matching, pay reconciliation, and cost-per-move analysis
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls"
            className="hidden" onChange={handleFileUpload}
            data-testid="input-openforce-file"
          />
          <Select value={mappingTemplate} onValueChange={setMappingTemplate}>
            <SelectTrigger className="w-[200px]" data-testid="select-mapping-template">
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openforce_standard">OpenForce Standard</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            data-testid="button-upload-settlement"
          >
            {uploading
              ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Importing…</>
              : <><Upload className="h-4 w-4 mr-2" />Upload Settlement File</>}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="imports">
            Imports
            {(batchesQ.data?.batches.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-2">{batchesQ.data!.batches.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          <TabsTrigger value="exceptions">
            Exceptions
            {(exceptionsQ.data?.exceptions.length ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-2">{exceptionsQ.data!.exceptions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pay-reconciliation" data-testid="tab-pay-reconciliation">Pay Reconciliation</TabsTrigger>
          <TabsTrigger value="cost">Cost Analysis</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <KPICard
              title="Total Gross Pay" icon={DollarSign}
              value={fmtCurrency(kpis?.total_gross_pay)}
              sub={`Net: ${fmtCurrency(kpis?.total_net_pay)}`}
            />
            <KPICard
              title="Matched Drivers" icon={Users}
              value={fmtNum(kpis?.matched_drivers)}
              sub={`${fmtNum(kpis?.total_transactions)} total records`}
            />
            <KPICard
              title="Match Rate" icon={CheckCircle2}
              value={(() => {
                const total = kpis?.total_transactions ?? 0;
                const matched = kpis?.matched_drivers ?? 0;
                return total > 0 ? `${Math.round((matched / total) * 100)}%` : "—";
              })()}
              sub="records matched to drivers"
              variant={(kpis?.total_transactions ?? 0) > 0 && ((kpis?.matched_drivers ?? 0) / (kpis?.total_transactions ?? 1)) >= 0.9 ? "success" : "warning"}
            />
            <KPICard
              title="Exception Rate" icon={AlertTriangle}
              value={(() => {
                const total = kpis?.total_transactions ?? 0;
                const exc = kpis?.total_exceptions ?? 0;
                return total > 0 ? `${Math.round((exc / total) * 100)}%` : "—";
              })()}
              sub={`${fmtNum(kpis?.open_exceptions)} open exceptions`}
              variant={(kpis?.open_exceptions ?? 0) > 0 ? "warning" : "success"}
            />
            <KPICard
              title="Open Exceptions" icon={XCircle}
              value={fmtNum(kpis?.open_exceptions)}
              sub={`${fmtNum(kpis?.total_exceptions)} total exceptions`}
              variant={(kpis?.open_exceptions ?? 0) > 0 ? "warning" : "success"}
            />
            <KPICard
              title="Avg Hourly Rate" icon={Clock}
              value={kpis?.avg_hourly_rate ? `$${parseFloat(kpis.avg_hourly_rate).toFixed(2)}/hr` : "—"}
              sub={`${fmtNum(kpis?.total_trips)} total trips`}
            />
          </div>

          {/* Recent imports */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Imports</CardTitle>
              <CardDescription>Last 5 settlement file imports</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {(summaryQ.data?.recentBatches ?? []).length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No imports yet. Upload a settlement file to get started.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Matched</TableHead>
                      <TableHead>Exceptions</TableHead>
                      <TableHead>Gross Pay</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryQ.data!.recentBatches.map(b => (
                      <TableRow key={b.id} className="cursor-pointer hover-elevate" onClick={() => {
                        setSelectedBatch(b); setBatchDetailOpen(true); setActiveTab("imports");
                      }}>
                        <TableCell className="font-medium max-w-[200px] truncate" title={b.sourceFileName}>
                          {b.sourceFileName}
                        </TableCell>
                        <TableCell className="text-sm">{fmtPeriod(b.settlementPeriodStart, b.settlementPeriodEnd)}</TableCell>
                        <TableCell>{fmtNum(b.totalRows)}</TableCell>
                        <TableCell>
                          <span className="text-green-600 dark:text-green-400 font-medium">{fmtNum(b.matchedRows)}</span>
                        </TableCell>
                        <TableCell>
                          {b.exceptionRows > 0 ? (
                            <span className="text-yellow-600 dark:text-yellow-400 font-medium" title={
                              b.unresolvedRows != null ? `${b.unresolvedRows} unresolved, ${b.resolvedRows ?? 0} resolved` : ""
                            }>{b.exceptionRows}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>{fmtCurrency(b.totalGrossPay)}</TableCell>
                        <TableCell><BatchStatusBadge status={b.processingStatus} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Imports ── */}
        <TabsContent value="imports" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Settlement File Imports</h2>
            <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["/api/corporate/openforce/batches"] })}>
              <RefreshCw className="h-4 w-4 mr-1" />Refresh
            </Button>
          </div>

          {/* ── Section A: Upload Card ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload Settlement File</CardTitle>
              <CardDescription>
                Step 1: Select your OpenForce settlement file and preview parsed rows before importing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Options row */}
              <div className="flex flex-wrap gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Mapping Template</label>
                  <Select value={mappingTemplate} onValueChange={setMappingTemplate} disabled={previewing || uploading}>
                    <SelectTrigger className="w-[220px]" data-testid="select-mapping-template-imports">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openforce_standard">OpenForce Standard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Header Row</label>
                  <Select value={headerRow} onValueChange={(v) => { setHeaderRow(v); setPreviewRows(null); setPreviewSummary(null); }} disabled={previewing || uploading}>
                    <SelectTrigger className="w-[180px]" data-testid="select-header-row">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      {Array.from({ length: 15 }, (_, i) => i + 1).map(n => (
                        <SelectItem key={n} value={String(n)}>Row {n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Scans first 15 rows. Override if needed.</p>
                </div>
              </div>

              <FileDropZone
                onFileSelect={(f) => { resetUploadState(); setPendingFile(f); }}
                selectedFile={pendingFile}
                onClear={resetUploadState}
                accept=".csv,.xlsx,.xls"
                disabled={previewing || uploading}
                hint="Supports CSV and XLSX files exported from OpenForce"
                testId="dropzone-openforce"
                inputTestId="input-openforce-dropzone-file"
                browseTestId="button-browse-openforce"
              />

              {/* Low-confidence warning */}
              {previewSummary?.lowConfidence && (
                <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-950/20 p-3">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-800 dark:text-yellow-300">
                    Header row auto-detected with low confidence (Row {previewSummary.detectedHeaderRow}). If the preview below looks incorrect, select the header row manually above and re-run Preview.
                  </p>
                </div>
              )}

              {/* Preview File / Change File buttons */}
              {pendingFile && !previewRows && (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => previewFile(pendingFile)}
                    disabled={previewing}
                    data-testid="button-preview-openforce"
                  >
                    {previewing
                      ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Parsing…</>
                      : <><ScanSearch className="h-4 w-4 mr-2" />Preview File</>
                    }
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Parses file and runs trial driver matching — no data is saved until you confirm.
                  </p>
                </div>
              )}
              {previewRows && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => previewFile(pendingFile!)} disabled={previewing} data-testid="button-repreview-openforce">
                    <RefreshCw className="h-3 w-3 mr-1" />Re-run Preview
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetUploadState} data-testid="button-cancel-preview-openforce">
                    Change File
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Section B: Import Result (shown after successful import) ── */}
          {importResult && (
            <Card>
              <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Import Complete
                  </CardTitle>
                  <CardDescription>Batch ID: {importResult.batchId}</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setImportResult(null)}>Dismiss</Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{importResult.totalRows.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total Rows</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{importResult.totalRows.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Parsed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{importResult.matched.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Matched</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-bold ${importResult.exceptions > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"}`}>
                      {importResult.exceptions.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Exceptions</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setActiveTab("reconciliation"); }}>
                    View in Reconciliation
                  </Button>
                  {importResult.exceptions > 0 && (
                    <Button size="sm" variant="outline" onClick={() => { setActiveTab("exceptions"); }}>
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Review {importResult.exceptions} Exception{importResult.exceptions !== 1 ? "s" : ""}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Section B: Preview Grid (shown after preview, before import) ── */}
          {previewRows && previewSummary && pendingFile && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">File Preview</CardTitle>
                    <CardDescription>
                      {previewSummary.totalRows} rows detected — showing {previewSummary.previewCount}.
                      Header auto-detected at Row {previewSummary.detectedHeaderRow}.
                    </CardDescription>
                  </div>
                  {/* Summary strip */}
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                      <CheckCircle2 className="h-4 w-4" />{previewSummary.matchedCount} matched
                    </span>
                    <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 font-medium">
                      <AlertTriangle className="h-4 w-4" />{previewSummary.exceptionCount} exceptions
                    </span>
                    {previewSummary.totalRows > previewSummary.previewCount && (
                      <span className="flex items-center gap-1 text-muted-foreground text-xs">
                        <Info className="h-3 w-3" />Showing first {previewSummary.previewCount} of {previewSummary.totalRows}
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>OpenForce ID</TableHead>
                        <TableHead>Driver Name</TableHead>
                        <TableHead>Pay Period</TableHead>
                        <TableHead className="text-right">Gross Pay</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Trips</TableHead>
                        <TableHead>Matched Driver</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row) => (
                        <TableRow key={row.rowNumber} className={row.matchStatus === "exception" ? "bg-yellow-50/40 dark:bg-yellow-950/10" : ""}>
                          <TableCell className="text-xs text-muted-foreground">{row.rowNumber}</TableCell>
                          <TableCell className="font-mono text-xs">{row.openforceId ?? <span className="text-muted-foreground italic">—</span>}</TableCell>
                          <TableCell className="text-sm">{row.driverName ?? <span className="text-muted-foreground italic">—</span>}</TableCell>
                          <TableCell className="text-xs">{fmtPeriod(row.periodStart, row.periodEnd)}</TableCell>
                          <TableCell className="text-right text-sm">{row.grossPay != null ? fmtCurrency(row.grossPay) : "—"}</TableCell>
                          <TableCell className="text-right text-sm">{row.hoursWorked ?? "—"}</TableCell>
                          <TableCell className="text-right text-sm">{row.trips ?? "—"}</TableCell>
                          <TableCell className="text-sm">
                            {row.matchedDriverName
                              ? <span className="text-green-700 dark:text-green-400">{row.matchedDriverName}</span>
                              : <span className="text-muted-foreground italic">—</span>}
                          </TableCell>
                          <TableCell>
                            {row.matchStatus === "matched"
                              ? <Badge variant="default" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Matched</Badge>
                              : (
                                <div>
                                  <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Exception</Badge>
                                  {row.exceptionReason && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {EXCEPTION_LABELS[row.exceptionReason]?.label ?? row.exceptionReason}
                                    </p>
                                  )}
                                </div>
                              )
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
              {/* Sticky confirm footer */}
              <div className="border-t p-4 flex flex-wrap items-center gap-3 bg-background">
                <Button
                  onClick={() => uploadFile(pendingFile)}
                  disabled={uploading}
                  data-testid="button-import-process-openforce"
                >
                  {uploading
                    ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Importing…</>
                    : <><Upload className="h-4 w-4 mr-2" />Import & Process</>
                  }
                </Button>
                <Button variant="outline" onClick={resetUploadState} disabled={uploading} data-testid="button-cancel-import-openforce">
                  Cancel
                </Button>
                <p className="text-xs text-muted-foreground ml-auto">
                  Runs driver matching, pay reconciliation, and cost-per-move analysis automatically.
                </p>
              </div>
            </Card>
          )}

          {batchesQ.isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading imports…</div>
          ) : (batchesQ.data?.batches ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm text-muted-foreground">No imports yet. Use the upload area above to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Matched</TableHead>
                      <TableHead>Exceptions</TableHead>
                      <TableHead>Gross Pay</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchesQ.data!.batches.map(b => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium max-w-[200px] truncate" title={b.sourceFileName}>
                          <FileText className="h-4 w-4 inline mr-1 text-muted-foreground" />
                          {b.sourceFileName}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDate(b.uploadedAt)}</TableCell>
                        <TableCell className="text-sm">{fmtPeriod(b.settlementPeriodStart, b.settlementPeriodEnd)}</TableCell>
                        <TableCell>{fmtNum(b.totalRows)}</TableCell>
                        <TableCell>
                          <span className="text-green-600 dark:text-green-400 font-semibold">{fmtNum(b.matchedRows)}</span>
                        </TableCell>
                        <TableCell>
                          {b.exceptionRows > 0 ? (
                            <span className="flex items-center gap-1">
                              <span className="text-yellow-600 dark:text-yellow-400 font-semibold">{b.exceptionRows}</span>
                              {b.unresolvedRows != null && b.unresolvedRows > 0 && (
                                <span className="text-xs text-muted-foreground">({b.unresolvedRows} open)</span>
                              )}
                            </span>
                          ) : "0"}
                        </TableCell>
                        <TableCell className="font-medium">{fmtCurrency(b.totalGrossPay)}</TableCell>
                        <TableCell><BatchStatusBadge status={b.processingStatus} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" title="View batch"
                              onClick={() => { setSelectedBatch(b); setBatchDetailOpen(true); }}
                              data-testid={`button-view-batch-${b.id}`}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Re-run matching"
                              disabled={rematchMut.isPending}
                              onClick={() => rematchMut.mutate(b.id)}
                              data-testid={`button-rematch-batch-${b.id}`}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Reconciliation ── */}
        <TabsContent value="reconciliation" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8" placeholder="Search driver, ID, account…"
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                data-testid="input-recon-search"
              />
            </div>
            <Select value={reconciliationFilter} onValueChange={setReconciliationFilter}>
              <SelectTrigger className="w-40" data-testid="select-recon-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Records</SelectItem>
                <SelectItem value="matched">Matched</SelectItem>
                <SelectItem value="exception">Exception</SelectItem>
                <SelectItem value="excluded">Excluded</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" className="w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              placeholder="From" data-testid="input-recon-date-from" />
            <Input type="date" className="w-36" value={dateTo} onChange={e => setDateTo(e.target.value)}
              placeholder="To" data-testid="input-recon-date-to" />
          </div>

          <Card>
            <CardContent className="p-0">
              {reconciliationQ.isLoading ? (
                <div className="py-12 text-center text-muted-foreground">Loading reconciliation data…</div>
              ) : reconRows.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No records found. Import a settlement file first.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>OpenForce ID</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Trips</TableHead>
                        <TableHead className="text-right">Gross Pay</TableHead>
                        <TableHead className="text-right">$/hr</TableHead>
                        <TableHead className="text-right">$/trip</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reconRows.map(r => (
                        <TableRow key={r.id}
                          className={r.has_exception ? "bg-yellow-50/50 dark:bg-yellow-900/10" : undefined}>
                          <TableCell className="font-mono text-xs">{r.openforce_id || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {r.first_name ? `${r.first_name} ${r.last_name}` : r.raw_driver_name || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {fmtPeriod(r.period_start, r.period_end)}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.hours_worked ? parseFloat(r.hours_worked).toFixed(1) : "—"}
                          </TableCell>
                          <TableCell className="text-right">{r.trips_completed ?? "—"}</TableCell>
                          <TableCell className="text-right font-medium">{fmtCurrency(r.gross_pay)}</TableCell>
                          <TableCell className="text-right text-sm">
                            {r.effective_hourly_rate ? `$${parseFloat(r.effective_hourly_rate).toFixed(2)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {r.effective_per_trip_rate ? `$${parseFloat(r.effective_per_trip_rate).toFixed(2)}` : "—"}
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate text-sm">
                            {r.linked_account_name || <span className="text-muted-foreground text-xs">unlinked</span>}
                          </TableCell>
                          <TableCell>
                            {r.has_exception
                              ? <ExceptionBadge type={r.exception_type} />
                              : <Badge variant="default" className="text-xs">Matched</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="px-4 py-2 border-t text-xs text-muted-foreground">
                    Showing {reconRows.length.toLocaleString()} records
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Exceptions ── */}
        <TabsContent value="exceptions" className="space-y-4 mt-4">
          {/* Header + stats row */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Exception Queue</h2>
              <p className="text-sm text-muted-foreground">Driver matching and pay validation exceptions — sorted by priority</p>
            </div>
            <div className="flex items-center gap-2">
              {summaryQ.data && (
                <div className="flex items-center gap-3 text-sm mr-2">
                  <span className="text-muted-foreground">Open:
                    <span className="font-semibold text-destructive ml-1">{summaryQ.data.kpis.open_exceptions}</span>
                  </span>
                  <span className="text-muted-foreground">Total:
                    <span className="font-semibold ml-1">{summaryQ.data.kpis.total_exceptions}</span>
                  </span>
                </div>
              )}
              <Button size="sm" variant="outline"
                onClick={() => qc.invalidateQueries({ queryKey: ["/api/corporate/openforce/exceptions"] })}>
                <RefreshCw className="h-4 w-4 mr-1" />Refresh
              </Button>
            </div>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={exFilterResolved} onValueChange={setExFilterResolved}>
                  <SelectTrigger className="w-36" data-testid="select-ex-filter-resolved">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Unresolved</SelectItem>
                    <SelectItem value="true">Resolved</SelectItem>
                    <SelectItem value="__all__">All</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={exFilterType} onValueChange={setExFilterType}>
                  <SelectTrigger className="w-44" data-testid="select-ex-filter-type">
                    <SelectValue placeholder="Exception Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCEPTION_TYPE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Period:</span>
                  <Input type="date" className="w-36 h-9" value={exFilterPeriodFrom}
                    onChange={e => setExFilterPeriodFrom(e.target.value)}
                    data-testid="input-ex-filter-period-from" />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input type="date" className="w-36 h-9" value={exFilterPeriodTo}
                    onChange={e => setExFilterPeriodTo(e.target.value)}
                    data-testid="input-ex-filter-period-to" />
                </div>
                {(exFilterType !== "__all__" || exFilterPeriodFrom || exFilterPeriodTo) && (
                  <Button size="sm" variant="ghost" onClick={() => {
                    setExFilterType("__all__"); setExFilterPeriodFrom(""); setExFilterPeriodTo("");
                  }} data-testid="button-ex-clear-filters">Clear</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Exception table */}
          {exceptionsQ.isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading exceptions…</div>
          ) : (exceptionsQ.data?.exceptions ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-70" />
                <p className="font-medium">No exceptions match your filters</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {exFilterResolved === "false" ? "All records have been matched or resolved." : "No exceptions found."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-6" />
                      <TableHead>Exception Type</TableHead>
                      <TableHead>OpenForce ID</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Gross Pay</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(exceptionsQ.data?.exceptions ?? []).map((ex: any) => {
                      const isHigh = EXCEPTION_LABELS[ex.exception_type]?.priority === "high";
                      const isResolved = !!ex.exception_resolved_at;
                      const driverDisplayName = ex.resolved_driver_name || ex.raw_driver_name || "—";
                      return (
                        <TableRow key={ex.id}
                          className={isHigh && !isResolved ? "bg-red-50/50 dark:bg-red-950/20" : ""}>
                          <TableCell className="py-2 pr-0">
                            <PriorityDot type={ex.exception_type} />
                          </TableCell>
                          <TableCell className="py-2">
                            <ExceptionBadge type={ex.exception_type} />
                          </TableCell>
                          <TableCell className="font-mono text-xs py-2">{ex.openforce_id || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap py-2">{driverDisplayName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-2">
                            {fmtPeriod(ex.period_start, ex.period_end)}
                          </TableCell>
                          <TableCell className="font-medium py-2">{fmtCurrency(ex.gross_pay)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] py-2">
                            <span title={ex.exception_note ?? ""} className="line-clamp-2">{ex.exception_note || "—"}</span>
                          </TableCell>
                          <TableCell className="py-2">
                            {isResolved
                              ? <Badge variant="outline" className="text-xs text-green-700 dark:text-green-400 border-green-300 dark:border-green-700">Resolved</Badge>
                              : <Badge variant="outline" className="text-xs text-muted-foreground">Open</Badge>
                            }
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex items-center justify-end gap-1">
                              {!isResolved && (
                                <>
                                  <Button size="sm" variant="outline"
                                    onClick={() => { setResolveTx(ex as any); setResolveDialogOpen(true); }}
                                    data-testid={`button-resolve-exception-${ex.id}`}>
                                    Resolve
                                  </Button>
                                  <Button size="icon" variant="ghost"
                                    title="Exclude transaction"
                                    onClick={() => excludeMut.mutate({ id: ex.id, note: "Manually excluded" })}
                                    disabled={excludeMut.isPending}
                                    data-testid={`button-exclude-exception-${ex.id}`}>
                                    <XCircle className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </>
                              )}
                              <Button size="icon" variant="ghost"
                                title="View audit history"
                                onClick={() => { setAuditTx(ex as any); setAuditOpen(true); }}
                                data-testid={`button-audit-exception-${ex.id}`}>
                                <History className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="px-4 py-2 border-t text-xs text-muted-foreground">
                  Showing {(exceptionsQ.data?.exceptions ?? []).length} exception{(exceptionsQ.data?.exceptions ?? []).length !== 1 ? "s" : ""}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Pay Reconciliation ── */}
        <TabsContent value="pay-reconciliation" className="space-y-4 mt-4">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Pay Reconciliation Engine</h2>
              <p className="text-sm text-muted-foreground">Validate what was paid against what the driver actually worked — by pay period</p>
            </div>
            <div className="flex items-center gap-2">
              {prFilterBatch !== "__all__" && (
                <Button size="sm" variant="outline"
                  disabled={reconcileBatchMut.isPending}
                  onClick={() => reconcileBatchMut.mutate(prFilterBatch)}
                  data-testid="button-run-reconciliation">
                  <RefreshCw className="h-4 w-4 mr-1" />
                  {reconcileBatchMut.isPending ? "Running…" : "Re-run Engine"}
                </Button>
              )}
              <Button size="sm" variant="outline"
                onClick={() => {
                  qc.invalidateQueries({ queryKey: ["/api/corporate/openforce/pay-reconciliation"] });
                  qc.invalidateQueries({ queryKey: ["/api/corporate/openforce/pay-reconciliation/summary"] });
                }}>
                <RefreshCw className="h-4 w-4 mr-1" />Refresh
              </Button>
            </div>
          </div>

          {/* KPI cards */}
          {payReconSummaryQ.data?.kpis && (() => {
            const k = payReconSummaryQ.data!.kpis;
            const total = k.total_records ?? 0;
            const reconPct = k.reconciled_pct ? `${parseFloat(k.reconciled_pct).toFixed(1)}%` : "—";
            const variancePct = total > 0 ? `${Math.round((k.variance_count / total) * 100)}%` : "—";
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                <KPICard title="Total Gross Pay" icon={DollarSign}
                  value={fmtCurrency(k.total_gross_pay)} />
                <KPICard title="Matched Drivers" icon={Users}
                  value={fmtNum(k.total_drivers)}
                  sub={`${fmtNum(total)} records`} />
                <KPICard title="Reconciled" icon={CheckCircle2}
                  value={reconPct}
                  sub={`${fmtNum(k.reconciled_count)} records`}
                  variant={parseFloat(reconPct) >= 80 ? "success" : "warning"} />
                <KPICard title="Variance" icon={AlertTriangle}
                  value={variancePct}
                  sub={`${fmtNum(k.variance_count)} records`}
                  variant={(k.variance_count ?? 0) > 0 ? "warning" : "success"} />
                <KPICard title="Anomalies" icon={XCircle}
                  value={fmtNum(k.anomaly_count)}
                  variant={(k.anomaly_count ?? 0) > 0 ? "danger" : "success"} />
                <KPICard title="Avg Hourly Rate" icon={Clock}
                  value={k.avg_effective_hourly_rate ? `$${parseFloat(k.avg_effective_hourly_rate).toFixed(2)}/hr` : "—"} />
                <KPICard title="Avg Trip Rate" icon={TrendingUp}
                  value={k.avg_effective_trip_rate ? `$${parseFloat(k.avg_effective_trip_rate).toFixed(2)}` : "—"} />
              </div>
            );
          })()}

          {/* Anomaly breakdown chips */}
          {(payReconSummaryQ.data?.anomalyBreakdown ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Anomaly breakdown:</span>
              {payReconSummaryQ.data!.anomalyBreakdown.map((a: any) => (
                <Badge key={a.code} variant="outline"
                  className="text-xs bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300 cursor-pointer"
                  onClick={() => setPrFilterAnomaly(a.code === prFilterAnomaly ? "__all__" : a.code)}>
                  {a.code?.replace(/_/g, " ")} <span className="ml-1 font-semibold">×{a.count}</span>
                </Badge>
              ))}
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={prFilterBatch} onValueChange={setPrFilterBatch}>
                  <SelectTrigger className="w-48" data-testid="select-pr-filter-batch">
                    <SelectValue placeholder="All Batches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Batches</SelectItem>
                    {(batchesQ.data?.batches ?? []).map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.sourceFileName} ({fmtDate(b.uploadedAt)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={prFilterStatus} onValueChange={setPrFilterStatus}>
                  <SelectTrigger className="w-40" data-testid="select-pr-filter-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Statuses</SelectItem>
                    <SelectItem value="reconciled">Reconciled</SelectItem>
                    <SelectItem value="variance">Variance</SelectItem>
                    <SelectItem value="anomaly">Anomaly</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={prFilterAnomaly} onValueChange={setPrFilterAnomaly}>
                  <SelectTrigger className="w-48" data-testid="select-pr-filter-anomaly">
                    <SelectValue placeholder="Anomaly Code" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Anomalies</SelectItem>
                    <SelectItem value="high_effective_hourly_rate">High Hourly Rate</SelectItem>
                    <SelectItem value="low_effective_hourly_rate">Low Hourly Rate</SelectItem>
                    <SelectItem value="high_effective_trip_rate">High Trip Rate</SelectItem>
                    <SelectItem value="low_effective_trip_rate">Low Trip Rate</SelectItem>
                    <SelectItem value="hours_variance">Hours Variance</SelectItem>
                    <SelectItem value="trip_variance">Trip Variance</SelectItem>
                    <SelectItem value="pay_with_no_hours">Pay w/ No Hours</SelectItem>
                    <SelectItem value="pay_with_no_trips">Pay w/ No Trips</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Period:</span>
                  <Input type="date" className="w-36 h-9" value={prFilterPeriodFrom}
                    onChange={e => setPrFilterPeriodFrom(e.target.value)}
                    data-testid="input-pr-period-from" />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input type="date" className="w-36 h-9" value={prFilterPeriodTo}
                    onChange={e => setPrFilterPeriodTo(e.target.value)}
                    data-testid="input-pr-period-to" />
                </div>
                <Button size="sm"
                  variant={prHighVarianceOnly ? "default" : "outline"}
                  onClick={() => setPrHighVarianceOnly(v => !v)}
                  data-testid="button-pr-high-variance">
                  High Variance Only
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Main Grid */}
          {payReconQ.isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Running reconciliation analysis…</div>
          ) : (payReconQ.data?.rows ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="font-medium">No reconciliation data</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload and match an OpenForce settlement file to generate reconciliation results.
                  The engine runs automatically after matching.
                </p>
                {prFilterBatch !== "__all__" && (
                  <Button size="sm" className="mt-4" onClick={() => reconcileBatchMut.mutate(prFilterBatch)}
                    disabled={reconcileBatchMut.isPending}>
                    Run Reconciliation Engine
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Driver</TableHead>
                        <TableHead>OpenForce ID</TableHead>
                        <TableHead>Pay Period</TableHead>
                        <TableHead className="text-right">Gross Pay</TableHead>
                        <TableHead className="text-right">Rpt Hours</TableHead>
                        <TableHead className="text-right">Sys Hours</TableHead>
                        <TableHead className="text-right">Hrs Var</TableHead>
                        <TableHead className="text-right">Rpt Trips</TableHead>
                        <TableHead className="text-right">Sys Trips</TableHead>
                        <TableHead className="text-right">Trip Var</TableHead>
                        <TableHead className="text-right">$/hr</TableHead>
                        <TableHead className="text-right">$/trip</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(payReconQ.data?.rows ?? []).map((row: any) => {
                        const isAnomaly = row.anomaly_flag;
                        const isVariance = row.reconciliation_status === "variance";
                        const hoursVar = row.hours_variance !== null ? parseFloat(row.hours_variance) : null;
                        const tripVar = row.trip_variance !== null ? parseInt(row.trip_variance) : null;
                        const rowCls = isAnomaly
                          ? "bg-red-50/40 dark:bg-red-950/20"
                          : isVariance ? "bg-yellow-50/40 dark:bg-yellow-950/20" : "";
                        return (
                          <TableRow key={row.id} className={rowCls}>
                            <TableCell className="font-medium whitespace-nowrap py-2">
                              {row.driver_name || row.raw_driver_name || "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs py-2">{row.openforce_id || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-2">
                              {fmtPeriod(row.pay_period_start, row.pay_period_end)}
                            </TableCell>
                            <TableCell className="text-right font-semibold py-2">{fmtCurrency(row.gross_pay)}</TableCell>
                            <TableCell className="text-right py-2">
                              {row.reported_hours ? parseFloat(row.reported_hours).toFixed(2) : "—"}
                            </TableCell>
                            <TableCell className="text-right py-2">
                              {row.system_hours ? parseFloat(row.system_hours).toFixed(2) : "—"}
                            </TableCell>
                            <TableCell className="text-right py-2">
                              {hoursVar !== null ? (
                                <span className={Math.abs(hoursVar) > 0.5 ? "text-yellow-600 dark:text-yellow-400 font-semibold" : ""}>
                                  {hoursVar > 0 ? "+" : ""}{hoursVar.toFixed(2)}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-right py-2">{row.reported_trips ?? "—"}</TableCell>
                            <TableCell className="text-right py-2">{row.system_trips ?? "—"}</TableCell>
                            <TableCell className="text-right py-2">
                              {tripVar !== null ? (
                                <span className={Math.abs(tripVar) > 0 ? "text-yellow-600 dark:text-yellow-400 font-semibold" : ""}>
                                  {tripVar > 0 ? "+" : ""}{tripVar}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-right py-2 text-sm">
                              {row.effective_hourly_rate ? (
                                <span className={
                                  parseFloat(row.effective_hourly_rate) > 75 ? "text-red-600 dark:text-red-400 font-semibold" :
                                  parseFloat(row.effective_hourly_rate) < 8 ? "text-orange-600 dark:text-orange-400 font-semibold" : ""
                                }>
                                  ${parseFloat(row.effective_hourly_rate).toFixed(2)}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-right py-2 text-sm">
                              {row.effective_trip_rate ? (
                                <span className={
                                  parseFloat(row.effective_trip_rate) > 50 ? "text-red-600 dark:text-red-400 font-semibold" :
                                  parseFloat(row.effective_trip_rate) < 5 ? "text-orange-600 dark:text-orange-400 font-semibold" : ""
                                }>
                                  ${parseFloat(row.effective_trip_rate).toFixed(2)}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="py-2">
                              <ReconStatusBadge status={row.reconciliation_status} anomalyCodes={row.anomaly_code} />
                            </TableCell>
                            <TableCell className="py-2">
                              <Button size="icon" variant="ghost"
                                onClick={() => { setPrDetailRow(row); setPrDetailOpen(true); }}
                                data-testid={`button-pr-detail-${row.id}`}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="px-4 py-2 border-t text-xs text-muted-foreground">
                  Showing {(payReconQ.data?.rows ?? []).length} record{(payReconQ.data?.rows ?? []).length !== 1 ? "s" : ""}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Cost Per Move Engine ── */}
        <TabsContent value="cost" className="space-y-4 mt-4">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Cost Per Move Engine</h2>
              <p className="text-sm text-muted-foreground">Labor cost allocation by driver type — IC on-demand model and shift fixed-cost model</p>
            </div>
            <div className="flex items-center gap-2">
              {cpmBatch !== "__all__" && (
                <Button size="sm" variant="outline"
                  disabled={runCostEngineMut.isPending}
                  onClick={() => runCostEngineMut.mutate(cpmBatch)}
                  data-testid="button-run-cost-engine">
                  <RefreshCw className="h-4 w-4 mr-1" />
                  {runCostEngineMut.isPending ? "Running…" : "Re-run Engine"}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => {
                qc.invalidateQueries({ queryKey: ["/api/corporate/openforce/cost-per-move"] });
              }}>
                <RefreshCw className="h-4 w-4 mr-1" />Refresh
              </Button>
            </div>
          </div>

          {/* KPI summary cards */}
          {cpmSummaryQ.data?.kpis && (() => {
            const k = cpmSummaryQ.data!.kpis;
            const totalMoves = k.total_completed_moves ?? 0;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <KPICard title="Total Labor Cost" icon={DollarSign} value={fmtCurrency(k.total_labor_cost)} />
                <KPICard title="Completed Moves" icon={TrendingUp} value={fmtNum(totalMoves)} />
                <KPICard title="Drivers" icon={Users} value={fmtNum(k.total_drivers)} sub={`${fmtNum(k.total_records)} records`} />
                <KPICard title="Avg $/Move" icon={BarChart3}
                  value={k.avg_cost_per_move ? `$${parseFloat(k.avg_cost_per_move).toFixed(2)}` : "—"} />
                <KPICard title="On-Demand Avg" icon={TrendingUp}
                  value={k.on_demand_avg_cpm ? `$${parseFloat(k.on_demand_avg_cpm).toFixed(2)}` : "—"}
                  sub="IC / per-move" />
                <KPICard title="Shift Avg" icon={Clock}
                  value={k.shift_avg_cpm ? `$${parseFloat(k.shift_avg_cpm).toFixed(2)}` : "—"}
                  sub="Shift allocation" />
                <KPICard title="Anomalies" icon={AlertTriangle}
                  value={fmtNum(k.anomaly_count)}
                  variant={(k.anomaly_count ?? 0) > 0 ? "danger" : "success"} />
                <KPICard title="Accounts" icon={Building2}
                  value={fmtNum((cpmAccountQ.data?.accounts ?? []).length)} />
              </div>
            );
          })()}

          {/* Anomaly breakdown chips */}
          {(cpmSummaryQ.data?.anomalyBreakdown ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Anomaly types:</span>
              {cpmSummaryQ.data!.anomalyBreakdown.map((a: any) => (
                <Badge key={a.reason} variant="outline"
                  className="text-xs bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300 cursor-pointer"
                  onClick={() => {
                    setCpmAnomalyOnly(true);
                  }}>
                  {a.reason?.replace(/_/g, " ")} <span className="ml-1 font-semibold">×{a.count}</span>
                </Badge>
              ))}
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={cpmBatch} onValueChange={setCpmBatch}>
                  <SelectTrigger className="w-48" data-testid="select-cpm-batch">
                    <SelectValue placeholder="All Batches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Batches</SelectItem>
                    {(batchesQ.data?.batches ?? []).map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.sourceFileName} ({fmtDate(b.uploadedAt)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={cpmDriverType} onValueChange={setCpmDriverType}>
                  <SelectTrigger className="w-36" data-testid="select-cpm-driver-type">
                    <SelectValue placeholder="Driver Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Types</SelectItem>
                    <SelectItem value="ic">IC / On-Demand</SelectItem>
                    <SelectItem value="shift">Shift-Based</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Period:</span>
                  <Input type="date" className="w-36 h-9" value={cpmPeriodFrom}
                    onChange={e => setCpmPeriodFrom(e.target.value)} data-testid="input-cpm-period-from" />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input type="date" className="w-36 h-9" value={cpmPeriodTo}
                    onChange={e => setCpmPeriodTo(e.target.value)} data-testid="input-cpm-period-to" />
                </div>
                <Button size="sm" variant={cpmAnomalyOnly ? "default" : "outline"}
                  onClick={() => setCpmAnomalyOnly(v => !v)}
                  data-testid="button-cpm-anomaly-only">Anomalies Only</Button>
                <Button size="sm" variant={cpmHighCostOnly ? "default" : "outline"}
                  onClick={() => setCpmHighCostOnly(v => !v)}
                  data-testid="button-cpm-high-cost">High Cost Only</Button>
              </div>
            </CardContent>
          </Card>

          {/* Main Grid — Driver Summary */}
          {cpmDriverQ.isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Calculating cost per move…</div>
          ) : (cpmDriverQ.data?.rows ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center">
                <TrendingUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="font-medium">No cost allocations computed yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The Cost Per Move Engine runs automatically after driver matching.
                  Select a batch and click "Re-run Engine" to compute now.
                </p>
                {cpmBatch !== "__all__" && (
                  <Button size="sm" className="mt-4"
                    onClick={() => runCostEngineMut.mutate(cpmBatch)}
                    disabled={runCostEngineMut.isPending}>
                    Run Cost Per Move Engine
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm">Driver Labor Cost Summary</CardTitle>
                <span className="text-xs text-muted-foreground">{fmtNum(cpmDriverQ.data?.total)} records</span>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Driver</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Pay Period</TableHead>
                        <TableHead className="text-right">Gross Pay</TableHead>
                        <TableHead className="text-right">Moves</TableHead>
                        <TableHead className="text-right">$/Move</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Accounts</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(cpmDriverQ.data?.rows ?? []).map((row: any) => {
                        const cpm = row.cost_per_move ? parseFloat(row.cost_per_move) : null;
                        const isHigh  = cpm !== null && cpm > 75;
                        const isLow   = cpm !== null && cpm < 2 && cpm > 0;
                        const rowCls  = row.anomaly_flag
                          ? "bg-orange-50/40 dark:bg-orange-950/20"
                          : isHigh ? "bg-red-50/30 dark:bg-red-950/10" : "";
                        return (
                          <TableRow key={row.id} className={rowCls}>
                            <TableCell className="font-medium whitespace-nowrap py-2">
                              {row.driver_name || "—"}
                            </TableCell>
                            <TableCell className="py-2">
                              {row.driver_type === "ic"
                                ? <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400">IC</Badge>
                                : row.driver_type === "shift"
                                  ? <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400">Shift</Badge>
                                  : <Badge variant="secondary" className="text-xs">—</Badge>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-2">
                              {fmtPeriod(row.pay_period_start, row.pay_period_end)}
                            </TableCell>
                            <TableCell className="text-right font-semibold py-2">{fmtCurrency(row.total_gross_pay)}</TableCell>
                            <TableCell className="text-right py-2">{fmtNum(row.total_completed_moves)}</TableCell>
                            <TableCell className="text-right py-2">
                              {cpm !== null ? (
                                <span className={isHigh ? "text-red-600 dark:text-red-400 font-semibold" : isLow ? "text-orange-600 dark:text-orange-400 font-semibold" : "font-semibold"}>
                                  ${cpm.toFixed(2)}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="py-2">
                              <span className="text-xs text-muted-foreground capitalize">{row.calculation_method?.replace(/_/g, " ") || "—"}</span>
                            </TableCell>
                            <TableCell className="text-right py-2">{row.account_count ?? "—"}</TableCell>
                            <TableCell className="py-2">
                              {row.anomaly_flag
                                ? <Badge variant="outline" className="text-xs bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400"
                                    title={row.anomaly_reason?.replace(/_/g, " ")}>
                                    Anomaly
                                  </Badge>
                                : <Badge variant="outline" className="text-xs text-green-700 dark:text-green-400 border-green-300 dark:border-green-700">OK</Badge>}
                            </TableCell>
                            <TableCell className="py-2">
                              <Button size="icon" variant="ghost"
                                onClick={() => { setCpmDetailRow(row); setCpmDetailOpen(true); }}
                                data-testid={`button-cpm-detail-${row.id}`}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Account Aggregation */}
          {(cpmAccountQ.data?.accounts ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Labor Cost by Account
                </CardTitle>
                <CardDescription>Aggregated from move-level cost allocations — traceable to source pay records</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Drivers</TableHead>
                        <TableHead className="text-right">Moves</TableHead>
                        <TableHead className="text-right">Total Labor Cost</TableHead>
                        <TableHead className="text-right">Avg $/Move</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(cpmAccountQ.data?.accounts ?? []).map((a: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{a.account_name || "Unlinked"}</TableCell>
                          <TableCell className="text-right">{fmtNum(a.driver_count)}</TableCell>
                          <TableCell className="text-right">{fmtNum(a.total_moves)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmtCurrency(a.total_labor_cost)}</TableCell>
                          <TableCell className="text-right">
                            {a.avg_labor_cost_per_move
                              ? <span className="font-semibold">${parseFloat(a.avg_labor_cost_per_move).toFixed(2)}</span>
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Batch Detail Dialog ── */}
      <Dialog open={batchDetailOpen} onOpenChange={setBatchDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Batch Detail — {selectedBatch?.sourceFileName}</DialogTitle>
          </DialogHeader>
          {batchDetailQ.isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : batchDetailQ.data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                <div><span className="text-muted-foreground">Status</span>
                  <div className="mt-1"><BatchStatusBadge status={batchDetailQ.data.batch.processingStatus} /></div>
                </div>
                <div><span className="text-muted-foreground">Period</span>
                  <div className="mt-1 font-medium">{fmtPeriod(batchDetailQ.data.batch.settlementPeriodStart, batchDetailQ.data.batch.settlementPeriodEnd)}</div>
                </div>
                <div><span className="text-muted-foreground">Total Rows</span>
                  <div className="mt-1 font-medium">{fmtNum(batchDetailQ.data.batch.totalRows)}</div>
                </div>
                <div><span className="text-muted-foreground">Gross Pay</span>
                  <div className="mt-1 font-medium">{fmtCurrency(batchDetailQ.data.batch.totalGrossPay)}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => rematchMut.mutate(selectedBatch!.id)} disabled={rematchMut.isPending}>
                  <RefreshCw className="h-4 w-4 mr-1" />Re-run Matching
                </Button>
                <Button size="sm" variant="destructive" onClick={() => deleteBatchMut.mutate(selectedBatch!.id)} disabled={deleteBatchMut.isPending}>
                  Archive Batch
                </Button>
              </div>
              {batchDetailQ.data.transactions.length > 0 && (
                <div className="overflow-x-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>OpenForce ID</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Trips</TableHead>
                        <TableHead className="text-right">Gross Pay</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batchDetailQ.data.transactions.slice(0, 100).map(tx => (
                        <TableRow key={tx.id} className={tx.hasException ? "bg-yellow-50/40 dark:bg-yellow-900/10" : undefined}>
                          <TableCell className="font-mono text-xs">{tx.openforceId || "—"}</TableCell>
                          <TableCell>{tx.rawDriverName || "—"}</TableCell>
                          <TableCell className="text-right">{tx.hoursWorked ? parseFloat(tx.hoursWorked).toFixed(1) : "—"}</TableCell>
                          <TableCell className="text-right">{tx.tripsCompleted ?? "—"}</TableCell>
                          <TableCell className="text-right font-medium">{fmtCurrency(tx.grossPay)}</TableCell>
                          <TableCell>
                            {tx.hasException
                              ? <ExceptionBadge type={tx.exceptionType} />
                              : <Badge variant="default" className="text-xs">Matched</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {batchDetailQ.data.transactions.length > 100 && (
                    <div className="px-4 py-2 border-t text-xs text-muted-foreground">
                      Showing 100 of {batchDetailQ.data.transactions.length} transactions
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Resolve Exception Dialog ── */}
      <Dialog open={resolveDialogOpen} onOpenChange={(open) => { setResolveDialogOpen(open); if (!open) { setResolveDriverId(""); setResolveNote(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resolve Exception</DialogTitle>
          </DialogHeader>
          {resolveTx && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Driver name: </span><span className="font-medium">{resolveTx.rawDriverName || "—"}</span></p>
                <p><span className="text-muted-foreground">OpenForce ID: </span><code className="text-xs">{resolveTx.openforceId || "—"}</code></p>
                <p className="flex items-center gap-2"><span className="text-muted-foreground">Exception: </span><ExceptionBadge type={resolveTx.exceptionType} /></p>
                {resolveTx.exceptionNote && <p className="text-muted-foreground text-xs">{resolveTx.exceptionNote}</p>}
              </div>

              {/* Driver assignment — shown for exceptions where driver identity is in question */}
              {(["missing_driver", "not_ic", "openforce_id_not_found", "driver_not_marked_as_ic",
                 "duplicate_openforce_id", "missing_openforce_id"].includes(resolveTx.exceptionType ?? "")) && (
                <div className="space-y-1">
                  <Label htmlFor="assign-driver">Assign to Driver</Label>
                  <Select value={resolveDriverId} onValueChange={setResolveDriverId}>
                    <SelectTrigger id="assign-driver" data-testid="select-assign-driver">
                      <SelectValue placeholder="Select driver…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— No assignment —</SelectItem>
                      {(driversQ.data?.rows ?? []).map(d => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.firstName} {d.lastName}{d.openforceId ? ` (OF: ${d.openforceId})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Assigning a driver will link this settlement record and mark it matched.</p>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="resolve-note">Resolution Note</Label>
                <Textarea
                  id="resolve-note"
                  placeholder="Describe how this exception was resolved…"
                  value={resolveNote} onChange={e => setResolveNote(e.target.value)}
                  data-testid="textarea-resolve-note"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive"
              disabled={excludeMut.isPending}
              onClick={() => resolveTx && excludeMut.mutate({ id: resolveTx.id, note: resolveNote || "Flagged as invalid" })}
              data-testid="button-confirm-exclude">
              Flag as Invalid
            </Button>
            <Button
              disabled={resolveMut.isPending || !resolveNote.trim()}
              onClick={() => resolveTx && resolveMut.mutate({
                id: resolveTx.id,
                data: {
                  resolution: resolveNote,
                  ...(resolveDriverId && resolveDriverId !== "__none__" ? { matchedDriverId: resolveDriverId } : {}),
                },
              })}
              data-testid="button-confirm-resolve">
              {resolveMut.isPending ? "Saving…" : "Mark Resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cost Per Move Detail Drawer ── */}
      <Dialog open={cpmDetailOpen} onOpenChange={o => { setCpmDetailOpen(o); if (!o) setCpmDetailRow(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="dialog-cpm-detail">
          <DialogHeader>
            <DialogTitle>Cost Per Move — Driver Detail</DialogTitle>
          </DialogHeader>
          {cpmDetailRow && (() => {
            const r = cpmDetailRow;
            const cpm = r.cost_per_move ? parseFloat(r.cost_per_move) : null;
            const isHigh = cpm !== null && cpm > 75;
            const isLow  = cpm !== null && cpm < 2 && cpm > 0;
            const moves  = cpmMoveDetailQ.data?.moves ?? [];
            const acctMap: Record<string, { name: string; moves: number; cost: number }> = {};
            moves.forEach((m: any) => {
              if (m.move_id) {
                const k = m.account_id || "unlinked";
                if (!acctMap[k]) acctMap[k] = { name: m.account_name || "Unlinked", moves: 0, cost: 0 };
                acctMap[k].moves++;
                acctMap[k].cost += parseFloat(m.move_labor_cost || "0");
              }
            });
            const acctList = Object.values(acctMap);
            return (
              <div className="space-y-4 text-sm">
                {/* Driver Summary */}
                <div className="rounded-md bg-muted p-3">
                  <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-2">Driver Summary</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">Driver</span><span className="font-medium">{r.driver_name || "—"}</span>
                    <span className="text-muted-foreground">Driver Type</span>
                    <span>{r.driver_type === "ic" ? "IC / On-Demand" : r.driver_type === "shift" ? "Shift-Based" : "—"}</span>
                    <span className="text-muted-foreground">Pay Period</span><span>{fmtPeriod(r.pay_period_start, r.pay_period_end)}</span>
                    <span className="text-muted-foreground">Gross Pay</span><span className="font-semibold">{fmtCurrency(r.total_gross_pay)}</span>
                    <span className="text-muted-foreground">Completed Moves</span><span>{fmtNum(r.total_completed_moves)}</span>
                  </div>
                </div>

                {/* Cost Calculation */}
                <div className="rounded-md border p-3 space-y-2">
                  <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Cost Calculation</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">Method</span>
                    <span className="capitalize">{r.calculation_method?.replace(/_/g, " ") || "—"}</span>
                    <span className="text-muted-foreground">Formula</span>
                    <span className="font-mono text-xs">
                      {r.calculation_method === "on_demand"
                        ? "gross_pay ÷ completed_moves"
                        : r.calculation_method === "shift"
                          ? "shift_total_cost ÷ shift_moves"
                          : "—"}
                    </span>
                    <span className="text-muted-foreground">Cost Per Move</span>
                    <span className={`font-semibold text-base ${isHigh ? "text-red-600 dark:text-red-400" : isLow ? "text-orange-600 dark:text-orange-400" : "text-green-700 dark:text-green-400"}`}>
                      {cpm !== null ? `$${cpm.toFixed(2)}` : "—"}
                    </span>
                  </div>
                  {isHigh && <p className="text-xs text-red-600 dark:text-red-400">Cost per move exceeds the $75 high threshold.</p>}
                  {isLow  && <p className="text-xs text-orange-600 dark:text-orange-400">Cost per move is below the $2 low threshold.</p>}
                </div>

                {/* Account Allocation */}
                {acctList.length > 0 && (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Account Allocation</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Moves</TableHead>
                          <TableHead className="text-right">Labor Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {acctList.map((a, i) => (
                          <TableRow key={i}>
                            <TableCell className="py-1">{a.name}</TableCell>
                            <TableCell className="text-right py-1">{a.moves}</TableCell>
                            <TableCell className="text-right py-1 font-medium">${a.cost.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Move Detail */}
                {cpmMoveDetailQ.isLoading ? (
                  <div className="py-4 text-center text-muted-foreground text-xs">Loading move detail…</div>
                ) : moves.filter((m: any) => m.move_id).length > 0 ? (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Move Detail ({moves.filter((m: any) => m.move_id).length} moves)</p>
                    <div className="max-h-52 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Move #</TableHead>
                            <TableHead>Account</TableHead>
                            <TableHead className="text-right">Labor Cost</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {moves.filter((m: any) => m.move_id).map((m: any) => (
                            <TableRow key={m.id}>
                              <TableCell className="py-1 text-xs text-muted-foreground whitespace-nowrap">
                                {m.trip_date ? formatDate(m.trip_date) : "—"}
                              </TableCell>
                              <TableCell className="py-1 font-mono text-xs">{m.move_number || "—"}</TableCell>
                              <TableCell className="py-1 text-xs">{m.account_name || "Unlinked"}</TableCell>
                              <TableCell className="py-1 text-right font-medium">
                                ${parseFloat(m.move_labor_cost || "0").toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 p-3 text-xs text-orange-700 dark:text-orange-400">
                    No linked move records found for this driver in this pay period. Moves may not be in the system or the driver linkage was not resolved.
                  </div>
                )}

                {/* Anomalies */}
                {r.anomaly_flag && r.anomaly_reason && (
                  <div className="rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 p-3 space-y-1">
                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Anomaly Flags</p>
                    <Badge variant="outline" className="text-xs bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 text-orange-800 dark:text-orange-300">
                      {r.anomaly_reason.replace(/_/g, " ")}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.anomaly_reason === "pay_with_no_completed_moves" && "Gross pay exists but no completed moves were found in this pay period."}
                      {r.anomaly_reason === "completed_moves_with_no_pay" && "Completed moves found but no gross pay record associated."}
                      {r.anomaly_reason === "high_cost_per_move" && "Cost per move exceeds the $75 high threshold — verify pay accuracy."}
                      {r.anomaly_reason === "low_cost_per_move" && "Cost per move is below the $2 low threshold — check for partial records."}
                      {r.anomaly_reason === "zero_move_shift" && "Shift recorded with no completed moves — unallocated idle labor cost."}
                      {r.anomaly_reason === "missing_move_linkage" && "Driver could not be matched to move records."}
                      {r.anomaly_reason === "shift_fallback" && "Driver classified as shift but no shift assignment data available; on-demand model applied as fallback."}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCpmDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pay Reconciliation Detail Drawer ── */}
      <Dialog open={prDetailOpen} onOpenChange={o => { setPrDetailOpen(o); if (!o) setPrDetailRow(null); }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-pay-recon-detail">
          <DialogHeader>
            <DialogTitle>Pay Reconciliation Detail</DialogTitle>
          </DialogHeader>
          {prDetailRow && (() => {
            const r = prDetailRow;
            const hv = r.hours_variance !== null ? parseFloat(r.hours_variance) : null;
            const tv = r.trip_variance !== null ? parseInt(r.trip_variance) : null;
            const hvPct = r.hours_variance_pct !== null ? parseFloat(r.hours_variance_pct) : null;
            const tvPct = r.trip_variance_pct !== null ? parseFloat(r.trip_variance_pct) : null;
            const anomalyCodes: string[] = r.anomaly_code ? r.anomaly_code.split("|") : [];
            return (
              <div className="space-y-4 text-sm">
                {/* Pay Summary */}
                <div className="rounded-md bg-muted p-3 space-y-1">
                  <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-2">Pay Summary</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">Driver</span>
                    <span className="font-medium">{r.driver_name || r.raw_driver_name || "—"}</span>
                    <span className="text-muted-foreground">OpenForce ID</span>
                    <span className="font-mono">{r.openforce_id || "—"}</span>
                    <span className="text-muted-foreground">Pay Period</span>
                    <span>{fmtPeriod(r.pay_period_start, r.pay_period_end)}</span>
                    <span className="text-muted-foreground">Gross Pay</span>
                    <span className="font-semibold">{fmtCurrency(r.gross_pay)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Hours Reconciliation */}
                  <div className="rounded-md border p-3 space-y-1">
                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-2">Hours Reconciliation</p>
                    <div className="flex justify-between"><span className="text-muted-foreground">Reported Hours</span><span>{r.reported_hours ? parseFloat(r.reported_hours).toFixed(2) : "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">System Hours</span><span>{r.system_hours ? parseFloat(r.system_hours).toFixed(2) : "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Variance</span>
                      <span className={hv !== null && Math.abs(hv) > 0.25 ? "text-yellow-600 dark:text-yellow-400 font-semibold" : ""}>
                        {hv !== null ? `${hv > 0 ? "+" : ""}${hv.toFixed(2)} hrs${hvPct !== null ? ` (${hvPct.toFixed(1)}%)` : ""}` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">Status</span>
                      <ReconStatusBadge status={r.hours_reconciliation_status} />
                    </div>
                  </div>

                  {/* Trips Reconciliation */}
                  <div className="rounded-md border p-3 space-y-1">
                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-2">Trips Reconciliation</p>
                    <div className="flex justify-between"><span className="text-muted-foreground">Reported Trips</span><span>{r.reported_trips ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">System Trips</span><span>{r.system_trips ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Variance</span>
                      <span className={tv !== null && Math.abs(tv) > 0 ? "text-yellow-600 dark:text-yellow-400 font-semibold" : ""}>
                        {tv !== null ? `${tv > 0 ? "+" : ""}${tv}${tvPct !== null ? ` (${tvPct.toFixed(1)}%)` : ""}` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">Status</span>
                      <ReconStatusBadge status={r.trip_reconciliation_status} />
                    </div>
                  </div>
                </div>

                {/* Effective Rates */}
                <div className="rounded-md border p-3 space-y-1">
                  <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-2">Calculated Rates</p>
                  <div className="grid grid-cols-2 gap-x-4">
                    <span className="text-muted-foreground">Effective Hourly Rate</span>
                    <span className={r.effective_hourly_rate && (parseFloat(r.effective_hourly_rate) > 75 || parseFloat(r.effective_hourly_rate) < 8)
                      ? "text-red-600 dark:text-red-400 font-semibold" : "font-medium"}>
                      {r.effective_hourly_rate ? `$${parseFloat(r.effective_hourly_rate).toFixed(2)}/hr` : "—"}
                    </span>
                    <span className="text-muted-foreground">Effective Trip Rate</span>
                    <span className={r.effective_trip_rate && (parseFloat(r.effective_trip_rate) > 50 || parseFloat(r.effective_trip_rate) < 5)
                      ? "text-red-600 dark:text-red-400 font-semibold" : "font-medium"}>
                      {r.effective_trip_rate ? `$${parseFloat(r.effective_trip_rate).toFixed(2)}/trip` : "—"}
                    </span>
                  </div>
                </div>

                {/* Anomaly Flags */}
                {anomalyCodes.length > 0 && (
                  <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3 space-y-2">
                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Anomaly Flags</p>
                    <div className="flex flex-wrap gap-2">
                      {anomalyCodes.map(code => (
                        <Badge key={code} variant="outline"
                          className="text-xs bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300">
                          {code.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {anomalyCodes.includes("high_effective_hourly_rate") && <p>Effective hourly rate exceeds $75/hr threshold.</p>}
                      {anomalyCodes.includes("low_effective_hourly_rate") && <p>Effective hourly rate is below $8/hr threshold.</p>}
                      {anomalyCodes.includes("high_effective_trip_rate") && <p>Effective trip rate exceeds $50/trip threshold.</p>}
                      {anomalyCodes.includes("low_effective_trip_rate") && <p>Effective trip rate is below $5/trip threshold.</p>}
                      {anomalyCodes.includes("hours_variance") && <p>Reported hours deviate from system hours beyond 0.25 hr tolerance.</p>}
                      {anomalyCodes.includes("trip_variance") && <p>Reported trips do not match system trip count.</p>}
                      {anomalyCodes.includes("pay_with_no_hours") && <p>Gross pay exists but no hours are recorded in any system.</p>}
                      {anomalyCodes.includes("pay_with_no_trips") && <p>Gross pay exists but no trips are recorded in any system.</p>}
                    </div>
                  </div>
                )}

                {/* Overall Status */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-muted-foreground">Overall Reconciliation Status</span>
                  <ReconStatusBadge status={r.reconciliation_status} anomalyCodes={r.anomaly_code} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Calculated: {fmtDate(r.calculated_at)} · Tolerance: ±{r.hours_tolerance ?? 0.25} hrs, ±{r.trip_tolerance ?? 0} trips
                </p>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Audit Log Dialog ── */}
      <Dialog open={auditOpen} onOpenChange={o => { setAuditOpen(o); if (!o) setAuditTx(null); }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-audit-log">
          <DialogHeader>
            <DialogTitle>Match Audit History</DialogTitle>
          </DialogHeader>
          {auditTx && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted p-3 text-sm space-y-0.5">
                <p><span className="text-muted-foreground">Driver: </span><span className="font-medium">{(auditTx as any).raw_driver_name || auditTx.rawDriverName || "—"}</span></p>
                <p><span className="text-muted-foreground">OpenForce ID: </span><span className="font-mono">{(auditTx as any).openforce_id || auditTx.openforceId || "—"}</span></p>
                <p><span className="text-muted-foreground">Period: </span>{fmtPeriod((auditTx as any).period_start ?? auditTx.periodStart, (auditTx as any).period_end ?? auditTx.periodEnd)}</p>
                <p><span className="text-muted-foreground">Gross Pay: </span>{fmtCurrency((auditTx as any).gross_pay ?? auditTx.grossPay)}</p>
              </div>
              {auditLogQ.isLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading audit log…</div>
              ) : (auditLogQ.data?.auditLog ?? []).length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">No audit entries found for this transaction.</div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {(auditLogQ.data?.auditLog ?? []).map((entry: any) => (
                    <div key={entry.id} className="rounded-md border bg-card p-3 text-sm space-y-0.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-semibold capitalize">{entry.action_type?.replace(/_/g, " ")}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(entry.created_at)}</span>
                      </div>
                      {(entry.previous_status || entry.new_status) && (
                        <p className="text-muted-foreground text-xs">
                          Status: {entry.previous_status || "—"} → {entry.new_status || "—"}
                        </p>
                      )}
                      {entry.previous_exception_type && (
                        <p className="text-muted-foreground text-xs">
                          Exception: <ExceptionBadge type={entry.previous_exception_type} />
                        </p>
                      )}
                      {entry.assigned_driver_id && (
                        <p className="text-muted-foreground text-xs">Assigned driver ID: {entry.assigned_driver_id}</p>
                      )}
                      {entry.notes && <p className="text-muted-foreground text-xs">{entry.notes}</p>}
                      {entry.user_id && <p className="text-muted-foreground text-xs">By: {entry.user_id}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
