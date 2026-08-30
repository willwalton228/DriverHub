import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AudienceTagBadges } from "@/components/recruiting/AudienceStrategyTagger";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Share2,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Clock,
  PauseCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileText,
  Wand2,
  Eye,
  RotateCcw,
  ListChecks,
  SendHorizonal,
  AlertTriangle,
  Rocket,
  CircleDot,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNELS = [
  "Indeed",
  "Craigslist",
  "Facebook",
  "Facebook Groups",
  "Monster",
  "Instagram",
  "TikTok",
  "LinkedIn",
  "ZipRecruiter",
  "Company Website",
  "Other",
] as const;

const MVP_CHANNELS = ["Indeed", "Craigslist", "Facebook", "Facebook Groups", "Monster"] as const;

type Channel = (typeof CHANNELS)[number];
type PostingStatus = "planned" | "launched" | "paused" | "ended";
type PublishStatus = "draft" | "ready" | "published" | "failed";

interface ChannelPosting {
  id: string;
  requisitionId: string;
  channel: string;
  status: PostingStatus;
  launchDate?: string | null;
  endDate?: string | null;
  postingUrl?: string | null;
  notes?: string | null;
  budgetAmount?: string | null;
  adBody?: string | null;
  adReviewedAt?: string | null;
  publishStatus: PublishStatus;
  publishedAt?: string | null;
  publishError?: string | null;
  publishAttempts: number;
  createdAt: string;
  updatedAt: string;
}

interface ChannelDistributionPlannerProps {
  requisitionId: string;
  audienceStrategyTags?: string[];
}

// ── Metadata ──────────────────────────────────────────────────────────────────

const OP_STATUS_META: Record<PostingStatus, { label: string; icon: React.ReactNode; badgeClass: string }> = {
  planned: {
    label: "Planned",
    icon: <Clock className="h-3.5 w-3.5" />,
    badgeClass: "bg-muted text-muted-foreground",
  },
  launched: {
    label: "Live",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  paused: {
    label: "Paused",
    icon: <PauseCircle className="h-3.5 w-3.5" />,
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  ended: {
    label: "Ended",
    icon: <XCircle className="h-3.5 w-3.5" />,
    badgeClass: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
};

const PUB_STATUS_META: Record<PublishStatus, { label: string; icon: React.ReactNode; badgeClass: string }> = {
  draft: {
    label: "Draft",
    icon: <CircleDot className="h-3 w-3" />,
    badgeClass: "bg-muted text-muted-foreground",
  },
  ready: {
    label: "Ready to Publish",
    icon: <Rocket className="h-3 w-3" />,
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  published: {
    label: "Published",
    icon: <CheckCircle2 className="h-3 w-3" />,
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  failed: {
    label: "Failed",
    icon: <AlertTriangle className="h-3 w-3" />,
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
};

const CHANNEL_ABBREV: Record<string, string> = {
  "Indeed": "IN",
  "Craigslist": "CL",
  "Facebook": "FB",
  "Facebook Groups": "FG",
  "Monster": "MN",
  "Instagram": "IG",
  "TikTok": "TK",
  "LinkedIn": "LI",
  "ZipRecruiter": "ZR",
  "Company Website": "WB",
  "Other": "OT",
};

interface PostingFormValues {
  channel: Channel | "";
  status: PostingStatus;
  launchDate: string;
  endDate: string;
  postingUrl: string;
  notes: string;
  budgetAmount: string;
}

const EMPTY_FORM: PostingFormValues = {
  channel: "",
  status: "planned",
  launchDate: "",
  endDate: "",
  postingUrl: "",
  notes: "",
  budgetAmount: "",
};

// ── Ad Review sub-panel ───────────────────────────────────────────────────────

function AdReviewPanel({ posting, queryKey }: { posting: ChannelPosting; queryKey: unknown[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adText, setAdText] = useState(posting.adBody ?? "");
  const [preview, setPreview] = useState(false);
  const [open, setOpen] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (body: string) =>
      apiRequest("PATCH", `/api/recruiting/channel-postings/${posting.id}`, { adBody: body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: `${posting.channel} ad saved` });
    },
    onError: () => toast({ title: "Failed to save ad", variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: (mark: boolean) =>
      apiRequest("PATCH", `/api/recruiting/channel-postings/${posting.id}`, { markReviewed: mark }),
    onSuccess: (_data, mark) => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: mark ? `${posting.channel} ad marked as reviewed` : "Review cleared" });
    },
    onError: () => toast({ title: "Failed to update review status", variant: "destructive" }),
  });

  const autoPopulateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting/channel-postings/${posting.id}/auto-populate-ad`, {}),
    onSuccess: (data: any) => {
      setAdText(data?.adBody ?? "");
      queryClient.invalidateQueries({ queryKey });
      toast({ title: `Ad body auto-filled for ${posting.channel}` });
    },
    onError: () => toast({ title: "Auto-fill failed — no job ad draft found", variant: "destructive" }),
  });

  const isReviewed = !!posting.adReviewedAt;
  const isDirty = adText !== (posting.adBody ?? "");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid={`button-toggle-ad-review-${posting.id}`}
        >
          <FileText className="h-3 w-3" />
          {isReviewed ? (
            <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Ad Reviewed
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {posting.adBody ? "Ad Ready — Pending Review" : "No Ad Body"}
            </span>
          )}
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 space-y-2 border rounded-md p-3 bg-background">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {posting.channel} Ad Copy
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                data-testid={`button-autofill-ad-${posting.id}`}
                disabled={autoPopulateMutation.isPending}
                onClick={() => autoPopulateMutation.mutate()}
              >
                {autoPopulateMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Wand2 className="h-3.5 w-3.5" />}
                Auto-fill
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-testid={`button-toggle-preview-ad-${posting.id}`}
                onClick={() => setPreview(v => !v)}
              >
                <Eye className="h-3.5 w-3.5" />
                {preview ? "Edit" : "Preview"}
              </Button>
            </div>
          </div>

          {preview ? (
            <div
              className="min-h-[100px] max-h-52 overflow-y-auto p-3 bg-muted/40 rounded-md text-sm whitespace-pre-wrap"
              data-testid={`preview-ad-body-${posting.id}`}
            >
              {adText || <span className="text-muted-foreground italic">No ad body yet.</span>}
            </div>
          ) : (
            <Textarea
              data-testid={`textarea-ad-body-${posting.id}`}
              value={adText}
              onChange={e => setAdText(e.target.value)}
              rows={5}
              placeholder={`Write ${posting.channel}-specific copy or use Auto-fill…`}
              className="text-sm resize-y"
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              {isDirty && (
                <Button size="sm" variant="ghost" onClick={() => setAdText(posting.adBody ?? "")}
                  data-testid={`button-reset-ad-${posting.id}`}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                data-testid={`button-save-ad-${posting.id}`}
                disabled={saveMutation.isPending || !isDirty}
                onClick={() => saveMutation.mutate(adText)}
              >
                {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Ad
              </Button>
            </div>
            {isReviewed ? (
              <Button size="sm" variant="ghost" className="text-muted-foreground"
                data-testid={`button-unreview-ad-${posting.id}`}
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate(false)}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Clear Review
              </Button>
            ) : (
              <Button
                size="sm"
                data-testid={`button-mark-reviewed-${posting.id}`}
                disabled={reviewMutation.isPending || !adText.trim()}
                onClick={() => reviewMutation.mutate(true)}
              >
                {reviewMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                Mark Reviewed
              </Button>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Publish Status sub-panel ──────────────────────────────────────────────────

interface PublishPanelProps {
  posting: ChannelPosting;
  queryKey: unknown[];
  onPublish: (posting: ChannelPosting) => void;
}

function PublishStatusPanel({ posting, queryKey, onPublish }: PublishPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const markReadyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruiting/channel-postings/${posting.id}/mark-ready`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: `${posting.channel} marked as ready to publish` });
    },
    onError: (err: any) => toast({ title: err?.message || "Must review ad first", variant: "destructive" }),
  });

  const retryMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/recruiting/channel-postings/${posting.id}/retry`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: `${posting.channel} reset — ready to retry` });
    },
    onError: () => toast({ title: "Failed to reset channel", variant: "destructive" }),
  });

  const meta = PUB_STATUS_META[posting.publishStatus] ?? PUB_STATUS_META.draft;
  const ps = posting.publishStatus;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {/* Publish status badge */}
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badgeClass}`}
        data-testid={`badge-publish-status-${posting.id}`}
      >
        {meta.icon}
        {meta.label}
        {posting.publishAttempts > 0 && ps !== "published" && (
          <span className="opacity-60">· {posting.publishAttempts} attempt{posting.publishAttempts !== 1 ? "s" : ""}</span>
        )}
      </span>

      {/* Published timestamp */}
      {ps === "published" && posting.publishedAt && (
        <span className="text-xs text-muted-foreground">
          Published {new Date(posting.publishedAt).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric"
          })}
        </span>
      )}

      {/* Actions per state */}
      {ps === "draft" && (
        <Button
          size="sm"
          variant="outline"
          data-testid={`button-mark-ready-${posting.id}`}
          disabled={markReadyMutation.isPending || !posting.adReviewedAt}
          title={!posting.adReviewedAt ? "Review the ad first" : undefined}
          onClick={() => markReadyMutation.mutate()}
        >
          {markReadyMutation.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Rocket className="h-3.5 w-3.5" />}
          Mark Ready
        </Button>
      )}

      {ps === "ready" && (
        <Button
          size="sm"
          data-testid={`button-publish-channel-${posting.id}`}
          onClick={() => onPublish(posting)}
        >
          <SendHorizonal className="h-3.5 w-3.5" />
          Publish
        </Button>
      )}

      {ps === "failed" && (
        <>
          <Button
            size="sm"
            variant="outline"
            data-testid={`button-retry-channel-${posting.id}`}
            disabled={retryMutation.isPending}
            onClick={() => retryMutation.mutate()}
          >
            {retryMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RotateCcw className="h-3.5 w-3.5" />}
            Retry
          </Button>
          {posting.publishError && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {posting.publishError}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ── Publish Confirm Dialog ────────────────────────────────────────────────────

interface PublishConfirmDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channels: ChannelPosting[];  // 1 for single, many for bulk
  requisitionId: string;
  queryKey: unknown[];
  isBulk?: boolean;
}

function PublishConfirmDialog({ open, onOpenChange, channels, requisitionId, queryKey, isBulk }: PublishConfirmDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [postingUrl, setPostingUrl] = useState("");

  const singlePublishMutation = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) =>
      apiRequest("POST", `/api/recruiting/channel-postings/${id}/publish`, { postingUrl: url || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: `${channels[0]?.channel} published successfully` });
      onOpenChange(false);
      setPostingUrl("");
    },
    onError: () => toast({ title: "Publish failed", variant: "destructive" }),
  });

  const bulkPublishMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/recruiting/requisitions/${requisitionId}/publish-all-ready`, {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: `${data?.count ?? channels.length} channel${(data?.count ?? 2) !== 1 ? "s" : ""} published` });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Bulk publish failed", variant: "destructive" }),
  });

  const isPending = singlePublishMutation.isPending || bulkPublishMutation.isPending;
  const isReady = isBulk
    ? channels.length > 0
    : (channels[0]?.publishStatus === "ready" || channels[0]?.publishStatus === "draft");

  function handleConfirm() {
    if (isBulk) {
      bulkPublishMutation.mutate();
    } else if (channels[0]) {
      singlePublishMutation.mutate({ id: channels[0].id, url: postingUrl });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setPostingUrl(""); }}>
      <DialogContent data-testid="dialog-publish-confirm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SendHorizonal className="h-4 w-4 text-primary" />
            {isBulk ? `Publish ${channels.length} Channel${channels.length !== 1 ? "s" : ""}` : `Publish — ${channels[0]?.channel}`}
          </DialogTitle>
          <DialogDescription>
            {isBulk
              ? "Confirm you have posted the ad on all selected channels. This will mark them as published and live."
              : "Confirm you have posted the ad on this channel. The posting will be marked as published and live."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Channel list for bulk */}
          {isBulk && channels.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channels to publish</span>
              <div className="flex flex-wrap gap-1.5">
                {channels.map(ch => (
                  <span key={ch.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    {CHANNEL_ABBREV[ch.channel] ?? ch.channel.slice(0, 2).toUpperCase()} {ch.channel}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Posting URL — only for single publish */}
          {!isBulk && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-posting-url">
                Posting URL <span className="text-muted-foreground text-xs font-normal">(optional)</span>
              </Label>
              <Input
                id="confirm-posting-url"
                type="url"
                data-testid="input-confirm-posting-url"
                placeholder="https://…"
                value={postingUrl}
                onChange={e => setPostingUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Paste the live URL after posting so recruiters can link directly to it.
              </p>
            </div>
          )}

          {/* Manual confirmation note */}
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Manual confirmation</p>
            <p>
              This confirms you have manually posted the ad. Automated API integrations (Indeed, etc.) can be added later without changing this workflow.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            data-testid="button-confirm-publish"
            disabled={isPending || !isReady}
            onClick={handleConfirm}
          >
            {isPending
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Publishing…</>
              : <><SendHorizonal className="h-3.5 w-3.5 mr-1.5" />Confirm Published</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Channel Picker ───────────────────────────────────────────────────────

interface BulkPickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  usedChannels: Set<string>;
  onConfirm: (channels: string[]) => void;
  isPending: boolean;
}

function BulkChannelPicker({ open, onOpenChange, usedChannels, onConfirm, isPending }: BulkPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(ch: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(ch) ? next.delete(ch) : next.add(ch);
      return next;
    });
  }

  function selectAll(channels: readonly string[]) {
    setSelected(prev => {
      const next = new Set(prev);
      channels.forEach(c => { if (!usedChannels.has(c)) next.add(c); });
      return next;
    });
  }

  const available = CHANNELS.filter(c => !usedChannels.has(c));
  const mvpAvailable = MVP_CHANNELS.filter(c => !usedChannels.has(c));
  const additionalAvailable = available.filter(c => !MVP_CHANNELS.includes(c as any));

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSelected(new Set()); }}>
      <DialogContent data-testid="dialog-bulk-channel-picker">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            Select Posting Channels
          </DialogTitle>
          <DialogDescription>
            Choose one or more channels. A separate ad review and publish entry will be created for each.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {mvpAvailable.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Top Channels</span>
                <Button size="sm" variant="ghost" className="text-xs h-auto py-0.5 px-1.5"
                  onClick={() => selectAll(mvpAvailable)} data-testid="button-select-all-mvp">
                  Select all
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {mvpAvailable.map(ch => (
                  <label key={ch}
                    className="flex items-center gap-2.5 rounded-md border p-2.5 cursor-pointer hover-elevate"
                    data-testid={`checkbox-channel-${ch.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <Checkbox checked={selected.has(ch)} onCheckedChange={() => toggle(ch)} id={`ch-${ch}`} />
                    <div className="flex items-center gap-2">
                      <span className="h-7 w-7 rounded bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                        {CHANNEL_ABBREV[ch] ?? ch.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium">{ch}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {additionalAvailable.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Additional Channels</span>
              <div className="grid grid-cols-2 gap-2">
                {additionalAvailable.map(ch => (
                  <label key={ch}
                    className="flex items-center gap-2.5 rounded-md border p-2.5 cursor-pointer hover-elevate"
                    data-testid={`checkbox-channel-${ch.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <Checkbox checked={selected.has(ch)} onCheckedChange={() => toggle(ch)} id={`ch-${ch}`} />
                    <div className="flex items-center gap-2">
                      <span className="h-7 w-7 rounded bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                        {CHANNEL_ABBREV[ch] ?? ch.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium">{ch}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {available.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">All channels have been added.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button
            data-testid="button-confirm-bulk-channels"
            disabled={isPending || selected.size === 0}
            onClick={() => onConfirm(Array.from(selected))}
          >
            {isPending
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Adding…</>
              : `Add ${selected.size > 0 ? selected.size : ""} Channel${selected.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ChannelDistributionPlanner({ requisitionId, audienceStrategyTags }: ChannelDistributionPlannerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [editingPosting, setEditingPosting] = useState<ChannelPosting | null>(null);
  const [form, setForm] = useState<PostingFormValues>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // Publish dialog state
  const [publishTarget, setPublishTarget] = useState<ChannelPosting | null>(null);
  const [bulkPublishOpen, setBulkPublishOpen] = useState(false);

  const queryKey = ["/api/recruiting/requisitions", requisitionId, "channel-postings"];

  const { data: postings = [], isLoading } = useQuery<ChannelPosting[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/recruiting/requisitions/${requisitionId}/channel-postings`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: (data: Omit<PostingFormValues, "channel"> & { channel: Channel }) =>
      apiRequest("POST", `/api/recruiting/requisitions/${requisitionId}/channel-postings`, {
        channel: data.channel,
        status: data.status,
        launchDate: data.launchDate || null,
        endDate: data.endDate || null,
        postingUrl: data.postingUrl || null,
        notes: data.notes || null,
        budgetAmount: data.budgetAmount ? parseFloat(data.budgetAmount) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Channel added" });
      setEditDialogOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to add channel", variant: "destructive" }),
  });

  const bulkAddMutation = useMutation({
    mutationFn: (channels: string[]) =>
      apiRequest("POST", `/api/recruiting/requisitions/${requisitionId}/channel-postings/bulk`, { channels }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: `${data?.count ?? "Multiple"} channel${(data?.count ?? 2) !== 1 ? "s" : ""} added` });
      setBulkPickerOpen(false);
    },
    onError: () => toast({ title: "Failed to add channels", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PostingFormValues> }) =>
      apiRequest("PATCH", `/api/recruiting/channel-postings/${id}`, {
        status: data.status,
        launchDate: data.launchDate || null,
        endDate: data.endDate || null,
        postingUrl: data.postingUrl || null,
        notes: data.notes || null,
        budgetAmount: data.budgetAmount ? parseFloat(data.budgetAmount) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Channel updated" });
      setEditDialogOpen(false);
      setEditingPosting(null);
      setForm(EMPTY_FORM);
    },
    onError: () => toast({ title: "Failed to update channel", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/recruiting/channel-postings/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Channel removed" });
      setDeleteConfirmId(null);
    },
    onError: () => toast({ title: "Failed to remove channel", variant: "destructive" }),
  });

  const usedChannels = new Set(postings.map(p => p.channel));
  const availableChannels = CHANNELS.filter(c => !usedChannels.has(c));
  const readyChannels = postings.filter(p => p.publishStatus === "ready");
  const publishedCount = postings.filter(p => p.publishStatus === "published").length;
  const failedCount = postings.filter(p => p.publishStatus === "failed").length;

  function openEdit(posting: ChannelPosting) {
    setEditingPosting(posting);
    setForm({
      channel: posting.channel as Channel,
      status: posting.status,
      launchDate: posting.launchDate?.slice(0, 10) || "",
      endDate: posting.endDate?.slice(0, 10) || "",
      postingUrl: posting.postingUrl || "",
      notes: posting.notes || "",
      budgetAmount: posting.budgetAmount || "",
    });
    setEditDialogOpen(true);
  }

  function submitForm() {
    if (editingPosting) {
      updateMutation.mutate({ id: editingPosting.id, data: form });
    } else {
      if (!form.channel) return;
      addMutation.mutate(form as PostingFormValues & { channel: Channel });
    }
  }

  const STATUS_CYCLE: PostingStatus[] = ["planned", "launched", "paused", "ended"];
  function cycleStatus(posting: ChannelPosting) {
    const idx = STATUS_CYCLE.indexOf(posting.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    apiRequest("PATCH", `/api/recruiting/channel-postings/${posting.id}`, { status: next })
      .then(() => queryClient.invalidateQueries({ queryKey }))
      .catch(() => toast({ title: "Failed to update status", variant: "destructive" }));
  }

  const isPending = addMutation.isPending || updateMutation.isPending;
  const reviewedCount = postings.filter(p => p.adReviewedAt).length;

  return (
    <>
      <Card data-testid="card-channel-distribution-planner">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Share2 className="h-4 w-4 text-primary" />
              Channel Distribution Plan
              {postings.length > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                  {postings.length} channel{postings.length !== 1 ? "s" : ""}
                  {publishedCount > 0 && <span className="text-green-700 dark:text-green-400"> · {publishedCount} published</span>}
                  {readyChannels.length > 0 && <span className="text-blue-700 dark:text-blue-400"> · {readyChannels.length} ready</span>}
                  {failedCount > 0 && <span className="text-red-600 dark:text-red-400"> · {failedCount} failed</span>}
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {readyChannels.length > 0 && (
                <Button
                  size="sm"
                  data-testid="button-publish-all-ready"
                  onClick={() => setBulkPublishOpen(true)}
                >
                  <SendHorizonal className="h-3.5 w-3.5 mr-1.5" />
                  Publish All Ready ({readyChannels.length})
                </Button>
              )}
              {availableChannels.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="button-add-channels"
                  onClick={() => setBulkPickerOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Channels
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => setExpanded(v => !v)}
                data-testid="button-toggle-channel-planner">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <CardDescription>
            Select channels, write channel-specific ad copy, review, and publish. Failures are visible and retryable.
          </CardDescription>
          {audienceStrategyTags && audienceStrategyTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground">Target audiences:</span>
              <AudienceTagBadges tags={audienceStrategyTags} />
            </div>
          )}
        </CardHeader>

        {expanded && (
          <CardContent className="space-y-3">
            {isLoading && (
              <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading channels…</span>
              </div>
            )}

            {!isLoading && postings.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <Share2 className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">No channels selected yet</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pick channels, write ad copy, and publish when ready.
                  </p>
                </div>
                <Button size="sm" onClick={() => setBulkPickerOpen(true)} data-testid="button-add-channel-empty">
                  <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                  Select Channels
                </Button>
              </div>
            )}

            {!isLoading && postings.length > 0 && (
              <div className="space-y-2">
                {postings.map((posting) => {
                  const opMeta = OP_STATUS_META[posting.status] ?? OP_STATUS_META.planned;
                  return (
                    <div
                      key={posting.id}
                      className="rounded-md border p-3 space-y-2"
                      data-testid={`card-channel-posting-${posting.id}`}
                    >
                      {/* Row: identity + status badges + actions */}
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {CHANNEL_ABBREV[posting.channel] ?? posting.channel.slice(0, 2).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium" data-testid={`text-channel-name-${posting.id}`}>
                              {posting.channel}
                            </span>
                            {/* Operational status — click to cycle */}
                            <button
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover-elevate ${opMeta.badgeClass}`}
                              onClick={() => cycleStatus(posting)}
                              title="Click to cycle operational status"
                              data-testid={`badge-status-${posting.id}`}
                            >
                              {opMeta.icon}
                              {opMeta.label}
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                            {posting.launchDate && (
                              <span>Launch: {new Date(posting.launchDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</span>
                            )}
                            {posting.endDate && (
                              <span>End: {new Date(posting.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</span>
                            )}
                            {posting.budgetAmount && (
                              <span>Budget: ${parseFloat(posting.budgetAmount).toLocaleString()}</span>
                            )}
                          </div>

                          {posting.postingUrl && (
                            <a href={posting.postingUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                              data-testid={`link-posting-url-${posting.id}`}
                            >
                              <ExternalLink className="h-3 w-3" />
                              View posting
                            </a>
                          )}
                          {posting.notes && <p className="text-xs text-muted-foreground italic">{posting.notes}</p>}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(posting)}
                            data-testid={`button-edit-channel-${posting.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteConfirmId(posting.id)}
                            data-testid={`button-delete-channel-${posting.id}`}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {/* Nested panels */}
                      <div className="pl-12 space-y-2">
                        <AdReviewPanel posting={posting} queryKey={queryKey} />
                        <PublishStatusPanel
                          posting={posting}
                          queryKey={queryKey}
                          onPublish={(p) => setPublishTarget(p)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Progress footer */}
            {postings.length > 0 && (
              <div className="flex flex-wrap items-center gap-4 pt-1 border-t text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {reviewedCount}/{postings.length} reviewed
                </span>
                <span className="flex items-center gap-1">
                  <SendHorizonal className="h-3.5 w-3.5" />
                  {publishedCount}/{postings.length} published
                </span>
                {failedCount > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {failedCount} failed — retry required
                  </span>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Single publish confirm */}
      <PublishConfirmDialog
        open={!!publishTarget}
        onOpenChange={(v) => !v && setPublishTarget(null)}
        channels={publishTarget ? [publishTarget] : []}
        requisitionId={requisitionId}
        queryKey={queryKey}
        isBulk={false}
      />

      {/* Bulk publish confirm */}
      <PublishConfirmDialog
        open={bulkPublishOpen}
        onOpenChange={setBulkPublishOpen}
        channels={readyChannels}
        requisitionId={requisitionId}
        queryKey={queryKey}
        isBulk={true}
      />

      {/* Bulk channel picker */}
      <BulkChannelPicker
        open={bulkPickerOpen}
        onOpenChange={setBulkPickerOpen}
        usedChannels={usedChannels}
        onConfirm={(channels) => bulkAddMutation.mutate(channels)}
        isPending={bulkAddMutation.isPending}
      />

      {/* Edit details dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) { setEditingPosting(null); setForm(EMPTY_FORM); }
        }}
      >
        <DialogContent data-testid="dialog-channel-posting">
          <DialogHeader>
            <DialogTitle>{editingPosting ? `Edit — ${editingPosting.channel}` : "Add Channel"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {!editingPosting && (
              <div className="space-y-1.5">
                <Label htmlFor="posting-channel">Channel <span className="text-destructive">*</span></Label>
                <Select value={form.channel} onValueChange={(v) => setForm(f => ({ ...f, channel: v as Channel }))}>
                  <SelectTrigger id="posting-channel" data-testid="select-posting-channel">
                    <SelectValue placeholder="Select a channel…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableChannels.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="posting-status">Operational Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as PostingStatus }))}>
                <SelectTrigger id="posting-status" data-testid="select-posting-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="launched">Live</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="ended">Ended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="posting-launch-date">Launch Date</Label>
                <Input id="posting-launch-date" type="date" data-testid="input-posting-launch-date"
                  value={form.launchDate} onChange={e => setForm(f => ({ ...f, launchDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="posting-end-date">End Date</Label>
                <Input id="posting-end-date" type="date" data-testid="input-posting-end-date"
                  value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="posting-url">Posting URL</Label>
              <Input id="posting-url" type="url" data-testid="input-posting-url" placeholder="https://…"
                value={form.postingUrl} onChange={e => setForm(f => ({ ...f, postingUrl: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="posting-budget">Budget (USD, optional)</Label>
              <Input id="posting-budget" type="number" min={0} step={1} data-testid="input-posting-budget"
                placeholder="e.g., 500" value={form.budgetAmount}
                onChange={e => setForm(f => ({ ...f, budgetAmount: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="posting-notes">Notes</Label>
              <Textarea id="posting-notes" data-testid="input-posting-notes" rows={3}
                placeholder="Campaign details, targeting notes…"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isPending}>Cancel</Button>
            <Button data-testid="button-save-channel-posting"
              disabled={isPending || (!editingPosting && !form.channel)} onClick={submitForm}>
              {isPending
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
                : editingPosting ? "Save Changes" : "Add Channel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent data-testid="dialog-delete-channel-confirm">
          <DialogHeader>
            <DialogTitle>Remove Channel</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to remove this channel? Any saved ad copy and publish history will also be deleted.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" data-testid="button-confirm-delete-channel"
              disabled={deleteMutation.isPending}
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}>
              {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
