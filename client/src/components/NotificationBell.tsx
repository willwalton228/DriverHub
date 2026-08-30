import { useState } from "react";
import {
  Bell,
  ExternalLink,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { Notification } from "@shared/schema";

type NotificationWithUrl = Notification & { actionUrl?: string | null };
type NotifCategory = "all" | "critical" | "action_required" | "informational";

function categorizeNotif(type: string): "critical" | "action_required" | "informational" {
  const t = (type || "").toLowerCase();
  if (/error|fail|critical|down|expired|outage|system_alert|integration_fail|booking_fail/.test(t))
    return "critical";
  if (/pending|approval|request|review|access|assign|recruiting_request|action_required/.test(t))
    return "action_required";
  return "informational";
}

const CATEGORY_META: Record<
  "critical" | "action_required" | "informational",
  { label: string; icon: React.ElementType; cls: string; dotCls: string }
> = {
  critical: {
    label: "Critical",
    icon: AlertCircle,
    cls: "text-destructive bg-destructive/10 border-destructive/20",
    dotCls: "bg-destructive",
  },
  action_required: {
    label: "Action Required",
    icon: AlertTriangle,
    cls: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/40",
    dotCls: "bg-amber-500",
  },
  informational: {
    label: "Informational",
    icon: Info,
    cls: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/40",
    dotCls: "bg-blue-500",
  },
};

function NotifCategoryBadge({ cat }: { cat: "critical" | "action_required" | "informational" }) {
  const meta = CATEGORY_META[cat];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border", meta.cls)}>
      <Icon className="h-2.5 w-2.5" />
      {meta.label}
    </span>
  );
}

function NotificationItem({
  notification,
  onRead,
  onOpen,
}: {
  notification: NotificationWithUrl;
  onRead: (id: string) => void;
  onOpen: (n: NotificationWithUrl) => void;
}) {
  const cat = categorizeNotif(notification.type);
  const meta = CATEGORY_META[cat];

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-border last:border-0",
        !notification.isRead
          ? "bg-muted/40 hover:bg-muted/60"
          : "hover:bg-muted/30"
      )}
      onClick={() => onOpen(notification)}
      data-testid={`notification-item-${notification.id}`}
    >
      {/* Unread dot */}
      <div className="flex flex-col items-center pt-1 gap-1 shrink-0">
        <div
          className={cn(
            "h-2 w-2 rounded-full mt-0.5 transition-opacity",
            !notification.isRead ? meta.dotCls : "opacity-0"
          )}
        />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm leading-snug", !notification.isRead ? "font-medium" : "")}>
            {notification.title}
          </p>
          {!notification.isRead && (
            <button
              className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 rounded"
              onClick={e => { e.stopPropagation(); onRead(notification.id); }}
              title="Mark as read"
              data-testid={`btn-mark-read-${notification.id}`}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <NotifCategoryBadge cat={cat} />
          <div className="flex items-center gap-2">
            {notification.actionUrl && (
              <span className="text-[10px] text-primary flex items-center gap-0.5" data-testid={`notification-cta-${notification.id}`}>
                Open
                <ExternalLink className="h-2.5 w-2.5" />
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              {notification.createdAt
                ? formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })
                : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotifList({
  notifications,
  onRead,
  onOpen,
  emptyLabel,
}: {
  notifications: NotificationWithUrl[];
  onRead: (id: string) => void;
  onOpen: (n: NotificationWithUrl) => void;
  emptyLabel: string;
}) {
  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 px-6 text-center gap-2">
        <CheckCircle2 className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div>
      {notifications.map(n => (
        <NotificationItem key={n.id} notification={n} onRead={onRead} onOpen={onOpen} />
      ))}
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NotifCategory>("all");

  const { data: notifications = [] } = useQuery<NotificationWithUrl[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const hasUnread = unreadCount > 0;

  const byCategory = {
    critical: notifications.filter(n => categorizeNotif(n.type) === "critical"),
    action_required: notifications.filter(n => categorizeNotif(n.type) === "action_required"),
    informational: notifications.filter(n => categorizeNotif(n.type) === "informational"),
  };

  const unreadByCategory = {
    critical: byCategory.critical.filter(n => !n.isRead).length,
    action_required: byCategory.action_required.filter(n => !n.isRead).length,
    informational: byCategory.informational.filter(n => !n.isRead).length,
  };

  function notifToCategory(type: string): string {
    const t = type.toLowerCase();
    if (/ticket_aging|amr_|open_claim|claim_update/.test(t)) return "operations";
    if (/time_off|leave_balance|projected_ot|overtime|recruiting|driver_shortage|staffing/.test(t)) return "staffing";
    if (/invoice|payment|vendor_renew|billing|overdue_inv/.test(t)) return "financial";
    if (/readiness|account_health|touch|account_/.test(t)) return "accounts";
    return "tasks";
  }

  const handleOpen = (notification: NotificationWithUrl) => {
    if (!notification.isRead) markAsReadMutation.mutate(notification.id);
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
      return;
    }
    const highlightKey = notification.relatedEntityId || notification.id;
    const category = notifToCategory(notification.type);
    window.location.href = `/work-plan?category=${category}&highlight=${encodeURIComponent(highlightKey)}`;
    setOpen(false);
  };

  const handleRead = (id: string) => markAsReadMutation.mutate(id);

  function TabBadge({ count }: { count: number }) {
    if (count === 0) return null;
    return (
      <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
        {count > 99 ? "99+" : count}
      </span>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-1.5 px-2"
        onClick={() => setOpen(true)}
        data-testid="button-notifications"
      >
        <Bell className={cn("h-[22px] w-[22px] transition-colors", hasUnread ? "text-primary" : "")} />
        {hasUnread && (
          <span
            className="text-sm font-semibold tabular-nums text-primary leading-none"
            data-testid="badge-notification-count"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[380px] sm:w-[420px] p-0 flex flex-col gap-0">
          {/* Header */}
          <SheetHeader className="flex-row items-center justify-between px-4 py-3 border-b space-y-0 shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <SheetTitle className="text-base">Notifications</SheetTitle>
              {hasUnread && (
                <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {hasUnread && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => markAllAsReadMutation.mutate()}
                  disabled={markAllAsReadMutation.isPending}
                  data-testid="button-mark-all-read"
                >
                  Mark all read
                </Button>
              )}
            </div>
          </SheetHeader>

          {/* Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={v => setActiveTab(v as NotifCategory)}
            className="flex flex-col flex-1 min-h-0"
          >
            <TabsList className="rounded-none border-b bg-background justify-start h-auto px-2 py-1 gap-0.5 shrink-0">
              <TabsTrigger value="all" className="text-xs h-8 px-3 rounded-md data-[state=active]:shadow-none data-[state=active]:bg-muted">
                All
                <TabBadge count={unreadCount} />
              </TabsTrigger>
              <TabsTrigger value="critical" className="text-xs h-8 px-3 rounded-md data-[state=active]:shadow-none data-[state=active]:bg-muted">
                Critical
                <TabBadge count={unreadByCategory.critical} />
              </TabsTrigger>
              <TabsTrigger value="action_required" className="text-xs h-8 px-3 rounded-md data-[state=active]:shadow-none data-[state=active]:bg-muted">
                Action Required
                <TabBadge count={unreadByCategory.action_required} />
              </TabsTrigger>
              <TabsTrigger value="informational" className="text-xs h-8 px-3 rounded-md data-[state=active]:shadow-none data-[state=active]:bg-muted">
                Info
                <TabBadge count={unreadByCategory.informational} />
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <TabsContent value="all" className="mt-0">
                  <NotifList
                    notifications={notifications}
                    onRead={handleRead}
                    onOpen={handleOpen}
                    emptyLabel="No notifications yet"
                  />
                </TabsContent>
                <TabsContent value="critical" className="mt-0">
                  <NotifList
                    notifications={byCategory.critical}
                    onRead={handleRead}
                    onOpen={handleOpen}
                    emptyLabel="No critical notifications"
                  />
                </TabsContent>
                <TabsContent value="action_required" className="mt-0">
                  <NotifList
                    notifications={byCategory.action_required}
                    onRead={handleRead}
                    onOpen={handleOpen}
                    emptyLabel="No action required"
                  />
                </TabsContent>
                <TabsContent value="informational" className="mt-0">
                  <NotifList
                    notifications={byCategory.informational}
                    onRead={handleRead}
                    onOpen={handleOpen}
                    emptyLabel="No informational notifications"
                  />
                </TabsContent>
              </ScrollArea>
            </div>
          </Tabs>

          {/* Footer */}
          <div className="shrink-0 border-t px-4 py-2.5 bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground h-8"
              onClick={() => {
                setOpen(false);
                window.location.href = "/work-plan";
              }}
              data-testid="btn-view-all-notifications"
            >
              View All Notifications
              <ExternalLink className="h-3 w-3 ml-1.5" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
