import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Edit, Loader2, Building2, GripVertical, CheckCircle2, XCircle, Settings, Trash2, Info, Route, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { US_TIMEZONES, tzLabel } from "@/lib/timezoneUtils";
import type { AccountDepartment } from "@shared/schema";

const DEPT_DAYS_OF_WEEK = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
] as const;

interface DeptDayHours {
  enabled: boolean;
  start: string;
  end: string;
}
type DeptBusinessHours = Record<string, DeptDayHours>;

interface DeptHoliday {
  name: string;
  date: string;
  isPaid?: boolean;
}

interface DepartmentSettingsResponse {
  raw: AccountDepartment & {
    timezone: string | null;
    businessHours: string | null;
    useAccountHolidayCalendar: boolean;
    customHolidays: DeptHoliday[] | null;
    costCenter: string | null;
    glCode: string | null;
    defaultPromiseModel: string | null;
    spendApprovalThreshold: string | null;
  };
  effective: {
    timezone: { value: string; inherited: boolean };
    businessHours: { value: DeptBusinessHours; inherited: boolean };
    holidayCalendar: { source: "account" | "custom"; holidays: DeptHoliday[] };
    costCenter: string | null;
    glCode: string | null;
  };
}

const departmentFormSchema = z.object({
  name: z.string().min(1, "Department name is required"),
  code: z.string().optional(),
  description: z.string().optional(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
type DepartmentFormValues = z.infer<typeof departmentFormSchema>;

interface DepartmentFormDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accountId: string;
  existing?: AccountDepartment | null;
  onSuccess: () => void;
}

function DepartmentFormDialog({ open, onOpenChange, accountId, existing, onSuccess }: DepartmentFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!existing;

  const form = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: {
      name: existing?.name ?? "",
      code: existing?.code ?? "",
      description: existing?.description ?? "",
      sortOrder: existing?.sortOrder ?? 0,
      isActive: existing?.isActive ?? true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: existing?.name ?? "",
        code: existing?.code ?? "",
        description: existing?.description ?? "",
        sortOrder: existing?.sortOrder ?? 0,
        isActive: existing?.isActive ?? true,
      });
    }
  }, [open, existing?.id]);

  const mutation = useMutation({
    mutationFn: async (values: DepartmentFormValues) => {
      if (isEdit && existing) {
        return apiRequest("PATCH", `/api/accounts/${accountId}/departments/${existing.id}`, values);
      }
      return apiRequest("POST", `/api/accounts/${accountId}/departments`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", accountId, "departments"] });
      toast({
        title: isEdit ? "Department updated" : "Department added",
        description: `${form.getValues("name")} has been ${isEdit ? "updated" : "added"}.`,
      });
      onOpenChange(false);
      onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save department", variant: "destructive" });
    },
  });

  const onSubmit = (values: DepartmentFormValues) => mutation.mutate(values);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-department-form">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Department" : "Add Department"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this department's details." : "Create a new department for this account."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel required>Department Name</FormLabel>
                <FormControl><Input {...field} placeholder="e.g. Service Department" data-testid="input-department-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel>Department Code</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. SVC" data-testid="input-department-code" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="sortOrder" render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl><Input {...field} type="number" data-testid="input-department-sort-order" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="What this department covers…" rows={3} data-testid="textarea-department-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between gap-3 rounded-md border p-3">
                <div className="space-y-0.5">
                  <FormLabel className="text-sm font-medium">Active</FormLabel>
                  <p className="text-xs text-muted-foreground">Inactive departments cannot be assigned to new configurations.</p>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-department-active" />
                </FormControl>
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-department-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-department-save">
                {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</> : isEdit ? "Save Changes" : "Add Department"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function defaultDeptHours(): DeptBusinessHours {
  const hours: DeptBusinessHours = {};
  DEPT_DAYS_OF_WEEK.forEach((day) => {
    hours[day] = { enabled: day !== "saturday" && day !== "sunday", start: "08:00", end: "17:00" };
  });
  return hours;
}

interface DepartmentSettingsDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accountId: string;
  department: AccountDepartment | null;
}

function DepartmentSettingsDialog({ open, onOpenChange, accountId, department }: DepartmentSettingsDialogProps) {
  const { toast } = useToast();
  const departmentId = department?.id;

  const { data, isLoading } = useQuery<DepartmentSettingsResponse>({
    queryKey: ["/api/accounts", accountId, "departments", departmentId, "settings"],
    enabled: open && !!departmentId,
  });

  const [timezoneOverride, setTimezoneOverride] = useState(false);
  const [timezone, setTimezone] = useState<string>("");
  const [hoursOverride, setHoursOverride] = useState(false);
  const [businessHours, setBusinessHours] = useState<DeptBusinessHours>(defaultDeptHours());
  const [useAccountHolidays, setUseAccountHolidays] = useState(true);
  const [customHolidays, setCustomHolidays] = useState<DeptHoliday[]>([]);
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [glCode, setGlCode] = useState("");

  useEffect(() => {
    if (open && data) {
      const { raw, effective } = data;
      setTimezoneOverride(!effective.timezone.inherited);
      setTimezone(raw.timezone || effective.timezone.value);
      setHoursOverride(!effective.businessHours.inherited);
      setBusinessHours(raw.businessHours ? (() => {
        try { return JSON.parse(raw.businessHours as any); } catch { return effective.businessHours.value; }
      })() : effective.businessHours.value);
      setUseAccountHolidays(raw.useAccountHolidayCalendar);
      setCustomHolidays(raw.customHolidays || []);
      setCostCenter(raw.costCenter || "");
      setGlCode(raw.glCode || "");
    }
  }, [open, data]);

  const mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/accounts/${accountId}/departments/${departmentId}/settings`, {
        timezone: timezoneOverride ? timezone : null,
        businessHours: hoursOverride ? businessHours : null,
        useAccountHolidayCalendar: useAccountHolidays,
        customHolidays: useAccountHolidays ? null : customHolidays,
        costCenter: costCenter || null,
        glCode: glCode || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", accountId, "departments"] });
      toast({ title: "Department settings saved" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save settings", variant: "destructive" });
    },
  });

  const updateHours = (day: string, field: keyof DeptDayHours, value: string | boolean) => {
    setBusinessHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const addHoliday = () => {
    if (!newHolidayName.trim() || !newHolidayDate) return;
    setCustomHolidays((prev) => [...prev, { name: newHolidayName.trim(), date: newHolidayDate }]);
    setNewHolidayName("");
    setNewHolidayDate("");
  };

  const removeHoliday = (idx: number) => {
    setCustomHolidays((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-department-settings">
        <DialogHeader>
          <DialogTitle>Business Configuration — {department?.name}</DialogTitle>
          <DialogDescription>
            These settings inherit from the account by default. Toggle "Override" to set department-specific values.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading settings…
          </div>
        ) : (
          <div className="space-y-6">
            {/* Time Zone */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm font-medium">Time Zone</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Override</span>
                  <Switch
                    checked={timezoneOverride}
                    onCheckedChange={(checked) => {
                      setTimezoneOverride(checked);
                      if (checked && !timezone) setTimezone(data.effective.timezone.value);
                    }}
                    data-testid="switch-timezone-override"
                  />
                </div>
              </div>
              {timezoneOverride ? (
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger data-testid="select-department-timezone">
                    <SelectValue placeholder="Select time zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_TIMEZONES.map((tz) => (
                      <SelectItem key={tz.iana} value={tz.iana}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5" data-testid="text-inherited-timezone">
                  <Info className="h-3.5 w-3.5" /> Inherited from account: {tzLabel(data.effective.timezone.value)}
                </p>
              )}
            </div>

            <Separator />

            {/* Business Hours / Days Open */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm font-medium">Business Hours &amp; Days Open</Label>
                  <p className="text-xs text-muted-foreground">Uncheck a day to mark it closed.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Override</span>
                  <Switch
                    checked={hoursOverride}
                    onCheckedChange={(checked) => {
                      setHoursOverride(checked);
                      if (checked) setBusinessHours(data.effective.businessHours.value);
                    }}
                    data-testid="switch-hours-override"
                  />
                </div>
              </div>
              {hoursOverride ? (
                <div className="space-y-2 rounded-md border p-3">
                  {DEPT_DAYS_OF_WEEK.map((day) => (
                    <div key={day} className="flex items-center gap-4 flex-wrap">
                      <div className="w-28 flex items-center space-x-2">
                        <Checkbox
                          id={`dept-hours-${day}`}
                          checked={businessHours[day]?.enabled ?? false}
                          onCheckedChange={(checked) => updateHours(day, "enabled", !!checked)}
                          data-testid={`checkbox-dept-day-${day}`}
                        />
                        <Label htmlFor={`dept-hours-${day}`} className="cursor-pointer capitalize">{day}</Label>
                      </div>
                      {businessHours[day]?.enabled && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={businessHours[day]?.start || "08:00"}
                            onChange={(e) => updateHours(day, "start", e.target.value)}
                            className="w-32"
                            data-testid={`input-dept-start-${day}`}
                          />
                          <span className="text-muted-foreground">to</span>
                          <Input
                            type="time"
                            value={businessHours[day]?.end || "17:00"}
                            onChange={(e) => updateHours(day, "end", e.target.value)}
                            className="w-32"
                            data-testid={`input-dept-end-${day}`}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5" data-testid="text-inherited-hours">
                  <Info className="h-3.5 w-3.5" /> Inherited from account's operating hours
                </p>
              )}
            </div>

            <Separator />

            {/* Holiday Calendar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm font-medium">Holiday Calendar</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Custom Calendar</span>
                  <Switch
                    checked={!useAccountHolidays}
                    onCheckedChange={(checked) => setUseAccountHolidays(!checked)}
                    data-testid="switch-custom-holidays"
                  />
                </div>
              </div>
              {useAccountHolidays ? (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5" data-testid="text-inherited-holidays">
                  <Info className="h-3.5 w-3.5" /> Using the company's standard holiday calendar
                </p>
              ) : (
                <div className="space-y-2 rounded-md border p-3">
                  {customHolidays.length === 0 && (
                    <p className="text-xs text-muted-foreground">No custom holidays added yet.</p>
                  )}
                  {customHolidays.map((h, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 text-sm" data-testid={`row-holiday-${idx}`}>
                      <span>{h.name} — {h.date}</span>
                      <Button size="icon" variant="ghost" onClick={() => removeHoliday(idx)} data-testid={`button-remove-holiday-${idx}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-2">
                    <Input
                      placeholder="Holiday name"
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                      className="flex-1"
                      data-testid="input-new-holiday-name"
                    />
                    <Input
                      type="date"
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                      className="w-40"
                      data-testid="input-new-holiday-date"
                    />
                    <Button type="button" size="icon" variant="outline" onClick={addHoliday} data-testid="button-add-holiday">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Cost Center / GL Code */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Cost Center <span className="text-xs text-muted-foreground font-normal">(Optional)</span></Label>
                <Input value={costCenter} onChange={(e) => setCostCenter(e.target.value)} placeholder="e.g. CC-1042" data-testid="input-department-cost-center" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">GL Code <span className="text-xs text-muted-foreground font-normal">(Optional)</span></Label>
                <Input value={glCode} onChange={(e) => setGlCode(e.target.value)} placeholder="e.g. 6100-SVC" data-testid="input-department-gl-code" />
              </div>
            </div>

            <Separator />

            {/* Future placeholders */}
            <div className="grid grid-cols-2 gap-4 opacity-60">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Default Promise Model <span className="text-xs font-normal">(Coming soon)</span></Label>
                <Input disabled placeholder="Not yet available" data-testid="input-department-promise-model" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Spend Approval Threshold <span className="text-xs font-normal">(Coming soon)</span></Label>
                <Input disabled placeholder="Not yet available" data-testid="input-department-spend-threshold" />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-department-settings-cancel">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || isLoading || !data}
            data-testid="button-department-settings-save"
          >
            {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</> : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Department Move Type Configuration Dialog ────────────────────────────────

interface DeptMoveTypeItem {
  id: string; // master move type id
  name: string;
  category: string | null;
  sortOrder: number;
  isEnabled: boolean;
  deptSortOrder: number | null;
  configId: string | null;
}

function SortableMoveTypeRow({
  item, onToggle,
}: { item: DeptMoveTypeItem; onToggle: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-md border p-3 bg-background"
      data-testid={`row-dept-move-type-${item.id}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0 touch-none"
        data-testid={`drag-dept-move-type-${item.id}`}
        type="button"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" data-testid={`text-dept-move-type-name-${item.id}`}>
            {item.name}
          </span>
          {item.category && (
            <Badge variant="secondary" className="text-xs" data-testid={`badge-dept-move-type-category-${item.id}`}>
              {item.category}
            </Badge>
          )}
        </div>
      </div>
      <Switch
        checked={item.isEnabled}
        onCheckedChange={() => onToggle(item.id)}
        data-testid={`switch-dept-move-type-${item.id}`}
      />
    </div>
  );
}

interface DepartmentMoveTypesDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accountId: string;
  department: AccountDepartment | null;
}

function DepartmentMoveTypesDialog({ open, onOpenChange, accountId, department }: DepartmentMoveTypesDialogProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<DeptMoveTypeItem[]>([]);

  const { data, isLoading } = useQuery<DeptMoveTypeItem[]>({
    queryKey: ["/api/accounts", accountId, "departments", department?.id, "move-types"],
    enabled: open && !!department,
  });

  useEffect(() => {
    if (open && data) setItems(data);
  }, [open, data]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIdx = prev.findIndex((i) => i.id === active.id);
        const newIdx = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  const toggleEnabled = (id: string) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, isEnabled: !i.isEnabled } : i));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      return fetch(`/api/accounts/${accountId}/departments/${department!.id}/move-types`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item, idx) => ({
            moveTypeId: item.id,
            isEnabled: item.isEnabled,
            sortOrder: idx,
          })),
        }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json())?.error || "Failed to save");
        return r.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/accounts", accountId, "departments", department?.id, "move-types"],
      });
      toast({ title: "Move types saved", description: `${department?.name} move type configuration updated.` });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col" data-testid="dialog-department-move-types">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-4 w-4" />
            Move Types — {department?.name}
          </DialogTitle>
          <DialogDescription>
            Toggle and reorder which Move Types are available for this department. Disabled move types are hidden from selection but not deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 py-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading move types…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <Route className="h-6 w-6 mb-2" />
              <p className="text-sm">No active move types in the platform master list yet.</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 pb-2">
                  {items.map((item) => (
                    <SortableMoveTypeRow key={item.id} item={item} onToggle={toggleEnabled} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-dept-move-types-cancel">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading || items.length === 0}
            data-testid="button-dept-move-types-save"
          >
            {saveMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</>
              : <><Save className="h-4 w-4 mr-1.5" />Save Configuration</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function AccountDepartmentsTab({ accountId }: { accountId: string }) {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AccountDepartment | null>(null);
  const [pendingToggle, setPendingToggle] = useState<AccountDepartment | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDept, setSettingsDept] = useState<AccountDepartment | null>(null);
  const [moveTypesOpen, setMoveTypesOpen] = useState(false);
  const [moveTypesDept, setMoveTypesDept] = useState<AccountDepartment | null>(null);

  const { data, isLoading } = useQuery<{ departments: AccountDepartment[] }>({
    queryKey: ["/api/accounts", accountId, "departments"],
  });
  const departments = data?.departments ?? [];
  const activeCount = departments.filter((d) => d.isActive).length;

  const statusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/accounts/${accountId}/departments/${id}/status`, { isActive }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", accountId, "departments"] });
      toast({ title: variables.isActive ? "Department reactivated" : "Department deactivated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update department", variant: "destructive" });
    },
    onSettled: () => setPendingToggle(null),
  });

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (d: AccountDepartment) => { setEditing(d); setFormOpen(true); };
  const openSettings = (d: AccountDepartment) => { setSettingsDept(d); setSettingsOpen(true); };
  const openMoveTypes = (d: AccountDepartment) => { setMoveTypesDept(d); setMoveTypesOpen(true); };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Departments</CardTitle>
          <CardDescription>
            The account's organizational structure — used to organize Move Types, reporting, and permissions.
          </CardDescription>
        </div>
        <Button onClick={openCreate} data-testid="button-add-department">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Department
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading departments…
          </div>
        ) : departments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <Building2 className="h-8 w-8 mb-2" />
            <p className="text-sm">No departments yet. Add the first department for this account.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {departments
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
              .map((dept) => (
                <div
                  key={dept.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 hover-elevate"
                  data-testid={`row-department-${dept.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate" data-testid={`text-department-name-${dept.id}`}>
                          {dept.name}
                        </span>
                        {dept.code && (
                          <Badge variant="outline" className="text-xs" data-testid={`badge-department-code-${dept.id}`}>
                            {dept.code}
                          </Badge>
                        )}
                        {dept.isDefault && (
                          <Badge variant="secondary" className="text-xs">Default</Badge>
                        )}
                        {dept.isActive ? (
                          <Badge variant="outline" className="text-xs gap-1 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800" data-testid={`badge-department-status-${dept.id}`}>
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs gap-1 text-muted-foreground" data-testid={`badge-department-status-${dept.id}`}>
                            <XCircle className="h-3 w-3" /> Inactive
                          </Badge>
                        )}
                      </div>
                      {dept.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate" data-testid={`text-department-description-${dept.id}`}>
                          {dept.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => openMoveTypes(dept)} data-testid={`button-move-types-department-${dept.id}`} title="Configure Move Types">
                      <Route className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openSettings(dept)} data-testid={`button-settings-department-${dept.id}`}>
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(dept)} data-testid={`button-edit-department-${dept.id}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Switch
                      checked={dept.isActive}
                      disabled={statusMutation.isPending}
                      onCheckedChange={(checked) => {
                        if (!checked) {
                          setPendingToggle(dept);
                        } else {
                          statusMutation.mutate({ id: dept.id, isActive: true });
                        }
                      }}
                      data-testid={`switch-department-active-${dept.id}`}
                    />
                  </div>
                </div>
              ))}
          </div>
        )}
      </CardContent>

      <DepartmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        accountId={accountId}
        existing={editing}
        onSuccess={() => {}}
      />

      <DepartmentSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        accountId={accountId}
        department={settingsDept}
      />

      <DepartmentMoveTypesDialog
        open={moveTypesOpen}
        onOpenChange={setMoveTypesOpen}
        accountId={accountId}
        department={moveTypesDept}
      />

      <AlertDialog open={!!pendingToggle} onOpenChange={(o) => !o && setPendingToggle(null)}>
        <AlertDialogContent data-testid="dialog-deactivate-department">
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate department?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeCount <= 1
                ? "This is the only active department on this account. Every account must have at least one active department, so it cannot be deactivated until another department is active."
                : `"${pendingToggle?.name}" will no longer be available for new assignments. Existing moves and records will continue to reference it for historical reporting.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deactivate-department">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={activeCount <= 1}
              onClick={() => pendingToggle && statusMutation.mutate({ id: pendingToggle.id, isActive: false })}
              data-testid="button-confirm-deactivate-department"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
