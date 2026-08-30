const DRIVERHUB_API_URL = import.meta.env.VITE_DRIVERHUB_API_URL || '';
const DRIVERHUB_API_KEY = import.meta.env.VITE_DRIVERHUB_API_KEY || '';

interface FetchOptions extends RequestInit {
  timeout?: number;
}

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

export async function driverHubFetch<T = any>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  const { timeout = 30000, ...fetchOptions } = options;
  
  const url = `${DRIVERHUB_API_URL}${endpoint}`;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(DRIVERHUB_API_KEY && { 'Authorization': `Bearer ${DRIVERHUB_API_KEY}` }),
    ...fetchOptions.headers,
  };
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const contentType = response.headers.get('content-type');
    let data: T | null = null;
    
    if (contentType?.includes('application/json')) {
      data = await response.json();
    }
    
    if (!response.ok) {
      return {
        data: null,
        error: (data as any)?.message || (data as any)?.error || `HTTP ${response.status}`,
        status: response.status,
      };
    }
    
    return {
      data,
      error: null,
      status: response.status,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        data: null,
        error: 'Request timeout',
        status: 408,
      };
    }
    
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 0,
    };
  }
}

export async function getDrivers() {
  return driverHubFetch<any[]>('/api/corporate/drivers');
}

export async function getDriver(id: string) {
  return driverHubFetch<any>(`/api/corporate/drivers/${id}`);
}

export async function getMoves(params?: { zone?: string; market?: string }) {
  const query = new URLSearchParams();
  if (params?.zone) query.set('zone', params.zone);
  if (params?.market) query.set('market', params.market);
  const queryString = query.toString();
  return driverHubFetch<any>(`/api/v1/moves/queue${queryString ? `?${queryString}` : ''}`);
}

export async function createMoveOffer(moveId: string, driverId: string, ttlSeconds = 300) {
  return driverHubFetch<any>(`/api/v1/dispatch/moves/${moveId}/offer`, {
    method: 'POST',
    body: JSON.stringify({ driver_id: driverId, ttl_seconds: ttlSeconds }),
  });
}

export default driverHubFetch;
