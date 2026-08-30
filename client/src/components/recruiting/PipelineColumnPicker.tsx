import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Columns3, Lock, Loader2 } from "lucide-react";
import { DEFAULT_VISIBLE_COLUMNS, type PipelineColumnKey } from "@shared/schema";

const COLUMN_LABELS: Record<string, { label: string; description: string }> = {
  stage: { label: "Stage", description: "Current workflow stage" },
  readiness: { label: "Readiness", description: "Readiness score and status" },
  owner: { label: "Owner", description: "Assigned recruiter with reassign" },
  tags: { label: "Tags", description: "Application tags" },
  lastActivity: { label: "Last Activity", description: "Progress bar indicator" },
  availability: { label: "Availability", description: "Candidate availability info" },
  sla: { label: "SLA Status", description: "SLA breach indicators" },
  compliance: { label: "Compliance", description: "Compliance status badge" },
  referral: { label: "Referral", description: "Referral source indicator" },
  screeningResponses: { label: "Screening Responses", description: "Screening form response count" },
  lockIndicator: { label: "Lock Indicator", description: "Application lock status" },
  geoEligibility: { label: "Geo Eligibility", description: "Distance and travel radius eligibility" },
  licenseEligibility: { label: "License Eligibility", description: "License class and endorsement requirements match" },
  equipment: { label: "Equipment", description: "Vehicle access and type" },
  workAuth: { label: "Work Authorization", description: "Authorization status and expiration" },
  drivingRecord: { label: "Driving Record", description: "MVR risk summary badge" },
  training: { label: "Training", description: "Training & certification status" },
};

interface PipelinePreferencesResponse {
  visibleColumns: string[];
  requiredColumns: string[];
  effectiveColumns: string[];
}

export function usePipelineColumns() {
  const query = useQuery<PipelinePreferencesResponse>({
    queryKey: ["/api/recruiting/pipeline-preferences"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const effectiveColumns = query.data?.effectiveColumns || [...DEFAULT_VISIBLE_COLUMNS];

  const isColumnVisible = (key: PipelineColumnKey) => effectiveColumns.includes(key);

  return {
    ...query,
    effectiveColumns,
    isColumnVisible,
    requiredColumns: query.data?.requiredColumns || ["stage"],
  };
}

export function PipelineColumnPicker() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [localColumns, setLocalColumns] = useState<string[]>([]);

  const { data: prefs, isLoading } = useQuery<PipelinePreferencesResponse>({
    queryKey: ["/api/recruiting/pipeline-preferences"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (prefs?.effectiveColumns) {
      setLocalColumns([...prefs.effectiveColumns]);
    }
  }, [prefs]);

  const saveMutation = useMutation({
    mutationFn: async (visibleColumns: string[]) => {
      const res = await apiRequest("PUT", "/api/recruiting/pipeline-preferences", { visibleColumns });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/pipeline-preferences"] });
      toast({ title: "Column preferences saved" });
      setOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to save preferences", variant: "destructive" });
    },
  });

  const requiredColumns = prefs?.requiredColumns || ["stage"];

  const toggleColumn = (key: string) => {
    if (requiredColumns.includes(key)) return;
    setLocalColumns((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  };

  const allColumnKeys = Object.keys(COLUMN_LABELS);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="button-column-picker"
        >
          <Columns3 className="h-4 w-4 mr-1" />
          Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" data-testid="dialog-column-picker">
        <DialogHeader>
          <DialogTitle>Customize Pipeline Columns</DialogTitle>
          <DialogDescription>
            Choose which columns are visible in the application pipeline. Required columns cannot be hidden.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3 py-2 max-h-[400px] overflow-y-auto">
            {allColumnKeys.map((key) => {
              const isRequired = requiredColumns.includes(key);
              const isChecked = localColumns.includes(key);
              const info = COLUMN_LABELS[key];
              return (
                <div
                  key={key}
                  className="flex items-start gap-3 p-2 rounded-md hover-elevate"
                  data-testid={`column-option-${key}`}
                >
                  <Checkbox
                    id={`col-${key}`}
                    checked={isChecked}
                    onCheckedChange={() => toggleColumn(key)}
                    disabled={isRequired}
                    data-testid={`checkbox-column-${key}`}
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={`col-${key}`}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <span className="font-medium text-sm">{info.label}</span>
                      {isRequired && (
                        <Badge variant="secondary" className="text-xs gap-1" data-testid={`badge-required-${key}`}>
                          <Lock className="h-2.5 w-2.5" />
                          Required
                        </Badge>
                      )}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {info.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLocalColumns([...DEFAULT_VISIBLE_COLUMNS]);
            }}
            data-testid="button-reset-columns"
          >
            Reset to Default
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(localColumns)}
            disabled={saveMutation.isPending}
            data-testid="button-save-columns"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
