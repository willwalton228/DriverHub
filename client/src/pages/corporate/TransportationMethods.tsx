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
import { Plus, Edit, Trash2, Loader2, Truck, ShieldAlert, GripVertical, CheckCircle2, XCircle } from "lucide-react";
import type { TransportationMethod } from "@shared/schema";

const methodFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
type MethodFormValues = z.infer<typeof methodFormSchema>;

interface MethodFormDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing?: TransportationMethod | null;
}

function MethodFormDialog({ open, onOpenChange, existing }: MethodFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!existing;

  const form = useForm<MethodFormValues>({
    resolver: zodResolver(methodFormSchema),
    defaultValues: {
      name: existing?.name ?? "",
      description: existing?.description ?? "",
      sortOrder: existing?.sortOrder ?? 0,
      isActive: existing?.isActive ?? true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: existing?.name ?? "",
        description: existing?.description ?? "",
        sortOrder: existing?.sortOrder ?? 0,
        isActive: existing?.isActive ?? true,
      });
    }
  }, [open, existing?.id]);

  const mutation = useMutation({
    mutationFn: async (values: MethodFormValues) => {
      if (isEdit && existing) {
        return apiRequest("PATCH", `/api/platform/transportation-methods/${existing.id}`, values);
      }
      return apiRequest("POST", "/api/platform/transportation-methods", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/transportation-methods"] });
      toast({
        title: isEdit ? "Transportation method updated" : "Transportation method added",
        description: `${form.getValues("name")} has been ${isEdit ? "updated" : "added"}.`,
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save transportation method", variant: "destructive" });
    },
  });

  const onSubmit = (values: MethodFormValues) => mutation.mutate(values);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-transportation-method-form">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Transportation Method" : "Add Transportation Method"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this transportation method's details."
              : "Create a new transportation method for the platform-wide master list."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel required>Name</FormLabel>
                <FormControl><Input {...field} placeholder="e.g. Rideshare Standard" data-testid="input-method-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="What this transportation method covers…" rows={3} data-testid="textarea-method-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="sortOrder" render={({ field }) => (
              <FormItem>
                <FormLabel>Sort Order</FormLabel>
                <FormControl><Input {...field} type="number" data-testid="input-method-sort-order" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between gap-3 rounded-md border p-3">
                <div className="space-y-0.5">
                  <FormLabel className="text-sm font-medium">Active</FormLabel>
                  <p className="text-xs text-muted-foreground">Inactive methods cannot be selected in Move Type configuration.</p>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-method-active" />
                </FormControl>
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-method-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-method-save">
                {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</> : isEdit ? "Save Changes" : "Add Method"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function TransportationMethods() {
  const { isSuperAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TransportationMethod | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TransportationMethod | null>(null);

  const { data, isLoading } = useQuery<TransportationMethod[]>({
    queryKey: ["/api/platform/transportation-methods"],
    enabled: isSuperAdmin,
  });
  const methods = data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/platform/transportation-methods/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/transportation-methods"] });
      toast({ title: "Transportation method deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete transportation method", variant: "destructive" });
    },
    onSettled: () => setPendingDelete(null),
  });

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (m: TransportationMethod) => { setEditing(m); setFormOpen(true); };

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
            <p className="text-sm font-medium" data-testid="text-transportation-methods-forbidden">
              Super Admin access required
            </p>
            <p className="text-xs">Only Super Admins can manage the Transportation Method master list.</p>
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
              <Truck className="h-5 w-5" />
              Transportation Methods
            </CardTitle>
            <CardDescription>
              The platform-wide master list of transportation methods available for Move Type configuration.
            </CardDescription>
          </div>
          <Button onClick={openCreate} data-testid="button-add-transportation-method">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Method
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading transportation methods…
            </div>
          ) : methods.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <Truck className="h-8 w-8 mb-2" />
              <p className="text-sm">No transportation methods yet. Add the first one for the platform.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {methods
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                  .map((m) => (
                    <TableRow key={m.id} data-testid={`row-transportation-method-${m.id}`}>
                      <TableCell>
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                      <TableCell className="font-medium" data-testid={`text-method-name-${m.id}`}>
                        {m.name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-md truncate" data-testid={`text-method-description-${m.id}`}>
                        {m.description || "—"}
                      </TableCell>
                      <TableCell>
                        {m.isActive ? (
                          <Badge variant="outline" className="text-xs gap-1 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800" data-testid={`badge-method-status-${m.id}`}>
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs gap-1 text-muted-foreground" data-testid={`badge-method-status-${m.id}`}>
                            <XCircle className="h-3 w-3" /> Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(m)} data-testid={`button-edit-method-${m.id}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setPendingDelete(m)} data-testid={`button-delete-method-${m.id}`}>
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

      <MethodFormDialog open={formOpen} onOpenChange={setFormOpen} existing={editing} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-transportation-method">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transportation method?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.name}" will be permanently removed from the master list. If it is already referenced
              elsewhere, consider marking it Inactive instead of deleting it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-method">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
              data-testid="button-confirm-delete-method"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
