import { useQuery } from "@tanstack/react-query";
import { DashboardFilterBar } from "@/components/DashboardFilterBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useSearch } from "wouter";
import { useMemo } from "react";
import { IdCard, FileX, AlertTriangle, ChevronRight, ArrowLeft, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DriverWithUser } from "@shared/schema";
import { formatDate, parseDateSafe } from "@/lib/dateFormat";

export default function ComplianceReport() {
  const search = useSearch();
  const fromClaimsDashboard = new URLSearchParams(search).get("from") === "claims-dashboard";

  const { data: drivers = [], isLoading } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });

  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const complianceData = useMemo(() => {
    const expired = drivers.filter(d => {
      if (!d.licenseExpiration) return false;
      const exp = parseDateSafe(d.licenseExpiration);
      return exp < now;
    });

    const expiring30 = drivers.filter(d => {
      if (!d.licenseExpiration) return false;
      const exp = parseDateSafe(d.licenseExpiration);
      return exp >= now && exp <= thirtyDays;
    });

    const expiring60 = drivers.filter(d => {
      if (!d.licenseExpiration) return false;
      const exp = parseDateSafe(d.licenseExpiration);
      return exp > thirtyDays && exp <= sixtyDays;
    });

    const expiring90 = drivers.filter(d => {
      if (!d.licenseExpiration) return false;
      const exp = parseDateSafe(d.licenseExpiration);
      return exp > sixtyDays && exp <= ninetyDays;
    });

    const missingLicense = drivers.filter(d => !d.licenseNumber || !d.licenseExpiration);

    return {
      expired,
      expiring30,
      expiring60,
      expiring90,
      missingLicense,
      totalIssues: expired.length + expiring30.length + missingLicense.length,
    };
  }, [drivers]);

  const getDaysUntilExpiry = (date: string | Date) => {
    const exp = parseDateSafe(date);
    const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const DriverComplianceRow = ({ driver, showExpiry = true }: { driver: DriverWithUser; showExpiry?: boolean }) => (
    <Link href={`/drivers/${driver.id}`}>
      <div 
        className="flex items-center justify-between p-3 border rounded-lg hover-elevate cursor-pointer group"
        data-testid={`compliance-row-${driver.id}`}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <IdCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">
              {driver.user?.firstName} {driver.user?.lastName}
            </p>
            <p className="text-sm text-muted-foreground">
              License: {driver.licenseNumber || 'Not on file'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {showExpiry && driver.licenseExpiration && (
            <div className="text-right">
              <div className="flex items-center gap-1 text-sm">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                {formatDate(driver.licenseExpiration)}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {getDaysUntilExpiry(driver.licenseExpiration)} days
              </div>
            </div>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>
    </Link>
  );

  return (
    <div className="flex flex-col h-full">
      <DashboardFilterBar />
      
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-4 mb-4">
          <Link href={fromClaimsDashboard ? "/claims/dashboard" : "/"}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              {fromClaimsDashboard ? "Claims Dashboard" : "Dashboard"}
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Compliance Report</h1>
            <p className="text-muted-foreground text-sm">License expirations and missing documents</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className={complianceData.expired.length > 0 ? 'border-red-500 border-2' : ''}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Expired</span>
                <Badge variant="destructive">{complianceData.expired.length}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className={complianceData.expiring30.length > 0 ? 'border-orange-500' : ''}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">30 Days</span>
                <Badge className="bg-orange-500/10 text-orange-600">{complianceData.expiring30.length}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">60 Days</span>
                <Badge className="bg-amber-500/10 text-amber-600">{complianceData.expiring60.length}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">90 Days</span>
                <Badge variant="outline">{complianceData.expiring90.length}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className={complianceData.missingLicense.length > 0 ? 'border-amber-500' : ''}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Missing</span>
                <Badge variant="secondary">{complianceData.missingLicense.length}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {complianceData.totalIssues > 0 && (
          <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span className="text-sm font-medium text-amber-600">
              {complianceData.totalIssues} compliance issues require immediate attention
            </span>
          </div>
        )}

        <Tabs defaultValue="expired" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="expired" className="gap-1" data-testid="tab-expired">
              Expired
              {complianceData.expired.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">{complianceData.expired.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="expiring30" data-testid="tab-expiring30">
              30 Days
              {complianceData.expiring30.length > 0 && (
                <Badge className="ml-1 h-5 px-1.5 bg-orange-500/10 text-orange-600">{complianceData.expiring30.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="expiring60" data-testid="tab-expiring60">60 Days</TabsTrigger>
            <TabsTrigger value="missing" data-testid="tab-missing">Missing</TabsTrigger>
          </TabsList>

          <TabsContent value="expired" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-red-600">
                  <IdCard className="h-5 w-5" />
                  Expired Licenses
                </CardTitle>
                <CardDescription>These drivers have expired licenses and need immediate attention</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : complianceData.expired.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No expired licenses</p>
                ) : (
                  <div className="space-y-2">
                    {complianceData.expired.map(driver => (
                      <DriverComplianceRow key={driver.id} driver={driver} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expiring30" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-orange-600">
                  <IdCard className="h-5 w-5" />
                  Expiring Within 30 Days
                </CardTitle>
                <CardDescription>These licenses will expire soon</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : complianceData.expiring30.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No licenses expiring in 30 days</p>
                ) : (
                  <div className="space-y-2">
                    {complianceData.expiring30.map(driver => (
                      <DriverComplianceRow key={driver.id} driver={driver} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expiring60" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <IdCard className="h-5 w-5" />
                  Expiring Within 60 Days
                </CardTitle>
                <CardDescription>Plan ahead for these upcoming expirations</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : complianceData.expiring60.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No licenses expiring in 60 days</p>
                ) : (
                  <div className="space-y-2">
                    {complianceData.expiring60.map(driver => (
                      <DriverComplianceRow key={driver.id} driver={driver} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="missing" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileX className="h-5 w-5" />
                  Missing License Information
                </CardTitle>
                <CardDescription>These drivers need to provide license documentation</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : complianceData.missingLicense.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">All drivers have license information on file</p>
                ) : (
                  <div className="space-y-2">
                    {complianceData.missingLicense.map(driver => (
                      <DriverComplianceRow key={driver.id} driver={driver} showExpiry={false} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
