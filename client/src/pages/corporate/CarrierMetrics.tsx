import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Shield,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertTriangle,
  CheckCircle,
  Download,
  BarChart3,
  Target,
  Loader2,
  DollarSign,
  Percent,
  Clock,
  MapPin,
  Users,
  FileText,
  AlertCircle,
  ClipboardList,
  ArrowRight,
} from "lucide-react";

interface CarrierMetrics {
  lossExperience: {
    totalIncurred: number;
    totalPaid: number;
    totalReserved: number;
    lossRatio: number;
    claimFrequencyRate: number;
    averageClaimCost: number;
    totalTrips: number;
    claimsPerHundredTrips: number;
  };
  claimsProfile: {
    totalClaims: number;
    openClaims: number;
    closedClaims: number;
    bySeverity: { severity: string; count: number; totalCost: number }[];
    byType: { type: string; count: number; percentage: number }[];
    averageDaysToResolution: number;
  };
  riskIndicators: {
    atFaultPercentage: number;
    repeatClaimants: { driverId: string; driverName: string; claimCount: number }[];
    highRiskLocations: { location: string; claimCount: number }[];
    trendDirection: 'improving' | 'stable' | 'worsening';
    currentPeriodClaims: number;
    priorPeriodClaims: number;
  };
  operationalQuality: {
    slaComplianceRate: number;
    latePickupPercentage: number;
    escalationRate: number;
    coverageGaps: number;
  };
  underwritingSummary: {
    riskScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    narrative: string;
    strengths: string[];
    concerns: string[];
  };
  period: { startDate: string; endDate: string };
}

function TrendIndicator({ direction }: { direction: string }) {
  if (direction === "improving") {
    return (
      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
        <TrendingDown className="h-4 w-4" />
        <span className="text-sm font-medium">Improving</span>
      </div>
    );
  }
  if (direction === "worsening") {
    return (
      <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
        <TrendingUp className="h-4 w-4" />
        <span className="text-sm font-medium">Worsening</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <Minus className="h-4 w-4" />
      <span className="text-sm font-medium">Stable</span>
    </div>
  );
}

function getRiskLevelBadge(level: string) {
  switch (level) {
    case 'LOW':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">LOW RISK</Badge>;
    case 'MEDIUM':
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">MEDIUM RISK</Badge>;
    case 'HIGH':
      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">HIGH RISK</Badge>;
    case 'CRITICAL':
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">CRITICAL RISK</Badge>;
    default:
      return <Badge>{level}</Badge>;
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'LOW': return 'bg-green-500';
    case 'MEDIUM': return 'bg-yellow-500';
    case 'HIGH': return 'bg-orange-500';
    case 'CRITICAL': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
}

export default function CarrierMetricsPage() {
  const [accountId, setAccountId] = useState<string>("");

  const { data: metrics, isLoading, error } = useQuery<CarrierMetrics>({
    queryKey: ['/api/carrier-metrics', accountId],
    queryFn: async () => {
      const url = accountId 
        ? `/api/carrier-metrics?accountId=${accountId}` 
        : '/api/carrier-metrics';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch metrics');
      return res.json();
    },
  });

  const handleExportPDF = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="p-6">
        <Card className="border-red-500/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="h-5 w-5" />
              <span>Failed to load carrier metrics. Please try again.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 print:p-0 print:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="page-title">
            <Shield className="h-8 w-8 text-primary" />
            Carrier Underwriting Metrics
          </h1>
          <p className="text-muted-foreground">
            Insurance-grade loss experience and risk analysis for underwriting presentations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleExportPDF} data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">DriverHub 360 - Carrier Underwriting Report</h1>
        <p className="text-sm text-gray-600">
          Period: {metrics.period.startDate} to {metrics.period.endDate}
        </p>
      </div>

      {/* Risk Summary Banner */}
      <Card className="border-2" data-testid="card-risk-summary">
        <CardContent className="p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-4xl font-bold" data-testid="text-risk-score">
                  {metrics.underwritingSummary.riskScore}
                </div>
                <div className="text-sm text-muted-foreground">Risk Score</div>
              </div>
              <div>
                {getRiskLevelBadge(metrics.underwritingSummary.riskLevel)}
              </div>
            </div>
            <div className="flex-1 max-w-2xl">
              <p className="text-sm text-muted-foreground" data-testid="text-narrative">
                {metrics.underwritingSummary.narrative}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loss Experience Section */}
      <section data-testid="section-loss-experience">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Loss Experience Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card data-testid="card-total-incurred">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total Incurred</div>
              <div className="text-2xl font-bold">${metrics.lossExperience.totalIncurred.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Paid: ${metrics.lossExperience.totalPaid.toLocaleString()} | Reserved: ${metrics.lossExperience.totalReserved.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-loss-ratio">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Loss Ratio</div>
              <div className={`text-2xl font-bold ${metrics.lossExperience.lossRatio > 5 ? 'text-red-500' : ''}`}>
                {metrics.lossExperience.lossRatio.toFixed(2)}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Target: &lt;5%
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-claim-frequency">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Claim Frequency</div>
              <div className={`text-2xl font-bold ${metrics.lossExperience.claimsPerHundredTrips > 1 ? 'text-red-500' : ''}`}>
                {metrics.lossExperience.claimsPerHundredTrips.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                per 100 trips ({metrics.lossExperience.totalTrips.toLocaleString()} total)
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-avg-claim-cost">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Average Claim Cost</div>
              <div className="text-2xl font-bold">
                ${metrics.lossExperience.averageClaimCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {metrics.claimsProfile.totalClaims} total claims
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Claims Profile Section */}
      <section data-testid="section-claims-profile">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Claims Profile
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {/* Claims Status */}
          <Card data-testid="card-claims-status">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Claims Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Open Claims</span>
                  <Badge variant="outline" className="font-mono">{metrics.claimsProfile.openClaims}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Closed Claims</span>
                  <Badge variant="outline" className="font-mono">{metrics.claimsProfile.closedClaims}</Badge>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Total Claims</span>
                  <Badge className="font-mono">{metrics.claimsProfile.totalClaims}</Badge>
                </div>
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <span>Avg. Resolution Time</span>
                  <span>{metrics.claimsProfile.averageDaysToResolution.toFixed(0)} days</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Severity Distribution */}
          <Card data-testid="card-severity-distribution">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Severity Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {metrics.claimsProfile.bySeverity.map((item) => (
                  <div key={item.severity} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${getSeverityColor(item.severity)}`} />
                        {item.severity}
                      </span>
                      <span className="font-mono">{item.count} (${item.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
                    </div>
                    <Progress 
                      value={metrics.claimsProfile.totalClaims > 0 ? (item.count / metrics.claimsProfile.totalClaims) * 100 : 0} 
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Claim Types */}
          <Card data-testid="card-claim-types">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Claim Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {metrics.claimsProfile.byType.slice(0, 5).map((item) => (
                  <div key={item.type} className="flex justify-between items-center text-sm">
                    <span className="capitalize">{item.type.replace(/_/g, ' ').toLowerCase()}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{item.count}</span>
                      <Badge variant="secondary" className="text-xs">
                        {item.percentage.toFixed(0)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Risk Indicators Section */}
      <section data-testid="section-risk-indicators">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Risk Indicators
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {/* At-Fault & Trends */}
          <Card data-testid="card-fault-trends">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fault & Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-muted-foreground">At-Fault Percentage</span>
                    <span className={`font-bold ${metrics.riskIndicators.atFaultPercentage > 50 ? 'text-red-500' : ''}`}>
                      {metrics.riskIndicators.atFaultPercentage.toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={metrics.riskIndicators.atFaultPercentage} className="h-2" />
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Claims Trend</span>
                  <TrendIndicator direction={metrics.riskIndicators.trendDirection} />
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Current Period</span>
                  <span className="font-mono">{metrics.riskIndicators.currentPeriodClaims}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Prior Period</span>
                  <span className="font-mono">{metrics.riskIndicators.priorPeriodClaims}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Repeat Claimants */}
          <Card data-testid="card-repeat-claimants">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Repeat Claimants
              </CardTitle>
              <CardDescription>Drivers with 2+ claims</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.riskIndicators.repeatClaimants.length === 0 ? (
                <div className="flex items-center gap-2 text-green-600 py-2">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">No repeat claimants</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {metrics.riskIndicators.repeatClaimants.slice(0, 5).map((driver) => (
                    <div key={driver.driverId} className="flex justify-between items-center text-sm">
                      <span className="truncate max-w-[150px]">{driver.driverName}</span>
                      <Badge variant="destructive">{driver.claimCount} claims</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* High Risk Locations */}
          <Card data-testid="card-high-risk-locations">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                High-Risk Locations
              </CardTitle>
              <CardDescription>Top locations by claim count</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.riskIndicators.highRiskLocations.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">
                  No location data available
                </div>
              ) : (
                <div className="space-y-2">
                  {metrics.riskIndicators.highRiskLocations.map((loc, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <span className="truncate max-w-[150px]">{loc.location}</span>
                      <Badge variant="outline">{loc.claimCount}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Operational Quality Section */}
      <section data-testid="section-operational-quality">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Target className="h-5 w-5" />
          Operational Quality
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card data-testid="card-sla-compliance">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">SLA Compliance</div>
              <div className={`text-2xl font-bold ${metrics.operationalQuality.slaComplianceRate < 90 ? 'text-red-500' : 'text-green-600'}`}>
                {metrics.operationalQuality.slaComplianceRate.toFixed(1)}%
              </div>
              <Progress value={metrics.operationalQuality.slaComplianceRate} className="h-2 mt-2" />
            </CardContent>
          </Card>
          <Card data-testid="card-late-pickups">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Late Pickup Rate</div>
              <div className={`text-2xl font-bold ${metrics.operationalQuality.latePickupPercentage > 5 ? 'text-red-500' : ''}`}>
                {metrics.operationalQuality.latePickupPercentage.toFixed(2)}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">Target: &lt;5%</div>
            </CardContent>
          </Card>
          <Card data-testid="card-escalation-rate">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Escalation Rate</div>
              <div className={`text-2xl font-bold ${metrics.operationalQuality.escalationRate > 2 ? 'text-red-500' : ''}`}>
                {metrics.operationalQuality.escalationRate.toFixed(2)}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">Target: &lt;2%</div>
            </CardContent>
          </Card>
          <Card data-testid="card-coverage-gaps">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Coverage Gaps</div>
              <div className={`text-2xl font-bold ${metrics.operationalQuality.coverageGaps > 0 ? 'text-yellow-500' : 'text-green-600'}`}>
                {metrics.operationalQuality.coverageGaps}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Missed coverage incidents</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Underwriting Summary Section */}
      <section data-testid="section-underwriting-summary">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Underwriting Summary
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Strengths */}
          <Card className="border-green-500/30" data-testid="card-strengths">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                Favorable Indicators
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.underwritingSummary.strengths.length === 0 ? (
                <p className="text-sm text-muted-foreground">No specific strengths identified in this period.</p>
              ) : (
                <ul className="space-y-2">
                  {metrics.underwritingSummary.strengths.map((strength, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <ArrowRight className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                      {strength}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Concerns */}
          <Card className="border-red-500/30" data-testid="card-concerns">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                Risk Concerns
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.underwritingSummary.concerns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No specific concerns identified in this period.</p>
              ) : (
                <ul className="space-y-2">
                  {metrics.underwritingSummary.concerns.map((concern, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <ArrowRight className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
                      {concern}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Period Info */}
      <div className="text-center text-sm text-muted-foreground pt-4 border-t">
        Data period: {metrics.period.startDate} to {metrics.period.endDate} (trailing 12 months)
      </div>
    </div>
  );
}
