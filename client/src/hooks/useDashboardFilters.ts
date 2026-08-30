import { useCallback, useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import type { DashboardFilters } from '@shared/schema';

const DEFAULT_FILTERS: DashboardFilters = {
  dateRange: '30d',
  driverType: 'all',
  status: 'all',
  locationIds: [],
  accountIds: [],
};

export function useDashboardFilters() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  const filters = useMemo((): DashboardFilters => {
    const params = new URLSearchParams(searchString);
    
    return {
      dateRange: (params.get('range') as DashboardFilters['dateRange']) || DEFAULT_FILTERS.dateRange,
      startDate: params.get('startDate') || undefined,
      endDate: params.get('endDate') || undefined,
      locationIds: params.get('location')?.split(',').filter(Boolean) || [],
      accountIds: params.get('account')?.split(',').filter(Boolean) || [],
      driverType: (params.get('driverType') as DashboardFilters['driverType']) || DEFAULT_FILTERS.driverType,
      status: (params.get('status') as DashboardFilters['status']) || DEFAULT_FILTERS.status,
    };
  }, [searchString]);

  const setFilters = useCallback((newFilters: Partial<DashboardFilters>) => {
    const merged = { ...filters, ...newFilters };
    const params = new URLSearchParams();

    if (merged.dateRange && merged.dateRange !== '30d') {
      params.set('range', merged.dateRange);
    }
    if (merged.startDate) {
      params.set('startDate', merged.startDate);
    }
    if (merged.endDate) {
      params.set('endDate', merged.endDate);
    }
    if (merged.locationIds && merged.locationIds.length > 0) {
      params.set('location', merged.locationIds.join(','));
    }
    if (merged.accountIds && merged.accountIds.length > 0) {
      params.set('account', merged.accountIds.join(','));
    }
    if (merged.driverType && merged.driverType !== 'all') {
      params.set('driverType', merged.driverType);
    }
    if (merged.status && merged.status !== 'all') {
      params.set('status', merged.status);
    }

    const queryString = params.toString();
    setLocation(queryString ? `?${queryString}` : '', { replace: true });
  }, [filters, setLocation]);

  const resetFilters = useCallback(() => {
    setLocation('', { replace: true });
  }, [setLocation]);

  const getQueryParams = useCallback((): string => {
    const params = new URLSearchParams();
    
    if (filters.dateRange) params.set('range', filters.dateRange);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.locationIds?.length) params.set('location', filters.locationIds.join(','));
    if (filters.accountIds?.length) params.set('account', filters.accountIds.join(','));
    if (filters.driverType) params.set('driverType', filters.driverType);
    if (filters.status) params.set('status', filters.status);

    return params.toString();
  }, [filters]);

  return {
    filters,
    setFilters,
    resetFilters,
    getQueryParams,
    queryKey: getQueryParams(),
  };
}
