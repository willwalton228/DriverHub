import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Filter, RotateCcw, ChevronDown } from "lucide-react";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import type { DashboardFilters } from "@shared/schema";

interface DashboardFilterBarProps {
  showLocationFilter?: boolean;
  showAccountFilter?: boolean;
}

export function DashboardFilterBar({ 
  showLocationFilter = false, 
  showAccountFilter = false 
}: DashboardFilterBarProps) {
  const { filters, setFilters, resetFilters } = useDashboardFilters();

  const dateRangeOptions = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
  ];

  const driverTypeOptions = [
    { value: 'all', label: 'All Drivers' },
    { value: 'w2', label: 'W2 Employees' },
    { value: 'ic', label: 'Independent Contractors' },
  ];

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'suspended', label: 'Suspended' },
  ];

  const hasActiveFilters = filters.dateRange !== '30d' || 
    filters.driverType !== 'all' || 
    filters.status !== 'all' ||
    (filters.locationIds && filters.locationIds.length > 0) ||
    (filters.accountIds && filters.accountIds.length > 0);

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="flex items-center gap-1 text-sm text-muted-foreground mr-2">
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filters:</span>
        </div>

        <Select
          value={filters.dateRange}
          onValueChange={(value) => setFilters({ dateRange: value as DashboardFilters['dateRange'] })}
        >
          <SelectTrigger className="w-[140px] h-8" data-testid="select-date-range">
            <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            {dateRangeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} data-testid={`option-range-${option.value}`}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.driverType || 'all'}
          onValueChange={(value) => setFilters({ driverType: value as DashboardFilters['driverType'] })}
        >
          <SelectTrigger className="w-[160px] h-8" data-testid="select-driver-type">
            <SelectValue placeholder="Driver Type" />
          </SelectTrigger>
          <SelectContent>
            {driverTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} data-testid={`option-type-${option.value}`}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status || 'all'}
          onValueChange={(value) => setFilters({ status: value as DashboardFilters['status'] })}
        >
          <SelectTrigger className="w-[130px] h-8" data-testid="select-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} data-testid={`option-status-${option.value}`}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
            data-testid="button-reset-filters"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        )}

        <div className="flex-1" />

        <div className="text-xs text-muted-foreground hidden md:block">
          {filters.dateRange === 'today' && 'Showing today'}
          {filters.dateRange === '7d' && 'Showing last 7 days'}
          {filters.dateRange === '30d' && 'Showing last 30 days'}
          {filters.dateRange === '90d' && 'Showing last 90 days'}
        </div>
      </div>
    </div>
  );
}
