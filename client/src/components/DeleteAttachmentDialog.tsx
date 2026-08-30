import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, FileText } from "lucide-react";

interface DeleteAttachmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  context?: string;
  onConfirm: (reason: string) => void;
  isPending?: boolean;
}

export function DeleteAttachmentDialog({
  open,
  onOpenChange,
  fileName,
  context,
  onConfirm,
  isPending = false,
}: DeleteAttachmentDialogProps) {
  const [reason, setReason] = useState("");
  const reasonValid = reason.trim().length >= 10;

  const handleConfirm = () => {
    if (!reasonValid) return;
    onConfirm(reason.trim());
  };

  const handleOpenChange = (val: boolean) => {
    if (!isPending) {
      if (!val) setReason("");
      onOpenChange(val);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Remove Document
          </DialogTitle>
          <DialogDescription>
            This action will permanently remove the document from the system. An audit record will be created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md bg-muted px-3 py-2.5 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{fileName}</span>
            </div>
            {context && (
              <p className="text-xs text-muted-foreground pl-6">{context}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deletion-reason" className="text-sm">
              Deletion Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="deletion-reason"
              data-testid="input-deletion-reason"
              placeholder="Describe why this document is being removed (min 10 characters)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
              disabled={isPending}
            />
            {reason.length > 0 && !reasonValid && (
              <p className="text-xs text-destructive">
                Reason must be at least 10 characters ({reason.trim().length}/10)
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
            data-testid="button-cancel-delete"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!reasonValid || isPending}
            data-testid="button-confirm-delete"
          >
            {isPending ? "Removing..." : "Remove Document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
