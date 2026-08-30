import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BarChart3, Loader2, ArrowUp, ArrowDown,
  AlertTriangle, CheckCircle2, ShieldAlert,
  DollarSign, Users, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ImpactState {
  totalCost: number;
  assignedStaff: number;
  requiredStaff: number;
  coverageGap: number;
}

interface OtImpactDriver {
  userId: string;
  userName: string;
  currentWeeklyHours: number;
  projectedWeeklyHours: number;
  overtimeHours: number;
}

interface ImpactAnalysisResult {
  before: ImpactState;
  after: ImpactState;
  deltas: {
    costDelta: number;
    costDeltaPct: number;
    staffDelta: number;
    gapDelta: number;
  };
  otImpact: OtImpactDriver[];
  riskLevel: 'low' | 'medium' | 'high';
  reasons: string[];
  requiresConfirmation: boolean;
}

type ChangeType = 'time_change' | 'staff_change' | 'assignment_add' | 'assignment_remove';

export default function SchedulingImpactAnalysisTab() {
  const { toast } = useToast();
  const [shiftId, setShiftId] = useState("");
  const [changeType, setChangeType] = useState<ChangeType>("time_change");
  const [proposed, setProposed] = useState({
    startTime: "",
    endTime: "",
    requiredStaff: "",
    userId: "",
  });
  const [analysisResult, setAnalysisResult] = useState<ImpactAnalysisResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { shiftId, changeType, proposed };
      const res = await apiRequest("POST", "/api/corporate/scheduling/impact-analysis", body);
      return res.json();
    },
    onSuccess: (data: ImpactAnalysisResult) => {
      setAnalysisResult(data);
      setConfirmed(false);
    },
    onError: () => {
      toast({ title: "Analysis failed", description: "Could not run impact analysis.", variant: "destructive" });
    },
  });

  const riskConfig = {
    low: { label: "Low Impact", bg: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800", text: "text-green-700 dark:text-green-300", icon: CheckCircle2 },
    medium: { label: "Medium Impact - Review Recommended", bg: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-300", icon: AlertTriangle },
    high: { label: "High Impact - Confirmation Required", bg: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800", text: "text-red-700 dark:text-red-300", icon: ShieldAlert },
  };

  function formatCurrency(v: number) {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function DeltaIndicator({ value, invert }: { value: number; invert?: boolean }) {
    if (value === 0) return null;
    const positive = value > 0;
    const isGood = invert ? !positive : positive;
    return (
      <span className={cn("inline-flex items-center text-xs font-medium ml-1", isGood ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
        {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {Math.abs(value)}
      </span>
    );
  }

  function StateCard({ title, state, deltas, testId }: { title: string; state: ImpactState; deltas?: ImpactAnalysisResult["deltas"]; testId: string }) {
    return (
      <Card data-testid={testId}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-muted-foreground">Total Cost</span>
            <span className="font-medium">
              {formatCurrency(state.totalCost)}
              {deltas && <DeltaIndicator value={deltas.costDelta} invert />}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-muted-foreground">Assigned Staff</span>
            <span className="font-medium">
              {state.assignedStaff}
              {deltas && <DeltaIndicator value={deltas.staffDelta} />}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-muted-foreground">Required Staff</span>
            <span className="font-medium">{state.requiredStaff}</span>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-muted-foreground">Coverage Gap</span>
            <span className="font-medium">
              {state.coverageGap}
              {deltas && <DeltaIndicator value={deltas.gapDelta} invert />}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const result = analysisResult;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          <h3 className="text-lg font-semibold" data-testid="text-impact-title">Schedule Change Impact Analysis</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Simulate schedule changes and analyze their impact before committing
        </p>
      </div>

      <Card data-testid="card-simulation-form">
        <CardHeader>
          <CardTitle className="text-base">Simulation Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="shift-id">Shift ID</Label>
            <Input
              id="shift-id"
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              placeholder="Enter shift ID"
              data-testid="input-shift-id"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Change Type</Label>
            <Select value={changeType} onValueChange={(v) => setChangeType(v as ChangeType)}>
              <SelectTrigger data-testid="select-change-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="time_change">Time Change</SelectItem>
                <SelectItem value="staff_change">Staff Change</SelectItem>
                <SelectItem value="assignment_add">Add Assignment</SelectItem>
                <SelectItem value="assignment_remove">Remove Assignment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {changeType === "time_change" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="proposed-start">Start Time</Label>
                <Input
                  id="proposed-start"
                  type="datetime-local"
                  value={proposed.startTime}
                  onChange={(e) => setProposed({ ...proposed, startTime: e.target.value })}
                  data-testid="input-proposed-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proposed-end">End Time</Label>
                <Input
                  id="proposed-end"
                  type="datetime-local"
                  value={proposed.endTime}
                  onChange={(e) => setProposed({ ...proposed, endTime: e.target.value })}
                  data-testid="input-proposed-end"
                />
              </div>
            </div>
          )}

          {changeType === "staff_change" && (
            <div className="space-y-1.5">
              <Label htmlFor="proposed-staff">Required Staff</Label>
              <Input
                id="proposed-staff"
                type="number"
                min={0}
                value={proposed.requiredStaff}
                onChange={(e) => setProposed({ ...proposed, requiredStaff: e.target.value })}
                placeholder="Enter required staff count"
                data-testid="input-proposed-staff"
              />
            </div>
          )}

          {(changeType === "assignment_add" || changeType === "assignment_remove") && (
            <div className="space-y-1.5">
              <Label htmlFor="proposed-user">User/Driver ID</Label>
              <Input
                id="proposed-user"
                value={proposed.userId}
                onChange={(e) => setProposed({ ...proposed, userId: e.target.value })}
                placeholder="Enter user or driver ID"
                data-testid="input-proposed-user"
              />
            </div>
          )}

          <Button
            onClick={() => analyzeMutation.mutate()}
            disabled={!shiftId || analyzeMutation.isPending}
            data-testid="button-analyze"
          >
            {analyzeMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-1" />}
            Analyze Impact
          </Button>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-6">
          {(() => {
            const risk = riskConfig[result.riskLevel];
            const RiskIcon = risk.icon;
            return (
              <Card className={cn("border", risk.bg)} data-testid="card-risk-banner">
                <CardContent className="p-4 flex items-center gap-3 flex-wrap">
                  <RiskIcon className={cn("h-5 w-5", risk.text)} />
                  <span className={cn("font-semibold", risk.text)} data-testid="text-risk-level">
                    {risk.label}
                  </span>
                </CardContent>
              </Card>
            );
          })()}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StateCard title="Current State" state={result.before} testId="card-before-state" />
            <StateCard title="After Change" state={result.after} deltas={result.deltas} testId="card-after-state" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card data-testid="card-cost-delta">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Cost Delta</span>
                </div>
                <div className="text-xl font-bold">
                  {result.deltas.costDelta >= 0 ? "+" : ""}{formatCurrency(result.deltas.costDelta)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {result.deltas.costDeltaPct >= 0 ? "+" : ""}{result.deltas.costDeltaPct.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-staff-delta">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Staff Delta</span>
                </div>
                <div className="text-xl font-bold">
                  {result.deltas.staffDelta >= 0 ? "+" : ""}{result.deltas.staffDelta}
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-gap-delta">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Coverage Gap Change</span>
                </div>
                <div className="text-xl font-bold">
                  {result.deltas.gapDelta >= 0 ? "+" : ""}{result.deltas.gapDelta}
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-ot-count">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">OT Drivers Affected</span>
                </div>
                <div className="text-xl font-bold">{result.otImpact.length}</div>
              </CardContent>
            </Card>
          </div>

          {result.otImpact.length > 0 && (
            <Card data-testid="impact-ot-details">
              <CardHeader>
                <CardTitle className="text-base">Overtime Impact Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
                    <span>Driver</span>
                    <span>Current Weekly</span>
                    <span>Projected Weekly</span>
                    <span>OT Hours</span>
                  </div>
                  {result.otImpact.map((driver) => (
                    <div
                      key={driver.userId}
                      className={cn(
                        "grid grid-cols-4 gap-2 text-sm py-1.5",
                        driver.projectedWeeklyHours > 40 && "bg-red-50 dark:bg-red-950 rounded px-1"
                      )}
                    >
                      <span className="font-medium">{driver.userName}</span>
                      <span>{driver.currentWeeklyHours}h</span>
                      <span>
                        {driver.projectedWeeklyHours}h
                        {driver.projectedWeeklyHours > 40 && (
                          <Badge variant="destructive" className="ml-1 text-xs">Over 40h</Badge>
                        )}
                      </span>
                      <span className={cn(driver.overtimeHours > 0 && "text-red-600 dark:text-red-400 font-medium")}>
                        {driver.overtimeHours}h
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {result.reasons.length > 0 && (
            <Card data-testid="impact-reasons-list">
              <CardHeader>
                <CardTitle className="text-base">Impact Reasons</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {result.reasons.map((reason, i) => (
                    <li key={i} className="text-muted-foreground">{reason}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.requiresConfirmation && (
            <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950" data-testid="card-confirmation">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <span className="font-semibold text-red-700 dark:text-red-300">High-Impact Change Confirmation</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="acknowledge"
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                    data-testid="checkbox-acknowledge"
                  />
                  <Label htmlFor="acknowledge" className="text-sm">
                    I acknowledge this is a high-impact change
                  </Label>
                </div>
                <Button
                  disabled={!confirmed}
                  onClick={() => {
                    toast({ title: "Change acknowledged" });
                    setAnalysisResult(null);
                    setConfirmed(false);
                  }}
                  data-testid="button-proceed"
                >
                  Proceed
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
