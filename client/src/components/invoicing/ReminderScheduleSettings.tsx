import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, Bell, AlertTriangle, Clock, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface ReminderSchedule {
  id: string;
  name: string;
  dayOffset: number;
  emailSubject: string;
  emailTemplate: string;
  isActive: boolean;
  isEscalation?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ReminderFormData {
  name: string;
  dayOffset: number;
  emailSubject: string;
  emailTemplate: string;
  isActive: boolean;
  isEscalation: boolean;
}

const defaultFormData: ReminderFormData = {
  name: "",
  dayOffset: 0,
  emailSubject: "",
  emailTemplate: "",
  isActive: true,
  isEscalation: false,
};

export function ReminderScheduleSettings() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ReminderSchedule | null>(null);
  const [formData, setFormData] = useState<ReminderFormData>(defaultFormData);

  const { data: schedules, isLoading } = useQuery<ReminderSchedule[]>({
    queryKey: ["/api/corporate/invoicing/reminder-schedules"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: ReminderFormData) => {
      return apiRequest('POST', "/api/corporate/invoicing/reminder-schedules", data);
    },
    onSuccess: () => {
      toast({ title: "Reminder created", description: "New reminder schedule has been added." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/reminder-schedules"] });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ReminderFormData }) => {
      return apiRequest('PUT', `/api/corporate/invoicing/reminder-schedules/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Reminder updated", description: "Reminder schedule has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/reminder-schedules"] });
      closeDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/corporate/invoicing/reminder-schedules/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Reminder deleted", description: "Reminder schedule has been removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/reminder-schedules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', "/api/corporate/invoicing/reminder-schedules/seed-defaults", {});
    },
    onSuccess: () => {
      toast({ title: "Defaults seeded", description: "Default reminder schedules have been created." });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/invoicing/reminder-schedules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openCreateDialog = () => {
    setEditingSchedule(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };

  const openEditDialog = (schedule: ReminderSchedule) => {
    setEditingSchedule(schedule);
    setFormData({
      name: schedule.name,
      dayOffset: schedule.dayOffset,
      emailSubject: schedule.emailSubject,
      emailTemplate: schedule.emailTemplate,
      isActive: schedule.isActive,
      isEscalation: schedule.isEscalation || false,
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingSchedule(null);
    setFormData(defaultFormData);
  };

  const handleSubmit = () => {
    if (editingSchedule) {
      updateMutation.mutate({ id: editingSchedule.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatDayOffset = (offset: number) => {
    if (offset > 0) {
      return `${offset} day${offset !== 1 ? "s" : ""} before due`;
    } else if (offset < 0) {
      return `${Math.abs(offset)} day${Math.abs(offset) !== 1 ? "s" : ""} overdue`;
    } else {
      return "On due date";
    }
  };

  const getOffsetBadgeVariant = (offset: number): "default" | "secondary" | "outline" | "destructive" => {
    if (offset > 0) return "secondary";
    if (offset === 0) return "default";
    return "destructive";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sortedSchedules = [...(schedules || [])].sort((a, b) => b.dayOffset - a.dayOffset);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Payment Reminder Schedules</CardTitle>
              <CardDescription>Configure automated invoice reminder emails</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(!schedules || schedules.length === 0) && (
              <Button
                variant="outline"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                data-testid="button-seed-defaults"
              >
                {seedMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                Load Defaults
              </Button>
            )}
            <Button onClick={openCreateDialog} data-testid="button-add-reminder">
              <Plus className="mr-2 h-4 w-4" />
              Add Reminder
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sortedSchedules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No reminder schedules configured.</p>
            <p className="text-sm">Click "Load Defaults" to create standard reminder schedules.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedSchedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {schedule.name}
                      {schedule.isEscalation && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Escalation
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getOffsetBadgeVariant(schedule.dayOffset)}>
                      <Clock className="mr-1 h-3 w-3" />
                      {formatDayOffset(schedule.dayOffset)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{schedule.emailSubject}</TableCell>
                  <TableCell>
                    <Badge variant={schedule.isActive ? "default" : "outline"}>
                      {schedule.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(schedule)}
                        data-testid={`button-edit-reminder-${schedule.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(schedule.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-reminder-${schedule.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="mt-4 p-3 bg-muted/50 rounded-md">
          <p className="text-sm text-muted-foreground">
            <strong>Template Variables:</strong> Use these placeholders in email templates:
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline">{"{customer_name}"}</Badge>
            <Badge variant="outline">{"{invoice_number}"}</Badge>
            <Badge variant="outline">{"{amount}"}</Badge>
            <Badge variant="outline">{"{due_date}"}</Badge>
            <Badge variant="outline">{"{pay_link}"}</Badge>
          </div>
        </div>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? "Edit Reminder Schedule" : "Create Reminder Schedule"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., 3 Days Before Due"
                data-testid="input-reminder-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dayOffset">Day Offset</Label>
              <Input
                id="dayOffset"
                type="number"
                value={formData.dayOffset}
                onChange={(e) => setFormData({ ...formData, dayOffset: parseInt(e.target.value) || 0 })}
                data-testid="input-day-offset"
              />
              <p className="text-xs text-muted-foreground">
                Positive = days before due, 0 = on due date, negative = days after due
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="emailSubject">Email Subject</Label>
              <Input
                id="emailSubject"
                value={formData.emailSubject}
                onChange={(e) => setFormData({ ...formData, emailSubject: e.target.value })}
                placeholder="Invoice #{invoice_number} Due Soon"
                data-testid="input-email-subject"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="emailTemplate">Email Template</Label>
              <Textarea
                id="emailTemplate"
                value={formData.emailTemplate}
                onChange={(e) => setFormData({ ...formData, emailTemplate: e.target.value })}
                placeholder="Your invoice #{invoice_number} for {amount} is due on {due_date}..."
                rows={4}
                data-testid="input-email-template"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="isActive">Active</Label>
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                data-testid="switch-reminder-active"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="isEscalation">Escalation</Label>
                <p className="text-xs text-muted-foreground">Mark as escalation for internal alerts</p>
              </div>
              <Switch
                id="isEscalation"
                checked={formData.isEscalation}
                onCheckedChange={(checked) => setFormData({ ...formData, isEscalation: checked })}
                data-testid="switch-reminder-escalation"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-reminder">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-reminder"
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
