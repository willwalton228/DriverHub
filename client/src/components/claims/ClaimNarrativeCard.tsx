import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, RefreshCw, Pencil, Check, X, AlertTriangle,
  ChevronDown, ChevronUp, FileText, Clock, Copy, CheckCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateFormat";

// ── Types ─────────────────────────────────────────────────────────────────────
interface NarrativeSections {
  whatHappened: string;
  whoInvolved: string;
  damageSummary: string;
  liabilityContext: string;
}

interface NarrativeResponse {
  exists: boolean;
  id?: string;
  content?: NarrativeSections;
  generatedContent?: NarrativeSections;
  editedContent?: NarrativeSections | null;
  isEdited?: boolean;
  isStale?: boolean;
  generatedAt?: string | null;
  lastEditedAt?: string | null;
}

const SECTION_META: { key: keyof NarrativeSections; label: string; placeholder: string }[] = [
  { key: "whatHappened",     label: "What Happened",      placeholder: "Describe the sequence of events, when and where the incident occurred, and any relevant environmental factors…" },
  { key: "whoInvolved",      label: "Who Was Involved",   placeholder: "Identify the driver, vehicle, and any third parties involved in the incident…" },
  { key: "damageSummary",    label: "Damage Summary",     placeholder: "Summarize property damage, injuries, estimated or actual repair costs, and evidence on file…" },
  { key: "liabilityContext", label: "Liability Context",  placeholder: "Describe the at-fault determination, preventability assessment, police involvement, and root cause analysis…" },
];

// ── Section view / edit block ─────────────────────────────────────────────────
function NarrativeSection({
  label, value, editing, onChange,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1" data-testid={`narrative-section-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {editing ? (
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={4}
          className="text-sm leading-relaxed resize-none"
          data-testid={`textarea-narrative-${label.toLowerCase().replace(/\s+/g, "-")}`}
        />
      ) : (
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{value || "—"}</p>
      )}
    </div>
  );
}

// ── Copy-to-clipboard helper ──────────────────────────────────────────────────
function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);
  return { copied, copy };
}

// ── Main component ────────────────────────────────────────────────────────────
interface ClaimNarrativeCardProps {
  claimId: string;
  /** Optional: pass the current claim status so we can hint generation */
  claimStatus?: string;
}

export function ClaimNarrativeCard({ claimId, claimStatus }: ClaimNarrativeCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { copied, copy } = useCopyToClipboard();
  const [isOpen, setIsOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<NarrativeSections>({
    whatHappened: "",
    whoInvolved: "",
    damageSummary: "",
    liabilityContext: "",
  });

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const { data: narrativeData, isLoading } = useQuery<NarrativeResponse>({
    queryKey: ["/api/claims", claimId, "narrative"],
    refetchInterval: 0,
    staleTime: 60_000,
  });

  const content = narrativeData?.content;
  const hasNarrative = narrativeData?.exists && !!content;

  // Sync draft when content loads
  useEffect(() => {
    if (content) {
      setDraft({ ...content });
    }
  }, [content]);

  // ── Generate mutation ──────────────────────────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/claims/${claimId}/narrative/generate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims", claimId, "narrative"] });
      setEditing(false);
      toast({ title: "Narrative generated", description: "AI has generated a fresh claim narrative." });
    },
    onError: () => {
      toast({ title: "Generation failed", description: "AI service unavailable. Try again shortly.", variant: "destructive" });
    },
  });

  // ── Save edits mutation ────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (content: NarrativeSections) =>
      apiRequest("PATCH", `/api/claims/${claimId}/narrative`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims", claimId, "narrative"] });
      setEditing(false);
      toast({ title: "Narrative saved", description: "Your edits have been saved." });
    },
    onError: () => {
      toast({ title: "Save failed", variant: "destructive" });
    },
  });

  // ── Copy full narrative as plain text ─────────────────────────────────────
  const handleCopy = () => {
    if (!content) return;
    const text = SECTION_META.map(({ label, key }) =>
      `${label.toUpperCase()}\n${content[key]}`
    ).join("\n\n");
    copy(text);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Card data-testid="card-claim-narrative">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-2 cursor-pointer select-none">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-[15px] font-semibold flex items-center gap-2 flex-wrap">
                  Claim Narrative
                  {narrativeData?.isEdited && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal" data-testid="badge-narrative-edited">
                      Edited
                    </Badge>
                  )}
                  {narrativeData?.isStale && !editing && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 font-normal"
                      data-testid="badge-narrative-stale"
                    >
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5 text-destructive" />
                      Data changed
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  AI-generated summary for internal and carrier use — editable before submission
                </CardDescription>
              </div>
              {/* Timestamps */}
              {hasNarrative && (
                <div className="hidden sm:flex flex-col items-end text-[10px] text-muted-foreground shrink-0 mr-1">
                  {narrativeData?.generatedAt && (
                    <span>Generated {formatDate(narrativeData.generatedAt)}</span>
                  )}
                  {narrativeData?.lastEditedAt && (
                    <span>Edited {formatDate(narrativeData.lastEditedAt)}</span>
                  )}
                </div>
              )}
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-3 py-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="space-y-1">
                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                    <div className="h-16 bg-muted animate-pulse rounded" />
                  </div>
                ))}
              </div>
            ) : !hasNarrative ? (
              /* ── Empty state ── */
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <div className="rounded-full bg-muted p-4">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-sm">No narrative generated yet</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Generate an AI-powered narrative summary from this claim's incident data, driver info, notes, and evidence.
                  </p>
                </div>
                <Button
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  data-testid="button-generate-narrative"
                >
                  {generateMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {generateMutation.isPending ? "Generating…" : "Generate Narrative"}
                </Button>
              </div>
            ) : (
              /* ── Narrative content ── */
              <div className="space-y-5">
                {/* Stale banner */}
                {narrativeData?.isStale && (
                  <div
                    className="flex items-start gap-2 px-1 py-1 text-xs"
                    data-testid="banner-narrative-stale"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-destructive" />
                    <span className="text-muted-foreground">
                      Claim data has changed since this narrative was generated.{" "}
                      <button
                        className="underline font-medium hover:no-underline text-foreground"
                        onClick={() => generateMutation.mutate()}
                        disabled={generateMutation.isPending}
                        data-testid="link-regenerate-stale"
                      >
                        Regenerate now
                      </button>
                    </span>
                  </div>
                )}

                {/* Section blocks */}
                <div className="space-y-4">
                  {SECTION_META.map(({ key, label }) => (
                    <NarrativeSection
                      key={key}
                      label={label}
                      value={editing ? draft[key] : (content?.[key] ?? "")}
                      editing={editing}
                      onChange={v => setDraft(d => ({ ...d, [key]: v }))}
                    />
                  ))}
                </div>

                {/* Action toolbar */}
                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border">
                  {editing ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => saveMutation.mutate(draft)}
                        disabled={saveMutation.isPending}
                        data-testid="button-save-narrative"
                      >
                        {saveMutation.isPending ? (
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Save Changes
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDraft({ ...(content ?? { whatHappened: "", whoInvolved: "", damageSummary: "", liabilityContext: "" }) });
                          setEditing(false);
                        }}
                        disabled={saveMutation.isPending}
                        data-testid="button-cancel-edit-narrative"
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(true)}
                        data-testid="button-edit-narrative"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Edit
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateMutation.mutate()}
                            disabled={generateMutation.isPending}
                            data-testid="button-regenerate-narrative"
                          >
                            {generateMutation.isPending ? (
                              <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            {generateMutation.isPending ? "Generating…" : "Regenerate"}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-xs">
                          Re-runs AI generation from the latest claim data. This will overwrite any manual edits.
                        </TooltipContent>
                      </Tooltip>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopy}
                        data-testid="button-copy-narrative"
                      >
                        {copied ? (
                          <CheckCheck className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        {copied ? "Copied!" : "Copy"}
                      </Button>
                    </>
                  )}

                  {/* Edited badge on right */}
                  {!editing && narrativeData?.isEdited && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {narrativeData.lastEditedAt && (
                            <span>Last edited {formatDate(narrativeData.lastEditedAt)}</span>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        This narrative has been manually edited.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
