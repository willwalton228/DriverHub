import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Fingerprint, Clock, ArrowRight, User, Mail, Phone, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface IdentityHistoryPanelProps {
  candidateId: string;
  candidateName: string;
}

interface IdentityChange {
  id: string;
  candidateId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  changedByEmail: string | null;
  changedAt: string;
  source: string;
}

const fieldConfig: Record<string, { label: string; icon: typeof User }> = {
  firstName: { label: "First Name", icon: User },
  lastName: { label: "Last Name", icon: User },
  email: { label: "Email", icon: Mail },
  phone: { label: "Phone", icon: Phone },
};

export function IdentityHistoryPanel({ candidateId, candidateName }: IdentityHistoryPanelProps) {
  const { data: history, isLoading } = useQuery<IdentityChange[]>({
    queryKey: ["/api/recruiting/candidates", candidateId, "identity-history"],
    enabled: !!candidateId,
  });

  return (
    <Card className="w-full" data-testid="identity-history-card">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5" />
            Identity History
          </CardTitle>
          <CardDescription>
            Change history for {candidateName}
          </CardDescription>
        </div>
        <Badge variant="outline" data-testid="badge-identity-change-count">
          {history?.length ?? 0} {(history?.length ?? 0) === 1 ? "change" : "changes"}
        </Badge>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : history && history.length > 0 ? (
          <ScrollArea className="h-[350px]">
            <div className="space-y-3">
              {history.map((change) => {
                const config = fieldConfig[change.field] || { label: change.field, icon: User };
                const FieldIcon = config.icon;

                return (
                  <div
                    key={change.id}
                    className="flex items-start gap-3 p-3 rounded-lg border"
                    data-testid={`identity-change-${change.id}`}
                  >
                    <div className="p-2 rounded-full bg-muted">
                      <FieldIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{config.label}</span>
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-field-${change.field}`}>
                          {change.source}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm flex-wrap">
                        <span className="text-muted-foreground line-through truncate max-w-[150px]">
                          {change.oldValue || "(empty)"}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate max-w-[150px]">
                          {change.newValue || "(empty)"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(change.changedAt), "MMM d, yyyy 'at' h:mm a")}
                        </div>
                        {change.changedByEmail && (
                          <span>by {change.changedByEmail}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Fingerprint className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No identity changes recorded</p>
            <p className="text-xs text-muted-foreground mt-1">
              Changes to name, email, and phone will appear here
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
