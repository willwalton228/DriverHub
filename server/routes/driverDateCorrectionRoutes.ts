/**
 * Driver Date Correction Import — Backend Routes
 *
 * Provides a locked-down, safeguarded import flow for correcting date fields
 * on existing driver records. Key constraints:
 *   - Approved fields only (8 date columns)
 *   - Match by email — no new driver creation
 *   - Blank values in the import file are IGNORED (never overwrite existing data)
 *   - Super Admin only
 */

import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "../db";
import { importBatches, importStagingRows } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { isAuthenticated } from "../replitAuth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Approved fields ──────────────────────────────────────────────────────────

const APPROVED_DATE_FIELDS: {
  key: string;
  dbCol: string;
  label: string;
  aliases: string[];
}[] = [
  {
    key: "dateOfBirth",
    dbCol: "date_of_birth",
    label: "Date of Birth",
    aliases: ["date of birth", "dob", "date_of_birth", "birthdate", "birth date"],
  },
  {
    key: "hireDate",
    dbCol: "hire_date",
    label: "Hire Date",
    aliases: ["hire date", "hire_date", "start date", "start_date", "date hired"],
  },
  {
    key: "mvrDate",
    dbCol: "mvr_date",
    label: "MVR Record Date",
    aliases: ["mvr date", "mvr_date", "mvr record date", "mvr_record_date", "motor vehicle record", "mvr"],
  },
  {
    key: "drugTestDate",
    dbCol: "drug_test_date",
    label: "Drug Test Date",
    aliases: ["drug test date", "drug_test_date", "drug test", "drug_test"],
  },
  {
    key: "dateCertified",
    dbCol: "date_certified",
    label: "Certified Date",
    aliases: ["date certified", "date_certified", "certified date", "certification date"],
  },
  {
    key: "licenseExpiration",
    dbCol: "license_expiration",
    label: "License Expiration",
    aliases: ["license expiration", "license_expiration", "license exp", "dl expiration", "dl exp"],
  },
  {
    key: "terminationDate",
    dbCol: "termination_date",
    label: "Termination Date",
    aliases: ["termination date", "termination_date", "terminated date", "term date"],
  },
  {
    key: "reactivationDate",
    dbCol: "reactivation_date",
    label: "Reactivation Date",
    aliases: ["reactivation date", "reactivation_date", "reactivated date", "rehire date", "reinstate date"],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveActor(req: any): { email: string; userId: string; isSuperAdmin: boolean } {
  const role = req.user?.claims?.role ?? req.user?.role ?? "";
  const isRoot = !!(req.user?.claims?.isRootSuperAdmin ?? req.user?.isRootSuperAdmin);
  const email = req.user?.claims?.email ?? req.user?.email ?? "unknown";
  const userId = (req.session as any)?.userId || req.user?.claims?.sub || "unknown";
  const isSuperAdmin = role === "super_user" || isRoot;
  return { email, userId, isSuperAdmin };
}

/** Parse a raw cell value into YYYY-MM-DD string, or null if blank/invalid. */
function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  // Excel serial number
  if (typeof raw === "number") {
    if (raw < 1 || raw > 2958465) return null;
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const adjusted = raw > 60 ? raw - 1 : raw;
    const ms = epoch.getTime() + adjusted * 86400000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return [
      d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, "0"),
      String(d.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }

  const str = String(raw).trim();
  if (!str) return null;

  // YYYY-MM-DD
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // M/D/YYYY or MM/DD/YYYY
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;

  // M-D-YYYY (when not YYYY-MM-DD)
  const mdyDash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (mdyDash) return `${mdyDash[3]}-${mdyDash[1].padStart(2, "0")}-${mdyDash[2].padStart(2, "0")}`;

  return null;
}

/** Normalize a column header to lowercase-spaced for alias matching. */
function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[_\-\s]+/g, " ");
}

/** Auto-detect email and approved date field columns from headers. */
function mapHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (["email", "email address", "e-mail", "e mail"].includes(normalized)) {
      mapping[header] = "email";
      continue;
    }
    for (const field of APPROVED_DATE_FIELDS) {
      if (field.aliases.includes(normalized) && !Object.values(mapping).includes(field.key)) {
        mapping[header] = field.key;
        break;
      }
    }
  }
  return mapping;
}

// ─── POST /upload ─────────────────────────────────────────────────────────────

router.post("/upload", isAuthenticated, upload.single("file"), async (req: any, res) => {
  const { isSuperAdmin, email: actorEmail, userId } = resolveActor(req);
  if (!isSuperAdmin) return res.status(403).json({ message: "Super Admin access required" });

  const file = req.file;
  if (!file) return res.status(400).json({ message: "No file provided" });

  try {
    const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rawRows.length) return res.status(400).json({ message: "File is empty" });

    const headers = Object.keys(rawRows[0]);
    const colMap = mapHeaders(headers);

    if (!Object.values(colMap).includes("email")) {
      return res.status(400).json({
        message: "File must contain an Email column for driver matching.",
        detectedHeaders: headers,
      });
    }

    // Create import batch
    const [batch] = await db.insert(importBatches).values({
      sourceFileName: file.originalname,
      status: "uploaded",
      totalRows: rawRows.length,
      createdByUserId: userId,
      createdByUsername: actorEmail,
      columnMapping: colMap,
      moduleType: "driver_date_correction",
      updateMode: "update_only",
    }).returning();

    // Stage rows
    const stagingValues = rawRows.map((row, i) => {
      const emailHeader = Object.keys(colMap).find(h => colMap[h] === "email") ?? "";
      const email = String(row[emailHeader] ?? "").trim().toLowerCase();

      const parsedDates: Record<string, string | null> = {};
      for (const [rawHeader, fieldKey] of Object.entries(colMap)) {
        if (fieldKey === "email") continue;
        parsedDates[fieldKey] = parseDate(row[rawHeader]);
      }

      return {
        batchId: batch.id,
        rowIndex: i + 1,
        rawJson: row as Record<string, string>,
        mappedJson: { email, ...parsedDates },
        status: "pending" as const,
      };
    });

    await db.insert(importStagingRows).values(stagingValues);

    return res.json({
      batchId: batch.id,
      fileName: file.originalname,
      totalRows: rawRows.length,
      columnMapping: colMap,
      detectedFields: Object.values(colMap).filter(k => k !== "email"),
    });
  } catch (err: any) {
    console.error("[DriverDateCorrection] upload error:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /preview/:batchId ────────────────────────────────────────────────────

router.get("/preview/:batchId", isAuthenticated, async (req: any, res) => {
  const { isSuperAdmin } = resolveActor(req);
  if (!isSuperAdmin) return res.status(403).json({ message: "Super Admin access required" });

  const { batchId } = req.params;

  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
    if (!batch) return res.status(404).json({ message: "Batch not found" });

    const stagingRows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batchId));

    const colMap = (batch.columnMapping ?? {}) as Record<string, string>;
    const mappedFields = Object.values(colMap).filter(k => k !== "email");

    const preview = [];

    for (const row of stagingRows) {
      const parsed = (row.mappedJson ?? {}) as Record<string, string | null>;
      const email = parsed.email ?? "";
      let driverId: string | null = null;
      let driverName: string | null = null;
      const currentValues: Record<string, string | null> = {};

      if (email) {
        const found = await db.execute(sql`
          SELECT
            d.id,
            u.first_name,
            u.last_name,
            d.date_of_birth::text      AS date_of_birth,
            d.hire_date::text           AS hire_date,
            d.mvr_date::text            AS mvr_date,
            d.drug_test_date::text      AS drug_test_date,
            d.date_certified::text      AS date_certified,
            d.license_expiration::text  AS license_expiration,
            d.termination_date::text    AS termination_date,
            d.reactivation_date::text   AS reactivation_date
          FROM drivers d
          LEFT JOIN users u ON u.id = d.user_id
          WHERE u.email ILIKE ${email}
            AND d.is_deleted IS DISTINCT FROM true
          LIMIT 1
        `);
        const dbRow = ((found.rows ?? found) as any[])[0];
        if (dbRow) {
          driverId = dbRow.id;
          driverName = `${dbRow.first_name ?? ""} ${dbRow.last_name ?? ""}`.trim() || email;
          currentValues.dateOfBirth       = dbRow.date_of_birth ? String(dbRow.date_of_birth).split("T")[0] : null;
          currentValues.hireDate          = dbRow.hire_date ? String(dbRow.hire_date).split("T")[0] : null;
          currentValues.mvrDate           = dbRow.mvr_date ? String(dbRow.mvr_date).split("T")[0] : null;
          currentValues.drugTestDate      = dbRow.drug_test_date ? String(dbRow.drug_test_date).split("T")[0] : null;
          currentValues.dateCertified     = dbRow.date_certified ? String(dbRow.date_certified).split("T")[0] : null;
          currentValues.licenseExpiration = dbRow.license_expiration ? String(dbRow.license_expiration).split("T")[0] : null;
          currentValues.terminationDate   = dbRow.termination_date ? String(dbRow.termination_date).split("T")[0] : null;
          currentValues.reactivationDate  = dbRow.reactivation_date ? String(dbRow.reactivation_date).split("T")[0] : null;
        }
      }

      const fieldPreviews = APPROVED_DATE_FIELDS.filter(f => mappedFields.includes(f.key)).map(field => {
        const importValue = parsed[field.key] ?? null;
        const currentValue = currentValues[field.key] ?? null;
        const skippedBlank = !importValue;
        const willUpdate = !!driverId && !skippedBlank && importValue !== currentValue;
        return { fieldKey: field.key, label: field.label, currentValue, importValue, willUpdate, skippedBlank };
      });

      preview.push({
        stagingRowId: row.id,
        rowIndex:     row.rowIndex,
        email,
        driverFound:  !!driverId,
        driverId,
        driverName,
        fields:       fieldPreviews,
        willProcess:  !!driverId && fieldPreviews.some(f => f.willUpdate),
      });
    }

    const approvedMapped = APPROVED_DATE_FIELDS.filter(f => mappedFields.includes(f.key));
    const stats = {
      total:       preview.length,
      matched:     preview.filter(r => r.driverFound).length,
      unmatched:   preview.filter(r => !r.driverFound).length,
      willUpdate:  preview.filter(r => r.willProcess).length,
      fieldCounts: approvedMapped.map(f => ({
        fieldKey: f.key,
        label:    f.label,
        updates:  preview.filter(r => r.fields.find(fv => fv.fieldKey === f.key && fv.willUpdate)).length,
      })),
    };

    return res.json({ batchId, stats, preview });
  } catch (err: any) {
    console.error("[DriverDateCorrection] preview error:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── POST /commit/:batchId ────────────────────────────────────────────────────

router.post("/commit/:batchId", isAuthenticated, async (req: any, res) => {
  const { isSuperAdmin, email: actorEmail } = resolveActor(req);
  if (!isSuperAdmin) return res.status(403).json({ message: "Super Admin access required" });

  const { batchId } = req.params;
  const { confirm } = req.body as { confirm: boolean };

  if (!confirm) return res.status(400).json({ message: "Send confirm: true to commit" });

  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
    if (!batch) return res.status(404).json({ message: "Batch not found" });
    if (batch.status === "committed") return res.status(409).json({ message: "Batch already committed" });

    const stagingRows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batchId));

    const colMap = (batch.columnMapping ?? {}) as Record<string, string>;
    const mappedFields = Object.values(colMap).filter(k => k !== "email");

    let updatedCount = 0;
    let skippedNoMatch = 0;
    let skippedNoChanges = 0;

    for (const row of stagingRows) {
      const parsed = (row.mappedJson ?? {}) as Record<string, string | null>;
      const email = parsed.email ?? "";

      if (!email) {
        await db.update(importStagingRows)
          .set({ status: "skipped", validationErrors: ["No email"] })
          .where(eq(importStagingRows.id, row.id));
        skippedNoMatch++;
        continue;
      }

      // Find driver by email
      const found = await db.execute(sql`
        SELECT d.id
        FROM drivers d
        LEFT JOIN users u ON u.id = d.user_id
        WHERE u.email ILIKE ${email}
          AND d.is_deleted IS DISTINCT FROM true
        LIMIT 1
      `);
      const dbRow = ((found.rows ?? found) as any[])[0];

      if (!dbRow) {
        await db.update(importStagingRows)
          .set({ status: "skipped", validationErrors: [`No driver found with email: ${email}`] })
          .where(eq(importStagingRows.id, row.id));
        skippedNoMatch++;
        continue;
      }

      const driverId = dbRow.id as string;

      // Build update — only non-blank, approved fields
      const setClauses: string[] = [];
      for (const field of APPROVED_DATE_FIELDS) {
        if (!mappedFields.includes(field.key)) continue;
        const val = parsed[field.key];
        if (!val) continue; // blank protection
        setClauses.push(`${field.dbCol} = '${val}'::date`);
      }

      if (setClauses.length === 0) {
        await db.update(importStagingRows)
          .set({ status: "skipped", validationErrors: ["All date values blank"] })
          .where(eq(importStagingRows.id, row.id));
        skippedNoChanges++;
        continue;
      }

      await db.execute(sql.raw(`
        UPDATE drivers
        SET ${setClauses.join(", ")}
        WHERE id = '${driverId.replace(/'/g, "''")}'
      `));

      await db.update(importStagingRows)
        .set({ status: "committed" })
        .where(eq(importStagingRows.id, row.id));
      updatedCount++;
    }

    await db.update(importBatches).set({
      status: "committed",
      committedAt: new Date(),
      processedRows: updatedCount,
    }).where(eq(importBatches.id, batchId));

    // Audit
    try {
      await db.execute(sql`
        INSERT INTO import_audit_log (batch_id, row_id, action, message, created_at)
        VALUES (
          ${batchId},
          'batch',
          'driver_date_correction_import',
          ${`Driver date correction import committed by ${actorEmail}. Updated: ${updatedCount}, Skipped (no match): ${skippedNoMatch}, Skipped (blank): ${skippedNoChanges}. Fields: ${mappedFields.join(", ")}`},
          NOW()
        )
      `);
    } catch (_) { /* non-blocking */ }

    return res.json({
      success:           true,
      batchId,
      updatedDrivers:    updatedCount,
      skippedNoMatch,
      skippedNoChanges,
      committedAt:       new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[DriverDateCorrection] commit error:", err);
    await db.update(importBatches)
      .set({ status: "failed", errorMessage: err.message })
      .where(eq(importBatches.id, batchId))
      .catch(() => {});
    return res.status(500).json({ message: err.message });
  }
});

// ─── GET /batches ─────────────────────────────────────────────────────────────

router.get("/batches", isAuthenticated, async (req: any, res) => {
  const { isSuperAdmin } = resolveActor(req);
  if (!isSuperAdmin) return res.status(403).json({ message: "Super Admin access required" });

  try {
    const result = await db.execute(sql`
      SELECT
        id,
        source_file_name,
        status,
        total_rows,
        processed_rows,
        created_by_username,
        committed_at,
        created_at,
        error_message
      FROM import_batches
      WHERE module_type = 'driver_date_correction'
      ORDER BY created_at DESC
      LIMIT 50
    `);
    return res.json(result.rows ?? result);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
