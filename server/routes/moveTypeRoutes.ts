import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { moveTypes, insertMoveTypeSchema } from "../../shared/schema";
import { asc, eq, ne, and } from "drizzle-orm";

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

// ── List all move types (Super Admin — includes inactive) ──────────────────────
router.get("/", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const rows = await db
      .select()
      .from(moveTypes)
      .orderBy(asc(moveTypes.sortOrder), asc(moveTypes.name));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── List active move types for consumption by other platform modules ───────────
// (e.g. Account/Move configuration). Any authenticated user may read this list.
router.get("/active", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(moveTypes)
      .where(eq(moveTypes.isActive, true))
      .orderBy(asc(moveTypes.sortOrder), asc(moveTypes.name));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const bodySchema = insertMoveTypeSchema.pick({
  name: true,
  description: true,
  category: true,
  isActive: true,
  sortOrder: true,
}).extend({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

// ── Create move type (Super Admin) ──────────────────────────────────────────────
router.post("/", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const userId = getUserId(req);
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [existing] = await db
      .select({ id: moveTypes.id })
      .from(moveTypes)
      .where(eq(moveTypes.name, parsed.data.name))
      .limit(1);
    if (existing) {
      return res.status(409).json({ error: "A move type with this name already exists." });
    }

    const [row] = await db.insert(moveTypes).values({
      ...parsed.data,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      createdByUserId: userId ?? undefined,
      updatedByUserId: userId ?? undefined,
    }).returning();

    console.log(`[MoveTypes] Created: ${row.name} by ${userId}`);
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update move type (Super Admin) ──────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const userId = getUserId(req);
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [existing] = await db.select().from(moveTypes).where(eq(moveTypes.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (parsed.data.name) {
      const [dupe] = await db
        .select({ id: moveTypes.id })
        .from(moveTypes)
        .where(and(eq(moveTypes.name, parsed.data.name), ne(moveTypes.id, req.params.id)))
        .limit(1);
      if (dupe) {
        return res.status(409).json({ error: "A move type with this name already exists." });
      }
    }

    const [row] = await db.update(moveTypes)
      .set({
        ...parsed.data,
        description: parsed.data.description === undefined ? undefined : (parsed.data.description ?? null),
        category: parsed.data.category === undefined ? undefined : (parsed.data.category ?? null),
        updatedByUserId: userId ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(moveTypes.id, req.params.id))
      .returning();

    console.log(`[MoveTypes] Updated: ${row.name} by ${userId}`);
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete move type (Super Admin) ──────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const userId = getUserId(req);
  try {
    const [existing] = await db.select().from(moveTypes).where(eq(moveTypes.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    await db.delete(moveTypes).where(eq(moveTypes.id, req.params.id));
    console.log(`[MoveTypes] Deleted: ${existing.name} by ${userId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
