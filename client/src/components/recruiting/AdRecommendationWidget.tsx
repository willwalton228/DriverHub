import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Megaphone,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Radio,
  Star,
  BarChart3,
  Sparkles,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";

interface RankedChannel {
  rank: number;
  channel: string;
  confidenceScore: number;
  audienceFitNote: string;
  estimatedCostTier: "low" | "medium" | "high";
}

interface AdRecommendationWidgetProps {
  requisitionId: string;
  requisition: {
    market: string;
    workerType: string;
    requisitionType?: string | null;
    requiredLicenseClass?: string | null;
  };
  /** Audience strategy tags from the requisition — pre-populates demographic strategy */
  audienceStrategyTags?: string[];
}

const COST_TIER_META: Record<
  "low" | "medium" | "high",
  { label: string; color: string }
> = {
  low: { label: "Low Cost", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  medium: { label: "Mid Cost", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  high: { label: "High Cost", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

const CONFIDENCE_COLOR = (score: number) => {
  if (score >= 75) return "bg-green-500";
  if (score >= 50) return "bg-yellow-400";
  return "bg-muted-foreground/40";
};

const RANK_ICONS: Record<number, React.ReactNode> = {
  1: <Star className="h-4 w-4 text-yellow-500 fill-yellow-400" />,
  2: <Star className="h-4 w-4 text-slate-400 fill-slate-300" />,
  3: <Star className="h-4 w-4 text-amber-600 fill-amber-500" />,
};

const CHANNEL_ICONS: Record<string, string> = {
  "Indeed": "IN",
  "Craigslist": "CL",
  "Facebook Ads": "FB",
  "Facebook Groups": "FG",
  "Instagram": "IG",
  "TikTok": "TK",
  "LinkedIn": "LI",
  "ZipRecruiter": "ZR",
  "Local / Community Boards": "LC",
  "Employee Referral Program": "RP",
  "Career Fair": "CF",
  "Company Website": "WB",
};

// Audience tag label map (mirrors AUDIENCE_STRATEGY_TAGS in schema.ts)
const AUDIENCE_TAG_LABELS: Record<string, string> = {
  retiree_friendly:          "Retiree-Friendly",
  military_veteran_friendly: "Military & Veteran Friendly",
  part_time_friendly:        "Part-Time Friendly",
  weekday_only:              "Weekday Only",
  flexible_hours:            "Flexible Hours",
  career_change:             "Career Changers Welcome",
  student_friendly:          "Student-Friendly",
  seasonal:                  "Seasonal",
};

function buildDemographicHint(tags: string[]): string {
  if (!tags?.length) return "";
  return tags.map(t => AUDIENCE_TAG_LABELS[t] ?? t).join(", ");
}

export function AdRecommendationWidget({ requisitionId, requisition, audienceStrategyTags }: AdRecommendationWidgetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showInputOverrides, setShowInputOverrides] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const [overrideMarket, setOverrideMarket] = useState(requisition.market || "");
  const [overrideWorkerType, setOverrideWorkerType] = useState(requisition.workerType || "W2_DRIVER");
  const [overrideCdl, setOverrideCdl] = useState(
    !!(requisition.requiredLicenseClass && requisition.requiredLicenseClass !== "Non-CDL")
  );
  const [overrideEmpType, setOverrideEmpType] = useState(requisition.requisitionType || "full_time");
  const [overrideDemographic, setOverrideDemographic] = useState(
    () => buildDemographicHint(audienceStrategyTags ?? [])
  );

  const { data: recommendation, isLoading: loadingRec } = useQuery<any>({
    queryKey: ["/api/recruiting/requisitions", requisitionId, "ad-recommendation"],
    queryFn: async () => {
      const res = await fetch(
        `/api/recruiting/requisitions/${requisitionId}/ad-recommendation`,
        { credentials: "include" }
      );
      if (!res.ok) return null;
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting/requisitions/${requisitionId}/ad-recommendation`, {
        market: overrideMarket,
        workerType: overrideWorkerType,
        cdlRequired: overrideCdl,
        employmentType: overrideEmpType,
        demographicStrategy: overrideDemographic || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/recruiting/requisitions", requisitionId, "ad-recommendation"],
      });
      setShowInputOverrides(false);
      toast({ title: "Ad channel recommendation generated" });
    },
    onError: () => {
      toast({ title: "Failed to generate recommendation", variant: "destructive" });
    },
  });

  const rec = recommendation;
  const channels: RankedChannel[] = rec?.rankedChannels || [];

  return (
    <Card data-testid="card-ad-recommendation">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            AI Ad Source Recommendation
          </CardTitle>
          <div className="flex items-center gap-2">
            {rec && (
              <Button
                size="sm"
                variant="ghost"
                data-testid="button-regenerate-ad-rec"
                disabled={generateMutation.isPending}
                onClick={() => setShowInputOverrides(v => !v)}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Regenerate
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setExpanded(v => !v)}
              data-testid="button-toggle-ad-rec"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <CardDescription>
          Ranked advertising channels based on internal source-to-hire data and market profile.
          Advisory only — recruiter retains full decision authority.
        </CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Input overrides panel */}
          {(!rec || showInputOverrides) && (
            <div className="space-y-4 p-4 rounded-md bg-muted/40">
              <p className="text-sm font-medium">
                {rec ? "Update inputs to regenerate" : "Confirm inputs and generate recommendation"}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ad-market">Market</Label>
                  <Input
                    id="ad-market"
                    data-testid="input-ad-market"
                    value={overrideMarket}
                    onChange={e => setOverrideMarket(e.target.value)}
                    placeholder="e.g., Phoenix, AZ"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ad-worker-type">Worker Type</Label>
                  <Select value={overrideWorkerType} onValueChange={setOverrideWorkerType}>
                    <SelectTrigger id="ad-worker-type" data-testid="select-ad-worker-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="W2_DRIVER">W2 Driver</SelectItem>
                      <SelectItem value="IC_DRIVER">IC Driver (1099)</SelectItem>
                      <SelectItem value="CORP_EMPLOYEE">Corporate Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ad-emp-type">Employment Type</Label>
                  <Select value={overrideEmpType} onValueChange={setOverrideEmpType}>
                    <SelectTrigger id="ad-emp-type" data-testid="select-ad-emp-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_time">Full-Time</SelectItem>
                      <SelectItem value="part_time">Part-Time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="seasonal">Seasonal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ad-demographic">Demographic Strategy (optional)</Label>
                  <Input
                    id="ad-demographic"
                    data-testid="input-ad-demographic"
                    value={overrideDemographic}
                    onChange={e => setOverrideDemographic(e.target.value)}
                    placeholder="e.g., experienced CDL holders 25-45"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="ad-cdl"
                  checked={overrideCdl}
                  onCheckedChange={setOverrideCdl}
                  data-testid="switch-ad-cdl"
                />
                <Label htmlFor="ad-cdl" className="cursor-pointer">CDL Required</Label>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  data-testid="button-generate-ad-rec"
                  disabled={generateMutation.isPending || !overrideMarket.trim()}
                  onClick={() => generateMutation.mutate()}
                >
                  {generateMutation.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Analyzing…</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 mr-2" />Generate Recommendation</>
                  )}
                </Button>
                {rec && (
                  <Button
                    variant="outline"
                    onClick={() => setShowInputOverrides(false)}
                    disabled={generateMutation.isPending}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Loading */}
          {loadingRec && !rec && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading recommendation…</span>
            </div>
          )}

          {/* Empty state */}
          {!rec && !loadingRec && !showInputOverrides && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <Radio className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">No channel recommendation yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generate an AI-powered ranking of the best ad channels for this market.
                </p>
              </div>
              <Button
                size="sm"
                data-testid="button-generate-ad-rec-empty"
                onClick={() => setShowInputOverrides(true)}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Generate Recommendation
              </Button>
            </div>
          )}

          {/* Results */}
          {rec && !showInputOverrides && (
            <div className="space-y-4">
              {/* Narrative */}
              {rec.narrativeSummary && (
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-ad-narrative">
                  {rec.narrativeSummary}
                </p>
              )}

              {/* Historical context pill */}
              {rec.historicalContext?.totalHiresSampled > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                  Based on {rec.historicalContext.totalHiresSampled} internal hires in this market
                </div>
              )}

              {/* Ranked channel list */}
              <div className="space-y-2" data-testid="list-ranked-channels">
                {channels.map((ch: RankedChannel) => {
                  const costMeta = COST_TIER_META[ch.estimatedCostTier] ?? COST_TIER_META.medium;
                  return (
                    <div
                      key={ch.rank}
                      className="flex items-start gap-3 p-3 rounded-md bg-muted/40"
                      data-testid={`card-channel-${ch.rank}`}
                    >
                      {/* Rank badge */}
                      <div className="flex flex-col items-center gap-1 shrink-0 w-8 pt-0.5">
                        <span className="text-xs font-bold text-muted-foreground">
                          #{ch.rank}
                        </span>
                        {RANK_ICONS[ch.rank] ?? null}
                      </div>

                      {/* Channel abbrev icon */}
                      <div className="h-8 w-8 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                        {CHANNEL_ICONS[ch.channel] ?? ch.channel.slice(0, 2).toUpperCase()}
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium" data-testid={`text-channel-name-${ch.rank}`}>
                            {ch.channel}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${costMeta.color}`}>
                            {costMeta.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-snug">
                          {ch.audienceFitNote}
                        </p>
                        {/* Confidence bar */}
                        <div className="flex items-center gap-2 pt-0.5">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[120px]">
                            <div
                              className={`h-full rounded-full ${CONFIDENCE_COLOR(ch.confidenceScore)}`}
                              style={{ width: `${ch.confidenceScore}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {ch.confidenceScore}% confidence
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Meta footer */}
              <div className="text-xs text-muted-foreground pt-1 border-t flex flex-wrap gap-x-4 gap-y-1">
                {rec.generatedAt && (
                  <span>
                    Generated{" "}
                    {new Date(rec.generatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {rec.inputsSnapshot?.market && <span>Market: {rec.inputsSnapshot.market}</span>}
                {rec.inputsSnapshot?.workerType && <span>Worker: {rec.inputsSnapshot.workerType}</span>}
                {rec.inputsSnapshot?.cdlRequired !== undefined && (
                  <span>CDL: {rec.inputsSnapshot.cdlRequired ? "Required" : "Not required"}</span>
                )}
                {rec.inputsSnapshot?.demographicStrategy && (
                  <span>Strategy: {rec.inputsSnapshot.demographicStrategy}</span>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Rankings are advisory. Verify channel performance against your own data before committing budget.
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
