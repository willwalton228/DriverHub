import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Target, Plus, Trash2, CheckCircle2, AlertTriangle, XCircle,
  TrendingUp, TrendingDown, Minus, BarChart3, Brain, Users,
  DollarSign, Megaphone, Clock, Info,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

// ── Types ────────────────────────────────────────────────────────────────────

interface AIOutcome {
  id: string;
  outcomeType: string;
  geography: string | null;
  snapshotId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  aiRecommendation: Record<string, any>;
  actualOutcome: Record<string, any>;
  accuracyRating: string | null;
  accuracyScore: number | null;
  variancePct: string | null;
  reviewerNotes: string | null;
  marketConditionsNote: string | null;
  recommendedAdjustment: string | null;
  recordedAt: string;
}

interface AccuracyByType {
  count: number;
  accurateCount: number;
  partialCount: number;
  inaccurateCount: number;
  accuracyRate: number;
  avgVariancePct: number | null;
}

interface AccuracyReport {
  totalOutcomes: number;
  byType: Record<string, AccuracyByType>;
  byRating: Record<string, number>;
  avgAccuracyScore: number | null;
  geographies: string[];
}

interface ScreeningRow {
  readinessBucket: string;
  totalCount: number;
  hiredCount: number;
  rejectedCount: number;
  hireRate: number;
}

// ── Form Schema ───────────────────────────────────────────────────────────────

const outcomeFormSchema = z.object({
  outcomeType: z.enum(["pay_range", "source_channel", "time_to_fill"]),
  geography: z.string().min(1, "Geography is required"),
  snapshotId: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  // Pay range fields
  aiPayMin: z.string().optional(),
  aiPayMax: z.string().optional(),
  aiPayUnit: z.string().optional(),
  actualPay: z.string().optional(),
  actualPayUnit: z.string().optional(),
  hireCount: z.string().optional(),
  // Source channel fields
  aiTopChannel: z.string().optional(),
  actualTopChannel: z.string().optional(),
  // Time to fill fields
  aiEstimatedDays: z.string().optional(),
  actualDays: z.string().optional(),
  requisitionsClosed: z.string().optional(),
  // Common
  accuracyRating: z.enum(["accurate", "partially_accurate", "inaccurate", ""]).optional(),
  accuracyScore: z.string().optional(),
  reviewerNotes: z.string().optional(),
  marketConditionsNote: z.string().optional(),
  recommendedAdjustment: z.string().optional(),
});

type OutcomeFormData = z.infer<typeof outcomeFormSchema>;

const OUTCOME_TYPES = [
  { value: "pay_range", label: "Pay Range", icon: DollarSign },
  { value: "source_channel", label: "Source Channel", icon: Megaphone },
  { value: "time_to_fill", label: "Time to Fill", icon: Clock },
];

const AD_CHANNELS = [
  "Indeed", "Craigslist", "Facebook", "Facebook Groups", "Instagram",
  "TikTok", "LinkedIn", "ZipRecruiter", "Company Website", "Referral", "Other",
];

// ── Helper components ────────────────────────────────────────────────────────

function AccuracyBadge({ rating }: { rating: string | null }) {
  if (!rating) return <span className="text-xs text-muted-foreground">Unrated</span>;
  const map: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
    accurate: { label: "Accurate", icon: CheckCircle2, color: "text-green-600 dark:text-green-400" },
    partially_accurate: { label: "Partial", icon: AlertTriangle, color: "text-yellow-600 dark:text-yellow-400" },
    inaccurate: { label: "Inaccurate", icon: XCircle, color: "text-red-600 dark:text-red-400" },
  };
  const cfg = map[rating] ?? map.partially_accurate;
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </div>
  );
}

function VarianceChip({ pct }: { pct: string | null }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const n = parseFloat(pct);
  const abs = Math.abs(n).toFixed(1);
  if (n > 5) return <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />+{abs}%</span>;
  if (n < -5) return <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-0.5"><TrendingDown className="h-3 w-3" />{n.toFixed(1)}%</span>;
  return <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-0.5"><Minus className="h-3 w-3" />{abs}%</span>;
}

function AccuracyRateBar({ rate, count }: { rate: number; count: number }) {
  const color = rate >= 70 ? "bg-green-500" : rate >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{rate}% accurate</span>
        <span>{count} outcomes</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
    </div>
  );
}

// ── Record Outcome Dialog ─────────────────────────────────────────────────────

function RecordOutcomeDialog({
  geography,
  snapshotId,
  onSaved,
}: {
  geography?: string;
  snapshotId?: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<OutcomeFormData>({
    resolver: zodResolver(outcomeFormSchema),
    defaultValues: {
      outcomeType: "pay_range",
      geography: geography ?? "",
      snapshotId: snapshotId ?? "",
      aiPayUnit: "hourly",
      actualPayUnit: "hourly",
      accuracyRating: "",
    },
  });

  const outcomeType = form.watch("outcomeType");

  const mutation = useMutation({
    mutationFn: (data: OutcomeFormData) => {
      let aiRecommendation: Record<string, any> = {};
      let actualOutcome: Record<string, any> = {};
      let variancePct: number | undefined;

      if (data.outcomeType === "pay_range") {
        const aiMid = data.aiPayMin && data.aiPayMax
          ? (parseFloat(data.aiPayMin) + parseFloat(data.aiPayMax)) / 2
          : null;
        const actual = data.actualPay ? parseFloat(data.actualPay) : null;
        aiRecommendation = { payMin: data.aiPayMin, payMax: data.aiPayMax, payUnit: data.aiPayUnit };
        actualOutcome = { actualPay: actual, payUnit: data.actualPayUnit, hireCount: data.hireCount };
        if (aiMid && actual) variancePct = ((actual - aiMid) / aiMid) * 100;
      } else if (data.outcomeType === "source_channel") {
        aiRecommendation = { topChannel: data.aiTopChannel };
        actualOutcome = { topChannel: data.actualTopChannel };
        variancePct = data.aiTopChannel === data.actualTopChannel ? 0 : 100;
      } else if (data.outcomeType === "time_to_fill") {
        const aiDays = data.aiEstimatedDays ? parseInt(data.aiEstimatedDays) : null;
        const actualDays = data.actualDays ? parseInt(data.actualDays) : null;
        aiRecommendation = { estimatedDays: aiDays };
        actualOutcome = { actualDays, requisitionsClosed: data.requisitionsClosed };
        if (aiDays && actualDays) variancePct = ((actualDays - aiDays) / aiDays) * 100;
      }

      return apiRequest("POST", "/api/recruiting/ai-outcomes", {
        outcomeType: data.outcomeType,
        geography: data.geography,
        snapshotId: data.snapshotId || null,
        periodStart: data.periodStart || null,
        periodEnd: data.periodEnd || null,
        aiRecommendation,
        actualOutcome,
        accuracyRating: data.accuracyRating || null,
        accuracyScore: data.accuracyScore ? parseInt(data.accuracyScore) : null,
        variancePct: variancePct != null ? variancePct.toFixed(2) : null,
        reviewerNotes: data.reviewerNotes || null,
        marketConditionsNote: data.marketConditionsNote || null,
        recommendedAdjustment: data.recommendedAdjustment || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/ai-outcomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/ai-outcomes/accuracy-report"] });
      toast({ title: "Outcome recorded", description: "AI recommendation outcome saved successfully." });
      form.reset();
      setOpen(false);
      onSaved?.();
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-record-outcome">
          <Plus className="h-4 w-4 mr-1.5" />
          Record Outcome
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Record AI Recommendation Outcome
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="outcomeType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Recommendation Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-outcome-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {OUTCOME_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="geography" render={({ field }) => (
                <FormItem>
                  <FormLabel>Geography / Market</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Dallas, TX" {...field} data-testid="input-outcome-geography" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="periodStart" render={({ field }) => (
                <FormItem>
                  <FormLabel>Period Start</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="periodEnd" render={({ field }) => (
                <FormItem>
                  <FormLabel>Period End</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>

            {/* Type-specific fields */}
            {outcomeType === "pay_range" && (
              <div className="space-y-3 border rounded-md p-3 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pay Range Comparison</p>
                <div className="grid grid-cols-3 gap-2">
                  <FormField control={form.control} name="aiPayMin" render={({ field }) => (
                    <FormItem><FormLabel>AI Min ($)</FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="18.00" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="aiPayMax" render={({ field }) => (
                    <FormItem><FormLabel>AI Max ($)</FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="22.00" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="aiPayUnit" render={({ field }) => (
                    <FormItem><FormLabel>Unit</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="per_move">Per Move</SelectItem>
                          <SelectItem value="salary">Salary</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <FormField control={form.control} name="actualPay" render={({ field }) => (
                    <FormItem><FormLabel>Actual Pay ($)</FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="20.50" {...field} data-testid="input-actual-pay" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="actualPayUnit" render={({ field }) => (
                    <FormItem><FormLabel>Unit</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="per_move">Per Move</SelectItem>
                          <SelectItem value="salary">Salary</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="hireCount" render={({ field }) => (
                    <FormItem><FormLabel>Hires at This Pay</FormLabel>
                      <FormControl><Input type="number" placeholder="3" {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </div>
            )}

            {outcomeType === "source_channel" && (
              <div className="space-y-3 border rounded-md p-3 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Source Channel Comparison</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="aiTopChannel" render={({ field }) => (
                    <FormItem><FormLabel>AI Recommended Channel</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl><SelectTrigger data-testid="select-ai-channel"><SelectValue placeholder="Select…" /></SelectTrigger></FormControl>
                        <SelectContent>{AD_CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="actualTopChannel" render={({ field }) => (
                    <FormItem><FormLabel>Actual Top Channel</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl><SelectTrigger data-testid="select-actual-channel"><SelectValue placeholder="Select…" /></SelectTrigger></FormControl>
                        <SelectContent>{AD_CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>
              </div>
            )}

            {outcomeType === "time_to_fill" && (
              <div className="space-y-3 border rounded-md p-3 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Time to Fill Comparison</p>
                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="aiEstimatedDays" render={({ field }) => (
                    <FormItem><FormLabel>AI Estimated Days</FormLabel>
                      <FormControl><Input type="number" placeholder="21" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="actualDays" render={({ field }) => (
                    <FormItem><FormLabel>Actual Days</FormLabel>
                      <FormControl><Input type="number" placeholder="28" {...field} data-testid="input-actual-days" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="requisitionsClosed" render={({ field }) => (
                    <FormItem><FormLabel>Reqs Closed</FormLabel>
                      <FormControl><Input type="number" placeholder="2" {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </div>
            )}

            {/* Assessment */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="accuracyRating" render={({ field }) => (
                <FormItem>
                  <FormLabel>Accuracy Rating</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-accuracy-rating"><SelectValue placeholder="Rate accuracy…" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="accurate">Accurate</SelectItem>
                      <SelectItem value="partially_accurate">Partially Accurate</SelectItem>
                      <SelectItem value="inaccurate">Inaccurate</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="accuracyScore" render={({ field }) => (
                <FormItem>
                  <FormLabel>Accuracy Score (0–100)</FormLabel>
                  <FormControl><Input type="number" min="0" max="100" placeholder="75" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="reviewerNotes" render={({ field }) => (
              <FormItem>
                <FormLabel>Reviewer Notes</FormLabel>
                <FormControl><Textarea placeholder="What matched or didn't match the AI recommendation?" className="min-h-[72px]" {...field} /></FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="marketConditionsNote" render={({ field }) => (
              <FormItem>
                <FormLabel>Market Conditions (optional)</FormLabel>
                <FormControl><Textarea placeholder="Any external factors that explain the variance?" className="min-h-[60px]" {...field} /></FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="recommendedAdjustment" render={({ field }) => (
              <FormItem>
                <FormLabel>Recommended Model Adjustment (optional)</FormLabel>
                <FormControl><Textarea placeholder="e.g. Increase pay estimate by 10% for CDL markets" className="min-h-[60px]" {...field} /></FormControl>
              </FormItem>
            )} />

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-outcome">
                {mutation.isPending ? "Saving…" : "Save Outcome"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Accuracy Scorecard ────────────────────────────────────────────────────────

function AccuracyScorecard({ report }: { report: AccuracyReport }) {
  const typeLabels: Record<string, string> = {
    pay_range: "Pay Range",
    source_channel: "Source Channel",
    time_to_fill: "Time to Fill",
    applicant_screening: "Applicant Screening",
  };
  const typeIcons: Record<string, typeof DollarSign> = {
    pay_range: DollarSign,
    source_channel: Megaphone,
    time_to_fill: Clock,
    applicant_screening: Users,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">{report.totalOutcomes}</div>
          <div className="text-xs text-muted-foreground">Total Outcomes</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {report.byRating.accurate ?? 0}
          </div>
          <div className="text-xs text-muted-foreground">Accurate</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {report.byRating.partially_accurate ?? 0}
          </div>
          <div className="text-xs text-muted-foreground">Partially Accurate</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-muted/50">
          <div className="text-2xl font-bold">
            {report.avgAccuracyScore ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground">Avg Score</div>
        </div>
      </div>

      {Object.keys(report.byType).length > 0 && (
        <div className="space-y-3">
          {Object.entries(report.byType).map(([type, stats]) => {
            const Icon = typeIcons[type] ?? Target;
            return (
              <div key={type} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{typeLabels[type] ?? type}</span>
                  {stats.avgVariancePct != null && (
                    <span className="text-xs text-muted-foreground">
                      avg variance: {stats.avgVariancePct > 0 ? "+" : ""}{stats.avgVariancePct}%
                    </span>
                  )}
                </div>
                <AccuracyRateBar rate={stats.accuracyRate} count={stats.count} />
              </div>
            );
          })}
        </div>
      )}

      {report.geographies.length > 0 && (
        <div className="pt-2">
          <p className="text-xs text-muted-foreground mb-1.5">Geographies tracked</p>
          <div className="flex flex-wrap gap-1.5">
            {report.geographies.map((g) => (
              <Badge key={g} variant="outline" className="text-xs">{g}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Screening Accuracy Table ──────────────────────────────────────────────────

function ScreeningAccuracyTable({ rows }: { rows: ScreeningRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No readiness score data available. Applications will be scored as they progress.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Readiness Bucket</th>
            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Total</th>
            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Hired</th>
            <th className="text-right py-2 px-4 font-medium text-muted-foreground">Rejected</th>
            <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Hire Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.readinessBucket} className="border-b last:border-0" data-testid={`screening-row-${row.readinessBucket}`}>
              <td className="py-2.5 pr-4 font-medium">{row.readinessBucket}</td>
              <td className="py-2.5 px-4 text-right tabular-nums">{row.totalCount}</td>
              <td className="py-2.5 px-4 text-right tabular-nums text-green-600 dark:text-green-400">{row.hiredCount}</td>
              <td className="py-2.5 px-4 text-right tabular-nums text-red-600 dark:text-red-400">{row.rejectedCount}</td>
              <td className="py-2.5 pl-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${row.hireRate >= 50 ? "bg-green-500" : row.hireRate >= 25 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${row.hireRate}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums font-medium">{row.hireRate}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        Higher hire rates in high-readiness buckets indicate AI screening is predictive of recruiter success.
        Use this to calibrate future readiness thresholds.
      </p>
    </div>
  );
}

// ── Outcomes Table ────────────────────────────────────────────────────────────

function OutcomesTable({
  outcomes,
  onDelete,
}: {
  outcomes: AIOutcome[];
  onDelete: (id: string) => void;
}) {
  if (outcomes.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
        <Target className="h-8 w-8" />
        <p className="text-sm">No outcomes recorded yet. Use "Record Outcome" to start tracking.</p>
      </div>
    );
  }

  const typeLabels: Record<string, string> = {
    pay_range: "Pay Range",
    source_channel: "Source Channel",
    time_to_fill: "Time to Fill",
    applicant_screening: "Screening",
  };

  function formatAIRec(o: AIOutcome) {
    const r = o.aiRecommendation;
    if (o.outcomeType === "pay_range") return `$${parseFloat(r.payMin || 0).toFixed(2)}–$${parseFloat(r.payMax || 0).toFixed(2)}`;
    if (o.outcomeType === "source_channel") return r.topChannel ?? "—";
    if (o.outcomeType === "time_to_fill") return r.estimatedDays ? `${r.estimatedDays}d` : "—";
    return "—";
  }

  function formatActual(o: AIOutcome) {
    const a = o.actualOutcome;
    if (o.outcomeType === "pay_range") return a.actualPay ? `$${parseFloat(a.actualPay).toFixed(2)}` : "—";
    if (o.outcomeType === "source_channel") return a.topChannel ?? "—";
    if (o.outcomeType === "time_to_fill") return a.actualDays ? `${a.actualDays}d` : "—";
    return "—";
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Type</th>
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Geography</th>
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">AI Said</th>
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Actual</th>
            <th className="text-center py-2 pr-3 font-medium text-muted-foreground">Variance</th>
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Rating</th>
            <th className="text-right py-2 font-medium text-muted-foreground">Recorded</th>
            <th className="py-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {outcomes.map((o) => (
            <tr key={o.id} className="border-b last:border-0 hover-elevate" data-testid={`outcome-row-${o.id}`}>
              <td className="py-2.5 pr-3">
                <Badge variant="outline" className="text-xs">{typeLabels[o.outcomeType] ?? o.outcomeType}</Badge>
              </td>
              <td className="py-2.5 pr-3 text-sm">{o.geography ?? "—"}</td>
              <td className="py-2.5 pr-3 font-medium tabular-nums">{formatAIRec(o)}</td>
              <td className="py-2.5 pr-3 tabular-nums">{formatActual(o)}</td>
              <td className="py-2.5 pr-3 text-center"><VarianceChip pct={o.variancePct} /></td>
              <td className="py-2.5 pr-3"><AccuracyBadge rating={o.accuracyRating} /></td>
              <td className="py-2.5 text-right text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(o.recordedAt))} ago
              </td>
              <td className="py-2.5 pl-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => onDelete(o.id)}
                  data-testid={`button-delete-outcome-${o.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AIRecommendationFeedback({ geography, snapshotId }: { geography?: string; snapshotId?: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [geoFilter, setGeoFilter] = useState<string>(geography ?? "all");

  const { data: outcomesData, isLoading: outcomesLoading } = useQuery<{ outcomes: AIOutcome[] }>({
    queryKey: ["/api/recruiting/ai-outcomes", geoFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (geoFilter !== "all") params.set("geography", geoFilter);
      if (snapshotId) params.set("snapshotId", snapshotId);
      return fetch(`/api/recruiting/ai-outcomes?${params}`).then((r) => r.json());
    },
  });
  const outcomes = outcomesData?.outcomes ?? [];

  const { data: reportData, isLoading: reportLoading } = useQuery<{ report: AccuracyReport }>({
    queryKey: ["/api/recruiting/ai-outcomes/accuracy-report"],
  });
  const report = reportData?.report;

  const { data: screeningData, isLoading: screeningLoading } = useQuery<{ rows: ScreeningRow[] }>({
    queryKey: ["/api/recruiting/ai-outcomes/screening-accuracy"],
  });
  const screeningRows = screeningData?.rows ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/recruiting/ai-outcomes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/ai-outcomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/ai-outcomes/accuracy-report"] });
      toast({ title: "Outcome removed" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const allGeos = report?.geographies ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Target className="h-5 w-5 text-primary shrink-0" />
          <div>
            <h3 className="text-base font-semibold leading-tight">AI Recommendation Feedback Loop</h3>
            <p className="text-sm text-muted-foreground">
              Track how AI recommendations compare to real-world outcomes to improve future analysis
            </p>
          </div>
        </div>
        <RecordOutcomeDialog
          geography={geography !== "all" ? geography : undefined}
          snapshotId={snapshotId}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/recruiting/ai-outcomes"] })}
        />
      </div>

      {/* Accuracy Scorecard */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Recommendation Accuracy Scorecard</CardTitle>
          </div>
          <CardDescription>Aggregate accuracy across all recorded outcomes</CardDescription>
        </CardHeader>
        <CardContent>
          {reportLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
          ) : report ? (
            <AccuracyScorecard report={report} />
          ) : (
            <p className="text-sm text-muted-foreground">No accuracy data yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Applicant Screening Accuracy */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Applicant Screening Accuracy</CardTitle>
          </div>
          <CardDescription>
            AI readiness score vs actual recruiter outcome — higher hire rates in high-readiness buckets validate the model
          </CardDescription>
        </CardHeader>
        <CardContent>
          {screeningLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : (
            <ScreeningAccuracyTable rows={screeningRows} />
          )}
        </CardContent>
      </Card>

      {/* Outcome Log */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Outcome Log</CardTitle>
              </div>
              <CardDescription>All recorded AI recommendation outcomes</CardDescription>
            </div>
            {allGeos.length > 0 && (
              <Select value={geoFilter} onValueChange={setGeoFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-geo-filter-outcomes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Geographies</SelectItem>
                  {allGeos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {outcomesLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <OutcomesTable
              outcomes={outcomes}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          )}
        </CardContent>
      </Card>

      {/* Model Tuning Notes */}
      {outcomes.some((o) => o.recommendedAdjustment) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Model Tuning Recommendations</CardTitle>
            </div>
            <CardDescription>Reviewer-suggested adjustments for improving future AI recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {outcomes
                .filter((o) => o.recommendedAdjustment)
                .slice(0, 10)
                .map((o) => (
                  <div key={o.id} className="flex items-start gap-3 p-3 rounded-md border bg-muted/30">
                    <TrendingUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs capitalize">{o.outcomeType.replace("_", " ")}</Badge>
                        {o.geography && <span className="text-xs text-muted-foreground">{o.geography}</span>}
                      </div>
                      <p className="text-sm">{o.recommendedAdjustment}</p>
                      {o.marketConditionsNote && (
                        <p className="text-xs text-muted-foreground mt-1">{o.marketConditionsNote}</p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
