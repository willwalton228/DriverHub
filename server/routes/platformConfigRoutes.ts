import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { platformConfigs } from "../../shared/schema";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { resolveConfig, resolvePicklist } from "../services/platformConfigService";

const router = Router();

function requireSuperAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  const role = user?.role ?? user?.claims?.role ?? "";
  if (!user || (!user.isRootSuperAdmin && role !== "super_user" && role !== "super_admin")) {
    res.status(403).json({ error: "Super Admin access required" });
    return false;
  }
  return true;
}

function getUserId(req: Request): string | null {
  const u = (req as any).user;
  return u?.claims?.sub ?? (req.session as any)?.userId ?? u?.id ?? null;
}

// ── List all configs (Super Admin) ────────────────────────────────────────────
router.get("/", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const { scopeType, configKey, configCategory, q } = req.query as Record<string, string>;

    let query = db.select().from(platformConfigs).$dynamic();

    const conditions: any[] = [];
    if (scopeType && scopeType !== "all") conditions.push(eq(platformConfigs.scopeType, scopeType));
    if (configKey) conditions.push(eq(platformConfigs.configKey, configKey));
    if (configCategory && configCategory !== "all") conditions.push(eq(platformConfigs.configCategory, configCategory));
    if (q) {
      conditions.push(
        or(
          ilike(platformConfigs.configKey, `%${q}%`),
          ilike(platformConfigs.label, `%${q}%`),
        )
      );
    }

    const rows = await db
      .select()
      .from(platformConfigs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(platformConfigs.configKey), asc(platformConfigs.scopeType));

    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Distinct config keys (for dropdowns) ──────────────────────────────────────
router.get("/keys", async (req, res) => {
  try {
    const rows = await db
      .selectDistinct({ configKey: platformConfigs.configKey, label: platformConfigs.label, configCategory: platformConfigs.configCategory })
      .from(platformConfigs)
      .where(eq(platformConfigs.isActive, true))
      .orderBy(asc(platformConfigs.configKey));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Resolve effective value for a key + scope ─────────────────────────────────
router.get("/resolve", async (req, res) => {
  const { key, scopeType, scopeId } = req.query as Record<string, string>;
  if (!key) return res.status(400).json({ error: "key is required" });
  try {
    const result = await resolveConfig(key, { scopeType, scopeId });
    if (!result) return res.status(404).json({ error: "No config found for key", key });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get single config by ID ────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const [row] = await db.select().from(platformConfigs).where(eq(platformConfigs.id, req.params.id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const configBodySchema = z.object({
  configKey:      z.string().min(1).max(100),
  configCategory: z.enum(["picklist", "feature_flag", "default", "threshold"]).default("picklist"),
  label:          z.string().min(1).max(200),
  description:    z.string().optional(),
  configValue:    z.any(),
  scopeType:      z.enum(["global", "account", "network"]).default("global"),
  scopeId:        z.string().optional().nullable(),
  isActive:       z.boolean().default(true),
  sortOrder:      z.number().int().default(0),
});

// ── Create config ──────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const userId = getUserId(req);
  const parsed = configBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const data = parsed.data;

    // Prevent duplicate: same key + scopeType + scopeId
    const existing = await db.select({ id: platformConfigs.id }).from(platformConfigs).where(
      and(
        eq(platformConfigs.configKey, data.configKey),
        eq(platformConfigs.scopeType, data.scopeType),
        data.scopeId ? eq(platformConfigs.scopeId, data.scopeId) : isNull(platformConfigs.scopeId),
      )
    ).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "A config entry already exists for this key + scope. Edit the existing entry instead." });
    }

    const [row] = await db.insert(platformConfigs).values({
      ...data,
      scopeId: data.scopeId ?? null,
      createdBy: userId ?? undefined,
      updatedBy: userId ?? undefined,
    }).returning();

    console.log(`[PlatformConfig] Created: ${data.configKey} (${data.scopeType}/${data.scopeId ?? "global"}) by ${userId}`);
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update config ──────────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const userId = getUserId(req);
  const parsed = configBodySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [existing] = await db.select().from(platformConfigs).where(eq(platformConfigs.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const [row] = await db.update(platformConfigs)
      .set({ ...parsed.data, updatedBy: userId ?? undefined, updatedAt: new Date() })
      .where(eq(platformConfigs.id, req.params.id))
      .returning();

    console.log(`[PlatformConfig] Updated: ${row.configKey} (${row.scopeType}/${row.scopeId ?? "global"}) by ${userId}`);
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete config ──────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const userId = getUserId(req);
  try {
    const [existing] = await db.select().from(platformConfigs).where(eq(platformConfigs.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.scopeType === "global" && !existing.scopeId) {
      return res.status(400).json({ error: "Global base configs cannot be deleted. Deactivate them instead." });
    }
    await db.delete(platformConfigs).where(eq(platformConfigs.id, req.params.id));
    console.log(`[PlatformConfig] Deleted: ${existing.configKey} (${existing.scopeType}/${existing.scopeId ?? "global"}) by ${userId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
