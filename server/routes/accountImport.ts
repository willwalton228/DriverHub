import { snapshotUserCount, assertUserCountUnchanged } from "../services/importUserGuard";
import { Router, Response } from "express";
import { db } from "../db";
import {
  users,
  customers,
  importBatches,
  importStagingRows,
  importAuditLog,
  ACCOUNT_IMPORT_FIELD_CATALOG,
  ACCOUNT_IMPORT_MATCH_KEYS,
} from "@shared/schema";
import { eq, and, desc, ilike, inArray } from "drizzle-orm";
import * as XLSX from "xlsx";
import multer from "multer";
import { isAuthenticated } from "../replitAuth";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const router = Router();

async function resolveUser(req: any) {
  const userId = (req.session as any)?.userId || req.user?.claims?.sub;
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  return {
    id: user.id,
    role: user.role || "",
    isRootSuperAdmin: !!(user as any).isRootSuperAdmin,
    email: user.email || "",
    displayName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || user.id,
  };
}

function isSuperAdmin(u: { role: string; isRootSuperAdmin: boolean }) {
  return u.role === "super_user" || u.isRootSuperAdmin === true;
}

async function requireSuperAdminForImport(req: any, res: Response, next: Function) {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!isSuperAdmin(user)) {
    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "import_blocked",
        actorUserId: user.id,
        actorUserEmail: user.email,
        targetEntityType: "account_import",
        targetEntityId: req.path,
        reason: "not_super_admin",
        metadata: { route: req.path, userRole: user.role },
      });
    } catch (_) {}
    return res.status(403).json({ error: "IMPORT_FORBIDDEN", message: "Super Admin access required for data imports." });
  }
  (req as any).resolvedUser = user;
  next();
}

// Derived from the shared canonical catalog — DO NOT hard-code fields here.
// To add a new importable field: add it to ACCOUNT_IMPORT_FIELD_CATALOG in shared/schema.ts.
const ACCOUNT_FIELD_CATALOG = ACCOUNT_IMPORT_FIELD_CATALOG.filter(f => f.importable !== false);
const ACCOUNT_MATCH_KEYS = ACCOUNT_IMPORT_MATCH_KEYS;

// Full key set (including non-importable) used for stale-template detection
const ALL_KNOWN_FIELD_KEYS = new Set(ACCOUNT_IMPORT_FIELD_CATALOG.map(f => f.key));

const REQUIRED_FIELD_KEYS = ["customerName", "primaryContactName", "primaryContactNumber", "primaryContactCell", "primaryContactEmail", "billingContactName", "billingContactNumber", "billingContactEmail"];

function normalizeText(v: any): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function excelSerialToDate(serial: number): string | null {
  try {
    if (serial < 1 || serial > 2958465) return null;
    const epoch = new Date(Date.UTC(1899, 11, 31)); // Dec 31, 1899 — serial 1 = Jan 1, 1900
    const adjusted = serial > 60 ? serial - 1 : serial;
    const ms = epoch.getTime() + adjusted * 86400000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  } catch { return null; }
}

function parseDate(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === "number") return excelSerialToDate(v) ?? undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${String(us[1]).padStart(2, "0")}-${String(us[2]).padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString().split("T")[0];
}

function autoMap(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedFieldKeys = new Set<string>();
  for (const hdr of headers) {
    const lower = hdr.toLowerCase().trim().replace(/[_\-\s]+/g, " ");
    for (const field of ACCOUNT_FIELD_CATALOG) {
      if (usedFieldKeys.has(field.key)) continue;
      if (field.aliases.some(alias => alias === lower || lower.includes(alias))) {
        mapping[hdr] = field.key;
        usedFieldKeys.add(field.key);
        break;
      }
    }
  }
  return mapping;
}

function applyMapping(raw: Record<string, any>, mapping: Record<string, string>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [colHeader, fieldKey] of Object.entries(mapping)) {
    if (fieldKey && raw[colHeader] !== undefined) {
      out[fieldKey] = raw[colHeader];
    }
  }
  return out;
}

function validateRow(mapped: Record<string, any>, initialLoadMode = false): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED_FIELD_KEYS) {
    const field = ACCOUNT_FIELD_CATALOG.find(f => f.key === key);
    if (!mapped[key] || String(mapped[key]).trim() === "") {
      if (initialLoadMode) {
        warnings.push(`${field?.label || key} not provided — can be updated later`);
      } else {
        errors.push(`${field?.label || key} is required`);
      }
    }
  }

  if (mapped.primaryContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(mapped.primaryContactEmail))) {
    if (initialLoadMode) {
      warnings.push("Primary Contact Email has an invalid format — field will be skipped");
      mapped.primaryContactEmail = undefined;
    } else {
      errors.push("Primary Contact Email has an invalid format");
    }
  }
  if (mapped.billingContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(mapped.billingContactEmail))) {
    if (initialLoadMode) {
      warnings.push("Billing Contact Email has an invalid format — field will be skipped");
      mapped.billingContactEmail = undefined;
    } else {
      errors.push("Billing Contact Email has an invalid format");
    }
  }
  if (mapped.status) {
    const valid = ["active", "inactive", "cancelled", "prospect", "archived"];
    if (!valid.includes(String(mapped.status).toLowerCase())) {
      warnings.push(`Status "${mapped.status}" not recognized — will default to "active"`);
    }
  }
  if (mapped.implementationDate && !parseDate(mapped.implementationDate)) {
    warnings.push("Implementation Date has an invalid format — will be skipped");
  }

  // Validate select fields against their allowedValues list
  for (const field of ACCOUNT_FIELD_CATALOG) {
    if (field.type === "select" && field.allowedValues && mapped[field.key] !== undefined && mapped[field.key] !== "") {
      const rawVal = String(mapped[field.key]).trim();
      const allowed = field.allowedValues as readonly string[];
      // Case-insensitive match
      const match = allowed.find(v => v.toLowerCase() === rawVal.toLowerCase());
      if (match) {
        mapped[field.key] = match; // normalize to canonical casing
      } else {
        warnings.push(`${field.label} value "${rawVal}" not recognized — will be skipped. Accepted: ${allowed.join(", ")}`);
        mapped[field.key] = undefined;
      }
    }
  }

  return { errors, warnings };
}

async function runValidateBackground(batchId: string, mapping: Record<string, string>, matchKey: string | null, initialLoadMode = false) {
  try {
    const allRows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batchId))
      .orderBy(importStagingRows.rowIndex);

    let validCount = 0, errorCount = 0, warningCount = 0, createCount = 0, updateCount = 0;
    const stagingUpdates: { id: string; data: any }[] = [];

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const raw = (row.rawJson || {}) as Record<string, any>;
      const mapped = applyMapping(raw, mapping);
      const { errors, warnings } = validateRow(mapped, initialLoadMode);

      let matchAction: "create" | "update" | "error" = errors.length > 0 ? "error" : "create";
      let matchedCustomerId: string | null = null;

      if (matchAction === "create" && matchKey) {
        const matchValue = mapped[matchKey];
        if (matchValue) {
          let existingRows: { id: string }[] = [];
          if (matchKey === "customerName") {
            existingRows = await db.select({ id: customers.id }).from(customers).where(ilike(customers.customerName, String(matchValue))).limit(1);
          } else if (matchKey === "primaryContactEmail") {
            existingRows = await db.select({ id: customers.id }).from(customers).where(ilike(customers.primaryContactEmail, String(matchValue))).limit(1);
          } else if (matchKey === "customerNumber") {
            existingRows = await db.select({ id: customers.id }).from(customers).where(eq(customers.customerNumber, String(matchValue))).limit(1);
          }
          if (existingRows.length > 0) {
            matchAction = "update";
            matchedCustomerId = existingRows[0].id;
          }
        }
      }

      if (errors.length > 0) {
        errorCount++;
        matchAction = "error";
      } else {
        validCount++;
        if (warnings.length > 0) warningCount++;
        if (matchAction === "update") updateCount++;
        else createCount++;
      }

      stagingUpdates.push({
        id: row.id,
        data: {
          mappedJson: mapped,
          validationErrors: errors.length > 0 ? errors : null,
          validationWarnings: warnings.length > 0 ? warnings : null,
          matchAction: matchAction as any,
          matchedCustomerId,
          status: errors.length > 0 ? ("error" as const) : ("valid" as const),
        },
      });

      if ((i + 1) % 500 === 0) {
        await db.update(importBatches).set({ processedRows: i + 1 }).where(eq(importBatches.id, batchId));
      }
    }

    const CHUNK = 200;
    for (let i = 0; i < stagingUpdates.length; i += CHUNK) {
      await Promise.all(stagingUpdates.slice(i, i + CHUNK).map(u =>
        db.update(importStagingRows).set(u.data).where(eq(importStagingRows.id, u.id))
      ));
    }

    await db.update(importBatches).set({
      status: "validated",
      validRows: validCount,
      errorRows: errorCount,
      warningRows: warningCount,
      processedRows: allRows.length,
      createdRows: createCount,
      updatedRows: updateCount,
      validatedAt: new Date(),
    }).where(eq(importBatches.id, batchId));

    console.log(`[AccountImport] Validation complete — batch ${batchId}: ${validCount} valid, ${errorCount} errors`);
  } catch (err: any) {
    console.error("[AccountImport] Background validate failed:", err);
    await db.update(importBatches).set({ status: "failed", errorMessage: err?.message || "Unknown error" }).where(eq(importBatches.id, batchId)).catch(() => {});
  }
}

async function runCommitBackground(batchId: string, commitUserId: string) {
  const _userCountBefore = await snapshotUserCount();
  try {
    const allRows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batchId))
      .orderBy(importStagingRows.rowIndex);

    let created = 0, updated = 0, failed = 0;
    const auditEntries: { batchId: string; rowId: string; action: string; driverId?: string; message: string }[] = [];
    const CHUNK = 250;

    let cancelled = false;
    for (let ci = 0; ci < allRows.length; ci += CHUNK) {
      // Check for cancellation request before each chunk
      const [freshBatch] = await db.select({ status: importBatches.status })
        .from(importBatches).where(eq(importBatches.id, batchId));
      if (freshBatch?.status === "cancelling") {
        cancelled = true;
        break;
      }

      const chunk = allRows.slice(ci, ci + CHUNK);
      for (const row of chunk) {
        try {
          if (row.status === "error") {
            failed++;
            await db.update(importStagingRows).set({ status: "committed" }).where(eq(importStagingRows.id, row.id));
            continue;
          }

          const mapped = (row.mappedJson || {}) as Record<string, any>;
          const action = row.matchAction || "create";

          if (action === "update" && row.matchedCustomerId) {
            const updateData: Record<string, any> = {};
            for (const field of ACCOUNT_FIELD_CATALOG) {
              if (mapped[field.key] !== undefined) {
                updateData[field.key] = field.type === "date"
                  ? parseDate(mapped[field.key]) || null
                  : normalizeText(mapped[field.key]) || null;
              }
            }
            await db.update(customers).set(updateData).where(eq(customers.id, row.matchedCustomerId));
            updated++;
            auditEntries.push({ batchId, rowId: row.id, action: "account_updated", driverId: row.matchedCustomerId, message: `Updated: ${mapped.customerName}` });
            await db.update(importStagingRows).set({ status: "committed" }).where(eq(importStagingRows.id, row.id));
          } else {
            const insertData: Record<string, any> = {};
            for (const field of ACCOUNT_FIELD_CATALOG) {
              if (mapped[field.key] !== undefined) {
                insertData[field.key] = field.type === "date"
                  ? parseDate(mapped[field.key]) || null
                  : normalizeText(mapped[field.key]) || null;
              }
            }
            if (!insertData.customerName) {
              failed++;
              await db.update(importStagingRows).set({ status: "error" }).where(eq(importStagingRows.id, row.id));
              continue;
            }
            if (!insertData.status) insertData.status = "active";
            insertData.hubspotSource = "manual";
            insertData.hubspotSyncStatus = "pending";

            const [newAccount] = await db.insert(customers).values(insertData).returning();
            created++;
            auditEntries.push({ batchId, rowId: row.id, action: "account_created", driverId: newAccount.id, message: `Created: ${newAccount.customerName}` });
            await db.update(importStagingRows).set({ status: "committed", matchedCustomerId: newAccount.id }).where(eq(importStagingRows.id, row.id));
          }
        } catch (rowErr: any) {
          failed++;
          console.error(`[AccountImport] Commit row error (row ${row.rowIndex}):`, rowErr.message);
          await db.update(importStagingRows).set({ status: "error" }).where(eq(importStagingRows.id, row.id));
          auditEntries.push({ batchId, rowId: row.id, action: "account_commit_error", message: `Row ${row.rowIndex}: ${rowErr.message}` });
        }
      }
      await db.update(importBatches).set({ processedRows: ci + chunk.length }).where(eq(importBatches.id, batchId));
    }

    if (auditEntries.length > 0) {
      const AC = 200;
      for (let i = 0; i < auditEntries.length; i += AC) {
        await db.insert(importAuditLog).values(auditEntries.slice(i, i + AC));
      }
    }

    if (cancelled) {
      await db.update(importBatches).set({
        status: "cancelled",
        createdRows: created,
        updatedRows: updated,
        failedRows: failed,
      }).where(eq(importBatches.id, batchId));
      console.log(`[AccountImport] Batch ${batchId} cancelled — processed ${created + updated} rows before stop`);
      return;
    }

    await assertUserCountUnchanged(batchId, "Accounts", _userCountBefore);

    await db.update(importBatches).set({
      status: "committed",
      committedAt: new Date(),
      createdRows: created,
      updatedRows: updated,
      failedRows: failed,
    }).where(eq(importBatches.id, batchId));

    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "account_import.committed",
        actorUserId: commitUserId,
        actorUserEmail: "",
        targetEntityType: "customers",
        targetEntityId: batchId,
        metadata: { created, updated, failed },
      });
    } catch (_) {}

    console.log(`[AccountImport] Commit complete — batch ${batchId}: ${created} created, ${updated} updated, ${failed} failed`);
  } catch (err: any) {
    console.error("[AccountImport] Background commit failed:", err);
    await db.update(importBatches).set({ status: "failed", errorMessage: err?.message || "Unknown error" }).where(eq(importBatches.id, batchId)).catch(() => {});
  }
}

router.get("/fields", isAuthenticated, (req: any, res: Response) => {
  // staleKeys: keys referenced by a saved mapping that no longer exist in the catalog.
  // Frontend can use this to show "field missing" warnings on loaded templates.
  const savedMapping: Record<string, string> = req.query.savedMapping
    ? (() => { try { return JSON.parse(req.query.savedMapping as string); } catch { return {}; } })()
    : {};
  const staleKeys = Object.values(savedMapping).filter(
    key => key && !ALL_KNOWN_FIELD_KEYS.has(key)
  );
  res.json({ fields: ACCOUNT_FIELD_CATALOG, matchKeys: ACCOUNT_MATCH_KEYS, staleKeys });
});

router.get("/template/download", isAuthenticated, (_req: any, res: Response) => {
  try {
    const headers = ACCOUNT_FIELD_CATALOG.map(f => f.label);
    const sampleRow: Record<string, string> = {};
    const samples: Record<string, string> = {
      customerName: "Acme Logistics Inc", customerNumber: "ACC-001", status: "active",
      customerType: "Enterprise", customerLegalName: "Acme Logistics Inc.", customerGroup: "West Region",
      driverModel: "drivershift", program: "Driver on Demand", region: "East",
      customerAddress: "123 Main St", customerCity: "Austin", customerState: "TX", customerZip: "78701",
      implementationDate: "2024-01-15", primaryContactName: "Jane Smith",
      primaryContactNumber: "512-555-1234", primaryContactCell: "512-555-5678",
      primaryContactEmail: "jane@acme.com", billingContactName: "Bob Jones",
      billingContactNumber: "512-555-9012", billingContactEmail: "billing@acme.com",
      customerWebsite: "https://acme.com", network: "AUSTIN", arStatus: "current",
    };
    ACCOUNT_FIELD_CATALOG.forEach(f => { sampleRow[f.label] = samples[f.key] || ""; });
    const ws = XLSX.utils.json_to_sheet([sampleRow], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Account Import Template");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="account-import-template.xlsx"');
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: "TEMPLATE_FAILED", message: err.message });
  }
});

router.get("/batches/list", isAuthenticated, async (_req: any, res: Response) => {
  try {
    const batches = await db.select().from(importBatches)
      .where(eq(importBatches.moduleType, "accounts"))
      .orderBy(desc(importBatches.createdAt))
      .limit(50);
    res.json(batches);
  } catch (err: any) {
    res.status(500).json({ error: "FETCH_FAILED", message: err.message });
  }
});

router.post("/upload", requireSuperAdminForImport, upload.single("file"), async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  try {
    let buffer: Buffer;
    let fileName: string;

    if (req.file) {
      buffer = req.file.buffer;
      fileName = req.file.originalname || "import.csv";
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
      fileName = (req.headers["x-file-name"] as string) || "import.csv";
    }

    if (buffer.length === 0) return res.status(400).json({ error: "EMPTY_FILE", message: "Uploaded file is empty" });
    if (buffer.length > 25 * 1024 * 1024) return res.status(400).json({ error: "FILE_TOO_LARGE", message: "File must be under 25MB" });
    const ext = String(fileName).split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext || "")) {
      return res.status(400).json({ error: "INVALID_FILE_TYPE", message: "Only CSV and XLSX files are accepted" });
    }

    let workbook: any;
    try { workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false }); }
    catch { return res.status(400).json({ error: "PARSE_ERROR", message: "Could not parse file." }); }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return res.status(400).json({ error: "EMPTY_WORKBOOK", message: "No sheets found in file" });
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    if (rows.length === 0) return res.status(400).json({ error: "NO_DATA", message: "File contains no data rows" });
    if (rows.length > 5000) return res.status(400).json({ error: "TOO_MANY_ROWS", message: "Maximum 5000 rows per import" });

    const headers = Object.keys(rows[0]);
    const autoMapping = autoMap(headers);

    const [batch] = await db.insert(importBatches).values({
      sourceFileName: fileName,
      status: "uploaded",
      totalRows: rows.length,
      fileHeaders: headers,
      moduleType: "accounts",
      createdByUserId: user.id,
      createdByUsername: user.displayName,
    }).returning();

    const CHUNK_SIZE = 500;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      await db.insert(importStagingRows).values(
        rows.slice(i, i + CHUNK_SIZE).map((row, j) => ({
          batchId: batch.id,
          rowIndex: i + j + 1,
          rawJson: row,
          status: "pending" as const,
        }))
      );
    }

    res.json({ batchId: batch.id, fileName, totalRows: rows.length, headers, autoMapping, sampleRows: rows.slice(0, 5) });
  } catch (err: any) {
    console.error("[AccountImport] Upload error:", err);
    res.status(500).json({ error: "UPLOAD_FAILED", message: err.message || "Upload failed" });
  }
});

router.get("/:batchId", isAuthenticated, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "accounts")));
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    res.json(batch);
  } catch (err: any) {
    res.status(500).json({ error: "FETCH_FAILED", message: err.message });
  }
});

router.post("/:batchId/map", requireSuperAdminForImport, async (req: any, res: Response) => {
  try {
    const { mapping, matchKey, updateMode } = req.body;
    if (!mapping || typeof mapping !== "object") return res.status(400).json({ error: "INVALID_MAPPING" });

    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "accounts")));
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.committedAt) return res.status(400).json({ error: "ALREADY_COMMITTED" });

    const allRows = await db.select().from(importStagingRows).where(eq(importStagingRows.batchId, batch.id));
    const CHUNK = 500;
    for (let i = 0; i < allRows.length; i += CHUNK) {
      await Promise.all(allRows.slice(i, i + CHUNK).map(r => {
        const mapped = applyMapping((r.rawJson || {}) as Record<string, any>, mapping);
        return db.update(importStagingRows).set({ mappedJson: mapped, status: "pending" }).where(eq(importStagingRows.id, r.id));
      }));
    }

    await db.update(importBatches).set({
      status: "mapped",
      columnMapping: mapping,
      matchKey: matchKey || null,
      updateMode: updateMode || "overwrite_mapped",
    }).where(eq(importBatches.id, batch.id));

    res.json({ ok: true, status: "mapped" });
  } catch (err: any) {
    res.status(500).json({ error: "MAP_FAILED", message: err.message });
  }
});

router.post("/:batchId/validate", requireSuperAdminForImport, async (req: any, res: Response) => {
  try {
    const batchId = req.params.batchId;
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.moduleType, "accounts")));
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.status === "validating") return res.status(400).json({ error: "ALREADY_PROCESSING", message: "Validation is already in progress" });
    if (batch.status !== "mapped" && batch.status !== "validated") {
      return res.status(400).json({ error: "INVALID_STATUS", message: "Batch must be mapped before validation" });
    }

    const initialLoadMode = req.body?.initialLoadMode === true;
    const mapping = (batch.columnMapping || {}) as Record<string, string>;
    await db.update(importBatches).set({
      status: "validating",
      processedRows: 0,
      startedAt: new Date(),
      initialLoadMode,
    }).where(eq(importBatches.id, batchId));
    res.json({ status: "validating", batchId, totalRows: batch.totalRows, initialLoadMode });

    runValidateBackground(batchId, mapping, batch.matchKey || null, initialLoadMode).catch(err => {
      console.error("[AccountImport] runValidateBackground uncaught:", err);
    });
  } catch (err: any) {
    console.error("[AccountImport] Validate error:", err);
    res.status(500).json({ error: "VALIDATE_FAILED", message: err.message });
  }
});

router.get("/:batchId/rows", isAuthenticated, async (req: any, res: Response) => {
  try {
    const batchId = req.params.batchId;
    const statusFilter = req.query.status as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = (page - 1) * limit;

    const rows = await db.select().from(importStagingRows)
      .where(statusFilter
        ? and(eq(importStagingRows.batchId, batchId), eq(importStagingRows.status, statusFilter as any))
        : eq(importStagingRows.batchId, batchId))
      .orderBy(importStagingRows.rowIndex)
      .limit(limit)
      .offset(offset);

    res.json({ rows, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: "FETCH_FAILED", message: err.message });
  }
});

router.post("/:batchId/commit", requireSuperAdminForImport, async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  try {
    const { productionConfirmPhrase, productionConfirmed } = req.body;
    const batchId = req.params.batchId;

    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.moduleType, "accounts")));
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.status === "committing") return res.status(400).json({ error: "ALREADY_PROCESSING", message: "Commit already in progress" });
    if (batch.status === "committed") return res.status(400).json({ error: "ALREADY_COMMITTED" });
    if (batch.rolledBackAt) return res.status(400).json({ error: "ROLLED_BACK" });
    if (batch.status !== "validated") {
      return res.status(400).json({ error: "NOT_VALIDATED", message: "Batch must be fully validated before committing" });
    }
    if (productionConfirmed && productionConfirmPhrase !== "IMPORT INTO PRODUCTION") {
      return res.status(400).json({ error: "CONFIRM_PHRASE_REQUIRED", message: 'Type exactly "IMPORT INTO PRODUCTION" to proceed' });
    }

    await db.update(importBatches).set({
      status: "committing",
      processedRows: 0,
      startedAt: new Date(),
      productionConfirmed: !!productionConfirmed,
      productionConfirmPhrase: productionConfirmPhrase || null,
    }).where(eq(importBatches.id, batchId));

    res.json({ status: "committing", batchId });

    runCommitBackground(batchId, user.id).catch(err => {
      console.error("[AccountImport] runCommitBackground uncaught:", err);
    });
  } catch (err: any) {
    console.error("[AccountImport] Commit error:", err);
    res.status(500).json({ error: "COMMIT_FAILED", message: err.message });
  }
});

router.post("/:batchId/cancel", isAuthenticated, async (req: any, res: Response) => {
  try {
    const user = req.user;
    const { batchId } = req.params;
    const [batch] = await db.select({ id: importBatches.id, status: importBatches.status })
      .from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.moduleType, "accounts")));
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.status !== "committing") {
      return res.status(400).json({ error: "NOT_COMMITTING", message: "Batch is not currently committing — cannot cancel" });
    }
    await db.update(importBatches).set({ status: "cancelling" }).where(eq(importBatches.id, batchId));
    console.log(`[AccountImport] Cancel requested for batch ${batchId} by user ${user.id}`);
    res.json({ status: "cancelling", batchId });
  } catch (err: any) {
    console.error("[AccountImport] Cancel error:", err);
    res.status(500).json({ error: "CANCEL_FAILED", message: err.message });
  }
});

router.get("/:batchId/audit", isAuthenticated, async (req: any, res: Response) => {
  try {
    const entries = await db.select().from(importAuditLog)
      .where(eq(importAuditLog.batchId, req.params.batchId))
      .orderBy(desc(importAuditLog.createdAt))
      .limit(500);
    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: "FETCH_FAILED", message: err.message });
  }
});

router.get("/:batchId/export-errors", isAuthenticated, async (req: any, res: Response) => {
  try {
    const batchId = req.params.batchId;
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });

    const errorRows = await db.select().from(importStagingRows)
      .where(and(eq(importStagingRows.batchId, batchId), eq(importStagingRows.status, "error")))
      .orderBy(importStagingRows.rowIndex);

    const csvRows = errorRows.map(r => ({
      "Row #": r.rowIndex,
      "Account Name": ((r.mappedJson || r.rawJson) as any)?.customerName || "",
      "Error(s)": ((r.validationErrors || []) as string[]).join("; "),
      "Warning(s)": ((r.validationWarnings || []) as string[]).join("; "),
    }));

    const ws = XLSX.utils.json_to_sheet(csvRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errors");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "csv" });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="account-import-errors-${batchId.slice(0, 8)}.csv"`);
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: "EXPORT_FAILED", message: err.message });
  }
});

router.post("/:batchId/rollback", requireSuperAdminForImport, async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  try {
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "accounts")));
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (!batch.committedAt) return res.status(400).json({ error: "NOT_COMMITTED" });
    if (batch.rolledBackAt) return res.status(400).json({ error: "ALREADY_ROLLED_BACK" });

    const hoursSince = (Date.now() - new Date(batch.committedAt).getTime()) / 3600000;
    if (hoursSince > 24) return res.status(400).json({ error: "ROLLBACK_WINDOW_EXPIRED", message: "The 24-hour rollback window has expired" });

    const auditEntries = await db.select().from(importAuditLog)
      .where(and(eq(importAuditLog.batchId, batch.id), eq(importAuditLog.action, "account_created")));
    const accountIds = auditEntries.map(e => e.driverId).filter(Boolean) as string[];

    let archived = 0;
    if (accountIds.length > 0) {
      await db.update(customers).set({
        isArchived: true,
        archivedAt: new Date(),
        archiveReason: `Import rollback — batch ${batch.id}`,
      }).where(inArray(customers.id, accountIds));
      archived = accountIds.length;
    }

    await db.update(importBatches).set({
      status: "rolled_back",
      rolledBackAt: new Date(),
      rollbackByUserId: user.id,
    }).where(eq(importBatches.id, batch.id));

    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "account_import.rolled_back",
        actorUserId: user.id,
        actorUserEmail: user.email,
        targetEntityType: "customers",
        targetEntityId: batch.id,
        metadata: { archived, fileName: batch.sourceFileName },
      });
    } catch (_) {}

    res.json({ ok: true, archived });
  } catch (err: any) {
    console.error("[AccountImport] Rollback error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

export default router;
