import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Users, CheckCircle2, DollarSign, TrendingUp, Plus, Loader2,
  MapPin, Briefcase, Clock, AlertTriangle, BarChart3, Settings,
  ChevronDown, ChevronRight, ExternalLink, RefreshCw, Award,
  ArrowUpRight, Star, UserCheck, Zap, Filter, Search
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CANDIDATE_SOURCE_LABELS } from "@shared/schema";
import { Switch } from "@/components/ui/switch";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardMetrics {
  totalReferrals: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  conversionRate: number;
  totalRewardsEarned: string;
  totalRewardsPaid: string;
  totalRewardsPending: string;
  autoCreatedCandidates: number;
  recentReferrals: any[];
  topReferrers: any[];
}

interface ReferralProgramConfig {
  id: string;
  name: string;
  description?: string;
  programEnabled: boolean;
  requireConsent: boolean;
  requirePhone: boolean;
  requireCityState: boolean;
  requireDriverType: boolean;
  dedupePeriodMonths: number;
  allowSelfReferral: boolean;
  bonusMilestones: BonusMilestone[];
  notifyOnSubmission: boolean;
  notifyOnStatusChange: boolean;
  notifyOnRewardEarned: boolean;
}

interface BonusMilestone {
  trigger: string;
  label: string;
  amount: number;
  currency: string;
  auto_trigger: boolean;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  pending_review: "Pending Review",
  candidate_created: "Candidate Created",
  application_submitted: "Application Submitted",
  interviewing: "Interviewing",
  offer_extended: "Offer Extended",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  expired: "Expired",
  duplicate: "Duplicate",
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  pending_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  candidate_created: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  application_submitted: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  interviewing: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  offer_extended: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  hired: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  withdrawn: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  duplicate: "bg-muted text-muted-foreground",
};

const ACTIVE_STATUSES = ["submitted", "pending_review", "candidate_created", "application_submitted", "interviewing", "offer_extended"];
const CLOSED_STATUSES = ["hired", "rejected", "withdrawn", "expired", "duplicate"];

// ─── Submit Referral Schema ───────────────────────────────────────────────────

const submitSchema = z.object({
  referredFirstName: z.string().min(1, "First name required"),
  referredLastName: z.string().min(1, "Last name required"),
  referredEmail: z.string().email("Valid email required"),
  referredPhone: z.string().optional(),
  market: z.string().optional(),
  roleType: z.string().optional(),
  relationship: z.string().optional(),
  notes: z.string().optional(),
});
type SubmitForm = z.infer<typeof submitSchema>;

// ─── Referral Card ────────────────────────────────────────────────────────────

function ReferralCard({ referral, onAutoCreate }: { referral: any; onAutoCreate: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = STATUS_COLORS[referral.status] || STATUS_COLORS.submitted;
  const statusLabel = STATUS_LABELS[referral.status] || referral.status?.replace(/_/g, ' ');

  return (
    <Card data-testid={`referral-card-${referral.id}`} className="hover-elevate">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback className="text-sm">
              {referral.referredFirstName?.[0]}{referral.referredLastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-base">
              {referral.referredFirstName} {referral.referredLastName}
            </CardTitle>
            <CardDescription>{referral.referredEmail}</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusColor} data-testid={`badge-status-${referral.id}`}>
            {statusLabel}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setExpanded(v => !v)}
            data-testid={`button-expand-${referral.id}`}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {referral.market && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {referral.market}
            </span>
          )}
          {referral.roleType && (
            <span className="flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              {referral.roleType}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {new Date(referral.createdAt).toLocaleDateString()}
          </span>
          {(referral as any).sourceSystem && (
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              {(referral as any).sourceSystem?.toUpperCase()}
            </span>
          )}
        </div>

        {referral.milestoneReached && (
          <div className="mt-3">
            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              <Award className="mr-1 h-3 w-3" />
              Milestone: {referral.milestoneReached?.replace(/_/g, ' ')}
            </Badge>
          </div>
        )}

        {expanded && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <span className="font-medium text-foreground">Period</span>
                <p className="text-muted-foreground">{referral.referralPeriodKey}</p>
              </div>
              {referral.referredPhone && (
                <div>
                  <span className="font-medium text-foreground">Phone</span>
                  <p className="text-muted-foreground">{referral.referredPhone}</p>
                </div>
              )}
              {(referral as any).referredCity && (
                <div>
                  <span className="font-medium text-foreground">Location</span>
                  <p className="text-muted-foreground">
                    {(referral as any).referredCity}{(referral as any).referredState ? `, ${(referral as any).referredState}` : ''}
                  </p>
                </div>
              )}
              {(referral as any).relationship && (
                <div>
                  <span className="font-medium text-foreground">Relationship</span>
                  <p className="text-muted-foreground">{(referral as any).relationship}</p>
                </div>
              )}
              {referral.candidateId && (
                <div>
                  <span className="font-medium text-foreground">Candidate</span>
                  <p className="text-muted-foreground font-mono text-xs">{referral.candidateId}</p>
                </div>
              )}
            </div>
            {referral.notes && (
              <div>
                <span className="text-sm font-medium text-foreground">Notes</span>
                <p className="text-sm text-muted-foreground mt-1">{referral.notes}</p>
              </div>
            )}
            {!referral.candidateId && ACTIVE_STATUSES.includes(referral.status) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAutoCreate(referral.id)}
                data-testid={`button-auto-create-${referral.id}`}
              >
                <UserCheck className="mr-2 h-3.5 w-3.5" />
                Create Candidate Record
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Metrics Overview ─────────────────────────────────────────────────────────

function MetricsOverview({ metrics }: { metrics: DashboardMetrics }) {
  const hired = metrics.byStatus?.hired || 0;
  const inProgress = ACTIVE_STATUSES.reduce((sum, s) => sum + (metrics.byStatus?.[s] || 0), 0);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold" data-testid="stat-total-referrals">
                {metrics.totalReferrals}
              </div>
              <p className="text-sm text-muted-foreground">Total Referrals</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowUpRight className="h-3 w-3" />
            {inProgress} in progress
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-green-500/10 p-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold" data-testid="stat-hired-referrals">
                {hired}
              </div>
              <p className="text-sm text-muted-foreground">Hired</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            {metrics.conversionRate}% conversion rate
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-yellow-500/10 p-2">
              <DollarSign className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold" data-testid="stat-pending-rewards">
                ${parseFloat(metrics.totalRewardsPending || '0').toFixed(2)}
              </div>
              <p className="text-sm text-muted-foreground">Pending Rewards</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <DollarSign className="h-3 w-3" />
            ${parseFloat(metrics.totalRewardsPaid || '0').toFixed(2)} paid to date
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-blue-500/10 p-2">
              <Zap className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold" data-testid="stat-auto-created">
                {metrics.autoCreatedCandidates}
              </div>
              <p className="text-sm text-muted-foreground">Auto-Created Candidates</p>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            From referral submissions
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Status Breakdown ─────────────────────────────────────────────────────────

function StatusBreakdown({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  const ordered = [
    ...ACTIVE_STATUSES.filter(s => (byStatus[s] || 0) > 0),
    ...CLOSED_STATUSES.filter(s => (byStatus[s] || 0) > 0),
  ];

  if (!ordered.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Pipeline Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {ordered.map(status => {
            const count = byStatus[status] || 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={status} className="flex items-center gap-3">
                <span className="w-32 text-xs text-muted-foreground truncate">
                  {STATUS_LABELS[status] || status}
                </span>
                <div className="flex-1 bg-muted rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-xs text-right font-medium">{count}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Top Referrers ────────────────────────────────────────────────────────────

function TopReferrers({ referrers }: { referrers: any[] }) {
  if (!referrers.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-500" />
          Top Referrers This Period
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {referrers.slice(0, 5).map((r: any, i: number) => (
            <div key={r.referrer_id || i} className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {i + 1}
              </div>
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">
                  {r.first_name?.[0] || '?'}{r.last_name?.[0] || ''}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {r.first_name && r.last_name ? `${r.first_name} ${r.last_name}` : r.email || 'Unknown'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.referral_count} referral{r.referral_count !== 1 ? 's' : ''}
                  {r.hired_count > 0 && ` · ${r.hired_count} hired`}
                </p>
              </div>
              {i === 0 && <Star className="h-4 w-4 text-yellow-500" />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Source Breakdown ─────────────────────────────────────────────────────────

function SourceBreakdown({ bySource, total }: { bySource: Record<string, number>; total: number }) {
  const entries = Object.entries(bySource).sort(([, a], [, b]) => b - a).slice(0, 8);
  if (!entries.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Referrals by Source</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {entries.map(([source, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={source} className="flex items-center gap-3">
                <span className="w-28 text-xs text-muted-foreground truncate">
                  {CANDIDATE_SOURCE_LABELS[source] || source}
                </span>
                <div className="flex-1 bg-muted rounded-full h-1.5">
                  <div className="bg-primary h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-xs text-right font-medium">{count}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Program Config Panel ─────────────────────────────────────────────────────

function ProgramConfigPanel({ config, onSaved }: { config: ReferralProgramConfig | null; onSaved: () => void }) {
  const { toast } = useToast();
  const [localConfig, setLocalConfig] = useState<Partial<ReferralProgramConfig>>(config || {
    programEnabled: true,
    requireConsent: true,
    requirePhone: false,
    requireCityState: false,
    requireDriverType: false,
    dedupePeriodMonths: 6,
    allowSelfReferral: false,
    notifyOnSubmission: true,
    notifyOnStatusChange: true,
    notifyOnRewardEarned: true,
    bonusMilestones: [],
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/recruiting/referrals/program-config", localConfig);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Program config saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/referrals/program-config"] });
      onSaved();
    },
    onError: () => toast({ title: "Failed to save config", variant: "destructive" }),
  });

  const toggle = (key: keyof ReferralProgramConfig) => {
    setLocalConfig(prev => ({ ...prev, [key]: !(prev[key] as boolean) }));
  };

  const ConfigRow = ({ label, desc, configKey }: { label: string; desc: string; configKey: keyof ReferralProgramConfig }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch
        checked={!!localConfig[configKey]}
        onCheckedChange={() => toggle(configKey)}
        data-testid={`switch-config-${configKey}`}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Program Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <ConfigRow label="Program Enabled" desc="Allow new referrals to be submitted" configKey="programEnabled" />
          <ConfigRow label="Require Consent" desc="Referred person must consent to data sharing" configKey="requireConsent" />
          <ConfigRow label="Require Phone Number" desc="Phone is mandatory for submission" configKey="requirePhone" />
          <ConfigRow label="Require City / State" desc="Location is mandatory for submission" configKey="requireCityState" />
          <ConfigRow label="Require Driver Type" desc="Driver type/CDL info is mandatory" configKey="requireDriverType" />
          <ConfigRow label="Allow Self-Referral" desc="A driver may refer themselves" configKey="allowSelfReferral" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <ConfigRow label="Notify on Submission" desc="Alert referrer when referral is received" configKey="notifyOnSubmission" />
          <ConfigRow label="Notify on Status Change" desc="Alert referrer on pipeline progress" configKey="notifyOnStatusChange" />
          <ConfigRow label="Notify on Reward Earned" desc="Alert referrer when reward milestone is reached" configKey="notifyOnRewardEarned" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Deduplication</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium flex-1">Dedupe Period (months)</label>
            <Input
              type="number"
              min={1}
              max={24}
              value={localConfig.dedupePeriodMonths ?? 6}
              onChange={e => setLocalConfig(prev => ({ ...prev, dedupePeriodMonths: parseInt(e.target.value) || 6 }))}
              className="w-20 text-center"
              data-testid="input-dedupe-months"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Referrals for the same candidate within this window are flagged as duplicates.
          </p>
        </CardContent>
      </Card>

      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        data-testid="button-save-config"
      >
        {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save Configuration
      </Button>
    </div>
  );
}

// ─── Submit Referral Dialog ───────────────────────────────────────────────────

function SubmitReferralDialog({ open, onOpenChange, onSuccess }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const form = useForm<SubmitForm>({
    resolver: zodResolver(submitSchema),
    defaultValues: { referredFirstName: '', referredLastName: '', referredEmail: '', referredPhone: '', market: '', roleType: '', relationship: '', notes: '' },
  });

  const mutation = useMutation({
    mutationFn: async (data: SubmitForm) => {
      const res = await apiRequest("POST", "/api/recruiting/referrals", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.isDuplicate) {
        toast({ title: "Duplicate Referral", description: "A referral for this candidate already exists this period." });
      } else {
        toast({ title: "Referral Submitted", description: "The referral has been submitted and a candidate record created." });
        form.reset();
        onOpenChange(false);
        onSuccess();
      }
    },
    onError: () => toast({ title: "Failed to submit referral", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit a Referral</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="referredFirstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl><Input {...field} data-testid="input-referred-first-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="referredLastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl><Input {...field} data-testid="input-referred-last-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="referredEmail" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" {...field} data-testid="input-referred-email" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="referredPhone" render={({ field }) => (
              <FormItem>
                <FormLabel>Phone <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                <FormControl><Input {...field} data-testid="input-referred-phone" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="market" render={({ field }) => (
                <FormItem>
                  <FormLabel>Market</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Chicago" data-testid="input-market" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="relationship" render={({ field }) => (
                <FormItem>
                  <FormLabel>Relationship</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. friend" data-testid="input-relationship" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                <FormControl><Textarea {...field} rows={2} data-testid="textarea-notes" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-submit-referral-confirm">
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit Referral
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReferralDashboard() {
  const { toast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [innerTab, setInnerTab] = useState<"list" | "analytics" | "config">("list");

  // Metrics + periods
  const { data: metricsData, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<{
    metrics: DashboardMetrics;
    periods: string[];
  }>({
    queryKey: ["/api/recruiting/referrals/dashboard/metrics", selectedPeriod],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedPeriod) params.set("periodKey", selectedPeriod);
      const res = await fetch(`/api/recruiting/referrals/dashboard/metrics?${params}`);
      return res.json();
    },
  });

  // All referrals list
  const { data: referralsData, isLoading: referralsLoading, refetch: refetchReferrals } = useQuery<{ referrals: any[] }>({
    queryKey: ["/api/recruiting/referrals?all=true"],
  });

  // Program config
  const { data: configData, refetch: refetchConfig } = useQuery<{ config: ReferralProgramConfig | null }>({
    queryKey: ["/api/recruiting/referrals/program-config"],
  });

  const autoCreateMutation = useMutation({
    mutationFn: async (referralId: string) => {
      const res = await apiRequest("POST", `/api/recruiting/referrals/${referralId}/auto-create-candidate`, {});
      return res.json();
    },
    onSuccess: (data) => {
      const msg = data.alreadyExisted
        ? "Referral linked to existing candidate record."
        : "Candidate record created and linked to referral.";
      toast({ title: "Candidate Created", description: msg });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/referrals?all=true"] });
      refetchMetrics();
    },
    onError: () => toast({ title: "Failed to create candidate", variant: "destructive" }),
  });

  const metrics = metricsData?.metrics;
  const periods = metricsData?.periods || [];
  const allReferrals = referralsData?.referrals || [];
  const config = configData?.config;

  // Filter referrals
  const filtered = allReferrals.filter(r => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.referredFirstName?.toLowerCase().includes(q) ||
        r.referredLastName?.toLowerCase().includes(q) ||
        r.referredEmail?.toLowerCase().includes(q) ||
        r.market?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleRefresh = () => {
    refetchMetrics();
    refetchReferrals();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Referral Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Driver Referral Integration (AMR) — System of Record
          </p>
        </div>
        <div className="flex items-center gap-2">
          {periods.length > 0 && (
            <Select value={selectedPeriod || "__current__"} onValueChange={v => setSelectedPeriod(v === "__current__" ? "" : v)}>
              <SelectTrigger className="w-36" data-testid="select-period">
                <SelectValue placeholder="Current Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__current__">Current Period</SelectItem>
                {periods.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="icon" variant="ghost" onClick={handleRefresh} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setSubmitOpen(true)} data-testid="button-submit-referral">
            <Plus className="mr-2 h-4 w-4" />
            Submit Referral
          </Button>
        </div>
      </div>

      {/* Metrics */}
      {metricsLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : metrics ? (
        <MetricsOverview metrics={metrics} />
      ) : null}

      {/* Inner Tabs */}
      <Tabs value={innerTab} onValueChange={v => setInnerTab(v as any)}>
        <TabsList>
          <TabsTrigger value="list" data-testid="tab-referral-list">
            <Users className="mr-1.5 h-4 w-4" />
            Referrals
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-referral-analytics">
            <BarChart3 className="mr-1.5 h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="config" data-testid="tab-referral-config">
            <Settings className="mr-1.5 h-4 w-4" />
            Program Config
          </TabsTrigger>
        </TabsList>

        {/* List Tab */}
        <TabsContent value="list" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search referrals…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
                data-testid="input-search-referrals"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44" data-testid="select-filter-status">
                <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {referralsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-10 w-10 text-muted-foreground mb-3" />
                <h3 className="text-base font-semibold mb-1">No Referrals Found</h3>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  {allReferrals.length === 0
                    ? "Referrals can be submitted via the button above, the MoveNow Mobile app, or the Driver on Demand portal."
                    : "No referrals match your current filters."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map(referral => (
                <ReferralCard
                  key={referral.id}
                  referral={referral}
                  onAutoCreate={id => autoCreateMutation.mutate(id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-4">
          {metricsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : metrics ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <StatusBreakdown byStatus={metrics.byStatus} total={metrics.totalReferrals} />
              <SourceBreakdown bySource={metrics.bySource} total={metrics.totalReferrals} />
              <TopReferrers referrers={metrics.topReferrers} />

              {/* Reward Summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Reward Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: "Total Earned", value: metrics.totalRewardsEarned, color: "text-foreground" },
                      { label: "Paid Out", value: metrics.totalRewardsPaid, color: "text-green-600" },
                      { label: "Pending Approval", value: metrics.totalRewardsPending, color: "text-yellow-600" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{label}</span>
                        <span className={`text-sm font-semibold ${color}`}>
                          ${parseFloat(value || '0').toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* API Integration Info */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Consumer API Endpoints
                  </CardTitle>
                  <CardDescription>
                    MoveNow Mobile and Driver on Demand integrate via these versioned API routes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { method: "POST", path: "/api/v1/referrals", desc: "Submit a driver referral" },
                      { method: "GET", path: "/api/v1/referrals/status/:id", desc: "Get referral status" },
                      { method: "GET", path: "/api/v1/referrals/by-driver/:driverId", desc: "Get referrals by driver" },
                      { method: "GET", path: "/api/v1/referrals/events/pending", desc: "Poll pending events" },
                      { method: "POST", path: "/api/v1/referrals/events/acknowledge", desc: "Acknowledge consumed events" },
                    ].map(({ method, path, desc }) => (
                      <div key={path} className="flex flex-wrap items-start gap-2 text-xs">
                        <Badge className="font-mono text-xs" variant={method === 'POST' ? 'default' : 'outline'}>
                          {method}
                        </Badge>
                        <code className="text-muted-foreground font-mono">{path}</code>
                        <span className="text-muted-foreground">— {desc}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Authentication: <code className="font-mono">X-API-Key: [DRIVERHUB_API_KEY]</code>
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No analytics data available yet.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config" className="mt-4">
          <ProgramConfigPanel
            config={config || null}
            onSaved={() => refetchConfig()}
          />
        </TabsContent>
      </Tabs>

      {/* Submit Dialog */}
      <SubmitReferralDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        onSuccess={() => {
          refetchReferrals();
          refetchMetrics();
        }}
      />
    </div>
  );
}
