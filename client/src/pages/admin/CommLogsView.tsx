import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail, MessageSquare, Phone, Search, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, Clock, RefreshCw, Eye, MousePointer2,
  Minus,
} from "lucide-react";
import { formatDateTime } from "@/lib/dateFormat";

// ── types ────────────────────────────────────────────────────────────────────

interface CommLogRow {
  id: string;
  sent_at: string;
  sender_name: string;
  sender_email: string;
  recipient_name: string;
  recipient_email: string;
  recipient_phone: string;
  channel: string;
  subject: string;
  body_preview: string;
  status: string;
  context_module: string;
  opened_at: string | null;
  clicked_at: string | null;
  driver_id: string;
  driver_name: string;
}

interface CommLogsResponse {
  rows: CommLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  email: { label: "Email", icon: Mail, color: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  sms:   { label: "SMS",   icon: MessageSquare, color: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
  voice: { label: "Voice", icon: Phone, color: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
};

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  sent:      { icon: CheckCircle2, color: "text-green-600 dark:text-green-400",  label: "Sent" },
  delivered: { icon: CheckCircle2, color: "text-green-600 dark:text-green-400",  label: "Delivered" },
  failed:    { icon: XCircle,      color: "text-red-500",                        label: "Failed" },
  scheduled: { icon: Clock,        color: "text-amber-500",                      label: "Scheduled" },
  pending:   { icon: Clock,        color: "text-amber-500",                      label: "Pending" },
  bounced:   { icon: XCircle,      color: "text-red-500",                        label: "Bounced" },
};

const MODULE_FILTER_OPTIONS = [
  { value: "",         label: "All Modules" },
  { value: "driver",   label: "Drivers" },
  { value: "claim",    label: "Claims" },
  { value: "recruit",  label: "Recruiting" },
  { value: "dispatch", label: "Dispatch" },
  { value: "vendor",   label: "Vendor" },
  { value: "system",   label: "System" },
];

function moduleDisplayLabel(mod: string): string {
  if (!mod) return "—";
  if (mod.startsWith("claim"))    return "Claims";
  if (mod.startsWith("recruit"))  return "Recruiting";
  if (mod.startsWith("dispatch")) return "Dispatch";
  if (mod.startsWith("vendor"))   return "Vendor";
  if (mod.startsWith("direct"))   return "Drivers";
  if (mod.startsWith("complia") || mod.startsWith("driver")) return "Drivers";
  if (mod.startsWith("system") || mod.startsWith("platform")) return "System";
  return mod.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function ChannelBadge({ channel }: { channel: string }) {
  const cfg = CHANNEL_LABELS[channel] ?? { label: channel, icon: Mail, color: "" };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function StatusCell({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { icon: Minus, color: "text-muted-foreground", label: status };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function TrackCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-muted-foreground flex items-center gap-1"><Minus className="h-3 w-3" /> —</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Yes
    </span>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function CommLogsView() {
  const [search,   setSearch]   = useState("");
  const [channel,  setChannel]  = useState("");
  const [module,   setModule]   = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [page,     setPage]     = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  // committed filters (only applied on explicit search or filter change)
  const [appliedSearch,   setAppliedSearch]   = useState("");
  const [appliedChannel,  setAppliedChannel]  = useState("");
  const [appliedModule,   setAppliedModule]   = useState("");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo,   setAppliedDateTo]   = useState("");

  function applyFilters() {
    setAppliedSearch(search);
    setAppliedChannel(channel);
    setAppliedModule(module);
    setAppliedDateFrom(dateFrom);
    setAppliedDateTo(dateTo);
    setPage(1);
  }

  function resetFilters() {
    setSearch(""); setChannel(""); setModule(""); setDateFrom(""); setDateTo("");
    setAppliedSearch(""); setAppliedChannel(""); setAppliedModule(""); setAppliedDateFrom(""); setAppliedDateTo("");
    setPage(1);
  }

  const qs = new URLSearchParams({
    page: String(page),
    ...(appliedSearch   ? { search:   appliedSearch   } : {}),
    ...(appliedChannel  ? { channel:  appliedChannel  } : {}),
    ...(appliedModule   ? { module:   appliedModule   } : {}),
    ...(appliedDateFrom ? { dateFrom: appliedDateFrom } : {}),
    ...(appliedDateTo   ? { dateTo:   appliedDateTo   } : {}),
  }).toString();

  const { data, isLoading, isFetching, refetch } = useQuery<CommLogsResponse>({
    queryKey: ["/api/admin/comm-logs", qs],
    queryFn: async () => {
      const r = await fetch(`/api/admin/comm-logs?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load logs");
      return r.json();
    },
  });

  const rows     = data?.rows     ?? [];
  const total    = data?.total    ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = !!(appliedSearch || appliedChannel || appliedModule || appliedDateFrom || appliedDateTo);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && applyFilters()}
            placeholder="Search driver, recipient, subject…"
            className="pl-8 h-9 text-sm"
            data-testid="input-comm-logs-search"
          />
        </div>

        <Select value={channel} onValueChange={v => { setChannel(v === "all" ? "" : v); }}>
          <SelectTrigger className="w-32 h-9 text-sm" data-testid="select-comm-logs-channel">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="voice">Voice</SelectItem>
          </SelectContent>
        </Select>

        <Select value={module} onValueChange={v => { setModule(v === "all" ? "" : v); }}>
          <SelectTrigger className="w-36 h-9 text-sm" data-testid="select-comm-logs-module">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            {MODULE_FILTER_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value || "all"}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-9 text-sm w-36"
            data-testid="input-comm-logs-date-from"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-9 text-sm w-36"
            data-testid="input-comm-logs-date-to"
          />
        </div>

        <Button size="default" onClick={applyFilters} data-testid="button-comm-logs-apply">
          <Search className="h-3.5 w-3.5 mr-1.5" />
          Filter
        </Button>

        {hasFilters && (
          <Button variant="ghost" size="default" onClick={resetFilters} data-testid="button-comm-logs-reset">
            Clear
          </Button>
        )}

        <Button
          variant="outline"
          size="default"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-comm-logs-refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Summary line */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString()} communication{total !== 1 ? "s" : ""}
          {hasFilters ? " matching filters" : " total"}
        </p>
      )}

      {/* Table */}
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b">
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-36">Date / Time</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-32">Sender</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-36">Recipient</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-20">Type</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Subject / Content</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-20">Module</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-24">Delivery</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-16">
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" />Open</span>
              </th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-16">
                <span className="flex items-center gap-1"><MousePointer2 className="h-3 w-3" />Click</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {hasFilters ? "No communications match the current filters." : "No communication logs found."}
                </td>
              </tr>
            )}
            {!isLoading && rows.map(row => {
              const isOpen = expanded === row.id;
              return (
                <>
                  <tr
                    key={row.id}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                    data-testid={`row-comm-log-${row.id}`}
                  >
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {row.sent_at ? formatDateTime(row.sent_at) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs font-medium truncate max-w-[120px]">{row.sender_name}</div>
                      {row.sender_email && (
                        <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{row.sender_email}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs font-medium truncate max-w-[130px]">
                        {row.recipient_name || row.recipient_email || row.recipient_phone || "—"}
                      </div>
                      {row.recipient_name && row.recipient_email && (
                        <div className="text-[10px] text-muted-foreground truncate max-w-[130px]">{row.recipient_email}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ChannelBadge channel={row.channel} />
                    </td>
                    <td className="px-3 py-2.5 max-w-[240px]">
                      {row.subject ? (
                        <div className="text-xs font-medium truncate">{row.subject}</div>
                      ) : null}
                      <div className="text-[10px] text-muted-foreground truncate">
                        {row.body_preview || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] text-muted-foreground">{moduleDisplayLabel(row.context_module)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusCell status={row.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <TrackCell value={row.opened_at} />
                    </td>
                    <td className="px-3 py-2.5">
                      <TrackCell value={row.clicked_at} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${row.id}-expanded`} className="bg-muted/20">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                          <div className="flex gap-2">
                            <span className="text-muted-foreground w-20 shrink-0">Driver:</span>
                            <span className="font-medium">{row.driver_name || "—"}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-muted-foreground w-20 shrink-0">Module:</span>
                            <span className="font-medium">{row.context_module || "—"}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-muted-foreground w-20 shrink-0">To:</span>
                            <span className="font-medium">{row.recipient_email || row.recipient_phone || "—"}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-muted-foreground w-20 shrink-0">Opened:</span>
                            <span className="font-medium">{row.opened_at ? formatDateTime(row.opened_at) : "Not tracked"}</span>
                          </div>
                          {row.subject && (
                            <div className="flex gap-2 col-span-2">
                              <span className="text-muted-foreground w-20 shrink-0">Subject:</span>
                              <span className="font-medium">{row.subject}</span>
                            </div>
                          )}
                          <div className="flex gap-2 col-span-2 mt-1">
                            <span className="text-muted-foreground w-20 shrink-0">Preview:</span>
                            <span className="font-mono text-[10px] text-muted-foreground bg-muted/40 px-2 py-1 rounded-md flex-1">
                              {row.body_preview || "—"}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} ({total.toLocaleString()} records)
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="default"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              data-testid="button-comm-logs-prev"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="default"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              data-testid="button-comm-logs-next"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
