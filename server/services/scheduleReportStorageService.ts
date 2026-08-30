/**
 * Schedule Report Storage Service — Ticket 2.1
 *
 * Stores generated schedule PDFs in Replit Object Storage and records
 * metadata in the `account_documents` table under category "weekly_schedule_report".
 *
 * File path in Object Storage:
 *   schedule-reports/{customerId}/{weekStart}/Schedule_{SafeAccountName}_{weekStart}.pdf
 *
 * Provides helpers for:
 *   - Storing a generated PDF (upsert: overwrites prior report for same week)
 *   - Listing stored reports for an account
 *   - Generating a signed download URL for a stored report
 *   - Checking whether a report already exists for a given week
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { ObjectStorageService } from "../objectStorage";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StoreReportOptions {
  customerId:  string;
  accountName: string;
  weekStart:   string;   // YYYY-MM-DD
  weekEnd:     string;   // YYYY-MM-DD
  buffer:      Buffer;
  fileName:    string;
  shiftCount:  number;
  driverCount: number;
  uploadedByUserId?: string;
}

export interface StoredReportRecord {
  id:          string;
  customerId:  string;
  weekStart:   string;
  weekEnd:     string;
  fileName:    string;
  fileUrl:     string;
  fileSize:    number;
  shiftCount:  number;
  driverCount: number;
  createdAt:   string;
  downloadUrl?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeAccountName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "_");
}

function buildStorageKey(customerId: string, accountName: string, weekStart: string): string {
  return `schedule-reports/${customerId}/${weekStart}/Schedule_${safeAccountName(accountName)}_${weekStart}.pdf`;
}

// ── Store a generated PDF ─────────────────────────────────────────────────────
export async function storeScheduleReport(opts: StoreReportOptions): Promise<StoredReportRecord> {
  const storageKey = buildStorageKey(opts.customerId, opts.accountName, opts.weekStart);
  const storageSvc = new ObjectStorageService();

  // Upload to Object Storage (overwrites if key already exists)
  await storageSvc.uploadFileWithKey(storageKey, opts.buffer, "application/pdf");

  // Soft-delete any existing record for same account + week
  await db.execute(sql`
    UPDATE account_documents
    SET is_deleted = true, deleted_at = NOW()
    WHERE customer_id = ${opts.customerId}
      AND category    = 'weekly_schedule_report'
      AND issue_date  = ${opts.weekStart}::date
      AND is_deleted  = false
  `);

  // Insert new record in account_documents
  const insertResult = await db.execute(sql`
    INSERT INTO account_documents
      (customer_id, filename, original_filename, file_url, file_size, mime_type,
       category, label, issue_date, notes, uploaded_at, created_at, updated_at,
       is_deleted, uploaded_by_user_id)
    VALUES
      (${opts.customerId},
       ${opts.fileName},
       ${opts.fileName},
       ${storageKey},
       ${opts.buffer.length},
       'application/pdf',
       'weekly_schedule_report',
       ${`Week of ${opts.weekStart}`},
       ${opts.weekStart}::date,
       ${JSON.stringify({ weekEnd: opts.weekEnd, shiftCount: opts.shiftCount, driverCount: opts.driverCount })},
       NOW(), NOW(), NOW(),
       false,
       ${opts.uploadedByUserId ?? null})
    RETURNING id, file_url, file_size, created_at
  `);

  const row: any = ((insertResult as any).rows ?? insertResult)[0];

  return {
    id:          row.id,
    customerId:  opts.customerId,
    weekStart:   opts.weekStart,
    weekEnd:     opts.weekEnd,
    fileName:    opts.fileName,
    fileUrl:     row.file_url,
    fileSize:    row.file_size,
    shiftCount:  opts.shiftCount,
    driverCount: opts.driverCount,
    createdAt:   row.created_at,
  };
}

// ── List stored reports for an account ────────────────────────────────────────
export async function listScheduleReports(customerId: string, limit = 20): Promise<StoredReportRecord[]> {
  const rows = await db.execute(sql`
    SELECT
      id,
      customer_id,
      filename,
      file_url,
      file_size,
      issue_date::text          AS week_start,
      notes,
      created_at::text
    FROM account_documents
    WHERE customer_id = ${customerId}
      AND category    = 'weekly_schedule_report'
      AND is_deleted  = false
    ORDER BY issue_date DESC
    LIMIT ${limit}
  `);

  const rawRows: any[] = (rows as any).rows ?? (rows as any);
  return rawRows.map(r => {
    let parsed: any = {};
    try { parsed = JSON.parse(r.notes ?? "{}"); } catch {}
    return {
      id:          r.id,
      customerId:  r.customer_id,
      weekStart:   r.week_start?.slice(0, 10) ?? "",
      weekEnd:     parsed.weekEnd ?? "",
      fileName:    r.filename,
      fileUrl:     r.file_url,
      fileSize:    r.file_size ?? 0,
      shiftCount:  parsed.shiftCount ?? 0,
      driverCount: parsed.driverCount ?? 0,
      createdAt:   r.created_at,
    };
  });
}

// ── Get signed download URL ────────────────────────────────────────────────────
export async function getScheduleReportDownloadUrl(docId: string, customerId: string): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT file_url
    FROM account_documents
    WHERE id          = ${docId}
      AND customer_id = ${customerId}
      AND category    = 'weekly_schedule_report'
      AND is_deleted  = false
    LIMIT 1
  `);
  const row: any = ((rows as any).rows ?? rows)[0];
  if (!row) return null;

  const { signObjectURL } = await import("../objectStorage");
  const fileUrl: string = row.file_url;

  // Parse bucket + object name from the storage key
  // The key is in format: "schedule-reports/..."
  // Use the bucket ID to build the full path
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) return null;

  try {
    const url = await signObjectURL({
      bucketName: bucketId,
      objectName: fileUrl,
      method:     "GET",
      ttlSec:     900,
    });
    return url;
  } catch (err) {
    console.error("[ScheduleReportStorage] Failed to sign URL:", err);
    return null;
  }
}

// ── Check if report exists for a week ─────────────────────────────────────────
export async function scheduleReportExistsForWeek(customerId: string, weekStart: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT id FROM account_documents
    WHERE customer_id = ${customerId}
      AND category    = 'weekly_schedule_report'
      AND issue_date  = ${weekStart}::date
      AND is_deleted  = false
    LIMIT 1
  `);
  return ((rows as any).rows ?? (rows as any)).length > 0;
}
