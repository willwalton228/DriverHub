import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Shield, CheckCircle2, AlertCircle, XCircle, Clock, Users, 
  FileCheck, TrendingUp, MapPin, Loader2, RefreshCw, Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ComplianceDashboardSummary {
  generatedAt: string;
  
  byMarket: {
    market: string;
    totalCandidates: number;
    totalApplications: number;
    readyCount: number;
    inReviewCount: number;
    notReadyCount: number;
    docsCompleteCount: number;
    backgroundPassedCount: number;
  }[];
  
  overallStats: {
    totalCandidates: number;
    totalApplications: number;
    readyPercentage: number;
    docsCompletePercentage: number;
    backgroundPassedPercentage: number;
    averageReadinessScore: number;
  };
  
  recentReadinessChanges: {
    applicationId: string;
    candidateName: string;
    market: string;
    previousStatus: string | null;
    newStatus: string;
    changedAt: string;
  }[];
}

const statusColors: Record<string, string> = {
  ready: "text-green-600 dark:text-green-400",
  in_review: "text-yellow-600 dark:text-yellow-400",
  not_ready: "text-red-600 dark:text-red-400",
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function ComplianceDashboard() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<ComplianceDashboardSummary>({
    queryKey: ['/api/recruiting/compliance-dashboard'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <p className="text-lg font-medium text-red-600 dark:text-red-400">Failed to load compliance dashboard</p>
          <p className="text-sm text-muted-foreground mt-1">Please try again or contact support</p>
          <Button variant="outline" className="mt-4" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const { overallStats, byMarket, recentReadinessChanges } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Compliance Overview
          </h2>
          <p className="text-sm text-muted-foreground">
            Recruiting compliance status for legal and insurer review
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()} 
          disabled={isFetching}
          data-testid="button-refresh-compliance"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-candidates">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Total Candidates</span>
            </div>
            <div className="text-2xl font-bold">{overallStats.totalCandidates}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-total-applications">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Building2 className="h-4 w-4" />
              <span className="text-xs">Total Applications</span>
            </div>
            <div className="text-2xl font-bold">{overallStats.totalApplications}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-ready-percentage">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs">Ready Rate</span>
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {overallStats.readyPercentage}%
            </div>
            <Progress value={overallStats.readyPercentage} className="h-1 mt-2" />
          </CardContent>
        </Card>

        <Card data-testid="card-avg-readiness">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Avg Readiness Score</span>
            </div>
            <div className="text-2xl font-bold">{overallStats.averageReadinessScore}%</div>
            <Progress value={overallStats.averageReadinessScore} className="h-1 mt-2" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-docs-complete">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-blue-500" />
                <span className="font-medium">Documents Complete</span>
              </div>
              <span className="text-2xl font-bold">{overallStats.docsCompletePercentage}%</span>
            </div>
            <Progress value={overallStats.docsCompletePercentage} className="h-2 mt-3" />
          </CardContent>
        </Card>

        <Card data-testid="card-background-passed">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-500" />
                <span className="font-medium">Background Checks Passed</span>
              </div>
              <span className="text-2xl font-bold">{overallStats.backgroundPassedPercentage}%</span>
            </div>
            <Progress value={overallStats.backgroundPassedPercentage} className="h-2 mt-3" />
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-market-breakdown">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Compliance by Market
          </CardTitle>
          <CardDescription>
            Breakdown of readiness status across all markets
          </CardDescription>
        </CardHeader>
        <CardContent>
          {byMarket.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No market data available</p>
          ) : (
            <div className="space-y-3">
              {byMarket.map((market) => {
                const total = market.totalApplications || 1;
                const readyPct = Math.round((market.readyCount / total) * 100);
                const inReviewPct = Math.round((market.inReviewCount / total) * 100);
                const notReadyPct = Math.round((market.notReadyCount / total) * 100);

                return (
                  <div 
                    key={market.market} 
                    className="p-3 rounded-lg border bg-card"
                    data-testid={`market-row-${market.market}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {market.market}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {market.totalApplications} applications
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span className="text-green-600 dark:text-green-400">{market.readyCount} Ready</span>
                        <span className="text-muted-foreground">({readyPct}%)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-yellow-500" />
                        <span className="text-yellow-600 dark:text-yellow-400">{market.inReviewCount} In Review</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <XCircle className="h-3 w-3 text-red-500" />
                        <span className="text-red-600 dark:text-red-400">{market.notReadyCount} Not Ready</span>
                      </div>
                    </div>

                    <div className="flex h-2 rounded-full overflow-hidden mt-2 bg-gray-100 dark:bg-gray-800">
                      <div 
                        className="bg-green-500" 
                        style={{ width: `${readyPct}%` }} 
                      />
                      <div 
                        className="bg-yellow-500" 
                        style={{ width: `${inReviewPct}%` }} 
                      />
                      <div 
                        className="bg-red-500" 
                        style={{ width: `${notReadyPct}%` }} 
                      />
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Docs: {market.docsCompleteCount} complete</span>
                      <span>Background: {market.backgroundPassedCount} passed</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-recent-changes">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Readiness Changes
          </CardTitle>
          <CardDescription>
            Latest status transitions for audit trail
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentReadinessChanges.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No recent changes</p>
          ) : (
            <div className="space-y-2">
              {recentReadinessChanges.map((change, idx) => (
                <div 
                  key={`${change.applicationId}-${idx}`}
                  className="flex items-center justify-between p-2 rounded border bg-card"
                  data-testid={`readiness-change-${change.applicationId}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{change.candidateName}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {change.market}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {change.previousStatus && (
                      <>
                        <Badge variant="outline" className={statusColors[change.previousStatus]}>
                          {change.previousStatus.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-muted-foreground">→</span>
                      </>
                    )}
                    <Badge className={`${
                      change.newStatus === 'ready' 
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : change.newStatus === 'in_review'
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {change.newStatus.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-2">
                      {formatDate(change.changedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ComplianceDashboard;
