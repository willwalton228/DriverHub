import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Copy, Play, Trash2, Loader2, Info, Clock, DollarSign,
  Users, TrendingDown, TrendingUp, ArrowRight, Minus, Eye,
  FlaskConical, ArrowDown, ArrowUp, UserPlus, UserMinus, RefreshCw, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface SandboxScenario {
  id: string;
  name: string;
  description: string | null;
  sourceScheduleId: string;
  baselineSnapshot: BaselineSnapshot;
  scenarioInputs: ScenarioInput[];
  simulationResults: SimulationResults | null;
  status: string;
  createdAt: string;
}

interface BaselineSnapshot {
  schedule: { id: string; name: string; startDate: string; endDate: string; status: string };
  shifts: SnapshotShift[];
  assignments: SnapshotAssignment[];
}

interface SnapshotShift {
  id: string;
  name: string | null;
  locationId: string | null;
  role: string | null;
  workType: string;
  startTime: string;
  endTime: string;
  requiredHeadcount: number;
}

interface SnapshotAssignment {
  id: string;
  shiftId: string;
  driverId: string | null;
  employeeId: string | null;
  workerType: string;
  status: string;
  driverName?: string;
}

interface ScenarioInput {
  type: "reassign_driver" | "remove_assignment" | "add_assignment" | "activate_backup";
  shiftId: string;
  assignmentId?: string;
  newDriverId?: string;
  newDriverName?: string;
  notes?: string;
}

interface SimulationMetrics {
  totalScheduledHours: number;
  regularHours: number;
  overtimeHours: number;
  estimatedLaborCost: number;
  estimatedOtCost: number;
  coverageGaps: number;
  filledSlots: number;
  totalSlots: number;
  coveragePercent: number;
}

interface SimulationDelta {
  overtimeHoursDelta: number;
  laborCostDelta: number;
  coverageGapsDelta: number;
  coveragePercentDelta: number;
}

interface ShiftComparisonDetail {
  shiftId: string;
  shiftName: string;
  baselineAssignments: number;
  scenarioAssignments: number;
  required: number;
  baselineGap: number;
  scenarioGap: number;
}

interface SimulationResults {
  baseline: SimulationMetrics;
  scenario: SimulationMetrics;
  delta: SimulationDelta;
  shiftDetails: ShiftComparisonDetail[];
}

function DeltaIndicator({ value, unit, inverse }: { value: number; unit: string; inverse?: boolean }) {
  const isPositive = value > 0;
  const isNeg = value < 0;
  const isGood = inverse ? isPositive : isNeg;
  const isBad = inverse ? isNeg : isPositive;

  if (value === 0) return <span className="text-xs text-muted-foreground">No change</span>;

  return (
    <span className={cn("text-xs font-medium flex items-center gap-0.5 text-muted-foreground", isGood && "text-foreground", isBad && "text-destructive")}>
      {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {isPositive ? "+" : ""}{typeof value === 'number' && unit === "$" ? `$${Math.abs(value).toLocaleString()}` : `${value}${unit}`}
    </span>
  );
}

export function OptimizationSandboxTab() {
  const { toast } = useToast();
  const [cloneOpen, setCloneOpen] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [addInputOpen, setAddInputOpen] = useState(false);
  const [cloneForm, setCloneForm] = useState({ scheduleId: "", name: "", description: "" });

  const [inputForm, setInputForm] = useState<ScenarioInput>({
    type: "reassign_driver",
    shiftId: "",
    assignmentId: "",
    newDriverId: "",
    newDriverName: "",
    notes: "",
  });

  const { data: scenarios = [], isLoading } = useQuery<SandboxScenario[]>({
    queryKey: ["/api/corporate/scheduling/sandbox"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/corporate/scheduling/sandbox");
      return res.json();
    },
  });

  const { data: schedules = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/scheduling/schedules"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/corporate/scheduling/schedules");
      return res.json();
    },
  });

  const { data: selectedScenario, isLoading: scenarioLoading } = useQuery<SandboxScenario>({
    queryKey: ["/api/corporate/scheduling/sandbox", selectedScenarioId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/corporate/scheduling/sandbox/${selectedScenarioId}`);
      return res.json();
    },
    enabled: !!selectedScenarioId,
  });

  const cloneMutation = useMutation({
    mutationFn: async (data: { scheduleId: string; name: string; description: string }) => {
      const res = await apiRequest("POST", "/api/corporate/scheduling/sandbox/clone", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/sandbox"] });
      setCloneOpen(false);
      setCloneForm({ scheduleId: "", name: "", description: "" });
      setSelectedScenarioId(data.id);
      toast({ title: "Scenario created", description: "Schedule cloned to sandbox." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateInputsMutation = useMutation({
    mutationFn: async ({ id, inputs }: { id: string; inputs: ScenarioInput[] }) => {
      const res = await apiRequest("PATCH", `/api/corporate/scheduling/sandbox/${id}/inputs`, { inputs });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/sandbox", selectedScenarioId] });
    },
  });

  const simulateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/corporate/scheduling/sandbox/${id}/simulate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/sandbox", selectedScenarioId] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/sandbox"] });
      toast({ title: "Simulation complete", description: "Results are ready." });
    },
    onError: (err: any) => {
      toast({ title: "Simulation failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/corporate/scheduling/sandbox/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/sandbox"] });
      if (selectedScenarioId) setSelectedScenarioId(null);
      toast({ title: "Scenario deleted" });
    },
  });

  function addScenarioInput() {
    if (!selectedScenario || !inputForm.shiftId) return;
    const currentInputs = (selectedScenario.scenarioInputs || []) as ScenarioInput[];
    const newInputs = [...currentInputs, { ...inputForm }];
    updateInputsMutation.mutate({ id: selectedScenario.id, inputs: newInputs });
    setAddInputOpen(false);
    setInputForm({ type: "reassign_driver", shiftId: "", assignmentId: "", newDriverId: "", newDriverName: "", notes: "" });
  }

  function removeScenarioInput(idx: number) {
    if (!selectedScenario) return;
    const currentInputs = (selectedScenario.scenarioInputs || []) as ScenarioInput[];
    const newInputs = currentInputs.filter((_, i) => i !== idx);
    updateInputsMutation.mutate({ id: selectedScenario.id, inputs: newInputs });
  }

  const snapshot = selectedScenario?.baselineSnapshot as BaselineSnapshot | undefined;
  const results = selectedScenario?.simulationResults as SimulationResults | null | undefined;

  const inputTypeLabels: Record<ScenarioInput["type"], { label: string; icon: typeof UserPlus }> = {
    reassign_driver: { label: "Reassign Driver", icon: RefreshCw },
    remove_assignment: { label: "Remove Assignment", icon: UserMinus },
    add_assignment: { label: "Add Assignment", icon: UserPlus },
    activate_backup: { label: "Activate Backup", icon: Shield },
  };

  return (
    <div className="space-y-6" data-testid="sandbox-tab">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FlaskConical className="h-5 w-5" />
                Optimization Sandbox
              </CardTitle>
              <CardDescription>
                Clone schedules, test what-if scenarios, and compare outcomes. Sandbox changes never affect live data.
              </CardDescription>
            </div>
            <Button onClick={() => setCloneOpen(true)} data-testid="button-create-scenario">
              <Plus className="h-4 w-4 mr-1" />
              New Scenario
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            <span>All sandbox scenarios are isolated. No changes here will affect live schedules or driver assignments.</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : scenarios.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-scenarios">
              No sandbox scenarios yet. Clone a schedule to start testing what-if scenarios.
            </div>
          ) : (
            <div className="space-y-2">
              {scenarios.map((s) => (
                <Card
                  key={s.id}
                  className={cn("cursor-pointer hover-elevate", selectedScenarioId === s.id && "ring-2 ring-primary")}
                  onClick={() => setSelectedScenarioId(s.id)}
                  data-testid={`card-scenario-${s.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{s.name}</span>
                          <Badge variant={s.status === "simulated" ? "default" : "secondary"}>
                            {s.status === "simulated" ? "Results Ready" : "Draft"}
                          </Badge>
                        </div>
                        {s.description && <div className="text-sm text-muted-foreground mt-1">{s.description}</div>}
                        <div className="text-xs text-muted-foreground mt-1">
                          Source: {(s.baselineSnapshot as BaselineSnapshot)?.schedule?.name || s.sourceScheduleId} |
                          Created: {format(new Date(s.createdAt), "MMM d, yyyy")}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(s.id); }} data-testid={`button-delete-scenario-${s.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedScenario && snapshot && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="text-lg">Scenario: {selectedScenario.name}</CardTitle>
                  <CardDescription>
                    Baseline: {snapshot.schedule.name} ({snapshot.shifts.length} shifts, {snapshot.assignments.length} assignments)
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setAddInputOpen(true)} data-testid="button-add-input">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Change
                  </Button>
                  <Button
                    onClick={() => simulateMutation.mutate(selectedScenario.id)}
                    disabled={simulateMutation.isPending}
                    data-testid="button-run-simulation"
                  >
                    {simulateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                    Run Simulation
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Label className="text-sm font-medium">Scenario Changes ({((selectedScenario.scenarioInputs || []) as ScenarioInput[]).length})</Label>
                {((selectedScenario.scenarioInputs || []) as ScenarioInput[]).length === 0 ? (
                  <div className="text-sm text-muted-foreground mt-2">
                    No changes configured yet. Add assignment changes to create your what-if scenario.
                  </div>
                ) : (
                  <div className="space-y-2 mt-2">
                    {((selectedScenario.scenarioInputs || []) as ScenarioInput[]).map((input, idx) => {
                      const config = inputTypeLabels[input.type];
                      const Icon = config.icon;
                      const shift = snapshot.shifts.find(s => s.id === input.shiftId);
                      return (
                        <div key={idx} className="flex items-center gap-3 p-2 rounded-md bg-muted/50" data-testid={`input-change-${idx}`}>
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{config.label}</span>
                            <span className="text-sm text-muted-foreground ml-2">
                              on {shift?.name || input.shiftId}
                              {input.newDriverName && ` → ${input.newDriverName}`}
                            </span>
                            {input.notes && <span className="text-xs text-muted-foreground ml-2">({input.notes})</span>}
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => removeScenarioInput(idx)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {results && (
            <Card data-testid="card-simulation-results">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Simulation Results
                </CardTitle>
                <CardDescription>Comparison of baseline vs. scenario outcomes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Clock className="h-4 w-4" />
                        OT Hours
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold" data-testid="text-scenario-ot-hours">{results.scenario.overtimeHours}h</span>
                        <DeltaIndicator value={results.delta.overtimeHoursDelta} unit="h" />
                      </div>
                      <div className="text-xs text-muted-foreground">Baseline: {results.baseline.overtimeHours}h</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <DollarSign className="h-4 w-4" />
                        Labor Cost
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold" data-testid="text-scenario-labor-cost">${results.scenario.estimatedLaborCost.toLocaleString()}</span>
                        <DeltaIndicator value={results.delta.laborCostDelta} unit="$" />
                      </div>
                      <div className="text-xs text-muted-foreground">Baseline: ${results.baseline.estimatedLaborCost.toLocaleString()}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Users className="h-4 w-4" />
                        Coverage Gaps
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold" data-testid="text-scenario-coverage-gaps">{results.scenario.coverageGaps}</span>
                        <DeltaIndicator value={results.delta.coverageGapsDelta} unit="" />
                      </div>
                      <div className="text-xs text-muted-foreground">Baseline: {results.baseline.coverageGaps} gaps</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Users className="h-4 w-4" />
                        Coverage %
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold" data-testid="text-scenario-coverage-pct">{results.scenario.coveragePercent}%</span>
                        <DeltaIndicator value={results.delta.coveragePercentDelta} unit="%" inverse />
                      </div>
                      <div className="text-xs text-muted-foreground">Baseline: {results.baseline.coveragePercent}%</div>
                    </CardContent>
                  </Card>
                </div>

                <Separator className="my-4" />

                <div>
                  <Label className="text-sm font-medium mb-3 block">Shift-Level Comparison</Label>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium">Shift</th>
                          <th className="text-center p-2 font-medium">Required</th>
                          <th className="text-center p-2 font-medium">Baseline</th>
                          <th className="text-center p-2 font-medium">Scenario</th>
                          <th className="text-center p-2 font-medium">Gap Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.shiftDetails.map((sd) => (
                          <tr key={sd.shiftId} className="border-b last:border-0" data-testid={`row-shift-comparison-${sd.shiftId}`}>
                            <td className="p-2">{sd.shiftName}</td>
                            <td className="p-2 text-center">{sd.required}</td>
                            <td className="p-2 text-center">
                              {sd.baselineAssignments}
                              {sd.baselineGap > 0 && <span className="text-xs text-muted-foreground ml-1">(-{sd.baselineGap})</span>}
                            </td>
                            <td className="p-2 text-center">
                              {sd.scenarioAssignments}
                              {sd.scenarioGap > 0 && <span className="text-xs text-muted-foreground ml-1">(-{sd.scenarioGap})</span>}
                            </td>
                            <td className="p-2 text-center">
                              {sd.scenarioGap === sd.baselineGap ? (
                                <span className="text-muted-foreground">-</span>
                              ) : (
                                <DeltaIndicator value={sd.scenarioGap - sd.baselineGap} unit="" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>These results are for planning purposes only. No live data has been modified.</span>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create What-If Scenario</DialogTitle>
            <DialogDescription>Clone an existing schedule into the sandbox for experimentation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Source Schedule</Label>
              <Select value={cloneForm.scheduleId} onValueChange={(v) => setCloneForm(p => ({ ...p, scheduleId: v }))}>
                <SelectTrigger data-testid="select-source-schedule">
                  <SelectValue placeholder="Select schedule to clone" />
                </SelectTrigger>
                <SelectContent>
                  {schedules.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Scenario Name</Label>
              <Input
                value={cloneForm.name}
                onChange={(e) => setCloneForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. OT Reduction Test"
                data-testid="input-scenario-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={cloneForm.description}
                onChange={(e) => setCloneForm(p => ({ ...p, description: e.target.value }))}
                placeholder="What are you testing?"
                data-testid="input-scenario-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneOpen(false)}>Cancel</Button>
            <Button
              onClick={() => cloneMutation.mutate(cloneForm)}
              disabled={!cloneForm.scheduleId || !cloneForm.name || cloneMutation.isPending}
              data-testid="button-clone-schedule"
            >
              {cloneMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <Copy className="h-4 w-4 mr-1" />
              Clone & Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addInputOpen} onOpenChange={setAddInputOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Scenario Change</DialogTitle>
            <DialogDescription>Define a what-if change to apply in this sandbox scenario.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Change Type</Label>
              <Select value={inputForm.type} onValueChange={(v: any) => setInputForm(p => ({ ...p, type: v }))}>
                <SelectTrigger data-testid="select-input-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reassign_driver">Reassign Driver</SelectItem>
                  <SelectItem value="remove_assignment">Remove Assignment</SelectItem>
                  <SelectItem value="add_assignment">Add Assignment</SelectItem>
                  <SelectItem value="activate_backup">Activate Backup Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Shift</Label>
              <Select value={inputForm.shiftId} onValueChange={(v) => setInputForm(p => ({ ...p, shiftId: v }))}>
                <SelectTrigger data-testid="select-input-shift">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {snapshot?.shifts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name || s.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(inputForm.type === "reassign_driver" || inputForm.type === "remove_assignment") && (
              <div>
                <Label>Existing Assignment</Label>
                <Select value={inputForm.assignmentId} onValueChange={(v) => setInputForm(p => ({ ...p, assignmentId: v }))}>
                  <SelectTrigger data-testid="select-input-assignment">
                    <SelectValue placeholder="Select assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot?.assignments.filter(a => a.shiftId === inputForm.shiftId).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.driverName || a.driverId || a.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(inputForm.type === "reassign_driver" || inputForm.type === "add_assignment" || inputForm.type === "activate_backup") && (
              <div>
                <Label>Driver Name</Label>
                <Input
                  value={inputForm.newDriverName}
                  onChange={(e) => setInputForm(p => ({ ...p, newDriverName: e.target.value }))}
                  placeholder="Driver name for scenario"
                  data-testid="input-driver-name"
                />
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Input
                value={inputForm.notes}
                onChange={(e) => setInputForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes"
                data-testid="input-change-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddInputOpen(false)}>Cancel</Button>
            <Button
              onClick={addScenarioInput}
              disabled={!inputForm.shiftId}
              data-testid="button-add-change"
            >
              Add Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
