import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Flag, Globe, MapPin, AlertTriangle, Settings } from "lucide-react";

interface FeatureFlag {
  id: string;
  flagKey: string;
  name: string;
  description: string | null;
  scope: 'global' | 'market';
  market: string | null;
  isEnabled: boolean;
  isMvpFeature: boolean;
  requiresExplicitEnable: boolean;
  warningMessage: string | null;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string | null;
  updatedByEmail: string | null;
}

interface FeatureFlagsProps {
  isAdmin: boolean;
}

export function FeatureFlags({ isAdmin }: FeatureFlagsProps) {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);
  const [scopeFilter, setScopeFilter] = useState<string>("all");

  const [formData, setFormData] = useState({
    flagKey: "",
    name: "",
    description: "",
    scope: "global" as 'global' | 'market',
    market: "",
    isEnabled: false,
    isMvpFeature: false,
    requiresExplicitEnable: true,
    warningMessage: "",
  });

  const { data: flags = [], isLoading } = useQuery<FeatureFlag[]>({
    queryKey: ['/api/recruiting/feature-flags'],
  });

  const { data: markets = [] } = useQuery<{ market: string }[]>({
    queryKey: ['/api/recruiting/requisitions/markets'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/recruiting/feature-flags", {
        ...data,
        market: data.scope === 'market' ? data.market : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/feature-flags'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Feature flag created",
        description: "The feature flag has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create feature flag",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      return apiRequest("PATCH", `/api/recruiting/feature-flags/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/feature-flags'] });
      setIsEditDialogOpen(false);
      setSelectedFlag(null);
      toast({
        title: "Feature flag updated",
        description: "The feature flag has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update feature flag",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/recruiting/feature-flags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/feature-flags'] });
      setIsDeleteDialogOpen(false);
      setSelectedFlag(null);
      toast({
        title: "Feature flag deleted",
        description: "The feature flag has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete feature flag",
        variant: "destructive",
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      return apiRequest("PATCH", `/api/recruiting/feature-flags/${id}`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/feature-flags'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to toggle feature flag",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      flagKey: "",
      name: "",
      description: "",
      scope: "global",
      market: "",
      isEnabled: false,
      isMvpFeature: false,
      requiresExplicitEnable: true,
      warningMessage: "",
    });
  };

  const handleEdit = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    setFormData({
      flagKey: flag.flagKey,
      name: flag.name,
      description: flag.description || "",
      scope: flag.scope,
      market: flag.market || "",
      isEnabled: flag.isEnabled,
      isMvpFeature: flag.isMvpFeature,
      requiresExplicitEnable: flag.requiresExplicitEnable,
      warningMessage: flag.warningMessage || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    setIsDeleteDialogOpen(true);
  };

  const handleToggle = (flag: FeatureFlag) => {
    if (flag.warningMessage && !flag.isEnabled) {
      toast({
        title: "Warning",
        description: flag.warningMessage,
        variant: "destructive",
      });
    }
    toggleMutation.mutate({ id: flag.id, isEnabled: !flag.isEnabled });
  };

  const filteredFlags = scopeFilter === "all" 
    ? flags 
    : flags.filter(f => f.scope === scopeFilter);

  const uniqueMarkets = Array.from(new Set(markets.map(m => m.market)));

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5" />
                Feature Flags
              </CardTitle>
              <CardDescription>
                Control feature rollout and system guardrails by market
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={scopeFilter} onValueChange={setScopeFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-scope-filter">
                  <SelectValue placeholder="Filter scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scopes</SelectItem>
                  <SelectItem value="global">Global Only</SelectItem>
                  <SelectItem value="market">Market Only</SelectItem>
                </SelectContent>
              </Select>
              {isAdmin && (
                <Button onClick={() => { resetForm(); setIsCreateDialogOpen(true); }} data-testid="button-create-flag">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Flag
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {flags.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No feature flags configured yet.</p>
              {isAdmin && (
                <p className="text-sm mt-2">Create your first flag to control feature rollout.</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flag</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>MVP</TableHead>
                  <TableHead>Last Updated</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFlags.map((flag) => (
                  <TableRow key={flag.id} data-testid={`row-flag-${flag.id}`}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{flag.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{flag.flagKey}</div>
                        {flag.description && (
                          <div className="text-xs text-muted-foreground">{flag.description}</div>
                        )}
                        {flag.warningMessage && (
                          <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                            <AlertTriangle className="h-3 w-3" />
                            {flag.warningMessage}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {flag.scope === 'global' ? (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            Global
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {flag.market}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Switch
                          checked={flag.isEnabled}
                          onCheckedChange={() => handleToggle(flag)}
                          data-testid={`switch-flag-${flag.id}`}
                        />
                      ) : (
                        <Badge variant={flag.isEnabled ? "default" : "secondary"}>
                          {flag.isEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {flag.isMvpFeature && (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          MVP
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {new Date(flag.updatedAt).toLocaleDateString()}
                      </div>
                      {flag.updatedByEmail && (
                        <div className="text-xs text-muted-foreground">
                          by {flag.updatedByEmail}
                        </div>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(flag)}
                            data-testid={`button-edit-flag-${flag.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(flag)}
                            data-testid={`button-delete-flag-${flag.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Feature Flag</DialogTitle>
            <DialogDescription>
              Create a new feature flag to control feature rollout.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="flagKey">Flag Key</Label>
              <Input
                id="flagKey"
                placeholder="e.g., candidate_availability"
                value={formData.flagKey}
                onChange={(e) => setFormData({ ...formData, flagKey: e.target.value })}
                data-testid="input-flag-key"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                placeholder="e.g., Candidate Availability"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-flag-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this flag controls..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                data-testid="input-flag-description"
              />
            </div>
            <div className="grid gap-2">
              <Label>Scope</Label>
              <Select
                value={formData.scope}
                onValueChange={(value: 'global' | 'market') => setFormData({ ...formData, scope: value })}
              >
                <SelectTrigger data-testid="select-flag-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="market">Market-Specific</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.scope === 'market' && (
              <div className="grid gap-2">
                <Label>Market</Label>
                <Select
                  value={formData.market}
                  onValueChange={(value) => setFormData({ ...formData, market: value })}
                >
                  <SelectTrigger data-testid="select-flag-market">
                    <SelectValue placeholder="Select market" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueMarkets.map((market) => (
                      <SelectItem key={market} value={market}>{market}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="warningMessage">Warning Message (optional)</Label>
              <Textarea
                id="warningMessage"
                placeholder="Warning to show when enabling this flag..."
                value={formData.warningMessage}
                onChange={(e) => setFormData({ ...formData, warningMessage: e.target.value })}
                data-testid="input-flag-warning"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="isEnabled">Enabled</Label>
              <Switch
                id="isEnabled"
                checked={formData.isEnabled}
                onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
                data-testid="switch-flag-enabled"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="isMvpFeature">MVP Feature</Label>
              <Switch
                id="isMvpFeature"
                checked={formData.isMvpFeature}
                onCheckedChange={(checked) => setFormData({ ...formData, isMvpFeature: checked })}
                data-testid="switch-flag-mvp"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="requiresExplicitEnable">Requires Explicit Enable</Label>
              <Switch
                id="requiresExplicitEnable"
                checked={formData.requiresExplicitEnable}
                onCheckedChange={(checked) => setFormData({ ...formData, requiresExplicitEnable: checked })}
                data-testid="switch-flag-explicit"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(formData)}
              disabled={createMutation.isPending || !formData.flagKey || !formData.name}
              data-testid="button-submit-create-flag"
            >
              {createMutation.isPending ? "Creating..." : "Create Flag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Feature Flag</DialogTitle>
            <DialogDescription>
              Update the feature flag configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Flag Key</Label>
              <Input value={formData.flagKey} disabled className="bg-muted" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Display Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-edit-flag-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                data-testid="input-edit-flag-description"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-warningMessage">Warning Message</Label>
              <Textarea
                id="edit-warningMessage"
                value={formData.warningMessage}
                onChange={(e) => setFormData({ ...formData, warningMessage: e.target.value })}
                data-testid="input-edit-flag-warning"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-isEnabled">Enabled</Label>
              <Switch
                id="edit-isEnabled"
                checked={formData.isEnabled}
                onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
                data-testid="switch-edit-flag-enabled"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-isMvpFeature">MVP Feature</Label>
              <Switch
                id="edit-isMvpFeature"
                checked={formData.isMvpFeature}
                onCheckedChange={(checked) => setFormData({ ...formData, isMvpFeature: checked })}
                data-testid="switch-edit-flag-mvp"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-requiresExplicitEnable">Requires Explicit Enable</Label>
              <Switch
                id="edit-requiresExplicitEnable"
                checked={formData.requiresExplicitEnable}
                onCheckedChange={(checked) => setFormData({ ...formData, requiresExplicitEnable: checked })}
                data-testid="switch-edit-flag-explicit"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedFlag && updateMutation.mutate({
                id: selectedFlag.id,
                data: {
                  name: formData.name,
                  description: formData.description,
                  isEnabled: formData.isEnabled,
                  isMvpFeature: formData.isMvpFeature,
                  requiresExplicitEnable: formData.requiresExplicitEnable,
                  warningMessage: formData.warningMessage,
                }
              })}
              disabled={updateMutation.isPending}
              data-testid="button-submit-edit-flag"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Feature Flag</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the feature flag "{selectedFlag?.name}"? 
              This action cannot be undone and may affect system behavior.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedFlag && deleteMutation.mutate(selectedFlag.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-flag"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
