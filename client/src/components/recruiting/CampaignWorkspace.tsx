import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CampaignMarketIntelligencePanel } from "./CampaignMarketIntelligencePanel";
import { RecruitingPlanPanel } from "./RecruitingPlanPanel";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, ArrowLeft, ArrowRight, CheckCircle2, Rocket, FileText,
  Send, Radio, Eye, RefreshCw, AlertTriangle,
  Users, CalendarDays,
  Zap,
} from "lucide-react";
import { format } from "date-fns";

// ── Constants ────────────────────────────────────────────────────────────────

const RECRUITING_CHANNELS = [
  "Indeed", "Craigslist", "Facebook", "Facebook Groups",
  "Instagram", "TikTok", "LinkedIn", "ZipRecruiter",
  "Company Website", "Other",
] as const;
type RecruitingChannel = (typeof RECRUITING_CHANNELS)[number];

const CHANNEL_ICONS: Record<string, string> = {
  Indeed: "IN", Craigslist: "CL", Facebook: "FB", "Facebook Groups": "FG",
  Instagram: "IG", TikTok: "TK", LinkedIn: "LI", ZipRecruiter: "ZR",
  "Company Website": "WB", Other: "OT",
};

const STEPS = [
  { id: 1, label: "Campaign Summary" },
  { id: 2, label: "Ad Template"     },
  { id: 3, label: "Select Channels" },
  { id: 4, label: "Review Ads"      },
  { id: 5, label: "Publish"         },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeDate(val: any, withTime = false) {
  if (!val) return "—";
  try {
    const d = new Date(val);
    return withTime
      ? d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

function DetailRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground shrink-0 w-36 text-right text-xs pt-0.5">{label}:</span>
      <span className="text-foreground font-medium">{value ?? "—"}</span>
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {STEPS.map((step) => (
        <div key={step.id} className="flex items-center gap-1.5">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
            step.id === current
              ? "bg-primary text-primary-foreground"
              : step.id < current
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-muted text-muted-foreground"
          }`}>
            {step.id < current
              ? <CheckCircle2 className="h-3 w-3 shrink-0" />
              : <span className="tabular-nums">{step.id}</span>}
            <span className="hidden sm:inline">{step.label}</span>
          </div>
          {step.id < STEPS.length && (
            <div className={`h-px w-4 ${step.id < current ? "bg-green-400" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Campaign Summary ──────────────────────────────────────────────────

function Step1Summary({ request, requisition, onNext }: { request: any; requisition: any; onNext: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Rocket className="h-4 w-4 text-primary" />Campaign Overview
        </h3>
        <div className="space-y-2">
          <DetailRow label="Campaign Title"   value={requisition?.title} />
          <DetailRow label="Market"           value={request?.market} />
          <DetailRow label="Dealership"       value={request?.dealershipName} />
          <DetailRow label="Location"         value={request?.location || request?.address} />
          <DetailRow label="Campaign Type"    value={request?.campaignType ? request.campaignType.charAt(0).toUpperCase() + request.campaignType.slice(1) : null} />
        </div>
      </div>
      <Separator />
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-primary" />Driver Requirements
        </h3>
        <div className="space-y-2">
          <DetailRow label="Driver Type"           value={request?.programType || null} />
          <DetailRow label="Vehicle / License Class" value={request?.vehicleLicenseClass || null} />
          <DetailRow label="Classification"       value={request?.driverClassification} />
          <DetailRow label="Employment Type"      value={request?.employmentType || null} />
          <DetailRow label="Target Drivers"       value={requisition?.targetHires ?? request?.targetDriverCount} />
          <DetailRow label="Pay Rate"             value={requisition?.compensationMin != null ? `$${Number(requisition.compensationMin).toFixed(2)}` : request?.payRate ? `$${Number(request.payRate).toFixed(2)}` : null} />
          <DetailRow label="Schedule"             value={request?.driverSchedule} />
          <DetailRow label="CDL Required"         value={requisition?.cdlRequired ? "Yes" : "No"} />
        </div>
      </div>
      <Separator />
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <CalendarDays className="h-4 w-4 text-primary" />Timeline &amp; Team
        </h3>
        <div className="space-y-2">
          <DetailRow label="Target Fill Date" value={safeDate(requisition?.targetFillDate || request?.targetDate)} />
          <DetailRow label="Recruiter"         value={request?.recruiter} />
          <DetailRow label="Cert Liaison"      value={request?.certLiaison} />
          <DetailRow label="Requisition ID"    value={requisition?.id ? <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{requisition.id.slice(0, 12)}…</code> : null} />
        </div>
      </div>
      {requisition?.description && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-2">Notes</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded-md border px-3 py-2">
              {requisition.description}
            </p>
          </div>
        </>
      )}
      <div className="flex justify-end pt-2">
        <Button onClick={onNext} data-testid="btn-ws-next-1">
          Select Ad Template <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 2: Ad Template Selection ────────────────────────────────────────────

function Step2Template({
  requisitionId, selectedTemplateId, onSelect, onBack, onNext,
}: {
  requisitionId: string;
  selectedTemplateId: string | null;
  onSelect: (id: string | null, body: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { toast } = useToast();
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewBody, setPreviewBody] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/recruiting/job-ad-templates"],
  });

  async function handlePreview(templateId: string, templateBody: string) {
    setPreviewing(templateId);
    setPreviewLoading(true);
    try {
      const res = await apiRequest("POST", "/api/recruiting/job-ad-templates/preview-body", {
        templateBody,
        requisitionId,
      });
      const data = await res.json();
      setPreviewBody(data.populated || templateBody);
    } catch {
      setPreviewBody(templateBody);
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleSelect(t: any) {
    onSelect(t.id, t.templateBody);
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading templates…
      </div>
    );
  }

  const active = templates.filter((t: any) => t.isActive !== false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select an ad template to auto-populate your channel postings. The template body uses
        <code className="mx-1 text-[11px] bg-muted px-1 rounded">{"{{placeholder}}"}</code>
        syntax that will be filled with campaign data.
      </p>

      {active.length === 0 ? (
        <div className="text-center py-10 space-y-2">
          <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">No ad templates configured.</p>
          <p className="text-xs text-muted-foreground">An admin can add templates in Recruiting Settings.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((t: any) => (
            <div
              key={t.id}
              className={`rounded-md border p-3 cursor-pointer transition-colors ${
                selectedTemplateId === t.id
                  ? "border-primary bg-primary/5"
                  : "hover-elevate"
              }`}
              onClick={() => handleSelect(t)}
              data-testid={`card-template-${t.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{t.name}</span>
                    {t.isDefault && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                    {selectedTemplateId === t.id && (
                      <Badge className="text-[10px] bg-primary/90">Selected</Badge>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                  )}
                  {(t.driverTypes?.length > 0 || t.roleType) && (
                    <div className="flex gap-1 flex-wrap mt-1">
                      {t.driverTypes?.map((dt: string) => (
                        <Badge key={dt} variant="outline" className="text-[10px]">{dt}</Badge>
                      ))}
                      {t.roleType && <Badge variant="outline" className="text-[10px]">{t.roleType}</Badge>}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); handlePreview(t.id, t.templateBody); }}
                  data-testid={`btn-preview-template-${t.id}`}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />Preview
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview panel */}
      {previewing && (
        <div className="rounded-md border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Ad Preview (populated)
            </h4>
            <Button size="sm" variant="ghost" onClick={() => setPreviewing(null)}>
              <span className="text-xs">Close</span>
            </Button>
          </div>
          {previewLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Populating…
            </div>
          ) : (
            <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
              {previewBody}
            </pre>
          )}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} data-testid="btn-ws-back-2">
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back
        </Button>
        <Button onClick={onNext} disabled={!selectedTemplateId} data-testid="btn-ws-next-2">
          Select Channels <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: Channel Selection ─────────────────────────────────────────────────

function Step3Channels({
  selectedChannels, existingPostings, onToggle, onBack, onNext, isCreating,
}: {
  selectedChannels: Set<string>;
  existingPostings: any[];
  onToggle: (ch: string) => void;
  onBack: () => void;
  onNext: () => void;
  isCreating: boolean;
}) {
  const existingSet = new Set(existingPostings.map((p: any) => p.channel));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose which channels to post this job ad on. Already-created channels are shown but can't be re-added.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {RECRUITING_CHANNELS.map((ch) => {
          const isExisting = existingSet.has(ch);
          const isChecked  = selectedChannels.has(ch) || isExisting;
          return (
            <div
              key={ch}
              className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                isExisting ? "bg-muted/30 opacity-70" : isChecked ? "border-primary bg-primary/5" : "hover-elevate"
              }`}
              onClick={() => !isExisting && onToggle(ch)}
              data-testid={`card-channel-${ch}`}
            >
              <Checkbox
                checked={isChecked}
                disabled={isExisting}
                onCheckedChange={() => !isExisting && onToggle(ch)}
                className="shrink-0"
              />
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-muted text-[10px] font-bold shrink-0">
                  {CHANNEL_ICONS[ch] || "?"}
                </span>
                <span className="text-sm font-medium truncate">{ch}</span>
              </div>
              {isExisting && <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">Added</Badge>}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} data-testid="btn-ws-back-3">
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back
        </Button>
        <Button
          onClick={onNext}
          disabled={selectedChannels.size === 0 && existingPostings.length === 0 || isCreating}
          data-testid="btn-ws-next-3"
        >
          {isCreating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 mr-1.5" />}
          Review Ads
        </Button>
      </div>
    </div>
  );
}

// ── Step 4: Review Ads ────────────────────────────────────────────────────────

function Step4ReviewAds({
  postings, onBack, onNext, onRefreshAds, onBodyChange,
}: {
  postings: any[];
  onBack: () => void;
  onNext: () => void;
  onRefreshAds: (postingId: string) => Promise<void>;
  onBodyChange: (postingId: string, body: string) => void;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleRefresh(postingId: string) {
    setLoadingId(postingId);
    try { await onRefreshAds(postingId); } finally { setLoadingId(null); }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Review and edit the auto-populated ad body for each channel before publishing.
        Each ad has been pre-filled from the selected template.
      </p>

      {postings.map((p) => (
        <div key={p.id} className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-muted text-[10px] font-bold">
                {CHANNEL_ICONS[p.channel] || "?"}
              </span>
              <span className="font-medium text-sm">{p.channel}</span>
              <Badge
                variant={p.publishStatus === "published" ? "default" : "outline"}
                className="text-[10px]"
              >
                {p.publishStatus || "draft"}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRefresh(p.id)}
              disabled={loadingId === p.id || p.publishStatus === "published"}
              data-testid={`btn-refresh-ad-${p.id}`}
            >
              {loadingId === p.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Re-populate</span>
            </Button>
          </div>
          <Textarea
            value={p.adBody || ""}
            onChange={(e) => onBodyChange(p.id, e.target.value)}
            className="text-sm min-h-[140px] font-mono"
            disabled={p.publishStatus === "published"}
            placeholder="Ad body will appear here after auto-population…"
            data-testid={`textarea-ad-body-${p.id}`}
          />
          <Separator />
        </div>
      ))}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} data-testid="btn-ws-back-4">
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back
        </Button>
        <Button onClick={onNext} data-testid="btn-ws-next-4">
          Review &amp; Publish <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 5: Publish ───────────────────────────────────────────────────────────

function Step5Publish({
  postings, onBack, onSaveAd, onPublish, publishingId, savingId,
}: {
  postings: any[];
  onBack: () => void;
  onSaveAd: (postingId: string, body: string) => Promise<void>;
  onPublish: (postingId: string) => Promise<void>;
  publishingId: string | null;
  savingId: string | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Save and publish each channel. Once published, the ad body is locked for that channel.
      </p>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full min-w-[560px] border-collapse">
          <thead className="bg-muted/40 border-b">
            <tr>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Channel</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Ad Status</th>
              <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {postings.map((p) => {
              const isPublished = p.publishStatus === "published" || p.publishStatus === "ready";
              return (
                <tr key={p.id} className="bg-background">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-muted text-[10px] font-bold">
                        {CHANNEL_ICONS[p.channel] || "?"}
                      </span>
                      <span className="font-medium text-sm">{p.channel}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={isPublished ? "default" : "outline"}
                      className={`text-[10px] ${isPublished ? "bg-green-600" : ""}`}
                    >
                      {isPublished ? "Published" : p.publishStatus || "draft"}
                    </Badge>
                    {p.publishError && (
                      <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />{p.publishError}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {!isPublished && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={savingId === p.id}
                            onClick={() => onSaveAd(p.id, p.adBody || "")}
                            data-testid={`btn-save-ad-${p.id}`}
                          >
                            {savingId === p.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : null}
                            Save
                          </Button>
                          <Button
                            size="sm"
                            disabled={publishingId === p.id || !p.adBody?.trim()}
                            onClick={() => onPublish(p.id)}
                            data-testid={`btn-publish-ad-${p.id}`}
                          >
                            {publishingId === p.id
                              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              : <Send className="h-3.5 w-3.5 mr-1.5" />}
                            Publish
                          </Button>
                        </>
                      )}
                      {isPublished && (
                        <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />Live
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {postings.every((p) => p.publishStatus === "published" || p.publishStatus === "ready") && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">All channels published!</p>
            <p className="text-xs text-green-700 dark:text-green-400">This campaign is now live across all selected channels.</p>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} data-testid="btn-ws-back-5">
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back
        </Button>
      </div>
    </div>
  );
}

// ── Main CampaignWorkspace ────────────────────────────────────────────────────

export function CampaignWorkspace({ requestId }: { requestId: string }) {
  const [, setLocation] = useLocation();
  const { toast }        = useToast();

  const [step,              setStep]              = useState(1);
  const [selectedTemplate,  setSelectedTemplate]  = useState<string | null>(null);
  const [templateBody,      setTemplateBody]      = useState("");
  const [selectedChannels,  setSelectedChannels]  = useState<Set<string>>(new Set());
  const [postingsLocal,     setPostingsLocal]      = useState<any[]>([]);
  const [publishingId,      setPublishingId]      = useState<string | null>(null);
  const [savingId,          setSavingId]          = useState<string | null>(null);
  const [isCreatingChannels, setIsCreatingChannels] = useState(false);

  // Load request to get requisitionId
  const { data: request, isLoading: reqLoading } = useQuery<any>({
    queryKey: ["/api/recruiting/requests", requestId],
    queryFn: () => fetch(`/api/recruiting/requests/${requestId}`).then((r) => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    }),
  });

  const requisitionId = request?.campaignRequisitionId;

  // Load requisition details
  const { data: requisition } = useQuery<any>({
    queryKey: ["/api/recruiting/requisitions", requisitionId],
    queryFn: () => fetch(`/api/recruiting/requisitions/${requisitionId}`).then((r) => r.json()),
    enabled: !!requisitionId,
  });

  // Load channel postings
  const { data: channelPostings = [], refetch: refetchPostings } = useQuery<any[]>({
    queryKey: ["/api/recruiting/requisitions", requisitionId, "channel-postings"],
    queryFn: () => fetch(`/api/recruiting/requisitions/${requisitionId}/channel-postings`).then((r) => r.json()),
    enabled: !!requisitionId,
  });

  // Sync channel postings to local editable state on initial load
  useEffect(() => {
    if (channelPostings.length > 0 && postingsLocal.length === 0) {
      setPostingsLocal(channelPostings);
    }
  }, [channelPostings]);

  function toggleChannel(ch: string) {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  }

  async function handleCreateChannels() {
    if (!requisitionId) return;
    const existing = new Set((channelPostings as any[]).map((p: any) => p.channel));
    const toCreate = [...selectedChannels].filter((ch) => !existing.has(ch));
    if (toCreate.length === 0) { setStep(4); return; }

    setIsCreatingChannels(true);
    try {
      const res = await apiRequest("POST", `/api/recruiting/requisitions/${requisitionId}/channel-postings/bulk`, {
        channels: toCreate,
        templateBody: templateBody || undefined,
      });
      const data = await res.json();
      // Auto-populate ads for each newly created posting
      const newPostings: any[] = data.created || [];
      for (const posting of newPostings) {
        try {
          await apiRequest("POST", `/api/recruiting/channel-postings/${posting.id}/auto-populate-ad`, {
            templateBody: templateBody || undefined,
          });
        } catch { /* non-fatal */ }
      }
      await refetchPostings();
      setStep(4);
    } catch (err: any) {
      toast({ title: "Failed to create channels", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setIsCreatingChannels(false);
    }
  }

  async function handleRefreshAd(postingId: string) {
    try {
      const res = await apiRequest("POST", `/api/recruiting/channel-postings/${postingId}/auto-populate-ad`, {
        templateBody: templateBody || undefined,
      });
      const data = await res.json();
      setPostingsLocal((prev) => prev.map((p) => p.id === postingId ? { ...p, adBody: data.adBody } : p));
    } catch (err: any) {
      toast({ title: "Re-populate failed", description: err?.message, variant: "destructive" });
    }
  }

  function handleAdBodyChange(postingId: string, body: string) {
    setPostingsLocal((prev) => prev.map((p) => p.id === postingId ? { ...p, adBody: body } : p));
  }

  async function handleSaveAd(postingId: string, body: string) {
    setSavingId(postingId);
    try {
      const res = await apiRequest("PATCH", `/api/recruiting/channel-postings/${postingId}`, { adBody: body });
      const data = await res.json();
      setPostingsLocal((prev) => prev.map((p) => p.id === postingId ? { ...p, ...data } : p));
      toast({ title: "Ad saved" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  async function handlePublish(postingId: string) {
    const p = postingsLocal.find((x) => x.id === postingId);
    if (p?.adBody?.trim()) {
      await handleSaveAd(postingId, p.adBody);
    }
    setPublishingId(postingId);
    try {
      const res = await apiRequest("POST", `/api/recruiting/channel-postings/${postingId}/publish`, {});
      const data = await res.json();
      setPostingsLocal((prev) => prev.map((p2) => p2.id === postingId ? { ...p2, ...data.posting } : p2));
      await refetchPostings();
      toast({ title: "Published", description: `Channel posting launched successfully.` });
    } catch (err: any) {
      toast({ title: "Publish failed", description: err?.message, variant: "destructive" });
    } finally {
      setPublishingId(null);
    }
  }

  // Sync postingsLocal when channelPostings changes (initial load)
  const hasInitialized = postingsLocal.length > 0;

  if (reqLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading campaign…
      </div>
    );
  }

  if (!request) {
    return (
      <div className="py-12 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mx-auto" />
        <p className="font-medium text-sm">Campaign not found</p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/recruiting/campaigns")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back to campaigns
        </Button>
      </div>
    );
  }

  if (!requisitionId) {
    return (
      <div className="py-12 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mx-auto" />
        <p className="font-medium text-sm">No campaign requisition linked yet</p>
        <p className="text-xs text-muted-foreground">The request must be approved first to auto-create a campaign.</p>
        <Button variant="outline" size="sm" onClick={() => setLocation(`/recruiting/campaigns/${requestId}`)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back to Campaign Detail
        </Button>
      </div>
    );
  }

  // Use channelPostings if postingsLocal isn't initialized yet
  const displayPostings = hasInitialized ? postingsLocal : (channelPostings as any[]);

  return (
    <div className="space-y-5 max-w-3xl" data-testid={`section-campaign-workspace-${requestId}`}>
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm"
            onClick={() => setLocation(`/recruiting/campaigns/${requestId}`)}
            data-testid="btn-ws-back-to-detail"
            className="gap-1.5 -ml-1">
            <ArrowLeft className="h-3.5 w-3.5" />Campaign Detail
          </Button>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="text-sm font-medium">Campaign Workspace</span>
        </div>
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {request.dealershipName || "Campaign Workspace"}
          </span>
        </div>
      </div>

      {/* ── Market Intelligence Panel ── */}
      <CampaignMarketIntelligencePanel requisitionId={requisitionId} />

      {/* ── Recruiting Plan Panel ── */}
      <RecruitingPlanPanel requisitionId={requisitionId} />

      {/* ── Step Indicator ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <StepIndicator current={step} total={STEPS.length} />
        </CardContent>
      </Card>

      {/* ── Step Content ── */}
      <Card>
        <CardContent className="pt-5 pb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-5 flex items-center gap-1.5">
            {step === 1 && <><Rocket className="h-3.5 w-3.5" />Step 1 — Campaign Summary</>}
            {step === 2 && <><FileText className="h-3.5 w-3.5" />Step 2 — Ad Template</>}
            {step === 3 && <><Radio className="h-3.5 w-3.5" />Step 3 — Select Channels</>}
            {step === 4 && <><Eye className="h-3.5 w-3.5" />Step 4 — Review Ads</>}
            {step === 5 && <><Send className="h-3.5 w-3.5" />Step 5 — Publish</>}
          </h2>

          {step === 1 && (
            <Step1Summary
              request={request}
              requisition={requisition}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2Template
              requisitionId={requisitionId}
              selectedTemplateId={selectedTemplate}
              onSelect={(id, body) => { setSelectedTemplate(id); setTemplateBody(body); }}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <Step3Channels
              selectedChannels={selectedChannels}
              existingPostings={channelPostings as any[]}
              onToggle={toggleChannel}
              onBack={() => setStep(2)}
              onNext={handleCreateChannels}
              isCreating={isCreatingChannels}
            />
          )}
          {step === 4 && (
            <Step4ReviewAds
              postings={displayPostings}
              onBack={() => setStep(3)}
              onNext={() => setStep(5)}
              onRefreshAds={handleRefreshAd}
              onBodyChange={handleAdBodyChange}
            />
          )}
          {step === 5 && (
            <Step5Publish
              postings={displayPostings}
              onBack={() => setStep(4)}
              onSaveAd={handleSaveAd}
              onPublish={handlePublish}
              publishingId={publishingId}
              savingId={savingId}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
