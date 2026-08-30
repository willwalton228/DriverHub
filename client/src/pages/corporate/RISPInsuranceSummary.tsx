import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Download, FileText, Sheet, ShieldCheck, AlertTriangle, Clock, Camera, Video, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Market } from "@shared/schema";

interface RISPSummaryMetrics {
  totalMoves: number;
  movesWithFullProof: number;
  proofCoveragePercent: number;
  movesWithWalkaroundVideo: number;
  walkaroundVideoPercent: number;
  totalIncidents: number;
  incidentsPer1000Moves: number;
  avgFnolLatencyHours: number | null;
  topRiskFactors: { factor: string; count: number; percentage: number }[];
  periodStart: string;
  periodEnd: string;
  customerName?: string;
  marketName?: string;
}

interface RISPControlCoverage {
  controlId: string;
  controlName: string;
  controlType: string;
  linkedEntities: number;
  coverageIndicator: string;
}

interface SummaryResponse {
  metrics: RISPSummaryMetrics;
  controlCoverage: RISPControlCoverage[];
}

export default function RISPInsuranceSummary() {
  const { toast } = useToast();
  const [days, setDays] = useState("30");
  const [customerId, setCustomerId] = useState<string>("");
  const [marketId, setMarketId] = useState<string>("");

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/corporate/customers"],
  });

  const { data: markets = [] } = useQuery<Market[]>({
    queryKey: ["/api/corporate/markets"],
  });

  const queryParams = new URLSearchParams({ days });
  if (customerId) queryParams.set("customerId", customerId);
  if (marketId) queryParams.set("marketId", marketId);

  const { data, isLoading, refetch, isRefetching } = useQuery<SummaryResponse>({
    queryKey: ["/api/risp/summary", days, customerId, marketId],
    queryFn: async () => {
      const res = await fetch(`/api/risp/summary?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
  });

  const metrics = data?.metrics;
  const controlCoverage = data?.controlCoverage || [];

  const handleExportPDF = () => {
    const url = `/api/risp/summary/export/pdf?${queryParams.toString()}`;
    window.open(url, "_blank");
    toast({ title: "PDF export started" });
  };

  const handleExportCSV = () => {
    const url = `/api/risp/summary/export/csv?${queryParams.toString()}`;
    window.open(url, "_blank");
    toast({ title: "CSV export started" });
  };

  const getCoverageColor = (indicator: string) => {
    switch (indicator) {
      case "High": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "Medium": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      default: return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="risp-summary-page">
      <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
        <span>Data source: <strong className="text-foreground">Claims module</strong> &mdash; records from <strong className="text-foreground">2026-02-09</strong> onwards only</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">RISP Insurance Summary</h1>
          <p className="text-muted-foreground">Carrier-ready risk and loss metrics (aggregated, non-driver-specific)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            disabled={isRefetching}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} data-testid="button-export-pdf">
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-csv">
            <Sheet className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-40">
              <label className="text-sm font-medium mb-1 block">Time Period</label>
              <Select value={days} onValueChange={setDays} data-testid="select-days">
                <SelectTrigger data-testid="select-days-trigger">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="60">Last 60 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-56">
              <label className="text-sm font-medium mb-1 block">Customer</label>
              <Select value={customerId || "__all__"} onValueChange={(v) => setCustomerId(v === "__all__" ? "" : v)} data-testid="select-customer">
                <SelectTrigger data-testid="select-customer-trigger">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Customers</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.customerName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-56">
              <label className="text-sm font-medium mb-1 block">Market</label>
              <Select value={marketId || "__all__"} onValueChange={(v) => setMarketId(v === "__all__" ? "" : v)} data-testid="select-market">
                <SelectTrigger data-testid="select-market-trigger">
                  <SelectValue placeholder="All Markets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Markets</SelectItem>
                  {markets.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : metrics ? (
        <>
          <div className="text-sm text-muted-foreground">
            Report Period: {metrics.periodStart} to {metrics.periodEnd}
            {metrics.customerName && ` | Customer: ${metrics.customerName}`}
            {metrics.marketName && ` | Market: ${metrics.marketName}`}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <Card data-testid="card-total-moves">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Total Moves
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalMoves.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card data-testid="card-proof-coverage">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Full Proof Coverage
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.proofCoveragePercent}%</div>
                <div className="text-xs text-muted-foreground">{metrics.movesWithFullProof.toLocaleString()} moves</div>
              </CardContent>
            </Card>

            <Card data-testid="card-walkaround-video">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Walkaround Video
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.walkaroundVideoPercent}%</div>
                <div className="text-xs text-muted-foreground">{metrics.movesWithWalkaroundVideo.toLocaleString()} moves</div>
              </CardContent>
            </Card>

            <Card data-testid="card-total-incidents">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Total Incidents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalIncidents}</div>
              </CardContent>
            </Card>

            <Card data-testid="card-incidents-per-1000">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Incidents/1,000 Moves
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.incidentsPer1000Moves}</div>
              </CardContent>
            </Card>

            <Card data-testid="card-fnol-latency">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Avg FNOL Latency
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.avgFnolLatencyHours !== null ? `${metrics.avgFnolLatencyHours}h` : "N/A"}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="card-risk-factors">
              <CardHeader>
                <CardTitle className="text-lg">Top Risk Factors (Non-Driver-Specific)</CardTitle>
                <CardDescription>Aggregated incident types for the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics.topRiskFactors.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No incidents recorded in this period.</p>
                ) : (
                  <div className="space-y-3">
                    {metrics.topRiskFactors.map((rf, i) => (
                      <div key={rf.factor} className="flex items-center justify-between" data-testid={`risk-factor-${i}`}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{i + 1}</Badge>
                          <span className="font-medium">{rf.factor}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{rf.count} incidents</span>
                          <Badge variant="secondary">{rf.percentage}%</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-control-coverage">
              <CardHeader>
                <CardTitle className="text-lg">RISP Control Coverage</CardTitle>
                <CardDescription>Active controls and their entity linkage</CardDescription>
              </CardHeader>
              <CardContent>
                {controlCoverage.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No active RISP controls configured.</p>
                ) : (
                  <div className="space-y-3">
                    {controlCoverage.map((cc) => (
                      <div key={cc.controlId} className="flex items-center justify-between" data-testid={`control-${cc.controlId}`}>
                        <div>
                          <span className="font-medium">{cc.controlName}</span>
                          <Badge variant="outline" className="ml-2 text-xs">{cc.controlType}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-sm">{cc.linkedEntities} entities</span>
                          <Badge className={getCoverageColor(cc.coverageIndicator)}>{cc.coverageIndicator}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center">
                This report contains aggregated metrics only. No driver-identifiable surveillance data is included.
                <br />
                Suitable for external sharing with carriers and brokers.
              </p>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No data available. Please try refreshing.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
