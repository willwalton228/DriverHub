import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, differenceInHours, isWithinInterval } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Calendar as CalendarIcon, Plus, Search, Loader2, 
  Clock, Users, ChevronLeft, ChevronRight,
  Send, Lock, MapPin, GripVertical, X, UserPlus, UserMinus,
  AlertTriangle, Eye, Edit2, Trash2, Check, AlertCircle,
  CalendarDays, Timer, UserCheck, ClipboardCheck, LayoutGrid, List, Wand2,
  Undo2, History, FileStack, ArrowLeftRight, Copy, Repeat, CheckCircle2, XCircle, FileText, Shield, MessageSquare,
  DollarSign, Download, Bell, Settings, Coffee, Lightbulb, ArrowRight, TrendingDown, TrendingUp, HeartPulse, UserX,
  UserCog, BarChart3, Scale, ShieldAlert, Building2, Gavel, Palette, ToggleLeft, ClipboardList, Navigation2, FileEdit,
  Plug, Database
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ShiftSwapsTab } from "@/components/scheduling/ShiftSwapsTab";
import { TimeOffTab } from "@/components/scheduling/TimeOffTab";
import { MessagesTab } from "@/components/scheduling/MessagesTab";
import { LaborCostsTab } from "@/components/scheduling/LaborCostsTab";
import { PayrollExportTab } from "@/components/scheduling/PayrollExportTab";
import { AnalyticsDashboardTab } from "@/components/scheduling/AnalyticsDashboardTab";
import { LaborForecastTab } from "@/components/scheduling/LaborForecastTab";
import { CalendarSyncTab } from "@/components/scheduling/CalendarSyncTab";
import SchedulingPermissionsTab from "@/components/scheduling/SchedulingPermissionsTab";
import SchedulingAuditLogTab from "@/components/scheduling/SchedulingAuditLogTab";
import SchedulingDataHealthTab from "@/components/scheduling/SchedulingDataHealthTab";
import SchedulingBackupPoolTab from "@/components/scheduling/SchedulingBackupPoolTab";
import SchedulingImpactAnalysisTab from "@/components/scheduling/SchedulingImpactAnalysisTab";
import { ExternalAccessTab } from "@/components/scheduling/ExternalAccessTab";
import ComplianceEvidenceTab from "@/components/scheduling/ComplianceEvidenceTab";
import { CandidateSummaryPanel } from "@/components/recruiting/CandidateSummaryPanel";
import { LoadBalancingTab } from "@/components/scheduling/LoadBalancingTab";
import { RevenueMarginTab } from "@/components/scheduling/RevenueMarginTab";
import { ReliabilitySignalsTab } from "@/components/scheduling/ReliabilitySignalsTab";
import { ClientRulesTab } from "@/components/scheduling/ClientRulesTab";
import { OptimizationSandboxTab } from "@/components/scheduling/OptimizationSandboxTab";
import WiwIngestionTab from "@/components/scheduling/WiwIngestionTab";
import { WiwTimeOffWidget } from "@/components/scheduling/WiwTimeOffWidget";
import { SchedulingModuleNav } from "@/components/scheduling/SchedulingModuleNav";
import { OTWatchTab } from "@/components/scheduling/OTWatchTab";
import { ShiftRebalanceTab } from "@/components/scheduling/ShiftRebalanceTab";
import { WhenIWorkIntegration } from "@/components/scheduling/WhenIWorkIntegration";
import { WhenIWorkUserMapping } from "@/components/scheduling/WhenIWorkUserMapping";
import { WhenIWorkLocationMapping } from "@/components/scheduling/WhenIWorkLocationMapping";
import { WhenIWorkSyncPanel } from "@/components/scheduling/WhenIWorkSyncPanel";
import { WhenIWorkTimeApproval } from "@/components/scheduling/WhenIWorkTimeApproval";
import { WhenIWorkDataView } from "@/components/scheduling/WhenIWorkDataView";

type ScheduleStatus = 'draft' | 'submitted' | 'approved' | 'published' | 'locked' | 'archived';
type AssignmentStatus = 'assigned' | 'confirmed' | 'declined' | 'cancelled' | 'no_show' | 'completed';

const statusColors: Record<ScheduleStatus, { bg: string; text: string; icon: typeof Clock }> = {
  draft: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-800 dark:text-gray-300", icon: Edit2 },
  submitted: { bg: "bg-yellow-100 dark:bg-yellow-900", text: "text-yellow-800 dark:text-yellow-300", icon: Clock },
  approved: { bg: "bg-blue-100 dark:bg-blue-900", text: "text-blue-800 dark:text-blue-300", icon: CheckCircle2 },
  published: { bg: "bg-green-100 dark:bg-green-900", text: "text-green-800 dark:text-green-300", icon: Send },
  locked: { bg: "bg-purple-100 dark:bg-purple-900", text: "text-purple-800 dark:text-purple-300", icon: Lock },
  archived: { bg: "bg-gray-200 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-400", icon: CalendarDays },
};

function StatusBadge({ status }: { status: ScheduleStatus }) {
  const config = statusColors[status] || statusColors.draft;
  const Icon = config.icon;
  
  return (
    <Badge 
      className={`${config.bg} ${config.text} gap-1`}
      data-testid={`badge-status-${status}`}
    >
      <Icon className="h-3 w-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

const scheduleSchema = z.object({
  name: z.string().min(1, "Schedule name is required"),
  description: z.string().optional(),
  startDate: z.date({ required_error: "Start date is required" }),
  endDate: z.date({ required_error: "End date is required" }),
  timeZone: z.string().default("America/Chicago"),
});

type ScheduleForm = z.infer<typeof scheduleSchema>;

const shiftSchema = z.object({
  name: z.string().min(1, "Shift name is required"),
  role: z.string().optional(),
  location: z.string().optional(),
  workType: z.enum(['shift', 'on_demand', 'hybrid']).default('shift'),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  date: z.date({ required_error: "Date is required" }),
  requiredHeadcount: z.coerce.number().min(1).default(1),
  notes: z.string().optional(),
  color: z.string().optional(),
});

type ShiftForm = z.infer<typeof shiftSchema>;

const SHIFT_COLORS = [
  { value: "blue", label: "Blue", bg: "bg-blue-500", text: "text-white" },
  { value: "green", label: "Green", bg: "bg-green-500", text: "text-white" },
  { value: "orange", label: "Orange", bg: "bg-orange-500", text: "text-white" },
  { value: "purple", label: "Purple", bg: "bg-purple-500", text: "text-white" },
  { value: "pink", label: "Pink", bg: "bg-pink-500", text: "text-white" },
  { value: "teal", label: "Teal", bg: "bg-teal-500", text: "text-white" },
];

function getShiftColor(color: string | null | undefined) {
  const found = SHIFT_COLORS.find(c => c.value === color);
  return found || { value: "blue", label: "Blue", bg: "bg-blue-500", text: "text-white" };
}

function SchedulesTab({ entityId }: { entityId?: string | null }) {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [rosterScheduleId, setRosterScheduleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [changelogScheduleId, setChangelogScheduleId] = useState<string | null>(null);

  const { data: schedulesData, isLoading } = useQuery<{ schedules: any[]; total: number }>({
    queryKey: ["/api/scheduling/schedules", { entityId }],
    queryFn: async () => {
      const params = entityId ? `?entityId=${entityId}` : '';
      const res = await fetch(`/api/scheduling/schedules${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const form = useForm<ScheduleForm>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      name: "",
      description: "",
      timeZone: "America/Chicago",
    },
  });

  const createSchedule = useMutation({
    mutationFn: async (data: ScheduleForm) => {
      const res = await apiRequest("POST", "/api/scheduling/schedules", {
        name: data.name,
        description: data.description,
        startDate: format(data.startDate, "yyyy-MM-dd"),
        endDate: format(data.endDate, "yyyy-MM-dd"),
        timeZone: data.timeZone,
        entityId: entityId || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules"] });
      toast({ title: "Schedule created successfully" });
      setCreateDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const publishSchedule = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/scheduling/schedules/${id}/publish`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules"] });
      toast({ title: "Schedule published successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const lockSchedule = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/scheduling/schedules/${id}/lock`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules"] });
      toast({ title: "Schedule locked successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const unpublishSchedule = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/scheduling/schedules/${id}/unpublish`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules"] });
      toast({ title: "Schedule unpublished successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const submitForApproval = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/scheduling/schedules/${id}/submit`, { notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules"] });
      toast({ title: "Schedule submitted for approval" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const approveSchedule = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/scheduling/schedules/${id}/approve`, { notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules"] });
      toast({ title: "Schedule approved successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rejectSchedule = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/scheduling/schedules/${id}/reject`, { notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules"] });
      toast({ title: "Schedule returned to draft" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const schedules = schedulesData?.schedules || [];
  
  const filteredSchedules = schedules.filter(schedule => {
    const matchesSearch = schedule.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || schedule.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rosterScheduleId) {
    return (
      <RosterBuilder 
        scheduleId={rosterScheduleId} 
        onBack={() => setRosterScheduleId(null)} 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-wrap">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search schedules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-64"
              data-testid="input-search-schedules"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="locked">Locked</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-schedule">
          <Plus className="mr-2 h-4 w-4" />
          Create Schedule
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredSchedules.map((schedule) => (
          <Card 
            key={schedule.id} 
            className="hover-elevate cursor-pointer"
            onClick={() => setRosterScheduleId(schedule.id)}
            data-testid={`card-schedule-${schedule.id}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-lg">{schedule.name}</CardTitle>
                  {schedule.description && (
                    <CardDescription className="line-clamp-2">{schedule.description}</CardDescription>
                  )}
                </div>
                <StatusBadge status={schedule.status} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  <span>
                    {format(parseISO(schedule.startDate), "MMM d")} - {format(parseISO(schedule.endDate), "MMM d, yyyy")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{schedule.timeZone}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                {schedule.status === 'draft' && (
                  <Button 
                    size="sm" 
                    onClick={(e) => { e.stopPropagation(); submitForApproval.mutate({ id: schedule.id }); }}
                    disabled={submitForApproval.isPending}
                    data-testid={`button-submit-${schedule.id}`}
                  >
                    <FileText className="mr-1 h-3 w-3" />
                    Submit for Approval
                  </Button>
                )}
                {schedule.status === 'submitted' && (
                  <>
                    <Button 
                      size="sm" 
                      className="bg-green-600 hover:bg-green-700"
                      onClick={(e) => { e.stopPropagation(); approveSchedule.mutate({ id: schedule.id }); }}
                      disabled={approveSchedule.isPending}
                      data-testid={`button-approve-${schedule.id}`}
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Approve
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={(e) => { e.stopPropagation(); rejectSchedule.mutate({ id: schedule.id }); }}
                      disabled={rejectSchedule.isPending}
                      data-testid={`button-reject-${schedule.id}`}
                    >
                      <XCircle className="mr-1 h-3 w-3" />
                      Reject
                    </Button>
                  </>
                )}
                {schedule.status === 'approved' && (
                  <Button 
                    size="sm" 
                    onClick={(e) => { e.stopPropagation(); publishSchedule.mutate(schedule.id); }}
                    disabled={publishSchedule.isPending}
                    data-testid={`button-publish-${schedule.id}`}
                  >
                    <Send className="mr-1 h-3 w-3" />
                    Publish
                  </Button>
                )}
                {schedule.status === 'published' && (
                  <>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); lockSchedule.mutate(schedule.id); }}
                      disabled={lockSchedule.isPending}
                      data-testid={`button-lock-${schedule.id}`}
                    >
                      <Lock className="mr-1 h-3 w-3" />
                      Lock
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); unpublishSchedule.mutate(schedule.id); }}
                      disabled={unpublishSchedule.isPending}
                      data-testid={`button-unpublish-${schedule.id}`}
                    >
                      <Undo2 className="mr-1 h-3 w-3" />
                      Unpublish
                    </Button>
                  </>
                )}
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); setSelectedScheduleId(schedule.id); }}
                  data-testid={`button-view-${schedule.id}`}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  Details
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); setRosterScheduleId(schedule.id); }}
                  data-testid={`button-roster-${schedule.id}`}
                >
                  <LayoutGrid className="mr-1 h-3 w-3" />
                  Roster
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); setChangelogScheduleId(schedule.id); }}
                  data-testid={`button-changelog-${schedule.id}`}
                >
                  <History className="mr-1 h-3 w-3" />
                  Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredSchedules.length === 0 && (
          <Card className="col-span-full p-8 text-center">
            <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No schedules found</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first schedule to get started
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first">
              <Plus className="mr-2 h-4 w-4" />
              Create Schedule
            </Button>
          </Card>
        )}
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Schedule</DialogTitle>
            <DialogDescription>
              Create a schedule period and add shifts to it
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => createSchedule.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Schedule Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Week of Feb 3rd" {...field} data-testid="input-schedule-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional description" {...field} data-testid="input-schedule-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-start-date"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-end-date"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="timeZone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time Zone</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-timezone">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="America/New_York">Eastern Time</SelectItem>
                        <SelectItem value="America/Chicago">Central Time</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createSchedule.isPending} data-testid="button-submit-schedule">
                  {createSchedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Schedule
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {selectedScheduleId && (
        <ScheduleDetailDialog 
          scheduleId={selectedScheduleId} 
          onClose={() => setSelectedScheduleId(null)} 
        />
      )}

      <ChangelogDialog 
        scheduleId={changelogScheduleId} 
        onClose={() => setChangelogScheduleId(null)} 
      />
    </div>
  );
}

function ChangelogDialog({ scheduleId, onClose }: { scheduleId: string | null; onClose: () => void }) {
  const { data: changelog, isLoading } = useQuery({
    queryKey: ["/api/scheduling/schedules", scheduleId, "changelog"],
    enabled: !!scheduleId,
  });

  if (!scheduleId) return null;

  return (
    <Dialog open={!!scheduleId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Schedule Change History</DialogTitle>
          <DialogDescription>
            Track all modifications made to shifts in this schedule
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (changelog as any[])?.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No changes recorded yet
            </div>
          ) : (
            <div className="space-y-3">
              {((changelog as any[]) || []).map((entry: any) => (
                <Card key={entry.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          entry.action === 'created' ? 'default' :
                          entry.action === 'deleted' ? 'destructive' :
                          'secondary'
                        }>
                          {entry.action}
                        </Badge>
                        <span className="text-sm font-medium">{entry.summary}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {entry.changedByEmail || 'System'} • {format(new Date(entry.changedAt), "MMM d, yyyy 'at' h:mm a")}
                        {entry.scheduleVersion > 0 && ` • Version ${entry.scheduleVersion}`}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuditLogViewer({ scheduleId }: { scheduleId: string }) {
  const { data: auditLogs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/scheduling/schedules", scheduleId, "audit-logs"],
  });

  const getActionColor = (action: string) => {
    switch (action) {
      case 'submit':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'approve':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'reject':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'publish':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'unpublish':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'submit':
        return <FileText className="h-3 w-3" />;
      case 'approve':
        return <CheckCircle2 className="h-3 w-3" />;
      case 'reject':
        return <XCircle className="h-3 w-3" />;
      case 'publish':
        return <Send className="h-3 w-3" />;
      case 'unpublish':
        return <Undo2 className="h-3 w-3" />;
      default:
        return <History className="h-3 w-3" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!auditLogs || auditLogs.length === 0) {
    return (
      <div className="text-center py-8">
        <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No audit trail recorded yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Actions like submit, approve, reject will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="font-medium flex items-center gap-2">
        <Shield className="h-4 w-4" />
        Approval Workflow History
      </h4>
      <ScrollArea className="h-[300px]">
        <div className="space-y-2 pr-4">
          {auditLogs.map((log: any) => (
            <div 
              key={log.id} 
              className="p-3 border rounded-lg space-y-2"
              data-testid={`audit-log-${log.id}`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge className={`gap-1 ${getActionColor(log.action)}`}>
                    {getActionIcon(log.action)}
                    {log.action.charAt(0).toUpperCase() + log.action.slice(1)}
                  </Badge>
                  {log.previousStatus && log.newStatus && (
                    <span className="text-xs text-muted-foreground">
                      {log.previousStatus} → {log.newStatus}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {log.createdAt && format(new Date(log.createdAt), "MMM d, yyyy h:mm a")}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span>{log.userName || log.userEmail || 'Unknown user'}</span>
                {log.userRole && (
                  <Badge variant="outline" className="text-xs">
                    {log.userRole}
                  </Badge>
                )}
              </div>
              {log.description && (
                <p className="text-sm text-muted-foreground">{log.description}</p>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function RosterBuilder({ scheduleId, onBack }: { scheduleId: string; onBack: () => void }) {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [createShiftOpen, setCreateShiftOpen] = useState(false);
  const [selectedShiftDate, setSelectedShiftDate] = useState<Date | null>(null);
  const [editShiftId, setEditShiftId] = useState<string | null>(null);
  const [assignDriverOpen, setAssignDriverOpen] = useState(false);
  const [selectedShiftForAssign, setSelectedShiftForAssign] = useState<any>(null);
  const [draggedShift, setDraggedShift] = useState<any>(null);
  const [autoFillOpen, setAutoFillOpen] = useState(false);
  const [autoFillResults, setAutoFillResults] = useState<any>(null);

  const { data: exportData, isLoading } = useQuery<{
    schedule: any;
    shifts: any[];
    violations: any[];
    summary: any;
  }>({
    queryKey: ["/api/scheduling/schedules", scheduleId, "export"],
  });

  const { data: driversData } = useQuery<{ drivers: any[] }>({
    queryKey: ["/api/drivers"],
  });

  const { data: availabilityData } = useQuery<any[]>({
    queryKey: ["/api/scheduling/availability"],
  });

  const { data: timeOffData } = useQuery<any[]>({
    queryKey: ["/api/scheduling/time-off"],
  });

  // Overtime alerts query
  const { data: alertsData } = useQuery<{
    alerts: Array<{
      workerId: string;
      workerName: string;
      violationType: 'daily_hours' | 'weekly_hours' | 'rest_period';
      severity: 'warning' | 'error';
      currentValue: number;
      threshold: number;
      message: string;
    }>;
    summary: {
      totalAlerts: number;
      warnings: number;
      errors: number;
    };
  }>({
    queryKey: ["/api/scheduling/schedules", scheduleId, "alerts"],
    refetchInterval: 30_000, // Refresh every 30 seconds
  });

  // OT Risk Forecasting query
  const { data: otRiskData, refetch: refetchOtRisk } = useQuery<{
    forecasts: Array<{
      id: string;
      driverId: string;
      scheduledHours: string;
      clockedHours: string;
      projectedHours: string;
      otThreshold: string;
      riskLevel: 'low' | 'medium' | 'high';
      riskScore: number;
      riskFactors: any;
    }>;
    summary: {
      low: number;
      medium: number;
      high: number;
      total: number;
    };
  }>({
    queryKey: ["/api/corporate/scheduling/ot-risk/schedule", scheduleId, "recalculate"],
    enabled: !!scheduleId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Create a map of driverId to OT risk forecast for quick lookup
  const otRiskByDriver = new Map<string, { riskLevel: 'low' | 'medium' | 'high'; riskScore: number; projectedHours: string }>();
  if (otRiskData?.forecasts) {
    otRiskData.forecasts.forEach(f => {
      otRiskByDriver.set(f.driverId, {
        riskLevel: f.riskLevel,
        riskScore: f.riskScore,
        projectedHours: f.projectedHours
      });
    });
  }

  const shiftForm = useForm<ShiftForm>({
    resolver: zodResolver(shiftSchema),
    defaultValues: {
      name: "",
      role: "",
      location: "",
      workType: "shift",
      requiredHeadcount: 1,
      notes: "",
      color: "blue",
    },
  });

  const createShift = useMutation({
    mutationFn: async (data: ShiftForm) => {
      const shiftDate = format(data.date, "yyyy-MM-dd");
      const startTime = new Date(`${shiftDate}T${data.startTime}:00`);
      const endTime = new Date(`${shiftDate}T${data.endTime}:00`);

      const res = await apiRequest("POST", "/api/scheduling/shifts", {
        scheduleId,
        name: data.name,
        role: data.role,
        locationId: data.location || null,
        workType: data.workType,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        requiredHeadcount: data.requiredHeadcount,
        notes: data.notes,
        color: data.color,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules", scheduleId, "export"] });
      toast({ title: "Shift created successfully" });
      setCreateShiftOpen(false);
      shiftForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateShift = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ShiftForm> }) => {
      const res = await apiRequest("PATCH", `/api/scheduling/shifts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules", scheduleId, "export"] });
      toast({ title: "Shift updated successfully" });
      setEditShiftId(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteShift = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/scheduling/shifts/${id}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules", scheduleId, "export"] });
      toast({ title: "Shift deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createAssignment = useMutation({
    mutationFn: async ({ shiftId, driverId }: { shiftId: string; driverId: string }) => {
      const res = await apiRequest("POST", "/api/scheduling/assignments", {
        shiftId,
        workerType: "driver",
        driverId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules", scheduleId, "export"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/ot-risk/schedule", scheduleId, "recalculate"] });
      toast({ title: "Driver assigned to shift" });
      setAssignDriverOpen(false);
      setSelectedShiftForAssign(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeAssignment = useMutation({
    mutationFn: async (assignmentId: string) => {
      const res = await apiRequest("PATCH", `/api/scheduling/assignments/${assignmentId}/status`, {
        status: "cancelled",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules", scheduleId, "export"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/ot-risk/schedule", scheduleId, "recalculate"] });
      toast({ title: "Driver removed from shift" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: autoFillPreview } = useQuery<{
    shiftsToFill: number;
    positionsToFill: number;
    eligibleDrivers: number;
    estimatedAssignments: number;
  }>({
    queryKey: ["/api/scheduling/schedules", scheduleId, "auto-fill", "preview"],
    enabled: autoFillOpen,
  });

  const runAutoFill = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/scheduling/schedules/${scheduleId}/auto-fill`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules", scheduleId, "export"] });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/ot-risk/schedule", scheduleId, "recalculate"] });
      setAutoFillResults(data);
      toast({ 
        title: "Auto-fill complete", 
        description: `${data.assignmentsMade} assignments made out of ${data.totalPositionsToFill} positions` 
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const schedule = exportData?.schedule;
  const shifts = exportData?.shifts || [];
  const violations = exportData?.violations || [];
  const summary = exportData?.summary;
  const drivers = driversData?.drivers || [];
  const availability = availabilityData || [];
  const timeOff = timeOffData || [];

  const scheduleDays = useMemo(() => {
    if (!schedule?.startDate || !schedule?.endDate) return [];
    const start = parseISO(schedule.startDate);
    const end = parseISO(schedule.endDate);
    return eachDayOfInterval({ start, end });
  }, [schedule]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [selectedDate]);

  const displayDays = viewMode === 'week' ? weekDays : [selectedDate];

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, any[]>();
    shifts.forEach(shift => {
      const dateKey = format(new Date(shift.startTime), "yyyy-MM-dd");
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(shift);
    });
    return map;
  }, [shifts]);

  const getDriverAvailability = useCallback((driverId: string, date: Date) => {
    const dayOfWeek = date.getDay();
    const driverAvail = availability.filter(a => a.driverId === driverId && a.dayOfWeek === dayOfWeek);
    const driverTimeOff = timeOff.filter(t => {
      if (t.driverId !== driverId) return false;
      const start = parseISO(t.startDate);
      const end = parseISO(t.endDate);
      return isWithinInterval(date, { start, end });
    });
    return { available: driverAvail, timeOff: driverTimeOff };
  }, [availability, timeOff]);

  const isDriverAvailable = useCallback((driverId: string, shift: any) => {
    const shiftDate = new Date(shift.startTime);
    const { available, timeOff: driverTimeOff } = getDriverAvailability(driverId, shiftDate);
    
    if (driverTimeOff.length > 0 && driverTimeOff.some(t => t.status === 'approved')) {
      return { available: false, reason: 'On approved time off' };
    }
    
    if (available.length === 0) {
      return { available: true, reason: null };
    }
    
    const shiftStart = format(new Date(shift.startTime), "HH:mm");
    const shiftEnd = format(new Date(shift.endTime), "HH:mm");
    
    const hasOverlap = available.some(a => {
      return a.preference !== 'unavailable' && 
             a.startTime <= shiftStart && 
             a.endTime >= shiftEnd;
    });
    
    if (!hasOverlap && available.some(a => a.preference === 'unavailable')) {
      return { available: false, reason: 'Not available during shift hours' };
    }
    
    return { available: true, reason: null };
  }, [getDriverAvailability]);

  const handleDragStart = (e: React.DragEvent, shift: any) => {
    setDraggedShift(shift);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', shift.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    if (!draggedShift || schedule?.status !== 'draft') return;
    
    const originalDate = new Date(draggedShift.startTime);
    const originalEndDate = new Date(draggedShift.endTime);
    const duration = originalEndDate.getTime() - originalDate.getTime();
    
    const newStartTime = new Date(targetDate);
    newStartTime.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
    const newEndTime = new Date(newStartTime.getTime() + duration);
    
    updateShift.mutate({
      id: draggedShift.id,
      data: {
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
      } as any,
    });
    
    setDraggedShift(null);
  };

  const openCreateShift = (date?: Date) => {
    setSelectedShiftDate(date || null);
    if (date) {
      shiftForm.setValue('date', date);
    }
    setCreateShiftOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isDraft = schedule?.status === 'draft';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              {schedule?.name}
              <StatusBadge status={schedule?.status} />
            </h2>
            <p className="text-sm text-muted-foreground">
              {schedule?.startDate && schedule?.endDate && (
                <>
                  {format(parseISO(schedule.startDate), "MMM d")} - {format(parseISO(schedule.endDate), "MMM d, yyyy")}
                </>
              )}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'week' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('week')}
              data-testid="button-week-view"
            >
              Week
            </Button>
            <Button
              variant={viewMode === 'day' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('day')}
              data-testid="button-day-view"
            >
              Day
            </Button>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedDate(addDays(selectedDate, viewMode === 'week' ? -7 : -1))}
              data-testid="button-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-32" data-testid="button-date-picker">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {viewMode === 'week' 
                    ? `${format(weekDays[0], "MMM d")} - ${format(weekDays[6], "MMM d")}`
                    : format(selectedDate, "MMM d, yyyy")
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedDate(addDays(selectedDate, viewMode === 'week' ? 7 : 1))}
              data-testid="button-next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {isDraft && (
            <Button onClick={() => openCreateShift()} data-testid="button-add-shift">
              <Plus className="mr-2 h-4 w-4" />
              Add Shift
            </Button>
          )}
          {isDraft && summary?.unfilledShifts > 0 && (
            <Button 
              variant="outline" 
              onClick={() => setAutoFillOpen(true)} 
              data-testid="button-auto-fill"
            >
              <Wand2 className="mr-2 h-4 w-4" />
              Auto-Fill ({summary.unfilledShifts} unfilled)
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            Total Shifts
          </div>
          <p className="text-2xl font-bold mt-1">{summary?.totalShifts || 0}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserCheck className="h-4 w-4" />
            Assignments
          </div>
          <p className="text-2xl font-bold mt-1">{summary?.totalAssignments || 0}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Timer className="h-4 w-4" />
            Total Hours
          </div>
          <p className="text-2xl font-bold mt-1">{summary?.totalHours || 0}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            Unfilled
          </div>
          <p className={cn("text-2xl font-bold mt-1", (summary?.unfilledShifts || 0) > 0 && "text-orange-600")}>
            {summary?.unfilledShifts || 0}
          </p>
        </Card>
      </div>

      {/* OT Risk Summary Panel */}
      {otRiskData?.summary && otRiskData.summary.total > 0 && (
        <Card className={cn(
          "border-l-4",
          otRiskData.summary.high > 0 
            ? "border-l-red-500" 
            : otRiskData.summary.medium > 0 
              ? "border-l-yellow-500" 
              : "border-l-green-500"
        )}>
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4" />
                Overtime Risk Forecast
              </div>
              <div className="flex items-center gap-2">
                {otRiskData.summary.high > 0 && (
                  <Badge variant="destructive" data-testid="badge-ot-risk-high">
                    {otRiskData.summary.high} High Risk
                  </Badge>
                )}
                {otRiskData.summary.medium > 0 && (
                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300" data-testid="badge-ot-risk-medium">
                    {otRiskData.summary.medium} Medium Risk
                  </Badge>
                )}
                {otRiskData.summary.low > 0 && (
                  <Badge className="bg-green-100 text-green-800 border-green-300" data-testid="badge-ot-risk-low">
                    {otRiskData.summary.low} Low Risk
                  </Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground">
              {otRiskData.summary.high > 0 && (
                <p className="text-red-600 dark:text-red-400">
                  {otRiskData.summary.high} driver{otRiskData.summary.high !== 1 ? 's' : ''} projected to exceed OT threshold this week
                </p>
              )}
              {otRiskData.summary.medium > 0 && otRiskData.summary.high === 0 && (
                <p className="text-yellow-600 dark:text-yellow-400">
                  {otRiskData.summary.medium} driver{otRiskData.summary.medium !== 1 ? 's' : ''} approaching OT threshold
                </p>
              )}
              {otRiskData.summary.high === 0 && otRiskData.summary.medium === 0 && (
                <p className="text-green-600 dark:text-green-400">
                  All drivers within normal OT limits
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {violations.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-4 w-4" />
              {violations.length} Violation{violations.length !== 1 ? 's' : ''} Detected
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {violations.slice(0, 3).map((v: any) => (
                <Badge key={v.id} variant={v.severity === 'error' ? 'destructive' : 'secondary'}>
                  {v.message}
                </Badge>
              ))}
              {violations.length > 3 && (
                <Badge variant="outline">+{violations.length - 3} more</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overtime & Labor Compliance Alerts */}
      {alertsData && alertsData.summary.totalAlerts > 0 && (
        <Card className={cn(
          "border-2",
          alertsData.summary.errors > 0 
            ? "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
            : "border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
        )}>
          <CardHeader className="py-3">
            <CardTitle className={cn(
              "text-base flex items-center gap-2",
              alertsData.summary.errors > 0 
                ? "text-red-700 dark:text-red-400" 
                : "text-amber-700 dark:text-amber-400"
            )}>
              <Clock className="h-4 w-4" />
              Labor Compliance Alerts ({alertsData.summary.totalAlerts})
              {alertsData.summary.errors > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {alertsData.summary.errors} Critical
                </Badge>
              )}
              {alertsData.summary.warnings > 0 && (
                <Badge variant="secondary" className="ml-2 bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  {alertsData.summary.warnings} Warning{alertsData.summary.warnings > 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {alertsData.alerts.slice(0, 5).map((alert, idx) => (
                <div 
                  key={idx}
                  className={cn(
                    "flex items-start gap-3 p-2 rounded-md text-sm",
                    alert.severity === 'error' 
                      ? "bg-red-100 dark:bg-red-900/30" 
                      : "bg-amber-100 dark:bg-amber-900/30"
                  )}
                >
                  {alert.severity === 'error' ? (
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium",
                      alert.severity === 'error' 
                        ? "text-red-800 dark:text-red-300" 
                        : "text-amber-800 dark:text-amber-300"
                    )}>
                      {alert.workerName}
                    </p>
                    <p className={cn(
                      "text-xs",
                      alert.severity === 'error' 
                        ? "text-red-700 dark:text-red-400" 
                        : "text-amber-700 dark:text-amber-400"
                    )}>
                      {alert.message}
                    </p>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "shrink-0",
                      alert.severity === 'error' 
                        ? "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300" 
                        : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
                    )}
                  >
                    {alert.violationType === 'daily_hours' && 'Daily Hours'}
                    {alert.violationType === 'weekly_hours' && 'Weekly Hours'}
                    {alert.violationType === 'rest_period' && 'Rest Period'}
                  </Badge>
                </div>
              ))}
              {alertsData.alerts.length > 5 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  +{alertsData.alerts.length - 5} more alerts
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${displayDays.length}, 1fr)` }}>
            {displayDays.map((day, idx) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const dayShifts = shiftsByDay.get(dateKey) || [];
              const isToday = isSameDay(day, new Date());
              const isInSchedule = schedule?.startDate && schedule?.endDate && 
                isWithinInterval(day, { start: parseISO(schedule.startDate), end: parseISO(schedule.endDate) });
              
              return (
                <div 
                  key={dateKey}
                  className={cn(
                    "min-h-[400px] border-r last:border-r-0",
                    !isInSchedule && "bg-muted/30"
                  )}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, day)}
                  data-testid={`roster-day-${dateKey}`}
                >
                  <div className={cn(
                    "sticky top-0 z-10 bg-background border-b p-3 text-center",
                    isToday && "bg-primary/10"
                  )}>
                    <p className="text-xs text-muted-foreground uppercase">
                      {format(day, "EEE")}
                    </p>
                    <p className={cn(
                      "text-lg font-semibold",
                      isToday && "text-primary"
                    )}>
                      {format(day, "d")}
                    </p>
                    {isDraft && isInSchedule && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-6 text-xs"
                        onClick={() => openCreateShift(day)}
                        data-testid={`button-add-shift-${dateKey}`}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    )}
                  </div>
                  
                  <div className="p-2 space-y-2">
                    {dayShifts.length === 0 && isInSchedule && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No shifts
                      </div>
                    )}
                    
                    {dayShifts
                      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                      .map(shift => {
                        const activeAssignments = (shift.assignments || []).filter(
                          (a: any) => a.status !== 'cancelled' && a.status !== 'declined'
                        );
                        const isFilled = activeAssignments.length >= shift.requiredHeadcount;
                        const isUnfilled = activeAssignments.length < shift.requiredHeadcount;
                        const shiftColor = getShiftColor(shift.color);
                        
                        return (
                          <div
                            key={shift.id}
                            draggable={isDraft}
                            onDragStart={(e) => handleDragStart(e, shift)}
                            className={cn(
                              "rounded-lg p-3 cursor-pointer hover-elevate transition-all",
                              shiftColor.bg,
                              shiftColor.text,
                              isDraft && "cursor-grab active:cursor-grabbing",
                              isUnfilled && "ring-2 ring-orange-400 ring-offset-2"
                            )}
                            data-testid={`shift-card-${shift.id}`}
                          >
                            {isDraft && (
                              <div className="flex justify-end gap-1 mb-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-white/80 hover:text-white hover:bg-white/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditShiftId(shift.id);
                                  }}
                                  data-testid={`button-edit-shift-${shift.id}`}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-white/80 hover:text-white hover:bg-white/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteShift.mutate(shift.id);
                                  }}
                                  data-testid={`button-delete-shift-${shift.id}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                            
                            <div className="font-medium text-sm truncate">
                              {shift.name || 'Shift'}
                            </div>
                            
                            <div className="flex items-center gap-1 text-xs opacity-90 mt-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(shift.startTime), "h:mm a")} - {format(new Date(shift.endTime), "h:mm a")}
                            </div>
                            
                            {shift.role && (
                              <div className="text-xs opacity-80 mt-1 truncate">
                                {shift.role}
                              </div>
                            )}
                            
                            <Separator className="my-2 bg-white/20" />
                            
                            <div className="flex items-center justify-between gap-1 flex-wrap">
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span className="text-xs">
                                  {activeAssignments.length}/{shift.requiredHeadcount}
                                </span>
                              </div>
                              
                              {isUnfilled && (
                                <Badge 
                                  variant="outline" 
                                  className="bg-orange-100 text-orange-800 border-orange-300 text-xs h-5"
                                >
                                  <AlertCircle className="h-2.5 w-2.5 mr-1" />
                                  Unfilled
                                </Badge>
                              )}
                            </div>
                            
                            {activeAssignments.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {activeAssignments.map((assignment: any) => {
                                  const workerId = assignment.driverId || assignment.employeeId;
                                  const availCheck = isDriverAvailable(workerId, shift);
                                  const hasPtoConflict = !availCheck.available && availCheck.reason?.includes('time off');
                                  
                                  return (
                                    <div 
                                      key={assignment.id}
                                      className="flex items-center justify-between bg-white/20 rounded px-2 py-1"
                                      data-testid={`assignment-${assignment.id}`}
                                    >
                                      <div className="flex items-center gap-1 min-w-0 flex-1">
                                        <span className="text-xs truncate">
                                          {assignment.driver?.firstName || assignment.employee?.firstName || 'Worker'} {(assignment.driver?.lastName || assignment.employee?.lastName || '').charAt(0)}.
                                        </span>
                                        {/* OT Risk Indicator */}
                                        {assignment.driverId && otRiskByDriver.get(assignment.driverId) && (
                                          <Badge 
                                            variant="outline"
                                            className={cn(
                                              "shrink-0 h-4 text-[10px] px-1",
                                              otRiskByDriver.get(assignment.driverId)?.riskLevel === 'high' && "bg-red-100 text-red-700 border-red-300",
                                              otRiskByDriver.get(assignment.driverId)?.riskLevel === 'medium' && "bg-yellow-100 text-yellow-700 border-yellow-300",
                                              otRiskByDriver.get(assignment.driverId)?.riskLevel === 'low' && "bg-green-100 text-green-700 border-green-300"
                                            )}
                                            title={`OT Risk: ${otRiskByDriver.get(assignment.driverId)?.riskLevel?.toUpperCase()} (${otRiskByDriver.get(assignment.driverId)?.projectedHours}h projected)`}
                                            data-testid={`badge-ot-risk-${assignment.id}`}
                                          >
                                            {otRiskByDriver.get(assignment.driverId)?.riskLevel === 'high' && 'OT!'}
                                            {otRiskByDriver.get(assignment.driverId)?.riskLevel === 'medium' && 'OT?'}
                                            {otRiskByDriver.get(assignment.driverId)?.riskLevel === 'low' && 'OK'}
                                          </Badge>
                                        )}
                                        {hasPtoConflict && (
                                          <Badge variant="destructive" className="shrink-0">
                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                            PTO Conflict
                                          </Badge>
                                        )}
                                      </div>
                                      {isDraft && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-4 w-4 shrink-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removeAssignment.mutate(assignment.id);
                                          }}
                                          data-testid={`button-unassign-${assignment.id}`}
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            
                            {isDraft && activeAssignments.length < shift.requiredHeadcount && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full mt-2 h-7 text-xs bg-white/10 hover:bg-white/20 text-white"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedShiftForAssign(shift);
                                  setAssignDriverOpen(true);
                                }}
                                data-testid={`button-assign-driver-${shift.id}`}
                              >
                                <UserPlus className="h-3 w-3 mr-1" />
                                Assign Driver
                              </Button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={createShiftOpen} onOpenChange={setCreateShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Shift</DialogTitle>
            <DialogDescription>
              Add a new shift to the schedule
            </DialogDescription>
          </DialogHeader>
          <Form {...shiftForm}>
            <form onSubmit={shiftForm.handleSubmit((data) => createShift.mutate(data))} className="space-y-4">
              <FormField
                control={shiftForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shift Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Morning Delivery" {...field} data-testid="input-shift-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={shiftForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role / Skill</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Driver, Helper" {...field} data-testid="input-shift-role" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={shiftForm.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Warehouse A" {...field} data-testid="input-shift-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={shiftForm.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel required>Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-shift-date"
                          >
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={shiftForm.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Start Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-start-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={shiftForm.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>End Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-end-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={shiftForm.control}
                  name="requiredHeadcount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Required Workers</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} data-testid="input-headcount" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={shiftForm.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-shift-color">
                            <SelectValue placeholder="Select color" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SHIFT_COLORS.map(color => (
                            <SelectItem key={color.value} value={color.value}>
                              <div className="flex items-center gap-2">
                                <div className={cn("w-3 h-3 rounded", color.bg)} />
                                {color.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={shiftForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional notes..." {...field} data-testid="input-shift-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateShiftOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createShift.isPending} data-testid="button-submit-shift">
                  {createShift.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Shift
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDriverOpen} onOpenChange={setAssignDriverOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Driver to Shift</DialogTitle>
            <DialogDescription>
              {selectedShiftForAssign && (
                <>
                  {selectedShiftForAssign.name || 'Shift'} on {format(new Date(selectedShiftForAssign.startTime), "EEE, MMM d")} at {format(new Date(selectedShiftForAssign.startTime), "h:mm a")}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2 pr-4">
              {drivers.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No drivers available</p>
              )}
              
              {drivers.map((driver: any) => {
                const alreadyAssigned = selectedShiftForAssign?.assignments?.some(
                  (a: any) => a.driverId === driver.id && a.status !== 'cancelled' && a.status !== 'declined'
                );
                
                const availCheck = selectedShiftForAssign ? isDriverAvailable(driver.id, selectedShiftForAssign) : { available: true, reason: null };
                const isBlocked = driver.isBlocked === true;
                const riskTier: string | null = driver.riskTier ?? null;
                const dispatchStatusLabel: string = driver.dispatchStatusLabel ?? "Standard Pool";

                const riskBadgeCfg: Record<string, { cls: string; label: string }> = {
                  low:      { cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", label: "Preferred" },
                  moderate: { cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", label: "Standard" },
                  elevated: { cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", label: "Watch" },
                  high:     { cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", label: "Restricted" },
                  critical: { cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", label: "Do Not Dispatch" },
                };
                const riskBadge = riskTier ? riskBadgeCfg[riskTier] : null;
                
                return (
                  <div
                    key={driver.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border gap-2",
                      alreadyAssigned && "bg-green-50 dark:bg-green-900/20 border-green-200",
                      isBlocked && !alreadyAssigned && "bg-red-50 dark:bg-red-900/20 border-red-200 opacity-75",
                      !availCheck.available && !alreadyAssigned && !isBlocked && "bg-orange-50 dark:bg-orange-900/20 border-orange-200"
                    )}
                    data-testid={`driver-option-${driver.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{driver.firstName} {driver.lastName}</p>
                          {riskBadge && (
                            <span
                              className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", riskBadge.cls)}
                              data-testid={`badge-risk-tier-${driver.id}`}
                            >
                              {riskBadge.label}
                            </span>
                          )}
                        </div>
                        {isBlocked && !alreadyAssigned && (
                          <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            Do Not Dispatch — override required
                          </p>
                        )}
                        {!availCheck.available && !alreadyAssigned && !isBlocked && (
                          <p className="text-xs text-orange-600 flex items-center gap-1 mt-0.5">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            {availCheck.reason}
                          </p>
                        )}
                        {alreadyAssigned && (
                          <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                            <Check className="h-3 w-3 shrink-0" />
                            Already assigned
                          </p>
                        )}
                        {riskTier && !isBlocked && !alreadyAssigned && (
                          <p className="text-xs text-muted-foreground mt-0.5">{dispatchStatusLabel}</p>
                        )}
                      </div>
                    </div>
                    
                    {!alreadyAssigned && (
                      <Button
                        size="sm"
                        variant={isBlocked ? "outline" : availCheck.available ? "default" : "outline"}
                        onClick={() => {
                          if (selectedShiftForAssign && !isBlocked) {
                            createAssignment.mutate({
                              shiftId: selectedShiftForAssign.id,
                              driverId: driver.id,
                            });
                          }
                        }}
                        disabled={createAssignment.isPending || isBlocked}
                        data-testid={`button-assign-${driver.id}`}
                      >
                        {createAssignment.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isBlocked ? (
                          <>
                            <ShieldAlert className="h-4 w-4 mr-1" />
                            Blocked
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4 mr-1" />
                            Assign
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Auto-Fill Dialog */}
      <Dialog open={autoFillOpen} onOpenChange={(open) => {
        setAutoFillOpen(open);
        if (!open) setAutoFillResults(null);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Auto-Fill Schedule
            </DialogTitle>
            <DialogDescription>
              Automatically assign eligible drivers to unfilled shifts using rules-based matching.
            </DialogDescription>
          </DialogHeader>

          {!autoFillResults ? (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-sm">Rule Priority</h4>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Availability match (40% weight)</li>
                  <li>Role/skill eligibility (25% weight)</li>
                  <li>Location match (20% weight)</li>
                  <li>Hours worked fairness (15% weight)</li>
                </ol>
              </div>

              {autoFillPreview && (
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-3">
                    <div className="text-sm text-muted-foreground">Shifts to Fill</div>
                    <div className="text-2xl font-bold">{autoFillPreview.shiftsToFill}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-sm text-muted-foreground">Positions Needed</div>
                    <div className="text-2xl font-bold">{autoFillPreview.positionsToFill}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-sm text-muted-foreground">Eligible Drivers</div>
                    <div className="text-2xl font-bold">{autoFillPreview.eligibleDrivers}</div>
                  </Card>
                  <Card className="p-3">
                    <div className="text-sm text-muted-foreground">Est. Assignments</div>
                    <div className="text-2xl font-bold">{autoFillPreview.estimatedAssignments}</div>
                  </Card>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setAutoFillOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => runAutoFill.mutate()}
                  disabled={runAutoFill.isPending || !autoFillPreview?.positionsToFill}
                  data-testid="button-run-auto-fill"
                >
                  {runAutoFill.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-2 h-4 w-4" />
                      Run Auto-Fill
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-3 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                  <div className="text-sm text-green-700 dark:text-green-400">Assignments Made</div>
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                    {autoFillResults.assignmentsMade}
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="text-sm text-muted-foreground">Positions Remaining</div>
                  <div className="text-2xl font-bold">
                    {autoFillResults.totalPositionsToFill - autoFillResults.assignmentsMade}
                  </div>
                </Card>
              </div>

              {autoFillResults.assignments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Assignments Made</h4>
                  <ScrollArea className="h-48">
                    <div className="space-y-2">
                      {autoFillResults.assignments.map((assignment: any) => (
                        <div 
                          key={assignment.assignmentId}
                          className="p-2 bg-muted/50 rounded text-sm"
                        >
                          <div className="font-medium">{assignment.driverName}</div>
                          <div className="text-muted-foreground text-xs">
                            → {assignment.shiftName}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Score: {assignment.rationale.totalScore}/100 
                            ({assignment.rationale.explanation.slice(0, 2).join(', ')})
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {autoFillResults.unfilledPositions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    Unfilled Positions
                  </h4>
                  <div className="space-y-1">
                    {autoFillResults.unfilledPositions.map((pos: any) => (
                      <div 
                        key={pos.shiftId}
                        className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded text-sm border border-orange-200 dark:border-orange-800"
                      >
                        <div className="font-medium">{pos.shiftName}</div>
                        <div className="text-xs text-muted-foreground">
                          {pos.positionsNeeded} position(s) - {pos.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button onClick={() => {
                  setAutoFillOpen(false);
                  setAutoFillResults(null);
                }}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScheduleDetailDialog({ scheduleId, onClose }: { scheduleId: string; onClose: () => void }) {
  const { data: exportData, isLoading } = useQuery<{
    schedule: any;
    shifts: any[];
    violations: any[];
    summary: any;
  }>({
    queryKey: ["/api/scheduling/schedules", scheduleId, "export"],
  });

  const schedule = exportData?.schedule;
  const shifts = exportData?.shifts || [];
  const violations = exportData?.violations || [];
  const summary = exportData?.summary;

  if (isLoading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <DialogTitle className="text-xl">{schedule?.name}</DialogTitle>
              <DialogDescription>
                {schedule?.startDate && schedule?.endDate && (
                  <>
                    {format(parseISO(schedule.startDate), "MMM d")} - {format(parseISO(schedule.endDate), "MMM d, yyyy")}
                  </>
                )}
              </DialogDescription>
            </div>
            {schedule?.status && <StatusBadge status={schedule.status} />}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Card className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              Shifts
            </div>
            <p className="text-xl font-bold mt-1">{summary?.totalShifts || 0}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserCheck className="h-3 w-3" />
              Assigned
            </div>
            <p className="text-xl font-bold mt-1">{summary?.totalAssignments || 0}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Timer className="h-3 w-3" />
              Hours
            </div>
            <p className="text-xl font-bold mt-1">{summary?.totalHours || 0}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              Unfilled
            </div>
            <p className={cn("text-xl font-bold mt-1", (summary?.unfilledShifts || 0) > 0 && "text-orange-600")}>
              {summary?.unfilledShifts || 0}
            </p>
          </Card>
        </div>

        {violations.length > 0 && (
          <Card className="mb-4 border-orange-200 dark:border-orange-800 p-3">
            <p className="text-sm font-medium text-orange-600 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {violations.length} Violation{violations.length !== 1 ? 's' : ''}
            </p>
          </Card>
        )}

        <div className="space-y-2">
          <h4 className="font-medium">Shifts ({shifts.length})</h4>
          {shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shifts added yet</p>
          ) : (
            <div className="space-y-2">
              {shifts.map((shift: any) => {
                const activeAssignments = (shift.assignments || []).filter(
                  (a: any) => a.status !== 'cancelled' && a.status !== 'declined'
                );
                const isFilled = activeAssignments.length >= shift.requiredHeadcount;
                
                return (
                  <div key={shift.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{shift.name || 'Shift'}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(shift.startTime), "EEE, MMM d")} at {format(new Date(shift.startTime), "h:mm a")} - {format(new Date(shift.endTime), "h:mm a")}
                      </p>
                    </div>
                    <Badge className={isFilled ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}>
                      {activeAssignments.length}/{shift.requiredHeadcount}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Separator className="my-4" />
        
        <AuditLogViewer scheduleId={scheduleId} />
      </DialogContent>
    </Dialog>
  );
}

function ConstraintsTab() {
  const { data: constraints, isLoading } = useQuery<any[]>({
    queryKey: ["/api/scheduling/constraints"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Labor Constraints</h2>
        <p className="text-sm text-muted-foreground">
          These rules are automatically enforced when creating schedules
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {constraints?.map((constraint: any) => (
          <Card key={constraint.id} className="p-4" data-testid={`card-constraint-${constraint.id}`}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="font-medium">{constraint.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {constraint.ruleType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </p>
              </div>
              <Badge variant="outline">
                {constraint.value} {constraint.unit}
              </Badge>
            </div>
          </Card>
        ))}

        {(!constraints || constraints.length === 0) && (
          <Card className="col-span-full p-8 text-center">
            <ClipboardCheck className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No constraints configured yet</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function AvailabilityTab() {
  const { toast } = useToast();
  const [createAvailOpen, setCreateAvailOpen] = useState(false);
  
  const { data: availabilityData, isLoading } = useQuery<any[]>({
    queryKey: ["/api/scheduling/availability"],
  });

  const { data: timeOffData, isLoading: timeOffLoading } = useQuery<any[]>({
    queryKey: ["/api/scheduling/time-off"],
  });

  const deleteAvailability = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/scheduling/availability/${id}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/availability"] });
      toast({ title: "Availability deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const availability = availabilityData || [];
  const timeOff = timeOffData || [];

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (isLoading || timeOffLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold">Availability & Time Off</h2>
          <p className="text-sm text-muted-foreground">
            View and manage worker availability patterns and time-off requests
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Availability Patterns
            </CardTitle>
            <CardDescription>
              Recurring weekly availability windows
            </CardDescription>
          </CardHeader>
          <CardContent>
            {availability.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No availability patterns configured
              </p>
            ) : (
              <div className="space-y-3">
                {availability.map((avail: any) => (
                  <div key={avail.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{dayNames[avail.dayOfWeek]}</p>
                      <p className="text-sm text-muted-foreground">
                        {avail.startTime} - {avail.endTime}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={avail.preference === 'preferred' ? 'default' : avail.preference === 'available' ? 'secondary' : 'destructive'}>
                        {avail.preference}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => deleteAvailability.mutate(avail.id)}
                        data-testid={`button-delete-avail-${avail.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Time-Off Requests
            </CardTitle>
            <CardDescription>
              Blackout dates and time-off requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timeOff.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No time-off requests
              </p>
            ) : (
              <div className="space-y-3">
                {timeOff.map((request: any) => (
                  <div key={request.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">
                        {format(parseISO(request.startDate), "MMM d")} - {format(parseISO(request.endDate), "MMM d, yyyy")}
                      </p>
                      {request.reason && (
                        <p className="text-sm text-muted-foreground">{request.reason}</p>
                      )}
                    </div>
                    <Badge variant={
                      request.status === 'approved' ? 'default' : 
                      request.status === 'denied' ? 'destructive' : 
                      'secondary'
                    }>
                      {request.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


// ============================================================================
// TIME & ATTENDANCE TAB
// ============================================================================

function TimeAttendanceTab() {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<Date | undefined>(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfWeek(new Date(), { weekStartsOn: 0 }));

  const { data: report = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/scheduling/time-attendance", startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', format(startDate, 'yyyy-MM-dd'));
      if (endDate) params.append('endDate', format(endDate, 'yyyy-MM-dd'));
      const res = await fetch(`/api/scheduling/time-attendance?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch attendance data');
      return res.json();
    },
  });

  const detectMissedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/scheduling/detect-missed-shifts');
      return res.json();
    },
    onSuccess: (data) => {
      refetch();
      toast({ title: 'Missed shifts detected', description: `${data.missedCount} shifts marked as missed` });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const stats = useMemo(() => {
    const total = report.length;
    const completed = report.filter((r: any) => r.attendanceStatus === 'completed').length;
    const inProgress = report.filter((r: any) => r.attendanceStatus === 'in_progress').length;
    const missed = report.filter((r: any) => r.attendanceStatus === 'missed').length;
    const pending = report.filter((r: any) => r.attendanceStatus === 'pending').length;
    const totalScheduledHours = report.reduce((sum: number, r: any) => sum + (r.scheduledMinutes || 0) / 60, 0);
    const totalActualHours = report.reduce((sum: number, r: any) => sum + (r.actualMinutes || 0) / 60, 0);
    return { total, completed, inProgress, missed, pending, totalScheduledHours, totalActualHours };
  }, [report]);

  const getVarianceBadge = (variance: number) => {
    if (variance === 0) return <Badge variant="secondary">On Time</Badge>;
    if (variance > 0) return <Badge className="bg-blue-100 text-blue-800">+{Math.round(variance)}m overtime</Badge>;
    return <Badge className="bg-yellow-100 text-yellow-800">{Math.round(variance)}m short</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      completed: { label: 'Completed', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
      in_progress: { label: 'Working', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300' },
      missed: { label: 'Missed', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
      pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
      not_started: { label: 'Not Started', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300' },
    };
    const config = configs[status] || configs.not_started;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold">Time & Attendance</h2>
          <p className="text-sm text-muted-foreground">Track actual vs scheduled work time</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => detectMissedMutation.mutate()} disabled={detectMissedMutation.isPending}>
            {detectMissedMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <AlertCircle className="mr-2 h-4 w-4" />
            Detect Missed Shifts
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <Clock className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total Shifts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.inProgress}</div>
            <div className="text-xs text-muted-foreground">In Progress</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.missed}</div>
            <div className="text-xs text-muted-foreground">Missed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.totalActualHours.toFixed(1)}/{stats.totalScheduledHours.toFixed(1)}h</div>
            <div className="text-xs text-muted-foreground">Actual/Scheduled</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attendance Records</CardTitle>
          <CardDescription>Detailed view of scheduled vs actual work time</CardDescription>
        </CardHeader>
        <CardContent>
          {report.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Timer className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No attendance records for this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Shift</th>
                    <th className="text-left py-2 px-2">Scheduled</th>
                    <th className="text-left py-2 px-2">Actual</th>
                    <th className="text-left py-2 px-2">Variance</th>
                    <th className="text-left py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((record: any) => (
                    <tr key={record.assignmentId} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-2">
                        <div className="font-medium">{record.shiftName || record.role || 'Shift'}</div>
                        <div className="text-xs text-muted-foreground">
                          {record.scheduledStart && format(new Date(record.scheduledStart), 'MMM d, yyyy')}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <div>{record.scheduledStart && format(new Date(record.scheduledStart), 'h:mm a')}</div>
                        <div className="text-xs text-muted-foreground">
                          to {record.scheduledEnd && format(new Date(record.scheduledEnd), 'h:mm a')}
                        </div>
                        <div className="text-xs font-medium">{(record.scheduledMinutes / 60).toFixed(1)}h</div>
                      </td>
                      <td className="py-2 px-2">
                        {record.clockInTime ? (
                          <>
                            <div>{format(new Date(record.clockInTime), 'h:mm a')}</div>
                            <div className="text-xs text-muted-foreground">
                              {record.clockOutTime ? `to ${format(new Date(record.clockOutTime), 'h:mm a')}` : 'still working'}
                            </div>
                            <div className="text-xs font-medium">{(record.actualMinutes / 60).toFixed(1)}h</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {record.attendanceStatus === 'completed' && record.varianceMinutes !== undefined ? (
                          getVarianceBadge(record.varianceMinutes)
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2">{getStatusBadge(record.attendanceStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Geofence Violations Section */}
      <GeofenceViolationsReport />
      
      {/* Overtime Alerts Section */}
      <OvertimeAlertsReport />
    </div>
  );
}

// ==================== TEMPLATES TAB ====================

type ShiftTemplate = {
  id: string;
  name: string;
  description?: string;
  locationId?: string;
  locationName?: string;
  role?: string;
  startTime: string;
  endTime: string;
  breakDuration?: number;
  requiredHeadcount?: number;
  color?: string;
  notes?: string;
  isActive?: boolean;
  createdAt?: string;
};

type RecurringPattern = {
  id: string;
  name: string;
  description?: string;
  isActive?: boolean;
  createdAt?: string;
  mappings?: Array<{
    id: string;
    templateId: string;
    dayOfWeek: string;
    template?: ShiftTemplate;
  }>;
};

const templateFormSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  locationName: z.string().optional(),
  role: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  requiredHeadcount: z.coerce.number().min(1).default(1),
  color: z.string().optional(),
  notes: z.string().optional(),
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

function TemplatesTab() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState<ShiftTemplate | null>(null);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  
  const [showPatternDialog, setShowPatternDialog] = useState(false);
  const [editingPattern, setEditingPattern] = useState<RecurringPattern | null>(null);
  const [showApplyPatternDialog, setShowApplyPatternDialog] = useState(false);
  const [applyingPattern, setApplyingPattern] = useState<RecurringPattern | null>(null);
  const [patternWeekStart, setPatternWeekStart] = useState<Date | undefined>(undefined);

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      locationName: "",
      role: "",
      startTime: "09:00",
      endTime: "17:00",
      requiredHeadcount: 1,
      color: "#3B82F6",
      notes: "",
    },
  });

  // Fetch templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery<ShiftTemplate[]>({
    queryKey: ["/api/scheduling/templates"],
  });

  // Fetch patterns
  const { data: patterns = [], isLoading: patternsLoading } = useQuery<RecurringPattern[]>({
    queryKey: ["/api/scheduling/patterns"],
  });

  // Fetch schedules for applying templates
  const { data: schedules = [] } = useQuery<any[]>({
    queryKey: ["/api/scheduling/schedules"],
    select: (data: any) => data?.schedules || [],
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      const res = await apiRequest("POST", "/api/scheduling/templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/templates"] });
      toast({ title: "Template created successfully" });
      setShowCreateDialog(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Failed to create template", description: error.message, variant: "destructive" });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TemplateFormData> }) => {
      const res = await apiRequest("PATCH", `/api/scheduling/templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/templates"] });
      toast({ title: "Template updated successfully" });
      setEditingTemplate(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Failed to update template", description: error.message, variant: "destructive" });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/scheduling/templates/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/templates"] });
      toast({ title: "Template deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete template", description: error.message, variant: "destructive" });
    },
  });

  // Apply template mutation
  const applyTemplateMutation = useMutation({
    mutationFn: async ({ templateId, scheduleId, dates }: { templateId: string; scheduleId: string; dates: Date[] }) => {
      const res = await apiRequest("POST", `/api/scheduling/templates/${templateId}/apply`, { scheduleId, dates: dates.map(d => d.toISOString()) });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules"] });
      toast({ title: `Created ${data.count} shift(s) from template` });
      setShowApplyDialog(false);
      setApplyingTemplate(null);
      setSelectedDates([]);
      setSelectedScheduleId("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to apply template", description: error.message, variant: "destructive" });
    },
  });

  // Create pattern mutation
  const createPatternMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await apiRequest("POST", "/api/scheduling/patterns", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/patterns"] });
      toast({ title: "Pattern created successfully" });
      setShowPatternDialog(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create pattern", description: error.message, variant: "destructive" });
    },
  });

  // Delete pattern mutation
  const deletePatternMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/scheduling/patterns/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/patterns"] });
      toast({ title: "Pattern deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete pattern", description: error.message, variant: "destructive" });
    },
  });

  // Apply pattern mutation
  const applyPatternMutation = useMutation({
    mutationFn: async ({ patternId, scheduleId, weekStartDate }: { patternId: string; scheduleId: string; weekStartDate: Date }) => {
      const res = await apiRequest("POST", `/api/scheduling/patterns/${patternId}/apply`, { scheduleId, weekStartDate: weekStartDate.toISOString() });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules"] });
      toast({ title: `Created ${data.count} shift(s) from pattern` });
      setShowApplyPatternDialog(false);
      setApplyingPattern(null);
      setPatternWeekStart(undefined);
      setSelectedScheduleId("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to apply pattern", description: error.message, variant: "destructive" });
    },
  });

  const handleEditTemplate = (template: ShiftTemplate) => {
    setEditingTemplate(template);
    form.reset({
      name: template.name,
      description: template.description || "",
      locationName: template.locationName || "",
      role: template.role || "",
      startTime: template.startTime,
      endTime: template.endTime,
      requiredHeadcount: template.requiredHeadcount || 1,
      color: template.color || "#3B82F6",
      notes: template.notes || "",
    });
  };

  const handleSubmit = (data: TemplateFormData) => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createTemplateMutation.mutate(data);
    }
  };

  const handleApplyTemplate = (template: ShiftTemplate) => {
    setApplyingTemplate(template);
    setShowApplyDialog(true);
  };

  const handleApplyPattern = (pattern: RecurringPattern) => {
    setApplyingPattern(pattern);
    setShowApplyPatternDialog(true);
  };

  const draftSchedules = schedules.filter((s: any) => s.status === "draft");
  const activeTemplates = (templates || []).filter((t: ShiftTemplate) => t.isActive !== false);
  const activePatterns = (patterns || []).filter((p: RecurringPattern) => p.isActive !== false);

  return (
    <div className="space-y-6">
      {/* Shift Templates Section */}
      <Card data-testid="card-shift-templates">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileStack className="h-5 w-5" />
              Shift Templates
            </CardTitle>
            <CardDescription>
              Create reusable shift templates to quickly generate schedules
            </CardDescription>
          </div>
          <Button onClick={() => { form.reset(); setShowCreateDialog(true); }} data-testid="button-create-template">
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </CardHeader>
        <CardContent>
          {templatesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeTemplates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileStack className="mx-auto h-12 w-12 mb-2 opacity-50" />
              <p>No templates created yet</p>
              <p className="text-sm">Create a template to speed up schedule building</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeTemplates.map((template: ShiftTemplate) => (
                <Card key={template.id} className="hover-elevate" data-testid={`card-template-${template.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: template.color || "#3B82F6" }}
                        />
                        <CardTitle className="text-base">{template.name}</CardTitle>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={() => handleApplyTemplate(template)}
                          data-testid={`button-apply-template-${template.id}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={() => handleEditTemplate(template)}
                          data-testid={`button-edit-template-${template.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => deleteTemplateMutation.mutate(template.id)}
                          data-testid={`button-delete-template-${template.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>{template.startTime} - {template.endTime}</span>
                      </div>
                      {template.role && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>{template.role}</span>
                        </div>
                      )}
                      {template.locationName && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          <span>{template.locationName}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>{template.requiredHeadcount || 1} staff required</span>
                      </div>
                      {template.description && (
                        <p className="text-xs mt-2">{template.description}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recurring Patterns Section */}
      <Card data-testid="card-recurring-patterns">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Repeat className="h-5 w-5" />
              Recurring Patterns
            </CardTitle>
            <CardDescription>
              Define weekly rotation patterns to apply templates automatically
            </CardDescription>
          </div>
          <Button onClick={() => setShowPatternDialog(true)} data-testid="button-create-pattern">
            <Plus className="mr-2 h-4 w-4" />
            Create Pattern
          </Button>
        </CardHeader>
        <CardContent>
          {patternsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activePatterns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Repeat className="mx-auto h-12 w-12 mb-2 opacity-50" />
              <p>No recurring patterns created yet</p>
              <p className="text-sm">Create patterns to apply templates across multiple days</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activePatterns.map((pattern: RecurringPattern) => (
                <Card key={pattern.id} className="hover-elevate" data-testid={`card-pattern-${pattern.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{pattern.name}</CardTitle>
                      <div className="flex gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => handleApplyPattern(pattern)}
                          data-testid={`button-apply-pattern-${pattern.id}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => deletePatternMutation.mutate(pattern.id)}
                          data-testid={`button-delete-pattern-${pattern.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      {pattern.description && <p>{pattern.description}</p>}
                      <p className="text-xs">
                        {pattern.mappings?.length || 0} template mappings
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Template Dialog */}
      <Dialog open={showCreateDialog || !!editingTemplate} onOpenChange={(open) => {
        if (!open) { setShowCreateDialog(false); setEditingTemplate(null); form.reset(); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Shift Template"}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? "Update the template details" : "Define a reusable shift template"}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Template Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Morning Shift" {...field} data-testid="input-template-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional description..." {...field} data-testid="input-template-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Start Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-template-start-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>End Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-template-end-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Driver" {...field} data-testid="input-template-role" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="requiredHeadcount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Required Staff</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} data-testid="input-template-headcount" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="locationName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Warehouse A" {...field} data-testid="input-template-location" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input type="color" className="w-12 h-10 p-1" {...field} data-testid="input-template-color" />
                        <Input value={field.value} onChange={field.onChange} placeholder="#3B82F6" className="flex-1" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setShowCreateDialog(false); setEditingTemplate(null); form.reset(); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending} data-testid="button-save-template">
                  {(createTemplateMutation.isPending || updateTemplateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingTemplate ? "Update" : "Create"} Template
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Apply Template Dialog */}
      <Dialog open={showApplyDialog} onOpenChange={(open) => { if (!open) { setShowApplyDialog(false); setApplyingTemplate(null); setSelectedDates([]); setSelectedScheduleId(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Apply Template: {applyingTemplate?.name}</DialogTitle>
            <DialogDescription>
              Select a schedule and dates to create shifts from this template
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Schedule</label>
              <Select value={selectedScheduleId} onValueChange={setSelectedScheduleId}>
                <SelectTrigger data-testid="select-apply-schedule">
                  <SelectValue placeholder="Select a draft schedule" />
                </SelectTrigger>
                <SelectContent>
                  {draftSchedules.map((schedule: any) => (
                    <SelectItem key={schedule.id} value={schedule.id}>
                      {schedule.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {draftSchedules.length === 0 && (
                <p className="text-sm text-muted-foreground">No draft schedules available. Create a schedule first.</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Dates</label>
              <Calendar
                mode="multiple"
                selected={selectedDates}
                onSelect={(dates) => setSelectedDates(dates || [])}
                className="rounded-md border"
              />
              <p className="text-sm text-muted-foreground">
                {selectedDates.length} date(s) selected
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowApplyDialog(false); setApplyingTemplate(null); setSelectedDates([]); setSelectedScheduleId(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={() => applyingTemplate && applyTemplateMutation.mutate({ 
                templateId: applyingTemplate.id, 
                scheduleId: selectedScheduleId, 
                dates: selectedDates 
              })}
              disabled={!selectedScheduleId || selectedDates.length === 0 || applyTemplateMutation.isPending}
              data-testid="button-confirm-apply-template"
            >
              {applyTemplateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create {selectedDates.length} Shift(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Pattern Dialog */}
      <Dialog open={showPatternDialog} onOpenChange={setShowPatternDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Recurring Pattern</DialogTitle>
            <DialogDescription>
              Define a weekly pattern to apply multiple templates
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            createPatternMutation.mutate({
              name: formData.get("name") as string,
              description: formData.get("description") as string,
            });
          }} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Pattern Name</label>
              <Input name="name" placeholder="e.g., Standard Work Week" required data-testid="input-pattern-name" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea name="description" placeholder="Optional description..." data-testid="input-pattern-description" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowPatternDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createPatternMutation.isPending} data-testid="button-save-pattern">
                {createPatternMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Pattern
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Apply Pattern Dialog */}
      <Dialog open={showApplyPatternDialog} onOpenChange={(open) => { if (!open) { setShowApplyPatternDialog(false); setApplyingPattern(null); setPatternWeekStart(undefined); setSelectedScheduleId(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Apply Pattern: {applyingPattern?.name}</DialogTitle>
            <DialogDescription>
              Select a schedule and week start date to generate shifts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Schedule</label>
              <Select value={selectedScheduleId} onValueChange={setSelectedScheduleId}>
                <SelectTrigger data-testid="select-apply-pattern-schedule">
                  <SelectValue placeholder="Select a draft schedule" />
                </SelectTrigger>
                <SelectContent>
                  {draftSchedules.map((schedule: any) => (
                    <SelectItem key={schedule.id} value={schedule.id}>
                      {schedule.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Week Start Date (Sunday)</label>
              <Calendar
                mode="single"
                selected={patternWeekStart}
                onSelect={setPatternWeekStart}
                className="rounded-md border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowApplyPatternDialog(false); setApplyingPattern(null); setPatternWeekStart(undefined); setSelectedScheduleId(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={() => applyingPattern && patternWeekStart && applyPatternMutation.mutate({ 
                patternId: applyingPattern.id, 
                scheduleId: selectedScheduleId, 
                weekStartDate: patternWeekStart 
              })}
              disabled={!selectedScheduleId || !patternWeekStart || applyPatternMutation.isPending}
              data-testid="button-confirm-apply-pattern"
            >
              {applyPatternMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Week Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OvertimeAlertsReport() {
  const { data: schedules = [] } = useQuery<any[]>({
    queryKey: ["/api/scheduling/schedules"],
    select: (data: any) => data?.schedules || [],
  });

  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  const { data: alertsData, isLoading } = useQuery<{
    alerts: Array<{
      workerId: string;
      workerName: string;
      violationType: 'daily_hours' | 'weekly_hours' | 'rest_period';
      severity: 'warning' | 'error';
      currentValue: number;
      threshold: number;
      message: string;
    }>;
    summary: {
      totalAlerts: number;
      warnings: number;
      errors: number;
    };
  }>({
    queryKey: ["/api/scheduling/schedules", selectedScheduleId, "alerts"],
    enabled: !!selectedScheduleId,
  });

  const activeSchedules = schedules.filter((s: any) => s.status === 'published' || s.status === 'draft');

  const alerts = alertsData?.alerts || [];
  const summary = alertsData?.summary || { totalAlerts: 0, warnings: 0, errors: 0 };

  return (
    <Card data-testid="card-overtime-alerts">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Overtime & Labor Compliance Alerts
        </CardTitle>
        <CardDescription>
          Monitor overtime hours and rest period violations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Label>Select Schedule</Label>
          <Select
            value={selectedScheduleId || ""}
            onValueChange={(value) => setSelectedScheduleId(value || null)}
          >
            <SelectTrigger className="mt-1" data-testid="select-schedule-for-alerts">
              <SelectValue placeholder="Select a schedule..." />
            </SelectTrigger>
            <SelectContent>
              {activeSchedules.map((schedule: any) => (
                <SelectItem 
                  key={schedule.id} 
                  value={schedule.id}
                  data-testid={`option-schedule-${schedule.id}`}
                >
                  {schedule.name} ({schedule.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedScheduleId ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-schedule-selected">
            <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Select a schedule to view labor compliance alerts</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-32" data-testid="loading-alerts">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : summary.totalAlerts === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-alerts">
            <Check className="h-12 w-12 mx-auto mb-3 opacity-50 text-green-500" />
            <p>No labor compliance alerts for this schedule</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center" data-testid="stat-total-alerts">
                <div className="text-2xl font-bold">{summary.totalAlerts}</div>
                <div className="text-xs text-muted-foreground">Total Alerts</div>
              </div>
              <div className="text-center" data-testid="stat-warnings">
                <div className="text-2xl font-bold text-amber-600">{summary.warnings}</div>
                <div className="text-xs text-muted-foreground">Warnings</div>
              </div>
              <div className="text-center" data-testid="stat-critical">
                <div className="text-2xl font-bold text-red-600">{summary.errors}</div>
                <div className="text-xs text-muted-foreground">Critical</div>
              </div>
            </div>

            <div className="space-y-2">
              {alerts.map((alert, idx) => (
                <div 
                  key={idx}
                  data-testid={`alert-row-${idx}`}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-md text-sm border",
                    alert.severity === 'error' 
                      ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800" 
                      : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
                  )}
                >
                  {alert.severity === 'error' ? (
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium",
                      alert.severity === 'error' 
                        ? "text-red-800 dark:text-red-300" 
                        : "text-amber-800 dark:text-amber-300"
                    )}>
                      {alert.workerName}
                    </p>
                    <p className={cn(
                      "text-xs mt-1",
                      alert.severity === 'error' 
                        ? "text-red-700 dark:text-red-400" 
                        : "text-amber-700 dark:text-amber-400"
                    )}>
                      {alert.message}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs",
                          alert.severity === 'error' 
                            ? "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300" 
                            : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
                        )}
                      >
                        {alert.violationType === 'daily_hours' && 'Daily Hours'}
                        {alert.violationType === 'weekly_hours' && 'Weekly Hours'}
                        {alert.violationType === 'rest_period' && 'Rest Period'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Current: {alert.currentValue.toFixed(1)}h | Threshold: {alert.threshold}h
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GeofenceViolationsReport() {
  const [startDate, setStartDate] = useState<Date | undefined>(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfWeek(new Date(), { weekStartsOn: 0 }));

  const { data: violations = [], isLoading } = useQuery<Array<{
    id: string;
    assignmentId: string;
    actionType: 'clock_in' | 'clock_out';
    latitude: string;
    longitude: string;
    locationLatitude: string;
    locationLongitude: string;
    distanceMeters: number;
    wasOverridden: boolean;
    overrideReason: string | null;
    workerName: string;
    locationName: string;
    createdAt: string;
  }>>({
    queryKey: ["/api/scheduling/geofence-violations", startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', format(startDate, 'yyyy-MM-dd'));
      if (endDate) params.append('endDate', format(endDate, 'yyyy-MM-dd'));
      const res = await fetch(`/api/scheduling/geofence-violations?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch geofence violations');
      return res.json();
    },
  });

  const stats = useMemo(() => {
    const total = violations.length;
    const overridden = violations.filter(v => v.wasOverridden).length;
    const blocked = violations.filter(v => !v.wasOverridden).length;
    const avgDistance = violations.length > 0 
      ? violations.reduce((sum, v) => sum + v.distanceMeters, 0) / violations.length 
      : 0;
    return { total, overridden, blocked, avgDistance };
  }, [violations]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Geofence Violations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Geofence Violations
        </CardTitle>
        <CardDescription>
          Clock-in/out attempts from outside designated work locations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total Violations</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.overridden}</div>
            <div className="text-xs text-muted-foreground">Overridden</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.blocked}</div>
            <div className="text-xs text-muted-foreground">Blocked</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{Math.round(stats.avgDistance)}m</div>
            <div className="text-xs text-muted-foreground">Avg Distance</div>
          </div>
        </div>

        {violations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No geofence violations recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Worker</th>
                  <th className="text-left py-2 px-2">Location</th>
                  <th className="text-left py-2 px-2">Action</th>
                  <th className="text-left py-2 px-2">Distance</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {violations.slice(0, 20).map((violation) => (
                  <tr key={violation.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-2 font-medium">{violation.workerName || 'Unknown'}</td>
                    <td className="py-2 px-2 text-muted-foreground">{violation.locationName || 'Unknown'}</td>
                    <td className="py-2 px-2">
                      <Badge variant="outline" className="text-xs">
                        {violation.actionType === 'clock_in' ? 'Clock In' : 'Clock Out'}
                      </Badge>
                    </td>
                    <td className="py-2 px-2">
                      <span className="text-red-600 font-medium">{Math.round(violation.distanceMeters)}m</span>
                    </td>
                    <td className="py-2 px-2">
                      {violation.wasOverridden ? (
                        <div>
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            Overridden
                          </Badge>
                          {violation.overrideReason && (
                            <div className="text-xs text-muted-foreground mt-1 max-w-32 truncate" title={violation.overrideReason}>
                              {violation.overrideReason}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge variant="destructive">Blocked</Badge>
                      )}
                    </td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">
                      {format(new Date(violation.createdAt), 'MMM d, h:mm a')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {violations.length > 20 && (
              <p className="text-center text-sm text-muted-foreground py-2">
                Showing 20 of {violations.length} violations
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compliance Alerts Tab - OT Alerts & Break Intelligence
function ComplianceAlertsTab() {
  const { toast } = useToast();
  const [alertsView, setAlertsView] = useState<"ot" | "breaks" | "projected">("ot");
  const [projectedWeekFilter, setProjectedWeekFilter] = useState<string>("");
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [configType, setConfigType] = useState<"ot" | "break">("ot");
  
  // Fetch OT alert configs
  const { data: otConfigs, isLoading: loadingOtConfigs } = useQuery<any[]>({
    queryKey: ["/api/corporate/scheduling/ot-alerts/configs"],
  });
  
  // Fetch OT alert logs
  const { data: otLogs, isLoading: loadingOtLogs } = useQuery<any[]>({
    queryKey: ["/api/corporate/scheduling/ot-alerts/logs", { limit: 50 }],
  });
  
  // Fetch break rule configs
  const { data: breakConfigs, isLoading: loadingBreakConfigs } = useQuery<any[]>({
    queryKey: ["/api/corporate/scheduling/break-rules/configs"],
  });
  
  // Fetch break alert logs  
  const { data: breakLogs, isLoading: loadingBreakLogs } = useQuery<any[]>({
    queryKey: ["/api/corporate/scheduling/break-alerts/logs", { limit: 50 }],
  });

  const acknowledgeOtMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/corporate/scheduling/ot-alerts/logs/${id}/acknowledge`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/ot-alerts/logs"] });
      toast({ title: "Alert acknowledged" });
    },
  });

  const acknowledgeBreakMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/corporate/scheduling/break-alerts/logs/${id}/acknowledge`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/break-alerts/logs"] });
      toast({ title: "Alert acknowledged" });
    },
  });

  // Fetch projected OT alerts
  const { data: projectedAlerts, isLoading: loadingProjected, refetch: refetchProjected } = useQuery<any[]>({
    queryKey: ["/api/scheduling/ot-alerts/projected", projectedWeekFilter],
    queryFn: async () => {
      const params = projectedWeekFilter ? `?week_start=${projectedWeekFilter}` : "";
      const res = await fetch(`/api/scheduling/ot-alerts/projected${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch projected OT alerts");
      return res.json();
    },
  });

  const acknowledgeProjectedMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/scheduling/ot-alerts/projected/${id}/acknowledge`);
      if (!res.ok) throw new Error("Failed to acknowledge alert");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/ot-alerts/projected"] });
      toast({ title: "Alert acknowledged" });
    },
    onError: (e: any) => toast({ title: "Failed to acknowledge", description: e.message, variant: "destructive" }),
  });

  const resolveProjectedMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/scheduling/ot-alerts/projected/${id}/resolve`);
      if (!res.ok) throw new Error("Failed to resolve alert");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/ot-alerts/projected"] });
      toast({ title: "Alert resolved" });
    },
    onError: (e: any) => toast({ title: "Failed to resolve", description: e.message, variant: "destructive" }),
  });

  // Config form state
  const [otConfigForm, setOtConfigForm] = useState({
    name: "Default OT Thresholds",
    threshold1HoursRemaining: "8",
    threshold2HoursRemaining: "4",
    weeklyOtThresholdHours: "40",
  });
  
  const [breakConfigForm, setBreakConfigForm] = useState({
    name: "Default Break Rules",
    minHoursWorkedForBreak: "4",
    requiredBreakDuration: 30,
    breakApproachingAlertMinutes: 30,
    breakOverdueAlertMinutes: 15,
  });

  // Create OT config mutation
  const createOtConfigMutation = useMutation({
    mutationFn: async (data: typeof otConfigForm) => {
      const res = await apiRequest("POST", "/api/corporate/scheduling/ot-alerts/configs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/ot-alerts/configs"] });
      toast({ title: "OT configuration saved", description: "Alert thresholds updated successfully" });
      setShowConfigDialog(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save OT configuration", variant: "destructive" });
    },
  });

  // Create break config mutation
  const createBreakConfigMutation = useMutation({
    mutationFn: async (data: typeof breakConfigForm) => {
      const res = await apiRequest("POST", "/api/corporate/scheduling/break-rules/configs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/break-rules/configs"] });
      toast({ title: "Break configuration saved", description: "Break rules updated successfully" });
      setShowConfigDialog(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save break configuration", variant: "destructive" });
    },
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-red-600 bg-red-50 border-red-200";
      case "warning": return "text-amber-600 bg-amber-50 border-amber-200";
      default: return "text-blue-600 bg-blue-50 border-blue-200";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "acknowledged": return <Badge variant="secondary">Acknowledged</Badge>;
      case "sent": return <Badge variant="outline">Sent</Badge>;
      case "pending": return <Badge variant="destructive">Pending</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Compliance Alerts</h2>
          <p className="text-sm text-muted-foreground">
            Monitor overtime thresholds and break compliance for drivers
          </p>
        </div>
        <Button onClick={() => setShowConfigDialog(true)} data-testid="btn-configure-alerts">
          <Settings className="mr-2 h-4 w-4" />
          Configure Rules
        </Button>
      </div>

      <div className="flex gap-4">
        <Button 
          variant={alertsView === "ot" ? "default" : "outline"}
          onClick={() => setAlertsView("ot")}
          data-testid="btn-ot-alerts-view"
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          OT Alerts ({otLogs?.filter(l => l.status === 'pending').length || 0})
        </Button>
        <Button 
          variant={alertsView === "breaks" ? "default" : "outline"}
          onClick={() => setAlertsView("breaks")}
          data-testid="btn-break-alerts-view"
        >
          <Coffee className="mr-2 h-4 w-4" />
          Break Alerts ({breakLogs?.filter(l => l.status === 'pending').length || 0})
        </Button>
        <Button
          variant={alertsView === "projected" ? "default" : "outline"}
          onClick={() => setAlertsView("projected")}
          data-testid="btn-projected-ot-view"
        >
          <TrendingUp className="mr-2 h-4 w-4" />
          Projected OT ({projectedAlerts?.filter((a: any) => a.ackStatus === 'new' && a.status !== 'under_threshold').length || 0})
        </Button>
      </div>

      {alertsView === "projected" ? (
        <Card data-testid="card-projected-ot-alerts">
          <CardHeader>
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-orange-500" />
                  Projected Overtime Alerts
                </CardTitle>
                <CardDescription>
                  Computed per-employee per-week — hourly cron. Acknowledge to track review; resolve when no action needed.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="text-sm border rounded-md px-2 py-1 h-9 bg-background"
                  value={projectedWeekFilter}
                  onChange={e => setProjectedWeekFilter(e.target.value)}
                  placeholder="Filter by week start"
                  data-testid="input-projected-week-filter"
                />
                {projectedWeekFilter && (
                  <Button size="sm" variant="outline" onClick={() => setProjectedWeekFilter("")} data-testid="btn-clear-week-filter">
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingProjected ? (
              <div className="flex justify-center py-8">
                <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !projectedAlerts || projectedAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No projected OT alerts</p>
                <p className="text-sm">The hourly scan will populate alerts when employees are on track to exceed their threshold.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {projectedAlerts.map((alert: any) => {
                  const projHours = parseFloat(alert.projectedTotalHours || 0);
                  const otHours = parseFloat(alert.projectedOtHours || 0);
                  const threshold = parseFloat(alert.otThreshold || 40);
                  const isWarning = alert.status === "warning";
                  const isOver = alert.status === "over_threshold";
                  const borderColor = isOver ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20"
                    : isWarning ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20"
                    : "border-border bg-muted/30";
                  return (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-lg border ${borderColor}`}
                      data-testid={`projected-ot-alert-${alert.id}`}
                    >
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{alert.employeeName}</span>
                            {isOver && <Badge variant="destructive">Over Threshold</Badge>}
                            {isWarning && <Badge className="bg-amber-500 text-white">Warning</Badge>}
                            {!isOver && !isWarning && <Badge variant="secondary">Under Threshold</Badge>}
                            {alert.ackStatus === "acknowledged" && (
                              <Badge variant="outline" data-testid={`ack-badge-${alert.id}`}>Acknowledged</Badge>
                            )}
                            {alert.ackStatus === "resolved" && (
                              <Badge variant="secondary" data-testid={`resolved-badge-${alert.id}`}>Resolved</Badge>
                            )}
                          </div>
                          <div className="flex gap-4 text-sm text-muted-foreground flex-wrap">
                            <span>Week of {alert.weekStart}</span>
                            <span>Worked: <strong>{parseFloat(alert.workedHours || 0).toFixed(1)}h</strong></span>
                            <span>Remaining sched: <strong>{parseFloat(alert.remainingScheduledHours || 0).toFixed(1)}h</strong></span>
                            <span>Projected: <strong>{projHours.toFixed(1)}h</strong> / {threshold}h threshold</span>
                            {otHours > 0 && <span className="text-red-600 dark:text-red-400 font-medium">+{otHours.toFixed(1)}h OT</span>}
                          </div>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            <span>Source: {alert.dataSource}</span>
                            {alert.lastComputedAt && <span>Computed: {new Date(alert.lastComputedAt).toLocaleString()}</span>}
                            {alert.lastNotifiedManagerAt && <span>Mgr notified: {new Date(alert.lastNotifiedManagerAt).toLocaleString()}</span>}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {alert.ackStatus === "new" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => acknowledgeProjectedMutation.mutate(alert.id)}
                              disabled={acknowledgeProjectedMutation.isPending}
                              data-testid={`btn-ack-projected-${alert.id}`}
                            >
                              Acknowledge
                            </Button>
                          )}
                          {alert.ackStatus !== "resolved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resolveProjectedMutation.mutate(alert.id)}
                              disabled={resolveProjectedMutation.isPending}
                              data-testid={`btn-resolve-projected-${alert.id}`}
                            >
                              Resolve
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : alertsView === "ot" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Overtime Alert Log
            </CardTitle>
            <CardDescription>
              Tiered alerts based on hours remaining until overtime threshold (8hr → Dispatch, 4hr → Management, 0hr → Critical)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingOtLogs ? (
              <div className="flex justify-center py-8">
                <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !otLogs || otLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No OT alerts triggered yet</p>
                <p className="text-sm">Alerts will appear when drivers approach OT thresholds</p>
              </div>
            ) : (
              <div className="space-y-3">
                {otLogs.slice(0, 20).map((log: any) => (
                  <div 
                    key={log.id} 
                    className={`p-4 rounded-lg border ${getSeverityColor(log.severity)}`}
                    data-testid={`ot-alert-${log.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{log.title}</span>
                          {getStatusBadge(log.status)}
                          <Badge variant="outline" className="text-xs">
                            {log.recipientType}
                          </Badge>
                        </div>
                        <p className="text-sm">{log.message}</p>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>Driver: {log.driverId?.substring(0, 8)}...</span>
                          <span>Hours worked: {parseFloat(log.hoursWorked || 0).toFixed(1)}h</span>
                          <span>Remaining: {parseFloat(log.hoursRemaining || 0).toFixed(1)}h</span>
                          <span>{new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      {log.status === 'pending' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => acknowledgeOtMutation.mutate(log.id)}
                          disabled={acknowledgeOtMutation.isPending}
                          data-testid={`btn-ack-ot-${log.id}`}
                        >
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5 text-green-500" />
              Break Compliance Log
            </CardTitle>
            <CardDescription>
              Alerts for approaching and overdue breaks based on hours worked
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingBreakLogs ? (
              <div className="flex justify-center py-8">
                <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !breakLogs || breakLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Coffee className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No break alerts triggered yet</p>
                <p className="text-sm">Alerts will appear when drivers are due for breaks</p>
              </div>
            ) : (
              <div className="space-y-3">
                {breakLogs.slice(0, 20).map((log: any) => (
                  <div 
                    key={log.id} 
                    className={`p-4 rounded-lg border ${getSeverityColor(log.severity)}`}
                    data-testid={`break-alert-${log.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{log.title}</span>
                          {getStatusBadge(log.status)}
                          <Badge variant="outline" className="text-xs">
                            {log.recipientType}
                          </Badge>
                        </div>
                        <p className="text-sm">{log.message}</p>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>Driver: {log.driverId?.substring(0, 8)}...</span>
                          <span>Hours worked: {parseFloat(log.hoursWorked || 0).toFixed(1)}h</span>
                          {log.minutesUntilBreakDue && <span>Due in: {log.minutesUntilBreakDue} min</span>}
                          {log.minutesOverdue && <span>Overdue: {log.minutesOverdue} min</span>}
                          <span>{new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      {log.status === 'pending' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => acknowledgeBreakMutation.mutate(log.id)}
                          disabled={acknowledgeBreakMutation.isPending}
                          data-testid={`btn-ack-break-${log.id}`}
                        >
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* OT Alert Configuration Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Active Alert Configurations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">OT Alert Thresholds</h4>
              {loadingOtConfigs ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : !otConfigs || otConfigs.length === 0 ? (
                <div className="p-4 border rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Using default thresholds:</p>
                  <ul className="text-xs mt-2 space-y-1">
                    <li>• 8 hours remaining → Notify Dispatch (Info)</li>
                    <li>• 4 hours remaining → Notify Management (Warning)</li>
                    <li>• 0 hours (OT reached) → Flag & Notify All (Critical)</li>
                    <li>• Weekly OT threshold: 40 hours</li>
                  </ul>
                </div>
              ) : (
                otConfigs.map((config: any) => (
                  <div key={config.id} className="p-4 border rounded-lg">
                    <p className="font-medium">{config.name}</p>
                    <ul className="text-xs mt-1 space-y-1 text-muted-foreground">
                      <li>Threshold 1: {config.threshold1HoursRemaining}h → {config.threshold1Recipients?.join(', ')}</li>
                      <li>Threshold 2: {config.threshold2HoursRemaining}h → {config.threshold2Recipients?.join(', ')}</li>
                      <li>OT Limit: {config.weeklyOtThresholdHours}h</li>
                    </ul>
                  </div>
                ))
              )}
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Break Rule Configuration</h4>
              {loadingBreakConfigs ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : !breakConfigs || breakConfigs.length === 0 ? (
                <div className="p-4 border rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Using default rules:</p>
                  <ul className="text-xs mt-2 space-y-1">
                    <li>• Break required after 4 hours worked</li>
                    <li>• Minimum break duration: 30 minutes</li>
                    <li>• Approaching alert: 30 min before due</li>
                    <li>• Overdue alert: 15 min after due</li>
                  </ul>
                </div>
              ) : (
                breakConfigs.map((config: any) => (
                  <div key={config.id} className="p-4 border rounded-lg">
                    <p className="font-medium">{config.name}</p>
                    <ul className="text-xs mt-1 space-y-1 text-muted-foreground">
                      <li>Break after: {config.minHoursWorkedForBreak}h worked</li>
                      <li>Duration: {config.requiredBreakDuration} min</li>
                      <li>Approaching alert: {config.breakApproachingAlertMinutes} min before</li>
                      <li>Overdue alert: {config.breakOverdueAlertMinutes} min after</li>
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configure Alert Rules</DialogTitle>
            <DialogDescription>
              Set thresholds for OT alerts and break compliance rules
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="flex gap-4">
              <Button 
                variant={configType === "ot" ? "default" : "outline"} 
                onClick={() => setConfigType("ot")}
                size="sm"
                data-testid="btn-config-ot"
              >
                OT Thresholds
              </Button>
              <Button 
                variant={configType === "break" ? "default" : "outline"} 
                onClick={() => setConfigType("break")}
                size="sm"
                data-testid="btn-config-break"
              >
                Break Rules
              </Button>
            </div>

            {configType === "ot" ? (
              <div className="space-y-4">
                <div className="p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-medium mb-3">OT Alert Thresholds</h4>
                  <div className="space-y-4">
                    <div>
                      <Label>Configuration Name</Label>
                      <Input 
                        value={otConfigForm.name} 
                        onChange={(e) => setOtConfigForm({...otConfigForm, name: e.target.value})}
                        className="mt-1" 
                        data-testid="input-ot-name" 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Threshold 1 (Hours Remaining)</Label>
                        <Input 
                          type="number" 
                          value={otConfigForm.threshold1HoursRemaining}
                          onChange={(e) => setOtConfigForm({...otConfigForm, threshold1HoursRemaining: e.target.value})}
                          className="mt-1" 
                          data-testid="input-ot-threshold1" 
                        />
                        <p className="text-xs text-muted-foreground mt-1">Notifies: Dispatch (Info)</p>
                      </div>
                      <div>
                        <Label>Threshold 2 (Hours Remaining)</Label>
                        <Input 
                          type="number" 
                          value={otConfigForm.threshold2HoursRemaining}
                          onChange={(e) => setOtConfigForm({...otConfigForm, threshold2HoursRemaining: e.target.value})}
                          className="mt-1" 
                          data-testid="input-ot-threshold2" 
                        />
                        <p className="text-xs text-muted-foreground mt-1">Notifies: Management (Warning)</p>
                      </div>
                      <div>
                        <Label>Weekly OT Threshold (Hours)</Label>
                        <Input 
                          type="number" 
                          value={otConfigForm.weeklyOtThresholdHours}
                          onChange={(e) => setOtConfigForm({...otConfigForm, weeklyOtThresholdHours: e.target.value})}
                          className="mt-1" 
                          data-testid="input-ot-weekly" 
                        />
                        <p className="text-xs text-muted-foreground mt-1">When OT is reached: Critical alert</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-medium mb-3">Break Rules</h4>
                  <div className="space-y-4">
                    <div>
                      <Label>Configuration Name</Label>
                      <Input 
                        value={breakConfigForm.name}
                        onChange={(e) => setBreakConfigForm({...breakConfigForm, name: e.target.value})}
                        className="mt-1" 
                        data-testid="input-break-name" 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Min Hours Worked for Break</Label>
                        <Input 
                          type="number" 
                          value={breakConfigForm.minHoursWorkedForBreak}
                          onChange={(e) => setBreakConfigForm({...breakConfigForm, minHoursWorkedForBreak: e.target.value})}
                          className="mt-1" 
                          data-testid="input-break-minhours" 
                        />
                        <p className="text-xs text-muted-foreground mt-1">Break required after X hours</p>
                      </div>
                      <div>
                        <Label>Required Break Duration (min)</Label>
                        <Input 
                          type="number" 
                          value={breakConfigForm.requiredBreakDuration}
                          onChange={(e) => setBreakConfigForm({...breakConfigForm, requiredBreakDuration: parseInt(e.target.value) || 30})}
                          className="mt-1" 
                          data-testid="input-break-duration" 
                        />
                      </div>
                      <div>
                        <Label>Approaching Alert (min before)</Label>
                        <Input 
                          type="number" 
                          value={breakConfigForm.breakApproachingAlertMinutes}
                          onChange={(e) => setBreakConfigForm({...breakConfigForm, breakApproachingAlertMinutes: parseInt(e.target.value) || 30})}
                          className="mt-1" 
                          data-testid="input-break-approaching" 
                        />
                        <p className="text-xs text-muted-foreground mt-1">Alert driver X min before break is due</p>
                      </div>
                      <div>
                        <Label>Overdue Alert (min after)</Label>
                        <Input 
                          type="number" 
                          value={breakConfigForm.breakOverdueAlertMinutes}
                          onChange={(e) => setBreakConfigForm({...breakConfigForm, breakOverdueAlertMinutes: parseInt(e.target.value) || 15})}
                          className="mt-1" 
                          data-testid="input-break-overdue" 
                        />
                        <p className="text-xs text-muted-foreground mt-1">Alert dispatch X min after break was due</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)} data-testid="btn-cancel-config">
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (configType === "ot") {
                  createOtConfigMutation.mutate(otConfigForm);
                } else {
                  createBreakConfigMutation.mutate(breakConfigForm);
                }
              }} 
              disabled={createOtConfigMutation.isPending || createBreakConfigMutation.isPending}
              data-testid="btn-save-config"
            >
              {(createOtConfigMutation.isPending || createBreakConfigMutation.isPending) ? "Saving..." : "Save Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RebalancingTab() {
  const { toast } = useToast();
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  const { data: schedulesData } = useQuery<{ schedules: any[]; total: number }>({
    queryKey: ["/api/scheduling/schedules"],
  });

  const { data: suggestions = [], isLoading: suggestionsLoading, refetch: refetchSuggestions } = useQuery<any[]>({
    queryKey: ["/api/corporate/scheduling/rebalancing/suggestions", selectedScheduleId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedScheduleId) params.append("scheduleId", selectedScheduleId);
      params.append("status", "pending");
      const res = await fetch(`/api/corporate/scheduling/rebalancing/suggestions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const res = await apiRequest("POST", `/api/corporate/scheduling/rebalancing/generate/${scheduleId}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Suggestions Generated",
        description: `Found ${data.count} rebalancing opportunities`,
      });
      refetchSuggestions();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate suggestions",
        variant: "destructive",
      });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (suggestionId: string) => {
      const res = await apiRequest("POST", `/api/corporate/scheduling/rebalancing/suggestions/${suggestionId}/apply`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Suggestion Applied",
        description: "The schedule change has been applied successfully",
      });
      refetchSuggestions();
      queryClient.invalidateQueries({ queryKey: ["/api/scheduling/schedules"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to apply suggestion",
        variant: "destructive",
      });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/corporate/scheduling/rebalancing/suggestions/${id}/dismiss`, { reason });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Suggestion Dismissed",
        description: "The suggestion has been dismissed",
      });
      refetchSuggestions();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to dismiss suggestion",
        variant: "destructive",
      });
    },
  });

  const schedules = schedulesData?.schedules || [];
  const publishedSchedules = schedules.filter(s => s.status === "published");

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    };
    return colors[priority] || colors.low;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  };

  return (
    <div className="space-y-6">
      <Card data-testid="card-rebalancing">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Intelligent Rebalancing Suggestions
              </CardTitle>
              <CardDescription>
                AI-powered recommendations to reduce overtime and improve driver utilization
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedScheduleId || ""} onValueChange={(v) => setSelectedScheduleId(v || null)}>
                <SelectTrigger className="w-[200px]" data-testid="select-schedule">
                  <SelectValue placeholder="Select schedule" />
                </SelectTrigger>
                <SelectContent>
                  {publishedSchedules.map((schedule) => (
                    <SelectItem key={schedule.id} value={schedule.id}>
                      {schedule.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => selectedScheduleId && generateMutation.mutate(selectedScheduleId)}
                disabled={!selectedScheduleId || generateMutation.isPending}
                data-testid="button-generate-suggestions"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Analyze Schedule
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {suggestionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No pending suggestions</p>
              <p className="text-sm mt-1">
                Select a schedule and click "Analyze Schedule" to generate rebalancing recommendations
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {suggestions.map((suggestion: any) => (
                <Card key={suggestion.id} className="border-l-4" style={{ borderLeftColor: suggestion.priority === "critical" ? "#ef4444" : suggestion.priority === "high" ? "#f97316" : "#22c55e" }} data-testid={`card-suggestion-${suggestion.id}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge className={getPriorityBadge(suggestion.priority)}>
                            {suggestion.priority}
                          </Badge>
                          <Badge variant="outline">{suggestion.suggestionType}</Badge>
                          <span className="text-sm text-muted-foreground">
                            Confidence: {suggestion.confidenceScore}%
                          </span>
                        </div>
                        <h4 className="font-medium">{suggestion.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{suggestion.rationale}</p>
                        
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                          <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-green-500" />
                            Impact Preview
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">OT Hours Avoided:</span>
                              <span className="ml-2 font-medium text-green-600">{suggestion.impactMetrics?.otHoursAvoided?.toFixed(1) || 0}h</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Cost Savings:</span>
                              <span className="ml-2 font-medium text-green-600">{formatCurrency(suggestion.impactMetrics?.laborCostDelta || 0)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Utilization Gain:</span>
                              <span className="ml-2 font-medium text-blue-600">+{(suggestion.impactMetrics?.utilizationImprovement || 0).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                        
                        {suggestion.suggestedAction && (
                          <div className="mt-3 flex items-center gap-2 text-sm">
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            <span>
                              Reassign shift from{" "}
                              <strong>{suggestion.suggestedAction.sourceDriverName || "Driver"}</strong>
                              {" "}to{" "}
                              <strong>{suggestion.suggestedAction.targetDriverName || "Driver"}</strong>
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          onClick={() => applyMutation.mutate(suggestion.id)}
                          disabled={applyMutation.isPending}
                          data-testid={`button-apply-${suggestion.id}`}
                        >
                          {applyMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="mr-2 h-4 w-4" />
                          )}
                          Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => dismissMutation.mutate({ id: suggestion.id, reason: "User dismissed" })}
                          disabled={dismissMutation.isPending}
                          data-testid={`button-dismiss-${suggestion.id}`}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-500" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center p-4">
              <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-3">
                <Search className="h-6 w-6 text-blue-600" />
              </div>
              <h4 className="font-medium">1. Analyze</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Scans schedules to identify drivers approaching overtime thresholds (40+ hours)
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-4">
              <div className="h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center mb-3">
                <Lightbulb className="h-6 w-6 text-yellow-600" />
              </div>
              <h4 className="font-medium">2. Suggest</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Generates shift reassignment recommendations with projected cost savings
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-4">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-3">
                <UserCheck className="h-6 w-6 text-green-600" />
              </div>
              <h4 className="font-medium">3. Review & Apply</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Human-in-the-loop: You review each suggestion before any changes are made
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UnionRulesTab({ entityId }: { entityId?: string | null }) {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    contractReference: "",
    effectiveFrom: "",
    effectiveTo: "",
    maxConsecutiveDays: "",
    guaranteedWeeklyHours: "",
    guaranteedDailyHours: "",
    dailyOvertimePremiumThreshold: "",
    weeklyOvertimePremiumThreshold: "",
    premiumRateMultiplier: "1.50",
    maxShiftLengthHours: "",
    minRestBetweenShiftsHours: "",
  });

  const { data: ruleSets = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/corporate/scheduling/union-rules", { entityId }],
    queryFn: async () => {
      const params = entityId ? `?entityId=${entityId}` : '';
      const res = await fetch(`/api/corporate/scheduling/union-rules${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: violations = [] } = useQuery<any[]>({
    queryKey: ["/api/corporate/scheduling/union-violations", { entityId }],
    queryFn: async () => {
      const params = entityId ? `?entityId=${entityId}` : '';
      const res = await fetch(`/api/corporate/scheduling/union-violations${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const createRule = useMutation({
    mutationFn: async (data: any) => {
      const cleanedData: any = { name: data.name, effectiveFrom: data.effectiveFrom };
      if (data.description) cleanedData.description = data.description;
      if (data.contractReference) cleanedData.contractReference = data.contractReference;
      if (data.effectiveTo) cleanedData.effectiveTo = data.effectiveTo;
      if (data.maxConsecutiveDays) cleanedData.maxConsecutiveDays = parseInt(data.maxConsecutiveDays);
      if (data.guaranteedWeeklyHours) cleanedData.guaranteedWeeklyHours = data.guaranteedWeeklyHours;
      if (data.guaranteedDailyHours) cleanedData.guaranteedDailyHours = data.guaranteedDailyHours;
      if (data.dailyOvertimePremiumThreshold) cleanedData.dailyOvertimePremiumThreshold = data.dailyOvertimePremiumThreshold;
      if (data.weeklyOvertimePremiumThreshold) cleanedData.weeklyOvertimePremiumThreshold = data.weeklyOvertimePremiumThreshold;
      if (data.premiumRateMultiplier) cleanedData.premiumRateMultiplier = data.premiumRateMultiplier;
      if (data.maxShiftLengthHours) cleanedData.maxShiftLengthHours = data.maxShiftLengthHours;
      if (data.minRestBetweenShiftsHours) cleanedData.minRestBetweenShiftsHours = data.minRestBetweenShiftsHours;
      const res = await apiRequest("POST", "/api/corporate/scheduling/union-rules", {
        ...cleanedData,
        entityId: entityId || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/union-rules"] });
      toast({ title: "Union rule set created" });
      setCreateDialogOpen(false);
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/corporate/scheduling/union-rules/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/union-rules"] });
      toast({ title: "Union rule set deleted" });
    },
  });

  const acknowledgeViolation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/corporate/scheduling/union-violations/${id}/acknowledge`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/union-violations"] });
      toast({ title: "Violation acknowledged" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold">Union / CBA Rule Sets</h3>
          <p className="text-sm text-muted-foreground">Configure rule overlays for unionized or contract-based labor</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-union-rule">
              <Plus className="h-4 w-4 mr-1" /> Add Rule Set
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Union / CBA Rule Set</DialogTitle>
              <DialogDescription>Define rules that will be checked during schedule builds and publishing</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2">
                <Label required>Name</Label>
                <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} data-testid="input-rule-name" />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} data-testid="input-rule-description" />
              </div>
              <div>
                <Label>Contract Reference</Label>
                <Input value={formData.contractReference} onChange={e => setFormData({...formData, contractReference: e.target.value})} data-testid="input-rule-contract" />
              </div>
              <div>
                <Label>Premium Rate Multiplier</Label>
                <Input type="number" step="0.05" value={formData.premiumRateMultiplier} onChange={e => setFormData({...formData, premiumRateMultiplier: e.target.value})} data-testid="input-rule-premium" />
              </div>
              <div>
                <Label required>Effective From</Label>
                <Input type="date" value={formData.effectiveFrom} onChange={e => setFormData({...formData, effectiveFrom: e.target.value})} data-testid="input-rule-effective-from" />
              </div>
              <div>
                <Label>Effective To</Label>
                <Input type="date" value={formData.effectiveTo} onChange={e => setFormData({...formData, effectiveTo: e.target.value})} data-testid="input-rule-effective-to" />
              </div>
              <div>
                <Label>Max Consecutive Days</Label>
                <Input type="number" value={formData.maxConsecutiveDays} onChange={e => setFormData({...formData, maxConsecutiveDays: e.target.value})} data-testid="input-rule-max-days" />
              </div>
              <div>
                <Label>Guaranteed Weekly Hours</Label>
                <Input type="number" step="0.5" value={formData.guaranteedWeeklyHours} onChange={e => setFormData({...formData, guaranteedWeeklyHours: e.target.value})} data-testid="input-rule-weekly-hours" />
              </div>
              <div>
                <Label>Guaranteed Daily Hours</Label>
                <Input type="number" step="0.5" value={formData.guaranteedDailyHours} onChange={e => setFormData({...formData, guaranteedDailyHours: e.target.value})} data-testid="input-rule-daily-hours" />
              </div>
              <div>
                <Label>Daily OT Premium Threshold (hours)</Label>
                <Input type="number" step="0.5" value={formData.dailyOvertimePremiumThreshold} onChange={e => setFormData({...formData, dailyOvertimePremiumThreshold: e.target.value})} data-testid="input-rule-daily-ot" />
              </div>
              <div>
                <Label>Weekly OT Premium Threshold (hours)</Label>
                <Input type="number" step="0.5" value={formData.weeklyOvertimePremiumThreshold} onChange={e => setFormData({...formData, weeklyOvertimePremiumThreshold: e.target.value})} data-testid="input-rule-weekly-ot" />
              </div>
              <div>
                <Label>Max Shift Length (hours)</Label>
                <Input type="number" step="0.5" value={formData.maxShiftLengthHours} onChange={e => setFormData({...formData, maxShiftLengthHours: e.target.value})} data-testid="input-rule-max-shift" />
              </div>
              <div>
                <Label>Min Rest Between Shifts (hours)</Label>
                <Input type="number" step="0.5" value={formData.minRestBetweenShiftsHours} onChange={e => setFormData({...formData, minRestBetweenShiftsHours: e.target.value})} data-testid="input-rule-min-rest" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel-create-rule">Cancel</Button>
              <Button onClick={() => createRule.mutate(formData)} disabled={!formData.name || !formData.effectiveFrom || createRule.isPending} data-testid="button-submit-create-rule">
                {createRule.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Create Rule Set
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : ruleSets.length === 0 ? (
        <Card className="p-8 text-center">
          <Gavel className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No union/CBA rule sets configured</p>
          <p className="text-sm text-muted-foreground mt-1">Create a rule set to enforce union contract requirements</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {ruleSets.map((rule: any) => (
            <Card key={rule.id} className="p-4" data-testid={`card-union-rule-${rule.id}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium">{rule.name}</h4>
                    {rule.contractReference && <Badge variant="outline">{rule.contractReference}</Badge>}
                    <Badge variant={rule.isActive ? "default" : "secondary"}>{rule.isActive ? "Active" : "Inactive"}</Badge>
                  </div>
                  {rule.description && <p className="text-sm text-muted-foreground">{rule.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                    {rule.maxConsecutiveDays && <span>Max {rule.maxConsecutiveDays} consecutive days</span>}
                    {rule.guaranteedWeeklyHours && <span>Guaranteed {rule.guaranteedWeeklyHours}h/week</span>}
                    {rule.dailyOvertimePremiumThreshold && <span>Daily OT after {rule.dailyOvertimePremiumThreshold}h</span>}
                    {rule.weeklyOvertimePremiumThreshold && <span>Weekly OT after {rule.weeklyOvertimePremiumThreshold}h</span>}
                    {rule.maxShiftLengthHours && <span>Max shift {rule.maxShiftLengthHours}h</span>}
                    {rule.minRestBetweenShiftsHours && <span>Min rest {rule.minRestBetweenShiftsHours}h</span>}
                    {rule.premiumRateMultiplier && <span>Premium {rule.premiumRateMultiplier}x</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Effective: {rule.effectiveFrom}{rule.effectiveTo ? ` to ${rule.effectiveTo}` : ' (ongoing)'}
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => deleteRule.mutate(rule.id)} data-testid={`button-delete-rule-${rule.id}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-2">Recent Violations</h3>
        <p className="text-sm text-muted-foreground mb-4">Violations flagged during schedule builds and publish checks</p>
        {violations.length === 0 ? (
          <Card className="p-6 text-center">
            <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-muted-foreground">No violations detected</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {violations.map((v: any) => (
              <Card key={v.id} className={`p-3 ${v.acknowledged ? 'opacity-60' : ''}`} data-testid={`card-violation-${v.id}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{v.message}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline">{v.ruleName}</Badge>
                        <span className="text-xs text-muted-foreground">Rule: {v.ruleValue} | Actual: {v.actualValue}</span>
                        {v.acknowledged && <Badge variant="secondary">Acknowledged</Badge>}
                      </div>
                    </div>
                  </div>
                  {!v.acknowledged && (
                    <Button size="sm" variant="outline" onClick={() => acknowledgeViolation.mutate(v.id)} data-testid={`button-ack-violation-${v.id}`}>
                      Acknowledge
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InsuranceReportsTab({ entityId }: { entityId: string | null }) {
  const { toast } = useToast();
  const [periodType, setPeriodType] = useState("monthly");
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });

  const reportQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/insurance-reports/generate", { periodType, periodStart, entityId }],
    queryFn: async () => {
      const params = new URLSearchParams({ periodType, periodStart });
      if (entityId) params.set("entityId", entityId);
      const res = await fetch(`/api/corporate/scheduling/insurance-reports/generate?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to generate report");
      return res.json();
    },
    enabled: !!periodStart,
  });

  const savedReportsQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/insurance-reports/saved", { entityId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entityId) params.set("entityId", entityId);
      const res = await fetch(`/api/corporate/scheduling/insurance-reports/saved?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch saved reports");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const report = reportQuery.data;
      if (!report) throw new Error("No report to save");
      const res = await apiRequest("POST", "/api/corporate/scheduling/insurance-reports/save", {
        reportData: report,
        entityId: entityId || null,
        periodType: report.periodType,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        reportType: "full_pack",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Report saved as snapshot" });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/insurance-reports/saved"] });
    },
    onError: () => toast({ title: "Failed to save report", variant: "destructive" }),
  });

  const handleExportCSV = () => {
    const params = new URLSearchParams({ periodType, periodStart });
    if (entityId) params.set("entityId", entityId);
    window.open(`/api/corporate/scheduling/insurance-reports/export-csv?${params}`, "_blank");
  };

  const report = reportQuery.data;
  const summary = report?.summary;

  const getRiskBadge = (level: string) => {
    if (level === "low") return <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300" data-testid="badge-risk-level">Low Risk</Badge>;
    if (level === "moderate") return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300" data-testid="badge-risk-level">Moderate</Badge>;
    return <Badge variant="destructive" data-testid="badge-risk-level">Elevated</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-insurance-title">Insurance & Underwriter Reporting</h3>
          <p className="text-sm text-muted-foreground">Insurer-ready views demonstrating proactive labor and fatigue controls</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={periodType} onValueChange={setPeriodType} data-testid="select-period-type">
            <SelectTrigger className="w-[130px]" data-testid="trigger-period-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="w-[170px]"
            data-testid="input-period-start"
          />
          <Button variant="outline" onClick={handleExportCSV} disabled={!report} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-1" />CSV
          </Button>
          <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={!report || saveMutation.isPending} data-testid="button-save-snapshot">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
            Save Snapshot
          </Button>
        </div>
      </div>

      {reportQuery.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Generating report...</span>
        </div>
      )}

      {report && summary && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Overall Risk:</span>
            {getRiskBadge(summary.overallRiskLevel)}
            <span className="text-sm text-muted-foreground ml-2">Entity: {report.entityName}</span>
            <span className="text-sm text-muted-foreground">Period: {report.periodStart} to {report.periodEnd}</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card data-testid="card-ot-prevention">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">OT Prevention Rate</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-ot-rate">{summary.otPreventionRate}%</div>
                <p className="text-xs text-muted-foreground">{report.reports.otRiskPrevention.shiftsExceedingOTThreshold} of {report.reports.otRiskPrevention.totalShifts} shifts exceeded threshold</p>
              </CardContent>
            </Card>

            <Card data-testid="card-break-compliance">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Break Compliance</CardTitle>
                <Coffee className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-break-rate">{summary.breakComplianceRate}%</div>
                <p className="text-xs text-muted-foreground">{report.reports.breakCompliance.shiftsWithBreaks} shifts with recorded breaks</p>
              </CardContent>
            </Card>

            <Card data-testid="card-fatigue-risk">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Fatigue Risk Score</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-fatigue-score">{summary.fatigueRiskScore}/100</div>
                <p className="text-xs text-muted-foreground">{report.reports.fatigueIndicators.longShiftCount} long shifts, {report.reports.fatigueIndicators.restPeriodViolations} rest violations</p>
              </CardContent>
            </Card>

            <Card data-testid="card-no-show">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">No-Show Rate</CardTitle>
                <UserX className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-noshow-rate">{summary.noShowRate}%</div>
                <p className="text-xs text-muted-foreground">{report.reports.noShowMitigation.noShowCount} no-shows, {summary.confirmationRate}% confirmed</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card data-testid="card-fatigue-details">
              <CardHeader>
                <CardTitle className="text-base">Fatigue Indicator Details</CardTitle>
                <CardDescription>Breakdown of fatigue risk factors</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.reports.fatigueIndicators.details.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {d.severity === "critical" ? <AlertCircle className="h-4 w-4 text-destructive" /> :
                       d.severity === "warning" ? <AlertTriangle className="h-4 w-4 text-yellow-500" /> :
                       <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      <span className="text-sm">{d.indicator}</span>
                    </div>
                    <Badge variant="secondary">{d.count}</Badge>
                  </div>
                ))}
                <Separator />
                <div className="text-sm text-muted-foreground">
                  Avg rest between shifts: {report.reports.fatigueIndicators.avgRestBetweenShiftsHours}h
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-methodology">
              <CardHeader>
                <CardTitle className="text-base">Methodology & Data Sources</CardTitle>
                <CardDescription>How these metrics are calculated</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">OT Threshold:</span> {report.methodology.otThreshold}</div>
                  <div><span className="font-medium">Break Compliance:</span> {report.methodology.breakCompliance}</div>
                  <div><span className="font-medium">Fatigue:</span> {report.methodology.fatigueIndicators}</div>
                  <div><span className="font-medium">No-Show:</span> {report.methodology.noShowRate}</div>
                </div>
                <Separator />
                <div className="text-xs text-muted-foreground font-medium">Data Sources:</div>
                {report.dataSources.map((src: string, i: number) => (
                  <div key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                    <Check className="h-3 w-3" />{src}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {report.reports.otRiskPrevention.unionRuleViolations > 0 && (
            <Card data-testid="card-union-violations-summary">
              <CardHeader>
                <CardTitle className="text-base">Union / CBA Rule Violations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    <span className="font-medium">{report.reports.otRiskPrevention.unionRuleViolations}</span> total violations
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">{report.reports.otRiskPrevention.unionRuleViolationsAcknowledged}</span> acknowledged
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {savedReportsQuery.data && savedReportsQuery.data.length > 0 && (
        <Card data-testid="card-saved-reports">
          <CardHeader>
            <CardTitle className="text-base">Saved Report Snapshots</CardTitle>
            <CardDescription>Previously generated and saved reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {savedReportsQuery.data.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`row-saved-report-${r.id}`}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{r.periodType} report: {r.periodStart} to {r.periodEnd}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(r.generatedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ClientConfigTab({ entityId }: { entityId: string | null }) {
  const { toast } = useToast();

  const configQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/client-config", entityId],
    queryFn: async () => {
      if (!entityId) return null;
      const res = await fetch(`/api/corporate/scheduling/client-config/${entityId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch config");
      return res.json();
    },
    enabled: !!entityId,
  });

  const [terminology, setTerminology] = useState<Record<string, string>>({});
  const [shiftTypes, setShiftTypes] = useState<Array<{ name: string; color: string; duration: string }>>([]);
  const [alertThresholds, setAlertThresholds] = useState<Record<string, string>>({});
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});
  const [brandLabel, setBrandLabel] = useState("");
  const [brandPrimaryColor, setBrandPrimaryColor] = useState("");
  const [brandSecondaryColor, setBrandSecondaryColor] = useState("");
  const [initialized, setInitialized] = useState(false);

  const [newTermKey, setNewTermKey] = useState("");
  const [newTermValue, setNewTermValue] = useState("");
  const [newShiftName, setNewShiftName] = useState("");
  const [newShiftColor, setNewShiftColor] = useState("#3B82F6");
  const [newShiftDuration, setNewShiftDuration] = useState("8");
  const [newThresholdKey, setNewThresholdKey] = useState("");
  const [newThresholdValue, setNewThresholdValue] = useState("");
  const [newToggleKey, setNewToggleKey] = useState("");

  useEffect(() => {
    if (configQuery.data && !initialized) {
      const c = configQuery.data;
      setTerminology(c.terminology || {});
      setShiftTypes(c.shiftTypes || []);
      setAlertThresholds(c.alertThresholds || {});
      setFeatureToggles(c.featureToggles || {});
      setBrandLabel(c.brandLabel || "");
      setBrandPrimaryColor(c.brandPrimaryColor || "");
      setBrandSecondaryColor(c.brandSecondaryColor || "");
      setInitialized(true);
    }
  }, [configQuery.data, initialized]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!entityId) throw new Error("No entity selected");
      const res = await apiRequest("PUT", `/api/corporate/scheduling/client-config/${entityId}`, {
        terminology,
        shiftTypes,
        alertThresholds,
        featureToggles,
        brandLabel: brandLabel || null,
        brandPrimaryColor: brandPrimaryColor || null,
        brandSecondaryColor: brandSecondaryColor || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Configuration saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/client-config"] });
    },
    onError: () => toast({ title: "Failed to save config", variant: "destructive" }),
  });

  if (!entityId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Settings className="h-8 w-8 mx-auto mb-2" />
          <p>Select a scheduling entity to configure white-label settings</p>
        </CardContent>
      </Card>
    );
  }

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-config-title">Client Configuration</h3>
          <p className="text-sm text-muted-foreground">White-label settings for this entity</p>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-config">
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
          Save Configuration
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-branding">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4" />Branding</CardTitle>
            <CardDescription>Labels and colors for this client</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Brand Label</Label>
              <Input value={brandLabel} onChange={(e) => setBrandLabel(e.target.value)} placeholder="e.g., FleetPro Scheduling" data-testid="input-brand-label" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Primary Color</Label>
                <div className="flex items-center gap-2">
                  <Input value={brandPrimaryColor} onChange={(e) => setBrandPrimaryColor(e.target.value)} placeholder="#FF6B35" data-testid="input-brand-primary" />
                  {brandPrimaryColor && <div className="h-8 w-8 rounded-md border flex-shrink-0" style={{ backgroundColor: brandPrimaryColor }} />}
                </div>
              </div>
              <div>
                <Label>Secondary Color</Label>
                <div className="flex items-center gap-2">
                  <Input value={brandSecondaryColor} onChange={(e) => setBrandSecondaryColor(e.target.value)} placeholder="#1E3A5F" data-testid="input-brand-secondary" />
                  {brandSecondaryColor && <div className="h-8 w-8 rounded-md border flex-shrink-0" style={{ backgroundColor: brandSecondaryColor }} />}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-terminology">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Edit2 className="h-4 w-4" />Terminology</CardTitle>
            <CardDescription>Custom labels for scheduling terms</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(terminology).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{key}</Badge>
                <span className="text-sm flex-1">{value}</span>
                <Button size="icon" variant="ghost" onClick={() => {
                  const updated = { ...terminology };
                  delete updated[key];
                  setTerminology(updated);
                }} data-testid={`button-remove-term-${key}`}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Separator />
            <div className="flex items-center gap-2 flex-wrap">
              <Input value={newTermKey} onChange={(e) => setNewTermKey(e.target.value)} placeholder="Standard term" className="flex-1" data-testid="input-new-term-key" />
              <Input value={newTermValue} onChange={(e) => setNewTermValue(e.target.value)} placeholder="Custom label" className="flex-1" data-testid="input-new-term-value" />
              <Button size="icon" variant="outline" onClick={() => {
                if (newTermKey && newTermValue) {
                  setTerminology({ ...terminology, [newTermKey]: newTermValue });
                  setNewTermKey("");
                  setNewTermValue("");
                }
              }} data-testid="button-add-term">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Examples: Shift → Tour, Driver → Operator, Schedule → Roster</p>
          </CardContent>
        </Card>

        <Card data-testid="card-shift-types">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />Shift Types</CardTitle>
            <CardDescription>Custom shift type definitions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {shiftTypes.map((st, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-sm flex-shrink-0" style={{ backgroundColor: st.color }} />
                <span className="text-sm flex-1">{st.name}</span>
                <Badge variant="secondary" className="text-xs">{st.duration}h</Badge>
                <Button size="icon" variant="ghost" onClick={() => {
                  setShiftTypes(shiftTypes.filter((_, idx) => idx !== i));
                }} data-testid={`button-remove-shift-type-${i}`}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Separator />
            <div className="flex items-center gap-2 flex-wrap">
              <Input value={newShiftName} onChange={(e) => setNewShiftName(e.target.value)} placeholder="Type name" className="flex-1" data-testid="input-new-shift-name" />
              <Input type="color" value={newShiftColor} onChange={(e) => setNewShiftColor(e.target.value)} className="w-12 p-1" data-testid="input-new-shift-color" />
              <Input type="number" value={newShiftDuration} onChange={(e) => setNewShiftDuration(e.target.value)} placeholder="Hours" className="w-16" data-testid="input-new-shift-duration" />
              <Button size="icon" variant="outline" onClick={() => {
                if (newShiftName) {
                  setShiftTypes([...shiftTypes, { name: newShiftName, color: newShiftColor, duration: newShiftDuration }]);
                  setNewShiftName("");
                  setNewShiftColor("#3B82F6");
                  setNewShiftDuration("8");
                }
              }} data-testid="button-add-shift-type">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-alert-thresholds">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" />Alert Thresholds</CardTitle>
            <CardDescription>Custom alert trigger values</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(alertThresholds).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{key}</Badge>
                <span className="text-sm flex-1">{value}</span>
                <Button size="icon" variant="ghost" onClick={() => {
                  const updated = { ...alertThresholds };
                  delete updated[key];
                  setAlertThresholds(updated);
                }} data-testid={`button-remove-threshold-${key}`}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Separator />
            <div className="flex items-center gap-2 flex-wrap">
              <Input value={newThresholdKey} onChange={(e) => setNewThresholdKey(e.target.value)} placeholder="Alert name" className="flex-1" data-testid="input-new-threshold-key" />
              <Input value={newThresholdValue} onChange={(e) => setNewThresholdValue(e.target.value)} placeholder="Value" className="flex-1" data-testid="input-new-threshold-value" />
              <Button size="icon" variant="outline" onClick={() => {
                if (newThresholdKey && newThresholdValue) {
                  setAlertThresholds({ ...alertThresholds, [newThresholdKey]: newThresholdValue });
                  setNewThresholdKey("");
                  setNewThresholdValue("");
                }
              }} data-testid="button-add-threshold">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Examples: max_ot_hours → 10, break_warning_minutes → 15</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-feature-toggles">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ToggleLeft className="h-4 w-4" />Feature Toggles</CardTitle>
          <CardDescription>Enable or disable features per client</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(featureToggles).map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm">{key}</span>
              <div className="flex items-center gap-2">
                <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "Enabled" : "Disabled"}</Badge>
                <Button size="icon" variant="ghost" onClick={() => {
                  setFeatureToggles({ ...featureToggles, [key]: !enabled });
                }} data-testid={`button-toggle-${key}`}>
                  <ToggleLeft className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => {
                  const updated = { ...featureToggles };
                  delete updated[key];
                  setFeatureToggles(updated);
                }} data-testid={`button-remove-toggle-${key}`}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          <Separator />
          <div className="flex items-center gap-2 flex-wrap">
            <Input value={newToggleKey} onChange={(e) => setNewToggleKey(e.target.value)} placeholder="Feature name" className="flex-1" data-testid="input-new-toggle-key" />
            <Button variant="outline" onClick={() => {
              if (newToggleKey) {
                setFeatureToggles({ ...featureToggles, [newToggleKey]: true });
                setNewToggleKey("");
              }
            }} data-testid="button-add-toggle">
              <Plus className="h-4 w-4 mr-1" />Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Examples: shift_swaps, break_tracking, overtime_alerts, union_rules, insurance_reports</p>
        </CardContent>
      </Card>
    </div>
  );
}



function SlaTrackingTab({ entityId }: { entityId: string | null }) {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingDef, setEditingDef] = useState<any>(null);
  const [performanceDateRange, setPerformanceDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [slaSubTab, setSlaSubTab] = useState("definitions");
  const [riskResults, setRiskResults] = useState<any>(null);

  const schedulesQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/schedules"],
    queryFn: async () => {
      const res = await fetch("/api/corporate/scheduling/schedules");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const riskAssessmentMutation = useMutation({
    mutationFn: async (shiftIds: string[]) => {
      const res = await apiRequest("POST", "/api/corporate/scheduling/sla-risk-assessment", { shiftIds });
      return res;
    },
    onSuccess: (data: any) => {
      setRiskResults(data);
      if (data.risks?.length === 0) {
        toast({ title: "No SLA risks detected", description: `${data.shiftCount} shift(s) assessed — all clear` });
      }
    },
    onError: (err: any) => toast({ title: "Risk assessment failed", description: err.message, variant: "destructive" }),
  });

  const runRiskForSchedule = async (scheduleId: string) => {
    const res = await fetch(`/api/corporate/scheduling/shifts?scheduleId=${scheduleId}`);
    if (!res.ok) { toast({ title: "Failed to fetch shifts", variant: "destructive" }); return; }
    const shifts = await res.json();
    const shiftIds = shifts.map((s: any) => s.id);
    if (shiftIds.length === 0) { toast({ title: "No shifts found for this schedule" }); return; }
    riskAssessmentMutation.mutate(shiftIds);
  };

  const definitionsQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/sla-definitions", entityId],
    queryFn: async () => {
      const params = entityId ? `?entityId=${entityId}` : "";
      const res = await fetch(`/api/corporate/scheduling/sla-definitions${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/sla-events", performanceDateRange],
    queryFn: async () => {
      const params = new URLSearchParams(performanceDateRange);
      const res = await fetch(`/api/corporate/scheduling/sla-events?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const performanceQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/sla-performance", performanceDateRange],
    queryFn: async () => {
      const params = new URLSearchParams(performanceDateRange);
      const res = await fetch(`/api/corporate/scheduling/sla-performance?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/corporate/scheduling/sla-definitions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/sla-definitions"] });
      setShowCreateDialog(false);
      toast({ title: "SLA definition created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => apiRequest("PATCH", `/api/corporate/scheduling/sla-definitions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/sla-definitions"] });
      setEditingDef(null);
      toast({ title: "SLA definition updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/corporate/scheduling/sla-definitions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/sla-definitions"] });
      toast({ title: "SLA definition deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/corporate/scheduling/sla-definitions/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/sla-definitions"] });
    },
  });

  const slaFormSchema = z.object({
    name: z.string().min(1, "Name is required"),
    metricType: z.enum(["coverage_completeness", "shift_start_timeliness"]),
    targetValue: z.string().min(1, "Target is required"),
    warningThreshold: z.string().optional(),
    toleranceMinutes: z.coerce.number().min(0).default(0),
    description: z.string().optional(),
    entityId: z.string().default("default"),
  });

  const form = useForm({
    resolver: zodResolver(slaFormSchema),
    defaultValues: {
      name: "",
      metricType: "coverage_completeness" as const,
      targetValue: "95",
      warningThreshold: "85",
      toleranceMinutes: 0,
      description: "",
      entityId: entityId || "default",
    },
  });

  const onSubmit = (data: any) => {
    if (editingDef) {
      updateMutation.mutate({ id: editingDef.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (def: any) => {
    setEditingDef(def);
    form.reset({
      name: def.name,
      metricType: def.metricType,
      targetValue: def.targetValue,
      warningThreshold: def.warningThreshold || "",
      toleranceMinutes: def.toleranceMinutes || 0,
      description: def.description || "",
      entityId: def.entityId || "default",
    });
    setShowCreateDialog(true);
  };

  const openCreateDialog = () => {
    setEditingDef(null);
    form.reset({
      name: "",
      metricType: "coverage_completeness",
      targetValue: "95",
      warningThreshold: "85",
      toleranceMinutes: 0,
      description: "",
      entityId: entityId || "default",
    });
    setShowCreateDialog(true);
  };

  const definitions = definitionsQuery.data || [];
  const events = eventsQuery.data || [];
  const performance = performanceQuery.data;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "met": return <Badge variant="secondary" data-testid="badge-sla-met">Met</Badge>;
      case "warning": return <Badge variant="outline" data-testid="badge-sla-warning"><AlertTriangle className="h-3 w-3 mr-1" />Warning</Badge>;
      case "breached": return <Badge variant="destructive" data-testid="badge-sla-breached"><XCircle className="h-3 w-3 mr-1" />Breached</Badge>;
      default: return <Badge variant="outline" data-testid="badge-sla-pending">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6" data-testid="container-sla-tracking">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-sla-tracking-title">SLA & Service-Level Tracking</h3>
          <p className="text-sm text-muted-foreground">Track staffing decisions against service commitments</p>
        </div>
      </div>

      <Tabs value={slaSubTab} onValueChange={setSlaSubTab}>
        <TabsList>
          <TabsTrigger value="definitions" data-testid="tab-sla-definitions">
            <Shield className="h-4 w-4 mr-1" />Definitions
          </TabsTrigger>
          <TabsTrigger value="events" data-testid="tab-sla-events">
            <FileText className="h-4 w-4 mr-1" />Events
          </TabsTrigger>
          <TabsTrigger value="performance" data-testid="tab-sla-performance">
            <CheckCircle2 className="h-4 w-4 mr-1" />Performance
          </TabsTrigger>
          <TabsTrigger value="risk" data-testid="tab-sla-risk">
            <AlertTriangle className="h-4 w-4 mr-1" />Risk Assessment
          </TabsTrigger>
        </TabsList>

        <TabsContent value="definitions" className="mt-4">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={openCreateDialog} data-testid="button-create-sla-definition">
                <Plus className="h-4 w-4 mr-1" />Add SLA Definition
              </Button>
            </div>

            {definitionsQuery.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : definitions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Shield className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground" data-testid="text-no-sla-definitions">No SLA definitions configured yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Create definitions for shift start timeliness and coverage completeness</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {definitions.map((def: any) => (
                  <Card key={def.id} data-testid={`card-sla-definition-${def.id}`}>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{def.name}</CardTitle>
                        <Badge variant={def.metricType === "coverage_completeness" ? "secondary" : "outline"}>
                          {def.metricType === "coverage_completeness" ? "Coverage" : "Timeliness"}
                        </Badge>
                        {def.isActive ? (
                          <Badge variant="secondary" data-testid={`badge-active-${def.id}`}><Check className="h-3 w-3 mr-1" />Active</Badge>
                        ) : (
                          <Badge variant="outline" data-testid={`badge-inactive-${def.id}`}>Inactive</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => toggleMutation.mutate({ id: def.id, isActive: !def.isActive })} data-testid={`button-toggle-sla-${def.id}`}>
                          {def.isActive ? <XCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEditDialog(def)} data-testid={`button-edit-sla-${def.id}`}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(def.id)} data-testid={`button-delete-sla-${def.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Target</span>
                          <p className="font-medium" data-testid={`text-target-${def.id}`}>
                            {def.targetValue}{def.metricType === "coverage_completeness" ? "%" : " min"}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Warning Threshold</span>
                          <p className="font-medium">{def.warningThreshold || "—"}{def.warningThreshold && def.metricType === "coverage_completeness" ? "%" : ""}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tolerance</span>
                          <p className="font-medium">{def.toleranceMinutes || 0} min</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Entity</span>
                          <p className="font-medium">{def.entityId}</p>
                        </div>
                      </div>
                      {def.description && <p className="text-xs text-muted-foreground mt-2">{def.description}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="date"
                value={performanceDateRange.startDate}
                onChange={(e) => setPerformanceDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-auto"
                data-testid="input-events-start-date"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="date"
                value={performanceDateRange.endDate}
                onChange={(e) => setPerformanceDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-auto"
                data-testid="input-events-end-date"
              />
            </div>

            {eventsQuery.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : events.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground" data-testid="text-no-sla-events">No SLA events recorded in this period</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {events.map((evt: any) => (
                  <Card key={evt.id} data-testid={`card-sla-event-${evt.id}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-3">
                          {getStatusBadge(evt.status)}
                          <div>
                            <p className="text-sm font-medium">{evt.metricType === "coverage_completeness" ? "Coverage Completeness" : "Shift Start Timeliness"}</p>
                            <p className="text-xs text-muted-foreground">{evt.eventDate}{evt.locationId ? ` | ${evt.locationId}` : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="text-right">
                            <span className="text-muted-foreground">Target: </span>
                            <span className="font-medium">{evt.targetValue}</span>
                          </div>
                          {evt.actualValue && (
                            <div className="text-right">
                              <span className="text-muted-foreground">Actual: </span>
                              <span className="font-medium">{evt.actualValue}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {evt.notes && <p className="text-xs text-muted-foreground mt-1">{evt.notes}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="date"
                value={performanceDateRange.startDate}
                onChange={(e) => setPerformanceDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-auto"
                data-testid="input-perf-start-date"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="date"
                value={performanceDateRange.endDate}
                onChange={(e) => setPerformanceDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-auto"
                data-testid="input-perf-end-date"
              />
            </div>

            {performanceQuery.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : !performance ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">No performance data available</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Card>
                    <CardContent className="py-4 text-center">
                      <p className="text-2xl font-bold" data-testid="text-compliance-rate">{performance.summary.complianceRate}%</p>
                      <p className="text-xs text-muted-foreground">Compliance Rate</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-4 text-center">
                      <p className="text-2xl font-bold" data-testid="text-total-events">{performance.summary.totalEvents}</p>
                      <p className="text-xs text-muted-foreground">Total Events</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-4 text-center">
                      <p className="text-2xl font-bold text-green-600" data-testid="text-met-count">{performance.summary.met}</p>
                      <p className="text-xs text-muted-foreground">Met</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-4 text-center">
                      <p className="text-2xl font-bold text-yellow-600" data-testid="text-warning-count">{performance.summary.warning}</p>
                      <p className="text-xs text-muted-foreground">Warning</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-4 text-center">
                      <p className="text-2xl font-bold text-red-600" data-testid="text-breached-count">{performance.summary.breached}</p>
                      <p className="text-xs text-muted-foreground">Breached</p>
                    </CardContent>
                  </Card>
                </div>

                {performance.byDefinition && performance.byDefinition.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Performance by SLA Definition</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {performance.byDefinition.map((bd: any) => (
                          <div key={bd.definitionId} className="flex items-center justify-between gap-2 flex-wrap border-b pb-2 last:border-b-0" data-testid={`row-perf-${bd.definitionId}`}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{bd.name}</span>
                              <Badge variant="outline">{bd.metricType === "coverage_completeness" ? "Coverage" : "Timeliness"}</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span>{bd.totalEvents} events</span>
                              <span className="text-green-600">{bd.met} met</span>
                              <span className="text-red-600">{bd.breached} breached</span>
                              <Badge variant={parseFloat(bd.complianceRate) >= 90 ? "secondary" : "destructive"}>
                                {bd.complianceRate}%
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="risk" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pre-Publish Risk Assessment</CardTitle>
                <CardDescription>Select a schedule to assess SLA risks before finalizing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Select onValueChange={(val) => runRiskForSchedule(val)}>
                    <SelectTrigger className="w-64" data-testid="select-risk-schedule">
                      <SelectValue placeholder="Select a schedule..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(schedulesQuery.data || []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.status})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {riskAssessmentMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>

                {riskResults && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Assessed {riskResults.shiftCount} shift(s) at {new Date(riskResults.assessedAt).toLocaleString()}</span>
                    </div>

                    {riskResults.risks.length === 0 ? (
                      <Card>
                        <CardContent className="py-6 text-center">
                          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-600" />
                          <p className="font-medium" data-testid="text-no-risks">All Clear — No SLA Risks Detected</p>
                          <p className="text-xs text-muted-foreground mt-1">Schedule is safe to publish</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {riskResults.risks.map((risk: any, idx: number) => (
                          <Card key={idx} data-testid={`card-risk-${idx}`}>
                            <CardContent className="py-3 px-4">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-3">
                                  {risk.status === 'breached' ? (
                                    <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Breached</Badge>
                                  ) : (
                                    <Badge variant="outline"><AlertTriangle className="h-3 w-3 mr-1" />Warning</Badge>
                                  )}
                                  <div>
                                    <p className="text-sm font-medium">{risk.slaName}</p>
                                    <p className="text-xs text-muted-foreground">{risk.message}</p>
                                  </div>
                                </div>
                                <div className="text-sm text-right">
                                  {risk.actualValue !== null && (
                                    <span>Actual: <span className="font-medium">{typeof risk.actualValue === 'number' ? risk.actualValue.toFixed(1) : risk.actualValue}</span> / Target: {risk.targetValue}</span>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="text-sla-dialog-title">{editingDef ? "Edit SLA Definition" : "Create SLA Definition"}</DialogTitle>
            <DialogDescription>Define a service-level metric to track scheduling performance</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Warehouse A Coverage" data-testid="input-sla-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="metricType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Metric Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger data-testid="select-sla-metric-type"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="coverage_completeness">Coverage Completeness</SelectItem>
                      <SelectItem value="shift_start_timeliness">Shift Start Timeliness</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="targetValue" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Value</FormLabel>
                    <FormControl><Input {...field} placeholder="95" data-testid="input-sla-target" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="warningThreshold" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Warning Threshold</FormLabel>
                    <FormControl><Input {...field} placeholder="85" data-testid="input-sla-warning" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="toleranceMinutes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tolerance (minutes)</FormLabel>
                  <FormControl><Input type="number" {...field} data-testid="input-sla-tolerance" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea {...field} placeholder="Describe this SLA..." data-testid="input-sla-description" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)} data-testid="button-cancel-sla">Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-sla">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {editingDef ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function CrossLocationMobilityTab({ entityId }: { entityId: string | null }) {
  const { toast } = useToast();
  const [mobilitySubTab, setMobilitySubTab] = useState("config");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [summaryDateRange, setSummaryDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [travelLogFilters, setTravelLogFilters] = useState({ startDate: "", endDate: "", riskLevel: "all" });
  const [riskForm, setRiskForm] = useState({ driverId: "", targetLocationId: "", targetShiftDate: "", targetShiftStartTime: "" });
  const [riskResults, setRiskResults] = useState<any>(null);
  const [configForm, setConfigForm] = useState({
    name: "", description: "", maxTravelDistanceMiles: "50", maxTravelTimeMinutes: "60",
    minRestBetweenCrossLocationMinutes: "480", maxCrossLocationShiftsPerWeek: "3",
    maxCrossLocationShiftsPerDay: "1", warningDistanceMiles: "30", warningTravelTimeMinutes: "45",
  });

  const configsQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/mobility-configs", entityId],
    queryFn: async () => {
      const params = entityId ? `?entityId=${entityId}` : "";
      const res = await fetch(`/api/corporate/scheduling/mobility-configs${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const travelLogsQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/travel-logs", travelLogFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (travelLogFilters.startDate) params.set("startDate", travelLogFilters.startDate);
      if (travelLogFilters.endDate) params.set("endDate", travelLogFilters.endDate);
      if (travelLogFilters.riskLevel !== "all") params.set("riskLevel", travelLogFilters.riskLevel);
      const res = await fetch(`/api/corporate/scheduling/travel-logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const driversQuery = useQuery({
    queryKey: ["/api/corporate/drivers"],
  });

  const locationsQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/locations"],
  });

  const summaryQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/mobility-summary", summaryDateRange.startDate, summaryDateRange.endDate],
    queryFn: async () => {
      const params = new URLSearchParams(summaryDateRange);
      const res = await fetch(`/api/corporate/scheduling/mobility-summary?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/corporate/scheduling/mobility-configs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/mobility-configs"] });
      setShowCreateDialog(false);
      resetConfigForm();
      toast({ title: "Mobility config created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => apiRequest("PATCH", `/api/corporate/scheduling/mobility-configs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/mobility-configs"] });
      toast({ title: "Mobility config updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/corporate/scheduling/mobility-configs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/mobility-configs"] });
      toast({ title: "Mobility config deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/corporate/scheduling/mobility-configs/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/mobility-configs"] });
    },
  });

  const riskAssessmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/corporate/scheduling/mobility-risk-assessment", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setRiskResults(data);
      if (!data.warnings || data.warnings.length === 0) {
        toast({ title: "All Clear", description: "No mobility risks detected" });
      }
    },
    onError: (err: any) => toast({ title: "Risk assessment failed", description: err.message, variant: "destructive" }),
  });

  const resetConfigForm = () => {
    setConfigForm({
      name: "", description: "", maxTravelDistanceMiles: "50", maxTravelTimeMinutes: "60",
      minRestBetweenCrossLocationMinutes: "480", maxCrossLocationShiftsPerWeek: "3",
      maxCrossLocationShiftsPerDay: "1", warningDistanceMiles: "30", warningTravelTimeMinutes: "45",
    });
  };

  const handleCreateConfig = () => {
    createMutation.mutate({
      ...configForm,
      maxTravelDistanceMiles: Number(configForm.maxTravelDistanceMiles),
      maxTravelTimeMinutes: Number(configForm.maxTravelTimeMinutes),
      minRestBetweenCrossLocationMinutes: Number(configForm.minRestBetweenCrossLocationMinutes),
      maxCrossLocationShiftsPerWeek: Number(configForm.maxCrossLocationShiftsPerWeek),
      maxCrossLocationShiftsPerDay: Number(configForm.maxCrossLocationShiftsPerDay),
      warningDistanceMiles: Number(configForm.warningDistanceMiles),
      warningTravelTimeMinutes: Number(configForm.warningTravelTimeMinutes),
      entityId: entityId || undefined,
    });
  };

  const configs = configsQuery.data || [];
  const travelLogs = travelLogsQuery.data || [];
  const driversList = (driversQuery.data as any[]) || [];
  const locationsList = (locationsQuery.data as any[]) || [];
  const summary = summaryQuery.data;

  const getRiskBadge = (level: string) => {
    switch (level) {
      case "high": return <Badge variant="destructive" data-testid="text-risk-level">High Risk</Badge>;
      case "warning": return <Badge variant="secondary" data-testid="text-risk-level"><AlertTriangle className="h-3 w-3 mr-1" />Warning</Badge>;
      case "safe": return <Badge variant="outline" data-testid="text-risk-level"><CheckCircle2 className="h-3 w-3 mr-1" />Safe</Badge>;
      default: return <Badge variant="outline" data-testid="text-risk-level">{level}</Badge>;
    }
  };

  return (
    <div className="space-y-6" data-testid="container-cross-location">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-cross-location-title">Cross-Location Mobility Controls</h3>
          <p className="text-sm text-muted-foreground">Manage driver mobility across locations with travel limits, risk assessment, and tracking</p>
        </div>
      </div>

      <Tabs value={mobilitySubTab} onValueChange={setMobilitySubTab}>
        <TabsList>
          <TabsTrigger value="config" data-testid="tab-mobility-config">
            <Settings className="h-4 w-4 mr-1" />Config
          </TabsTrigger>
          <TabsTrigger value="travel-logs" data-testid="tab-travel-logs">
            <FileText className="h-4 w-4 mr-1" />Travel Logs
          </TabsTrigger>
          <TabsTrigger value="risk-assessment" data-testid="tab-risk-assessment">
            <AlertTriangle className="h-4 w-4 mr-1" />Risk Assessment
          </TabsTrigger>
          <TabsTrigger value="summary" data-testid="tab-mobility-summary">
            <BarChart3 className="h-4 w-4 mr-1" />Summary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => { resetConfigForm(); setShowCreateDialog(true); }} data-testid="button-create-mobility-config">
                <Plus className="mr-2 h-4 w-4" />Create Config
              </Button>
            </div>
            {configsQuery.isLoading ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : configs.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-mobility-configs">No mobility configurations found. Create one to get started.</CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {configs.map((cfg: any) => (
                  <Card key={cfg.id} data-testid={`card-mobility-config-${cfg.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <CardTitle className="text-base">{cfg.name}</CardTitle>
                          {cfg.description && <CardDescription>{cfg.description}</CardDescription>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={cfg.isActive ? "secondary" : "outline"}>{cfg.isActive ? "Active" : "Inactive"}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Max Distance:</span> {cfg.maxTravelDistanceMiles} mi</div>
                        <div><span className="text-muted-foreground">Max Travel Time:</span> {cfg.maxTravelTimeMinutes} min</div>
                        <div><span className="text-muted-foreground">Min Rest:</span> {cfg.minRestBetweenCrossLocationMinutes} min</div>
                        <div><span className="text-muted-foreground">Max Daily:</span> {cfg.maxCrossLocationShiftsPerDay}</div>
                        <div><span className="text-muted-foreground">Max Weekly:</span> {cfg.maxCrossLocationShiftsPerWeek}</div>
                        <div><span className="text-muted-foreground">Warn Distance:</span> {cfg.warningDistanceMiles} mi</div>
                      </div>
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: cfg.id, isActive: !cfg.isActive })}>
                          <ToggleLeft className="mr-1 h-3 w-3" />{cfg.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(cfg.id)}>
                          <Trash2 className="mr-1 h-3 w-3" />Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="travel-logs" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={travelLogFilters.startDate} onChange={(e) => setTravelLogFilters(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={travelLogFilters.endDate} onChange={(e) => setTravelLogFilters(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Risk Level</Label>
                <Select value={travelLogFilters.riskLevel} onValueChange={(v) => setTravelLogFilters(f => ({ ...f, riskLevel: v }))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="safe">Safe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {travelLogsQuery.isLoading ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : travelLogs.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No travel logs found for the selected filters.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {travelLogs.map((log: any, idx: number) => (
                  <Card key={log.id || idx} data-testid={`card-travel-log-${idx}`}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-3">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">{log.fromLocation} → {log.toLocation}</div>
                            <div className="text-xs text-muted-foreground">{log.date} &middot; {log.driverName || "Unknown Driver"}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm">{log.distanceMiles} mi</span>
                          <span className="text-sm">{log.travelTimeMinutes} min</span>
                          {getRiskBadge(log.riskLevel)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="risk-assessment" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mobility Risk Check</CardTitle>
              <CardDescription>Assess risk for a driver traveling to a different location</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Driver</Label>
                  <Select value={riskForm.driverId} onValueChange={(v) => setRiskForm(f => ({ ...f, driverId: v }))}>
                    <SelectTrigger data-testid="select-risk-driver"><SelectValue placeholder="Select driver" /></SelectTrigger>
                    <SelectContent>
                      {driversList.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>{d.name || d.firstName + " " + d.lastName || d.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Target Location</Label>
                  <Select value={riskForm.targetLocationId} onValueChange={(v) => setRiskForm(f => ({ ...f, targetLocationId: v }))}>
                    <SelectTrigger data-testid="select-risk-location"><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {locationsList.map((loc: any) => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name || loc.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Shift Date</Label>
                  <Input type="date" value={riskForm.targetShiftDate} onChange={(e) => setRiskForm(f => ({ ...f, targetShiftDate: e.target.value }))} data-testid="input-risk-date" />
                </div>
                <div>
                  <Label>Start Time</Label>
                  <Input type="time" value={riskForm.targetShiftStartTime} onChange={(e) => setRiskForm(f => ({ ...f, targetShiftStartTime: e.target.value }))} data-testid="input-risk-time" />
                </div>
              </div>
              <div className="mt-4">
                <Button
                  onClick={() => riskAssessmentMutation.mutate(riskForm)}
                  disabled={riskAssessmentMutation.isPending || !riskForm.driverId || !riskForm.targetLocationId || !riskForm.targetShiftDate || !riskForm.targetShiftStartTime}
                  data-testid="button-assess-risk"
                >
                  {riskAssessmentMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                  Assess Risk
                </Button>
              </div>
              {riskResults && (
                <div className="mt-4 space-y-3">
                  {riskResults.warnings && riskResults.warnings.length > 0 ? (
                    riskResults.warnings.map((w: any, idx: number) => (
                      <Card key={idx}>
                        <CardContent className="py-3">
                          <div className="flex items-center gap-2">
                            {w.severity === "high" ? (
                              <Badge variant="destructive" data-testid="text-risk-level"><AlertCircle className="h-3 w-3 mr-1" />{w.severity}</Badge>
                            ) : (
                              <Badge variant="secondary" data-testid="text-risk-level"><AlertTriangle className="h-3 w-3 mr-1" />{w.severity}</Badge>
                            )}
                            <span className="text-sm">{w.message}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <CardContent className="py-4 text-center">
                        <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto mb-2" />
                        <p className="text-sm font-medium">All Clear</p>
                        <p className="text-xs text-muted-foreground">No mobility risk warnings detected</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={summaryDateRange.startDate} onChange={(e) => setSummaryDateRange(r => ({ ...r, startDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={summaryDateRange.endDate} onChange={(e) => setSummaryDateRange(r => ({ ...r, endDate: e.target.value }))} />
              </div>
            </div>
            {summaryQuery.isLoading ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : summary ? (
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Trips</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold" data-testid="text-summary-total-trips">{summary.totalTrips ?? 0}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">High Risk</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold text-red-600" data-testid="text-summary-high-risk">{summary.highRisk ?? 0}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Warnings</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold text-yellow-600">{summary.warnings ?? 0}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Safe</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold text-green-600">{summary.safe ?? 0}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg Distance</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold" data-testid="text-summary-avg-distance">{summary.avgDistanceMiles ?? 0} mi</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg Travel Time</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{summary.avgTravelTimeMinutes ?? 0} min</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Unique Drivers</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{summary.uniqueDrivers ?? 0}</p></CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No summary data available for this date range.</CardContent></Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Mobility Config</DialogTitle>
            <DialogDescription>Define travel limits and thresholds for cross-location assignments</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={configForm.name} onChange={(e) => setConfigForm(f => ({ ...f, name: e.target.value }))} data-testid="input-mobility-name" placeholder="Config name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={configForm.description} onChange={(e) => setConfigForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Max Distance (miles)</Label>
                <Input type="number" value={configForm.maxTravelDistanceMiles} onChange={(e) => setConfigForm(f => ({ ...f, maxTravelDistanceMiles: e.target.value }))} data-testid="input-max-distance" />
              </div>
              <div>
                <Label>Max Travel Time (min)</Label>
                <Input type="number" value={configForm.maxTravelTimeMinutes} onChange={(e) => setConfigForm(f => ({ ...f, maxTravelTimeMinutes: e.target.value }))} data-testid="input-max-travel-time" />
              </div>
              <div>
                <Label>Warning Distance (miles)</Label>
                <Input type="number" value={configForm.warningDistanceMiles} onChange={(e) => setConfigForm(f => ({ ...f, warningDistanceMiles: e.target.value }))} data-testid="input-warning-distance" />
              </div>
              <div>
                <Label>Warning Travel Time (min)</Label>
                <Input type="number" value={configForm.warningTravelTimeMinutes} onChange={(e) => setConfigForm(f => ({ ...f, warningTravelTimeMinutes: e.target.value }))} data-testid="input-warning-travel-time" />
              </div>
              <div>
                <Label>Min Rest Between (min)</Label>
                <Input type="number" value={configForm.minRestBetweenCrossLocationMinutes} onChange={(e) => setConfigForm(f => ({ ...f, minRestBetweenCrossLocationMinutes: e.target.value }))} data-testid="input-min-rest" />
              </div>
              <div>
                <Label>Max Daily Cross-Location</Label>
                <Input type="number" value={configForm.maxCrossLocationShiftsPerDay} onChange={(e) => setConfigForm(f => ({ ...f, maxCrossLocationShiftsPerDay: e.target.value }))} data-testid="input-max-daily" />
              </div>
              <div>
                <Label>Max Weekly Cross-Location</Label>
                <Input type="number" value={configForm.maxCrossLocationShiftsPerWeek} onChange={(e) => setConfigForm(f => ({ ...f, maxCrossLocationShiftsPerWeek: e.target.value }))} data-testid="input-max-weekly" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateConfig} disabled={createMutation.isPending || !configForm.name} data-testid="button-save-mobility-config">
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Config
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChangeJustificationTab({ entityId }: { entityId: string | null }) {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ startDate: "", endDate: "" });
  const [selectedJustification, setSelectedJustification] = useState<any>(null);

  const justificationsQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/justifications", categoryFilter, searchQuery, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (searchQuery) params.set("search", searchQuery);
      if (dateRange.startDate) params.set("startDate", dateRange.startDate);
      if (dateRange.endDate) params.set("endDate", dateRange.endDate);
      const res = await fetch(`/api/corporate/scheduling/justifications?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/corporate/scheduling/justifications", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/justifications"] });
      setShowCreateDialog(false);
      toast({ title: "Justification recorded", description: "The change justification has been saved as an immutable audit record." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create justification", variant: "destructive" });
    },
  });

  const [formData, setFormData] = useState({
    category: "" as string,
    narrative: "",
    scheduleId: "",
    shiftId: "",
    driverId: "",
  });

  const handleCreate = () => {
    if (!formData.category) {
      toast({ title: "Category required", description: "Please select a justification category.", variant: "destructive" });
      return;
    }
    if (!formData.narrative || formData.narrative.trim().length < 10) {
      toast({ title: "Narrative required", description: "Please provide a detailed justification (at least 10 characters).", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      category: formData.category,
      narrative: formData.narrative,
      scheduleId: formData.scheduleId || null,
      shiftId: formData.shiftId || null,
      driverId: formData.driverId || null,
      entityId: entityId || null,
    });
  };

  const resetForm = () => {
    setFormData({ category: "", narrative: "", scheduleId: "", shiftId: "", driverId: "" });
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case "ot_override": return "OT Override";
      case "break_exception": return "Break Exception";
      case "incident_mode": return "Incident Mode";
      default: return cat;
    }
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case "ot_override": return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" data-testid={`badge-category-${cat}`}>{getCategoryLabel(cat)}</Badge>;
      case "break_exception": return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" data-testid={`badge-category-${cat}`}>{getCategoryLabel(cat)}</Badge>;
      case "incident_mode": return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid={`badge-category-${cat}`}>{getCategoryLabel(cat)}</Badge>;
      default: return <Badge data-testid={`badge-category-${cat}`}>{cat}</Badge>;
    }
  };

  const justifications = (justificationsQuery.data as any[]) || [];

  return (
    <div className="space-y-6" data-testid="container-justifications">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-justifications-title">Change Justification & Narrative Capture</h3>
          <p className="text-sm text-muted-foreground">Record and audit mandatory justifications for high-risk or exceptional scheduling decisions</p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreateDialog(true); }} data-testid="button-create-justification">
          <Plus className="h-4 w-4 mr-2" />
          Record Justification
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search narratives..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-justifications"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="ot_override">OT Override</SelectItem>
            <SelectItem value="break_exception">Break Exception</SelectItem>
            <SelectItem value="incident_mode">Incident Mode</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateRange.startDate}
          onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
          className="w-[150px]"
          data-testid="input-date-start"
        />
        <Input
          type="date"
          value={dateRange.endDate}
          onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
          className="w-[150px]"
          data-testid="input-date-end"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">OT Overrides</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-count-ot">{justifications.filter((j: any) => j.category === "ot_override").length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Break Exceptions</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-count-break">{justifications.filter((j: any) => j.category === "break_exception").length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Incident Mode</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-count-incident">{justifications.filter((j: any) => j.category === "incident_mode").length}</p>
          </CardContent>
        </Card>
      </div>

      {justificationsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : justifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground" data-testid="text-no-justifications">No justifications recorded yet</p>
            <p className="text-sm text-muted-foreground mt-1">Justification records will appear here when scheduling exceptions are documented</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {justifications.map((j: any) => (
            <Card key={j.id} className="hover-elevate cursor-pointer" onClick={() => setSelectedJustification(j)} data-testid={`card-justification-${j.id}`}>
              <CardContent className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {getCategoryBadge(j.category)}
                      <Badge variant="outline">
                        <Lock className="h-3 w-3 mr-1" />
                        Immutable
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {j.createdAt ? format(new Date(j.createdAt), "MMM d, yyyy 'at' h:mm a") : ""}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2" data-testid={`text-narrative-${j.id}`}>{j.narrative}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span data-testid={`text-author-${j.id}`}>By: {j.createdByName}</span>
                      {j.scheduleId && <span>Schedule: {j.scheduleId.slice(0, 8)}...</span>}
                      {j.driverId && <span>Driver: {j.driverId.slice(0, 8)}...</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedJustification(j); }} data-testid={`button-view-${j.id}`}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Record Change Justification</DialogTitle>
            <DialogDescription>
              Document the reason for this scheduling exception. This record is immutable and will be part of the permanent audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label required>Category</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData(prev => ({ ...prev, category: v }))}>
                <SelectTrigger data-testid="select-justification-category">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ot_override">OT Override - Overtime authorization</SelectItem>
                  <SelectItem value="break_exception">Break Exception - Break rule deviation</SelectItem>
                  <SelectItem value="incident_mode">Incident Mode - Emergency scheduling action</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label required>Justification Narrative</Label>
              <Textarea
                value={formData.narrative}
                onChange={(e) => setFormData(prev => ({ ...prev, narrative: e.target.value }))}
                placeholder="Describe the reason for this exception in detail (minimum 10 characters)..."
                rows={5}
                data-testid="textarea-justification-narrative"
              />
              <p className="text-xs text-muted-foreground mt-1">{formData.narrative.length} characters (minimum 10 required)</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Schedule ID (optional)</Label>
                <Input
                  value={formData.scheduleId}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduleId: e.target.value }))}
                  placeholder="Link to schedule..."
                  data-testid="input-justification-schedule"
                />
              </div>
              <div>
                <Label>Shift ID (optional)</Label>
                <Input
                  value={formData.shiftId}
                  onChange={(e) => setFormData(prev => ({ ...prev, shiftId: e.target.value }))}
                  placeholder="Link to shift..."
                  data-testid="input-justification-shift"
                />
              </div>
            </div>
            <div>
              <Label>Driver ID (optional)</Label>
              <Input
                value={formData.driverId}
                onChange={(e) => setFormData(prev => ({ ...prev, driverId: e.target.value }))}
                placeholder="Link to driver..."
                data-testid="input-justification-driver"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} data-testid="button-cancel-justification">Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !formData.category || formData.narrative.trim().length < 10}
              data-testid="button-save-justification"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
              Record Justification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedJustification} onOpenChange={(open) => !open && setSelectedJustification(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Justification Record
            </DialogTitle>
            <DialogDescription>Immutable audit record - cannot be modified or deleted</DialogDescription>
          </DialogHeader>
          {selectedJustification && (
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap items-center gap-2">
                {getCategoryBadge(selectedJustification.category)}
                <Badge variant="outline">
                  <Lock className="h-3 w-3 mr-1" />
                  Immutable
                </Badge>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Narrative</Label>
                <p className="text-sm mt-1 p-3 bg-muted rounded-md" data-testid="text-detail-narrative">{selectedJustification.narrative}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Recorded By</Label>
                  <p className="text-sm font-medium" data-testid="text-detail-author">{selectedJustification.createdByName}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Recorded At</Label>
                  <p className="text-sm font-medium" data-testid="text-detail-date">
                    {selectedJustification.createdAt ? format(new Date(selectedJustification.createdAt), "MMM d, yyyy 'at' h:mm:ss a") : ""}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {selectedJustification.scheduleId && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Schedule ID</Label>
                    <p className="text-sm font-mono">{selectedJustification.scheduleId}</p>
                  </div>
                )}
                {selectedJustification.shiftId && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Shift ID</Label>
                    <p className="text-sm font-mono">{selectedJustification.shiftId}</p>
                  </div>
                )}
                {selectedJustification.driverId && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Driver ID</Label>
                    <p className="text-sm font-mono">{selectedJustification.driverId}</p>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Record ID</Label>
                <p className="text-sm font-mono text-muted-foreground" data-testid="text-detail-id">{selectedJustification.id}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AIGovernanceTab({ entityId }: { entityId: string | null }) {
  const { toast } = useToast();
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; logId: string | null }>({ open: false, logId: null });
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewAction, setReviewAction] = useState("accepted");
  const [filterFeature, setFilterFeature] = useState<string>("all");

  const featuresQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/ai-governance/features", entityId],
    queryFn: async () => {
      if (!entityId) return [];
      const res = await fetch(`/api/corporate/scheduling/ai-governance/features/${entityId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!entityId,
  });

  const decisionsQuery = useQuery({
    queryKey: ["/api/corporate/scheduling/ai-governance/decisions", entityId, filterFeature],
    queryFn: async () => {
      if (!entityId) return [];
      const params = new URLSearchParams();
      if (filterFeature && filterFeature !== "all") params.set("featureKey", filterFeature);
      params.set("limit", "50");
      const res = await fetch(`/api/corporate/scheduling/ai-governance/decisions/${entityId}?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!entityId,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/corporate/scheduling/ai-governance/seed-defaults/${entityId}`);
      if (!res.ok) throw new Error("Failed to seed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/ai-governance/features", entityId] });
      toast({ title: "Default AI features initialized" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled, disabledReason }: { id: string; isEnabled: boolean; disabledReason?: string }) => {
      return apiRequest("PATCH", `/api/corporate/scheduling/ai-governance/features/${id}/toggle`, { isEnabled, disabledReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/ai-governance/features", entityId] });
      toast({ title: "AI feature updated" });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, notes, actionTaken }: { id: string; status: string; notes: string; actionTaken: string }) => {
      return apiRequest("PATCH", `/api/corporate/scheduling/ai-governance/decisions/${id}/review`, { status, notes, actionTaken });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/corporate/scheduling/ai-governance/decisions", entityId, filterFeature] });
      setReviewDialog({ open: false, logId: null });
      setReviewNotes("");
      toast({ title: "Decision reviewed" });
    },
  });

  if (!entityId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p data-testid="text-ai-no-entity">Select a scheduling entity to manage AI governance settings</p>
        </CardContent>
      </Card>
    );
  }

  const features = featuresQuery.data || [];
  const decisions = decisionsQuery.data || [];
  const enabledCount = features.filter((f: any) => f.isEnabled).length;
  const disabledCount = features.filter((f: any) => !f.isEnabled).length;
  const pendingReviews = decisions.filter((d: any) => d.humanReviewStatus === "pending").length;
  const selectedFeatureData = selectedFeature ? features.find((f: any) => f.featureKey === selectedFeature) : null;

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return "text-green-600 dark:text-green-400";
    if (score >= 0.6) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" data-testid={`badge-status-${status}`}><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
      case "approved": return <Badge variant="default" data-testid={`badge-status-${status}`}><Check className="h-3 w-3 mr-1" />Approved</Badge>;
      case "rejected": return <Badge variant="destructive" data-testid={`badge-status-${status}`}><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case "noted": return <Badge variant="secondary" data-testid={`badge-status-${status}`}><Eye className="h-3 w-3 mr-1" />Noted</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold" data-testid="text-ai-governance-title">AI Governance & Explainability</h3>
          <p className="text-sm text-muted-foreground">Transparency, auditability, and human oversight for all AI-assisted scheduling features</p>
        </div>
        {features.length === 0 && (
          <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-seed-defaults">
            {seedMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
            Initialize Default Features
          </Button>
        )}
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lightbulb className="h-4 w-4 text-primary" />
            Total AI Features
          </div>
          <p className="text-2xl font-bold mt-1" data-testid="text-total-features">{features.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            Enabled
          </div>
          <p className="text-2xl font-bold mt-1" data-testid="text-enabled-count">{enabledCount}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <XCircle className="h-4 w-4 text-red-500" />
            Disabled
          </div>
          <p className="text-2xl font-bold mt-1" data-testid="text-disabled-count">{disabledCount}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            Pending Reviews
          </div>
          <p className="text-2xl font-bold mt-1" data-testid="text-pending-reviews">{pendingReviews}</p>
        </Card>
      </div>

      {featuresQuery.isLoading ? (
        <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <Card data-testid="card-ai-features">
            <CardHeader>
              <CardTitle className="text-base">AI Feature Registry</CardTitle>
              <CardDescription>Per-feature disclosure of data usage, predictions, confidence levels, and human-in-the-loop requirements</CardDescription>
            </CardHeader>
            <CardContent>
              {features.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No AI features configured. Click "Initialize Default Features" to get started.</p>
              ) : (
                <div className="space-y-4">
                  {features.map((feature: any) => (
                    <Card key={feature.id} className={cn("border", !feature.isEnabled && "opacity-60")} data-testid={`card-feature-${feature.featureKey}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between flex-wrap gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium" data-testid={`text-feature-name-${feature.featureKey}`}>{feature.featureName}</h4>
                              {feature.isEnabled ? (
                                <Badge variant="default" data-testid={`badge-enabled-${feature.featureKey}`}>Active</Badge>
                              ) : (
                                <Badge variant="destructive" data-testid={`badge-disabled-${feature.featureKey}`}>Disabled</Badge>
                              )}
                              {feature.humanApprovalRequired && (
                                <Badge variant="outline" data-testid={`badge-hitl-${feature.featureKey}`}>
                                  <UserCheck className="h-3 w-3 mr-1" />Human-in-the-loop
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{feature.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant={selectedFeature === feature.featureKey ? "default" : "outline"}
                              onClick={() => setSelectedFeature(selectedFeature === feature.featureKey ? null : feature.featureKey)}
                              data-testid={`button-details-${feature.featureKey}`}
                            >
                              <Eye className="h-4 w-4 mr-1" />Details
                            </Button>
                            <Button
                              size="sm"
                              variant={feature.isEnabled ? "destructive" : "default"}
                              onClick={() => toggleMutation.mutate({
                                id: feature.id,
                                isEnabled: !feature.isEnabled,
                                disabledReason: feature.isEnabled ? "Manually disabled by admin" : undefined,
                              })}
                              disabled={toggleMutation.isPending}
                              data-testid={`button-toggle-${feature.featureKey}`}
                            >
                              <ToggleLeft className="h-4 w-4 mr-1" />
                              {feature.isEnabled ? "Disable" : "Enable"}
                            </Button>
                          </div>
                        </div>

                        {selectedFeature === feature.featureKey && (
                          <div className="mt-4 space-y-3 border-t pt-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">DATA INPUTS</Label>
                                <div className="flex flex-wrap gap-1 mt-1" data-testid={`list-data-inputs-${feature.featureKey}`}>
                                  {(feature.dataInputs as string[] || []).map((input: string) => (
                                    <Badge key={input} variant="secondary">{input.replace(/_/g, " ")}</Badge>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">PREDICTION TARGET</Label>
                                <p className="text-sm mt-1" data-testid={`text-prediction-${feature.featureKey}`}>{feature.predictionTarget}</p>
                              </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-3">
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">CONFIDENCE THRESHOLD</Label>
                                <p className={cn("text-sm font-mono mt-1", getConfidenceColor(feature.confidenceThreshold))} data-testid={`text-confidence-${feature.featureKey}`}>
                                  {(feature.confidenceThreshold * 100).toFixed(0)}%
                                </p>
                              </div>
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">HUMAN APPROVAL</Label>
                                <p className="text-sm mt-1">{feature.humanApprovalRequired ? "Required before action" : "Advisory only"}</p>
                              </div>
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">STATUS</Label>
                                <p className="text-sm mt-1">{feature.isEnabled ? "Active and generating suggestions" : `Disabled${feature.disabledReason ? `: ${feature.disabledReason}` : ""}`}</p>
                              </div>
                            </div>
                            {!feature.isEnabled && feature.disabledAt && (
                              <div className="bg-muted/50 rounded-md p-3">
                                <p className="text-xs text-muted-foreground">
                                  Disabled on {format(new Date(feature.disabledAt), "MMM d, yyyy 'at' h:mm a")}
                                  {feature.disabledReason && ` — ${feature.disabledReason}`}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-ai-decisions">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">AI Decision Log</CardTitle>
                  <CardDescription>Audit trail of all AI-generated suggestions (advisory only) with human review status</CardDescription>
                </div>
                <Select value={filterFeature} onValueChange={setFilterFeature}>
                  <SelectTrigger className="w-48" data-testid="select-filter-feature">
                    <SelectValue placeholder="Filter by feature" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Features</SelectItem>
                    {features.map((f: any) => (
                      <SelectItem key={f.featureKey} value={f.featureKey}>{f.featureName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {decisionsQuery.isLoading ? (
                <div className="flex items-center justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : decisions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-decisions">
                  No AI decisions logged yet. Decisions will appear here as AI features generate suggestions.
                </p>
              ) : (
                <div className="space-y-3">
                  {decisions.map((log: any) => (
                    <Card key={log.id} className="border" data-testid={`card-decision-${log.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between flex-wrap gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{log.featureKey.replace(/_/g, " ")}</Badge>
                              <Badge variant="secondary">{log.decisionType}</Badge>
                              {getStatusBadge(log.humanReviewStatus)}
                              {log.confidenceScore != null && (
                                <span className={cn("text-xs font-mono", getConfidenceColor(log.confidenceScore))}>
                                  {(log.confidenceScore * 100).toFixed(0)}% confidence
                                </span>
                              )}
                            </div>
                            <p className="text-sm mt-2" data-testid={`text-explanation-${log.id}`}>{log.explanation}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(log.createdAt), "MMM d, yyyy 'at' h:mm a")}
                            </p>
                          </div>
                          {log.humanReviewStatus === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReviewDialog({ open: true, logId: log.id });
                                setReviewNotes("");
                                setReviewAction("approved");
                              }}
                              data-testid={`button-review-${log.id}`}
                            >
                              <ClipboardCheck className="h-4 w-4 mr-1" />Review
                            </Button>
                          )}
                        </div>
                        {log.humanReviewNotes && (
                          <div className="bg-muted/50 rounded-md p-3 mt-3">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Review Notes</p>
                            <p className="text-sm">{log.humanReviewNotes}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Action: {log.actionTaken || "none"} | Reviewed {log.humanReviewedAt ? format(new Date(log.humanReviewedAt), "MMM d, yyyy") : ""}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-ai-methodology">
            <CardHeader>
              <CardTitle className="text-base">AI Governance Policy</CardTitle>
              <CardDescription>How AI is used within this scheduling entity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-1"><Shield className="h-4 w-4" /> Principles</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>All AI features are advisory-only; no autonomous scheduling actions</li>
                    <li>Every suggestion includes a plain-language explanation</li>
                    <li>Confidence scores are displayed for all predictions</li>
                    <li>Human approval is enforced before any suggested action is applied</li>
                    <li>All AI decisions are logged immutably for audit purposes</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-1"><Settings className="h-4 w-4" /> Controls</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Each AI feature can be independently enabled or disabled per entity</li>
                    <li>Disabling a feature has zero impact on core scheduling operations</li>
                    <li>Confidence thresholds are configurable per feature</li>
                    <li>Decision logs are retained for compliance and audit review</li>
                    <li>No self-learning or autonomous policy changes in v1</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={reviewDialog.open} onOpenChange={(open) => setReviewDialog({ open, logId: open ? reviewDialog.logId : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review AI Decision</DialogTitle>
            <DialogDescription>Provide your assessment of this AI suggestion</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Review Status</Label>
              <Select value={reviewAction} onValueChange={setReviewAction}>
                <SelectTrigger data-testid="select-review-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve - Accept suggestion</SelectItem>
                  <SelectItem value="rejected">Reject - Decline suggestion</SelectItem>
                  <SelectItem value="noted">Note - Acknowledge without action</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Review Notes</Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Optional notes about this decision..."
                data-testid="input-review-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog({ open: false, logId: null })}>Cancel</Button>
            <Button
              onClick={() => {
                if (reviewDialog.logId) {
                  reviewMutation.mutate({
                    id: reviewDialog.logId,
                    status: reviewAction,
                    notes: reviewNotes,
                    actionTaken: reviewAction,
                  });
                }
              }}
              disabled={reviewMutation.isPending}
              data-testid="button-submit-review"
            >
              {reviewMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Submit Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Scheduling() {
  const [activeTab, setActiveTab] = useState("schedules");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const { data: entitiesData } = useQuery<any[]>({
    queryKey: ["/api/corporate/scheduling/entities"],
  });
  const entities = entitiesData || [];

  useMemo(() => {
    if (!selectedEntityId && entities.length > 0) {
      const defaultEntity = entities.find((e: any) => e.isDefault) || entities[0];
      if (defaultEntity) setSelectedEntityId(defaultEntity.id);
    }
  }, [entities, selectedEntityId]);

  const { data: schedulesData, isLoading: schedulesLoading, isError: schedulesError, refetch: schedulesRefetch } = useQuery<{ schedules: any[]; total: number }>({
    queryKey: ["/api/scheduling/schedules", { entityId: selectedEntityId }],
    queryFn: async () => {
      const params = selectedEntityId ? `?entityId=${selectedEntityId}` : '';
      const res = await fetch(`/api/scheduling/schedules${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const schedules = schedulesData?.schedules || [];
  const draftCount = schedules.filter(s => s.status === 'draft').length;
  const publishedCount = schedules.filter(s => s.status === 'published').length;
  const lockedCount = schedules.filter(s => s.status === 'locked').length;

  return (
    <div className="p-6 space-y-6" data-ipad-module="scheduling">
      <div>
        <h1 className="text-2xl font-bold">Scheduling</h1>
        <p className="text-muted-foreground">
          Manage schedules, shifts, and worker assignments
        </p>
      </div>

      <SchedulingModuleNav active="dashboard" />

      {entities.length > 1 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">Entity:</span>
          <Select value={selectedEntityId || ''} onValueChange={(val) => setSelectedEntityId(val)}>
            <SelectTrigger className="w-[280px]" data-testid="select-scheduling-entity">
              <SelectValue placeholder="Select entity..." />
            </SelectTrigger>
            <SelectContent>
              {entities.map((entity: any) => (
                <SelectItem key={entity.id} value={entity.id} data-testid={`select-entity-${entity.entityCode}`}>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{entity.legalName}</span>
                    {entity.isDefault && <Badge variant="secondary">Default</Badge>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {schedulesError && (
        <div className="flex items-center gap-2 py-2 text-sm" data-testid="error-schedules-banner">
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
          <span className="text-muted-foreground">Unable to load schedule data.</span>
          <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => schedulesRefetch()}>Retry</Button>
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Schedules</div>
          {schedulesLoading ? <Skeleton className="h-8 w-10 mt-1" /> : <p className="text-2xl font-bold mt-1" data-testid="stat-total-schedules">{schedules.length}</p>}
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Draft</div>
          {schedulesLoading ? <Skeleton className="h-8 w-10 mt-1" /> : <p className="text-2xl font-bold mt-1" data-testid="stat-draft-schedules">{draftCount}</p>}
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Published</div>
          {schedulesLoading ? <Skeleton className="h-8 w-10 mt-1" /> : <p className="text-2xl font-bold mt-1" data-testid="stat-published-schedules">{publishedCount}</p>}
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Locked</div>
          {schedulesLoading ? <Skeleton className="h-8 w-10 mt-1" /> : <p className="text-2xl font-bold mt-1" data-testid="stat-locked-schedules">{lockedCount}</p>}
        </Card>
      </div>

      {/* ── Drivers with Most Time Off widget ──────────────────────────── */}
      <WiwTimeOffWidget limit={3} compact />

      <div>
        <h2 className="text-lg font-bold mb-3" data-testid="text-scheduling-workspace-header">Scheduling Workspace</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex flex-wrap gap-1 items-center justify-start">
          <TabsTrigger value="schedules" data-testid="tab-schedules">
            <CalendarDays className="mr-1 h-4 w-4" />
            Schedules
          </TabsTrigger>
          <TabsTrigger value="availability" data-testid="tab-availability">
            <Clock className="mr-1 h-4 w-4" />
            Availability
          </TabsTrigger>
          <TabsTrigger value="constraints" data-testid="tab-constraints">
            <ClipboardCheck className="mr-1 h-4 w-4" />
            Constraints
          </TabsTrigger>
          <TabsTrigger value="time-attendance" data-testid="tab-time-attendance">
            <Timer className="mr-1 h-4 w-4" />
            Time & Attendance
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <FileStack className="mr-1 h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="swaps" data-testid="tab-swaps">
            <ArrowLeftRight className="mr-1 h-4 w-4" />
            Shift Swaps
          </TabsTrigger>
          <TabsTrigger value="time-off" data-testid="tab-time-off">
            <CalendarIcon className="mr-1 h-4 w-4" />
            Time Off
          </TabsTrigger>
          <TabsTrigger value="messages" data-testid="tab-messages">
            <MessageSquare className="mr-1 h-4 w-4" />
            Messages
          </TabsTrigger>
          <TabsTrigger value="labor-costs" data-testid="tab-labor-costs">
            <DollarSign className="mr-1 h-4 w-4" />
            Labor Costs
          </TabsTrigger>
          <TabsTrigger value="payroll-export" data-testid="tab-payroll-export">
            <Download className="mr-1 h-4 w-4" />
            Payroll Export
          </TabsTrigger>
          <TabsTrigger value="compliance-alerts" data-testid="tab-compliance-alerts">
            <Bell className="mr-1 h-4 w-4" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="load-balancing" data-testid="tab-load-balancing">
            <Scale className="mr-1 h-4 w-4" />
            Load Balance
          </TabsTrigger>
          <TabsTrigger value="revenue-margin" data-testid="tab-revenue-margin">
            <DollarSign className="mr-1 h-4 w-4" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="reliability-signals" data-testid="tab-reliability-signals">
            <ShieldAlert className="mr-1 h-4 w-4" />
            Reliability
          </TabsTrigger>
          <TabsTrigger value="rebalancing" data-testid="tab-rebalancing">
            <Lightbulb className="mr-1 h-4 w-4" />
            Rebalancing
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <TrendingDown className="mr-1 h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="labor-forecast" data-testid="tab-labor-forecast"><TrendingDown className="h-4 w-4 mr-1" />Forecast</TabsTrigger>
          <TabsTrigger value="calendar-sync" data-testid="tab-calendar-sync"><CalendarIcon className="h-4 w-4 mr-1" />Calendar</TabsTrigger>
          <TabsTrigger value="permissions" data-testid="tab-permissions"><Shield className="h-4 w-4 mr-1" />Permissions</TabsTrigger>
          <TabsTrigger value="audit-log" data-testid="tab-audit-log"><History className="h-4 w-4 mr-1" />Audit Log</TabsTrigger>
          <TabsTrigger value="data-health" data-testid="tab-data-health"><HeartPulse className="h-4 w-4 mr-1" />Data Health</TabsTrigger>
          <TabsTrigger value="backup-pool" data-testid="tab-backup-pool"><UserCog className="h-4 w-4 mr-1" />Backup Pool</TabsTrigger>
          <TabsTrigger value="impact-analysis" data-testid="tab-impact-analysis"><BarChart3 className="h-4 w-4 mr-1" />Impact</TabsTrigger>
          <TabsTrigger value="compliance-evidence" data-testid="tab-compliance-evidence"><Shield className="h-4 w-4 mr-1" />Evidence</TabsTrigger>
          <TabsTrigger value="candidates" data-testid="tab-candidates"><Users className="h-4 w-4 mr-1" />Candidates</TabsTrigger>
          <TabsTrigger value="client-rules" data-testid="tab-client-rules"><ShieldAlert className="h-4 w-4 mr-1" />Client Rules</TabsTrigger>
          <TabsTrigger value="sandbox" data-testid="tab-sandbox"><Scale className="h-4 w-4 mr-1" />Sandbox</TabsTrigger>
          <TabsTrigger value="union-rules" data-testid="tab-union-rules"><Gavel className="h-4 w-4 mr-1" />Union Rules</TabsTrigger>
          <TabsTrigger value="insurance-reports" data-testid="tab-insurance-reports"><ClipboardList className="h-4 w-4 mr-1" />Insurance</TabsTrigger>
          <TabsTrigger value="client-config" data-testid="tab-client-config"><Palette className="h-4 w-4 mr-1" />Config</TabsTrigger>
          <TabsTrigger value="ai-governance" data-testid="tab-ai-governance"><Shield className="h-4 w-4 mr-1" />AI Governance</TabsTrigger>
          <TabsTrigger value="sla-tracking" data-testid="tab-sla-tracking"><ClipboardCheck className="h-4 w-4 mr-1" />SLA Tracking</TabsTrigger>
          <TabsTrigger value="cross-location" data-testid="tab-cross-location"><Navigation2 className="h-4 w-4 mr-1" />Mobility</TabsTrigger>
          <TabsTrigger value="justifications" data-testid="tab-justifications"><FileEdit className="h-4 w-4 mr-1" />Justifications</TabsTrigger>
          <TabsTrigger value="external-access" data-testid="tab-external-access"><Eye className="h-4 w-4 mr-1" />External Access</TabsTrigger>
          <TabsTrigger value="wiw-connect" data-testid="tab-wiw-connect"><Plug className="h-4 w-4 mr-1" />Connected Apps</TabsTrigger>
          <TabsTrigger value="wiw-data" data-testid="tab-wiw-data"><Database className="h-4 w-4 mr-1" />WIW Operational</TabsTrigger>
          <TabsTrigger value="wiw-ingestion" data-testid="tab-wiw-ingestion"><Download className="h-4 w-4 mr-1" />WIW Import</TabsTrigger>
          <TabsTrigger value="wiw-location-map" data-testid="tab-wiw-location-map"><MapPin className="h-4 w-4 mr-1" />Location Mapping</TabsTrigger>
          <TabsTrigger value="ot-watch" data-testid="tab-ot-watch"><Clock className="h-4 w-4 mr-1" />OT Watch</TabsTrigger>
          <TabsTrigger value="rebalance" data-testid="tab-rebalance"><TrendingDown className="h-4 w-4 mr-1" />Rebalance</TabsTrigger>
        </TabsList>

        <TabsContent value="schedules" className="mt-6">
          <SchedulesTab entityId={selectedEntityId} />
        </TabsContent>

        <TabsContent value="availability" className="mt-6">
          <AvailabilityTab />
        </TabsContent>

        <TabsContent value="constraints" className="mt-6">
          <ConstraintsTab />
        </TabsContent>

        <TabsContent value="time-attendance" className="mt-6">
          <TimeAttendanceTab />
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="swaps" className="mt-6">
          <ShiftSwapsTab />
        </TabsContent>
        <TabsContent value="time-off" className="mt-6">
          <TimeOffTab />
        </TabsContent>
        <TabsContent value="messages" className="mt-6">
          <MessagesTab />
        </TabsContent>
        <TabsContent value="labor-costs" className="mt-6">
          <LaborCostsTab />
        </TabsContent>
        <TabsContent value="payroll-export" className="mt-6">
          <PayrollExportTab />
        </TabsContent>
        <TabsContent value="compliance-alerts" className="mt-6">
          <ComplianceAlertsTab />
        </TabsContent>
        <TabsContent value="load-balancing" className="mt-6">
          <LoadBalancingTab />
        </TabsContent>
        <TabsContent value="revenue-margin" className="mt-6">
          <RevenueMarginTab />
        </TabsContent>
        <TabsContent value="reliability-signals" className="mt-6">
          <ReliabilitySignalsTab />
        </TabsContent>
        <TabsContent value="rebalancing" className="mt-6">
          <RebalancingTab />
        </TabsContent>
        <TabsContent value="analytics" className="mt-6">
          <AnalyticsDashboardTab />
        </TabsContent>

        <TabsContent value="labor-forecast" className="mt-6">
          <LaborForecastTab />
        </TabsContent>

        <TabsContent value="calendar-sync" className="mt-6">
          <CalendarSyncTab />
        </TabsContent>

        <TabsContent value="permissions" className="mt-6">
          <SchedulingPermissionsTab />
        </TabsContent>

        <TabsContent value="audit-log" className="mt-6">
          <SchedulingAuditLogTab />
        </TabsContent>

        <TabsContent value="data-health" className="mt-6">
          <SchedulingDataHealthTab />
        </TabsContent>

        <TabsContent value="backup-pool" className="mt-6">
          <SchedulingBackupPoolTab />
        </TabsContent>

        <TabsContent value="impact-analysis" className="mt-6">
          <SchedulingImpactAnalysisTab />
        </TabsContent>

        <TabsContent value="compliance-evidence" className="mt-6">
          <ComplianceEvidenceTab />
        </TabsContent>

        <TabsContent value="candidates" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Candidate Overview</CardTitle>
              <CardDescription>
                View recruiting candidate summaries relevant to scheduling assignments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CandidateSummaryPanel readOnly />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="client-rules" className="mt-6">
          <ClientRulesTab />
        </TabsContent>

        <TabsContent value="sandbox" className="mt-6">
          <OptimizationSandboxTab />
        </TabsContent>

        <TabsContent value="union-rules" className="mt-6">
          <UnionRulesTab entityId={selectedEntityId} />
        </TabsContent>

        <TabsContent value="insurance-reports" className="mt-6">
          <InsuranceReportsTab entityId={selectedEntityId} />
        </TabsContent>

        <TabsContent value="client-config" className="mt-6">
          <ClientConfigTab entityId={selectedEntityId} />
        </TabsContent>
        <TabsContent value="ai-governance" className="mt-6">
          <AIGovernanceTab entityId={selectedEntityId} />
        </TabsContent>
        <TabsContent value="sla-tracking" className="mt-6">
          <SlaTrackingTab entityId={selectedEntityId} />
        </TabsContent>
        <TabsContent value="cross-location" className="mt-6">
          <CrossLocationMobilityTab entityId={selectedEntityId} />
        </TabsContent>
        <TabsContent value="justifications" className="mt-6">
          <ChangeJustificationTab entityId={selectedEntityId} />
        </TabsContent>
        <TabsContent value="external-access" className="mt-6">
          <ExternalAccessTab entityId={selectedEntityId} />
        </TabsContent>
        <TabsContent value="wiw-connect" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Plug className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Connected Apps</CardTitle>
                  <CardDescription>Configure API integrations for scheduling and attendance data.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <WhenIWorkIntegration />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div>
                  <CardTitle className="text-base">Shift &amp; Time Sync</CardTitle>
                  <CardDescription>
                    Pull scheduled shifts and clock-in/out records from When I Work into DriverHub. Upserts on external ID — safe to run repeatedly.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <WhenIWorkSyncPanel />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div>
                  <CardTitle className="text-base">Time Approval</CardTitle>
                  <CardDescription>
                    Review and approve clock-in/out records before payroll submission. Only approved records are exported. Raw When I Work time is never submitted directly.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <WhenIWorkTimeApproval />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div>
                  <CardTitle className="text-base">Driver Mapping</CardTitle>
                  <CardDescription>
                    Link When I Work users to DriverHub drivers so all scheduling and attendance data ties to the right records.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <WhenIWorkUserMapping />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="wiw-data" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div>
                  <CardTitle className="text-base">WIW Operational Data</CardTitle>
                  <CardDescription>
                    Browse shifts, clock times, absences, and attendance notices synced from the When I Work API. Use the Connected Apps tab to run a sync first.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <WhenIWorkDataView />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wiw-ingestion" className="mt-6">
          <WiwIngestionTab />
        </TabsContent>

        <TabsContent value="wiw-location-map" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div>
                  <CardTitle className="text-base">WIW Location Mapping Console</CardTitle>
                  <CardDescription>
                    Map When I Work workplace locations to DriverHub accounts. Shifts, time records, and labor hours are
                    attributed to accounts through these mappings. Manual overrides are preserved across auto-match runs.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <WhenIWorkLocationMapping />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ot-watch" className="mt-6">
          <OTWatchTab />
        </TabsContent>

        <TabsContent value="rebalance" className="mt-6">
          <ShiftRebalanceTab />
        </TabsContent>
      </Tabs>

    </div>
  );
}
