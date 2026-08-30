import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, ShieldAlert, ShieldOff, Shield, Eye, StickyNote,
  ArrowUpRight, CheckCircle2, RefreshCw, Settings2, Lock, ChevronRight,
  Info, Search, Filter, Clock, CheckCheck, Flame, FileText
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlaybookStatus = "active" | "monitoring" | "disabled";

interface FraudPattern {
  id: string;
  name: string;
  patternType: string;
  exceptionTypes: string[];
  description: string;
  whyItMatters: string;
  detectionRules: string;
  whereToLook: string;
  threshold: number;
  thresholdUnit: string;
  timeWindowHours: number;
  action: string;
  severity: "low" | "medium" | "high" | "critical";
  playbookStatus: PlaybookStatus;
  enabled: boolean;
  builtIn: boolean;
}

interface Detection {
  id: string;
  type: string;
  severity: string;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  description: string;
  amount: string | null;
  customer_id: string | null;
  customer_name: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  reviewed_at: string | null;
  reviewed_by_email: string | null;
  escalated: boolean;
  escalated_at: string | null;
  notes: string | null;
  resolution_note: string | null;
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

function severityBadge(severity: string) {
  const map: Record<string, { label: string; className: string }> = {
    critical: { label: "Critical", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
    high:     { label: "High",     className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
    medium:   { label: "Medium",   className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
    low:      { label: "Low",      className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
    error:    { label: "High",     className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
    warning:  { label: "Medium",   className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
  };
  const cfg = map[severity?.toLowerCase()] ?? map.medium;
  return (
    <Badge className={`text-xs font-semibold ${cfg.className} no-default-active-elevate`}>
      {cfg.label}
    </Badge>
  );
}

function severityIcon(severity: string) {
  if (severity === "critical") return <ShieldAlert className="w-4 h-4 text-red-500" />;
  if (severity === "high")     return <AlertTriangle className="w-4 h-4 text-orange-500" />;
  if (severity === "medium")   return <Shield className="w-4 h-4 text-yellow-500" />;
  return <ShieldOff className="w-4 h-4 text-blue-400" />;
}

function playbookStatusBadge(ps: PlaybookStatus) {
  const map: Record<PlaybookStatus, string> = {
    active:     "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    monitoring: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    disabled:   "bg-muted text-muted-foreground",
  };
  const label = ps === "active" ? "Active" : ps === "monitoring" ? "Monitoring" : "Disabled";
  return <Badge className={`text-xs ${map[ps]} no-default-active-elevate`}>{label}</Badge>;
}

function exceptionStatusBadge(status: string, escalated: boolean) {
  if (escalated)
    return (
      <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-xs no-default-active-elevate">
        <Flame className="w-3 h-3 mr-1" />Escalated
      </Badge>
    );
  if (status === "resolved")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 text-xs no-default-active-elevate">Resolved</Badge>;
  if (status === "dismissed")
    return <Badge className="bg-muted text-muted-foreground text-xs no-default-active-elevate">Dismissed</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 text-xs no-default-active-elevate">Open</Badge>;
}

// ─── Pattern Card ─────────────────────────────────────────────────────────────

function PatternCard({
  pattern,
  count,
  onClick,
}: {
  pattern: FraudPattern;
  count: number;
  onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover-elevate transition-all"
      onClick={onClick}
      data-testid={`card-fraud-pattern-${pattern.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {severityIcon(pattern.severity)}
            <span className="font-semibold text-sm leading-tight line-clamp-2">{pattern.name}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {pattern.description}
        </p>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {severityBadge(pattern.severity)}
            {playbookStatusBadge(pattern.playbookStatus)}
          </div>
          <div
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
              count > 0
                ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Eye className="w-3 h-3" />
            {count} match{count !== 1 ? "es" : ""}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Detection Row ────────────────────────────────────────────────────────────

function DetectionRow({
  detection,
  onReview,
  onEscalate,
  onNotesSave,
}: {
  detection: Detection;
  onReview: () => void;
  onEscalate: (escalated: boolean) => void;
  onNotesSave: (notes: string) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [draft, setDraft] = useState(detection.notes ?? "");

  return (
    <div className="rounded-md border bg-card p-3 space-y-2" data-testid={`row-detection-${detection.id}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {exceptionStatusBadge(detection.status, detection.escalated)}
          {detection.reviewed_at && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCheck className="w-3 h-3" />Reviewed
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{detection.description}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {detection.customer_name && (
            <span className="text-xs font-medium">{detection.customer_name}</span>
          )}
          {detection.amount && (
            <span className="text-xs text-muted-foreground">
              ${parseFloat(detection.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          )}
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {format(new Date(detection.created_at), "MMM d, yyyy h:mm a")}
          </span>
        </div>
        {detection.notes && (
          <p className="text-xs text-muted-foreground mt-1.5 italic border-l-2 border-muted pl-2">
            {detection.notes}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-1">
        {!detection.reviewed_at && (
          <Button
            size="sm"
            variant="outline"
            onClick={onReview}
            className="text-xs"
            data-testid={`button-review-${detection.id}`}
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />Mark Reviewed
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setNotesOpen(!notesOpen)}
          className="text-xs"
          data-testid={`button-notes-${detection.id}`}
        >
          <StickyNote className="w-3 h-3 mr-1" />{detection.notes ? "Edit Notes" : "Add Notes"}
        </Button>
        <Button
          size="sm"
          variant={detection.escalated ? "default" : "outline"}
          onClick={() => onEscalate(!detection.escalated)}
          className={`text-xs ${detection.escalated ? "bg-red-600 border-red-600" : ""}`}
          data-testid={`button-escalate-${detection.id}`}
        >
          <Flame className="w-3 h-3 mr-1" />{detection.escalated ? "De-escalate" : "Escalate"}
        </Button>
      </div>

      {notesOpen && (
        <div className="space-y-2 pt-1">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Enter investigation notes..."
            className="text-xs min-h-[70px] resize-none"
            data-testid={`textarea-notes-${detection.id}`}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => { onNotesSave(draft); setNotesOpen(false); }}
              className="text-xs"
              data-testid={`button-save-notes-${detection.id}`}
            >
              Save Notes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setDraft(detection.notes ?? ""); setNotesOpen(false); }}
              className="text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pattern Detail Sheet ─────────────────────────────────────────────────────

function PatternDetailSheet({
  pattern,
  open,
  onClose,
}: {
  pattern: FraudPattern | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("open");
  const [search, setSearch] = useState("");

  const detectionsQuery = useQuery<{ detections: Detection[]; total: number }>({
    queryKey: ["/api/corporate/invoicing/fraud-playbook/detections", pattern?.patternType, statusFilter],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/corporate/invoicing/fraud-playbook/detections?patternType=${encodeURIComponent(pattern?.patternType ?? "")}&status=${statusFilter}&limit=50`
      ).then((r) => r.json()),
    enabled: open && !!pattern,
  });

  const reviewMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/corporate/invoicing/fraud-playbook/detections/${id}/review`).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/fraud-playbook/detections"] });
      qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/fraud-playbook/pattern-counts"] });
    },
  });

  const notesMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      apiRequest("PATCH", `/api/corporate/invoicing/fraud-playbook/detections/${id}/notes`, { notes }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/fraud-playbook/detections"] }),
  });

  const escalateMutation = useMutation({
    mutationFn: ({ id, escalated }: { id: string; escalated: boolean }) =>
      apiRequest("PATCH", `/api/corporate/invoicing/fraud-playbook/detections/${id}/escalate`, { escalated }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/fraud-playbook/detections"] });
      qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/fraud-playbook/pattern-counts"] });
    },
  });

  const detections = detectionsQuery.data?.detections ?? [];
  const filtered = search
    ? detections.filter(
        (d) =>
          d.description.toLowerCase().includes(search.toLowerCase()) ||
          (d.customer_name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : detections;

  if (!pattern) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" side="right">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            {severityIcon(pattern.severity)}
            <SheetTitle className="text-base leading-tight">{pattern.name}</SheetTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {severityBadge(pattern.severity)}
            {playbookStatusBadge(pattern.playbookStatus)}
            <Badge className="text-xs bg-muted text-muted-foreground no-default-active-elevate">
              Detection {pattern.enabled ? "On" : "Off"}
            </Badge>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="overview" className="flex-1" data-testid="tab-overview">
              Overview
            </TabsTrigger>
            <TabsTrigger value="detections" className="flex-1" data-testid="tab-detections">
              Detections
              {(detectionsQuery.data?.total ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500 text-white text-xs px-1.5 py-0.5 leading-none">
                  {detectionsQuery.data?.total}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Overview ── */}
          <TabsContent value="overview" className="space-y-5 mt-0">
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />Description
              </h4>
              <p className="text-sm leading-relaxed">{pattern.description}</p>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />Why It Matters
              </h4>
              <p className="text-sm leading-relaxed text-muted-foreground">{pattern.whyItMatters}</p>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />Detection Rules
              </h4>
              <p className="text-sm leading-relaxed text-muted-foreground">{pattern.detectionRules}</p>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5" />Where to Look
              </h4>
              <p className="text-sm leading-relaxed text-muted-foreground">{pattern.whereToLook}</p>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Detection Threshold</p>
                <p className="text-sm font-medium">
                  {pattern.threshold} {pattern.thresholdUnit}
                  {pattern.timeWindowHours > 0 && ` / ${pattern.timeWindowHours}h window`}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Response Action</p>
                <p className="text-sm font-medium capitalize">{pattern.action}</p>
              </div>
            </div>
          </TabsContent>

          {/* ── Detections ── */}
          <TabsContent value="detections" className="space-y-4 mt-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[140px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                  data-testid="input-detection-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs" data-testid="select-detection-status">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  qc.invalidateQueries({
                    queryKey: ["/api/corporate/invoicing/fraud-playbook/detections"],
                  })
                }
                data-testid="button-refresh-detections"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>

            {detectionsQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-muted animate-pulse rounded-md" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Eye className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No detections found for this pattern.</p>
                <p className="text-xs mt-1">Try changing the status filter or run an exception scan.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((detection) => (
                  <DetectionRow
                    key={detection.id}
                    detection={detection}
                    onReview={() => reviewMutation.mutate(detection.id)}
                    onEscalate={(esc) =>
                      escalateMutation.mutate({ id: detection.id, escalated: esc })
                    }
                    onNotesSave={(notes) =>
                      notesMutation.mutate({ id: detection.id, notes })
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ─── Pattern Configure Panel ──────────────────────────────────────────────────

function PatternConfigPanel({
  patterns,
  onToggle,
  onReset,
  isResetting,
}: {
  patterns: FraudPattern[];
  onToggle: (id: string, enabled: boolean) => void;
  onReset: () => void;
  isResetting: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium">Pattern Detection Controls</p>
        <Button
          size="sm"
          variant="outline"
          onClick={onReset}
          disabled={isResetting}
          data-testid="button-reset-patterns"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isResetting ? "animate-spin" : ""}`} />
          Reset to Defaults
        </Button>
      </div>
      <div className="space-y-2">
        {patterns.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {severityIcon(p.severity)}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {severityBadge(p.severity)}
                  {playbookStatusBadge(p.playbookStatus)}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant={p.enabled ? "default" : "outline"}
              onClick={() => onToggle(p.id, !p.enabled)}
              className="shrink-0 text-xs"
              data-testid={`button-toggle-pattern-${p.id}`}
            >
              {p.enabled ? "On" : "Off"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FraudPatternPlaybook() {
  const qc = useQueryClient();
  const [selectedPattern, setSelectedPattern] = useState<FraudPattern | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const patternsQuery = useQuery<{ patterns: FraudPattern[]; allowController: boolean }>({
    queryKey: ["/api/corporate/invoicing/fraud-playbook/patterns"],
    queryFn: () =>
      apiRequest("GET", "/api/corporate/invoicing/fraud-playbook/patterns").then((r) => {
        if (!r.ok) throw new Error("Forbidden");
        return r.json();
      }),
  });

  const countsQuery = useQuery<{ counts: Record<string, number> }>({
    queryKey: ["/api/corporate/invoicing/fraud-playbook/pattern-counts"],
    queryFn: () =>
      apiRequest("GET", "/api/corporate/invoicing/fraud-playbook/pattern-counts").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const updatePatternMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<FraudPattern> }) =>
      apiRequest("PATCH", `/api/corporate/invoicing/fraud-playbook/patterns/${id}`, updates).then((r) =>
        r.json()
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/fraud-playbook/patterns"] }),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/corporate/invoicing/fraud-playbook/patterns/reset").then((r) => r.json()),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["/api/corporate/invoicing/fraud-playbook/patterns"] }),
  });

  const handlePatternClick = useCallback((pattern: FraudPattern) => {
    setSelectedPattern(pattern);
    setDetailOpen(true);
  }, []);

  const handleToggle = useCallback(
    (id: string, enabled: boolean) => {
      updatePatternMutation.mutate({ id, updates: { enabled } });
    },
    [updatePatternMutation]
  );

  // ── Access denied ──
  if (patternsQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <Lock className="w-10 h-10 text-muted-foreground" />
        <p className="font-semibold">Access Restricted</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          The Fraud Pattern Playbook is accessible to Owners only. Contact your account owner if you
          need access.
        </p>
        <Badge className="text-xs font-mono bg-muted text-muted-foreground no-default-active-elevate">
          FRAUD_PLAYBOOK_ACCESS_DENIED
        </Badge>
      </div>
    );
  }

  // ── Loading skeleton ──
  if (patternsQuery.isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-44 bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    );
  }

  const patterns = patternsQuery.data?.patterns ?? [];
  const counts = countsQuery.data?.counts ?? {};

  function getLiveCount(pattern: FraudPattern): number {
    const types =
      pattern.exceptionTypes?.length ? pattern.exceptionTypes : [pattern.patternType];
    return types.reduce((sum, t) => sum + (counts[t] ?? 0), 0);
  }

  const totalOpen = Object.values(counts).reduce((a, b) => a + b, 0);
  const criticalActive = patterns.filter(
    (p) => p.severity === "critical" && getLiveCount(p) > 0
  );

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            <h2 className="text-base font-semibold">Fraud Pattern Playbook</h2>
            <Badge className="text-xs bg-muted text-muted-foreground no-default-active-elevate">
              Owner Only
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {patterns.length} detection patterns &middot; {totalOpen} open match
            {totalOpen !== 1 ? "es" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showConfig ? "default" : "outline"}
            onClick={() => setShowConfig(!showConfig)}
            data-testid="button-toggle-config"
          >
            <Settings2 className="w-3.5 h-3.5 mr-1.5" />
            Configure
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              qc.invalidateQueries({
                queryKey: ["/api/corporate/invoicing/fraud-playbook/patterns"],
              });
              qc.invalidateQueries({
                queryKey: ["/api/corporate/invoicing/fraud-playbook/pattern-counts"],
              });
            }}
            data-testid="button-refresh-playbook"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${countsQuery.isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* ── Critical alert banner ── */}
      {criticalActive.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2.5">
          <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              Critical Patterns Active
            </p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
              {criticalActive.map((p) => p.name).join(", ")} — require immediate investigation.
            </p>
          </div>
        </div>
      )}

      {/* ── Configure panel ── */}
      {showConfig && (
        <Card>
          <CardContent className="pt-4">
            <PatternConfigPanel
              patterns={patterns}
              onToggle={handleToggle}
              onReset={() => resetMutation.mutate()}
              isResetting={resetMutation.isPending}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Severity summary stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["critical", "high", "medium", "low"] as const).map((sev) => {
          const total = patterns
            .filter((p) => p.severity === sev)
            .reduce((s, p) => s + getLiveCount(p), 0);
          const flagged = patterns.filter(
            (p) => p.severity === sev && getLiveCount(p) > 0
          ).length;
          const colors: Record<string, string> = {
            critical:
              "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30",
            high: "border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30",
            medium:
              "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30",
            low: "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30",
          };
          return (
            <div key={sev} className={`rounded-md border px-3 py-2.5 ${colors[sev]}`}>
              <p className="text-xs text-muted-foreground capitalize">{sev} Severity</p>
              <p className="text-xl font-bold">{total}</p>
              <p className="text-xs text-muted-foreground">
                {flagged} pattern{flagged !== 1 ? "s" : ""} flagged
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Pattern card grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {patterns.map((pattern) => (
          <PatternCard
            key={pattern.id}
            pattern={pattern}
            count={getLiveCount(pattern)}
            onClick={() => handlePatternClick(pattern)}
          />
        ))}
      </div>

      {patterns.length === 0 && !patternsQuery.isLoading && (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No fraud patterns configured.</p>
        </div>
      )}

      {/* ── Detail sheet ── */}
      <PatternDetailSheet
        pattern={selectedPattern}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}

export { FraudPatternPlaybook };
