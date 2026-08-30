import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseDateSafe } from "@/lib/dateFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Calendar, MapPin, Clock } from "lucide-react";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";

interface DailyLaborCost {
  date: string;
  locationId: string | null;
  locationName: string | null;
  scheduledHours: number;
  estimatedCost: number;
  actualHours: number;
  actualCost: number;
  assignmentCount: number;
  overtimeCount: number;
}

interface BudgetWarning {
  type: 'daily' | 'weekly';
  locationId: string;
  locationName: string;
  budgetLimit: number;
  currentCost: number;
  percentUsed: number;
  isOverBudget: boolean;
  warningThreshold: number;
}

export function LaborCostsTab() {
  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfWeek(today), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(today), 'yyyy-MM-dd'));
  const [selectedLocation, setSelectedLocation] = useState<string>('all');

  const locationsQuery = useQuery<{ id: string; name: string }[]>({
    queryKey: ['/api/scheduling/locations'],
  });

  const laborCostsQuery = useQuery<DailyLaborCost[]>({
    queryKey: [`/api/scheduling/labor-costs?startDate=${startDate}&endDate=${endDate}${selectedLocation !== 'all' ? `&locationId=${selectedLocation}` : ''}`],
    enabled: !!startDate && !!endDate,
  });

  const budgetWarningsQuery = useQuery<BudgetWarning[]>({
    queryKey: [`/api/scheduling/budget-warnings?startDate=${startDate}&endDate=${endDate}`],
    enabled: !!startDate && !!endDate,
  });

  const costs = laborCostsQuery.data || [];
  const warnings = budgetWarningsQuery.data || [];

  const totalScheduledHours = costs.reduce((sum, c) => sum + c.scheduledHours, 0);
  const totalEstimatedCost = costs.reduce((sum, c) => sum + c.estimatedCost, 0);
  const totalActualHours = costs.reduce((sum, c) => sum + c.actualHours, 0);
  const totalActualCost = costs.reduce((sum, c) => sum + c.actualCost, 0);
  const totalOvertimeCount = costs.reduce((sum, c) => sum + c.overtimeCount, 0);

  const setDateRange = (range: 'thisWeek' | 'nextWeek' | 'lastWeek') => {
    let start: Date;
    let end: Date;
    
    if (range === 'thisWeek') {
      start = startOfWeek(today);
      end = endOfWeek(today);
    } else if (range === 'nextWeek') {
      start = startOfWeek(addDays(today, 7));
      end = endOfWeek(addDays(today, 7));
    } else {
      start = startOfWeek(addDays(today, -7));
      end = endOfWeek(addDays(today, -7));
    }
    
    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(end, 'yyyy-MM-dd'));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-labor-costs-title">Labor Budget & Costs</h2>
          <p className="text-muted-foreground">Monitor labor costs and budget utilization</p>
        </div>
        
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setDateRange('lastWeek')} data-testid="button-last-week">
            Last Week
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDateRange('thisWeek')} data-testid="button-this-week">
            This Week
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDateRange('nextWeek')} data-testid="button-next-week">
            Next Week
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <Label>Start Date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
            data-testid="input-start-date"
          />
        </div>
        <div className="space-y-1">
          <Label>End Date</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
            data-testid="input-end-date"
          />
        </div>
        <div className="space-y-1">
          <Label>Location</Label>
          <Select value={selectedLocation} onValueChange={setSelectedLocation}>
            <SelectTrigger className="w-48" data-testid="select-location">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locationsQuery.data?.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((warning, idx) => (
            <Alert key={idx} variant={warning.isOverBudget ? "destructive" : "default"}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="flex items-center gap-2">
                {warning.isOverBudget ? 'Budget Exceeded' : 'Budget Warning'}
                <Badge variant={warning.isOverBudget ? "destructive" : "secondary"}>
                  {warning.type === 'daily' ? 'Daily' : 'Weekly'}
                </Badge>
              </AlertTitle>
              <AlertDescription>
                {warning.locationName}: ${warning.currentCost.toFixed(2)} of ${warning.budgetLimit.toFixed(2)} budget used ({warning.percentUsed.toFixed(0)}%)
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Scheduled Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {laborCostsQuery.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-scheduled-hours">
                {totalScheduledHours.toFixed(1)} hrs
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Estimated Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {laborCostsQuery.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-estimated-cost">
                ${totalEstimatedCost.toFixed(2)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Actual Hours</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {laborCostsQuery.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-actual-hours">
                {totalActualHours.toFixed(1)} hrs
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Overtime Shifts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {laborCostsQuery.isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-overtime-count">
                {totalOvertimeCount}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Daily Cost Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {laborCostsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : costs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No labor cost data for the selected date range
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4">Date</th>
                    <th className="text-left py-2 px-4">Location</th>
                    <th className="text-right py-2 px-4">Scheduled Hours</th>
                    <th className="text-right py-2 px-4">Estimated Cost</th>
                    <th className="text-right py-2 px-4">Actual Hours</th>
                    <th className="text-right py-2 px-4">Actual Cost</th>
                    <th className="text-right py-2 px-4">Assignments</th>
                    <th className="text-right py-2 px-4">Overtime</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((cost, idx) => (
                    <tr key={idx} className="border-b hover-elevate" data-testid={`row-cost-${idx}`}>
                      <td className="py-2 px-4">
                        {format(parseDateSafe(cost.date), 'EEE, MMM d')}
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {cost.locationName || 'N/A'}
                        </div>
                      </td>
                      <td className="text-right py-2 px-4">{cost.scheduledHours.toFixed(1)}</td>
                      <td className="text-right py-2 px-4">${cost.estimatedCost.toFixed(2)}</td>
                      <td className="text-right py-2 px-4">{cost.actualHours.toFixed(1)}</td>
                      <td className="text-right py-2 px-4">${cost.actualCost.toFixed(2)}</td>
                      <td className="text-right py-2 px-4">{cost.assignmentCount}</td>
                      <td className="text-right py-2 px-4">
                        {cost.overtimeCount > 0 ? (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                            {cost.overtimeCount}
                          </Badge>
                        ) : (
                          '0'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50">
                  <tr>
                    <td className="py-2 px-4 font-bold" colSpan={2}>Total</td>
                    <td className="text-right py-2 px-4 font-bold">{totalScheduledHours.toFixed(1)}</td>
                    <td className="text-right py-2 px-4 font-bold">${totalEstimatedCost.toFixed(2)}</td>
                    <td className="text-right py-2 px-4 font-bold">{totalActualHours.toFixed(1)}</td>
                    <td className="text-right py-2 px-4 font-bold">${totalActualCost.toFixed(2)}</td>
                    <td className="text-right py-2 px-4 font-bold">{costs.reduce((sum, c) => sum + c.assignmentCount, 0)}</td>
                    <td className="text-right py-2 px-4 font-bold">{totalOvertimeCount}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
