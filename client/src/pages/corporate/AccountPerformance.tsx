import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, Users, DollarSign, Truck, AlertTriangle, FileText, Clock } from "lucide-react";

interface AccountPerformanceData {
  movesLast12Months: { month: string; moves: number }[];
  movesVsPriorYear: { current: number; prior: number; change: number; changePercent: number };
  movesByType: { type: string; count: number }[];
  driversCount: number;
  driversByType: { type: string; count: number }[];
  grossProfit: number;
  avgMoveLength: number;
  accidents: number;
  customerTickets: number;
  openCustomerTickets: number;
  driverTickets: number;
  openDriverTickets: number;
  creditPaymentScore: number;
}

interface AccountPerformanceProps {
  customerId: string;
}

const COLORS = {
  primary: "hsl(var(--primary))",
  secondary: "hsl(var(--chart-2))",
  tertiary: "hsl(var(--chart-3))",
  quaternary: "hsl(var(--chart-4))",
  quinary: "hsl(var(--chart-5))",
};

export default function AccountPerformance({ customerId }: AccountPerformanceProps) {
  const { data: performanceData, isLoading, error } = useQuery<AccountPerformanceData>({
    queryKey: ["/api/corporate/customers", customerId, "performance"],
    queryFn: async () => {
      const response = await fetch(`/api/corporate/customers/${customerId}/performance`);
      if (!response.ok) {
        throw new Error("Failed to fetch performance data");
      }
      return response.json();
    },
    enabled: !!customerId,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-muted-foreground">Loading performance data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load performance data. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!performanceData) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">No performance data available. Data will populate once moves are tracked in the system.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const {
    movesLast12Months,
    movesVsPriorYear,
    movesByType,
    driversCount,
    driversByType,
    grossProfit,
    avgMoveLength,
    accidents,
    customerTickets,
    openCustomerTickets,
    driverTickets,
    openDriverTickets,
    creditPaymentScore,
  } = performanceData;

  const scoreColor = creditPaymentScore >= 80 ? "text-green-600 dark:text-green-400" : 
                     creditPaymentScore >= 60 ? "text-yellow-600 dark:text-yellow-400" : 
                     "text-red-600 dark:text-red-400";

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Customer Performance</h2>
        <p className="text-muted-foreground">Performance metrics and trends</p>
      </div>

      {/* KPI Cards - Row 1 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-moves-comparison">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Moves vs Prior Year</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-current-moves">{movesVsPriorYear.current.toLocaleString()}</div>
            <div className="flex items-center gap-1 text-xs">
              {movesVsPriorYear.change >= 0 ? (
                <>
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <span className="text-green-600">+{movesVsPriorYear.changePercent.toFixed(1)}%</span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-3 w-3 text-red-600" />
                  <span className="text-red-600">{movesVsPriorYear.changePercent.toFixed(1)}%</span>
                </>
              )}
              <span className="text-muted-foreground ml-1">vs {movesVsPriorYear.prior.toLocaleString()} prior year</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-drivers">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-drivers-count">{driversCount}</div>
            <p className="text-xs text-muted-foreground">Total drivers assigned</p>
          </CardContent>
        </Card>

        <Card data-testid="card-gross-profit">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-gross-profit">
              ${grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Last 12 months</p>
          </CardContent>
        </Card>

        <Card data-testid="card-credit-score">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credit/Payment Score</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${scoreColor}`} data-testid="text-credit-score">
              {creditPaymentScore}
            </div>
            <p className="text-xs text-muted-foreground">Out of 100</p>
          </CardContent>
        </Card>
      </div>

      {/* KPI Cards - Row 2 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-avg-move-length">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Move Length</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-move-length">{avgMoveLength.toFixed(1)} mi</div>
            <p className="text-xs text-muted-foreground">Average distance</p>
          </CardContent>
        </Card>

        <Card data-testid="card-claims">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Claims</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-claims">{accidents}</div>
            <p className="text-xs text-muted-foreground">Last 12 months</p>
          </CardContent>
        </Card>

        <Card data-testid="card-customer-tickets">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customer Tickets</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-customer-tickets">{customerTickets}</div>
            <p className="text-xs text-muted-foreground">
              {openCustomerTickets} open
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-driver-tickets">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Driver Tickets</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-driver-tickets">{driverTickets}</div>
            <p className="text-xs text-muted-foreground">
              {openDriverTickets} open
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Moves Trend Chart */}
        <Card data-testid="card-moves-trend">
          <CardHeader>
            <CardTitle>Moves Trend (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                moves: {
                  label: "Moves",
                  color: COLORS.primary,
                },
              }}
              className="h-[300px]"
            >
              <LineChart data={movesLast12Months}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="moves" stroke="var(--color-moves)" strokeWidth={2} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Moves by Type Chart */}
        <Card data-testid="card-moves-by-type">
          <CardHeader>
            <CardTitle>Moves by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                count: {
                  label: "Count",
                  color: COLORS.primary,
                },
              }}
              className="h-[300px]"
            >
              <BarChart data={movesByType}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Drivers by Type Chart */}
        <Card data-testid="card-drivers-by-type">
          <CardHeader>
            <CardTitle>Drivers by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                count: {
                  label: "Count",
                  color: COLORS.primary,
                },
              }}
              className="h-[300px]"
            >
              <PieChart>
                <Pie
                  data={driversByType}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {driversByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={Object.values(COLORS)[index % Object.values(COLORS).length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
