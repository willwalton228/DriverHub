import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import {
  Activity,
  PlusCircle,
  ArrowRightLeft,
  MessageSquare,
  Paperclip,
  Trash2,
  CheckCircle2,
  Send,
  ShieldAlert,
  ShieldOff,
  FileText,
  Package,
  FlaskConical,
  RefreshCw,
  Lock,
  Unlock,
  AlertTriangle,
  Info,
} from "lucide-react";

// ── Utility ────────────────────────────────────────────────────────────────

function formatTimelineDate(isoString: string): { date: string; time: string } {
  try {
    const d = parseISO(isoString);
    let date: string;
    if (isToday(d)) date = "Today";
    else if (isYesterday(d)) date = "Yesterday";
    else date = format(d, "MMM d, yyyy");
    return { date, time: format(d, "h:mm a") };
  } catch {
    return { date: "—", time: "" };
  }
}

// ── Filter categories ─────────────────────────────────────────────────────────

type FilterKey = "all" | "notes" | "status" | "evidence";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",      label: "All" },
  { key: "notes",    label: "Notes" },
  { key: "status",   label: "Status" },
  { key: "evidence", label: "Evidence" },
];

function matchesFilter(eventType: string, filter: FilterKey): boolean {
  if (filter === "all") return true;
  const t = (eventType || "").toUpperCase();
  if (filter === "notes")    return t.includes("NOTE") || t === "NOTES_ADDED";
  if (filter === "status")   return t.includes("STATUS") || t.includes("CREATED") || t.includes("CLOSED") || t.includes("TRANSITION");
  if (filter === "evidence") return t.includes("UPLOAD") || t.includes("ATTACHMENT") || t.includes("DOCUMENT") || t.includes("EVIDENCE") || t.includes("PHOTO");
  return true;
}

// ── Navigability ─────────────────────────────────────────────────────────────

function isNavigable(eventType: string): boolean {
  const t = (eventType || "").toUpperCase();
  return (
    t.includes("NOTE") ||
    t === "NOTES_ADDED" ||
    t.includes("UPLOAD") ||
    t.includes("ATTACHMENT") ||
    t.includes("DOCUMENT") ||
    t.includes("EVIDENCE") ||
    t.includes("PHOTO") ||
    t.includes("STATUS") ||
    t.includes("CREATED") ||
    t.includes("CLOSED") ||
    t.includes("REPAIR") ||
    t.includes("ESTIMATE") ||
    t.includes("CARRIER") ||
    t.includes("SUBMISSION") ||
    t.includes("FORM") ||
    t.includes("GENERATED") ||
    t.includes("PACKET")
  );
}

// ── Icon mapping ─────────────────────────────────────────────────────────────

interface IconConfig {
  Icon: React.ElementType;
  color: string;
  bg: string;
}

function getIconConfig(eventType: string): IconConfig {
  const t = (eventType || "").toUpperCase();

  if (t.includes("CREATED") || t === "CLAIM_CREATED") return { Icon: PlusCircle, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/40" };
  if (t.includes("STATUS_CHANGED") || t === "STATUS_CHANGE") return { Icon: ArrowRightLeft, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/40" };
  if (t.includes("NOTE") || t === "NOTES_ADDED") return { Icon: MessageSquare, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-900/40" };
  if (t.includes("UPLOAD") || t.includes("DOCUMENT_UPLOADED") || t === "ATTACHMENT_UPLOADED") return { Icon: Paperclip, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/40" };
  if (t.includes("REMOVED") || t.includes("DELETED") || t.includes("DELETE")) return { Icon: Trash2, color: "text-destructive", bg: "bg-destructive/10" };
  if (t.includes("CLOSED") || t === "CLAIM_CLOSED") return { Icon: CheckCircle2, color: "text-muted-foreground", bg: "bg-muted" };
  if (t.includes("CARRIER") || t.includes("SUBMISSION")) return { Icon: Send, color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-100 dark:bg-sky-900/40" };
  if (t.includes("HOLD_ACTIVATED") || t.includes("HOLD_APPLIED")) return { Icon: ShieldAlert, color: "text-destructive", bg: "bg-destructive/10" };
  if (t.includes("HOLD_RELEASED") || t.includes("HOLD_REMOVED")) return { Icon: ShieldOff, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/40" };
  if (t.includes("EVIDENCE_LOCK") || t.includes("LOCK")) return { Icon: Lock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40" };
  if (t.includes("UNLOCK")) return { Icon: Unlock, color: "text-muted-foreground", bg: "bg-muted" };
  if (t.includes("FORM") || t.includes("GENERATED")) return { Icon: FileText, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-900/40" };
  if (t.includes("PACKET")) return { Icon: Package, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-900/40" };
  if (t.includes("DRUG")) return { Icon: FlaskConical, color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-100 dark:bg-pink-900/40" };
  if (t.includes("RECOVERY") || t.includes("SUBROGATION")) return { Icon: RefreshCw, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-100 dark:bg-teal-900/40" };
  if (t.includes("WARN") || t.includes("ALERT")) return { Icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40" };

  return { Icon: Info, color: "text-muted-foreground", bg: "bg-muted" };
}

// ── Timeline item ────────────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string;
  eventType: string;
  label: string;
  detail?: string | null;
  userName: string;
  createdAt: string;
  targetId?: string | null;
  targetSection?: string | null;
}

interface TimelineItemProps {
  event: TimelineEvent;
  isLast: boolean;
  onNavigate?: (event: TimelineEvent) => void;
}

function TimelineItem({ event, isLast, onNavigate }: TimelineItemProps) {
  const { date, time } = formatTimelineDate(event.createdAt);
  const { Icon, color, bg } = getIconConfig(event.eventType);
  const navigable = isNavigable(event.eventType);

  const handleClick = () => {
    if (navigable && onNavigate) {
      onNavigate(event);
    }
  };

  return (
    <div
      className={`relative flex gap-2.5 rounded-md transition-colors ${
        navigable && onNavigate
          ? "cursor-pointer hover:bg-muted/40 -mx-1 px-1 py-0.5"
          : ""
      }`}
      onClick={handleClick}
      data-testid={`timeline-item-${event.id}`}
      title={navigable && onNavigate ? "Click to jump to this section" : undefined}
    >
      {/* Connector line */}
      {!isLast && (
        <div
          className="absolute left-3.5 top-7 w-px bg-border/60"
          style={{ bottom: "-10px" }}
          aria-hidden="true"
        />
      )}

      {/* Icon bubble */}
      <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${bg}`}>
        <Icon className={`h-3 w-3 ${color}`} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-2">
        <p
          className={`text-xs font-semibold leading-tight ${
            navigable && onNavigate
              ? "text-foreground/80 group-hover:underline underline-offset-2 decoration-muted-foreground/50"
              : "text-foreground/80"
          }`}
        >
          {event.label}
          {navigable && onNavigate && (
            <span className="ml-1 text-muted-foreground/40 text-[10px]">↗</span>
          )}
        </p>
        {event.detail && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{event.detail}</p>
        )}
        <p className="text-xs text-muted-foreground/80 mt-0.5">
          {event.userName}
        </p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          {date} · {time}
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface TimelinePanelProps {
  claimId: string;
  onNavigate?: (event: TimelineEvent) => void;
}

export function TimelinePanel({ claimId, onNavigate }: TimelinePanelProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const { data: events = [], isLoading } = useQuery<TimelineEvent[]>({
    queryKey: ["/api/corporate/accidents", claimId, "timeline"],
    queryFn: async () => {
      const res = await fetch(`/api/corporate/accidents/${claimId}/timeline`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch timeline");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const filtered = events.filter((e) => matchesFilter(e.eventType, activeFilter));

  return (
    <Card className="flex flex-col bg-muted/30 border-border/60" data-testid="claim-timeline-panel">
      <CardHeader className="pb-1.5 pt-2.5 px-3 shrink-0 space-y-1.5">
        <CardTitle className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Activity className="h-3 w-3 shrink-0" />
          Activity
        </CardTitle>

        {/* Filter pills
            TODO: Consolidate these filters into a compact dropdown (e.g. a Select or Popover)
            to reduce vertical space in the sidebar and align with DriverHub density standards.
            No implementation yet — layout is approved as-is. */}
        <div className="flex items-center gap-0.5 flex-wrap" data-testid="timeline-filter-bar">
          {FILTERS.map(({ key, label }) => {
            const isActive = activeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                data-testid={`timeline-filter-${key}`}
                className={`
                  inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium transition-colors leading-5
                  ${isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"}
                `}
              >
                {label}
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto min-h-0 px-3 pt-0 pb-2">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-2.5">
                <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5 pt-0.5">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2" data-testid="timeline-empty">
            <Activity className="h-6 w-6 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground/70">
              {activeFilter === "all"
                ? "No claim activity recorded yet."
                : `No ${FILTERS.find((f) => f.key === activeFilter)?.label.toLowerCase()} activity found.`}
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {filtered.map((event, i) => (
              <TimelineItem
                key={event.id}
                event={event}
                isLast={i === filtered.length - 1}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
