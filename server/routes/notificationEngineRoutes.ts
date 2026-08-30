/**
 * Notification Rules Engine – Admin Routes
 *
 * GET  /api/admin/notification-events
 *   Returns all registered event definitions for audit.
 *   Response: array of { event, module, description, eligibleRoles, recipientReasons }
 *
 * GET  /api/admin/notification-events/:event
 *   Returns a single event definition by name.
 *
 * POST /api/admin/notification-events/:event/dry-run
 *   Preview who would receive a notification for this event without sending.
 *   Body: { actorUserId?: string, payload: Record<string, any> }
 *   Response: { event, recipients: [{ userId, reason }], filtered }
 *
 * All routes require an authenticated admin or super_user.
 */

import { Router, Request, Response } from "express";
import { getAllEvents, getEventCount, dryRunNotify } from "../services/notificationEngine";
import { pool } from "../db";

const router = Router();

// ── Session helper ─────────────────────────────────────────────────────────────

function getSessionUserId(req: Request): string | null {
  const u = (req as any).user;
  return u?.claims?.sub ?? (req.session as any)?.userId ?? u?.id ?? null;
}

// ── Authorization helper ───────────────────────────────────────────────────────

async function isAdminOrSuperUser(req: Request, res: Response): Promise<boolean> {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  const r = await pool.query(
    `SELECT role, "is_root_super_admin" FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const user = r.rows[0];
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return false;
  }
  const adminRoles = new Set(["super_user", "super_admin", "admin"]);
  if (!adminRoles.has(user.role) && !user.is_root_super_admin) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

// ── GET /api/admin/notification-events ─────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminOrSuperUser(req, res))) return;

    const events = getAllEvents().map((def) => ({
      event: def.event,
      module: def.module,
      description: def.description,
      eligibleRoles: def.eligibleRoles ?? null,
      recipientReasons: def.recipients.map((r) => r.reason),
      channels: def.channels ?? ["in_app"],
      excludeActor: def.excludeActor !== false,
    }));

    res.json({
      total: getEventCount(),
      modules: [...new Set(events.map((e) => e.module))].sort(),
      events,
    });
  } catch (err: any) {
    console.error("[NotifEngineRoutes] GET /notification-events error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/admin/notification-events/:event ──────────────────────────────────

router.get("/:event", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminOrSuperUser(req, res))) return;

    const all = getAllEvents();
    const def = all.find((d) => d.event === req.params.event.toUpperCase());
    if (!def) {
      return res.status(404).json({ error: `Event not found: ${req.params.event}` });
    }

    res.json({
      event: def.event,
      module: def.module,
      description: def.description,
      eligibleRoles: def.eligibleRoles ?? null,
      recipientReasons: def.recipients.map((r) => r.reason),
      channels: def.channels ?? ["in_app"],
      excludeActor: def.excludeActor !== false,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/notification-events/:event/dry-run ─────────────────────────

router.post("/:event/dry-run", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminOrSuperUser(req, res))) return;

    const eventName = req.params.event.toUpperCase();
    const { actorUserId, payload = {} } = req.body;

    const result = await dryRunNotify(eventName, { actorUserId, payload });

    // Enrich recipients with user display info
    const userIds = result.recipients.map((r) => r.userId);
    let userMap: Record<string, { email: string; firstName: string; lastName: string; role: string }> = {};

    if (userIds.length) {
      const r = await pool.query(
        `SELECT id, email, first_name, last_name, role
           FROM users
          WHERE id = ANY($1::text[])`,
        [userIds],
      );
      for (const row of r.rows) {
        userMap[row.id] = {
          email: row.email,
          firstName: row.first_name,
          lastName: row.last_name,
          role: row.role,
        };
      }
    }

    res.json({
      event: result.event,
      filtered: result.filtered,
      recipientCount: result.recipients.length,
      recipients: result.recipients.map((r) => ({
        ...r,
        ...userMap[r.userId],
      })),
    });
  } catch (err: any) {
    console.error("[NotifEngineRoutes] dry-run error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
