import { snapshotUserCount, assertUserCountUnchanged } from "../services/importUserGuard";
import { Router, Response } from "express";
import { db } from "../db";
import {
  users,
  recruitingCandidates,
  importBatches,
  importStagingRows,
  importAuditLog,
} from "@shared/schema";
import { eq, and, desc, inArray, or } from "drizzle-orm";
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

async function requireSuperAdmin(req: any, res: Response, next: Function) {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!isSuperAdmin(user)) {
    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "import_blocked",
        actorUserId: user.id,
        actorUserEmail: user.email,
        targetEntityType: "recruiting_import",
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

export const CANDIDATE_FIELD_CATALOG = [
  { key: "firstName", label: "First Name", group: "Identity", type: "text", required: true, aliases: ["first name", "first_name", "fname", "given name", "given_name"] },
  { key: "lastName", label: "Last Name", group: "Identity", type: "text", required: true, aliases: ["last name", "last_name", "lname", "surname", "family name"] },
  { key: "middleName", label: "Middle Name", group: "Identity", type: "text", required: false, aliases: ["middle name", "middle_name", "middle initial"] },
  { key: "email", label: "Email", group: "Contact", type: "text", required: true, aliases: ["email", "email address", "email_address", "e-mail", "e_mail"] },
  { key: "phone", label: "Phone", group: "Contact", type: "text", required: false, aliases: ["phone", "phone number", "phone_number", "mobile", "cell", "telephone"] },
  { key: "address", label: "Address", group: "Address", type: "text", required: false, aliases: ["address", "street", "street address"] },
  { key: "city", label: "City", group: "Address", type: "text", required: false, aliases: ["city", "town"] },
  { key: "state", label: "State", group: "Address", type: "text", required: false, aliases: ["state", "st", "province"] },
  { key: "zipCode", label: "ZIP Code", group: "Address", type: "text", required: false, aliases: ["zip", "zip code", "zipcode", "postal code", "zip_code", "postal"] },
  { key: "licenseClass", label: "License Class", group: "Licensing", type: "text", required: false, aliases: ["license class", "license_class", "cdl class", "class", "dl class"] },
  { key: "licenseState", label: "License State", group: "Licensing", type: "text", required: false, aliases: ["license state", "license_state", "dl state", "driving state"] },
  { key: "licenseExpiration", label: "License Expiration", group: "Licensing", type: "date", required: false, aliases: ["license expiration", "license_expiration", "dl expiry", "exp date", "license exp"] },
  { key: "yearsExperience", label: "Years Experience", group: "Experience", type: "number", required: false, aliases: ["years experience", "years_experience", "experience", "yrs exp", "years"] },
  { key: "source", label: "Source", group: "Recruiting", type: "text", required: false, aliases: ["source", "lead source", "how did you hear", "referred by", "origin"] },
  { key: "notes", label: "Notes", group: "Other", type: "text", required: false, aliases: ["notes", "comments", "remarks", "additional info"] },
];

function autoMapHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const h = header.toLowerCase().trim();
    for (const field of CANDIDATE_FIELD_CATALOG) {
      if (
        field.key.toLowerCase() === h ||
        field.label.toLowerCase() === h ||
        field.aliases.some(a => a === h)
      ) {
        mapping[header] = field.key;
        break;
      }
    }
  }
  return mapping;
}

function parseFile(buffer: Buffer): { rows: Record<string, any>[]; headers: string[] } {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, any>[];
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, headers };
}

function applyMapping(row: Record<string, any>, mapping: Record<string, string>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [csvCol, dbField] of Object.entries(mapping)) {
    if (dbField && row[csvCol] !== undefined && String(row[csvCol]).trim() !== "") {
      result[dbField] = String(row[csvCol]).trim();
    }
  }
  return result;
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

router.post("/upload", isAuthenticated, requireSuperAdmin, upload.single("file"), async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  try {
    if (!req.file) return res.status(400).json({ error: "NO_FILE", message: "No file uploaded" });
    const { rows, headers } = parseFile(req.file.buffer);
    if (rows.length === 0) return res.status(400).json({ error: "EMPTY_FILE", message: "File contains no data rows" });

    const autoMapping = autoMapHeaders(headers);
    const [batch] = await db.insert(importBatches).values({
      sourceFileName: req.file.originalname,
      status: "uploaded",
      totalRows: rows.length,
      moduleType: "recruiting_candidates",
      fileHeaders: headers,
      columnMapping: autoMapping,
      createdByUserId: user.id,
      createdByUsername: user.displayName,
    }).returning();

    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(importStagingRows).values(
        rows.slice(i, i + CHUNK).map((row, idx) => ({
          batchId: batch.id,
          rowIndex: i + idx,
          rawJson: row,
          status: "pending" as const,
        }))
      );
    }

    res.json({ batchId: batch.id, totalRows: rows.length, headers, autoMapping, fileName: req.file.originalname });
  } catch (err: any) {
    console.error("[RecruitingImport] Upload error:", err);
    res.status(500).json({ error: "UPLOAD_FAILED", message: err.message || "Upload failed" });
  }
});

router.post("/:batchId/map", isAuthenticated, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const { columnMapping } = req.body;
    if (!columnMapping || typeof columnMapping !== "object") {
      return res.status(400).json({ error: "MAPPING_REQUIRED", message: "columnMapping is required" });
    }
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, req.params.batchId)).limit(1);
    if (!batch || batch.moduleType !== "recruiting_candidates") return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.committedAt) return res.status(400).json({ error: "ALREADY_COMMITTED" });
    await db.update(importBatches).set({ columnMapping, status: "mapped" }).where(eq(importBatches.id, batch.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/:batchId/preview", isAuthenticated, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, req.params.batchId)).limit(1);
    if (!batch || batch.moduleType !== "recruiting_candidates") return res.status(404).json({ error: "NOT_FOUND" });

    const previewRows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batch.id))
      .orderBy(importStagingRows.rowIndex)
      .limit(10);

    const mapping = (batch.columnMapping || {}) as Record<string, string>;
    const previews: any[] = [];

    for (const sr of previewRows) {
      const raw = sr.rawJson as Record<string, any>;
      const mapped = applyMapping(raw, mapping);
      const errors: string[] = [];

      if (!mapped.firstName) errors.push("Missing first name");
      if (!mapped.lastName) errors.push("Missing last name");
      if (!mapped.email) errors.push("Missing email");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) errors.push("Invalid email format");

      let action = "create";
      let matchInfo = null;
      if (mapped.email && errors.length === 0) {
        const emailNorm = normalizeEmail(mapped.email);
        const existing = await db
          .select({ id: recruitingCandidates.id, firstName: recruitingCandidates.firstName, lastName: recruitingCandidates.lastName })
          .from(recruitingCandidates)
          .where(and(eq(recruitingCandidates.emailNormalized, emailNorm)))
          .limit(1);
        if (existing.length > 0) {
          action = "skip";
          matchInfo = `Duplicate: ${existing[0].firstName} ${existing[0].lastName}`;
        }
      }

      previews.push({ rowIndex: sr.rowIndex, raw, mapped, errors, action, matchInfo });
    }

    await db.update(importBatches).set({ status: "previewed" }).where(eq(importBatches.id, batch.id));

    res.json({
      previews,
      totalRows: batch.totalRows,
      previewedRows: previewRows.length,
      hasErrors: previews.some(p => p.errors.length > 0),
    });
  } catch (err: any) {
    console.error("[RecruitingImport] Preview error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/:batchId/commit", isAuthenticated, requireSuperAdmin, async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  try {
    const { productionConfirmPhrase, validationConfirmed, duplicateAction = "skip" } = req.body;

    const env = process.env.NODE_ENV || "development";
    if (env === "production") {
      if (productionConfirmPhrase !== "IMPORT INTO PRODUCTION") {
        return res.status(400).json({ error: "CONFIRM_PHRASE_REQUIRED", message: 'Type exactly "IMPORT INTO PRODUCTION" to proceed in production' });
      }
      if (!validationConfirmed) {
        return res.status(400).json({ error: "VALIDATION_CONFIRM_REQUIRED", message: "You must confirm data has been validated" });
      }
    }

    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, req.params.batchId)).limit(1);
    if (!batch || batch.moduleType !== "recruiting_candidates") return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.committedAt) return res.status(400).json({ error: "ALREADY_COMMITTED" });
    if (batch.rolledBackAt) return res.status(400).json({ error: "ROLLED_BACK" });

    const _userCountBefore = await snapshotUserCount();

    const allRows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batch.id))
      .orderBy(importStagingRows.rowIndex);

    const mapping = (batch.columnMapping || {}) as Record<string, string>;
    let created = 0, skipped = 0, updated = 0, errored = 0;
    const errors: { row: number; error: string }[] = [];

    const { createCandidate, updateCandidate } = await import("../recruitingService");

    for (const sr of allRows) {
      const raw = sr.rawJson as Record<string, any>;
      const mapped = applyMapping(raw, mapping);

      if (!mapped.firstName || !mapped.lastName || !mapped.email) {
        errored++;
        errors.push({ row: sr.rowIndex + 1, error: "Missing required fields (firstName, lastName, email)" });
        await db.update(importStagingRows).set({ status: "error", validationErrors: ["Missing required fields"] }).where(eq(importStagingRows.id, sr.id));
        continue;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) {
        errored++;
        errors.push({ row: sr.rowIndex + 1, error: `Invalid email: ${mapped.email}` });
        await db.update(importStagingRows).set({ status: "error" }).where(eq(importStagingRows.id, sr.id));
        continue;
      }

      try {
        const emailNorm = normalizeEmail(mapped.email);
        const phoneNorm = normalizePhone(mapped.phone);
        const dedupConds: any[] = [eq(recruitingCandidates.emailNormalized, emailNorm)];
        if (phoneNorm) dedupConds.push(eq(recruitingCandidates.phoneNormalized, phoneNorm));

        const existing = await db
          .select({ id: recruitingCandidates.id, firstName: recruitingCandidates.firstName, lastName: recruitingCandidates.lastName })
          .from(recruitingCandidates)
          .where(or(...dedupConds))
          .limit(1);

        if (existing.length > 0) {
          if (duplicateAction === "update") {
            const { email: _e, emailNormalized: _en, ...updateData } = mapped as any;
            await updateCandidate(existing[0].id, updateData, user.id, user.email);
            updated++;
          } else {
            skipped++;
          }
          await db.update(importStagingRows).set({ status: "skipped" }).where(eq(importStagingRows.id, sr.id));
          continue;
        }

        const validSources = ["website", "referral", "job_board", "social_media", "career_fair", "internal", "agency", "other"];
        if (mapped.source && !validSources.includes(mapped.source)) mapped.source = "other";
        if (mapped.yearsExperience) {
          const parsed = parseInt(mapped.yearsExperience, 10);
          mapped.yearsExperience = isNaN(parsed) ? undefined : parsed;
        }

        const newCandidate = await createCandidate(mapped, user.id, user.email);
        created++;
        await db.update(importStagingRows).set({ status: "imported" }).where(eq(importStagingRows.id, sr.id));
        await db.insert(importAuditLog).values({
          batchId: batch.id,
          rowId: sr.id,
          action: "candidate_created",
          driverId: newCandidate.id,
          message: `Created: ${newCandidate.firstName} ${newCandidate.lastName} <${newCandidate.email}>`,
        });
      } catch (rowErr: any) {
        if (rowErr.code === "DUPLICATE_CANDIDATE") {
          skipped++;
          await db.update(importStagingRows).set({ status: "skipped" }).where(eq(importStagingRows.id, sr.id));
        } else {
          errored++;
          errors.push({ row: sr.rowIndex + 1, error: rowErr.message || "Unknown error" });
          await db.update(importStagingRows).set({ status: "error" }).where(eq(importStagingRows.id, sr.id));
        }
      }
    }

    await assertUserCountUnchanged(batch.id, "Recruiting", _userCountBefore);

    await db.update(importBatches).set({
      status: "committed",
      committedAt: new Date(),
      createdRows: created,
      updatedRows: updated,
      skippedRows: skipped,
      failedRows: errored,
    }).where(eq(importBatches.id, batch.id));

    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "recruiting_import.committed",
        actorUserId: user.id,
        actorUserEmail: user.email,
        targetEntityType: "recruiting_candidates",
        targetEntityId: batch.id,
        metadata: { created, updated, skipped, errored, fileName: batch.sourceFileName },
      });
    } catch (_) {}

    res.json({ ok: true, created, updated, skipped, errored, errors: errors.slice(0, 50) });
  } catch (err: any) {
    console.error("[RecruitingImport] Commit error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/:batchId/rollback", isAuthenticated, requireSuperAdmin, async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, req.params.batchId)).limit(1);
    if (!batch || batch.moduleType !== "recruiting_candidates") return res.status(404).json({ error: "NOT_FOUND" });
    if (!batch.committedAt) return res.status(400).json({ error: "NOT_COMMITTED", message: "Batch has not been committed" });
    if (batch.rolledBackAt) return res.status(400).json({ error: "ALREADY_ROLLED_BACK" });

    const hoursSince = (Date.now() - new Date(batch.committedAt).getTime()) / 3600000;
    if (hoursSince > 24) {
      return res.status(400).json({ error: "ROLLBACK_WINDOW_EXPIRED", message: "The 24-hour rollback window has expired" });
    }

    const auditEntries = await db.select().from(importAuditLog)
      .where(and(eq(importAuditLog.batchId, batch.id), eq(importAuditLog.action, "candidate_created")));
    const candidateIds = auditEntries.map(e => e.driverId).filter(Boolean) as string[];

    let archived = 0;
    if (candidateIds.length > 0) {
      await db.update(recruitingCandidates)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(inArray(recruitingCandidates.id, candidateIds));
      archived = candidateIds.length;
    }

    await db.update(importBatches).set({
      status: "rolled_back",
      rolledBackAt: new Date(),
      rollbackByUserId: user.id,
    }).where(eq(importBatches.id, batch.id));

    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "recruiting_import.rolled_back",
        actorUserId: user.id,
        actorUserEmail: user.email,
        targetEntityType: "recruiting_candidates",
        targetEntityId: batch.id,
        metadata: { archived, fileName: batch.sourceFileName },
      });
    } catch (_) {}

    res.json({ ok: true, archived });
  } catch (err: any) {
    console.error("[RecruitingImport] Rollback error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/batches", isAuthenticated, requireSuperAdmin, async (_req: any, res: Response) => {
  try {
    const batches = await db.select().from(importBatches)
      .where(eq(importBatches.moduleType, "recruiting_candidates"))
      .orderBy(desc(importBatches.createdAt))
      .limit(50);
    res.json(batches);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/field-catalog", isAuthenticated, (_req: any, res: Response) => {
  res.json(CANDIDATE_FIELD_CATALOG);
});

router.get("/:batchId", isAuthenticated, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, req.params.batchId)).limit(1);
    if (!batch || batch.moduleType !== "recruiting_candidates") return res.status(404).json({ error: "NOT_FOUND" });
    const rows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batch.id))
      .orderBy(importStagingRows.rowIndex)
      .limit(200);
    res.json({ batch, rows });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

export default router;
