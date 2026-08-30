import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Brain, DollarSign, Clock, TrendingUp, AlertTriangle, RefreshCw,
  ChevronDown, ChevronUp, Loader2, Pencil, CheckCircle2, Radio,
  BarChart2,
} from "lucide-react";

// ── Shared pill ───────────────────────────────────────────────────────────────
const PILL = "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

const RISK_CHIP: Record<string, { label: string; cls: string }> = {
  low:      { label: "Low Risk",      cls: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800" },
  medium:   { label: "Medium Risk",   cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800" },
  high:     { label: "High Risk",     cls: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800" },
  critical: { label: "Critical Risk", cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800" },
};

const CONFIDENCE_CHIP: Record<string, { cls: string }> = {
  high:   { cls: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800" },
  medium: { cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800" },
  low:    { cls: "bg-muted/60 text-muted-foreground border-border" },
};

const SOURCE_LABEL: Record<string, string> = {
  ai:        "AI-Generated",
  heuristic: "Auto-Generated",
  manual:    "Manual Override",
};

interface Channel {
  channel: string;
  confidence: "high" | "medium" | "low";
  rationale: string;
}

interface IntelligenceRecord {
  id: string;
  payRangeMin: string | null;
  payRangeMax: string | null;
  expectedTimeToFill: number | null;
  recommendedChannels: string | null;
  supplyRiskLevel: string | null;
  notesSummary: string | null;
  generatedBy: string | null;
  isOverridden: boolean;
  overrideNotes: string | null;
  overriddenBy: string | null;
  overriddenAt: string | null;
  updatedAt: string | null;
}

function parseChannels(raw: string | null | undefined): Channel[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as Channel[]; } catch { return []; }
}

function fmt(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = parseFloat(String(v));
  return isNaN(n) ? "—" : `$${n.toFixed(2)}`;
}

// ── Override form ─────────────────────────────────────────────────────────────

function OverrideForm({
  record,
  requisitionId,
  onClose,
}: {
  record: IntelligenceRecord;
  requisitionId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [payMin, setPayMin]     = useState(record.payRangeMin || "");
  const [payMax, setPayMax]     = useState(record.payRangeMax || "");
  const [ttf,    setTtf]        = useState(String(record.expectedTimeToFill ?? ""));
  const [notes,  setNotes]      = useState(record.overrideNotes || record.notesSummary || "");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/recruiting/requisitions/${requisitionId}/market-intelligence`, {
        payRangeMin:        payMin ? parseFloat(payMin) : null,
        payRangeMax:        payMax ? parseFloat(payMax) : null,
        expectedTimeToFill: ttf ? parseInt(ttf, 10) : null,
        overrideNotes:      notes.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requisitions", requisitionId, "market-intelligence"] });
      toast({ title: "Intelligence overridden", description: "Your values have been saved." });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="border border-border rounded-md p-4 bg-muted/20 space-y-4 mt-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Pencil className="h-3.5 w-3.5" />
        Override Intelligence
      </p>
      <p className="text-xs text-muted-foreground">
        These values are advisory only — they do not auto-apply to the requisition pay fields.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Pay Range Min ($/hr)</Label>
          <Input
            value={payMin}
            onChange={e => setPayMin(e.target.value)}
            placeholder="e.g. 18.00"
            type="number"
            step="0.01"
            min="0"
            className="h-9 text-sm"
            data-testid="input-intel-override-pay-min"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Pay Range Max ($/hr)</Label>
          <Input
            value={payMax}
            onChange={e => setPayMax(e.target.value)}
            placeholder="e.g. 22.50"
            type="number"
            step="0.01"
            min="0"
            className="h-9 text-sm"
            data-testid="input-intel-override-pay-max"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Est. Days to Fill</Label>
          <Input
            value={ttf}
            onChange={e => setTtf(e.target.value)}
            placeholder="e.g. 21"
            type="number"
            min="1"
            className="h-9 text-sm"
            data-testid="input-intel-override-ttf"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Notes / Rationale</Label>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Describe your override rationale…"
          className="text-sm min-h-[60px]"
          data-testid="textarea-intel-override-notes"
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="btn-intel-override-save"
        >
          {mutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Save Override
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function CampaignMarketIntelligencePanel({ requisitionId }: { requisitionId: string }) {
  const { toast } = useToast();
  const [expanded,    setExpanded]    = useState(true);
  const [overriding,  setOverriding]  = useState(false);

  const { data: intel, isLoading } = useQuery<IntelligenceRecord | null>({
    queryKey: ["/api/recruiting/requisitions", requisitionId, "market-intelligence"],
    queryFn:  () =>
      fetch(`/api/recruiting/requisitions/${requisitionId}/market-intelligence`)
        .then(r => r.ok ? r.json() : null),
    enabled: !!requisitionId,
    staleTime: 60_000,
  });

  const regenMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting/requisitions/${requisitionId}/market-intelligence/generate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requisitions", requisitionId, "market-intelligence"] });
      toast({ title: "Intelligence regenerated" });
    },
    onError: (err: any) => {
      toast({ title: "Regeneration failed", description: err?.message || "Please try again.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading market intelligence…
        </CardContent>
      </Card>
    );
  }

  if (!intel) {
    return (
      <Card>
        <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Brain className="h-4 w-4 text-muted-foreground/60" />
            Market intelligence not yet generated
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => regenMutation.mutate()}
            disabled={regenMutation.isPending}
            data-testid="btn-intel-generate"
          >
            {regenMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Brain className="h-3.5 w-3.5 mr-1.5" />}
            Generate Intelligence
          </Button>
        </CardContent>
      </Card>
    );
  }

  const channels     = parseChannels(intel.recommendedChannels);
  const riskChip     = RISK_CHIP[intel.supplyRiskLevel || "medium"] ?? RISK_CHIP.medium;
  const sourceLabel  = SOURCE_LABEL[intel.generatedBy || "ai"] ?? "AI-Generated";

  return (
    <Card data-testid="panel-market-intelligence">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap pb-3 pt-4 px-4">
        <button
          className="flex items-center gap-2 flex-1 text-left"
          onClick={() => setExpanded(v => !v)}
          data-testid="btn-intel-toggle"
        >
          <Brain className="h-4 w-4 text-primary shrink-0" />
          <CardTitle className="text-sm font-semibold">Market Intelligence</CardTitle>
          <span className={`${PILL} ml-1 ${intel.isOverridden ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800" : "bg-muted/60 text-muted-foreground border-border"}`}>
            {intel.isOverridden ? "Overridden" : sourceLabel}
          </span>
          <span className={`${PILL} ${riskChip.cls}`}>{riskChip.label}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
        </button>
        <div className="flex gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => regenMutation.mutate()}
            disabled={regenMutation.isPending}
            data-testid="btn-intel-regenerate"
            title="Regenerate intelligence"
          >
            {regenMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setOverriding(v => !v); setExpanded(true); }}
            data-testid="btn-intel-override"
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Override
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 space-y-4">
          {/* ── Metric strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Pay Range */}
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Pay Range
              </p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {fmt(intel.payRangeMin)} – {fmt(intel.payRangeMax)}
              </p>
              <p className="text-[10px] text-muted-foreground/60">per hour · advisory</p>
            </div>

            {/* Time to Fill */}
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Clock className="h-3 w-3" /> Time to Fill
              </p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {intel.expectedTimeToFill ?? "—"} <span className="text-sm font-normal text-muted-foreground">days</span>
              </p>
              <p className="text-[10px] text-muted-foreground/60">estimated</p>
            </div>

            {/* Supply Risk */}
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Supply Risk
              </p>
              <div className="mt-0.5">
                <span className={`${PILL} ${riskChip.cls}`}>{riskChip.label}</span>
              </div>
              <p className="text-[10px] text-muted-foreground/60">market assessment</p>
            </div>

            {/* Top Channel */}
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Radio className="h-3 w-3" /> Top Channel
              </p>
              <p className="text-sm font-semibold text-foreground truncate">
                {channels[0]?.channel || "—"}
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                {channels.length} channel{channels.length !== 1 ? "s" : ""} ranked
              </p>
            </div>
          </div>

          <Separator />

          {/* ── Channels ── */}
          {channels.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <BarChart2 className="h-3.5 w-3.5" />
                Recommended Channels
              </p>
              <div className="space-y-2">
                {channels.map((ch, i) => {
                  const confChip = CONFIDENCE_CHIP[ch.confidence] ?? CONFIDENCE_CHIP.low;
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground/60 mt-0.5 w-4 shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium">{ch.channel}</span>
                          <span className={`${PILL} capitalize ${confChip.cls}`}>{ch.confidence}</span>
                        </div>
                        {ch.rationale && (
                          <p className="text-xs text-muted-foreground mt-0.5">{ch.rationale}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Notes summary ── */}
          {(intel.notesSummary || intel.overrideNotes) && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {intel.isOverridden ? "Override Notes" : "Intelligence Summary"}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {intel.isOverridden && intel.overrideNotes ? intel.overrideNotes : intel.notesSummary}
                </p>
                {intel.isOverridden && intel.overriddenBy && (
                  <p className="text-[10px] text-muted-foreground/60">
                    Overridden by {intel.isOverridden ? intel.overriddenBy : ""}{intel.overriddenAt ? ` · ${new Date(intel.overriddenAt).toLocaleDateString()}` : ""}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Override form ── */}
          {overriding && (
            <OverrideForm
              record={intel}
              requisitionId={requisitionId}
              onClose={() => setOverriding(false)}
            />
          )}

          <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Advisory only — these recommendations do not auto-apply to requisition settings.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
