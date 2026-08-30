import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart2, Users, UserCheck, TrendingUp, DollarSign, Target, Award,
  MapPin, Network, ArrowUpRight, Loader2, RefreshCw
} from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

function pct(num: number, denom: number) {
  if (!denom) return "0%";
  return `${((num / denom) * 100).toFixed(1)}%`;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  bannerColor: string | null;
  startDate: string | null;
  endDate: string | null;
  totalPotentialReward: number;
  milestones: any[];
}

interface ProgressRow {
  progress: { achievedAt: string | null; rewardAmount: string; paymentStatus: string; referrerDriverId: string | null };
  campaign: { id: string; name: string };
  milestone: { triggerType: string };
}

interface ReportData {
  rows: ProgressRow[];
  totalBonusesEarned: number;
  totalBonusesPaid: number;
  topDrivers: { driverId: string; count: number }[];
}

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string; sub?: string; icon: JSX.Element; accent?: boolean;
}) {
  return (
    <Card data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${accent ? "text-primary" : ""}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignBreakdown({ rows, campaigns }: { rows: ProgressRow[]; campaigns: Campaign[] }) {
  const campaignStats = campaigns.map((c) => {
    const cRows = rows.filter((r) => r.campaign.id === c.id);
    const achieved = cRows.filter((r) => r.progress.achievedAt);
    const earned = achieved.reduce((s, r) => s + Number(r.progress.rewardAmount), 0);
    const paid = achieved.filter((r) => r.progress.paymentStatus === "paid")
      .reduce((s, r) => s + Number(r.progress.rewardAmount), 0);
    const hires = achieved.filter((r) =>
      ["onboarded", "offer_accepted", "first_shift_worked"].includes(r.milestone.triggerType)
    ).length;
    const apps = cRows.filter((r) => r.milestone.triggerType === "application_submitted").length;
    return { ...c, achieved: achieved.length, earned, paid, hires, apps };
  });

  if (!campaignStats.length) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No campaign data yet.</p>;
  }

  return (
    <div className="space-y-3">
      {campaignStats.map((c) => (
        <Card key={c.id} data-testid={`campaign-breakdown-${c.id}`}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.bannerColor ?? "#FF6B35" }} />
              <CardTitle className="text-sm">{c.name}</CardTitle>
              <Badge className="text-xs ml-auto">{c.status}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-6 text-xs">
              {[
                { label: "Applications", value: c.apps },
                { label: "Milestones Hit", value: c.achieved },
                { label: "Hires", value: c.hires },
                { label: "Conv. Rate", value: c.apps > 0 ? pct(c.hires, c.apps) : "—" },
                { label: "Rewards Earned", value: fmt(c.earned) },
                { label: "Rewards Paid", value: fmt(c.paid) },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-muted-foreground">{s.label}</p>
                  <p className="font-semibold mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TopDriversTable({ topDrivers }: { topDrivers: { driverId: string; count: number }[] }) {
  if (!topDrivers.length) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No referral data yet.</p>;
  }
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          Top Referring Drivers
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {topDrivers.map((d, i) => (
            <div key={d.driverId} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
              <div className="flex items-center gap-2">
                <span className="w-6 text-center text-base">{medals[i] ?? `${i + 1}.`}</span>
                <span className="font-mono text-xs text-muted-foreground">{d.driverId}</span>
              </div>
              <Badge data-testid={`badge-top-driver-${d.driverId}`}>
                {d.count} milestone{d.count !== 1 ? "s" : ""}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReferralAnalytics() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ["/api/referral-campaigns"],
  });
  const campaigns = campaignsData?.campaigns ?? [];

  const reportKey = selectedCampaign === "all"
    ? "/api/referral-campaigns-report"
    : `/api/referral-campaigns/${selectedCampaign}/report`;

  const { data: report, isLoading: reportLoading, refetch } = useQuery<ReportData>({
    queryKey: [reportKey],
  });

  const rows = report?.rows ?? [];
  const topDrivers = report?.topDrivers ?? [];

  const totalEarned  = report?.totalBonusesEarned ?? 0;
  const totalPaid    = report?.totalBonusesPaid   ?? 0;
  const totalPending = totalEarned - totalPaid;

  const achievedRows = rows.filter((r) => r.progress.achievedAt);
  const hireRows     = achievedRows.filter((r) =>
    ["onboarded", "offer_accepted", "first_shift_worked"].includes(r.milestone.triggerType)
  );
  const appRows      = rows.filter((r) => r.milestone.triggerType === "application_submitted");
  const convRate     = appRows.length > 0 ? pct(hireRows.length, appRows.length) : "—";
  const cph          = hireRows.length > 0 ? fmt(totalEarned / hireRows.length) : "—";

  const activeCampaigns = campaigns.filter((c) => c.status === "active");

  const isLoading = campaignsLoading || reportLoading;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Referral Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Campaign performance, referral funnel metrics, and reward tracking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger className="w-52" data-testid="select-campaign-filter">
              <SelectValue placeholder="All Campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="icon" variant="outline" onClick={() => refetch()} data-testid="button-refresh-analytics">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPI summary strip */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Active Campaigns"    value={String(activeCampaigns.length)} icon={<Target className="h-4 w-4 text-primary" />} />
            <StatCard label="Applications"        value={String(appRows.length)}         icon={<Users className="h-4 w-4 text-muted-foreground" />} />
            <StatCard label="Hires"               value={String(hireRows.length)}        icon={<UserCheck className="h-4 w-4 text-green-600" />} />
            <StatCard label="Conversion Rate"     value={convRate}                       icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />} />
            <StatCard label="Rewards Earned"      value={fmt(totalEarned)}               icon={<DollarSign className="h-4 w-4 text-primary" />} accent />
            <StatCard label="Avg Cost Per Hire"   value={cph}                            icon={<BarChart2 className="h-4 w-4 text-muted-foreground" />} />
          </div>

          {/* Rewards breakdown */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Rewards Earned",  value: fmt(totalEarned),  color: "text-foreground" },
              { label: "Rewards Paid",    value: fmt(totalPaid),    color: "text-green-600 dark:text-green-400" },
              { label: "Pending Payout",  value: fmt(totalPending), color: "text-yellow-600 dark:text-yellow-400" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Tabs defaultValue="breakdown">
            <TabsList>
              <TabsTrigger value="breakdown" data-testid="tab-campaign-breakdown">By Campaign</TabsTrigger>
              <TabsTrigger value="drivers"   data-testid="tab-top-drivers">Top Drivers</TabsTrigger>
            </TabsList>

            <TabsContent value="breakdown" className="mt-4">
              <CampaignBreakdown
                rows={rows}
                campaigns={selectedCampaign === "all" ? campaigns : campaigns.filter((c) => c.id === selectedCampaign)}
              />
            </TabsContent>

            <TabsContent value="drivers" className="mt-4">
              <TopDriversTable topDrivers={topDrivers} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
