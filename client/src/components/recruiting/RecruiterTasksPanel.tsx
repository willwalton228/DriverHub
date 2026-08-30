import { useState } from "react";
import { formatDate } from "@/lib/dateFormat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2, Clock, AlertTriangle, Plus, PlayCircle, XCircle, ListTodo, CalendarClock
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  type: string;
  priority: "low" | "normal" | "high" | "urgent";
  entityType?: string;
  entityId?: string;
  completedAt?: string | null;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const typeLabels: Record<string, string> = {
  docs_requested: "Docs Requested",
  background_pending: "Background Pending",
  interview_followup: "Interview Follow-up",
  manual: "Manual",
};

function isOverdue(task: Task): boolean {
  if (!task.dueDate) return false;
  if (task.status !== "pending" && task.status !== "in_progress") return false;
  return parseDateSafe(task.dueDate) < new Date();
}

function PriorityDot({ priority }: { priority: string }) {
  if (priority === "urgent") return <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />;
  if (priority === "high") return <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0" />;
  if (priority === "low") return <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-400 flex-shrink-0" />;
  return null;
}

export default function RecruiterTasksPanel() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    dueDate: "",
    priority: "normal",
    entityType: "application",
    entityId: "",
  });

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/recruiting/tasks/my"],
  });

  const startMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/recruiting/tasks/${id}/start`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/tasks/my"] });
      toast({ title: "Task started" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start task", description: error.message, variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/recruiting/tasks/${id}/complete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/tasks/my"] });
      toast({ title: "Task completed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to complete task", description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/recruiting/tasks/${id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/tasks/my"] });
      toast({ title: "Task cancelled" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to cancel task", description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newTask) => {
      await apiRequest("POST", "/api/recruiting/tasks", {
        title: data.title,
        description: data.description || undefined,
        dueDate: data.dueDate || undefined,
        priority: data.priority,
        entityType: data.entityType,
        entityId: data.entityId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/tasks/my"] });
      toast({ title: "Task created" });
      setAddDialogOpen(false);
      setNewTask({ title: "", description: "", dueDate: "", priority: "normal", entityType: "application", entityId: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create task", description: error.message, variant: "destructive" });
    },
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const overdueCount = tasks.filter(isOverdue).length;
  const completedTodayCount = tasks.filter(
    (t) => t.status === "completed" && t.completedAt && new Date(t.completedAt) >= todayStart
  ).length;

  const filtered = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (overdueOnly && !isOverdue(t)) return false;
    return true;
  });

  return (
    <div className="space-y-4" data-testid="panel-my-tasks">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ListTodo className="h-5 w-5" />
          <h2 className="text-lg font-semibold">My Tasks</h2>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-task">
              <Plus className="h-4 w-4" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="task-title" required>Title</Label>
                <Input
                  id="task-title"
                  value={newTask.title}
                  onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Task title"
                  data-testid="input-task-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  value={newTask.description}
                  onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Optional description"
                  data-testid="input-task-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-due-date">Due Date</Label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={newTask.dueDate}
                  onChange={(e) => setNewTask((p) => ({ ...p, dueDate: e.target.value }))}
                  data-testid="input-task-due-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={newTask.priority} onValueChange={(v) => setNewTask((p) => ({ ...p, priority: v }))}>
                  <SelectTrigger data-testid="select-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Entity Type</Label>
                <Select value={newTask.entityType} onValueChange={(v) => setNewTask((p) => ({ ...p, entityType: v }))}>
                  <SelectTrigger data-testid="select-task-entity-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="application">Application</SelectItem>
                    <SelectItem value="candidate">Candidate</SelectItem>
                    <SelectItem value="requisition">Requisition</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-entity-id" required>Entity ID</Label>
                <Input
                  id="task-entity-id"
                  value={newTask.entityId}
                  onChange={(e) => setNewTask((p) => ({ ...p, entityId: e.target.value }))}
                  placeholder="Entity ID"
                  data-testid="input-task-entity-id"
                />
              </div>
              <Button
                className="w-full"
                disabled={!newTask.title || !newTask.entityId || createMutation.isPending}
                onClick={() => createMutation.mutate(newTask)}
                data-testid="button-submit-task"
              >
                {createMutation.isPending ? "Creating..." : "Create Task"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <ListTodo className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold" data-testid="stat-total-tasks">{tasks.length}</div>
              <div className="text-xs text-muted-foreground">Total Tasks</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <div className="text-2xl font-bold text-red-500" data-testid="stat-overdue-tasks">{overdueCount}</div>
              <div className="text-xs text-muted-foreground">Overdue</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-2xl font-bold" data-testid="stat-completed-today">{completedTodayCount}</div>
              <div className="text-xs text-muted-foreground">Completed Today</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="docs_requested">Docs Requested</SelectItem>
            <SelectItem value="background_pending">Background Pending</SelectItem>
            <SelectItem value="interview_followup">Interview Follow-up</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch
            checked={overdueOnly}
            onCheckedChange={setOverdueOnly}
            data-testid="switch-overdue-only"
          />
          <Label className="text-sm cursor-pointer" onClick={() => setOverdueOnly(!overdueOnly)}>
            Overdue only
          </Label>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading tasks...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No tasks found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => {
            const overdue = isOverdue(task);
            const statusCfg = statusConfig[task.status] || statusConfig.pending;

            return (
              <Card key={task.id} data-testid={`task-row-${task.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <PriorityDot priority={task.priority} />
                        <span className="font-semibold">{task.title}</span>
                        <Badge
                          variant={statusCfg.variant}
                          className="no-default-hover-elevate no-default-active-elevate"
                        >
                          {statusCfg.label}
                        </Badge>
                        <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">
                          {typeLabels[task.type] || task.type}
                        </Badge>
                        {overdue && (
                          <Badge variant="destructive" className="no-default-hover-elevate no-default-active-elevate">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Overdue
                          </Badge>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground truncate max-w-lg">
                          {task.description}
                        </p>
                      )}
                      {task.dueDate && (
                        <div className={`flex items-center gap-1 text-xs ${overdue ? "text-red-500" : "text-muted-foreground"}`}>
                          <CalendarClock className="h-3 w-3" />
                          Due: {formatDate(task.dueDate)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                      {task.status === "pending" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startMutation.mutate(task.id)}
                          disabled={startMutation.isPending}
                          data-testid={`button-start-${task.id}`}
                        >
                          <PlayCircle className="h-4 w-4" />
                          Start
                        </Button>
                      )}
                      {(task.status === "pending" || task.status === "in_progress") && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => completeMutation.mutate(task.id)}
                            disabled={completeMutation.isPending}
                            data-testid={`button-complete-${task.id}`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Complete
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelMutation.mutate(task.id)}
                            disabled={cancelMutation.isPending}
                            data-testid={`button-cancel-${task.id}`}
                          >
                            <XCircle className="h-4 w-4" />
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
