import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";
import { RecruitingNotes } from "./RecruitingNotes";

interface ApplicationNotesDialogProps {
  applicationId: string;
  applicationName: string;
  userRole?: string;
}

export function ApplicationNotesDialog({ applicationId, applicationName, userRole }: ApplicationNotesDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="View notes"
          data-testid={`button-notes-${applicationId}`}
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notes - {applicationName}</DialogTitle>
        </DialogHeader>
        <RecruitingNotes 
          entityType="application" 
          entityId={applicationId}
          title="Application Notes"
          userRole={userRole}
        />
      </DialogContent>
    </Dialog>
  );
}

interface CandidateNotesDialogProps {
  candidateId: string;
  candidateName: string;
  userRole?: string;
}

export function CandidateNotesDialog({ candidateId, candidateName, userRole }: CandidateNotesDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="View notes"
          data-testid={`button-candidate-notes-${candidateId}`}
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notes - {candidateName}</DialogTitle>
        </DialogHeader>
        <RecruitingNotes 
          entityType="candidate" 
          entityId={candidateId}
          title="Candidate Notes"
          userRole={userRole}
        />
      </DialogContent>
    </Dialog>
  );
}

interface RequisitionNotesDialogProps {
  requisitionId: string;
  requisitionTitle: string;
  userRole?: string;
}

export function RequisitionNotesDialog({ requisitionId, requisitionTitle, userRole }: RequisitionNotesDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="View notes"
          data-testid={`button-requisition-notes-${requisitionId}`}
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notes - {requisitionTitle}</DialogTitle>
        </DialogHeader>
        <RecruitingNotes 
          entityType="requisition" 
          entityId={requisitionId}
          title="Requisition Notes"
          userRole={userRole}
        />
      </DialogContent>
    </Dialog>
  );
}
