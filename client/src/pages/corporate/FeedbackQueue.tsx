import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserSentimentPanel } from "@/components/UserSentimentPanel";
import { 
  MessageSquare, 
  Bug, 
  Lightbulb, 
  HelpCircle, 
  AlertTriangle, 
  MoreHorizontal,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Filter,
  User
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ticketSource: string | null;
  customerIssueType: string | null;
  customerEmail: string | null;
  customerName: string | null;
}

interface FeedbackComment {
  id: string;
  authorName: string;
  content: string;
  visibility: string;
  createdAt: string;
}

import { getStatusBadgeClass } from "@/lib/statusColors";
const statusColors: Record<string, string> = {
  WAITING_USER: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  WONT_FIX:     "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};
function getTicketStatusClass(status: string): string {
  return statusColors[status] ?? getStatusBadgeClass(status);
}

const priorityColors: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  NORMAL: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  URGENT: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const typeIcons: Record<string, any> = {
  BUG: Bug,
  FEATURE_REQUEST: Lightbulb,
  QUESTION: HelpCircle,
  DATA_ISSUE: AlertTriangle,
  OTHER: MessageSquare,
};

export default function FeedbackQueue() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<FeedbackTicket | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<"PUBLIC" | "INTERNAL">("PUBLIC");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.append("status", statusFilter);
    if (typeFilter !== "all") params.append("type", typeFilter);
    if (priorityFilter !== "all") params.append("priority", priorityFilter);
    if (sourceFilter !== "all") params.append("source", sourceFilter);
    return params.toString() ? `?${params.toString()}` : "";
  };

  const { data: tickets, isLoading } = useQuery<FeedbackTicket[]>({
    queryKey: ["/api/admin/feedback", statusFilter, typeFilter, priorityFilter, sourceFilter],
    queryFn: () => fetch(`/api/admin/feedback${buildQueryString()}`).then(r => r.json()),
  });

  const { data: ticketDetail, isLoading: isLoadingDetail } = useQuery<FeedbackTicket & { comments: FeedbackComment[] }>({
    queryKey: ["/api/feedback", selectedTicket?.id],
    queryFn: () => fetch(`/api/feedback/${selectedTicket?.id}`).then(r => r.json()),
    enabled: !!selectedTicket,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      return apiRequest("PATCH", `/api/admin/feedback/${id}`, updates);
    },
    onSuccess: () => {
      toast({ title: "Ticket Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback", selectedTicket?.id] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async ({ ticketId, content, visibility }: { ticketId: string; content: string; visibility: string }) => {
      return apiRequest("POST", `/api/feedback/${ticketId}/comment`, { content, visibility });
    },
    onSuccess: () => {
      toast({ title: "Comment Added" });
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["/api/feedback", selectedTicket?.id] });
    },
  });

  const handleUpdateStatus = (id: string, status: string) => {
    updateMutation.mutate({ id, updates: { status } });
  };

  const handleUpdatePriority = (id: string, priority: string) => {
    updateMutation.mutate({ id, updates: { priority } });
  };

  const handleAddComment = () => {
    if (!selectedTicket || !commentText.trim()) return;
    commentMutation.mutate({
      ticketId: selectedTicket.id,
      content: commentText,
      visibility: commentVisibility,
    });
  };

  const getTypeIcon = (type: string) => {
    const Icon = typeIcons[type] || MessageSquare;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Feedback Queue</h1>
          <p className="text-muted-foreground">Manage user feedback, bug reports, and feature requests</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="WAITING_USER">Waiting on User</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
                <SelectItem value="WONT_FIX">Won't Fix</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-filter-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="BUG">Bug</SelectItem>
                <SelectItem value="FEATURE_REQUEST">Feature Request</SelectItem>
                <SelectItem value="QUESTION">Question</SelectItem>
                <SelectItem value="DATA_ISSUE">Data Issue</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[130px]" data-testid="select-filter-priority">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[130px]" data-testid="select-filter-source">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-source-all">All Sources</SelectItem>
                <SelectItem value="INTERNAL" data-testid="option-source-internal">Internal</SelectItem>
                <SelectItem value="CUSTOMER" data-testid="option-source-customer">Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !tickets?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No feedback tickets found
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-start gap-3 p-3 rounded-lg border hover-elevate cursor-pointer"
                  onClick={() => setSelectedTicket(ticket)}
                  data-testid={`ticket-row-${ticket.ticketNumber}`}
                >
                  <div className="flex-shrink-0 mt-1">
                    {getTypeIcon(ticket.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-muted-foreground">
                        #{ticket.ticketNumber}
                      </span>
                      <span className="font-semibold truncate">{ticket.title}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {ticket.ticketSource === 'CUSTOMER' && (
                        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" data-testid={`badge-customer-source-${ticket.ticketNumber}`}>
                          Customer
                        </Badge>
                      )}
                      <Badge className={getTicketStatusClass(ticket.status)}>
                        {ticket.status.replace("_", " ")}
                      </Badge>
                      <Badge variant="secondary" className={priorityColors[ticket.priority]}>
                        {ticket.priority}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {ticket.ticketSource === 'CUSTOMER' ? (ticket.customerName || ticket.customerEmail || 'Customer') : ticket.createdByName}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(ticket.createdAt), "MMM d, yyyy")}
                      </span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" data-testid={`button-actions-${ticket.ticketNumber}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleUpdateStatus(ticket.id, "IN_PROGRESS")}>
                        Mark In Progress
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleUpdateStatus(ticket.id, "RESOLVED")}>
                        Mark Resolved
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleUpdateStatus(ticket.id, "CLOSED")}>
                        Close Ticket
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleUpdatePriority(ticket.id, "URGENT")}>
                        Set Urgent Priority
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedTicket} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTicket && getTypeIcon(selectedTicket.type)}
              #{selectedTicket?.ticketNumber} - {selectedTicket?.title}
              {selectedTicket?.ticketSource === 'CUSTOMER' && (
                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" data-testid="badge-ticket-detail-customer">
                  Customer
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedTicket?.ticketSource === 'CUSTOMER' ? (
                <>
                  Submitted by {selectedTicket?.customerName || selectedTicket?.customerEmail || 'Customer'} 
                  {selectedTicket?.customerEmail && ` (${selectedTicket?.customerEmail})`} on{" "}
                </>
              ) : (
                <>Submitted by {selectedTicket?.createdByName} on{" "}</>
              )}
              {selectedTicket && format(new Date(selectedTicket.createdAt), "MMMM d, yyyy 'at' h:mm a")}
            </DialogDescription>
          </DialogHeader>

          {isLoadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : ticketDetail && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <Select
                  value={ticketDetail.status}
                  onValueChange={(value) => handleUpdateStatus(ticketDetail.id, value)}
                >
                  <SelectTrigger className="w-[140px]" data-testid="select-ticket-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="WAITING_USER">Waiting on User</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                    <SelectItem value="CLOSED">Closed</SelectItem>
                    <SelectItem value="WONT_FIX">Won't Fix</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={ticketDetail.priority}
                  onValueChange={(value) => handleUpdatePriority(ticketDetail.id, value)}
                >
                  <SelectTrigger className="w-[120px]" data-testid="select-ticket-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                {ticketDetail.customerIssueType && (
                  <Badge variant="outline">Issue: {ticketDetail.customerIssueType}</Badge>
                )}
                {ticketDetail.impact && (
                  <Badge variant="outline">Impact: {ticketDetail.impact}</Badge>
                )}
                {ticketDetail.urgency && (
                  <Badge variant="outline">Urgency: {ticketDetail.urgency}</Badge>
                )}
              </div>

              <div className="border rounded-lg p-3 bg-muted/50 mb-3">
                <p className="text-sm whitespace-pre-wrap">{ticketDetail.description}</p>
              </div>

              <Separator className="my-2" />

              <div className="flex-1 overflow-hidden flex flex-col">
                <h4 className="font-medium text-sm mb-2">Comments</h4>
                <ScrollArea className="flex-1 max-h-[200px]">
                  {ticketDetail.comments?.length ? (
                    <div className="space-y-2 pr-4">
                      {ticketDetail.comments.map((comment) => (
                        <div 
                          key={comment.id} 
                          className={`p-2 rounded-lg border ${comment.visibility === 'INTERNAL' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' : 'bg-background'}`}
                        >
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                            <span className="font-medium">{comment.authorName}</span>
                            <span>{format(new Date(comment.createdAt), "MMM d 'at' h:mm a")}</span>
                            {comment.visibility === "INTERNAL" && (
                              <Badge variant="outline" className="text-xs">Internal</Badge>
                            )}
                          </div>
                          <p className="text-sm">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No comments yet</p>
                  )}
                </ScrollArea>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select value={commentVisibility} onValueChange={(v: "PUBLIC" | "INTERNAL") => setCommentVisibility(v)}>
                      <SelectTrigger className="w-[120px]" data-testid="select-comment-visibility">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PUBLIC">Public</SelectItem>
                        <SelectItem value="INTERNAL">Internal</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      {commentVisibility === "INTERNAL" ? "Only visible to staff" : "Visible to user"}
                    </span>
                  </div>
                  <Textarea
                    placeholder="Add a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="min-h-[80px]"
                    data-testid="input-comment"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleAddComment}
                      disabled={!commentText.trim() || commentMutation.isPending}
                      data-testid="button-add-comment"
                    >
                      {commentMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Add Comment
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Separator className="my-6" />
      <UserSentimentPanel />
    </div>
  );
}
