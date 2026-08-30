import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";
import { 
  ArrowLeft, 
  Plus, 
  Loader2, 
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Send,
  Bell,
  Users
} from "lucide-react";
import { format } from "date-fns";

interface Ticket {
  id: string;
  ticket_number: number;
  title: string;
  issue_type: string;
  issue_type_label: string;
  status: string;
  status_label: string;
  created_at: string;
  updated_at: string;
}

interface TicketDetail extends Ticket {
  description: string;
  impact_level: string;
  impact_detail: string;
  comments: Comment[];
}

interface Comment {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
  visibility?: string;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'SHIPPED':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'DECLINED':
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    case 'NEEDS_INFO':
      return <HelpCircle className="h-4 w-4 text-amber-500" />;
    case 'IN_PROGRESS':
    case 'PLANNED':
      return <Clock className="h-4 w-4 text-blue-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case 'SHIPPED':
      return "default";
    case 'DECLINED':
      return "secondary";
    case 'NEEDS_INFO':
      return "destructive";
    case 'IN_PROGRESS':
    case 'PLANNED':
      return "secondary";
    default:
      return "outline";
  }
}

function formatDate(dateString: string): string {
  try {
    return format(new Date(dateString), "MMM d, yyyy");
  } catch {
    return dateString;
  }
}

function formatDateTime(dateString: string): string {
  try {
    return format(new Date(dateString), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return dateString;
  }
}

interface CustomerUser {
  id: string;
  role: 'ACCOUNT_ADMIN' | 'ACCOUNT_VIEWER';
  customerName?: string;
}

export default function MyRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  const { data: customerUser } = useQuery<CustomerUser>({
    queryKey: ["/api/customer/me"],
  });

  const isAdmin = customerUser?.role === 'ACCOUNT_ADMIN';

  const { data: ticketsData, isLoading } = useQuery<{ tickets: Ticket[] }>({
    queryKey: ['/api/customer/support/tickets'],
    queryFn: async () => {
      const response = await fetch('/api/customer/support/tickets', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch tickets');
      return response.json();
    },
  });

  const { data: ticketDetail, isLoading: isLoadingDetail } = useQuery<TicketDetail>({
    queryKey: ['/api/customer/support/tickets', selectedTicketId],
    queryFn: async () => {
      const response = await fetch(`/api/customer/support/tickets/${selectedTicketId}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch ticket details');
      return response.json();
    },
    enabled: !!selectedTicketId,
  });

  const replyMutation = useMutation({
    mutationFn: async ({ ticketId, content }: { ticketId: string; content: string }) => {
      const response = await fetch(`/api/customer/support/tickets/${ticketId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to send reply');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Reply Sent", description: "Your message has been sent." });
      setReplyContent('');
      queryClient.invalidateQueries({ queryKey: ['/api/customer/support/tickets', selectedTicketId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send reply",
        variant: "destructive",
      });
    },
  });

  const handleReply = () => {
    if (!selectedTicketId || !replyContent.trim()) return;
    replyMutation.mutate({ ticketId: selectedTicketId, content: replyContent.trim() });
  };

  const tickets = ticketsData?.tickets || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              <span className="font-semibold">My Requests</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link href="/customer/support/report">
                <Button size="sm" data-testid="button-new-request">
                  <Plus className="h-4 w-4 mr-1" />
                  New Request
                </Button>
              </Link>
            )}
            <Link href="/customer/settings/users">
              <Button variant="ghost" size="icon" data-testid="button-user-settings">
                <Users className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="/customer/settings/notifications">
              <Button variant="ghost" size="icon" data-testid="button-notification-settings">
                <Bell className="h-5 w-5" />
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : tickets.length === 0 ? (
          <Card data-testid="card-empty-state">
            <CardContent className="pt-6">
              <div className="text-center space-y-4 py-8">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground" />
                <h2 className="text-xl font-semibold">No Requests Yet</h2>
                <p className="text-muted-foreground">
                  You haven't submitted any support requests.
                </p>
                <Link href="/customer/support/report">
                  <Button data-testid="button-report-first-issue">
                    <Plus className="h-4 w-4 mr-2" />
                    Report an Issue
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {tickets.map((ticket) => (
              <Card 
                key={ticket.id} 
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedTicketId(ticket.id)}
                data-testid={`card-ticket-${ticket.ticket_number}`}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-muted-foreground">
                          #{ticket.ticket_number}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {ticket.issue_type_label}
                        </Badge>
                      </div>
                      <h3 className="font-medium truncate" data-testid={`text-ticket-title-${ticket.ticket_number}`}>
                        {ticket.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Submitted {formatDate(ticket.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(ticket.status)}
                      <Badge variant={getStatusBadgeVariant(ticket.status)}>
                        {ticket.status_label}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!selectedTicketId} onOpenChange={(open) => !open && setSelectedTicketId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {ticketDetail && (
                <>
                  Request #{ticketDetail.ticket_number}
                  <Badge variant={getStatusBadgeVariant(ticketDetail.status)}>
                    {ticketDetail.status_label}
                  </Badge>
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {ticketDetail?.issue_type_label}
            </DialogDescription>
          </DialogHeader>

          {isLoadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : ticketDetail ? (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="space-y-4 pb-4">
                <div>
                  <h4 className="font-medium mb-1">{ticketDetail.title}</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {ticketDetail.description}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  Submitted {formatDateTime(ticketDetail.created_at)}
                </div>
              </div>

              <Separator />

              <div className="flex-1 min-h-0 py-4">
                <h4 className="font-medium text-sm mb-3">Conversation</h4>
                <ScrollArea className="h-[200px]" data-testid="scroll-comments">
                  {ticketDetail.comments.filter(c => !c.visibility || c.visibility === 'REQUESTER' || c.visibility === 'PUBLIC').length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-comments">
                      No messages yet. We'll respond shortly.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {ticketDetail.comments
                        .filter(c => !c.visibility || c.visibility === 'REQUESTER' || c.visibility === 'PUBLIC')
                        .map((comment) => (
                        <div 
                          key={comment.id} 
                          className="bg-muted/50 rounded-lg p-3"
                          data-testid={`comment-${comment.id}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm" data-testid={`text-comment-author-${comment.id}`}>{comment.author_name}</span>
                            <span className="text-xs text-muted-foreground" data-testid={`text-comment-date-${comment.id}`}>
                              {formatDateTime(comment.created_at)}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap" data-testid={`text-comment-content-${comment.id}`}>{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              <Separator />

              <div className="pt-4 space-y-3">
                <Textarea
                  placeholder="Type your reply..."
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  className="min-h-[80px]"
                  data-testid="input-reply"
                />
                <div className="flex justify-end">
                  <Button 
                    onClick={handleReply}
                    disabled={!replyContent.trim() || replyMutation.isPending}
                    data-testid="button-send-reply"
                  >
                    {replyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send Reply
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
