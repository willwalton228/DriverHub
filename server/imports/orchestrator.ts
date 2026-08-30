/**
 * Import Orchestrator — glues an ImportSourceAdapter to the validation pipeline.
 *
 * stageBatch():
 *   1. Calls adapter.fetch() to get rows from any source (file, SQL, HTTP …)
 *   2. Creates the data_import_batches record
 *   3. Optionally upserts the import period
 *   4. Runs the full validation pipeline → stages rows to data_import_staged_rows
 *   5. Updates batch status
 *   6. Returns the completed batch record + validation result
 *
 * The /import, /reprocess, and /validate endpoints in dataImportsRoutes.ts
 * are completely unchanged — they consume the staged rows produced here.
 *
 * Future source types (REST APIs, payroll exports, EDI feeds …) need only:
 *   1. A new adapter class that implements ImportSourceAdapter
 *   2. A new case in adapters/index.ts
 *   3. A source config row in import_source_configs
 *   Nothing else changes.
 */
import { randomUUID } from "crypto";
import { db } from "../db";
import { dataImportBatches, importPeriods } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { runValidation, type FullValidationResult } from "./pipeline";
import type { ImportSourceAdapter, ImportSourceConfig, FetchResult } from "./adapters/types";

// ── Period upsert (same logic as in dataImportsRoutes.ts) ─────────────────────

export async function upsertPeriod(
  periodStart: string,
  periodEnd: string,
  importType: string,
  sourceSystemKey: string,
  batchId: string,
): Promise<string> {
  const existing = await db
    .select({ id: importPeriods.id, count: importPeriods.receivedBatchCount })
    .from(importPeriods)
    .where(and(
      eq(importPeriods.periodStart, periodStart),
      eq(importPeriods.periodEnd,   periodEnd),
      eq(importPeriods.importType,  importType),
      eq(importPeriods.sourceSystemKey, sourceSystemKey),
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(importPeriods)
      .set({ receivedBatchCount: (existing[0].count ?? 0) + 1, latestBatchId: batchId, updatedAt: new Date() })
      .where(eq(importPeriods.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await db.insert(importPeriods)
    .values({ periodStart, periodEnd, importType, sourceSystemKey, receivedBatchCount: 1, latestBatchId: batchId } as any)
    .returning({ id: importPeriods.id });
  return created.id;
}

// ── Batch parameters ──────────────────────────────────────────────────────────

export interface StageBatchParams {
  rows:                  Record<string, unknown>[];
  headers:               string[];
  sourceLabel:           string;       // from FetchResult.sourceLabel
  importType:            string;
  sourceSystemKey:       string;
  batchMode:             "supplement" | "correction" | "reprocess";
  importedByUserId:      string;
  /** Source config id — stored for audit trail; optional for file uploads. */
  sourceConfigId?:       string;
  reportingPeriodStart?: string;
  reportingPeriodEnd?:   string;
  notes?:                string;
}

export interface StageBatchResult {
  batchId:          string;
  batch:            any;
  validationResult: FullValidationResult | null;
  status:           string;
}

// ── Core orchestration ────────────────────────────────────────────────────────

/**
 * Create a batch record, validate all rows, stage them, and return the batch.
 * This is the shared inner function used by both the file-upload path and the
 * adapter-sync path.  Neither caller needs to know how rows were obtained.
 */
export async function stageBatch(params: StageBatchParams): Promise<StageBatchResult> {
  const {
    rows, headers, sourceLabel, importType, sourceSystemKey,
    batchMode, importedByUserId, sourceConfigId,
    reportingPeriodStart, reportingPeriodEnd, notes,
  } = params;

  if (rows.length === 0) {
    throw new Error("stageBatch: source returned 0 rows — nothing to import");
  }

  const batchId = randomUUID();

  // Create batch record
  await db.insert(dataImportBatches).values({
    id:                   batchId,
    importType,
    sourceSystemKey,
    batchMode,
    fileName:             sourceLabel,
    fileSizeBytes:        0,
    fileStorageKey:       null,
    fileHash:             null,
    reportingPeriodStart: reportingPeriodStart ?? null,
    reportingPeriodEnd:   reportingPeriodEnd   ?? null,
    importedByUserId,
    recordsRead:          rows.length,
    status:               "validating",
    columnHeaders:        headers,
    fieldMapping:         {},
    notes:                notes ?? `Synced via ${sourceConfigId ? `source config ${sourceConfigId}` : "adapter"}`,
  } as any);

  // Optionally upsert period
  let resolvedPeriodId: string | null = null;
  if (reportingPeriodStart && reportingPeriodEnd) {
    resolvedPeriodId = await upsertPeriod(
      reportingPeriodStart, reportingPeriodEnd, importType, sourceSystemKey, batchId,
    ).catch(() => null);
    if (resolvedPeriodId) {
      await db.update(dataImportBatches)
        .set({ periodId: resolvedPeriodId })
        .where(eq(dataImportBatches.id, batchId));
    }
  }

  // Run validation pipeline (unchanged — same function as file-upload path)
  let newStatus       = "ready_for_import";
  let validationResult: FullValidationResult | null = null;
  let validationErrorCount = 0;
  try {
    const v = await runValidation(batchId, rows, importType, sourceSystemKey, resolvedPeriodId, batchMode);
    validationErrorCount = v.errorRows;
    validationResult     = v;
    if (v.errorRows > 0 && v.errorRows === v.totalRows) newStatus = "failed";
  } catch (e: any) {
    newStatus       = "failed";
    validationResult = null;
    console.error("[Orchestrator] runValidation failed:", e.message);
  }

  await db.update(dataImportBatches)
    .set({ status: newStatus, validationResult, validationErrorCount, validatedAt: new Date(), updatedAt: new Date() })
    .where(eq(dataImportBatches.id, batchId));

  const [batch] = await db.select().from(dataImportBatches).where(eq(dataImportBatches.id, batchId));

  return { batchId, batch, validationResult, status: newStatus };
}

// ── Adapter-driven entry point ────────────────────────────────────────────────

/**
 * Fetch rows via an adapter and hand them to stageBatch().
 * Called by the /sync endpoint in importSourceConfigRoutes.ts.
 */
export async function syncFromAdapter(
  adapter:    ImportSourceAdapter,
  config:     ImportSourceConfig,
  params:     Record<string, string>,
  userId:     string,
  overrides?: Partial<Pick<StageBatchParams, "batchMode" | "reportingPeriodStart" | "reportingPeriodEnd" | "notes">>,
): Promise<StageBatchResult & { fetchResult: FetchResult }> {
  const fetchResult = await adapter.fetch(config, params);

  const result = await stageBatch({
    rows:                  fetchResult.rows,
    headers:               fetchResult.headers,
    sourceLabel:           fetchResult.sourceLabel,
    importType:            config.importType,
    sourceSystemKey:       config.sourceSystemKey,
    batchMode:             overrides?.batchMode ?? config.batchMode,
    importedByUserId:      userId,
    sourceConfigId:        config.id,
    reportingPeriodStart:  overrides?.reportingPeriodStart,
    reportingPeriodEnd:    overrides?.reportingPeriodEnd,
    notes:                 overrides?.notes,
  });

  return { ...result, fetchResult };
}
