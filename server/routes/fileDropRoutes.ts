import { Router } from "express";
import { db } from "../db";
import { fileDropConfigs, fileDropIngestionLog } from "@shared/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { isAuthenticated } from "../replitAuth";
import { pollFileDropConfig, testFileDropConnection } from "../services/fileDropService";

const router = Router();

function getUserRole(req: any): string {
  return req.user?.claims?.role ?? req.user?.role ?? "viewer";
}
function isAdmin(req: any): boolean {
  return ["super_admin", "admin", "super_user"].includes(getUserRole(req));
}

// ---------------------------------------------------------------------------
// GET /configs — list all file-drop configs
// ---------------------------------------------------------------------------
router.get("/configs", isAuthenticated, async (_req, res) => {
  try {
    const configs = await db.select().from(fileDropConfigs).orderBy(fileDropConfigs.createdAt);

    // Attach ingestion counts per config
    const configIds = configs.map(c => c.id);
    const counts = configIds.length > 0
      ? await Promise.all(configIds.map(id =>
          db.select({ status: fileDropIngestionLog.status, cnt: count() })
            .from(fileDropIngestionLog)
            .where(eq(fileDropIngestionLog.fileDropConfigId, id))
            .groupBy(fileDropIngestionLog.status)
            .then(rows => ({ id, counts: rows }))
        ))
      : [];

    const countMap: Record<string, Record<string, number>> = {};
    counts.forEach(({ id, counts: rows }) => {
      countMap[id] = {};
      rows.forEach(r => { countMap[id][r.status] = Number(r.cnt); });
    });

    const result = configs.map(c => ({
      ...c,
      // Mask sensitive credentials
      sftpPasswordEncrypted:   c.sftpPasswordEncrypted   ? "••••••••" : null,
      sftpPrivateKeyEncrypted: c.sftpPrivateKeyEncrypted ? "••••••••" : null,
      sftpPassphraseEncrypted: c.sftpPassphraseEncrypted ? "••••••••" : null,
      ingestCounts: countMap[c.id] ?? {},
    }));

    return res.json(result);
  } catch (err: any) {
    console.error("[FileDrop] GET /configs:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /configs — create a new config
// ---------------------------------------------------------------------------
router.post("/configs", isAuthenticated, async (req: any, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
  try {
    const {
      name, datasetType, enabled, sftpHost, sftpPort, sftpUsername,
      sftpPassword, sftpPrivateKey, sftpPassphrase,
      inboundPath, archivePath, errorPath, duplicatePath,
      pollIntervalMinutes, fileNamePattern, autoProcess, requireAllFileTypes, notes,
    } = req.body;

    if (!name?.trim())        return res.status(400).json({ message: "name is required" });
    if (!datasetType?.trim()) return res.status(400).json({ message: "datasetType is required" });
    if (!inboundPath?.trim()) return res.status(400).json({ message: "inboundPath is required" });

    const [config] = await db.insert(fileDropConfigs).values({
      name:                    name.trim(),
      datasetType:             datasetType.trim(),
      enabled:                 enabled ?? false,
      sftpHost:                sftpHost?.trim() || null,
      sftpPort:                sftpPort ?? 22,
      sftpUsername:            sftpUsername?.trim() || null,
      sftpPasswordEncrypted:   sftpPassword   || null, // Store as-is; in prod encrypt with DRIVER_DATA_ENCRYPTION_KEY
      sftpPrivateKeyEncrypted: sftpPrivateKey || null,
      sftpPassphraseEncrypted: sftpPassphrase || null,
      inboundPath:             inboundPath.trim(),
      archivePath:             archivePath?.trim()   || "/archive/processed/",
      errorPath:               errorPath?.trim()     || "/archive/error/",
      duplicatePath:           duplicatePath?.trim() || "/archive/duplicate/",
      pollIntervalMinutes:     pollIntervalMinutes ?? 15,
      fileNamePattern:         fileNamePattern?.trim() || null,
      autoProcess:             autoProcess ?? false,
      requireAllFileTypes:     requireAllFileTypes ?? false,
      notes:                   notes || null,
    }).returning();

    return res.status(201).json({ ...config, sftpPasswordEncrypted: null, sftpPrivateKeyEncrypted: null });
  } catch (err: any) {
    console.error("[FileDrop] POST /configs:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /configs/:id — update a config
// ---------------------------------------------------------------------------
router.patch("/configs/:id", isAuthenticated, async (req: any, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
  try {
    const { id } = req.params;
    const {
      name, datasetType, enabled, sftpHost, sftpPort, sftpUsername,
      sftpPassword, sftpPrivateKey, sftpPassphrase,
      inboundPath, archivePath, errorPath, duplicatePath,
      pollIntervalMinutes, fileNamePattern, autoProcess, requireAllFileTypes, notes,
    } = req.body;

    const updates: Partial<typeof fileDropConfigs.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined)               updates.name                    = name.trim();
    if (datasetType !== undefined)        updates.datasetType             = datasetType;
    if (enabled !== undefined)            updates.enabled                 = enabled;
    if (sftpHost !== undefined)           updates.sftpHost                = sftpHost || null;
    if (sftpPort !== undefined)           updates.sftpPort                = sftpPort;
    if (sftpUsername !== undefined)       updates.sftpUsername            = sftpUsername || null;
    if (sftpPassword !== undefined && sftpPassword !== "••••••••") {
      updates.sftpPasswordEncrypted = sftpPassword || null;
    }
    if (sftpPrivateKey !== undefined && sftpPrivateKey !== "••••••••") {
      updates.sftpPrivateKeyEncrypted = sftpPrivateKey || null;
    }
    if (sftpPassphrase !== undefined && sftpPassphrase !== "••••••••") {
      updates.sftpPassphraseEncrypted = sftpPassphrase || null;
    }
    if (inboundPath !== undefined)        updates.inboundPath             = inboundPath;
    if (archivePath !== undefined)        updates.archivePath             = archivePath;
    if (errorPath !== undefined)          updates.errorPath               = errorPath;
    if (duplicatePath !== undefined)      updates.duplicatePath           = duplicatePath;
    if (pollIntervalMinutes !== undefined) updates.pollIntervalMinutes    = pollIntervalMinutes;
    if (fileNamePattern !== undefined)    updates.fileNamePattern         = fileNamePattern || null;
    if (autoProcess !== undefined)        updates.autoProcess             = autoProcess;
    if (requireAllFileTypes !== undefined) updates.requireAllFileTypes    = requireAllFileTypes;
    if (notes !== undefined)              updates.notes                   = notes;

    const [updated] = await db.update(fileDropConfigs).set(updates)
      .where(eq(fileDropConfigs.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Config not found" });

    return res.json({ ...updated, sftpPasswordEncrypted: null, sftpPrivateKeyEncrypted: null });
  } catch (err: any) {
    console.error("[FileDrop] PATCH /configs/:id:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /configs/:id — delete a config and its log entries
// ---------------------------------------------------------------------------
router.delete("/configs/:id", isAuthenticated, async (req: any, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
  try {
    const { id } = req.params;
    await db.delete(fileDropIngestionLog).where(eq(fileDropIngestionLog.fileDropConfigId, id));
    await db.delete(fileDropConfigs).where(eq(fileDropConfigs.id, id));
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[FileDrop] DELETE /configs/:id:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /configs/:id/enable — toggle enabled
// ---------------------------------------------------------------------------
router.post("/configs/:id/enable", isAuthenticated, async (req: any, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
  try {
    const { id } = req.params;
    const { enabled } = req.body as { enabled: boolean };
    const [updated] = await db.update(fileDropConfigs).set({ enabled, updatedAt: new Date() })
      .where(eq(fileDropConfigs.id, id)).returning({ id: fileDropConfigs.id, enabled: fileDropConfigs.enabled });
    if (!updated) return res.status(404).json({ message: "Config not found" });
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /configs/:id/poll — manually trigger a poll now
// ---------------------------------------------------------------------------
router.post("/configs/:id/poll", isAuthenticated, async (req: any, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
  try {
    const { id } = req.params;
    const result = await pollFileDropConfig(id);
    return res.json(result);
  } catch (err: any) {
    console.error("[FileDrop] Manual poll error:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /configs/:id/test — test SFTP connectivity
// ---------------------------------------------------------------------------
router.post("/configs/:id/test", isAuthenticated, async (req: any, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin access required" });
  try {
    const { id } = req.params;
    const result = await testFileDropConnection(id);
    return res.status(result.success ? 200 : 422).json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /log — ingestion log (all configs or by configId)
// ---------------------------------------------------------------------------
router.get("/log", isAuthenticated, async (req, res) => {
  try {
    const { configId, status, limit: limitStr } = req.query as Record<string, string>;
    const limit = Math.min(parseInt(limitStr ?? "100", 10), 500);

    let query = db.select().from(fileDropIngestionLog)
      .orderBy(desc(fileDropIngestionLog.detectedAt))
      .limit(limit) as any;

    if (configId) query = query.where(eq(fileDropIngestionLog.fileDropConfigId, configId));
    if (status)   query = query.where(and(eq(fileDropIngestionLog.fileDropConfigId, configId ?? ""), eq(fileDropIngestionLog.status, status)));

    const logs = configId
      ? status
        ? await db.select().from(fileDropIngestionLog)
            .where(and(eq(fileDropIngestionLog.fileDropConfigId, configId), eq(fileDropIngestionLog.status, status)))
            .orderBy(desc(fileDropIngestionLog.detectedAt)).limit(limit)
        : await db.select().from(fileDropIngestionLog)
            .where(eq(fileDropIngestionLog.fileDropConfigId, configId))
            .orderBy(desc(fileDropIngestionLog.detectedAt)).limit(limit)
      : status
        ? await db.select().from(fileDropIngestionLog)
            .where(eq(fileDropIngestionLog.status, status))
            .orderBy(desc(fileDropIngestionLog.detectedAt)).limit(limit)
        : await db.select().from(fileDropIngestionLog)
            .orderBy(desc(fileDropIngestionLog.detectedAt)).limit(limit);

    return res.json(logs);
  } catch (err: any) {
    console.error("[FileDrop] GET /log:", err);
    return res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /log/summary — aggregate counts by status across all configs
// ---------------------------------------------------------------------------
router.get("/log/summary", isAuthenticated, async (_req, res) => {
  try {
    const rows = await db.select({
      status: fileDropIngestionLog.status,
      cnt:    count(),
    })
    .from(fileDropIngestionLog)
    .groupBy(fileDropIngestionLog.status);

    const summary: Record<string, number> = {};
    rows.forEach(r => { summary[r.status] = Number(r.cnt); });

    return res.json({
      total:      Object.values(summary).reduce((a, b) => a + b, 0),
      processed:  summary["processed"]  ?? 0,
      pending:    summary["pending"]    ?? 0,
      processing: summary["processing"] ?? 0,
      rejected:   summary["rejected"]   ?? 0,
      duplicate:  summary["duplicate"]  ?? 0,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
