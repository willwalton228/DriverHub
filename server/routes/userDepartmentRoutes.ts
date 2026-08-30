import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { userDepartments, accountDepartments, users, customers } from "../../shared/schema";
import { eq, and, inArray, asc } from "drizzle-orm";

const router = Router();

function getSessionUserId(req: Request): string | null {
  const u = (req as any).user;
  return u?.claims?.sub ?? (req.session as any)?.userId ?? u?.id ?? null;
}

/**
 * Resolve the caller's DB role from their session user ID.
 * Returns true and proceeds when the caller is a super_user, super_admin, admin,
 * or the root super admin. Sends 403 and returns false otherwise.
 */
async function isAdminOrAbove(req: Request, res: Response): Promise<boolean> {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  try {
    const [dbUser] = await db
      .select({ role: users.role, isRootSuperAdmin: users.isRootSuperAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const ALLOWED_ROLES = new Set(["super_user", "super_admin", "admin"]);
    if (!dbUser || (!dbUser.isRootSuperAdmin && !ALLOWED_ROLES.has(dbUser.role ?? ""))) {
      res.status(403).json({ error: "Admin access required" });
      return false;
    }
    return true;
  } catch (e) {
    console.error("[UserDepartmentRoutes] isAdminOrAbove DB error:", e);
    res.status(500).json({ error: "Internal server error during authorization" });
    return false;
  }
}

// ── Enrichment helper: join department + account name ─────────────────────────
async function enrichAssignments(rows: typeof userDepartments.$inferSelect[]) {
  if (rows.length === 0) return [];
  const deptIds = [...new Set(rows.map((r) => r.departmentId))];
  const depts = await db
    .select({
      id: accountDepartments.id,
      name: accountDepartments.name,
      code: accountDepartments.code,
      isActive: accountDepartments.isActive,
      accountId: accountDepartments.accountId,
      accountName: customers.companyName,
    })
    .from(accountDepartments)
    .innerJoin(customers, eq(accountDepartments.accountId, customers.id))
    .where(inArray(accountDepartments.id, deptIds));

  const deptMap = new Map(depts.map((d) => [d.id, d]));
  return rows.map((r) => ({ ...r, department: deptMap.get(r.departmentId) ?? null }));
}

// ── GET /api/user-departments/all-departments ─────────────────────────────────
// Returns all active departments across all accounts (admin); used by the
// assignment dialog to build the grouped checkbox list.
router.get("/all-departments", async (req, res) => {
  if (!await isAdminOrAbove(req, res)) return;
  try {
    const rows = await db
      .select({
        id: accountDepartments.id,
        name: accountDepartments.name,
        code: accountDepartments.code,
        accountId: accountDepartments.accountId,
        accountName: customers.companyName,
        sortOrder: accountDepartments.sortOrder,
      })
      .from(accountDepartments)
      .innerJoin(customers, eq(accountDepartments.accountId, customers.id))
      .where(eq(accountDepartments.isActive, true))
      .orderBy(asc(customers.companyName), asc(accountDepartments.sortOrder), asc(accountDepartments.name));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/user-departments/mine ─────────────────────────────────────────────
// Current user's own department assignments — used by DoD for visibility filtering.
router.get("/mine", async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthenticated" });
  try {
    const rows = await db
      .select()
      .from(userDepartments)
      .where(eq(userDepartments.userId, userId));
    res.json(await enrichAssignments(rows));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/user-departments/users/:userId ────────────────────────────────────
// Admin: get all department assignments for a specific user.
router.get("/users/:userId", async (req, res) => {
  if (!await isAdminOrAbove(req, res)) return;
  try {
    const rows = await db
      .select()
      .from(userDepartments)
      .where(eq(userDepartments.userId, req.params.userId));
    res.json(await enrichAssignments(rows));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/user-departments/users/:userId ────────────────────────────────────
// Admin: bulk-set department assignments for a user.
// Delete-then-reinsert. Removing a department assignment does NOT delete the dept.
router.put("/users/:userId", async (req, res) => {
  if (!await isAdminOrAbove(req, res)) return;
  const grantedBy = getSessionUserId(req);
  const parsed = z.array(z.string().min(1)).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Expected array of department IDs" });

  try {
    // Verify the target user exists
    const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, req.params.userId));
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    await db.delete(userDepartments).where(eq(userDepartments.userId, req.params.userId));

    if (parsed.data.length > 0) {
      await db.insert(userDepartments).values(
        parsed.data.map((deptId) => ({
          userId: req.params.userId,
          departmentId: deptId,
          grantedByUserId: grantedBy ?? undefined,
        }))
      );
    }

    const rows = await db.select().from(userDepartments).where(eq(userDepartments.userId, req.params.userId));
    console.log(`[UserDepartments] Set ${rows.length} module(s) for user ${req.params.userId} by ${grantedBy}`);
    res.json(await enrichAssignments(rows));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/user-departments/departments/:deptId/users ────────────────────────
// Admin: list all users assigned to a specific department (for reporting).
router.get("/departments/:deptId/users", async (req, res) => {
  if (!await isAdminOrAbove(req, res)) return;
  try {
    const rows = await db
      .select({
        assignmentId: userDepartments.id,
        userId: userDepartments.userId,
        grantedAt: userDepartments.grantedAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          status: users.status,
        },
      })
      .from(userDepartments)
      .innerJoin(users, eq(userDepartments.userId, users.id))
      .where(eq(userDepartments.departmentId, req.params.deptId))
      .orderBy(asc(users.lastName), asc(users.firstName));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
