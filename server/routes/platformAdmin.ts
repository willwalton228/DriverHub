import { Router, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import {
  users, organizations, superAdminAuditLog, platformFeatureToggles,
  userProvisioningAuditLog
} from "@shared/schema";
import { eq, desc, and, sql, ilike, or } from "drizzle-orm";
import { upsertConfig, resolveConfig } from "../services/platformConfigService";
import { rescheduleWeeklyReports, activeWeeklyReportCron, buildWeeklyReportCron } from "../schedulerService";
import { getHeymarketStatus, sendTestSms } from "../services/communicationsService";
import { batchValidatePhones, validatePhone } from "../services/phoneNormalizationService";
import { pool } from "../db";

const router = Router();

function isSuperAdmin(role: string): boolean {
  return role === "super_user" || role === "super_admin";
}

async function getUserFromSession(req: any): Promise<any> {
  let userId: string | null = null;
  if ((req.session as any)?.userId) {
    userId = (req.session as any).userId;
  } else if (req.isAuthenticated?.() && req.user?.claims?.sub) {
    userId = req.user.claims.sub;
  }
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user;
}

async function logSuperAdminAction(
  actor: any,
  action: string,
  category: string,
  targetType?: string,
  targetId?: string,
  targetLabel?: string,
  details?: any,
  ipAddress?: string,
) {
  await db.insert(superAdminAuditLog).values({
    actorId: actor.id,
    actorEmail: actor.email || "unknown",
    action,
    category,
    targetType: targetType ?? null,
    targetId: targetId ?? null,
    targetLabel: targetLabel ?? null,
    details: details ?? null,
    ipAddress: ipAddress ?? null,
  });
}

router.use(async (req: any, res: Response, next: Function) => {
  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
  }
  if (!isSuperAdmin(user.role)) {
    return res.status(403).json({ error: "FORBIDDEN", message: "Super Admin access required" });
  }
  req.currentUser = user;
  next();
});

router.get("/organizations", async (req: any, res: Response) => {
  try {
    const { search } = req.query;
    let query = db.select().from(organizations);

    const orgs = search
      ? await query.where(or(
          ilike(organizations.name, `%${search}%`),
          ilike(organizations.slug, `%${search}%`)
        )).orderBy(desc(organizations.createdAt))
      : await query.orderBy(desc(organizations.createdAt));

    const orgUserCounts = await db
      .select({
        orgId: users.orgId,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(sql`${users.orgId} IS NOT NULL`)
      .groupBy(users.orgId);

    const countMap = Object.fromEntries(orgUserCounts.map(c => [c.orgId, c.count]));

    await logSuperAdminAction(
      req.currentUser, "list_organizations", "tenant_management",
      undefined, undefined, undefined,
      { search: search || null, resultCount: orgs.length },
      req.ip
    );

    res.json(orgs.map(org => ({
      ...org,
      userCount: countMap[org.id] || 0,
    })));
  } catch (error) {
    console.error("[Platform] List organizations error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list organizations" });
  }
});

router.get("/organizations/:orgId", async (req: any, res: Response) => {
  try {
    const { orgId } = req.params;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);

    if (!org) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Organization not found" });
    }

    const orgUsers = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      isProvisioned: users.isProvisioned,
      corporateAccessAdmin: users.corporateAccessAdmin,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.orgId, orgId))
    .orderBy(desc(users.createdAt));

    await logSuperAdminAction(
      req.currentUser, "view_organization", "tenant_management",
      "organization", orgId, org.name,
      null, req.ip
    );

    res.json({ ...org, users: orgUsers });
  } catch (error) {
    console.error("[Platform] Organization detail error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch organization" });
  }
});

router.get("/users", async (req: any, res: Response) => {
  try {
    const { search, role, orgId } = req.query;
    const conditions: any[] = [];

    if (search) {
      conditions.push(or(
        ilike(users.email, `%${search}%`),
        ilike(users.firstName, `%${search}%`),
        ilike(users.lastName, `%${search}%`)
      ));
    }
    if (role) {
      conditions.push(eq(users.role, role as string));
    }
    if (orgId) {
      conditions.push(eq(users.orgId, orgId as string));
    }

    const usersList = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      orgId: users.orgId,
      isProvisioned: users.isProvisioned,
      corporateAccessAdmin: users.corporateAccessAdmin,
      canGrantSensitiveDataAccess: users.canGrantSensitiveDataAccess,
      canGrantExports: users.canGrantExports,
      createdAt: users.createdAt,
      heymarketMemberId: users.heymarketMemberId,
    })
    .from(users)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(200);

    res.json(usersList);
  } catch (error) {
    console.error("[Platform] List users error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list users" });
  }
});

const grantSASchema = z.object({
  justification: z.string().min(5, "Justification is required"),
});

router.post("/users/:userId/grant-super-admin", async (req: any, res: Response) => {
  try {
    const { userId } = req.params;
    const validation = grantSASchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: validation.error.errors[0]?.message });
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    if (isSuperAdmin(targetUser.role || "")) {
      return res.status(400).json({ error: "ALREADY_SUPER_ADMIN", message: "User is already a Super Admin" });
    }

    const previousRole = targetUser.role;

    await db.update(users)
      .set({ role: "super_admin", updatedAt: new Date() })
      .where(eq(users.id, userId));

    await logSuperAdminAction(
      req.currentUser, "grant_super_admin", "role_management",
      "user", userId, targetUser.email || undefined,
      { previousRole, justification: validation.data.justification },
      req.ip
    );

    res.json({ success: true, message: `Super Admin access granted to ${targetUser.email}` });
  } catch (error) {
    console.error("[Platform] Grant SA error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to grant Super Admin" });
  }
});

router.post("/users/:userId/revoke-super-admin", async (req: any, res: Response) => {
  try {
    const { userId } = req.params;
    const validation = grantSASchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: validation.error.errors[0]?.message });
    }

    if (userId === req.currentUser.id) {
      return res.status(400).json({ error: "SELF_MODIFICATION", message: "Cannot revoke your own Super Admin access" });
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    if (!isSuperAdmin(targetUser.role || "")) {
      return res.status(400).json({ error: "NOT_SUPER_ADMIN", message: "User is not a Super Admin" });
    }

    await db.update(users)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(users.id, userId));

    await logSuperAdminAction(
      req.currentUser, "revoke_super_admin", "role_management",
      "user", userId, targetUser.email || undefined,
      { previousRole: targetUser.role, justification: validation.data.justification },
      req.ip
    );

    res.json({ success: true, message: `Super Admin access revoked from ${targetUser.email}` });
  } catch (error) {
    console.error("[Platform] Revoke SA error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to revoke Super Admin" });
  }
});

// PATCH /users/:userId/heymarket-member — set or clear a user's Heymarket member ID
router.patch("/users/:userId/heymarket-member", async (req: any, res: Response) => {
  try {
    const { userId } = req.params;
    const { heymarketMemberId } = req.body as { heymarketMemberId: number | null };

    const [targetUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    await db.update(users)
      .set({ heymarketMemberId: heymarketMemberId ?? null, updatedAt: new Date() })
      .where(eq(users.id, userId));

    await logSuperAdminAction(
      req.currentUser, "set_heymarket_member_id", "integrations",
      "user", userId, targetUser.email || undefined,
      { heymarketMemberId },
      req.ip
    );

    res.json({ success: true, heymarketMemberId });
  } catch (error) {
    console.error("[Platform] Set Heymarket member error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update Heymarket member ID" });
  }
});

router.get("/feature-toggles", async (req: any, res: Response) => {
  try {
    const toggles = await db.select().from(platformFeatureToggles).orderBy(platformFeatureToggles.key);
    res.json(toggles);
  } catch (error) {
    console.error("[Platform] Feature toggles error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list feature toggles" });
  }
});

const toggleSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  scope: z.enum(["platform", "account"]).default("platform"),
  enabled: z.boolean().default(false),
});

router.post("/feature-toggles", async (req: any, res: Response) => {
  try {
    const validation = toggleSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: validation.error.errors[0]?.message });
    }

    const [toggle] = await db.insert(platformFeatureToggles).values({
      ...validation.data,
      updatedBy: req.currentUser.id,
    }).returning();

    await logSuperAdminAction(
      req.currentUser, "create_feature_toggle", "feature_management",
      "feature_toggle", toggle.id, toggle.key,
      { enabled: toggle.enabled, scope: toggle.scope },
      req.ip
    );

    res.json(toggle);
  } catch (error) {
    console.error("[Platform] Create toggle error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create feature toggle" });
  }
});

const updateToggleSchema = z.object({
  enabled: z.boolean().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  orgOverrides: z.record(z.boolean()).optional(),
});

router.patch("/feature-toggles/:toggleId", async (req: any, res: Response) => {
  try {
    const { toggleId } = req.params;
    const validation = updateToggleSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: validation.error.errors[0]?.message });
    }

    const [existing] = await db.select().from(platformFeatureToggles).where(eq(platformFeatureToggles.id, toggleId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Feature toggle not found" });
    }

    const updateData: any = { updatedAt: new Date(), updatedBy: req.currentUser.id };
    if (validation.data.enabled !== undefined) updateData.enabled = validation.data.enabled;
    if (validation.data.label !== undefined) updateData.label = validation.data.label;
    if (validation.data.description !== undefined) updateData.description = validation.data.description;
    if (validation.data.orgOverrides !== undefined) updateData.orgOverrides = validation.data.orgOverrides;

    const [updated] = await db.update(platformFeatureToggles)
      .set(updateData)
      .where(eq(platformFeatureToggles.id, toggleId))
      .returning();

    await logSuperAdminAction(
      req.currentUser, "update_feature_toggle", "feature_management",
      "feature_toggle", toggleId, existing.key,
      { changes: validation.data, previousState: { enabled: existing.enabled } },
      req.ip
    );

    res.json(updated);
  } catch (error) {
    console.error("[Platform] Update toggle error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update feature toggle" });
  }
});

router.delete("/feature-toggles/:toggleId", async (req: any, res: Response) => {
  try {
    const { toggleId } = req.params;
    const [existing] = await db.select().from(platformFeatureToggles).where(eq(platformFeatureToggles.id, toggleId)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Feature toggle not found" });
    }

    await db.delete(platformFeatureToggles).where(eq(platformFeatureToggles.id, toggleId));

    await logSuperAdminAction(
      req.currentUser, "delete_feature_toggle", "feature_management",
      "feature_toggle", toggleId, existing.key,
      { deletedToggle: { key: existing.key, label: existing.label } },
      req.ip
    );

    res.json({ success: true });
  } catch (error) {
    console.error("[Platform] Delete toggle error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to delete feature toggle" });
  }
});

router.get("/audit-log", async (req: any, res: Response) => {
  try {
    const { category, action, actorId, limit: limitParam } = req.query;
    const conditions: any[] = [];

    if (category) conditions.push(eq(superAdminAuditLog.category, category as string));
    if (action) conditions.push(eq(superAdminAuditLog.action, action as string));
    if (actorId) conditions.push(eq(superAdminAuditLog.actorId, actorId as string));

    const limit = Math.min(parseInt(limitParam as string) || 100, 500);

    const logs = await db.select()
      .from(superAdminAuditLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(superAdminAuditLog.createdAt))
      .limit(limit);

    res.json(logs);
  } catch (error) {
    console.error("[Platform] Audit log error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch audit log" });
  }
});

const systemOverrideSchema = z.object({
  overrideType: z.enum(["rate_override", "status_override", "access_override"]),
  targetType: z.enum(["user", "organization"]),
  targetId: z.string().min(1),
  value: z.any(),
  justification: z.string().min(5),
  expiresAt: z.string().datetime().optional(),
});

router.post("/system-overrides", async (req: any, res: Response) => {
  try {
    const validation = systemOverrideSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: validation.error.errors[0]?.message });
    }

    const { overrideType, targetType, targetId, value, justification, expiresAt } = validation.data;

    if (targetType === "user") {
      const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
      if (!target) return res.status(404).json({ error: "NOT_FOUND", message: "Target user not found" });

      if (overrideType === "status_override") {
        await db.update(users).set({ status: value, updatedAt: new Date() }).where(eq(users.id, targetId));
      } else if (overrideType === "access_override") {
        const updateData: any = { updatedAt: new Date() };
        if (value.role) updateData.role = value.role;
        if (value.isProvisioned !== undefined) updateData.isProvisioned = value.isProvisioned;
        await db.update(users).set(updateData).where(eq(users.id, targetId));
      }
    } else if (targetType === "organization") {
      const [target] = await db.select().from(organizations).where(eq(organizations.id, targetId)).limit(1);
      if (!target) return res.status(404).json({ error: "NOT_FOUND", message: "Target organization not found" });

      if (overrideType === "status_override") {
        await db.update(organizations).set({ isActive: value, updatedAt: new Date() }).where(eq(organizations.id, targetId));
      }
    }

    await logSuperAdminAction(
      req.currentUser, `system_override_${overrideType}`, "system_override",
      targetType, targetId, undefined,
      { overrideType, value, justification, expiresAt },
      req.ip
    );

    res.json({ success: true, message: `${overrideType} applied successfully` });
  } catch (error) {
    console.error("[Platform] System override error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to apply system override" });
  }
});

// ── Global Report Schedule ──────────────────────────────────────────────────
// Days of week for UI + cron mapping
const REPORT_SCHEDULE_DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"] as const;

/** Returns the next UTC Date when a CST cron at (weekday dayNum, HH:MM) fires. */
function computeNextRun(day: string, time: string): Date {
  const DAY_NUM: Record<string, number> = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };
  const targetWeekday = DAY_NUM[day.toLowerCase()] ?? 1;
  const [hStr = "7", mStr = "5"] = time.split(":");
  const tH = parseInt(hStr, 10);
  const tM = parseInt(mStr, 10);

  // current wall-clock in America/Chicago
  const now = new Date();
  const cstDateStr = now.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const cstNow = new Date(cstDateStr);
  const cwDay = cstNow.getDay();
  const cwH = cstNow.getHours();
  const cwM = cstNow.getMinutes();

  let daysUntil = (targetWeekday - cwDay + 7) % 7;
  if (daysUntil === 0 && (cwH > tH || (cwH === tH && cwM >= tM))) daysUntil = 7;

  // Build the next run date in CST terms, then convert to UTC via offset
  const nextCstMidnight = new Date(cstNow);
  nextCstMidnight.setDate(cstNow.getDate() + daysUntil);
  nextCstMidnight.setHours(tH, tM, 0, 0);

  // Determine actual UTC offset for that future moment (handles DST)
  const approxUtcMs = nextCstMidnight.getTime() + 6 * 3600_000; // rough UTC (CST = -6)
  const approxUtcDate = new Date(approxUtcMs);
  const approxCstStr = approxUtcDate.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const approxCstDate = new Date(approxCstStr);
  const offsetMs = approxUtcDate.getTime() - approxCstDate.getTime();

  return new Date(nextCstMidnight.getTime() + offsetMs);
}

// GET /api/platform/report-schedule
router.get("/report-schedule", async (req: any, res: Response) => {
  const user = await getUserFromSession(req);
  if (!user || !isSuperAdmin(user.role)) return res.status(403).json({ error: "FORBIDDEN" });

  try {
    const { pool } = await import("../db");

    // Read global config
    const dayConf  = await resolveConfig("report.global.send_day");
    const timeConf = await resolveConfig("report.global.send_time");
    const tzConf   = await resolveConfig("report.global.timezone_rule");

    const sendDay  = (dayConf?.configValue  as string | undefined) ?? "monday";
    const sendTime = (timeConf?.configValue as string | undefined) ?? "07:05";
    const tzRule   = (tzConf?.configValue   as string | undefined) ?? "cst";

    // Last completed batch stats from account_report_logs
    const lastBatchRow = await pool.query(`
      SELECT
        date_trunc('minute', MIN(created_at)) AS batch_started,
        COUNT(*)                              AS accounts_attempted,
        SUM(CASE WHEN email_sent = true THEN 1 ELSE 0 END) AS emails_sent,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)  AS errors
      FROM account_report_logs
      WHERE created_at >= (
        SELECT MAX(created_at) - interval '1 hour'
        FROM account_report_logs
        WHERE triggered_by = 'scheduler'
      )
        AND triggered_by = 'scheduler'
    `);
    const lastBatch = lastBatchRow.rows[0] ?? {};

    // Recent runs (one row per batch, grouped by report_week)
    const recentRunsRow = await pool.query(`
      SELECT
        report_week,
        MIN(created_at)  AS ran_at,
        COUNT(*)         AS accounts,
        SUM(CASE WHEN email_sent = true THEN 1 ELSE 0 END) AS emails_sent,
        SUM(CASE WHEN status = 'error'  THEN 1 ELSE 0 END) AS errors,
        triggered_by
      FROM account_report_logs
      WHERE triggered_by IN ('scheduler','manual')
      GROUP BY report_week, triggered_by
      ORDER BY report_week DESC
      LIMIT 10
    `);

    const nextRun = computeNextRun(sendDay, sendTime);

    res.json({
      sendDay,
      sendTime,
      tzRule,
      activeCron: activeWeeklyReportCron,
      lastRun: lastBatch.batch_started ?? null,
      emailsSent: parseInt(lastBatch.emails_sent ?? "0", 10),
      accountsAttempted: parseInt(lastBatch.accounts_attempted ?? "0", 10),
      errors: parseInt(lastBatch.errors ?? "0", 10),
      nextScheduledRun: nextRun.toISOString(),
      recentRuns: recentRunsRow.rows,
    });
  } catch (e: any) {
    console.error("[Platform] report-schedule GET error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
});

// PUT /api/platform/report-schedule
const reportScheduleSchema = z.object({
  sendDay:  z.enum(["sunday","monday","tuesday","wednesday","thursday","friday","saturday"]),
  sendTime: z.string().regex(/^\d{1,2}:\d{2}$/, "Must be HH:MM"),
  tzRule:   z.string().optional(),
});
router.put("/report-schedule", async (req: any, res: Response) => {
  const user = await getUserFromSession(req);
  if (!user || !isSuperAdmin(user.role)) return res.status(403).json({ error: "FORBIDDEN" });

  const parsed = reportScheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION", details: parsed.error.issues });

  const { sendDay, sendTime, tzRule = "cst" } = parsed.data;

  try {
    // Persist to platform_configs
    await upsertConfig("report.global.send_day",     sendDay,  { label: "Global Report Send Day",  scope: "global" });
    await upsertConfig("report.global.send_time",    sendTime, { label: "Global Report Send Time", scope: "global" });
    await upsertConfig("report.global.timezone_rule",tzRule,   { label: "Global Report Timezone",  scope: "global" });

    // Hot-reschedule the cron (no restart needed)
    const cronExpr = rescheduleWeeklyReports(sendDay, sendTime);
    const nextRun  = computeNextRun(sendDay, sendTime);

    // Audit log
    try {
      await db.insert(superAdminAuditLog).values({
        actorId:    user.id,
        actorEmail: user.email,
        action:     "report.schedule.updated",
        targetType: "platform_config",
        details:    JSON.stringify({ sendDay, sendTime, cronExpr }),
      } as any);
    } catch (_) { /* non-fatal */ }

    res.json({
      success: true,
      sendDay,
      sendTime,
      tzRule,
      cronExpr,
      nextScheduledRun: nextRun.toISOString(),
    });
  } catch (e: any) {
    console.error("[Platform] report-schedule PUT error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
});

// ── Communications / Heymarket Config ─────────────────────────────────────

// GET /api/platform/sms/status — Heymarket readiness without exposing secrets
router.get("/sms/status", async (req: any, res: Response) => {
  const user = await getUserFromSession(req);
  if (!user || !isSuperAdmin(user.role)) return res.status(403).json({ error: "FORBIDDEN" });
  try {
    const status = await getHeymarketStatus();
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
});

// PUT /api/platform/sms/config — Save Heymarket inbox_id, creator_id, and toggle feature flag
router.put("/sms/config", async (req: any, res: Response) => {
  const user = await getUserFromSession(req);
  if (!user || !isSuperAdmin(user.role)) return res.status(403).json({ error: "FORBIDDEN" });
  const { inboxId, creatorId, featureFlagEnabled } = req.body as { inboxId?: number; creatorId?: number | null; featureFlagEnabled?: boolean };
  try {
    if (inboxId !== undefined) {
      await upsertConfig("sms.heymarket.inbox_id", inboxId, { label: "Heymarket Inbox ID", scope: "global" });
    }
    if (creatorId !== undefined) {
      if (creatorId === null || creatorId === 0) {
        // Allow clearing the creator_id by storing null (empty string clears it)
        await upsertConfig("sms.heymarket.creator_id", null, { label: "Heymarket Creator ID", scope: "global" });
      } else {
        await upsertConfig("sms.heymarket.creator_id", creatorId, { label: "Heymarket Creator ID", scope: "global" });
      }
    }
    if (featureFlagEnabled !== undefined) {
      await upsertConfig("heymarket_texting_enabled", featureFlagEnabled, { label: "Heymarket SMS Enabled", scope: "global" });
    }
    const status = await getHeymarketStatus();
    res.json({ success: true, status });
  } catch (e: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
});

// POST /api/platform/sms/test — Send a test SMS via Heymarket
router.post("/sms/test", async (req: any, res: Response) => {
  const user = await getUserFromSession(req);
  if (!user || !isSuperAdmin(user.role)) return res.status(403).json({ error: "FORBIDDEN" });
  const { toPhone, message } = req.body as { toPhone?: string; message?: string };
  if (!toPhone?.trim()) return res.status(400).json({ error: "toPhone is required" });
  if (!message?.trim()) return res.status(400).json({ error: "message is required" });
  try {
    const result = await sendTestSms(toPhone.trim(), message.trim(), user.id);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
});

// POST /api/platform/sms/validate-phones/:accountId
// Batch-validates phone numbers for all drivers in an account and persists the results.
router.post("/sms/validate-phones/:accountId", async (req: any, res: Response) => {
  const user = await getUserFromSession(req);
  if (!user || !isSuperAdmin(user.role)) return res.status(403).json({ error: "FORBIDDEN" });
  const { accountId } = req.params;
  try {
    // Fetch all drivers for the account
    const { rows } = await pool.query<{ id: string; phone_number: string | null }>(
      `SELECT d.id, d.phone_number
       FROM driver_accounts da
       JOIN drivers d ON d.id = da.driver_id
       WHERE da.account_id = $1
         AND da.assignment_ended_at IS NULL`,
      [accountId],
    );

    const patches = batchValidatePhones(rows.map(r => ({ id: r.id, phoneNumber: r.phone_number })));

    // Persist results
    for (const p of patches) {
      await pool.query(
        `UPDATE drivers SET
           mobile_phone_normalized  = $1,
           mobile_phone_is_valid    = $2,
           sms_eligible             = $3,
           sms_invalid_reason       = $4,
           last_phone_validation_at = $5
         WHERE id = $6`,
        [p.mobilePhoneNormalized, p.mobilePhoneIsValid, p.smsEligible, p.smsInvalidReason, p.lastPhoneValidationAt, p.id],
      );
    }

    const eligible = patches.filter(p => p.smsEligible).length;
    const invalid  = patches.filter(p => !p.smsEligible && p.mobilePhoneNormalized !== null).length;
    const missing  = patches.filter(p => !p.mobilePhoneNormalized).length;
    res.json({ total: patches.length, eligible, invalid, missing });
  } catch (e: any) {
    console.error("[Platform] validate-phones error:", e);
    res.status(500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
});

// GET /api/platform/sms/stats — global SMS activity summary
router.get("/sms/stats", async (req: any, res: Response) => {
  const user = await getUserFromSession(req);
  if (!user || !isSuperAdmin(user.role)) return res.status(403).json({ error: "FORBIDDEN" });
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent')                  AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')                AS failed,
        COUNT(*) FILTER (WHERE status = 'pending_integration')   AS pending,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS last_7_days,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS last_30_days,
        COUNT(DISTINCT bulk_send_id) FILTER (WHERE bulk_send_id IS NOT NULL) AS bulk_sends
      FROM driver_communication_logs
      WHERE channel = 'sms'
    `);
    const recent = await pool.query(`
      SELECT bulk_send_id, MIN(created_at) AS sent_at,
             COUNT(*) AS recipients,
             COUNT(*) FILTER (WHERE status = 'sent')   AS sent,
             COUNT(*) FILTER (WHERE status = 'failed') AS failed,
             context_module,
             MIN(recipient_name) AS sample_name
      FROM driver_communication_logs
      WHERE channel = 'sms' AND bulk_send_id IS NOT NULL
      GROUP BY bulk_send_id, context_module
      ORDER BY MIN(created_at) DESC
      LIMIT 10
    `);
    res.json({ totals: rows[0], recentBulkSends: recent.rows });
  } catch (e: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: e.message });
  }
});

// ── Communication Templates (T006) ───────────────────────────────────────────

router.get("/comm/templates", async (req: any, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT slug, name, channel,
              subject_template AS subject,
              body_html_template AS body_html,
              variables,
              is_active AS active,
              updated_at
       FROM comm_templates ORDER BY slug`
    );
    res.json(r.rows);
  } catch (err: any) {
    console.error("[Platform] comm/templates list error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/comm/templates/:slug", async (req: any, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT slug, name, channel,
              subject_template AS subject,
              body_html_template AS body_html,
              variables,
              is_active AS active,
              updated_at
       FROM comm_templates WHERE slug = $1 LIMIT 1`,
      [req.params.slug]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "NOT_FOUND" });
    res.json(r.rows[0]);
  } catch (err: any) {
    console.error("[Platform] comm/templates get error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

const updateTemplateSchema = z.object({
  name:      z.string().min(1).optional(),
  subject:   z.string().min(1).optional(),
  body_html: z.string().min(1).optional(),
  active:    z.boolean().optional(),
});

router.put("/comm/templates/:slug", async (req: any, res: Response) => {
  try {
    const parse = updateTemplateSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: "VALIDATION_ERROR", errors: parse.error.errors });

    const d = parse.data;
    const sets: string[] = [];
    const vals: any[]   = [];
    let idx = 1;
    if (d.name      !== undefined) { sets.push(`name = $${idx++}`);              vals.push(d.name); }
    if (d.subject   !== undefined) { sets.push(`subject_template = $${idx++}`);  vals.push(d.subject); }
    if (d.body_html !== undefined) { sets.push(`body_html_template = $${idx++}`); vals.push(d.body_html); }
    if (d.active    !== undefined) { sets.push(`is_active = $${idx++}`);          vals.push(d.active); }

    if (!sets.length) return res.status(400).json({ error: "NO_FIELDS" });
    sets.push(`updated_at = now()`);
    vals.push(req.params.slug);

    await pool.query(
      `UPDATE comm_templates SET ${sets.join(", ")} WHERE slug = $${idx}`,
      vals
    );
    // Invalidate template cache in templateEngine
    const { invalidateTemplateCache } = await import("../services/communications/templateEngine");
    invalidateTemplateCache(req.params.slug);

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[Platform] comm/templates update error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ── Recipient Rules ───────────────────────────────────────────────────────────

router.get("/comm/recipient-rules", async (req: any, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT id, event_slug, channel, recipient_type, recipient_value, enabled, created_at
       FROM comm_recipient_rules ORDER BY event_slug, id`
    );
    res.json(r.rows);
  } catch (err: any) {
    console.error("[Platform] comm/recipient-rules list error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

const upsertRuleSchema = z.object({
  event_slug:       z.string().min(1),
  channel:          z.enum(["email", "sms", "in_app"]),
  recipient_type:   z.enum(["role", "user", "email"]),
  recipient_value:  z.string().min(1),
  enabled:          z.boolean().default(true),
});

router.post("/comm/recipient-rules", async (req: any, res: Response) => {
  try {
    const parse = upsertRuleSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: "VALIDATION_ERROR", errors: parse.error.errors });
    const d = parse.data;
    const r = await pool.query(
      `INSERT INTO comm_recipient_rules (event_slug, channel, recipient_type, recipient_value, enabled)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [d.event_slug, d.channel, d.recipient_type, d.recipient_value, d.enabled]
    );
    res.status(201).json(r.rows[0]);
  } catch (err: any) {
    console.error("[Platform] comm/recipient-rules create error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.put("/comm/recipient-rules/:id", async (req: any, res: Response) => {
  try {
    const parse = upsertRuleSchema.partial().safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: "VALIDATION_ERROR", errors: parse.error.errors });
    const d = parse.data;
    const sets: string[] = [];
    const vals: any[]   = [];
    let idx = 1;
    if (d.event_slug      !== undefined) { sets.push(`event_slug = $${idx++}`);      vals.push(d.event_slug); }
    if (d.channel         !== undefined) { sets.push(`channel = $${idx++}`);          vals.push(d.channel); }
    if (d.recipient_type  !== undefined) { sets.push(`recipient_type = $${idx++}`);  vals.push(d.recipient_type); }
    if (d.recipient_value !== undefined) { sets.push(`recipient_value = $${idx++}`); vals.push(d.recipient_value); }
    if (d.enabled         !== undefined) { sets.push(`enabled = $${idx++}`);          vals.push(d.enabled); }
    if (!sets.length) return res.status(400).json({ error: "NO_FIELDS" });
    vals.push(req.params.id);
    const r = await pool.query(
      `UPDATE comm_recipient_rules SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!r.rows[0]) return res.status(404).json({ error: "NOT_FOUND" });
    res.json(r.rows[0]);
  } catch (err: any) {
    console.error("[Platform] comm/recipient-rules update error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.delete("/comm/recipient-rules/:id", async (req: any, res: Response) => {
  try {
    const r = await pool.query(
      `DELETE FROM comm_recipient_rules WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "NOT_FOUND" });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[Platform] comm/recipient-rules delete error:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

router.get("/stats", async (req: any, res: Response) => {
  try {
    const [orgCount] = await db.select({ count: sql<number>`count(*)::int` }).from(organizations);
    const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [activeUserCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.status, "ACTIVE"));
    const [saCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(
      or(eq(users.role, "super_user"), eq(users.role, "super_admin"))
    );

    const recentAudit = await db.select()
      .from(superAdminAuditLog)
      .orderBy(desc(superAdminAuditLog.createdAt))
      .limit(5);

    res.json({
      totalOrganizations: orgCount.count,
      totalUsers: userCount.count,
      activeUsers: activeUserCount.count,
      superAdminCount: saCount.count,
      recentActivity: recentAudit,
    });
  } catch (error) {
    console.error("[Platform] Stats error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch platform stats" });
  }
});

export default router;
