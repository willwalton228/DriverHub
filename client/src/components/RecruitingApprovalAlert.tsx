import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList, ChevronDown, ChevronUp, X, ArrowRight, Bell,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const EXEC_ROLES = new Set([
  "super_user", "super_admin", "root_super_admin",
  "corporate_admin", "admin", "manager",
]);

function safeDate(val: string | null | undefined) {
  if (!val) return "";
  try {
    const d = val.includes("T") ? parseISO(val) : new Date(val);
    return format(d, "MMM d, yyyy");
  } catch { return ""; }
}

const URGENCY_LABEL: Record<number, string> = {
  1: "Low", 2: "Med-Low", 3: "Medium", 4: "High", 5: "Critical",
};
const URGENCY_CLASSES: Record<number, string> = {
  1: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  2: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  3: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  4: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  5: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export function RecruitingApprovalAlert() {
  const { user } = useAuth();
  const [, setLocation]    = useLocation();
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const prevCountRef = useRef(0);

  const isExec = !!user?.role && EXEC_ROLES.has(user.role);

  const { data: pending = [] } = useQuery<any[]>({
    queryKey: ["/api/recruiting/requests/pending"],
    refetchInterval: 30_000,
    enabled: isExec,
  });

  // Filter out individually dismissed items
  const visible = pending.filter((r) => !dismissed.has(r.id));

  // Auto-expand when new items arrive (weren't there before)
  useEffect(() => {
    if (visible.length > prevCountRef.current && visible.length > 0) {
      setExpanded(true);
    }
    prevCountRef.current = visible.length;
  }, [visible.length]);

  if (!isExec || visible.length === 0) return null;

  function dismissItem(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDismissed((prev) => new Set([...prev, id]));
  }

  function openApproval(id: string) {
    setLocation(`/recruiting/requests/${id}`);
  }

  return (
    <div
      className="fixed right-4 z-50 w-80 space-y-1.5"
      style={{ top: "68px" }}
      data-testid="recruiting-approval-alert"
      role="alert"
      aria-live="polite"
    >
      {/* ── Header bar ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-orange-500 text-white shadow-lg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
        data-testid="btn-recruiting-alert-toggle"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          <Bell className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm font-semibold truncate">
            {visible.length === 1
              ? "1 Request Pending Approval"
              : `${visible.length} Requests Pending Approval`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge className="bg-white/25 text-white border-white/40 text-[10px] px-1.5 py-0 h-4">
            {visible.length}
          </Badge>
          {expanded
            ? <ChevronUp  className="h-3.5 w-3.5 opacity-80" />
            : <ChevronDown className="h-3.5 w-3.5 opacity-80" />}
        </div>
      </button>

      {/* ── Expanded request list ── */}
      {expanded && (
        <Card className="shadow-lg border-orange-200 dark:border-orange-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y max-h-[calc(100vh-160px)] overflow-y-auto">
              {visible.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-2 px-3 py-2.5 hover-elevate cursor-pointer group"
                  onClick={() => openApproval(r.id)}
                  data-testid={`alert-request-${r.id}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openApproval(r.id); }}
                >
                  <ClipboardList className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-medium leading-tight truncate">
                      {r.dealershipName || r.location || "Recruiting Request"}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {[
                        r.campaignType
                          ? r.campaignType.charAt(0).toUpperCase() + r.campaignType.slice(1)
                          : null,
                        r.driverType,
                        r.submittedAt ? `Submitted ${safeDate(r.submittedAt)}` : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                    {r.urgency && (
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0 text-[10px] font-medium ${URGENCY_CLASSES[r.urgency] ?? ""}`}>
                        {URGENCY_LABEL[r.urgency] ?? `Level ${r.urgency}`} priority
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-orange-500 transition-colors" />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground/50 hover:text-foreground"
                      onClick={(e) => dismissItem(r.id, e)}
                      data-testid={`btn-dismiss-alert-${r.id}`}
                      aria-label="Dismiss this notification"
                      title="Dismiss"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t bg-muted/30 flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">
                Recruiting · Awaiting your decision
              </p>
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                onClick={() => setDismissed(new Set(pending.map((r: any) => r.id)))}
                data-testid="btn-dismiss-all-alerts"
              >
                Dismiss all
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
