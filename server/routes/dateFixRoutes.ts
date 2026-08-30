/**
 * Date Fix Tool — Backend Routes
 *
 * Provides admin-only endpoints to:
 *  1. List all import batches and preview which driver records have date fields set
 *  2. Preview the +1 day correction for a specific batch (BEFORE applying)
 *  3. Apply the +1 day correction to a specific batch
 *  4. Fetch audit log of corrections already applied
 *  5. Search for a specific driver and manually correct their created_at date
 *
 * Root cause: dates imported as UTC midnight (T00:00:00.000Z) shift backward one day
 * when PostgreSQL converts to local server timezone before storing in a DATE column.
 * This tool corrects that by adding INTERVAL '1 day' to affected records ONLY.
 */

import { Router } from "express";
import { db } from "../db";
import { isAuthenticated } from "../replitAuth";
import { sql } from "drizzle-orm";

const router = Router();

const CORRECTABLE_DATE_COLS = [
  { col: "hire_date",       label: "Hire Date" },
  { col: "date_of_birth",   label: "Date of Birth" },
  { col: "mvr_record_date", label: "MVR Record Date" },
  { col: "inactive_date",   label: "Inactive Date" },
  { col: "date_certified",  label: "Date Certified" },
  { col: "created_at",      label: "Date Created (imported)" },
];

function isSuperAdmin(req: any): boolean {
  const role = req.user?.claims?.role ?? req.user?.role ?? "";
  const isRoot = !!(req.user?.claims?.isRootSuperAdmin ?? req.user?.isRootSuperAdmin);
  return role === "super_user" || isRoot;
}

// ─── GET /batches — list all import batches with date field counts ─────────────
router.get("/batches", isAuthenticated, async (req: any, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: "Super Admin access required" });

  try {
    const batchResult = await db.execute(sql`
      SELECT
        ib.id,
        ib.source_file_name,
        ib.status,
        ib.total_rows,
        ib.committed_at,
        ib.created_at,
        ib.created_by_username,
        COUNT(d.id)                                                        AS driver_count,
        COUNT(d.id) FILTER (WHERE d.hire_date IS NOT NULL)                 AS has_hire_date,
        COUNT(d.id) FILTER (WHERE d.date_of_birth IS NOT NULL)             AS has_dob,
        COUNT(d.id) FILTER (WHERE d.mvr_record_date IS NOT NULL)           AS has_mvr,
        COUNT(d.id) FILTER (WHERE d.inactive_date IS NOT NULL)             AS has_inactive,
        COUNT(d.id) FILTER (WHERE d.date_certified IS NOT NULL)            AS has_certified
      FROM import_batches ib
      LEFT JOIN drivers d ON d.needs_update_import_batch_id = ib.id
      WHERE ib.status = 'committed'
      GROUP BY ib.id
      ORDER BY ib.created_at DESC
    `);

    return res.json(batchResult.rows ?? batchResult);
  } catch (err: any) {
    console.error("[DateFix] GET /batches:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /preview/:batchId — show before/after sample for a batch ────────────
router.get("/preview/:batchId", isAuthenticated, async (req: any, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: "Super Admin access required" });

  try {
    const { batchId } = req.params;

    const result = await db.execute(sql`
      SELECT
        d.id,
        u.first_name,
        u.last_name,
        d.hire_date,
        d.date_of_birth,
        d.mvr_record_date,
        d.inactive_date,
        d.date_certified,
        d.created_at,
        d.needs_update_import_batch_id AS import_batch_id
      FROM drivers d
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.needs_update_import_batch_id = ${batchId}
        AND (
          d.hire_date IS NOT NULL
          OR d.date_of_birth IS NOT NULL
          OR d.mvr_record_date IS NOT NULL
          OR d.inactive_date IS NOT NULL
          OR d.date_certified IS NOT NULL
        )
      ORDER BY d.created_at DESC
      LIMIT 20
    `);

    const rows = (result.rows ?? result) as any[];

    const preview = rows.map(r => ({
      id:             r.id,
      name:           `${r.first_name || ""} ${r.last_name || ""}`.trim() || `Driver ${r.id.slice(0, 8)}`,
      before: {
        hireDate:     r.hire_date,
        dateOfBirth:  r.date_of_birth,
        mvrRecordDate: r.mvr_record_date,
        inactiveDate: r.inactive_date,
        dateCertified: r.date_certified,
      },
      after: {
        hireDate:      r.hire_date      ? offsetDate(r.hire_date, 1)      : null,
        dateOfBirth:   r.date_of_birth  ? offsetDate(r.date_of_birth, 1)  : null,
        mvrRecordDate: r.mvr_record_date ? offsetDate(r.mvr_record_date, 1) : null,
        inactiveDate:  r.inactive_date   ? offsetDate(r.inactive_date, 1)  : null,
        dateCertified: r.date_certified  ? offsetDate(r.date_certified, 1) : null,
      },
    }));

    const countResult = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM drivers
      WHERE needs_update_import_batch_id = ${batchId}
        AND (
          hire_date IS NOT NULL
          OR date_of_birth IS NOT NULL
          OR mvr_record_date IS NOT NULL
          OR inactive_date IS NOT NULL
          OR date_certified IS NOT NULL
        )
    `);
    const total = Number((countResult.rows ?? countResult as any)[0]?.cnt ?? 0);

    return res.json({ batchId, total, preview });
  } catch (err: any) {
    console.error("[DateFix] GET /preview:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /apply/:batchId — apply +1 day correction ─────────────────────────
router.post("/apply/:batchId", isAuthenticated, async (req: any, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: "Super Admin access required" });

  try {
    const { batchId } = req.params;
    const { confirm, fields } = req.body as { confirm: boolean; fields?: string[] };

    if (!confirm) return res.status(400).json({ message: "Send confirm: true to apply the correction" });

    const toFix = (fields && fields.length > 0)
      ? CORRECTABLE_DATE_COLS.filter(c => fields.includes(c.col))
      : CORRECTABLE_DATE_COLS.filter(c => c.col !== "created_at");

    const setClause = toFix.map(c =>
      `${c.col} = CASE WHEN ${c.col} IS NOT NULL THEN ${c.col} + INTERVAL '1 day' ELSE NULL END`
    ).join(",\n  ");

    const updateResult = await db.execute(sql.raw(`
      UPDATE drivers
      SET
        ${setClause}
      WHERE needs_update_import_batch_id = '${batchId.replace(/'/g, "''")}'
      RETURNING id
    `));

    const updatedIds = (updateResult.rows ?? updateResult) as any[];

    try {
      const actorEmail = req.user?.claims?.email ?? req.user?.email ?? "unknown";
      await db.execute(sql`
        INSERT INTO import_audit_log (batch_id, row_id, action, message, created_at)
        VALUES (
          ${batchId},
          'batch',
          'date_correction_applied',
          ${`UTC shift correction (+1 day) applied to ${updatedIds.length} driver record(s) for batch ${batchId}. Fields corrected: ${toFix.map(f => f.label).join(", ")}. Applied by: ${actorEmail}`},
          NOW()
        )
      `);
    } catch (auditErr) {
      console.warn("[DateFix] Audit log write failed:", auditErr);
    }

    return res.json({
      success:         true,
      batchId,
      recordsUpdated:  updatedIds.length,
      fieldsFixed:     toFix.map(f => f.label),
      appliedAt:       new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[DateFix] POST /apply:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /audit — list previous corrections ───────────────────────────────────
router.get("/audit", isAuthenticated, async (req: any, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: "Super Admin access required" });

  try {
    const result = await db.execute(sql`
      SELECT *
      FROM import_audit_log
      WHERE action IN ('date_correction_applied', 'manual_date_correction')
      ORDER BY created_at DESC
      LIMIT 50
    `);
    return res.json(result.rows ?? result);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /driver/search — search for a driver to manually correct ─────────────
router.get("/driver/search", isAuthenticated, async (req: any, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: "Super Admin access required" });

  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 2) return res.status(400).json({ message: "Provide at least 2 characters" });

  try {
    const result = await db.execute(sql`
      SELECT
        d.id,
        u.first_name,
        u.last_name,
        d.phone_number,
        d.openforce_id,
        d.network,
        d.status,
        d.created_at::text   AS created_at,
        d.hire_date::text     AS hire_date,
        d.date_of_birth::text AS date_of_birth
      FROM drivers d
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.is_deleted IS DISTINCT FROM true
        AND (
          d.phone_number ILIKE ${'%' + q + '%'}
          OR d.openforce_id ILIKE ${'%' + q + '%'}
          OR u.first_name  ILIKE ${'%' + q + '%'}
          OR u.last_name   ILIKE ${'%' + q + '%'}
          OR (u.first_name || ' ' || u.last_name) ILIKE ${'%' + q + '%'}
        )
      ORDER BY d.created_at DESC
      LIMIT 15
    `);

    const rows = (result.rows ?? result) as any[];
    return res.json(rows.map(r => ({
      id:          r.id,
      firstName:   r.first_name ?? "",
      lastName:    r.last_name ?? "",
      phoneNumber: r.phone_number ?? "",
      openforceId: r.openforce_id ?? "",
      network:     r.network ?? "",
      status:      r.status ?? "",
      createdAt:   r.created_at,
      hireDate:    r.hire_date,
      dateOfBirth: r.date_of_birth,
    })));
  } catch (err: any) {
    console.error("[DateFix] GET /driver/search:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /driver/:driverId/fix-created-date — set created_at for one driver ──
router.post("/driver/:driverId/fix-created-date", isAuthenticated, async (req: any, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: "Super Admin access required" });

  const { driverId } = req.params;
  const { newDate, confirm } = req.body as { newDate: string; confirm: boolean };

  if (!confirm) return res.status(400).json({ message: "Send confirm: true to apply" });
  if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return res.status(400).json({ message: "newDate must be YYYY-MM-DD" });
  }

  try {
    // Get current state
    const before = await db.execute(sql`
      SELECT d.id, u.first_name, u.last_name, d.created_at::text AS created_at
      FROM drivers d LEFT JOIN users u ON u.id = d.user_id
      WHERE d.id = ${driverId}
    `);
    const beforeRow = (before.rows ?? before as any)[0];
    if (!beforeRow) return res.status(404).json({ message: "Driver not found" });

    const oldValue = beforeRow.created_at;
    const newTimestamp = `${newDate} 00:00:00`;

    await db.execute(sql.raw(`
      UPDATE drivers
      SET created_at = '${newTimestamp}'::timestamp
      WHERE id = '${driverId.replace(/'/g, "''")}'
    `));

    // Audit
    try {
      const actorEmail = req.user?.claims?.email ?? req.user?.email ?? "unknown";
      const driverName = `${beforeRow.first_name ?? ""} ${beforeRow.last_name ?? ""}`.trim() || driverId;
      await db.execute(sql`
        INSERT INTO import_audit_log (batch_id, row_id, action, message, created_at)
        VALUES (
          'manual',
          ${driverId},
          'manual_date_correction',
          ${`Manual created_at correction for ${driverName} (${driverId}): ${oldValue} → ${newTimestamp}. Applied by: ${actorEmail}`},
          NOW()
        )
      `);
    } catch (auditErr) {
      console.warn("[DateFix] Audit log write failed:", auditErr);
    }

    return res.json({
      success: true,
      driverId,
      previousValue: oldValue,
      newValue:      newTimestamp,
      appliedAt:     new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[DateFix] POST /driver/fix-created-date:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function offsetDate(dateStr: string | null, days: number): string | null {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().split("T")[0];
}

export default router;
