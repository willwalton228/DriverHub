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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus, Edit, Trash2, Loader2, ListChecks, ShieldAlert, CheckCircle2, XCircle, Star,
} from "lucide-react";
import type { MoveTask } from "@shared/schema";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  isActive: z.boolean().default(true),
  defaultRequired: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});
type FormValues = z.infer<typeof formSchema>;

interface FormDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing?: MoveTask | null;
}

function TaskFormDialog({ open, onOpenChange, existing }: FormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!existing;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: existing?.name ?? "",
      description: existing?.description ?? "",
      category: existing?.category ?? "",
      isActive: existing?.isActive ?? true,
      defaultRequired: existing?.defaultRequired ?? false,
      sortOrder: existing?.sortOrder ?? 0,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: existing?.name ?? "",
        description: existing?.description ?? "",
        category: existing?.category ?? "",
        isActive: existing?.isActive ?? true,
        defaultRequired: existing?.defaultRequired ?? false,
        sortOrder: existing?.sortOrder ?? 0,
      });
    }
  }, [open, existing?.id]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = { ...values, category: values.category || null, description: values.description || null };
      if (isEdit && existing) return apiRequest("PATCH", `/api/platform/move-tasks/${existing.id}`, payload);
      return apiRequest("POST", "/api/platform/move-tasks", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/move-tasks"] });
      toast({ title: isEdit ? "Task updated" : "Task created", description: form.getValues("name") });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save task", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-move-task-form">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Move Task" : "Create Move Task"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this task in the Task Library." : "Add a reusable task to the Task Library."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel required>Task Name</FormLabel>
                <FormControl><Input {...field} placeholder="e.g. Pre-Trip Inspection" data-testid="input-task-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Safety" data-testid="input-task-category" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="sortOrder" render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl><Input {...field} type="number" data-testid="input-task-sort-order" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="What this task involves…" rows={3} data-testid="textarea-task-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="defaultRequired" render={({ field }) => (
                <FormItem className="flex flex-row items-end justify-between gap-3 rounded-md border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium leading-none">Required by default</FormLabel>
                    <p className="text-xs text-muted-foreground mt-1">When added to a template</p>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-task-default-required" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex flex-row items-end justify-between gap-3 rounded-md border p-3">
                  <FormLabel className="text-sm font-medium leading-none">Active</FormLabel>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-task-active" /></FormControl>
                </FormItem>
              )} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-task-cancel">Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-task-save">
                {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</> : isEdit ? "Save Changes" : "Create Task"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function MoveTasks() {
  const { isSuperAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MoveTask | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MoveTask | null>(null);

  const { data, isLoading } = useQuery<MoveTask[]>({
    queryKey: ["/api/platform/move-tasks"],
    enabled: isSuperAdmin,
  });
  const tasks = data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/platform/move-tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/move-tasks"] });
      toast({ title: "Task deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    onSettled: () => setPendingDelete(null),
  });

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (t: MoveTask) => { setEditing(t); setFormOpen(true); };

  if (authLoading) return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
    </div>
  );

  if (!isSuperAdmin) return (
    <div className="p-6">
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
          <ShieldAlert className="h-8 w-8" />
          <p className="text-sm font-medium" data-testid="text-move-tasks-forbidden">Super Admin access required</p>
          <p className="text-xs">Only Super Admins can manage the Move Task Library.</p>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Move Task Library
            </CardTitle>
            <CardDescription>
              Reusable atomic tasks that can be assigned to Move Templates. Editing a task here does not affect templates already using it.
            </CardDescription>
          </div>
          <Button onClick={openCreate} data-testid="button-add-move-task">
            <Plus className="h-4 w-4 mr-1.5" />
            Create Task
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading tasks…
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <ListChecks className="h-8 w-8 mb-2" />
              <p className="text-sm">No tasks yet. Create the first Move Task.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((t) => (
                  <TableRow key={t.id} data-testid={`row-move-task-${t.id}`}>
                    <TableCell className="font-medium" data-testid={`text-task-name-${t.id}`}>
                      <div>
                        {t.name}
                        {t.description && (
                          <p className="text-xs text-muted-foreground font-normal mt-0.5 max-w-xs truncate">{t.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {t.category
                        ? <Badge variant="secondary" className="text-xs">{t.category}</Badge>
                        : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell>
                      {t.defaultRequired
                        ? (
                          <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                            <Star className="h-3 w-3 fill-current" />
                            Required
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Optional</span>
                        )}
                    </TableCell>
                    <TableCell>
                      {t.isActive
                        ? <Badge variant="outline" className="text-xs gap-1 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800"><CheckCircle2 className="h-3 w-3" />Active</Badge>
                        : <Badge variant="outline" className="text-xs gap-1 text-muted-foreground"><XCircle className="h-3 w-3" />Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(t)} data-testid={`button-edit-task-${t.id}`}><Edit className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setPendingDelete(t)} data-testid={`button-delete-task-${t.id}`}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TaskFormDialog open={formOpen} onOpenChange={setFormOpen} existing={editing} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-move-task">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.name}" will be permanently deleted from the Task Library. Templates already using this task will have the assignment removed. Consider marking it Inactive instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-task">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)} data-testid="button-confirm-delete-task">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
