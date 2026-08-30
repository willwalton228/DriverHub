import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { transportationMethods, insertTransportationMethodSchema } from "../../shared/schema";
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

// ── List all methods (Super Admin — includes inactive) ─────────────────────────
router.get("/", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const rows = await db
      .select()
      .from(transportationMethods)
      .orderBy(asc(transportationMethods.sortOrder), asc(transportationMethods.name));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── List active methods for consumption by other platform modules ──────────────
// (e.g. Move Type configuration). Any authenticated user may read this list.
router.get("/active", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(transportationMethods)
      .where(eq(transportationMethods.isActive, true))
      .orderBy(asc(transportationMethods.sortOrder), asc(transportationMethods.name));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const bodySchema = insertTransportationMethodSchema.pick({
  name: true,
  description: true,
  isActive: true,
  sortOrder: true,
}).extend({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

// ── Create method (Super Admin) ─────────────────────────────────────────────────
router.post("/", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const userId = getUserId(req);
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [existing] = await db
      .select({ id: transportationMethods.id })
      .from(transportationMethods)
      .where(eq(transportationMethods.name, parsed.data.name))
      .limit(1);
    if (existing) {
      return res.status(409).json({ error: "A transportation method with this name already exists." });
    }

    const [row] = await db.insert(transportationMethods).values({
      ...parsed.data,
      description: parsed.data.description ?? null,
      createdByUserId: userId ?? undefined,
      updatedByUserId: userId ?? undefined,
    }).returning();

    console.log(`[TransportationMethods] Created: ${row.name} by ${userId}`);
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update method (Super Admin) ─────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const userId = getUserId(req);
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [existing] = await db.select().from(transportationMethods).where(eq(transportationMethods.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (parsed.data.name) {
      const [dupe] = await db
        .select({ id: transportationMethods.id })
        .from(transportationMethods)
        .where(and(eq(transportationMethods.name, parsed.data.name), ne(transportationMethods.id, req.params.id)))
        .limit(1);
      if (dupe) {
        return res.status(409).json({ error: "A transportation method with this name already exists." });
      }
    }

    const [row] = await db.update(transportationMethods)
      .set({
        ...parsed.data,
        description: parsed.data.description === undefined ? undefined : (parsed.data.description ?? null),
        updatedByUserId: userId ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(transportationMethods.id, req.params.id))
      .returning();

    console.log(`[TransportationMethods] Updated: ${row.name} by ${userId}`);
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete method (Super Admin) ─────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const userId = getUserId(req);
  try {
    const [existing] = await db.select().from(transportationMethods).where(eq(transportationMethods.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    await db.delete(transportationMethods).where(eq(transportationMethods.id, req.params.id));
    console.log(`[TransportationMethods] Deleted: ${existing.name} by ${userId}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
