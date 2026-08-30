/**
 * Data Correction Tool Routes
 * Platform Admin → Data Ops → Data Repair → Date Correction Tool
 *
 * Provides preview, execution, and audit log endpoints for the
 * general-purpose date correction tool (shift by N days, or replace value).
 *
 * Access: Super Admin only (enforced via isSuperAdmin guard).
 */

import { Router } from "express";
import { db } from "../db";
import { drivers, dataCorrectionAuditLog } from "../../shared/schema";
import { eq, and, inArray, isNotNull, sql } from "drizzle-orm";

const router = Router();

// ── Supported datasets and their date fields ──────────────────────────────────

const DATASET_FIELDS: Record<string, { col: string; label: string }[]> = {
  drivers: [
    { col: "hire_date",       label: "Hire Date" },
    { col: "date_of_birth",   label: "Date of Birth" },
    { col: "mvr_record_date", label: "MVR Record Date" },
    { col: "inactive_date",   label: "Inactive Date" },
    { col: "date_certified",  label: "Date Certified" },
  ],
};

function isSuperAdmin(req: any): boolean {
  const role = req.user?.role ?? req.session?.passport?.user?.role;
  return ["super_admin", "root_super_admin"].includes(role);
}

// ── GET /api/corporate/data-correction/datasets ───────────────────────────────
// Returns supported datasets and their date fields.

router.get("/datasets", (req: any, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: "Super Admin only" });
  res.json({
    datasets: [
      {
        key: "drivers",
        label: "Drivers",
        fields: DATASET_FIELDS.drivers,
        available: true,
      },
      { key: "moves",    label: "Moves",    fields: [], available: false },
      { key: "payments", label: "Payments", fields: [], available: false },
    ],
  });
});

// ── POST /api/corporate/data-correction/preview ───────────────────────────────
// Body: { dataset, dateField, transformType, shiftDays?, replaceValue? }
// Returns preview of affected records (up to 50 rows).

router.post("/preview", async (req: any, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: "Super Admin only" });

  const { dataset, dateField, transformType, shiftDays, replaceValue } = req.body;
  const orgId = req.user?.orgId ?? req.session?.passport?.user?.orgId;

  if (!dataset || !dateField || !transformType) {
    return res.status(400).json({ message: "dataset, dateField, and transformType are required" });
  }

  if (!DATASET_FIELDS[dataset]) {
    return res.status(400).json({ message: `Dataset '${dataset}' is not supported` });
  }

  const validField = DATASET_FIELDS[dataset].find(f => f.col === dateField);
  if (!validField) {
    return res.status(400).json({ message: `Field '${dateField}' is not valid for dataset '${dataset}'` });
  }

  if (transformType === "shift_days" && (shiftDays === undefined || shiftDays === null || isNaN(Number(shiftDays)))) {
    return res.status(400).json({ message: "shiftDays is required for shift_days transform" });
  }
  if (transformType === "replace_value" && !replaceValue) {
    return res.status(400).json({ message: "replaceValue is required for replace_value transform" });
  }

  try {
    if (dataset === "drivers") {
      const colQuoted = `"${dateField}"`;
      const countResult = await db.execute(sql.raw(
        `SELECT COUNT(*) AS total FROM drivers WHERE org_id = '${orgId}' AND ${colQuoted} IS NOT NULL`
      ));
      const total = Number((countResult.rows[0] as any)?.total ?? 0);

      const previewResult = await db.execute(sql.raw(
        `SELECT id, first_name, last_name, ${colQuoted} AS current_value FROM drivers
         WHERE org_id = '${orgId}' AND ${colQuoted} IS NOT NULL
         ORDER BY last_name, first_name LIMIT 50`
      ));

      const days = Number(shiftDays ?? 0);
      const preview = previewResult.rows.map((row: any) => {
        const cur = row.current_value ? String(row.current_value).slice(0, 10) : null;
        let next: string | null = null;
        if (transformType === "shift_days" && cur) {
          const d = new Date(cur);
          d.setDate(d.getDate() + days);
          next = d.toISOString().slice(0, 10);
        } else if (transformType === "replace_value") {
          next = replaceValue;
        }
        return {
          id: row.id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          currentValue: cur,
          newValue: next,
        };
      });

      return res.json({ total, fieldLabel: validField.label, preview });
    }

    return res.status(400).json({ message: "Dataset not yet supported for preview" });
  } catch (err: any) {
    console.error("[DataCorrection] Preview error:", err);
    return res.status(500).json({ message: err.message ?? "Preview failed" });
  }
});

// ── POST /api/corporate/data-correction/execute ───────────────────────────────
// Body: { dataset, dateField, transformType, shiftDays?, replaceValue?, notes?, confirm: true }
// Executes the correction and writes an audit log entry.

router.post("/execute", async (req: any, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: "Super Admin only" });

  const {
    dataset, dateField, transformType,
    shiftDays, replaceValue, notes, confirm,
  } = req.body;

  if (!confirm) {
    return res.status(400).json({ message: "Must include confirm: true" });
  }

  const orgId     = req.user?.orgId    ?? req.session?.passport?.user?.orgId;
  const userId    = req.user?.id       ?? req.session?.passport?.user?.id;
  const userName  = req.user?.username ?? req.session?.passport?.user?.username ?? "unknown";

  if (!DATASET_FIELDS[dataset]?.find(f => f.col === dateField)) {
    return res.status(400).json({ message: "Invalid dataset or date field" });
  }

  const days = Number(shiftDays ?? 0);

  try {
    let recordsAffected = 0;

    if (dataset === "drivers") {
      const colQuoted = `"${dateField}"`;

      if (transformType === "shift_days") {
        const result = await db.execute(sql.raw(
          `UPDATE drivers
           SET ${colQuoted} = ${colQuoted} + INTERVAL '${days} days'
           WHERE org_id = '${orgId}' AND ${colQuoted} IS NOT NULL`
        ));
        recordsAffected = Number((result as any).rowCount ?? 0);
      } else if (transformType === "replace_value") {
        const safeVal = replaceValue.replace(/'/g, "''");
        const result = await db.execute(sql.raw(
          `UPDATE drivers
           SET ${colQuoted} = '${safeVal}'::date
           WHERE org_id = '${orgId}' AND ${colQuoted} IS NOT NULL`
        ));
        recordsAffected = Number((result as any).rowCount ?? 0);
      } else {
        return res.status(400).json({ message: "Unknown transformType" });
      }
    } else {
      return res.status(400).json({ message: "Dataset not yet supported for execution" });
    }

    // Write audit log entry
    await db.insert(dataCorrectionAuditLog).values({
      orgId,
      executedBy: userId,
      executedByName: userName,
      dataset,
      dateField,
      transformType,
      shiftDays: transformType === "shift_days" ? days : null,
      replaceValue: transformType === "replace_value" ? replaceValue : null,
      filterType: "all",
      filterValue: null,
      recordsAffected,
      status: "completed",
      notes: notes ?? null,
    });

    return res.json({ success: true, recordsAffected });
  } catch (err: any) {
    // Still write a failed audit entry
    try {
      await db.insert(dataCorrectionAuditLog).values({
        orgId,
        executedBy: userId,
        executedByName: userName,
        dataset,
        dateField,
        transformType,
        shiftDays: transformType === "shift_days" ? days : null,
        replaceValue: transformType === "replace_value" ? replaceValue : null,
        filterType: "all",
        filterValue: null,
        recordsAffected: 0,
        status: "failed",
        errorMessage: err.message,
        notes: notes ?? null,
      });
    } catch (_) {}

    console.error("[DataCorrection] Execute error:", err);
    return res.status(500).json({ message: err.message ?? "Execution failed" });
  }
});

// ── GET /api/corporate/data-correction/audit ─────────────────────────────────
// Returns the audit log for this org.

router.get("/audit", async (req: any, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: "Super Admin only" });

  const orgId = req.user?.orgId ?? req.session?.passport?.user?.orgId;
  const limit = Math.min(Number(req.query.limit ?? 100), 200);

  try {
    const rows = await db
      .select()
      .from(dataCorrectionAuditLog)
      .where(eq(dataCorrectionAuditLog.orgId, orgId))
      .orderBy(sql`executed_at DESC`)
      .limit(limit);

    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: err.message ?? "Failed to load audit log" });
  }
});

export default router;
