import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  BrainCircuit,
  RefreshCw,
  DollarSign,
  Megaphone,
  Clock,
  ShieldAlert,
  Rocket,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  TrendingUp,
  BarChart3,
  MapPin,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

// ── Types ────────────────────────────────────────────────────────────────────

interface RankedChannel {
  channel: string;
  priority: "primary" | "secondary" | "supplemental";
  rationale: string;
}

interface MarketIntelligenceSnapshot {
  id: string;
  geography: string;
  activeRequisitions: number;
  activePipeline: number;
  hiredCount: number;
  payRangeMin: string | null;
  payRangeMax: string | null;
  payUnit: string | null;
  payCompetitiveness: string | null;
  payNarrative: string | null;
  topChannel: string | null;
  rankedChannels: RankedChannel[];
  channelNarrative: string | null;
  expectedTimeToFill: number | null;
  timeToFillNarrative: string | null;
  supplyRiskLevel: string | null;
  supplyRiskFactors: string[];
  supplyRiskNarrative: string | null;
  launchReadinessScore: number | null;
  launchReadinessLabel: string | null;
  launchReadinessBlockers: string[];
  overallNarrative: string | null;
  strategicPriorities: string[];
  generatedAt: string;
  aiModel: string | null;
}

// ── Helper components ────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const configs: Record<string, { label: string; className: string }> = {
    low: { label: "Low Risk", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800" },
    moderate: { label: "Moderate Risk", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800" },
    high: { label: "High Risk", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800" },
    critical: { label: "Critical Risk", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800" },
  };
  const cfg = configs[level] ?? configs.moderate;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function ReadinessBadge({ label, score }: { label: string | null; score: number | null }) {
  if (!label) return null;
  const configs: Record<string, { icon: typeof CheckCircle2; className: string }> = {
    ready: { icon: CheckCircle2, className: "text-green-600 dark:text-green-400" },
    at_risk: { icon: AlertTriangle, className: "text-yellow-600 dark:text-yellow-400" },
    blocked: { icon: XCircle, className: "text-red-600 dark:text-red-400" },
  };
  const cfg = configs[label] ?? configs.at_risk;
  const Icon = cfg.icon;
  const labelMap: Record<string, string> = {
    ready: "Launch Ready",
    at_risk: "At Risk",
    blocked: "Blocked",
  };
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-4 w-4 ${cfg.className}`} />
      <span className={`text-sm font-semibold ${cfg.className}`}>{labelMap[label] ?? label}</span>
      {score !== null && <span className="text-sm text-muted-foreground">({score}/100)</span>}
    </div>
  );
}

function CompetitivenessLabel({ value }: { value: string | null }) {
  if (!value) return null;
  const map: Record<string, { label: string; color: string }> = {
    below_market: { label: "Below Market", color: "text-red-600 dark:text-red-400" },
    competitive: { label: "Competitive", color: "text-green-600 dark:text-green-400" },
    premium: { label: "Premium", color: "text-blue-600 dark:text-blue-400" },
  };
  const cfg = map[value] ?? { label: value, color: "text-muted-foreground" };
  return <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    primary: "bg-primary/10 text-primary border-primary/20",
    secondary: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    supplemental: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[priority] ?? map.supplemental}`}>
      {priority}
    </span>
  );
}

function ReadinessBar({ score }: { score: number | null }) {
  if (score === null) return null;
  const pct = Math.max(0, Math.min(100, score));
  const color =
    pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>Launch Readiness</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MarketIntelligenceDashboard() {
  const [geography, setGeography] = useState<string>("");
  const [customGeo, setCustomGeo] = useState<string>("");
  const [showHistory, setShowHistory] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const activeGeo = geography === "__custom__" ? customGeo.trim() : geography;

  // Load geographies
  const { data: geoData } = useQuery<{ geographies: string[] }>({
    queryKey: ["/api/recruiting/market-intelligence/geographies"],
  });
  const geographies = geoData?.geographies ?? [];

  // Load snapshot for selected geography
  const {
    data: snapshotData,
    isLoading: snapshotLoading,
    isFetching,
  } = useQuery<{ snapshot: MarketIntelligenceSnapshot | null }>({
    queryKey: ["/api/recruiting/market-intelligence", activeGeo],
    queryFn: () =>
      fetch(`/api/recruiting/market-intelligence?geography=${encodeURIComponent(activeGeo)}`)
        .then((r) => r.json()),
    enabled: !!activeGeo,
  });
  const snapshot = snapshotData?.snapshot ?? null;

  // Load history
  const { data: historyData } = useQuery<{ history: MarketIntelligenceSnapshot[] }>({
    queryKey: ["/api/recruiting/market-intelligence/history", activeGeo],
    queryFn: () =>
      fetch(`/api/recruiting/market-intelligence/history?geography=${encodeURIComponent(activeGeo)}`)
        .then((r) => r.json()),
    enabled: showHistory && !!activeGeo,
  });
  const history = historyData?.history ?? [];

  // Generate snapshot
  const generateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/recruiting/market-intelligence/generate", {
        geography: activeGeo,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/market-intelligence", activeGeo] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/market-intelligence/history", activeGeo] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/market-intelligence/geographies"] });
      toast({ title: "Market intelligence generated", description: `Analysis complete for ${activeGeo}.` });
    },
    onError: (err: any) => {
      toast({
        title: "Generation failed",
        description: err?.message ?? "Unable to generate market intelligence.",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!activeGeo) {
      toast({ title: "Select a geography first", variant: "destructive" });
      return;
    }
    generateMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Header + Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <BrainCircuit className="h-5 w-5 text-primary shrink-0" />
          <div>
            <h2 className="text-lg font-semibold leading-tight">AI Market Intelligence</h2>
            <p className="text-sm text-muted-foreground">
              AI-synthesized recruiting signals by geography — advisory only
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <Select
              value={geography}
              onValueChange={(v) => { setGeography(v); setShowHistory(false); }}
            >
              <SelectTrigger className="w-[200px]" data-testid="select-market-geography">
                <SelectValue placeholder="Select geography…" />
              </SelectTrigger>
              <SelectContent>
                {geographies.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
                <SelectItem value="__custom__">Custom geography…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {geography === "__custom__" && (
            <input
              type="text"
              value={customGeo}
              onChange={(e) => setCustomGeo(e.target.value)}
              placeholder="e.g. Dallas, TX"
              className="border border-input rounded-md px-3 py-2 text-sm bg-background h-9 w-[180px]"
              data-testid="input-custom-geography"
            />
          )}

          <Button
            onClick={handleGenerate}
            disabled={!activeGeo || generateMutation.isPending}
            data-testid="button-generate-market-intel"
          >
            {generateMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <BrainCircuit className="h-4 w-4 mr-2" />
            )}
            {snapshot ? "Refresh Analysis" : "Generate Analysis"}
          </Button>
        </div>
      </div>

      {/* No geography selected */}
      {!activeGeo && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3">
            <MapPin className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground text-center">
              Select a geography above to view or generate AI market intelligence.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {activeGeo && (snapshotLoading || isFetching) && !snapshot && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* No snapshot yet */}
      {activeGeo && !snapshotLoading && !snapshot && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <BrainCircuit className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">No analysis yet for {activeGeo}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click "Generate Analysis" to run an AI-powered market intelligence report.
              </p>
            </div>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <BrainCircuit className="h-4 w-4 mr-2" />
              )}
              Generate Analysis
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dashboard Grid */}
      {snapshot && (
        <>
          {/* Meta strip */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <BarChart3 className="h-3.5 w-3.5" />
                {snapshot.activeRequisitions} open req{snapshot.activeRequisitions !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                {snapshot.activePipeline} active applicants
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                {snapshot.hiredCount} hired
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Generated {formatDistanceToNow(new Date(snapshot.generatedAt))} ago
              {snapshot.aiModel && <span className="text-muted-foreground/60">· {snapshot.aiModel}</span>}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowHistory(!showHistory)}
                data-testid="button-toggle-history"
              >
                {showHistory ? "Hide" : "View"} History
              </Button>
            </div>
          </div>

          {/* Executive Summary */}
          {snapshot.overallNarrative && (
            <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">Executive Summary</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{snapshot.overallNarrative}</p>
                {snapshot.strategicPriorities.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Strategic Priorities</p>
                    {snapshot.strategicPriorities.map((p, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <ChevronRight className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                        <span>{p}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 5-card KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Pay Range */}
            <Card data-testid="card-pay-range">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Recommended Pay Range</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {snapshot.payRangeMin && snapshot.payRangeMax ? (
                  <div>
                    <div className="text-3xl font-bold tracking-tight" data-testid="metric-pay-range">
                      ${parseFloat(snapshot.payRangeMin).toFixed(2)}
                      <span className="text-muted-foreground text-xl font-normal"> – </span>
                      ${parseFloat(snapshot.payRangeMax).toFixed(2)}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">/{snapshot.payUnit ?? "hr"}</span>
                      <CompetitivenessLabel value={snapshot.payCompetitiveness} />
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No pay data</p>
                )}
                {snapshot.payNarrative && (
                  <p className="text-xs text-muted-foreground leading-relaxed border-t pt-2">
                    {snapshot.payNarrative}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Top Source / Channel */}
            <Card data-testid="card-top-channel">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Source & Channel Strategy</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {snapshot.topChannel ? (
                  <>
                    <div className="text-xl font-bold" data-testid="metric-top-channel">{snapshot.topChannel}</div>
                    <p className="text-xs text-muted-foreground">Primary recommended channel</p>
                    {snapshot.rankedChannels.length > 1 && (
                      <div className="space-y-1.5 border-t pt-2">
                        {snapshot.rankedChannels.slice(0, 4).map((ch, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <PriorityBadge priority={ch.priority} />
                            <div>
                              <span className="text-xs font-medium">{ch.channel}</span>
                              <p className="text-xs text-muted-foreground">{ch.rationale}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No channel data</p>
                )}
                {snapshot.channelNarrative && (
                  <p className="text-xs text-muted-foreground leading-relaxed border-t pt-2">
                    {snapshot.channelNarrative}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Time to Fill */}
            <Card data-testid="card-time-to-fill">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Expected Time to Fill</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {snapshot.expectedTimeToFill !== null ? (
                  <>
                    <div className="text-3xl font-bold tracking-tight" data-testid="metric-time-to-fill">
                      {snapshot.expectedTimeToFill}
                      <span className="text-base font-normal text-muted-foreground ml-1">days</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ≈ {Math.ceil(snapshot.expectedTimeToFill / 7)} week{Math.ceil(snapshot.expectedTimeToFill / 7) !== 1 ? "s" : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No estimate available</p>
                )}
                {snapshot.timeToFillNarrative && (
                  <p className="text-xs text-muted-foreground leading-relaxed border-t pt-2">
                    {snapshot.timeToFillNarrative}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Supply Risk */}
            <Card data-testid="card-supply-risk">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Supply Risk</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <RiskBadge level={snapshot.supplyRiskLevel} />
                </div>
                {snapshot.supplyRiskFactors.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {snapshot.supplyRiskFactors.map((f, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <AlertTriangle className="h-3 w-3 text-yellow-500 mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                )}
                {snapshot.supplyRiskNarrative && (
                  <p className="text-xs text-muted-foreground leading-relaxed border-t pt-2">
                    {snapshot.supplyRiskNarrative}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Launch Readiness */}
            <Card data-testid="card-launch-readiness">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Launch Readiness Forecast</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <ReadinessBadge
                  label={snapshot.launchReadinessLabel}
                  score={snapshot.launchReadinessScore}
                />
                <ReadinessBar score={snapshot.launchReadinessScore} />
                {snapshot.launchReadinessBlockers.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <p className="text-xs font-medium text-muted-foreground">Blockers</p>
                    {snapshot.launchReadinessBlockers.map((b, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <XCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* History Panel */}
          {showHistory && history.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Analysis History — {activeGeo}</CardTitle>
                <CardDescription>Previous AI snapshots for this geography</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Generated</th>
                        <th className="text-right py-2 px-4 font-medium">Pay Range</th>
                        <th className="text-right py-2 px-4 font-medium">TTF</th>
                        <th className="text-center py-2 px-4 font-medium">Supply Risk</th>
                        <th className="text-center py-2 pl-4 font-medium">Readiness</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 text-muted-foreground text-xs">
                            {format(new Date(h.generatedAt), "MMM d, yyyy h:mm a")}
                          </td>
                          <td className="py-2 px-4 text-right tabular-nums">
                            {h.payRangeMin && h.payRangeMax
                              ? `$${parseFloat(h.payRangeMin).toFixed(2)}–$${parseFloat(h.payRangeMax).toFixed(2)}`
                              : "—"}
                          </td>
                          <td className="py-2 px-4 text-right tabular-nums">
                            {h.expectedTimeToFill !== null ? `${h.expectedTimeToFill}d` : "—"}
                          </td>
                          <td className="py-2 px-4 text-center capitalize">
                            {h.supplyRiskLevel ?? "—"}
                          </td>
                          <td className="py-2 pl-4 text-center">
                            {h.launchReadinessScore !== null ? `${h.launchReadinessScore}/100` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Advisory disclaimer */}
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              This market intelligence is generated by AI and is advisory only. All pay ranges,
              channel recommendations, and forecasts should be reviewed by recruiting leadership
              before being acted upon. DriverHub 360 makes no guarantees regarding the accuracy
              of AI-generated outputs.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
