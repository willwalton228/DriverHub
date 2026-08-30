import { useState } from "react";
import { formatDate } from "@/lib/dateFormat";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  CalendarDays,
  Building2,
} from "lucide-react";

interface TrainingRecord {
  id: string;
  candidateId: string;
  trainingType: string;
  customLabel: string | null;
  completedDate: string;
  expirationDate: string | null;
  provider: string | null;
  certificateUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const TRAINING_TYPE_LABELS: Record<string, string> = {
  defensive_driving: "Defensive Driving",
  safety_orientation: "Safety Orientation",
  customer_handoff: "Customer Handoff Training",
  hazmat: "Hazmat Certification",
  first_aid_cpr: "First Aid / CPR",
  dot_compliance: "DOT Compliance",
  vehicle_inspection: "Vehicle Inspection",
  load_securement: "Load Securement",
  cold_chain: "Cold Chain Handling",
  other: "Other",
};

const TRAINING_TYPES = Object.keys(TRAINING_TYPE_LABELS);

const trainingFormSchema = z.object({
  trainingType: z.string().min(1, "Training type is required"),
  customLabel: z.string().optional(),
  completedDate: z.string().min(1, "Completed date is required"),
  expirationDate: z.string().optional(),
  provider: z.string().optional(),
  certificateUrl: z.string().optional(),
  notes: z.string().optional(),
});

type TrainingFormData = z.infer<typeof trainingFormSchema>;

function getExpirationStatus(expirationDate: string | null): {
  status: "valid" | "expiring_soon" | "expired" | "no_expiration";
  daysLeft: number | null;
} {
  if (!expirationDate) return { status: "no_expiration", daysLeft: null };
  const exp = new Date(expirationDate);
  const now = new Date();
  const daysLeft = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (daysLeft <= 30) return { status: "expiring_soon", daysLeft };
  return { status: "valid", daysLeft };
}

function ExpirationBadge({ expirationDate }: { expirationDate: string | null }) {
  const { status, daysLeft } = getExpirationStatus(expirationDate);

  if (status === "no_expiration") {
    return (
      <Badge variant="outline" className="text-xs" data-testid="badge-training-no-expiry">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        No Expiry
      </Badge>
    );
  }

  if (status === "expired") {
    return (
      <Badge variant="destructive" className="text-xs" data-testid="badge-training-expired">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Expired {Math.abs(daysLeft!)}d ago
      </Badge>
    );
  }

  if (status === "expiring_soon") {
    return (
      <Badge variant="outline" className="text-xs border-yellow-500 dark:border-yellow-400 text-yellow-700 dark:text-yellow-300" data-testid="badge-training-expiring">
        <Clock className="h-3 w-3 mr-1" />
        Expires in {daysLeft}d
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs" data-testid="badge-training-valid">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      Valid ({daysLeft}d left)
    </Badge>
  );
}

export function TrainingStatusBadge({ candidateId }: { candidateId: string }) {
  const { data: trainings, isLoading } = useQuery<TrainingRecord[]>({
    queryKey: ["/api/recruiting/candidates", candidateId, "trainings"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/candidates/${candidateId}/trainings`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  if (isLoading || !trainings || trainings.length === 0) return null;

  const hasExpired = trainings.some((t) => getExpirationStatus(t.expirationDate).status === "expired");
  const hasExpiring = trainings.some((t) => getExpirationStatus(t.expirationDate).status === "expiring_soon");

  if (hasExpired) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="text-xs" data-testid={`badge-training-status-${candidateId}`}>
            <GraduationCap className="h-3 w-3 mr-1" />
            Training Expired
          </Badge>
        </TooltipTrigger>
        <TooltipContent>One or more training certifications have expired</TooltipContent>
      </Tooltip>
    );
  }

  if (hasExpiring) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-xs border-yellow-500 dark:border-yellow-400 text-yellow-700 dark:text-yellow-300" data-testid={`badge-training-status-${candidateId}`}>
            <GraduationCap className="h-3 w-3 mr-1" />
            Training Expiring
          </Badge>
        </TooltipTrigger>
        <TooltipContent>One or more trainings expiring within 30 days</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="text-xs" data-testid={`badge-training-status-${candidateId}`}>
          <GraduationCap className="h-3 w-3 mr-1" />
          {trainings.length} Training{trainings.length !== 1 ? "s" : ""}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{trainings.length} training record{trainings.length !== 1 ? "s" : ""} on file</TooltipContent>
    </Tooltip>
  );
}

interface CandidateTrainingRecordsProps {
  candidateId: string;
  candidateName: string;
  readOnly?: boolean;
}

export function CandidateTrainingRecords({
  candidateId,
  candidateName,
  readOnly = false,
}: CandidateTrainingRecordsProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TrainingRecord | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: trainings, isLoading } = useQuery<TrainingRecord[]>({
    queryKey: ["/api/recruiting/candidates", candidateId, "trainings"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/candidates/${candidateId}/trainings`);
      if (!res.ok) throw new Error("Failed to fetch trainings");
      return res.json();
    },
  });

  const form = useForm<TrainingFormData>({
    resolver: zodResolver(trainingFormSchema),
    defaultValues: {
      trainingType: "",
      customLabel: "",
      completedDate: "",
      expirationDate: "",
      provider: "",
      certificateUrl: "",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TrainingFormData) => {
      return apiRequest("POST", `/api/recruiting/candidates/${candidateId}/trainings`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "trainings"] });
      toast({ title: "Training record added" });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add training", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TrainingFormData }) => {
      return apiRequest("PATCH", `/api/recruiting/candidates/${candidateId}/trainings/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "trainings"] });
      toast({ title: "Training record updated" });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update training", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/recruiting/candidates/${candidateId}/trainings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", candidateId, "trainings"] });
      toast({ title: "Training record deleted" });
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete training", variant: "destructive" });
    },
  });

  function openAddDialog() {
    setEditingRecord(null);
    form.reset({
      trainingType: "",
      customLabel: "",
      completedDate: "",
      expirationDate: "",
      provider: "",
      certificateUrl: "",
      notes: "",
    });
    setDialogOpen(true);
  }

  function openEditDialog(record: TrainingRecord) {
    setEditingRecord(record);
    form.reset({
      trainingType: record.trainingType,
      customLabel: record.customLabel || "",
      completedDate: record.completedDate,
      expirationDate: record.expirationDate || "",
      provider: record.provider || "",
      certificateUrl: record.certificateUrl || "",
      notes: record.notes || "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingRecord(null);
    form.reset();
  }

  function onSubmit(data: TrainingFormData) {
    const payload = {
      ...data,
      expirationDate: data.expirationDate || undefined,
      provider: data.provider || undefined,
      certificateUrl: data.certificateUrl || undefined,
      notes: data.notes || undefined,
      customLabel: data.customLabel || undefined,
    };
    if (editingRecord) {
      updateMutation.mutate({ id: editingRecord.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const hasExpired = trainings?.some((t) => getExpirationStatus(t.expirationDate).status === "expired");
  const hasExpiring = trainings?.some((t) => getExpirationStatus(t.expirationDate).status === "expiring_soon");
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Card data-testid="card-training-records">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-5 w-5" />
            Training & Certifications
            {trainings && trainings.length > 0 && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-training-count">
                {trainings.length}
              </Badge>
            )}
            {hasExpired && (
              <Badge variant="destructive" className="text-xs" data-testid="badge-training-alert-expired">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Expired
              </Badge>
            )}
            {!hasExpired && hasExpiring && (
              <Badge variant="outline" className="text-xs border-yellow-500 dark:border-yellow-400 text-yellow-700 dark:text-yellow-300" data-testid="badge-training-alert-expiring">
                <Clock className="h-3 w-3 mr-1" />
                Expiring Soon
              </Badge>
            )}
          </CardTitle>
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={openAddDialog} data-testid="button-add-training">
              <Plus className="h-4 w-4 mr-1" />
              Add Training
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !trainings || trainings.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground" data-testid="text-no-trainings">
              <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No training records yet</p>
              {!readOnly && (
                <p className="text-xs mt-1">Add training certifications to track compliance</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {trainings.map((record) => {
                const typeLabel = TRAINING_TYPE_LABELS[record.trainingType] || record.trainingType;
                const displayLabel = record.trainingType === "other" && record.customLabel
                  ? record.customLabel
                  : typeLabel;

                return (
                  <div
                    key={record.id}
                    className="flex items-start justify-between gap-3 p-3 rounded-md border"
                    data-testid={`training-record-${record.id}`}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm" data-testid={`text-training-type-${record.id}`}>
                          {displayLabel}
                        </span>
                        <ExpirationBadge expirationDate={record.expirationDate} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          Completed: {new Date(record.completedDate).toLocaleDateString()}
                        </span>
                        {record.expirationDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Expires: {formatDate(record.expirationDate)}
                          </span>
                        )}
                        {record.provider && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {record.provider}
                          </span>
                        )}
                      </div>
                      {record.notes && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{record.notes}</p>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(record)}
                              data-testid={`button-edit-training-${record.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit training record</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteConfirmId(record.id)}
                              data-testid={`button-delete-training-${record.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete training record</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-training-dialog-title">
              {editingRecord ? "Edit Training Record" : "Add Training Record"}
            </DialogTitle>
            <DialogDescription>
              {editingRecord ? "Update the training details" : `Record training for ${candidateName}`}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="trainingType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Training Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-training-type">
                          <SelectValue placeholder="Select training type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRAINING_TYPES.map((type) => (
                          <SelectItem key={type} value={type} data-testid={`option-training-${type}`}>
                            {TRAINING_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("trainingType") === "other" && (
                <FormField
                  control={form.control}
                  name="customLabel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Training Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Forklift Certification" data-testid="input-training-custom-label" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="completedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Completed Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-training-completed-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expirationDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiration Date (optional)</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-training-expiration-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Training provider name" data-testid="input-training-provider" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Additional details..." className="resize-none" data-testid="input-training-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog} data-testid="button-training-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending} data-testid="button-training-save">
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingRecord ? "Update" : "Add Training"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Training Record</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The training record will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} data-testid="button-delete-training-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-training-confirm"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface TrainingDialogButtonProps {
  candidateId: string;
  candidateName: string;
}

export function TrainingDialogButton({ candidateId, candidateName }: TrainingDialogButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            data-testid={`button-training-dialog-${candidateId}`}
          >
            <GraduationCap className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Training & Certifications</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Training & Certifications
            </DialogTitle>
            <DialogDescription>{candidateName}</DialogDescription>
          </DialogHeader>
          <CandidateTrainingRecords
            candidateId={candidateId}
            candidateName={candidateName}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}