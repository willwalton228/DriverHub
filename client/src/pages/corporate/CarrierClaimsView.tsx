import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ShieldAlert, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertCircle, 
  Download, 
  Printer,
  Building2,
  Calendar,
  DollarSign,
  Activity,
  FileText,
  Shield
} from "lucide-react";

interface CarrierMetrics {
  summary: {
    totalTrips: number;
    totalClaims: number;
    totalIncurred: number;
    totalRevenue: number;
    lossRatio: number;
    claimFrequency: number;
  };
  severityDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  claimTypes: { type: string; count: number; cost: number }[];
  monthlyTrend: { month: string; claims: number; incurred: number; trips: number }[];
  riskIndicators: {
    atFaultPercentage: number;
    repeatClaimants: number;
    highRiskLocations: { location: string; count: number }[];
  };
  operationalMetrics: {
    slaCompliance: number;
    tripCompletionRate: number;
    avgResponseTime: number;
  };
  riskScore: number;
  riskLevel: string;
  narrative: string;
}

function getRiskBadgeColor(level: string) {
  switch (level.toUpperCase()) {
    case 'LOW': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'HIGH': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'CRITICAL': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  }
}

export default function CarrierClaimsView() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  
  const { data: fleetMetrics, isLoading: fleetLoading, error: fleetError } = useQuery<CarrierMetrics>({
    queryKey: ['/api/carrier-metrics'],
    queryFn: async () => {
      const res = await fetch('/api/carrier-metrics', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch carrier metrics');
      return res.json();
    },
  });

  const { data: accounts } = useQuery<any[]>({
    queryKey: ['/api/customers'],
    queryFn: async () => {
      const res = await fetch('/api/customers', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
  });

  const { data: accountMetrics, isLoading: accountLoading } = useQuery<CarrierMetrics>({
    queryKey: ['/api/accounts', selectedAccountId, 'carrier-metrics'],
    queryFn: async () => {
      const res = await fetch(`/api/accounts/${selectedAccountId}/carrier-metrics`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch account carrier metrics');
      return res.json();
    },
    enabled: !!selectedAccountId,
  });

  const metrics = selectedAccountId ? accountMetrics : fleetMetrics;
  const isLoading = selectedAccountId ? accountLoading : fleetLoading;

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    if (!metrics) return;
    const data = JSON.stringify(metrics, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carrier-claims-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (fleetError || !metrics) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg text-muted-foreground">Unable to load carrier metrics</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 print:p-0" data-testid="page-carrier-claims-view">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Shield className="h-6 w-6 text-orange-500" />
            Carrier Claims Intelligence
          </h1>
          <p className="text-muted-foreground">Insurance-grade risk analysis and underwriting metrics</p>
        </div>
        <div className="flex gap-2">
          <select
            className="border rounded-md px-3 py-2 text-sm bg-background"
            value={selectedAccountId || ''}
            onChange={(e) => setSelectedAccountId(e.target.value || null)}
            data-testid="select-account"
          >
            <option value="">Fleet-wide View</option>
            {accounts?.map((acc: any) => (
              <option key={acc.id} value={acc.id}>{acc.customerName}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block mb-8">
        <h1 className="text-3xl font-bold">DriverHub 360 - Carrier Claims Report</h1>
        <p className="text-lg text-muted-foreground">
          Generated: {new Date().toLocaleDateString()} | 
          {selectedAccountId ? ' Account-specific Report' : ' Fleet-wide Report'}
        </p>
      </div>

      {/* Risk Score Overview */}
      <Card className="border-2 border-orange-200 dark:border-orange-800" data-testid="card-risk-overview">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Risk Assessment
            </CardTitle>
            <Badge className={`text-lg px-4 py-2 ${getRiskBadgeColor(metrics.riskLevel)}`} data-testid="badge-risk-level">
              {metrics.riskLevel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-orange-500" data-testid="text-risk-score">
                {metrics.riskScore}
              </div>
              <div className="text-sm text-muted-foreground">Risk Score (0-100)</div>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm leading-relaxed" data-testid="text-risk-narrative">
                {metrics.narrative}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-loss-ratio">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loss Ratio</span>
            </div>
            <div className={`text-2xl font-bold ${metrics.summary.lossRatio > 5 ? 'text-red-500' : 'text-green-500'}`}>
              {metrics.summary.lossRatio.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">Target: &lt;5%</div>
          </CardContent>
        </Card>
        <Card data-testid="card-claim-frequency">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Claim Frequency</span>
            </div>
            <div className={`text-2xl font-bold ${metrics.summary.claimFrequency > 1 ? 'text-red-500' : 'text-green-500'}`}>
              {metrics.summary.claimFrequency.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Per 100 trips</div>
          </CardContent>
        </Card>
        <Card data-testid="card-total-incurred">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Incurred</span>
            </div>
            <div className="text-2xl font-bold">
              ${metrics.summary.totalIncurred.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">90-day period</div>
          </CardContent>
        </Card>
        <Card data-testid="card-total-trips">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Trips</span>
            </div>
            <div className="text-2xl font-bold">
              {metrics.summary.totalTrips.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">90-day period</div>
          </CardContent>
        </Card>
      </div>

      {/* Severity Distribution & Claim Types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card data-testid="card-severity-distribution">
          <CardHeader>
            <CardTitle className="text-lg">Severity Distribution</CardTitle>
            <CardDescription>Claims categorized by severity level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: 'Low', count: metrics.severityDistribution.low, color: 'bg-green-500' },
                { label: 'Medium', count: metrics.severityDistribution.medium, color: 'bg-yellow-500' },
                { label: 'High', count: metrics.severityDistribution.high, color: 'bg-orange-500' },
                { label: 'Critical', count: metrics.severityDistribution.critical, color: 'bg-red-500' },
              ].map((item, i) => {
                const total = metrics.severityDistribution.low + metrics.severityDistribution.medium + 
                              metrics.severityDistribution.high + metrics.severityDistribution.critical;
                const percentage = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm w-16">{item.label}</span>
                    <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                      <div className={`h-full ${item.color}`} style={{ width: `${percentage}%` }} />
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{item.count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-claim-types">
          <CardHeader>
            <CardTitle className="text-lg">Top Claim Types</CardTitle>
            <CardDescription>Most frequent claim categories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.claimTypes.slice(0, 5).map((type, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm">{type.type}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{type.count} claims</span>
                    <span className="text-sm font-medium">${type.cost.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend */}
      <Card data-testid="card-monthly-trend">
        <CardHeader>
          <CardTitle className="text-lg">90-Day Claims Trend</CardTitle>
          <CardDescription>Monthly claims activity and costs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {metrics.monthlyTrend.map((month, i) => {
              const maxIncurred = Math.max(...metrics.monthlyTrend.map(m => m.incurred), 1);
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm w-12">{month.month}</span>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div 
                      className="h-full bg-orange-500" 
                      style={{ width: `${(month.incurred / maxIncurred) * 100}%` }} 
                    />
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="w-20 text-right">{month.claims} claims</span>
                    <span className="w-24 text-right font-medium">${month.incurred.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Risk Indicators & Operational Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card data-testid="card-risk-indicators">
          <CardHeader>
            <CardTitle className="text-lg">Risk Indicators</CardTitle>
            <CardDescription>Key risk factors for underwriting</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm">At-Fault Percentage</span>
                <Badge className={metrics.riskIndicators.atFaultPercentage > 50 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
                  {metrics.riskIndicators.atFaultPercentage.toFixed(0)}%
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Repeat Claimants</span>
                <Badge className={metrics.riskIndicators.repeatClaimants > 5 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}>
                  {metrics.riskIndicators.repeatClaimants}
                </Badge>
              </div>
              {metrics.riskIndicators.highRiskLocations.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">High-Risk Locations:</span>
                  <div className="mt-2 space-y-1">
                    {metrics.riskIndicators.highRiskLocations.slice(0, 3).map((loc, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="truncate">{loc.location}</span>
                        <span className="text-muted-foreground">{loc.count} claims</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-operational-metrics">
          <CardHeader>
            <CardTitle className="text-lg">Operational Quality</CardTitle>
            <CardDescription>Service performance indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm">SLA Compliance</span>
                <Badge className={metrics.operationalMetrics.slaCompliance >= 95 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                  {metrics.operationalMetrics.slaCompliance.toFixed(0)}%
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Trip Completion Rate</span>
                <Badge className={metrics.operationalMetrics.tripCompletionRate >= 98 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                  {metrics.operationalMetrics.tripCompletionRate.toFixed(1)}%
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Avg Response Time</span>
                <span className="text-sm font-medium">{metrics.operationalMetrics.avgResponseTime.toFixed(0)} min</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer for Print */}
      <div className="hidden print:block mt-8 pt-4 border-t text-center text-sm text-muted-foreground">
        <p>DriverHub 360 - Confidential Insurance Report</p>
        <p>Generated on {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
}
