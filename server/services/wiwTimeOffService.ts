/**
 * WIW Time-Off Service
 *
 * Query layer for the wiw_time_off_requests table.
 * Provides dashboard summary, full ranked report, and per-driver detail.
 * Ranking metric: total approved days (spec §6).
 */

import { pool } from "../db";
import { format, startOfYear } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TimeOffPeriod {
  startDate: string; // YYYY-MM-DD
  endDate:   string; // YYYY-MM-DD
}

export function buildPeriod(period: "60d" | "ytd" | "custom", customStart?: string, customEnd?: string): TimeOffPeriod {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  if (period === "60d") {
    const d = new Date(today);
    d.setDate(d.getDate() - 60);
    return { startDate: format(d, "yyyy-MM-dd"), endDate: todayStr };
  }
  if (period === "ytd") {
    return { startDate: format(startOfYear(today), "yyyy-MM-dd"), endDate: todayStr };
  }
  // custom
  return {
    startDate: customStart ?? format(startOfYear(today), "yyyy-MM-dd"),
    endDate:   customEnd   ?? todayStr,
  };
}

export interface TimeOffSummaryRow {
  rank:             number;
  driverId:         string;
  driverName:       string;
  totalApprovedDays: number;
  totalApprovedHours: number | null;
  totalRequests:    number;
}

export interface TimeOffReportRow extends TimeOffSummaryRow {
  driverStatus:     string | null;
  market:           string | null;
  driverType:       string | null;
  driverClassification: string | null;
  networks:         string[];
  accounts:         string[];
  approvedRequests: number;
  pendingRequests:  number;
  deniedRequests:   number;
  lastTimeOffDate:  string | null;
  nextTimeOffDate:  string | null;
}

export interface DriverTimeOffDetailRow {
  id:              string;
  startDate:       string;
  endDate:         string;
  totalDays:       number | null;
  totalHours:      number | null;
  requestType:     string | null;
  status:          string;
  submittedAt:     string | null;
  approvedDeniedAt: string | null;
  externalRequestId: string;
  notes:           string | null;
}

export interface DriverTimeOffSummary {
  daysLast60:    number;
  hoursLast60:   number | null;
  daysYtd:       number;
  hoursYtd:      number | null;
  requestsYtd:   number;
}

// ── Dashboard Widget Summary (top N drivers) ──────────────────────────────────

export async function getTimeOffSummary(
  period: "60d" | "ytd",
  limit = 10,
  filters: Pick<TimeOffReportFilters, "networks" | "accountIds" | "driverClass"> = {},
): Promise<TimeOffSummaryRow[]> {
  const report = await getTimeOffReport({
    period,
    ...filters,
    sortBy: "total_approved_days",
    sortDir: "desc",
    limit,
  });

  return report.map(({ rank, driverId, driverName, totalApprovedDays, totalApprovedHours, totalRequests }) => ({
    rank,
    driverId,
    driverName,
    totalApprovedDays,
    totalApprovedHours,
    totalRequests,
  }));
}

// ── Full Ranked Report ────────────────────────────────────────────────────────

export interface TimeOffReportFilters {
  period:       "60d" | "ytd" | "custom";
  customStart?: string;
  customEnd?:   string;
  driverStatus?: string;   // active | inactive | suspended
  market?:       string;
  driverType?:   string;
  driverClass?:  string;   // Employee | Independent Contractor
  networks?:     string[];
  accountIds?:   string[];
  wiwStatus?:    string;   // approved | pending | denied | cancelled
  sortBy?:       string;   // total_approved_days | total_requests | last_time_off_date
  sortDir?:      "asc" | "desc";
  limit?:        number;
}

export async function getTimeOffReport(filters: TimeOffReportFilters): Promise<TimeOffReportRow[]> {
  const { startDate, endDate } = buildPeriod(filters.period, filters.customStart, filters.customEnd);
  const today = format(new Date(), "yyyy-MM-dd");

  const conditions: string[] = [
    `tor.driver_id IS NOT NULL`,
    `tor.start_date >= $1`,
    `tor.start_date <= $2`,
  ];
  const params: any[] = [startDate, endDate];
  let pi = 3;

  if (filters.wiwStatus) {
    conditions.push(`tor.status = $${pi++}`);
    params.push(filters.wiwStatus);
  }
  if (filters.driverStatus) {
    conditions.push(`d.status = $${pi++}`);
    params.push(filters.driverStatus);
  }
  if (filters.market) {
    conditions.push(`d.market = $${pi++}`);
    params.push(filters.market);
  }
  if (filters.driverType) {
    conditions.push(`d.driver_type = $${pi++}`);
    params.push(filters.driverType);
  }
  if (filters.driverClass) {
    conditions.push(`d.driver_classification = $${pi++}`);
    params.push(filters.driverClass);
  }
  if (filters.networks?.length) {
    conditions.push(`COALESCE(dac.networks, ARRAY[]::varchar[]) && $${pi++}::varchar[]`);
    params.push(filters.networks);
  }
  if (filters.accountIds?.length) {
    conditions.push(`COALESCE(dac.account_ids, ARRAY[]::varchar[]) && $${pi++}::varchar[]`);
    params.push(filters.accountIds);
  }

  const sortMap: Record<string, string> = {
    total_approved_days:  "total_approved_days",
    total_requests:       "total_requests",
    last_time_off_date:   "last_time_off_date",
  };
  const sortCol = sortMap[filters.sortBy ?? ""] ?? "total_approved_days";
  const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";
  const todayParam = pi++;
  const normalizedLimit = filters.limit && Number.isFinite(filters.limit)
    ? Math.min(Math.max(Math.floor(filters.limit), 1), 100)
    : undefined;
  const limitSql = normalizedLimit ? `LIMIT $${pi++}` : "";

  const sql = `
    WITH driver_accounts AS (
      SELECT
        ws.wiw_user_id,
        ARRAY_AGG(DISTINCT wl.account_id ORDER BY wl.account_id)
          FILTER (WHERE wl.account_id IS NOT NULL) AS account_ids,
        ARRAY_AGG(DISTINCT c.network ORDER BY c.network)
          FILTER (WHERE c.network IS NOT NULL AND c.network <> '') AS networks,
        ARRAY_AGG(DISTINCT c.customer_name ORDER BY c.customer_name)
          FILTER (WHERE c.customer_name IS NOT NULL) AS accounts
      FROM wiw_shifts ws
      JOIN wiw_locations wl ON wl.id = ws.wiw_location_id
      JOIN customers c ON c.id = wl.account_id
      WHERE ws.wiw_user_id IS NOT NULL
        AND ws.start_time >= $1::date
        AND ws.start_time < ($2::date + INTERVAL '1 day')
      GROUP BY ws.wiw_user_id
    ),
    report AS (
      SELECT
        tor.driver_id,
        COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') AS driver_name,
        d.status AS driver_status,
        d.market,
        d.driver_type,
        d.driver_classification,
        COALESCE(dac.networks, ARRAY[]::varchar[]) AS networks,
        COALESCE(dac.accounts, ARRAY[]::varchar[]) AS accounts,
        COALESCE(SUM(CASE WHEN tor.status = 'approved' THEN tor.total_days ELSE 0 END), 0)  AS total_approved_days,
        SUM(CASE WHEN tor.status = 'approved' THEN tor.total_hours END)                     AS total_approved_hours,
        COUNT(*)                                                                             AS total_requests,
        COUNT(CASE WHEN tor.status = 'approved'   THEN 1 END)                               AS approved_requests,
        COUNT(CASE WHEN tor.status = 'pending'    THEN 1 END)                               AS pending_requests,
        COUNT(CASE WHEN tor.status = 'denied'     THEN 1 END)                               AS denied_requests,
        MAX(CASE WHEN tor.start_date <= $${todayParam} THEN tor.start_date END)             AS last_time_off_date,
        MIN(CASE WHEN tor.start_date >  $${todayParam} THEN tor.start_date END)             AS next_time_off_date
      FROM wiw_time_off_requests tor
      JOIN drivers d ON d.id = tor.driver_id
      JOIN users u ON u.id = d.user_id
      LEFT JOIN driver_accounts dac ON dac.wiw_user_id = tor.wiw_user_id
      WHERE ${conditions.join(" AND ")}
      GROUP BY tor.driver_id, driver_name, d.status, d.market, d.driver_type, d.driver_classification, dac.networks, dac.accounts
    )
    SELECT *, ROW_NUMBER() OVER (ORDER BY ${sortCol} ${sortDir} NULLS LAST, total_requests DESC) AS rank
    FROM report
    ORDER BY rank
    ${limitSql}
  `;
  params.push(today);
  if (normalizedLimit) params.push(normalizedLimit);

  const res = await pool.query(sql, params);

  return res.rows.map(row => ({
    rank:              parseInt(row.rank, 10),
    driverId:          row.driver_id,
    driverName:        row.driver_name,
    driverStatus:      row.driver_status,
    market:            row.market,
    driverType:        row.driver_type,
    driverClassification: row.driver_classification,
    networks:          Array.isArray(row.networks) ? row.networks : [],
    accounts:          Array.isArray(row.accounts) ? row.accounts : [],
    totalApprovedDays: parseFloat(row.total_approved_days) || 0,
    totalApprovedHours: row.total_approved_hours != null ? parseFloat(row.total_approved_hours) : null,
    totalRequests:     parseInt(row.total_requests, 10) || 0,
    approvedRequests:  parseInt(row.approved_requests, 10) || 0,
    pendingRequests:   parseInt(row.pending_requests, 10) || 0,
    deniedRequests:    parseInt(row.denied_requests, 10) || 0,
    lastTimeOffDate:   row.last_time_off_date ?? null,
    nextTimeOffDate:   row.next_time_off_date ?? null,
  }));
}

// ── Driver Detail ─────────────────────────────────────────────────────────────

export async function getDriverTimeOffDetail(driverId: string): Promise<{
  summary: DriverTimeOffSummary;
  requests: DriverTimeOffDetailRow[];
}> {
  const today = format(new Date(), "yyyy-MM-dd");
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyDaysAgoStr = format(sixtyDaysAgo, "yyyy-MM-dd");
  const ytdStart = format(startOfYear(new Date()), "yyyy-MM-dd");

  const [summaryRes, detailRes] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'approved' AND start_date >= $2 THEN total_days ELSE 0 END), 0) AS days_60,
         SUM(CASE WHEN status = 'approved' AND start_date >= $2 THEN total_hours END)                    AS hours_60,
         COALESCE(SUM(CASE WHEN status = 'approved' AND start_date >= $3 THEN total_days ELSE 0 END), 0) AS days_ytd,
         SUM(CASE WHEN status = 'approved' AND start_date >= $3 THEN total_hours END)                    AS hours_ytd,
         COUNT(CASE WHEN start_date >= $3 THEN 1 END)                                                    AS requests_ytd
       FROM wiw_time_off_requests
       WHERE driver_id = $1`,
      [driverId, sixtyDaysAgoStr, ytdStart]
    ),
    pool.query(
      `SELECT
         id, start_date, end_date, total_days, total_hours,
         request_type, status, submitted_at, approved_denied_at,
         external_request_id, notes
       FROM wiw_time_off_requests
       WHERE driver_id = $1
       ORDER BY start_date DESC, submitted_at DESC`,
      [driverId]
    ),
  ]);

  const s = summaryRes.rows[0] ?? {};
  return {
    summary: {
      daysLast60:  parseFloat(s.days_60  ?? "0") || 0,
      hoursLast60: s.hours_60  != null ? parseFloat(s.hours_60)  : null,
      daysYtd:     parseFloat(s.days_ytd ?? "0") || 0,
      hoursYtd:    s.hours_ytd != null ? parseFloat(s.hours_ytd) : null,
      requestsYtd: parseInt(s.requests_ytd ?? "0", 10) || 0,
    },
    requests: detailRes.rows.map(r => ({
      id:                r.id,
      startDate:         r.start_date,
      endDate:           r.end_date,
      totalDays:         r.total_days   != null ? parseFloat(r.total_days)  : null,
      totalHours:        r.total_hours  != null ? parseFloat(r.total_hours) : null,
      requestType:       r.request_type ?? null,
      status:            r.status,
      submittedAt:       r.submitted_at     ? new Date(r.submitted_at).toISOString()      : null,
      approvedDeniedAt:  r.approved_denied_at ? new Date(r.approved_denied_at).toISOString() : null,
      externalRequestId: r.external_request_id,
      notes:             r.notes ?? null,
    })),
  };
}

// ── Distinct filter values (for dropdowns) ────────────────────────────────────

export async function getTimeOffFilterValues(): Promise<{
  markets:      string[];
  driverTypes:  string[];
  driverClasses: string[];
  networks: string[];
  accounts: Array<{ id: string; name: string; network: string | null }>;
}> {
  const [driverRes, accountRes] = await Promise.all([
    pool.query(
    `SELECT DISTINCT d.market, d.driver_type, d.driver_classification
     FROM wiw_time_off_requests tor
     JOIN drivers d ON d.id = tor.driver_id
     WHERE tor.driver_id IS NOT NULL`
    ),
    pool.query(
      `SELECT id, customer_name, network
       FROM customers
       WHERE LOWER(COALESCE(status, 'active')) = 'active'
       ORDER BY customer_name`
    ),
  ]);

  const markets = new Set<string>();
  const driverTypes = new Set<string>();
  const driverClasses = new Set<string>();
  for (const row of driverRes.rows) {
    if (row.market) markets.add(row.market);
    if (row.driver_type) driverTypes.add(row.driver_type);
    if (row.driver_classification) driverClasses.add(row.driver_classification);
  }
  const accounts = accountRes.rows.map((row) => ({
    id: row.id,
    name: row.customer_name,
    network: row.network || null,
  }));
  const networks = Array.from(new Set(
    accounts
      .map((account) => account.network)
      .filter((network): network is string => Boolean(network)),
  )).sort();
  return {
    markets:      Array.from(markets).sort(),
    driverTypes:  Array.from(driverTypes).sort(),
    driverClasses: Array.from(driverClasses).sort(),
    networks,
    accounts,
  };
}

// ── Sync stats ────────────────────────────────────────────────────────────────

export async function getTimeOffSyncStats(): Promise<{
  totalRecords: number;
  lastSyncedAt: string | null;
  earliestDate: string | null;
  latestDate:   string | null;
}> {
  const res = await pool.query(
    `SELECT COUNT(*) AS total,
            MAX(synced_at) AS last_synced,
            MIN(start_date) AS earliest,
            MAX(start_date) AS latest
     FROM wiw_time_off_requests`
  );
  const row = res.rows[0] ?? {};
  return {
    totalRecords: parseInt(row.total ?? "0", 10),
    lastSyncedAt: row.last_synced ? new Date(row.last_synced).toISOString() : null,
    earliestDate: row.earliest ?? null,
    latestDate:   row.latest   ?? null,
  };
}
