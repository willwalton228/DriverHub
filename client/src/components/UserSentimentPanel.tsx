import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ThumbsUp, Minus, ThumbsDown, MessageCircle, AlertTriangle, Clock, User, CheckCircle2, Lightbulb, FilePlus2, XCircle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SubmitTicketDrawer } from "@/components/SubmitTicketDrawer";

interface SentimentFeedback {
  id: string;
  userId: string;
  username: string;
  userEmail: string | null;
  promptType: string;
  responseText: string;
  sentiment: string;
  moduleContext: string | null;
  pageUrl: string | null;
  appEnvironment: string | null;
  dismissed: boolean;
  adminNotified: boolean;
  status: string;
  convertedRecordType: string | null;
  convertedRecordId: string | null;
  convertedRecordReference: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface AdminFeedbackResponse {
  feedback: SentimentFeedback[];
  negativeCount: number;
  total: number;
}

const sentimentConfig: Record<string, { icon: typeof ThumbsUp; label: string; color: string }> = {
  positive: { icon: ThumbsUp, label: 'Positive', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
  neutral: { icon: Minus, label: 'Neutral', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  negative: { icon: ThumbsDown, label: 'Negative', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
};

const promptTypeLabels: Record<string, string> = {
  sign_in: 'Sign In',
  sign_out: 'Sign Out',
  manual: 'Manual',
};

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
  reviewed: { label: "Reviewed", className: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
  converted_to_quick_idea: { label: "Quick Idea", className: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300" },
  converted_to_amr: { label: "Converted to AMR", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  no_action: { label: "No Action", className: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
};

export function UserSentimentPanel() {
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [quickIdeaCandidate, setQuickIdeaCandidate] = useState<SentimentFeedback | null>(null);
  const [amrCandidate, setAmrCandidate] = useState<SentimentFeedback | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<AdminFeedbackResponse>({
    queryKey: ['/api/user-sentiment/admin', sentimentFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (sentimentFilter !== 'all') params.append('sentiment', sentimentFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      return fetch(`/api/user-sentiment/admin?${params.toString()}`, { credentials: "include" })
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "Unable to load feedback");
          return r.json();
        });
    },
  });

  const refreshFeedback = () => queryClient.invalidateQueries({ queryKey: ['/api/user-sentiment/admin'] });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "reviewed" | "no_action" }) => {
      const response = await apiRequest("PATCH", `/api/user-sentiment/${id}`, { status });
      return response.json();
    },
    onSuccess: (_, variables) => {
      toast({ title: variables.status === "reviewed" ? "Feedback marked reviewed" : "Feedback marked no action" });
      refreshFeedback();
    },
    onError: () => toast({ title: "Update failed", description: "The feedback was not changed. Please try again.", variant: "destructive" }),
  });

  const quickIdeaMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/user-sentiment/${id}/convert/quick-idea`);
      return response.json();
    },
    onSuccess: () => {
      setQuickIdeaCandidate(null);
      toast({ title: "Quick Idea created", description: "The original feedback remains linked to the new Quick Idea." });
      refreshFeedback();
    },
    onError: () => toast({ title: "Conversion failed", description: "No Quick Idea was created. Please try again.", variant: "destructive" }),
  });

  const linkAmrMutation = useMutation({
    mutationFn: async ({ feedbackId, ticketId }: { feedbackId: string; ticketId: string }) => {
      const response = await apiRequest("POST", `/api/user-sentiment/${feedbackId}/link-amr`, { ticketId });
      return response.json();
    },
    onSuccess: () => {
      setAmrCandidate(null);
      toast({ title: "Feedback converted to AMR", description: "The survey response is now linked to the submitted AMR." });
      refreshFeedback();
    },
    onError: () => toast({ title: "AMR created, but link failed", description: "Please reopen this feedback and retry linking the AMR.", variant: "destructive" }),
  });

  const feedbackList = data?.feedback || [];
  const negativeCount = data?.negativeCount || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" data-testid="text-sentiment-title">
            <MessageCircle className="h-5 w-5" />
            User Feedback
          </h2>
          <p className="text-sm text-muted-foreground">
            Survey responses are reviewed here before they become a Quick Idea or AMR.
          </p>
        </div>
        {negativeCount > 0 && (
          <Badge variant="destructive" className="flex items-center gap-1" data-testid="badge-negative-count">
            <AlertTriangle className="h-3 w-3" />
            {negativeCount} Negative
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Feedback Entries</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[155px]" data-testid="select-user-feedback-status">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="converted_to_quick_idea">Quick Idea</SelectItem>
                  <SelectItem value="converted_to_amr">Converted to AMR</SelectItem>
                  <SelectItem value="no_action">No Action</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-sentiment-filter">
                  <SelectValue placeholder="Filter by sentiment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sentiments</SelectItem>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading feedback...
            </div>
          ) : feedbackList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <MessageCircle className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No feedback entries yet</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {feedbackList.map((item) => {
                  const config = sentimentConfig[item.sentiment] || sentimentConfig.neutral;
                  const SentimentIcon = config.icon;
                  const workflowStatus = statusConfig[item.status] || statusConfig.new;
                  const isConverted = !!item.convertedRecordId;

                  return (
                    <Card key={item.id} className="p-3" data-testid={`card-feedback-${item.id}`}>
                      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm font-medium" data-testid={`text-feedback-user-${item.id}`}>
                            {item.username}
                          </span>
                          <Badge className={`text-xs ${config.color}`} data-testid={`badge-sentiment-${item.id}`}>
                            <SentimentIcon className="h-3 w-3 mr-1" />
                            {config.label}
                          </Badge>
                          <Badge className={`text-xs ${workflowStatus.className}`} data-testid={`badge-feedback-status-${item.id}`}>
                            {workflowStatus.label}
                          </Badge>
                          {item.adminNotified && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Flagged
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-xs">
                            {promptTypeLabels[item.promptType] || item.promptType}
                          </Badge>
                          {item.moduleContext && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {item.moduleContext}
                            </Badge>
                          )}
                          {item.appEnvironment && (
                            <Badge variant="outline" className="text-xs">
                              {item.appEnvironment}
                            </Badge>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(item.createdAt), 'MMM d, yyyy h:mm a')}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm" data-testid={`text-feedback-response-${item.id}`}>
                        {item.responseText || <span className="text-muted-foreground italic">No text provided</span>}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {!isConverted && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updateStatusMutation.isPending}
                              onClick={() => updateStatusMutation.mutate({ id: item.id, status: "reviewed" })}
                              data-testid={`button-feedback-review-${item.id}`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Review
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updateStatusMutation.isPending}
                              onClick={() => updateStatusMutation.mutate({ id: item.id, status: "no_action" })}
                              data-testid={`button-feedback-no-action-${item.id}`}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" />
                              No Action
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={quickIdeaMutation.isPending}
                              onClick={() => setQuickIdeaCandidate(item)}
                              data-testid={`button-feedback-quick-idea-${item.id}`}
                            >
                              <Lightbulb className="h-3.5 w-3.5 mr-1" />
                              Convert to Quick Idea
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => setAmrCandidate(item)}
                              data-testid={`button-feedback-convert-amr-${item.id}`}
                            >
                              <FilePlus2 className="h-3.5 w-3.5 mr-1" />
                              Convert to AMR
                            </Button>
                          </>
                        )}
                        {isConverted && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 py-1">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Linked {item.convertedRecordType === "amr" ? `AMR ${item.convertedRecordReference || ""}` : "Quick Idea"}
                          </span>
                        )}
                      </div>
                      {item.pageUrl && (
                        <p className="text-xs text-muted-foreground mt-2 break-all">
                          Page: {item.pageUrl}
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!quickIdeaCandidate} onOpenChange={(open) => !open && setQuickIdeaCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert feedback to a Quick Idea?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a Quick Idea with the original feedback, submitter, date, and page context. The survey response will remain linked for traceability.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={quickIdeaMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={quickIdeaMutation.isPending}
              onClick={() => quickIdeaCandidate && quickIdeaMutation.mutate(quickIdeaCandidate.id)}
            >
              {quickIdeaMutation.isPending ? "Creating…" : "Create Quick Idea"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SubmitTicketDrawer
        open={!!amrCandidate}
        onOpenChange={(open) => !open && setAmrCandidate(null)}
        prefillTitle={amrCandidate ? `Survey feedback from ${amrCandidate.username}` : undefined}
        prefillDesiredOutcome={amrCandidate ? [
          "Source: User Feedback survey",
          `Original submitter: ${amrCandidate.username}${amrCandidate.userEmail ? ` <${amrCandidate.userEmail}>` : ""}`,
          `Submitted: ${format(new Date(amrCandidate.createdAt), "MMM d, yyyy h:mm a")}`,
          `Module: ${amrCandidate.moduleContext || "Not provided"}`,
          `Page: ${amrCandidate.pageUrl || "Not provided"}`,
          `Rating: ${amrCandidate.sentiment}`,
          "",
          amrCandidate.responseText || "No written feedback was provided.",
        ].join("\n") : undefined}
        onSubmitted={(ticket) => {
          if (amrCandidate) {
            linkAmrMutation.mutate({ feedbackId: amrCandidate.id, ticketId: ticket.id });
          }
        }}
      />
    </div>
  );
}
