import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Plus, Loader2, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface AddExceptionDialogProps {
  moveId: string;
  moveNumber: string;
}

const EXCEPTION_TYPES = [
  { value: 'DRIVER_DELAYED', label: 'Driver Delayed' },
  { value: 'VEHICLE_NOT_READY', label: 'Vehicle Not Ready' },
  { value: 'CUSTOMER_UNAVAILABLE', label: 'Customer Unavailable' },
  { value: 'WEATHER', label: 'Weather' },
  { value: 'OTHER', label: 'Other' },
];

const SEVERITY_LEVELS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
];

export function AddExceptionDialog({ moveId, moveNumber }: AddExceptionDialogProps) {
  const [open, setOpen] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [type, setType] = useState<string>('');
  const [severity, setSeverity] = useState<string>('LOW');
  const [publicMessage, setPublicMessage] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createExceptionMutation = useMutation({
    mutationFn: async (data: {
      type: string;
      severity: string;
      public_message?: string;
      internal_notes?: string;
    }) => {
      return apiRequest("POST", `/api/moves/${moveId}/exceptions`, data);
    },
    onSuccess: () => {
      toast({
        title: "Exception Added",
        description: "The exception has been recorded successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/moves', moveId, 'exceptions'] });
      // Only close and clear after confirmed server success
      setOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      // Input is intentionally retained — do NOT reset or close
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to add exception. Your input has been kept — please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setType('');
    setSeverity('LOW');
    setPublicMessage('');
    setInternalNotes('');
    createExceptionMutation.reset();
  };

  /** Returns true when the user has entered meaningful data that would be lost. */
  const isDirty = () =>
    type !== '' ||
    publicMessage.trim().length > 0 ||
    internalNotes.trim().length > 0;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Block close while submission is in flight
      if (createExceptionMutation.isPending) return;
      // Prompt before discarding unsaved input
      if (isDirty()) {
        setShowDiscardConfirm(true);
        return;
      }
    }
    if (!nextOpen) resetForm();
    setOpen(nextOpen);
  };

  const handleConfirmedDiscard = () => {
    setShowDiscardConfirm(false);
    resetForm();
    setOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!type) {
      toast({
        title: "Validation Error",
        description: "Please select an exception type",
        variant: "destructive",
      });
      return;
    }

    createExceptionMutation.mutate({
      type,
      severity,
      public_message: publicMessage || undefined,
      internal_notes: internalNotes || undefined,
    });
  };

  const handleRetry = () => {
    if (!type) return;
    createExceptionMutation.mutate({
      type,
      severity,
      public_message: publicMessage || undefined,
      internal_notes: internalNotes || undefined,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" data-testid="button-add-exception">
            <Plus className="h-4 w-4 mr-1" />
            Add Exception
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Add Exception
            </DialogTitle>
            <DialogDescription>
              Record an exception or delay for Move #{moveNumber}.
              Public messages will be visible to customers.
            </DialogDescription>
          </DialogHeader>

          {createExceptionMutation.isError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between gap-2">
              <span>
                {createExceptionMutation.error?.message || "Submission failed. Your input is preserved."}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={createExceptionMutation.isPending}
                data-testid="button-exception-retry"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="type" required>Exception Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="type" data-testid="select-exception-type">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCEPTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="severity" required>Severity</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger id="severity" data-testid="select-severity">
                    <SelectValue placeholder="Select severity..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_LEVELS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="publicMessage">
                  Customer Message (visible to customer)
                </Label>
                <Textarea
                  id="publicMessage"
                  placeholder="Enter a message that will be shown to the customer..."
                  value={publicMessage}
                  onChange={(e) => setPublicMessage(e.target.value)}
                  className="min-h-[80px]"
                  data-testid="input-public-message"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty if you don't want to notify the customer.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="internalNotes">
                  Internal Notes (not visible to customer)
                </Label>
                <Textarea
                  id="internalNotes"
                  placeholder="Enter internal notes for ops team..."
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  className="min-h-[80px]"
                  data-testid="input-internal-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={createExceptionMutation.isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createExceptionMutation.isPending}
                data-testid="button-submit-exception"
              >
                {createExceptionMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Add Exception
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard exception?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved input. Closing now will permanently discard what you've entered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-exception-discard-cancel">
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmedDiscard}
              data-testid="button-exception-discard-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
