import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Shield,
  TrendingDown,
  TrendingUp,
  Minus,
  Clock,
  AlertTriangle,
  CheckCircle,
  Camera,
  FileText,
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  Send,
  Download,
  BarChart3,
  Target,
  Loader2,
} from "lucide-react";

interface DashboardMetrics {
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  claimsFrequency: number;
  severityWeightedIndex: number;
  totalClaimsCost: number;
  avgDaysToClose: number;
  openClaimsOver30Days: number;
  atFaultPercent: number;
  notAtFaultPercent: number;
  pickupCompliancePercent: number;
  dropoffCompliancePercent: number;
  claimsWithEvidencePercent: number;
  totalClaims: number;
  totalMoves: number;
  openClaims: number;
  activeDrivers: number;
}

interface TrendData {
  periodDays: number;
  weeks: {
    weekStart: string;
    weekEnd: string;
    claimsCount: number;
    movesCount: number;
    claimsPer1k: number;
    avgSeverity: number;
    photoCompliancePercent: number;
  }[];
  trends: {
    frequency: string;
    frequencyChange: number;
    severity: string;
    severityChange: number;
    photoCompliance: string;
    photoChange: number;
  };
}

interface MitigationAction {
  id: string;
  title: string;
  description: string;
  actionType: string;
  status: string;
  triggerPattern?: string;
  implementedAt?: string;
  completedAt?: string;
  resultSummary?: string;
  createdAt: string;
}

interface CarrierNarrative {
  id: string;
  title: string;
  narrativeType: string;
  generatedContent?: string;
  editedContent?: string;
  isEdited: boolean;
  status: string;
  periodStart?: string;
  periodEnd?: string;
  createdAt: string;
  approvedAt?: string;
}

function TrendIndicator({ trend, value }: { trend: string; value: number }) {
  if (trend === "improving") {
    return (
      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
        <TrendingDown className="h-4 w-4" />
        <span className="text-xs font-medium">{value > 0 ? "+" : ""}{value}</span>
      </div>
    );
  }
  if (trend === "worsening") {
    return (
      <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
        <TrendingUp className="h-4 w-4" />
        <span className="text-xs font-medium">{value > 0 ? "+" : ""}{value}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <Minus className="h-4 w-4" />
      <span className="text-xs font-medium">Stable</span>
    </div>
  );
}

function KPICard({ 
  title, 
  value, 
  subtitle,
  trend,
  trendValue,
  warning,
  icon: Icon,
}: { 
  title: string; 
  value: string | number;
  subtitle?: string;
  trend?: string;
  trendValue?: number;
  warning?: boolean;
  icon?: any;
}) {
  return (
    <Card className={warning ? "border-red-500/50" : ""} data-testid={`kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-muted-foreground">{title}</div>
            <div className={`text-2xl font-bold ${warning ? 'text-red-500' : ''}`}>{value}</div>
            {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
          </div>
          <div className="flex flex-col items-end gap-1">
            {Icon && <Icon className={`h-5 w-5 ${warning ? 'text-red-500' : 'text-muted-foreground'}`} />}
            {trend && trendValue !== undefined && <TrendIndicator trend={trend} value={trendValue} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CarrierDashboard() {
  const { toast } = useToast();
  const [periodDays, setPeriodDays] = useState(90);
  const [isAddingAction, setIsAddingAction] = useState(false);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [editingNarrative, setEditingNarrative] = useState<CarrierNarrative | null>(null);
  const [newAction, setNewAction] = useState({
    title: "",
    description: "",
    actionType: "ROUTING_CHANGE",
    triggerPattern: "",
  });

  // Fetch dashboard metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: [`/api/carrier/dashboard?periodDays=${periodDays}`],
  });

  // Fetch trend data
  const { data: trends, isLoading: trendsLoading } = useQuery<TrendData>({
    queryKey: [`/api/carrier/trends?periodDays=${periodDays}`],
  });

  // Fetch mitigation actions
  const { data: mitigationActions = [] } = useQuery<MitigationAction[]>({
    queryKey: ["/api/carrier/mitigation-actions"],
  });

  // Fetch narratives
  const { data: narratives = [] } = useQuery<CarrierNarrative[]>({
    queryKey: ["/api/carrier/narratives"],
  });

  // Create mitigation action mutation
  const createActionMutation = useMutation({
    mutationFn: async (action: typeof newAction) => {
      const res = await apiRequest("POST", "/api/carrier/mitigation-actions", action);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carrier/mitigation-actions"] });
      setIsAddingAction(false);
      setNewAction({ title: "", description: "", actionType: "ROUTING_CHANGE", triggerPattern: "" });
      toast({ title: "Mitigation action created" });
    },
    onError: () => {
      toast({ title: "Failed to create action", variant: "destructive" });
    },
  });

  // Generate narrative mutation
  const generateNarrativeMutation = useMutation({
    mutationFn: async (narrativeType: string) => {
      const res = await apiRequest("POST", "/api/carrier/generate-narrative", { narrativeType, periodDays });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carrier/narratives"] });
      setIsGeneratingNarrative(false);
      toast({ title: "Narrative generated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to generate narrative", variant: "destructive" });
    },
  });

  // Update narrative mutation
  const updateNarrativeMutation = useMutation({
    mutationFn: async ({ id, editedContent }: { id: string; editedContent: string }) => {
      const res = await apiRequest("PATCH", `/api/carrier/narratives/${id}`, { editedContent });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carrier/narratives"] });
      setEditingNarrative(null);
      toast({ title: "Narrative updated" });
    },
  });

  // Approve narrative mutation
  const approveNarrativeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/carrier/narratives/${id}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/carrier/narratives"] });
      toast({ title: "Narrative approved" });
    },
  });

  const loading = metricsLoading || trendsLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="page-title">
            <Shield className="h-8 w-8 text-primary" />
            Carrier Intelligence Dashboard
          </h1>
          <p className="text-muted-foreground">Insurance-grade risk analysis and reporting</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={periodDays.toString()} onValueChange={(v) => setPeriodDays(parseInt(v))}>
            <SelectTrigger className="w-[140px]" data-testid="select-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="180">Last 180 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* 1) Executive KPI Summary */}
          <section data-testid="section-kpi-summary">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Executive KPI Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KPICard
                title="Claims Frequency"
                value={`${metrics?.claimsFrequency || 0}`}
                subtitle="per 1,000 moves"
                trend={trends?.trends.frequency}
                trendValue={trends?.trends.frequencyChange}
                warning={(metrics?.claimsFrequency || 0) > 10}
                icon={Target}
              />
              <KPICard
                title="Severity Index"
                value={metrics?.severityWeightedIndex || 0}
                subtitle="weighted avg"
                trend={trends?.trends.severity}
                trendValue={trends?.trends.severityChange}
                warning={(metrics?.severityWeightedIndex || 0) > 3}
              />
              <KPICard
                title="Total Cost"
                value={`$${(metrics?.totalClaimsCost || 0).toLocaleString()}`}
                subtitle={`${periodDays}-day period`}
              />
              <KPICard
                title="Avg Days to Close"
                value={metrics?.avgDaysToClose || 0}
                subtitle="resolution time"
                warning={(metrics?.avgDaysToClose || 0) > 45}
                icon={Clock}
              />
              <KPICard
                title="Open >30 Days"
                value={metrics?.openClaimsOver30Days || 0}
                subtitle="aging claims"
                warning={(metrics?.openClaimsOver30Days || 0) > 5}
                icon={AlertTriangle}
              />
              <KPICard
                title="At-Fault Rate"
                value={`${metrics?.atFaultPercent || 0}%`}
                subtitle={`${metrics?.notAtFaultPercent || 0}% not-at-fault`}
                warning={(metrics?.atFaultPercent || 0) > 50}
              />
            </div>
          </section>

          {/* 2) Claims & Severity Trends */}
          <section data-testid="section-trends">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              Claims & Severity Trends
            </h2>
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Trend Summary Cards */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <div className="text-sm font-medium">Frequency Trend</div>
                        <div className="text-xs text-muted-foreground">Claims per 1k moves</div>
                      </div>
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                        trends?.trends.frequency === 'improving' 
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                          : trends?.trends.frequency === 'worsening' 
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {trends?.trends.frequency === 'improving' && <TrendingDown className="h-4 w-4" />}
                        {trends?.trends.frequency === 'worsening' && <TrendingUp className="h-4 w-4" />}
                        {trends?.trends.frequency === 'stable' && <Minus className="h-4 w-4" />}
                        {trends?.trends.frequency || 'N/A'}
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <div className="text-sm font-medium">Severity Trend</div>
                        <div className="text-xs text-muted-foreground">Weighted index</div>
                      </div>
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                        trends?.trends.severity === 'improving' 
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                          : trends?.trends.severity === 'worsening' 
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {trends?.trends.severity === 'improving' && <TrendingDown className="h-4 w-4" />}
                        {trends?.trends.severity === 'worsening' && <TrendingUp className="h-4 w-4" />}
                        {trends?.trends.severity === 'stable' && <Minus className="h-4 w-4" />}
                        {trends?.trends.severity || 'N/A'}
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <div className="text-sm font-medium">Photo Compliance</div>
                        <div className="text-xs text-muted-foreground">Evidence capture</div>
                      </div>
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                        trends?.trends.photoCompliance === 'improving' 
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                          : trends?.trends.photoCompliance === 'worsening' 
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {trends?.trends.photoCompliance === 'improving' && <TrendingUp className="h-4 w-4" />}
                        {trends?.trends.photoCompliance === 'worsening' && <TrendingDown className="h-4 w-4" />}
                        {trends?.trends.photoCompliance === 'stable' && <Minus className="h-4 w-4" />}
                        {trends?.trends.photoCompliance || 'N/A'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Weekly Data Table */}
                  <div className="md:col-span-2">
                    <div className="text-sm font-medium mb-2">Weekly Breakdown</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2 text-muted-foreground font-medium">Week</th>
                            <th className="text-right py-2 px-2 text-muted-foreground font-medium">Claims</th>
                            <th className="text-right py-2 px-2 text-muted-foreground font-medium">Moves</th>
                            <th className="text-right py-2 px-2 text-muted-foreground font-medium">Per 1k</th>
                            <th className="text-right py-2 px-2 text-muted-foreground font-medium">Severity</th>
                            <th className="text-right py-2 px-2 text-muted-foreground font-medium">Photos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trends?.weeks.slice(-8).map((week, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-2 px-2 text-muted-foreground">{week.weekStart}</td>
                              <td className="py-2 px-2 text-right">{week.claimsCount}</td>
                              <td className="py-2 px-2 text-right">{week.movesCount}</td>
                              <td className="py-2 px-2 text-right font-medium">{week.claimsPer1k}</td>
                              <td className="py-2 px-2 text-right">{week.avgSeverity}</td>
                              <td className="py-2 px-2 text-right">{week.photoCompliancePercent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* 3) Evidence & Safety Discipline */}
          <section data-testid="section-evidence">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Evidence & Safety Discipline
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className={`text-3xl font-bold ${
                    (metrics?.pickupCompliancePercent || 0) >= 80 ? 'text-green-600' :
                    (metrics?.pickupCompliancePercent || 0) >= 50 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {metrics?.pickupCompliancePercent || 0}%
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Pickup Photo Compliance</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className={`text-3xl font-bold ${
                    (metrics?.dropoffCompliancePercent || 0) >= 80 ? 'text-green-600' :
                    (metrics?.dropoffCompliancePercent || 0) >= 50 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {metrics?.dropoffCompliancePercent || 0}%
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Dropoff Photo Compliance</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className={`text-3xl font-bold ${
                    (metrics?.claimsWithEvidencePercent || 0) >= 80 ? 'text-green-600' :
                    (metrics?.claimsWithEvidencePercent || 0) >= 50 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {metrics?.claimsWithEvidencePercent || 0}%
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Claims with Full Evidence</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-3xl font-bold text-primary">{metrics?.activeDrivers || 0}</div>
                  <div className="text-sm text-muted-foreground mt-1">Active Drivers</div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* 4) Resolution Performance */}
          <section data-testid="section-resolution">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Resolution Performance
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Average Days to Close</div>
                      <div className={`text-2xl font-bold ${(metrics?.avgDaysToClose || 0) > 45 ? 'text-red-500' : ''}`}>
                        {metrics?.avgDaysToClose || 0} days
                      </div>
                    </div>
                    <CheckCircle className={`h-8 w-8 ${(metrics?.avgDaysToClose || 0) <= 30 ? 'text-green-500' : 'text-muted-foreground'}`} />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Open Claims</div>
                      <div className="text-2xl font-bold">{metrics?.openClaims || 0}</div>
                    </div>
                    <AlertTriangle className={`h-8 w-8 ${(metrics?.openClaims || 0) > 10 ? 'text-amber-500' : 'text-muted-foreground'}`} />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Aging Claims (30+ days)</div>
                      <div className={`text-2xl font-bold ${(metrics?.openClaimsOver30Days || 0) > 5 ? 'text-red-500' : ''}`}>
                        {metrics?.openClaimsOver30Days || 0}
                      </div>
                    </div>
                    <Clock className={`h-8 w-8 ${(metrics?.openClaimsOver30Days || 0) > 5 ? 'text-red-500' : 'text-muted-foreground'}`} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* 5) Risk Mitigation Actions */}
          <section data-testid="section-mitigation">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Target className="h-5 w-5" />
                Risk Mitigation Actions
              </h2>
              <Dialog open={isAddingAction} onOpenChange={setIsAddingAction}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-action">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Action
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Mitigation Action</DialogTitle>
                    <DialogDescription>Document a risk mitigation measure taken</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Title</Label>
                      <Input 
                        value={newAction.title} 
                        onChange={(e) => setNewAction({ ...newAction, title: e.target.value })}
                        placeholder="e.g., Senior drivers assigned to downtown routes"
                        data-testid="input-action-title"
                      />
                    </div>
                    <div>
                      <Label>Action Type</Label>
                      <Select 
                        value={newAction.actionType} 
                        onValueChange={(v) => setNewAction({ ...newAction, actionType: v })}
                      >
                        <SelectTrigger data-testid="select-action-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ROUTING_CHANGE">Routing Change</SelectItem>
                          <SelectItem value="DRIVER_ASSIGNMENT">Driver Assignment</SelectItem>
                          <SelectItem value="TRAINING_REQUIREMENT">Training Requirement</SelectItem>
                          <SelectItem value="ESCORT_REQUIREMENT">Escort Requirement</SelectItem>
                          <SelectItem value="PHOTO_COMPLIANCE">Photo Compliance</SelectItem>
                          <SelectItem value="SCHEDULING_CHANGE">Scheduling Change</SelectItem>
                          <SelectItem value="EQUIPMENT_UPGRADE">Equipment Upgrade</SelectItem>
                          <SelectItem value="POLICY_UPDATE">Policy Update</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Triggering Pattern</Label>
                      <Input 
                        value={newAction.triggerPattern} 
                        onChange={(e) => setNewAction({ ...newAction, triggerPattern: e.target.value })}
                        placeholder="What issue or pattern triggered this action?"
                        data-testid="input-action-trigger"
                      />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea 
                        value={newAction.description} 
                        onChange={(e) => setNewAction({ ...newAction, description: e.target.value })}
                        placeholder="Describe the mitigation action in detail..."
                        data-testid="input-action-description"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddingAction(false)}>Cancel</Button>
                    <Button 
                      onClick={() => createActionMutation.mutate(newAction)}
                      disabled={!newAction.title || !newAction.description || createActionMutation.isPending}
                      data-testid="button-save-action"
                    >
                      {createActionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Save Action
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            
            {mitigationActions.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  No mitigation actions documented yet. Add actions to track your risk reduction efforts.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {mitigationActions.map((action) => (
                  <Card key={action.id} data-testid={`action-${action.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{action.title}</span>
                            <Badge variant={
                              action.status === 'ACTIVE' ? 'default' :
                              action.status === 'COMPLETED' ? 'secondary' :
                              action.status === 'MONITORING' ? 'outline' : 'secondary'
                            }>
                              {action.status}
                            </Badge>
                            <Badge variant="outline">{action.actionType.replace(/_/g, ' ')}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{action.description}</p>
                          {action.triggerPattern && (
                            <p className="text-xs text-muted-foreground mt-1">
                              <span className="font-medium">Trigger:</span> {action.triggerPattern}
                            </p>
                          )}
                          {action.resultSummary && (
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                              <span className="font-medium">Result:</span> {action.resultSummary}
                            </p>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(action.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* 6) AI Carrier Narratives */}
          <section data-testid="section-narratives">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5" />
                AI Carrier Narratives
              </h2>
              <Dialog open={isGeneratingNarrative} onOpenChange={setIsGeneratingNarrative}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-generate-narrative">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Narrative
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generate AI Narrative</DialogTitle>
                    <DialogDescription>
                      Generate a carrier-ready narrative based on current metrics and trends
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="p-4 bg-muted/30 rounded-lg text-sm">
                      <p>The AI will analyze your claims data for the last {periodDays} days and generate a professional narrative suitable for carrier/underwriter review.</p>
                      <p className="mt-2 text-muted-foreground">You can edit the narrative before sharing.</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsGeneratingNarrative(false)}>Cancel</Button>
                    <Button 
                      onClick={() => generateNarrativeMutation.mutate('QUARTERLY_SUMMARY')}
                      disabled={generateNarrativeMutation.isPending}
                      data-testid="button-confirm-generate"
                    >
                      {generateNarrativeMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {narratives.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  No narratives generated yet. Click "Generate Narrative" to create an AI-powered summary.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {narratives.map((narrative) => (
                  <Card key={narrative.id} data-testid={`narrative-${narrative.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{narrative.title}</CardTitle>
                          <Badge variant={
                            narrative.status === 'APPROVED' ? 'default' :
                            narrative.status === 'SHARED' ? 'secondary' : 'outline'
                          }>
                            {narrative.status}
                          </Badge>
                          {narrative.isEdited && <Badge variant="outline">Edited</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setEditingNarrative(narrative)}
                            data-testid={`button-edit-narrative-${narrative.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {narrative.status === 'DRAFT' && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => approveNarrativeMutation.mutate(narrative.id)}
                              data-testid={`button-approve-narrative-${narrative.id}`}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <CardDescription>
                        Generated {new Date(narrative.createdAt).toLocaleDateString()}
                        {narrative.approvedAt && ` • Approved ${new Date(narrative.approvedAt).toLocaleDateString()}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p className="whitespace-pre-wrap text-sm">
                          {narrative.editedContent || narrative.generatedContent}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Edit Narrative Dialog */}
            <Dialog open={!!editingNarrative} onOpenChange={() => setEditingNarrative(null)}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit Narrative</DialogTitle>
                  <DialogDescription>
                    Make changes to the narrative before sharing with carriers
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Textarea 
                    value={editingNarrative?.editedContent || editingNarrative?.generatedContent || ''}
                    onChange={(e) => setEditingNarrative(
                      editingNarrative ? { ...editingNarrative, editedContent: e.target.value } : null
                    )}
                    className="min-h-[300px]"
                    data-testid="textarea-edit-narrative"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingNarrative(null)}>Cancel</Button>
                  <Button 
                    onClick={() => {
                      if (editingNarrative) {
                        updateNarrativeMutation.mutate({
                          id: editingNarrative.id,
                          editedContent: editingNarrative.editedContent || editingNarrative.generatedContent || '',
                        });
                      }
                    }}
                    disabled={updateNarrativeMutation.isPending}
                    data-testid="button-save-narrative"
                  >
                    Save Changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </section>
        </>
      )}
    </div>
  );
}
