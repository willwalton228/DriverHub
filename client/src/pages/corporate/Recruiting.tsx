import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import RecruitingObservabilityPanel from "@/pages/corporate/RecruitingObservability";
import { parseDateSafe } from "@/lib/dateFormat";
import { ValidationRulesPanel, CandidateVerificationStatus, DataQualityPrecheck } from "@/components/recruiting/DataQualityPanel";
import RecruiterTasksPanel from "@/components/recruiting/RecruiterTasksPanel";
import RecruitingHealthDashboard from "@/components/recruiting/RecruitingHealthDashboard";
import DecommissionManager from "@/components/recruiting/DecommissionManager";
import { ClosedCampaignsList } from "@/components/recruiting/ClosedCampaignsList";
import ArchiveViewer, { CampaignArchivesSection } from "@/components/recruiting/ArchiveViewer";
import EscalationPanel, { EscalationBanner } from "@/components/recruiting/EscalationPanel";
import { AvailabilityAlertBanner } from "@/components/recruiting/AvailabilityAlertBanner";
import ThrottlePanel from "@/components/recruiting/ThrottlePanel";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { 
  Briefcase, UserSearch, ClipboardList, Plus, Search, Loader2, 
  Calendar, DollarSign, MapPin, Clock, ArrowRight, Users, TrendingUp, Timer,
  CheckCircle2, AlertCircle, XCircle, RefreshCcw, Shield, Video, Phone, Building2,
  CalendarDays, Settings, Link2, Link2Off, CalendarPlus, Mail, FileText, Copy, ExternalLink,
  ClipboardCheck, Star, UserPlus, Rss, RefreshCw, Tag, UserCheck, Send, MoreHorizontal, CheckSquare,
  Archive, ArchiveRestore, Eye, EyeOff, Download, MessageSquare, PauseCircle, PlayCircle, AlertTriangle,
  UserRound, UserCog, BarChart3, Flag, UserX, ShieldAlert, Activity, ListTodo, Target, IdCard, ShieldCheck, Car, Rocket,
  Truck, ArrowUpDown, Info, Factory, Handshake, ChevronDown, Pencil, Trash2, ArrowLeft, Upload, FileSpreadsheet, Mic,
  Brain, PhoneCall, Hourglass, BrainCircuit
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComplianceEvidenceView } from "@/components/recruiting/ComplianceEvidenceView";
import { ComplianceDashboard } from "@/components/recruiting/ComplianceDashboard";
import { SchedulingLinksPanel } from "@/components/recruiting/SchedulingLinksPanel";
import { RecruiterApprovalGate } from "@/components/recruiting/RecruiterApprovalGate";
import { InterviewDecisionPanel } from "@/components/recruiting/InterviewDecisionPanel";
import { PreHireHandoffStatus } from "@/components/recruiting/PreHireHandoffStatus";
import { ScreeningTriggerPanel } from "@/components/recruiting/ScreeningTriggerPanel";
import { ScreeningReviewSummary } from "@/components/recruiting/ScreeningReviewSummary";
import { PreOfferApprovalGate } from "@/components/recruiting/PreOfferApprovalGate";
import { PayRecommendationWidget } from "@/components/recruiting/PayRecommendationWidget";
import { AdRecommendationWidget } from "@/components/recruiting/AdRecommendationWidget";
import { ChannelDistributionPlanner } from "@/components/recruiting/ChannelDistributionPlanner";
import { AudienceStrategyTagger, AudienceTagBadges } from "@/components/recruiting/AudienceStrategyTagger";
import { JobAdPanel, JobAdTemplateManager } from "@/components/recruiting/JobAdPanel";
import { MarketLaunchPlanner } from "@/components/recruiting/MarketLaunchPlanner";
import { SourcePerformanceDashboard } from "@/components/recruiting/SourcePerformanceDashboard";
import { MarketIntelligenceDashboard } from "@/components/recruiting/MarketIntelligenceDashboard";
import { AIRecommendationFeedback } from "@/components/recruiting/AIRecommendationFeedback";
import { CandidateFunnelAnalytics } from "@/components/recruiting/CandidateFunnelAnalytics";
import { DuplicateCheckButton } from "@/components/recruiting/CandidateMerge";
import { RecruitingNotes } from "@/components/recruiting/RecruitingNotes";
import { PauseStatusBanner, SlaEscalationsPanel, MarketPauseControls, RequisitionPauseButton } from "@/components/recruiting/PauseControls";
import { ApplicationNotesDialog, CandidateNotesDialog, RequisitionNotesDialog } from "@/components/recruiting/ApplicationNotesDialog";
import { AvailabilityDialog } from "@/components/recruiting/AvailabilityDialog";
import { LanguagePreferenceDialog } from "@/components/recruiting/LanguagePreferenceDialog";
import { DemandSignals } from "@/components/recruiting/DemandSignals";
import { FeatureFlags } from "@/components/recruiting/FeatureFlags";
import { ReasonCodesAdmin } from "@/components/recruiting/ReasonCodesAdmin";
import { CandidateReactivation, RehireApplicationDialog } from "@/components/recruiting/CandidateReactivation";
import { CandidateDnrBanner, DnrBadge } from "@/components/recruiting/CandidateDnr";
import { RiskFlagBadge, RiskFlagsPanel } from "@/components/recruiting/CandidateRiskFlags";
import { RecruitingRequestsTab } from "@/components/recruiting/RecruitingRequestsTab";
import { ActiveCampaignsList } from "@/components/recruiting/ActiveCampaignsList";
import { IdentityHistoryPanel } from "@/components/recruiting/IdentityHistoryPanel";
import { ConsentHistoryView } from "@/components/recruiting/ConsentHistoryView";
import { SavedViewsSelector, type SavedView, type SavedViewFilters } from "@/components/recruiting/SavedViewsSelector";
import { WithdrawalNoShowDialog } from "@/components/recruiting/WithdrawalNoShowDialog";
import { CandidatePortalDialog } from "@/components/recruiting/CandidatePortalManager";
import { CloneApplicationDialog } from "@/components/recruiting/CloneApplicationDialog";
import { NudgeRulesConfig } from "@/components/recruiting/NudgeRulesConfig";
import { ApprovalOwnershipSettings } from "@/components/recruiting/ApprovalOwnershipSettings";
import { NudgeHistory } from "@/components/recruiting/NudgeHistory";
import { RecruiterProductivityMetrics } from "@/components/recruiting/RecruiterProductivityMetrics";
import { EmergencyControls } from "@/components/recruiting/EmergencyControls";
import { AuditLogTab } from "@/components/recruiting/AuditLogTab";
import { ReferralDashboard } from "@/components/recruiting/ReferralDashboard";
import { ApplicationLockIndicator } from "@/components/recruiting/ApplicationLockIndicator";
import { PipelineColumnPicker, usePipelineColumns } from "@/components/recruiting/PipelineColumnPicker";
import AssignmentRulesPanel from "@/components/recruiting/AssignmentRulesPanel";
import { CandidateSummaryCard } from "@/components/recruiting/CandidateSummaryCard";
import { TrainingStatusBadge, CandidateTrainingRecords, TrainingDialogButton } from "@/components/recruiting/CandidateTrainingRecords";
import { CsvImportDialog } from "@/components/recruiting/CsvImportDialog";
import { CANDIDATE_SOURCE_LABELS, CANDIDATE_SOURCE_OPTIONS, MARKET_VALUES, PHONE_SCREEN_RESULT_LABELS, type PhoneScreenResult } from "@shared/schema";
import { formatPhone } from "@/lib/phone";

const readinessColors: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  ready: { bg: "bg-green-100 dark:bg-green-900", text: "text-green-800 dark:text-green-300", icon: CheckCircle2 },
  in_review: { bg: "bg-yellow-100 dark:bg-yellow-900", text: "text-yellow-800 dark:text-yellow-300", icon: AlertCircle },
  not_ready: { bg: "bg-red-100 dark:bg-red-900", text: "text-red-800 dark:text-red-300", icon: XCircle },
};

function ReadinessBadge({ status, score }: { status: string; score: number }) {
  const config = readinessColors[status] || readinessColors.not_ready;
  const Icon = config.icon;
  
  return (
    <Badge 
      className={`${config.bg} ${config.text} gap-1`}
      data-testid={`badge-readiness-${status}`}
    >
      <Icon className="h-3 w-3" />
      {status === 'ready' ? 'Ready' : status === 'in_review' ? 'In Review' : 'Not Ready'}
      {score > 0 && <span className="font-mono text-xs">({score}%)</span>}
    </Badge>
  );
}

function KillSwitchBanner() {
  const { data: status } = useQuery<{
    publicApplyDisabled: boolean;
    outboundCommsDisabled: boolean;
    activeMarketOverrides: { key: string; market: string }[];
  }>({
    queryKey: ["/api/recruiting/kill-switches/status"],
    refetchInterval: 15000,
  });

  if (!status) return null;

  const anyActive = status.publicApplyDisabled || status.outboundCommsDisabled || (status.activeMarketOverrides?.length ?? 0) > 0;
  if (!anyActive) return null;

  return (
    <Card className="border-destructive bg-destructive/5" data-testid="banner-kill-switch-active">
      <CardContent className="flex items-center gap-3 py-3">
        <ShieldAlert className="h-5 w-5 text-destructive flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-destructive text-sm">System Guardrails Active</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {status.publicApplyDisabled && (
              <Badge variant="destructive" className="text-xs" data-testid="badge-banner-apply-disabled">
                Public Applications Disabled
              </Badge>
            )}
            {status.outboundCommsDisabled && (
              <Badge variant="destructive" className="text-xs" data-testid="badge-banner-comms-disabled">
                Outbound Comms Disabled
              </Badge>
            )}
            {status.activeMarketOverrides?.map((o, i) => (
              <Badge key={i} variant="destructive" className="text-xs" data-testid={`badge-banner-market-${i}`}>
                {o.market}: {o.key === "kill_switch_public_apply" ? "Apply Paused" : "Comms Paused"}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const complianceColors: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  passed: { bg: "bg-green-100 dark:bg-green-900", text: "text-green-800 dark:text-green-300", icon: CheckCircle2 },
  blocked: { bg: "bg-red-100 dark:bg-red-900", text: "text-red-800 dark:text-red-300", icon: AlertCircle },
  waived: { bg: "bg-yellow-100 dark:bg-yellow-900", text: "text-yellow-800 dark:text-yellow-300", icon: Shield },
  pending: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400", icon: Clock },
};

function ComplianceBadge({ 
  status, 
  blockedReason, 
  applicationId 
}: { 
  status: string; 
  blockedReason?: string | null; 
  applicationId: string;
}) {
  const config = complianceColors[status] || complianceColors.pending;
  const Icon = config.icon;
  
  const statusLabel = status === 'passed' ? 'Compliant' 
    : status === 'blocked' ? 'Blocked' 
    : status === 'waived' ? 'Waived'
    : 'Pending';
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Badge 
          className={`${config.bg} ${config.text} gap-1 cursor-pointer hover:opacity-80`}
          data-testid={`badge-compliance-${status}-${applicationId}`}
        >
          <Icon className="h-3 w-3" />
          {statusLabel}
        </Badge>
      </DialogTrigger>
      <DialogContent className="max-w-md" data-testid="dialog-compliance-details">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            State Compliance Status
          </DialogTitle>
          <DialogDescription>
            Compliance check details for this application
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge className={`${config.bg} ${config.text}`}>
              <Icon className="h-3 w-3 mr-1" />
              {statusLabel}
            </Badge>
          </div>
          {blockedReason && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">
                Blocked Reason
              </div>
              <div className="text-sm text-red-700 dark:text-red-400">
                {blockedReason}
              </div>
            </div>
          )}
          <ComplianceChecksList applicationId={applicationId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ComplianceChecksList({ applicationId }: { applicationId: string }) {
  const { data, isLoading } = useQuery<{
    state: string;
    allPassed: boolean;
    blockedReason: string | null;
    checks: Array<{
      ruleCode: string;
      ruleName: string;
      category: string;
      status: string;
      failedReason: string | null;
    }>;
  }>({
    queryKey: ['/api/recruiting/applications', applicationId, 'compliance'],
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.checks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No compliance checks required for this location.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Compliance Checks ({data.state})</div>
      {data.checks.map((check) => {
        const checkConfig = complianceColors[check.status] || complianceColors.pending;
        const CheckIcon = checkConfig.icon;
        return (
          <div 
            key={check.ruleCode} 
            className="flex items-start gap-2 p-2 rounded border"
            data-testid={`compliance-check-${check.ruleCode}`}
          >
            <CheckIcon className={`h-4 w-4 mt-0.5 ${checkConfig.text}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{check.ruleName}</div>
              <div className="text-xs text-muted-foreground">{check.category}</div>
              {check.failedReason && (
                <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {check.failedReason}
                </div>
              )}
            </div>
            <Badge variant="outline" className="text-xs shrink-0">
              {check.status}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

const requisitionSchema = z.object({
  title: z.string().min(1, "Title is required"),
  department: z.string().optional(),
  location: z.string().optional(),
  employmentType: z.string().optional(),
  description: z.string().optional(),
  requirements: z.string().optional(),
  salaryMin: z.string().optional(),
  salaryMax: z.string().optional(),
  salaryType: z.string().optional(),
  openings: z.coerce.number().min(1, "At least 1 opening required").default(1),
  priority: z.string().optional(),
  isRemote: z.boolean().default(false),
  workState: z.string().optional(),
  workerType: z.string().default("W2_DRIVER"),
  requiredLicenseClass: z.string().optional(),
  requiredEndorsements: z.array(z.string()).optional(),
  licenseGateEnabled: z.boolean().default(false),
  cdlRequired: z.boolean().default(false),
  requiredDocumentTypes: z.array(z.string()).optional(),
  blockStageIfDocsIncomplete: z.boolean().default(false),
  listingDescription: z.string().optional(),
  accountId: z.string().optional(),
  roleType: z.string().default("vehicle_movement"),
  shuttleRouteType: z.string().optional(),
  availabilityPattern: z.string().optional(),
});

const OEM_OPTIONS = [
  { value: "toyota", label: "Toyota" },
  { value: "ford", label: "Ford" },
  { value: "gm", label: "General Motors" },
  { value: "stellantis", label: "Stellantis" },
  { value: "honda", label: "Honda" },
  { value: "hyundai", label: "Hyundai" },
  { value: "kia", label: "Kia" },
  { value: "nissan", label: "Nissan" },
  { value: "bmw", label: "BMW" },
  { value: "mercedes", label: "Mercedes-Benz" },
  { value: "volkswagen", label: "Volkswagen" },
  { value: "tesla", label: "Tesla" },
  { value: "subaru", label: "Subaru" },
  { value: "mazda", label: "Mazda" },
  { value: "volvo", label: "Volvo" },
  { value: "other", label: "Other" },
] as const;

const CLIENT_TYPE_OPTIONS = [
  { value: "dealer", label: "Dealer" },
  { value: "auction", label: "Auction" },
  { value: "rental", label: "Rental" },
  { value: "oem", label: "OEM" },
] as const;

const EXPERIENCE_CATEGORY_OPTIONS = [
  { value: "dealer", label: "Dealer" },
  { value: "auction", label: "Auction" },
  { value: "rental", label: "Rental" },
  { value: "oem", label: "OEM" },
  { value: "long_haul", label: "Long Haul" },
  { value: "local_delivery", label: "Local Delivery" },
] as const;

const candidateSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(1, "Phone is required"),
  address: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  dateOfBirth: z.string().optional(),
  currentEmployer: z.string().optional(),
  preferredMarkets: z.array(z.string()).min(1, "Select at least one recruiting market"),
  yearsExperience: z.coerce.number().optional(),
  source: z.string().optional(),
  sourceDetails: z.string().optional(),
  notes: z.string().optional(),
  licenseClass: z.string().optional(),
  licenseState: z.string().optional(),
  endorsements: z.array(z.string()).optional(),
  accessToVehicle: z.boolean().optional(),
  vehicleType: z.string().optional(),
  trailerAccess: z.boolean().optional(),
  authorizedToWork: z.boolean().optional(),
  authorizationType: z.string().optional(),
  authorizationExpiration: z.string().optional(),
  mvrYearsLicensed: z.coerce.number().int().min(0).optional(),
  mvrViolations3yr: z.coerce.number().int().min(0).optional(),
  mvrViolations5yr: z.coerce.number().int().min(0).optional(),
  mvrAtFaultAccidents: z.coerce.number().int().min(0).optional(),
  mvrDuiDwi: z.boolean().optional(),
  ableToDriveLongDistance: z.boolean().optional(),
  ableToEnterHighClearanceVehicles: z.boolean().optional(),
  accommodationsRequired: z.string().optional(),
  clientTypesExperience: z.array(z.string()).optional(),
  yearsExperienceByCategory: z.record(z.string(), z.coerce.number().min(0)).optional(),
}).superRefine((data, context) => {
  if (data.source === "other" && !data.sourceDetails?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceDetails"],
      message: "Identify the actual source",
    });
  }
});

type RequisitionForm = z.infer<typeof requisitionSchema>;
type CandidateForm = z.infer<typeof candidateSchema>;

const interviewSchema = z.object({
  title: z.string().min(1, "Title is required"),
  interviewType: z.enum(["phone", "video", "in_person"]),
  startDate: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Time is required"),
  durationMinutes: z.coerce.number().min(15).max(180).default(30),
  location: z.string().optional(),
  meetingLink: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional(),
  interviewerIds: z.array(z.string()).optional(),
});

type InterviewForm = z.infer<typeof interviewSchema>;

const referralSubmitSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone is required"),
  market: z.string().optional(),
  notes: z.string().optional(),
});

type ReferralSubmitForm = z.infer<typeof referralSubmitSchema>;

const scorecardSubmitSchema = z.object({
  overallRating: z.coerce.number().min(1).max(5),
  recommendation: z.enum(["proceed", "hold", "reject"]),
  notes: z.string().optional(),
});

type ScorecardSubmitForm = z.infer<typeof scorecardSubmitSchema>;

interface Scorecard {
  id: string;
  interviewId: string;
  interviewTitle?: string;
  interviewType?: "phone" | "video" | "in_person";
  interviewStartTime?: string;
  interviewerId?: string;
  interviewerName?: string;
  overallRating: number;
  recommendation: "proceed" | "hold" | "reject";
  notes?: string;
  submittedAt: string;
}

const recommendationColors: Record<string, string> = {
  proceed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  reject: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

interface CalendarConnection {
  id: string;
  provider: "google" | "microsoft";
  calendarEmail: string | null;
  syncStatus: "active" | "expired" | "error" | "disconnected";
  lastSyncAt: string | null;
}

interface Interview {
  id: string;
  applicationId: string;
  title: string;
  interviewType: "phone" | "video" | "in_person";
  status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
  startTime: string;
  endTime: string;
  durationMinutes: number;
  location?: string;
  meetingLink?: string;
  notes?: string;
  organizerId?: string;
}

const interviewTypeIcons = {
  phone: Phone,
  video: Video,
  in_person: Building2,
};

const interviewStatusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  completed: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  no_show: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
};

function SlaThresholdsConfig() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "admin" || user?.role === "recruiting_admin";

  const { data: thresholds, isLoading } = useQuery<any[]>({
    queryKey: ["/api/recruiting/sla-thresholds"],
    queryFn: async () => {
      const res = await fetch("/api/recruiting/sla-thresholds", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [editValues, setEditValues] = useState<Record<string, { thresholdHours: number; isEnabled: boolean }>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (thresholds && Object.keys(editValues).length === 0) {
      const initial: Record<string, { thresholdHours: number; isEnabled: boolean }> = {};
      for (const t of thresholds) {
        initial[t.stageKey] = { thresholdHours: t.thresholdHours, isEnabled: t.isEnabled };
      }
      setEditValues(initial);
    }
  }, [thresholds]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(editValues).map(([stageKey, vals]) => ({
        stageKey,
        thresholdHours: vals.thresholdHours,
        isEnabled: vals.isEnabled,
      }));
      const res = await apiRequest("PUT", "/api/recruiting/sla-thresholds", { thresholds: payload });
      if (!res.ok) throw new Error("Failed to save SLA thresholds");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/sla-thresholds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
      setHasChanges(false);
      toast({ title: "SLA thresholds saved" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const stageLabels: Record<string, string> = {
    applied: "Applied",
    phone_screen: "Phone Screen",
    interview_scheduled: "Interview Scheduled",
    interview_completed: "Interview Completed",
    background_check: "Background Check",
    drug_test: "Drug Test",
    mvr_check: "MVR Check",
    offer_extended: "Offer Extended",
    offer_accepted: "Offer Accepted",
    onboarding: "Onboarding",
  };

  const updateValue = (stageKey: string, field: "thresholdHours" | "isEnabled", value: any) => {
    setEditValues(prev => ({
      ...prev,
      [stageKey]: { ...prev[stageKey], [field]: value },
    }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-sla-thresholds-config">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            SLA Thresholds
          </CardTitle>
          <CardDescription>
            Configure time limits for each recruiting stage. Applications exceeding these limits will be flagged as overdue.
          </CardDescription>
        </div>
        {isAdmin && hasChanges && (
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-sla-thresholds"
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr,auto,auto] gap-4 items-center text-sm font-medium text-muted-foreground pb-2 border-b">
            <div>Stage</div>
            <div className="w-32 text-center">Threshold (hours)</div>
            <div className="w-20 text-center">Enabled</div>
          </div>
          {Object.entries(stageLabels).map(([stageKey, label]) => {
            const vals = editValues[stageKey] || { thresholdHours: 72, isEnabled: true };
            return (
              <div key={stageKey} className="grid grid-cols-[1fr,auto,auto] gap-4 items-center" data-testid={`sla-row-${stageKey}`}>
                <div className="text-sm font-medium">{label}</div>
                <div className="w-32">
                  <Input
                    type="number"
                    min={1}
                    max={720}
                    value={vals.thresholdHours}
                    onChange={(e) => updateValue(stageKey, "thresholdHours", parseInt(e.target.value) || 1)}
                    disabled={!isAdmin}
                    className="text-center"
                    data-testid={`input-sla-hours-${stageKey}`}
                  />
                </div>
                <div className="w-20 flex justify-center">
                  <Switch
                    checked={vals.isEnabled}
                    onCheckedChange={(checked) => updateValue(stageKey, "isEnabled", checked)}
                    disabled={!isAdmin}
                    data-testid={`switch-sla-enabled-${stageKey}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CalendarSettings() {
  const { toast } = useToast();
  
  const { data: connections, isLoading } = useQuery<{ connections: CalendarConnection[] }>({
    queryKey: ["/api/recruiting/calendar/connections"],
  });

  const connectMutation = useMutation({
    mutationFn: async (provider: "google" | "microsoft") => {
      const response = await apiRequest("POST", "/api/recruiting/calendar/connect", { provider });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Calendar Connected",
        description: data.message || "Calendar connection initiated. OAuth flow would redirect here.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/calendar/connections"] });
    },
    onError: () => {
      toast({
        title: "Connection Failed",
        description: "Failed to connect calendar. Please try again.",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: "google" | "microsoft") => {
      const response = await apiRequest("DELETE", "/api/recruiting/calendar/disconnect", { provider });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Calendar Disconnected",
        description: "Your calendar has been disconnected.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/calendar/connections"] });
    },
  });

  const googleConnection = connections?.connections?.find((c) => c.provider === "google");
  const microsoftConnection = connections?.connections?.find((c) => c.provider === "microsoft");

  return (
    <Card data-testid="card-calendar-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Calendar Integration
        </CardTitle>
        <CardDescription>
          Connect your calendar to sync interview schedules automatically
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded bg-[#4285F4] flex items-center justify-center text-white text-xs font-bold">G</div>
                <div>
                  <div className="font-medium">Google Calendar</div>
                  {googleConnection?.syncStatus === "active" ? (
                    <div className="text-sm text-muted-foreground">
                      Connected: {googleConnection.calendarEmail}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Not connected</div>
                  )}
                </div>
              </div>
              {googleConnection?.syncStatus === "active" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectMutation.mutate("google")}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-disconnect-google"
                >
                  <Link2Off className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => connectMutation.mutate("google")}
                  disabled={connectMutation.isPending}
                  data-testid="button-connect-google"
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Connect
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded bg-[#00A4EF] flex items-center justify-center text-white text-xs font-bold">M</div>
                <div>
                  <div className="font-medium">Microsoft 365</div>
                  {microsoftConnection?.syncStatus === "active" ? (
                    <div className="text-sm text-muted-foreground">
                      Connected: {microsoftConnection.calendarEmail}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Not connected</div>
                  )}
                </div>
              </div>
              {microsoftConnection?.syncStatus === "active" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectMutation.mutate("microsoft")}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-disconnect-microsoft"
                >
                  <Link2Off className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => connectMutation.mutate("microsoft")}
                  disabled={connectMutation.isPending}
                  data-testid="button-connect-microsoft"
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Connect
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function JobBoardFeedCard() {
  const { toast } = useToast();
  
  const { data: feedStatus, isLoading, refetch } = useQuery<{
    lastRefreshed: string;
    totalOpenJobs: number;
    feedUrl: string;
  }>({
    queryKey: ["/api/recruiting/job-feed/status"],
  });

  const copyFeedUrl = () => {
    if (feedStatus?.feedUrl) {
      navigator.clipboard.writeText(feedStatus.feedUrl);
      toast({
        title: "Feed URL Copied",
        description: "The job feed URL has been copied to your clipboard.",
      });
    }
  };

  const refreshFeed = async () => {
    await refetch();
    toast({
      title: "Feed Refreshed",
      description: "The job board feed has been refreshed with the latest requisitions.",
    });
  };

  return (
    <Card data-testid="card-job-board-feed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rss className="h-5 w-5" />
          Job Board Feed
        </CardTitle>
        <CardDescription>
          Distribute open positions to external job boards
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg border">
                <div className="text-sm text-muted-foreground">Open Positions</div>
                <div className="text-2xl font-bold" data-testid="text-open-positions-count">
                  {feedStatus?.totalOpenJobs ?? 0}
                </div>
              </div>
              <div className="p-3 rounded-lg border">
                <div className="text-sm text-muted-foreground">Last Refreshed</div>
                <div className="text-sm font-medium">
                  {feedStatus?.lastRefreshed 
                    ? new Date(feedStatus.lastRefreshed).toLocaleString()
                    : "Never"
                  }
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Feed URL</div>
              <div className="flex items-center gap-2">
                <Input 
                  value={feedStatus?.feedUrl || "Not configured"} 
                  readOnly 
                  className="font-mono text-sm"
                  data-testid="input-feed-url"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyFeedUrl}
                  disabled={!feedStatus?.feedUrl}
                  data-testid="button-copy-feed-url"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Provide this URL to job boards. Requires API key for authentication.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={refreshFeed}
                className="flex-1"
                data-testid="button-refresh-feed"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Feed
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ScheduleInterviewDialog({ 
  applicationId, 
  candidateName,
  trigger 
}: { 
  applicationId: string; 
  candidateName: string;
  trigger: React.ReactNode;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const form = useForm<InterviewForm>({
    resolver: zodResolver(interviewSchema),
    defaultValues: {
      title: `Interview with ${candidateName}`,
      interviewType: "video",
      startDate: "",
      startTime: "10:00",
      durationMinutes: 30,
      location: "",
      meetingLink: "",
      notes: "",
    },
  });

  const createInterviewMutation = useMutation({
    mutationFn: async (data: InterviewForm) => {
      const startDateTime = new Date(`${data.startDate}T${data.startTime}`);
      const endDateTime = new Date(startDateTime.getTime() + data.durationMinutes * 60000);
      
      const response = await apiRequest("POST", "/api/recruiting/interviews", {
        applicationId,
        title: data.title,
        interviewType: data.interviewType,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        durationMinutes: data.durationMinutes,
        location: data.interviewType === "in_person" ? data.location : null,
        meetingLink: data.interviewType === "video" ? data.meetingLink : null,
        notes: data.notes,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Interview Scheduled",
        description: "The interview has been scheduled and added to your calendar.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/interviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/stats"] });
      setOpen(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Scheduling Failed",
        description: "Failed to schedule interview. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InterviewForm) => {
    createInterviewMutation.mutate(data);
  };

  const interviewType = form.watch("interviewType");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-schedule-interview">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" />
            Schedule Interview
          </DialogTitle>
          <DialogDescription>
            Schedule an interview for {candidateName}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interview Title</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-interview-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="interviewType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interview Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-interview-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="phone">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" /> Phone Interview
                        </div>
                      </SelectItem>
                      <SelectItem value="video">
                        <div className="flex items-center gap-2">
                          <Video className="h-4 w-4" /> Video Interview
                        </div>
                      </SelectItem>
                      <SelectItem value="in_person">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" /> In-Person Interview
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        min={new Date().toISOString().split('T')[0]}
                        {...field} 
                        data-testid="input-interview-date" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} data-testid="input-interview-time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="durationMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration</FormLabel>
                  <Select onValueChange={(v) => field.onChange(parseInt(v))} defaultValue={field.value.toString()}>
                    <FormControl>
                      <SelectTrigger data-testid="select-interview-duration">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="90">1.5 hours</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {interviewType === "video" && (
              <FormField
                control={form.control}
                name="meetingLink"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meeting Link (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://meet.google.com/..." 
                        {...field} 
                        data-testid="input-interview-meeting-link" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {interviewType === "in_person" && (
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Office address" 
                        {...field} 
                        data-testid="input-interview-location" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Interview notes or preparation instructions..."
                      rows={3}
                      {...field} 
                      data-testid="input-interview-notes" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button 
                type="submit" 
                disabled={createInterviewMutation.isPending}
                data-testid="button-submit-interview"
              >
                {createInterviewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Schedule Interview
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function InterviewBadge({ interview }: { interview: Interview }) {
  const TypeIcon = interviewTypeIcons[interview.interviewType];
  const startDate = new Date(interview.startTime);
  
  return (
    <div className="flex items-center gap-2 text-xs" data-testid={`interview-badge-${interview.id}`}>
      <Badge 
        variant="outline" 
        className={`${interviewStatusColors[interview.status]} gap-1`}
      >
        <TypeIcon className="h-3 w-3" />
        {interview.status === "scheduled" ? (
          <>
            {startDate.toLocaleDateString()} {startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
          </>
        ) : (
          interview.status.replace("_", " ")
        )}
      </Badge>
    </div>
  );
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  pending_approval: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  open: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  on_hold: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  filled: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const applicationStatusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  screening: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  interview: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  offer: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  hired: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  withdrawn: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

export default function Recruiting() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isSuperAdmin, isRootSuperAdmin } = useAuth();
  const canImport = isSuperAdmin || isRootSuperAdmin;
  const pathParts = location.startsWith("/recruiting/") ? location.replace("/recruiting/", "").split("/") : [];
  const tabFromPath = pathParts[0] || "campaigns";
  const detailId = pathParts[1] || null;
  const validTabs = ["campaigns","closed-campaigns","requisitions","candidates","applications","pipeline","queue","referrals","requests","reports","compliance","tags","demand","flags","reasons","tasks","validation","assignment","settings","audit","health","decommission","archives","escalations","throttling","emergency","observability"];
  const initialTab = validTabs.includes(tabFromPath) ? tabFromPath : "campaigns";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchTerm, setSearchTerm] = useState("");
  const [requisitionDialogOpen, setRequisitionDialogOpen] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [clonePrefill, setClonePrefill] = useState<Record<string, any> | null>(null);
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [candidateDialogOpen, setCandidateDialogOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const urlParams = useMemo(() => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''), []);
  const [readinessFilter, setReadinessFilter] = useState<string>(urlParams.get("readiness") || "all");
  const [stageFilter, setStageFilter] = useState<string>(urlParams.get("stage") || "all");
  const [geoFilter, setGeoFilter] = useState<string>(urlParams.get("geo") || "all");
  const [marketFilter, setMarketFilter] = useState<string>(urlParams.get("market") || "all");
  const [requisitionFilter, setRequisitionFilter] = useState<string>(urlParams.get("requisition") || "all");
  const [sourceFilter, setSourceFilter] = useState<string>(urlParams.get("source") || "all");
  const [cdlFilter, setCdlFilter] = useState<string>(urlParams.get("cdl") || "all");
  const [roleTypeFilter, setRoleTypeFilter] = useState<string>(urlParams.get("roleType") || "all");
  const [dateFromFilter, setDateFromFilter] = useState<string>(urlParams.get("from") || "");
  const [dateToFilter, setDateToFilter] = useState<string>(urlParams.get("to") || "");
  const [slaBreachedFilter, setSlaBreachedFilter] = useState<boolean>(urlParams.get("overdue") === "true");
  const [selectedSavedView, setSelectedSavedView] = useState<SavedView | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportType, setExportType] = useState<string>("candidates");
  const [exportReason, setExportReason] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [screeningDialogOpen, setScreeningDialogOpen] = useState(false);
  const [selectedApplicationForScreening, setSelectedApplicationForScreening] = useState<any>(null);
  const [referralDialogOpen, setReferralDialogOpen] = useState(false);
  const [selectedApplications, setSelectedApplications] = useState<Set<string>>(new Set());
  const [bulkAssignDialogOpen, setBulkAssignDialogOpen] = useState(false);
  const [bulkMoveStageDialogOpen, setBulkMoveStageDialogOpen] = useState(false);
  const [bulkTagDialogOpen, setBulkTagDialogOpen] = useState(false);
  const [bulkArchiveDialogOpen, setBulkArchiveDialogOpen] = useState(false);
  const [bulkArchiveReason, setBulkArchiveReason] = useState("");
  const [bulkResultDialogOpen, setBulkResultDialogOpen] = useState(false);
  const [bulkResultData, setBulkResultData] = useState<{ title: string; results: Array<{ applicationId: string; success: boolean; error?: string }> } | null>(null);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [selectedApplicationForReassign, setSelectedApplicationForReassign] = useState<any>(null);
  const [selectedRecruiterId, setSelectedRecruiterId] = useState<string>("");
  const [reassignReason, setReassignReason] = useState("");
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedApplicationForWithdrawal, setSelectedApplicationForWithdrawal] = useState<any>(null);
  const [editRequisitionDialogOpen, setEditRequisitionDialogOpen] = useState(false);
  const [reqDocTypes, setReqDocTypes] = useState<Array<{ docType: string; label: string; required: boolean; blockStageProgression: boolean; expirationRequired: boolean }>>([]);
  const [reqDocTypesLoading, setReqDocTypesLoading] = useState(false);
  const [newDocType, setNewDocType] = useState("");
  const [editingRequisition, setEditingRequisition] = useState<any>(null);
  const [duplicateCandidateDialogOpen, setDuplicateCandidateDialogOpen] = useState(false);
  const [duplicateCandidateInfo, setDuplicateCandidateInfo] = useState<{ existingCandidate: any; matchedOn: string[] } | null>(null);

  const requisitionForm = useForm<RequisitionForm>({
    resolver: zodResolver(requisitionSchema),
    defaultValues: {
      title: "",
      department: "",
      location: "",
      employmentType: "full_time",
      description: "",
      requirements: "",
      salaryMin: "",
      salaryMax: "",
      salaryType: "annual",
      openings: 1,
      priority: "normal",
      isRemote: false,
      requiredLicenseClass: undefined,
      requiredEndorsements: [],
      licenseGateEnabled: false,
      cdlRequired: false,
      requiredDocumentTypes: [],
      blockStageIfDocsIncomplete: false,
      listingDescription: "",
      accountId: "",
      roleType: "vehicle_movement",
      shuttleRouteType: "",
      availabilityPattern: "standard",
    },
  });

  const candidateForm = useForm<CandidateForm>({
    resolver: zodResolver(candidateSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      address: "",
      addressLine2: "",
      city: "",
      state: "",
      zipCode: "",
      dateOfBirth: "",
      currentEmployer: "",
      preferredMarkets: [],
      source: "recruiter_sourced",
      sourceDetails: "",
      notes: "",
      endorsements: [],
    },
  });

  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery<{
    // Campaign / request metrics
    totalRequestsYtd: number;
    totalActiveCampaigns: number;
    criticalActiveCampaigns: number;
    totalClosedYtd: number;
    totalCancelledYtd: number;
    // Open positions
    openRequisitions: number;
    openPositions: number;
    openPositionsIc: number;
    openPositionsEmployee: number;
    // Manual metrics
    totalCandidates: number;
    candidatesIc: number;
    candidatesEmployee: number;
    activeApplications: number;
    pendingInterviews: number;
    interviewsIc: number;
    interviewsEmployee: number;
    pendingOffers: number;
    hiredThisMonth: number;
    hiredIc: number;
    hiredEmployee: number;
    // Drivers Hired YTD — manual, stored under metricMonth = current year
    hiredYtd: number;
    hiredYtdIc: number;
    hiredYtdEmployee: number;
    hiredYtdUpdatedAt: string | null;
    hiredYtdUpdatedByName: string | null;
    avgTimeToHire: number;
    pipelineByStage: { stage: string; count: number }[];
    metricsUpdatedAt: string | null;
    metricsUpdatedByName: string | null;
    // Per-metric timestamps (migration 0045)
    candidatesUpdatedAt: string | null;
    candidatesUpdatedByName: string | null;
    interviewsUpdatedAt: string | null;
    interviewsUpdatedByName: string | null;
    hiredUpdatedAt: string | null;
    hiredUpdatedByName: string | null;
    canEdit: boolean;
    // Reporting baseline — ISO date string of the first approved campaign, or null
    reportingBaseline: string | null;
  }>({
    queryKey: ["/api/corporate/recruiting/stats"],
  });

  // Drivers Hired — rolling 45-day widget (DH-002165)
  const {
    data: hired45Data,
    isLoading: hired45Loading,
    isError: hired45Error,
  } = useQuery<{ total: number; icCount: number; employeeCount: number; drivers: any[] }>({
    queryKey: ["/api/recruiting/campaigns/hired-last-45"],
  });
  const [showHired45Dialog, setShowHired45Dialog] = useState(false);

  // Manual metrics edit state — null = closed, string = which metric is being edited
  const [editMetricTarget, setEditMetricTarget] = useState<"candidates" | "interviews" | "hired" | "hired_ytd" | null>(null);
  // Form holds only the two values for the currently-open metric
  const [metricsForm, setMetricsForm] = useState({ icValue: 0, employeeValue: 0 });
  const updateMetricsMutation = useMutation({
    mutationFn: ({ metricName, icValue, employeeValue }: { metricName: string; icValue: number; employeeValue: number }) =>
      apiRequest("PUT", "/api/corporate/recruiting/stats/manual", { metricName, icValue, employeeValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/stats"] });
      toast({ title: "Metrics updated" });
      setEditMetricTarget(null);
    },
    onError: (e: any) => toast({ title: "Failed to update metrics", description: e.message, variant: "destructive" }),
  });

  // Helper: open per-metric edit dialog, pre-filling only the targeted metric's current values
  const openMetricEdit = (target: "candidates" | "interviews" | "hired" | "hired_ytd") => {
    const icMap  = { candidates: stats?.candidatesIc, interviews: stats?.interviewsIc, hired: stats?.hiredIc, hired_ytd: stats?.hiredYtdIc };
    const empMap = { candidates: stats?.candidatesEmployee, interviews: stats?.interviewsEmployee, hired: stats?.hiredEmployee, hired_ytd: stats?.hiredYtdEmployee };
    setMetricsForm({ icValue: icMap[target] ?? 0, employeeValue: empMap[target] ?? 0 });
    setEditMetricTarget(target);
  };

  const { data: requisitions = [], isLoading: requisitionsLoading } = useQuery<any[]>({
    queryKey: ["/api/corporate/recruiting/requisitions"],
  });

  const {
    data: activeCustomers = [],
    isError: activeCustomersError,
    refetch: refetchActiveCustomers,
  } = useQuery<any[]>({
    queryKey: ["/api/accounts/search", "recruiting-account-discovery"],
    queryFn: async () => {
      const response = await fetch("/api/accounts/search?q=&limit=500", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Unable to load account discovery data.");
      }
      return response.json();
    },
  });

  const { data: candidates = [], isLoading: candidatesLoading } = useQuery<any[]>({
    queryKey: ["/api/corporate/recruiting/candidates"],
  });

  const { data: screeningFormTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/recruiting/screening-forms"],
  });

  const { data: marketsData = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/markets"],
  });

  const [selectedTagFilter, setSelectedTagFilter] = useState<string>(urlParams.get("tag") || "__all__"); // Filter applications by tag
  const [showArchived, setShowArchived] = useState<boolean>(urlParams.get("archived") === "true"); // Toggle to show archived applications
  const [showQuickCallFilter, setShowQuickCallFilter] = useState<boolean>(false); // Filter to only show quick call requests
  const [aiRecommendationFilter, setAiRecommendationFilter] = useState<string>("all"); // all | advance | review | reject_recommended | unscored
  const [overdueScreeningFilter, setOverdueScreeningFilter] = useState<boolean>(urlParams.get("overdueScreening") === "true"); // Ticket 13: filter by stalled screening SLA

  const { isColumnVisible } = usePipelineColumns();

  const hasAdvancedFilters = marketFilter !== "all" || requisitionFilter !== "all" || sourceFilter !== "all" || cdlFilter !== "all" || roleTypeFilter !== "all" || dateFromFilter || dateToFilter || stageFilter !== "all" || readinessFilter !== "all" || geoFilter !== "all" || slaBreachedFilter || overdueScreeningFilter || (selectedTagFilter && selectedTagFilter !== "__all__");

  useEffect(() => {
    const params = new URLSearchParams();
    if (readinessFilter !== "all") params.set("readiness", readinessFilter);
    if (stageFilter !== "all") params.set("stage", stageFilter);
    if (geoFilter !== "all") params.set("geo", geoFilter);
    if (marketFilter !== "all") params.set("market", marketFilter);
    if (requisitionFilter !== "all") params.set("requisition", requisitionFilter);
    if (sourceFilter !== "all") params.set("source", sourceFilter);
    if (dateFromFilter) params.set("from", dateFromFilter);
    if (dateToFilter) params.set("to", dateToFilter);
    if (slaBreachedFilter) params.set("overdue", "true");
    if (overdueScreeningFilter) params.set("overdueScreening", "true");
    if (selectedTagFilter && selectedTagFilter !== "__all__") params.set("tag", selectedTagFilter);
    if (showArchived) params.set("archived", "true");
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [readinessFilter, stageFilter, geoFilter, marketFilter, requisitionFilter, sourceFilter, dateFromFilter, dateToFilter, slaBreachedFilter, overdueScreeningFilter, selectedTagFilter, showArchived]);

  const clearAllFilters = useCallback(() => {
    setReadinessFilter("all");
    setStageFilter("all");
    setGeoFilter("all");
    setMarketFilter("all");
    setRequisitionFilter("all");
    setSourceFilter("all");
    setCdlFilter("all");
    setRoleTypeFilter("all");
    setDateFromFilter("");
    setDateToFilter("");
    setSlaBreachedFilter(false);
    setOverdueScreeningFilter(false);
    setSelectedTagFilter("__all__");
    setShowArchived(false);
    setShowQuickCallFilter(false);
    setAiRecommendationFilter("all");
    setSelectedSavedView(null);
  }, []);

  const applicationsQueryKey = (() => {
    let url = "/api/recruiting/applications";
    const params = new URLSearchParams();
    if (readinessFilter !== "all") params.set("readinessStatus", readinessFilter);
    if (stageFilter !== "all") params.set("stage", stageFilter);
    if (selectedTagFilter && selectedTagFilter !== "__all__") params.set("tag", selectedTagFilter);
    if (showArchived) params.set("includeArchived", "true");
    if (slaBreachedFilter) params.set("slaBreached", "true");
    if (geoFilter === "eligible") params.set("geoEligible", "true");
    if (geoFilter === "ineligible") params.set("geoEligible", "false");
    if (marketFilter !== "all") params.set("market", marketFilter);
    if (requisitionFilter !== "all") params.set("requisitionId", requisitionFilter);
    if (sourceFilter !== "all") params.set("source", sourceFilter);
    if (dateFromFilter) params.set("createdFrom", dateFromFilter);
    if (dateToFilter) params.set("createdTo", dateToFilter);
    if (showQuickCallFilter) params.set("quickCall", "true");
    if (aiRecommendationFilter !== "all") params.set("aiRecommendation", aiRecommendationFilter);
    return params.toString() ? `${url}?${params.toString()}` : url;
  })();
    
  const { data: applicationsData, isLoading: applicationsLoading, refetch: refetchApplications } = useQuery<{
    applications: any[];
    total: number;
  }>({
    queryKey: [applicationsQueryKey],
  });
  
  const applications = applicationsData?.applications || [];

  // Role-type filtered applications (for pipeline view — client-side post-filter)
  const roleFilteredApplications = roleTypeFilter === "all"
    ? applications
    : applications.filter((app: any) => (app.requisition?.roleType || "vehicle_movement") === roleTypeFilter);

  // ── Screening SLA overdue data (Ticket 13) ───────────────────────────────────
  const { data: screeningOverdueData } = useQuery<{
    overdueApplicationIds: string[];
    warningApplicationIds: string[];
  }>({
    queryKey: ["/api/recruiting/screening-requests/overdue"],
    queryFn: async () => {
      const res = await fetch("/api/recruiting/screening-requests/overdue", { credentials: "include" });
      if (!res.ok) return { overdueApplicationIds: [], warningApplicationIds: [] };
      return res.json();
    },
    staleTime: 2 * 60 * 1000, // 2-min cache — SLA ages change slowly
    refetchInterval: 30_000, // re-check every 30 seconds
  });
  const overdueScreeningAppIds = new Set<string>(screeningOverdueData?.overdueApplicationIds ?? []);
  const warningScreeningAppIds = new Set<string>(screeningOverdueData?.warningApplicationIds ?? []);

  // Client-side post-filter for overdue screening (applied on top of server-side filters)
  const displayedApplications: any[] = overdueScreeningFilter
    ? applications.filter((a: any) => overdueScreeningAppIds.has(a.id))
    : applications;

  const applicationIds = displayedApplications.map((a: any) => a.id).join(",");
  const { data: taskCounts } = useQuery<Record<string, number>>({
    queryKey: [`/api/recruiting/tasks/counts?entityType=application&entityIds=${applicationIds}`],
    enabled: applications.length > 0,
  });

  const { data: referralsData, isLoading: referralsLoading, refetch: refetchReferrals } = useQuery<{
    referrals: any[];
    total: number;
  }>({
    queryKey: ["/api/recruiting/referrals?all=true"],
  });

  const referrals = referralsData?.referrals || [];

  const { data: recruitersData } = useQuery<{ id: string; email: string; name: string }[]>({
    queryKey: ["/api/recruiting/recruiters"],
  });
  const recruiters = recruitersData || [];

  type RecruiterWorkload = {
    recruiterId: string;
    recruiterEmail: string;
    recruiterName: string;
    activeApplications: number;
    slaBreachedCount: number;
  };
  
  const { data: workloadsData, isLoading: workloadsLoading } = useQuery<RecruiterWorkload[]>({
    queryKey: ["/api/recruiting/workloads"],
  });
  const workloads = workloadsData || [];

  const [showWorkloadPanel, setShowWorkloadPanel] = useState(false);

  const assignApplicationMutation = useMutation({
    mutationFn: async ({ applicationId, newOwnerId, reason }: { applicationId: string; newOwnerId: string | null; reason?: string }) => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/assign`, { newOwnerId, reason });
      if (!res.ok) {
        const error = await res.json();
        if (res.status === 409 && error.conflict) {
          throw new Error(`Locked by ${error.conflict.lockedByEmail || 'another user'}. Wait for them to finish or try again later.`);
        }
        throw new Error(error.message || "Failed to assign application");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Application assigned successfully" });
      queryClient.invalidateQueries({ queryKey: [applicationsQueryKey] });
      setReassignDialogOpen(false);
      setSelectedApplicationForReassign(null);
      setSelectedRecruiterId("");
      setReassignReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ applicationIds, newOwnerId, reason }: { applicationIds: string[]; newOwnerId: string | null; reason?: string }) => {
      const res = await apiRequest("POST", "/api/recruiting/applications/bulk-assign", { applicationIds, newOwnerId, reason });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to bulk assign applications");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: `${data.successCount} applications assigned successfully` });
      queryClient.invalidateQueries({ queryKey: [applicationsQueryKey] });
      setBulkAssignDialogOpen(false);
      setSelectedApplications(new Set());
      setSelectedRecruiterId("");
      setReassignReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: myRewardsData } = useQuery<{
    rewards: any[];
    totalPending: number;
    totalPaid: number;
  }>({
    queryKey: ["/api/recruiting/referrals/rewards/my"],
  });

  const referralForm = useForm<ReferralSubmitForm>({
    resolver: zodResolver(referralSubmitSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      market: "",
      notes: "",
    },
  });

  const submitReferralMutation = useMutation({
    mutationFn: async (data: ReferralSubmitForm) => {
      const payload = {
        referredFirstName: data.firstName,
        referredLastName: data.lastName,
        referredEmail: data.email,
        referredPhone: data.phone,
        market: data.market || null,
        notes: data.notes || null,
      };
      const res = await apiRequest("POST", "/api/recruiting/referrals", payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to submit referral");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.isDuplicate ? "Duplicate Referral" : "Referral Submitted",
        description: data.isDuplicate 
          ? "A referral for this candidate already exists." 
          : "Your referral has been submitted successfully.",
        variant: data.isDuplicate ? "default" : "default",
      });
      referralForm.reset();
      setReferralDialogOpen(false);
      refetchReferrals();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit referral",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const recalculateReadinessMutation = useMutation({
    mutationFn: async (applicationId: number) => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/readiness/recalculate`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to recalculate readiness");
      }
      return res.json();
    },
    onSuccess: () => {
      refetchApplications();
      toast({ title: "Readiness score recalculated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to recalculate readiness", description: error.message, variant: "destructive" });
    },
  });

  // Master tags from the recruiting_tags table
  const { data: masterTagsData, refetch: refetchMasterTags } = useQuery<{ tags: any[] }>({
    queryKey: ["/api/recruiting/tags/all"],
  });
  const masterTags = masterTagsData?.tags || [];

  // Legacy tags list (string-based)
  const { data: allTagsData } = useQuery<{ tags: string[] }>({
    queryKey: ["/api/recruiting/tags"],
  });
  const availableTags = allTagsData?.tags || [];

  // Fetch reason codes for bulk stage moves
  const { data: reasonCodesData } = useQuery<{ code: string; label: string; stage: string; isRequired: boolean }[]>({
    queryKey: ["/api/recruiting/reason-codes"],
    queryFn: async () => {
      const res = await fetch("/api/recruiting/reason-codes");
      if (!res.ok) return [];
      return res.json();
    },
  });
  const reasonCodes = reasonCodesData || [];

  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkMoveStage, setBulkMoveStage] = useState("");
  const [bulkMoveReasonCode, setBulkMoveReasonCode] = useState("");
  const [bulkMoveReasonText, setBulkMoveReasonText] = useState("");

  const bulkMoveStageMutation = useMutation({
    mutationFn: async ({ applicationIds, toStage, reasonCode, reasonLabel, reasonNotes }: { applicationIds: string[], toStage: string, reasonCode?: string, reasonLabel?: string, reasonNotes?: string }) => {
      const res = await apiRequest("POST", "/api/recruiting/bulk/move-stage", { 
        applicationIds, 
        toStage, 
        reasonCode,
        reasonLabel,
        reasonNotes,
        reason: reasonCode ? `${reasonLabel || reasonCode}${reasonNotes ? ': ' + reasonNotes : ''}` : "Bulk stage move"
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to bulk move stage");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk Stage Move Complete",
        description: `${data.successCount} moved, ${data.failureCount} failed`,
        variant: data.failureCount > 0 ? "destructive" : "default",
      });
      if (data.failureCount > 0 && data.results) {
        setBulkResultData({ title: "Stage Move Results", results: data.results });
        setBulkResultDialogOpen(true);
      }
      setSelectedApplications(new Set());
      setBulkMoveStageDialogOpen(false);
      refetchApplications();
    },
    onError: (error: Error) => {
      toast({ title: "Bulk stage move failed", description: error.message, variant: "destructive" });
    },
  });

  const bulkAddTagsMutation = useMutation({
    mutationFn: async ({ applicationIds, tags }: { applicationIds: string[], tags: string[] }) => {
      const res = await apiRequest("POST", "/api/recruiting/bulk/add-tags", { applicationIds, tags });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to bulk add tags");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/tags"] });
      toast({
        title: "Bulk Tag Complete",
        description: `${data.successCount} tagged, ${data.failureCount} failed`,
        variant: data.failureCount > 0 ? "destructive" : "default",
      });
      if (data.failureCount > 0 && data.results) {
        setBulkResultData({ title: "Tag Results", results: data.results });
        setBulkResultDialogOpen(true);
      }
      setSelectedApplications(new Set());
      setBulkTagDialogOpen(false);
      setBulkTagInput("");
      refetchApplications();
    },
    onError: (error: Error) => {
      toast({ title: "Bulk tagging failed", description: error.message, variant: "destructive" });
    },
  });

  // Archive a single application
  const archiveApplicationMutation = useMutation({
    mutationFn: async ({ applicationId, reason }: { applicationId: string; reason?: string }) => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/archive`, { reason });
      if (!res.ok) {
        const error = await res.json();
        if (res.status === 409 && error.conflict) {
          throw new Error(`Locked by ${error.conflict.lockedByEmail || 'another user'}. Wait for them to finish or try again later.`);
        }
        throw new Error(error.message || "Failed to archive application");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Application archived", description: "The application has been archived successfully." });
      refetchApplications();
    },
    onError: (error: Error) => {
      toast({ title: "Archive failed", description: error.message, variant: "destructive" });
    },
  });

  // Restore a single application
  const restoreApplicationMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/restore`);
      if (!res.ok) {
        const error = await res.json();
        if (res.status === 409 && error.conflict) {
          throw new Error(`Locked by ${error.conflict.lockedByEmail || 'another user'}. Wait for them to finish or try again later.`);
        }
        throw new Error(error.message || "Failed to restore application");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Application restored", description: "The application has been restored successfully." });
      refetchApplications();
    },
    onError: (error: Error) => {
      toast({ title: "Restore failed", description: error.message, variant: "destructive" });
    },
  });

  // Bulk archive applications
  const bulkArchiveMutation = useMutation({
    mutationFn: async ({ applicationIds, reason }: { applicationIds: string[]; reason?: string }) => {
      const res = await apiRequest("POST", "/api/recruiting/bulk/archive", { applicationIds, reason });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to bulk archive");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk Archive Complete",
        description: `${data.successCount} archived, ${data.failureCount} failed`,
        variant: data.failureCount > 0 ? "destructive" : "default",
      });
      if (data.failureCount > 0 && data.results) {
        setBulkResultData({ title: "Archive Results", results: data.results });
        setBulkResultDialogOpen(true);
      }
      setSelectedApplications(new Set());
      setBulkArchiveDialogOpen(false);
      setBulkArchiveReason("");
      refetchApplications();
    },
    onError: (error: Error) => {
      toast({ title: "Bulk archive failed", description: error.message, variant: "destructive" });
    },
  });

  // Bulk restore applications
  const bulkRestoreMutation = useMutation({
    mutationFn: async (applicationIds: string[]) => {
      const res = await apiRequest("POST", "/api/recruiting/bulk/restore", { applicationIds });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to bulk restore");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk Restore Complete",
        description: `${data.successCount} applications restored, ${data.failureCount} failed`,
      });
      setSelectedApplications(new Set());
      refetchApplications();
    },
    onError: (error: Error) => {
      toast({ title: "Bulk restore failed", description: error.message, variant: "destructive" });
    },
  });

  const toggleApplicationSelection = (appId: string) => {
    setSelectedApplications(prev => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedApplications.size === applications.length) {
      setSelectedApplications(new Set());
    } else {
      setSelectedApplications(new Set(applications.map((a: any) => a.id)));
    }
  };

  const clearSelection = () => {
    setSelectedApplications(new Set());
  };

  const handleSavedViewSelect = (view: SavedView | null) => {
    setSelectedSavedView(view);
    if (view) {
      setReadinessFilter(view.filters.readinessStatus || "all");
      setStageFilter(view.filters.stage || "all");
      setSlaBreachedFilter(view.filters.slaBreached || false);
      setShowArchived(view.filters.includeArchived || false);
      if (view.filters.tags && view.filters.tags.length > 0) {
        setSelectedTagFilter(view.filters.tags[0]);
      } else {
        setSelectedTagFilter("__all__");
      }
      if (view.filters.searchQuery) {
        setSearchTerm(view.filters.searchQuery);
      } else {
        setSearchTerm("");
      }
    } else {
      setReadinessFilter("all");
      setStageFilter("all");
      setSlaBreachedFilter(false);
      setShowArchived(false);
      setSelectedTagFilter("__all__");
    }
  };

  const getCurrentFilters = (): SavedViewFilters => ({
    readinessStatus: readinessFilter !== "all" ? readinessFilter : undefined,
    stage: stageFilter !== "all" ? stageFilter : undefined,
    slaBreached: slaBreachedFilter || undefined,
    includeArchived: showArchived || undefined,
    tags: selectedTagFilter !== "__all__" ? [selectedTagFilter] : undefined,
    searchQuery: searchTerm || undefined,
  });

  const handleExportData = async () => {
    if (!exportType) return;
    
    setIsExporting(true);
    try {
      const response = await apiRequest('POST', '/api/recruiting/export', {
        exportType,
        filters: {},
        reason: exportReason || undefined,
      });
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportType}_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export Complete",
        description: `${exportType} data exported successfully`,
      });
      setExportDialogOpen(false);
      setExportReason("");
    } catch (error: any) {
      const errorMessage = error.message?.includes(':') 
        ? error.message.split(':').slice(1).join(':').trim()
        : error.message || "Failed to export data";
      toast({
        title: "Export Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const fetchReqDocTypes = async (requisitionId: string) => {
    setReqDocTypesLoading(true);
    try {
      const res = await fetch("/api/recruiting/requisitions/" + requisitionId + "/required-documents", { credentials: "include" });
      if (res.ok) {
        const docs = await res.json();
        setReqDocTypes(Array.isArray(docs) ? docs.map((d: any) => ({
          docType: d.docType, label: d.label || d.docType, required: d.required,
          blockStageProgression: d.blockStageProgression, expirationRequired: d.expirationRequired,
        })) : []);
      }
    } catch { setReqDocTypes([]); }
    finally { setReqDocTypesLoading(false); }
  };

  const saveReqDocTypes = async (requisitionId: string) => {
    try {
      await apiRequest("PUT", "/api/recruiting/requisitions/" + requisitionId + "/required-documents", reqDocTypes);
    } catch (err) {
      console.error("Failed to save required documents:", err);
    }
  };

    const editRequisitionForm = useForm<RequisitionForm>({
    resolver: zodResolver(requisitionSchema),
    defaultValues: {
      title: "",
      department: "",
      location: "",
      employmentType: "full_time",
      description: "",
      requirements: "",
      salaryMin: "",
      salaryMax: "",
      salaryType: "annual",
      openings: 1,
      priority: "normal",
      isRemote: false,
      workState: "",
      workerType: "W2_DRIVER",
      requiredLicenseClass: "",
      requiredEndorsements: [],
      licenseGateEnabled: false,
      cdlRequired: false,
      requiredDocumentTypes: [],
      blockStageIfDocsIncomplete: false,
      listingDescription: "",
      accountId: "",
    },
  });

  const openEditRequisition = (req: any) => {
    setEditingRequisition(req);
    editRequisitionForm.reset({
      title: req.title || "",
      department: req.department || "",
      location: req.location || "",
      employmentType: req.employmentType || "full_time",
      description: req.description || "",
      requirements: req.requirements || "",
      salaryMin: req.salaryMin?.toString() || "",
      salaryMax: req.salaryMax?.toString() || "",
      salaryType: req.salaryType || "annual",
      openings: req.openings || 1,
      priority: req.priority || "normal",
      isRemote: req.isRemote || false,
      workState: req.workState || "",
      workerType: req.workerType || "W2_DRIVER",
      requiredLicenseClass: req.requiredLicenseClass || "",
      requiredEndorsements: req.requiredEndorsements || [],
      licenseGateEnabled: req.licenseGateEnabled || false,
      cdlRequired: req.cdlRequired || false,
      requiredDocumentTypes: req.requiredDocumentTypes || [],
      blockStageIfDocsIncomplete: req.blockStageIfDocsIncomplete || false,
      listingDescription: req.listingDescription || "",
      accountId: req.accountId || "",
      roleType: req.roleType || "vehicle_movement",
      shuttleRouteType: req.shuttleRouteType || "",
      availabilityPattern: req.availabilityPattern || "standard",
    });
    setEditRequisitionDialogOpen(true);
  };

  const updateRequisitionMutation = useMutation({
    mutationFn: async (data: RequisitionForm) => {
      if (!editingRequisition) throw new Error("No requisition selected");
      const payload: Record<string, unknown> = {
        title: data.title,
        department: data.department || null,
        location: data.location || null,
        employmentType: data.employmentType || "full_time",
        description: data.description || null,
        requirements: data.requirements || null,
        salaryMin: data.salaryMin || null,
        salaryMax: data.salaryMax || null,
        salaryType: data.salaryType || "annual",
        openings: typeof data.openings === "number" ? data.openings : 1,
        priority: data.priority || "normal",
        isRemote: data.isRemote === true,
        requiredLicenseClass: data.requiredLicenseClass && data.requiredLicenseClass !== 'none' ? data.requiredLicenseClass : null,
        requiredEndorsements: data.requiredEndorsements && data.requiredEndorsements.length > 0 ? data.requiredEndorsements : null,
        licenseGateEnabled: data.licenseGateEnabled === true,
        cdlRequired: data.cdlRequired === true,
        requiredDocumentTypes: data.requiredDocumentTypes || [],
        blockStageIfDocsIncomplete: data.blockStageIfDocsIncomplete === true,
        listingDescription: data.listingDescription || null,
        accountId: data.accountId || null,
        roleType: data.roleType || "vehicle_movement",
        shuttleRouteType: data.roleType === "shuttle_driver" ? (data.shuttleRouteType || null) : null,
        availabilityPattern: data.availabilityPattern || null,
      };
      if (editingRequisition?.id) await saveReqDocTypes(editingRequisition.id);
      const res = await apiRequest("PATCH", `/api/corporate/recruiting/requisitions/${editingRequisition.id}`, payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update requisition");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/stats"] });
      toast({ title: "Requisition updated successfully" });
      setEditRequisitionDialogOpen(false);
      setEditingRequisition(null);
      editRequisitionForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update requisition", description: error.message, variant: "destructive" });
    },
  });

  const archiveRequisitionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/recruiting/requisitions/${id}/archive`, { reason: "Archived by admin" });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to archive requisition");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/stats"] });
      toast({ title: "Requisition archived successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to archive requisition", description: error.message, variant: "destructive" });
    },
  });

  const deleteRequisitionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/corporate/recruiting/requisitions/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete requisition");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/stats"] });
      toast({ title: "Requisition deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete requisition", description: error.message, variant: "destructive" });
    },
  });

  const createRequisitionMutation = useMutation({
    mutationFn: async (data: RequisitionForm) => {
      const payload: Record<string, unknown> = {
        title: data.title,
        department: data.department || null,
        location: data.location || null,
        employmentType: data.employmentType || "full_time",
        description: data.description || null,
        requirements: data.requirements || null,
        salaryMin: data.salaryMin || null,
        salaryMax: data.salaryMax || null,
        salaryType: data.salaryType || "annual",
        openings: typeof data.openings === "number" ? data.openings : 1,
        priority: data.priority || "normal",
        isRemote: data.isRemote === true,
        requiredLicenseClass: data.requiredLicenseClass && data.requiredLicenseClass !== 'none' ? data.requiredLicenseClass : null,
        requiredEndorsements: data.requiredEndorsements && data.requiredEndorsements.length > 0 ? data.requiredEndorsements : null,
        licenseGateEnabled: data.licenseGateEnabled === true,
        cdlRequired: data.cdlRequired === true,
        requiredDocumentTypes: data.requiredDocumentTypes || [],
        blockStageIfDocsIncomplete: data.blockStageIfDocsIncomplete === true,
        listingDescription: data.listingDescription || null,
        accountId: data.accountId || null,
        roleType: data.roleType || "vehicle_movement",
        shuttleRouteType: data.roleType === "shuttle_driver" ? (data.shuttleRouteType || null) : null,
        availabilityPattern: data.availabilityPattern || null,
      };
      const res = await apiRequest("POST", "/api/corporate/recruiting/requisitions", payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create requisition");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/stats"] });
      toast({ title: "Job requisition created successfully" });
      setRequisitionDialogOpen(false);
      requisitionForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create requisition", description: error.message, variant: "destructive" });
    },
  });

  const createCandidateMutation = useMutation({
    mutationFn: async (data: CandidateForm) => {
      const payload = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        address: data.address || null,
        addressLine2: data.addressLine2 || null,
        city: data.city || null,
        state: data.state ? data.state.toUpperCase() : null,
        zipCode: data.zipCode || null,
        dateOfBirth: data.dateOfBirth || null,
        currentEmployer: data.currentEmployer || null,
        preferredMarkets: data.preferredMarkets,
        yearsExperience: typeof data.yearsExperience === "number" && !isNaN(data.yearsExperience) 
          ? data.yearsExperience 
          : null,
        source: data.source || "recruiter_sourced",
        sourceDetails: data.source === "other" ? data.sourceDetails || null : null,
        notes: data.notes || null,
        licenseClass: data.licenseClass || null,
        licenseState: data.licenseState || null,
        endorsements: data.endorsements && data.endorsements.length > 0 ? data.endorsements : null,
        accessToVehicle: data.accessToVehicle ?? null,
        vehicleType: data.vehicleType || null,
        trailerAccess: data.trailerAccess ?? null,
        authorizedToWork: data.authorizedToWork ?? null,
        ableToDriveLongDistance: data.ableToDriveLongDistance ?? null,
        ableToEnterHighClearanceVehicles: data.ableToEnterHighClearanceVehicles ?? null,
        accommodationsRequired: data.accommodationsRequired || null,
        clientTypesExperience: data.clientTypesExperience && data.clientTypesExperience.length > 0 ? data.clientTypesExperience : null,
        yearsExperienceByCategory: data.yearsExperienceByCategory && Object.keys(data.yearsExperienceByCategory).length > 0 ? data.yearsExperienceByCategory : null,
        authorizationType: data.authorizationType || null,
        authorizationExpiration: data.authorizationExpiration ? new Date(data.authorizationExpiration).toISOString() : null,
        mvrYearsLicensed: typeof data.mvrYearsLicensed === "number" && !isNaN(data.mvrYearsLicensed) ? data.mvrYearsLicensed : null,
        mvrViolations3yr: typeof data.mvrViolations3yr === "number" && !isNaN(data.mvrViolations3yr) ? data.mvrViolations3yr : null,
        mvrViolations5yr: typeof data.mvrViolations5yr === "number" && !isNaN(data.mvrViolations5yr) ? data.mvrViolations5yr : null,
        mvrAtFaultAccidents: typeof data.mvrAtFaultAccidents === "number" && !isNaN(data.mvrAtFaultAccidents) ? data.mvrAtFaultAccidents : null,
        mvrDuiDwi: data.mvrDuiDwi ?? null,
      };
      const res = await fetch("/api/corporate/recruiting/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json();
        if (res.status === 409 && errorData.code === "DUPLICATE_CANDIDATE") {
          const dupError: any = new Error("DUPLICATE_CANDIDATE");
          dupError.code = "DUPLICATE_CANDIDATE";
          dupError.existingCandidate = errorData.existingCandidate;
          dupError.matchedOn = errorData.matchedOn;
          throw dupError;
        }
        throw new Error(errorData.message || "Failed to create candidate");
      }
      const candidate = await res.json();
      return candidate;
    },
    onSuccess: (candidate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
      toast({ title: "Candidate added successfully" });
      setCandidateDialogOpen(false);
      candidateForm.reset();
    },
    onError: (error: any) => {
      if (error.code === "DUPLICATE_CANDIDATE") {
        setDuplicateCandidateInfo({
          existingCandidate: error.existingCandidate,
          matchedOn: error.matchedOn,
        });
        setCandidateDialogOpen(false);
        setDuplicateCandidateDialogOpen(true);
        return;
      }
      toast({ title: "Failed to add candidate", description: error.message, variant: "destructive" });
    },
  });

  const filteredRequisitions = requisitions.filter((req) => {
    if (roleTypeFilter !== "all" && (req.roleType || "vehicle_movement") !== roleTypeFilter) return false;
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      req.title?.toLowerCase().includes(search) ||
      req.department?.toLowerCase().includes(search) ||
      req.location?.toLowerCase().includes(search)
    );
  });

  const filteredCandidates = candidates.filter((candidate) => {
    if (cdlFilter === "cdl_only" && !candidate.hasCommercialLicense) return false;
    if (cdlFilter === "non_cdl" && candidate.hasCommercialLicense) return false;
    if (cdlFilter === "cdl_a" && candidate.licenseClass !== "A") return false;
    if (cdlFilter === "cdl_b" && candidate.licenseClass !== "B") return false;
    if (cdlFilter === "cdl_c" && candidate.licenseClass !== "C") return false;
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const fullName = `${candidate.firstName} ${candidate.lastName}`.toLowerCase();
    return (
      fullName.includes(search) ||
      candidate.email?.toLowerCase().includes(search) ||
      candidate.phone?.toLowerCase().includes(search) ||
      candidate.address?.toLowerCase().includes(search) ||
      candidate.city?.toLowerCase().includes(search)
    );
  });

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase();
  };

  if (detailId && tabFromPath === "candidates") {
    return <CandidateDetailView candidateId={detailId} onBack={() => setLocation("/recruiting/candidates")} />;
  }

  if (detailId && tabFromPath === "requisitions") {
    return <RequisitionDetailView requisitionId={detailId} onBack={() => setLocation("/recruiting/requisitions")} />;
  }

  if (detailId && tabFromPath === "applications") {
    return <ApplicationDetailView applicationId={detailId} onBack={() => setLocation("/recruiting/applications")} />;
  }

  return (
    <div className="-mx-3 sm:-mx-4 md:-mx-6 -mt-4 sm:-mt-6 bg-[#f7f8fc] dark:bg-background min-h-screen" data-ipad-module="recruiting">

      {/* ── Sticky zone: page header ── */}
      <div className="sticky top-0 z-50 bg-background">
        <div className="border-b border-border px-6 py-3">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#182039] dark:text-foreground leading-none" data-testid="text-page-title">Recruiting</h1>
              <p className="text-sm text-muted-foreground mt-0.5 leading-none">
                Manage job postings, candidates, and the hiring pipeline
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Link href="/recruiting/import">
            <Button variant="outline" data-testid="button-import-candidates">
              <Upload className="mr-2 h-4 w-4" />
              Import Candidates
            </Button>
          </Link>
          <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-export-data">
                <Download className="mr-2 h-4 w-4" />
                Export Data
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md" data-testid="dialog-export-data">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Export Recruiting Data
                </DialogTitle>
                <DialogDescription>
                  Export data for audits, legal discovery, or compliance requirements. All exports are watermarked and logged.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Export Type</Label>
                  <Select value={exportType} onValueChange={setExportType}>
                    <SelectTrigger data-testid="select-export-type">
                      <SelectValue placeholder="Select export type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="candidates">Candidate List</SelectItem>
                      <SelectItem value="applications">Application Pipeline</SelectItem>
                      <SelectItem value="audit_log">Audit Log</SelectItem>
                      <SelectItem value="document_metadata">Document Metadata</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {exportType === 'candidates' && 'Export all candidates with contact info, source, and status'}
                    {exportType === 'applications' && 'Export applications with candidate info, stages, and disposition'}
                    {exportType === 'audit_log' && 'Export recruiting audit trail with actions and changes'}
                    {exportType === 'document_metadata' && 'Export document records (no file content)'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Reason for Export (Optional)</Label>
                  <Textarea 
                    placeholder="e.g., Insurance audit, legal discovery, compliance review..."
                    value={exportReason}
                    onChange={(e) => setExportReason(e.target.value)}
                    className="resize-none"
                    rows={2}
                    data-testid="input-export-reason"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleExportData} 
                  disabled={isExporting || !exportType}
                  data-testid="button-confirm-export"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Export CSV
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {canImport && (
          <>
          <Button variant="outline" onClick={() => setCsvImportOpen(true)} data-testid="button-import-csv">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <CsvImportDialog open={csvImportOpen} onOpenChange={setCsvImportOpen} />
          </>
          )}
          <Dialog open={candidateDialogOpen} onOpenChange={setCandidateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-add-candidate">
                <UserSearch className="mr-2 h-4 w-4" />
                Add Candidate
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Candidate</DialogTitle>
                <DialogDescription>Create the Candidate record first. Applications and questionnaire information are handled separately.</DialogDescription>
              </DialogHeader>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription><strong>Required:</strong> First name, last name, email, phone, and recruiting market. All other fields are optional.</AlertDescription>
              </Alert>
              <Form {...candidateForm}>
                <form onSubmit={candidateForm.handleSubmit((data) => createCandidateMutation.mutate(data))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={candidateForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name <span className="text-destructive">(Required)</span></FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-candidate-firstname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={candidateForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name <span className="text-destructive">(Required)</span></FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-candidate-lastname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={candidateForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email <span className="text-destructive">(Required)</span></FormLabel>
                          <FormControl>
                            <Input type="email" {...field} data-testid="input-candidate-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={candidateForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone <span className="text-destructive">(Required)</span></FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-candidate-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={candidateForm.control}
                    name="preferredMarkets"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recruiting Market <span className="text-destructive">(Required)</span></FormLabel>
                        <Select onValueChange={(value) => field.onChange([value])} value={field.value?.[0] || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-candidate-market">
                              <SelectValue placeholder="Select a market" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {MARKET_VALUES.map(market => <SelectItem key={market} value={market}>{market}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div
                    className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground py-1"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    data-testid="button-toggle-advanced"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                    {showAdvanced ? "Hide Advanced Fields" : "Show Advanced Fields"}
                  </div>
                  {showAdvanced && (
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={candidateForm.control}
                          name="dateOfBirth"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Date of Birth</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} data-testid="input-candidate-date-of-birth" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={candidateForm.control}
                          name="currentEmployer"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Current Employer</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-candidate-employer" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={candidateForm.control}
                          name="yearsExperience"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Years Experience</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  min={0}
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                                  value={field.value ?? ""}
                                  data-testid="input-candidate-experience" 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={candidateForm.control}
                          name="source"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Source</FormLabel>
                              <Select onValueChange={(value) => {
                                field.onChange(value);
                                if (value !== "other") candidateForm.setValue("sourceDetails", "");
                              }} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-candidate-source">
                                    <SelectValue placeholder="Select source" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {CANDIDATE_SOURCE_OPTIONS.filter(opt => opt.value !== "direct").map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      {candidateForm.watch("source") === "other" && (
                        <FormField
                          control={candidateForm.control}
                          name="sourceDetails"
                          rules={{ required: "Identify the actual source" }}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Other Source <span className="text-destructive">(Required)</span></FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., Local Facebook Group" {...field} data-testid="input-candidate-other-source" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={candidateForm.control}
                          name="address"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Street Address</FormLabel>
                              <FormControl><Input {...field} data-testid="input-candidate-address" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={candidateForm.control}
                          name="addressLine2"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Address Line 2</FormLabel>
                              <FormControl><Input {...field} data-testid="input-candidate-address-line-2" /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <FormField control={candidateForm.control} name="city" render={({ field }) => <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} data-testid="input-candidate-city" /></FormControl><FormMessage /></FormItem>} />
                        <FormField control={candidateForm.control} name="state" render={({ field }) => <FormItem><FormLabel>State</FormLabel><FormControl><Input maxLength={2} {...field} data-testid="input-candidate-state" /></FormControl><FormMessage /></FormItem>} />
                        <FormField control={candidateForm.control} name="zipCode" render={({ field }) => <FormItem><FormLabel>ZIP</FormLabel><FormControl><Input {...field} data-testid="input-candidate-zip" /></FormControl><FormMessage /></FormItem>} />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={candidateForm.control}
                          name="licenseClass"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>License Class</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-candidate-license-class">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  <SelectItem value="A">Class A</SelectItem>
                                  <SelectItem value="B">Class B</SelectItem>
                                  <SelectItem value="C">Class C</SelectItem>
                                  <SelectItem value="Non-CDL">Non-CDL</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={candidateForm.control}
                          name="licenseState"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>License State</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., TX" {...field} data-testid="input-candidate-license-state" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={candidateForm.control}
                          name="endorsements"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Endorsements</FormLabel>
                              <p className="text-xs text-muted-foreground">Select any known CDL endorsements. Leave blank when not yet known.</p>
                              <div className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-3" data-testid="input-candidate-endorsements">
                                {[
                                  { value: "H", label: "H — Hazmat" },
                                  { value: "N", label: "N — Tank" },
                                  { value: "P", label: "P — Passenger" },
                                  { value: "T", label: "T — Double/Triple" },
                                  { value: "X", label: "X — Hazmat + Tank" },
                                  { value: "S", label: "S — School Bus" },
                                ].map(option => (
                                  <label key={option.value} className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                      checked={(field.value || []).includes(option.value)}
                                      onCheckedChange={(checked) => field.onChange(
                                        checked
                                          ? [...(field.value || []), option.value]
                                          : (field.value || []).filter(value => value !== option.value),
                                      )}
                                    />
                                    {option.label}
                                  </label>
                                ))}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={candidateForm.control}
                          name="accessToVehicle"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                              <div className="space-y-0.5">
                                <FormLabel>Has Vehicle</FormLabel>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value || false}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-candidate-vehicle-access"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={candidateForm.control}
                          name="vehicleType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Vehicle Type</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-candidate-vehicle-type">
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="sedan">Sedan</SelectItem>
                                  <SelectItem value="suv">SUV</SelectItem>
                                  <SelectItem value="truck">Truck</SelectItem>
                                  <SelectItem value="van">Van</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={candidateForm.control}
                          name="trailerAccess"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                              <div className="space-y-0.5">
                                <FormLabel>Trailer Access</FormLabel>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value || false}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-candidate-trailer-access"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={candidateForm.control}
                          name="authorizedToWork"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                              <div className="space-y-0.5">
                                <FormLabel>Authorized to Work</FormLabel>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value || false}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-candidate-authorized-to-work"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={candidateForm.control}
                          name="authorizationType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Authorization Type</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-candidate-authorization-type">
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="citizen">U.S. Citizen</SelectItem>
                                  <SelectItem value="permanent_resident">Permanent Resident</SelectItem>
                                  <SelectItem value="work_visa">Work Visa</SelectItem>
                                  <SelectItem value="ead">EAD</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={candidateForm.control}
                          name="authorizationExpiration"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Authorization Expiration</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} data-testid="input-candidate-authorization-expiration" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Physical Capability Declarations</h4>
                        <p className="text-xs text-muted-foreground">Informational only. Not medical data. No automatic gating.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={candidateForm.control}
                          name="ableToDriveLongDistance"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                              <div className="space-y-0.5">
                                <FormLabel>Able to Drive Long Distance</FormLabel>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value || false}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-candidate-long-distance"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={candidateForm.control}
                          name="ableToEnterHighClearanceVehicles"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                              <div className="space-y-0.5">
                                <FormLabel>Able to Enter High-Clearance Vehicles</FormLabel>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value || false}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-candidate-high-clearance"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={candidateForm.control}
                        name="accommodationsRequired"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Accommodations Required</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Describe any accommodations needed..."
                                className="resize-none"
                                {...field}
                                value={field.value || ""}
                                data-testid="textarea-candidate-accommodations"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Client Experience</h4>
                        <p className="text-xs text-muted-foreground">Optional prior client-type experience.</p>
                      </div>
                      <div className="space-y-3">
                        <FormField
                          control={candidateForm.control}
                          name="clientTypesExperience"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Client Types</FormLabel>
                              <div className="flex flex-wrap gap-2">
                                {CLIENT_TYPE_OPTIONS.map((ct) => {
                                  const selected = (field.value || []).includes(ct.value);
                                  return (
                                    <Badge
                                      key={ct.value}
                                      variant={selected ? "default" : "outline"}
                                      className="cursor-pointer toggle-elevate"
                                      data-testid={`badge-client-type-${ct.value}`}
                                      onClick={() => {
                                        const current = field.value || [];
                                        field.onChange(
                                          selected
                                            ? current.filter((v: string) => v !== ct.value)
                                            : [...current, ct.value]
                                        );
                                      }}
                                    >
                                      <Handshake className="h-3 w-3 mr-1" />
                                      {ct.label}
                                    </Badge>
                                  );
                                })}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={candidateForm.control}
                          name="yearsExperienceByCategory"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Years Experience by Category</FormLabel>
                              <div className="grid grid-cols-2 gap-3">
                                {EXPERIENCE_CATEGORY_OPTIONS.map((cat) => {
                                  const currentVal = (field.value || {} as Record<string, number>)[cat.value];
                                  return (
                                    <div key={cat.value} className="flex items-center gap-2">
                                      <span className="text-sm min-w-[100px]">{cat.label}</span>
                                      <Input
                                        type="number"
                                        min="0"
                                        step="1"
                                        placeholder="0"
                                        value={currentVal ?? ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const current = { ...(field.value || {}) } as Record<string, number | undefined>;
                                          if (val === "" || val === undefined) {
                                            delete current[cat.value];
                                          } else {
                                            current[cat.value] = parseInt(val, 10);
                                          }
                                          field.onChange(Object.keys(current).length > 0 ? current : undefined);
                                        }}
                                        data-testid={`input-experience-years-${cat.value}`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Driving Record Summary (MVR)</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={candidateForm.control}
                            name="mvrYearsLicensed"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Years Licensed</FormLabel>
                                <FormControl>
                                  <Input type="number" min="0" placeholder="0" {...field} value={field.value ?? ""} data-testid="input-candidate-mvr-years-licensed" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={candidateForm.control}
                            name="mvrAtFaultAccidents"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>At-Fault Accidents</FormLabel>
                                <FormControl>
                                  <Input type="number" min="0" placeholder="0" {...field} value={field.value ?? ""} data-testid="input-candidate-mvr-at-fault-accidents" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={candidateForm.control}
                            name="mvrViolations3yr"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Violations (Last 3 Years)</FormLabel>
                                <FormControl>
                                  <Input type="number" min="0" placeholder="0" {...field} value={field.value ?? ""} data-testid="input-candidate-mvr-violations-3yr" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={candidateForm.control}
                            name="mvrViolations5yr"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Violations (Last 5 Years)</FormLabel>
                                <FormControl>
                                  <Input type="number" min="0" placeholder="0" {...field} value={field.value ?? ""} data-testid="input-candidate-mvr-violations-5yr" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={candidateForm.control}
                          name="mvrDuiDwi"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                              <div className="space-y-0.5">
                                <FormLabel>DUI/DWI on Record</FormLabel>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value || false}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-candidate-mvr-dui-dwi"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={candidateForm.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes</FormLabel>
                            <FormControl>
                              <Textarea {...field} data-testid="input-candidate-notes" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                  <DialogFooter>
                    <Button type="submit" disabled={createCandidateMutation.isPending} data-testid="button-submit-candidate">
                      {createCandidateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Add Candidate
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Button data-testid="button-create-requisition" onClick={() => setRequestFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Recruiting Request Form
          </Button>

          <Dialog open={editRequisitionDialogOpen} onOpenChange={(open) => { setEditRequisitionDialogOpen(open); if (!open) setEditingRequisition(null); }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Job Requisition</DialogTitle>
                <DialogDescription>Update the requisition details</DialogDescription>
              </DialogHeader>
              <Form {...editRequisitionForm}>
                <form onSubmit={editRequisitionForm.handleSubmit((data) => updateRequisitionMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={editRequisitionForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Job Title</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Driver, CDL-A Driver" {...field} data-testid="input-edit-requisition-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editRequisitionForm.control}
                    name="accountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Name</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-requisition-account">
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {activeCustomers
                              .filter((c: any) => String(c.status || "").toLowerCase() === "active")
                              .map((c: any) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name || c.customerName}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {activeCustomersError && (
                          <p className="text-xs text-destructive flex items-center gap-1.5 mt-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Account discovery is unavailable.{" "}
                            <button
                              type="button"
                              className="underline font-medium"
                              onClick={() => refetchActiveCustomers()}
                            >
                              Retry
                            </button>
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editRequisitionForm.control}
                      name="department"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Department</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Operations" {...field} data-testid="input-edit-requisition-department" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editRequisitionForm.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Dallas, TX" {...field} data-testid="input-edit-requisition-location" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editRequisitionForm.control}
                      name="employmentType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Employment Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-requisition-employment-type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="full_time">Full-Time</SelectItem>
                              <SelectItem value="part_time">Part-Time</SelectItem>
                              <SelectItem value="contract">Contract</SelectItem>
                              <SelectItem value="temporary">Temporary</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editRequisitionForm.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-requisition-priority">
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={editRequisitionForm.control}
                      name="salaryType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pay Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-requisition-salary-type">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="annual">Annual</SelectItem>
                              <SelectItem value="hourly">Hourly</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editRequisitionForm.control}
                      name="salaryMin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{editRequisitionForm.watch("salaryType") === "hourly" ? "Hourly Pay Min" : "Salary Min"}</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder={editRequisitionForm.watch("salaryType") === "hourly" ? "18" : "40000"} {...field} data-testid="input-edit-requisition-salary-min" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editRequisitionForm.control}
                      name="salaryMax"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{editRequisitionForm.watch("salaryType") === "hourly" ? "Hourly Pay Max" : "Salary Max"}</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder={editRequisitionForm.watch("salaryType") === "hourly" ? "25" : "60000"} {...field} data-testid="input-edit-requisition-salary-max" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editRequisitionForm.control}
                      name="openings"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Number of Openings</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min={1} 
                              {...field} 
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                              data-testid="input-edit-requisition-openings" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editRequisitionForm.control}
                      name="isRemote"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Remote Position</FormLabel>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-edit-requisition-remote"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  {/* ── Ticket 26: Driver Role Type (edit form) ── */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editRequisitionForm.control}
                      name="roleType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Driver Role Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "vehicle_movement"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-requisition-role-type">
                                <SelectValue placeholder="Select role type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="vehicle_movement">Vehicle Movement Driver</SelectItem>
                              <SelectItem value="shuttle_driver">Shuttle Driver</SelectItem>
                              <SelectItem value="dispatcher">Dispatcher</SelectItem>
                              <SelectItem value="fleet_lead">Fleet Lead</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editRequisitionForm.control}
                      name="availabilityPattern"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Availability Expectation</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "standard"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-requisition-availability">
                                <SelectValue placeholder="Select pattern" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="standard">Standard (M-F, day shift)</SelectItem>
                              <SelectItem value="split_shift">Split Shifts</SelectItem>
                              <SelectItem value="weekends_required">Weekends Required</SelectItem>
                              <SelectItem value="flexible">Flexible / Any Shift</SelectItem>
                              <SelectItem value="on_call">On-Call</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {editRequisitionForm.watch("roleType") === "shuttle_driver" && (
                    <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-4 space-y-3">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Shuttle Driver — Additional Details</p>
                      <FormField
                        control={editRequisitionForm.control}
                        name="shuttleRouteType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Route Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-edit-requisition-shuttle-route">
                                  <SelectValue placeholder="Select route type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="airport">Airport Shuttle</SelectItem>
                                <SelectItem value="hotel">Hotel / Resort Shuttle</SelectItem>
                                <SelectItem value="corporate">Corporate Campus Shuttle</SelectItem>
                                <SelectItem value="campus">University / Campus Shuttle</SelectItem>
                                <SelectItem value="transit">Fixed-Route Transit</SelectItem>
                                <SelectItem value="paratransit">Paratransit / ADA</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                  <FormField
                    control={editRequisitionForm.control}
                    name="cdlRequired"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>CDL Position</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            This role requires a Commercial Driver License (CDL-A, B, or C)
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {field.value && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              data-testid="button-edit-apply-cdl-defaults"
                              onClick={() => {
                                const current = editRequisitionForm.getValues("requiredDocumentTypes") || [];
                                const cdlDocs = ["cdl_copy", "mvr_report", "medical_card", "drug_test", "dot_physical"];
                                const merged = Array.from(new Set([...current, ...cdlDocs]));
                                editRequisitionForm.setValue("requiredDocumentTypes", merged);
                                if (!editRequisitionForm.getValues("requiredLicenseClass") || editRequisitionForm.getValues("requiredLicenseClass") === "none") {
                                  editRequisitionForm.setValue("requiredLicenseClass", "A");
                                }
                                editRequisitionForm.setValue("licenseGateEnabled", true);
                              }}
                            >
                              Apply CDL Defaults
                            </Button>
                          )}
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-edit-requisition-cdl-required"
                            />
                          </FormControl>
                        </div>
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editRequisitionForm.control}
                      name="requiredLicenseClass"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Required License Class</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-requisition-license-class">
                                <SelectValue placeholder="No requirement" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No requirement</SelectItem>
                              <SelectItem value="A">Class A (CDL-A)</SelectItem>
                              <SelectItem value="B">Class B (CDL-B)</SelectItem>
                              <SelectItem value="C">Class C (CDL-C)</SelectItem>
                              <SelectItem value="Non-CDL">Non-CDL</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editRequisitionForm.control}
                      name="licenseGateEnabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>License Gate</FormLabel>
                            <p className="text-sm text-muted-foreground">Block transitions if license doesn't match</p>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-edit-requisition-license-gate"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={editRequisitionForm.control}
                    name="requiredEndorsements"
                    render={() => (
                      <FormItem>
                        <FormLabel>Required Endorsements</FormLabel>
                        <div className="flex flex-wrap gap-3">
                          {[
                            { value: "H", label: "H - Hazmat" },
                            { value: "N", label: "N - Tank" },
                            { value: "P", label: "P - Passenger" },
                            { value: "T", label: "T - Double/Triple" },
                            { value: "X", label: "X - Hazmat+Tank" },
                            { value: "S", label: "S - School Bus" },
                          ].map((endorsement) => (
                            <FormField
                              key={endorsement.value}
                              control={editRequisitionForm.control}
                              name="requiredEndorsements"
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(endorsement.value)}
                                      onCheckedChange={(checked) => {
                                        const current = field.value || [];
                                        field.onChange(
                                          checked
                                            ? [...current, endorsement.value]
                                            : current.filter((v: string) => v !== endorsement.value)
                                        );
                                      }}
                                      data-testid={`checkbox-edit-endorsement-${endorsement.value}`}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    {endorsement.label}
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editRequisitionForm.control}
                    name="requiredDocumentTypes"
                    render={() => (
                      <FormItem>
                        <FormLabel>Required Document Types</FormLabel>
                        <p className="text-sm text-muted-foreground mb-2">Select documents required for this position</p>
                        <div className="flex flex-wrap gap-3" data-testid="checkbox-group-edit-required-doc-types">
                          {["drivers_license","drug_test","background_consent","proof_of_insurance","medical_card","dot_physical","w9","direct_deposit_form","vehicle_registration","cdl_copy","mvr_report"].map((docType) => (
                            <FormField
                              key={docType}
                              control={editRequisitionForm.control}
                              name="requiredDocumentTypes"
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(docType)}
                                      onCheckedChange={(checked) => {
                                        const current = field.value || [];
                                        field.onChange(
                                          checked
                                            ? [...current, docType]
                                            : current.filter((v: string) => v !== docType)
                                        );
                                      }}
                                      data-testid={`checkbox-edit-req-doc-${docType}`}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    {docType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editRequisitionForm.control}
                    name="blockStageIfDocsIncomplete"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Document Gate</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Block stage transitions if required documents are incomplete
                          </p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-edit-requisition-doc-gate"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editRequisitionForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Job Description</FormLabel>
                        <FormControl>
                          <Textarea rows={4} placeholder="Describe the role and responsibilities..." {...field} data-testid="input-edit-requisition-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editRequisitionForm.control}
                    name="requirements"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Requirements</FormLabel>
                        <FormControl>
                          <Textarea rows={3} placeholder="List qualifications and requirements..." {...field} data-testid="input-edit-requisition-requirements" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editRequisitionForm.control}
                    name="listingDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Listing Description</FormLabel>
                        <FormControl>
                          <Textarea rows={4} placeholder="Public-facing description for job boards..." {...field} data-testid="input-edit-requisition-listing-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-3 border-t pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-sm font-medium">Required Documents</Label>
                      <Badge variant="outline">{reqDocTypes.length} configured</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Configure which documents are required for applicants to this requisition.</p>

                    {reqDocTypesLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</div>
                    ) : (
                      <>
                        {reqDocTypes.length > 0 && (
                          <div className="space-y-2" data-testid="list-required-doc-types">
                            {reqDocTypes.map((dt, idx) => (
                              <div key={idx} className="flex flex-wrap items-center gap-2 p-2 border rounded-md" data-testid={`item-required-doc-${idx}`}>
                                <span className="text-sm font-medium flex-1 min-w-[120px]">{dt.label || dt.docType}</span>
                                <label className="flex items-center gap-1 text-xs">
                                  <input type="checkbox" checked={dt.required} onChange={(e) => {
                                    const updated = [...reqDocTypes]; updated[idx] = { ...dt, required: e.target.checked }; setReqDocTypes(updated);
                                  }} data-testid={`checkbox-req-doc-required-${idx}`} />
                                  Required
                                </label>
                                <label className="flex items-center gap-1 text-xs">
                                  <input type="checkbox" checked={dt.blockStageProgression} onChange={(e) => {
                                    const updated = [...reqDocTypes]; updated[idx] = { ...dt, blockStageProgression: e.target.checked }; setReqDocTypes(updated);
                                  }} data-testid={`checkbox-req-doc-block-${idx}`} />
                                  Blocks Stage
                                </label>
                                <label className="flex items-center gap-1 text-xs">
                                  <input type="checkbox" checked={dt.expirationRequired} onChange={(e) => {
                                    const updated = [...reqDocTypes]; updated[idx] = { ...dt, expirationRequired: e.target.checked }; setReqDocTypes(updated);
                                  }} data-testid={`checkbox-req-doc-expiration-${idx}`} />
                                  Exp. Required
                                </label>
                                <Button type="button" variant="ghost" size="icon" onClick={() => {
                                  setReqDocTypes(reqDocTypes.filter((_, i) => i !== idx));
                                }} data-testid={`button-remove-req-doc-${idx}`}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="e.g. Driver License, MVR, W-9..."
                            value={newDocType}
                            onChange={(e) => setNewDocType(e.target.value)}
                            className="flex-1"
                            data-testid="input-new-required-doc-type"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newDocType.trim()) {
                                e.preventDefault();
                                if (!reqDocTypes.find(d => d.docType === newDocType.trim())) {
                                  setReqDocTypes([...reqDocTypes, { docType: newDocType.trim(), label: newDocType.trim(), required: true, blockStageProgression: false, expirationRequired: false }]);
                                }
                                setNewDocType("");
                              }
                            }}
                          />
                          <Button type="button" variant="outline" size="sm" onClick={() => {
                            if (newDocType.trim() && !reqDocTypes.find(d => d.docType === newDocType.trim())) {
                              setReqDocTypes([...reqDocTypes, { docType: newDocType.trim(), label: newDocType.trim(), required: true, blockStageProgression: false, expirationRequired: false }]);
                              setNewDocType("");
                            }
                          }} data-testid="button-add-required-doc-type">Add</Button>
                        </div>
                      </>
                    )}
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => { setEditRequisitionDialogOpen(false); setEditingRequisition(null); }} data-testid="button-cancel-edit-requisition">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateRequisitionMutation.isPending} data-testid="button-save-requisition">
                      {updateRequisitionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
            </div>
          </div>
        </div>{/* /border-b header */}
      </div>{/* /sticky zone */}

      {/* ── Page content ── */}
      <div className="px-6 pt-5 pb-6 space-y-4">

      <Dialog open={duplicateCandidateDialogOpen} onOpenChange={(open) => { setDuplicateCandidateDialogOpen(open); if (!open) setDuplicateCandidateInfo(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Duplicate Candidate Detected
            </DialogTitle>
            <DialogDescription>
              A candidate with matching {duplicateCandidateInfo?.matchedOn?.join(" and ")} already exists in the system.
            </DialogDescription>
          </DialogHeader>
          {duplicateCandidateInfo?.existingCandidate && (
            <Card data-testid="card-existing-candidate">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Existing Candidate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  <span data-testid="text-existing-candidate-name">
                    {duplicateCandidateInfo.existingCandidate.firstName} {duplicateCandidateInfo.existingCandidate.lastName}
                  </span>
                </div>
                {duplicateCandidateInfo.existingCandidate.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground" data-testid="text-existing-candidate-email">{duplicateCandidateInfo.existingCandidate.email}</span>
                    {duplicateCandidateInfo.matchedOn?.includes("email") && (
                      <Badge variant="outline" className="text-xs text-amber-600">Match</Badge>
                    )}
                  </div>
                )}
                {duplicateCandidateInfo.existingCandidate.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground" data-testid="text-existing-candidate-phone">{formatPhone(duplicateCandidateInfo.existingCandidate.phone)}</span>
                    {duplicateCandidateInfo.matchedOn?.includes("phone") && (
                      <Badge variant="outline" className="text-xs text-amber-600">Match</Badge>
                    )}
                  </div>
                )}
                {duplicateCandidateInfo.existingCandidate.status && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{duplicateCandidateInfo.existingCandidate.status}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="default"
              className="w-full justify-start"
              data-testid="button-open-existing-profile"
              onClick={() => {
                setDuplicateCandidateDialogOpen(false);
                setDuplicateCandidateInfo(null);
                candidateForm.reset();
                setActiveTab("candidates");
              }}
            >
              <Eye className="h-4 w-4 mr-2" />
              Open Existing Profile
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              data-testid="button-cancel-duplicate"
              onClick={() => { setDuplicateCandidateDialogOpen(false); setDuplicateCandidateInfo(null); }}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pause Status & SLA Alert Banners */}
      <PauseStatusBanner />
      <SlaEscalationsPanel isAdmin={true} />

      {/* ── 4-widget compact KPI row ─────────────────────────────────────── */}
      {(() => {
        // Value renderer: spinner while loading, "Unable to calculate" on API error, value otherwise
        const StatVal = ({ v, testId }: { v: number | undefined; testId?: string }) => {
          if (statsLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
          if (statsError)   return <span className="text-[10px] text-destructive leading-none">Unable to calculate</span>;
          return <span data-testid={testId} className="text-[22px] font-bold leading-none tabular-nums">{v ?? 0}</span>;
        };

        // Compact sub-line (IC / Emp split or footer note)
        const Sub = ({ children }: { children: React.ReactNode }) => (
          <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-none">{children}</p>
        );

        // Tooltip label
        const TipLabel = ({ label, tip }: { label: string; tip: string }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-1.5 flex items-center gap-0.5 cursor-default w-fit">
                {label}
                <Info className="h-2.5 w-2.5 shrink-0 opacity-50" />
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px] text-xs">{tip}</TooltipContent>
          </Tooltip>
        );

        // Per-metric timestamp — shown below the manual widget value
        const MetricTimestamp = ({ updatedAt, updatedByName }: { updatedAt?: string | null; updatedByName?: string | null }) => {
          if (statsLoading || (!updatedAt && !updatedByName)) return null;
          const ts = updatedAt ? (() => {
            try {
              return new Date(updatedAt).toLocaleString("en-US", {
                month: "short", day: "numeric", year: "numeric",
                hour: "numeric", minute: "2-digit",
              });
            } catch { return null; }
          })() : null;
          return (
            <p className="text-[9px] text-muted-foreground/60 mt-1 leading-tight truncate">
              Updated {ts}{ts && updatedByName ? " · " : ""}{updatedByName ?? ""}
            </p>
          );
        };

        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">

            {/* 1. Active Campaigns */}
            <Card className="py-0">
              <CardContent className="px-3 py-3">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <TipLabel label="ACTIVE CAMPAIGNS" tip="Count of recruiting campaigns currently in Active status. Excludes Pending Approval, Paused, Cancelled, and Closed." />
                    <StatVal v={stats?.totalActiveCampaigns} testId="stat-total-active" />
                  </div>
                  <Activity className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                </div>
              </CardContent>
            </Card>

            {/* 2. Drivers Needed */}
            <Card className="py-0">
              <CardContent className="px-3 py-3">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <TipLabel label="DRIVERS NEEDED" tip="Sum of Target Drivers across all Active campaigns. Does not include Pending, Paused, Closed, Completed, Cancelled, or Archived." />
                    <StatVal v={stats?.openPositions} testId="stat-open-positions" />
                    {!statsLoading && !statsError && (
                      <Sub>IC: {stats?.openPositionsIc ?? 0} · Emp: {stats?.openPositionsEmployee ?? 0}</Sub>
                    )}
                  </div>
                  <Briefcase className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                </div>
              </CardContent>
            </Card>

            {/* 3. Closed Campaigns Since Baseline */}
            <Card className="py-0">
              <CardContent className="px-3 py-3">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <TipLabel label="CLOSED CAMPAIGNS" tip="Campaigns that transitioned to Closed status since the Recruiting reporting baseline date. Cancelled campaigns are excluded. Legacy Completed campaigns count as Closed." />
                    <StatVal v={stats?.totalClosedYtd} testId="stat-total-closed-ytd" />
                    {!statsLoading && !statsError && stats?.reportingBaseline && (
                      <Sub>Since {new Date(stats.reportingBaseline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</Sub>
                    )}
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                </div>
              </CardContent>
            </Card>

            {/* 4. Drivers Hired — Rolling 45-Day (DH-002165) */}
            <Card
              className="py-0 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setShowHired45Dialog(true)}
              data-testid="card-hired-45"
            >
              <CardContent className="px-3 py-3">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <TipLabel
                      label="DRIVERS HIRED · LAST 45 DAYS"
                      tip="Count of unique drivers linked to Recruiting Campaigns whose Activation Date falls within the rolling last 45 calendar days. Based on campaign-driver relationships (DH-002142). Click to see the driver detail list."
                    />
                    {hired45Loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : hired45Error ? (
                      <span className="text-[10px] text-destructive leading-none">Unable to calculate</span>
                    ) : (
                      <span data-testid="stat-hired-45" className="text-[22px] font-bold leading-none tabular-nums">
                        {hired45Data?.total ?? 0}
                      </span>
                    )}
                    {!hired45Loading && !hired45Error && (
                      <Sub>IC: {hired45Data?.icCount ?? 0} · Emp: {hired45Data?.employeeCount ?? 0}</Sub>
                    )}
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                </div>
                {!hired45Loading && !hired45Error && (
                  <Sub>Rolling 45-day window · click to view</Sub>
                )}
              </CardContent>
            </Card>

          </div>
        );
      })()}

      {/* ── Drivers Hired Last 45 Days — Click-Through Dialog (DH-002165) ── */}
      <Dialog open={showHired45Dialog} onOpenChange={(v) => !v && setShowHired45Dialog(false)}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Drivers Hired — Last 45 Days
              {hired45Data && (
                <span className="text-muted-foreground font-normal text-sm ml-1">
                  ({hired45Data.total} unique driver{hired45Data.total !== 1 ? "s" : ""} · IC: {hired45Data.icCount} · Emp: {hired45Data.employeeCount})
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Drivers linked to Recruiting Campaigns whose Activation Date falls within the rolling 45-day window. Terminated or inactive drivers remain counted if they were activated within the window.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {hired45Loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : hired45Error ? (
              <div className="text-center py-8 text-destructive text-sm">
                Unable to calculate — data unavailable.
              </div>
            ) : !hired45Data?.drivers?.length ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No drivers were activated in the last 45 days.<br />
                <span className="text-xs">Drivers appear here once linked to a Recruiting Campaign.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-muted/40 border-b border-border sticky top-0">
                    <tr>
                      {["Driver", "ID", "Account / Market", "Campaign", "Classification", "Type", "Employment", "Activation Date", "Status", "Days Since"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(hired45Data.drivers as any[]).map((d) => {
                      const classification = d.currentDriverClassification ?? null;
                      const classLabel = classification
                        ? classification.toLowerCase().includes("employee") ? "Employee" : "IC"
                        : "—";
                      const typeLabel = d.currentDriverType
                        ? d.currentDriverType === "driver_shift" ? "DriverShift"
                          : d.currentDriverType === "driver_dash" ? "DriverDash"
                          : d.currentDriverType
                        : "—";
                      return (
                        <tr key={d.driverId} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2">
                            <Link href={`/drivers/${d.driverId}`} onClick={() => setShowHired45Dialog(false)}
                              className="text-primary hover:underline font-medium">
                              {d.displayName}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{d.employeeId ?? "—"}</td>
                          <td className="px-3 py-2 text-xs">
                            {d.dealershipName ? (
                              <span className="font-medium">{d.dealershipName}</span>
                            ) : "—"}
                            {d.market && (
                              <span className="block text-muted-foreground">{d.market}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {d.campaignDbId ? (
                              <Link href={`/recruiting/campaigns/${d.campaignDbId}`} onClick={() => setShowHired45Dialog(false)}
                                className="text-primary hover:underline">
                                {d.campaignName ?? "View Campaign"}
                              </Link>
                            ) : (d.campaignName ?? "—")}
                          </td>
                          <td className="px-3 py-2">{classLabel}</td>
                          <td className="px-3 py-2">{typeLabel}</td>
                          <td className="px-3 py-2">{d.currentEmploymentType ?? "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {d.activationDate
                              ? new Date(d.activationDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                              : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {d.currentStatus ? (
                              <Badge variant="outline" className="text-[11px]">{d.currentStatus}</Badge>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-center">
                            {d.daysSinceActivation != null ? d.daysSinceActivation : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Per-metric Manual Metrics Edit Dialog */}
      {(() => {
        type MetricTarget = "candidates" | "interviews" | "hired" | "hired_ytd";
        const cfg: Record<MetricTarget, { title: string; tip: string; icTestId: string; empTestId: string }> = {
          candidates: {
            title: "Update Total Candidates",
            tip: "Manual entry — IC + Employee counts are summed for the displayed total.",
            icTestId: "input-candidates-ic", empTestId: "input-candidates-employee",
          },
          interviews: {
            title: "Update Pending Interviews",
            tip: "Manual entry — update when interview pipeline data changes.",
            icTestId: "input-interviews-ic", empTestId: "input-interviews-employee",
          },
          hired: {
            title: "Update Hired This Month",
            tip: "Current calendar month only. Prior months are preserved automatically.",
            icTestId: "input-hired-ic", empTestId: "input-hired-employee",
          },
          hired_ytd: {
            title: "Update Drivers Hired YTD",
            tip: "Actual drivers hired on campaigns closed in the current calendar year. Enter IC and Employee counts separately. Replace with automated data once Recruiting or Pinpoint integration is available.",
            icTestId: "input-hired-ytd-ic", empTestId: "input-hired-ytd-employee",
          },
        };

        const target = editMetricTarget as MetricTarget | null;
        const c = target ? cfg[target] : cfg.candidates;

        return (
          <Dialog open={editMetricTarget !== null} onOpenChange={(open) => { if (!open) setEditMetricTarget(null); }}>
            <DialogContent className="max-w-xs" data-testid="dialog-edit-metric">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Pencil className="h-4 w-4 text-primary" />
                  {c.title}
                </DialogTitle>
                <DialogDescription className="text-xs">{c.tip}</DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Independent Contractor</Label>
                    <Input
                      type="number" min={0} step={1}
                      value={metricsForm.icValue}
                      onChange={(e) => setMetricsForm((f) => ({ ...f, icValue: Math.max(0, parseInt(e.target.value) || 0) }))}
                      data-testid={c.icTestId}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Employee</Label>
                    <Input
                      type="number" min={0} step={1}
                      value={metricsForm.employeeValue}
                      onChange={(e) => setMetricsForm((f) => ({ ...f, employeeValue: Math.max(0, parseInt(e.target.value) || 0) }))}
                      data-testid={c.empTestId}
                      className="h-8"
                    />
                  </div>
                </div>
                <div className="rounded-md bg-muted/40 px-3 py-2 flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Calculated Total</span>
                  <span className="text-sm font-bold tabular-nums">{metricsForm.icValue + metricsForm.employeeValue}</span>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditMetricTarget(null)}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={() => target && updateMetricsMutation.mutate({
                    metricName: target,
                    icValue: metricsForm.icValue,
                    employeeValue: metricsForm.employeeValue,
                  })}
                  disabled={updateMetricsMutation.isPending}
                  data-testid="button-save-metric"
                >
                  {updateMetricsMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Global Recruiting Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search campaigns, candidates, accounts, cities, markets…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-8 h-7 text-xs w-full border-[#d7dbe4]"
          data-testid="input-filter-recruiting"
        />
      </div>

      <KillSwitchBanner />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="border-b border-border bg-muted/30 px-4 py-1" data-testid="recruiting-workspace-strip">
        <div className="flex flex-wrap items-center gap-0.5">
          <TabsList className="h-auto flex-wrap gap-0.5 bg-transparent p-0">
            <TabsTrigger value="campaigns" className="h-7 text-xs px-2.5 gap-1.5" data-testid="tab-campaigns">
              <Rocket className="h-3 w-3" />
              Active Campaigns
            </TabsTrigger>
            <TabsTrigger value="closed-campaigns" onClick={() => setActiveTab("closed-campaigns")} className="h-7 text-xs px-2.5 gap-1.5" data-testid="tab-closed-campaigns">
              <CheckCircle2 className="h-3 w-3" />
              Closed Campaigns
            </TabsTrigger>
            <TabsTrigger value="requisitions" className="h-7 text-xs px-2.5 gap-1.5" data-testid="tab-requisitions">
              <Briefcase className="h-3 w-3" />
              Job Postings ({requisitions.length})
            </TabsTrigger>
            <TabsTrigger value="candidates" className="h-7 text-xs px-2.5 gap-1.5" data-testid="tab-candidates">
              <UserSearch className="h-3 w-3" />
              Candidates ({candidates.length})
            </TabsTrigger>
            <TabsTrigger value="applications" className="h-7 text-xs px-2.5 gap-1.5" data-testid="tab-applications">
              <Shield className="h-3 w-3" />
              Applications ({applications.length})
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="h-7 text-xs px-2.5 gap-1.5" data-testid="tab-pipeline">
              <ClipboardList className="h-3 w-3" />
              Pipeline ({applications.filter((app: any) => ["new", "screening", "interview", "offer"].includes(app.currentStage || "new")).length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="h-7 text-xs px-2.5 gap-1.5" data-testid="tab-requests">
              <ClipboardList className="h-3 w-3" />
              Requests
            </TabsTrigger>
            <TabsTrigger value="reports" className="h-7 text-xs px-2.5 gap-1.5" data-testid="tab-reports">
              <TrendingUp className="h-3 w-3" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="compliance" className="h-7 text-xs px-2.5 gap-1.5" data-testid="tab-compliance">
              <Shield className="h-3 w-3" />
              Compliance
            </TabsTrigger>
          </TabsList>

          {/* ── More overflow menu ── */}
          {(() => {
            const overflowTabs = [
              "queue","referrals","tags","demand","flags","reasons",
              "planner","market-intel","tasks","validation","assignment",
              "settings","audit","health","decommission","archives",
              "escalations","throttling","emergency","observability",
            ];
            const isOverflowActive = overflowTabs.includes(activeTab);
            const isAdmin = user?.role === 'admin' || user?.role === 'super_user';
            const isRecAdmin = isAdmin || user?.role === 'recruiting_admin';
            const isArchiveRole = isAdmin || user?.role === 'super_admin' || user?.role === 'root_super_admin' || user?.role === 'corporate_admin';
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="btn-more-tabs"
                    className={
                      "gap-1.5 rounded-sm font-medium text-sm" +
                      (isOverflowActive
                        ? " bg-background text-foreground shadow-sm"
                        : " text-muted-foreground")
                    }
                  >
                    More
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52" data-testid="dropdown-more-tabs">
                  <DropdownMenuItem
                    data-testid="tab-queue"
                    className={activeTab === "queue" ? "bg-accent text-accent-foreground" : ""}
                    onClick={() => setActiveTab("queue")}
                  >
                    <Brain className="mr-2 h-4 w-4" />
                    AI Queue
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {applications.filter((app: any) => app.aiPrescreenRecommendation).length}
                    </Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="tab-referrals"
                    className={activeTab === "referrals" ? "bg-accent text-accent-foreground" : ""}
                    onClick={() => setActiveTab("referrals")}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Referrals
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {referrals.length}
                    </Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="tab-tags"
                    className={activeTab === "tags" ? "bg-accent text-accent-foreground" : ""}
                    onClick={() => setActiveTab("tags")}
                  >
                    <Tag className="mr-2 h-4 w-4" />
                    Tags
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="tab-demand"
                    className={activeTab === "demand" ? "bg-accent text-accent-foreground" : ""}
                    onClick={() => setActiveTab("demand")}
                  >
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Demand
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="tab-flags"
                    className={activeTab === "flags" ? "bg-accent text-accent-foreground" : ""}
                    onClick={() => setActiveTab("flags")}
                  >
                    <Flag className="mr-2 h-4 w-4" />
                    Flags
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="tab-reasons"
                    className={activeTab === "reasons" ? "bg-accent text-accent-foreground" : ""}
                    onClick={() => setActiveTab("reasons")}
                  >
                    <Tag className="mr-2 h-4 w-4" />
                    Reasons
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="tab-launch-planner"
                    className={activeTab === "planner" ? "bg-accent text-accent-foreground" : ""}
                    onClick={() => setActiveTab("planner")}
                  >
                    <Rocket className="mr-2 h-4 w-4" />
                    Launch Planner
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="tab-market-intel"
                    className={activeTab === "market-intel" ? "bg-accent text-accent-foreground" : ""}
                    onClick={() => setActiveTab("market-intel")}
                  >
                    <BrainCircuit className="mr-2 h-4 w-4" />
                    Market Intel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="tab-tasks"
                    className={activeTab === "tasks" ? "bg-accent text-accent-foreground" : ""}
                    onClick={() => setActiveTab("tasks")}
                  >
                    <ListTodo className="mr-2 h-4 w-4" />
                    My Tasks
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="tab-validation"
                    className={activeTab === "validation" ? "bg-accent text-accent-foreground" : ""}
                    onClick={() => setActiveTab("validation")}
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Validation
                  </DropdownMenuItem>
                  {isRecAdmin && (
                    <DropdownMenuItem
                      data-testid="tab-assignment"
                      className={activeTab === "assignment" ? "bg-accent text-accent-foreground" : ""}
                      onClick={() => setActiveTab("assignment")}
                    >
                      <Target className="mr-2 h-4 w-4" />
                      Assignment Rules
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid="tab-settings"
                    className={activeTab === "settings" ? "bg-accent text-accent-foreground" : ""}
                    onClick={() => setActiveTab("settings")}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="tab-audit"
                    className={activeTab === "audit" ? "bg-accent text-accent-foreground" : ""}
                    onClick={() => setActiveTab("audit")}
                  >
                    <Activity className="mr-2 h-4 w-4" />
                    Audit Log
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem
                      data-testid="tab-health"
                      className={activeTab === "health" ? "bg-accent text-accent-foreground" : ""}
                      onClick={() => setActiveTab("health")}
                    >
                      <Activity className="mr-2 h-4 w-4" />
                      Health
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem
                      data-testid="tab-decommission"
                      className={activeTab === "decommission" ? "bg-accent text-accent-foreground" : ""}
                      onClick={() => setActiveTab("decommission")}
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Decommission
                    </DropdownMenuItem>
                  )}
                  {isArchiveRole && (
                    <DropdownMenuItem
                      data-testid="tab-archives"
                      className={activeTab === "archives" ? "bg-accent text-accent-foreground" : ""}
                      onClick={() => setActiveTab("archives")}
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Archives
                    </DropdownMenuItem>
                  )}
                  {isRecAdmin && (
                    <DropdownMenuSeparator />
                  )}
                  {isRecAdmin && (
                    <DropdownMenuItem
                      data-testid="tab-escalations"
                      className={activeTab === "escalations" ? "bg-accent text-accent-foreground" : ""}
                      onClick={() => setActiveTab("escalations")}
                    >
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Escalations
                    </DropdownMenuItem>
                  )}
                  {isRecAdmin && (
                    <DropdownMenuItem
                      data-testid="tab-throttling"
                      className={activeTab === "throttling" ? "bg-accent text-accent-foreground" : ""}
                      onClick={() => setActiveTab("throttling")}
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      Throttling
                    </DropdownMenuItem>
                  )}
                  {isRecAdmin && (
                    <DropdownMenuItem
                      data-testid="tab-emergency"
                      className={
                        "text-destructive focus:text-destructive" +
                        (activeTab === "emergency" ? " bg-destructive/10" : "")
                      }
                      onClick={() => setActiveTab("emergency")}
                    >
                      <ShieldAlert className="mr-2 h-4 w-4" />
                      Emergency
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem
                      data-testid="tab-observability"
                      className={activeTab === "observability" ? "bg-accent text-accent-foreground" : ""}
                      onClick={() => setActiveTab("observability")}
                    >
                      <Activity className="mr-2 h-4 w-4" />
                      Observability
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })()}
        </div>
        </div>

        {/* ── Closed Campaigns Tab ── */}
        <TabsContent value="closed-campaigns" className="space-y-4">
          <ClosedCampaignsList externalSearch={searchTerm} />
        </TabsContent>

        {/* ── Active Campaigns Tab ── */}
        <TabsContent value="campaigns" className="space-y-4">
          <ActiveCampaignsList
            externalSearch={searchTerm}
            onNewRequest={() => setRequestFormOpen(true)}
            onCloneRequest={(campaign) => {
              setClonePrefill(campaign);
              setCloneSourceId(campaign.id);
              setRequestFormOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="requisitions" className="space-y-4">
          {requisitionsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRequisitions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Job Postings</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Create your first job posting to start recruiting candidates
                </p>
                <Button onClick={() => setRequestFormOpen(true)} data-testid="button-create-first-requisition">
                  <Plus className="mr-2 h-4 w-4" />
                  Recruiting Request Form
                </Button>
              </CardContent>
            </Card>
          ) : filteredCandidates.length < 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRequisitions.map((req) => (
                <Card key={req.id} className="hover-elevate cursor-pointer" data-testid={`card-requisition-${req.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg">{req.title}</CardTitle>
                      <div className="flex items-center gap-1">
                        {req.screeningFormTemplateId && (
                          <Badge variant="outline" className="text-xs" data-testid={`badge-screening-form-${req.id}`}>
                            <FileText className="h-3 w-3 mr-1" />
                            Screening Form
                          </Badge>
                        )}
                        <Badge className={statusColors[req.status] || statusColors.draft}>
                          {req.status?.replace("_", " ")}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-requisition-actions-${req.id}`} onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              data-testid={`menu-edit-requisition-${req.id}`}
                              onClick={(e) => { e.stopPropagation(); openEditRequisition(req); }}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {(user?.role === 'admin' || user?.role === 'super_user') && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  data-testid={`menu-archive-requisition-${req.id}`}
                                  onClick={(e) => { e.stopPropagation(); archiveRequisitionMutation.mutate(req.id); }}
                                >
                                  <Archive className="h-4 w-4 mr-2" />
                                  Archive
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  data-testid={`menu-delete-requisition-${req.id}`}
                                  onClick={(e) => { e.stopPropagation(); deleteRequisitionMutation.mutate(req.id); }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <CardDescription className="flex items-center gap-2 flex-wrap">
                      {req.accountId && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {activeCustomers.find((c: any) => c.id === req.accountId)?.name
                            || activeCustomers.find((c: any) => c.id === req.accountId)?.customerName
                            || "Unknown Account"}
                        </span>
                      )}
                      {req.accountId && req.department && <span className="text-muted-foreground">•</span>}
                      {req.department && <span>{req.department}</span>}
                      {req.location && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {req.location}
                          </span>
                        </>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {req.employmentType && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {req.employmentType.replace("_", "-")}
                        </span>
                      )}
                      {(req.salaryMin || req.salaryMax) && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {req.salaryMin && req.salaryMax
                            ? `${Number(req.salaryMin).toLocaleString()} - ${Number(req.salaryMax).toLocaleString()}`
                            : req.salaryMin
                            ? `${Number(req.salaryMin).toLocaleString()}+`
                            : `Up to ${Number(req.salaryMax).toLocaleString()}`}
                          {req.salaryType === "hourly" ? "/hr" : "/yr"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {req.openings} opening{req.openings !== 1 ? "s" : ""}
                        {req.filledCount > 0 && ` (${req.filledCount} filled)`}
                      </span>
                      {req.priority && req.priority !== "normal" && (
                        <Badge variant={req.priority === "urgent" ? "destructive" : "secondary"} className="text-xs">
                          {req.priority}
                        </Badge>
                      )}
                    </div>
                    {req.roleType && req.roleType !== "vehicle_movement" && (
                      <div className="flex items-center gap-1 mt-1">
                        <Badge variant="secondary" className="text-xs capitalize" data-testid={`badge-role-type-${req.id}`}>
                          {req.roleType === "shuttle_driver" ? "Shuttle Driver" :
                           req.roleType === "dispatcher" ? "Dispatcher" :
                           req.roleType === "fleet_lead" ? "Fleet Lead" :
                           req.roleType}
                          {req.shuttleRouteType && ` — ${req.shuttleRouteType.charAt(0).toUpperCase() + req.shuttleRouteType.slice(1)}`}
                        </Badge>
                        {req.availabilityPattern && req.availabilityPattern !== "standard" && (
                          <Badge variant="outline" className="text-xs" data-testid={`badge-availability-${req.id}`}>
                            {req.availabilityPattern === "split_shift" ? "Split Shifts" :
                             req.availabilityPattern === "weekends_required" ? "Weekends Req." :
                             req.availabilityPattern === "flexible" ? "Flexible Shift" :
                             req.availabilityPattern === "on_call" ? "On-Call" :
                             req.availabilityPattern}
                          </Badge>
                        )}
                      </div>
                    )}
                    {(req.cdlRequired || req.requiredLicenseClass) && (
                      <div className="flex items-center flex-wrap gap-1 mt-1">
                        {req.cdlRequired && (
                          <Badge variant="default" className="text-xs" data-testid={`badge-cdl-required-${req.id}`}>
                            <IdCard className="h-3 w-3 mr-1" />
                            CDL Required
                          </Badge>
                        )}
                        {req.requiredLicenseClass && req.requiredLicenseClass !== 'none' && (
                          <Badge variant="outline" className="text-xs" data-testid={`badge-req-license-${req.id}`}>
                            Class {req.requiredLicenseClass}
                            {req.requiredEndorsements && req.requiredEndorsements.length > 0 && (
                              <span className="ml-1">+ {req.requiredEndorsements.join(', ')}</span>
                            )}
                          </Badge>
                        )}
                        {req.licenseGateEnabled && (
                          <Badge variant="secondary" className="text-xs">
                            <Shield className="h-3 w-3 mr-1" />
                            Gate
                          </Badge>
                        )}
                      </div>
                    )}
                    {req.audienceStrategyTags && req.audienceStrategyTags.length > 0 && (
                      <div className="pt-1" data-testid={`audience-tags-list-${req.id}`}>
                        <AudienceTagBadges tags={req.audienceStrategyTags} />
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-0">
                    <Button variant="ghost" size="sm" className="w-full" asChild>
                      <Link href={`/recruiting/requisitions/${req.id}`}>
                        View Applications
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <CandidateOperationalList candidates={filteredCandidates} />
          )}
        </TabsContent>

        {/* Candidates Tab */}
        <TabsContent value="candidates" className="space-y-4">
          {candidatesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCandidates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <UserSearch className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Candidates</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Add candidates to your talent pool
                </p>
                <Button onClick={() => setCandidateDialogOpen(true)} data-testid="button-add-first-candidate">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Candidate
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCandidates.map((candidate) => (
                <Card key={candidate.id} className="hover-elevate cursor-pointer" data-testid={`card-candidate-${candidate.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>{getInitials(candidate.firstName, candidate.lastName)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">
                          {candidate.firstName} {candidate.lastName}
                          <DnrBadge candidateId={candidate.id} />
                          <RiskFlagBadge candidateId={candidate.id} />
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {candidate.currentTitle || "No title"} {candidate.currentCompany && `at ${candidate.currentCompany}`}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">{candidate.email}</p>
                    {candidate.location && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {candidate.location}
                      </p>
                    )}
                    <div className="flex items-center flex-wrap gap-2">
                      {candidate.licenseClass && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-candidate-license-${candidate.id}`}>
                          <IdCard className="h-3 w-3 mr-1" />
                          Class {candidate.licenseClass}
                          {candidate.endorsements && candidate.endorsements.length > 0 && (
                            <span className="ml-1">({candidate.endorsements.join(', ')})</span>
                          )}
                        </Badge>
                      )}
                      {candidate.accessToVehicle !== null && candidate.accessToVehicle !== undefined && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-candidate-equipment-${candidate.id}`}>
                          <Briefcase className="h-3 w-3 mr-1" />
                          {candidate.accessToVehicle ? (candidate.vehicleType ? candidate.vehicleType.charAt(0).toUpperCase() + candidate.vehicleType.slice(1) : 'Vehicle') : 'No Vehicle'}
                          {candidate.trailerAccess && ' + Trailer'}
                        </Badge>
                      )}
                      {candidate.authorizedToWork !== null && candidate.authorizedToWork !== undefined && (() => {
                        const expDate = candidate.authorizationExpiration ? new Date(candidate.authorizationExpiration) : null;
                        const now = new Date();
                        const daysUntilExpiry = expDate ? Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                        const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
                        const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 90;
                        const authLabel = candidate.authorizationType
                          ? { citizen: 'Citizen', permanent_resident: 'Perm. Resident', work_visa: 'Work Visa', ead: 'EAD', other: 'Other' }[candidate.authorizationType] || candidate.authorizationType
                          : null;
                        return (
                          <Badge 
                            variant={!candidate.authorizedToWork ? "destructive" : isExpired ? "destructive" : "outline"}
                            className={`text-xs ${isExpiringSoon && !isExpired ? 'border-yellow-500 dark:border-yellow-400' : ''}`}
                            data-testid={`badge-candidate-work-auth-${candidate.id}`}
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            {!candidate.authorizedToWork ? 'Not Authorized' : (authLabel || 'Authorized')}
                            {isExpired && ' (Expired)'}
                            {isExpiringSoon && !isExpired && ` (${daysUntilExpiry}d)`}
                          </Badge>
                        );
                      })()}
                      {(candidate.ableToDriveLongDistance !== null && candidate.ableToDriveLongDistance !== undefined) && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-candidate-long-distance-${candidate.id}`}>
                          <Truck className="h-3 w-3 mr-1" />
                          {candidate.ableToDriveLongDistance ? 'Long Distance' : 'No Long Distance'}
                        </Badge>
                      )}
                      {(candidate.ableToEnterHighClearanceVehicles !== null && candidate.ableToEnterHighClearanceVehicles !== undefined) && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-candidate-high-clearance-${candidate.id}`}>
                          <ArrowUpDown className="h-3 w-3 mr-1" />
                          {candidate.ableToEnterHighClearanceVehicles ? 'High Clearance' : 'No High Clearance'}
                        </Badge>
                      )}
                      {candidate.accommodationsRequired && (
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-candidate-accommodations-${candidate.id}`}>
                          <Info className="h-3 w-3 mr-1" />
                          Accommodations Noted
                        </Badge>
                      )}
                      {candidate.oemsWorkedWith && (candidate.oemsWorkedWith as string[]).length > 0 && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-candidate-oems-${candidate.id}`}>
                          <Factory className="h-3 w-3 mr-1" />
                          {(candidate.oemsWorkedWith as string[]).map(v => OEM_OPTIONS.find(o => o.value === v)?.label || v).join(', ')}
                        </Badge>
                      )}
                      {candidate.clientTypesExperience && (candidate.clientTypesExperience as string[]).length > 0 && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-candidate-client-types-${candidate.id}`}>
                          <Handshake className="h-3 w-3 mr-1" />
                          {(candidate.clientTypesExperience as string[]).map(v => CLIENT_TYPE_OPTIONS.find(o => o.value === v)?.label || v).join(', ')}
                        </Badge>
                      )}
                      {candidate.yearsExperienceByCategory && Object.keys(candidate.yearsExperienceByCategory as Record<string, number>).length > 0 && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-candidate-exp-categories-${candidate.id}`}>
                          <Briefcase className="h-3 w-3 mr-1" />
                          {Object.entries(candidate.yearsExperienceByCategory as Record<string, number>).map(([k, v]) => {
                            const label = EXPERIENCE_CATEGORY_OPTIONS.find(o => o.value === k)?.label || k;
                            return `${label}: ${v}yr`;
                          }).join(', ')}
                        </Badge>
                      )}
                      {(candidate.mvrYearsLicensed !== null || candidate.mvrViolations3yr !== null || candidate.mvrAtFaultAccidents !== null || candidate.mvrDuiDwi !== null) && (() => {
                        const duiDwi = candidate.mvrDuiDwi === true;
                        const violations3yr = candidate.mvrViolations3yr ?? 0;
                        const accidents = candidate.mvrAtFaultAccidents ?? 0;
                        const isHighRisk = duiDwi || violations3yr >= 3 || accidents >= 2;
                        const isMediumRisk = !isHighRisk && (violations3yr > 0 || accidents > 0);
                        const riskLabel = isHighRisk ? 'High Risk' : isMediumRisk ? 'Elevated' : 'Clean';
                        return (
                          <Badge 
                            variant={isHighRisk ? "destructive" : "outline"}
                            className={`text-xs ${isMediumRisk ? 'border-yellow-500 dark:border-yellow-400' : ''}`}
                            data-testid={`badge-candidate-driving-record-${candidate.id}`}
                          >
                            <Car className="h-3 w-3 mr-1" />
                            {riskLabel}
                            {candidate.mvrYearsLicensed !== null && ` ${candidate.mvrYearsLicensed}yr`}
                            {duiDwi && ' (DUI)'}
                          </Badge>
                        );
                      })()}
                      {candidate.source && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-candidate-source-${candidate.id}`}>
                          {CANDIDATE_SOURCE_LABELS[candidate.source] ?? candidate.source}
                        </Badge>
                      )}
                      {candidate.isInTalentPool && (
                        <Badge variant="secondary" className="text-xs">
                          Talent Pool
                        </Badge>
                      )}
                      {candidate.isArchived && (
                        <Badge variant="secondary" className="text-xs bg-muted" data-testid={`badge-archived-candidate-${candidate.id}`}>
                          Archived
                        </Badge>
                      )}
                      {candidate.reactivationCount > 0 && (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-600" data-testid={`badge-rehire-${candidate.id}`}>
                          Rehire ({candidate.reactivationCount}x)
                        </Badge>
                      )}
                    </div>
                      <TrainingStatusBadge candidateId={candidate.id} />
                  </CardContent>
                  <CardFooter className="pt-0 flex flex-wrap gap-2">
                    {candidate.isArchived ? (
                      <>
                        <CandidateDnrBanner
                          candidateId={candidate.id}
                          candidateName={`${candidate.firstName} ${candidate.lastName}`}
                          userRole={user?.role}
                        />
                        <CandidateReactivation
                          candidateId={candidate.id}
                          candidateName={`${candidate.firstName} ${candidate.lastName}`}
                          isArchived={true}
                          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/candidates"] })}
                        />
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" className="flex-1" asChild>
                        <Link href={`/recruiting/candidates/${candidate.id}`}>
                          View Profile
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Applications Tab with Readiness Tracking */}
        <TabsContent value="applications" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Driver Readiness
                </CardTitle>
                <CardDescription>Track application progress and deployment readiness</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <SavedViewsSelector
                  selectedViewId={selectedSavedView?.id || null}
                  onSelectView={handleSavedViewSelect}
                  currentFilters={getCurrentFilters()}
                />
                <div className="border-l h-8" />
                <Select value={readinessFilter} onValueChange={(v) => { setReadinessFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[160px]" data-testid="select-readiness-filter">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" data-testid="filter-option-all">All Statuses</SelectItem>
                    <SelectItem value="ready" data-testid="filter-option-ready">Ready</SelectItem>
                    <SelectItem value="in_review" data-testid="filter-option-in-review">In Review</SelectItem>
                    <SelectItem value="not_ready" data-testid="filter-option-not-ready">Not Ready</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedTagFilter} onValueChange={setSelectedTagFilter}>
                  <SelectTrigger className="w-[160px]" data-testid="select-tag-filter">
                    <SelectValue placeholder="Filter by tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__" data-testid="filter-tag-all">All Tags</SelectItem>
                    {masterTags.map(tag => (
                      <SelectItem key={tag.id} value={tag.name} data-testid={`filter-tag-${tag.id}`}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: tag.color || '#6B7280' }}
                          />
                          {tag.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={geoFilter} onValueChange={(v) => { setGeoFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[160px]" data-testid="select-geo-filter">
                    <SelectValue placeholder="Geo eligibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" data-testid="filter-geo-all">All Geo</SelectItem>
                    <SelectItem value="eligible" data-testid="filter-geo-eligible">In Range</SelectItem>
                    <SelectItem value="ineligible" data-testid="filter-geo-ineligible">Out of Range</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 border-l pl-3">
                  <Switch
                    id="show-overdue"
                    checked={slaBreachedFilter}
                    onCheckedChange={setSlaBreachedFilter}
                    data-testid="switch-show-overdue"
                  />
                  <Label htmlFor="show-overdue" className="text-sm text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Overdue Only
                  </Label>
                </div>
                <div className="flex items-center gap-2 border-l pl-3">
                  <Switch
                    id="overdue-screening-filter"
                    checked={overdueScreeningFilter}
                    onCheckedChange={setOverdueScreeningFilter}
                    data-testid="switch-overdue-screening-filter"
                  />
                  <Label htmlFor="overdue-screening-filter" className="text-sm text-muted-foreground flex items-center gap-1">
                    <Hourglass className="h-4 w-4 text-orange-500" />
                    Stalled Screening
                  </Label>
                </div>
                <div className="flex items-center gap-2 border-l pl-3">
                  <Switch
                    id="show-archived"
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                    data-testid="switch-show-archived"
                  />
                  <Label htmlFor="show-archived" className="text-sm text-muted-foreground flex items-center gap-1">
                    {showArchived ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    Show Archived
                  </Label>
                </div>
                <div className="flex items-center gap-2 border-l pl-3">
                  <Switch
                    id="quick-call-filter"
                    checked={showQuickCallFilter}
                    onCheckedChange={setShowQuickCallFilter}
                    data-testid="switch-quick-call-filter"
                  />
                  <Label htmlFor="quick-call-filter" className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-4 w-4 text-primary" />
                    Quick Call Requests
                  </Label>
                </div>
                <div className="flex items-center gap-2 border-l pl-3">
                  <Select value={aiRecommendationFilter} onValueChange={setAiRecommendationFilter} data-testid="select-ai-recommendation-filter">
                    <SelectTrigger className="w-[170px]" data-testid="trigger-ai-filter">
                      <Activity className="h-3.5 w-3.5 mr-1.5 text-primary shrink-0" />
                      <SelectValue placeholder="AI Pre-Screen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All AI Scores</SelectItem>
                      <SelectItem value="advance">Advance</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="reject_recommended">Reject Recommended</SelectItem>
                      <SelectItem value="unscored">Not Yet Scored</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Advanced Filters Row */}
              <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t" data-testid="advanced-filters-bar">
                <Select value={marketFilter} onValueChange={(v) => { setMarketFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[150px]" data-testid="select-market-filter">
                    <SelectValue placeholder="Market" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Markets</SelectItem>
                    {marketsData.map((m: any) => (
                      <SelectItem key={m.id} value={m.id} data-testid={`filter-market-${m.id}`}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={requisitionFilter} onValueChange={(v) => { setRequisitionFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[180px]" data-testid="select-requisition-filter">
                    <SelectValue placeholder="Requisition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Requisitions</SelectItem>
                    {requisitions.map((r: any) => (
                      <SelectItem key={r.id} value={r.id} data-testid={`filter-req-${r.id}`}>{r.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[150px]" data-testid="select-source-filter">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {CANDIDATE_SOURCE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={cdlFilter} onValueChange={(v) => { setCdlFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[150px]" data-testid="select-cdl-filter">
                    <SelectValue placeholder="License Class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All License Classes</SelectItem>
                    <SelectItem value="cdl_only">CDL (Any Class)</SelectItem>
                    <SelectItem value="cdl_a">CDL-A Only</SelectItem>
                    <SelectItem value="cdl_b">CDL-B Only</SelectItem>
                    <SelectItem value="cdl_c">CDL-C Only</SelectItem>
                    <SelectItem value="non_cdl">Non-CDL Only</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={roleTypeFilter} onValueChange={(v) => { setRoleTypeFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[170px]" data-testid="select-role-type-filter">
                    <SelectValue placeholder="Role Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Role Types</SelectItem>
                    <SelectItem value="vehicle_movement">Vehicle Movement</SelectItem>
                    <SelectItem value="shuttle_driver">Shuttle Driver</SelectItem>
                    <SelectItem value="dispatcher">Dispatcher</SelectItem>
                    <SelectItem value="fleet_lead">Fleet Lead</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={dateFromFilter}
                    onChange={(e) => setDateFromFilter(e.target.value)}
                    className="w-[140px]"
                    data-testid="input-date-from"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={dateToFilter}
                    onChange={(e) => setDateToFilter(e.target.value)}
                    className="w-[140px]"
                    data-testid="input-date-to"
                  />
                </div>
                {hasAdvancedFilters && (
                  <Button variant="ghost" size="sm" onClick={clearAllFilters} data-testid="button-clear-filters">
                    <XCircle className="h-4 w-4 mr-1" />
                    Clear Filters
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-end mb-3">
                <PipelineColumnPicker />
              </div>
              {applicationsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : applications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Shield className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    No applications found{readinessFilter !== "all" ? ` with "${readinessFilter}" status` : ""}.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">

                  {/* Bulk Action Toolbar */}
                  {selectedApplications.size > 0 && (
                    <div className="mb-4 p-3 bg-muted rounded-lg flex flex-wrap items-center gap-3" data-testid="bulk-action-toolbar">
                      <div className="flex items-center gap-2">
                        <CheckSquare className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {selectedApplications.size} selected
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBulkAssignDialogOpen(true)}
                          data-testid="button-bulk-assign"
                        >
                          <UserCheck className="h-4 w-4 mr-1" />
                          Assign Recruiter
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowWorkloadPanel(true)}
                          data-testid="button-workloads"
                        >
                          <BarChart3 className="h-4 w-4 mr-1" />
                          Workloads
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBulkMoveStageDialogOpen(true)}
                          data-testid="button-bulk-move-stage"
                        >
                          <ArrowRight className="h-4 w-4 mr-1" />
                          Move Stage
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBulkTagDialogOpen(true)}
                          data-testid="button-bulk-tag"
                        >
                          <Tag className="h-4 w-4 mr-1" />
                          Add Tags
                        </Button>
                        {/* Bulk archive/restore buttons */}
                        {(() => {
                          const selectedApps = applications.filter((a: any) => selectedApplications.has(a.id));
                          const hasArchived = selectedApps.some((a: any) => a.isArchived);
                          const hasActive = selectedApps.some((a: any) => !a.isArchived);
                          return (
                            <>
                              {hasActive && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setBulkArchiveDialogOpen(true)}
                                  disabled={bulkArchiveMutation.isPending}
                                  data-testid="button-bulk-archive"
                                >
                                  <Archive className="h-4 w-4 mr-1" />
                                  Archive
                                </Button>
                              )}
                              {hasArchived && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => bulkRestoreMutation.mutate(Array.from(selectedApplications).filter(id => {
                                    const app = applications.find((a: any) => a.id === id);
                                    return app && app.isArchived;
                                  }))}
                                  disabled={bulkRestoreMutation.isPending}
                                  data-testid="button-bulk-restore"
                                >
                                  <ArchiveRestore className="h-4 w-4 mr-1" />
                                  Restore
                                </Button>
                              )}
                            </>
                          );
                        })()}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearSelection}
                          data-testid="button-clear-selection"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Select All Header */}
                  <div className="flex items-center gap-2 mb-3 px-2">
                    <Checkbox
                      checked={applications.length > 0 && selectedApplications.size === applications.length}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                    <span className="text-sm text-muted-foreground">Select all</span>
                  </div>

                  {displayedApplications.map((app: any) => (
                    <div 
                      key={app.id} 
                      className={`border rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover-elevate ${app.isArchived ? 'opacity-60 bg-muted/30' : ''}`}
                      data-testid={`application-row-${app.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <Checkbox
                          checked={selectedApplications.has(app.id)}
                          onCheckedChange={() => toggleApplicationSelection(app.id)}
                          data-testid={`checkbox-app-${app.id}`}
                        />
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            {(app.candidateFirstName?.charAt(0) || 'C') + (app.candidateLastName?.charAt(0) || '')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <HoverCard openDelay={300} closeDelay={100}>
                            <HoverCardTrigger asChild>
                              <p className="font-medium flex items-center flex-wrap gap-1 cursor-default" data-testid={`text-app-name-${app.id}`}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                                        app.readinessStatus === 'ready'
                                          ? 'bg-green-500'
                                          : app.readinessStatus === 'in_review'
                                          ? 'bg-yellow-500'
                                          : 'bg-red-500'
                                      }`}
                                      data-testid={`indicator-readiness-${app.id}`}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="text-xs">
                                      {app.readinessStatus === 'ready'
                                        ? 'Ready — All requirements met'
                                        : app.readinessStatus === 'in_review'
                                        ? 'In Review — Verification pending'
                                        : `Not Ready${app.readinessScore != null ? ` (${app.readinessScore}%)` : ''}`}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                                {app.candidateFirstName || 'Unknown'} {app.candidateLastName || 'Candidate'}
                                <RiskFlagBadge candidateId={app.candidateId} />
                              </p>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-80 p-0" side="right" align="start">
                              <CandidateSummaryCard candidateId={app.candidateId} compact />
                            </HoverCardContent>
                          </HoverCard>
                          <p className="text-sm text-muted-foreground">
                            {app.requisitionTitle || 'No requisition'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2">
                        {isColumnVisible("stage") && (
                          <Badge 
                            className={applicationStatusColors[app.currentStage] || applicationStatusColors.new}
                            data-testid={`badge-stage-${app.id}`}
                          >
                            {app.currentStage || 'New'}
                          </Badge>
                        )}
                        {isColumnVisible("lockIndicator") && (
                          <ApplicationLockIndicator
                            applicationId={app.id}
                            currentUserId={user?.id}
                          />
                        )}
                        
                        {/* SLA Breach Indicator */}
                        {isColumnVisible("sla") && app.slaBreached && (
                          <Badge 
                            variant="outline"
                            className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-300 dark:border-red-700"
                            data-testid={`badge-sla-overdue-${app.id}`}
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Overdue
                            {app.slaHoursOverdue && (
                              <span className="ml-1 font-mono">({Math.round(app.slaHoursOverdue)}h)</span>
                            )}
                          </Badge>
                        )}
                        {/* Screening SLA overdue badge (Ticket 13) */}
                        {overdueScreeningAppIds.has(app.id) && (
                          <Badge
                            variant="outline"
                            className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-300 dark:border-orange-700"
                            data-testid={`badge-screening-overdue-${app.id}`}
                          >
                            <Hourglass className="h-3 w-3 mr-1" />
                            Screening SLA
                          </Badge>
                        )}
                        {warningScreeningAppIds.has(app.id) && !overdueScreeningAppIds.has(app.id) && (
                          <Badge
                            variant="outline"
                            className="text-xs bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700"
                            data-testid={`badge-screening-warning-${app.id}`}
                          >
                            <Timer className="h-3 w-3 mr-1" />
                            SLA Warning
                          </Badge>
                        )}
                        <EscalationBanner applicationId={app.id} />
                        <AvailabilityAlertBanner applicationId={app.id} />
                        
                        {isColumnVisible("referral") && (app.referralId || app.source === 'referral') && (
                          <Badge 
                            variant="outline" 
                            className="text-xs bg-orange-50 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
                            data-testid={`badge-referral-${app.id}`}
                          >
                            <UserPlus className="h-3 w-3 mr-1" />
                            Referral{app.referrerName ? `: ${app.referrerName}` : ''}
                          </Badge>
                        )}
                        
                        {isColumnVisible("compliance") && app.complianceStatus && app.complianceStatus !== 'pending' && (
                          <ComplianceBadge 
                            status={app.complianceStatus} 
                            blockedReason={app.complianceBlockedReason}
                            applicationId={app.id}
                          />
                        )}
                        
                        {isColumnVisible("readiness") && (
                          <ReadinessBadge 
                            status={app.readinessStatus || 'not_ready'} 
                            score={app.readinessScore || 0} 
                          />
                        )}
                        
                        {isColumnVisible("geoEligibility") && app.geoEligible !== null && app.geoEligible !== undefined && (
                          <Badge 
                            variant={app.geoEligible ? "secondary" : "destructive"}
                            className="text-xs"
                            data-testid={`badge-geo-${app.id}`}
                          >
                            <MapPin className="h-3 w-3 mr-1" />
                            {app.distanceMiles ? `${app.distanceMiles}mi` : 'N/A'}
                            {app.geoEligible ? '' : ' (out of range)'}
                          </Badge>
                        )}

                        {isColumnVisible("licenseEligibility") && app.licenseEligible !== null && app.licenseEligible !== undefined && (
                          <Badge 
                            variant={app.licenseEligible ? "secondary" : "destructive"}
                            className="text-xs"
                            data-testid={`badge-license-${app.id}`}
                          >
                            <IdCard className="h-3 w-3 mr-1" />
                            {app.licenseEligible ? 'License OK' : (app.licenseMismatchReason || 'License mismatch')}
                          </Badge>
                        )}

                        {isColumnVisible("equipment") && app.candidateAccessToVehicle !== null && app.candidateAccessToVehicle !== undefined && (
                          <Badge 
                            variant="outline"
                            className="text-xs"
                            data-testid={`badge-equipment-${app.id}`}
                          >
                            <Briefcase className="h-3 w-3 mr-1" />
                            {app.candidateAccessToVehicle ? (app.candidateVehicleType ? app.candidateVehicleType.charAt(0).toUpperCase() + app.candidateVehicleType.slice(1) : 'Vehicle') : 'No Vehicle'}
                            {app.candidateTrailerAccess && ' + Trailer'}
                          </Badge>
                        )}

                        {isColumnVisible("workAuth") && app.candidateAuthorizedToWork !== null && app.candidateAuthorizedToWork !== undefined && (() => {
                          const expDate = app.candidateAuthorizationExpiration ? new Date(app.candidateAuthorizationExpiration) : null;
                          const now = new Date();
                          const daysUntilExpiry = expDate ? Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                          const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;
                          const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 90;
                          const authLabel = app.candidateAuthorizationType
                            ? { citizen: 'Citizen', permanent_resident: 'Perm. Resident', work_visa: 'Work Visa', ead: 'EAD', other: 'Other' }[app.candidateAuthorizationType] || app.candidateAuthorizationType
                            : null;
                          return (
                            <Badge 
                              variant={!app.candidateAuthorizedToWork ? "destructive" : isExpired ? "destructive" : isExpiringSoon ? "outline" : "outline"}
                              className={`text-xs ${isExpiringSoon && !isExpired ? 'border-yellow-500 dark:border-yellow-400' : ''}`}
                              data-testid={`badge-work-auth-${app.id}`}
                            >
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              {!app.candidateAuthorizedToWork ? 'Not Authorized' : (authLabel || 'Authorized')}
                              {isExpired && ' (Expired)'}
                              {isExpiringSoon && !isExpired && ` (${daysUntilExpiry}d)`}
                            </Badge>
                          );
                        })()}

                        {isColumnVisible("drivingRecord") && (app.candidateMvrYearsLicensed !== null || app.candidateMvrViolations3yr !== null || app.candidateMvrAtFaultAccidents !== null || app.candidateMvrDuiDwi !== null) && (() => {
                          const duiDwi = app.candidateMvrDuiDwi === true;
                          const violations3yr = app.candidateMvrViolations3yr ?? 0;
                          const accidents = app.candidateMvrAtFaultAccidents ?? 0;
                          const isHighRisk = duiDwi || violations3yr >= 3 || accidents >= 2;
                          const isMediumRisk = !isHighRisk && (violations3yr > 0 || accidents > 0);
                          const riskLabel = isHighRisk ? 'High Risk' : isMediumRisk ? 'Elevated' : 'Clean';
                          return (
                            <Badge 
                              variant={isHighRisk ? "destructive" : "outline"}
                              className={`text-xs ${isMediumRisk ? 'border-yellow-500 dark:border-yellow-400' : ''}`}
                              data-testid={`badge-driving-record-${app.id}`}
                            >
                              <Car className="h-3 w-3 mr-1" />
                              {riskLabel}
                              {duiDwi && ' (DUI)'}
                            </Badge>
                          );
                        })()}
                        
                        {isColumnVisible("training") && <TrainingStatusBadge candidateId={app.candidateId} />}

                        {/* AI Pre-Screen Score Badge */}
                        {app.aiPrescreenRecommendation && (
                          <AiPrescreenBadge
                            score={app.aiPrescreenScore}
                            recommendation={app.aiPrescreenRecommendation}
                            applicationId={app.id}
                          />
                        )}

                        {/* Owner Badge with Reassign Action */}
                        {isColumnVisible("owner") && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Badge 
                                variant="outline" 
                                className="text-xs cursor-pointer hover-elevate gap-1"
                                data-testid={`badge-owner-${app.id}`}
                              >
                                <UserRound className="h-3 w-3" />
                                {app.ownerName || app.ownerEmail || 'Unassigned'}
                              </Badge>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" data-testid={`menu-reassign-${app.id}`}>
                              <div className="px-2 py-1.5 text-sm font-semibold">Reassign to...</div>
                              <DropdownMenuSeparator />
                              {recruiters.length === 0 ? (
                                <div className="px-2 py-1.5 text-sm text-muted-foreground">No recruiters available</div>
                              ) : (
                                recruiters.map((r) => (
                                  <DropdownMenuItem
                                    key={r.id}
                                    onClick={() => {
                                      assignApplicationMutation.mutate({
                                        applicationId: app.id,
                                        newOwnerId: r.id,
                                        reason: "Quick reassign from pipeline"
                                      });
                                    }}
                                    disabled={app.ownerId === r.id}
                                    data-testid={`menu-item-assign-${app.id}-${r.id}`}
                                  >
                                    <UserRound className="h-3 w-3 mr-2" />
                                    {r.name}
                                    {app.ownerId === r.id && <span className="ml-auto text-xs text-muted-foreground">(current)</span>}
                                  </DropdownMenuItem>
                                ))
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  assignApplicationMutation.mutate({
                                    applicationId: app.id,
                                    newOwnerId: null,
                                    reason: "Unassigned from pipeline"
                                  });
                                }}
                                disabled={!app.ownerId}
                                data-testid={`menu-item-unassign-${app.id}`}
                              >
                                <XCircle className="h-3 w-3 mr-2" />
                                Unassign
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        
                        {isColumnVisible("lastActivity") && (
                          <div className="hidden sm:flex items-center gap-2 ml-2">
                            <Progress 
                              value={app.readinessScore || 0} 
                              className="w-20 h-2"
                            />
                          </div>
                        )}
                        
                        {isColumnVisible("screeningResponses") && app.screeningResponsesCount > 0 && (
                          <Badge 
                            variant="outline" 
                            className="text-xs bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300"
                            data-testid={`badge-responses-${app.id}`}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            {app.screeningResponsesCount} Response{app.screeningResponsesCount !== 1 ? 's' : ''}
                          </Badge>
                        )}
                        
                        {/* Task Indicator */}
                        {taskCounts && taskCounts[app.id] > 0 && (
                          <Badge 
                            variant="outline"
                            className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-300 dark:border-blue-700"
                            data-testid={`badge-tasks-${app.id}`}
                          >
                            <ListTodo className="h-3 w-3 mr-1" />
                            {taskCounts[app.id]} Task{taskCounts[app.id] !== 1 ? "s" : ""}
                          </Badge>
                        )}
                        
                        {/* Application Tags Display */}
                        {isColumnVisible("tags") && app.tags && app.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {app.tags.slice(0, 3).map((tagName: string) => {
                              const tagDef = masterTags.find(t => t.name === tagName);
                              return (
                                <Badge 
                                  key={tagName}
                                  variant="outline"
                                  style={{ 
                                    borderColor: tagDef?.color || '#6B7280',
                                    color: tagDef?.color || '#6B7280'
                                  }}
                                  className="text-xs"
                                  data-testid={`tag-app-${app.id}-${tagName}`}
                                >
                                  <Tag className="h-2.5 w-2.5 mr-1" />
                                  {tagName}
                                </Badge>
                              );
                            })}
                            {app.tags.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{app.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                        <ScorecardViewerDialog
                          applicationId={app.id}
                          candidateName={`${app.candidateFirstName || ''} ${app.candidateLastName || ''}`}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              title="View scorecards"
                              data-testid={`button-view-scorecards-${app.id}`}
                            >
                              <ClipboardCheck className="h-4 w-4" />
                            </Button>
                          }
                        />
                        
                        {app.requisitionScreeningFormTemplateId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedApplicationForScreening(app);
                              setScreeningDialogOpen(true);
                            }}
                            title="Send screening form"
                            data-testid={`button-send-screening-${app.id}`}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        
                        <ScheduleInterviewDialog
                          applicationId={app.id}
                          candidateName={`${app.candidate?.firstName || ''} ${app.candidate?.lastName || ''}`}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Schedule interview"
                              data-testid={`button-schedule-interview-${app.id}`}
                            >
                              <CalendarPlus className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="View activity timeline"
                              data-testid={`button-activity-${app.id}`}
                            >
                              <Clock className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid={`dialog-activity-${app.id}`}>
                            <DialogHeader>
                              <DialogTitle>Activity Timeline</DialogTitle>
                              <DialogDescription>
                                {app.candidateFirstName} {app.candidateLastName} - {app.requisitionTitle}
                              </DialogDescription>
                            </DialogHeader>
                            <NudgeHistory applicationId={app.id} />
                            <ActivityTimeline entityType="application" entityId={app.id} maxHeight="400px" isAdmin={user?.role === 'admin' || user?.role === 'super_user' || user?.role === 'recruiting_admin'} />
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => recalculateReadinessMutation.mutate(app.id)}
                          disabled={recalculateReadinessMutation.isPending}
                          title="Recalculate readiness"
                          data-testid={`button-recalculate-${app.id}`}
                        >
                          <RefreshCcw className={`h-4 w-4 ${recalculateReadinessMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <CandidateDnrBanner
                          candidateId={app.candidateId}
                          candidateName={`${app.candidateFirstName || ""} ${app.candidateLastName || ""}`.trim()}
                          userRole={user?.role}
                        />
                        <RiskFlagsPanel
                          candidateId={app.candidateId}
                          candidateName={`${app.candidateFirstName || ""} ${app.candidateLastName || ""}`.trim()}
                        />
                        <IdentityHistoryPanel
                          candidateId={app.candidateId}
                          candidateName={`${app.candidateFirstName || ""} ${app.candidateLastName || ""}`.trim()}
                        />
                        <ConsentHistoryView
                          candidateId={app.candidateId}
                          candidateName={`${app.candidateFirstName || ""} ${app.candidateLastName || ""}`.trim()}
                          applicationId={app.id}
                        />
                        <DuplicateCheckButton candidateId={app.candidateId} candidateName={`${app.candidateFirstName || ""} ${app.candidateLastName || ""}`.trim()} />
                        <AvailabilityDialog candidateId={app.candidateId} candidateName={`${app.candidateFirstName || ""} ${app.candidateLastName || ""}`.trim()} />
                        <LanguagePreferenceDialog candidateId={app.candidateId} candidateName={`${app.candidateFirstName || ""} ${app.candidateLastName || ""}`.trim()} />
                        <TrainingDialogButton candidateId={app.candidateId} candidateName={`${app.candidateFirstName || ""} ${app.candidateLastName || ""}`.trim()} />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedApplicationForWithdrawal(app);
                            setWithdrawalDialogOpen(true);
                          }}
                          title={app.withdrawnAt || app.noShowAt ? "Reactivate / View Status" : "Withdraw / No-Show"}
                          data-testid={`button-withdrawal-${app.id}`}
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                        <ApplicationNotesDialog applicationId={app.id} applicationName={`${app.candidateFirstName || ""} ${app.candidateLastName || ""}`.trim()} userRole={user?.role} />
                        <ComplianceEvidenceView 
                          applicationId={app.id}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              title="View compliance evidence"
                              data-testid={`button-compliance-${app.id}`}
                            >
                              <Shield className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <CandidatePortalDialog
                          applicationId={app.id}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Candidate portal & documents"
                              data-testid={`button-portal-${app.id}`}
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <CloneApplicationDialog
                          applicationId={app.id}
                          candidateName={`${app.candidateFirstName || ""} ${app.candidateLastName || ""}`.trim()}
                          currentRequisitionId={app.requisitionId}
                          currentRequisitionTitle={app.requisitionTitle || "Unknown Requisition"}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Clone to another requisition"
                              data-testid={`button-clone-${app.id}`}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          }
                        />
                        {app.isArchived ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => restoreApplicationMutation.mutate(app.id)}
                            disabled={restoreApplicationMutation.isPending}
                            title="Restore application"
                            data-testid={`button-restore-${app.id}`}
                          >
                            <ArchiveRestore className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => archiveApplicationMutation.mutate({ applicationId: app.id })}
                            disabled={archiveApplicationMutation.isPending}
                            title="Archive application"
                            data-testid={`button-archive-${app.id}`}
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        )}
                        {app.isArchived && (
                          <Badge variant="secondary" className="ml-1 text-xs" data-testid={`badge-archived-${app.id}`}>
                            <Archive className="h-3 w-3 mr-1" />
                            Archived
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Readiness Score Legend */}
          <Card data-testid="card-readiness-legend">
            <CardHeader>
              <CardTitle className="text-base" data-testid="text-readiness-breakdown-title">Readiness Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 text-sm" data-testid="readiness-criteria-list">
                <div className="flex items-center gap-2" data-testid="criterion-consent">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Consent (20%)</span>
                </div>
                <div className="flex items-center gap-2" data-testid="criterion-documents">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Documents (25%)</span>
                </div>
                <div className="flex items-center gap-2" data-testid="criterion-background">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Background Check (30%)</span>
                </div>
                <div className="flex items-center gap-2" data-testid="criterion-responsiveness">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Responsiveness (15%)</span>
                </div>
                <div className="flex items-center gap-2" data-testid="criterion-stage">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Stage Progress (10%)</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t flex flex-wrap gap-4" data-testid="readiness-status-legend">
                <div className="flex items-center gap-2" data-testid="legend-ready">
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" data-testid="badge-legend-ready">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Ready
                  </Badge>
                  <span className="text-sm text-muted-foreground">90%+ score</span>
                </div>
                <div className="flex items-center gap-2" data-testid="legend-in-review">
                  <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" data-testid="badge-legend-in-review">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    In Review
                  </Badge>
                  <span className="text-sm text-muted-foreground">60-89% score</span>
                </div>
                <div className="flex items-center gap-2" data-testid="legend-not-ready">
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" data-testid="badge-legend-not-ready">
                    <XCircle className="h-3 w-3 mr-1" />
                    Not Ready
                  </Badge>
                  <span className="text-sm text-muted-foreground">&lt;60% score</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold">Hiring Pipeline</h2>
              <p className="text-sm text-muted-foreground">Track applications through each stage</p>
            </div>
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground" data-testid="stat-avg-time-to-hire">
                Avg. time to hire: {stats?.avgTimeToHire ? `${stats.avgTimeToHire} days` : "N/A"}
              </span>
            </div>
          </div>

          {/* Pipeline Filters */}
          <Card>
            <CardContent className="py-3">
              <div className="flex flex-wrap items-center gap-3" data-testid="pipeline-filters-bar">
                <Select value={marketFilter} onValueChange={(v) => { setMarketFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[150px]" data-testid="pipeline-select-market">
                    <SelectValue placeholder="Market" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Markets</SelectItem>
                    {marketsData.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={requisitionFilter} onValueChange={(v) => { setRequisitionFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[180px]" data-testid="pipeline-select-requisition">
                    <SelectValue placeholder="Requisition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Requisitions</SelectItem>
                    {requisitions.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[140px]" data-testid="pipeline-select-stage">
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stages</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="screening">Screening</SelectItem>
                    <SelectItem value="interview">Interview</SelectItem>
                    <SelectItem value="offer">Offer</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="withdrawn">Withdrawn</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[150px]" data-testid="pipeline-select-source">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {CANDIDATE_SOURCE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={cdlFilter} onValueChange={(v) => { setCdlFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[150px]" data-testid="pipeline-select-cdl">
                    <SelectValue placeholder="License Class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All License Classes</SelectItem>
                    <SelectItem value="cdl_only">CDL (Any Class)</SelectItem>
                    <SelectItem value="cdl_a">CDL-A Only</SelectItem>
                    <SelectItem value="cdl_b">CDL-B Only</SelectItem>
                    <SelectItem value="cdl_c">CDL-C Only</SelectItem>
                    <SelectItem value="non_cdl">Non-CDL Only</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={roleTypeFilter} onValueChange={(v) => { setRoleTypeFilter(v); setSelectedSavedView(null); }}>
                  <SelectTrigger className="w-[170px]" data-testid="pipeline-select-role-type">
                    <SelectValue placeholder="Role Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Role Types</SelectItem>
                    <SelectItem value="vehicle_movement">Vehicle Movement</SelectItem>
                    <SelectItem value="shuttle_driver">Shuttle Driver</SelectItem>
                    <SelectItem value="dispatcher">Dispatcher</SelectItem>
                    <SelectItem value="fleet_lead">Fleet Lead</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={dateFromFilter}
                    onChange={(e) => setDateFromFilter(e.target.value)}
                    className="w-[140px]"
                    data-testid="pipeline-date-from"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={dateToFilter}
                    onChange={(e) => setDateToFilter(e.target.value)}
                    className="w-[140px]"
                    data-testid="pipeline-date-to"
                  />
                </div>
                {hasAdvancedFilters && (
                  <Button variant="ghost" size="sm" onClick={clearAllFilters} data-testid="pipeline-clear-filters">
                    <XCircle className="h-4 w-4 mr-1" />
                    Clear Filters
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Stage summary counters - derived from actual applications for consistency with Kanban cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {["new", "screening", "interview", "offer", "hired", "rejected", "withdrawn"].map((stage) => {
              const count = roleFilteredApplications.filter((app: any) => (app.currentStage || "new") === stage).length;
              return (
                <div key={stage} className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-2xl font-bold" data-testid={`stat-pipeline-${stage}`}>{count}</div>
                  <div className="text-xs text-muted-foreground capitalize">{stage}</div>
                </div>
              );
            })}
          </div>

          {/* Pipeline bulk action toolbar */}
          {selectedApplications.size > 0 && (
            <div className="p-3 bg-muted rounded-lg flex flex-wrap items-center gap-3" data-testid="pipeline-bulk-toolbar">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4" />
                <span className="text-sm font-medium">{selectedApplications.size} selected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setBulkMoveStageDialogOpen(true)} data-testid="pipeline-bulk-move">
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Move Stage
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBulkTagDialogOpen(true)} data-testid="pipeline-bulk-tag">
                  <Tag className="h-4 w-4 mr-1" />
                  Add Tags
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBulkArchiveDialogOpen(true)} data-testid="pipeline-bulk-archive">
                  <Archive className="h-4 w-4 mr-1" />
                  Archive
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection} data-testid="pipeline-clear-selection">
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Pipeline Kanban columns */}
          {roleFilteredApplications.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {["new", "screening", "interview", "offer", "hired"].map((stage) => {
                const stageApps = roleFilteredApplications.filter((app: any) => (app.currentStage || "new") === stage);
                const stageBgColors: Record<string, string> = {
                  new: "bg-blue-500",
                  screening: "bg-yellow-500",
                  interview: "bg-purple-500",
                  offer: "bg-green-500",
                  hired: "bg-emerald-500",
                };
                return (
                  <Card key={stage} data-testid={`pipeline-column-${stage}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`h-3 w-3 rounded-full ${stageBgColors[stage] || "bg-muted"}`} />
                          <CardTitle className="text-sm font-medium capitalize">{stage}</CardTitle>
                        </div>
                        <Badge variant="secondary">{stageApps.length}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                      {stageApps.length > 0 ? stageApps.map((app: any) => (
                        <div key={app.id} className="p-3 rounded-md bg-muted/50 hover-elevate" data-testid={`pipeline-card-${app.id}`}>
                          <div className="flex items-start gap-2">
                            <Checkbox
                              checked={selectedApplications.has(app.id)}
                              onCheckedChange={() => toggleApplicationSelection(app.id)}
                              className="mt-0.5"
                              data-testid={`pipeline-checkbox-${app.id}`}
                              onClick={(e: any) => e.stopPropagation()}
                            />
                          <Link href={`/recruiting/applications/${app.id}`} className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium text-sm truncate" data-testid={`pipeline-candidate-name-${app.id}`}>
                                {app.candidateFirstName} {app.candidateLastName}
                              </div>
                              {app.healthIndicators && (
                                <div className="flex items-center gap-1 flex-shrink-0" data-testid={`health-indicators-${app.id}`}>
                                  {app.healthIndicators.ready && (
                                    <span title="Ready - All documents complete, no blockers" data-testid={`health-ready-${app.id}`}>
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                    </span>
                                  )}
                                  {app.healthIndicators.missingDocs && (
                                    <span title={`Missing ${app.healthIndicators.missingDocsCount} of ${app.healthIndicators.totalRequiredDocs} required documents`} data-testid={`health-missing-docs-${app.id}`}>
                                      <FileText className="h-3.5 w-3.5 text-destructive" />
                                    </span>
                                  )}
                                  {app.healthIndicators.stale && (
                                    <span title={`In stage for ${app.healthIndicators.daysInStage} days`} data-testid={`health-stale-${app.id}`}>
                                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                                    </span>
                                  )}
                                  {app.healthIndicators.expiringDocs && (
                                    <span title={`${app.healthIndicators.expiringDocsCount} document(s) expiring`} data-testid={`health-expiring-docs-${app.id}`}>
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                    </span>
                                  )}
                                  {app.healthIndicators.slaOverdue && (
                                    <span title={`SLA Overdue - ${app.healthIndicators.daysInStage}d in stage (limit: ${Math.round((app.healthIndicators.slaThresholdHours || 0) / 24)}d)`} data-testid={`health-sla-overdue-${app.id}`}>
                                      <Timer className="h-3.5 w-3.5 text-destructive" />
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {app.requisitionTitle || "No position"}
                            </div>
                            {app.appliedAt && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(app.appliedAt).toLocaleDateString()}
                              </div>
                            )}
                          </Link>
                          </div>
                        </div>
                      )) : (
                        <p className="text-xs text-muted-foreground text-center py-4">No applications</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No applications in the pipeline yet. Create a job posting and add candidates to get started.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* AI Review Queue Tab */}
        <TabsContent value="queue" className="space-y-4">
          {(() => {
            const advanceQueue = [...applications].filter((a: any) => a.aiPrescreenRecommendation === "advance").sort((a: any, b: any) => (b.aiPrescreenScore ?? 0) - (a.aiPrescreenScore ?? 0));
            const reviewQueue = [...applications].filter((a: any) => a.aiPrescreenRecommendation === "review").sort((a: any, b: any) => (b.aiPrescreenScore ?? 0) - (a.aiPrescreenScore ?? 0));
            const redFlagQueue = [...applications].filter((a: any) => a.aiPrescreenRecommendation === "reject_recommended").sort((a: any, b: any) => (a.aiPrescreenScore ?? 0) - (b.aiPrescreenScore ?? 0));
            const quickCallQueue = [...applications].filter((a: any) => a.requestedQuickCall === true).sort((a: any, b: any) => (b.aiPrescreenScore ?? 0) - (a.aiPrescreenScore ?? 0));
            const unscoredCount = applications.filter((a: any) => !a.aiPrescreenRecommendation).length;

            const handleViewApp = (id: string) => setLocation(`/recruiting/applications/${id}`);

            const EmptyQueue = ({ message, sub }: { message: string; sub?: string }) => (
              <Card>
                <CardContent className="py-10 flex flex-col items-center text-center gap-2">
                  <Brain className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">{message}</p>
                  {sub && <p className="text-xs text-muted-foreground max-w-sm">{sub}</p>}
                </CardContent>
              </Card>
            );

            return (
              <>
                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <Brain className="h-5 w-5 text-primary" />
                      AI Review Queue
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Applications sorted by AI pre-screen score for faster recruiter triage
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {unscoredCount > 0 && (
                      <Badge variant="secondary" className="text-xs" data-testid="badge-unscored-count">
                        {unscoredCount} unscored
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchApplications()}
                      data-testid="btn-queue-refresh"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Refresh
                    </Button>
                  </div>
                </div>

                {/* Advisory banner */}
                <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                    <span className="font-semibold">Advisory only.</span> AI scores are non-decisional aids. Recruiters retain full authority over all hiring outcomes. Scores are automatically generated when applications are created and can be re-run from the application detail view.
                  </p>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Advance", count: advanceQueue.length, icon: CheckCircle2, color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10" },
                    { label: "Needs Review", count: reviewQueue.length, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
                    { label: "Red Flags", count: redFlagQueue.length, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
                    { label: "Quick Calls", count: quickCallQueue.length, icon: PhoneCall, color: "text-blue-500", bg: "bg-blue-500/10" },
                  ].map(({ label, count, icon: Icon, color, bg }) => (
                    <Card key={label}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={`p-2 rounded-md ${bg}`}>
                          <Icon className={`h-4 w-4 ${color}`} />
                        </div>
                        <div>
                          <div className={`text-2xl font-bold leading-none ${color}`}>{count}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Sub-tabs */}
                <Tabs defaultValue="advance" className="space-y-3">
                  <TabsList className="flex flex-wrap gap-1 h-auto">
                    <TabsTrigger value="advance" className="gap-1.5" data-testid="queue-tab-advance">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      Advance
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{advanceQueue.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="review" className="gap-1.5" data-testid="queue-tab-review">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      Needs Review
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{reviewQueue.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="redflags" className="gap-1.5" data-testid="queue-tab-redflags">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      Red Flags
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{redFlagQueue.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="quickcalls" className="gap-1.5" data-testid="queue-tab-quickcalls">
                      <PhoneCall className="h-3.5 w-3.5 text-blue-500" />
                      Quick Call Requests
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{quickCallQueue.length}</Badge>
                    </TabsTrigger>
                  </TabsList>

                  {/* Advance queue */}
                  <TabsContent value="advance" className="space-y-2 mt-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">Recommended to Advance</span>
                      <span className="text-xs text-muted-foreground ml-1">Score ≥ 68 — sorted by score, highest first</span>
                    </div>
                    {advanceQueue.length === 0 ? (
                      <EmptyQueue message="No applications with an Advance recommendation." sub="AI scores new applications automatically. Use Re-run in the detail view to score existing ones." />
                    ) : (
                      <div className="space-y-2">
                        {advanceQueue.map((app: any) => (
                          <QueueApplicationCard key={app.id} application={app} onView={handleViewApp} />
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Review queue */}
                  <TabsContent value="review" className="space-y-2 mt-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium">Needs Recruiter Review</span>
                      <span className="text-xs text-muted-foreground ml-1">Score 38–67 — mixed signals, recruiter judgment needed</span>
                    </div>
                    {reviewQueue.length === 0 ? (
                      <EmptyQueue message="No applications currently in the review bucket." />
                    ) : (
                      <div className="space-y-2">
                        {reviewQueue.map((app: any) => (
                          <QueueApplicationCard key={app.id} application={app} onView={handleViewApp} />
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Red flags queue */}
                  <TabsContent value="redflags" className="space-y-2 mt-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="text-sm font-medium">AI Red Flags</span>
                      <span className="text-xs text-muted-foreground ml-1">Score &lt; 38 — significant gaps vs. requirements</span>
                    </div>
                    <div className="flex items-start gap-2 rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2 mb-2">
                      <Info className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                      <p className="text-xs text-destructive leading-tight">
                        These applications scored low. <span className="font-medium">This does not mean automatic rejection.</span> Recruiter review is always required before any action.
                      </p>
                    </div>
                    {redFlagQueue.length === 0 ? (
                      <EmptyQueue message="No red-flag applications." />
                    ) : (
                      <div className="space-y-2">
                        {redFlagQueue.map((app: any) => (
                          <QueueApplicationCard key={app.id} application={app} onView={handleViewApp} />
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Quick calls queue */}
                  <TabsContent value="quickcalls" className="space-y-2 mt-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <PhoneCall className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Quick Call Requests</span>
                      <span className="text-xs text-muted-foreground ml-1">Candidates who opted in for a quick call at time of application</span>
                    </div>
                    {quickCallQueue.length === 0 ? (
                      <EmptyQueue
                        message="No quick call requests at this time."
                        sub="Candidates who request a quick call during their application will appear here."
                      />
                    ) : (
                      <div className="space-y-2">
                        {quickCallQueue.map((app: any) => (
                          <QueueApplicationCard key={app.id} application={app} onView={handleViewApp} />
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </>
            );
          })()}
        </TabsContent>

        {/* Referrals Tab */}
        <TabsContent value="referrals">
          <ReferralDashboard />        </TabsContent>

        {/* Recruiting Requests Tab — forceMount keeps the component in DOM so
            externalOpen can trigger the dialog from any other tab (e.g. campaigns).
            data-[state=inactive]:hidden hides it visually while keeping it mounted. */}
        <TabsContent value="requests" className="space-y-4 data-[state=inactive]:hidden" forceMount>
          <RecruitingRequestsTab
            externalOpen={requestFormOpen}
            onExternalOpenChange={(open) => {
              setRequestFormOpen(open);
              if (!open) { setClonePrefill(null); setCloneSourceId(null); }
            }}
            initialExpandId={tabFromPath === "requests" ? detailId : null}
            prefillData={clonePrefill}
            clonedFromCampaignId={cloneSourceId}
          />
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-6">
          <SourcePerformanceDashboard />

          {/* ── Ticket 26: Role Type Breakdown Report ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Recruiting by Role Type</CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Breakdown of requisitions and pipeline by driver role type
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const ROLE_LABELS: Record<string, string> = {
                  vehicle_movement: "Vehicle Movement Driver",
                  shuttle_driver: "Shuttle Driver",
                  dispatcher: "Dispatcher",
                  fleet_lead: "Fleet Lead",
                  other: "Other",
                };
                const roleGroups: Record<string, { label: string; reqs: any[]; apps: any[] }> = {};
                for (const role of Object.keys(ROLE_LABELS)) {
                  roleGroups[role] = { label: ROLE_LABELS[role], reqs: [], apps: [] };
                }
                requisitions.forEach((req: any) => {
                  const rt = req.roleType || "vehicle_movement";
                  if (!roleGroups[rt]) roleGroups[rt] = { label: rt, reqs: [], apps: [] };
                  roleGroups[rt].reqs.push(req);
                });
                applications.forEach((app: any) => {
                  const rt = app.requisition?.roleType || "vehicle_movement";
                  if (!roleGroups[rt]) roleGroups[rt] = { label: rt, reqs: [], apps: [] };
                  roleGroups[rt].apps.push(app);
                });
                const activeRoles = Object.entries(roleGroups).filter(([, g]) => g.reqs.length > 0 || g.apps.length > 0);
                if (activeRoles.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No requisition data yet. Create requisitions to see role type breakdown.
                    </p>
                  );
                }
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Role Type</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Requisitions</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Open Reqs</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Active Applicants</th>
                          <th className="text-right py-2 px-4 font-medium text-muted-foreground">Hired</th>
                          <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Shuttle Route Types</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeRoles.map(([roleKey, group]) => {
                          const openReqs = group.reqs.filter((r: any) => r.status === "open" || r.status === "active");
                          const hiredApps = group.apps.filter((a: any) => a.currentStage === "hired");
                          const activeApps = group.apps.filter((a: any) => !["hired", "rejected", "withdrawn"].includes(a.currentStage || "new"));
                          const shuttleRoutes = roleKey === "shuttle_driver"
                            ? Array.from(new Set(group.reqs.map((r: any) => r.shuttleRouteType).filter(Boolean)))
                            : [];
                          return (
                            <tr key={roleKey} className="border-b last:border-0 hover-elevate" data-testid={`role-type-row-${roleKey}`}>
                              <td className="py-3 pr-4 font-medium">{group.label}</td>
                              <td className="py-3 px-4 text-right tabular-nums">{group.reqs.length}</td>
                              <td className="py-3 px-4 text-right tabular-nums">{openReqs.length}</td>
                              <td className="py-3 px-4 text-right tabular-nums">{activeApps.length}</td>
                              <td className="py-3 px-4 text-right tabular-nums text-green-600 dark:text-green-400 font-medium">{hiredApps.length}</td>
                              <td className="py-3 pl-4 text-right">
                                {shuttleRoutes.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 justify-end">
                                    {shuttleRoutes.map((rt: string) => (
                                      <Badge key={rt} variant="outline" className="text-xs capitalize">{rt}</Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/30">
                          <td className="py-2 pr-4 font-medium text-muted-foreground">Total</td>
                          <td className="py-2 px-4 text-right font-semibold tabular-nums">{requisitions.length}</td>
                          <td className="py-2 px-4 text-right font-semibold tabular-nums">
                            {requisitions.filter((r: any) => r.status === "open" || r.status === "active").length}
                          </td>
                          <td className="py-2 px-4 text-right font-semibold tabular-nums">
                            {applications.filter((a: any) => !["hired", "rejected", "withdrawn"].includes(a.currentStage || "new")).length}
                          </td>
                          <td className="py-2 px-4 text-right font-semibold tabular-nums text-green-600 dark:text-green-400">
                            {applications.filter((a: any) => a.currentStage === "hired").length}
                          </td>
                          <td className="py-2 pl-4" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <RecruitingReports />

          {/* ── Ticket 30: Candidate Conversion Funnel Analytics ── */}
          <div className="border-t pt-6">
            <CandidateFunnelAnalytics embedded />
          </div>

          {/* AI Recommendation Feedback — leadership accuracy view */}
          <AIRecommendationFeedback />
        </TabsContent>

        {/* Compliance Evidence View Tab */}
        <TabsContent value="compliance" className="space-y-4">
          <ComplianceDashboard />
        </TabsContent>

        {/* Tags Management Tab */}
        <TabsContent value="tags" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="h-5 w-5" />
                    Tag Management
                  </CardTitle>
                  <CardDescription>
                    Create and manage tags to organize candidates and applications
                  </CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button data-testid="button-create-tag">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Tag
                    </Button>
                  </DialogTrigger>
                  <DialogContent data-testid="dialog-create-tag">
                    <DialogHeader>
                      <DialogTitle>Create New Tag</DialogTitle>
                      <DialogDescription>
                        Add a new tag to organize candidates and applications
                      </DialogDescription>
                    </DialogHeader>
                    <CreateTagForm 
                      onSuccess={() => {
                        refetchMasterTags();
                        toast({ title: "Tag created successfully" });
                      }} 
                    />
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {masterTags.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No tags created yet</p>
                  <p className="text-sm">Create tags to organize your recruiting pipeline</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Group tags by category */}
                  {['candidate_quality', 'availability', 'status', 'experience', 'market', 'custom'].map(category => {
                    const categoryTags = masterTags.filter(t => t.category === category);
                    if (categoryTags.length === 0) return null;
                    
                    const categoryLabel = category === 'candidate_quality' ? 'Candidate Quality' 
                      : category === 'availability' ? 'Availability'
                      : category === 'status' ? 'Status'
                      : category === 'experience' ? 'Experience'
                      : category === 'market' ? 'Market'
                      : 'Custom';
                    
                    return (
                      <div key={category} className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">{categoryLabel}</h4>
                        <div className="flex flex-wrap gap-2">
                          {categoryTags.map(tag => (
                            <Badge 
                              key={tag.id}
                              style={{ backgroundColor: tag.color || '#6B7280', color: '#fff' }}
                              className="gap-1 px-3 py-1"
                              data-testid={`tag-badge-${tag.id}`}
                            >
                              {tag.name}
                              {tag.isSystem && (
                                <Shield className="h-3 w-3 ml-1 opacity-70" />
                              )}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Usage Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Tag Usage
              </CardTitle>
              <CardDescription>
                See which tags are most commonly used
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableTags.slice(0, 9).map(tagName => (
                  <div 
                    key={tagName} 
                    className="flex items-center justify-between p-3 border rounded-md"
                    data-testid={`tag-usage-${tagName}`}
                  >
                    <span className="font-medium">{tagName}</span>
                    <Badge variant="secondary">In Use</Badge>
                  </div>
                ))}
                {availableTags.length === 0 && (
                  <p className="text-muted-foreground col-span-full text-center py-4">
                    No tags have been applied yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="demand" className="space-y-4">
          <DemandSignals isAdmin={user?.role === 'admin' || user?.role === 'recruiting_admin' || user?.role === 'super_user'} />
        </TabsContent>

        <TabsContent value="flags" className="space-y-4">
          <FeatureFlags isAdmin={user?.role === 'admin' || user?.role === 'recruiting_admin' || user?.role === 'super_user'} />
        </TabsContent>

        <TabsContent value="reasons" className="space-y-4">
          <ReasonCodesAdmin isAdmin={user?.role === 'admin' || user?.role === 'recruiting_admin' || user?.role === 'super_user'} />
        </TabsContent>

        {/* Launch Planner Tab (Ticket 21) */}
        <TabsContent value="planner" className="space-y-4">
          <MarketLaunchPlanner />
        </TabsContent>

        {/* Market Intelligence Tab (Tickets 27 + 28) */}
        <TabsContent value="market-intel" className="space-y-6">
          <MarketIntelligenceDashboard />
          <div className="border-t pt-6">
            <AIRecommendationFeedback />
          </div>
        </TabsContent>

        {/* My Tasks Tab */}
        <TabsContent value="tasks" className="space-y-4">
          <RecruiterTasksPanel />
        </TabsContent>

        {(user?.role === 'admin' || user?.role === 'super_user') && (
        <TabsContent value="health" className="space-y-4">
          <RecruitingHealthDashboard />
        </TabsContent>
        )}

        {(user?.role === 'admin' || user?.role === 'super_user') && (
        <TabsContent value="decommission" className="space-y-4">
          <DecommissionManager />
        </TabsContent>
        )}

        {(user?.role === 'admin' || user?.role === 'super_user' || user?.role === 'super_admin' || user?.role === 'root_super_admin' || user?.role === 'corporate_admin') && (
        <TabsContent value="archives" className="space-y-6">
          <CampaignArchivesSection />
          <div className="border-t pt-4">
            <ArchiveViewer />
          </div>
        </TabsContent>
        )}

        {(user?.role === 'admin' || user?.role === 'super_user' || user?.role === 'recruiting_admin') && (
        <TabsContent value="escalations" className="space-y-4">
          <EscalationPanel isAdmin={user?.role === 'admin' || user?.role === 'super_user' || user?.role === 'recruiting_admin'} />
        </TabsContent>
        )}

        {(user?.role === 'admin' || user?.role === 'super_user' || user?.role === 'recruiting_admin') && (
        <TabsContent value="throttling" className="space-y-4">
          <ThrottlePanel isAdmin={user?.role === 'admin' || user?.role === 'super_user' || user?.role === 'recruiting_admin'} />
        </TabsContent>
        )}










        <TabsContent value="validation" className="space-y-4">
          <ValidationRulesPanel />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <SlaThresholdsConfig />
          <div className="grid gap-6 md:grid-cols-2">
            <CalendarSettings />
            
            <JobBoardFeedCard />
            
            <Card data-testid="card-upcoming-interviews">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Upcoming Interviews
                </CardTitle>
                <CardDescription>
                  Your scheduled interviews for the next 7 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UpcomingInterviewsList />
              </CardContent>
            </Card>
          </div>
          <NudgeRulesConfig />
          {/* ── Job Ad Templates (Ticket 39) ── */}
          <JobAdTemplateManager />
          {/* ── Approval Ownership ── */}
          <ApprovalOwnershipSettings />
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <AuditLogTab />
        </TabsContent>


        <TabsContent value="emergency" className="space-y-4">
          <EmergencyControls isAdmin={user?.role === 'admin' || user?.role === 'recruiting_admin' || user?.role === 'super_user'} />
        </TabsContent>

        <TabsContent value="assignment" className="space-y-4">
          <AssignmentRulesPanel />
        </TabsContent>

        <TabsContent value="observability" className="space-y-4">
          <RecruitingObservabilityPanel />
        </TabsContent>

      {/* Bulk Assign Recruiter Dialog */}
      <Dialog open={bulkAssignDialogOpen} onOpenChange={setBulkAssignDialogOpen}>
        <DialogContent data-testid="dialog-bulk-assign">
          <DialogHeader>
            <DialogTitle>Assign Recruiter</DialogTitle>
            <DialogDescription>
              Assign a recruiter to {selectedApplications.size} selected application(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedRecruiterId} onValueChange={setSelectedRecruiterId}>
              <SelectTrigger data-testid="select-bulk-recruiter">
                <SelectValue placeholder="Select recruiter..." />
              </SelectTrigger>
              <SelectContent>
                {recruiters.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} ({r.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div>
              <Label htmlFor="reassign-reason">Reason (optional)</Label>
              <Input
                id="reassign-reason"
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="Reason for reassignment..."
                data-testid="input-bulk-assign-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => bulkAssignMutation.mutate({
                applicationIds: Array.from(selectedApplications),
                newOwnerId: selectedRecruiterId || null,
                reason: reassignReason || undefined
              })}
              disabled={!selectedRecruiterId || bulkAssignMutation.isPending}
              data-testid="button-confirm-bulk-assign"
            >
              {bulkAssignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recruiter Workload Panel */}
      <Dialog open={showWorkloadPanel} onOpenChange={setShowWorkloadPanel}>
        <DialogContent className="max-w-2xl" data-testid="dialog-workload-panel">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Recruiter Workloads
            </DialogTitle>
            <DialogDescription>
              Current application distribution across recruiters
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {workloadsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : workloads.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No recruiter workload data available
              </div>
            ) : (
              workloads.map((w) => (
                <Card key={w.recruiterId} className="p-3" data-testid={`card-workload-${w.recruiterId}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {w.recruiterName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm">{w.recruiterName}</div>
                        <div className="text-xs text-muted-foreground">{w.recruiterEmail}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-lg font-semibold">{w.activeApplications}</div>
                        <div className="text-xs text-muted-foreground">Active</div>
                      </div>
                      {w.slaBreachedCount > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {w.slaBreachedCount} SLA
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkloadPanel(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Move Stage Dialog */}
      <Dialog open={bulkMoveStageDialogOpen} onOpenChange={(open) => {
        setBulkMoveStageDialogOpen(open);
        if (!open) {
          setBulkMoveStage("");
          setBulkMoveReasonCode("");
          setBulkMoveReasonText("");
        }
      }}>
        <DialogContent data-testid="dialog-bulk-move-stage">
          <DialogHeader>
            <DialogTitle>Move Stage</DialogTitle>
            <DialogDescription>
              Move {selectedApplications.size} selected application(s) to a new stage
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Target Stage</Label>
              <Select value={bulkMoveStage} onValueChange={(v) => {
                setBulkMoveStage(v);
                setBulkMoveReasonCode("");
                setBulkMoveReasonText("");
              }}>
                <SelectTrigger data-testid="select-bulk-stage">
                  <SelectValue placeholder="Select stage..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="phone_screen">Phone Screen</SelectItem>
                  <SelectItem value="interview_scheduled">Interview Scheduled</SelectItem>
                  <SelectItem value="interview_completed">Interview Completed</SelectItem>
                  <SelectItem value="background_check">Background Check</SelectItem>
                  <SelectItem value="offer">Offer</SelectItem>
                  <SelectItem value="hired">Hired</SelectItem>
                  <SelectItem value="hold">On Hold</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {["rejected", "hold", "withdrawn"].includes(bulkMoveStage) && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <span>Reason required for this stage change</span>
                </div>
                <div>
                  <Label className="text-sm font-medium">Reason Code</Label>
                  <Select value={bulkMoveReasonCode} onValueChange={setBulkMoveReasonCode}>
                    <SelectTrigger data-testid="select-bulk-reason-code">
                      <SelectValue placeholder="Select a reason..." />
                    </SelectTrigger>
                    <SelectContent>
                      {reasonCodes.filter(rc => rc.stage === bulkMoveStage).length > 0 ? (
                        reasonCodes
                          .filter(rc => rc.stage === bulkMoveStage)
                          .map(rc => (
                            <SelectItem key={rc.code} value={rc.code}>{rc.label}</SelectItem>
                          ))
                      ) : (
                        <>
                          {bulkMoveStage === "rejected" && (
                            <>
                              <SelectItem value="NOT_QUALIFIED">Not Qualified</SelectItem>
                              <SelectItem value="FAILED_BACKGROUND">Failed Background Check</SelectItem>
                              <SelectItem value="NO_SHOW">No Show</SelectItem>
                              <SelectItem value="OTHER_REJECTION">Other</SelectItem>
                            </>
                          )}
                          {bulkMoveStage === "hold" && (
                            <>
                              <SelectItem value="PENDING_DOCUMENTS">Pending Documents</SelectItem>
                              <SelectItem value="CANDIDATE_REQUEST">Candidate Request</SelectItem>
                              <SelectItem value="OTHER_HOLD">Other</SelectItem>
                            </>
                          )}
                          {bulkMoveStage === "withdrawn" && (
                            <>
                              <SelectItem value="ACCEPTED_OTHER">Accepted Other Offer</SelectItem>
                              <SelectItem value="PERSONAL_REASONS">Personal Reasons</SelectItem>
                              <SelectItem value="OTHER_WITHDRAWN">Other</SelectItem>
                            </>
                          )}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Additional Notes (Optional)</Label>
                  <Textarea
                    value={bulkMoveReasonText}
                    onChange={(e) => setBulkMoveReasonText(e.target.value)}
                    placeholder="Add any additional context..."
                    className="mt-1"
                    data-testid="textarea-bulk-reason-notes"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkMoveStageDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const selectedReason = reasonCodes.find(rc => rc.code === bulkMoveReasonCode);
                bulkMoveStageMutation.mutate({
                  applicationIds: Array.from(selectedApplications),
                  toStage: bulkMoveStage,
                  reasonCode: bulkMoveReasonCode || undefined,
                  reasonLabel: selectedReason?.label || bulkMoveReasonCode || undefined,
                  reasonNotes: bulkMoveReasonText || undefined,
                });
              }}
              disabled={
                !bulkMoveStage || 
                bulkMoveStageMutation.isPending ||
                (["rejected", "hold", "withdrawn"].includes(bulkMoveStage) && !bulkMoveReasonCode)
              }
              data-testid="button-confirm-bulk-move"
            >
              {bulkMoveStageMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Move Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Add Tags Dialog */}
      <Dialog open={bulkTagDialogOpen} onOpenChange={setBulkTagDialogOpen}>
        <DialogContent data-testid="dialog-bulk-tag">
          <DialogHeader>
            <DialogTitle>Add Tags</DialogTitle>
            <DialogDescription>
              Add tags to {selectedApplications.size} selected application(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tag Name</Label>
              <Input
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                placeholder="Enter tag name..."
                data-testid="input-bulk-tag"
              />
            </div>
            {availableTags.length > 0 && (
              <div>
                <Label className="text-sm text-muted-foreground">Existing tags (click to use):</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {availableTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer hover-elevate"
                      onClick={() => setBulkTagInput(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTagDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => bulkAddTagsMutation.mutate({
                applicationIds: Array.from(selectedApplications),
                tags: [bulkTagInput.trim()]
              })}
              disabled={!bulkTagInput.trim() || bulkAddTagsMutation.isPending}
              data-testid="button-confirm-bulk-tag"
            >
              {bulkAddTagsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Archive Confirmation Dialog */}
      <Dialog open={bulkArchiveDialogOpen} onOpenChange={(open) => {
        setBulkArchiveDialogOpen(open);
        if (!open) setBulkArchiveReason("");
      }}>
        <DialogContent data-testid="dialog-bulk-archive">
          <DialogHeader>
            <DialogTitle>Archive Applications</DialogTitle>
            <DialogDescription>
              Archive {(() => {
                const activeCount = Array.from(selectedApplications).filter(id => {
                  const app = applications?.find((a: any) => a.id === id);
                  return app && !app.isArchived;
                }).length;
                return activeCount;
              })()} active application(s). Archived applications can be restored later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Reason (Optional)</Label>
              <Textarea
                value={bulkArchiveReason}
                onChange={(e) => setBulkArchiveReason(e.target.value)}
                placeholder="Why are these applications being archived?"
                className="mt-1"
                data-testid="textarea-bulk-archive-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkArchiveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const activeIds = Array.from(selectedApplications).filter(id => {
                  const app = applications?.find((a: any) => a.id === id);
                  return app && !app.isArchived;
                });
                bulkArchiveMutation.mutate({ applicationIds: activeIds, reason: bulkArchiveReason || undefined });
              }}
              disabled={bulkArchiveMutation.isPending}
              data-testid="button-confirm-bulk-archive"
            >
              {bulkArchiveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Archive Applications
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Result Summary Dialog */}
      <Dialog open={bulkResultDialogOpen} onOpenChange={setBulkResultDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-bulk-results">
          <DialogHeader>
            <DialogTitle>{bulkResultData?.title || "Bulk Action Results"}</DialogTitle>
            <DialogDescription>
              {bulkResultData?.results ? `${bulkResultData.results.filter(r => r.success).length} succeeded, ${bulkResultData.results.filter(r => !r.success).length} failed` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {bulkResultData?.results?.filter(r => !r.success).map((r, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-sm">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-destructive">
                    {r.applicationId.substring(0, 8)}...
                  </span>
                  <span className="text-muted-foreground ml-1">
                    {r.error || "Unknown error"}
                  </span>
                </div>
              </div>
            ))}
            {bulkResultData?.results?.filter(r => r.success).length ? (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted text-sm text-muted-foreground">
                <CheckSquare className="h-4 w-4" />
                {bulkResultData.results.filter(r => r.success).length} application(s) completed successfully
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => setBulkResultDialogOpen(false)} data-testid="button-close-bulk-results">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </Tabs>

      <ScreeningFormDialog
        open={screeningDialogOpen}
        onClose={() => {
          setScreeningDialogOpen(false);
          setSelectedApplicationForScreening(null);
        }}
        applicationId={selectedApplicationForScreening?.id}
        formTemplateId={selectedApplicationForScreening?.requisitionScreeningFormTemplateId}
        candidateName={`${selectedApplicationForScreening?.candidateFirstName || ''} ${selectedApplicationForScreening?.candidateLastName || ''}`}
      />

      {selectedApplicationForWithdrawal && (
        <WithdrawalNoShowDialog
          open={withdrawalDialogOpen}
          onOpenChange={(open) => {
            setWithdrawalDialogOpen(open);
            if (!open) setSelectedApplicationForWithdrawal(null);
          }}
          applicationId={selectedApplicationForWithdrawal.id}
          candidateName={`${selectedApplicationForWithdrawal.candidateFirstName || ''} ${selectedApplicationForWithdrawal.candidateLastName || ''}`}
          currentStage={selectedApplicationForWithdrawal.currentStage || 'applied'}
          withdrawnAt={selectedApplicationForWithdrawal.withdrawnAt}
          noShowAt={selectedApplicationForWithdrawal.noShowAt}
        />
      )}
      </div>{/* /px-6 content */}
    </div>
  );
}

function CreateTagForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("custom");
  const [color, setColor] = useState("#6B7280");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Tag name is required", variant: "destructive" });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/recruiting/tags", {
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        color,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create tag");
      }
      
      setName("");
      setDescription("");
      setCategory("custom");
      setColor("#6B7280");
      onSuccess();
    } catch (err: any) {
      toast({ 
        title: "Failed to create tag", 
        description: err.message,
        variant: "destructive" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tag-name">Tag Name</Label>
        <Input
          id="tag-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Strong Candidate"
          data-testid="input-tag-name"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="tag-description">Description (optional)</Label>
        <Textarea
          id="tag-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of this tag"
          rows={2}
          data-testid="input-tag-description"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="tag-category">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger data-testid="select-tag-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="candidate_quality">Candidate Quality</SelectItem>
            <SelectItem value="availability">Availability</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="experience">Experience</SelectItem>
            <SelectItem value="market">Market</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="tag-color">Color</Label>
        <div className="flex gap-2">
          <input
            type="color"
            id="tag-color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded border"
            data-testid="input-tag-color"
          />
          <Input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#6B7280"
            className="flex-1"
          />
        </div>
      </div>
      
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting} data-testid="button-submit-tag">
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Tag"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ScreeningFormDialog({
  open,
  onClose,
  applicationId,
  formTemplateId,
  candidateName,
}: {
  open: boolean;
  onClose: () => void;
  applicationId: string | undefined;
  formTemplateId: string | undefined;
  candidateName: string;
}) {
  const { toast } = useToast();
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/screening-link`, {
        formTemplateId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedLink(data.link);
      toast({
        title: "Screening Link Generated",
        description: "The screening form link has been generated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Generate Link",
        description: error.message || "Could not generate the screening form link.",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async () => {
    if (generatedLink) {
      await navigator.clipboard.writeText(generatedLink);
      toast({
        title: "Link Copied",
        description: "Screening form link copied to clipboard.",
      });
    }
  };

  const handleClose = () => {
    setGeneratedLink(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-screening-form">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Send Screening Form
          </DialogTitle>
          <DialogDescription>
            Generate a screening form link for {candidateName || 'this candidate'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!generatedLink ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Click the button below to generate a unique screening form link for this candidate.
              </p>
              <Button
                onClick={() => generateLinkMutation.mutate()}
                disabled={generateLinkMutation.isPending || !applicationId}
                data-testid="button-generate-link"
              >
                {generateLinkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Screening Link
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Screening Form Link
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    value={generatedLink}
                    readOnly
                    className="font-mono text-sm"
                    data-testid="input-screening-link"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyToClipboard}
                    title="Copy link"
                    data-testid="button-copy-link"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => window.open(generatedLink, '_blank')}
                    title="Open in new tab"
                    data-testid="button-open-link"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Share this link with the candidate. They can fill out the screening form without needing to log in.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-close-dialog">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UpcomingInterviewsList() {
  const { data: interviewsData, isLoading } = useQuery<{ interviews: Interview[] }>({
    queryKey: ["/api/recruiting/interviews"],
  });

  const interviews = interviewsData?.interviews || [];
  const upcomingInterviews = interviews
    .filter((i) => i.status === "scheduled" || i.status === "confirmed")
    .filter((i) => new Date(i.startTime) >= new Date())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (upcomingInterviews.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No upcoming interviews scheduled</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {upcomingInterviews.map((interview) => {
        const TypeIcon = interviewTypeIcons[interview.interviewType];
        const startDate = new Date(interview.startTime);
        
        return (
          <div 
            key={interview.id} 
            className="flex items-center justify-between p-3 rounded-lg border"
            data-testid={`upcoming-interview-${interview.id}`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">
                <TypeIcon className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium text-sm">{interview.title}</div>
                <div className="text-xs text-muted-foreground">
                  {startDate.toLocaleDateString()} at {startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </div>
              </div>
            </div>
            <Badge 
              variant="outline" 
              className={interviewStatusColors[interview.status]}
            >
              {interview.durationMinutes} min
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

function RecruitingReports() {
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [market, setMarket] = useState<string>("__all__");
  const [requisitionId, setRequisitionId] = useState<string>("__all__");

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (dateRange.start) params.append('startDate', new Date(dateRange.start).toISOString());
    if (dateRange.end) params.append('endDate', new Date(dateRange.end).toISOString());
    if (market && market !== "__all__") params.append('market', market);
    if (requisitionId && requisitionId !== "__all__") params.append('requisitionId', requisitionId);
    return params.toString();
  };

  const { data: filters, isLoading: filtersLoading } = useQuery<{
    markets: string[];
    requisitions: { id: string; title: string }[];
  }>({
    queryKey: ['/api/recruiting/reports/filters'],
  });

  const queryString = buildQueryString();
  const kpisUrl = queryString ? `/api/recruiting/reports/kpis?${queryString}` : '/api/recruiting/reports/kpis';
  const pipelineHealthUrl = queryString ? `/api/recruiting/reports/pipeline-health?${queryString}` : '/api/recruiting/reports/pipeline-health';

  const { data: kpis, isLoading: kpisLoading, refetch: refetchKpis } = useQuery<{
    timeToStage: { stage: string; avgMinutes: number; avgHours: number; avgDays: number; count: number }[];
    timeToReady: { avgMinutes: number; avgHours: number; avgDays: number; count: number } | null;
    funnelConversion: { stage: string; count: number; percentage: number }[];
    sourceAttribution: { source: string; count: number; percentage: number }[];
    slaBreachedCount: number;
    totalApplications: number;
    hiredCount: number;
    activeCount: number;
  }>({
    queryKey: [kpisUrl],
  });

  const { data: pipelineHealth, isLoading: healthLoading, refetch: refetchPipelineHealth } = useQuery<{
    stageDistribution: { stage: string; count: number }[];
    weeklyTrend: { week: string; applied: number; hired: number }[];
    marketBreakdown: { market: string; total: number; active: number; hired: number }[];
  }>({
    queryKey: [pipelineHealthUrl],
  });

  const formatDays = (days: number) => {
    if (days < 1) return `${Math.round(days * 24)}h`;
    return `${days.toFixed(1)}d`;
  };

  const formatStageName = (stage: string) => {
    return stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const handleExport = () => {
    const queryString = buildQueryString();
    window.open(`/api/recruiting/reports/export?${queryString}`, '_blank');
  };

  const isLoading = kpisLoading || healthLoading;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-lg">Recruiting Reports</CardTitle>
            <Button 
              variant="outline" 
              onClick={handleExport}
              data-testid="button-export-csv"
            >
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-40"
                data-testid="input-start-date"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-40"
                data-testid="input-end-date"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Market</label>
              <Select value={market} onValueChange={setMarket}>
                <SelectTrigger className="w-40" data-testid="select-market">
                  <SelectValue placeholder="All Markets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Markets</SelectItem>
                  {filters?.markets.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Requisition</label>
              <Select value={requisitionId} onValueChange={setRequisitionId}>
                <SelectTrigger className="w-48" data-testid="select-requisition">
                  <SelectValue placeholder="All Requisitions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Requisitions</SelectItem>
                  {filters?.requisitions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  refetchKpis();
                  refetchPipelineHealth();
                }}
                data-testid="button-refresh"
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-kpi-total">
              <CardHeader className="pb-2">
                <CardDescription>Total Applications</CardDescription>
                <CardTitle className="text-3xl">{kpis?.totalApplications || 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card data-testid="card-kpi-active">
              <CardHeader className="pb-2">
                <CardDescription>Active in Pipeline</CardDescription>
                <CardTitle className="text-3xl">{kpis?.activeCount || 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card data-testid="card-kpi-hired">
              <CardHeader className="pb-2">
                <CardDescription>Hired</CardDescription>
                <CardTitle className="text-3xl text-green-600">{kpis?.hiredCount || 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card data-testid="card-kpi-sla">
              <CardHeader className="pb-2">
                <CardDescription>SLA Breached</CardDescription>
                <CardTitle className="text-3xl text-red-600">{kpis?.slaBreachedCount || 0}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Time to Ready */}
          {kpis?.timeToReady && (
            <Card data-testid="card-time-to-ready">
              <CardHeader>
                <CardTitle className="text-lg">Time to Ready (Deployable)</CardTitle>
                <CardDescription>Average time from application to deployment-ready status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-primary">
                      {formatDays(kpis.timeToReady.avgDays)}
                    </div>
                    <div className="text-sm text-muted-foreground">Average</div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Based on {kpis.timeToReady.count} candidates who reached 100% readiness
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Time to Stage */}
          {kpis?.timeToStage && kpis.timeToStage.length > 0 && (
            <Card data-testid="card-time-to-stage">
              <CardHeader>
                <CardTitle className="text-lg">Average Time by Stage</CardTitle>
                <CardDescription>How long candidates spend in each stage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {kpis.timeToStage.map((s) => (
                    <div key={s.stage} className="flex items-center gap-4">
                      <div className="w-40 font-medium text-sm">{formatStageName(s.stage)}</div>
                      <div className="flex-1">
                        <Progress 
                          value={Math.min((s.avgDays / 14) * 100, 100)} 
                          className="h-3"
                        />
                      </div>
                      <div className="w-20 text-right font-mono text-sm">
                        {formatDays(s.avgDays)}
                      </div>
                      <div className="w-16 text-right text-xs text-muted-foreground">
                        ({s.count})
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Funnel Conversion */}
          {kpis?.funnelConversion && kpis.funnelConversion.length > 0 && (
            <Card data-testid="card-funnel">
              <CardHeader>
                <CardTitle className="text-lg">Funnel Conversion</CardTitle>
                <CardDescription>Application distribution across stages</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {kpis.funnelConversion.map((stage, idx) => (
                    <div key={stage.stage} className="flex items-center gap-4">
                      <div className="w-8 text-center text-sm text-muted-foreground">{idx + 1}</div>
                      <div className="w-40 font-medium text-sm">{formatStageName(stage.stage)}</div>
                      <div className="flex-1">
                        <div 
                          className="h-6 rounded bg-primary/80 flex items-center justify-end pr-2"
                          style={{ width: `${Math.max(stage.percentage, 5)}%` }}
                        >
                          <span className="text-xs text-white font-medium">{stage.count}</span>
                        </div>
                      </div>
                      <div className="w-16 text-right font-mono text-sm">
                        {stage.percentage.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Source Attribution */}
          {kpis?.sourceAttribution && kpis.sourceAttribution.length > 0 && (
            <Card data-testid="card-source-attribution">
              <CardHeader>
                <CardTitle className="text-lg">Source Attribution</CardTitle>
                <CardDescription>Where candidates come from</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {kpis.sourceAttribution.map((source) => (
                    <div key={source.source} className="flex flex-col p-3 bg-muted/50 rounded-lg">
                      <div className="font-medium text-sm capitalize">{source.source}</div>
                      <div className="text-2xl font-bold">{source.count}</div>
                      <div className="text-xs text-muted-foreground">{source.percentage.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pipeline Health - Market Breakdown */}
          {pipelineHealth?.marketBreakdown && pipelineHealth.marketBreakdown.length > 0 && (
            <Card data-testid="card-market-breakdown">
              <CardHeader>
                <CardTitle className="text-lg">Market Breakdown</CardTitle>
                <CardDescription>Application distribution by market</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium">Market</th>
                        <th className="text-right py-2 font-medium">Total</th>
                        <th className="text-right py-2 font-medium">Active</th>
                        <th className="text-right py-2 font-medium">Hired</th>
                        <th className="text-right py-2 font-medium">Conversion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipelineHealth.marketBreakdown.map((m) => (
                        <tr key={m.market} className="border-b last:border-0">
                          <td className="py-2 font-medium">{m.market}</td>
                          <td className="text-right py-2">{m.total}</td>
                          <td className="text-right py-2">{m.active}</td>
                          <td className="text-right py-2 text-green-600">{m.hired}</td>
                          <td className="text-right py-2">
                            {m.total > 0 ? ((m.hired / m.total) * 100).toFixed(1) : 0}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stage Distribution */}
          {pipelineHealth?.stageDistribution && pipelineHealth.stageDistribution.length > 0 && (
            <Card data-testid="card-stage-distribution">
              <CardHeader>
                <CardTitle className="text-lg">Active Pipeline by Stage</CardTitle>
                <CardDescription>Current distribution of active candidates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {pipelineHealth.stageDistribution.map((stage) => (
                    <div key={stage.stage} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                      <span className="font-medium">{formatStageName(stage.stage)}</span>
                      <Badge variant="secondary">{stage.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
      <RecruiterProductivityMetrics />
    </div>
  );
}

function ScorecardViewerDialog({
  applicationId,
  candidateName,
  trigger,
}: {
  applicationId: string;
  candidateName: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const { data: scorecardsData, isLoading } = useQuery<{ scorecards: Scorecard[] }>({
    queryKey: ["/api/recruiting/applications", applicationId, "scorecards"],
    enabled: open,
  });

  const scorecards = scorecardsData?.scorecards || [];

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating
                ? "text-yellow-500 fill-yellow-500"
                : "text-gray-300 dark:text-gray-600"
            }`}
          />
        ))}
        <span className="ml-2 text-sm font-medium">{rating}/5</span>
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto" data-testid="dialog-scorecard-viewer">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Interview Scorecards
          </DialogTitle>
          <DialogDescription>
            All interview feedback for {candidateName}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : scorecards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Scorecards Yet</h3>
            <p className="text-muted-foreground text-sm">
              No interview feedback has been submitted for this application yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {scorecards.map((scorecard) => {
              const TypeIcon = scorecard.interviewType 
                ? interviewTypeIcons[scorecard.interviewType] 
                : Video;
              
              return (
                <Card key={scorecard.id} data-testid={`scorecard-card-${scorecard.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <TypeIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {scorecard.interviewTitle || "Interview"}
                        </span>
                      </div>
                      <Badge 
                        className={recommendationColors[scorecard.recommendation]}
                        data-testid={`badge-recommendation-${scorecard.id}`}
                      >
                        {scorecard.recommendation === "proceed" ? "Proceed" :
                         scorecard.recommendation === "hold" ? "Hold" : "Reject"}
                      </Badge>
                    </div>
                    {scorecard.interviewStartTime && (
                      <CardDescription className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(scorecard.interviewStartTime)}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="text-sm text-muted-foreground">Overall Rating</label>
                      {renderStars(scorecard.overallRating)}
                    </div>
                    
                    {scorecard.notes && (
                      <div>
                        <label className="text-sm text-muted-foreground">Notes</label>
                        <p className="text-sm mt-1 whitespace-pre-wrap">{scorecard.notes}</p>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                      <span>
                        {scorecard.interviewerName ? `By ${scorecard.interviewerName}` : "Anonymous"}
                      </span>
                      <span>Submitted {formatDate(scorecard.submittedAt)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-close-scorecard-viewer">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScorecardSubmitDialog({
  interviewId,
  interviewTitle,
  trigger,
  onSuccess,
}: {
  interviewId: string;
  interviewTitle?: string;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: existingScorecard, isLoading: checkingExisting } = useQuery<{ scorecard: Scorecard | null }>({
    queryKey: ["/api/recruiting/interviews", interviewId, "scorecards", "my"],
    enabled: open,
  });

  const form = useForm<ScorecardSubmitForm>({
    resolver: zodResolver(scorecardSubmitSchema),
    defaultValues: {
      overallRating: 3,
      recommendation: "proceed",
      notes: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: ScorecardSubmitForm) => {
      const response = await apiRequest("POST", `/api/recruiting/interviews/${interviewId}/scorecards`, data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to submit scorecard");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Scorecard Submitted",
        description: "Your interview feedback has been recorded.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/interviews", interviewId, "scorecards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
      setOpen(false);
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit scorecard. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ScorecardSubmitForm) => {
    submitMutation.mutate(data);
  };

  const hasExistingScorecard = !!existingScorecard?.scorecard;
  const selectedRating = form.watch("overallRating");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-scorecard-submit">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Submit Interview Feedback
          </DialogTitle>
          <DialogDescription>
            {interviewTitle ? `Feedback for: ${interviewTitle}` : "Provide your feedback for this interview"}
          </DialogDescription>
        </DialogHeader>

        {checkingExisting ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : hasExistingScorecard ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Already Submitted</h3>
            <p className="text-muted-foreground text-sm">
              You have already submitted feedback for this interview.
            </p>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="overallRating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Overall Rating</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        defaultValue={field.value.toString()}
                        className="flex gap-4"
                        data-testid="radio-group-rating"
                      >
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <div key={rating} className="flex flex-col items-center gap-1">
                            <RadioGroupItem
                              value={rating.toString()}
                              id={`rating-${rating}`}
                              className="sr-only"
                            />
                            <Label
                              htmlFor={`rating-${rating}`}
                              className={`cursor-pointer p-2 rounded-lg border-2 transition-colors ${
                                selectedRating === rating
                                  ? "border-primary bg-primary/10"
                                  : "border-transparent hover:border-muted"
                              }`}
                              data-testid={`label-rating-${rating}`}
                            >
                              <Star
                                className={`h-6 w-6 ${
                                  rating <= selectedRating
                                    ? "text-yellow-500 fill-yellow-500"
                                    : "text-gray-300"
                                }`}
                              />
                            </Label>
                            <span className="text-xs">{rating}</span>
                          </div>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recommendation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Recommendation</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-recommendation">
                          <SelectValue placeholder="Select recommendation" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="proceed">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            Proceed - Move forward with this candidate
                          </div>
                        </SelectItem>
                        <SelectItem value="hold">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                            Hold - Need more information or interviews
                          </div>
                        </SelectItem>
                        <SelectItem value="reject">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            Reject - Not a good fit
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Share your observations, feedback, and any additional notes..."
                        rows={4}
                        {...field}
                        data-testid="textarea-scorecard-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  data-testid="button-cancel-scorecard"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-scorecard"
                >
                  {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Feedback
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CandidateOperationalList({ candidates }: { candidates: any[] }) {
  const formatAddress = (candidate: any) => [
    candidate.address,
    [candidate.city, candidate.state].filter(Boolean).join(", "),
    candidate.zipCode,
  ].filter(Boolean).join(", ");

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-base">{candidates.length} Candidate{candidates.length === 1 ? "" : "s"}</CardTitle>
        <CardDescription>Compact operational list for scanning and opening Candidate records.</CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>DOB</TableHead>
              <TableHead>Recruiting Market</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map(candidate => (
              <TableRow key={candidate.id} data-testid={`candidate-row-${candidate.id}`}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/recruiting/candidates/${candidate.id}`} className="hover:underline">
                      {[candidate.firstName, candidate.middleName, candidate.lastName].filter(Boolean).join(" ")}
                    </Link>
                    <DnrBadge candidateId={candidate.id} />
                    <RiskFlagBadge candidateId={candidate.id} />
                  </div>
                </TableCell>
                <TableCell>
                  <div>{candidate.email}</div>
                  <div className="text-xs text-muted-foreground">{formatPhone(candidate.phone) || "—"}</div>
                </TableCell>
                <TableCell className="max-w-[220px] truncate" title={formatAddress(candidate)}>{formatAddress(candidate) || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{candidate.dateOfBirth ? parseDateSafe(candidate.dateOfBirth)?.toLocaleDateString() || "—" : "—"}</TableCell>
                <TableCell>{(candidate.preferredMarkets || []).join(", ") || "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {candidate.status && <Badge variant="secondary" className="capitalize">{String(candidate.status).replace(/_/g, " ")}</Badge>}
                    {candidate.isArchived && <Badge variant="outline">Archived</Badge>}
                    <TrainingStatusBadge candidateId={candidate.id} />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {candidate.isArchived ? (
                    <CandidateReactivation
                      candidateId={candidate.id}
                      candidateName={`${candidate.firstName} ${candidate.lastName}`}
                      isArchived
                      onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/candidates"] })}
                    />
                  ) : (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/recruiting/candidates/${candidate.id}`}>View</Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function CandidateDetailView({ candidateId, onBack }: { candidateId: string; onBack: () => void }) {
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [selectedRequisitionId, setSelectedRequisitionId] = useState("");
  const { toast } = useToast();

  const { data: candidate, isLoading } = useQuery<any>({
    queryKey: ["/api/recruiting/candidates", candidateId],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/candidates/${candidateId}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: applications, refetch: refetchApplications } = useQuery<any[]>({
    queryKey: ["/api/recruiting/applications", { candidateId }],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications?candidateId=${candidateId}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.applications || [];
    },
  });

  const { data: attachRequisitions = [] } = useQuery<any[]>({
    queryKey: ["/api/recruiting/requisitions"],
    queryFn: async () => {
      const res = await fetch("/api/recruiting/requisitions", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.requisitions || [];
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; email: string; phone: string }) => {
      const res = await apiRequest("PATCH", `/api/corporate/recruiting/candidates/${candidateId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/recruiting/candidates"] });
      setEditOpen(false);
      toast({ title: "Candidate updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const attachMutation = useMutation({
    mutationFn: async (requisitionId: string) => {
      const res = await apiRequest("POST", "/api/recruiting/applications", {
        candidateId,
        requisitionId,
        status: "active",
      });
      return res.json();
    },
    onSuccess: () => {
      refetchApplications();
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
      setAttachOpen(false);
      setSelectedRequisitionId("");
      toast({ title: "Application created", description: "Candidate linked to requisition" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create application", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-to-candidates">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Candidates
        </Button>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-to-candidates">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Candidates
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Candidate not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const initials = `${candidate.firstName?.charAt(0) || ""}${candidate.lastName?.charAt(0) || ""}`.toUpperCase();

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} data-testid="button-back-to-candidates">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Candidates
      </Button>

      <div className="flex items-start gap-6">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="text-lg">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-candidate-name">
            {candidate.firstName} {candidate.lastName}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {candidate.status && (
              <Badge variant="secondary" data-testid="badge-candidate-status">
                {candidate.status}
              </Badge>
            )}
            {candidate.market && (
              <Badge variant="outline" data-testid="badge-candidate-market">
                {candidate.market}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              data-testid="button-edit-candidate"
              onClick={() => {
                setEditForm({
                  firstName: candidate.firstName || "",
                  lastName: candidate.lastName || "",
                  email: candidate.email || "",
                  phone: candidate.phone || "",
                });
                setEditOpen(true);
              }}
            >
              <Pencil className="mr-2 h-3 w-3" />
              Edit Profile
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="button-attach-requisition"
              onClick={() => setAttachOpen(true)}
            >
              <Plus className="mr-2 h-3 w-3" />
              Attach to Requisition
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Candidate</DialogTitle>
            <DialogDescription>Update candidate identity fields</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                  data-testid="input-edit-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                  data-testid="input-edit-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                data-testid="input-edit-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={() => editMutation.mutate(editForm)}
              disabled={editMutation.isPending || !editForm.firstName.trim() || !editForm.lastName.trim()}
              data-testid="button-save-candidate"
            >
              {editMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach to Requisition</DialogTitle>
            <DialogDescription>Create an application linking this candidate to a job posting</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Job Posting</Label>
              <Select value={selectedRequisitionId} onValueChange={setSelectedRequisitionId}>
                <SelectTrigger data-testid="select-requisition">
                  <SelectValue placeholder="Choose a requisition..." />
                </SelectTrigger>
                <SelectContent>
                  {attachRequisitions.filter((r: any) => r.status === "open" || r.status === "active").map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)} data-testid={`select-item-req-${r.id}`}>
                      {r.title} {r.market ? `(${r.market})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachOpen(false)}>Cancel</Button>
            <Button
              onClick={() => attachMutation.mutate(selectedRequisitionId)}
              disabled={attachMutation.isPending || !selectedRequisitionId}
              data-testid="button-confirm-attach"
            >
              {attachMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {candidate.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span data-testid="text-candidate-email">{candidate.email}</span>
              </div>
            )}
            {candidate.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span data-testid="text-candidate-phone">{formatPhone(candidate.phone)}</span>
              </div>
            )}
            {candidate.city && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span data-testid="text-candidate-location">
                  {[candidate.city, candidate.state].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {candidate.source && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span data-testid="text-candidate-source">{CANDIDATE_SOURCE_LABELS[candidate.source] ?? candidate.source}</span>
              </div>
            )}
            {candidate.sourceDetails && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source details</span>
                <span className="text-right max-w-[60%] text-sm">{candidate.sourceDetails}</span>
              </div>
            )}
            {candidate.currentCompany && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Company</span>
                <span>{candidate.currentCompany}</span>
              </div>
            )}
            {candidate.yearsExperience != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Years Experience</span>
                <span>{candidate.yearsExperience}</span>
              </div>
            )}
            {candidate.createdAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Added</span>
                <span>{new Date(candidate.createdAt).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {applications && applications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Applications</CardTitle>
            <CardDescription>{applications.length} application(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {applications.map((app: any) => (
                <div key={app.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <div className="font-medium" data-testid={`text-app-title-${app.id}`}>
                      {app.requisitionTitle || "Untitled Position"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Applied {app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : "N/A"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge variant="secondary" data-testid={`badge-app-stage-${app.id}`}>
                      {app.currentStage || "new"}
                    </Badge>
                    {app.requestedQuickCall && (
                      <Badge variant="outline" className="gap-1 border-primary/40 text-primary" data-testid={`badge-quick-call-${app.id}`}>
                        <Phone className="h-3 w-3" />
                        Quick Call
                      </Badge>
                    )}
                    {app.introMediaType === "audio" && (
                      <Badge variant="outline" className="gap-1" data-testid={`badge-intake-audio-${app.id}`}>
                        <Mic className="h-3 w-3" />
                        Audio Intro
                      </Badge>
                    )}
                    {(app.introMediaType === "video" || (app.intakePath === "video_optional" && app.introMediaType !== "audio")) && (
                      <Badge variant="outline" className="gap-1" data-testid={`badge-intake-video-${app.id}`}>
                        <Video className="h-3 w-3" />
                        {app.hasIntroVideo ? "Video Intro" : "Video Path"}
                      </Badge>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => onBack()} asChild>
                      <Link href={`/recruiting/applications/${app.id}`}>
                        View
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <RecruitingNotes
        entityType="candidate"
        entityId={candidateId}
        title="Candidate Notes"
        userRole={user?.role}
      />
    </div>
  );
}

function RequisitionDetailView({ requisitionId, onBack }: { requisitionId: string; onBack: () => void }) {
  const { data: requisition, isLoading } = useQuery<any>({
    queryKey: ["/api/corporate/recruiting/requisitions", requisitionId],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/recruiting/requisitions`, { credentials: "include" });
      if (!res.ok) return null;
      const reqs = await res.json();
      return reqs.find((r: any) => String(r.id) === String(requisitionId)) || null;
    },
  });

  const { data: applications } = useQuery<any[]>({
    queryKey: ["/api/recruiting/applications", { requisitionId }],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications?requisitionId=${requisitionId}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.applications || [];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-to-requisitions">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Requisitions
        </Button>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!requisition) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-to-requisitions">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Requisitions
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Requisition not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stageColors: Record<string, string> = {
    new: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    screening: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    interview: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    offer: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    hired: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
    withdrawn: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} data-testid="button-back-to-requisitions">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Requisitions
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-requisition-title">
          {requisition.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <Badge variant="secondary">{requisition.status || "open"}</Badge>
          {requisition.department && <Badge variant="outline">{requisition.department}</Badge>}
          {requisition.location && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {requisition.location}
            </span>
          )}
        </div>
      </div>

      {requisition.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{requisition.description}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Audience Strategy Tags (Ticket 20) ── */}
      <AudienceStrategyTagger
        requisitionId={requisition.id}
        currentTags={requisition.audienceStrategyTags ?? []}
      />

      {/* ── AI Pay Recommendation (Ticket 16) ── */}
      <PayRecommendationWidget
        requisitionId={requisition.id}
        requisition={{
          market: requisition.market,
          workerType: requisition.workerType,
          requisitionType: requisition.requisitionType,
          requiredLicenseClass: requisition.requiredLicenseClass,
          compensationMin: requisition.compensationMin,
          compensationMax: requisition.compensationMax,
          compensationType: requisition.compensationType,
          targetFillDate: requisition.targetFillDate,
        }}
      />

      {/* ── AI Ad Source Recommendation (Ticket 17) ── */}
      <AdRecommendationWidget
        requisitionId={requisition.id}
        requisition={{
          market: requisition.market,
          workerType: requisition.workerType,
          requisitionType: requisition.requisitionType,
          requiredLicenseClass: requisition.requiredLicenseClass,
        }}
        audienceStrategyTags={requisition.audienceStrategyTags ?? []}
      />

      {/* ── Multi-Channel Distribution Planner (Ticket 18) ── */}
      <ChannelDistributionPlanner
        requisitionId={requisition.id}
        audienceStrategyTags={requisition.audienceStrategyTags ?? []}
      />

      {/* ── Job Ad Template + Draft Editor (Ticket 39) ── */}
      <JobAdPanel
        requisitionId={requisition.id}
        requisition={requisition}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Applications</CardTitle>
            <CardDescription>{applications?.length || 0} application(s) for this position</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {applications && applications.length > 0 ? (
            <div className="space-y-3">
              {applications.map((app: any) => (
                <div key={app.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {`${app.candidateFirstName?.charAt(0) || ""}${app.candidateLastName?.charAt(0) || ""}`.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium" data-testid={`text-applicant-name-${app.id}`}>
                        {app.candidateFirstName} {app.candidateLastName}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Applied {app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : "N/A"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={stageColors[app.currentStage] || ""} data-testid={`badge-app-stage-${app.id}`}>
                      {app.currentStage || "new"}
                    </Badge>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/recruiting/candidates/${app.candidateId}`}>
                        View Candidate
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">No applications yet for this position.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── AI Pre-Screen Scoring Components ─────────────────────────────────────────

const AI_REC_CONFIG = {
  advance: { label: "Advance", color: "text-green-700 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/40", border: "border-green-300 dark:border-green-700" },
  review: { label: "Review", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-amber-300 dark:border-amber-700" },
  reject_recommended: { label: "Reject Rec.", color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/40", border: "border-red-300 dark:border-red-700" },
} as const;

function AiPrescreenBadge({ score, recommendation, applicationId }: { score: number | null; recommendation: string; applicationId: string }) {
  const cfg = AI_REC_CONFIG[recommendation as keyof typeof AI_REC_CONFIG] || AI_REC_CONFIG.review;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`text-xs gap-1 ${cfg.bg} ${cfg.color} ${cfg.border}`}
          data-testid={`badge-ai-prescreen-${applicationId}`}
        >
          <Activity className="h-3 w-3" />
          {score != null ? `${score} · ` : ""}{cfg.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        AI Pre-Screen — advisory only. Recruiter makes all final decisions.
      </TooltipContent>
    </Tooltip>
  );
}

// ─── AI Review Queue Card ─────────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  applied: "Applied",
  screening: "Screening",
  phone_screen: "Phone Screen",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

function QueueApplicationCard({
  application,
  onView,
}: {
  application: any;
  onView: (id: string) => void;
}) {
  const score = application.aiPrescreenScore as number | null;
  const recommendation = application.aiPrescreenRecommendation as string | null;
  const summary = application.aiPrescreenSummary as string | null;
  const cfg = recommendation ? (AI_REC_CONFIG[recommendation as keyof typeof AI_REC_CONFIG] || AI_REC_CONFIG.review) : null;

  const fullName = [application.candidateFirstName, application.candidateLastName].filter(Boolean).join(" ") || "Unknown Candidate";
  const market = application.requisition?.market || "—";
  const workerType = application.requisition?.workerType || application.requisition?.workType || null;
  const role = application.requisitionTitle || "—";
  const stage = STAGE_LABELS[application.currentStage] || application.currentStage || "—";
  const readiness = application.readinessScore as number | null;
  const geoEligible = application.geoEligible;
  const distanceMiles = application.distanceMiles;
  const yearsExp = application.candidate?.yearsExperience;
  const licenseClass = application.candidate?.licenseClass;
  const preferredWork = application.candidate?.preferredWorkType;
  const appliedAt = application.appliedAt ? new Date(application.appliedAt) : null;
  const daysAgo = appliedAt ? Math.floor((Date.now() - appliedAt.getTime()) / 86400000) : null;

  const allFlags: any[] = Array.isArray(application.aiRedFlags) ? application.aiRedFlags : [];
  const flagOverrides: any[] = Array.isArray(application.redFlagOverrides) ? application.redFlagOverrides : [];
  const overriddenFlagTypes = new Set(flagOverrides.map((o: any) => o.flagType));
  const activeRedFlags = allFlags.filter((f) => !overriddenFlagTypes.has(f.type));
  const highSeverityFlags = activeRedFlags.filter((f) => f.severity === "high");

  const ringColor =
    !cfg ? "text-muted-foreground" :
    recommendation === "advance" ? "text-green-600 dark:text-green-400" :
    recommendation === "review" ? "text-amber-500" :
    "text-red-600 dark:text-red-400";

  return (
    <Card className="hover-elevate" data-testid={`card-queue-application-${application.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4 flex-wrap">

          {/* AI Score ring */}
          <div className="flex flex-col items-center gap-0.5 shrink-0 w-14" data-testid={`score-${application.id}`}>
            {score != null ? (
              <>
                <span className={`text-3xl font-bold leading-none ${ringColor}`}>{score}</span>
                <span className="text-[10px] text-muted-foreground font-medium">/100</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground text-center leading-tight">No score</span>
            )}
            {cfg && (
              <Badge
                variant="outline"
                className={`mt-1 text-[10px] px-1 py-0 ${cfg.bg} ${cfg.color} ${cfg.border}`}
                data-testid={`badge-rec-${application.id}`}
              >
                {cfg.label}
              </Badge>
            )}
          </div>

          {/* Candidate info + summary */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" data-testid={`name-${application.id}`}>{fullName}</span>
              {application.candidateEmail && (
                <span className="text-xs text-muted-foreground hidden sm:inline">{application.candidateEmail}</span>
              )}
            </div>

            {/* Meta badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {market !== "—" && (
                <Badge variant="outline" className="text-[10px] gap-1 py-0">
                  <MapPin className="h-2.5 w-2.5" />{market}
                </Badge>
              )}
              {role !== "—" && (
                <Badge variant="outline" className="text-[10px] py-0 max-w-[180px] truncate">{role}</Badge>
              )}
              {workerType && (
                <Badge variant="secondary" className="text-[10px] py-0">{workerType}</Badge>
              )}
              <Badge variant="outline" className="text-[10px] py-0">{stage}</Badge>
              {daysAgo != null && (
                <span className="text-[10px] text-muted-foreground">{daysAgo === 0 ? "Today" : `${daysAgo}d ago`}</span>
              )}
              {highSeverityFlags.length > 0 && (
                <Badge variant="destructive" className="text-[10px] py-0 gap-0.5" data-testid={`badge-high-flags-${application.id}`}>
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {highSeverityFlags.length} high flag{highSeverityFlags.length !== 1 ? "s" : ""}
                </Badge>
              )}
              {activeRedFlags.length > 0 && highSeverityFlags.length === 0 && (
                <Badge variant="outline" className="text-[10px] py-0 gap-0.5 text-amber-600 border-amber-500/40" data-testid={`badge-flags-${application.id}`}>
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {activeRedFlags.length} flag{activeRedFlags.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            {/* Availability / profile */}
            <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
              {yearsExp != null && <span>{yearsExp}yr exp</span>}
              {licenseClass && <span>License: {licenseClass}</span>}
              {preferredWork && <span>Prefers {preferredWork.replace(/_/g, " ")}</span>}
              {geoEligible === true && distanceMiles != null && (
                <span className="text-green-600 dark:text-green-400">{distanceMiles}mi — in range</span>
              )}
              {geoEligible === false && distanceMiles != null && (
                <span className="text-destructive">{distanceMiles}mi — out of range</span>
              )}
              {readiness != null && (
                <span>Readiness: <span className={readiness >= 70 ? "text-green-600 dark:text-green-400" : readiness >= 40 ? "text-amber-500" : "text-destructive"}>{readiness}/100</span></span>
              )}
            </div>

            {/* AI summary excerpt */}
            {summary && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5" data-testid={`summary-${application.id}`}>{summary}</p>
            )}
          </div>

          {/* Action */}
          <div className="shrink-0 self-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onView(application.id)}
              data-testid={`btn-view-queue-${application.id}`}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              View
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Red Flag Severity Config ─────────────────────────────────────────────────
const RED_FLAG_SEVERITY_CONFIG = {
  high: { label: "High", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", icon: AlertTriangle },
  medium: { label: "Medium", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: AlertTriangle },
  low: { label: "Low", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: Info },
} as const;

// ─── Red Flag Panel (inside AiPrescreenCard) ───────────────────────────────────
function RedFlagPanel({ application }: { application: any }) {
  const flags: any[] = Array.isArray(application.aiRedFlags) ? application.aiRedFlags : [];
  const overrides: any[] = Array.isArray(application.redFlagOverrides) ? application.redFlagOverrides : [];
  const overriddenTypes = new Set(overrides.map((o: any) => o.flagType));

  const [overrideTarget, setOverrideTarget] = useState<any | null>(null);
  const [overrideNote, setOverrideNote] = useState("");

  const overrideMutation = useMutation({
    mutationFn: async ({ flagType, note }: { flagType: string; note: string }) => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${application.id}/override-red-flag`, { flagType, overrideNote: note });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", application.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
      setOverrideTarget(null);
      setOverrideNote("");
    },
  });

  const removeOverrideMutation = useMutation({
    mutationFn: async (flagType: string) => {
      const res = await apiRequest("DELETE", `/api/recruiting/applications/${application.id}/override-red-flag/${flagType}`, undefined);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", application.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
    },
  });

  const rerunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${application.id}/rerun-red-flags`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", application.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
    },
  });

  if (flags.length === 0 && !application.aiRedFlagsDetectedAt) return null;

  const activeFlags = flags.filter((f) => !overriddenTypes.has(f.type));
  const dismissedFlags = flags.filter((f) => overriddenTypes.has(f.type));
  const detectedAt = application.aiRedFlagsDetectedAt ? new Date(application.aiRedFlagsDetectedAt).toLocaleDateString() : null;

  return (
    <>
      {/* Override dialog */}
      <Dialog open={!!overrideTarget} onOpenChange={(open) => { if (!open) { setOverrideTarget(null); setOverrideNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Override Red Flag
            </DialogTitle>
            <DialogDescription>
              You are marking this flag as reviewed and dismissing it. This is logged for audit purposes.
            </DialogDescription>
          </DialogHeader>
          {overrideTarget && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 bg-muted/30 space-y-1">
                <p className="text-sm font-semibold">{overrideTarget.label}</p>
                <p className="text-xs text-muted-foreground">{overrideTarget.detail}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Override reason (required)</label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  placeholder="Explain why this flag is being dismissed…"
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  data-testid="input-override-note"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setOverrideTarget(null); setOverrideNote(""); }}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => overrideMutation.mutate({ flagType: overrideTarget.type, note: overrideNote })}
              disabled={overrideMutation.isPending || !overrideNote.trim()}
              data-testid="btn-confirm-override"
            >
              {overrideMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Dismiss Flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Panel */}
      <div className="mt-4 pt-4 border-t space-y-3" data-testid="section-red-flags">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold">Red Flags</span>
            {activeFlags.length > 0 && (
              <Badge variant="destructive" className="text-xs" data-testid="badge-active-flag-count">{activeFlags.length} active</Badge>
            )}
            {dismissedFlags.length > 0 && (
              <Badge variant="secondary" className="text-xs">{dismissedFlags.length} dismissed</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {detectedAt && <span className="text-xs text-muted-foreground">Detected {detectedAt}</span>}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => rerunMutation.mutate()}
              disabled={rerunMutation.isPending}
              data-testid="btn-rerun-red-flags"
            >
              {rerunMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              <span className="ml-1 text-xs">Re-detect</span>
            </Button>
          </div>
        </div>

        {/* Advisory */}
        <div className="flex items-start gap-2 rounded-md bg-muted/40 border px-3 py-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-tight">
            Red flags are advisory signals detected from structured profile data. They do not automatically reject candidates. Recruiter review and override authority always applies.
          </p>
        </div>

        {flags.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            No red flags detected for this application.
          </div>
        ) : (
          <div className="space-y-2">
            {/* Active flags */}
            {activeFlags.map((flag: any) => {
              const sev = RED_FLAG_SEVERITY_CONFIG[flag.severity as keyof typeof RED_FLAG_SEVERITY_CONFIG] || RED_FLAG_SEVERITY_CONFIG.medium;
              const SevIcon = sev.icon;
              return (
                <div
                  key={flag.type}
                  className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${sev.bg} ${sev.border}`}
                  data-testid={`flag-${flag.type}`}
                >
                  <SevIcon className={`h-4 w-4 shrink-0 mt-0.5 ${sev.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${sev.color}`}>{flag.label}</span>
                      <Badge variant="outline" className={`text-[10px] py-0 ${sev.color} ${sev.border}`}>{sev.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{flag.detail}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-xs"
                    onClick={() => { setOverrideTarget(flag); setOverrideNote(""); }}
                    data-testid={`btn-dismiss-flag-${flag.type}`}
                  >
                    Dismiss
                  </Button>
                </div>
              );
            })}

            {/* Dismissed flags */}
            {dismissedFlags.map((flag: any) => {
              const override = overrides.find((o: any) => o.flagType === flag.type);
              return (
                <div
                  key={flag.type}
                  className="flex items-start gap-3 rounded-md border px-3 py-2.5 opacity-50 bg-muted/30"
                  data-testid={`flag-dismissed-${flag.type}`}
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium line-through text-muted-foreground">{flag.label}</span>
                      <Badge variant="secondary" className="text-[10px] py-0">Dismissed</Badge>
                    </div>
                    {override?.overrideNote && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug italic">"{override.overrideNote}"</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-xs"
                    onClick={() => removeOverrideMutation.mutate(flag.type)}
                    disabled={removeOverrideMutation.isPending}
                    data-testid={`btn-restore-flag-${flag.type}`}
                  >
                    Restore
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function AiPrescreenCard({ application }: { application: any }) {
  const score = application.aiPrescreenScore as number | null;
  const recommendation = application.aiPrescreenRecommendation as string | null;
  const summary = application.aiPrescreenSummary as string | null;
  const generatedAt = application.aiPrescreenGeneratedAt as string | null;

  const rerunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${application.id}/rerun-prescreen`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", application.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
    },
  });

  const hasScore = score != null && recommendation;
  const cfg = recommendation ? (AI_REC_CONFIG[recommendation as keyof typeof AI_REC_CONFIG] || AI_REC_CONFIG.review) : null;

  // Score ring color
  const ringColor = !cfg ? "text-muted-foreground" : recommendation === "advance" ? "text-green-600 dark:text-green-400" : recommendation === "review" ? "text-amber-500" : "text-red-600 dark:text-red-400";

  // Active red flags for header count
  const allFlags: any[] = Array.isArray(application.aiRedFlags) ? application.aiRedFlags : [];
  const overrides: any[] = Array.isArray(application.redFlagOverrides) ? application.redFlagOverrides : [];
  const overriddenTypes = new Set(overrides.map((o: any) => o.flagType));
  const activeRedFlagCount = allFlags.filter((f) => !overriddenTypes.has(f.type)).length;

  return (
    <Card data-testid="card-ai-prescreen">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            AI Pre-Screen Score
            {activeRedFlagCount > 0 && (
              <Badge variant="destructive" className="text-xs ml-1" data-testid="badge-header-flag-count">
                {activeRedFlagCount} flag{activeRedFlagCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {generatedAt && (
              <span className="text-xs text-muted-foreground">
                {new Date(generatedAt).toLocaleDateString()}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => rerunMutation.mutate()}
              disabled={rerunMutation.isPending}
              data-testid="btn-rerun-prescreen"
            >
              {rerunMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1.5">{rerunMutation.isPending ? "Scoring…" : "Re-run"}</span>
            </Button>
          </div>
        </div>
        {/* Advisory disclaimer */}
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 mt-1">
          <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-tight">
            <span className="font-semibold">Advisory only.</span> This score is a non-decisional aid. The recruiter remains the sole decision-maker for all hiring outcomes.
          </p>
        </div>
      </CardHeader>

      <CardContent>
        {!hasScore ? (
          <div className="flex items-center gap-3 py-3 text-muted-foreground" data-testid="text-prescreen-pending">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-medium">Scoring in progress</p>
              <p className="text-xs">The AI pre-screen score is being generated. Refresh or use Re-run to check.</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-6 items-start flex-wrap">
            {/* Score ring */}
            <div className="flex flex-col items-center gap-1 shrink-0" data-testid="section-prescreen-score">
              <div className={`text-5xl font-bold tracking-tight leading-none ${ringColor}`}>
                {score}
              </div>
              <div className="text-xs text-muted-foreground font-medium">/ 100</div>
              {cfg && (
                <Badge
                  variant="outline"
                  className={`mt-1 text-xs ${cfg.bg} ${cfg.color} ${cfg.border}`}
                  data-testid="badge-prescreen-recommendation"
                >
                  {cfg.label}
                </Badge>
              )}
            </div>

            {/* Divider */}
            <div className="w-px self-stretch bg-border hidden sm:block" />

            {/* Summary */}
            <div className="flex-1 min-w-0" data-testid="text-prescreen-summary">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">AI Summary</p>
              <p className="text-sm text-foreground leading-relaxed">{summary || "No summary available."}</p>
            </div>
          </div>
        )}

        {/* Red Flag Panel */}
        <RedFlagPanel application={application} />
      </CardContent>
    </Card>
  );
}

// ─── AI Intro Analysis Card ───────────────────────────────────────────────────

function IntroAiAnalysisCard({ application }: { application: any }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const summary = application.introAiSummary as Record<string, string> | null;
  const transcript = application.introTranscript as string | null;
  const hasSummary = summary && summary.drivingExperience;
  const isPending = !transcript && !hasSummary;

  const summaryItems = hasSummary
    ? [
        { label: "Driving Experience", value: summary.drivingExperience, icon: <Car className="h-4 w-4 text-primary" /> },
        { label: "Availability Signals", value: summary.availability, icon: <Clock className="h-4 w-4 text-primary" /> },
        { label: "Communication Style", value: summary.confidenceClarity, icon: <MessageSquare className="h-4 w-4 text-primary" /> },
        { label: "Recruiter Notes", value: summary.redFlags, icon: <AlertCircle className="h-4 w-4 text-amber-500" /> },
      ]
    : [];

  return (
    <Card data-testid="card-intro-ai-analysis">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            AI Intro Analysis
          </CardTitle>
          {hasSummary && summary.generatedAt && (
            <span className="text-xs text-muted-foreground">
              Generated {new Date(summary.generatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        {/* Advisory disclaimer */}
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 mt-1">
          <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-tight">
            <span className="font-semibold">Advisory only.</span> This AI analysis is a non-decisional aid for recruiters. No automated hiring decisions are made from this data.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isPending ? (
          <div className="flex items-center gap-3 py-4 text-muted-foreground" data-testid="text-analysis-pending">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-medium">Analysis in progress</p>
              <p className="text-xs">Transcription and AI summary are being generated. Refresh in a moment.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary grid */}
            {hasSummary && (
              <div className="grid gap-3 sm:grid-cols-2" data-testid="section-ai-summary">
                {summaryItems.map((item) => (
                  <div key={item.label} className="rounded-md border p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      {item.icon}
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{item.label}</span>
                    </div>
                    <p className="text-sm text-foreground leading-snug">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Transcript */}
            {transcript && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowTranscript((v) => !v)}
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                  data-testid="button-toggle-transcript"
                >
                  <FileText className="h-4 w-4" />
                  Full Transcript
                  <ChevronDown className={`h-4 w-4 transition-transform ${showTranscript ? "rotate-180" : ""}`} />
                </button>
                {showTranscript && (
                  <div className="mt-2 rounded-md border bg-muted/30 p-3 max-h-64 overflow-y-auto" data-testid="text-transcript-content">
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{transcript}</p>
                  </div>
                )}
              </div>
            )}

            {!hasSummary && transcript && (
              <p className="text-xs text-muted-foreground">AI summary is being generated — transcript is ready above.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SlaTimerCard({ application }: { application: any }) {
  const { data: slaThresholds } = useQuery<any[]>({
    queryKey: ["/api/recruiting/sla-thresholds"],
    queryFn: async () => {
      const res = await fetch("/api/recruiting/sla-thresholds", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const terminalStages = ["hired", "rejected", "withdrawn"];
  if (terminalStages.includes(application.currentStage)) return null;

  const stageEnteredAt = application.currentStageEnteredAt ? new Date(application.currentStageEnteredAt) : null;
  if (!stageEnteredAt) return null;

  const now = new Date();
  const hoursInStage = Math.floor((now.getTime() - stageEnteredAt.getTime()) / (1000 * 60 * 60));
  const daysInStage = Math.floor(hoursInStage / 24);
  const remainingHours = hoursInStage % 24;

  const stageSla = slaThresholds?.find((t: any) => t.stageKey === application.currentStage);
  const slaEnabled = stageSla?.isEnabled;
  const thresholdHours = stageSla?.thresholdHours || 0;
  const isOverdue = slaEnabled && hoursInStage > thresholdHours;
  const thresholdDays = Math.floor(thresholdHours / 24);
  const thresholdRemHours = thresholdHours % 24;

  const timeDisplay = daysInStage > 0 ? `${daysInStage}d ${remainingHours}h` : `${remainingHours}h`;
  const thresholdDisplay = thresholdDays > 0 ? `${thresholdDays}d ${thresholdRemHours}h` : `${thresholdRemHours}h`;

  const progressPercent = slaEnabled && thresholdHours > 0 ? Math.min((hoursInStage / thresholdHours) * 100, 100) : 0;

  return (
    <Card data-testid="card-sla-timer">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Timer className="h-5 w-5" />
          Time in Stage
        </CardTitle>
        {isOverdue && (
          <Badge variant="destructive" data-testid="badge-sla-overdue">
            SLA Overdue
          </Badge>
        )}
        {slaEnabled && !isOverdue && (
          <Badge variant="secondary" data-testid="badge-sla-on-track">
            On Track
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className={`text-2xl font-bold ${isOverdue ? "text-destructive" : ""}`} data-testid="text-time-in-stage">
                {timeDisplay}
              </div>
              <div className="text-sm text-muted-foreground">
                Since {stageEnteredAt.toLocaleDateString()} {stageEnteredAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </div>
            </div>
            {slaEnabled && (
              <div className="text-right">
                <div className="text-sm text-muted-foreground">SLA Limit</div>
                <div className="font-medium" data-testid="text-sla-threshold">{thresholdDisplay}</div>
              </div>
            )}
          </div>
          {slaEnabled && thresholdHours > 0 && (
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-muted overflow-hidden" data-testid="sla-progress-bar">
                <div
                  className={`h-full rounded-full transition-all ${isOverdue ? "bg-destructive" : progressPercent > 75 ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{Math.round(progressPercent)}% of SLA used</span>
                {isOverdue && (
                  <span className="text-destructive font-medium" data-testid="text-sla-overdue-by">
                    Overdue by {Math.floor((hoursInStage - thresholdHours) / 24)}d {(hoursInStage - thresholdHours) % 24}h
                  </span>
                )}
              </div>
            </div>
          )}
          {!slaEnabled && (
            <div className="text-sm text-muted-foreground">
              No SLA threshold configured for this stage.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Phone Screen Result badge ─────────────────────────────────────────────────
function PhoneScreenResultBadge({ result }: { result: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    proceed: "default",
    hold: "secondary",
    reject: "destructive",
  };
  return (
    <Badge variant={variants[result] ?? "outline"} data-testid={`badge-phone-screen-result-${result}`}>
      {PHONE_SCREEN_RESULT_LABELS[result as PhoneScreenResult] ?? result}
    </Badge>
  );
}

// ── CDL Requirements Checklist (Ticket 25) ────────────────────────────────────
function CdlChecklistPanel({ application, documentRequests }: { application: any; documentRequests: any[] }) {
  const requisition = application?.requisition;
  if (!requisition?.cdlRequired) return null;

  const candidate = application?.candidate;
  const licenseClass = candidate?.licenseClass;
  const isValidCDL = ['A', 'B', 'C'].includes(licenseClass || '');
  const licExpDate = candidate?.licenseExpiration ? parseDateSafe(candidate.licenseExpiration) : null;
  const licenseExpired = licExpDate ? licExpDate.getTime() < Date.now() : false;
  const licenseEligible = application?.licenseEligible;

  const requiredEndorsements: string[] = requisition?.requiredEndorsements || [];
  const candidateEndorsements: string[] = candidate?.endorsements || [];
  const missingEndorsements = requiredEndorsements.filter((e: string) => !candidateEndorsements.includes(e));

  const hasApprovedDoc = (types: string[]) => {
    if (!documentRequests || documentRequests.length === 0) return false;
    return documentRequests.some((d: any) =>
      types.includes(d.documentType) && (d.status === "approved" || d.uploadedFileName)
    );
  };

  const checklistItems: { label: string; passed: boolean; detail?: string }[] = [
    {
      label: "CDL License Class",
      passed: isValidCDL,
      detail: licenseClass ? `Class ${licenseClass}` : "No CDL class on file",
    },
    {
      label: "License Eligible",
      passed: licenseEligible !== false,
      detail: licenseEligible === true
        ? "Meets requisition requirements"
        : licenseEligible === false
        ? application?.licenseMismatchReason || "Does not meet requirements"
        : "Not yet verified",
    },
    {
      label: "License Not Expired",
      passed: isValidCDL && !licenseExpired,
      detail: licExpDate
        ? licenseExpired
          ? `Expired ${licExpDate.toLocaleDateString()}`
          : `Expires ${licExpDate.toLocaleDateString()}`
        : "No expiration date on file",
    },
    ...(requiredEndorsements.length > 0
      ? [{
          label: "Required Endorsements",
          passed: missingEndorsements.length === 0,
          detail: missingEndorsements.length === 0
            ? `Has: ${requiredEndorsements.join(', ')}`
            : `Missing: ${missingEndorsements.join(', ')}`,
        }]
      : []),
    {
      label: "CDL Copy",
      passed: hasApprovedDoc(["cdl_copy"]),
      detail: hasApprovedDoc(["cdl_copy"]) ? "Document received" : "Not yet collected",
    },
    {
      label: "Medical Certificate",
      passed: hasApprovedDoc(["medical_card"]),
      detail: hasApprovedDoc(["medical_card"]) ? "Document received" : "Not yet collected",
    },
    {
      label: "DOT Physical",
      passed: hasApprovedDoc(["dot_physical"]),
      detail: hasApprovedDoc(["dot_physical"]) ? "Document received" : "Not yet collected",
    },
    {
      label: "MVR Report",
      passed: hasApprovedDoc(["mvr_report"]),
      detail: hasApprovedDoc(["mvr_report"]) ? "Document received" : "Not yet collected",
    },
    {
      label: "Drug Screen",
      passed: hasApprovedDoc(["drug_test"]),
      detail: hasApprovedDoc(["drug_test"]) ? "Document received" : "Not yet collected",
    },
    {
      label: "Background Check",
      passed: application?.backgroundCheckStatus === "passed",
      detail:
        application?.backgroundCheckStatus === "passed"
          ? "Passed"
          : application?.backgroundCheckStatus === "failed"
          ? "Failed"
          : application?.backgroundCheckStatus === "in_progress"
          ? "In progress"
          : "Not started",
    },
  ];

  const passedCount = checklistItems.filter((i) => i.passed).length;
  const totalCount = checklistItems.length;
  const allPassed = passedCount === totalCount;

  return (
    <Card data-testid="card-cdl-checklist">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <IdCard className="h-4 w-4" />
            CDL Requirements Checklist
          </CardTitle>
          <Badge
            variant={allPassed ? "default" : passedCount > totalCount / 2 ? "secondary" : "outline"}
            data-testid="badge-cdl-checklist-progress"
          >
            {passedCount}/{totalCount} Complete
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          This is a CDL-required position. All items must be satisfied before the candidate advances to final approval.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {checklistItems.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 py-2 border-b last:border-0"
              data-testid={`cdl-checklist-item-${idx}`}
            >
              <div className="mt-0.5 shrink-0">
                {item.passed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${item.passed ? "" : "text-muted-foreground"}`}>
                  {item.label}
                </p>
                {item.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Phone Screen Panel (Ticket 24) ────────────────────────────────────────────
function PhoneScreenPanel({ applicationId }: { applicationId: string }) {
  const { toast } = useToast();
  const queryClient2 = queryClient;
  const [open, setOpen] = useState(false);
  const [qDrivingExperience, setQDrivingExperience] = useState("");
  const [qAvailability, setQAvailability] = useState("");
  const [qVehicleComfort, setQVehicleComfort] = useState("");
  const [qScheduleFlexibility, setQScheduleFlexibility] = useState("");
  const [result, setResult] = useState<PhoneScreenResult | "">("");
  const [notes, setNotes] = useState("");

  const { data: screens = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/recruiting/applications/${applicationId}/phone-screens`],
    enabled: true,
  });

  const logMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("Please select a result before saving.");
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/phone-screens`, {
        qDrivingExperience: qDrivingExperience || undefined,
        qAvailability: qAvailability || undefined,
        qVehicleComfort: qVehicleComfort || undefined,
        qScheduleFlexibility: qScheduleFlexibility || undefined,
        result,
        notes: notes || undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "Failed to log phone screen");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient2.invalidateQueries({ queryKey: [`/api/recruiting/applications/${applicationId}/phone-screens`] });
      queryClient2.invalidateQueries({ queryKey: [`/api/recruiting/applications/${applicationId}`] });
      toast({ title: "Phone screen logged", description: `Result: ${PHONE_SCREEN_RESULT_LABELS[result as PhoneScreenResult]}` });
      setOpen(false);
      setQDrivingExperience("");
      setQAvailability("");
      setQVehicleComfort("");
      setQScheduleFlexibility("");
      setResult("");
      setNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to log phone screen", variant: "destructive" });
    },
  });

  const formatScreenDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    } catch { return dateStr; }
  };

  return (
    <Card data-testid="card-phone-screen-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-primary" />
            Phone Screen
          </CardTitle>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="button-log-phone-screen">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Log Phone Screen
          </Button>
        </div>
        <CardDescription className="text-xs mt-1">
          Structured phone-screen path for low-tech applicants. Each screen is recorded in application history.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : screens.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2" data-testid="text-no-phone-screens">
            No phone screens logged yet.
          </p>
        ) : (
          <div className="space-y-3">
            {screens.map((screen: any, idx: number) => (
              <div key={screen.id} className="border border-border rounded-md p-3 space-y-2" data-testid={`row-phone-screen-${screen.id}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <PhoneScreenResultBadge result={screen.result} />
                    <span className="text-xs text-muted-foreground">{formatScreenDate(screen.conducted_at)}</span>
                  </div>
                  {screen.conducted_by_name && (
                    <span className="text-xs text-muted-foreground">by {screen.conducted_by_name}</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {screen.q_driving_experience && (
                    <div>
                      <span className="font-medium text-muted-foreground">Driving Experience: </span>
                      <span>{screen.q_driving_experience}</span>
                    </div>
                  )}
                  {screen.q_availability && (
                    <div>
                      <span className="font-medium text-muted-foreground">Availability: </span>
                      <span>{screen.q_availability}</span>
                    </div>
                  )}
                  {screen.q_vehicle_comfort && (
                    <div>
                      <span className="font-medium text-muted-foreground">Vehicle Comfort: </span>
                      <span>{screen.q_vehicle_comfort}</span>
                    </div>
                  )}
                  {screen.q_schedule_flexibility && (
                    <div>
                      <span className="font-medium text-muted-foreground">Schedule Flexibility: </span>
                      <span>{screen.q_schedule_flexibility}</span>
                    </div>
                  )}
                </div>
                {screen.notes && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-1">{screen.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Log Phone Screen Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-phone-screen">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-primary" />
              Log Phone Screen
            </DialogTitle>
            <DialogDescription>
              Complete the structured phone screen and record the outcome.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Q1 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="ps-q1">
                Driving Experience
              </label>
              <p className="text-xs text-muted-foreground">Years of experience, vehicle types operated, any commercial or CDL experience?</p>
              <Textarea
                id="ps-q1"
                placeholder="Applicant's response..."
                value={qDrivingExperience}
                onChange={(e) => setQDrivingExperience(e.target.value)}
                className="resize-none text-sm"
                rows={3}
                data-testid="textarea-ps-driving-experience"
              />
            </div>

            {/* Q2 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="ps-q2">
                Availability
              </label>
              <p className="text-xs text-muted-foreground">Days and hours available. Full-time or part-time preference?</p>
              <Textarea
                id="ps-q2"
                placeholder="Applicant's response..."
                value={qAvailability}
                onChange={(e) => setQAvailability(e.target.value)}
                className="resize-none text-sm"
                rows={2}
                data-testid="textarea-ps-availability"
              />
            </div>

            {/* Q3 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="ps-q3">
                Comfort with Vehicle Movement
              </label>
              <p className="text-xs text-muted-foreground">How comfortable are they operating large vehicles or moving trucks in various conditions?</p>
              <Textarea
                id="ps-q3"
                placeholder="Applicant's response..."
                value={qVehicleComfort}
                onChange={(e) => setQVehicleComfort(e.target.value)}
                className="resize-none text-sm"
                rows={2}
                data-testid="textarea-ps-vehicle-comfort"
              />
            </div>

            {/* Q4 */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="ps-q4">
                Schedule Flexibility
              </label>
              <p className="text-xs text-muted-foreground">Can they work weekends, evenings, or on short notice?</p>
              <Textarea
                id="ps-q4"
                placeholder="Applicant's response..."
                value={qScheduleFlexibility}
                onChange={(e) => setQScheduleFlexibility(e.target.value)}
                className="resize-none text-sm"
                rows={2}
                data-testid="textarea-ps-schedule-flexibility"
              />
            </div>

            {/* Result */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Outcome <span className="text-destructive">*</span>
              </label>
              <Select value={result} onValueChange={(v) => setResult(v as PhoneScreenResult)}>
                <SelectTrigger data-testid="select-phone-screen-result">
                  <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proceed">Proceed to Interview</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                  <SelectItem value="reject">Reject</SelectItem>
                </SelectContent>
              </Select>
              {result === "proceed" && (
                <p className="text-xs text-green-600 dark:text-green-400">Application will advance to the next stage.</p>
              )}
              {result === "reject" && (
                <p className="text-xs text-destructive">Application will be marked as rejected.</p>
              )}
              {result === "hold" && (
                <p className="text-xs text-muted-foreground">No stage change — notes will be recorded.</p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="ps-notes">
                Additional Notes
              </label>
              <Textarea
                id="ps-notes"
                placeholder="Any additional observations or context..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none text-sm"
                rows={3}
                data-testid="textarea-ps-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={logMutation.isPending} data-testid="button-cancel-phone-screen">
              Cancel
            </Button>
            <Button
              onClick={() => logMutation.mutate()}
              disabled={logMutation.isPending || !result}
              data-testid="button-submit-phone-screen"
            >
              {logMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Phone Screen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ApplicationDetailView({ applicationId, onBack }: { applicationId: string; onBack: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [transitionReason, setTransitionReason] = useState("");
  const [confirmTransition, setConfirmTransition] = useState<any>(null);
  const [docType, setDocType] = useState("");
  const [docLabel, setDocLabel] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const [selectedDocDetail, setSelectedDocDetail] = useState<any>(null);
  const [docDetailSaving, setDocDetailSaving] = useState(false);
  const [docAuditEvents, setDocAuditEvents] = useState<any[]>([]);
  const [docAuditLoading, setDocAuditLoading] = useState(false);

  const formatEventType = (type: string) => {
    const map: Record<string, string> = {
      "document.upload_requested": "Upload Requested",
      "document.upload_completed": "Uploaded",
      "document.viewed": "Viewed",
      "document.updated": "Metadata Updated",
      "document.deleted": "Deleted",
      "uploaded": "Uploaded",
      "viewed": "Viewed",
      "downloaded": "Downloaded",
      "deleted": "Deleted",
      "metadata_updated": "Metadata Updated",
    };
    return map[type] || type;
  };

  const fetchDocAuditEvents = async (docId: string) => {
    setDocAuditLoading(true);
    try {
      const res = await fetch("/api/recruiting/documents/" + docId + "/events", { credentials: "include" });
      if (res.ok) {
        const events = await res.json();
        setDocAuditEvents(Array.isArray(events) ? events : []);
      } else {
        setDocAuditEvents([]);
      }
    } catch {
      setDocAuditEvents([]);
    } finally {
      setDocAuditLoading(false);
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const existingFileInputRef = useRef<HTMLInputElement>(null);

  const getExpirationStatus = (expirationDate: string | null) => {
    if (!expirationDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(expirationDate + "T00:00:00");
    const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: "Expired", variant: "destructive" as const, days: diffDays };
    if (diffDays <= 30) return { label: "Expiring Soon", variant: "secondary" as const, days: diffDays };
    return { label: "Valid", variant: "outline" as const, days: diffDays };
  };

  const saveDocMetadata = async (docId: string, updates: any) => {
    setDocDetailSaving(true);
    try {
      const res = await apiRequest("PATCH", `/api/recruiting/documents/${docId}/metadata`, updates);
      const updated = await res.json();
      setSelectedDocDetail(updated);
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "document-requests"] });
      toast({ title: "Document metadata saved" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setDocDetailSaving(false);
    }
  };

  const handleViewDocument = async (docId: string) => {
    setViewingDocId(docId);
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(`/api/recruiting/documents/${docId}/download`, { credentials: "include" });
        if (!res.ok) {
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 800));
            continue;
          }
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Failed to load document (${res.status})`);
        }
        const data = await res.json();
        if (data.signedUrl) {
          window.open(data.signedUrl, "_blank", "noopener,noreferrer");
          setViewingDocId(null);
          return;
        }
        throw new Error("No download URL returned");
      } catch (err: any) {
        if (attempt >= maxAttempts) {
          toast({ title: "Unable to load document", description: err.message || "Please try again", variant: "destructive" });
        }
      }
    }
    setViewingDocId(null);
  };

  const { data: application, isLoading, refetch: refetchApp } = useQuery<any>({
    queryKey: ["/api/recruiting/applications", applicationId],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: transitionsData } = useQuery<any>({
    queryKey: ["/api/recruiting/applications", applicationId, "available-transitions"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/available-transitions`, { credentials: "include" });
      if (!res.ok) return { transitions: [], stages: [] };
      return res.json();
    },
    enabled: !!application,
  });

  const { data: documents, refetch: refetchDocs } = useQuery<any[]>({
    queryKey: ["/api/recruiting/applications", applicationId, "document-requests"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/document-requests`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!application,
  });

  const { data: stageHistory } = useQuery<any[]>({
    queryKey: ["/api/recruiting/applications", applicationId, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/history`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!application,
  });

  const { data: docCompletion, refetch: refetchDocCompletion } = useQuery<any>({
    queryKey: ["/api/recruiting/applications", applicationId, "document-completion"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/document-completion`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!application,
  });

  const { data: docReadiness } = useQuery<any>({
    queryKey: ["/api/recruiting/applications", applicationId, "doc-readiness"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/doc-readiness`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!application,
  });

  const transitionMutation = useMutation({
    mutationFn: async ({ toStage, reason }: { toStage: string; reason?: string }) => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/transition`, {
        toStage,
        reason,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to transition stage");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "available-transitions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "document-completion"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "doc-readiness"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications"] });
      setConfirmTransition(null);
      setTransitionReason("");
      toast({ title: "Stage updated", description: `Moved to ${variables.toStage}` });
    },
    onError: (err: any) => {
      toast({ title: "Transition failed", description: err.message, variant: "destructive" });
    },
  });

  const uploadFileToDocRequest = useCallback(async (docRequestId: string, file: File) => {
    setUploadingDocId(docRequestId);
    setUploadProgress("Validating...");
    try {
      setUploadProgress("Preparing upload...");
      const initRes = await apiRequest("POST", `/api/recruiting/documents/${docRequestId}/upload-init`, {
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      });
      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to prepare upload");
      }
      const initData = await initRes.json();
      const { signedUploadUrl, storagePath, useServerUpload } = initData;

      setUploadProgress("Uploading file...");

      if (useServerUpload || !signedUploadUrl) {
        const arrayBuffer = await file.arrayBuffer();
        const serverRes = await fetch("/api/objects/upload-file", {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-Filename": encodeURIComponent(file.name),
          },
          body: arrayBuffer,
          credentials: "include",
        });
        if (!serverRes.ok) {
          const errData = await serverRes.json().catch(() => ({}));
          throw new Error(errData.message || `Server upload failed (${serverRes.status})`);
        }
      } else {
        const uploadRes = await fetch(signedUploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadRes.ok) {
          const arrayBuffer = await file.arrayBuffer();
          const fallbackRes = await fetch("/api/objects/upload-file", {
            method: "POST",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              "X-Filename": encodeURIComponent(file.name),
            },
            body: arrayBuffer,
            credentials: "include",
          });
          if (!fallbackRes.ok) {
            throw new Error(`Upload failed with status ${uploadRes.status}`);
          }
        }
      }

      setUploadProgress("Finalizing...");
      const finalizeRes = await apiRequest("POST", `/api/recruiting/documents/${docRequestId}/upload-finalize`, {
        storagePath,
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      });
      if (!finalizeRes.ok) {
        const errData = await finalizeRes.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to finalize upload");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "document-requests"] });
      toast({ title: "Document uploaded", description: file.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      throw err;
    } finally {
      setUploadingDocId(null);
      setUploadProgress("");
    }
  }, [applicationId, toast]);

  const addDocMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/recruiting/applications/${applicationId}/document-requests`, {
        documentType: docType,
        label: docLabel,
        required: true,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to add document request");
      }
      const docRequest = await res.json();

      if (selectedFile) {
        await uploadFileToDocRequest(docRequest.id, selectedFile);
      }

      return docRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/applications", applicationId, "document-requests"] });
      setDocType("");
      setDocLabel("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: selectedFile ? "Document uploaded successfully" : "Document request added" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add document", description: err.message, variant: "destructive" });
    },
  });

  const uploadToExistingMutation = useMutation({
    mutationFn: async ({ docRequestId, file }: { docRequestId: string; file: File }) => {
      await uploadFileToDocRequest(docRequestId, file);
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-to-applications">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Applications
        </Button>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-to-applications">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Applications
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Application not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const workflowStages = transitionsData?.stages || [];
  const availableTransitions = transitionsData?.transitions || [];
  const terminalStages = ["rejected", "withdrawn", "no_show", "hired"];
  const isTerminal = terminalStages.includes(application.currentStage);

  const pipelineStages = workflowStages.length > 0
    ? workflowStages.filter((s: any) => !["rejected", "on_hold"].includes(s.stageKey))
    : [{ stageKey: "applied", displayName: "Applied", sortOrder: 0 }];
  const currentIdx = pipelineStages.findIndex((s: any) => s.stageKey === application.currentStage);

  const stageVariantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    applied: "secondary",
    screening: "default",
    docs_pending: "outline",
    background_pending: "outline",
    approved: "default",
    ready_to_work: "default",
    rejected: "destructive",
    on_hold: "secondary",
    withdrawn: "secondary",
    no_show: "secondary",
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} data-testid="button-back-to-applications">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Applications
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-application-title">
            {application.candidateFirstName} {application.candidateLastName}
          </h1>
          <p className="text-muted-foreground mt-1">
            {application.requisitionTitle || "Position"}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <Badge variant="secondary" data-testid="badge-application-stage">
              {workflowStages.find((s: any) => s.stageKey === application.currentStage)?.displayName || application.currentStage || "Applied"}
            </Badge>
            {application.requestedQuickCall && (
              <Badge variant="outline" className="gap-1 border-primary/40 text-primary" data-testid="badge-detail-quick-call">
                <Phone className="h-3 w-3" />
                Quick Call Requested
              </Badge>
            )}
            {application.introMediaType === "audio" && (
              <Badge variant="outline" className="gap-1" data-testid="badge-intake-path-audio">
                <Mic className="h-3 w-3" />
                Audio Intro Submitted
              </Badge>
            )}
            {(application.introMediaType === "video" || (application.intakePath === "video_optional" && application.introMediaType !== "audio")) && (
              <Badge variant="outline" className="gap-1" data-testid="badge-intake-path-video">
                <Video className="h-3 w-3" />
                {application.hasIntroVideo ? "Video Intro Submitted" : "Video Intro Path (No Video)"}
              </Badge>
            )}
            {application.appliedAt && (
              <span className="text-sm text-muted-foreground">
                Applied {new Date(application.appliedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      <SlaTimerCard application={application} />

      {/* ── AI Pre-Screen Score ── */}
      <AiPrescreenCard application={application} />

      {/* ── Recruiter Approval Gate ── */}
      <RecruiterApprovalGate
        applicationId={application.id}
        currentDecision={application.recruiterDecision ?? null}
        decisionAt={application.recruiterDecisionAt ?? null}
        decisionNote={application.recruiterDecisionNote ?? null}
      />

      {/* ── Self-Scheduling Links ── */}
      <SchedulingLinksPanel
        applicationId={application.id}
        candidateFirstName={application.candidate?.firstName || application.candidateFirstName}
        candidateLastName={application.candidate?.lastName || application.candidateLastName}
        recruiterDecision={application.recruiterDecision ?? null}
      />

      {/* ── Interview Decision Workflow ── */}
      <InterviewDecisionPanel applicationId={application.id} />

      {/* ── Pre-Hire Auto-Handoff Status (Ticket 29) ── */}
      <PreHireHandoffStatus applicationId={application.id} compact />

      {/* ── Screening Trigger Engine ── */}
      <ScreeningTriggerPanel
        applicationId={application.id}
        recruiterDecision={application.recruiterDecision ?? null}
      />

      {/* ── AI Screening Review Summary (Ticket 14) ── */}
      <ScreeningReviewSummary
        applicationId={application.id}
        review={application.aiScreeningReview ?? null}
        generating={application.aiScreeningReviewGenerating ?? false}
        applicationQueryKey={`/api/recruiting/applications/${application.id}`}
      />

      {/* ── Phone Screen Workflow (Ticket 24) ── */}
      <PhoneScreenPanel applicationId={application.id} />

      {/* ── CDL Requirements Checklist (Ticket 25) ── */}
      <CdlChecklistPanel application={application} documentRequests={documents || []} />

      {/* ── Pre-Offer Approval Gate (Ticket 15) ── */}
      <PreOfferApprovalGate
        applicationId={application.id}
        currentDecision={(application as any).preOfferDecision ?? null}
        decisionAt={(application as any).preOfferDecisionAt ?? null}
        decisionNote={(application as any).preOfferDecisionNote ?? null}
        screeningsComplete={!!(application as any).aiScreeningReviewGeneratedAt}
      />

      {/* ── Intro Media Player ── */}
      {(application.introMediaType === "audio" || application.introMediaType === "video") && (
        <Card data-testid="card-intro-media">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {application.introMediaType === "audio"
                ? <><Mic className="h-4 w-4 text-primary" /> Audio Introduction</>
                : <><Video className="h-4 w-4 text-primary" /> Video Introduction</>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {application.introMediaType === "audio" ? (
              <audio
                controls
                src={`/api/corporate/recruiting/applications/${application.id}/intro-media`}
                className="w-full"
                data-testid="player-intro-audio"
                preload="metadata"
              />
            ) : (
              <video
                controls
                src={`/api/corporate/recruiting/applications/${application.id}/intro-media`}
                className="w-full rounded-md bg-black aspect-video"
                data-testid="player-intro-video"
                preload="metadata"
              />
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Recorded by the candidate during their application.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── AI Intro Analysis ── */}
      {(application.introMediaType === "audio" || application.introMediaType === "video") && (
        <IntroAiAnalysisCard application={application} />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-lg">Pipeline Progress</CardTitle>
          {application.currentStage && (
            <Badge variant={stageVariantMap[application.currentStage] || "secondary"} data-testid="badge-current-stage">
              {workflowStages.find((s: any) => s.stageKey === application.currentStage)?.displayName || application.currentStage}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1">
            {pipelineStages.map((stage: any, idx: number) => (
              <div key={stage.stageKey} className="flex items-center gap-1 flex-1" data-testid={`pipeline-stage-${stage.stageKey}`}>
                <div className={`flex-1 h-2 rounded-full transition-colors ${idx <= currentIdx ? "bg-primary" : "bg-muted"}`} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1 mt-1">
            {pipelineStages.map((stage: any, idx: number) => (
              <div key={stage.stageKey} className="flex-1 text-center">
                <span className={`text-xs ${idx <= currentIdx ? "font-medium" : "text-muted-foreground"}`}>
                  {stage.displayName}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {!isTerminal && availableTransitions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg" data-testid="text-stage-actions-title">Stage Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {availableTransitions.map((t: any) => {
                const isDestructive = ["rejected", "withdrawn"].includes(t.toStageKey);
                return (
                  <Button
                    key={t.id}
                    variant={isDestructive ? "destructive" : "default"}
                    onClick={() => setConfirmTransition(t)}
                    data-testid={`button-transition-${t.toStageKey}`}
                  >
                    <ArrowRight className="mr-1 h-4 w-4" />
                    {t.name}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {isTerminal && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            <span className="text-muted-foreground">
              This application is in a terminal state ({application.currentStage}). No further stage transitions are available.
            </span>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!confirmTransition} onOpenChange={(open) => { if (!open) { setConfirmTransition(null); setTransitionReason(""); } }}>
        <DialogContent data-testid="dialog-confirm-transition">
          <DialogHeader>
            <DialogTitle>Confirm Stage Transition</DialogTitle>
            <DialogDescription>
              Move this application from <strong>{workflowStages.find((s: any) => s.stageKey === application.currentStage)?.displayName || application.currentStage}</strong>{" "}
              to <strong>{confirmTransition?.toStageDisplayName || confirmTransition?.toStageKey}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="transition-reason">Reason {confirmTransition?.requiresReason ? "(required)" : "(optional)"}</Label>
              <Textarea
                id="transition-reason"
                placeholder="Enter reason for this transition..."
                value={transitionReason}
                onChange={(e) => setTransitionReason(e.target.value)}
                data-testid="input-transition-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setConfirmTransition(null); setTransitionReason(""); }} data-testid="button-cancel-transition">
              Cancel
            </Button>
            <Button
              variant={["rejected", "withdrawn"].includes(confirmTransition?.toStageKey) ? "destructive" : "default"}
              disabled={transitionMutation.isPending || (confirmTransition?.requiresReason && !transitionReason.trim())}
              onClick={() => {
                if (confirmTransition) {
                  transitionMutation.mutate({
                    toStage: confirmTransition.toStageKey,
                    reason: transitionReason.trim() || undefined,
                  });
                }
              }}
              data-testid="button-confirm-transition"
            >
              {transitionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Candidate Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {application.candidateEmail && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span data-testid="text-candidate-email">{application.candidateEmail}</span>
              </div>
            )}
            {application.candidatePhone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span data-testid="text-candidate-phone">{application.candidatePhone}</span>
              </div>
            )}
            {application.candidateId && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/recruiting/candidates/${application.candidateId}`}>
                  View Full Profile
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Application Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {application.ownerName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assigned To</span>
                <span data-testid="text-owner-name">{application.ownerName}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Readiness</span>
              <div className="flex items-center gap-2">
                <ReadinessBadge status={application.readinessStatus || 'not_ready'} score={application.readinessScore || 0} />
              </div>
            </div>
            {application.createdAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(application.createdAt).toLocaleDateString()}</span>
              </div>
            )}
            {application.currentStageEnteredAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">In Current Stage Since</span>
                <span>{new Date(application.currentStageEnteredAt).toLocaleDateString()}</span>
              </div>
            )}
            {/* Source Attribution — Ticket 23 */}
            {(application.source || application.candidate?.source) && (
              <div className="flex justify-between" data-testid="row-application-source">
                <span className="text-muted-foreground">Application Source</span>
                <span className="font-medium">
                  {CANDIDATE_SOURCE_LABELS[application.source ?? application.candidate?.source] ?? (application.source || application.candidate?.source)}
                </span>
              </div>
            )}
            {(application.sourceDetails || application.candidate?.sourceDetails) && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source Details</span>
                <span className="text-right max-w-[60%] text-sm text-muted-foreground">
                  {application.sourceDetails || application.candidate?.sourceDetails}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-readiness-checklist">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <div>
            <CardTitle className="text-lg">Readiness Checklist</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Requirements for deployment readiness</p>
          </div>
          <ReadinessBadge status={application.readinessStatus || 'not_ready'} score={application.readinessScore || 0} />
        </CardHeader>
        <CardContent className="space-y-1">
          {(() => {
            const checks = [
              {
                label: "Documents",
                key: "docs",
                passed: application.docsComplete || false,
                detail: application.docsComplete
                  ? (docCompletion?.required?.some((d: any) => d.expirationWarning) ? "Expiring Soon" : "Complete")
                  : "Missing",
              },
              {
                label: "Background Check",
                key: "background",
                passed: application.backgroundCheckStatus === "passed" || application.backgroundStatus === "passed",
                detail: (application.backgroundCheckStatus || application.backgroundStatus || "none")
                  .replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
              },
              {
                label: "Consent Captured",
                key: "consent",
                passed: application.consentCaptured || false,
                detail: application.consentCaptured ? "Captured" : "Pending",
              },
              {
                label: "Compliance",
                key: "compliance",
                passed: application.complianceStatus === "passed" || application.complianceStatus === "waived",
                detail: (application.complianceStatus || "pending")
                  .replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
              },
            ];
            if (application.licenseEligible !== null && application.licenseEligible !== undefined) {
              checks.splice(1, 0, {
                label: "License / CDL",
                key: "license",
                passed: application.licenseEligible,
                detail: application.licenseEligible ? "Verified" : (application.licenseMismatchReason || "Does not meet requirements"),
              });
            }
            if (application.geoEligible !== null && application.geoEligible !== undefined) {
              checks.push({
                label: "Geo Eligibility",
                key: "geo",
                passed: application.geoEligible,
                detail: application.geoEligible
                  ? `In range${application.distanceMiles ? ` (${application.distanceMiles}mi)` : ''}`
                  : `Out of range${application.distanceMiles ? ` (${application.distanceMiles}mi)` : ''}`,
              });
            }
            return checks.map((check) => (
              <div
                key={check.key}
                className={`flex flex-wrap items-center justify-between gap-2 p-2 rounded-md ${check.passed ? '' : 'bg-destructive/5 border border-destructive/20'}`}
                data-testid={`readiness-check-${check.key}`}
              >
                <div className="flex items-center gap-2">
                  {check.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                  )}
                  <span className={`text-sm ${check.passed ? '' : 'font-medium'}`}>{check.label}</span>
                </div>
                <Badge variant={check.passed ? "default" : "outline"} className="text-xs">
                  {check.detail}
                </Badge>
              </div>
            ));
          })()}
        </CardContent>
      </Card>

      {docReadiness && docReadiness.requirements && docReadiness.requirements.length > 0 && (
        <Card data-testid="card-doc-readiness-requirements">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="text-lg">Document Requirements</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{docReadiness.summary}</p>
            </div>
            <Badge variant={docReadiness.ready ? "default" : "destructive"} data-testid="badge-doc-readiness">
              {docReadiness.ready ? "Ready" : "Not Ready"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-1">
            {docReadiness.requirements.map((req: any) => (
              <div
                key={req.docType}
                className={`flex flex-wrap items-center justify-between gap-2 p-2 rounded-md ${req.status === "satisfied" ? "" : req.status === "pending_review" ? "bg-yellow-500/5 border border-yellow-500/20" : "bg-destructive/5 border border-destructive/20"}`}
                data-testid={`doc-readiness-item-${req.docType}`}
              >
                <div className="flex items-center gap-2">
                  {req.status === "satisfied" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  ) : req.status === "pending_review" ? (
                    <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                  ) : req.status === "expired" ? (
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                  )}
                  <span className={`text-sm ${req.status === "satisfied" ? "" : "font-medium"}`}>{req.label}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {req.required && <Badge variant="outline" className="text-xs">Required</Badge>}
                  {req.blockStageProgression && <Badge variant="outline" className="text-xs border-orange-500 text-orange-600 dark:text-orange-400">Blocks Stage</Badge>}
                  {req.expirationRequired && <Badge variant="outline" className="text-xs">Exp. Required</Badge>}
                  <span className={`text-xs ${req.status === "satisfied" ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>{req.reason}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

            {docCompletion && docCompletion.totalRequired > 0 && (
        <Card data-testid="card-required-documents-checklist">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="text-lg" data-testid="text-required-docs-title">Required Documents</CardTitle>
              <p className="text-sm text-muted-foreground mt-1" data-testid="text-required-docs-progress">
                {docCompletion.totalUploaded} of {docCompletion.totalRequired} uploaded
              </p>
            </div>
            <div className="flex items-center gap-2">
              {docCompletion.blockStageIfIncomplete && (
                <Badge variant="outline" className="text-xs" data-testid="badge-stage-gate">
                  <Shield className="mr-1 h-3 w-3" />
                  Stage Gate
                </Badge>
              )}
              {docCompletion.complete ? (
                <Badge variant="default" data-testid="badge-docs-complete">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Complete
                </Badge>
              ) : (
                <Badge variant="destructive" data-testid="badge-docs-incomplete">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Incomplete
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <Progress value={(docCompletion.totalUploaded / docCompletion.totalRequired) * 100} className="h-2 mb-3" data-testid="progress-docs" />
            {docCompletion.required.map((item: any) => (
              <div
                key={item.documentType}
                className={`flex flex-wrap items-center justify-between gap-2 p-2 rounded-md ${item.uploaded ? '' : 'bg-destructive/5 border border-destructive/20'}`}
                data-testid={`doc-checklist-item-${item.documentType}`}
              >
                <div className="flex items-center gap-2">
                  {item.uploaded ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                  )}
                  <span className={`text-sm ${item.uploaded ? '' : 'font-medium'}`}>
                    {item.documentType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {item.expirationWarning && (
                    <Badge
                      variant={item.expirationWarning === 'Expired' ? 'destructive' : 'secondary'}
                      className="text-xs"
                      data-testid={`badge-doc-exp-${item.documentType}`}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {item.expirationWarning}
                    </Badge>
                  )}
                  <Badge variant={item.uploaded ? (item.status === 'approved' ? 'default' : 'secondary') : 'outline'} className="text-xs">
                    {item.uploaded ? (item.status === 'approved' ? 'Approved' : item.status === 'rejected' ? 'Rejected' : 'Uploaded') : 'Missing'}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-lg">Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {documents && documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <div key={doc.id} className="flex flex-col gap-2 p-3 rounded-md border" data-testid={`doc-request-${doc.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 cursor-pointer hover-elevate rounded-md px-1 py-0.5" onClick={() => { setSelectedDocDetail(doc); fetchDocAuditEvents(doc.id); }} data-testid={`button-open-doc-detail-${doc.id}`}>
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{doc.label}</p>
                        <p className="text-xs text-muted-foreground">{doc.documentType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {doc.expirationDate && (() => {
                        const expStatus = getExpirationStatus(doc.expirationDate);
                        return expStatus ? <Badge variant={expStatus.variant} data-testid={`badge-doc-expiration-${doc.id}`}>{expStatus.label}{expStatus.days >= 0 ? ` (${expStatus.days}d)` : ''}</Badge> : null;
                      })()}
                      <Badge variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : doc.uploadedFileName ? "secondary" : "outline"}>
                        {doc.status === "uploaded" ? "uploaded" : doc.status || "pending"}
                      </Badge>
                    </div>
                  </div>
                  {doc.uploadedFileName ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 pl-6">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span data-testid={`text-doc-filename-${doc.id}`}>{doc.uploadedFileName}</span>
                        {doc.uploadedAt && (
                          <span data-testid={`text-doc-uploaded-at-${doc.id}`}>
                            {new Date(doc.uploadedAt).toLocaleString()}
                          </span>
                        )}
                        {doc.uploadedFileSize && (
                          <span>{(parseInt(doc.uploadedFileSize) / 1024).toFixed(0)} KB</span>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDocument(doc.id)}
                        disabled={viewingDocId === doc.id}
                        data-testid={`button-view-doc-${doc.id}`}
                      >
                        {viewingDocId === doc.id ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Eye className="mr-1 h-3 w-3" />
                        )}
                        View
                      </Button>
                    </div>
                  ) : (
                    <div className="pl-6">
                      {uploadingDocId === doc.id ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`upload-progress-${doc.id}`}>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>{uploadProgress}</span>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setUploadingDocId(doc.id);
                            existingFileInputRef.current?.click();
                          }}
                          disabled={!!uploadingDocId}
                          data-testid={`button-upload-to-${doc.id}`}
                        >
                          <Upload className="mr-1 h-3 w-3" />
                          Upload File
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-no-documents">No document requests yet.</p>
          )}
          <input
            ref={existingFileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.docx"
            className="hidden"
            data-testid="input-existing-file-upload"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && uploadingDocId) {
                uploadToExistingMutation.mutate({ docRequestId: uploadingDocId, file });
              } else {
                setUploadingDocId(null);
              }
              e.target.value = "";
            }}
          />
          <div className="space-y-3 pt-2 border-t">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[120px]">
                <Label htmlFor="doc-type" className="text-xs">Type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger id="doc-type" data-testid="select-doc-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="license">Driver License</SelectItem>
                    <SelectItem value="insurance">Insurance</SelectItem>
                    <SelectItem value="medical">Medical Certificate</SelectItem>
                    <SelectItem value="background">Background Check</SelectItem>
                    <SelectItem value="certification">Certification</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[150px]">
                <Label htmlFor="doc-label" className="text-xs">Label</Label>
                <Input
                  id="doc-label"
                  placeholder="e.g. CDL-A License"
                  value={docLabel}
                  onChange={(e) => setDocLabel(e.target.value)}
                  data-testid="input-doc-label"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="doc-file" className="text-xs">File (PDF, JPG, PNG)</Label>
                <Input
                  id="doc-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.docx"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  data-testid="input-doc-file"
                  className="text-sm"
                />
              </div>
              <Button
                size="default"
                disabled={!docType || !docLabel.trim() || addDocMutation.isPending || !!uploadingDocId}
                onClick={() => addDocMutation.mutate()}
                data-testid="button-add-document"
              >
                {addDocMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                {selectedFile ? "Upload Document" : "Add Request"}
              </Button>
            </div>
            {selectedFile && (
              <p className="text-xs text-muted-foreground" data-testid="text-selected-file">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
              </p>
            )}
            {uploadProgress && addDocMutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="upload-progress-new">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{uploadProgress}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedDocDetail} onOpenChange={(open) => { if (!open) { setSelectedDocDetail(null); setDocAuditEvents([]); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document Detail</DialogTitle>
          </DialogHeader>
          {selectedDocDetail && (() => {
            const doc = selectedDocDetail;
            const expStatus = getExpirationStatus(doc.expirationDate);
            return (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold" data-testid="text-doc-detail-label">{doc.label}</p>
                      <p className="text-sm text-muted-foreground">{doc.documentType}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {expStatus && <Badge variant={expStatus.variant} data-testid="badge-doc-detail-expiration">{expStatus.label}{expStatus.days >= 0 ? ` (${expStatus.days}d)` : ''}</Badge>}
                      <Badge variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : doc.uploadedFileName ? "secondary" : "outline"} data-testid="badge-doc-detail-status">
                        {doc.status || "pending"}
                      </Badge>
                    </div>
                  </div>
                  {doc.uploadedFileName && (
                    <Card>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-1">
                            <p className="text-sm font-medium" data-testid="text-doc-detail-filename">{doc.uploadedFileName}</p>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              {doc.uploadedAt && <span>Uploaded: {new Date(doc.uploadedAt).toLocaleString()}</span>}
                              {doc.uploadedFileSize && <span>{(parseInt(doc.uploadedFileSize) / 1024).toFixed(0)} KB</span>}
                              {doc.uploadedFileMimeType && <span>{doc.uploadedFileMimeType}</span>}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => handleViewDocument(doc.id)} disabled={viewingDocId === doc.id} data-testid="button-doc-detail-preview">
                            {viewingDocId === doc.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Eye className="mr-1 h-3 w-3" />}
                            Preview
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="doc-expiration-date" className="text-xs font-medium">Expiration Date</Label>
                    <Input
                      id="doc-expiration-date"
                      type="date"
                      value={doc.expirationDate || ""}
                      onChange={(e) => setSelectedDocDetail({ ...doc, expirationDate: e.target.value || null })}
                      data-testid="input-doc-expiration-date"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="doc-issue-date" className="text-xs font-medium">Issue Date</Label>
                    <Input
                      id="doc-issue-date"
                      type="date"
                      value={doc.issueDate || ""}
                      onChange={(e) => setSelectedDocDetail({ ...doc, issueDate: e.target.value || null })}
                      data-testid="input-doc-issue-date"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="doc-status" className="text-xs font-medium">Status</Label>
                    <Select value={doc.status} onValueChange={(v) => setSelectedDocDetail({ ...doc, status: v })}>
                      <SelectTrigger data-testid="select-doc-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="uploaded">Uploaded</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Verified By</Label>
                    <Input
                      value={doc.verifiedBy ? "Verified" : "Not verified"}
                      disabled
                      className="text-muted-foreground"
                      data-testid="text-doc-verified-by"
                    />
                    {doc.verifiedDate && (
                      <p className="text-xs text-muted-foreground" data-testid="text-doc-verified-date">
                        Verified: {new Date(doc.verifiedDate).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="doc-notes" className="text-xs font-medium">Notes</Label>
                  <Textarea
                    id="doc-notes"
                    value={doc.notes || ""}
                    onChange={(e) => setSelectedDocDetail({ ...doc, notes: e.target.value })}
                    placeholder="Add notes about this document..."
                    className="resize-none"
                    rows={3}
                    data-testid="textarea-doc-notes"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Activity History</Label>
                  {docAuditLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</div>
                  ) : docAuditEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No activity recorded yet.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border rounded-md divide-y" data-testid="list-doc-audit-events">
                      {docAuditEvents.map((evt: any, idx: number) => (
                        <div key={evt.id || idx} className="px-3 py-2 text-xs space-y-0.5" data-testid={`item-doc-audit-event-${idx}`}>
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-medium">{formatEventType(evt.eventType)}</span>
                            <span className="text-muted-foreground">{new Date(evt.createdAt).toLocaleString()}</span>
                          </div>
                          {evt.metadata?.changes && (
                            <div className="text-muted-foreground">
                              {Object.entries(evt.metadata.changes as Record<string, any>).map(([field, change]: [string, any]) => (
                                <div key={field}>{field}: {String(change.before ?? '\u2014')} \u2192 {String(change.after ?? '\u2014')}</div>
                              ))}
                            </div>
                          )}
                          {evt.metadata?.fileName && !evt.metadata?.changes && (
                            <div className="text-muted-foreground">{evt.metadata.fileName}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setSelectedDocDetail(null)} data-testid="button-doc-detail-cancel">Cancel</Button>
                  <Button
                    disabled={docDetailSaving}
                    onClick={() => saveDocMetadata(doc.id, {
                      expirationDate: doc.expirationDate || null,
                      issueDate: doc.issueDate || null,
                      status: doc.status,
                      notes: doc.notes || null,
                    })}
                    data-testid="button-doc-detail-save"
                  >
                    {docDetailSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <RecruitingNotes
        entityType="application"
        entityId={applicationId}
        title="Application Notes"
        userRole={user?.role}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg" data-testid="text-activity-timeline-title">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityTimeline
            entityType="application"
            entityId={applicationId}
            maxHeight="500px"
            isAdmin={user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'super_user' || user?.role === 'recruiting_admin'}
          />
        </CardContent>
      </Card>
    </div>
  );
}
