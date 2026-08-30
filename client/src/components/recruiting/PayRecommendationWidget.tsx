import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  Loader2,
  TrendingUp,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  BarChart3,
} from "lucide-react";

interface PayRecommendationWidgetProps {
  requisitionId: string;
  requisition: {
    market: string;
    workerType: string;
    requisitionType?: string | null;
    requiredLicenseClass?: string | null;
    compensationMin?: string | null;
    compensationMax?: string | null;
    compensationType?: string | null;
    targetFillDate?: string | null;
  };
}

const COMPETITIVENESS_META: Record<
  string,
  { label: string; badgeColor: string; icon: React.ReactNode }
> = {
  below_market: {
    label: "Below Market",
    badgeColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    icon: <TrendingUp className="h-3.5 w-3.5 rotate-180" />,
  },
  competitive: {
    label: "Competitive",
    badgeColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  premium: {
    label: "Premium (Above Market)",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
  },
};

const PAY_UNIT_LABEL: Record<string, string> = {
  hourly: "/hr",
  salary: "/yr",
  per_move: "/move",
};

function formatPay(value: number, unit: string) {
  if (unit === "salary") {
    return `$${(value / 1000).toFixed(0)}k`;
  }
  return `$${value.toFixed(2)}`;
}

function targetFillDaysFromDate(targetFillDate?: string | null): number | null {
  if (!targetFillDate) return null;
  const days = Math.round(
    (new Date(targetFillDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  return days > 0 ? days : null;
}

export function PayRecommendationWidget({ requisitionId, requisition }: PayRecommendationWidgetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showInputOverrides, setShowInputOverrides] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Override inputs (pre-seeded from requisition)
  const [overrideMarket, setOverrideMarket] = useState(requisition.market || "");
  const [overrideWorkerType, setOverrideWorkerType] = useState(requisition.workerType || "W2_DRIVER");
  const [overrideCdl, setOverrideCdl] = useState(
    !!(requisition.requiredLicenseClass && requisition.requiredLicenseClass !== "Non-CDL")
  );
  const [overrideEmpType, setOverrideEmpType] = useState(requisition.requisitionType || "full_time");
  const [overrideFillDays, setOverrideFillDays] = useState<string>(
    String(targetFillDaysFromDate(requisition.targetFillDate) || "")
  );

  // Fetch latest stored recommendation
  const { data: recommendation, isLoading: loadingRec } = useQuery<any>({
    queryKey: ["/api/recruiting/requisitions", requisitionId, "pay-recommendation"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/requisitions/${requisitionId}/pay-recommendation`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting/requisitions/${requisitionId}/pay-recommendation`, {
        market: overrideMarket,
        workerType: overrideWorkerType,
        cdlRequired: overrideCdl,
        employmentType: overrideEmpType,
        targetFillDays: overrideFillDays ? parseInt(overrideFillDays, 10) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/recruiting/requisitions", requisitionId, "pay-recommendation"],
      });
      setShowInputOverrides(false);
      toast({ title: "Pay recommendation generated" });
    },
    onError: () => {
      toast({ title: "Failed to generate recommendation", variant: "destructive" });
    },
  });

  // Apply range to requisition mutation
  const applyMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting/requisitions/${requisitionId}/pay-recommendation/apply`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/requisitions"] });
      toast({
        title: "Range applied",
        description: "Compensation range has been updated on the requisition.",
      });
    },
    onError: () => {
      toast({ title: "Failed to apply range", variant: "destructive" });
    },
  });

  const rec = recommendation;
  const competMeta = rec?.competitivenessRating
    ? COMPETITIVENESS_META[rec.competitivenessRating] ?? COMPETITIVENESS_META.competitive
    : null;
  const payUnitLabel = rec?.payUnit ? PAY_UNIT_LABEL[rec.payUnit] ?? "/hr" : "/hr";

  return (
    <Card data-testid="card-pay-recommendation">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Pay Recommendation
          </CardTitle>
          <div className="flex items-center gap-2">
            {rec && (
              <Button
                size="sm"
                variant="ghost"
                data-testid="button-regenerate-pay-rec"
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
              data-testid="button-toggle-pay-rec"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <CardDescription>
          Advisory pay range based on market conditions and internal fill history. Recruiter
          retains full override authority.
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
                  <Label htmlFor="pay-market">Market</Label>
                  <Input
                    id="pay-market"
                    data-testid="input-pay-market"
                    value={overrideMarket}
                    onChange={e => setOverrideMarket(e.target.value)}
                    placeholder="e.g., Phoenix, AZ"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-worker-type">Worker Type</Label>
                  <Select value={overrideWorkerType} onValueChange={setOverrideWorkerType}>
                    <SelectTrigger id="pay-worker-type" data-testid="select-pay-worker-type">
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
                  <Label htmlFor="pay-emp-type">Employment Type</Label>
                  <Select value={overrideEmpType} onValueChange={setOverrideEmpType}>
                    <SelectTrigger id="pay-emp-type" data-testid="select-pay-emp-type">
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
                  <Label htmlFor="pay-fill-days">Target Fill Days</Label>
                  <Input
                    id="pay-fill-days"
                    data-testid="input-pay-fill-days"
                    type="number"
                    min={1}
                    value={overrideFillDays}
                    onChange={e => setOverrideFillDays(e.target.value)}
                    placeholder="e.g., 30"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="pay-cdl"
                  checked={overrideCdl}
                  onCheckedChange={setOverrideCdl}
                  data-testid="switch-pay-cdl"
                />
                <Label htmlFor="pay-cdl" className="cursor-pointer">CDL Required</Label>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  data-testid="button-generate-pay-rec"
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

          {/* Loading state */}
          {loadingRec && !rec && (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading recommendation…</span>
            </div>
          )}

          {/* Empty state — no recommendation yet and input panel is hidden */}
          {!rec && !loadingRec && !showInputOverrides && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">No recommendation generated yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click Generate to get an AI-powered pay range based on market data.
                </p>
              </div>
              <Button
                size="sm"
                data-testid="button-generate-pay-rec-empty"
                onClick={() => setShowInputOverrides(true)}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Generate Recommendation
              </Button>
            </div>
          )}

          {/* Recommendation result */}
          {rec && !showInputOverrides && (
            <div className="space-y-4">
              {/* Pay range hero */}
              <div className="p-4 rounded-md bg-muted/40 space-y-3">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Recommended Range</p>
                    <p className="text-2xl font-bold tracking-tight" data-testid="text-pay-range">
                      {formatPay(rec.payMin, rec.payUnit)}
                      <span className="text-muted-foreground font-normal text-base"> – </span>
                      {formatPay(rec.payMax, rec.payUnit)}
                      <span className="text-sm font-normal text-muted-foreground ml-1">{payUnitLabel}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Midpoint: {formatPay(rec.medianEstimate, rec.payUnit)}{payUnitLabel}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 pb-1">
                    {competMeta && (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${competMeta.badgeColor}`}
                        data-testid="badge-competitiveness"
                      >
                        {competMeta.icon}
                        {competMeta.label}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      Est. {rec.timeToFillEstimate}d to fill
                    </span>
                  </div>
                </div>

                {/* Historical context */}
                {rec.historicalContext?.samplesFound > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Based on {rec.historicalContext.samplesFound} internal requisition(s) in this market
                    {rec.historicalContext.historicalAvgMin
                      ? ` · Historical avg: $${rec.historicalContext.historicalAvgMin.toFixed(2)} – $${(rec.historicalContext.historicalAvgMax || 0).toFixed(2)}`
                      : ""}
                  </p>
                )}
              </div>

              {/* Narrative */}
              {rec.narrativeSummary && (
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-pay-narrative">
                  {rec.narrativeSummary}
                </p>
              )}

              {/* Flagged concerns */}
              {rec.flaggedConcerns?.length > 0 && (
                <div className="space-y-1.5">
                  {rec.flaggedConcerns.map((concern: string, i: number) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-sm text-yellow-800 dark:text-yellow-300"
                      data-testid={`text-pay-concern-${i}`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{concern}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Meta: inputs used + generated at */}
              <div className="text-xs text-muted-foreground pt-1 border-t flex flex-wrap gap-x-4 gap-y-1">
                {rec.generatedAt && (
                  <span>
                    Generated {new Date(rec.generatedAt).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                )}
                {rec.inputsSnapshot?.market && <span>Market: {rec.inputsSnapshot.market}</span>}
                {rec.inputsSnapshot?.workerType && <span>Worker: {rec.inputsSnapshot.workerType}</span>}
                {rec.inputsSnapshot?.cdlRequired !== undefined && (
                  <span>CDL: {rec.inputsSnapshot.cdlRequired ? "Required" : "Not required"}</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  data-testid="button-apply-pay-range"
                  disabled={applyMutation.isPending || rec.isApplied}
                  onClick={() => applyMutation.mutate()}
                >
                  {applyMutation.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Applying…</>
                  ) : rec.isApplied ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Range Applied</>
                  ) : (
                    <><DollarSign className="h-3.5 w-3.5 mr-1.5" />Apply Range to Requisition</>
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                "Apply Range" pre-fills the requisition compensation fields. Recruiter retains full
                authority to adjust or override these values at any time.
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
