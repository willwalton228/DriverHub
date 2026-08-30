import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, ChevronDown, ChevronUp, ArrowRight, Bell,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface AmrDeclineNotification {
  id: string;
  ticketId: string;
  amrNumber: string;
  amrTitle: string;
  submittedByName: string | null;
  declinedByUserId: string;
  declinedByName: string;
  declinedAt: string;
  declineComment: string | null;
  clearedAt: string | null;
  createdAt: string;
}

function safeDateTime(val: string | null | undefined) {
  if (!val) return "";
  try {
    const d = val.includes("T") ? parseISO(val) : new Date(val);
    return format(d, "MMM d, yyyy 'at' h:mm a");
  } catch { return ""; }
}

export function AMRDeclineAlert() {
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(true);
  const prevCountRef = useRef(0);

  const { data: notifications = [] } = useQuery<AmrDeclineNotification[]>({
    queryKey: ["/api/amr/declined-notifications"],
    refetchInterval: 30_000,
  });

  // Auto-expand when new items arrive
  useEffect(() => {
    if (notifications.length > prevCountRef.current && notifications.length > 0) {
      setExpanded(true);
    }
    prevCountRef.current = notifications.length;
  }, [notifications.length]);

  if (notifications.length === 0) return null;

  function openAmr(ticketId: string) {
    setLocation(`/amr`);
    // Store the ticket ID so the portal can deep-link to it
    try { sessionStorage.setItem("amr.focusTicketId", ticketId); } catch {}
  }

  return (
    <div
      className="fixed left-4 z-50 w-80 space-y-1.5"
      style={{ top: "68px" }}
      data-testid="amr-decline-alert"
      role="alert"
      aria-live="polite"
    >
      {/* ── Header bar ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-red-600 text-white shadow-lg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        data-testid="btn-amr-decline-alert-toggle"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          <Bell className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm font-semibold truncate">
            {notifications.length === 1
              ? "1 AMR Declined — Needs Review"
              : `${notifications.length} AMRs Declined — Needs Review`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge className="bg-white/25 text-white border-white/40 text-[10px] px-1.5 py-0 h-4">
            {notifications.length}
          </Badge>
          {expanded
            ? <ChevronUp  className="h-3.5 w-3.5 opacity-80" />
            : <ChevronDown className="h-3.5 w-3.5 opacity-80" />}
        </div>
      </button>

      {/* ── Expanded notification list ── */}
      {expanded && (
        <Card className="shadow-lg border-red-200 dark:border-red-900 overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y max-h-[calc(100vh-160px)] overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-2 px-3 py-2.5 hover-elevate cursor-pointer group"
                  onClick={() => openAmr(n.ticketId)}
                  data-testid={`amr-decline-item-${n.id}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openAmr(n.ticketId); }}
                >
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />

                  <div className="flex-1 min-w-0 space-y-0.5">
                    {/* AMR number + title */}
                    <p className="text-sm font-medium leading-tight truncate">
                      {n.amrNumber ? `${n.amrNumber} — ` : ""}{n.amrTitle}
                    </p>

                    {/* Submitter + decliner */}
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {[
                        n.submittedByName ? `Submitted by ${n.submittedByName}` : null,
                        `Declined by ${n.declinedByName}`,
                      ].filter(Boolean).join(" · ")}
                    </p>

                    {/* Date/time */}
                    {n.declinedAt && (
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        {safeDateTime(n.declinedAt)}
                      </p>
                    )}

                    {/* Decline comment */}
                    {n.declineComment && (
                      <p className="text-[11px] text-foreground/70 leading-snug line-clamp-2 mt-0.5 italic">
                        "{n.declineComment}"
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 mt-0.5">
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-red-500 transition-colors" />
                  </div>
                </div>
              ))}
            </div>

            {/* Footer — no dismiss; only status change clears these */}
            <div className="px-3 py-2 border-t bg-muted/30">
              <p className="text-[10px] text-muted-foreground">
                AMR · Change status to clear — reading does not dismiss
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
