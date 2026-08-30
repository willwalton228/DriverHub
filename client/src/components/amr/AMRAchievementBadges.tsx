/**
 * AMR Achievement Badges — shared types, hook, badge metadata, and widgets.
 *
 * Display locations:
 *   AMRAchievementBadgesWidget  → Executive Dashboard (full card with period selector)
 *   useAMRBadges                → TicketPortal ContributionsPanel + Profile page
 *   BADGE_META + winnersAsSet   → Team Activity Widget (badge icons next to winner names)
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Rocket, Lightbulb, Star, Zap, Crown, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BadgePeriod = "monthly" | "quarterly" | "yearly" | "all_time";

export interface BadgeResult {
  id: string;
  winnerId: string | null;
  winnerName: string | null; // null when standard user cannot see others
  isCurrentUser: boolean;
}

export interface AchievementBadgesResponse {
  period: string;
  canSeeAll: boolean;
  badges: BadgeResult[];
}

// ── Badge metadata (shared by all display locations) ─────────────────────────

export const BADGE_META: Record<
  string,
  {
    id: string;
    label: string;
    description: string;
    Icon: React.ElementType;
    color: string;
    bg: string;
    ringColor: string;
  }
> = {
  innovation_leader: {
    id: "innovation_leader",
    label: "Innovation Leader",
    description: "Most ideas implemented",
    Icon: Rocket,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900",
    ringColor: "ring-violet-400/60",
  },
  idea_generator: {
    id: "idea_generator",
    label: "Idea Generator",
    description: "Most AMRs submitted",
    Icon: Lightbulb,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
    ringColor: "ring-amber-400/60",
  },
  quality_champion: {
    id: "quality_champion",
    label: "Quality Champion",
    description: "Highest user acceptance rate",
    Icon: Star,
    color: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900",
    ringColor: "ring-yellow-400/60",
  },
  fast_resolver: {
    id: "fast_resolver",
    label: "Fast Resolver",
    description: "Lowest average completion time",
    Icon: Zap,
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900",
    ringColor: "ring-sky-400/60",
  },
  epic_finisher: {
    id: "epic_finisher",
    label: "Epic Finisher",
    description: "Most epic-related AMRs completed",
    Icon: Crown,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900",
    ringColor: "ring-orange-400/60",
  },
  first_pass_success: {
    id: "first_pass_success",
    label: "First Pass Success",
    description: "Highest first-pass acceptance %",
    Icon: ShieldCheck,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900",
    ringColor: "ring-emerald-400/60",
  },
};

export const BADGE_ORDER = [
  "innovation_leader",
  "idea_generator",
  "quality_champion",
  "fast_resolver",
  "epic_finisher",
  "first_pass_success",
] as const;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAMRBadges(period: BadgePeriod = "all_time") {
  const qs = period !== "all_time" ? `?period=${period}` : "";
  return useQuery<AchievementBadgesResponse>({
    queryKey: ["/api/tickets/achievement-badges", period],
    queryFn: async () => {
      const r = await fetch(`/api/tickets/achievement-badges${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch badges");
      return r.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min — badge winners don't flip every second
  });
}

/** Returns the set of userIds who hold at least one badge in the given response. */
export function winnersAsSet(data: AchievementBadgesResponse | undefined): Set<string> {
  const s = new Set<string>();
  data?.badges.forEach((b) => { if (b.winnerId) s.add(b.winnerId); });
  return s;
}

/** Returns the badge ids won by a specific userId. */
export function badgesForUser(
  data: AchievementBadgesResponse | undefined,
  userId: string
): string[] {
  return (data?.badges ?? []).filter((b) => b.winnerId === userId).map((b) => b.id);
}

// ── Compact badge chip (used inside table rows, profile strips, etc.) ─────────

export function BadgeChip({ badgeId, size = "sm" }: { badgeId: string; size?: "sm" | "xs" }) {
  const meta = BADGE_META[badgeId];
  if (!meta) return null;
  const Icon = meta.Icon;
  if (size === "xs") {
    return (
      <span
        title={`${meta.label} — ${meta.description}`}
        className={`inline-flex items-center justify-center h-4 w-4 rounded-full border ${meta.bg} ${meta.color} ring-1 ${meta.ringColor}`}
      >
        <Icon className="h-2.5 w-2.5" />
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${meta.bg} ${meta.color}`}
      title={meta.description}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {meta.label}
    </span>
  );
}

// ── My badges strip (ContributionsPanel + Profile) ────────────────────────────

export function MyBadgeStrip({ period = "all_time" }: { period?: BadgePeriod }) {
  const { data, isLoading } = useAMRBadges(period);
  const myBadgeIds = useMemo(
    () => (data?.badges ?? []).filter((b) => b.isCurrentUser).map((b) => b.id),
    [data]
  );

  if (isLoading) {
    return (
      <div className="flex gap-2 flex-wrap">
        {[1, 2].map((i) => <Skeleton key={i} className="h-5 w-28" />)}
      </div>
    );
  }

  if (myBadgeIds.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="my-badge-strip">
      {myBadgeIds.map((id) => <BadgeChip key={id} badgeId={id} size="sm" />)}
    </div>
  );
}

// ── Full Achievement Badges widget (Executive Dashboard) ──────────────────────

const PERIOD_OPTIONS: { value: BadgePeriod; label: string }[] = [
  { value: "monthly",   label: "This Month"    },
  { value: "quarterly", label: "This Quarter"  },
  { value: "yearly",    label: "This Year"     },
  { value: "all_time",  label: "All Time"      },
];

export function AMRAchievementBadgesWidget() {
  const [period, setPeriod] = useState<BadgePeriod>("monthly");
  const { data, isLoading } = useAMRBadges(period);

  return (
    <Card data-testid="widget-amr-achievement-badges">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-amber-500/10 flex items-center justify-center shrink-0">
              <Crown className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <CardTitle className="text-sm font-semibold">Achievement Badges</CardTitle>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as BadgePeriod)}>
            <SelectTrigger className="h-7 text-xs w-[130px]" data-testid="select-badges-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 pt-1">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {BADGE_ORDER.map((id) => {
              const meta   = BADGE_META[id];
              const result = data?.badges.find((b) => b.id === id);
              const Icon   = meta.Icon;
              const hasWinner = !!result?.winnerId;
              const isMe = result?.isCurrentUser ?? false;

              return (
                <div
                  key={id}
                  className={`flex flex-col gap-1 p-2.5 rounded-lg border transition-all
                    ${hasWinner
                      ? `${meta.bg} ${isMe ? `ring-1 ${meta.ringColor}` : ""}`
                      : "bg-muted/20 border-border/50 opacity-60"
                    }`}
                  data-testid={`badge-card-${id}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-4 w-4 shrink-0 ${hasWinner ? meta.color : "text-muted-foreground"}`} />
                    <span className={`text-xs font-semibold leading-tight ${hasWinner ? meta.color : "text-muted-foreground"}`}>
                      {meta.label}
                    </span>
                    {isMe && (
                      <span className="ml-auto text-[9px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">YOU</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">{meta.description}</p>
                  {hasWinner ? (
                    <p className={`text-[11px] font-medium truncate mt-0.5 ${meta.color}`}>
                      {result?.winnerName
                        ? result.winnerName
                        : result?.isCurrentUser
                          ? "You"
                          : "—"}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-0.5">No winner yet</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
