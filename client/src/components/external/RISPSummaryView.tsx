import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft, 
  Shield, 
  Download, 
  FileBarChart,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  Camera,
  AlertTriangle
} from "lucide-react";

type GrantInfo = {
  grantId: string;
  granteeEmail: string;
  granteeName: string;
  granteeOrganization: string;
  role: string;
  scopes: string[];
  expiresAt: string;
  customerRestriction: string | null;
  claimRestriction: string | null;
};

type RISPMetrics = {
  period: string;
  aggregatedMetrics: {
    totalMoves: number;
    totalIncidents: number;
    incidentRate: number;
    avgFNOLLatencyHours: number;
    proofCoverageRate: number;
    photoComplianceRate: number;
    timelyPhotoRate: number;
  };
  topRiskFactors: Array<{
    factor: string;
    count: number;
    percentage: number;
  }>;
  marketBreakdown: Array<{
    market: string;
    moves: number;
    incidents: number;
    incidentRate: number;
  }>;
  trendData: Array<{
    period: string;
    incidentRate: number;
    proofCoverage: number;
  }>;
};

interface RISPSummaryViewProps {
  token: string;
  grantInfo: GrantInfo;
  onBack: () => void;
  onLogout: () => void;
}

export default function RISPSummaryView({ token, grantInfo, onBack, onLogout }: RISPSummaryViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<RISPMetrics | null>(null);
  const [periodDays, setPeriodDays] = useState("30");

  async function fetchMetrics() {
    setIsLoading(true);
    setError(null);
    try {
      const url = new URL("/api/external/risp-summary", window.location.origin);
      url.searchParams.set("periodDays", periodDays);
      if (grantInfo.customerRestriction) {
        url.searchParams.set("customerId", grantInfo.customerRestriction);
      }
      
      const response = await fetch(url.toString(), {
        headers: {
          "x-access-token": token,
        },
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to fetch metrics");
      }
      
      const data = await response.json();
      setMetrics(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch RISP summary");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchMetrics();
  }, [periodDays]);

  function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  function formatNumber(value: number): string {
    return value.toLocaleString();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">RISP Insurance Summary</h1>
                <p className="text-sm text-muted-foreground">Read-only external access</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{grantInfo.granteeName}</p>
              <p className="text-xs text-muted-foreground">{grantInfo.granteeOrganization}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout} data-testid="button-logout">
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Risk & Insurance Summary Profile</h2>
            <p className="text-muted-foreground">
              Aggregated risk metrics for carrier/broker analysis
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={periodDays} onValueChange={setPeriodDays}>
              <SelectTrigger className="w-40" data-testid="select-period">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="60">Last 60 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : metrics ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Moves</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-moves">
                    {formatNumber(metrics.aggregatedMetrics.totalMoves)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Incidents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-incidents">
                    {formatNumber(metrics.aggregatedMetrics.totalIncidents)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Incident Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold" data-testid="text-incident-rate">
                      {formatPercent(metrics.aggregatedMetrics.incidentRate)}
                    </span>
                    {metrics.aggregatedMetrics.incidentRate < 0.05 ? (
                      <TrendingDown className="h-5 w-5 text-green-500" />
                    ) : (
                      <TrendingUp className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg FNOL Latency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <span className="text-2xl font-bold" data-testid="text-fnol-latency">
                      {metrics.aggregatedMetrics.avgFNOLLatencyHours.toFixed(1)}h
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <CardTitle className="text-sm font-medium">Proof Coverage Rate</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-2xl font-bold" data-testid="text-proof-coverage">
                      {formatPercent(metrics.aggregatedMetrics.proofCoverageRate)}
                    </div>
                    <Progress value={metrics.aggregatedMetrics.proofCoverageRate * 100} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-blue-500" />
                    <CardTitle className="text-sm font-medium">Photo Compliance Rate</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-2xl font-bold" data-testid="text-photo-compliance">
                      {formatPercent(metrics.aggregatedMetrics.photoComplianceRate)}
                    </div>
                    <Progress value={metrics.aggregatedMetrics.photoComplianceRate * 100} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-orange-500" />
                    <CardTitle className="text-sm font-medium">Timely Photo Rate</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-2xl font-bold" data-testid="text-timely-photo">
                      {formatPercent(metrics.aggregatedMetrics.timelyPhotoRate)}
                    </div>
                    <Progress value={metrics.aggregatedMetrics.timelyPhotoRate * 100} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    Top Risk Factors
                  </CardTitle>
                  <CardDescription>Most common risk factors in the period</CardDescription>
                </CardHeader>
                <CardContent>
                  {metrics.topRiskFactors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No risk factors identified</p>
                  ) : (
                    <div className="space-y-3">
                      {metrics.topRiskFactors.map((factor, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{index + 1}</Badge>
                            <span className="text-sm font-medium">{factor.factor}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">{factor.count} incidents</span>
                            <Badge variant="secondary">{formatPercent(factor.percentage / 100)}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileBarChart className="h-5 w-5 text-blue-500" />
                    Market Breakdown
                  </CardTitle>
                  <CardDescription>Performance by market region</CardDescription>
                </CardHeader>
                <CardContent>
                  {metrics.marketBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No market data available</p>
                  ) : (
                    <div className="space-y-3">
                      {metrics.marketBreakdown.slice(0, 5).map((market, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{market.market}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-muted-foreground">{formatNumber(market.moves)} moves</span>
                            <Badge 
                              variant={market.incidentRate < 0.05 ? "default" : "destructive"}
                            >
                              {formatPercent(market.incidentRate)} incident rate
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Data Privacy Notice</AlertTitle>
              <AlertDescription>
                This report contains aggregated metrics only. No driver-identifiable information or 
                surveillance data is included. All data has been anonymized in compliance with data 
                protection requirements.
              </AlertDescription>
            </Alert>

            <div className="text-center text-sm text-muted-foreground">
              <p>Report generated for {grantInfo.granteeOrganization}</p>
              <p>Period: Last {periodDays} days | Grant ID: {grantInfo.grantId}</p>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
