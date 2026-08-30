import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { departmentMoveTypes, moveTypes, accountDepartments } from "../../shared/schema";
import { eq, and, asc } from "drizzle-orm";

const router = Router({ mergeParams: true }); // inherits :id (accountId) and :departmentId

// ── GET /api/accounts/:id/departments/:departmentId/move-types ─────────────────
// Returns all active platform Move Types, each decorated with the department's
// custom isEnabled flag and sortOrder. Move Types not yet configured for this
// department default to isEnabled=true and sortOrder from the master list.
router.get("/", async (req, res) => {
  const { id: accountId, departmentId } = req.params;
  try {
    // Verify department belongs to account
    const [dept] = await db
      .select({ id: accountDepartments.id })
      .from(accountDepartments)
      .where(and(eq(accountDepartments.id, departmentId), eq(accountDepartments.accountId, accountId)))
      .limit(1);
    if (!dept) return res.status(404).json({ error: "Department not found" });

    // Load all active master move types
    const masterTypes = await db
      .select()
      .from(moveTypes)
      .where(eq(moveTypes.isActive, true))
      .orderBy(asc(moveTypes.sortOrder), asc(moveTypes.name));

    // Load any existing dept-level configuration
    const deptConfig = await db
      .select()
      .from(departmentMoveTypes)
      .where(eq(departmentMoveTypes.departmentId, departmentId));

    const configMap = new Map(deptConfig.map((c) => [c.moveTypeId, c]));

    // Merge: master list + dept overrides. Sort: configured rows first (by deptSortOrder),
    // then unconfigured rows at the end (by master sortOrder).
    const configured: any[] = [];
    const unconfigured: any[] = [];
    for (const mt of masterTypes) {
      const cfg = configMap.get(mt.id);
      if (cfg) {
        configured.push({ ...mt, isEnabled: cfg.isEnabled, deptSortOrder: cfg.sortOrder, configId: cfg.id });
      } else {
        unconfigured.push({ ...mt, isEnabled: true, deptSortOrder: null, configId: null });
      }
    }
    configured.sort((a, b) => a.deptSortOrder - b.deptSortOrder);

    res.json([...configured, ...unconfigured]);
  } catch (e: any) {
    console.error("[DeptMoveTypes] GET error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/accounts/:id/departments/:departmentId/move-types ─────────────────
// Accepts an ordered array of { moveTypeId, isEnabled, sortOrder } and bulk-
// upserts the department's configuration. Rows omitted from the payload are
// deleted (they revert to default / unconfigured state).
const putBodySchema = z.object({
  items: z.array(z.object({
    moveTypeId: z.string().min(1),
    isEnabled: z.boolean(),
    sortOrder: z.number().int(),
  })),
});

router.put("/", async (req, res) => {
  const { id: accountId, departmentId } = req.params;
  const parsed = putBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    // Verify department belongs to account
    const [dept] = await db
      .select({ id: accountDepartments.id })
      .from(accountDepartments)
      .where(and(eq(accountDepartments.id, departmentId), eq(accountDepartments.accountId, accountId)))
      .limit(1);
    if (!dept) return res.status(404).json({ error: "Department not found" });

    const { items } = parsed.data;

    // Delete existing config for this department then re-insert. This keeps
    // the implementation simple and correct (handles both adds and removals).
    await db.delete(departmentMoveTypes).where(eq(departmentMoveTypes.departmentId, departmentId));

    if (items.length > 0) {
      await db.insert(departmentMoveTypes).values(
        items.map((item) => ({
          departmentId,
          moveTypeId: item.moveTypeId,
          isEnabled: item.isEnabled,
          sortOrder: item.sortOrder,
        }))
      );
    }

    console.log(`[DeptMoveTypes] Saved ${items.length} move type(s) for dept ${departmentId}`);
    res.json({ saved: items.length });
  } catch (e: any) {
    console.error("[DeptMoveTypes] PUT error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
