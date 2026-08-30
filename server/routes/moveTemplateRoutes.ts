import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { moveTemplates, moveTypes, transportationMethods } from "../../shared/schema";
import { eq, asc, desc } from "drizzle-orm";

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

// ── Shared enrichment: join move type and transportation method names ──────────
async function enrichTemplates(rows: typeof moveTemplates.$inferSelect[]) {
  if (rows.length === 0) return [];

  const [allMoveTypes, allTransportMethods] = await Promise.all([
    db.select({ id: moveTypes.id, name: moveTypes.name, category: moveTypes.category }).from(moveTypes),
    db.select({ id: transportationMethods.id, name: transportationMethods.name }).from(transportationMethods),
  ]);

  const mtMap = new Map(allMoveTypes.map((m) => [m.id, m]));
  const tmMap = new Map(allTransportMethods.map((t) => [t.id, t]));

  return rows.map((r) => ({
    ...r,
    moveType: r.moveTypeId ? (mtMap.get(r.moveTypeId) ?? null) : null,
    defaultTransportationMethod: r.defaultTransportationMethodId
      ? (tmMap.get(r.defaultTransportationMethodId) ?? null)
      : null,
  }));
}

// ── List all templates (Super Admin — includes inactive) ───────────────────────
router.get("/", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const rows = await db
      .select()
      .from(moveTemplates)
      .orderBy(asc(moveTemplates.name), desc(moveTemplates.versionNumber));
    res.json(await enrichTemplates(rows));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── List active templates for consumption by other platform modules ────────────
router.get("/active", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(moveTemplates)
      .where(eq(moveTemplates.isActive, true))
      .orderBy(asc(moveTemplates.name), desc(moveTemplates.versionNumber));
    res.json(await enrichTemplates(rows));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const bodySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  versionNumber: z.coerce.number().int().min(1).default(1),
  moveTypeId: z.string().optional().nullable(),
  defaultTransportationMethodId: z.string().optional().nullable(),
});

// ── Create template (Super Admin) ───────────────────────────────────────────────
router.post("/", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const userId = getUserId(req);
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [row] = await db.insert(moveTemplates).values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isActive: parsed.data.isActive,
      versionNumber: parsed.data.versionNumber,
      moveTypeId: parsed.data.moveTypeId ?? null,
      defaultTransportationMethodId: parsed.data.defaultTransportationMethodId ?? null,
      createdByUserId: userId ?? undefined,
      updatedByUserId: userId ?? undefined,
    }).returning();

    console.log(`[MoveTemplates] Created: ${row.name} v${row.versionNumber} by ${userId}`);
    res.status(201).json((await enrichTemplates([row]))[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update template (Super Admin) ───────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const userId = getUserId(req);
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [existing] = await db.select().from(moveTemplates).where(eq(moveTemplates.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const [row] = await db.update(moveTemplates)
      .set({
        ...parsed.data,
        description: parsed.data.description === undefined ? undefined : (parsed.data.description ?? null),
        moveTypeId: parsed.data.moveTypeId === undefined ? undefined : (parsed.data.moveTypeId ?? null),
        defaultTransportationMethodId:
          parsed.data.defaultTransportationMethodId === undefined
            ? undefined
            : (parsed.data.defaultTransportationMethodId ?? null),
        updatedByUserId: userId ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(moveTemplates.id, req.params.id))
      .returning();

    console.log(`[MoveTemplates] Updated: ${row.name} v${row.versionNumber} by ${userId}`);
    res.json((await enrichTemplates([row]))[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete template (Super Admin) ───────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const userId = getUserId(req);
  try {
    const [existing] = await db.select().from(moveTemplates).where(eq(moveTemplates.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });
    await db.delete(moveTemplates).where(eq(moveTemplates.id, req.params.id));
    console.log(`[MoveTemplates] Deleted: ${existing.name} by ${userId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
