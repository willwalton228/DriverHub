import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Calendar, Users, Info, BarChart3, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DailyForecast {
  date: string;
  dayOfWeek: number;
  dayName: string;
  historicalAvgStaff: number;
  historicalAvgVolume: number;
  recommendedMin: number;
  recommendedMax: number;
  confidence: 'high' | 'medium' | 'low' | 'none';
  currentScheduled: number;
  currentRequired: number;
  shiftCount: number;
  status: 'understaffed' | 'overstaffed' | 'adequate' | 'unscheduled';
}

interface HourlyPattern {
  hour: number;
  label: string;
  avgRequired: number;
  shiftCount: number;
}

interface ForecastData {
  forecastWindow: { start: string; end: string; days: number };
  summary: {
    understaffedDays: number;
    overstaffedDays: number;
    adequateDays: number;
    unscheduledDays: number;
    historicalDataAvailable: boolean;
    movesToStaffRatio: number;
  };
  dailyForecast: DailyForecast[];
  hourlyPattern: HourlyPattern[];
  locations: Array<{ id: string; name: string }>;
  advisory: string;
}

const statusConfig = {
  understaffed: { label: "Understaffed", icon: TrendingDown, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800" },
  overstaffed: { label: "Overstaffed", icon: TrendingUp, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800" },
  adequate: { label: "Adequate", icon: CheckCircle2, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800" },
  unscheduled: { label: "Unscheduled", icon: Calendar, color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
};

const confidenceConfig = {
  high: { label: "High", variant: "default" as const },
  medium: { label: "Med", variant: "secondary" as const },
  low: { label: "Low", variant: "outline" as const },
  none: { label: "N/A", variant: "outline" as const },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function LaborForecastTab() {
  const [forecastDays, setForecastDays] = useState("7");
  const [locationId, setLocationId] = useState("all");

  const { data, isLoading, isError, refetch } = useQuery<ForecastData>({
    queryKey: ['/api/corporate/scheduling/labor-forecast', forecastDays, locationId],
    queryFn: async () => {
      const params = new URLSearchParams({ forecastDays, locationId });
      const res = await fetch(`/api/corporate/scheduling/labor-forecast?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch forecast');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm" data-testid="error-labor-forecast">
        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        <span className="text-muted-foreground">Unable to load labor forecast.</span>
        <Button variant="ghost" size="sm" className="h-auto p-0 text-sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const forecast = data;
  const hasHistorical = forecast?.summary.historicalDataAvailable;
  const maxHourlyRequired = Math.max(...(forecast?.hourlyPattern.map(h => h.avgRequired) || [0]), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" data-testid="text-forecast-title">Labor Forecast</h2>
          <p className="text-sm text-muted-foreground">Forward-looking staffing guidance based on historical patterns</p>
        </div>
        <div className="flex flex-row flex-wrap items-center gap-3">
          <Select value={forecastDays} onValueChange={setForecastDays}>
            <SelectTrigger className="w-[140px]" data-testid="select-forecast-days">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Next 7 days</SelectItem>
              <SelectItem value="14">Next 14 days</SelectItem>
              <SelectItem value="30">Next 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className="w-[180px]" data-testid="select-forecast-location">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {forecast?.locations.map(loc => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-dashed" data-testid="card-advisory-notice">
        <CardContent className="flex items-start gap-3 py-3 px-4">
          <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">{forecast?.advisory}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-understaffed-days">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Understaffed</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400" data-testid="text-understaffed-count">
              {forecast?.summary.understaffedDays ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">days flagged</p>
          </CardContent>
        </Card>
        <Card data-testid="card-overstaffed-days">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Overstaffed</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400" data-testid="text-overstaffed-count">
              {forecast?.summary.overstaffedDays ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">days flagged</p>
          </CardContent>
        </Card>
        <Card data-testid="card-adequate-days">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Adequate</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400" data-testid="text-adequate-count">
              {forecast?.summary.adequateDays ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">days on track</p>
          </CardContent>
        </Card>
        <Card data-testid="card-unscheduled-days">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Unscheduled</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="text-unscheduled-count">
              {forecast?.summary.unscheduledDays ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">no shifts yet</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Daily Staffing Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasHistorical ? (
            <div className="text-center py-8" data-testid="text-no-historical-data">
              <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">No Historical Data Available</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Forecasting requires historical shift and volume data. As shifts are created and completed, 
                this view will begin showing staffing recommendations.
              </p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="list-daily-forecast">
              <div className="grid grid-cols-[100px_80px_1fr_100px_100px_80px_90px] gap-2 text-xs font-medium text-muted-foreground px-3 pb-1 border-b">
                <span>Date</span>
                <span>Day</span>
                <span>Recommended Range</span>
                <span className="text-center">Scheduled</span>
                <span className="text-center">Hist. Volume</span>
                <span className="text-center">Confidence</span>
                <span className="text-center">Status</span>
              </div>
              {forecast?.dailyForecast.map((day) => {
                const config = statusConfig[day.status];
                const StatusIcon = config.icon;
                const confConfig = confidenceConfig[day.confidence];
                return (
                  <div
                    key={day.date}
                    className={cn(
                      "grid grid-cols-[100px_80px_1fr_100px_100px_80px_90px] gap-2 items-center px-3 py-2 rounded-md border",
                      config.bg, config.border
                    )}
                    data-testid={`row-forecast-${day.date}`}
                  >
                    <span className="text-sm font-medium">{formatDate(day.date)}</span>
                    <span className="text-sm text-muted-foreground">{day.dayName.slice(0, 3)}</span>
                    <div className="flex items-center gap-2">
                      {day.recommendedMin > 0 ? (
                        <>
                          <div className="flex-1 relative h-6 bg-muted/50 rounded overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-primary/20 rounded"
                              style={{
                                width: `${Math.min((day.recommendedMax / Math.max(day.recommendedMax, day.currentScheduled, 1)) * 100, 100)}%`
                              }}
                            />
                            {day.currentScheduled > 0 && (
                              <div
                                className={cn(
                                  "absolute top-1 bottom-1 w-1 rounded-full",
                                  day.status === 'understaffed' ? 'bg-red-500' :
                                  day.status === 'overstaffed' ? 'bg-amber-500' :
                                  'bg-green-500'
                                )}
                                style={{
                                  left: `${Math.min((day.currentScheduled / Math.max(day.recommendedMax, day.currentScheduled, 1)) * 100, 98)}%`
                                }}
                              />
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap w-16">
                            {day.recommendedMin}-{day.recommendedMax}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Insufficient data</span>
                      )}
                    </div>
                    <span className="text-sm text-center">
                      <Users className="h-3 w-3 inline mr-1" />
                      {day.currentScheduled}
                    </span>
                    <span className="text-sm text-center text-muted-foreground">
                      {day.historicalAvgVolume > 0 ? `${day.historicalAvgVolume} moves` : '-'}
                    </span>
                    <div className="text-center">
                      <Badge variant={confConfig.variant} className="text-[10px] px-1.5">
                        {confConfig.label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <StatusIcon className={cn("h-3.5 w-3.5", config.color)} />
                      <span className={cn("text-xs font-medium", config.color)}>{config.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Historical Hourly Demand Pattern
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasHistorical ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Hourly patterns will populate as shift data accumulates.
            </p>
          ) : (
            <div className="space-y-1" data-testid="chart-hourly-pattern">
              {forecast?.hourlyPattern.filter(h => h.avgRequired > 0 || h.shiftCount > 0).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No hourly shift patterns recorded yet.
                </p>
              ) : (
                <div className="flex items-end gap-1 h-40 px-2">
                  {forecast?.hourlyPattern.map((h) => (
                    <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="w-full flex flex-col items-center justify-end" style={{ height: '120px' }}>
                        {h.avgRequired > 0 && (
                          <span className="text-[9px] text-muted-foreground mb-0.5">{h.avgRequired}</span>
                        )}
                        <div
                          className={cn(
                            "w-full rounded-t transition-all",
                            h.avgRequired > 0 ? "bg-primary/30" : "bg-muted/20"
                          )}
                          style={{ height: `${(h.avgRequired / maxHourlyRequired) * 100}px`, minHeight: h.avgRequired > 0 ? '4px' : '1px' }}
                        />
                      </div>
                      <span className="text-[9px] text-muted-foreground">{h.label.slice(0, 2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {forecast?.summary.movesToStaffRatio && forecast.summary.movesToStaffRatio !== 5 && (
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 py-3 px-4">
            <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Derived ratio:</span> ~{forecast.summary.movesToStaffRatio} moves per staff member (based on 90-day history).
              Recommendations use this ratio when shift history is unavailable but move volume data exists.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}