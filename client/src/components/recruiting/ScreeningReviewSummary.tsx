/**
 * AI Screening Review Summary — Ticket 14
 *
 * Displayed below the Screening Trigger Panel in ApplicationDetailView.
 * Shows after all three screening results have arrived and the AI summary
 * has been generated. Recruiters can also manually trigger a regeneration.
 *
 * AI is purely advisory — recruiter remains the decision-maker.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Brain,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  ListChecks,
  Eye,
  Info,
  ShieldQuestion,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";

// ── Types (must mirror screeningReviewService.ts) ─────────────────────────────

interface ScreeningConcern {
  type: "mvr" | "background_check" | "drug_test" | "consistency" | "history";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
}

interface ScreeningReviewResult {
  overallSentiment: "clear" | "concerns" | "blockers";
  flaggedConcerns: ScreeningConcern[];
  consistencyObservations: string[];
  recruiterReviewFocus: string[];
  summaryNarrative: string;
  generatedAt: string;
}

// ── Sentiment display config ───────────────────────────────────────────────────

const SENTIMENT_CONFIG = {
  clear: {
    label: "All Clear",
    icon: CheckCircle2,
    iconClass: "text-green-600 dark:text-green-400",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    borderClass: "border-green-200 dark:border-green-800",
  },
  concerns: {
    label: "Review Recommended",
    icon: AlertTriangle,
    iconClass: "text-yellow-600 dark:text-yellow-400",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    borderClass: "border-yellow-200 dark:border-yellow-800",
  },
  blockers: {
    label: "Blockers Found",
    icon: XCircle,
    iconClass: "text-destructive",
    badgeClass: "bg-destructive/10 text-destructive",
    borderClass: "border-destructive/30",
  },
} as const;

const SEVERITY_BADGE: Record<ScreeningConcern["severity"], string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const TYPE_LABEL: Record<ScreeningConcern["type"], string> = {
  mvr: "MVR",
  background_check: "Background",
  drug_test: "Drug Test",
  consistency: "Consistency",
  history: "History",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  applicationId: string;
  review: ScreeningReviewResult | null | undefined;
  generating: boolean;
  /** Pass the application-level query key so the card can invalidate on generate */
  applicationQueryKey: string;
}

export function ScreeningReviewSummary({
  applicationId,
  review,
  generating,
  applicationQueryKey,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);

  const generateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting/applications/${applicationId}/screening-review/generate`),
    onSuccess: () => {
      toast({
        title: "AI Review Started",
        description: "The screening review is being generated. It will appear in a few seconds.",
      });
      // Poll the application query to pick up the generating flag and final result
      const poll = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: [applicationQueryKey] });
      }, 3000);
      // Stop polling after 60 s
      setTimeout(() => clearInterval(poll), 60_000);
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to start AI review";
      if (msg.includes("409") || msg.includes("already generating")) {
        toast({ title: "Already generating", description: "Please wait for the current review to complete." });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    },
  });

  // ── No review, not generating ─────────────────────────────────────────────
  if (!review && !generating) {
    return (
      <Card data-testid="card-screening-review-empty">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            AI Screening Review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-md bg-muted/40">
            <ShieldQuestion className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Review not yet generated</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                An AI review summary is automatically generated once all three pre-hire
                screenings (MVR, Background Check, Drug Test) reach a terminal result.
                You can also trigger it manually below.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-muted-foreground italic flex items-center gap-1">
              <Info className="h-3 w-3" />
              Advisory only — recruiter makes final decision
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              data-testid="btn-generate-screening-review"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Brain className="h-3.5 w-3.5 mr-1.5" />
              )}
              Generate AI Review
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Generating / loading state ────────────────────────────────────────────
  if (generating) {
    return (
      <Card data-testid="card-screening-review-generating">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            AI Screening Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">Generating AI review…</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Analyzing screening results and candidate history. This takes a few seconds.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Review available ──────────────────────────────────────────────────────
  const sentiment = SENTIMENT_CONFIG[review!.overallSentiment] ?? SENTIMENT_CONFIG.concerns;
  const SentimentIcon = sentiment.icon;

  return (
    <Card
      className={`border ${sentiment.borderClass}`}
      data-testid="card-screening-review"
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2 flex-1 min-w-0">
            <Brain className="h-4 w-4 text-primary shrink-0" />
            AI Screening Review
          </CardTitle>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Badge className={`text-xs ${sentiment.badgeClass}`} data-testid="badge-sentiment">
              <SentimentIcon className={`h-3 w-3 mr-1 ${sentiment.iconClass}`} />
              {sentiment.label}
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  data-testid="btn-regenerate-screening-review"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Regenerate AI Review</TooltipContent>
            </Tooltip>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setExpanded((v) => !v)}
              data-testid="btn-toggle-screening-review"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground italic flex items-center gap-1 mt-1">
          <Info className="h-3 w-3 shrink-0" />
          Advisory only — recruiter makes final decision
          {review!.generatedAt && (
            <span className="ml-auto">Generated {fmt(review!.generatedAt)}</span>
          )}
        </p>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Narrative */}
          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-sm leading-relaxed" data-testid="text-screening-narrative">
              {review!.summaryNarrative}
            </p>
          </div>

          {/* Flagged Concerns */}
          {review!.flaggedConcerns.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Flagged Concerns ({review!.flaggedConcerns.length})
              </div>
              <div className="space-y-2">
                {review!.flaggedConcerns.map((concern, i) => (
                  <div
                    key={i}
                    className="rounded-md border p-3 space-y-1"
                    data-testid={`concern-${i}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{concern.title}</span>
                      <Badge className={`text-[10px] ${SEVERITY_BADGE[concern.severity]}`}>
                        {concern.severity.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {TYPE_LABEL[concern.type] ?? concern.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {concern.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Consistency Observations */}
          {review!.consistencyObservations.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Eye className="h-4 w-4 text-muted-foreground" />
                Consistency Observations
              </div>
              <ul className="space-y-1 pl-1">
                {review!.consistencyObservations.map((obs, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                    {obs}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recruiter Review Focus */}
          {review!.recruiterReviewFocus.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <ListChecks className="h-4 w-4 text-primary" />
                  Recruiter Review Focus
                </div>
                <ol className="space-y-1.5 pl-1">
                  {review!.recruiterReviewFocus.map((focus, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 text-[10px] font-bold text-primary shrink-0 w-4 text-right">
                        {i + 1}.
                      </span>
                      <span className="text-foreground/80">{focus}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
