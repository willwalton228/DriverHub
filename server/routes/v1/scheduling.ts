/**
 * DriverConnect Integration API v1 — Scheduling & Attendance Endpoints
 *
 * GET /api/v1/scheduling/shifts    — Paginated shift list (canonical WIW data)
 * GET /api/v1/scheduling/times     — Approved clock-in/out records only
 * GET /api/v1/scheduling/absences  — Absence records (call-outs)
 * GET /api/v1/scheduling/notices   — Attendance notices (late, no-show, early-leave)
 *
 * Rules:
 *  - DriverConnect NEVER calls When I Work directly.
 *  - All data is served from DriverHub canonical tables (wiw_shifts, wiw_times,
 *    wiw_absences, wiw_attendance_notices) populated by the WIW Sync engine.
 *  - Times: ONLY approved records are surfaced (approval_status = 'approved').
 *  - Every endpoint supports optional `driver_id` scoping for per-driver queries.
 *  - Pagination: page / page_size (max 100, default 25).
 *  - Auth: Bearer <token> | X-API-Key <token> — enforced by parent router.
 */

import { Router, Request, Response } from 'express';
import { pool } from '../../db';

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

function paginationParams(req: Request): { page: number; pageSize: number; offset: number } {
  const page     = Math.max(1, parseInt((req.query.page      as string) || '1',  10));
  const pageSize = Math.min(100, Math.max(1, parseInt((req.query.page_size as string) || '25', 10)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function dateFilter(alias: string, col: string, start?: string, end?: string): { clauses: string[]; params: any[] } {
  const clauses: string[] = [];
  const params:  any[]   = [];
  if (start) { clauses.push(`${alias}.${col} >= $PLACEHOLDER`); params.push(start); }
  if (end)   { clauses.push(`${alias}.${col} < ($PLACEHOLDER::date + interval '1 day')`); params.push(end); }
  return { clauses, params };
}

/** Rebind $PLACEHOLDER tokens to $1, $2, … starting at `offset` */
function bindParams(sql: string, params: any[], startAt = 1): { sql: string; params: any[]; next: number } {
  let i = startAt;
  const bound = sql.replace(/\$PLACEHOLDER/g, () => `$${i++}`);
  return { sql: bound, params, next: i };
}

// ── GET /scheduling/shifts ────────────────────────────────────────────────────

router.get('/scheduling/shifts', async (req: Request, res: Response) => {
  try {
    const { page, pageSize, offset } = paginationParams(req);
    const driverId = (req.query.driver_id as string) || '';
    const status   = (req.query.status    as string) || '';
    const start    = (req.query.start     as string) || '';
    const end      = (req.query.end       as string) || '';

    const conditions: string[] = [];
    const params:     any[]   = [];
    let pi = 1;

    if (driverId) { conditions.push(`u.driver_id = $${pi++}`);    params.push(driverId); }
    if (status)   { conditions.push(`s.status = $${pi++}`);        params.push(status);   }
    if (start)    { conditions.push(`s.start_time >= $${pi++}`);   params.push(start);    }
    if (end)      { conditions.push(`s.start_time < ($${pi++}::date + interval '1 day')`); params.push(end); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rowsQ, countQ] = await Promise.all([
      pool.query(`
        SELECT
          s.id                  AS shift_id,
          s.external_shift_id,
          s.start_time,
          s.end_time,
          s.scheduled_minutes,
          s.status,
          s.is_open,
          s.notes,
          u.driver_id,
          COALESCE(uh.first_name || ' ' || uh.last_name, u.name) AS driver_name,
          l.name                AS location_name,
          l.address             AS location_address,
          p.name                AS position_name
        FROM wiw_shifts s
        LEFT JOIN wiw_users     u  ON u.id  = s.wiw_user_id
        LEFT JOIN drivers       d  ON d.id  = u.driver_id
        LEFT JOIN users         uh ON uh.id = d.user_id
        LEFT JOIN wiw_locations l  ON l.id  = s.wiw_location_id
        LEFT JOIN wiw_positions p  ON p.id  = s.wiw_position_id
        ${where}
        ORDER BY s.start_time DESC NULLS LAST
        LIMIT $${pi} OFFSET $${pi + 1}
      `, [...params, pageSize, offset]),
      pool.query(
        `SELECT count(*)::int AS total FROM wiw_shifts s LEFT JOIN wiw_users u ON u.id = s.wiw_user_id ${where}`,
        params
      ),
    ]);

    const total = countQ.rows[0]?.total ?? 0;
    res.json({
      success:  true,
      data:     rowsQ.rows,
      meta: { page, pageSize, total, hasMore: page * pageSize < total },
    });
  } catch (err: any) {
    console.error('[DC v1] scheduling/shifts error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err?.message } });
  }
});

// ── GET /scheduling/times ─────────────────────────────────────────────────────

router.get('/scheduling/times', async (req: Request, res: Response) => {
  try {
    const { page, pageSize, offset } = paginationParams(req);
    const driverId = (req.query.driver_id as string) || '';
    const start    = (req.query.start     as string) || '';
    const end      = (req.query.end       as string) || '';

    const conditions: string[] = ["t.approval_status = 'approved'"]; // APPROVED ONLY
    const params:     any[]   = [];
    let pi = 1;

    if (driverId) { conditions.push(`u.driver_id = $${pi++}`);   params.push(driverId); }
    if (start)    { conditions.push(`t.clock_in >= $${pi++}`);   params.push(start);    }
    if (end)      { conditions.push(`t.clock_in < ($${pi++}::date + interval '1 day')`); params.push(end); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [rowsQ, countQ] = await Promise.all([
      pool.query(`
        SELECT
          t.id                AS time_id,
          t.external_time_id,
          t.clock_in,
          t.clock_out,
          t.total_minutes,
          t.auto_clock_out,
          t.notes,
          t.approved_at,
          u.driver_id,
          COALESCE(uh.first_name || ' ' || uh.last_name, u.name) AS driver_name,
          s.start_time        AS shift_start,
          s.end_time          AS shift_end
        FROM wiw_times t
        LEFT JOIN wiw_users  u  ON u.id  = t.wiw_user_id
        LEFT JOIN drivers    d  ON d.id  = u.driver_id
        LEFT JOIN users      uh ON uh.id = d.user_id
        LEFT JOIN wiw_shifts s  ON s.id  = t.wiw_shift_id
        ${where}
        ORDER BY t.clock_in DESC NULLS LAST
        LIMIT $${pi} OFFSET $${pi + 1}
      `, [...params, pageSize, offset]),
      pool.query(
        `SELECT count(*)::int AS total FROM wiw_times t LEFT JOIN wiw_users u ON u.id = t.wiw_user_id ${where}`,
        params
      ),
    ]);

    const total = countQ.rows[0]?.total ?? 0;
    res.json({
      success:  true,
      data:     rowsQ.rows,
      meta: { page, pageSize, total, hasMore: page * pageSize < total },
    });
  } catch (err: any) {
    console.error('[DC v1] scheduling/times error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err?.message } });
  }
});

// ── GET /scheduling/absences ──────────────────────────────────────────────────

router.get('/scheduling/absences', async (req: Request, res: Response) => {
  try {
    const { page, pageSize, offset } = paginationParams(req);
    const driverId = (req.query.driver_id as string) || '';
    const status   = (req.query.status    as string) || '';
    const start    = (req.query.start     as string) || '';
    const end      = (req.query.end       as string) || '';

    const conditions: string[] = [];
    const params:     any[]   = [];
    let pi = 1;

    if (driverId) { conditions.push(`u.driver_id = $${pi++}`);  params.push(driverId); }
    if (status)   { conditions.push(`a.status = $${pi++}`);     params.push(status);   }
    if (start)    { conditions.push(`a.date >= $${pi++}`);      params.push(start);    }
    if (end)      { conditions.push(`a.date <= $${pi++}`);      params.push(end);      }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rowsQ, countQ] = await Promise.all([
      pool.query(`
        SELECT
          a.id              AS absence_id,
          a.external_absence_id,
          a.date,
          a.reason,
          a.duration_minutes,
          a.status,
          a.notes,
          u.driver_id,
          COALESCE(uh.first_name || ' ' || uh.last_name, u.name) AS driver_name
        FROM wiw_absences a
        LEFT JOIN wiw_users u  ON u.id  = a.wiw_user_id
        LEFT JOIN drivers   d  ON d.id  = u.driver_id
        LEFT JOIN users     uh ON uh.id = d.user_id
        ${where}
        ORDER BY a.date DESC NULLS LAST
        LIMIT $${pi} OFFSET $${pi + 1}
      `, [...params, pageSize, offset]),
      pool.query(
        `SELECT count(*)::int AS total FROM wiw_absences a LEFT JOIN wiw_users u ON u.id = a.wiw_user_id ${where}`,
        params
      ),
    ]);

    const total = countQ.rows[0]?.total ?? 0;
    res.json({
      success:  true,
      data:     rowsQ.rows,
      meta: { page, pageSize, total, hasMore: page * pageSize < total },
    });
  } catch (err: any) {
    console.error('[DC v1] scheduling/absences error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err?.message } });
  }
});

// ── GET /scheduling/notices ───────────────────────────────────────────────────

router.get('/scheduling/notices', async (req: Request, res: Response) => {
  try {
    const { page, pageSize, offset } = paginationParams(req);
    const driverId = (req.query.driver_id as string) || '';
    const type     = (req.query.type      as string) || '';
    const start    = (req.query.start     as string) || '';
    const end      = (req.query.end       as string) || '';

    const conditions: string[] = [];
    const params:     any[]   = [];
    let pi = 1;

    if (driverId) { conditions.push(`u.driver_id = $${pi++}`);    params.push(driverId); }
    if (type)     { conditions.push(`n.type = $${pi++}`);         params.push(type);     }
    if (start)    { conditions.push(`n.occurred_at >= $${pi++}`); params.push(start);    }
    if (end)      { conditions.push(`n.occurred_at < ($${pi++}::date + interval '1 day')`); params.push(end); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rowsQ, countQ] = await Promise.all([
      pool.query(`
        SELECT
          n.id              AS notice_id,
          n.external_notice_id,
          n.type,
          n.occurred_at,
          n.minutes_late,
          n.notes,
          u.driver_id,
          COALESCE(uh.first_name || ' ' || uh.last_name, u.name) AS driver_name
        FROM wiw_attendance_notices n
        LEFT JOIN wiw_users u  ON u.id  = n.wiw_user_id
        LEFT JOIN drivers   d  ON d.id  = u.driver_id
        LEFT JOIN users     uh ON uh.id = d.user_id
        ${where}
        ORDER BY n.occurred_at DESC NULLS LAST
        LIMIT $${pi} OFFSET $${pi + 1}
      `, [...params, pageSize, offset]),
      pool.query(
        `SELECT count(*)::int AS total FROM wiw_attendance_notices n LEFT JOIN wiw_users u ON u.id = n.wiw_user_id ${where}`,
        params
      ),
    ]);

    const total = countQ.rows[0]?.total ?? 0;
    res.json({
      success:  true,
      data:     rowsQ.rows,
      meta: { page, pageSize, total, hasMore: page * pageSize < total },
    });
  } catch (err: any) {
    console.error('[DC v1] scheduling/notices error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err?.message } });
  }
});

export default router;
