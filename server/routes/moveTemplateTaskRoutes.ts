import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { moveTemplateTasks, moveTasks } from "../../shared/schema";
import { eq, asc } from "drizzle-orm";

// Must be mounted with mergeParams: true to inherit :templateId from parent router
const router = Router({ mergeParams: true });

function requireSuperAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  const role = user?.role ?? user?.claims?.role ?? "";
  if (!user || (!user.isRootSuperAdmin && role !== "super_user" && role !== "super_admin")) {
    res.status(403).json({ error: "Super Admin access required" });
    return false;
  }
  return true;
}

// ── GET /api/platform/move-templates/:templateId/tasks ─────────────────────────
// Returns ordered task list for the template.
// Rows the template has explicitly configured are sorted by sortOrder;
// each row is enriched with the full task record from the Task Library.
router.get("/", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const { templateId } = req.params;
  try {
    const rows = await db
      .select({
        id: moveTemplateTasks.id,
        templateId: moveTemplateTasks.templateId,
        taskId: moveTemplateTasks.taskId,
        sortOrder: moveTemplateTasks.sortOrder,
        isRequired: moveTemplateTasks.isRequired,
        conditionalConfig: moveTemplateTasks.conditionalConfig,
        task: {
          id: moveTasks.id,
          name: moveTasks.name,
          description: moveTasks.description,
          category: moveTasks.category,
          isActive: moveTasks.isActive,
          defaultRequired: moveTasks.defaultRequired,
        },
      })
      .from(moveTemplateTasks)
      .innerJoin(moveTasks, eq(moveTemplateTasks.taskId, moveTasks.id))
      .where(eq(moveTemplateTasks.templateId, templateId))
      .orderBy(asc(moveTemplateTasks.sortOrder));

    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const rowSchema = z.object({
  taskId: z.string().min(1),
  sortOrder: z.coerce.number().int().default(0),
  isRequired: z.boolean().default(false),
  conditionalConfig: z.record(z.unknown()).optional().nullable(),
});

// ── PUT /api/platform/move-templates/:templateId/tasks ─────────────────────────
// Bulk-saves the template's full ordered task configuration.
// Delete-then-reinsert ensures ordering and required flags are always correct.
// Removing a task from the template does NOT delete it from the Task Library.
router.put("/", async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const { templateId } = req.params;
  const parsed = z.array(rowSchema).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await db.delete(moveTemplateTasks).where(eq(moveTemplateTasks.templateId, templateId));

    if (parsed.data.length > 0) {
      await db.insert(moveTemplateTasks).values(
        parsed.data.map((r, idx) => ({
          templateId,
          taskId: r.taskId,
          sortOrder: r.sortOrder ?? idx,
          isRequired: r.isRequired,
          conditionalConfig: r.conditionalConfig ?? null,
        }))
      );
    }

    // Return the updated list, enriched
    const rows = await db
      .select({
        id: moveTemplateTasks.id,
        templateId: moveTemplateTasks.templateId,
        taskId: moveTemplateTasks.taskId,
        sortOrder: moveTemplateTasks.sortOrder,
        isRequired: moveTemplateTasks.isRequired,
        conditionalConfig: moveTemplateTasks.conditionalConfig,
        task: {
          id: moveTasks.id,
          name: moveTasks.name,
          description: moveTasks.description,
          category: moveTasks.category,
          isActive: moveTasks.isActive,
          defaultRequired: moveTasks.defaultRequired,
        },
      })
      .from(moveTemplateTasks)
      .innerJoin(moveTasks, eq(moveTemplateTasks.taskId, moveTasks.id))
      .where(eq(moveTemplateTasks.templateId, templateId))
      .orderBy(asc(moveTemplateTasks.sortOrder));

    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
