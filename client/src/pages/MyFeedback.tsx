import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Bug,
  Lightbulb,
  HelpCircle,
  AlertTriangle,
  Clock,
  Send,
  Loader2,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

interface FeedbackTicket {
  id: string;
  ticketNumber: number;
  type: string;
  area: string;
  title: string;
  description: string;
  impact: string | null;
  urgency: string | null;
  priority: string;
  status: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface FeedbackComment {
  id: string;
  authorName: string;
  content: string;
  visibility: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  WAITING_USER: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  CLOSED: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  WONT_FIX: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const typeIcons: Record<string, any> = {
  BUG: Bug,
  FEATURE_REQUEST: Lightbulb,
  QUESTION: HelpCircle,
  DATA_ISSUE: AlertTriangle,
  OTHER: MessageSquare,
};

const typeLabels: Record<string, string> = {
  BUG: "Bug Report",
  FEATURE_REQUEST: "Feature Request",
  QUESTION: "Question",
  DATA_ISSUE: "Data Issue",
  OTHER: "Other",
};

export default function MyFeedback() {
  const [selectedTicket, setSelectedTicket] = useState<FeedbackTicket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tickets, isLoading } = useQuery<FeedbackTicket[]>({
    queryKey: ["/api/feedback/mine"],
  });

  const { data: ticketDetail, isLoading: isLoadingDetail } = useQuery<FeedbackTicket & { comments: FeedbackComment[] }>({
    queryKey: ["/api/feedback", selectedTicket?.id],
    queryFn: () => fetch(`/api/feedback/${selectedTicket?.id}`).then(r => r.json()),
    enabled: !!selectedTicket,
  });

  const replyMutation = useMutation({
    mutationFn: async ({ ticketId, content }: { ticketId: string; content: string }) => {
      return apiRequest("POST", `/api/feedback/${ticketId}/comment`, { content, visibility: "PUBLIC" });
    },
    onSuccess: () => {
      toast({ title: "Reply Sent" });
      // Only clear reply text after confirmed server success
      setReplyText("");
      replyMutation.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/feedback", selectedTicket?.id] });
    },
    onError: (error: any) => {
      // Reply text is intentionally retained — do NOT clear it
      toast({
        title: "Reply Failed",
        description: error?.message || "Failed to send reply. Your message has been kept — please try again.",
        variant: "destructive",
      });
    },
  });

  const handleReply = () => {
    if (!selectedTicket || !replyText.trim()) return;
    replyMutation.mutate({
      ticketId: selectedTicket.id,
      content: replyText,
    });
  };

  const handleRetryReply = () => {
    handleReply();
  };

  /** Whether the reply textarea has pending (unsent) text. */
  const hasUnsavedReply = () => replyText.trim().length > 0;

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Block close while send is in flight
      if (replyMutation.isPending) return;
      // Prompt before discarding an unsent reply
      if (hasUnsavedReply()) {
        setShowDiscardConfirm(true);
        return;
      }
    }
    if (!nextOpen) {
      setReplyText("");
      replyMutation.reset();
      setSelectedTicket(null);
    }
  };

  const handleConfirmedDiscard = () => {
    setShowDiscardConfirm(false);
    setReplyText("");
    replyMutation.reset();
    setSelectedTicket(null);
  };

  const getTypeIcon = (type: string) => {
    const Icon = typeIcons[type] || MessageSquare;
    return <Icon className="h-4 w-4" />;
  };

  const getStatusDisplay = (status: string) => {
    const displayStatus = status.replace(/_/g, " ");
    return displayStatus.charAt(0) + displayStatus.slice(1).toLowerCase();
  };

  return (
    <>
      <div className="space-y-4 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">My Feedback</h1>
          <p className="text-muted-foreground">Track the status of your submitted feedback and requests</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !tickets?.length ? (
          <Card>
            <CardContent className="py-8 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">No Feedback Yet</h3>
              <p className="text-muted-foreground mb-4">
                You haven't submitted any feedback yet. Use the feedback button to report bugs,
                request features, or ask questions.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <Card
                key={ticket.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedTicket(ticket)}
                data-testid={`my-ticket-${ticket.ticketNumber}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1 p-2 rounded-lg bg-muted">
                      {getTypeIcon(ticket.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-muted-foreground font-mono">
                          #{ticket.ticketNumber}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {typeLabels[ticket.type] || ticket.type}
                        </Badge>
                      </div>
                      <h3 className="font-semibold truncate">{ticket.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {ticket.description}
                      </p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <Badge className={statusColors[ticket.status]}>
                          {getStatusDisplay(ticket.status)}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(ticket.createdAt), "MMM d, yyyy")}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!selectedTicket} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedTicket && getTypeIcon(selectedTicket.type)}
                #{selectedTicket?.ticketNumber} - {selectedTicket?.title}
              </DialogTitle>
              <DialogDescription>
                Submitted on {selectedTicket && format(new Date(selectedTicket.createdAt), "MMMM d, yyyy 'at' h:mm a")}
              </DialogDescription>
            </DialogHeader>

            {isLoadingDetail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : ticketDetail && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <Badge className={statusColors[ticketDetail.status]}>
                    {getStatusDisplay(ticketDetail.status)}
                  </Badge>
                  <Badge variant="secondary">
                    {typeLabels[ticketDetail.type]}
                  </Badge>
                  {ticketDetail.impact && (
                    <Badge variant="outline">Impact: {ticketDetail.impact}</Badge>
                  )}
                </div>

                <div className="border rounded-lg p-3 bg-muted/50 mb-3">
                  <p className="text-sm whitespace-pre-wrap">{ticketDetail.description}</p>
                </div>

                <Separator className="my-2" />

                <div className="flex-1 overflow-hidden flex flex-col">
                  <h4 className="font-medium text-sm mb-2">Conversation</h4>
                  <ScrollArea className="flex-1 max-h-[200px]">
                    {ticketDetail.comments?.length ? (
                      <div className="space-y-2 pr-4">
                        {ticketDetail.comments.map((comment) => (
                          <div
                            key={comment.id}
                            className="p-2 rounded-lg border bg-background"
                          >
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                              <span className="font-medium">{comment.authorName}</span>
                              <span>{format(new Date(comment.createdAt), "MMM d 'at' h:mm a")}</span>
                            </div>
                            <p className="text-sm">{comment.content}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No replies yet. Our team will respond soon.</p>
                    )}
                  </ScrollArea>

                  {ticketDetail.status !== "CLOSED" && ticketDetail.status !== "RESOLVED" && (
                    <div className="mt-3 space-y-2">
                      {replyMutation.isError && (
                        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive flex items-center justify-between gap-2">
                          <span>
                            {(replyMutation.error as any)?.message || "Failed to send. Your reply is preserved."}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleRetryReply}
                            disabled={replyMutation.isPending || !replyText.trim()}
                            data-testid="button-reply-retry"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        </div>
                      )}
                      <Textarea
                        placeholder="Add a reply..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="min-h-[80px]"
                        data-testid="input-reply"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleReply}
                          disabled={!replyText.trim() || replyMutation.isPending}
                          data-testid="button-send-reply"
                        >
                          {replyMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Send Reply
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsent reply?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an unsent reply. Closing now will permanently discard what you've typed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-reply-discard-cancel">
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmedDiscard}
              data-testid="button-reply-discard-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
