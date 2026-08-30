/**
 * Hours Report Storage Service — Ticket 2.2
 *
 * Stores generated hours Excel workbooks in Replit Object Storage and records
 * metadata in the `account_documents` table under category "weekly_hours_report".
 *
 * File path in Object Storage:
 *   hours-reports/{customerId}/{weekStart}/Hours_{SafeAccountName}_{weekStart}.xlsx
 *
 * Provides helpers for:
 *   - Storing a generated workbook (upsert: soft-deletes prior report for same week)
 *   - Listing stored reports for an account
 *   - Generating a signed download URL for a stored report
 *   - Checking whether a report already exists for a given week
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { ObjectStorageService } from "../objectStorage";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StoreHoursReportOptions {
  customerId:        string;
  accountName:       string;
  weekStart:         string;   // YYYY-MM-DD
  weekEnd:           string;   // YYYY-MM-DD
  buffer:            Buffer;
  fileName:          string;
  entryCount:        number;
  driverCount:       number;
  totalHours:        number;
  totalOtHours:      number;
  uploadedByUserId?: string | null;
}

export interface StoredHoursReportRecord {
  id:           string;
  customerId:   string;
  weekStart:    string;
  weekEnd:      string;
  fileName:     string;
  fileUrl:      string;
  fileSize:     number;
  entryCount:   number;
  driverCount:  number;
  totalHours:   number;
  totalOtHours: number;
  createdAt:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeAccountName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "_");
}

function buildStorageKey(customerId: string, accountName: string, weekStart: string): string {
  return `hours-reports/${customerId}/${weekStart}/Hours_${safeAccountName(accountName)}_${weekStart}.xlsx`;
}

// ── Store a generated workbook ────────────────────────────────────────────────
export async function storeHoursReport(opts: StoreHoursReportOptions): Promise<StoredHoursReportRecord> {
  const storageKey = buildStorageKey(opts.customerId, opts.accountName, opts.weekStart);
  const storageSvc = new ObjectStorageService();

  await storageSvc.uploadFileWithKey(
    storageKey,
    opts.buffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );

  // Soft-delete any prior record for same account + week
  await db.execute(sql`
    UPDATE account_documents
    SET is_deleted = true, deleted_at = NOW()
    WHERE customer_id = ${opts.customerId}
      AND category    = 'weekly_hours_report'
      AND issue_date  = ${opts.weekStart}::date
      AND is_deleted  = false
  `);

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
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'weekly_hours_report',
       ${`Hours – Week of ${opts.weekStart}`},
       ${opts.weekStart}::date,
       ${JSON.stringify({
         weekEnd:      opts.weekEnd,
         entryCount:   opts.entryCount,
         driverCount:  opts.driverCount,
         totalHours:   opts.totalHours,
         totalOtHours: opts.totalOtHours,
       })},
       NOW(), NOW(), NOW(),
       false,
       ${opts.uploadedByUserId ?? null})
    RETURNING id, file_url, file_size, created_at
  `);

  const row: any = ((insertResult as any).rows ?? insertResult)[0];

  return {
    id:           row.id,
    customerId:   opts.customerId,
    weekStart:    opts.weekStart,
    weekEnd:      opts.weekEnd,
    fileName:     opts.fileName,
    fileUrl:      row.file_url,
    fileSize:     row.file_size,
    entryCount:   opts.entryCount,
    driverCount:  opts.driverCount,
    totalHours:   opts.totalHours,
    totalOtHours: opts.totalOtHours,
    createdAt:    row.created_at,
  };
}

// ── List stored reports for an account ────────────────────────────────────────
export async function listHoursReports(customerId: string, limit = 20): Promise<any[]> {
  const rows = await db.execute(sql`
    SELECT
      id,
      filename      AS "fileName",
      file_url      AS "fileUrl",
      file_size     AS "fileSize",
      issue_date    AS "weekStart",
      notes,
      created_at    AS "createdAt"
    FROM account_documents
    WHERE customer_id = ${customerId}
      AND category    = 'weekly_hours_report'
      AND is_deleted  = false
    ORDER BY issue_date DESC
    LIMIT ${limit}
  `);

  return ((rows as any).rows ?? (rows as any[])).map((r: any) => {
    let meta: any = {};
    try {
      meta = typeof r.notes === "string" ? JSON.parse(r.notes) : (r.notes ?? {});
    } catch { /* ignore */ }
    return {
      id:           r.id,
      weekStart:    typeof r.weekStart === "string" ? r.weekStart : r.weekStart?.toISOString?.()?.split?.("T")?.[0] ?? r.weekStart,
      weekEnd:      meta.weekEnd   ?? null,
      fileName:     r.fileName,
      fileSize:     r.fileSize,
      entryCount:   meta.entryCount   ?? null,
      driverCount:  meta.driverCount  ?? null,
      totalHours:   meta.totalHours   ?? null,
      totalOtHours: meta.totalOtHours ?? null,
      createdAt:    r.createdAt,
    };
  });
}

// ── Get signed download URL ────────────────────────────────────────────────────
export async function getHoursReportDownloadUrl(docId: string, customerId: string): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT file_url
    FROM account_documents
    WHERE id          = ${docId}
      AND customer_id = ${customerId}
      AND category    = 'weekly_hours_report'
      AND is_deleted  = false
    LIMIT 1
  `);
  const row: any = ((rows as any).rows ?? rows)[0];
  if (!row) return null;

  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) return null;

  try {
    const { signObjectURL } = await import("../objectStorage");
    return await signObjectURL({
      bucketName: bucketId,
      objectName: row.file_url,
      method:     "GET",
      ttlSec:     900,
    });
  } catch (err) {
    console.error("[HoursReportStorage] Failed to sign URL:", err);
    return null;
  }
}

// ── Check if report exists for a week ─────────────────────────────────────────
export async function hoursReportExistsForWeek(customerId: string, weekStart: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT id FROM account_documents
    WHERE customer_id = ${customerId}
      AND category    = 'weekly_hours_report'
      AND issue_date  = ${weekStart}::date
      AND is_deleted  = false
    LIMIT 1
  `);
  return ((rows as any).rows ?? (rows as any[])).length > 0;
}
