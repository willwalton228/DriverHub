import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  RefreshCw,
  ShieldAlert,
  History,
  FileText,
  ArrowRight,
  Globe,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  eventType: string;
  actorUserId: string | null;
  actorUserEmail: string | null;
  targetEntityType: string;
  targetEntityId: string;
  targetEntityLabel: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  entries: AuditEntry[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function eventLabel(eventType: string): string {
  return eventType
    .replace(/^financial\./, "")
    .replace(/\./g, " › ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function eventVariant(eventType: string): { color: string; bg: string } {
  if (eventType.includes("deleted") || eventType.includes("written_off") || eventType.includes("denied"))
    return { color: "text-red-700 dark:text-red-300", bg: "bg-red-100 dark:bg-red-950/30" };
  if (eventType.includes("created"))
    return { color: "text-green-700 dark:text-green-300", bg: "bg-green-100 dark:bg-green-950/30" };
  if (eventType.includes("status_changed") || eventType.includes("transition") || eventType.includes("submit") || eventType.includes("reconcile"))
    return { color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-100 dark:bg-blue-950/30" };
  if (eventType.includes("payment"))
    return { color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-100 dark:bg-violet-950/30" };
  if (eventType.includes("deposit_batch"))
    return { color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-100 dark:bg-amber-950/30" };
  if (eventType.includes("credit_memo"))
    return { color: "text-teal-700 dark:text-teal-300", bg: "bg-teal-100 dark:bg-teal-950/30" };
  return { color: "text-muted-foreground", bg: "bg-muted/60" };
}

function DiffView({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  if (!before && !after) return null;

  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  const changedKeys = Array.from(allKeys).filter((k) => {
    const bv = JSON.stringify((before ?? {})[k] ?? null);
    const av = JSON.stringify((after ?? {})[k] ?? null);
    return bv !== av;
  });

  if (changedKeys.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">No field changes recorded.</div>
    );
  }

  return (
    <div className="space-y-1">
      {changedKeys.map((key) => {
        const prev = (before ?? {})[key];
        const next = (after ?? {})[key];
        return (
          <div key={key} className="flex items-start gap-1.5 text-xs">
            <span className="font-mono text-muted-foreground shrink-0 min-w-20">{key}</span>
            <div className="flex items-center gap-1 flex-wrap">
              {prev !== undefined && (
                <span className="font-mono bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-1 rounded line-through">
                  {String(prev ?? "—").slice(0, 60)}
                </span>
              )}
              {prev !== undefined && next !== undefined && (
                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
              )}
              {next !== undefined && (
                <span className="font-mono bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 px-1 rounded">
                  {String(next ?? "—").slice(0, 60)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Single Row ───────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { color, bg } = eventVariant(entry.eventType);
  const actorName =
    (entry.metadata as any)?.actorUserName ||
    entry.actorUserEmail ||
    (entry.actorUserId ? entry.actorUserId.slice(0, 8) + "…" : "System");

  const hasDiff = !!(entry.previousValue || entry.newValue);
  const hasNotes = !!entry.reason;

  return (
    <div className="border rounded-md overflow-hidden" data-testid={`audit-row-${entry.id}`}>
      <div
        className="flex items-start gap-3 p-3 cursor-pointer"
        onClick={() => (hasDiff || hasNotes) && setExpanded((v) => !v)}
      >
        {/* Timeline dot */}
        <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${bg} border`} />

        <div className="flex-1 min-w-0 space-y-1">
          {/* Top row: event badge + timestamp */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${bg} ${color}`}>
              {eventLabel(entry.eventType)}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTs(entry.createdAt)}
            </span>
          </div>

          {/* Actor + IP */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {actorName}
            </span>
            {entry.ipAddress && (
              <span className="flex items-center gap-1">
                <Globe className="w-3 h-3" />
                {entry.ipAddress}
              </span>
            )}
          </div>

          {/* Reason / notes */}
          {hasNotes && (
            <p className="text-xs text-muted-foreground italic">{entry.reason}</p>
          )}
        </div>

        {(hasDiff || hasNotes) && (
          <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        )}
      </div>

      {expanded && hasDiff && (
        <div className="border-t px-3 py-2 bg-muted/20">
          <DiffView before={entry.previousValue} after={entry.newValue} />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface EntityAuditTrailProps {
  entityId: string | null | undefined;
  entityType: string;
  title?: string;
  /** If true, renders as a collapsible section rather than always-visible */
  collapsible?: boolean;
  /** Initial expanded state when collapsible=true */
  defaultExpanded?: boolean;
  /** Max number of entries to show in the inline view (paginate with "Load more") */
  pageSize?: number;
}

export function EntityAuditTrail({
  entityId,
  entityType,
  title = "Audit Trail",
  collapsible = false,
  defaultExpanded = false,
  pageSize = 25,
}: EntityAuditTrailProps) {
  const [sectionOpen, setSectionOpen] = useState(defaultExpanded);
  const [page, setPage] = useState(0);

  const { data, isLoading, isFetching, refetch } = useQuery<AuditLogResponse>({
    queryKey: ["/api/corporate/invoicing/financial-audit-log", entityType, entityId, page],
    queryFn: () => {
      const params = new URLSearchParams({
        targetEntityType: entityType,
        targetEntityId: entityId!,
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      return apiRequest("GET", `/api/corporate/invoicing/financial-audit-log?${params}`).then((r) =>
        r.json()
      );
    },
    enabled: !!entityId && (collapsible ? sectionOpen : true),
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;

  if (collapsible) {
    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center justify-between py-2 text-sm font-medium hover-elevate rounded-md px-1"
          onClick={() => setSectionOpen((v) => !v)}
          data-testid="btn-toggle-audit-trail"
        >
          <span className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            {title}
            {total > 0 && (
              <Badge variant="secondary" className="text-xs">
                {total}
              </Badge>
            )}
          </span>
          {sectionOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {sectionOpen && (
          <AuditTrailBody
            entries={entries}
            total={total}
            isLoading={isLoading}
            isFetching={isFetching}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onRefresh={refetch}
          />
        )}
      </div>
    );
  }

  return (
    <AuditTrailBody
      entries={entries}
      total={total}
      isLoading={isLoading}
      isFetching={isFetching}
      page={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onRefresh={refetch}
    />
  );
}

function AuditTrailBody({
  entries,
  total,
  isLoading,
  isFetching,
  page,
  pageSize,
  onPageChange,
  onRefresh,
}: {
  entries: AuditEntry[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onRefresh: () => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 mt-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {total === 0 ? "No audit events found." : `${total} event${total !== 1 ? "s" : ""} total`}
        </p>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={isFetching}
          data-testid="btn-refresh-audit-trail"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">
          <ShieldAlert className="w-5 h-5 mx-auto mb-1 text-muted-foreground/50" />
          No financial events logged yet.
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {entries.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </div>

          {/* Pagination */}
          {(page > 0 || total > (page + 1) * pageSize) && (
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="outline"
                size="default"
                onClick={() => onPageChange(page - 1)}
                disabled={page === 0 || isFetching}
                data-testid="btn-audit-prev"
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {Math.ceil(total / pageSize)}
              </span>
              <Button
                variant="outline"
                size="default"
                onClick={() => onPageChange(page + 1)}
                disabled={(page + 1) * pageSize >= total || isFetching}
                data-testid="btn-audit-next"
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Payment Audit Trail Dialog ───────────────────────────────────────────────

interface PaymentAuditDialogProps {
  paymentId: string | null;
  paymentLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaymentAuditDialog({ paymentId, paymentLabel, open, onOpenChange }: PaymentAuditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Payment Audit Trail
            {paymentLabel && (
              <span className="text-sm font-normal text-muted-foreground">— {paymentLabel}</span>
            )}
          </DialogTitle>
        </DialogHeader>
        {paymentId && (
          <EntityAuditTrail entityId={paymentId} entityType="payment" />
        )}
      </DialogContent>
    </Dialog>
  );
}
