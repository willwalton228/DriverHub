import { useQuery } from "@tanstack/react-query";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import { DashboardFilterBar } from "@/components/DashboardFilterBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { Search, Users, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DriverWithUser } from "@shared/schema";

export default function DriversReport() {
  const { filters } = useDashboardFilters();
  const [search, setSearch] = useState("");

  const { data: drivers = [], isLoading } = useQuery<DriverWithUser[]>({
    queryKey: ["/api/corporate/drivers"],
  });

  const filteredDrivers = useMemo(() => {
    let result = drivers;

    if (filters.status && filters.status !== 'all') {
      result = result.filter(d => d.status === filters.status);
    }

    if (filters.driverType && filters.driverType !== 'all') {
      result = result.filter(d => {
        if (filters.driverType === 'w2') return d.driverClassification === 'Employee';
        if (filters.driverType === 'ic') return d.driverClassification === 'Independent Contractor';
        return true;
      });
    }

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(d => 
        d.user?.firstName?.toLowerCase().includes(s) ||
        d.user?.lastName?.toLowerCase().includes(s) ||
        d.user?.email?.toLowerCase().includes(s) ||
        d.driverNumber?.toLowerCase().includes(s)
      );
    }

    return result;
  }, [drivers, filters, search]);

  const statusCounts = useMemo(() => {
    return {
      active: drivers.filter(d => d.status === 'active').length,
      inactive: drivers.filter(d => d.status === 'inactive').length,
      suspended: drivers.filter(d => d.status === 'suspended').length,
      total: drivers.length,
    };
  }, [drivers]);

  return (
    <div className="flex flex-col h-full">
      <DashboardFilterBar />
      
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Drivers Report</h1>
            <p className="text-muted-foreground text-sm">Filtered driver list with drill-down capability</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <Badge variant="outline">{statusCounts.total}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active</span>
                <Badge className="bg-green-500/10 text-green-600">{statusCounts.active}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Inactive</span>
                <Badge variant="secondary">{statusCounts.inactive}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Suspended</span>
                <Badge variant="destructive">{statusCounts.suspended}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search drivers by name, email, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-drivers"
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              Driver List
            </CardTitle>
            <CardDescription>
              Showing {filteredDrivers.length} of {drivers.length} drivers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredDrivers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No drivers match the current filters</p>
            ) : (
              <div className="space-y-2">
                {filteredDrivers.map((driver) => (
                  <Link key={driver.id} href={`/drivers/${driver.id}`}>
                    <div 
                      className="flex items-center justify-between p-3 border rounded-lg hover-elevate cursor-pointer group"
                      data-testid={`row-driver-${driver.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {driver.user?.firstName} {driver.user?.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {driver.driverNumber || driver.user?.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={driver.status || 'unknown'} />
                        {driver.driverClassification && (
                          <Badge variant="outline" className="text-xs">
                            {driver.driverClassification === 'Employee' ? 'W2' : 'IC'}
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
