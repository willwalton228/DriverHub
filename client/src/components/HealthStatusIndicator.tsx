import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle, AlertTriangle, XCircle, Loader2 } from "lucide-react";

interface HealthResponse {
  app_version: string;
  authenticated: boolean;
  db_status: 'ok' | 'fail';
  timestamp: string;
  response_time_ms: number;
}

type HealthStatus = 'loading' | 'ok' | 'partial' | 'unavailable';

export function HealthStatusIndicator() {
  const [status, setStatus] = useState<HealthStatus>('loading');
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health', { 
          credentials: 'include',
          signal: AbortSignal.timeout(5000),
        });
        
        if (!response.ok) {
          setStatus('unavailable');
          setError(`HTTP ${response.status}`);
          return;
        }
        
        const data: HealthResponse = await response.json();
        setHealthData(data);
        
        if (data.db_status === 'ok') {
          setStatus('ok');
        } else {
          setStatus('partial');
        }
        setError(null);
      } catch (err) {
        setStatus('unavailable');
        setError(err instanceof Error ? err.message : 'Connection failed');
      }
    };

    checkHealth();
  }, []);

  const getStatusConfig = () => {
    switch (status) {
      case 'loading':
        return {
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          color: 'bg-muted text-muted-foreground',
          label: 'Checking...',
        };
      case 'ok':
        return {
          icon: <CheckCircle className="h-3 w-3" />,
          color: 'bg-green-500/10 text-green-600 border-green-500/30',
          label: 'Healthy',
        };
      case 'partial':
        return {
          icon: <AlertTriangle className="h-3 w-3" />,
          color: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
          label: 'Partial',
        };
      case 'unavailable':
        return {
          icon: <XCircle className="h-3 w-3" />,
          color: 'bg-red-500/10 text-red-600 border-red-500/30',
          label: 'Unavailable',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className={`text-xs cursor-default ${config.color}`}
          data-testid="health-status-indicator"
        >
          {config.icon}
          <span className="ml-1">{config.label}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-xs">
        <div className="space-y-1 text-xs">
          <div className="font-medium">System Status</div>
          {healthData ? (
            <>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Version:</span>
                <span>{healthData.app_version}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Database:</span>
                <span className={healthData.db_status === 'ok' ? 'text-green-600' : 'text-red-600'}>
                  {healthData.db_status === 'ok' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Auth:</span>
                <span>{healthData.authenticated ? 'Authenticated' : 'Not authenticated'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Response:</span>
                <span>{healthData.response_time_ms}ms</span>
              </div>
            </>
          ) : error ? (
            <div className="text-red-600">Error: {error}</div>
          ) : (
            <div className="text-muted-foreground">Loading...</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
