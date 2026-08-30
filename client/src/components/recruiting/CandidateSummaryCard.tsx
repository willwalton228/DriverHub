import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User,
  Mail,
  Phone,
  MapPin,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldAlert,
  Ban,
} from "lucide-react";

interface ApplicationSummary {
  applicationId: string;
  currentStage: string;
  readinessStatus: string;
  readinessScore: number;
  market: string;
  requisitionTitle: string;
  updatedAt: string;
  isArchived: boolean;
}

interface RiskFlagSummary {
  id: string;
  flagType: string;
  severity: string;
  label: string;
  description: string | null;
  isDismissed: boolean;
}

export interface CandidateSummaryCardData {
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  preferredMarkets: string[] | null;
  isDnr: boolean;
  applications: ApplicationSummary[];
  riskFlags: RiskFlagSummary[];
  lastActivity: string | null;
}

interface CandidateSummaryCardProps {
  candidateId: string;
  data?: CandidateSummaryCardData;
  readOnly?: boolean;
  compact?: boolean;
  onClick?: (candidateId: string) => void;
}

const STAGE_LABELS: Record<string, string> = {
  applied: "Applied",
  screening: "Screening",
  phone_screen: "Phone Screen",
  interview_scheduled: "Interview",
  interview_completed: "Interviewed",
  offer_extended: "Offer Sent",
  offer_accepted: "Offer Accepted",
  background_check: "Background Check",
  onboarding: "Onboarding",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  docs_complete: "Docs Complete",
};

const READINESS_CONFIG: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  ready: {
    label: "Ready",
    className: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  in_review: {
    label: "In Review",
    className: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800",
    icon: Clock,
  },
  not_ready: {
    label: "Not Ready",
    className: "text-muted-foreground bg-muted border-border",
    icon: XCircle,
  },
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getInitials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function CandidateSummaryCard({
  candidateId,
  data: externalData,
  readOnly = false,
  compact = false,
  onClick,
}: CandidateSummaryCardProps) {
  const { data: fetchedData, isLoading } = useQuery<CandidateSummaryCardData>({
    queryKey: ["/api/recruiting/candidates", candidateId, "summary-card"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/candidates/${candidateId}/summary-card`);
      if (!res.ok) throw new Error("Failed to load candidate summary");
      return res.json();
    },
    enabled: !externalData,
    staleTime: 30000,
  });

  const data = externalData || fetchedData;

  if (isLoading && !data) {
    return <CandidateSummaryCardSkeleton compact={compact} />;
  }

  if (!data) return null;

  const activeApps = data.applications.filter(a => !a.isArchived);
  const primaryApp = activeApps[0] || data.applications[0];
  const activeRiskFlags = data.riskFlags.filter(f => !f.isDismissed);
  const highRisks = activeRiskFlags.filter(f => f.severity === "high");
  const markets = Array.from(new Set(activeApps.map(a => a.market)));

  return (
    <Card
      className={`p-3 ${onClick ? "cursor-pointer hover-elevate" : ""} ${compact ? "" : "p-4"}`}
      onClick={() => onClick?.(data.candidateId)}
      data-testid={`candidate-summary-card-${data.candidateId}`}
    >
      <div className="flex items-start gap-3">
        <Avatar className={compact ? "h-8 w-8" : "h-10 w-10"}>
          <AvatarFallback className={compact ? "text-xs" : "text-sm"}>
            {getInitials(data.firstName, data.lastName)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`font-medium truncate ${compact ? "text-sm" : ""}`}
              data-testid={`text-candidate-name-${data.candidateId}`}
            >
              {data.firstName} {data.lastName}
            </span>
            {data.isDnr && (
              <Badge variant="destructive" className="text-xs gap-1" data-testid={`badge-dnr-${data.candidateId}`}>
                <Ban className="h-3 w-3" />
                DNR
              </Badge>
            )}
            {highRisks.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="text-xs gap-1 text-red-600 border-red-300 dark:text-red-400 dark:border-red-700"
                    data-testid={`badge-high-risk-${data.candidateId}`}
                  >
                    <ShieldAlert className="h-3 w-3" />
                    {highRisks.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1">
                    {highRisks.map(f => (
                      <div key={f.id} className="text-sm">{f.label}</div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            {activeRiskFlags.length > 0 && highRisks.length === 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="text-xs gap-1 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700"
                    data-testid={`badge-risk-flags-count-${data.candidateId}`}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {activeRiskFlags.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1">
                    {activeRiskFlags.map(f => (
                      <div key={f.id} className="text-sm">{f.label}</div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {!compact && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1 truncate" data-testid={`text-email-${data.candidateId}`}>
                <Mail className="h-3 w-3 shrink-0" />
                {data.email}
              </span>
              {data.phone && (
                <span className="flex items-center gap-1" data-testid={`text-phone-${data.candidateId}`}>
                  <Phone className="h-3 w-3 shrink-0" />
                  {data.phone}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {primaryApp && (
              <>
                <Badge variant="secondary" className="text-xs" data-testid={`badge-stage-${data.candidateId}`}>
                  {STAGE_LABELS[primaryApp.currentStage] || primaryApp.currentStage}
                </Badge>
                {(() => {
                  const config = READINESS_CONFIG[primaryApp.readinessStatus] || READINESS_CONFIG.not_ready;
                  const ReadinessIcon = config.icon;
                  return (
                    <Badge
                      variant="outline"
                      className={`text-xs gap-1 ${config.className}`}
                      data-testid={`badge-readiness-${data.candidateId}`}
                    >
                      <ReadinessIcon className="h-3 w-3" />
                      {config.label}
                    </Badge>
                  );
                })()}
              </>
            )}
            {markets.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`text-markets-${data.candidateId}`}>
                <MapPin className="h-3 w-3 shrink-0" />
                {markets.join(", ")}
              </span>
            )}
          </div>

          {!compact && data.lastActivity && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`text-last-activity-${data.candidateId}`}>
              <Clock className="h-3 w-3 shrink-0" />
              Last activity: {formatTimeAgo(data.lastActivity)}
            </div>
          )}

          {compact && data.lastActivity && (
            <span className="text-xs text-muted-foreground" data-testid={`text-last-activity-${data.candidateId}`}>
              {formatTimeAgo(data.lastActivity)}
            </span>
          )}
        </div>

        {readOnly && (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
                View Only
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-sm">Editing available in Recruiting module</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {!compact && activeApps.length > 1 && (
        <div className="mt-2 pt-2 border-t" data-testid={`section-additional-apps-${data.candidateId}`}>
          <p className="text-xs text-muted-foreground mb-1">{activeApps.length} active applications</p>
          <div className="flex flex-wrap gap-1">
            {activeApps.slice(1).map(app => (
              <Badge key={app.applicationId} variant="outline" className="text-xs">
                {app.market} - {STAGE_LABELS[app.currentStage] || app.currentStage}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function CandidateSummaryCardSkeleton({ compact }: { compact?: boolean }) {
  return (
    <Card className={compact ? "p-3" : "p-4"}>
      <div className="flex items-start gap-3">
        <Skeleton className={compact ? "h-8 w-8 rounded-full" : "h-10 w-10 rounded-full"} />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          {!compact && <Skeleton className="h-3 w-48" />}
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
      </div>
    </Card>
  );
}

export function CandidateSummaryCardList({
  candidateIds,
  readOnly = false,
  compact = false,
  onCardClick,
}: {
  candidateIds: string[];
  readOnly?: boolean;
  compact?: boolean;
  onCardClick?: (candidateId: string) => void;
}) {
  if (candidateIds.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-candidates">
        No candidates to display
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="candidate-summary-card-list">
      {candidateIds.map(id => (
        <CandidateSummaryCard
          key={id}
          candidateId={id}
          readOnly={readOnly}
          compact={compact}
          onClick={onCardClick}
        />
      ))}
    </div>
  );
}
