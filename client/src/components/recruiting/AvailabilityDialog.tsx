import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Plus, X, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TimeWindow {
  start: string;
  end: string;
}

interface AvailabilityData {
  id?: string;
  candidateId: string;
  daysOfWeek: string[];
  timeWindows: TimeWindow[];
  preferredShiftType: "on_demand" | "shift" | "both";
  maxHoursPerWeek?: number;
  minHoursPerWeek?: number;
  preferredStartTime?: string;
  notes?: string;
}

interface AvailabilityDialogProps {
  candidateId: string;
  candidateName: string;
}

const DAYS_OF_WEEK = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

export function AvailabilityDialog({ candidateId, candidateName }: AvailabilityDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: availability, isLoading } = useQuery<AvailabilityData | null>({
    queryKey: ['/api/recruiting/candidates', candidateId, 'availability'],
    enabled: open,
  });

  const [formData, setFormData] = useState<{
    daysOfWeek: string[];
    timeWindows: TimeWindow[];
    preferredShiftType: "on_demand" | "shift" | "both";
    maxHoursPerWeek: string;
    minHoursPerWeek: string;
    preferredStartTime: string;
    notes: string;
  }>({
    daysOfWeek: [],
    timeWindows: [{ start: "06:00", end: "14:00" }],
    preferredShiftType: "both",
    maxHoursPerWeek: "",
    minHoursPerWeek: "",
    preferredStartTime: "",
    notes: "",
  });

  const [isEditing, setIsEditing] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Sync form state when availability data loads
  useEffect(() => {
    if (open && !isLoading && !hasInitialized) {
      resetForm(availability);
      setIsEditing(!availability);
      setHasInitialized(true);
    }
  }, [open, isLoading, availability, hasInitialized]);

  // Reset initialization state when dialog closes
  useEffect(() => {
    if (!open) {
      setHasInitialized(false);
    }
  }, [open]);

  const resetForm = (data?: AvailabilityData | null) => {
    if (data) {
      setFormData({
        daysOfWeek: data.daysOfWeek || [],
        timeWindows: data.timeWindows?.length ? data.timeWindows : [{ start: "06:00", end: "14:00" }],
        preferredShiftType: data.preferredShiftType || "both",
        maxHoursPerWeek: data.maxHoursPerWeek?.toString() || "",
        minHoursPerWeek: data.minHoursPerWeek?.toString() || "",
        preferredStartTime: data.preferredStartTime || "",
        notes: data.notes || "",
      });
    } else {
      setFormData({
        daysOfWeek: [],
        timeWindows: [{ start: "06:00", end: "14:00" }],
        preferredShiftType: "both",
        maxHoursPerWeek: "",
        minHoursPerWeek: "",
        preferredStartTime: "",
        notes: "",
      });
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("PUT", `/api/recruiting/candidates/${candidateId}/availability`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recruiting/candidates', candidateId, 'availability'] });
      toast({ title: "Availability saved successfully" });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save availability", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const payload: Record<string, unknown> = {
      daysOfWeek: formData.daysOfWeek,
      timeWindows: formData.timeWindows.filter(tw => tw.start && tw.end),
      preferredShiftType: formData.preferredShiftType,
    };
    if (formData.maxHoursPerWeek) {
      payload.maxHoursPerWeek = parseInt(formData.maxHoursPerWeek);
    }
    if (formData.minHoursPerWeek) {
      payload.minHoursPerWeek = parseInt(formData.minHoursPerWeek);
    }
    if (formData.preferredStartTime) {
      payload.preferredStartTime = formData.preferredStartTime;
    }
    if (formData.notes) {
      payload.notes = formData.notes;
    }
    saveMutation.mutate(payload);
  };

  const handleDayToggle = (day: string) => {
    setFormData(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter(d => d !== day)
        : [...prev.daysOfWeek, day],
    }));
  };

  const addTimeWindow = () => {
    setFormData(prev => ({
      ...prev,
      timeWindows: [...prev.timeWindows, { start: "", end: "" }],
    }));
  };

  const removeTimeWindow = (index: number) => {
    setFormData(prev => ({
      ...prev,
      timeWindows: prev.timeWindows.filter((_, i) => i !== index),
    }));
  };

  const updateTimeWindow = (index: number, field: "start" | "end", value: string) => {
    setFormData(prev => ({
      ...prev,
      timeWindows: prev.timeWindows.map((tw, i) =>
        i === index ? { ...tw, [field]: value } : tw
      ),
    }));
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="View availability"
          data-testid={`button-availability-${candidateId}`}
        >
          <Clock className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-availability">
        <DialogHeader>
          <DialogTitle>Availability & Shift Preferences - {candidateName}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : isEditing ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Available Days</Label>
              <div className="grid grid-cols-2 gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <div key={day.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`day-${day.value}`}
                      checked={formData.daysOfWeek.includes(day.value)}
                      onCheckedChange={() => handleDayToggle(day.value)}
                      data-testid={`checkbox-day-${day.value}`}
                    />
                    <Label htmlFor={`day-${day.value}`} className="text-sm cursor-pointer">
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Time Windows</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addTimeWindow}
                  data-testid="button-add-time-window"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {formData.timeWindows.map((tw, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={tw.start}
                      onChange={(e) => updateTimeWindow(index, "start", e.target.value)}
                      className="w-32"
                      data-testid={`input-time-start-${index}`}
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={tw.end}
                      onChange={(e) => updateTimeWindow(index, "end", e.target.value)}
                      className="w-32"
                      data-testid={`input-time-end-${index}`}
                    />
                    {formData.timeWindows.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTimeWindow(index)}
                        data-testid={`button-remove-time-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shiftType" className="text-sm font-medium">Preferred Work Type</Label>
              <Select
                value={formData.preferredShiftType}
                onValueChange={(value: "on_demand" | "shift" | "both") =>
                  setFormData(prev => ({ ...prev, preferredShiftType: value }))
                }
              >
                <SelectTrigger id="shiftType" data-testid="select-shift-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shift">Shift-Based</SelectItem>
                  <SelectItem value="on_demand">On-Demand</SelectItem>
                  <SelectItem value="both">Either (Flexible)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minHours" className="text-sm font-medium">Min Hours/Week</Label>
                <Input
                  id="minHours"
                  type="number"
                  min="0"
                  max="168"
                  value={formData.minHoursPerWeek}
                  onChange={(e) => setFormData(prev => ({ ...prev, minHoursPerWeek: e.target.value }))}
                  placeholder="e.g., 20"
                  data-testid="input-min-hours"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxHours" className="text-sm font-medium">Max Hours/Week</Label>
                <Input
                  id="maxHours"
                  type="number"
                  min="0"
                  max="168"
                  value={formData.maxHoursPerWeek}
                  onChange={(e) => setFormData(prev => ({ ...prev, maxHoursPerWeek: e.target.value }))}
                  placeholder="e.g., 40"
                  data-testid="input-max-hours"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferredStart" className="text-sm font-medium">Preferred Start Time</Label>
              <Input
                id="preferredStart"
                type="time"
                value={formData.preferredStartTime}
                onChange={(e) => setFormData(prev => ({ ...prev, preferredStartTime: e.target.value }))}
                data-testid="input-preferred-start"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-sm font-medium">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Any additional availability notes..."
                rows={3}
                data-testid="input-availability-notes"
              />
            </div>
          </div>
        ) : availability ? (
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Available Days</Label>
              <p className="mt-1">
                {availability.daysOfWeek?.length
                  ? availability.daysOfWeek.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")
                  : "Not specified"}
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground">Time Windows</Label>
              <div className="mt-1">
                {availability.timeWindows?.length ? (
                  availability.timeWindows.map((tw, i) => (
                    <p key={i}>{tw.start} - {tw.end}</p>
                  ))
                ) : (
                  <p>Not specified</p>
                )}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground">Preferred Shift</Label>
              <p className="mt-1 capitalize">{availability.preferredShiftType || "Not specified"}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Min Hours/Week</Label>
                <p className="mt-1">{availability.minHoursPerWeek ?? "Not specified"}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Max Hours/Week</Label>
                <p className="mt-1">{availability.maxHoursPerWeek ?? "Not specified"}</p>
              </div>
            </div>

            {availability.preferredStartTime && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Preferred Start Time</Label>
                <p className="mt-1">{availability.preferredStartTime}</p>
              </div>
            )}

            {availability.notes && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Notes</Label>
                <p className="mt-1 text-sm">{availability.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No availability information recorded yet.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setIsEditing(true)}
              data-testid="button-add-availability"
            >
              Add Availability
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  resetForm(availability);
                  setIsEditing(false);
                }}
                disabled={saveMutation.isPending}
                data-testid="button-cancel-availability"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save-availability"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </>
          ) : availability ? (
            <Button
              variant="outline"
              onClick={() => {
                resetForm(availability);
                setIsEditing(true);
              }}
              data-testid="button-edit-availability"
            >
              Edit
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
