import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle } from "lucide-react";
import type { MarketDemandSignal } from "@shared/schema";

interface DemandGapAnalysis {
  signalId: string;
  market: string;
  workerType: string | null;
  workType: string | null;
  expectedHeadcount: number;
  effectiveFrom: string;
  effectiveTo: string;
  priority: string;
  notes: string | null;
  pipeline: {
    ready: number;
    inProgress: number;
    total: number;
  };
  gap: number;
  gapPercentage: number;
  status: 'met' | 'close' | 'gap';
}

interface DemandGapResponse {
  checkDate: string;
  signals: DemandGapAnalysis[];
  summary: {
    totalDemand: number;
    totalReady: number;
    totalInProgress: number;
    marketsWithGap: number;
    marketsNearTarget: number;
    marketsMet: number;
  };
}

interface DemandSignalFormData {
  market: string;
  workerType: string;
  workType: string;
  expectedHeadcount: string;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
  priority: string;
}

const defaultFormData: DemandSignalFormData = {
  market: "",
  workerType: "",
  workType: "",
  expectedHeadcount: "",
  effectiveFrom: "",
  effectiveTo: "",
  notes: "",
  priority: "normal",
};

export function DemandSignals({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSignal, setEditingSignal] = useState<MarketDemandSignal | null>(null);
  const [formData, setFormData] = useState<DemandSignalFormData>(defaultFormData);

  const { data: signals = [], isLoading: signalsLoading } = useQuery<MarketDemandSignal[]>({
    queryKey: ["/api/recruiting/demand-signals"],
  });

  const { data: gapAnalysis, isLoading: gapLoading } = useQuery<DemandGapResponse>({
    queryKey: ["/api/recruiting/demand-gap"],
  });

  const createMutation = useMutation({
    mutationFn: (data: DemandSignalFormData) =>
      apiRequest("POST", "/api/recruiting/demand-signals", {
        ...data,
        workerType: data.workerType || null,
        workType: data.workType || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/demand-signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/demand-gap"] });
      toast({ title: "Demand signal created successfully" });
      setDialogOpen(false);
      setFormData(defaultFormData);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create demand signal", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DemandSignalFormData> }) =>
      apiRequest("PATCH", `/api/recruiting/demand-signals/${id}`, {
        ...data,
        workerType: data.workerType || null,
        workType: data.workType || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/demand-signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/demand-gap"] });
      toast({ title: "Demand signal updated successfully" });
      setDialogOpen(false);
      setEditingSignal(null);
      setFormData(defaultFormData);
    },
    onError: (error: any) => {
      toast({ title: "Failed to update demand signal", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/recruiting/demand-signals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/demand-signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/demand-gap"] });
      toast({ title: "Demand signal deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete demand signal", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (signal: MarketDemandSignal) => {
    setEditingSignal(signal);
    setFormData({
      market: signal.market,
      workerType: signal.workerType || "",
      workType: signal.workType || "",
      expectedHeadcount: String(signal.expectedHeadcount),
      effectiveFrom: signal.effectiveFrom,
      effectiveTo: signal.effectiveTo,
      notes: signal.notes || "",
      priority: signal.priority || "normal",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSignal) {
      updateMutation.mutate({ id: editingSignal.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingSignal(null);
    setFormData(defaultFormData);
  };

  const getStatusIcon = (status: 'met' | 'close' | 'gap') => {
    switch (status) {
      case 'met':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'close':
        return <Minus className="h-4 w-4 text-yellow-500" />;
      case 'gap':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: 'met' | 'close' | 'gap') => {
    switch (status) {
      case 'met':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Target Met</Badge>;
      case 'close':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Near Target</Badge>;
      case 'gap':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Gap</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge variant="destructive">Urgent</Badge>;
      case 'high':
        return <Badge className="bg-orange-500">High</Badge>;
      case 'low':
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="outline">Normal</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {gapAnalysis && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Demand</p>
                  <p className="text-2xl font-bold">{gapAnalysis.summary.totalDemand}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ready Pipeline</p>
                  <p className="text-2xl font-bold text-green-600">{gapAnalysis.summary.totalReady}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                  <p className="text-2xl font-bold text-blue-600">{gapAnalysis.summary.totalInProgress}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Markets with Gap</p>
                  <p className="text-2xl font-bold text-red-600">{gapAnalysis.summary.marketsWithGap}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gap Analysis Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Demand vs Pipeline Gap</CardTitle>
          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-demand-signal" onClick={() => { setEditingSignal(null); setFormData(defaultFormData); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Demand Signal
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md" data-testid="dialog-demand-signal">
                <DialogHeader>
                  <DialogTitle>{editingSignal ? "Edit Demand Signal" : "Add Demand Signal"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="market" required>Market</Label>
                    <Input
                      id="market"
                      data-testid="input-demand-market"
                      value={formData.market}
                      onChange={(e) => setFormData({ ...formData, market: e.target.value })}
                      placeholder="e.g., Phoenix, Dallas"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="workerType">Worker Type</Label>
                      <Select
                        value={formData.workerType}
                        onValueChange={(v) => setFormData({ ...formData, workerType: v })}
                      >
                        <SelectTrigger data-testid="select-demand-worker-type">
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          <SelectItem value="W2_DRIVER">W2 Driver</SelectItem>
                          <SelectItem value="IC_DRIVER">IC Driver</SelectItem>
                          <SelectItem value="CORP_EMPLOYEE">Corp Employee</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workType">Work Type</Label>
                      <Select
                        value={formData.workType}
                        onValueChange={(v) => setFormData({ ...formData, workType: v })}
                      >
                        <SelectTrigger data-testid="select-demand-work-type">
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          <SelectItem value="SHIFT">Shift</SelectItem>
                          <SelectItem value="ON_DEMAND">On-Demand</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expectedHeadcount" required>Expected Headcount</Label>
                    <Input
                      id="expectedHeadcount"
                      data-testid="input-demand-headcount"
                      type="number"
                      min="1"
                      value={formData.expectedHeadcount}
                      onChange={(e) => setFormData({ ...formData, expectedHeadcount: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="effectiveFrom" required>Effective From</Label>
                      <Input
                        id="effectiveFrom"
                        data-testid="input-demand-from"
                        type="date"
                        value={formData.effectiveFrom}
                        onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="effectiveTo" required>Effective To</Label>
                      <Input
                        id="effectiveTo"
                        data-testid="input-demand-to"
                        type="date"
                        value={formData.effectiveTo}
                        onChange={(e) => setFormData({ ...formData, effectiveTo: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(v) => setFormData({ ...formData, priority: v })}
                    >
                      <SelectTrigger data-testid="select-demand-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      data-testid="input-demand-notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Additional context for this demand forecast..."
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={handleCloseDialog} data-testid="button-cancel-demand">
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createMutation.isPending || updateMutation.isPending}
                      data-testid="button-save-demand"
                    >
                      {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {gapLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading gap analysis...</div>
          ) : !gapAnalysis?.signals.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No active demand signals for the current date.
              {isAdmin && " Click 'Add Demand Signal' to create one."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium">Market</th>
                    <th className="text-left py-3 px-2 font-medium">Type</th>
                    <th className="text-center py-3 px-2 font-medium">Demand</th>
                    <th className="text-center py-3 px-2 font-medium">Ready</th>
                    <th className="text-center py-3 px-2 font-medium">In Progress</th>
                    <th className="text-center py-3 px-2 font-medium">Gap</th>
                    <th className="text-left py-3 px-2 font-medium">Status</th>
                    <th className="text-left py-3 px-2 font-medium">Priority</th>
                    <th className="text-left py-3 px-2 font-medium">Date Range</th>
                    {isAdmin && <th className="text-right py-3 px-2 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {gapAnalysis.signals.map((signal) => (
                    <tr key={signal.signalId} className="border-b hover-elevate" data-testid={`row-demand-${signal.signalId}`}>
                      <td className="py-3 px-2 font-medium">{signal.market}</td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">
                        {signal.workerType || "Any"} / {signal.workType || "Any"}
                      </td>
                      <td className="py-3 px-2 text-center font-medium">{signal.expectedHeadcount}</td>
                      <td className="py-3 px-2 text-center text-green-600 font-medium">{signal.pipeline.ready}</td>
                      <td className="py-3 px-2 text-center text-blue-600">{signal.pipeline.inProgress}</td>
                      <td className="py-3 px-2 text-center">
                        <span className={`font-medium ${signal.gap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {signal.gap > 0 ? `+${signal.gap}` : signal.gap}
                        </span>
                      </td>
                      <td className="py-3 px-2">{getStatusBadge(signal.status)}</td>
                      <td className="py-3 px-2">{getPriorityBadge(signal.priority)}</td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">
                        {new Date(signal.effectiveFrom).toLocaleDateString()} - {new Date(signal.effectiveTo).toLocaleDateString()}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => {
                                const fullSignal = signals.find(s => s.id === signal.signalId);
                                if (fullSignal) handleEdit(fullSignal);
                              }}
                              data-testid={`button-edit-demand-${signal.signalId}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => deleteMutation.mutate(signal.signalId)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-demand-${signal.signalId}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Demand Signals (Admin view) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>All Demand Signals</CardTitle>
          </CardHeader>
          <CardContent>
            {signalsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading signals...</div>
            ) : !signals.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No demand signals created yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium">Market</th>
                      <th className="text-left py-3 px-2 font-medium">Worker/Work Type</th>
                      <th className="text-center py-3 px-2 font-medium">Headcount</th>
                      <th className="text-left py-3 px-2 font-medium">Date Range</th>
                      <th className="text-left py-3 px-2 font-medium">Priority</th>
                      <th className="text-left py-3 px-2 font-medium">Status</th>
                      <th className="text-left py-3 px-2 font-medium">Notes</th>
                      <th className="text-right py-3 px-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((signal) => (
                      <tr key={signal.id} className="border-b hover-elevate" data-testid={`row-signal-${signal.id}`}>
                        <td className="py-3 px-2 font-medium">{signal.market}</td>
                        <td className="py-3 px-2 text-sm text-muted-foreground">
                          {signal.workerType || "Any"} / {signal.workType || "Any"}
                        </td>
                        <td className="py-3 px-2 text-center font-medium">{signal.expectedHeadcount}</td>
                        <td className="py-3 px-2 text-sm">
                          {new Date(signal.effectiveFrom).toLocaleDateString()} - {new Date(signal.effectiveTo).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-2">{getPriorityBadge(signal.priority || 'normal')}</td>
                        <td className="py-3 px-2">
                          <Badge variant={signal.isActive ? "default" : "secondary"}>
                            {signal.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-sm text-muted-foreground max-w-xs truncate">
                          {signal.notes || "-"}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => handleEdit(signal)}
                              data-testid={`button-edit-signal-${signal.id}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              onClick={() => deleteMutation.mutate(signal.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-signal-${signal.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
