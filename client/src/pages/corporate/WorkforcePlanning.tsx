import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from "react-leaflet";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MapPin, Users, Target, RefreshCw, X, TrendingUp, Plus, Loader2,
  Activity, Briefcase, Clock, BarChart2, Zap, Star, CheckCircle2,
  ChevronDown, ChevronUp, ArrowRight, Cpu, Globe, AlertTriangle,
  Sparkles, UserPlus, Megaphone, DollarSign, Calendar,
} from "lucide-react";
import { format, parseISO } from "date-fns";

// ── Fix leaflet default marker icons ──────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ── U.S. market coordinates ────────────────────────────────────────────────────
const MARKET_COORDS: Record<string, [number, number]> = {
  "Dallas":            [32.7767, -96.7970],
  "Dallas-Fort Worth": [32.8998, -97.0403],
  "Houston":           [29.7604, -95.3698],
  "Atlanta":           [33.7490, -84.3880],
  "Chicago":           [41.8781, -87.6298],
  "Los Angeles":       [34.0522, -118.2437],
  "New York":          [40.7128, -74.0060],
  "Phoenix":           [33.4484, -112.0740],
  "Philadelphia":      [39.9526, -75.1652],
  "San Antonio":       [29.4241, -98.4936],
  "San Diego":         [32.7157, -117.1611],
  "Miami":             [25.7617, -80.1918],
  "Denver":            [39.7392, -104.9903],
  "Seattle":           [47.6062, -122.3321],
  "Nashville":         [36.1627, -86.7816],
  "Tampa":             [27.9506, -82.4572],
  "Charlotte":         [35.2271, -80.8431],
  "Las Vegas":         [36.1699, -115.1398],
  "Austin":            [30.2672, -97.7431],
  "San Francisco":     [37.7749, -122.4194],
  "Portland":          [45.5051, -122.6750],
  "Minneapolis":       [44.9778, -93.2650],
  "Orlando":           [28.5383, -81.3792],
  "Baltimore":         [39.2904, -76.6122],
  "Kansas City":       [39.0997, -94.5786],
  "Columbus":          [39.9612, -82.9988],
  "Indianapolis":      [39.7684, -86.1581],
  "Jacksonville":      [30.3322, -81.6557],
  "Detroit":           [42.3314, -83.0458],
  "Memphis":           [35.1495, -90.0490],
  "Louisville":        [38.2527, -85.7585],
  "Raleigh":           [35.7796, -78.6382],
  "Salt Lake City":    [40.7608, -111.8910],
  "Washington DC":     [38.9072, -77.0369],
  "Boston":            [42.3601, -71.0589],
  "St. Louis":         [38.6270, -90.1994],
  "Sacramento":        [38.5816, -121.4944],
  "New Orleans":       [29.9511, -90.0715],
  "Oklahoma City":     [35.4676, -97.5164],
  "Richmond":          [37.5407, -77.4360],
  "Cincinnati":        [39.1031, -84.5120],
  "Cleveland":         [41.4993, -81.6944],
  "Pittsburgh":        [40.4406, -79.9959],
};

// ── Status system ──────────────────────────────────────────────────────────────
type MarketStatus = "critical" | "high" | "watch" | "balanced" | "surplus";

const STATUS_META: Record<MarketStatus, {
  label: string; dot: string; fillColor: string; borderColor: string; badgeClass: string;
}> = {
  critical: {
    label: "Critical Shortage",
    dot: "bg-red-500", fillColor: "#ef4444", borderColor: "#b91c1c",
    badgeClass: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  },
  high: {
    label: "High Demand",
    dot: "bg-orange-500", fillColor: "#f97316", borderColor: "#c2410c",
    badgeClass: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  },
  watch: {
    label: "Watch",
    dot: "bg-yellow-500", fillColor: "#eab308", borderColor: "#a16207",
    badgeClass: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
  },
  balanced: {
    label: "Balanced",
    dot: "bg-green-500", fillColor: "#22c55e", borderColor: "#15803d",
    badgeClass: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  },
  surplus: {
    label: "Surplus",
    dot: "bg-blue-500", fillColor: "#3b82f6", borderColor: "#1d4ed8",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  },
};

function computeStatus(demand: number, supply: number): MarketStatus {
  if (demand === 0) return supply > 50 ? "surplus" : "balanced";
  const r = supply / demand;
  if (r < 0.6)  return "critical";
  if (r < 0.8)  return "high";
  if (r < 0.95) return "watch";
  if (r < 1.2)  return "balanced";
  return "surplus";
}

// ── API types ──────────────────────────────────────────────────────────────────
interface HeatmapRow {
  market: string; demandCount: number; supplyActive: number;
  supplyPipeline: number; supplyReady: number; supplyTotal: number;
  gapCount: number; campaigns: any[];
}

interface MarketData {
  name: string; coords: [number, number]; status: MarketStatus;
  demandCount: number; supplyActive: number; supplyTotal: number;
  gapCount: number; campaigns: any[]; hasData: boolean;
}

// ── Recruiting request form ────────────────────────────────────────────────────
const DRIVER_TYPES = ["Shift", "OnDemand", "Hybrid", "Shuttle", "CDL"] as const;
const PRIORITY_OPTIONS = [
  { label: "Low", value: 1 }, { label: "Medium", value: 2 },
  { label: "High", value: 3 }, { label: "Critical", value: 4 },
];
const BUSINESS_REASONS = [
  "Customer Growth", "Seasonal Demand", "Replacement Hiring",
  "High Turnover", "New Account", "Expansion", "Custom",
];

const requestSchema = z.object({
  driverTypes:        z.array(z.string()).min(1, "Select at least one driver type"),
  targetDriverCount:  z.coerce.number().min(1, "Quantity must be at least 1"),
  urgency:            z.coerce.number().min(1).max(4),
  businessReason:     z.string().min(1, "Select a business reason"),
  additionalComments: z.string().optional(),
  targetDate:         z.string().optional(),
  network:            z.string().optional(),
  asDraft:            z.boolean().optional(),
});
type RequestForm = z.infer<typeof requestSchema>;

// ── Helpers ────────────────────────────────────────────────────────────────────
function ComingSoonBadge() {
  return (
    <Badge className="text-[10px] no-default-hover-elevate no-default-active-elevate bg-primary/10 text-primary border-primary/20 font-medium">
      Coming Soon
    </Badge>
  );
}

function MetricRow({ label, value, coming }: { label: string; value?: string | number | null; coming?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-muted/40 last:border-0 gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {coming
        ? <ComingSoonBadge />
        : <span className="text-xs font-semibold tabular-nums">{value ?? "—"}</span>
      }
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1 first:mt-0">
      {children}
    </p>
  );
}

function MapClickHandler({ onClickAway }: { onClickAway: () => void }) {
  useMapEvents({ click: onClickAway });
  return null;
}

// ── Recruiting Request Dialog ──────────────────────────────────────────────────
function RecruitingRequestDialog({
  open, onOpenChange, market, userName,
}: { open: boolean; onOpenChange: (v: boolean) => void; market: string; userName: string; }) {
  const { toast } = useToast();
  const form = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
    defaultValues: { driverTypes: [], urgency: 2, businessReason: "", additionalComments: "", targetDate: "", network: "" },
  });

  const submitMutation = useMutation({
    mutationFn: (data: RequestForm) =>
      apiRequest("POST", "/api/recruiting/requests", {
        campaignType: data.urgency >= 3 ? "expedite" : "standard",
        urgency: data.urgency, market, network: data.network || undefined,
        driverTypes: data.driverTypes, targetDriverCount: data.targetDriverCount,
        targetDate: data.targetDate || undefined,
        businessReason: data.businessReason || undefined,
        additionalComments: data.additionalComments || undefined,
        requestOrigin: "workforce_planning",
        asDraft: data.asDraft ?? false,
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requests"] });
      const reqNum = res?.requestNumber ?? res?.id ?? "";
      const isDraft = submitMutation.variables?.asDraft;
      toast({
        title: isDraft ? "Draft saved" : "Request submitted",
        description: isDraft
          ? `Draft ${reqNum ? `(${reqNum}) ` : ""}saved — you can submit it from Recruiting Requests.`
          : `Request ${reqNum ? `${reqNum} ` : ""}for ${market} is pending approval.`,
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleDriverType = (type: string, checked: boolean) => {
    const c = form.getValues("driverTypes");
    form.setValue("driverTypes", checked ? [...c, type] : c.filter((t) => t !== type), { shouldValidate: true });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Request Recruiting — {market}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Requested By</Label>
              <Input value={userName} disabled className="bg-muted/50 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Market</Label>
              <Input value={market} disabled className="bg-muted/50 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Network <span className="text-muted-foreground">(optional)</span></Label>
            <Input placeholder="e.g. Atlas, Allied, Mayflower..." {...form.register("network")} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Driver Type <span className="text-red-500">*</span></Label>
            <div className="grid grid-cols-3 gap-2">
              {DRIVER_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-md border hover-elevate">
                  <Checkbox
                    checked={form.watch("driverTypes").includes(type)}
                    onCheckedChange={(c) => toggleDriverType(type, !!c)}
                  />
                  {type}
                </label>
              ))}
            </div>
            {form.formState.errors.driverTypes && (
              <p className="text-xs text-red-500">{form.formState.errors.driverTypes.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Requested Quantity <span className="text-red-500">*</span></Label>
              <Input type="number" min={1} placeholder="e.g. 12" {...form.register("targetDriverCount")} />
              {form.formState.errors.targetDriverCount && (
                <p className="text-xs text-red-500">{form.formState.errors.targetDriverCount.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority <span className="text-red-500">*</span></Label>
              <Select value={String(form.watch("urgency"))} onValueChange={(v) => form.setValue("urgency", Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Business Reason <span className="text-red-500">*</span></Label>
            <Select value={form.watch("businessReason")} onValueChange={(v) => form.setValue("businessReason", v, { shouldValidate: true })}>
              <SelectTrigger><SelectValue placeholder="Select a reason…" /></SelectTrigger>
              <SelectContent>
                {BUSINESS_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.formState.errors.businessReason && (
              <p className="text-xs text-red-500">{form.formState.errors.businessReason.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Supporting Comments <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea rows={3} placeholder="Provide additional context for this request…" {...form.register("additionalComments")} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Desired Start Date <span className="text-muted-foreground">(optional)</span></Label>
            <Input type="date" {...form.register("targetDate")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="outline"
            onClick={form.handleSubmit((d) => submitMutation.mutate({ ...d, asDraft: true }))}
            disabled={submitMutation.isPending}
            data-testid="button-save-draft"
          >
            Save as Draft
          </Button>
          <Button
            onClick={form.handleSubmit((d) => submitMutation.mutate({ ...d, asDraft: false }))}
            disabled={submitMutation.isPending}
            data-testid="button-submit-request"
          >
            {submitMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Action icon helper ─────────────────────────────────────────────────────────
function ActionIcon({ action }: { action: string }) {
  const lower = action.toLowerCase();
  if (lower.includes("hire") || lower.includes("recruit")) return <UserPlus className="h-3.5 w-3.5 text-primary shrink-0" />;
  if (lower.includes("bonus") || lower.includes("referral") || lower.includes("incentive")) return <DollarSign className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
  if (lower.includes("campaign") || lower.includes("launch")) return <Megaphone className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
  if (lower.includes("schedule") || lower.includes("plan")) return <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  return <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

// ── AI Recommendations Panel ──────────────────────────────────────────────────
function AIRecommendationsPanel({ marketName }: { marketName: string }) {
  const { toast } = useToast();

  const {
    data: rec,
    isLoading,
    refetch,
    isFetching,
  } = useQuery<any>({
    queryKey: ["/api/recruiting/workforce-recommendations", marketName],
    queryFn: () =>
      fetch(`/api/recruiting/workforce-recommendations/${encodeURIComponent(marketName)}`, {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : null)),
    staleTime: 5 * 60_000,
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/recruiting/workforce-recommendations/generate", {
        market: marketName,
      }),
    onSuccess: () => {
      refetch();
      toast({ title: "Recommendations updated", description: `AI analysis for ${marketName} is ready.` });
    },
    onError: (e: any) =>
      toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const isGenerating = generateMutation.isPending || isFetching;

  if (isLoading) {
    return (
      <div className="space-y-2 pt-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!rec) {
    return (
      <div className="mt-1 p-3 rounded-md border border-dashed border-muted-foreground/20 text-center space-y-2">
        <Sparkles className="h-5 w-5 mx-auto text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">No AI recommendations yet for {marketName}.</p>
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs"
          disabled={isGenerating}
          onClick={() => generateMutation.mutate()}
          data-testid="button-generate-recommendations"
        >
          {isGenerating
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Generating…</>
            : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate Recommendations</>}
        </Button>
      </div>
    );
  }

  const actions: any[] = Array.isArray(rec.recommendedActions) ? rec.recommendedActions : [];
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sorted = [...actions].sort(
    (a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2),
  );

  const priorityBadge: Record<string, string> = {
    high: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300",
    medium: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300",
    low: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="space-y-2 pt-1">
      {/* Narrative */}
      <p className="text-xs text-muted-foreground leading-relaxed italic">"{rec.narrativeSummary}"</p>

      {/* Action cards */}
      <div className="space-y-1.5">
        {sorted.map((action: any, i: number) => (
          <div key={i} className="flex items-start gap-2 p-2 rounded-md border bg-background hover:bg-muted/30 transition-colors">
            <ActionIcon action={action.action} />
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium leading-tight">{action.action}</span>
                {action.driverType && (
                  <Badge className="text-[9px] no-default-hover-elevate no-default-active-elevate px-1 py-0 h-4 bg-primary/10 text-primary border-primary/20">
                    {action.driverType}
                  </Badge>
                )}
                <Badge className={`text-[9px] no-default-hover-elevate no-default-active-elevate px-1 py-0 h-4 border ${priorityBadge[action.priority] ?? priorityBadge.low}`}>
                  {action.priority}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{action.rationale}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      {rec.estimatedDaysToBalance != null && (
        <div className="flex items-center gap-1.5 p-2 rounded-md bg-primary/5 border border-primary/10">
          <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
          <p className="text-xs text-primary font-medium">
            Estimated {rec.estimatedDaysToBalance} days to restore staffing balance
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-0.5">
        <p className="text-[10px] text-muted-foreground/60">
          {rec.generatedAt
            ? `Updated ${format(parseISO(rec.generatedAt), "MMM d, h:mm a")}`
            : "Recently generated"}
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] px-2 text-muted-foreground"
          disabled={isGenerating}
          onClick={() => generateMutation.mutate()}
        >
          {isGenerating
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <RefreshCw className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

// ── Market Detail Panel ────────────────────────────────────────────────────────
function MarketDetailPanel({
  market, onClose, onRequestRecruiting,
}: { market: MarketData; onClose: () => void; onRequestRecruiting: () => void; }) {
  const meta = STATUS_META[market.status];
  const shortage = Math.max(0, market.demandCount - market.supplyTotal);

  return (
    <div className="w-80 border-l bg-background flex flex-col overflow-hidden" data-testid="panel-market-detail">
      <div className="flex items-start justify-between p-4 border-b gap-2">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="font-semibold text-sm">{market.name}</h2>
          </div>
          <Badge className={`text-[10px] no-default-hover-elevate no-default-active-elevate border ${meta.badgeClass}`}>
            {meta.label}
          </Badge>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-0.5">

          {/* ── AI Recommendations ── */}
          <SectionLabel>
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              AI Recommendations
            </span>
          </SectionLabel>
          <AIRecommendationsPanel marketName={market.name} />

          {/* ── Staffing ── */}
          <SectionLabel>Staffing</SectionLabel>
          <MetricRow label="Active Drivers"     value={market.hasData ? market.supplyActive : null} coming={!market.hasData} />
          <MetricRow label="Eligible Drivers"   coming />
          <MetricRow label="Available Drivers"  coming />
          <MetricRow label="Shift Drivers"      coming />
          <MetricRow label="OnDemand Drivers"   coming />
          <MetricRow label="Hybrid Drivers"     coming />

          {/* ── Operations ── */}
          <SectionLabel>Operations</SectionLabel>
          <MetricRow label="Driver-to-Move Ratio"      coming />
          <MetricRow label="Open Moves"                coming />
          <MetricRow label="Upcoming Scheduled Moves"  coming />
          <MetricRow label="Unassigned Moves"          coming />
          <MetricRow label="Avg Dispatch Fill Time"    coming />

          {/* ── Performance ── */}
          <SectionLabel>Performance</SectionLabel>
          <MetricRow label="SLA Compliance"       coming />
          <MetricRow label="Reliability Score"    coming />
          <MetricRow label="Offer Acceptance Rate" coming />
          <MetricRow label="Driver Turnover"      coming />
          <MetricRow label="Avg Time to Hire"     coming />

          {/* ── Recruiting ── */}
          <SectionLabel>Recruiting</SectionLabel>
          <MetricRow label="Open Recruiting Requests"  value={market.hasData ? (market.campaigns?.length ?? 0) : null} coming={!market.hasData} />
          <MetricRow label="Open Recruiting Campaigns" value={market.hasData ? (market.campaigns?.length ?? 0) : null} coming={!market.hasData} />
          <MetricRow label="Recommended Hiring Qty"    value={market.hasData && shortage > 0 ? shortage : null} coming={!market.hasData || shortage === 0} />

          {/* ── Demand ── */}
          <SectionLabel>Demand</SectionLabel>
          <MetricRow label="Target Drivers"  value={market.hasData ? market.demandCount : null} coming={!market.hasData} />
          <MetricRow label="Current Gap"     value={market.hasData && shortage > 0 ? shortage : (market.hasData ? "None" : null)} coming={!market.hasData} />

        </div>
      </ScrollArea>

      <div className="p-3 border-t">
        <Button className="w-full" size="sm" onClick={onRequestRecruiting} data-testid="button-request-recruiting">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Request Recruiting
        </Button>
      </div>
    </div>
  );
}

// ── Info / Coming Soon sidebar ─────────────────────────────────────────────────
function InfoPanel() {
  const [metricsExpanded, setMetricsExpanded] = useState(false);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4 w-72">

        {/* Hero */}
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/15 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Workforce Planning</p>
              <Badge className="text-[10px] no-default-hover-elevate no-default-active-elevate bg-primary/10 text-primary border-primary/20 mt-0.5">
                Coming Soon
              </Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            A real-time operational intelligence layer that maps staffing demand across every market — giving dispatch, recruiting, and operations a single source of truth.
          </p>
        </div>

        {/* Heat map legend */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Map Legend
          </p>
          <div className="space-y-1.5">
            {(Object.entries(STATUS_META) as [MarketStatus, typeof STATUS_META[MarketStatus]][]).map(([, meta]) => (
              <div key={meta.label} className="flex items-center gap-2.5 text-xs">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${meta.dot}`} />
                <span className="font-medium">{meta.label}</span>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* What is it */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Why It Matters</p>
          {[
            { icon: Activity, text: "Know exactly where drivers are needed before a shortage impacts delivery SLAs." },
            { icon: Briefcase, text: "Recruiting teams get market-level hiring targets driven by real operational data." },
            { icon: BarChart2, text: "Operations gains a live view of coverage gaps across all markets and networks." },
          ].map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/70" />
              <span className="leading-relaxed">{text}</span>
            </div>
          ))}
        </div>

        {/* Metrics */}
        <div className="space-y-1.5">
          <button
            className="flex items-center justify-between w-full text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            onClick={() => setMetricsExpanded((p) => !p)}
            data-testid="button-expand-metrics"
          >
            <span>Metrics That Drive Demand</span>
            {metricsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {metricsExpanded && (
            <div className="space-y-2 pt-1">
              {[
                { group: "Staffing", items: ["Active Drivers", "Eligible Drivers", "Available Drivers", "Shift / OnDemand / Hybrid split"] },
                { group: "Operations", items: ["Open Moves", "Unassigned Moves", "Driver-to-Move Ratio", "Dispatch Fill Time"] },
                { group: "Performance", items: ["SLA Compliance", "Reliability Score", "Offer Acceptance Rate", "Driver Turnover"] },
                { group: "Recruiting", items: ["Avg Time to Hire", "Open Requests", "Active Campaigns", "Recommended Hiring Qty"] },
              ].map(({ group, items }) => (
                <div key={group}>
                  <p className="text-[10px] font-semibold text-muted-foreground/70 mb-1">{group}</p>
                  {items.map((item) => (
                    <div key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground py-0.5">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Benefits */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Role Benefits</p>
          {[
            { role: "Dispatch", benefit: "Proactive shortage alerts before shift start, preventing missed pickups." },
            { role: "Recruiting", benefit: "Market-specific hiring targets with recommended driver type mix." },
            { role: "Operations", benefit: "Portfolio-level view of coverage risk across all accounts and networks." },
          ].map(({ role, benefit }) => (
            <div key={role} className="p-2.5 rounded-md border bg-muted/30 space-y-0.5">
              <p className="text-xs font-semibold">{role}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{benefit}</p>
            </div>
          ))}
        </div>

        {/* How recommendations work */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">How Staffing Recommendations Work</p>
          <div className="space-y-1.5">
            {[
              "Collect demand signals: open moves, scheduled moves, unassigned volume.",
              "Compare against active + pipeline supply per market.",
              "Apply turnover and acceptance rate to forecast net additions needed.",
              "Surface a recommended hire count and driver type mix per market.",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-0.5 h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0 text-foreground/60">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* AI features */}
        <div className="p-3 rounded-lg bg-muted/30 border space-y-2">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold">AI-Assisted Recruiting</p>
            <ComingSoonBadge />
          </div>
          <div className="space-y-1.5">
            {[
              "Predictive demand forecasting using move volume trends",
              "Automated recruiting request generation for critical markets",
              "Optimal driver type mix based on historical fill rates",
              "Risk-ranked market alert queue with suggested actions",
              "Channel spend recommendations per market segment",
            ].map((cap) => (
              <div key={cap} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5 text-primary/60" />
                <span className="leading-relaxed">{cap}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[10px] text-muted-foreground/60 text-center pb-2">
          Click any market on the map to view a drill-down
        </div>
      </div>
    </ScrollArea>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function WorkforcePlanning() {
  const { user } = useAuth();
  const [selectedMarket, setSelectedMarket] = useState<MarketData | null>(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);

  const { data: heatmapRows = [], isLoading, refetch, isFetching } = useQuery<HeatmapRow[]>({
    queryKey: ["/api/recruiting/supply-heatmap"],
    staleTime: 60_000,
  });

  const apiMarkets = new Map<string, HeatmapRow>();
  heatmapRows.forEach((r) => apiMarkets.set(r.market.toLowerCase(), r));

  const allMarkets: MarketData[] = Object.entries(MARKET_COORDS).map(([name, coords]) => {
    const row = apiMarkets.get(name.toLowerCase());
    if (row) {
      return {
        name, coords,
        status:      computeStatus(row.demandCount, row.supplyTotal),
        demandCount: row.demandCount, supplyActive: row.supplyActive,
        supplyTotal: row.supplyTotal, gapCount: row.gapCount,
        campaigns:   row.campaigns,  hasData: true,
      };
    }
    return { name, coords, status: "balanced", demandCount: 0, supplyActive: 0, supplyTotal: 0, gapCount: 0, campaigns: [], hasData: false };
  });

  const statusCounts = allMarkets.reduce<Record<MarketStatus, number>>(
    (acc, m) => { acc[m.status]++; return acc; },
    { critical: 0, high: 0, watch: 0, balanced: 0, surplus: 0 },
  );

  const userName = `${(user as any)?.firstName ?? ""} ${(user as any)?.lastName ?? ""}`.trim() || (user as any)?.email || "You";

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]" data-testid="page-workforce-planning">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-b bg-background flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold">Workforce Planning</h1>
          <Badge className="text-[10px] no-default-hover-elevate no-default-active-elevate bg-primary/10 text-primary border-primary/20">
            Coming Soon
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.entries(STATUS_META) as [MarketStatus, typeof STATUS_META[MarketStatus]][]).map(([status, meta]) => (
            <div
              key={status}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
              style={{ backgroundColor: meta.fillColor + "18", borderColor: meta.fillColor + "45", color: meta.fillColor }}
            >
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.fillColor }} />
              <span className="font-medium hidden sm:inline">{meta.label}</span>
              <span className="tabular-nums">{statusCounts[status]}</span>
            </div>
          ))}
        </div>

        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-workforce">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""} mr-1.5`} />
          Refresh
        </Button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left info panel */}
        <div className="border-r bg-background hidden lg:block">
          <InfoPanel />
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-background/70 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading market data…
              </div>
            </div>
          )}

          <MapContainer
            center={[39.5, -98.35]}
            zoom={4}
            scrollWheelZoom
            dragging
            zoomControl
            className="h-full w-full"
            style={{ height: "100%", width: "100%", zIndex: 1 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onClickAway={() => setSelectedMarket(null)} />

            {allMarkets.map((m) => {
              const meta       = STATUS_META[m.status];
              const isSelected = selectedMarket?.name === m.name;
              const radius     = m.hasData ? Math.max(10, Math.min(22, 10 + m.demandCount / 3)) : 8;

              return (
                <CircleMarker
                  key={m.name}
                  center={m.coords}
                  radius={isSelected ? radius + 4 : radius}
                  pathOptions={{
                    fillColor:   meta.fillColor,
                    color:       isSelected ? "#ffffff" : meta.borderColor,
                    weight:      isSelected ? 3 : 1.5,
                    opacity:     1,
                    fillOpacity: m.hasData ? 0.9 : 0.4,
                  }}
                  eventHandlers={{
                    click: (e) => { e.originalEvent.stopPropagation(); setSelectedMarket(m); },
                  }}
                >
                  <Tooltip direction="top" offset={[0, -4]} opacity={1}>
                    <div className="text-xs">
                      <div className="font-semibold">{m.name}</div>
                      {m.hasData
                        ? <div className="text-muted-foreground">{m.supplyActive} drivers · {m.demandCount} needed</div>
                        : <div className="text-muted-foreground">No active plans</div>
                      }
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>

          {/* Floating stats */}
          <div className="absolute bottom-4 left-4 z-[400] bg-background/95 backdrop-blur border rounded-lg px-3 py-2 shadow-sm text-xs space-y-0.5">
            <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Active Markets</p>
            <p className="text-lg font-bold tabular-nums">{allMarkets.filter((m) => m.hasData).length}</p>
            <p className="text-muted-foreground">with recruiting plans</p>
          </div>

          {!selectedMarket && !isLoading && (
            <div className="absolute top-4 right-4 z-[400] bg-background/95 backdrop-blur border rounded-lg px-3 py-2 shadow-sm text-xs text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Click any market to view details
            </div>
          )}
        </div>

        {/* Right detail panel */}
        {selectedMarket && (
          <MarketDetailPanel
            market={selectedMarket}
            onClose={() => setSelectedMarket(null)}
            onRequestRecruiting={() => setRequestDialogOpen(true)}
          />
        )}
      </div>

      {selectedMarket && (
        <RecruitingRequestDialog
          open={requestDialogOpen}
          onOpenChange={setRequestDialogOpen}
          market={selectedMarket.name}
          userName={userName}
        />
      )}
    </div>
  );
}
