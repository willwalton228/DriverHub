import { Router } from "express";
import { db } from "../db";
import {
  importJobs,
  importJobFiles,
  movesImportRawRows,
  trips,
} from "@shared/schema";
import { normalizeMoveType } from "@shared/moveType";
import {
  eq, desc, and, inArray, sql, count, or,
} from "drizzle-orm";
import multer from "multer";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { isAuthenticated } from "../replitAuth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserId(req: any): string {
  return req.user?.claims?.sub ?? req.user?.id ?? "system";
}

/** Candidate column names for the linking move key, in priority order */
const MOVE_KEY_CANDIDATES = [
  "move_id", "move id", "moveid",
  "trip_id", "trip id", "tripid",
  "move_number", "move number", "movenumber",
  "order_id", "order id", "orderid",
  "job_id", "job id", "jobid",
];

/**
 * Given a row object (keys are original header names), find the best candidate
 * linking column and return { column, value }.
 */
function detectMoveKey(row: Record<string, unknown>): { column: string; value: string } | null {
  const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), { key: k, val: v }]));
  for (const candidate of MOVE_KEY_CANDIDATES) {
    if (lower[candidate]) {
      const val = String(lower[candidate].val ?? "").trim();
      if (val) return { column: lower[candidate].key, value: val };
    }
  }
  return null;
}

/**
 * Parse a Buffer (CSV or XLSX) into an array of row objects.
 * Returns { rows: Record<string, unknown>[], error?: string }
 */
function parseFileBuffer(buffer: Buffer, originalName: string): { rows: Record<string, unknown>[]; error?: string } {
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  try {
    if (ext === "csv") {
      const text = buffer.toString("utf-8");
      const result = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
      });
      return { rows: result.data as Record<string, unknown>[] };
    } else if (["xlsx", "xls"].includes(ext)) {
      const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      return { rows };
    } else {
      return { rows: [], error: `Unsupported file type: .${ext}` };
    }
  } catch (err: any) {
    return { rows: [], error: err.message };
  }
}

// ---------------------------------------------------------------------------
// POST /jobs — create a new import job
// ---------------------------------------------------------------------------
router.post("/jobs", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { jobName, notes } = req.body as { jobName: string; notes?: string };
    if (!jobName?.trim()) return res.status(400).json({ message: "jobName is required" });

    const [job] = await db.insert(importJobs).values({
      datasetType:    "moves",
      jobName:        jobName.trim(),
      status:         "draft",
      createdByUserId: userId,
      notes:          notes ?? null,
    }).returning();

    return res.status(201).json(job);
  } catch (err: any) {
    console.error("[movesImport] POST /jobs:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /jobs — list all moves import jobs (newest first)
// ---------------------------------------------------------------------------
router.get("/jobs", isAuthenticated, async (_req, res) => {
  try {
    const jobs = await db.select().from(importJobs)
      .where(eq(importJobs.datasetType, "moves"))
      .orderBy(desc(importJobs.createdAt));

    // Attach file counts per job
    const jobIds = jobs.map(j => j.id);
    const fileCounts = jobIds.length > 0
      ? await db.select({
          importJobId: importJobFiles.importJobId,
          fileCount:   count(),
        })
        .from(importJobFiles)
        .where(inArray(importJobFiles.importJobId, jobIds))
        .groupBy(importJobFiles.importJobId)
      : [];

    const countMap: Record<string, number> = {};
    fileCounts.forEach(fc => { countMap[fc.importJobId] = Number(fc.fileCount); });

    return res.json(jobs.map(j => ({ ...j, fileCount: countMap[j.id] ?? 0 })));
  } catch (err: any) {
    console.error("[movesImport] GET /jobs:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /jobs/:id — job detail with all child files
// ---------------------------------------------------------------------------
router.get("/jobs/:id", isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const job = await db.query.importJobs?.findFirst({ where: eq(importJobs.id, id) })
      ?? (await db.select().from(importJobs).where(eq(importJobs.id, id)))[0];

    if (!job) return res.status(404).json({ message: "Import job not found" });

    const files = await db.select().from(importJobFiles)
      .where(eq(importJobFiles.importJobId, id))
      .orderBy(importJobFiles.createdAt);

    return res.json({ ...job, files });
  } catch (err: any) {
    console.error("[movesImport] GET /jobs/:id:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /jobs/:id — update job name or notes
// ---------------------------------------------------------------------------
router.patch("/jobs/:id", isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { jobName, notes } = req.body as { jobName?: string; notes?: string };
    const updates: Partial<typeof importJobs.$inferInsert> = { updatedAt: new Date() };
    if (jobName !== undefined) updates.jobName = jobName.trim();
    if (notes  !== undefined) updates.notes  = notes;

    const [updated] = await db.update(importJobs).set(updates)
      .where(eq(importJobs.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Job not found" });

    return res.json(updated);
  } catch (err: any) {
    console.error("[movesImport] PATCH /jobs/:id:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /jobs/:id/files — upload a file (multipart/form-data)
// Fields: file (binary), fileType (string)
// ---------------------------------------------------------------------------
router.post("/jobs/:id/files", isAuthenticated, upload.single("file"), async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { id: jobId } = req.params;
    const fileType = (req.body.fileType as string)?.trim() ?? "other";
    const file = req.file;

    if (!file) return res.status(400).json({ message: "No file uploaded" });

    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
    if (!job) return res.status(404).json({ message: "Import job not found" });
    if (["completed", "cancelled"].includes(job.status)) {
      return res.status(422).json({ message: `Cannot add files to a ${job.status} job` });
    }

    // Parse file
    const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "";
    const { rows, error: parseError } = parseFileBuffer(file.buffer, file.originalname);

    if (parseError) {
      // Create a failed file record
      const [jobFile] = await db.insert(importJobFiles).values({
        importJobId:      jobId,
        fileType,
        sourceFileName:   file.originalname,
        sourceFileType:   ext,
        uploadedByUserId: userId,
        status:           "failed",
        totalRows:        0,
        stagedRows:       0,
        notes:            parseError,
      }).returning();
      return res.status(422).json({ message: parseError, file: jobFile });
    }

    // Detect the key column from the first data row
    const sampleRow = rows[0] ?? {};
    const keyDetection = detectMoveKey(sampleRow);

    // Create file record
    const [jobFile] = await db.insert(importJobFiles).values({
      importJobId:        jobId,
      fileType,
      sourceFileName:     file.originalname,
      sourceFileType:     ext,
      uploadedByUserId:   userId,
      status:             "staged",
      totalRows:          rows.length,
      stagedRows:         0,
      detectedKeyColumn:  keyDetection?.column ?? null,
    }).returning();

    // Stage raw rows in batches of 200
    let stagedCount = 0;
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH).map((row, idx) => {
        const mk = detectMoveKey(row);
        return {
          importJobId:      jobId,
          importFileId:     jobFile.id,
          fileType,
          rowNumber:        i + idx + 1,
          moveKey:          mk?.value ?? null,
          rawRowJson:       row as any,
          processingStatus: "staged",
        };
      });
      await db.insert(movesImportRawRows).values(chunk);
      stagedCount += chunk.length;
    }

    // Update file staged count and advance job status if still draft
    await db.update(importJobFiles).set({
      stagedRows: stagedCount,
      status:     "staged",
      updatedAt:  new Date(),
    }).where(eq(importJobFiles.id, jobFile.id));

    if (job.status === "draft") {
      await db.update(importJobs).set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(importJobs.id, jobId));
    }

    return res.status(201).json({ ...jobFile, stagedRows: stagedCount });
  } catch (err: any) {
    console.error("[movesImport] POST /jobs/:id/files:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /jobs/:id/files/:fileId — remove a file and its raw rows
// ---------------------------------------------------------------------------
router.delete("/jobs/:id/files/:fileId", isAuthenticated, async (req, res) => {
  try {
    const { id: jobId, fileId } = req.params;
    const [file] = await db.select().from(importJobFiles)
      .where(and(eq(importJobFiles.id, fileId), eq(importJobFiles.importJobId, jobId)));
    if (!file) return res.status(404).json({ message: "File not found" });

    // Delete raw rows first (FK constraint)
    await db.delete(movesImportRawRows).where(eq(movesImportRawRows.importFileId, fileId));
    await db.delete(importJobFiles).where(eq(importJobFiles.id, fileId));

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[movesImport] DELETE /jobs/:id/files/:fileId:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /jobs/:id/files/:fileId/reprocess — re-upload one file
// Deletes old raw rows and re-stages from new upload
// ---------------------------------------------------------------------------
router.post("/jobs/:id/files/:fileId/reprocess", isAuthenticated, upload.single("file"), async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { id: jobId, fileId } = req.params;
    const file = req.file;

    if (!file) return res.status(400).json({ message: "No file uploaded" });

    const [existingFile] = await db.select().from(importJobFiles)
      .where(and(eq(importJobFiles.id, fileId), eq(importJobFiles.importJobId, jobId)));
    if (!existingFile) return res.status(404).json({ message: "File not found" });

    // Mark as reprocessing and clear old raw rows
    await db.update(importJobFiles).set({ status: "reprocessing", updatedAt: new Date() })
      .where(eq(importJobFiles.id, fileId));
    await db.delete(movesImportRawRows).where(eq(movesImportRawRows.importFileId, fileId));

    const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "";
    const { rows, error: parseError } = parseFileBuffer(file.buffer, file.originalname);

    if (parseError) {
      await db.update(importJobFiles).set({ status: "failed", notes: parseError, updatedAt: new Date() })
        .where(eq(importJobFiles.id, fileId));
      return res.status(422).json({ message: parseError });
    }

    const sampleRow = rows[0] ?? {};
    const keyDetection = detectMoveKey(sampleRow);

    let stagedCount = 0;
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH).map((row, idx) => {
        const mk = detectMoveKey(row);
        return {
          importJobId:      jobId,
          importFileId:     fileId,
          fileType:         existingFile.fileType,
          rowNumber:        i + idx + 1,
          moveKey:          mk?.value ?? null,
          rawRowJson:       row as any,
          processingStatus: "staged",
        };
      });
      await db.insert(movesImportRawRows).values(chunk);
      stagedCount += chunk.length;
    }

    const [updated] = await db.update(importJobFiles).set({
      sourceFileName:     file.originalname,
      sourceFileType:     ext,
      uploadedByUserId:   userId,
      status:             "staged",
      totalRows:          rows.length,
      stagedRows:         stagedCount,
      validRows:          0,
      invalidRows:        0,
      orphanRows:         0,
      duplicateRows:      0,
      committedRows:      0,
      detectedKeyColumn:  keyDetection?.column ?? null,
      updatedAt:          new Date(),
    }).where(eq(importJobFiles.id, fileId)).returning();

    // Reset job validation if it was previously validated
    await db.update(importJobs).set({
      status:    "in_progress",
      updatedAt: new Date(),
    }).where(and(eq(importJobs.id, jobId), inArray(importJobs.status, ["validated", "staged"])));

    return res.json(updated);
  } catch (err: any) {
    console.error("[movesImport] POST /jobs/:id/files/:fileId/reprocess:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /jobs/:id/validate — run validation across all staged files
//
// Checks:
//  1. Required file (moves_master) present
//  2. moves_master rows all have a move_key
//  3. Duplicate move_keys within moves_master
//  4. Orphan rows in child files (move_key not in master)
//  5. Builds per-file summary counts
// ---------------------------------------------------------------------------
router.post("/jobs/:id/validate", isAuthenticated, async (req, res) => {
  try {
    const { id: jobId } = req.params;
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
    if (!job) return res.status(404).json({ message: "Job not found" });

    const files = await db.select().from(importJobFiles)
      .where(eq(importJobFiles.importJobId, jobId));

    // Mark all files as validating
    await db.update(importJobFiles).set({ status: "validating", updatedAt: new Date() })
      .where(eq(importJobFiles.importJobId, jobId));
    await db.update(importJobs).set({ status: "validating", updatedAt: new Date() })
      .where(eq(importJobs.id, jobId));

    // Validation result accumulators
    const issues: { level: "error" | "warning" | "info"; code: string; message: string; count?: number }[] = [];
    let isReady = true;

    // ── 1. Required file check ────────────────────────────────────────────
    const masterFile = files.find(f => f.fileType === "moves_master");
    if (!masterFile) {
      issues.push({ level: "error", code: "MISSING_MASTER", message: "No Moves Master file uploaded. This file is required before processing." });
      isReady = false;
    }

    // ── 2. Collect all raw rows per file ─────────────────────────────────
    const fileIds = files.map(f => f.id);
    const allRows = fileIds.length > 0
      ? await db.select().from(movesImportRawRows)
          .where(inArray(movesImportRawRows.importFileId, fileIds))
      : [];

    const rowsByFile: Record<string, typeof allRows> = {};
    allRows.forEach(r => {
      (rowsByFile[r.importFileId] ??= []).push(r);
    });

    const masterRows = masterFile ? (rowsByFile[masterFile.id] ?? []) : [];
    const masterKeys = new Set(masterRows.map(r => r.moveKey).filter(Boolean) as string[]);

    // ── 3. Missing key column on master rows ─────────────────────────────
    if (masterFile) {
      const missingKey = masterRows.filter(r => !r.moveKey).length;
      if (missingKey > 0) {
        issues.push({ level: "error", code: "MISSING_KEY", message: `${missingKey} rows in Moves Master are missing a move identifier (move_id / trip_id). These rows cannot be processed.`, count: missingKey });
        isReady = false;
      }
    }

    // ── 4. Duplicate move_keys in master ─────────────────────────────────
    if (masterFile && masterRows.length > 0) {
      const keyCounts: Record<string, number> = {};
      masterRows.filter(r => r.moveKey).forEach(r => { keyCounts[r.moveKey!] = (keyCounts[r.moveKey!] ?? 0) + 1; });
      const dupKeys = Object.entries(keyCounts).filter(([, c]) => c > 1);
      if (dupKeys.length > 0) {
        const dupRowCount = dupKeys.reduce((sum, [, c]) => sum + c - 1, 0); // extra rows
        issues.push({ level: "warning", code: "DUPLICATE_KEYS", message: `${dupKeys.length} move ID(s) appear more than once in Moves Master (${dupRowCount} duplicate rows). Only the first occurrence will be committed.`, count: dupRowCount });
      }

      // Mark duplicates in raw rows
      const seenKeys = new Set<string>();
      for (const row of masterRows) {
        if (!row.moveKey) continue;
        const status = seenKeys.has(row.moveKey) ? "duplicate" : "validated";
        seenKeys.add(row.moveKey);
        await db.update(movesImportRawRows).set({ processingStatus: status, updatedAt: new Date() })
          .where(eq(movesImportRawRows.id, row.id));
      }
    }

    // ── 5. Child file orphan detection ────────────────────────────────────
    const childFiles = files.filter(f => f.fileType !== "moves_master");
    for (const childFile of childFiles) {
      const childRows = rowsByFile[childFile.id] ?? [];
      let orphanCount = 0;
      let validCount = 0;
      let missingKeyCount = 0;

      for (const row of childRows) {
        if (!row.moveKey) {
          missingKeyCount++;
          await db.update(movesImportRawRows).set({ processingStatus: "failed", failureReason: "Missing move identifier", updatedAt: new Date() })
            .where(eq(movesImportRawRows.id, row.id));
          continue;
        }
        if (masterFile && !masterKeys.has(row.moveKey)) {
          orphanCount++;
          await db.update(movesImportRawRows).set({ processingStatus: "orphan", updatedAt: new Date() })
            .where(eq(movesImportRawRows.id, row.id));
        } else {
          validCount++;
          await db.update(movesImportRawRows).set({ processingStatus: "validated", updatedAt: new Date() })
            .where(eq(movesImportRawRows.id, row.id));
        }
      }

      if (orphanCount > 0) {
        issues.push({ level: "warning", code: "ORPHAN_ROWS", message: `${orphanCount} rows in "${childFile.sourceFileName}" (${childFile.fileType.replace(/_/g, " ")}) have move IDs not found in Moves Master.`, count: orphanCount });
      }
      if (missingKeyCount > 0) {
        issues.push({ level: "warning", code: "MISSING_KEY_CHILD", message: `${missingKeyCount} rows in "${childFile.sourceFileName}" are missing a move identifier and will be skipped.`, count: missingKeyCount });
      }

      // Update file counts
      await db.update(importJobFiles).set({
        validRows:   validCount,
        orphanRows:  orphanCount,
        invalidRows: missingKeyCount,
        status:      "validated",
        updatedAt:   new Date(),
      }).where(eq(importJobFiles.id, childFile.id));
    }

    // ── 6. Update master file counts ─────────────────────────────────────
    if (masterFile) {
      const masterValidCount = masterRows.filter(r => r.moveKey).length;
      const masterInvalidCount = masterRows.filter(r => !r.moveKey).length;
      const masterDupCount = masterRows.filter(r => r.processingStatus === "duplicate").length;
      await db.update(importJobFiles).set({
        validRows:     masterValidCount - masterDupCount,
        invalidRows:   masterInvalidCount,
        duplicateRows: masterDupCount,
        status:        "validated",
        updatedAt:     new Date(),
      }).where(eq(importJobFiles.id, masterFile.id));
    }

    // ── 7. Info: no child files ─────────────────────────────────────────
    if (masterFile && childFiles.length === 0) {
      issues.push({ level: "info", code: "NO_CHILD_FILES", message: "Only a Moves Master file is present. You can still process, but Move Stops, Driver Assignments, and Revenue will not be imported." });
    }

    // ── 8. Persist validation summary and update job status ──────────────
    const summary = { isReady, issueCount: issues.length, issues };
    const newStatus = isReady ? "validated" : "in_progress";

    await db.update(importJobs).set({
      status:               newStatus,
      validationSummaryJson: summary as any,
      updatedAt:             new Date(),
    }).where(eq(importJobs.id, jobId));

    return res.json({ jobId, status: newStatus, isReady, issues });
  } catch (err: any) {
    console.error("[movesImport] POST /jobs/:id/validate:", err);
    await db.update(importJobs).set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(importJobs.id, jobId));
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /jobs/:id/process — finalize import: commit validated master rows
//   to the trips table and mark the job completed
// ---------------------------------------------------------------------------
router.post("/jobs/:id/process", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { id: jobId } = req.params;

    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (!["validated", "in_progress", "staged"].includes(job.status)) {
      return res.status(422).json({ message: `Job must be validated before processing (current status: ${job.status})` });
    }

    await db.update(importJobs).set({ status: "processing", updatedAt: new Date() })
      .where(eq(importJobs.id, jobId));

    // Get the master file
    const [masterFile] = await db.select().from(importJobFiles)
      .where(and(eq(importJobFiles.importJobId, jobId), eq(importJobFiles.fileType, "moves_master")));
    if (!masterFile) {
      await db.update(importJobs).set({ status: "failed", updatedAt: new Date() })
        .where(eq(importJobs.id, jobId));
      return res.status(422).json({ message: "No Moves Master file found. Cannot process." });
    }

    // Get validated master rows (exclude duplicates)
    const masterRows = await db.select().from(movesImportRawRows)
      .where(and(
        eq(movesImportRawRows.importFileId, masterFile.id),
        eq(movesImportRawRows.processingStatus, "validated"),
      ));

    const COLUMN_MAPS = {
      moveNumber:   ["move_id", "move id", "moveid", "trip_id", "move_number", "move number", "movenumber", "order_id", "job_id"],
      tripDate:     ["date", "move_date", "trip_date", "pickup_date", "scheduled_date", "move date", "trip date", "pickup date"],
      origin:       ["origin", "pickup", "pickup_address", "from", "from_address", "start_address", "pickup address"],
      destination:  ["destination", "dropoff", "dropoff_address", "to", "to_address", "end_address", "dropoff address", "delivery address"],
      status:       ["status", "move_status", "trip_status", "state"],
      moveType:     ["move_type", "type", "move type", "trip_type"],
      notes:        ["notes", "comments", "note", "description"],
      billRate:     ["bill_rate", "bill rate", "billing_amount", "rate", "revenue", "amount"],
      payRate:      ["pay_rate", "pay rate", "driver_pay", "driver pay"],
    };

    function extractCol(row: Record<string, unknown>, candidates: string[]): string | null {
      const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v]));
      for (const c of candidates) {
        const val = lower[c];
        if (val !== undefined && val !== null && String(val).trim() !== "") return String(val).trim();
      }
      return null;
    }

    let committedCount = 0;
    let failedCount = 0;
    const seenMoveNumbers = new Set<string>();

    for (const rawRow of masterRows) {
      const row = rawRow.rawRowJson as Record<string, unknown>;
      const moveNumber = rawRow.moveKey ?? extractCol(row, COLUMN_MAPS.moveNumber) ?? `IMPORT-${rawRow.id.slice(0, 8)}`;

      // Skip if we've already committed this move_number in this job
      if (seenMoveNumbers.has(moveNumber)) continue;
      seenMoveNumbers.add(moveNumber);

      const tripDateStr = extractCol(row, COLUMN_MAPS.tripDate);
      const tripDate = tripDateStr ? new Date(tripDateStr) : new Date();

      try {
        const moveType = normalizeMoveType(extractCol(row, COLUMN_MAPS.moveType));

        // Upsert trip — update if move_number already exists, insert otherwise
        const existing = await db.select({ id: trips.id })
          .from(trips).where(eq(trips.moveNumber, moveNumber));

        let tripId: string;
        if (existing.length > 0) {
          tripId = existing[0].id;
          await db.update(trips).set({
            origin:      extractCol(row, COLUMN_MAPS.origin)      ?? "Unknown",
            destination: extractCol(row, COLUMN_MAPS.destination) ?? "Unknown",
            tripDate,
            status:      extractCol(row, COLUMN_MAPS.status)      ?? "completed",
            moveType,
            notes:       extractCol(row, COLUMN_MAPS.notes),
            billRate:    extractCol(row, COLUMN_MAPS.billRate),
            payRate:     extractCol(row, COLUMN_MAPS.payRate),
            ingestSource: "CSV",
            ingestedAt:   new Date(),
            ingestedBy:   userId,
          }).where(eq(trips.id, tripId));
        } else {
          const [inserted] = await db.insert(trips).values({
            moveNumber,
            origin:      extractCol(row, COLUMN_MAPS.origin)      ?? "Unknown",
            destination: extractCol(row, COLUMN_MAPS.destination) ?? "Unknown",
            tripDate,
            status:      extractCol(row, COLUMN_MAPS.status)      ?? "completed",
            moveType,
            notes:       extractCol(row, COLUMN_MAPS.notes),
            billRate:    extractCol(row, COLUMN_MAPS.billRate),
            payRate:     extractCol(row, COLUMN_MAPS.payRate),
            ingestSource: "CSV",
            ingestedAt:   new Date(),
            ingestedBy:   userId,
          }).returning({ id: trips.id });
          tripId = inserted.id;
        }

        // Link raw row back to the trip
        await db.update(movesImportRawRows).set({
          processingStatus: "committed",
          linkedTripId:     tripId,
          updatedAt:        new Date(),
        }).where(eq(movesImportRawRows.id, rawRow.id));

        committedCount++;
      } catch (rowErr: any) {
        console.warn(`[movesImport] Row ${rawRow.rowNumber} failed:`, rowErr.message);
        await db.update(movesImportRawRows).set({
          processingStatus: "failed",
          failureReason:    rowErr.message,
          updatedAt:        new Date(),
        }).where(eq(movesImportRawRows.id, rawRow.id));
        failedCount++;
      }
    }

    // Update master file committed count
    await db.update(importJobFiles).set({
      committedRows: committedCount,
      status:        "validated",
      updatedAt:     new Date(),
    }).where(eq(importJobFiles.id, masterFile.id));

    // Mark job completed
    await db.update(importJobs).set({
      status:      "completed",
      processedAt: new Date(),
      updatedAt:   new Date(),
    }).where(eq(importJobs.id, jobId));

    return res.json({
      success:        true,
      committedCount,
      failedCount,
      skippedCount:   masterRows.length - committedCount - failedCount,
    });
  } catch (err: any) {
    console.error("[movesImport] POST /jobs/:id/process:", err);
    await db.update(importJobs).set({ status: "failed", updatedAt: new Date() })
      .where(eq(importJobs.id, jobId));
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /jobs/:id/reconciliation — full reconciliation report for a job
// ---------------------------------------------------------------------------
router.get("/jobs/:id/reconciliation", isAuthenticated, async (req, res) => {
  try {
    const { id: jobId } = req.params;
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
    if (!job) return res.status(404).json({ message: "Job not found" });

    const files = await db.select().from(importJobFiles)
      .where(eq(importJobFiles.importJobId, jobId));

    // Per-file raw row counts
    const rawCounts = files.length > 0
      ? await db.select({
          importFileId:     movesImportRawRows.importFileId,
          status:           movesImportRawRows.processingStatus,
          cnt:              count(),
        })
        .from(movesImportRawRows)
        .where(inArray(movesImportRawRows.importFileId, files.map(f => f.id)))
        .groupBy(movesImportRawRows.importFileId, movesImportRawRows.processingStatus)
      : [];

    // Build per-file reconciliation breakdown
    const fileRecon = files.map(f => {
      const fileCounts = rawCounts.filter(r => r.importFileId === f.id);
      const getCount = (s: string) => Number(fileCounts.find(r => r.status === s)?.cnt ?? 0);
      return {
        fileId:        f.id,
        fileType:      f.fileType,
        sourceFileName: f.sourceFileName,
        status:        f.status,
        sourceRows:    f.totalRows ?? 0,
        staged:        getCount("staged"),
        validated:     getCount("validated"),
        orphan:        getCount("orphan"),
        duplicate:     getCount("duplicate"),
        committed:     getCount("committed"),
        failed:        getCount("failed"),
      };
    });

    const totals = fileRecon.reduce(
      (acc, f) => ({
        sourceRows:  acc.sourceRows  + f.sourceRows,
        staged:      acc.staged      + f.staged,
        validated:   acc.validated   + f.validated,
        orphan:      acc.orphan      + f.orphan,
        duplicate:   acc.duplicate   + f.duplicate,
        committed:   acc.committed   + f.committed,
        failed:      acc.failed      + f.failed,
      }),
      { sourceRows: 0, staged: 0, validated: 0, orphan: 0, duplicate: 0, committed: 0, failed: 0 }
    );

    return res.json({
      jobId,
      jobStatus:  job.status,
      jobName:    job.jobName,
      processedAt: job.processedAt,
      files:      fileRecon,
      totals,
      validationSummary: job.validationSummaryJson,
    });
  } catch (err: any) {
    console.error("[movesImport] GET /jobs/:id/reconciliation:", err);
    return res.status(500).json({ message: err.message });
  }
});

export default router;
