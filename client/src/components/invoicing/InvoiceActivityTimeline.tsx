import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, Mail, Eye, DollarSign, FileText, Bell, CheckCircle, AlertTriangle, Ban, CreditCard, Paperclip, Trash2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface InvoiceActivity {
  id: string;
  invoiceId: string;
  activityType: string;
  description?: string;
  metadata?: Record<string, any>;
  performedBy?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

interface InvoiceActivityTimelineProps {
  invoiceId: string;
}

const getActivityIcon = (type: string) => {
  switch (type) {
    case "created":
      return <FileText className="h-4 w-4" />;
    case "sent":
      return <Mail className="h-4 w-4" />;
    case "viewed":
      return <Eye className="h-4 w-4" />;
    case "reminder_sent":
      return <Bell className="h-4 w-4" />;
    case "payment_received":
    case "payment_partial":
      return <DollarSign className="h-4 w-4" />;
    case "paid":
      return <CheckCircle className="h-4 w-4" />;
    case "overdue":
      return <AlertTriangle className="h-4 w-4" />;
    case "voided":
      return <Ban className="h-4 w-4" />;
    case "credit_applied":
      return <CreditCard className="h-4 w-4" />;
    case "attachment_added":
      return <Paperclip className="h-4 w-4" />;
    case "attachment_removed":
      return <Trash2 className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
};

const getActivityColor = (type: string): string => {
  switch (type) {
    case "created":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "sent":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "viewed":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    case "reminder_sent":
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "payment_received":
    case "payment_partial":
    case "paid":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "overdue":
    case "voided":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "credit_applied":
      return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400";
    case "attachment_added":
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400";
    case "attachment_removed":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  }
};

const getActivityLabel = (type: string): string => {
  switch (type) {
    case "created":
      return "Created";
    case "sent":
      return "Sent";
    case "viewed":
      return "Viewed";
    case "reminder_sent":
      return "Reminder Sent";
    case "payment_received":
      return "Payment Received";
    case "payment_partial":
      return "Partial Payment";
    case "paid":
      return "Paid in Full";
    case "overdue":
      return "Overdue";
    case "status_changed":
      return "Status Changed";
    case "voided":
      return "Voided";
    case "credit_applied":
      return "Credit Applied";
    case "attachment_added":
      return "Attachment Added";
    case "attachment_removed":
      return "Attachment Removed";
    default:
      return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }
};

export function InvoiceActivityTimeline({ invoiceId }: InvoiceActivityTimelineProps) {
  const { data: activities, isLoading } = useQuery<InvoiceActivity[]>({
    queryKey: ["/api/corporate/invoicing/invoices", invoiceId, "activities"],
    enabled: !!invoiceId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        No activity recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="activity-timeline-list">
      {activities.map((activity, index) => (
        <div key={activity.id} className="flex gap-3" data-testid={`activity-item-${activity.id}`}>
          <div className="flex flex-col items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full ${getActivityColor(activity.activityType)}`}
              data-testid={`activity-icon-${activity.activityType}`}
            >
              {getActivityIcon(activity.activityType)}
            </div>
            {index < activities.length - 1 && (
              <div className="flex-1 w-px bg-border my-1" />
            )}
          </div>
          <div className="flex-1 pb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-medium" data-testid={`badge-activity-type-${activity.id}`}>
                  {getActivityLabel(activity.activityType)}
                </Badge>
                {activity.performedBy && (
                  <span className="text-xs text-muted-foreground">
                    by {activity.performedBy}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
              </span>
            </div>
            {activity.description && (
              <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
            )}
            {activity.metadata && Object.keys(activity.metadata).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {activity.metadata.amount && (
                  <Badge variant="secondary" className="text-xs">
                    ${parseFloat(activity.metadata.amount).toFixed(2)}
                  </Badge>
                )}
                {activity.metadata.paymentMethod && (
                  <Badge variant="secondary" className="text-xs">
                    {activity.metadata.paymentMethod}
                  </Badge>
                )}
                {activity.metadata.recipientEmail && (
                  <Badge variant="secondary" className="text-xs">
                    {activity.metadata.recipientEmail}
                  </Badge>
                )}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              {format(new Date(activity.createdAt), "PPpp")}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function InvoiceActivityCard({ invoiceId }: InvoiceActivityTimelineProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Activity Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <InvoiceActivityTimeline invoiceId={invoiceId} />
      </CardContent>
    </Card>
  );
}
