import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Shield, Plus, AlertTriangle, CheckCircle, XCircle, 
  ChevronDown, ChevronRight, RefreshCw, Eye, Link2, Unlink,
  Database, ArrowRight, ArrowLeft, FileCheck
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface RISPControl {
  id: string;
  controlId: string;
  name: string;
  controlType: string;
  riskCategory: string;
  description: string;
  executionPoint: string | null;
  upstreamDataSources: string[];
  downstreamOutputs: string[];
  evidenceProduced: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RISPControlLink {
  id: string;
  controlId: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  relationshipNotes: string | null;
  createdAt: string;
}

const CONTROL_TYPES = ["preventive", "detective", "evidentiary"];
const RISK_CATEGORIES = ["frequency", "severity", "compliance", "operational"];
const ENTITY_TYPES = ["driver", "customer", "move", "claim", "policy", "workflow", "report"];

export default function RISPControlsRegistry() {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedControl, setSelectedControl] = useState<RISPControl | null>(null);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    controlId: "",
    name: "",
    controlType: "detective",
    riskCategory: "frequency",
    description: "",
    executionPoint: "",
    upstreamDataSources: "",
    downstreamOutputs: "",
    evidenceProduced: "",
  });

  const [linkFormData, setLinkFormData] = useState({
    entityType: "driver",
    entityId: "",
    entityName: "",
    relationshipNotes: "",
  });

  const { data: controlsData, isLoading, refetch } = useQuery<{ controls: RISPControl[] }>({
    queryKey: ["/api/risp/controls", showActiveOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (showActiveOnly) params.set("activeOnly", "true");
      const res = await fetch(`/api/risp/controls?${params}`);
      if (!res.ok) throw new Error("Failed to fetch controls");
      return res.json();
    },
  });

  const { data: controlDetailData, isLoading: loadingDetail, refetch: refetchDetail } = useQuery<{ 
    control: RISPControl; 
    links: RISPControlLink[] 
  }>({
    queryKey: ["/api/risp/controls", selectedControl?.controlId],
    enabled: !!selectedControl,
    queryFn: async () => {
      if (!selectedControl) throw new Error("No control selected");
      const res = await fetch(`/api/risp/controls/${selectedControl.controlId}`);
      if (!res.ok) throw new Error("Failed to fetch control details");
      return res.json();
    },
  });

  const createControlMutation = useMutation({
    mutationFn: async (data: typeof formData) => 
      apiRequest("POST", "/api/risp/controls", {
        ...data,
        upstreamDataSources: data.upstreamDataSources.split(",").map(s => s.trim()).filter(Boolean),
        downstreamOutputs: data.downstreamOutputs.split(",").map(s => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      toast({ title: "Control created successfully" });
      setIsAddDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/risp/controls"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create control", description: error.message, variant: "destructive" });
    },
  });

  const updateControlMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => 
      apiRequest("PATCH", `/api/risp/controls/${id}`, updates),
    onSuccess: () => {
      toast({ title: "Control updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/risp/controls"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update control", description: error.message, variant: "destructive" });
    },
  });

  const addLinkMutation = useMutation({
    mutationFn: async (data: typeof linkFormData & { controlId: string }) => 
      apiRequest("POST", `/api/risp/controls/${data.controlId}/links`, data),
    onSuccess: () => {
      toast({ title: "Link added successfully" });
      setIsLinkDialogOpen(false);
      setLinkFormData({ entityType: "driver", entityId: "", entityName: "", relationshipNotes: "" });
      refetchDetail();
    },
    onError: (error: any) => {
      toast({ title: "Failed to add link", description: error.message, variant: "destructive" });
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (linkId: string) => apiRequest("DELETE", `/api/risp/links/${linkId}`, {}),
    onSuccess: () => {
      toast({ title: "Link removed" });
      refetchDetail();
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove link", description: error.message, variant: "destructive" });
    },
  });

  const controls = controlsData?.controls || [];
  
  const filteredControls = controls.filter(c => {
    if (typeFilter !== "all" && c.controlType !== typeFilter) return false;
    if (categoryFilter !== "all" && c.riskCategory !== categoryFilter) return false;
    return true;
  });

  const resetForm = () => {
    setFormData({
      controlId: "",
      name: "",
      controlType: "detective",
      riskCategory: "frequency",
      description: "",
      executionPoint: "",
      upstreamDataSources: "",
      downstreamOutputs: "",
      evidenceProduced: "",
    });
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "preventive":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Preventive</Badge>;
      case "detective":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Detective</Badge>;
      case "evidentiary":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Evidentiary</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "frequency":
        return <Badge variant="secondary">Frequency</Badge>;
      case "severity":
        return <Badge variant="secondary" className="bg-red-50 text-red-700">Severity</Badge>;
      case "compliance":
        return <Badge variant="secondary" className="bg-purple-50 text-purple-700">Compliance</Badge>;
      case "operational":
        return <Badge variant="secondary" className="bg-gray-50 text-gray-700">Operational</Badge>;
      default:
        return <Badge variant="secondary">{category}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="risp-controls-page">
      <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
        <Shield className="h-4 w-4 shrink-0 text-primary" />
        <span>Data source: <strong className="text-foreground">Claims module</strong> &mdash; entity links reference Claims-related records from <strong className="text-foreground">2026-02-09</strong> onwards</span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            RISP Control Registry
          </h1>
          <p className="text-muted-foreground">
            Risk/Insurance/Safety/Performance controls for carrier presentations
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-control">
            <Plus className="h-4 w-4 mr-2" />
            Add Control
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Label>Type:</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-type-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {CONTROL_TYPES.map(t => (
                <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label>Category:</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-category-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {RISK_CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={showActiveOnly}
            onCheckedChange={setShowActiveOnly}
            data-testid="switch-active-only"
          />
          <Label>Active only</Label>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : filteredControls.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No controls found. Add a control to get started.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Control ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Risk Category</TableHead>
                  <TableHead>Execution Point</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredControls.map((control) => (
                  <TableRow 
                    key={control.id} 
                    className="cursor-pointer hover-elevate"
                    onClick={() => setSelectedControl(control)}
                    data-testid={`row-control-${control.controlId}`}
                  >
                    <TableCell className="font-mono text-xs">{control.controlId}</TableCell>
                    <TableCell className="font-medium">{control.name}</TableCell>
                    <TableCell>{getTypeBadge(control.controlType)}</TableCell>
                    <TableCell>{getCategoryBadge(control.riskCategory)}</TableCell>
                    <TableCell className="text-sm">{control.executionPoint || '-'}</TableCell>
                    <TableCell>
                      {control.isActive ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="h-3 w-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedControl(control);
                        }}
                        data-testid={`button-view-${control.controlId}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Sheet open={!!selectedControl} onOpenChange={() => setSelectedControl(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {selectedControl?.name}
            </SheetTitle>
            <SheetDescription className="font-mono">
              {selectedControl?.controlId}
            </SheetDescription>
          </SheetHeader>
          
          {loadingDetail ? (
            <div className="mt-6 space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : controlDetailData && (
            <div className="mt-6 space-y-6">
              <div className="flex gap-2 flex-wrap">
                {getTypeBadge(controlDetailData.control.controlType)}
                {getCategoryBadge(controlDetailData.control.riskCategory)}
                {controlDetailData.control.isActive ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <p className="text-sm text-muted-foreground">{controlDetailData.control.description}</p>
              </div>

              {controlDetailData.control.executionPoint && (
                <div className="space-y-2">
                  <Label>Execution Point</Label>
                  <p className="text-sm font-mono">{controlDetailData.control.executionPoint}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <ArrowRight className="h-4 w-4" />
                    Upstream Data Sources
                  </Label>
                  {controlDetailData.control.upstreamDataSources.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {controlDetailData.control.upstreamDataSources.map((src, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{src}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">None specified</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" />
                    Downstream Outputs
                  </Label>
                  {controlDetailData.control.downstreamOutputs.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {controlDetailData.control.downstreamOutputs.map((out, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{out}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">None specified</p>
                  )}
                </div>
              </div>

              {controlDetailData.control.evidenceProduced && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <FileCheck className="h-4 w-4" />
                    Evidence Produced
                  </Label>
                  <p className="text-sm">{controlDetailData.control.evidenceProduced}</p>
                </div>
              )}

              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1">
                    <Link2 className="h-4 w-4" />
                    Entity Links
                  </Label>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setIsLinkDialogOpen(true)}
                    data-testid="button-add-link"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Link
                  </Button>
                </div>
                {controlDetailData.links.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No entity links configured</p>
                ) : (
                  <div className="space-y-2">
                    {controlDetailData.links.map((link) => (
                      <div 
                        key={link.id}
                        className="flex items-center justify-between p-2 border rounded-md"
                        data-testid={`link-${link.id}`}
                      >
                        <div>
                          <Badge variant="outline" className="mr-2">{link.entityType}</Badge>
                          <span className="text-sm font-medium">{link.entityName || link.entityId}</span>
                          {link.relationshipNotes && (
                            <p className="text-xs text-muted-foreground mt-1">{link.relationshipNotes}</p>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteLinkMutation.mutate(link.id)}
                          data-testid={`button-delete-link-${link.id}`}
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t pt-4 flex gap-2">
                <Button
                  variant={controlDetailData.control.isActive ? "outline" : "default"}
                  onClick={() => updateControlMutation.mutate({
                    id: controlDetailData.control.id,
                    updates: { isActive: !controlDetailData.control.isActive },
                  })}
                  data-testid="button-toggle-active"
                >
                  {controlDetailData.control.isActive ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add RISP Control</DialogTitle>
            <DialogDescription>
              Define a new risk/insurance/safety/performance control
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="controlId">Control ID</Label>
                <Input
                  id="controlId"
                  placeholder="CTRL-001"
                  value={formData.controlId}
                  onChange={(e) => setFormData({ ...formData, controlId: e.target.value })}
                  data-testid="input-control-id"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Driver Qualification Check"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  data-testid="input-name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Control Type</Label>
                <Select value={formData.controlType} onValueChange={(v) => setFormData({ ...formData, controlType: v })}>
                  <SelectTrigger data-testid="select-control-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTROL_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Risk Category</Label>
                <Select value={formData.riskCategory} onValueChange={(v) => setFormData({ ...formData, riskCategory: v })}>
                  <SelectTrigger data-testid="select-risk-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this control does and why it matters..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                data-testid="input-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="executionPoint">Execution Point</Label>
              <Input
                id="executionPoint"
                placeholder="e.g., Before move assignment, During claim review"
                value={formData.executionPoint}
                onChange={(e) => setFormData({ ...formData, executionPoint: e.target.value })}
                data-testid="input-execution-point"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upstreamDataSources">Upstream Data Sources (comma-separated)</Label>
              <Input
                id="upstreamDataSources"
                placeholder="drivers, incidents, training_records"
                value={formData.upstreamDataSources}
                onChange={(e) => setFormData({ ...formData, upstreamDataSources: e.target.value })}
                data-testid="input-upstream"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="downstreamOutputs">Downstream Outputs (comma-separated)</Label>
              <Input
                id="downstreamOutputs"
                placeholder="eligibility_flags, risk_scores, alerts"
                value={formData.downstreamOutputs}
                onChange={(e) => setFormData({ ...formData, downstreamOutputs: e.target.value })}
                data-testid="input-downstream"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evidenceProduced">Evidence Produced</Label>
              <Input
                id="evidenceProduced"
                placeholder="Qualification certificate, Risk assessment report"
                value={formData.evidenceProduced}
                onChange={(e) => setFormData({ ...formData, evidenceProduced: e.target.value })}
                data-testid="input-evidence"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createControlMutation.mutate(formData)}
              disabled={createControlMutation.isPending || !formData.controlId || !formData.name || !formData.description}
              data-testid="button-create-control"
            >
              Create Control
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Entity Link</DialogTitle>
            <DialogDescription>
              Link this control to a specific entity (driver, customer, claim, etc.)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Entity Type</Label>
              <Select value={linkFormData.entityType} onValueChange={(v) => setLinkFormData({ ...linkFormData, entityType: v })}>
                <SelectTrigger data-testid="select-link-entity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entityId">Entity ID</Label>
              <Input
                id="entityId"
                placeholder="e.g., driver-123, claim-456"
                value={linkFormData.entityId}
                onChange={(e) => setLinkFormData({ ...linkFormData, entityId: e.target.value })}
                data-testid="input-link-entity-id"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entityName">Entity Name (optional)</Label>
              <Input
                id="entityName"
                placeholder="e.g., John Doe, Claim #12345"
                value={linkFormData.entityName}
                onChange={(e) => setLinkFormData({ ...linkFormData, entityName: e.target.value })}
                data-testid="input-link-entity-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationshipNotes">Relationship Notes (optional)</Label>
              <Textarea
                id="relationshipNotes"
                placeholder="Describe the relationship..."
                value={linkFormData.relationshipNotes}
                onChange={(e) => setLinkFormData({ ...linkFormData, relationshipNotes: e.target.value })}
                data-testid="input-link-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedControl) {
                  addLinkMutation.mutate({ ...linkFormData, controlId: selectedControl.id });
                }
              }}
              disabled={addLinkMutation.isPending || !linkFormData.entityId}
              data-testid="button-create-link"
            >
              Add Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
