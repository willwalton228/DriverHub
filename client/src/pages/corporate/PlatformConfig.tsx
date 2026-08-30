import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Settings2, Plus, Pencil, Trash2, Search, Globe, Building2, Network, X, ChevronRight, Shield, Info, ToggleLeft, List, SlidersHorizontal, Hash } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { PlatformConfig } from "@shared/schema";

const SCOPE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  global:  { label: "Global",  icon: Globe,      color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  account: { label: "Account", icon: Building2,  color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  network: { label: "Network", icon: Network,    color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
};

const CATEGORY_LABELS: Record<string, { label: string; icon: any }> = {
  picklist:     { label: "Picklist",     icon: List },
  feature_flag: { label: "Feature Flag", icon: ToggleLeft },
  default:      { label: "Default",      icon: SlidersHorizontal },
  threshold:    { label: "Threshold",    icon: Hash },
};

function ScopeBadge({ scopeType, scopeId }: { scopeType: string; scopeId?: string | null }) {
  const meta = SCOPE_LABELS[scopeType] ?? SCOPE_LABELS.global;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${meta.color}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
      {scopeId && <span className="opacity-70 font-mono">· {scopeId.slice(0, 8)}</span>}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_LABELS[category] ?? CATEGORY_LABELS.picklist;
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function formatValue(val: any, category: string): string {
  if (category === "picklist") {
    const items = Array.isArray(val) ? val : val?.items ?? [];
    return items.join(", ") || "—";
  }
  if (category === "feature_flag") {
    return val?.enabled ? "Enabled" : "Disabled";
  }
  if (category === "threshold") {
    return `${val?.value ?? "—"} ${val?.unit ?? ""}`.trim();
  }
  if (category === "default") {
    return String(val?.value ?? val ?? "—");
  }
  return JSON.stringify(val);
}

// ── Picklist builder ──────────────────────────────────────────────────────────
function PicklistEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setDraft("");
  };

  const remove = (item: string) => onChange(value.filter(v => v !== item));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add value…"
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          data-testid="input-picklist-item"
        />
        <Button type="button" size="sm" onClick={add} data-testid="button-add-picklist-item">Add</Button>
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-8">
        {value.map(item => (
          <span
            key={item}
            className="inline-flex items-center gap-1 bg-muted text-sm px-2 py-0.5 rounded-md"
            data-testid={`tag-picklist-${item}`}
          >
            {item}
            <button type="button" onClick={() => remove(item)} className="text-muted-foreground hover:text-destructive ml-0.5">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="text-sm text-muted-foreground italic">No values yet</span>}
      </div>
    </div>
  );
}

// ── Config form dialog ────────────────────────────────────────────────────────
interface ConfigFormProps {
  initial?: PlatformConfig | null;
  onClose: () => void;
}

function ConfigFormDialog({ initial, onClose }: ConfigFormProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!initial;

  const [configKey,      setConfigKey]      = useState(initial?.configKey      ?? "");
  const [label,          setLabel]          = useState(initial?.label          ?? "");
  const [description,    setDescription]    = useState(initial?.description    ?? "");
  const [configCategory, setConfigCategory] = useState(initial?.configCategory ?? "picklist");
  const [scopeType,      setScopeType]      = useState(initial?.scopeType      ?? "global");
  const [scopeId,        setScopeId]        = useState(initial?.scopeId        ?? "");
  const [isActive,       setIsActive]       = useState(initial?.isActive       ?? true);

  // Value state by category
  const [picklistItems,    setPicklistItems]    = useState<string[]>(() => {
    const v = initial?.configValue;
    if (!v) return [];
    return Array.isArray(v) ? v : v?.items ?? [];
  });
  const [featureEnabled,   setFeatureEnabled]   = useState<boolean>((initial?.configValue as any)?.enabled ?? true);
  const [defaultValue,     setDefaultValue]     = useState<string>(String((initial?.configValue as any)?.value ?? ""));
  const [thresholdValue,   setThresholdValue]   = useState<string>(String((initial?.configValue as any)?.value ?? ""));
  const [thresholdUnit,    setThresholdUnit]    = useState<string>((initial?.configValue as any)?.unit ?? "");
  const [rawJson,          setRawJson]          = useState<string>(() => {
    if (!initial?.configValue) return "{}";
    return JSON.stringify(initial.configValue, null, 2);
  });

  function buildValue(): any {
    switch (configCategory) {
      case "picklist":     return picklistItems;
      case "feature_flag": return { enabled: featureEnabled };
      case "default":      return { value: defaultValue };
      case "threshold":    return { value: parseFloat(thresholdValue) || 0, unit: thresholdUnit };
      default: {
        try { return JSON.parse(rawJson); } catch { return {}; }
      }
    }
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (isEdit) {
        return apiRequest("PUT", `/api/platform/configs/${initial!.id}`, payload);
      }
      return apiRequest("POST", `/api/platform/configs`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/platform/configs"] });
      toast({ title: isEdit ? "Config updated" : "Config created", description: `${label || configKey} saved.` });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message ?? "Save failed", variant: "destructive" });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!configKey.trim() || !label.trim()) {
      toast({ title: "Validation", description: "Config key and label are required.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      configKey: configKey.trim(),
      label: label.trim(),
      description: description.trim() || null,
      configCategory,
      configValue: buildValue(),
      scopeType,
      scopeId: scopeType === "global" ? null : (scopeId.trim() || null),
      isActive,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Configuration" : "New Configuration Entry"}</DialogTitle>
          <DialogDescription>
            Define a configurable value with scope. Global entries apply everywhere; scoped entries override globals for a specific account or network.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Config Key <span className="text-destructive">*</span></Label>
              <Input
                value={configKey}
                onChange={e => setConfigKey(e.target.value)}
                placeholder="driver.types"
                disabled={isEdit}
                data-testid="input-config-key"
              />
              <p className="text-xs text-muted-foreground">Use dot notation: module.property</p>
            </div>
            <div className="space-y-1.5">
              <Label>Label <span className="text-destructive">*</span></Label>
              <Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Driver Types"
                data-testid="input-config-label"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe what this config controls…"
              rows={2}
              data-testid="input-config-description"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={configCategory} onValueChange={setConfigCategory}>
                <SelectTrigger data-testid="select-config-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="picklist">Picklist</SelectItem>
                  <SelectItem value="feature_flag">Feature Flag</SelectItem>
                  <SelectItem value="default">Default Value</SelectItem>
                  <SelectItem value="threshold">Threshold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Scope Type</Label>
              <Select value={scopeType} onValueChange={v => { setScopeType(v); setScopeId(""); }}>
                <SelectTrigger data-testid="select-scope-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="account">Account</SelectItem>
                  <SelectItem value="network">Network</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scopeType !== "global" && (
              <div className="space-y-1.5">
                <Label>Scope ID</Label>
                <Input
                  value={scopeId}
                  onChange={e => setScopeId(e.target.value)}
                  placeholder="Account or network UUID"
                  data-testid="input-scope-id"
                />
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Value</Label>
            {configCategory === "picklist" && (
              <PicklistEditor value={picklistItems} onChange={setPicklistItems} />
            )}
            {configCategory === "feature_flag" && (
              <div className="flex items-center gap-3">
                <Switch
                  checked={featureEnabled}
                  onCheckedChange={setFeatureEnabled}
                  data-testid="switch-feature-enabled"
                />
                <span className="text-sm">{featureEnabled ? "Enabled" : "Disabled"}</span>
              </div>
            )}
            {configCategory === "default" && (
              <Input
                value={defaultValue}
                onChange={e => setDefaultValue(e.target.value)}
                placeholder="Default value…"
                data-testid="input-default-value"
              />
            )}
            {configCategory === "threshold" && (
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={thresholdValue}
                  onChange={e => setThresholdValue(e.target.value)}
                  placeholder="75"
                  className="w-32"
                  data-testid="input-threshold-value"
                />
                <Input
                  value={thresholdUnit}
                  onChange={e => setThresholdUnit(e.target.value)}
                  placeholder="percent"
                  data-testid="input-threshold-unit"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="is-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              data-testid="switch-is-active"
            />
            <Label htmlFor="is-active">Active</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-config">Cancel</Button>
            <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-config">
              {saveMutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PlatformConfig() {
  const { isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch]           = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [catFilter, setCatFilter]     = useState("all");
  const [editing, setEditing]         = useState<PlatformConfig | null | "new">(null);

  const { data: configs = [], isLoading } = useQuery<PlatformConfig[]>({
    queryKey: ["/api/platform/configs"],
    queryFn: () => fetch("/api/platform/configs").then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/platform/configs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/platform/configs"] });
      toast({ title: "Deleted", description: "Scoped override removed." });
    },
    onError: (e: any) => toast({ title: "Cannot delete", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    return configs.filter(c => {
      if (scopeFilter !== "all" && c.scopeType !== scopeFilter) return false;
      if (catFilter   !== "all" && c.configCategory !== catFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.configKey.toLowerCase().includes(q) && !c.label.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [configs, scopeFilter, catFilter, search]);

  // Group by configKey for display
  const grouped = useMemo(() => {
    const map = new Map<string, PlatformConfig[]>();
    for (const c of filtered) {
      const arr = map.get(c.configKey) ?? [];
      arr.push(c);
      map.set(c.configKey, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <Shield className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Super Admin access required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings2 className="h-7 w-7 text-primary" />
            Platform Configuration
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage global and scoped configurations that drive system behavior across all modules.
          </p>
        </div>
        <Button onClick={() => setEditing("new")} data-testid="button-new-config">
          <Plus className="h-4 w-4 mr-2" />
          New Config Entry
        </Button>
      </div>

      {/* Scope explanation */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(SCOPE_LABELS).map(([key, meta]) => {
          const Icon = meta.icon;
          const count = configs.filter(c => c.scopeType === key).length;
          return (
            <Card key={key} className="cursor-pointer" onClick={() => setScopeFilter(scopeFilter === key ? "all" : key)} data-testid={`card-scope-${key}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <span className={`p-2 rounded-md ${meta.color}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium text-sm">{meta.label}</p>
                  <p className="text-xs text-muted-foreground">{count} {count === 1 ? "entry" : "entries"}</p>
                </div>
                {scopeFilter === key && <ChevronRight className="h-4 w-4 text-primary ml-auto" />}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search config key or label…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-config-search"
          />
        </div>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-40" data-testid="select-scope-filter">
            <SelectValue placeholder="All Scopes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            <SelectItem value="global">Global</SelectItem>
            <SelectItem value="account">Account</SelectItem>
            <SelectItem value="network">Network</SelectItem>
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-44" data-testid="select-category-filter">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="picklist">Picklist</SelectItem>
            <SelectItem value="feature_flag">Feature Flag</SelectItem>
            <SelectItem value="default">Default Value</SelectItem>
            <SelectItem value="threshold">Threshold</SelectItem>
          </SelectContent>
        </Select>
        {(scopeFilter !== "all" || catFilter !== "all" || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setScopeFilter("all"); setCatFilter("all"); setSearch(""); }}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading configurations…</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No configurations found.</div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([key, rows]) => {
            const globalRow = rows.find(r => r.scopeType === "global");
            const scopedRows = rows.filter(r => r.scopeType !== "global");
            return (
              <Card key={key} data-testid={`card-config-${key}`}>
                <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-base font-mono">{key}</CardTitle>
                    {globalRow && <CardDescription className="mt-0.5">{globalRow.label}</CardDescription>}
                  </div>
                  <div className="flex items-center gap-2">
                    {globalRow && <CategoryBadge category={globalRow.configCategory} />}
                    {!globalRow?.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing("new")}
                      data-testid={`button-add-scope-${key}`}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Scope Override
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">Scope</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead className="w-20">Active</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(row => (
                        <TableRow key={row.id} data-testid={`row-config-${row.id}`}>
                          <TableCell>
                            <ScopeBadge scopeType={row.scopeType} scopeId={row.scopeId} />
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground max-w-md truncate">
                            {formatValue(row.configValue, row.configCategory)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.isActive ? "default" : "secondary"} className="text-xs">
                              {row.isActive ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setEditing(row)}
                                data-testid={`button-edit-config-${row.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {!(row.scopeType === "global") && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    if (confirm(`Delete scoped override for "${key}"?`)) {
                                      deleteMutation.mutate(row.id);
                                    }
                                  }}
                                  data-testid={`button-delete-config-${row.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {globalRow?.description && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {globalRow.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      {editing && (
        <ConfigFormDialog
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
