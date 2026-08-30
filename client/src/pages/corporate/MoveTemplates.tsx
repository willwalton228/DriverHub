import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus, Edit, Trash2, Loader2, FileStack, ShieldAlert, CheckCircle2, XCircle,
  Route, Truck, ListChecks, GripVertical, Star, Save,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MoveTemplate, MoveType, TransportationMethod, MoveTask } from "@shared/schema";

type EnrichedTemplate = MoveTemplate & {
  moveType: { id: string; name: string; category: string | null } | null;
  defaultTransportationMethod: { id: string; name: string } | null;
};

const templateFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  versionNumber: z.coerce.number().int().min(1).default(1),
  moveTypeId: z.string().optional().nullable(),
  defaultTransportationMethodId: z.string().optional().nullable(),
});
type TemplateFormValues = z.infer<typeof templateFormSchema>;

const NONE_VALUE = "__none__";

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing?: EnrichedTemplate | null;
  moveTypes: MoveType[];
  transportationMethods: TransportationMethod[];
}

function TemplateFormDialog({ open, onOpenChange, existing, moveTypes, transportationMethods }: TemplateFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!existing;

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: existing?.name ?? "",
      description: existing?.description ?? "",
      isActive: existing?.isActive ?? true,
      versionNumber: existing?.versionNumber ?? 1,
      moveTypeId: existing?.moveTypeId ?? null,
      defaultTransportationMethodId: existing?.defaultTransportationMethodId ?? null,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: existing?.name ?? "",
        description: existing?.description ?? "",
        isActive: existing?.isActive ?? true,
        versionNumber: existing?.versionNumber ?? 1,
        moveTypeId: existing?.moveTypeId ?? null,
        defaultTransportationMethodId: existing?.defaultTransportationMethodId ?? null,
      });
    }
  }, [open, existing?.id]);

  const mutation = useMutation({
    mutationFn: async (values: TemplateFormValues) => {
      const payload = {
        ...values,
        moveTypeId: values.moveTypeId || null,
        defaultTransportationMethodId: values.defaultTransportationMethodId || null,
      };
      if (isEdit && existing) {
        return apiRequest("PATCH", `/api/platform/move-templates/${existing.id}`, payload);
      }
      return apiRequest("POST", "/api/platform/move-templates", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/move-templates"] });
      toast({
        title: isEdit ? "Template updated" : "Template created",
        description: `${form.getValues("name")} v${form.getValues("versionNumber")} has been ${isEdit ? "updated" : "created"}.`,
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save template", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-move-template-form">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Move Template" : "Create Move Template"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this move execution template."
              : "Create a new reusable move execution template."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-5">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel required>Template Name</FormLabel>
                <FormControl><Input {...field} placeholder="e.g. Standard Dealer Trade v1" data-testid="input-template-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="versionNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel required>Version</FormLabel>
                  <FormControl><Input {...field} type="number" min={1} data-testid="input-template-version" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex flex-row items-end justify-between gap-3 rounded-md border p-3">
                  <FormLabel className="text-sm font-medium leading-none">Active</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-template-active" />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="What this template covers and when to use it…" rows={3} data-testid="textarea-template-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="moveTypeId" render={({ field }) => (
              <FormItem>
                <FormLabel>Move Type</FormLabel>
                <Select
                  value={field.value ?? NONE_VALUE}
                  onValueChange={(v) => field.onChange(v === NONE_VALUE ? null : v)}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-template-move-type">
                      <SelectValue placeholder="Select a move type…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— None —</SelectItem>
                    {moveTypes.map((mt) => (
                      <SelectItem key={mt.id} value={mt.id} data-testid={`option-move-type-${mt.id}`}>
                        {mt.name}
                        {mt.category ? ` (${mt.category})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="defaultTransportationMethodId" render={({ field }) => (
              <FormItem>
                <FormLabel>Default Transportation Method <span className="text-xs text-muted-foreground font-normal">(Optional)</span></FormLabel>
                <Select
                  value={field.value ?? NONE_VALUE}
                  onValueChange={(v) => field.onChange(v === NONE_VALUE ? null : v)}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-template-transport-method">
                      <SelectValue placeholder="Select a transportation method…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— None —</SelectItem>
                    {transportationMethods.map((tm) => (
                      <SelectItem key={tm.id} value={tm.id} data-testid={`option-transport-method-${tm.id}`}>
                        {tm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-template-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-template-save">
                {mutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</>
                  : isEdit ? "Save Changes" : "Create Template"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Types for template task config ────────────────────────────────────────────
type TemplateTaskRow = {
  id: string;
  templateId: string;
  taskId: string;
  sortOrder: number;
  isRequired: boolean;
  conditionalConfig: Record<string, unknown> | null;
  task: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    isActive: boolean;
    defaultRequired: boolean;
  };
};

// ── Sortable task row inside the dialog ───────────────────────────────────────
function SortableTaskRow({
  item,
  onToggleRequired,
  onRemove,
}: {
  item: TemplateTaskRow;
  onToggleRequired: (taskId: string) => void;
  onRemove: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.taskId });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
      data-testid={`row-template-task-${item.taskId}`}
    >
      <button
        type="button"
        className="touch-none cursor-grab text-muted-foreground shrink-0"
        {...listeners}
        {...attributes}
        aria-label="Drag to reorder"
        data-testid={`drag-template-task-${item.taskId}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.task.name}</p>
        {item.task.category && (
          <Badge variant="secondary" className="text-xs mt-0.5">{item.task.category}</Badge>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5" title={item.isRequired ? "Required" : "Optional"}>
          <Star className={`h-3.5 w-3.5 ${item.isRequired ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
          <Switch
            checked={item.isRequired}
            onCheckedChange={() => onToggleRequired(item.taskId)}
            data-testid={`switch-task-required-${item.taskId}`}
          />
          <span className="text-xs text-muted-foreground w-14">{item.isRequired ? "Required" : "Optional"}</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          type="button"
          onClick={() => onRemove(item.taskId)}
          data-testid={`button-remove-template-task-${item.taskId}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Template Task Configuration Dialog ────────────────────────────────────────
function TemplateTasksDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: EnrichedTemplate | null;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<TemplateTaskRow[]>([]);
  const [addTaskId, setAddTaskId] = useState<string>("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  );

  const { data: currentTasks, isLoading: tasksLoading } = useQuery<TemplateTaskRow[]>({
    queryKey: ["/api/platform/move-templates", template?.id, "tasks"],
    queryFn: () =>
      fetch(`/api/platform/move-templates/${template!.id}/tasks`, { credentials: "include" })
        .then((r) => r.json()),
    enabled: open && !!template,
  });

  const { data: allTasks } = useQuery<MoveTask[]>({
    queryKey: ["/api/platform/move-tasks/active"],
    queryFn: () =>
      fetch("/api/platform/move-tasks/active", { credentials: "include" }).then((r) => r.json()),
    enabled: open,
  });

  useEffect(() => {
    if (open && currentTasks) setRows(currentTasks);
  }, [open, currentTasks]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = rows.map((r, idx) => ({
        taskId: r.taskId,
        sortOrder: idx,
        isRequired: r.isRequired,
        conditionalConfig: r.conditionalConfig ?? null,
      }));
      return apiRequest("PUT", `/api/platform/move-templates/${template!.id}/tasks`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/move-templates", template?.id, "tasks"] });
      toast({ title: "Tasks saved", description: `${rows.length} task(s) configured for "${template?.name}".` });
      onOpenChange(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const oldIdx = prev.findIndex((r) => r.taskId === active.id);
      const newIdx = prev.findIndex((r) => r.taskId === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const toggleRequired = (taskId: string) => {
    setRows((prev) => prev.map((r) => r.taskId === taskId ? { ...r, isRequired: !r.isRequired } : r));
  };

  const removeTask = (taskId: string) => {
    setRows((prev) => prev.filter((r) => r.taskId !== taskId));
  };

  const addTask = () => {
    if (!addTaskId) return;
    if (rows.some((r) => r.taskId === addTaskId)) {
      toast({ title: "Already added", description: "This task is already in the template.", variant: "destructive" });
      return;
    }
    const found = (allTasks ?? []).find((t) => t.id === addTaskId);
    if (!found) return;
    const newRow: TemplateTaskRow = {
      id: crypto.randomUUID(),
      templateId: template!.id,
      taskId: found.id,
      sortOrder: rows.length,
      isRequired: found.defaultRequired,
      conditionalConfig: null,
      task: {
        id: found.id,
        name: found.name,
        description: found.description ?? null,
        category: found.category ?? null,
        isActive: found.isActive,
        defaultRequired: found.defaultRequired,
      },
    };
    setRows((prev) => [...prev, newRow]);
    setAddTaskId("");
  };

  const assignedIds = new Set(rows.map((r) => r.taskId));
  const availableTasks = (allTasks ?? []).filter((t) => !assignedIds.has(t.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-template-tasks">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Configure Tasks
          </DialogTitle>
          <DialogDescription>
            {template?.name}{template?.versionNumber ? ` · v${template.versionNumber}` : ""}
            {" — drag to reorder, toggle Required/Optional per task."}
          </DialogDescription>
        </DialogHeader>

        {tasksLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading tasks…
          </div>
        ) : (
          <div className="space-y-3">
            {/* Add task selector */}
            <div className="flex gap-2">
              <Select value={addTaskId} onValueChange={setAddTaskId}>
                <SelectTrigger className="flex-1" data-testid="select-add-template-task">
                  <SelectValue placeholder={availableTasks.length === 0 ? "All tasks added" : "Add a task…"} />
                </SelectTrigger>
                <SelectContent>
                  {availableTasks.map((t) => (
                    <SelectItem key={t.id} value={t.id} data-testid={`option-add-task-${t.id}`}>
                      {t.name}{t.category ? ` (${t.category})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={addTask}
                disabled={!addTaskId}
                data-testid="button-add-task-to-template"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>

            {/* DnD task list */}
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground border rounded-md">
                <ListChecks className="h-6 w-6 mb-1.5" />
                <p className="text-sm">No tasks assigned yet. Add tasks from the dropdown above.</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={rows.map((r) => r.taskId)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {rows.map((row) => (
                      <SortableTaskRow
                        key={row.taskId}
                        item={row}
                        onToggleRequired={toggleRequired}
                        onRemove={removeTask}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            <p className="text-xs text-muted-foreground">
              {rows.length} task{rows.length !== 1 ? "s" : ""} · {rows.filter((r) => r.isRequired).length} required
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-tasks-cancel">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || tasksLoading}
            data-testid="button-tasks-save"
          >
            {saveMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</>
              : <><Save className="h-4 w-4 mr-1.5" />Save Tasks</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MoveTemplates() {
  const { isSuperAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnrichedTemplate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EnrichedTemplate | null>(null);
  const [taskConfigOpen, setTaskConfigOpen] = useState(false);
  const [taskConfigTemplate, setTaskConfigTemplate] = useState<EnrichedTemplate | null>(null);

  const { data, isLoading } = useQuery<EnrichedTemplate[]>({
    queryKey: ["/api/platform/move-templates"],
    enabled: isSuperAdmin,
  });
  const templates = data ?? [];

  const { data: moveTypesData } = useQuery<MoveType[]>({
    queryKey: ["/api/platform/move-types/active"],
    enabled: isSuperAdmin,
  });
  const { data: transportMethodsData } = useQuery<TransportationMethod[]>({
    queryKey: ["/api/platform/transportation-methods/active"],
    enabled: isSuperAdmin,
  });

  const activeMoveTypes = moveTypesData ?? [];
  const activeTransportMethods = transportMethodsData ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/platform/move-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/move-templates"] });
      toast({ title: "Template deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete template", variant: "destructive" });
    },
    onSettled: () => setPendingDelete(null),
  });

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (t: EnrichedTemplate) => { setEditing(t); setFormOpen(true); };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
            <ShieldAlert className="h-8 w-8" />
            <p className="text-sm font-medium" data-testid="text-move-templates-forbidden">
              Super Admin access required
            </p>
            <p className="text-xs">Only Super Admins can manage Move Execution Templates.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileStack className="h-5 w-5" />
              Move Execution Templates
            </CardTitle>
            <CardDescription>
              Reusable templates that define how a move should be executed. Multiple templates may exist for the same Move Type.
            </CardDescription>
          </div>
          <Button onClick={openCreate} data-testid="button-add-move-template">
            <Plus className="h-4 w-4 mr-1.5" />
            Create Template
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <FileStack className="h-8 w-8 mb-2" />
              <p className="text-sm">No templates yet. Create the first move execution template.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Move Type</TableHead>
                  <TableHead>Default Transport</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id} data-testid={`row-move-template-${t.id}`}>
                    <TableCell className="font-medium" data-testid={`text-template-name-${t.id}`}>
                      <div>
                        {t.name}
                        {t.description && (
                          <p className="text-xs text-muted-foreground font-normal mt-0.5 max-w-xs truncate">
                            {t.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell data-testid={`text-template-version-${t.id}`}>
                      <Badge variant="outline" className="text-xs tabular-nums">
                        v{t.versionNumber}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-template-move-type-${t.id}`}>
                      {t.moveType ? (
                        <div className="flex items-center gap-1.5">
                          <Route className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm">{t.moveType.name}</span>
                          {t.moveType.category && (
                            <Badge variant="secondary" className="text-xs">{t.moveType.category}</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell data-testid={`text-template-transport-${t.id}`}>
                      {t.defaultTransportationMethod ? (
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm">{t.defaultTransportationMethod.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.isActive ? (
                        <Badge variant="outline" className="text-xs gap-1 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800" data-testid={`badge-template-status-${t.id}`}>
                          <CheckCircle2 className="h-3 w-3" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs gap-1 text-muted-foreground" data-testid={`badge-template-status-${t.id}`}>
                          <XCircle className="h-3 w-3" /> Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setTaskConfigTemplate(t); setTaskConfigOpen(true); }}
                          title="Configure Tasks"
                          data-testid={`button-configure-tasks-${t.id}`}
                        >
                          <ListChecks className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(t)} data-testid={`button-edit-template-${t.id}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setPendingDelete(t)} data-testid={`button-delete-template-${t.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        existing={editing}
        moveTypes={activeMoveTypes}
        transportationMethods={activeTransportMethods}
      />

      <TemplateTasksDialog
        open={taskConfigOpen}
        onOpenChange={setTaskConfigOpen}
        template={taskConfigTemplate}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-move-template">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.name}" (v{pendingDelete?.versionNumber}) will be permanently deleted. Consider marking it Inactive instead to preserve history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-template">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
              data-testid="button-confirm-delete-template"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
