import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { 
  ArrowLeft,
  Bell,
  CalendarCheck,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Mail
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface NotificationPreference {
  id: number;
  customerUserId: string;
  eventType: string;
  channel: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const EVENT_TYPE_LABELS: Record<string, { label: string; description: string; icon: typeof Bell }> = {
  MOVE_SCHEDULED: {
    label: "Move Scheduled",
    description: "Receive a notification when a new move is scheduled for you",
    icon: CalendarCheck
  },
  MOVE_ASSIGNED: {
    label: "Driver Assigned",
    description: "Receive a notification when a driver is assigned to your move",
    icon: UserCheck
  },
  DELAY_EXCEPTION: {
    label: "Delays & Exceptions",
    description: "Receive updates about delays or issues with your moves",
    icon: AlertTriangle
  },
  MOVE_COMPLETED: {
    label: "Move Completed",
    description: "Receive a confirmation when your move is completed",
    icon: CheckCircle2
  },
  INVOICE_PREVIEW: {
    label: "Invoice Preview",
    description: "Receive a notification when a new invoice is ready for review",
    icon: FileText
  }
};

const EVENT_TYPE_ORDER = [
  "MOVE_SCHEDULED",
  "MOVE_ASSIGNED",
  "DELAY_EXCEPTION",
  "MOVE_COMPLETED",
  "INVOICE_PREVIEW"
];

export default function NotificationSettings() {
  const { toast } = useToast();

  const { data: preferences, isLoading } = useQuery<NotificationPreference[]>({
    queryKey: ["/api/customer/notification-preferences"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ eventType, enabled }: { eventType: string; enabled: boolean }) => {
      return apiRequest("PATCH", `/api/customer/notification-preferences/${eventType}`, { enabled });
    },
    onMutate: async ({ eventType, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/customer/notification-preferences"] });
      const previousPrefs = queryClient.getQueryData<NotificationPreference[]>(["/api/customer/notification-preferences"]);
      
      if (previousPrefs) {
        queryClient.setQueryData<NotificationPreference[]>(
          ["/api/customer/notification-preferences"],
          previousPrefs.map(p => p.eventType === eventType ? { ...p, enabled } : p)
        );
      }
      
      return { previousPrefs };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousPrefs) {
        queryClient.setQueryData(["/api/customer/notification-preferences"], context.previousPrefs);
      }
      toast({
        title: "Error",
        description: "Failed to update notification preference",
        variant: "destructive"
      });
    },
    onSuccess: () => {
      toast({
        title: "Saved",
        description: "Notification preference updated",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/notification-preferences"] });
    }
  });

  const getPreferenceEnabled = (eventType: string): boolean => {
    const pref = preferences?.find(p => p.eventType === eventType);
    return pref?.enabled ?? true;
  };

  const handleToggle = (eventType: string, enabled: boolean) => {
    updateMutation.mutate({ eventType, enabled });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/customer/requests">
              <a className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-requests">
                <ArrowLeft className="h-5 w-5" />
              </a>
            </Link>
            <div className="flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">Notification Settings</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Email Notifications</CardTitle>
            </div>
            <CardDescription>
              Choose which email notifications you'd like to receive about your moves and invoices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between py-3">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-56" />
                    </div>
                    <Skeleton className="h-6 w-11" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y">
                {EVENT_TYPE_ORDER.map((eventType) => {
                  const config = EVENT_TYPE_LABELS[eventType];
                  if (!config) return null;
                  const IconComponent = config.icon;
                  const isEnabled = getPreferenceEnabled(eventType);
                  
                  return (
                    <div
                      key={eventType}
                      className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          <IconComponent className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <label 
                            htmlFor={`toggle-${eventType}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {config.label}
                          </label>
                          <p className="text-sm text-muted-foreground">
                            {config.description}
                          </p>
                        </div>
                      </div>
                      <Switch
                        id={`toggle-${eventType}`}
                        checked={isEnabled}
                        onCheckedChange={(checked) => handleToggle(eventType, checked)}
                        disabled={updateMutation.isPending}
                        data-testid={`switch-${eventType.toLowerCase().replace(/_/g, '-')}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Changes are saved automatically. You can update your preferences at any time.
        </p>
      </main>
    </div>
  );
}
