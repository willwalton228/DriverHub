import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DriverResource } from "@shared/schema";
import { DRIVER_RESOURCE_TYPES, DRIVER_RESOURCE_AUDIENCES } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, Link, FileText, Loader2 } from "lucide-react";

const AUDIENCES = DRIVER_RESOURCE_AUDIENCES as readonly string[];
const TYPES = DRIVER_RESOURCE_TYPES as readonly string[];

const AUDIENCE_COLORS: Record<string, "default" | "secondary" | "outline"> = {
  "All": "default",
  "Employee": "secondary",
  "Independent Contractor": "outline",
};

type ResourceForm = {
  title: string;
  type: string;
  url: string;
  category: string;
  audience: string;
  displayOrder: number;
  active: boolean;
};

const emptyForm = (): ResourceForm => ({
  title: "",
  type: "link",
  url: "",
  category: "General",
  audience: "All",
  displayOrder: 0,
  active: true,
});

export default function DriverResources() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ResourceForm>(emptyForm());
  const [audienceFilter, setAudienceFilter] = useState("all");

  const { data: resources = [], isLoading } = useQuery<DriverResource[]>({
    queryKey: ["/api/corporate/driver-resources"],
  });

  const createMutation = useMutation({
    mutationFn: (data: ResourceForm) => apiRequest("POST", "/api/corporate/driver-resources", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/driver-resources"] });
      setDialogOpen(false);
      setForm(emptyForm());
      toast({ title: "Resource created" });
    },
    onError: () => toast({ title: "Error", description: "Failed to create resource", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ResourceForm> }) =>
      apiRequest("PATCH", `/api/corporate/driver-resources/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/driver-resources"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm());
      toast({ title: "Resource updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update resource", variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/corporate/driver-resources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/driver-resources"] });
      toast({ title: "Resource removed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove resource", variant: "destructive" }),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (r: DriverResource) => {
    setEditingId(r.id);
    setForm({
      title: r.title,
      type: r.type,
      url: r.url || "",
      category: r.category,
      audience: r.audience,
      displayOrder: r.displayOrder,
      active: r.active,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim()) return toast({ title: "Title is required", variant: "destructive" });
    if (!form.url.trim()) return toast({ title: "URL is required", variant: "destructive" });
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const filtered = resources.filter((r) => {
    if (audienceFilter === "all") return true;
    return r.audience === audienceFilter;
  });

  const grouped = filtered.reduce<Record<string, DriverResource[]>>((acc, r) => {
    const cat = r.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" data-testid="heading-driver-resources">Driver Resources</h1>
          <p className="text-sm text-muted-foreground">Manage links and documents shown to drivers based on their classification.</p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-resource">
          <Plus className="h-4 w-4 mr-1" />
          Add Resource
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filter by audience:</span>
        <Select value={audienceFilter} onValueChange={setAudienceFilter}>
          <SelectTrigger className="w-52" data-testid="select-audience-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Audiences</SelectItem>
            {AUDIENCES.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No resources found. Add one to get started.
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => (
          <Card key={category}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{category}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead className="text-center">Order</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.sort((a, b) => a.displayOrder - b.displayOrder).map((r) => (
                    <TableRow key={r.id} data-testid={`row-resource-${r.id}`}>
                      <TableCell>
                        {r.type === "link" ? (
                          <Link className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{r.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {r.url || r.filePath || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={AUDIENCE_COLORS[r.audience] || "secondary"} className="text-xs">
                          {r.audience}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">{r.displayOrder}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={r.active ? "default" : "outline"} className="text-xs">
                          {r.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(r)}
                            data-testid={`button-edit-resource-${r.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deactivateMutation.mutate(r.id)}
                            disabled={deactivateMutation.isPending}
                            data-testid={`button-deactivate-resource-${r.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Resource" : "Add Resource"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="res-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="res-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Employee Handbook"
                data-testid="input-resource-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger data-testid="select-resource-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Audience <span className="text-destructive">*</span></Label>
                <Select value={form.audience} onValueChange={(v) => setForm((f) => ({ ...f, audience: v }))}>
                  <SelectTrigger data-testid="select-resource-audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-url">URL <span className="text-destructive">*</span></Label>
              <Input
                id="res-url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://..."
                data-testid="input-resource-url"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="res-category">Category</Label>
                <Input
                  id="res-category"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Onboarding"
                  data-testid="input-resource-category"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="res-order">Display Order</Label>
                <Input
                  id="res-order"
                  type="number"
                  min={0}
                  value={form.displayOrder}
                  onChange={(e) => setForm((f) => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))}
                  data-testid="input-resource-order"
                />
              </div>
            </div>
            {editingId && (
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                  data-testid="switch-resource-active"
                />
                <Label>Active</Label>
              </div>
            )}
          </div>
          <Separator />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-resource-cancel">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending} data-testid="button-resource-save">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingId ? "Save Changes" : "Create Resource"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
