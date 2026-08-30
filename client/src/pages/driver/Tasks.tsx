import { useState } from "react";
import { parseDateSafe } from "@/lib/dateFormat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FlaskConical, AlertTriangle, Clock, CheckCircle, ListTodo } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/dateFormat";

interface DriverTask {
  id: string;
  driverId: string;
  claimId: string | null;
  taskType: string;
  title: string;
  description: string | null;
  instructions: string | null;
  status: string;
  dueDate: string | null;
  acknowledgedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

function TaskStatusBadge({ status, dueDate }: { status: string; dueDate: string | null }) {
  const isOverdue = dueDate && status !== 'completed' && new Date(dueDate) < new Date();
  
  if (isOverdue) {
    return (
      <Badge variant="destructive" className="flex items-center gap-1" data-testid="badge-task-overdue">
        <AlertTriangle className="h-3 w-3" />
        Overdue
      </Badge>
    );
  }
  
  const variants: Record<string, string> = {
    pending: "bg-yellow-500 text-white",
    acknowledged: "bg-indigo-500 text-white",
    completed: "bg-green-600 text-white",
  };

  const labels: Record<string, string> = {
    pending: "Pending",
    acknowledged: "Acknowledged",
    completed: "Completed",
  };

  return (
    <Badge className={variants[status] || "bg-gray-500 text-white"} data-testid="badge-task-status">
      {labels[status] || status}
    </Badge>
  );
}

function getTaskIcon(taskType: string) {
  if (taskType === 'drug_test') {
    return <FlaskConical className="h-6 w-6 text-blue-600" />;
  }
  return <ListTodo className="h-6 w-6 text-primary" />;
}

function getTimeRemaining(dueDate: string | null): { text: string; urgent: boolean } | null {
  if (!dueDate) return null;
  
  const due = parseDateSafe(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  
  if (diffMs < 0) {
    const hoursOverdue = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
    const daysOverdue = Math.floor(hoursOverdue / 24);
    if (daysOverdue > 0) {
      return { text: `${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`, urgent: true };
    }
    return { text: `${hoursOverdue} hour${hoursOverdue > 1 ? 's' : ''} overdue`, urgent: true };
  }
  
  const hoursRemaining = Math.floor(diffMs / (1000 * 60 * 60));
  if (hoursRemaining < 24) {
    return { text: `${hoursRemaining} hour${hoursRemaining > 1 ? 's' : ''} remaining`, urgent: hoursRemaining < 6 };
  }
  const daysRemaining = Math.floor(hoursRemaining / 24);
  return { text: `${daysRemaining} day${daysRemaining > 1 ? 's' : ''} remaining`, urgent: false };
}

export default function DriverTasks() {
  const { toast } = useToast();
  
  const { data: tasks = [], isLoading } = useQuery<DriverTask[]>({
    queryKey: ["/api/driver/tasks"],
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return apiRequest("POST", `/api/driver/tasks/${taskId}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver/tasks"] });
      toast({
        title: "Task Acknowledged",
        description: "You have acknowledged this task requirement.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to acknowledge task",
        variant: "destructive",
      });
    },
  });

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const acknowledgedTasks = tasks.filter(t => t.status === 'acknowledged');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Required Tasks</h1>
        <p className="text-muted-foreground">
          Tasks and requirements that need your attention
        </p>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-green-600 mb-4" />
            <p className="text-lg font-medium">All Caught Up!</p>
            <p className="text-sm text-muted-foreground">You have no pending tasks right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {pendingTasks.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Action Required ({pendingTasks.length})
              </h2>
              {pendingTasks.map((task) => {
                const timeRemaining = getTimeRemaining(task.dueDate);
                return (
                  <Card key={task.id} className={timeRemaining?.urgent ? 'border-red-500' : ''} data-testid={`task-card-${task.id}`}>
                    <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                      <div className="flex items-start gap-4">
                        <div className="mt-1">
                          {getTaskIcon(task.taskType)}
                        </div>
                        <div>
                          <CardTitle className="text-lg" data-testid="text-task-title">{task.title}</CardTitle>
                          {task.description && (
                            <CardDescription className="mt-1">{task.description}</CardDescription>
                          )}
                        </div>
                      </div>
                      <TaskStatusBadge status={task.status} dueDate={task.dueDate} />
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {task.instructions && (
                          <div className="p-3 bg-muted rounded text-sm" data-testid="text-task-instructions">
                            <p className="font-medium mb-1">Instructions:</p>
                            <p>{task.instructions}</p>
                          </div>
                        )}
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {task.dueDate && (
                              <div className="flex items-center gap-1" data-testid="text-task-due">
                                <Clock className="h-4 w-4" />
                                <span>Due: {formatDate(task.dueDate)}</span>
                              </div>
                            )}
                            {timeRemaining && (
                              <span className={timeRemaining.urgent ? 'text-red-600 font-medium' : ''}>
                                ({timeRemaining.text})
                              </span>
                            )}
                          </div>
                          <Button
                            onClick={() => acknowledgeMutation.mutate(task.id)}
                            disabled={acknowledgeMutation.isPending}
                            data-testid="button-acknowledge-task"
                          >
                            {acknowledgeMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4 mr-2" />
                            )}
                            Acknowledge
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {acknowledgedTasks.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-indigo-500" />
                Acknowledged - Awaiting Completion ({acknowledgedTasks.length})
              </h2>
              {acknowledgedTasks.map((task) => {
                const timeRemaining = getTimeRemaining(task.dueDate);
                return (
                  <Card key={task.id} className="opacity-80" data-testid={`task-card-ack-${task.id}`}>
                    <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                      <div className="flex items-start gap-4">
                        <div className="mt-1">
                          {getTaskIcon(task.taskType)}
                        </div>
                        <div>
                          <CardTitle className="text-lg">{task.title}</CardTitle>
                          {task.description && (
                            <CardDescription className="mt-1">{task.description}</CardDescription>
                          )}
                        </div>
                      </div>
                      <TaskStatusBadge status={task.status} dueDate={task.dueDate} />
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {task.acknowledgedAt && (
                          <span>Acknowledged: {formatDate(task.acknowledgedAt)}</span>
                        )}
                        {task.dueDate && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>Due: {formatDate(task.dueDate)}</span>
                          </div>
                        )}
                        {timeRemaining && (
                          <span className={timeRemaining.urgent ? 'text-red-600 font-medium' : ''}>
                            ({timeRemaining.text})
                          </span>
                        )}
                      </div>
                      {task.instructions && (
                        <div className="mt-3 p-3 bg-muted rounded text-sm">
                          <p className="font-medium mb-1">Instructions:</p>
                          <p>{task.instructions}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {completedTasks.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Completed ({completedTasks.length})
              </h2>
              {completedTasks.map((task) => (
                <Card key={task.id} className="opacity-60" data-testid={`task-card-done-${task.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
                    <div className="flex items-start gap-4">
                      <div className="mt-1">
                        {getTaskIcon(task.taskType)}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{task.title}</CardTitle>
                        {task.description && (
                          <CardDescription className="mt-1">{task.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <TaskStatusBadge status={task.status} dueDate={task.dueDate} />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {task.completedAt && (
                        <span>Completed: {formatDate(task.completedAt)}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
