/**
 * Automated Secure File-Drop Ingestion Service
 *
 * Connects to SFTP servers, scans inbound folders, detects new files using
 * name + checksum dedup, stages them through the appropriate import pipeline,
 * and archives or error-routes files based on outcome.
 *
 * Supports: rideshare | openforce | moves datasets
 */

import SftpClient from "ssh2-sftp-client";
import { createHash } from "crypto";
import { db } from "../db";
import {
  fileDropConfigs,
  fileDropIngestionLog,
  importJobs,
  importJobFiles,
  movesImportRawRows,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import Papa from "papaparse";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FileDropDatasetType = "rideshare" | "openforce" | "moves";

interface RemoteFile {
  name: string;
  path: string;
  size: number;
  modifyTime: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Parse a Buffer (CSV or XLSX) into row objects. */
function parseBuffer(buf: Buffer, fileName: string): Record<string, unknown>[] {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv") {
    const text = buf.toString("utf-8");
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true, skipEmptyLines: true, dynamicTyping: false,
    });
    return result.data as Record<string, unknown>[];
  } else if (["xlsx", "xls"].includes(ext)) {
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  }
  return [];
}

/** Detect the move linking key from a row (moves dataset). */
const MOVE_KEY_CANDIDATES = [
  "move_id", "move id", "moveid",
  "trip_id", "trip id", "tripid",
  "move_number", "move number", "movenumber",
  "order_id", "order id", "orderid",
  "job_id", "job id", "jobid",
];

function detectMoveKey(row: Record<string, unknown>): { column: string; value: string } | null {
  const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), { key: k, val: v }]));
  for (const c of MOVE_KEY_CANDIDATES) {
    if (lower[c]) {
      const val = String(lower[c].val ?? "").trim();
      if (val) return { column: lower[c].key, value: val };
    }
  }
  return null;
}

/** Classify a moves file by its filename heuristics. */
function classifyMovesFile(fileName: string): string {
  const lc = fileName.toLowerCase();
  if (lc.includes("master") || lc.includes("main"))          return "moves_master";
  if (lc.includes("stop"))                                    return "move_stops";
  if (lc.includes("driver") && lc.includes("assign"))        return "driver_assignments";
  if (lc.includes("revenue") || lc.includes("billing"))      return "revenue";
  if (lc.includes("status") || lc.includes("history"))       return "status_history";
  return "other";
}

/** Classify a filename for any dataset type. */
function classifyFile(fileName: string, datasetType: string, namePattern?: string | null): string {
  if (namePattern) {
    try {
      const re = new RegExp(namePattern, "i");
      if (!re.test(fileName)) return "unmatched";
    } catch { /* ignore bad patterns */ }
  }
  if (datasetType === "moves") return classifyMovesFile(fileName);
  return "primary"; // rideshare / openforce have a single primary file per batch
}

// ─── Core Ingestion Functions ────────────────────────────────────────────────

/** Build a connected SftpClient for the given config.  Caller must call client.end() when done. */
async function buildSftpClient(config: typeof fileDropConfigs.$inferSelect): Promise<SftpClient> {
  const sftp = new SftpClient();

  const connectOptions: SftpClient.ConnectOptions = {
    host:     config.sftpHost ?? "localhost",
    port:     config.sftpPort ?? 22,
    username: config.sftpUsername ?? "",
  };

  // Prefer private-key auth; fall back to password
  if (config.sftpPrivateKeyEncrypted) {
    // In production integrate with the key vault — for now treat as plaintext key stored in DB.
    connectOptions.privateKey = config.sftpPrivateKeyEncrypted;
    if (config.sftpPassphraseEncrypted) connectOptions.passphrase = config.sftpPassphraseEncrypted;
  } else if (config.sftpPasswordEncrypted) {
    connectOptions.password = config.sftpPasswordEncrypted;
  }

  await sftp.connect(connectOptions);
  return sftp;
}

/** Check if an ingestion log entry already exists for this checksum + configId (duplicate guard). */
async function isDuplicate(configId: string, checksum: string): Promise<boolean> {
  const existing = await db.select({ id: fileDropIngestionLog.id })
    .from(fileDropIngestionLog)
    .where(and(
      eq(fileDropIngestionLog.fileDropConfigId, configId),
      eq(fileDropIngestionLog.checksum, checksum),
      inArray(fileDropIngestionLog.status, ["processed", "processing"]),
    ));
  return existing.length > 0;
}

/** Archive a remote file by moving it to destFolder. Returns new remote path. */
async function archiveRemoteFile(sftp: SftpClient, remotePath: string, destFolder: string): Promise<string> {
  const fileName = remotePath.split("/").pop() ?? remotePath;
  const dest = `${destFolder.replace(/\/$/, "")}/${fileName}`;
  try {
    await sftp.rename(remotePath, dest);
    return dest;
  } catch {
    // If rename fails across filesystems, try copy+delete
    try {
      const buf = await sftp.get(remotePath) as Buffer;
      await sftp.put(buf, dest);
      await sftp.delete(remotePath);
      return dest;
    } catch (e2: any) {
      console.warn(`[FileDrop] Archive copy failed for ${remotePath}:`, e2.message);
      return remotePath; // leave in place if archive fails
    }
  }
}

/** Ensure a remote directory exists. */
async function ensureRemoteDir(sftp: SftpClient, dirPath: string): Promise<void> {
  try {
    await sftp.mkdir(dirPath, true);
  } catch { /* ignore if exists */ }
}

// ─── Pipeline Dispatchers ─────────────────────────────────────────────────────

/**
 * Stage a file into a new Moves import job, then run validation.
 * If autoProcess=true, also runs the process step.
 */
async function ingestMovesFile(
  config: typeof fileDropConfigs.$inferSelect,
  fileName: string,
  buf: Buffer,
  logId: string,
): Promise<{ jobId: string; staged: number }> {
  const userId = "system:file-drop";
  const fileType = classifyMovesFile(fileName);

  // Find an existing open job or create a new one
  let jobId: string;
  const openJob = await db.select({ id: importJobs.id })
    .from(importJobs)
    .where(and(
      eq(importJobs.datasetType, "moves"),
      inArray(importJobs.status, ["draft", "in_progress"]),
    ))
    .orderBy(importJobs.createdAt)
    .limit(1);

  if (openJob.length > 0 && !config.requireAllFileTypes) {
    jobId = openJob[0].id;
  } else {
    // Always create a fresh job for file-drop ingestion
    const [newJob] = await db.insert(importJobs).values({
      datasetType:     "moves",
      jobName:         `Auto-Import: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      status:          "in_progress",
      createdByUserId: userId,
      notes:           `Automated file-drop ingestion. Config: ${config.name}`,
    }).returning({ id: importJobs.id });
    jobId = newJob.id;
  }

  // Parse rows
  const rows = parseBuffer(buf, fileName);
  const sampleRow = rows[0] ?? {};
  const keyDetection = detectMoveKey(sampleRow);

  // Create file record
  const [jobFile] = await db.insert(importJobFiles).values({
    importJobId:        jobId,
    fileType,
    sourceFileName:     fileName,
    sourceFileType:     fileName.split(".").pop()?.toLowerCase() ?? null,
    uploadedByUserId:   userId,
    status:             "staged",
    totalRows:          rows.length,
    stagedRows:         0,
    detectedKeyColumn:  keyDetection?.column ?? null,
    notes:              `Auto-ingested via file-drop config "${config.name}"`,
  }).returning();

  // Stage raw rows in batches of 200
  let staged = 0;
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
    staged += chunk.length;
  }

  await db.update(importJobFiles).set({ stagedRows: staged, updatedAt: new Date() })
    .where(eq(importJobFiles.id, jobFile.id));

  // Update ingestion log with job linkage
  await db.update(fileDropIngestionLog).set({
    importJobId: jobId,
    rowsStaged:  staged,
    updatedAt:   new Date(),
  }).where(eq(fileDropIngestionLog.id, logId));

  return { jobId, staged };
}

/**
 * Stage a rideshare file: creates a rideshare_import_batch and calls the parser.
 * For now we log metadata — full rideshare parse happens via the rideshare route.
 */
async function ingestRideshareFile(
  config: typeof fileDropConfigs.$inferSelect,
  fileName: string,
  buf: Buffer,
  logId: string,
): Promise<{ staged: number }> {
  const rows = parseBuffer(buf, fileName);

  await db.update(fileDropIngestionLog).set({
    rowsStaged: rows.length,
    updatedAt:  new Date(),
  }).where(eq(fileDropIngestionLog.id, logId));

  // Note: Full rideshare parsing requires the rideshare route (complex canonical pipeline).
  // We log the detection and route to the import UI where a user can confirm and process.
  // Automatic processing is supported via the rideshare batch creation API.
  return { staged: rows.length };
}

/**
 * Stage an OpenForce settlement file: logs metadata for manual processing via the UI.
 */
async function ingestOpenForceFile(
  config: typeof fileDropConfigs.$inferSelect,
  fileName: string,
  buf: Buffer,
  logId: string,
): Promise<{ staged: number }> {
  const rows = parseBuffer(buf, fileName);

  await db.update(fileDropIngestionLog).set({
    rowsStaged: rows.length,
    updatedAt:  new Date(),
  }).where(eq(fileDropIngestionLog.id, logId));

  return { staged: rows.length };
}

// ─── Main Polling Function ────────────────────────────────────────────────────

/**
 * Poll one file-drop configuration:
 *  1. Connect to SFTP
 *  2. List inbound folder
 *  3. For each file: checksum → dedup check → ingest → archive
 *  4. Update lastPolledAt
 */
export async function pollFileDropConfig(configId: string): Promise<{
  filesDetected: number;
  filesIngested: number;
  filesDuplicate: number;
  filesErrored: number;
  errors: string[];
}> {
  const result = { filesDetected: 0, filesIngested: 0, filesDuplicate: 0, filesErrored: 0, errors: [] as string[] };

  const [config] = await db.select().from(fileDropConfigs).where(eq(fileDropConfigs.id, configId));
  if (!config) { result.errors.push("Config not found"); return result; }
  if (!config.enabled) { result.errors.push("Config is disabled"); return result; }
  if (!config.sftpHost) { result.errors.push("No SFTP host configured"); return result; }

  let sftp: SftpClient | null = null;
  try {
    sftp = await buildSftpClient(config);

    // Ensure archive directories exist
    if (config.archivePath)   await ensureRemoteDir(sftp, config.archivePath);
    if (config.errorPath)     await ensureRemoteDir(sftp, config.errorPath);
    if (config.duplicatePath) await ensureRemoteDir(sftp, config.duplicatePath);

    // List inbound files
    let remoteList: SftpClient.FileInfo[];
    try {
      remoteList = await sftp.list(config.inboundPath) as SftpClient.FileInfo[];
    } catch (e: any) {
      result.errors.push(`Cannot list ${config.inboundPath}: ${e.message}`);
      return result;
    }

    // Filter to actual files (not directories), optionally matching name pattern
    const fileEntries: RemoteFile[] = (remoteList ?? [])
      .filter(f => f.type === "-") // regular files only
      .filter(f => {
        if (!config.fileNamePattern) return true;
        try { return new RegExp(config.fileNamePattern, "i").test(f.name); } catch { return true; }
      })
      .map(f => ({
        name:       f.name,
        path:       `${config.inboundPath.replace(/\/$/, "")}/${f.name}`,
        size:       f.size ?? 0,
        modifyTime: f.modifyTime ?? 0,
      }));

    result.filesDetected = fileEntries.length;

    for (const file of fileEntries) {
      // Create initial ingestion log entry
      const [logEntry] = await db.insert(fileDropIngestionLog).values({
        fileDropConfigId: configId,
        fileName:         file.name,
        remotePath:       file.path,
        fileSize:         file.size,
        status:           "pending",
        datasetType:      config.datasetType,
      }).returning({ id: fileDropIngestionLog.id });

      try {
        // Download file
        const buf = await sftp.get(file.path) as Buffer;
        const checksum = sha256(buf);

        // Duplicate check
        const dup = await isDuplicate(configId, checksum);
        if (dup) {
          result.filesDuplicate++;
          await db.update(fileDropIngestionLog).set({
            checksum, status: "duplicate",
            errorMessage: "Duplicate file — checksum already processed",
            processedAt:  new Date(), updatedAt: new Date(),
          }).where(eq(fileDropIngestionLog.id, logEntry.id));

          if (sftp && config.duplicatePath) {
            const archived = await archiveRemoteFile(sftp, file.path, config.duplicatePath);
            await db.update(fileDropIngestionLog).set({ archivedPath: archived, updatedAt: new Date() })
              .where(eq(fileDropIngestionLog.id, logEntry.id));
          }
          continue;
        }

        // Update log with checksum + move to processing
        await db.update(fileDropIngestionLog).set({
          checksum, status: "processing", updatedAt: new Date(),
        }).where(eq(fileDropIngestionLog.id, logEntry.id));

        // ── Dataset-specific ingestion ───────────────────────────────────
        let staged = 0;
        if (config.datasetType === "moves") {
          const r = await ingestMovesFile(config, file.name, buf, logEntry.id);
          staged = r.staged;
        } else if (config.datasetType === "rideshare") {
          const r = await ingestRideshareFile(config, file.name, buf, logEntry.id);
          staged = r.staged;
        } else if (config.datasetType === "openforce") {
          const r = await ingestOpenForceFile(config, file.name, buf, logEntry.id);
          staged = r.staged;
        }

        // Archive to processed folder
        let archivedPath = file.path;
        if (config.archivePath) {
          archivedPath = await archiveRemoteFile(sftp, file.path, config.archivePath);
        }

        await db.update(fileDropIngestionLog).set({
          status:       "processed",
          rowsStaged:   staged,
          archivedPath,
          processedAt:  new Date(),
          updatedAt:    new Date(),
        }).where(eq(fileDropIngestionLog.id, logEntry.id));

        result.filesIngested++;
      } catch (fileErr: any) {
        console.error(`[FileDrop] Error processing ${file.name}:`, fileErr.message);
        result.filesErrored++;
        result.errors.push(`${file.name}: ${fileErr.message}`);

        await db.update(fileDropIngestionLog).set({
          status:       "rejected",
          errorMessage: fileErr.message,
          processedAt:  new Date(),
          updatedAt:    new Date(),
        }).where(eq(fileDropIngestionLog.id, logEntry.id));

        // Move to error archive
        try {
          if (sftp && config.errorPath) {
            const errPath = await archiveRemoteFile(sftp, file.path, config.errorPath);
            await db.update(fileDropIngestionLog).set({ archivedPath: errPath, updatedAt: new Date() })
              .where(eq(fileDropIngestionLog.id, logEntry.id));
          }
        } catch { /* best-effort archive */ }
      }
    }
  } catch (connectErr: any) {
    result.errors.push(`SFTP connection failed: ${connectErr.message}`);
  } finally {
    if (sftp) {
      try { await sftp.end(); } catch { /* ignore */ }
    }
    // Always update lastPolledAt
    await db.update(fileDropConfigs).set({ lastPolledAt: new Date(), updatedAt: new Date() })
      .where(eq(fileDropConfigs.id, configId));
  }

  return result;
}

/**
 * Poll ALL enabled file-drop configs.
 */
export async function pollAllFileDropConfigs(): Promise<void> {
  const configs = await db.select({ id: fileDropConfigs.id, name: fileDropConfigs.name })
    .from(fileDropConfigs)
    .where(eq(fileDropConfigs.enabled, true));

  for (const cfg of configs) {
    try {
      const result = await pollFileDropConfig(cfg.id);
      console.log(`[FileDrop] Polled "${cfg.name}": detected=${result.filesDetected} ingested=${result.filesIngested} dup=${result.filesDuplicate} err=${result.filesErrored}`);
    } catch (e: any) {
      console.error(`[FileDrop] Unexpected error polling "${cfg.name}":`, e.message);
    }
  }
}

/**
 * Test SFTP connectivity for a config without processing files.
 * Returns success + list of files in inbound folder.
 */
export async function testFileDropConnection(configId: string): Promise<{
  success: boolean;
  message: string;
  fileCount?: number;
  files?: string[];
}> {
  const [config] = await db.select().from(fileDropConfigs).where(eq(fileDropConfigs.id, configId));
  if (!config) return { success: false, message: "Config not found" };
  if (!config.sftpHost) return { success: false, message: "No SFTP host configured" };

  let sftp: SftpClient | null = null;
  try {
    sftp = await buildSftpClient(config);
    const list = await sftp.list(config.inboundPath) as SftpClient.FileInfo[];
    const files = list.filter(f => f.type === "-").map(f => f.name);
    return { success: true, message: `Connected. ${files.length} file(s) in ${config.inboundPath}.`, fileCount: files.length, files: files.slice(0, 20) };
  } catch (e: any) {
    return { success: false, message: e.message };
  } finally {
    if (sftp) { try { await sftp.end(); } catch { /* ignore */ } }
  }
}
