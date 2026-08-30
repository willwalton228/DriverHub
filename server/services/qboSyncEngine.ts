/**
 * QB Sync Engine — Phase 1
 * Manages the sync queue, audit log, and exceptions for QuickBooks → DriverHub.
 * Wraps the existing qboExpenseSyncService and adds enterprise-grade orchestration.
 */

import { db } from "../db";
import { sql, eq, and, desc, asc, gte, lte, or } from "drizzle-orm";
import {
  qboSyncQueue, qboSyncAuditLog, qboSyncExceptions, qboSyncRuns,
  qboExpenseTransactions,
  InsertQboSyncQueueJob, InsertQboSyncAuditEntry, InsertQboSyncException,
} from "../../shared/schema";

// ── Constants ─────────────────────────────────────────────────────────────────

export const JOB_TYPES = ["expense_sync", "full_sync", "vendor_sync"] as const;
export const JOB_STATUSES = ["pending", "processing", "completed", "failed", "retry", "cancelled"] as const;
export const EXCEPTION_TYPES = [
  "duplicate", "mapping_failure", "missing_vendor", "missing_customer",
  "invalid_reference", "partial_sync", "amount_anomaly", "date_anomaly",
] as const;

// ── Audit logging ─────────────────────────────────────────────────────────────

export async function auditLog(entry: {
  eventType: string;
  entityType?: string;
  entityId?: string;
  syncRunId?: string;
  queueJobId?: string;
  userId?: string;
  message: string;
  details?: Record<string, unknown>;
  severity?: "info" | "warning" | "error" | "critical";
}) {
  try {
    await db.insert(qboSyncAuditLog).values({
      eventType:  entry.eventType,
      entityType: entry.entityType,
      entityId:   entry.entityId,
      syncRunId:  entry.syncRunId,
      queueJobId: entry.queueJobId,
      userId:     entry.userId,
      message:    entry.message,
      details:    entry.details as any,
      severity:   entry.severity ?? "info",
    });
  } catch (err) {
    console.error("[QBO SyncEngine] Failed to write audit log:", err);
  }
}

// ── Queue management ──────────────────────────────────────────────────────────

export async function enqueueJob(job: {
  jobType: typeof JOB_TYPES[number];
  dateRangeStart?: string;
  dateRangeEnd?: string;
  triggeredBy?: string;
  triggeredBySystem?: boolean;
  priority?: number;
}): Promise<string> {
  const [row] = await db.insert(qboSyncQueue).values({
    jobType:           job.jobType,
    status:            "pending",
    priority:          job.priority ?? 5,
    scheduledFor:      new Date(),
    triggeredBy:       job.triggeredBy,
    triggeredBySystem: job.triggeredBySystem ?? false,
    dateRangeStart:    job.dateRangeStart,
    dateRangeEnd:      job.dateRangeEnd,
    attempts:          0,
    maxAttempts:       3,
  }).returning({ id: qboSyncQueue.id });

  await auditLog({
    eventType:  "job_queued",
    entityType: "queue_job",
    entityId:   row.id,
    queueJobId: row.id,
    userId:     job.triggeredBy,
    message:    `Sync job queued: ${job.jobType}`,
    details:    { jobType: job.jobType, dateRangeStart: job.dateRangeStart, dateRangeEnd: job.dateRangeEnd },
  });

  return row.id;
}

export async function getQueueStatus() {
  const result = await db.execute(sql`
    SELECT
      status,
      COUNT(*)::int AS count,
      MAX(created_at) AS latest
    FROM qbo_sync_queue
    GROUP BY status
    ORDER BY status
  `);
  return (result.rows ?? result) as Array<{ status: string; count: number; latest: string }>;
}

export async function getPendingJobs(limit = 10) {
  return db.select().from(qboSyncQueue)
    .where(or(eq(qboSyncQueue.status, "pending"), eq(qboSyncQueue.status, "retry")))
    .orderBy(asc(qboSyncQueue.priority), asc(qboSyncQueue.scheduledFor))
    .limit(limit);
}

export async function getQueueJobs(opts?: { limit?: number; offset?: number; status?: string }) {
  const conditions = [];
  if (opts?.status) conditions.push(eq(qboSyncQueue.status, opts.status as any));
  return db.select().from(qboSyncQueue)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(qboSyncQueue.createdAt))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);
}

export async function cancelJob(jobId: string, userId: string) {
  await db.update(qboSyncQueue)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(qboSyncQueue.id, jobId));
  await auditLog({
    eventType: "job_cancelled", entityType: "queue_job", entityId: jobId,
    queueJobId: jobId, userId,
    message: `Sync job ${jobId} cancelled by user`,
  });
}

export async function retryJob(jobId: string, userId: string) {
  const [job] = await db.select().from(qboSyncQueue).where(eq(qboSyncQueue.id, jobId));
  if (!job) throw new Error("Job not found");
  if (job.attempts >= (job.maxAttempts ?? 3)) throw new Error("Max retry attempts reached");

  await db.update(qboSyncQueue)
    .set({ status: "retry", errorMessage: null, updatedAt: new Date() })
    .where(eq(qboSyncQueue.id, jobId));
  await auditLog({
    eventType: "retry_attempted", entityType: "queue_job", entityId: jobId,
    queueJobId: jobId, userId,
    message: `Retry requested for job ${jobId} (attempt ${(job.attempts ?? 0) + 1}/${job.maxAttempts ?? 3})`,
  });
  return job;
}

// ── Exception management ──────────────────────────────────────────────────────

export async function recordException(exc: {
  exceptionType: string;
  entityType?: string;
  qboTxnId?: string;
  qboTxnType?: string;
  vendorName?: string;
  totalAmount?: string;
  txnDate?: string;
  description: string;
  syncRunId?: string;
  queueJobId?: string;
  rawPayload?: Record<string, unknown>;
}): Promise<string> {
  const [row] = await db.insert(qboSyncExceptions).values({
    exceptionType:    exc.exceptionType,
    entityType:       exc.entityType,
    qboTxnId:         exc.qboTxnId,
    qboTxnType:       exc.qboTxnType,
    vendorName:       exc.vendorName,
    totalAmount:      exc.totalAmount,
    txnDate:          exc.txnDate,
    description:      exc.description,
    rawPayload:       exc.rawPayload as any,
    resolutionStatus: "open",
    syncRunId:        exc.syncRunId,
    queueJobId:       exc.queueJobId,
  }).returning({ id: qboSyncExceptions.id });

  await auditLog({
    eventType: "exception_detected", entityType: exc.entityType ?? "transaction",
    entityId: exc.qboTxnId, syncRunId: exc.syncRunId,
    message: `Exception detected: ${exc.exceptionType} — ${exc.description}`,
    severity: "warning",
  });

  return row.id;
}

export async function getExceptions(opts?: {
  status?: string; limit?: number; offset?: number; syncRunId?: string;
}) {
  const conditions = [];
  if (opts?.status)    conditions.push(eq(qboSyncExceptions.resolutionStatus, opts.status as any));
  if (opts?.syncRunId) conditions.push(eq(qboSyncExceptions.syncRunId, opts.syncRunId));

  return db.select().from(qboSyncExceptions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(qboSyncExceptions.createdAt))
    .limit(opts?.limit ?? 100)
    .offset(opts?.offset ?? 0);
}

export async function resolveException(id: string, userId: string, note?: string) {
  await db.update(qboSyncExceptions)
    .set({ resolutionStatus: "resolved", resolvedBy: userId, resolvedAt: new Date(), resolutionNote: note, updatedAt: new Date() })
    .where(eq(qboSyncExceptions.id, id));
  await auditLog({
    eventType: "exception_resolved", entityType: "exception", entityId: id,
    userId, message: `Exception ${id} marked resolved`,
    details: note ? { note } : undefined,
  });
}

export async function ignoreException(id: string, userId: string, note?: string) {
  await db.update(qboSyncExceptions)
    .set({ resolutionStatus: "ignored", resolvedBy: userId, resolvedAt: new Date(), resolutionNote: note, updatedAt: new Date() })
    .where(eq(qboSyncExceptions.id, id));
  await auditLog({
    eventType: "exception_resolved", entityType: "exception", entityId: id,
    userId, message: `Exception ${id} marked ignored`,
    severity: "info",
  });
}

// ── Audit log queries ─────────────────────────────────────────────────────────

export async function getAuditLog(opts?: {
  limit?: number; offset?: number;
  syncRunId?: string; severity?: string;
  since?: string;
}) {
  const conditions = [];
  if (opts?.syncRunId) conditions.push(eq(qboSyncAuditLog.syncRunId, opts.syncRunId));
  if (opts?.severity)  conditions.push(eq(qboSyncAuditLog.severity, opts.severity as any));
  if (opts?.since)     conditions.push(gte(qboSyncAuditLog.createdAt, new Date(opts.since)));

  return db.select().from(qboSyncAuditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(qboSyncAuditLog.createdAt))
    .limit(opts?.limit ?? 100)
    .offset(opts?.offset ?? 0);
}

// ── Sync history ──────────────────────────────────────────────────────────────

export async function getSyncHistory(limit = 20) {
  const result = await db.execute(sql`
    SELECT
      id, sync_type, status, started_at, completed_at,
      date_range_start::text, date_range_end::text,
      records_fetched, records_upserted, error_message,
      EXTRACT(EPOCH FROM (completed_at - started_at))::int AS duration_seconds
    FROM qbo_sync_runs
    ORDER BY started_at DESC
    LIMIT ${limit}
  `);
  return (result.rows ?? result) as any[];
}

// ── Health summary ────────────────────────────────────────────────────────────

export async function getSyncHealthSummary() {
  const [syncStats, queueStats, exceptionStats, lastRun] = await Promise.all([
    // Last 7 days sync run counts by status
    db.execute(sql`
      SELECT status, COUNT(*)::int AS count
      FROM qbo_sync_runs
      WHERE started_at >= NOW() - INTERVAL '7 days'
      GROUP BY status
    `),
    // Queue summary
    db.execute(sql`
      SELECT status, COUNT(*)::int AS count
      FROM qbo_sync_queue
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY status
    `),
    // Open exceptions
    db.execute(sql`
      SELECT exception_type, COUNT(*)::int AS count
      FROM qbo_sync_exceptions
      WHERE resolution_status = 'open'
      GROUP BY exception_type
      ORDER BY count DESC
    `),
    // Last successful run
    db.execute(sql`
      SELECT id, started_at, completed_at, records_fetched, records_upserted
      FROM qbo_sync_runs
      WHERE status = 'success'
      ORDER BY started_at DESC
      LIMIT 1
    `),
  ]);

  const syncStatusMap: Record<string, number> = {};
  for (const r of (syncStats.rows ?? syncStats) as any[]) syncStatusMap[r.status] = r.count;

  const queueStatusMap: Record<string, number> = {};
  for (const r of (queueStats.rows ?? queueStats) as any[]) queueStatusMap[r.status] = r.count;

  const openExceptions = (exceptionStats.rows ?? exceptionStats) as any[];
  const totalOpenExceptions = openExceptions.reduce((s: number, r: any) => s + r.count, 0);

  const lastSuccess = ((lastRun.rows ?? lastRun) as any[])[0] ?? null;

  return {
    last7Days: { syncRuns: syncStatusMap },
    queue: queueStatusMap,
    exceptions: { total: totalOpenExceptions, byType: openExceptions },
    lastSuccessfulRun: lastSuccess,
  };
}

// ── Orchestrated sync run ─────────────────────────────────────────────────────

export async function runSyncJob(opts: {
  jobType: string;
  since?: string;
  until?: string;
  triggeredBy?: string;
  triggeredBySystem?: boolean;
}): Promise<{ jobId: string; syncRunId?: string; status: string; message: string }> {
  const jobId = await enqueueJob({
    jobType: (opts.jobType as any) || "expense_sync",
    dateRangeStart: opts.since,
    dateRangeEnd:   opts.until,
    triggeredBy:    opts.triggeredBy,
    triggeredBySystem: opts.triggeredBySystem,
    priority: 1,
  });

  // Mark job as processing immediately
  await db.update(qboSyncQueue)
    .set({ status: "processing", startedAt: new Date(), attempts: 1, updatedAt: new Date() })
    .where(eq(qboSyncQueue.id, jobId));

  await auditLog({
    eventType: "sync_started", entityType: "queue_job", entityId: jobId,
    queueJobId: jobId, userId: opts.triggeredBy,
    message: `${opts.jobType} started`,
    details: { since: opts.since, until: opts.until },
  });

  try {
    const jobType = opts.jobType ?? "expense_sync";

    // ── expense_sync / vendor_sync → existing expense pipeline ───────────────
    if (jobType === "expense_sync" || jobType === "vendor_sync") {
      const { runQboExpenseSync } = await import("./qboExpenseSyncService");
      const result = await runQboExpenseSync({
        since: opts.since,
        until: opts.until,
        triggeredBy: opts.triggeredBy,
      });

      const status = result.status === "success" || result.status === "partial" ? "completed" : "failed";
      await db.update(qboSyncQueue).set({
        status,
        completedAt: new Date(),
        syncRunId: result.syncRunId,
        resultSummary: { fetched: result.recordsFetched, upserted: result.recordsUpserted } as any,
        errorMessage: result.error ?? null,
        updatedAt: new Date(),
      }).where(eq(qboSyncQueue.id, jobId));

      await auditLog({
        eventType: status === "completed" ? "sync_completed" : "sync_failed",
        entityType: "sync_run", entityId: result.syncRunId,
        syncRunId: result.syncRunId, queueJobId: jobId, userId: opts.triggeredBy,
        message: `${jobType} ${status}: ${result.recordsFetched} fetched, ${result.recordsUpserted} upserted`,
        details: { ...result },
        severity: status === "failed" ? "error" : "info",
      });

      if (result.syncRunId) await detectAndRecordExceptions(result.syncRunId, jobId);
      return { jobId, syncRunId: result.syncRunId, status, message: `Sync ${status}` };
    }

    // ── customer_sync → import QB customers only ──────────────────────────────
    if (jobType === "customer_sync") {
      const { importCustomers } = await import("./qboImportService");
      const result = await importCustomers();
      const status = result.errors.length === 0 ? "completed" : result.upserted > 0 ? "completed" : "failed";
      await db.update(qboSyncQueue).set({
        status, completedAt: new Date(),
        resultSummary: result as any,
        errorMessage: result.errors.length > 0 ? result.errors.slice(0, 3).join("; ") : null,
        updatedAt: new Date(),
      }).where(eq(qboSyncQueue.id, jobId));
      await auditLog({
        eventType: status === "completed" ? "sync_completed" : "sync_failed",
        queueJobId: jobId, userId: opts.triggeredBy,
        message: `customer_sync ${status}: ${result.fetched} fetched, ${result.upserted} upserted, ${result.skipped} skipped`,
        details: result as any,
        severity: status === "failed" ? "error" : "info",
      });
      return { jobId, status, message: `Customer sync ${status}: ${result.upserted} upserted` };
    }

    // ── full_sync → expenses + customers + AR transactions + daily snapshot ──
    if (jobType === "full_sync") {
      const { runQboExpenseSync } = await import("./qboExpenseSyncService");
      const { importCustomers, importARTransactions, generateDailySnapshot } = await import("./qboImportService");

      const since = opts.since ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const until = opts.until ?? new Date().toISOString().slice(0, 10);

      let totalFetched = 0;
      let totalUpserted = 0;
      const allErrors: string[] = [];

      // Step 1: Expense sync (AP side)
      try {
        const expResult = await runQboExpenseSync({ since, until, triggeredBy: opts.triggeredBy });
        totalFetched  += expResult.recordsFetched ?? 0;
        totalUpserted += expResult.recordsUpserted ?? 0;
        if (expResult.error) allErrors.push(`Expenses: ${expResult.error}`);
        if (expResult.syncRunId) await detectAndRecordExceptions(expResult.syncRunId, jobId);
      } catch (err: any) {
        allErrors.push(`Expense sync error: ${err.message}`);
      }

      // Step 2: Customer sync
      try {
        const custResult = await importCustomers();
        totalFetched  += custResult.fetched;
        totalUpserted += custResult.upserted;
        allErrors.push(...custResult.errors);
      } catch (err: any) {
        allErrors.push(`Customer sync error: ${err.message}`);
      }

      // Step 3: AR transactions (invoices, payments, credit memos)
      try {
        const arResult = await importARTransactions(since, until);
        totalFetched  += arResult.fetched;
        totalUpserted += arResult.upserted;
        allErrors.push(...arResult.errors);
      } catch (err: any) {
        allErrors.push(`AR sync error: ${err.message}`);
      }

      // Step 4: Generate daily snapshot
      try {
        await generateDailySnapshot(until);
      } catch (err: any) {
        allErrors.push(`Snapshot error: ${err.message}`);
      }

      const status = allErrors.length === 0 ? "completed" : totalUpserted > 0 ? "completed" : "failed";
      await db.update(qboSyncQueue).set({
        status, completedAt: new Date(),
        resultSummary: { fetched: totalFetched, upserted: totalUpserted, errors: allErrors.length } as any,
        errorMessage: allErrors.length > 0 ? allErrors.slice(0, 5).join("; ") : null,
        updatedAt: new Date(),
      }).where(eq(qboSyncQueue.id, jobId));

      await auditLog({
        eventType: status === "completed" ? "sync_completed" : "sync_failed",
        queueJobId: jobId, userId: opts.triggeredBy,
        message: `full_sync ${status}: ${totalFetched} fetched, ${totalUpserted} upserted, ${allErrors.length} errors`,
        details: { totalFetched, totalUpserted, errors: allErrors } as any,
        severity: allErrors.length > 0 ? "warning" : "info",
      });

      return { jobId, status, message: `Full sync ${status}: ${totalUpserted} records upserted` };
    }

    // Unknown job type fallback
    return { jobId, status: "failed", message: `Unknown job type: ${opts.jobType}` };
  } catch (err: any) {
    await db.update(qboSyncQueue).set({
      status: "failed", completedAt: new Date(),
      errorMessage: err.message, updatedAt: new Date(),
    }).where(eq(qboSyncQueue.id, jobId));

    await auditLog({
      eventType: "sync_failed", queueJobId: jobId, userId: opts.triggeredBy,
      message: `Sync failed: ${err.message}`,
      severity: "error",
      details: { error: err.message },
    });

    return { jobId, status: "failed", message: err.message };
  }
}

// ── Exception auto-detection ──────────────────────────────────────────────────

async function detectAndRecordExceptions(syncRunId: string, jobId?: string) {
  try {
    // Detect large transactions (>$10k) as anomalies worth flagging
    const largeResult = await db.execute(sql`
      SELECT qbo_txn_id, qbo_txn_type, txn_date::text, total_amount::numeric, vendor_name
      FROM qbo_expense_transactions
      WHERE sync_run_id = ${syncRunId}
        AND total_amount >= 10000
      LIMIT 20
    `);
    const large = (largeResult.rows ?? largeResult) as any[];

    for (const row of large) {
      await recordException({
        exceptionType: "amount_anomaly",
        entityType: "transaction",
        qboTxnId: row.qbo_txn_id,
        qboTxnType: row.qbo_txn_type,
        vendorName: row.vendor_name,
        totalAmount: String(row.total_amount),
        txnDate: row.txn_date,
        description: `Transaction exceeds $10,000 threshold: $${parseFloat(String(row.total_amount)).toLocaleString()}`,
        syncRunId,
        queueJobId: jobId,
      });
    }

    // Detect transactions with no vendor name
    const noVendorResult = await db.execute(sql`
      SELECT qbo_txn_id, qbo_txn_type, txn_date::text, total_amount::numeric
      FROM qbo_expense_transactions
      WHERE sync_run_id = ${syncRunId}
        AND (vendor_name IS NULL OR vendor_name = '')
        AND total_amount > 0
      LIMIT 20
    `);
    const noVendor = (noVendorResult.rows ?? noVendorResult) as any[];

    for (const row of noVendor) {
      await recordException({
        exceptionType: "missing_vendor",
        entityType: "transaction",
        qboTxnId: row.qbo_txn_id,
        qboTxnType: row.qbo_txn_type,
        totalAmount: String(row.total_amount),
        txnDate: row.txn_date,
        description: `Transaction has no vendor/payee assigned`,
        syncRunId,
        queueJobId: jobId,
      });
    }
  } catch (err) {
    console.error("[QBO SyncEngine] Exception auto-detection failed:", err);
  }
}
