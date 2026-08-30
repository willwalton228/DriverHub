import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Loader2, Clock, Mail, MessageSquare, AlertCircle } from "lucide-react";

interface NudgeLogEntry {
  id: string;
  applicationId: string;
  candidateId: string;
  ruleId: string;
  ruleType: string;
  stage: string;
  sequenceNumber: number;
  channel: string;
  communicationId: string | null;
  status: string;
  suppressedReason: string | null;
  sentAt: string;
}

export function NudgeHistory({ applicationId }: { applicationId: string }) {
  const { data: nudgeHistory = [], isLoading } = useQuery<NudgeLogEntry[]>({
    queryKey: ['/api/recruiting/applications', applicationId, 'nudge-history'],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/applications/${applicationId}/nudge-history`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch nudge history');
      return res.json();
    },
    enabled: !!applicationId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground text-sm" data-testid="nudge-history-loading">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading nudge history...
      </div>
    );
  }

  if (nudgeHistory.length === 0) {
    return null;
  }

  const ruleTypeLabels: Record<string, string> = {
    no_response: "No Response",
    docs_pending: "Docs Pending",
    interview_unconfirmed: "Interview Unconfirmed",
  };

  return (
    <Card data-testid="card-nudge-history">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Auto-Nudges ({nudgeHistory.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="space-y-2">
          {nudgeHistory.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 text-sm"
              data-testid={`nudge-entry-${entry.id}`}
            >
              {entry.status === "sent" ? (
                entry.channel === "sms" ? (
                  <MessageSquare className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                ) : (
                  <Mail className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                )
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              )}
              <Badge
                variant={entry.status === "sent" ? "default" : "secondary"}
                className="text-xs"
              >
                {entry.status === "sent" ? "Sent" : "Suppressed"}
              </Badge>
              <span className="text-muted-foreground">
                {ruleTypeLabels[entry.ruleType] || entry.ruleType}
              </span>
              <span className="text-muted-foreground">
                #{entry.sequenceNumber}
              </span>
              {entry.suppressedReason && (
                <span className="text-xs text-muted-foreground">
                  ({entry.suppressedReason.replace(/_/g, ' ')})
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(entry.sentAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
