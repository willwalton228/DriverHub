import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Send, MessageSquare, Users, MapPin, Briefcase, Clock, Plus, Trash2, CheckCircle, AlertCircle, Mail, Bell, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SchedulingMessage {
  id: string;
  targetType: string;
  targetValue: string | null;
  title: string;
  body: string;
  priority: string;
  isAutomatic: boolean;
  alertType: string | null;
  scheduleId: string | null;
  shiftId: string | null;
  status: string;
  sentAt: string | null;
  sentByUserId: string | null;
  recipientCount: number;
  deliveredCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Location {
  id: string;
  name: string;
}

interface Role {
  id: string;
  name: string;
}

const messageFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  body: z.string().min(1, "Message body is required").max(2000),
  targetType: z.enum(["all", "location", "role", "shift"]),
  targetValue: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
});

type MessageFormValues = z.infer<typeof messageFormSchema>;

export function MessagesTab() {
  return (
    <Tabs defaultValue="compose" className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-3">
        <TabsTrigger value="compose" data-testid="messages-tab-compose">Compose</TabsTrigger>
        <TabsTrigger value="sent" data-testid="messages-tab-sent">Sent</TabsTrigger>
        <TabsTrigger value="automatic" data-testid="messages-tab-automatic">Automatic Alerts</TabsTrigger>
      </TabsList>
      <TabsContent value="compose" className="mt-6">
        <ComposePanel />
      </TabsContent>
      <TabsContent value="sent" className="mt-6">
        <SentMessagesPanel />
      </TabsContent>
      <TabsContent value="automatic" className="mt-6">
        <AutomaticAlertsPanel />
      </TabsContent>
    </Tabs>
  );
}

function ComposePanel() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['/api/scheduling/locations'],
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['/api/scheduling/roles'],
  });

  const { data: shifts = [] } = useQuery<any[]>({
    queryKey: ['/api/scheduling/shifts'],
  });

  const { data: drafts = [], isLoading } = useQuery<SchedulingMessage[]>({
    queryKey: ['/api/scheduling/messages?status=draft'],
  });

  const form = useForm<MessageFormValues>({
    resolver: zodResolver(messageFormSchema),
    defaultValues: {
      title: '',
      body: '',
      targetType: 'all',
      targetValue: '',
      priority: 'normal',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: MessageFormValues) => {
      return apiRequest('POST', '/api/scheduling/messages', {
        title: data.title,
        body: data.body,
        targetType: data.targetType,
        targetValue: data.targetValue || null,
        priority: data.priority,
      });
    },
    onSuccess: () => {
      // Invalidate all message queries
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/scheduling/messages');
        }
      });
      toast({ title: "Message created as draft" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create message", 
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    }
  });

  const sendMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const res = await apiRequest('POST', `/api/scheduling/messages/${messageId}/send`);
      return res.json();
    },
    onSuccess: (data: any) => {
      // Invalidate all message queries
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/scheduling/messages');
        }
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      toast({ 
        title: "Message sent", 
        description: `Delivered to ${data.deliveredCount || 0} of ${data.recipientCount || 0} recipients`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to send message", 
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return apiRequest('DELETE', `/api/scheduling/messages/${messageId}`);
    },
    onSuccess: () => {
      // Invalidate all message queries
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/scheduling/messages');
        }
      });
      toast({ title: "Draft deleted" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete", 
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: MessageFormValues) => {
    createMutation.mutate(data);
  };

  const targetType = form.watch('targetType');

  const getTargetIcon = (type: string) => {
    switch (type) {
      case 'all': return <Users className="h-4 w-4" />;
      case 'location': return <MapPin className="h-4 w-4" />;
      case 'role': return <Briefcase className="h-4 w-4" />;
      case 'shift': return <Clock className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  const getPriorityVariant = (priority: string): "default" | "destructive" | "secondary" | "outline" => {
    switch (priority) {
      case 'urgent': return 'destructive';
      case 'high': return 'default';
      case 'normal': return 'secondary';
      case 'low': return 'outline';
      default: return 'secondary';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Group Messaging
            </CardTitle>
            <CardDescription>
              Send announcements and alerts to employees by group
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="compose-message-btn">
                <Plus className="h-4 w-4 mr-2" />
                Compose Message
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Compose Message</DialogTitle>
                <DialogDescription>
                  Create a new message to send to employees
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., Schedule Update for Next Week"
                            {...field}
                            data-testid="message-title"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="body"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Message</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Enter your message here..."
                            className="min-h-[100px]"
                            {...field}
                            data-testid="message-body"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="targetType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Send To</FormLabel>
                          <Select value={field.value} onValueChange={(v) => {
                            field.onChange(v);
                            form.setValue('targetValue', '');
                          }}>
                            <FormControl>
                              <SelectTrigger data-testid="message-target-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="all">All Employees</SelectItem>
                              <SelectItem value="location">By Location</SelectItem>
                              <SelectItem value="role">By Role</SelectItem>
                              <SelectItem value="shift">By Shift</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="message-priority">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {targetType !== 'all' && (
                    <FormField
                      control={form.control}
                      name="targetValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {targetType === 'location' && 'Select Location'}
                            {targetType === 'role' && 'Select Role'}
                            {targetType === 'shift' && 'Select Shift'}
                          </FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="message-target-value">
                                <SelectValue placeholder={`Select ${targetType}...`} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {targetType === 'location' && locations.map((loc) => (
                                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                              ))}
                              {targetType === 'role' && roles.map((role) => (
                                <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                              ))}
                              {targetType === 'shift' && shifts.map((shift) => (
                                <SelectItem key={shift.id} value={shift.id}>
                                  {format(new Date(shift.startTime), "MMM d")} - {shift.locationId || 'TBD'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Message will only be sent to employees matching this criteria
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="create-message-btn">
                      {createMutation.isPending ? 'Creating...' : 'Create Draft'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {drafts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No draft messages</p>
              <p className="text-sm mt-1">Click "Compose Message" to create a new announcement</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Draft Messages</h3>
              {drafts.map((message) => (
                <div 
                  key={message.id} 
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`draft-message-${message.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{message.title}</span>
                      <Badge variant={getPriorityVariant(message.priority)}>
                        {message.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">{message.body}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      {getTargetIcon(message.targetType)}
                      <span>
                        {message.targetType === 'all' && 'All Employees'}
                        {message.targetType === 'location' && `Location: ${message.targetValue}`}
                        {message.targetType === 'role' && `Role: ${message.targetValue}`}
                        {message.targetType === 'shift' && `Shift: ${message.targetValue?.slice(0, 8)}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      size="sm"
                      onClick={() => sendMutation.mutate(message.id)}
                      disabled={sendMutation.isPending}
                      data-testid={`send-message-${message.id}`}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Send
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteMutation.mutate(message.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`delete-message-${message.id}`}
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
    </div>
  );
}

function SentMessagesPanel() {
  const { data: messages, isLoading, isError, refetch } = useQuery<SchedulingMessage[]>({
    queryKey: ['/api/scheduling/messages?status=sent&isAutomatic=false'],
  });

  const sentMessages = useMemo(() => {
    return (messages || []).filter(m => m.status === 'sent' && !m.isAutomatic);
  }, [messages]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm" data-testid="error-sent-messages">
        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        <span className="text-muted-foreground">Unable to load message history.</span>
        <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          Sent Messages
        </CardTitle>
        <CardDescription>
          History of manually sent announcements and messages
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sentMessages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No sent messages yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sentMessages.map((message) => (
              <div 
                key={message.id} 
                className="flex items-center justify-between p-4 border rounded-lg"
                data-testid={`sent-message-${message.id}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{message.title}</span>
                    <Badge variant="secondary">
                      {message.targetType === 'all' ? 'All' : message.targetValue}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">{message.body}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>
                      Sent {message.sentAt ? format(new Date(message.sentAt), "MMM d, yyyy 'at' h:mm a") : 'N/A'}
                    </span>
                    <span>
                      {message.deliveredCount} / {message.recipientCount} delivered
                    </span>
                  </div>
                </div>
                <Badge variant="default">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Sent
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AutomaticAlertsPanel() {
  const { toast } = useToast();

  const { data: messages, isLoading } = useQuery<SchedulingMessage[]>({
    queryKey: ['/api/scheduling/messages'],
  });

  const automaticAlerts = useMemo(() => {
    return (messages || []).filter(m => m.isAutomatic);
  }, [messages]);

  const sendRemindersMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/scheduling/messages/send-reminders', { hoursBeforeShift: 24 });
    },
    onSuccess: (data: any) => {
      // Invalidate all message queries
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/scheduling/messages');
        }
      });
      toast({ 
        title: "Shift reminders sent", 
        description: `${data.alertsSent} reminder alerts sent`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to send reminders", 
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const getAlertTypeLabel = (type: string | null) => {
    switch (type) {
      case 'schedule_published': return 'Schedule Published';
      case 'shift_change': return 'Shift Change';
      case 'shift_reminder': return 'Shift Reminder';
      case 'shift_cancelled': return 'Shift Cancelled';
      case 'shift_assigned': return 'Shift Assigned';
      case 'shift_unassigned': return 'Shift Unassigned';
      default: return 'Alert';
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Bell className="h-4 w-4" />
        <AlertTitle>Automatic Alerts</AlertTitle>
        <AlertDescription>
          These alerts are automatically triggered when schedules are published, shifts change, or reminders are due.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Manual Trigger
            </CardTitle>
            <CardDescription>
              Manually trigger shift reminder alerts for upcoming shifts
            </CardDescription>
          </div>
          <Button 
            onClick={() => sendRemindersMutation.mutate()}
            disabled={sendRemindersMutation.isPending}
            data-testid="send-reminders-btn"
          >
            <Bell className="h-4 w-4 mr-2" />
            {sendRemindersMutation.isPending ? 'Sending...' : 'Send Shift Reminders'}
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert History</CardTitle>
          <CardDescription>
            Recent automatic alerts sent to employees
          </CardDescription>
        </CardHeader>
        <CardContent>
          {automaticAlerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No automatic alerts sent yet</p>
              <p className="text-sm mt-1">Alerts will appear here when schedules are published or shifts change</p>
            </div>
          ) : (
            <div className="space-y-3">
              {automaticAlerts.map((message) => (
                <div 
                  key={message.id} 
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`auto-alert-${message.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">
                        {getAlertTypeLabel(message.alertType)}
                      </Badge>
                      <span className="font-medium">{message.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">{message.body}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>
                        {message.sentAt ? format(new Date(message.sentAt), "MMM d, yyyy 'at' h:mm a") : 'Pending'}
                      </span>
                      {message.status === 'sent' && (
                        <span>
                          {message.deliveredCount} / {message.recipientCount} delivered
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant={message.status === 'sent' ? 'default' : 'secondary'}>
                    {message.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
