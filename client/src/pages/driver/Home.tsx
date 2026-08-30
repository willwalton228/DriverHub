import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import type { Driver, PayRecord, Trip } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/UserAvatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DollarSign, MapPin, FileText, Loader2, ArrowRight, Receipt, AlertCircle, Flame, Calendar, Users } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/dateFormat";

interface ExpenseAlert {
  hasOpenExpenses: boolean;
  overdueCount: number;
  message: string;
  userType: "driver" | "employee";
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  bannerColor: string | null;
  endDate: string | null;
  daysRemaining: number | null;
  totalPotentialReward: number;
  milestones: { triggerType: string; rewardAmount: string }[];
}

function CampaignBanner({ campaign }: { campaign: Campaign }) {
  const color = campaign.bannerColor ?? "#FF6B35";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

  return (
    <div
      className="rounded-md p-4 text-white relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${color}ee 0%, ${color}99 100%)` }}
      data-testid="banner-active-campaign"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5" />
            <span className="font-bold text-base">{campaign.name}</span>
          </div>
          {campaign.description && (
            <p className="text-sm opacity-90">{campaign.description}</p>
          )}
          <p className="text-sm font-semibold">
            Earn up to {fmt(campaign.totalPotentialReward)} for every qualified driver you refer.
          </p>
          {campaign.daysRemaining !== null && (
            <div className="flex items-center gap-1 text-xs opacity-80 mt-1">
              <Calendar className="h-3 w-3" />
              <span>
                {campaign.daysRemaining > 0
                  ? `${campaign.daysRemaining} day${campaign.daysRemaining !== 1 ? "s" : ""} remaining`
                  : campaign.endDate
                  ? `Ends ${new Date(campaign.endDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
                  : ""}
              </span>
            </div>
          )}
        </div>
        <Link href="/referrals">
          <Button
            size="sm"
            className="bg-white/20 border border-white/40 text-white hover:bg-white/30 shrink-0"
            data-testid="button-refer-driver"
          >
            <Users className="h-4 w-4 mr-1" />
            Refer a Driver
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function DriverHome() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: driver, isLoading: driverLoading } = useQuery<Driver>({
    queryKey: ["/api/drivers/profile"],
    enabled: isAuthenticated,
  });

  const { data: payRecords = [] } = useQuery<PayRecord[]>({
    queryKey: ["/api/drivers/pay"],
    enabled: isAuthenticated,
  });

  const { data: trips = [] } = useQuery<Trip[]>({
    queryKey: ["/api/drivers/trips"],
    enabled: isAuthenticated,
  });

  const { data: expenseAlert } = useQuery<ExpenseAlert>({
    queryKey: ["/api/me/expense-alerts"],
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  const { data: campaignData } = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ["/api/referral-campaigns/active"],
    enabled: isAuthenticated,
  });

  const featuredCampaign = campaignData?.campaigns?.find((c) => c.isFeatured) ?? campaignData?.campaigns?.[0];

  const currentYearRecords = payRecords.filter(
    (record) => new Date(record.payPeriodEnd).getFullYear() === new Date().getFullYear()
  );
  const ytdEarnings = currentYearRecords.reduce((sum, record) => sum + Number(record.netPay || 0), 0);
  const recentTrips = trips.slice(0, 3);

  if (authLoading || driverLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {expenseAlert?.hasOpenExpenses && (
        <Alert variant="destructive" className="border-red-500 bg-red-50 dark:bg-red-950" data-testid="alert-expense-overdue">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="text-lg font-semibold">Action Required: Submit Your Expenses</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-3">{expenseAlert.message}</p>
            <Link href="/expenses">
              <Button variant="destructive" size="sm" data-testid="button-go-to-expenses">
                Go to Expenses
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {featuredCampaign && <CampaignBanner campaign={featuredCampaign as any} />}

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <UserAvatar
              photoUrl={user?.profileImageUrl}
              firstName={user?.firstName}
              lastName={user?.lastName}
              email={user?.email}
              size="lg"
            />
            <div>
              <h1 className="text-2xl font-bold">
                Welcome back,{" "}
                {user?.firstName || user?.email?.split("@")[0] || "Driver"}!
              </h1>
              <p className="text-muted-foreground">
                {driver?.status ? (
                  <span className="capitalize">Status: {driver.status}</span>
                ) : (
                  "Manage your profile, view pay data, and track trips"
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">YTD Earnings</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${ytdEarnings.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {currentYearRecords.length} pay periods
            </p>
            <Link href="/pay">
              <Button variant="ghost" className="px-0 mt-2" data-testid="link-view-pay">
                View all pay data
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Trips</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trips.length}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
            <Link href="/trips">
              <Button variant="ghost" className="px-0 mt-2" data-testid="link-view-trips">
                View trip history
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profile</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {driver?.licenseNumber ? "Active" : "Incomplete"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {driver?.licenseExpiration
                ? `License exp: ${formatDate(driver.licenseExpiration)}`
                : "Update your information"}
            </p>
            <Link href="/profile">
              <Button variant="ghost" className="px-0 mt-2" data-testid="link-view-profile">
                Manage profile
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expenses</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Receipt className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Submit</div>
            <p className="text-xs text-muted-foreground mt-1">
              Request reimbursement
            </p>
            <Link href="/expenses">
              <Button variant="ghost" className="px-0 mt-2" data-testid="link-submit-expenses">
                Submit expenses
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {recentTrips.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Trips</CardTitle>
            <CardDescription>Your latest deliveries</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentTrips.map((trip, index) => (
                <div
                  key={trip.id}
                  className="flex items-center justify-between border border-border rounded-lg p-3 hover-elevate"
                  data-testid={`card-recent-trip-${index}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        <span>{trip.origin}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span>{trip.destination}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(trip.tripDate)}
                      </div>
                    </div>
                  </div>
                  {trip.distance && (
                    <div className="text-sm text-muted-foreground">
                      {Number(trip.distance).toFixed(0)} mi
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Link href="/trips">
              <Button variant="outline" className="w-full mt-4" data-testid="button-see-all-trips">
                See All Trips
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
