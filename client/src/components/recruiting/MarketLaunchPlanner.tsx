import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GoLiveForecastCard, ForecastSummaryStrip } from "./GoLiveForecastCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Rocket, MapPin, Calendar, Users, DollarSign, Megaphone, Clock, AlertTriangle,
  TrendingUp, Loader2, RefreshCw, Trash2, ChevronRight, Plus, Target, Star,
  Radio, BarChart3, Flag, CheckCircle2, Lightbulb, Building2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LaunchPlanAdSource {
  channel: string;
  priority: "primary" | "secondary" | "supplemental";
  rationale: string;
  estimatedCostTier: "low" | "medium" | "high";
}

interface LaunchPlanMilestone {
  week: number;
  goal: string;
  applicantTarget: number;
  hireTarget: number;
}

interface LaunchPlanOutput {
  headcountTarget: number;
  payRange: { min: number; max: number; type: string };
  adSources: LaunchPlanAdSource[];
  expectedTimeToFill: { days: number; weeksLabel: string };
  dailyApplicantTarget: number;
  weeklyApplicantTarget: number;
  weeklyMilestones: LaunchPlanMilestone[];
  keyRisks: string[];
  strategicNotes: string;
  generatedAt: string;
}

interface MarketLaunchPlan {
  id: string;
  name: string;
  market: string;
  customerId?: string;
  customerName?: string;
  customerStartDate?: string;
  roleType: string;
  roleCounts: Record<string, number>;
  hoursRequirements: Record<string, any>;
  generatedPlan?: LaunchPlanOutput | null;
  status: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Form schema ───────────────────────────────────────────────────────────────

const ROLE_TYPES = [
  { value: "on_demand", label: "On-Demand" },
  { value: "shuttle", label: "Shuttle" },
  { value: "cdl", label: "CDL" },
  { value: "mixed", label: "Mixed" },
] as const;

const ROLE_LABELS: Record<string, string> = {
  on_demand: "On-Demand Driver",
  shuttle: "Shuttle Driver",
  cdl_a: "CDL-A Driver",
  cdl_b: "CDL-B Driver",
  cdl: "CDL Driver",
  mixed: "Mixed Roles",
};

const planFormSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  market: z.string().min(1, "Market is required"),
  customerName: z.string().optional(),
  customerStartDate: z.string().min(1, "Start date is required"),
  roleType: z.enum(["on_demand", "shuttle", "cdl", "mixed"]),
  onDemandCount: z.coerce.number().min(0).default(0),
  shuttleCount: z.coerce.number().min(0).default(0),
  cdlACount: z.coerce.number().min(0).default(0),
  cdlBCount: z.coerce.number().min(0).default(0),
  coverageStart: z.string().optional(),
  coverageEnd: z.string().optional(),
  shiftsPerDay: z.coerce.number().min(1).max(4).optional(),
  weekendRequired: z.boolean().default(false),
  additionalNotes: z.string().optional(),
});

type PlanFormValues = z.infer<typeof planFormSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

const COST_TIER_COLORS: Record<string, string> = {
  low:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  high:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const PRIORITY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  primary:      { label: "Primary",      icon: <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-500" />, color: "bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-800" },
  secondary:    { label: "Secondary",    icon: <Star className="h-3.5 w-3.5 fill-slate-300 text-slate-400" />,   color: "bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800" },
  supplemental: { label: "Supplemental", icon: <Radio className="h-3.5 w-3.5 text-muted-foreground" />,          color: "bg-muted/50 border-border" },
};

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  draft:      { label: "Draft",      color: "bg-muted text-muted-foreground" },
  generating: { label: "Generating", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  active:     { label: "Active",     color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  archived:   { label: "Archived",   color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return dateStr; }
}

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  try {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch { return null; }
}

// ── Plan Output Panel ─────────────────────────────────────────────────────────

function PlanOutputPanel({ plan }: { plan: MarketLaunchPlan }) {
  const output = plan.generatedPlan;
  const days = daysUntil(plan.customerStartDate);

  if (plan.status === "generating" || !output) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Generating your deployment plan…</p>
        <p className="text-xs">This usually takes 10–20 seconds.</p>
      </div>
    );
  }

  const urgency = days !== null && days < 14;

  return (
    <div className="space-y-4" data-testid="launch-plan-output">
      {/* Urgency banner */}
      {urgency && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300 font-medium">
            {days !== null && days <= 0
              ? "Launch date has passed — activate contingency sourcing immediately."
              : `Only ${days} day${days !== 1 ? "s" : ""} until service start. Immediate action required.`}
          </p>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: <Users className="h-4 w-4" />, label: "Headcount Target", value: output.headcountTarget, suffix: " drivers" },
          { icon: <Clock className="h-4 w-4" />, label: "Time to Fill", value: output.expectedTimeToFill.weeksLabel },
          { icon: <Target className="h-4 w-4" />, label: "Daily Applicants", value: output.dailyApplicantTarget, suffix: "/day" },
          { icon: <BarChart3 className="h-4 w-4" />, label: "Weekly Applicants", value: output.weeklyApplicantTarget, suffix: "/week" },
        ].map((kpi, i) => (
          <div key={i} className="bg-muted/40 rounded-md p-3 text-center">
            <div className="flex justify-center text-primary mb-1">{kpi.icon}</div>
            <div className="text-xl font-bold text-foreground">
              {kpi.value}{kpi.suffix ?? ""}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Pay Range */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Recommended Pay Range
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">${output.payRange.min.toFixed(2)}</span>
            <span className="text-muted-foreground">–</span>
            <span className="text-2xl font-bold">${output.payRange.max.toFixed(2)}</span>
            <span className="text-sm text-muted-foreground ml-1">
              / {output.payRange.type === "hourly" ? "hr" : output.payRange.type === "per_move" ? "move" : "yr"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Competitive range for {plan.market} market based on role type and coverage requirements.
          </p>
        </CardContent>
      </Card>

      {/* Ad Sources */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            Recommended Ad Sources
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {output.adSources.map((src, i) => {
            const meta = PRIORITY_META[src.priority] ?? PRIORITY_META.supplemental;
            return (
              <div key={i} className={`flex items-start gap-3 p-2.5 rounded-md border ${meta.color}`}>
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  {meta.icon}
                  <span className="text-xs font-semibold">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{src.channel}</span>
                    <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium ${COST_TIER_COLORS[src.estimatedCostTier]}`}>
                      {src.estimatedCostTier} cost
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{src.rationale}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Weekly Milestones */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Weekly Hiring Milestones
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {output.weeklyMilestones.map((ms) => (
            <div key={ms.week} className="flex items-start gap-3">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                W{ms.week}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">{ms.goal}</p>
                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {ms.applicantTarget} applicants
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {ms.hireTarget} hire{ms.hireTarget !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Key Risks */}
      {output.keyRisks?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Flag className="h-4 w-4 text-destructive" />
              Key Risks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {output.keyRisks.map((risk, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-foreground/80">{risk}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Strategic Notes */}
      {output.strategicNotes && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200 dark:bg-blue-900/10 dark:border-blue-800">
          <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-0.5">Strategic Guidance</p>
            <p className="text-sm text-blue-700 dark:text-blue-300">{output.strategicNotes}</p>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-right">
        Generated {output.generatedAt ? formatDate(output.generatedAt) : "recently"} · Advisory only
      </p>
    </div>
  );
}

// ── Plan Detail Dialog ────────────────────────────────────────────────────────

function PlanDetailDialog({ plan, onRegenerate, onDelete }: {
  plan: MarketLaunchPlan;
  onRegenerate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // Poll while generating
  useEffect(() => {
    if (!open || plan.status !== "generating") return;
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/launch-plans"] });
    }, 3000);
    return () => clearInterval(timer);
  }, [open, plan.status, queryClient]);

  const days = daysUntil(plan.customerStartDate);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-view-plan-${plan.id}`}>
          View Plan
          <ChevronRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg">{plan.name}</DialogTitle>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{plan.market}</span>
                {plan.customerName && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{plan.customerName}</span>}
                {plan.customerStartDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Launch: {formatDate(plan.customerStartDate)}
                    {days !== null && (
                      <span className={days <= 0 ? "text-red-600" : days < 14 ? "text-amber-600" : ""}>
                        ({days <= 0 ? "overdue" : `${days}d away`})
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_DISPLAY[plan.status]?.color ?? "bg-muted text-muted-foreground"}`}>
              {STATUS_DISPLAY[plan.status]?.label ?? plan.status}
            </span>
          </div>
        </DialogHeader>

        <PlanOutputPanel plan={plan} />

        {/* Go-Live Forecast — Ticket 22 */}
        <GoLiveForecastCard
          planId={plan.id}
          forecast={(plan as any).goLiveForecast ?? null}
          market={plan.market}
          queryKey={["/api/recruiting/launch-plans"]}
        />

        <DialogFooter className="flex flex-wrap gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { onRegenerate(plan.id); }}
            disabled={plan.status === "generating"}
            data-testid={`button-regenerate-plan-${plan.id}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${plan.status === "generating" ? "animate-spin" : ""}`} />
            Regenerate
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid={`button-delete-plan-${plan.id}`}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5 text-destructive" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Launch Plan?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{plan.name}". This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { onDelete(plan.id); setOpen(false); }}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── New Plan Form ─────────────────────────────────────────────────────────────

function NewPlanForm({ markets, onCreated }: { markets: string[]; onCreated: (plan: MarketLaunchPlan) => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      name: "",
      market: "",
      customerName: "",
      customerStartDate: "",
      roleType: "on_demand",
      onDemandCount: 0,
      shuttleCount: 0,
      cdlACount: 0,
      cdlBCount: 0,
      coverageStart: "",
      coverageEnd: "",
      shiftsPerDay: 1,
      weekendRequired: false,
      additionalNotes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: PlanFormValues) => {
      const roleCounts: Record<string, number> = {};
      if (values.onDemandCount > 0) roleCounts["on_demand"] = values.onDemandCount;
      if (values.shuttleCount > 0)  roleCounts["shuttle"]   = values.shuttleCount;
      if (values.cdlACount > 0)     roleCounts["cdl_a"]     = values.cdlACount;
      if (values.cdlBCount > 0)     roleCounts["cdl_b"]     = values.cdlBCount;

      return apiRequest("POST", "/api/recruiting/launch-plans", {
        name: values.name,
        market: values.market,
        customerName: values.customerName || null,
        customerStartDate: values.customerStartDate,
        roleType: values.roleType,
        roleCounts,
        hoursRequirements: {
          coverageStart: values.coverageStart || null,
          coverageEnd: values.coverageEnd || null,
          shiftsPerDay: values.shiftsPerDay || 1,
          weekendRequired: values.weekendRequired,
          notes: values.additionalNotes || null,
        },
      });
    },
    onSuccess: (plan: MarketLaunchPlan) => {
      toast({ title: "Plan created — generating hiring recommendations…" });
      onCreated(plan);
      setOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to create plan", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-new-launch-plan">
          <Plus className="h-4 w-4 mr-2" />
          New Launch Plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            New Market Launch Plan
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-5">
            {/* Plan name */}
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Plan Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Phoenix Launch — AcmeCo May 2026" {...field} data-testid="input-launch-plan-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Market */}
              <FormField control={form.control} name="market" render={({ field }) => (
                <FormItem>
                  <FormLabel>Market</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Phoenix, AZ" list="markets-list" {...field} data-testid="input-launch-plan-market" />
                  </FormControl>
                  <datalist id="markets-list">
                    {markets.map(m => <option key={m} value={m} />)}
                  </datalist>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Customer Name */}
              <FormField control={form.control} name="customerName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. AcmeCo Logistics" {...field} data-testid="input-launch-plan-customer" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Start Date */}
              <FormField control={form.control} name="customerStartDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Start Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-launch-plan-start-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Role Type */}
              <FormField control={form.control} name="roleType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Role Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-launch-plan-role-type">
                        <SelectValue placeholder="Select role type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROLE_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <Separator />

            {/* Role Counts */}
            <div>
              <Label className="text-sm font-medium">Roles Needed</Label>
              <p className="text-xs text-muted-foreground mb-3">Enter headcount needed by role type. Leave at 0 to exclude.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { name: "onDemandCount", label: "On-Demand" },
                  { name: "shuttleCount",  label: "Shuttle" },
                  { name: "cdlACount",     label: "CDL-A" },
                  { name: "cdlBCount",     label: "CDL-B" },
                ] .map(({ name, label }) => (
                  <FormField key={name} control={form.control} name={name as keyof PlanFormValues} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{label}</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={500} {...field} data-testid={`input-role-count-${name}`} />
                      </FormControl>
                    </FormItem>
                  )} />
                ))}
              </div>
            </div>

            <Separator />

            {/* Coverage Requirements */}
            <div>
              <Label className="text-sm font-medium">Coverage Requirements</Label>
              <p className="text-xs text-muted-foreground mb-3">Optional — helps generate a more accurate plan.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField control={form.control} name="coverageStart" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Coverage Start</FormLabel>
                    <FormControl><Input type="time" {...field} data-testid="input-coverage-start" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="coverageEnd" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Coverage End</FormLabel>
                    <FormControl><Input type="time" {...field} data-testid="input-coverage-end" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="shiftsPerDay" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Shifts / Day</FormLabel>
                    <FormControl><Input type="number" min={1} max={4} {...field} data-testid="input-shifts-per-day" /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="flex items-center gap-2 mt-3">
                <input
                  type="checkbox"
                  id="weekendRequired"
                  {...form.register("weekendRequired")}
                  className="h-4 w-4 rounded"
                  data-testid="checkbox-weekend-required"
                />
                <Label htmlFor="weekendRequired" className="text-sm cursor-pointer">Weekend coverage required</Label>
              </div>
              <FormField control={form.control} name="additionalNotes" render={({ field }) => (
                <FormItem className="mt-3">
                  <FormLabel className="text-xs">Additional Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Any special requirements or constraints..." {...field} data-testid="textarea-additional-notes" />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-launch-plan">
                {createMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>
                  : <><Rocket className="h-4 w-4 mr-2" />Generate Plan</>}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function MarketLaunchPlanner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: plans = [], isLoading } = useQuery<MarketLaunchPlan[]>({
    queryKey: ["/api/recruiting/launch-plans"],
    refetchInterval: (data) => {
      const arr = Array.isArray(data) ? data : [];
      return arr.some((p: MarketLaunchPlan) => p.status === "generating") ? 4000 : false;
    },
  });

  const { data: markets = [] } = useQuery<string[]>({
    queryKey: ["/api/recruiting/source-performance/markets"],
  });

  const regenerateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/recruiting/launch-plans/${id}/regenerate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/launch-plans"] });
      toast({ title: "Regenerating plan…" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/recruiting/launch-plans/${id}`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/launch-plans"] });
      toast({ title: "Plan deleted" });
    },
  });

  const handleCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/recruiting/launch-plans"] });
  }, [queryClient]);

  const activePlans = plans.filter(p => p.status === "active" || p.status === "generating");
  const draftPlans  = plans.filter(p => p.status === "draft");
  const archivedPlans = plans.filter(p => p.status === "archived");

  return (
    <div className="space-y-6" data-testid="market-launch-planner">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Market Launch Rapid Deployment Planner
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI-generated hiring plans to reduce 4–6 week customer launch timelines. Plans are advisory only.
          </p>
        </div>
        <NewPlanForm markets={markets as string[]} onCreated={handleCreated} />
      </div>

      {/* Empty state */}
      {!isLoading && plans.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Rocket className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">No launch plans yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first plan to get AI-generated headcount, pay, and sourcing recommendations for a new customer launch.
              </p>
            </div>
            <NewPlanForm markets={markets as string[]} onCreated={handleCreated} />
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading plans…</span>
        </div>
      )}

      {/* Active Plans */}
      {activePlans.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">
            Active Plans ({activePlans.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePlans.map((plan) => {
              const days = daysUntil(plan.customerStartDate);
              const totalRoles = Object.values(plan.roleCounts).reduce((s, v) => s + v, 0);
              return (
                <Card key={plan.id} data-testid={`card-launch-plan-${plan.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{plan.name}</CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{plan.market}</span>
                          {plan.customerName && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{plan.customerName}</span>}
                        </CardDescription>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_DISPLAY[plan.status]?.color}`}>
                        {plan.status === "generating" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {STATUS_DISPLAY[plan.status]?.label}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div className="bg-muted/40 rounded-md p-2">
                        <div className="text-lg font-bold">{plan.generatedPlan?.headcountTarget ?? totalRoles}</div>
                        <div className="text-[11px] text-muted-foreground">Headcount</div>
                      </div>
                      <div className="bg-muted/40 rounded-md p-2">
                        <div className="text-lg font-bold">{plan.generatedPlan?.expectedTimeToFill?.weeksLabel ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground">Time to Fill</div>
                      </div>
                      <div className="bg-muted/40 rounded-md p-2">
                        <div className={`text-lg font-bold ${days !== null && days < 14 ? "text-red-600" : ""}`}>
                          {days !== null ? (days <= 0 ? "Past" : `${days}d`) : "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">Until Launch</div>
                      </div>
                    </div>
                    {plan.customerStartDate && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Launch date: {formatDate(plan.customerStartDate)}
                      </p>
                    )}
                    {/* Go-Live Forecast summary — Ticket 22 */}
                    <ForecastSummaryStrip forecast={(plan as any).goLiveForecast ?? null} />
                  </CardContent>
                  <CardFooter className="pt-0 flex gap-2">
                    <PlanDetailDialog
                      plan={plan}
                      onRegenerate={(id) => regenerateMutation.mutate(id)}
                      onDelete={(id) => deleteMutation.mutate(id)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => regenerateMutation.mutate(plan.id)}
                      disabled={plan.status === "generating" || regenerateMutation.isPending}
                      data-testid={`button-quick-regenerate-${plan.id}`}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${plan.status === "generating" ? "animate-spin" : ""}`} />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Draft Plans */}
      {draftPlans.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">
            Draft Plans ({draftPlans.length})
          </h3>
          <div className="space-y-2">
            {draftPlans.map((plan) => (
              <div key={plan.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-md border bg-card" data-testid={`row-draft-plan-${plan.id}`}>
                <div>
                  <p className="text-sm font-medium">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">{plan.market}{plan.customerName ? ` · ${plan.customerName}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <PlanDetailDialog plan={plan} onRegenerate={(id) => regenerateMutation.mutate(id)} onDelete={(id) => deleteMutation.mutate(id)} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-delete-draft-${plan.id}`}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Draft?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete "{plan.name}".</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(plan.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
