import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Copy, Share2, QrCode, Star, UserCheck, Award, Trophy, Crown, Flame,
  Users, CheckCircle2, Clock, DollarSign, Medal, TrendingUp, ExternalLink,
  X, Gift, Lock, CircleDot
} from "lucide-react";
import { CAMPAIGN_TRIGGER_LABELS } from "@shared/schema";
import { ACHIEVEMENT_META } from "@shared/schema";

// ─── Achievement icon map ────────────────────────────────────────────────────
const ACHIEVEMENT_ICONS: Record<string, React.ElementType> = {
  Star, UserCheck, Award, Trophy, Crown, Flame,
};

// ─── Referral status badge ───────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  submitted:       "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  pending_review:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  interviewing:    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  offer_extended:  "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  hired:           "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  rejected:        "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  withdrawn:       "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  duplicate:       "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── QR Modal ────────────────────────────────────────────────────────────────
function QrModal({ url, code, onClose }: { url: string; code: string; onClose: () => void }) {
  const qrUrl = `/api/public/referral/${code}/qr?size=280`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-background border rounded-md p-6 flex flex-col items-center gap-4 shadow-xl max-w-xs w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between w-full">
          <span className="font-semibold text-foreground">QR Code</span>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <img src={qrUrl} alt="Referral QR Code" className="rounded-md border" width={280} height={280} />
        <p className="text-sm text-muted-foreground text-center break-all">{url}</p>
        <p className="text-xs text-muted-foreground">Scan to apply with your referral code pre-filled</p>
        <Button variant="outline" size="sm" onClick={() => { const a = document.createElement('a'); a.href = qrUrl; a.download = `referral-qr-${code}.png`; a.click(); }}>
          Download QR
        </Button>
      </div>
    </div>
  );
}

// ─── Share card ──────────────────────────────────────────────────────────────
function ShareCard({ codeData }: { codeData: { code: string; referralUrl: string } }) {
  const { toast } = useToast();
  const [showQr, setShowQr] = useState(false);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() =>
      toast({ title: `${label} copied!`, description: text })
    );
  };

  const share = async () => {
    if (canShare) {
      try {
        await navigator.share({
          title: "Join me at Driver on Demand!",
          text: `Use my referral link to apply: ${codeData.referralUrl}`,
          url: codeData.referralUrl,
        });
      } catch {
        copy(codeData.referralUrl, "Referral link");
      }
    } else {
      copy(codeData.referralUrl, "Referral link");
    }
  };

  return (
    <>
      {showQr && <QrModal url={codeData.referralUrl} code={codeData.code} onClose={() => setShowQr(false)} />}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            Share My Referral Link
          </CardTitle>
          <CardDescription>Share with friends and earn rewards when they get hired</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Referral Code */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Your Referral Code</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold tracking-widest text-primary font-mono" data-testid="text-referral-code">
                {codeData.code}
              </span>
              <Button size="icon" variant="ghost" onClick={() => copy(codeData.code, "Referral code")} data-testid="button-copy-code">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator />

          {/* Referral Link */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Personal Referral Link</span>
            <div className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
              <span className="text-sm text-foreground truncate flex-1 font-mono" data-testid="text-referral-url">
                {codeData.referralUrl}
              </span>
              <Button size="icon" variant="ghost" className="shrink-0" onClick={() => copy(codeData.referralUrl, "Referral link")} data-testid="button-copy-link">
                <Copy className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="shrink-0" onClick={() => window.open(codeData.referralUrl, '_blank')} data-testid="button-open-link">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={share} data-testid="button-share-referral">
              <Share2 className="h-4 w-4 mr-2" />
              {canShare ? "Share" : "Copy Link"}
            </Button>
            <Button variant="outline" onClick={() => copy(codeData.code, "Referral code")} data-testid="button-copy-code-btn">
              <Copy className="h-4 w-4 mr-2" />
              Copy Code
            </Button>
            <Button variant="outline" onClick={() => setShowQr(true)} data-testid="button-generate-qr">
              <QrCode className="h-4 w-4 mr-2" />
              QR Code
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ─── Stats bar ───────────────────────────────────────────────────────────────
function StatsBar({ stats }: { stats: { totalReferrals: number; hiredCount: number; pendingCount: number; bonusEarned: number; bonusPaid: number } }) {
  const items = [
    { label: "Total Referrals", value: stats.totalReferrals, icon: Users },
    { label: "Hired", value: stats.hiredCount, icon: CheckCircle2 },
    { label: "Pending", value: stats.pendingCount, icon: Clock },
    { label: "Bonus Earned", value: `$${stats.bonusEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: DollarSign },
    { label: "Bonus Paid", value: `$${stats.bonusPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: DollarSign },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <item.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
            <div className="text-xl font-semibold text-foreground" data-testid={`stat-${item.label.toLowerCase().replace(/ /g, '-')}`}>
              {item.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Achievements ─────────────────────────────────────────────────────────────
function AchievementsPanel({ earned }: { earned: { type: string; periodKey: string | null; earnedAt: Date }[] }) {
  const earnedTypes = new Set(earned.map((a) => a.type));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {(Object.entries(ACHIEVEMENT_META) as [string, { label: string; description: string; icon: string }][]).map(([type, meta]) => {
        const Icon = ACHIEVEMENT_ICONS[meta.icon] || Star;
        const isEarned = earnedTypes.has(type);
        return (
          <Card key={type} className={isEarned ? "" : "opacity-40"}>
            <CardContent className="pt-4 pb-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${isEarned ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium text-foreground">{meta.label}</span>
                {isEarned && <Badge variant="secondary" className="ml-auto text-xs">Earned</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Campaign Rewards Panel ──────────────────────────────────────────────────
function CampaignRewardsPanel() {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

  const { data: rewardsData, isLoading } = useQuery<{
    rows: Array<{
      progress: {
        id: string; achievedAt: string | null; rewardAmount: string;
        paymentStatus: string; paidAt: string | null;
      };
      campaign: { id: string; name: string; bannerColor: string | null };
      milestone: { id: string; name: string; triggerType: string };
    }>;
    totalEarned: number;
    totalPaid: number;
    totalPending: number;
  }>({ queryKey: ["/api/my-referral-rewards"] });

  const { data: campaignData } = useQuery<{ campaigns: any[] }>({
    queryKey: ["/api/referral-campaigns/active"],
  });
  const activeCampaigns = campaignData?.campaigns ?? [];

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading rewards…</p>;
  }

  const PAYMENT_STATUS_COLORS: Record<string, string> = {
    pending:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
    approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    paid:     "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    voided:   "bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400",
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      {(rewardsData?.totalEarned ?? 0) > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Earned", value: fmt(rewardsData?.totalEarned ?? 0) },
            { label: "Paid",   value: fmt(rewardsData?.totalPaid   ?? 0) },
            { label: "Pending",value: fmt(rewardsData?.totalPending ?? 0) },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold mt-0.5">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Active campaigns */}
      {activeCampaigns.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Current Campaigns</h3>
          {activeCampaigns.map((c) => (
            <Card key={c.id} data-testid={`card-active-campaign-${c.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.bannerColor ?? "#FF6B35" }} />
                  <CardTitle className="text-sm">{c.name}</CardTitle>
                  {c.daysRemaining !== null && c.daysRemaining <= 14 && (
                    <Badge className="text-xs ml-auto">{c.daysRemaining}d left</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="space-y-1">
                  {c.milestones.map((m: any, i: number) => {
                    const earned = rewardsData?.rows.find(
                      (r) => r.campaign.id === c.id && r.milestone.triggerType === m.triggerType && r.progress.achievedAt
                    );
                    return (
                      <div key={m.id ?? i} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          {earned ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          ) : (
                            <CircleDot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className={earned ? "text-foreground" : "text-muted-foreground"}>
                            {CAMPAIGN_TRIGGER_LABELS[m.triggerType as keyof typeof CAMPAIGN_TRIGGER_LABELS] ?? m.triggerType}
                            {m.triggerValue ? ` (${m.triggerValue})` : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${earned ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                            {fmt(Number(m.rewardAmount))}
                          </span>
                          {earned && (
                            <Badge className={`text-xs ${PAYMENT_STATUS_COLORS[earned.progress.paymentStatus] ?? ""}`}>
                              {earned.progress.paymentStatus}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between text-xs pt-2 font-semibold">
                    <span>Total Potential</span>
                    <span className="text-primary">{fmt(c.totalPotentialReward)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Payment history */}
      {(rewardsData?.rows?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payment History</h3>
          <Card>
            <CardContent className="pt-4 pb-2">
              <div className="space-y-1">
                {rewardsData!.rows.filter((r) => r.progress.achievedAt).map((r) => (
                  <div key={r.progress.id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                    <div>
                      <p className="font-medium text-foreground">{r.milestone.name}</p>
                      <p className="text-muted-foreground">{r.campaign.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{fmt(Number(r.progress.rewardAmount))}</p>
                      <Badge className={`text-xs ${PAYMENT_STATUS_COLORS[r.progress.paymentStatus] ?? ""}`}>
                        {r.progress.paymentStatus}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeCampaigns.length === 0 && (rewardsData?.rows?.length ?? 0) === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Gift className="h-10 w-10 mx-auto mb-3" />
          <p className="font-medium">No active campaigns</p>
          <p className="text-sm mt-1">Check back soon — referral bonus campaigns are added regularly.</p>
        </div>
      )}
    </div>
  );
}

// ─── Referrals list ──────────────────────────────────────────────────────────
function ReferralsList({ referrals }: { referrals: any[] }) {
  if (!referrals.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
        <Users className="h-10 w-10" />
        <p className="text-sm">No referrals yet — share your link to get started!</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {referrals.map((r) => (
        <Card key={r.id}>
          <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {r.referredFirstName} {r.referredLastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{r.referredEmail}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[r.status] || "bg-gray-100 text-gray-600"}`}>
                {statusLabel(r.status)}
              </span>
              {r.milestoneReached && (
                <Badge variant="outline" className="text-xs">
                  {r.milestoneReached}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MyReferrals() {
  const { user } = useAuth();

  const { data: codeData, isLoading: codeLoading } = useQuery<{
    code: string; referralUrl: string;
  }>({
    queryKey: ["/api/my-referral-code"],
  });

  const { data: statsData } = useQuery<{
    totalReferrals: number; hiredCount: number; pendingCount: number;
    bonusEarned: number; bonusPaid: number;
    achievements: { type: string; periodKey: string | null; earnedAt: Date }[];
  }>({
    queryKey: ["/api/my-referral-stats"],
  });

  const { data: referrals } = useQuery<any[]>({
    queryKey: ["/api/my-referrals"],
  });

  const { data: leaderboard } = useQuery<Array<{
    rank: number; driverName: string; driverId: string; referralCount: number; hireCount: number;
  }>>({
    queryKey: ["/api/referral-leaderboard"],
  });

  if (codeLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Referrals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Refer friends and earn bonuses when they get hired
        </p>
      </div>

      {codeData && <ShareCard codeData={codeData} />}

      {statsData && <StatsBar stats={statsData} />}

      <Tabs defaultValue="referrals">
        <TabsList className="w-full">
          <TabsTrigger value="referrals" className="flex-1" data-testid="tab-my-referrals">My Referrals</TabsTrigger>
          <TabsTrigger value="rewards" className="flex-1" data-testid="tab-rewards">Rewards</TabsTrigger>
          <TabsTrigger value="achievements" className="flex-1" data-testid="tab-achievements">Achievements</TabsTrigger>
          <TabsTrigger value="leaderboard" className="flex-1" data-testid="tab-leaderboard">Leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="referrals" className="mt-4">
          <ReferralsList referrals={referrals || []} />
        </TabsContent>

        <TabsContent value="rewards" className="mt-4">
          <CampaignRewardsPanel />
        </TabsContent>

        <TabsContent value="achievements" className="mt-4">
          <AchievementsPanel earned={statsData?.achievements || []} />
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Top Referrers This Month
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 pb-4">
              {!leaderboard?.length && (
                <p className="text-sm text-muted-foreground py-4 text-center">No data yet</p>
              )}
              {leaderboard?.map((entry) => (
                <div key={entry.driverId} className="flex items-center gap-3 py-2">
                  <span className="text-sm font-semibold w-6 text-muted-foreground text-right">{entry.rank}</span>
                  {entry.rank === 1 && <Medal className="h-4 w-4 text-yellow-500 shrink-0" />}
                  {entry.rank === 2 && <Medal className="h-4 w-4 text-gray-400 shrink-0" />}
                  {entry.rank === 3 && <Medal className="h-4 w-4 text-amber-600 shrink-0" />}
                  {entry.rank > 3 && <div className="w-4 shrink-0" />}
                  <span className="text-sm text-foreground flex-1 truncate">{entry.driverName}</span>
                  <span className="text-sm text-muted-foreground">{entry.referralCount} referrals</span>
                  {entry.hireCount > 0 && (
                    <Badge variant="secondary" className="text-xs">{entry.hireCount} hired</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
