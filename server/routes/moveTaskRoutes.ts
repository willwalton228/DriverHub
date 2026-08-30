import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { moveTasks } from "../../shared/schema";
import { eq, asc } from "drizzle-orm";

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

// ── List all tasks (Super Admin — includes inactive) ───────────────────────────
router.get("/", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const rows = await db.select().from(moveTasks).orderBy(asc(moveTasks.sortOrder), asc(moveTasks.name));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── List active tasks (for consumption by template configuration) ───────────────
router.get("/active", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(moveTasks)
      .where(eq(moveTasks.isActive, true))
      .orderBy(asc(moveTasks.sortOrder), asc(moveTasks.name));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const bodySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  isActive: z.boolean().default(true),
  defaultRequired: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});

// ── Create task (Super Admin) ───────────────────────────────────────────────────
router.post("/", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [row] = await db.insert(moveTasks).values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      isActive: parsed.data.isActive,
      defaultRequired: parsed.data.defaultRequired,
      sortOrder: parsed.data.sortOrder,
    }).returning();
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update task (Super Admin) ───────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [existing] = await db.select().from(moveTasks).where(eq(moveTasks.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(moveTasks)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(moveTasks.id, req.params.id))
      .returning();
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete task (Super Admin) ───────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const [existing] = await db.select().from(moveTasks).where(eq(moveTasks.id, req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });
    await db.delete(moveTasks).where(eq(moveTasks.id, req.params.id));
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
