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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertOctagon, Loader2, ShieldAlert } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ReportIncidentDialogProps {
  moveId: string;
  moveNumber: string;
  trigger?: React.ReactNode;
}

const INCIDENT_TYPES = [
  { value: 'DAMAGE', label: 'Damage' },
  { value: 'ACCIDENT', label: 'Accident' },
  { value: 'INJURY', label: 'Injury' },
  { value: 'THEFT', label: 'Theft' },
  { value: 'CITATION', label: 'Citation' },
  { value: 'OTHER', label: 'Other' },
];

const SEVERITY_LEVELS = [
  { value: 'LOW', label: 'Low', color: 'text-green-600' },
  { value: 'MEDIUM', label: 'Medium', color: 'text-amber-600' },
  { value: 'HIGH', label: 'High', color: 'text-red-600' },
];

export function ReportIncidentDialog({ moveId, moveNumber, trigger }: ReportIncidentDialogProps) {
  const [open, setOpen] = useState(false);
  const [incidentType, setIncidentType] = useState<string>('');
  const [severity, setSeverity] = useState<string>('MEDIUM');
  const [occurredAt, setOccurredAt] = useState<string>(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [description, setDescription] = useState('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createIncidentMutation = useMutation({
    mutationFn: async (data: {
      incident_type: string;
      severity: string;
      occurred_at: string;
      description: string;
    }) => {
      return apiRequest('POST', `/api/moves/${moveId}/incidents`, data);
    },
    onSuccess: () => {
      toast({
        title: "Incident Reported",
        description: "The incident has been recorded successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/moves', moveId, 'incidents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trips', moveId] });
      setOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to report incident",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setIncidentType('');
    setSeverity('MEDIUM');
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setOccurredAt(now.toISOString().slice(0, 16));
    setDescription('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!incidentType) {
      toast({
        title: "Validation Error",
        description: "Please select an incident type",
        variant: "destructive",
      });
      return;
    }

    if (!occurredAt) {
      toast({
        title: "Validation Error",
        description: "Please specify when the incident occurred",
        variant: "destructive",
      });
      return;
    }

    if (!description.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a description of the incident",
        variant: "destructive",
      });
      return;
    }

    createIncidentMutation.mutate({
      incident_type: incidentType,
      severity,
      occurred_at: new Date(occurredAt).toISOString(),
      description: description.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" data-testid="button-report-incident">
            <ShieldAlert className="h-4 w-4 mr-1" />
            Report Incident
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-red-500" />
            Report Incident
          </DialogTitle>
          <DialogDescription>
            Record an incident (damage, accident, injury, etc.) for Move #{moveNumber}.
            This can be linked to a claim later if needed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="incident-type" required>Incident Type</Label>
              <Select value={incidentType} onValueChange={setIncidentType}>
                <SelectTrigger id="incident-type" data-testid="select-incident-type">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_TYPES.map((t) => (
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
                <SelectTrigger id="severity" data-testid="select-incident-severity">
                  <SelectValue placeholder="Select severity..." />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_LEVELS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className={s.color}>{s.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="occurred-at" required>When did it occur?</Label>
              <Input
                id="occurred-at"
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                data-testid="input-occurred-at"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description" required>Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what happened, where, and any relevant details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[100px]"
                data-testid="input-incident-description"
              />
              <p className="text-xs text-muted-foreground">
                Include location, parties involved, and immediate actions taken.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              data-testid="button-cancel-incident"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="destructive"
              disabled={createIncidentMutation.isPending}
              data-testid="button-submit-incident"
            >
              {createIncidentMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Report Incident
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
