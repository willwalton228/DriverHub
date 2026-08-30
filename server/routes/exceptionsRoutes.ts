import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { isAuthenticated } from "../replitAuth";

const router = Router();

// ── Severity map ─────────────────────────────────────────────────────────────
const SEVERITY_MAP: Record<string, string> = {
  // CRITICAL
  driver_not_marked_as_ic:     "critical",
  pay_with_no_hours:           "critical",
  pay_with_no_trips:           "critical",
  negative_profit:             "critical",
  // HIGH
  openforce_id_not_found:      "high",
  duplicate_openforce_id:      "high",
  high_cost_per_move:          "high",
  high_rideshare_cost:         "high",
  high_labor_cost:             "high",
  // MEDIUM
  hours_variance:              "medium",
  trip_variance:               "medium",
  missing_move_linkage:        "medium",
  missing_account_mapping:     "medium",
  unbilled_rideshare:          "medium",
  low_margin:                  "medium",
  // LOW
  pay_with_no_completed_moves: "low",
  completed_moves_with_no_pay: "low",
  zero_move_shift:             "low",
  unmatched_address:           "low",
};

const CATEGORY_MAP: Record<string, string> = {
  driver_not_marked_as_ic:     "driver_compliance",
  openforce_id_not_found:      "driver_compliance",
  duplicate_openforce_id:      "driver_compliance",
  hours_variance:              "pay_reconciliation",
  trip_variance:               "pay_reconciliation",
  pay_with_no_hours:           "pay_reconciliation",
  pay_with_no_trips:           "pay_reconciliation",
  pay_with_no_completed_moves: "cost_allocation",
  completed_moves_with_no_pay: "cost_allocation",
  zero_move_shift:             "cost_allocation",
  missing_move_linkage:        "cost_allocation",
  unmatched_address:           "rideshare",
  missing_account_mapping:     "rideshare",
  unbilled_rideshare:          "rideshare",
  negative_profit:             "financial",
  low_margin:                  "financial",
  high_cost_per_move:          "financial",
  high_rideshare_cost:         "financial",
  high_labor_cost:             "financial",
};

// ── Upsert helper — deduplicates by entity + type + period ──────────────────
export async function upsertException(opts: {
  exceptionType: string;
  entityType: string;
  entityId: string;
  description: string;
  sourceModule: string;
  relatedIds?: Record<string, unknown>;
  notes?: string;
}) {
  const { exceptionType, entityType, entityId, description, sourceModule, relatedIds, notes } = opts;
  const severity = SEVERITY_MAP[exceptionType] ?? "medium";
  const category = CATEGORY_MAP[exceptionType] ?? "financial";
  const relatedJson = relatedIds ? `'${JSON.stringify(relatedIds).replace(/'/g, "''")}'` : "NULL";
  const notesSafe = notes ? `'${notes.replace(/'/g, "''")}'` : "NULL";
  const descSafe  = description.replace(/'/g, "''");

  await db.execute(sql.raw(`
    INSERT INTO system_exceptions
      (exception_type, exception_category, severity, entity_type, entity_id,
       related_ids, description, source_module, status, notes, created_at, updated_at)
    VALUES (
      '${exceptionType}', '${category}', '${severity}', '${entityType}', '${entityId}',
      ${relatedJson}, '${descSafe}', '${sourceModule}', 'open', ${notesSafe}, now(), now()
    )
    ON CONFLICT DO NOTHING
  `));
}

// ─────────────────────────────────────────────────────────────────────────────
//   SYNC ENGINE — scans all source modules and creates exceptions
// ─────────────────────────────────────────────────────────────────────────────
async function runExceptionSync(opts: { lookbackDays?: number } = {}) {
  const { lookbackDays = 90 } = opts;
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const sinceStr = since.toISOString().slice(0, 10);

  let created = 0;

  // ── 1. OPENFORCE — pay with no hours ──────────────────────────────────────
  const payNoHours = await db.execute(sql.raw(`
    SELECT ot.id, ot.driver_name, ot.openforce_id, ot.pay_period_start
    FROM openforce_transactions ot
    WHERE ot.gross_pay > 0
      AND (ot.hours_worked IS NULL OR ot.hours_worked = 0)
      AND ot.pay_period_start >= '${sinceStr}'::date
  `));
  for (const row of payNoHours.rows as any[]) {
    await upsertException({
      exceptionType: "pay_with_no_hours",
      entityType: "driver",
      entityId: row.openforce_id ?? row.id,
      description: `${row.driver_name ?? row.openforce_id} received pay (period ${row.pay_period_start}) but 0 hours recorded.`,
      sourceModule: "openforce",
      relatedIds: { transactionId: row.id },
    });
    created++;
  }

  // ── 2. OPENFORCE — pay with no trips ──────────────────────────────────────
  const payNoTrips = await db.execute(sql.raw(`
    SELECT ot.id, ot.driver_name, ot.openforce_id, ot.pay_period_start
    FROM openforce_transactions ot
    WHERE ot.gross_pay > 0
      AND (ot.completed_moves IS NULL OR ot.completed_moves = 0)
      AND ot.pay_period_start >= '${sinceStr}'::date
  `));
  for (const row of payNoTrips.rows as any[]) {
    await upsertException({
      exceptionType: "pay_with_no_trips",
      entityType: "driver",
      entityId: row.openforce_id ?? row.id,
      description: `${row.driver_name ?? row.openforce_id} received pay (period ${row.pay_period_start}) but 0 completed moves.`,
      sourceModule: "openforce",
      relatedIds: { transactionId: row.id },
    });
    created++;
  }

  // ── 3. OPENFORCE — hours variance from reconciliation ─────────────────────
  const hoursVariance = await db.execute(sql.raw(`
    SELECT orr.id, orr.driver_name, orr.openforce_id, orr.pay_period_start, orr.hours_variance
    FROM openforce_reconciliation_results orr
    WHERE ABS(orr.hours_variance) > 2
      AND orr.pay_period_start >= '${sinceStr}'::date
  `));
  for (const row of hoursVariance.rows as any[]) {
    await upsertException({
      exceptionType: "hours_variance",
      entityType: "driver",
      entityId: row.openforce_id ?? row.id,
      description: `${row.driver_name ?? row.openforce_id}: hours variance of ${row.hours_variance}h (period ${row.pay_period_start}).`,
      sourceModule: "openforce",
      relatedIds: { reconId: row.id },
    });
    created++;
  }

  // ── 4. OPENFORCE — trip variance ──────────────────────────────────────────
  const tripVariance = await db.execute(sql.raw(`
    SELECT orr.id, orr.driver_name, orr.openforce_id, orr.pay_period_start, orr.trip_count_variance
    FROM openforce_reconciliation_results orr
    WHERE ABS(orr.trip_count_variance) > 3
      AND orr.pay_period_start >= '${sinceStr}'::date
  `));
  for (const row of tripVariance.rows as any[]) {
    await upsertException({
      exceptionType: "trip_variance",
      entityType: "driver",
      entityId: row.openforce_id ?? row.id,
      description: `${row.driver_name ?? row.openforce_id}: trip count variance of ${row.trip_count_variance} (period ${row.pay_period_start}).`,
      sourceModule: "openforce",
      relatedIds: { reconId: row.id },
    });
    created++;
  }

  // ── 5. RIDESHARE — unmatched transactions ─────────────────────────────────
  const unmatchedRS = await db.execute(sql.raw(`
    SELECT rt.id, rt.provider, rt.ride_date, rt.rider_name, rt.total_fare
    FROM rideshare_transactions rt
    WHERE rt.match_status = 'unmatched'
      AND rt.ride_date >= '${sinceStr}'::date
    LIMIT 500
  `));
  for (const row of unmatchedRS.rows as any[]) {
    await upsertException({
      exceptionType: "missing_account_mapping",
      entityType: "transaction",
      entityId: row.id,
      description: `${row.provider} ride on ${row.ride_date} for ${row.rider_name ?? "unknown"} (${row.total_fare ? "$" + row.total_fare : "no fare"}) has no account match.`,
      sourceModule: "rideshare",
      relatedIds: { transactionId: row.id },
    });
    created++;
  }

  // ── 6. RIDESHARE — unbilled transactions ──────────────────────────────────
  const unbilledRS = await db.execute(sql.raw(`
    SELECT rt.id, rt.provider, rt.ride_date, rt.matched_account_id, rt.total_fare
    FROM rideshare_transactions rt
    WHERE rt.billing_status = 'unreviewed'
      AND rt.match_status = 'auto_matched'
      AND rt.ride_date >= '${sinceStr}'::date
    LIMIT 500
  `));
  for (const row of unbilledRS.rows as any[]) {
    await upsertException({
      exceptionType: "unbilled_rideshare",
      entityType: "transaction",
      entityId: row.id,
      description: `${row.provider} ride on ${row.ride_date} matched to account but not yet billed (${row.total_fare ? "$" + row.total_fare : "no fare"}).`,
      sourceModule: "rideshare",
      relatedIds: { transactionId: row.id, accountId: row.matched_account_id },
    });
    created++;
  }

  // ── 7. ACCOUNT PROFITABILITY — financial anomalies ────────────────────────
  const profitAnomalies = await db.execute(sql.raw(`
    SELECT afs.id, afs.account_name, afs.account_number, afs.period_start, afs.anomaly_codes, afs.account_id
    FROM account_financial_summary afs
    WHERE afs.anomaly_flag = true
      AND afs.period_start >= '${sinceStr}'::date
  `));
  for (const row of profitAnomalies.rows as any[]) {
    const codes: string[] = (row.anomaly_codes ?? "").split("|").filter(Boolean);
    for (const code of codes) {
      if (!SEVERITY_MAP[code]) continue;
      await upsertException({
        exceptionType: code,
        entityType: "account",
        entityId: row.account_id ?? row.id,
        description: `${row.account_name ?? row.account_number}: ${code.replace(/_/g, " ")} detected for period ${row.period_start}.`,
        sourceModule: "profitability",
        relatedIds: { summaryId: row.id, accountId: row.account_id },
      });
      created++;
    }
  }

  // ── 8. COST ENGINE — labor cost with no completed moves ───────────────────
  const laborNoMoves = await db.execute(sql.raw(`
    SELECT mlca.id, mlca.driver_id, mlca.move_labor_cost, mlca.trip_date
    FROM move_labor_cost_allocations mlca
    WHERE mlca.move_labor_cost > 0
      AND (mlca.move_id IS NULL OR mlca.anomaly_flag = true)
      AND mlca.trip_date::date >= '${sinceStr}'::date
    LIMIT 300
  `));
  for (const row of laborNoMoves.rows as any[]) {
    await upsertException({
      exceptionType: "pay_with_no_completed_moves",
      entityType: "driver",
      entityId: row.driver_id ?? row.id,
      description: `Labor cost of $${row.move_labor_cost} on ${row.trip_date} has no associated completed move.`,
      sourceModule: "cost_engine",
      relatedIds: { allocationId: row.id },
    });
    created++;
  }

  return { created };
}

// ─── POST /sync ───────────────────────────────────────────────────────────────
router.post("/sync", isAuthenticated, async (req: any, res) => {
  try {
    const { lookbackDays = 90 } = req.body ?? {};
    const result = await runExceptionSync({ lookbackDays });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[exception-sync]", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /summary ─────────────────────────────────────────────────────────────
router.get("/summary", isAuthenticated, async (_req, res) => {
  try {
    const kpis = await db.execute(sql.raw(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('resolved','ignored'))::int        AS total_open,
        COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved','ignored'))::int AS critical,
        COUNT(*) FILTER (WHERE severity = 'high'     AND status NOT IN ('resolved','ignored'))::int AS high,
        COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= now() - interval '7 days')::int AS resolved_last_7d,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, now()) - created_at)) / 86400)
              FILTER (WHERE status = 'resolved'), 1) AS avg_resolution_days
      FROM system_exceptions
    `));

    const bySeverity = await db.execute(sql.raw(`
      SELECT severity, COUNT(*)::int AS count
      FROM system_exceptions
      WHERE status NOT IN ('resolved','ignored')
      GROUP BY severity
      ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
    `));

    const byCategory = await db.execute(sql.raw(`
      SELECT exception_category, COUNT(*)::int AS count
      FROM system_exceptions
      WHERE status NOT IN ('resolved','ignored')
      GROUP BY exception_category
      ORDER BY count DESC
    `));

    const byModule = await db.execute(sql.raw(`
      SELECT source_module, COUNT(*)::int AS count
      FROM system_exceptions
      WHERE status NOT IN ('resolved','ignored')
      GROUP BY source_module
      ORDER BY count DESC
    `));

    return res.json({
      kpis: kpis.rows[0] ?? {},
      bySeverity: bySeverity.rows,
      byCategory: byCategory.rows,
      byModule: byModule.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const {
      category, severity, status, sourceModule, assignedUserId,
      dateFrom, dateTo,
      sortBy = "severity_order", order = "asc",
      limit = "200", offset = "0",
    } = req.query as Record<string, string>;

    const conds: string[] = [];
    if (category)       conds.push(`e.exception_category = '${category.replace(/'/g,"''")}'`);
    if (severity)       conds.push(`e.severity = '${severity.replace(/'/g,"''")}'`);
    if (status)         conds.push(`e.status = '${status.replace(/'/g,"''")}'`);
    else                conds.push(`e.status NOT IN ('resolved','ignored')`);
    if (sourceModule)   conds.push(`e.source_module = '${sourceModule.replace(/'/g,"''")}'`);
    if (assignedUserId) conds.push(`e.assigned_to_user_id = '${assignedUserId.replace(/'/g,"''")}'`);
    if (dateFrom)       conds.push(`e.created_at >= '${dateFrom}'::timestamptz`);
    if (dateTo)         conds.push(`e.created_at <= '${dateTo}'::timestamptz`);
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";

    const sortCols: Record<string, string> = {
      severity_order: "CASE e.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END",
      created_at:     "e.created_at",
      exception_type: "e.exception_type",
      status:         "e.status",
      source_module:  "e.source_module",
    };
    const sortExpr = sortCols[sortBy] ?? sortCols.severity_order;
    const sortDir  = order === "desc" ? "DESC" : "ASC";

    const rows = await db.execute(sql.raw(`
      SELECT
        e.*,
        u.first_name || ' ' || u.last_name AS assigned_to_name
      FROM system_exceptions e
      LEFT JOIN users u ON u.id = e.assigned_to_user_id
      ${where}
      ORDER BY ${sortExpr} ${sortDir}, e.created_at ASC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `));

    const total = await db.execute(sql.raw(`
      SELECT COUNT(*)::int AS n FROM system_exceptions e ${where}
    `));

    return res.json({ rows: rows.rows, total: total.rows[0]?.n ?? 0 });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /top ─────────────────────────────────────────────────────────────────
router.get("/top", isAuthenticated, async (req: any, res) => {
  try {
    const { limit = "10" } = req.query as Record<string, string>;
    const rows = await db.execute(sql.raw(`
      SELECT
        e.id, e.exception_type, e.exception_category, e.severity,
        e.entity_type, e.entity_id, e.description, e.source_module,
        e.status, e.created_at,
        EXTRACT(DAY FROM now() - e.created_at)::int AS age_days
      FROM system_exceptions e
      WHERE e.status NOT IN ('resolved','ignored')
      ORDER BY
        CASE e.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END ASC,
        e.created_at ASC
      LIMIT ${parseInt(limit)}
    `));
    return res.json({ exceptions: rows.rows });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────
router.patch("/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = (req.session as any)?.userId || req.user?.claims?.sub || null;
    const { status, assignedToUserId, notes } = req.body as Record<string, string>;

    const sets: string[] = [`updated_at = now()`];
    if (status) {
      sets.push(`status = '${status.replace(/'/g,"''")}'`);
      if (status === "resolved") {
        sets.push(`resolved_at = now()`);
        sets.push(`resolved_by_user_id = ${userId ? `'${userId}'` : "NULL"}`);
      }
    }
    if (assignedToUserId !== undefined) {
      sets.push(`assigned_to_user_id = ${assignedToUserId ? `'${assignedToUserId.replace(/'/g,"''")}'` : "NULL"}`);
    }
    if (notes !== undefined) {
      sets.push(`notes = '${notes.replace(/'/g,"''")}'`);
    }

    const result = await db.execute(sql.raw(`
      UPDATE system_exceptions
      SET ${sets.join(", ")}
      WHERE id = '${id.replace(/'/g,"''")}'
      RETURNING *
    `));

    if (!result.rows.length) return res.status(404).json({ message: "Not found" });
    return res.json(result.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export { runExceptionSync };
export default router;
