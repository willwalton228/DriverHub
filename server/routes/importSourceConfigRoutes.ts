/**
 * Import Source Config — CRUD and sync trigger for import_source_configs.
 *
 * Mounts at: /api/import-source-configs
 *
 * Endpoints:
 *   GET    /                     list all configs
 *   GET    /:id                  get one config
 *   POST   /                     create a config
 *   PATCH  /:id                  update a config
 *   DELETE /:id                  soft-delete (sets is_active = false)
 *   POST   /:id/sync             trigger a sync via the appropriate adapter
 *   POST   /test-connection      validate adapter params without importing
 *
 * The /sync endpoint is the primary entry point for the SQL Server (and future)
 * source integrations.  It:
 *   1. Loads the source config by id
 *   2. Resolves the adapter via the factory (adapters/index.ts)
 *   3. Passes runtime params (dateFrom, dateTo …) to the adapter
 *   4. Calls syncFromAdapter() → stageBatch() → runValidation()
 *      (same validation pipeline as the file-upload path)
 *   5. Returns the created batch record (same shape as POST /upload)
 *
 * After /sync the caller uses the existing /api/data-imports/:id/import
 * endpoint to commit the staged rows to the domain tables.
 */
import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { importSourceConfigs } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../replitAuth";
import { getAdapter } from "../imports/adapters";
import { syncFromAdapter } from "../imports/orchestrator";
import type { ImportSourceConfig } from "../imports/adapters/types";

const router = Router();
router.use(isAuthenticated);

function getUserId(req: any): string {
  return req.user?.claims?.sub ?? req.user?.id ?? "system";
}

// ── GET / — list all configs ───────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(importSourceConfigs)
      .orderBy(importSourceConfigs.importType, importSourceConfigs.name);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /:id — single config ───────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(importSourceConfigs)
      .where(eq(importSourceConfigs.id, req.params.id));
    if (!row) return res.status(404).json({ error: "Source config not found" });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST / — create config ─────────────────────────────────────────────────────
router.post("/", async (req: any, res) => {
  try {
    const {
      name, description, importType, sourceSystemKey,
      configType, connectionConfig = {}, fieldMap = {},
      batchMode = "supplement", defaultPeriodDays = 30,
      scheduleCron, isActive = true,
    } = req.body;

    if (!name || !importType || !sourceSystemKey || !configType) {
      return res.status(400).json({ error: "name, importType, sourceSystemKey, and configType are required" });
    }
    const validConfigTypes = ["excel_csv", "sql_server", "csv_url", "api"];
    if (!validConfigTypes.includes(configType)) {
      return res.status(400).json({ error: `configType must be one of: ${validConfigTypes.join(", ")}` });
    }

    const [created] = await db.insert(importSourceConfigs).values({
      name, description: description ?? null,
      importType, sourceSystemKey, configType,
      connectionConfig, fieldMap,
      batchMode, defaultPeriodDays,
      scheduleCron: scheduleCron ?? null,
      isActive,
      createdBy: getUserId(req),
    } as any).returning();

    res.status(201).json(created);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /:id — update config ─────────────────────────────────────────────────
router.patch("/:id", async (req: any, res) => {
  try {
    const [existing] = await db.select().from(importSourceConfigs).where(eq(importSourceConfigs.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Source config not found" });

    const allowed = [
      "name", "description", "connectionConfig", "fieldMap",
      "batchMode", "defaultPeriodDays", "scheduleCron", "isActive",
    ];
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const [updated] = await db
      .update(importSourceConfigs)
      .set(updates as any)
      .where(eq(importSourceConfigs.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /:id — soft delete ──────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const [existing] = await db.select().from(importSourceConfigs).where(eq(importSourceConfigs.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Source config not found" });

    await db.update(importSourceConfigs)
      .set({ isActive: false, updatedAt: new Date() } as any)
      .where(eq(importSourceConfigs.id, req.params.id));

    res.json({ success: true, id: req.params.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /:id/sync — trigger adapter sync ─────────────────────────────────────
/**
 * Body (all optional):
 *   dateFrom            — e.g. "2026-07-01"   (defaults to today - defaultPeriodDays)
 *   dateTo              — e.g. "2026-07-31"   (defaults to today)
 *   batchMode           — override the config's default batch mode
 *   reportingPeriodStart / reportingPeriodEnd  — explicit period for the batch
 *   notes               — free-text note on the batch
 *   params              — additional adapter-specific params passed to adapter.fetch()
 *
 * Returns the created data_import_batches record (same shape as POST /upload).
 * Use POST /api/data-imports/:batchId/import to commit staged rows.
 */
router.post("/:id/sync", async (req: any, res) => {
  try {
    const [configRow] = await db
      .select()
      .from(importSourceConfigs)
      .where(eq(importSourceConfigs.id, req.params.id));

    if (!configRow) return res.status(404).json({ error: "Source config not found" });
    if (!configRow.isActive) return res.status(400).json({ error: "Source config is inactive" });

    // Build runtime params: dateFrom / dateTo with sensible defaults
    const periodDays = configRow.defaultPeriodDays ?? 30;
    const today = new Date().toISOString().slice(0, 10);
    const defaultFrom = new Date(Date.now() - periodDays * 86400_000).toISOString().slice(0, 10);

    const {
      dateFrom = defaultFrom,
      dateTo   = today,
      batchMode,
      reportingPeriodStart,
      reportingPeriodEnd,
      notes,
      params: extraParams = {},
    } = req.body ?? {};

    // Runtime params passed to adapter.fetch()
    const adapterParams: Record<string, string> = {
      dateFrom,
      dateTo,
      ...extraParams,
    };

    // Build the ImportSourceConfig the adapter needs
    const config: ImportSourceConfig = {
      id:               configRow.id,
      name:             configRow.name,
      configType:       configRow.configType as any,
      importType:       configRow.importType,
      sourceSystemKey:  configRow.sourceSystemKey,
      connectionConfig: (configRow.connectionConfig as any) ?? {},
      fieldMap:         (configRow.fieldMap as any) ?? {},
      batchMode:        (configRow.batchMode as any) ?? "supplement",
    };

    const adapter = getAdapter(config);
    const userId  = getUserId(req);

    const { batch, fetchResult, validationResult, status } = await syncFromAdapter(
      adapter, config, adapterParams, userId,
      { batchMode, reportingPeriodStart, reportingPeriodEnd, notes },
    );

    // Update last_synced_at on the config
    await db.update(importSourceConfigs).set({
      lastSyncedAt:     new Date(),
      lastBatchId:      batch.id,
      lastSyncRowCount: fetchResult.rowCount,
      lastSyncStatus:   status,
      updatedAt:        new Date(),
    } as any).where(eq(importSourceConfigs.id, req.params.id));

    res.status(201).json({
      batch,
      fetchResult: { rowCount: fetchResult.rowCount, sourceLabel: fetchResult.sourceLabel },
      validationResult,
    });
  } catch (e: any) {
    console.error("[ImportSourceConfigs] POST /:id/sync error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /test-connection — validate without importing ────────────────────────
/**
 * Validates that an adapter can connect and fetch at least one row.
 * Does NOT create any batch or stage any rows.
 * Useful for the source config UI before saving.
 *
 * Body: { configType, connectionConfig, fieldMap, importType, sourceSystemKey,
 *         dateFrom?, dateTo? }
 */
router.post("/test-connection", async (req: any, res) => {
  try {
    const { configType, connectionConfig = {}, fieldMap = {}, importType, sourceSystemKey, dateFrom, dateTo } = req.body;

    if (!configType || !importType || !sourceSystemKey) {
      return res.status(400).json({ error: "configType, importType, and sourceSystemKey are required" });
    }

    const config: ImportSourceConfig = {
      id: "test",
      name: "Test",
      configType,
      importType,
      sourceSystemKey,
      connectionConfig,
      fieldMap,
      batchMode: "supplement",
    };

    const adapter = getAdapter(config);
    const today = new Date().toISOString().slice(0, 10);
    const params: Record<string, string> = {
      dateFrom: dateFrom ?? today,
      dateTo:   dateTo   ?? today,
    };

    // Fetch up to 5 preview rows (adapter returns full result; we truncate here)
    const result = await adapter.fetch(config, params);

    res.json({
      success:     true,
      adapterType: adapter.adapterType,
      rowCount:    result.rowCount,
      headers:     result.headers,
      preview:     result.rows.slice(0, 5),
      sourceLabel: result.sourceLabel,
    });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

export default router;
