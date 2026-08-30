import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Users2, Check, ChevronDown, ChevronUp, Loader2, Info,
} from "lucide-react";

// ── Tag catalogue (mirrors shared/schema.ts AUDIENCE_STRATEGY_TAGS) ──────────
const AUDIENCE_TAGS = [
  { value: "retiree_friendly",          label: "Retiree-Friendly",           description: "Suitable for retirees seeking part-time or supplemental income." },
  { value: "military_veteran_friendly", label: "Military & Veteran Friendly", description: "Structured, discipline-forward environment that appeals to veterans." },
  { value: "part_time_friendly",        label: "Part-Time Friendly",          description: "Flexible hours compatible with part-time availability." },
  { value: "weekday_only",              label: "Weekday Only",                description: "Shifts restricted to Monday–Friday, ideal for parents and caregivers." },
  { value: "flexible_hours",            label: "Flexible Hours",              description: "Candidate can choose their own start/end times within a window." },
  { value: "career_change",             label: "Career Changers Welcome",     description: "No prior driving experience required; training provided." },
  { value: "student_friendly",          label: "Student-Friendly",            description: "Schedule can accommodate class/study commitments." },
  { value: "seasonal",                  label: "Seasonal",                    description: "Temporary or peak-season role with a defined end date." },
] as const;

type TagValue = (typeof AUDIENCE_TAGS)[number]["value"];

// Badge color mapping — no emoji in rendered badges, just label
const TAG_COLORS: Record<string, string> = {
  retiree_friendly:          "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  military_veteran_friendly: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  part_time_friendly:        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  weekday_only:              "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  flexible_hours:            "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  career_change:             "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  student_friendly:          "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  seasonal:                  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

interface AudienceStrategyTaggerProps {
  requisitionId: string;
  currentTags: string[];
  readonly?: boolean;
  /** If true, shows as a compact read-only badge row — no edit controls */
  compact?: boolean;
  /** Called after a successful save so parent can update its local state */
  onUpdate?: (tags: string[]) => void;
}

export function AudienceStrategyTagger({
  requisitionId,
  currentTags,
  readonly = false,
  compact = false,
  onUpdate,
}: AudienceStrategyTaggerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  // Optimistic local state — starts from server value
  const [localTags, setLocalTags] = useState<string[]>(currentTags ?? []);

  const saveMutation = useMutation({
    mutationFn: (tags: string[]) =>
      apiRequest("PATCH", `/api/recruiting/requisitions/${requisitionId}`, {
        audienceStrategyTags: tags,
      }),
    onSuccess: (_data, tags) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/requisitions"] });
      onUpdate?.(tags);
    },
    onError: () => {
      // Rollback optimistic update
      setLocalTags(currentTags ?? []);
      toast({ title: "Failed to save audience tags", variant: "destructive" });
    },
  });

  function toggleTag(value: string) {
    if (readonly) return;
    const next = localTags.includes(value)
      ? localTags.filter(t => t !== value)
      : [...localTags, value];
    setLocalTags(next);
    saveMutation.mutate(next);
  }

  // ── Compact read-only view (e.g. for requisition list or channel planner) ─
  if (compact) {
    if (!localTags.length) return null;
    return (
      <div className="flex flex-wrap gap-1" data-testid="audience-tags-compact">
        {localTags.map(tag => {
          const def = AUDIENCE_TAGS.find(t => t.value === tag);
          if (!def) return null;
          return (
            <Tooltip key={tag}>
              <TooltipTrigger asChild>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${TAG_COLORS[tag] ?? "bg-muted text-muted-foreground"}`}
                  data-testid={`tag-badge-${tag}`}
                >
                  {def.label}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{def.description}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    );
  }

  // ── Full card view ─────────────────────────────────────────────────────────
  return (
    <Card data-testid="card-audience-strategy-tagger">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users2 className="h-4 w-4 text-primary" />
            Audience Strategy
            {localTags.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                {localTags.length} tag{localTags.length !== 1 ? "s" : ""} active
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {saveMutation.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setExpanded(v => !v)}
              data-testid="button-toggle-audience-tagger"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <CardDescription>
          Tag this requisition with target audience segments to guide ad channel selection and AI recommendations.
        </CardDescription>

        {/* Compact tag preview when collapsed */}
        {!expanded && localTags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {localTags.map(tag => {
              const def = AUDIENCE_TAGS.find(t => t.value === tag);
              return def ? (
                <span
                  key={tag}
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${TAG_COLORS[tag] ?? "bg-muted text-muted-foreground"}`}
                >
                  {def.label}
                </span>
              ) : null;
            })}
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {AUDIENCE_TAGS.map(tag => {
              const active = localTags.includes(tag.value);
              return (
                <button
                  key={tag.value}
                  type="button"
                  disabled={readonly || saveMutation.isPending}
                  onClick={() => toggleTag(tag.value)}
                  className={`
                    flex items-start gap-3 text-left px-3 py-2.5 rounded-md border transition-colors
                    ${active
                      ? "border-primary bg-primary/5 dark:bg-primary/10"
                      : "border-border hover-elevate"
                    }
                    ${readonly ? "cursor-default" : "cursor-pointer"}
                    disabled:opacity-60
                  `}
                  data-testid={`button-toggle-tag-${tag.value}`}
                >
                  {/* Checkmark */}
                  <div className={`mt-0.5 h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${active ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                    {active && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>

                  {/* Label + description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-medium leading-snug ${active ? "text-primary" : ""}`}>
                        {tag.label}
                      </span>
                      {active && (
                        <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium ${TAG_COLORS[tag.value] ?? "bg-muted text-muted-foreground"}`}>
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{tag.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2 mt-3 p-2.5 rounded-md bg-muted/50">
            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Active tags are automatically included in AI channel recommendations and visible in the Channel Distribution Plan and Source Performance reports.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/** Standalone inline badge strip — for use in list views, channel planner headers, etc. */
export function AudienceTagBadges({ tags }: { tags: string[] }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1" data-testid="audience-tag-badges">
      {tags.map(tag => {
        const def = AUDIENCE_TAGS.find(t => t.value === tag);
        if (!def) return null;
        return (
          <Tooltip key={tag}>
            <TooltipTrigger asChild>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${TAG_COLORS[tag] ?? "bg-muted text-muted-foreground"}`}
                data-testid={`badge-audience-tag-${tag}`}
              >
                {def.label}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{def.description}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
