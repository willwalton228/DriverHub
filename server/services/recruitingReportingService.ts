import { db } from '../db';
import { 
  recruitingApplications,
  recruitingStageHistory,
  recruitingCandidates,
  recruitingRequisitions,
  applicationStages,
} from '@shared/schema';
import { eq, and, gte, lte, sql, count, avg, isNotNull, inArray, desc } from 'drizzle-orm';

export interface ReportingFilters {
  startDate?: Date;
  endDate?: Date;
  market?: string;
  requisitionId?: string;
  authorizedMarkets?: string[] | null; // null = admin (all markets), [] = no access, array = specific markets
}

export interface TimeToStageMetric {
  stage: string;
  avgMinutes: number;
  avgHours: number;
  avgDays: number;
  count: number;
}

export interface FunnelConversionMetric {
  stage: string;
  count: number;
  percentage: number;
}

export interface SourceAttributionMetric {
  source: string;
  count: number;
  percentage: number;
}

export interface RecruitingKPIs {
  timeToStage: TimeToStageMetric[];
  timeToReady: {
    avgMinutes: number;
    avgHours: number;
    avgDays: number;
    count: number;
  } | null;
  funnelConversion: FunnelConversionMetric[];
  sourceAttribution: SourceAttributionMetric[];
  slaBreachedCount: number;
  totalApplications: number;
  hiredCount: number;
  activeCount: number;
}

export interface PipelineHealthData {
  stageDistribution: { stage: string; count: number }[];
  weeklyTrend: { week: string; applied: number; hired: number }[];
  marketBreakdown: { market: string; total: number; active: number; hired: number }[];
}

function buildDateCondition(
  dateColumn: any,
  filters: ReportingFilters
): any[] {
  const conditions: any[] = [];
  if (filters.startDate) {
    conditions.push(gte(dateColumn, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(dateColumn, filters.endDate));
  }
  return conditions;
}

export async function getRecruitingKPIs(filters: ReportingFilters): Promise<RecruitingKPIs> {
  const dateConditions = buildDateCondition(recruitingApplications.createdAt, filters);
  
  const filterConditions: any[] = [...dateConditions];
  
  if (filters.requisitionId) {
    filterConditions.push(eq(recruitingApplications.requisitionId, filters.requisitionId));
  }

  const timeToStage = await getTimeToStageMetrics(filters);
  const timeToReady = await getTimeToReadyMetric(filters);
  const funnelConversion = await getFunnelConversionMetrics(filters);
  const sourceAttribution = await getSourceAttributionMetrics(filters);
  const slaBreachedCount = await getSlaBreachedCount(filters);
  const { total, hired, active } = await getApplicationCounts(filters);

  return {
    timeToStage,
    timeToReady,
    funnelConversion,
    sourceAttribution,
    slaBreachedCount,
    totalApplications: total,
    hiredCount: hired,
    activeCount: active,
  };
}

async function getTimeToStageMetrics(filters: ReportingFilters): Promise<TimeToStageMetric[]> {
  let baseQuery = `
    SELECT 
      sh.to_stage as stage,
      COALESCE(AVG(sh.time_in_previous_stage_minutes), 0) as avg_minutes,
      COUNT(*) as count
    FROM recruiting_stage_history sh
    JOIN recruiting_applications a ON sh.application_id = a.id
  `;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.startDate) {
    conditions.push(`a.created_at >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }
  if (filters.endDate) {
    conditions.push(`a.created_at <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }
  if (filters.requisitionId) {
    conditions.push(`a.requisition_id = $${paramIndex}`);
    params.push(filters.requisitionId);
    paramIndex++;
  }
  if (filters.market) {
    baseQuery += ` JOIN recruiting_requisitions r ON a.requisition_id = r.id `;
    conditions.push(`r.market = $${paramIndex}`);
    params.push(filters.market);
    paramIndex++;
  }

  conditions.push(`sh.time_in_previous_stage_minutes IS NOT NULL`);

  if (conditions.length > 0) {
    baseQuery += ` WHERE ` + conditions.join(' AND ');
  }

  baseQuery += ` GROUP BY sh.to_stage ORDER BY sh.to_stage`;

  const result = await db.execute(sql.raw(baseQuery));
  
  return (result.rows as any[]).map(row => ({
    stage: row.stage,
    avgMinutes: parseFloat(row.avg_minutes) || 0,
    avgHours: parseFloat(row.avg_minutes) / 60 || 0,
    avgDays: parseFloat(row.avg_minutes) / 1440 || 0,
    count: parseInt(row.count) || 0,
  }));
}

async function getTimeToReadyMetric(filters: ReportingFilters): Promise<{
  avgMinutes: number;
  avgHours: number;
  avgDays: number;
  count: number;
} | null> {
  let baseQuery = `
    SELECT 
      AVG(EXTRACT(EPOCH FROM (a.readiness_score_updated_at - a.created_at)) / 60) as avg_minutes,
      COUNT(*) as count
    FROM recruiting_applications a
  `;

  const conditions: string[] = ['a.readiness_score >= 100', 'a.readiness_score_updated_at IS NOT NULL'];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.startDate) {
    conditions.push(`a.created_at >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }
  if (filters.endDate) {
    conditions.push(`a.created_at <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }
  if (filters.requisitionId) {
    conditions.push(`a.requisition_id = $${paramIndex}`);
    params.push(filters.requisitionId);
    paramIndex++;
  }
  if (filters.market) {
    baseQuery += ` JOIN recruiting_requisitions r ON a.requisition_id = r.id `;
    conditions.push(`r.market = $${paramIndex}`);
    params.push(filters.market);
    paramIndex++;
  }

  baseQuery += ` WHERE ` + conditions.join(' AND ');

  const result = await db.execute(sql.raw(baseQuery));
  const row = (result.rows as any[])[0];
  
  if (!row || !row.avg_minutes || parseInt(row.count) === 0) {
    return null;
  }

  const avgMinutes = parseFloat(row.avg_minutes) || 0;
  return {
    avgMinutes,
    avgHours: avgMinutes / 60,
    avgDays: avgMinutes / 1440,
    count: parseInt(row.count) || 0,
  };
}

async function getFunnelConversionMetrics(filters: ReportingFilters): Promise<FunnelConversionMetric[]> {
  let baseQuery = `
    SELECT 
      a.current_stage as stage,
      COUNT(*) as count
    FROM recruiting_applications a
  `;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.startDate) {
    conditions.push(`a.created_at >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }
  if (filters.endDate) {
    conditions.push(`a.created_at <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }
  if (filters.requisitionId) {
    conditions.push(`a.requisition_id = $${paramIndex}`);
    params.push(filters.requisitionId);
    paramIndex++;
  }
  if (filters.market) {
    baseQuery += ` JOIN recruiting_requisitions r ON a.requisition_id = r.id `;
    conditions.push(`r.market = $${paramIndex}`);
    params.push(filters.market);
    paramIndex++;
  }

  if (conditions.length > 0) {
    baseQuery += ` WHERE ` + conditions.join(' AND ');
  }

  baseQuery += ` GROUP BY a.current_stage`;

  const result = await db.execute(sql.raw(baseQuery));
  const rows = result.rows as any[];
  
  const totalCount = rows.reduce((sum, row) => sum + parseInt(row.count), 0);
  
  const stageOrder = applicationStages;
  
  return stageOrder.map(stage => {
    const row = rows.find(r => r.stage === stage);
    const stageCount = row ? parseInt(row.count) : 0;
    return {
      stage,
      count: stageCount,
      percentage: totalCount > 0 ? (stageCount / totalCount) * 100 : 0,
    };
  }).filter(m => m.count > 0);
}

async function getSourceAttributionMetrics(filters: ReportingFilters): Promise<SourceAttributionMetric[]> {
  let baseQuery = `
    SELECT 
      COALESCE(c.source, 'Unknown') as source,
      COUNT(*) as count
    FROM recruiting_applications a
    JOIN recruiting_candidates c ON a.candidate_id = c.id
  `;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.startDate) {
    conditions.push(`a.created_at >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }
  if (filters.endDate) {
    conditions.push(`a.created_at <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }
  if (filters.requisitionId) {
    conditions.push(`a.requisition_id = $${paramIndex}`);
    params.push(filters.requisitionId);
    paramIndex++;
  }
  if (filters.market) {
    baseQuery += ` JOIN recruiting_requisitions r ON a.requisition_id = r.id `;
    conditions.push(`r.market = $${paramIndex}`);
    params.push(filters.market);
    paramIndex++;
  }

  if (conditions.length > 0) {
    baseQuery += ` WHERE ` + conditions.join(' AND ');
  }

  baseQuery += ` GROUP BY c.source ORDER BY count DESC LIMIT 20`;

  const result = await db.execute(sql.raw(baseQuery));
  const rows = result.rows as any[];
  
  const totalCount = rows.reduce((sum, row) => sum + parseInt(row.count), 0);
  
  return rows.map(row => ({
    source: row.source || 'Unknown',
    count: parseInt(row.count) || 0,
    percentage: totalCount > 0 ? (parseInt(row.count) / totalCount) * 100 : 0,
  }));
}

async function getSlaBreachedCount(filters: ReportingFilters): Promise<number> {
  let baseQuery = `
    SELECT COUNT(DISTINCT a.id) as count
    FROM recruiting_applications a
    JOIN recruiting_stage_slas sla ON sla.stage_key = a.current_stage
    WHERE sla.stage_sla_hours IS NOT NULL
      AND EXTRACT(EPOCH FROM (NOW() - a.current_stage_entered_at)) / 3600 > sla.stage_sla_hours
  `;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.startDate) {
    conditions.push(`a.created_at >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }
  if (filters.endDate) {
    conditions.push(`a.created_at <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }
  if (filters.requisitionId) {
    conditions.push(`a.requisition_id = $${paramIndex}`);
    params.push(filters.requisitionId);
    paramIndex++;
  }

  if (conditions.length > 0) {
    baseQuery += ` AND ` + conditions.join(' AND ');
  }

  try {
    const result = await db.execute(sql.raw(baseQuery));
    return parseInt((result.rows as any[])[0]?.count) || 0;
  } catch (error) {
    console.error('[Reporting] SLA breach count error:', error);
    return 0;
  }
}

async function getApplicationCounts(filters: ReportingFilters): Promise<{
  total: number;
  hired: number;
  active: number;
}> {
  let baseQuery = `
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE a.current_stage = 'hired') as hired,
      COUNT(*) FILTER (WHERE a.current_stage NOT IN ('hired', 'rejected', 'withdrawn', 'offer_declined')) as active
    FROM recruiting_applications a
  `;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.startDate) {
    conditions.push(`a.created_at >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }
  if (filters.endDate) {
    conditions.push(`a.created_at <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }
  if (filters.requisitionId) {
    conditions.push(`a.requisition_id = $${paramIndex}`);
    params.push(filters.requisitionId);
    paramIndex++;
  }
  if (filters.market) {
    baseQuery += ` JOIN recruiting_requisitions r ON a.requisition_id = r.id `;
    conditions.push(`r.market = $${paramIndex}`);
    params.push(filters.market);
    paramIndex++;
  }

  if (conditions.length > 0) {
    baseQuery += ` WHERE ` + conditions.join(' AND ');
  }

  const result = await db.execute(sql.raw(baseQuery));
  const row = (result.rows as any[])[0];

  return {
    total: parseInt(row?.total) || 0,
    hired: parseInt(row?.hired) || 0,
    active: parseInt(row?.active) || 0,
  };
}

export async function getPipelineHealth(filters: ReportingFilters): Promise<PipelineHealthData> {
  const stageDistribution = await getStageDistribution(filters);
  const weeklyTrend = await getWeeklyTrend(filters);
  const marketBreakdown = await getMarketBreakdown(filters);

  return {
    stageDistribution,
    weeklyTrend,
    marketBreakdown,
  };
}

async function getStageDistribution(filters: ReportingFilters): Promise<{ stage: string; count: number }[]> {
  let baseQuery = `
    SELECT 
      a.current_stage as stage,
      COUNT(*) as count
    FROM recruiting_applications a
  `;

  const conditions: string[] = [
    `a.current_stage NOT IN ('hired', 'rejected', 'withdrawn', 'offer_declined')`
  ];

  if (filters.startDate) {
    conditions.push(`a.created_at >= '${filters.startDate.toISOString()}'`);
  }
  if (filters.endDate) {
    conditions.push(`a.created_at <= '${filters.endDate.toISOString()}'`);
  }
  if (filters.requisitionId) {
    conditions.push(`a.requisition_id = '${filters.requisitionId}'`);
  }
  if (filters.market) {
    baseQuery += ` JOIN recruiting_requisitions r ON a.requisition_id = r.id `;
    conditions.push(`r.market = '${filters.market}'`);
  }

  baseQuery += ` WHERE ` + conditions.join(' AND ');
  baseQuery += ` GROUP BY a.current_stage ORDER BY count DESC`;

  const result = await db.execute(sql.raw(baseQuery));
  
  return (result.rows as any[]).map(row => ({
    stage: row.stage,
    count: parseInt(row.count) || 0,
  }));
}

async function getWeeklyTrend(filters: ReportingFilters): Promise<{ week: string; applied: number; hired: number }[]> {
  const endDate = filters.endDate || new Date();
  const startDate = filters.startDate || new Date(endDate.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);

  let baseQuery = `
    WITH weeks AS (
      SELECT 
        date_trunc('week', generate_series(
          '${startDate.toISOString()}'::timestamp,
          '${endDate.toISOString()}'::timestamp,
          '1 week'::interval
        )) as week_start
    )
    SELECT 
      to_char(w.week_start, 'YYYY-MM-DD') as week,
      COALESCE(SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END), 0) as applied,
      COALESCE(SUM(CASE WHEN a.current_stage = 'hired' THEN 1 ELSE 0 END), 0) as hired
    FROM weeks w
    LEFT JOIN recruiting_applications a ON 
      date_trunc('week', a.created_at) = w.week_start
  `;

  const conditions: string[] = [];
  if (filters.requisitionId) {
    conditions.push(`(a.requisition_id = '${filters.requisitionId}' OR a.requisition_id IS NULL)`);
  }
  if (filters.market) {
    baseQuery += ` LEFT JOIN recruiting_requisitions r ON a.requisition_id = r.id `;
    conditions.push(`(r.market = '${filters.market}' OR r.market IS NULL)`);
  }

  if (conditions.length > 0) {
    baseQuery += ` WHERE ` + conditions.join(' AND ');
  }

  baseQuery += ` GROUP BY w.week_start ORDER BY w.week_start`;

  try {
    const result = await db.execute(sql.raw(baseQuery));
    return (result.rows as any[]).map(row => ({
      week: row.week,
      applied: parseInt(row.applied) || 0,
      hired: parseInt(row.hired) || 0,
    }));
  } catch (error) {
    console.error('[Reporting] Weekly trend error:', error);
    return [];
  }
}

async function getMarketBreakdown(filters: ReportingFilters): Promise<{ market: string; total: number; active: number; hired: number }[]> {
  let baseQuery = `
    SELECT 
      r.market,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE a.current_stage NOT IN ('hired', 'rejected', 'withdrawn', 'offer_declined')) as active,
      COUNT(*) FILTER (WHERE a.current_stage = 'hired') as hired
    FROM recruiting_applications a
    JOIN recruiting_requisitions r ON a.requisition_id = r.id
  `;

  const conditions: string[] = [];
  if (filters.startDate) {
    conditions.push(`a.created_at >= '${filters.startDate.toISOString()}'`);
  }
  if (filters.endDate) {
    conditions.push(`a.created_at <= '${filters.endDate.toISOString()}'`);
  }
  if (filters.requisitionId) {
    conditions.push(`a.requisition_id = '${filters.requisitionId}'`);
  }
  if (filters.market) {
    conditions.push(`r.market = '${filters.market}'`);
  }

  if (conditions.length > 0) {
    baseQuery += ` WHERE ` + conditions.join(' AND ');
  }

  baseQuery += ` GROUP BY r.market ORDER BY total DESC`;

  const result = await db.execute(sql.raw(baseQuery));
  
  return (result.rows as any[]).map(row => ({
    market: row.market || 'Unknown',
    total: parseInt(row.total) || 0,
    active: parseInt(row.active) || 0,
    hired: parseInt(row.hired) || 0,
  }));
}

export async function getReportDataForExport(filters: ReportingFilters): Promise<any[]> {
  let baseQuery = `
    SELECT 
      a.id as application_id,
      c.first_name,
      c.last_name,
      c.email,
      c.source,
      r.title as requisition_title,
      r.market,
      a.current_stage,
      a.created_at as applied_at,
      a.current_stage_entered_at,
      a.readiness_score,
      a.disposition
    FROM recruiting_applications a
    JOIN recruiting_candidates c ON a.candidate_id = c.id
    JOIN recruiting_requisitions r ON a.requisition_id = r.id
  `;

  const conditions: string[] = [];
  if (filters.startDate) {
    conditions.push(`a.created_at >= '${filters.startDate.toISOString()}'`);
  }
  if (filters.endDate) {
    conditions.push(`a.created_at <= '${filters.endDate.toISOString()}'`);
  }
  if (filters.requisitionId) {
    conditions.push(`a.requisition_id = '${filters.requisitionId}'`);
  }
  if (filters.market) {
    conditions.push(`r.market = '${filters.market}'`);
  }
  
  // Market isolation for non-admin users (permission-hardened exports)
  if (filters.authorizedMarkets && filters.authorizedMarkets.length > 0) {
    const marketsEscaped = filters.authorizedMarkets.map(m => `'${m.replace(/'/g, "''")}'`).join(', ');
    conditions.push(`r.market IN (${marketsEscaped})`);
  } else if (filters.authorizedMarkets !== null && filters.authorizedMarkets?.length === 0) {
    // Empty array = no access to any market
    conditions.push(`1 = 0`);
  }
  // null = admin access, no market filter applied

  if (conditions.length > 0) {
    baseQuery += ` WHERE ` + conditions.join(' AND ');
  }

  baseQuery += ` ORDER BY a.created_at DESC LIMIT 10000`;

  const result = await db.execute(sql.raw(baseQuery));
  return result.rows as any[];
}

export async function getFilterOptions(): Promise<{
  markets: string[];
  requisitions: { id: string; title: string }[];
}> {
  const marketsResult = await db.execute(sql`
    SELECT DISTINCT market FROM recruiting_requisitions WHERE market IS NOT NULL ORDER BY market
  `);
  
  const requisitionsResult = await db.execute(sql`
    SELECT id, title FROM recruiting_requisitions WHERE status != 'closed' ORDER BY title LIMIT 100
  `);

  return {
    markets: (marketsResult.rows as any[]).map(r => r.market),
    requisitions: (requisitionsResult.rows as any[]).map(r => ({ id: r.id, title: r.title })),
  };
}
