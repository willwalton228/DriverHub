import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Pencil, Copy, Play, Pause, Archive, Flame, Calendar, DollarSign,
  Users, Target, BarChart2, Trash2, ChevronDown, ChevronUp, GripVertical, X
} from "lucide-react";
import { CAMPAIGN_TRIGGER_LABELS, PAYMENT_TIMING_OPTIONS, TARGET_POSITION_OPTIONS, CAMPAIGN_STATUS } from "@shared/schema";

type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "expired";

interface Milestone {
  id?: string;
  name: string;
  triggerType: string;
  triggerValue?: number | null;
  triggerCustomDescription?: string;
  rewardAmount: string;
  paymentTiming: string;
  sortOrder?: number;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  isFeatured: boolean;
  bannerColor: string | null;
  startDate: string | null;
  endDate: string | null;
  eligibleDriverTypes: string[];
  eligibleMarkets: string[];
  eligibleNetworks: string[];
  targetPositions: string[];
  createdAt: string;
  milestones: Milestone[];
  totalPotentialReward: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  active:    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  paused:    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  expired:   "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", scheduled: "Scheduled", active: "Active", paused: "Paused", expired: "Expired"
};

const DRIVER_TYPE_OPTIONS = [
  { value: "shift", label: "Shift" },
  { value: "ondemand", label: "OnDemand" },
  { value: "hybrid", label: "Hybrid" },
];

const HIRING_TRIGGERS = [
  "application_submitted","interview_completed","background_check_passed","mvr_approved",
  "drug_screen_passed","offer_accepted","onboarded","first_shift_worked","first_move_completed"
];
const EMPLOYMENT_TRIGGERS = [
  "7_days_active","14_days_active","30_days_active","45_days_active",
  "60_days_active","90_days_active","6_months_active","1_year_active"
];
const MOVE_TRIGGERS = ["10_moves","25_moves","50_moves","75_moves","100_moves","custom_moves"];
const HOUR_TRIGGERS = ["40_hours","80_hours","160_hours","custom_hours"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Empty milestone ─────────────────────────────────────────────────────────

function emptyMilestone(): Milestone {
  return { name: "", triggerType: "onboarded", rewardAmount: "", paymentTiming: "immediate" };
}

// ─── Milestone Row Editor ────────────────────────────────────────────────────

function MilestoneRow({
  milestone, index, onChange, onRemove
}: { milestone: Milestone; index: number; onChange: (m: Milestone) => void; onRemove: () => void }) {
  const needsValue = milestone.triggerType === "custom_moves" || milestone.triggerType === "custom_hours";
  const isCustom = milestone.triggerType === "custom";

  return (
    <div className="border rounded-md p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Milestone {index + 1}</span>
        <Button size="icon" variant="ghost" onClick={onRemove} data-testid={`button-remove-milestone-${index}`}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={milestone.name}
            onChange={(e) => onChange({ ...milestone, name: e.target.value })}
            placeholder="e.g. Onboarding Bonus"
            data-testid={`input-milestone-name-${index}`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Reward Amount</Label>
          <div className="relative">
            <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={milestone.rewardAmount}
              onChange={(e) => onChange({ ...milestone, rewardAmount: e.target.value })}
              placeholder="250"
              className="pl-7"
              type="number"
              min="0"
              data-testid={`input-milestone-amount-${index}`}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Trigger</Label>
          <Select
            value={milestone.triggerType}
            onValueChange={(v) => onChange({ ...milestone, triggerType: v, triggerValue: null })}
          >
            <SelectTrigger data-testid={`select-milestone-trigger-${index}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Hiring</div>
              {HIRING_TRIGGERS.map((t) => <SelectItem key={t} value={t}>{CAMPAIGN_TRIGGER_LABELS[t as keyof typeof CAMPAIGN_TRIGGER_LABELS]}</SelectItem>)}
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1">Employment</div>
              {EMPLOYMENT_TRIGGERS.map((t) => <SelectItem key={t} value={t}>{CAMPAIGN_TRIGGER_LABELS[t as keyof typeof CAMPAIGN_TRIGGER_LABELS]}</SelectItem>)}
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1">Moves</div>
              {MOVE_TRIGGERS.map((t) => <SelectItem key={t} value={t}>{CAMPAIGN_TRIGGER_LABELS[t as keyof typeof CAMPAIGN_TRIGGER_LABELS]}</SelectItem>)}
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1">Hours</div>
              {HOUR_TRIGGERS.map((t) => <SelectItem key={t} value={t}>{CAMPAIGN_TRIGGER_LABELS[t as keyof typeof CAMPAIGN_TRIGGER_LABELS]}</SelectItem>)}
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1">Other</div>
              <SelectItem value="custom">Custom Trigger</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Payment Timing</Label>
          <Select
            value={milestone.paymentTiming}
            onValueChange={(v) => onChange({ ...milestone, paymentTiming: v })}
          >
            <SelectTrigger data-testid={`select-milestone-timing-${index}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_TIMING_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {needsValue && (
        <div className="space-y-1">
          <Label className="text-xs">{milestone.triggerType === "custom_moves" ? "# of Moves" : "# of Hours"}</Label>
          <Input
            type="number"
            min="1"
            value={milestone.triggerValue ?? ""}
            onChange={(e) => onChange({ ...milestone, triggerValue: Number(e.target.value) })}
            placeholder={milestone.triggerType === "custom_moves" ? "e.g. 35" : "e.g. 120"}
            data-testid={`input-milestone-value-${index}`}
          />
        </div>
      )}
      {isCustom && (
        <div className="space-y-1">
          <Label className="text-xs">Custom Trigger Description</Label>
          <Input
            value={milestone.triggerCustomDescription ?? ""}
            onChange={(e) => onChange({ ...milestone, triggerCustomDescription: e.target.value })}
            placeholder="Describe the qualifying condition..."
            data-testid={`input-milestone-custom-desc-${index}`}
          />
        </div>
      )}
    </div>
  );
}

// ─── Campaign Form Dialog ─────────────────────────────────────────────────────

function CampaignFormDialog({
  open, onClose, initial
}: { open: boolean; onClose: () => void; initial?: Campaign }) {
  const { toast } = useToast();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<string>(initial?.status ?? "draft");
  const [isFeatured, setIsFeatured] = useState(initial?.isFeatured ?? false);
  const [bannerColor, setBannerColor] = useState(initial?.bannerColor ?? "#FF6B35");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [driverTypes, setDriverTypes] = useState<string[]>(initial?.eligibleDriverTypes ?? []);
  const [markets, setMarkets] = useState(initial?.eligibleMarkets.join(", ") ?? "");
  const [networks, setNetworks] = useState(initial?.eligibleNetworks.join(", ") ?? "");
  const [positions, setPositions] = useState<string[]>(initial?.targetPositions ?? []);
  const [milestones, setMilestones] = useState<Milestone[]>(
    initial?.milestones && initial.milestones.length > 0 ? initial.milestones : [emptyMilestone()]
  );

  const toggleArr = (arr: string[], val: string, set: (v: string[]) => void) =>
    set(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name, description, status, isFeatured, bannerColor,
        startDate: startDate || null, endDate: endDate || null,
        eligibleDriverTypes: driverTypes,
        eligibleMarkets: markets.split(",").map((s) => s.trim()).filter(Boolean),
        eligibleNetworks: networks.split(",").map((s) => s.trim()).filter(Boolean),
        targetPositions: positions,
        milestones: milestones.map((m, i) => ({ ...m, sortOrder: i })),
      };
      if (isEdit) {
        return apiRequest("PATCH", `/api/referral-campaigns/${initial!.id}`, payload);
      }
      return apiRequest("POST", "/api/referral-campaigns", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral-campaigns"] });
      toast({ title: isEdit ? "Campaign updated" : "Campaign created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalReward = milestones.reduce((s, m) => s + (parseFloat(m.rewardAmount) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Campaign" : "New Referral Campaign"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {/* General */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">General Information</h3>
            <div className="space-y-1">
              <Label className="text-xs">Campaign Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Driver Referral Bonus" data-testid="input-campaign-name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe this campaign to drivers..." rows={2} data-testid="input-campaign-description" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger data-testid="select-campaign-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_STATUS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-campaign-start-date" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-campaign-end-date" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={isFeatured} onCheckedChange={(v) => setIsFeatured(!!v)} id="featured" data-testid="checkbox-featured" />
                <Label htmlFor="featured" className="text-xs cursor-pointer">Featured on Driver App Home</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Banner Color</Label>
                <input type="color" value={bannerColor} onChange={(e) => setBannerColor(e.target.value)} className="h-8 w-12 rounded border cursor-pointer" data-testid="input-banner-color" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Eligibility */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Eligibility</h3>
            <div className="space-y-1">
              <Label className="text-xs">Eligible Driver Types</Label>
              <div className="flex gap-4 flex-wrap">
                {DRIVER_TYPE_OPTIONS.map((o) => (
                  <div key={o.value} className="flex items-center gap-2">
                    <Checkbox
                      checked={driverTypes.includes(o.value)}
                      onCheckedChange={() => toggleArr(driverTypes, o.value, setDriverTypes)}
                      id={`dt-${o.value}`}
                      data-testid={`checkbox-driver-type-${o.value}`}
                    />
                    <Label htmlFor={`dt-${o.value}`} className="text-xs cursor-pointer">{o.label}</Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Leave all unchecked for all driver types</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Eligible Markets (comma-separated)</Label>
                <Input value={markets} onChange={(e) => setMarkets(e.target.value)} placeholder="Dallas, Houston, Austin" data-testid="input-eligible-markets" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Eligible Networks (optional, comma-separated)</Label>
                <Input value={networks} onChange={(e) => setNetworks(e.target.value)} placeholder="Network A, Network B" data-testid="input-eligible-networks" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Target Positions</Label>
              <div className="flex gap-4 flex-wrap">
                {TARGET_POSITION_OPTIONS.map((o) => (
                  <div key={o.value} className="flex items-center gap-2">
                    <Checkbox
                      checked={positions.includes(o.value)}
                      onCheckedChange={() => toggleArr(positions, o.value, setPositions)}
                      id={`pos-${o.value}`}
                      data-testid={`checkbox-position-${o.value}`}
                    />
                    <Label htmlFor={`pos-${o.value}`} className="text-xs cursor-pointer">{o.label}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          {/* Reward Milestones */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold">Reward Milestones</h3>
              {totalReward > 0 && (
                <span className="text-xs text-muted-foreground">Total Potential Reward: <strong className="text-foreground">{fmt(totalReward)}</strong></span>
              )}
            </div>
            <div className="space-y-2">
              {milestones.map((m, i) => (
                <MilestoneRow
                  key={i}
                  index={i}
                  milestone={m}
                  onChange={(updated) => setMilestones((prev) => prev.map((x, j) => j === i ? updated : x))}
                  onRemove={() => setMilestones((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMilestones((prev) => [...prev, emptyMilestone()])}
              data-testid="button-add-milestone"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Milestone
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-campaign">Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name.trim()} data-testid="button-save-campaign">
              {saveMutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Campaign"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Campaign Card ─────────────────────────────────────────────────────────────

function CampaignCard({ campaign, onEdit, onDuplicate, onStatusChange }: {
  campaign: Campaign;
  onEdit: () => void;
  onDuplicate: () => void;
  onStatusChange: (status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const nextStatus: Record<string, { label: string; status: string; icon: JSX.Element } | null> = {
    draft:     { label: "Schedule",  status: "scheduled", icon: <Calendar className="h-4 w-4" /> },
    scheduled: { label: "Activate",  status: "active",    icon: <Play className="h-4 w-4" /> },
    active:    { label: "Pause",     status: "paused",    icon: <Pause className="h-4 w-4" /> },
    paused:    { label: "Reactivate",status: "active",    icon: <Play className="h-4 w-4" /> },
    expired:   null,
  };
  const action = nextStatus[campaign.status];

  return (
    <Card data-testid={`card-campaign-${campaign.id}`}>
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: campaign.bannerColor ?? "#FF6B35" }} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base" data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</CardTitle>
              {campaign.isFeatured && (
                <Badge className="text-xs" data-testid={`badge-featured-${campaign.id}`}>
                  <Flame className="h-3 w-3 mr-1" />Featured
                </Badge>
              )}
              <Badge className={`text-xs ${STATUS_COLORS[campaign.status]}`} data-testid={`badge-status-${campaign.id}`}>
                {STATUS_LABELS[campaign.status]}
              </Badge>
            </div>
            {campaign.description && (
              <CardDescription className="mt-1 text-xs">{campaign.description}</CardDescription>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {action && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange(action.status)} data-testid={`button-campaign-action-${campaign.id}`}>
              {action.icon}
              <span className="ml-1">{action.label}</span>
            </Button>
          )}
          {campaign.status !== "expired" && (
            <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-campaign-${campaign.id}`}><Pencil className="h-4 w-4" /></Button>
          )}
          <Button size="icon" variant="ghost" onClick={onDuplicate} data-testid={`button-duplicate-campaign-${campaign.id}`}><Copy className="h-4 w-4" /></Button>
          {campaign.status === "active" && (
            <Button size="icon" variant="ghost" onClick={() => onStatusChange("expired")} data-testid={`button-expire-campaign-${campaign.id}`}>
              <Archive className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
          <div>
            <p className="text-muted-foreground">Date Range</p>
            <p className="font-medium">{fmtDate(campaign.startDate)} – {fmtDate(campaign.endDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total Potential</p>
            <p className="font-medium text-primary">{fmt(campaign.totalPotentialReward)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Milestones</p>
            <p className="font-medium">{campaign.milestones.length}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Driver Types</p>
            <p className="font-medium">{campaign.eligibleDriverTypes.length > 0 ? campaign.eligibleDriverTypes.join(", ") : "All"}</p>
          </div>
        </div>

        {campaign.milestones.length > 0 && (
          <div className="mt-3">
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => setExpanded(!expanded)}
              data-testid={`button-expand-milestones-${campaign.id}`}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Hide milestones" : `Show ${campaign.milestones.length} milestone${campaign.milestones.length !== 1 ? "s" : ""}`}
            </button>
            {expanded && (
              <div className="mt-2 space-y-1">
                {campaign.milestones.map((m, i) => (
                  <div key={m.id ?? i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                    <span className="text-muted-foreground">{CAMPAIGN_TRIGGER_LABELS[m.triggerType as keyof typeof CAMPAIGN_TRIGGER_LABELS] ?? m.triggerType}</span>
                    <span className="font-medium">{fmt(Number(m.rewardAmount))}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs pt-1 font-semibold">
                  <span>Total Potential Reward</span>
                  <span className="text-primary">{fmt(campaign.totalPotentialReward)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Report Panel ─────────────────────────────────────────────────────────────

function ReportPanel() {
  const { data, isLoading } = useQuery<{ totalBonusesEarned: number; totalBonusesPaid: number; topDrivers: { driverId: string; count: number }[] }>({
    queryKey: ["/api/referral-campaigns-report"],
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading report…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Bonuses Earned", value: fmt(data?.totalBonusesEarned ?? 0) },
          { label: "Total Bonuses Paid", value: fmt(data?.totalBonusesPaid ?? 0) },
          { label: "Pending Payout", value: fmt((data?.totalBonusesEarned ?? 0) - (data?.totalBonusesPaid ?? 0)) },
          { label: "Top Referrers", value: String(data?.topDrivers?.length ?? 0) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold mt-0.5" data-testid={`text-report-${s.label.toLowerCase().replace(/ /g, "-")}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {(data?.topDrivers?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top Referring Drivers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {data!.topDrivers.map((d, i) => (
                <div key={d.driverId} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                    <span className="font-mono text-xs">{d.driverId}</span>
                  </div>
                  <Badge data-testid={`badge-top-driver-${d.driverId}`}>{d.count} milestone{d.count !== 1 ? "s" : ""}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ReferralCampaigns() {
  const { toast } = useToast();
  const [tab, setTab] = useState("campaigns");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Campaign | undefined>();

  const { data, isLoading } = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ["/api/referral-campaigns"],
  });
  const campaigns = data?.campaigns ?? [];
  const filtered = filterStatus === "all" ? campaigns : campaigns.filter((c) => c.status === filterStatus);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/referral-campaigns/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral-campaigns"] });
      toast({ title: "Campaign status updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/referral-campaigns/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral-campaigns"] });
      toast({ title: "Campaign duplicated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const stats = {
    total: campaigns.length,
    active: campaigns.filter((c) => c.status === "active").length,
    draft: campaigns.filter((c) => c.status === "draft").length,
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Referral Campaign Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage driver referral bonus campaigns with configurable milestones.</p>
        </div>
        <Button onClick={() => { setEditTarget(undefined); setFormOpen(true); }} data-testid="button-new-campaign">
          <Plus className="h-4 w-4 mr-1" />
          New Campaign
        </Button>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: "Total Campaigns", value: stats.total, icon: <Target className="h-4 w-4" /> },
          { label: "Active", value: stats.active, icon: <Play className="h-4 w-4 text-green-600" /> },
          { label: "Draft", value: stats.draft, icon: <Pencil className="h-4 w-4 text-muted-foreground" /> },
        ].map((s) => (
          <Card key={s.label} className="flex-1 min-w-[120px]">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              {s.icon}
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold" data-testid={`text-stat-${s.label.toLowerCase().replace(/ /g, "-")}`}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="campaigns" data-testid="tab-campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-4 space-y-4">
          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {["all", ...CAMPAIGN_STATUS].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={filterStatus === s ? "default" : "outline"}
                onClick={() => setFilterStatus(s)}
                data-testid={`button-filter-${s}`}
              >
                {s === "all" ? "All" : STATUS_LABELS[s]}
                {s !== "all" && (
                  <span className="ml-1 text-xs opacity-70">
                    {campaigns.filter((c) => c.status === s).length}
                  </span>
                )}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading campaigns…</p>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">No campaigns yet</p>
                <p className="text-sm text-muted-foreground mt-1">Create your first referral campaign to start rewarding drivers.</p>
                <Button className="mt-4" onClick={() => { setEditTarget(undefined); setFormOpen(true); }} data-testid="button-create-first-campaign">
                  <Plus className="h-4 w-4 mr-1" />Create Campaign
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  onEdit={() => { setEditTarget(c); setFormOpen(true); }}
                  onDuplicate={() => duplicateMutation.mutate(c.id)}
                  onStatusChange={(status) => statusMutation.mutate({ id: c.id, status })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          <ReportPanel />
        </TabsContent>
      </Tabs>

      {formOpen && (
        <CampaignFormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditTarget(undefined); }}
          initial={editTarget}
        />
      )}
    </div>
  );
}
