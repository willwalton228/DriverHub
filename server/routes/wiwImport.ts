import { snapshotUserCount, assertUserCountUnchanged } from "../services/importUserGuard";
import { Router, Response } from "express";
import { db } from "../db";
import {
  users,
  shifts,
  timePunches,
  importBatches,
  importStagingRows,
  importAuditLog,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import multer from "multer";
import { isAuthenticated } from "../replitAuth";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
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
        targetEntityType: "wiw_import",
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

function getModuleType(type: string): "wiw_schedule" | "wiw_attendance" {
  return type === "attendance" ? "wiw_attendance" : "wiw_schedule";
}

router.post("/upload/:type", isAuthenticated, requireSuperAdmin, upload.single("file"), async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  const importType = req.params.type;

  if (!["schedule", "attendance"].includes(importType)) {
    return res.status(400).json({ error: "INVALID_TYPE", message: "type must be 'schedule' or 'attendance'" });
  }

  try {
    if (!req.file) return res.status(400).json({ error: "NO_FILE", message: "No file uploaded" });

    const { parseScheduleXLSX, parseAttendanceCSV } = await import("../services/wiwIngestion");

    let sampleRows: any[] = [];
    let totalRows = 0;

    if (importType === "schedule") {
      const parsed = parseScheduleXLSX(req.file.buffer);
      totalRows = parsed.length;
      sampleRows = parsed.slice(0, 10).map(r => ({
        employeeName: r.employeeName,
        employeeEmail: r.employeeEmail,
        shiftDate: r.shiftDate,
        startTime: r.startTime,
        endTime: r.endTime,
        scheduledHours: r.scheduledHours,
        position: r.position,
        locationName: r.locationName,
        isPublished: r.isPublished,
        validationErrors: r.validationErrors,
      }));
    } else {
      const parsed = parseAttendanceCSV(req.file.buffer);
      totalRows = parsed.length;
      sampleRows = parsed.slice(0, 10).map(r => ({
        employeeName: r.employeeName,
        employeeEmail: r.employeeEmail,
        noticeDate: r.noticeDate,
        noticeType: r.noticeType,
        actualStart: r.actualStart,
        actualEnd: r.actualEnd,
        actualHours: r.actualHours,
        locationName: r.locationName,
        validationErrors: r.validationErrors,
      }));
    }

    const moduleType = getModuleType(importType);

    const [batch] = await db.insert(importBatches).values({
      sourceFileName: req.file.originalname,
      status: "uploaded",
      totalRows,
      moduleType,
      fileHeaders: importType === "schedule"
        ? ["Employee Name", "Date", "Start Time", "End Time", "Hours", "Position", "Location"]
        : ["Employee Name", "Date", "Notice Type", "Actual Start", "Actual End", "Actual Hours", "Location"],
      columnMapping: {},
      createdByUserId: user.id,
      createdByUsername: user.displayName,
    }).returning();

    const CHUNK = 100;
    for (let i = 0; i < sampleRows.length; i += CHUNK) {
      await db.insert(importStagingRows).values(
        sampleRows.slice(i, i + CHUNK).map((row, idx) => ({
          batchId: batch.id,
          rowIndex: i + idx,
          rawJson: row,
          status: "pending" as const,
        }))
      );
    }

    await db.insert(importAuditLog).values({
      batchId: batch.id,
      action: "file_uploaded",
      message: `File uploaded: ${req.file.originalname}, ${totalRows} rows, type: ${importType}`,
    });

    res.json({
      batchId: batch.id,
      importType,
      moduleType,
      totalRows,
      fileName: req.file.originalname,
      sampleRows,
      hasErrors: sampleRows.some(r => r.validationErrors?.length > 0),
    });
  } catch (err: any) {
    console.error("[WiwImport] Upload error:", err);
    res.status(500).json({ error: "UPLOAD_FAILED", message: err.message || "Upload failed" });
  }
});

router.post("/:batchId/preview", isAuthenticated, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, req.params.batchId)).limit(1);
    if (!batch || !["wiw_schedule", "wiw_attendance"].includes(batch.moduleType || "")) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const sampleRows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batch.id))
      .orderBy(importStagingRows.rowIndex)
      .limit(10);

    await db.update(importBatches).set({ status: "previewed" }).where(eq(importBatches.id, batch.id));

    res.json({
      batchId: batch.id,
      moduleType: batch.moduleType,
      totalRows: batch.totalRows,
      sampleRows: sampleRows.map(r => r.rawJson),
      fileName: batch.sourceFileName,
    });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/:batchId/commit", isAuthenticated, requireSuperAdmin, async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  try {
    const { productionConfirmPhrase, validationConfirmed } = req.body;

    const env = process.env.NODE_ENV || "development";
    if (env === "production") {
      if (productionConfirmPhrase !== "IMPORT INTO PRODUCTION") {
        return res.status(400).json({ error: "CONFIRM_PHRASE_REQUIRED", message: 'Type exactly "IMPORT INTO PRODUCTION" to proceed in production' });
      }
      if (!validationConfirmed) {
        return res.status(400).json({ error: "VALIDATION_CONFIRM_REQUIRED" });
      }
    }

    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, req.params.batchId)).limit(1);
    if (!batch || !["wiw_schedule", "wiw_attendance"].includes(batch.moduleType || "")) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    if (batch.committedAt) return res.status(400).json({ error: "ALREADY_COMMITTED" });
    if (batch.rolledBackAt) return res.status(400).json({ error: "ROLLED_BACK" });

    const stagingMeta = (batch.columnMapping || {}) as any;
    if (stagingMeta.fileBuffer) {
      return res.status(400).json({ error: "NO_FILE_BUFFER", message: "File buffer missing from batch metadata" });
    }

    const { processScheduleImport, processAttendanceImport } = await import("../services/wiwIngestion");

    const stagingRows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batch.id))
      .orderBy(importStagingRows.rowIndex)
      .limit(1);

    if (stagingRows.length === 0) {
      return res.status(400).json({ error: "NO_STAGED_FILE", message: "No file data found. Please re-upload the file and restart the wizard." });
    }

    return res.status(400).json({
      error: "REUPLOAD_REQUIRED",
      message: "WIW imports require re-uploading the file at the commit step for processing. Use the commit-with-file endpoint.",
    });
  } catch (err: any) {
    console.error("[WiwImport] Commit error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/:batchId/commit-file", isAuthenticated, requireSuperAdmin, upload.single("file"), async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  try {
    const { productionConfirmPhrase, validationConfirmed } = req.body;

    const env = process.env.NODE_ENV || "development";
    if (env === "production") {
      if (productionConfirmPhrase !== "IMPORT INTO PRODUCTION") {
        return res.status(400).json({ error: "CONFIRM_PHRASE_REQUIRED", message: 'Type exactly "IMPORT INTO PRODUCTION" to proceed in production' });
      }
      if (!validationConfirmed) {
        return res.status(400).json({ error: "VALIDATION_CONFIRM_REQUIRED" });
      }
    }

    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, req.params.batchId)).limit(1);
    if (!batch || !["wiw_schedule", "wiw_attendance"].includes(batch.moduleType || "")) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    if (batch.committedAt) return res.status(400).json({ error: "ALREADY_COMMITTED" });
    if (batch.rolledBackAt) return res.status(400).json({ error: "ROLLED_BACK" });
    if (!req.file) return res.status(400).json({ error: "NO_FILE", message: "File is required for commit" });

    const _userCountBefore = await snapshotUserCount();

    const { processScheduleImport, processAttendanceImport } = await import("../services/wiwIngestion");

    let result: any;
    if (batch.moduleType === "wiw_schedule") {
      result = await processScheduleImport(req.file.buffer, batch.sourceFileName, user.id);
    } else {
      result = await processAttendanceImport(req.file.buffer, batch.sourceFileName, user.id);
    }

    await assertUserCountUnchanged(batch.id, "WhenIWork", _userCountBefore);

    await db.update(importBatches).set({
      status: "committed",
      committedAt: new Date(),
      createdRows: result.shiftsCreated ?? result.punchesCreated ?? result.created ?? 0,
      skippedRows: result.shiftsSkipped ?? result.punchesSkippedNoPunchData ?? result.skippedDuplicates ?? 0,
      columnMapping: { ...((batch.columnMapping || {}) as any), wiwImportRunId: result.importRunId },
    }).where(eq(importBatches.id, batch.id));

    await db.insert(importAuditLog).values({
      batchId: batch.id,
      action: "wiw_import_committed",
      driverId: result.importRunId,
      message: JSON.stringify(result),
    });

    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "wiw_import.committed",
        actorUserId: user.id,
        actorUserEmail: user.email,
        targetEntityType: batch.moduleType || "wiw_import",
        targetEntityId: batch.id,
        metadata: { importRunId: result.importRunId, moduleType: batch.moduleType, ...result },
      });
    } catch (_) {}

    res.json({ ok: true, importRunId: result.importRunId, ...result });
  } catch (err: any) {
    console.error("[WiwImport] Commit-file error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/:batchId/rollback", isAuthenticated, requireSuperAdmin, async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, req.params.batchId)).limit(1);
    if (!batch || !["wiw_schedule", "wiw_attendance"].includes(batch.moduleType || "")) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    if (!batch.committedAt) return res.status(400).json({ error: "NOT_COMMITTED" });
    if (batch.rolledBackAt) return res.status(400).json({ error: "ALREADY_ROLLED_BACK" });

    const hoursSince = (Date.now() - new Date(batch.committedAt).getTime()) / 3600000;
    if (hoursSince > 24) {
      return res.status(400).json({ error: "ROLLBACK_WINDOW_EXPIRED", message: "The 24-hour rollback window has expired" });
    }

    const meta = (batch.columnMapping || {}) as any;
    const wiwImportRunId = meta.wiwImportRunId;
    if (!wiwImportRunId) {
      return res.status(400).json({ error: "NO_IMPORT_RUN_ID", message: "Cannot find WIW import run ID for rollback" });
    }

    let deleted = 0;
    if (batch.moduleType === "wiw_schedule") {
      const deletedShifts = await db.delete(shifts).where(eq(shifts.sourceImportRunId, wiwImportRunId)).returning({ id: shifts.id });
      deleted = deletedShifts.length;
    } else {
      const deletedPunches = await db.delete(timePunches).where(eq(timePunches.sourceImportRunId, wiwImportRunId)).returning({ id: timePunches.id });
      deleted = deletedPunches.length;
    }

    await db.update(importBatches).set({
      status: "rolled_back",
      rolledBackAt: new Date(),
      rollbackByUserId: user.id,
    }).where(eq(importBatches.id, batch.id));

    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "wiw_import.rolled_back",
        actorUserId: user.id,
        actorUserEmail: user.email,
        targetEntityType: batch.moduleType || "wiw_import",
        targetEntityId: batch.id,
        metadata: { wiwImportRunId, deleted, moduleType: batch.moduleType },
      });
    } catch (_) {}

    res.json({ ok: true, deleted, wiwImportRunId });
  } catch (err: any) {
    console.error("[WiwImport] Rollback error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/batches", isAuthenticated, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const { type } = req.query;
    const moduleTypes = type === "schedule"
      ? ["wiw_schedule"]
      : type === "attendance"
        ? ["wiw_attendance"]
        : ["wiw_schedule", "wiw_attendance"];

    const batches = await db.select().from(importBatches)
      .orderBy(desc(importBatches.createdAt))
      .limit(100);

    const filtered = batches.filter(b => moduleTypes.includes(b.moduleType || ""));
    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

router.get("/:batchId", isAuthenticated, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, req.params.batchId)).limit(1);
    if (!batch || !["wiw_schedule", "wiw_attendance"].includes(batch.moduleType || "")) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    const rows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batch.id))
      .orderBy(importStagingRows.rowIndex)
      .limit(20);
    res.json({ batch, rows });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

export default router;
