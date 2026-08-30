import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Loader2, Tag, AlertCircle, GripVertical } from "lucide-react";

interface ReasonCode {
  id: string;
  code: string;
  label: string;
  description: string | null;
  stage: string;
  isRequired: boolean;
  isActive: boolean;
  displayOrder: number;
  market: string | null;
  createdAt: string;
}

interface ReasonCodesAdminProps {
  isAdmin: boolean;
}

const STAGES = [
  { value: "rejected", label: "Rejected" },
  { value: "hold", label: "On Hold" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "screening", label: "Screening" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
];

export function ReasonCodesAdmin({ isAdmin }: ReasonCodesAdminProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<ReasonCode | null>(null);
  const [filterStage, setFilterStage] = useState<string>("all");
  
  const [formData, setFormData] = useState({
    code: "",
    label: "",
    description: "",
    stage: "rejected",
    isRequired: false,
    isActive: true,
    displayOrder: 0,
    market: "",
  });

  const { data: reasonCodes, isLoading } = useQuery<ReasonCode[]>({
    queryKey: ['/api/recruiting/reason-codes'],
    queryFn: async () => {
      const response = await fetch('/api/recruiting/reason-codes');
      if (!response.ok) throw new Error('Failed to fetch reason codes');
      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/recruiting/reason-codes", {
        ...data,
        market: data.market || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/reason-codes'] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Reason code created",
        description: "The reason code has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create reason code",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return apiRequest("PATCH", `/api/recruiting/reason-codes/${id}`, {
        ...data,
        market: data.market || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/reason-codes'] });
      setIsDialogOpen(false);
      setEditingCode(null);
      resetForm();
      toast({
        title: "Reason code updated",
        description: "The reason code has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update reason code",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/recruiting/reason-codes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/reason-codes'] });
      toast({
        title: "Reason code deleted",
        description: "The reason code has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete reason code",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      code: "",
      label: "",
      description: "",
      stage: "rejected",
      isRequired: false,
      isActive: true,
      displayOrder: 0,
      market: "",
    });
  };

  const handleEdit = (code: ReasonCode) => {
    setEditingCode(code);
    setFormData({
      code: code.code,
      label: code.label,
      description: code.description || "",
      stage: code.stage,
      isRequired: code.isRequired,
      isActive: code.isActive,
      displayOrder: code.displayOrder,
      market: code.market || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingCode) {
      updateMutation.mutate({ id: editingCode.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleOpenDialog = () => {
    setEditingCode(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const filteredCodes = reasonCodes?.filter(code => 
    filterStage === "all" || code.stage === filterStage
  ) || [];

  const groupedByStage = filteredCodes.reduce((acc, code) => {
    if (!acc[code.stage]) acc[code.stage] = [];
    acc[code.stage].push(code);
    return acc;
  }, {} as Record<string, ReasonCode[]>);

  const getStageLabel = (stage: string) => {
    return STAGES.find(s => s.value === stage)?.label || stage;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Reason Codes
            </CardTitle>
            <CardDescription>
              Configure reason codes for stage transitions. Required codes must be selected during status changes.
            </CardDescription>
          </div>
          {isAdmin && (
            <Button onClick={handleOpenDialog} data-testid="button-add-reason-code">
              <Plus className="h-4 w-4 mr-1" />
              Add Code
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Label>Filter by Stage:</Label>
          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="w-[180px]" data-testid="select-filter-stage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {STAGES.map((stage) => (
                <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {Object.keys(groupedByStage).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No reason codes configured yet.</p>
            {isAdmin && (
              <p className="text-sm mt-2">Click "Add Code" to create your first reason code.</p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedByStage).map(([stage, codes]) => (
              <div key={stage} className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  {getStageLabel(stage)}
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Market</TableHead>
                      <TableHead className="text-center">Required</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      {isAdmin && <TableHead className="w-[100px]">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {codes.sort((a, b) => a.displayOrder - b.displayOrder).map((code) => (
                      <TableRow key={code.id} data-testid={`row-reason-code-${code.code}`}>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {code.code}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{code.label}</span>
                            {code.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {code.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {code.market ? (
                            <Badge variant="secondary">{code.market}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">All</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {code.isRequired ? (
                            <Badge variant="default" className="bg-amber-500">Required</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">Optional</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={code.isActive ? "default" : "secondary"}>
                            {code.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(code)}
                                data-testid={`button-edit-${code.code}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    data-testid={`button-delete-${code.code}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Reason Code</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{code.label}"? 
                                      Existing stage reasons using this code will retain the historical value.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMutation.mutate(code.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCode ? "Edit Reason Code" : "Create Reason Code"}</DialogTitle>
            <DialogDescription>
              {editingCode 
                ? "Update the reason code details."
                : "Add a new reason code for stage transitions."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="code" required>Code</Label>
              <Input
                id="code"
                placeholder="e.g., NOT_QUALIFIED"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                data-testid="input-reason-code"
              />
              <p className="text-xs text-muted-foreground">Uppercase letters, numbers, and underscores only</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="label" required>Label</Label>
              <Input
                id="label"
                placeholder="e.g., Not Qualified"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                data-testid="input-reason-label"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                data-testid="input-reason-description"
              />
            </div>

            <div className="grid gap-2">
              <Label required>Stage</Label>
              <Select
                value={formData.stage}
                onValueChange={(value) => setFormData({ ...formData, stage: value })}
              >
                <SelectTrigger data-testid="select-reason-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((stage) => (
                    <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="market">Market (optional)</Label>
              <Input
                id="market"
                placeholder="Leave empty for all markets"
                value={formData.market}
                onChange={(e) => setFormData({ ...formData, market: e.target.value })}
                data-testid="input-reason-market"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="displayOrder">Display Order</Label>
              <Input
                id="displayOrder"
                type="number"
                value={formData.displayOrder}
                onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                data-testid="input-display-order"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Required</Label>
                <p className="text-xs text-muted-foreground">
                  Force selection when changing to this stage
                </p>
              </div>
              <Switch
                checked={formData.isRequired}
                onCheckedChange={(checked) => setFormData({ ...formData, isRequired: checked })}
                data-testid="switch-is-required"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Show this reason code in the picker
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                data-testid="switch-is-active"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.code || !formData.label || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-reason-code"
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                editingCode ? "Update" : "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
