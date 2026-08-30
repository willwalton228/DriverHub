import { db } from '../db';
import { recruitingQueryTimingLogs, InsertRecruitingQueryTimingLog } from '@shared/schema';
import { desc, gte, eq, and } from 'drizzle-orm';

const PIPELINE_SLA_MS = 2000;
const REPORTS_SLA_MS = 3000;
const SLOW_QUERY_THRESHOLD_MS = 1000;

interface QueryTimingEntry {
  endpoint: string;
  queryName: string;
  method: string;
  durationMs: number;
  filters?: Record<string, unknown>;
  resultCount?: number;
  warningType?: string;
  userId?: string;
}

export async function logQueryTiming(entry: QueryTimingEntry): Promise<void> {
  try {
    const isSlowQuery = entry.durationMs > SLOW_QUERY_THRESHOLD_MS;
    
    let warningType = entry.warningType;
    if (!warningType && isSlowQuery) {
      if (entry.endpoint.includes('/applications') && entry.durationMs > PIPELINE_SLA_MS) {
        warningType = 'pipeline_sla_breach';
      } else if (entry.endpoint.includes('/reports') && entry.durationMs > REPORTS_SLA_MS) {
        warningType = 'reports_sla_breach';
      } else {
        warningType = 'slow_query';
      }
    }

    await db.insert(recruitingQueryTimingLogs).values({
      endpoint: entry.endpoint,
      queryName: entry.queryName,
      method: entry.method,
      durationMs: entry.durationMs,
      filters: entry.filters ? JSON.stringify(entry.filters) : null,
      resultCount: entry.resultCount,
      isSlowQuery,
      warningType,
      userId: entry.userId,
    });
  } catch (error) {
    console.error('[QueryTiming] Failed to log query timing:', error);
  }
}

export async function getQueryTimingLogs(options?: {
  limit?: number;
  slowOnly?: boolean;
  endpoint?: string;
  startDate?: Date;
}): Promise<{
  logs: Array<{
    id: string;
    endpoint: string;
    queryName: string;
    method: string;
    durationMs: number;
    filters: unknown;
    resultCount: number | null;
    isSlowQuery: boolean;
    warningType: string | null;
    userId: string | null;
    createdAt: Date;
  }>;
  stats: {
    totalQueries: number;
    slowQueries: number;
    avgDurationMs: number;
    maxDurationMs: number;
    pipelineSlaBreaches: number;
    reportsSlaBreaches: number;
  };
}> {
  const conditions: any[] = [];
  
  if (options?.slowOnly) {
    conditions.push(eq(recruitingQueryTimingLogs.isSlowQuery, true));
  }
  
  if (options?.endpoint) {
    conditions.push(eq(recruitingQueryTimingLogs.endpoint, options.endpoint));
  }
  
  if (options?.startDate) {
    conditions.push(gte(recruitingQueryTimingLogs.createdAt, options.startDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const logs = await db.query.recruitingQueryTimingLogs.findMany({
    where: whereClause,
    orderBy: [desc(recruitingQueryTimingLogs.createdAt)],
    limit: options?.limit || 100,
  });

  const allLogs = await db.query.recruitingQueryTimingLogs.findMany({
    where: options?.startDate ? gte(recruitingQueryTimingLogs.createdAt, options.startDate) : undefined,
  });

  const slowQueries = allLogs.filter(l => l.isSlowQuery);
  const durations = allLogs.map(l => l.durationMs);
  
  return {
    logs: logs.map(log => ({
      ...log,
      filters: log.filters ? JSON.parse(log.filters as string) : null,
    })),
    stats: {
      totalQueries: allLogs.length,
      slowQueries: slowQueries.length,
      avgDurationMs: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      maxDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
      pipelineSlaBreaches: allLogs.filter(l => l.warningType === 'pipeline_sla_breach').length,
      reportsSlaBreaches: allLogs.filter(l => l.warningType === 'reports_sla_breach').length,
    },
  };
}

export function createTimingWrapper<T>(
  endpoint: string,
  queryName: string,
  method: string = 'GET'
): {
  start: () => number;
  end: (startTime: number, resultCount?: number, filters?: Record<string, unknown>, userId?: string) => Promise<void>;
} {
  return {
    start: () => performance.now(),
    end: async (startTime: number, resultCount?: number, filters?: Record<string, unknown>, userId?: string) => {
      const durationMs = Math.round(performance.now() - startTime);
      await logQueryTiming({
        endpoint,
        queryName,
        method,
        durationMs,
        filters,
        resultCount,
        userId,
      });
    },
  };
}

export async function getPerformanceSummary(hoursBack: number = 24): Promise<{
  summary: {
    period: string;
    totalQueries: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    slowQueryRate: number;
    pipelineHealth: 'healthy' | 'degraded' | 'critical';
    reportsHealth: 'healthy' | 'degraded' | 'critical';
  };
  topSlowEndpoints: Array<{
    endpoint: string;
    avgDurationMs: number;
    count: number;
  }>;
  recentAlerts: Array<{
    endpoint: string;
    durationMs: number;
    warningType: string;
    createdAt: Date;
  }>;
}> {
  const startDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  
  const logs = await db.query.recruitingQueryTimingLogs.findMany({
    where: gte(recruitingQueryTimingLogs.createdAt, startDate),
    orderBy: [desc(recruitingQueryTimingLogs.createdAt)],
  });

  const durations = logs.map(l => l.durationMs).sort((a, b) => a - b);
  
  const p95Index = Math.floor(durations.length * 0.95);
  const p99Index = Math.floor(durations.length * 0.99);
  
  const pipelineLogs = logs.filter(l => l.endpoint.includes('/applications'));
  const reportsLogs = logs.filter(l => l.endpoint.includes('/reports'));
  
  const pipelineSlowCount = pipelineLogs.filter(l => l.durationMs > PIPELINE_SLA_MS).length;
  const reportsSlowCount = reportsLogs.filter(l => l.durationMs > REPORTS_SLA_MS).length;

  const endpointStats = new Map<string, { total: number; count: number }>();
  for (const log of logs) {
    const existing = endpointStats.get(log.endpoint) || { total: 0, count: 0 };
    existing.total += log.durationMs;
    existing.count++;
    endpointStats.set(log.endpoint, existing);
  }

  const topSlowEndpoints = Array.from(endpointStats.entries())
    .map(([endpoint, stats]) => ({
      endpoint,
      avgDurationMs: Math.round(stats.total / stats.count),
      count: stats.count,
    }))
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, 5);

  const recentAlerts = logs
    .filter(l => l.warningType)
    .slice(0, 10)
    .map(l => ({
      endpoint: l.endpoint,
      durationMs: l.durationMs,
      warningType: l.warningType!,
      createdAt: l.createdAt,
    }));

  return {
    summary: {
      period: `Last ${hoursBack} hours`,
      totalQueries: logs.length,
      avgResponseTime: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      p95ResponseTime: durations[p95Index] || 0,
      p99ResponseTime: durations[p99Index] || 0,
      slowQueryRate: logs.length > 0 ? Math.round((logs.filter(l => l.isSlowQuery).length / logs.length) * 100) : 0,
      pipelineHealth: pipelineLogs.length === 0 ? 'healthy' : 
        (pipelineSlowCount / pipelineLogs.length) > 0.1 ? 'critical' :
        (pipelineSlowCount / pipelineLogs.length) > 0.05 ? 'degraded' : 'healthy',
      reportsHealth: reportsLogs.length === 0 ? 'healthy' :
        (reportsSlowCount / reportsLogs.length) > 0.1 ? 'critical' :
        (reportsSlowCount / reportsLogs.length) > 0.05 ? 'degraded' : 'healthy',
    },
    topSlowEndpoints,
    recentAlerts,
  };
}
