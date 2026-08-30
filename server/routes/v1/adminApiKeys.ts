/**
 * DriverConnect Integration Module — Admin API Key Management
 * Mounted under /api/admin/v1 — protected by corporate session auth
 *
 * GET    /api/admin/v1/api-keys
 * POST   /api/admin/v1/api-keys
 * DELETE /api/admin/v1/api-keys/:id
 * GET    /api/admin/v1/webhooks
 * POST   /api/admin/v1/webhooks
 * DELETE /api/admin/v1/webhooks/:id
 * GET    /api/admin/v1/audit-log
 * GET    /api/admin/v1/events
 */
import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  v1ApiKeys, webhookEndpoints, webhookDeliveryLog, v1AuditLog, v1ExecutionEvents, users, organizations,
  ssoTokens, userAppEntitlements, dcProvisionedUsers, ssoAuditLog,
} from '@shared/schema';
import { eq, desc, and, sql, ilike, or, inArray } from 'drizzle-orm';
import crypto from 'crypto';

const router = Router();

// Auth check — must be authenticated corporate user (fetches role from DB)
async function requireCorporateAuth(req: Request, res: Response, next: Function) {
  const sessionUser = (req as any).user;
  const userId = (req as any).session?.userId || sessionUser?.claims?.sub;
  if (!userId) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Corporate authentication required.' });
  }
  try {
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const dbUser = rows[0];
    if (!dbUser) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User not found.' });
    }
    const allowedRoles = ['super_user', 'super_admin', 'admin', 'corporate_admin', 'manager', 'root_super_admin'];
    if (!allowedRoles.includes(dbUser.role || '') && !dbUser.isRootSuperAdmin) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient permissions to manage API keys.' });
    }
    (req as any).dbUser = dbUser;
    next();
  } catch (err) {
    console.error('[adminApiKeys] Auth check failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Authentication check failed.' });
  }
}

const AVAILABLE_SCOPES = [
  '*',
  // Master Data — Read
  'read:drivers', 'read:accounts', 'read:locations', 'read:service-types',
  'read:moves', 'read:schedules', 'read:users', 'read:documents',
  // Operations & Events — Read
  'read:execution', 'read:time', 'read:expenses',
  // Financial — Read
  'read:invoices', 'read:payments',
  // Webhooks — Read
  'read:webhooks',
  // SSO Identity — Read
  'read:sso-identity',
  // Operations — Write
  'write:moves', 'write:dispatch', 'write:execution', 'write:exceptions',
  'write:time', 'write:expenses', 'write:documents',
  // Webhooks — Manage
  'manage:webhooks',
];

// ─── GET /api/admin/v1/api-keys ───────────────────────────────────────────
router.get('/api-keys', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: v1ApiKeys.id,
        name: v1ApiKeys.name,
        description: v1ApiKeys.description,
        keyPrefix: v1ApiKeys.keyPrefix,
        scopes: v1ApiKeys.scopes,
        isActive: v1ApiKeys.isActive,
        lastUsedAt: v1ApiKeys.lastUsedAt,
        expiresAt: v1ApiKeys.expiresAt,
        orgId: v1ApiKeys.orgId,
        createdBy: v1ApiKeys.createdBy,
        createdAt: v1ApiKeys.createdAt,
      })
      .from(v1ApiKeys)
      .orderBy(desc(v1ApiKeys.createdAt));

    res.json({ success: true, data: rows, available_scopes: AVAILABLE_SCOPES });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch API keys.' });
  }
});

// ─── POST /api/admin/v1/api-keys ──────────────────────────────────────────
router.post('/api-keys', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).dbUser;
    const { name, description, scopes = ['*'], expires_in_days, org_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name is required.' });
    }

    const invalidScopes = (scopes as string[]).filter(s => !AVAILABLE_SCOPES.includes(s));
    if (invalidScopes.length) {
      return res.status(400).json({
        error: 'INVALID_SCOPES',
        message: `Invalid scopes: ${invalidScopes.join(', ')}`,
        available_scopes: AVAILABLE_SCOPES,
      });
    }

    // Generate the raw API key: dhk_live_ + 40 random hex chars
    const rawKey = `dhk_live_${crypto.randomBytes(20).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 18); // "dhk_live_xxxxxxxx"

    const expiresAt = expires_in_days
      ? new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000)
      : undefined;

    // Resolve orgId — use passed org_id or look up first org
    let resolvedOrgId = org_id;
    if (!resolvedOrgId) {
      const orgs = await db.select({ id: organizations.id }).from(organizations).limit(1);
      resolvedOrgId = orgs[0]?.id ?? null;
    }

    const [apiKey] = await db.insert(v1ApiKeys).values({
      name,
      description,
      keyHash,
      keyPrefix,
      orgId: resolvedOrgId,
      scopes,
      isActive: true,
      expiresAt,
      createdBy: user.id || user.claims?.sub,
    }).returning({
      id: v1ApiKeys.id,
      name: v1ApiKeys.name,
      description: v1ApiKeys.description,
      keyPrefix: v1ApiKeys.keyPrefix,
      scopes: v1ApiKeys.scopes,
      isActive: v1ApiKeys.isActive,
      expiresAt: v1ApiKeys.expiresAt,
      createdAt: v1ApiKeys.createdAt,
    });

    res.status(201).json({
      success: true,
      data: {
        ...apiKey,
        api_key: rawKey, // RAW KEY — only shown once
      },
      warning: 'Store the api_key value securely. It cannot be retrieved again.',
    });
  } catch (err: any) {
    console.error('[Admin v1] POST /api-keys error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to create API key.' });
  }
});

// ─── DELETE /api/admin/v1/api-keys/:id ────────────────────────────────────
router.delete('/api-keys/:id', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const [existing] = await db.select().from(v1ApiKeys).where(eq(v1ApiKeys.id, req.params.id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'API key not found.' });

    await db.update(v1ApiKeys).set({ isActive: false }).where(eq(v1ApiKeys.id, req.params.id));
    res.json({ success: true, message: `API key "${existing.name}" has been revoked.` });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to revoke API key.' });
  }
});

// ─── GET /api/admin/v1/webhooks ───────────────────────────────────────────
router.get('/webhooks', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: webhookEndpoints.id,
        name: webhookEndpoints.name,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        isActive: webhookEndpoints.isActive,
        description: webhookEndpoints.description,
        createdAt: webhookEndpoints.createdAt,
        updatedAt: webhookEndpoints.updatedAt,
      })
      .from(webhookEndpoints)
      .orderBy(desc(webhookEndpoints.createdAt));

    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch webhooks.' });
  }
});

// ─── POST /api/admin/v1/webhooks ──────────────────────────────────────────
router.post('/webhooks', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).dbUser;
    const { name, url, events, description, org_id } = req.body;

    if (!name || !url || !events?.length) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name, url, and events[] are required.' });
    }

    let resolvedOrgId = org_id;
    if (!resolvedOrgId) {
      const orgs = await db.select({ id: organizations.id }).from(organizations).limit(1);
      resolvedOrgId = orgs[0]?.id ?? null;
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const [endpoint] = await db.insert(webhookEndpoints).values({
      orgId: resolvedOrgId,
      name,
      url,
      secret,
      events,
      description,
      isActive: true,
      createdBy: user.id || user.claims?.sub,
    }).returning();

    res.status(201).json({
      success: true,
      data: { ...endpoint, signing_secret: secret },
      warning: 'Store the signing_secret securely. It cannot be retrieved again.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to register webhook.' });
  }
});

// ─── DELETE /api/admin/v1/webhooks/:id ────────────────────────────────────
router.delete('/webhooks/:id', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const [existing] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, req.params.id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Webhook endpoint not found.' });

    await db.update(webhookEndpoints).set({ isActive: false, updatedAt: new Date() }).where(eq(webhookEndpoints.id, req.params.id));
    res.json({ success: true, message: `Webhook "${existing.name}" deactivated.` });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to deactivate webhook.' });
  }
});

// ─── GET /api/admin/v1/audit-log ──────────────────────────────────────────
router.get('/audit-log', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(500, parseInt(req.query.limit as string) || 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const [rows, countRes] = await Promise.all([
      db.select().from(v1AuditLog).orderBy(desc(v1AuditLog.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(v1AuditLog),
    ]);

    res.json({
      success: true,
      data: rows,
      meta: { total: Number(countRes[0]?.count || 0), limit, offset },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch audit log.' });
  }
});

// ─── GET /api/admin/v1/events ─────────────────────────────────────────────
router.get('/events', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(500, parseInt(req.query.limit as string) || 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const { event_type, move_id } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (event_type) conditions.push(eq(v1ExecutionEvents.eventType, event_type));
    if (move_id) conditions.push(eq(v1ExecutionEvents.moveId, move_id));

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, countRes] = await Promise.all([
      db.select().from(v1ExecutionEvents).where(whereClause).orderBy(desc(v1ExecutionEvents.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(v1ExecutionEvents).where(whereClause),
    ]);

    res.json({
      success: true,
      data: rows,
      meta: { total: Number(countRes[0]?.count || 0), limit, offset },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch events.' });
  }
});

// ─── SSO IDENTITY ADMIN ENDPOINTS ──────────────────────────────────────────
// GET  /api/admin/v1/sso/users        — List users with their SSO config
// GET  /api/admin/v1/sso/users/:id    — Get SSO config for one user
// PATCH /api/admin/v1/sso/users/:id   — Update ssoRole + app access flags

const SSO_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DISPATCHER', 'DRIVER', 'READ_ONLY', 'CUSTOMER_ADMIN'];
const APP_CODES = ['DRIVERHUB', 'DRIVERCONNECT'];
const ROLE_MAP: Record<string, string> = {
  super_user: 'SUPER_ADMIN', root_super_admin: 'SUPER_ADMIN', super_admin: 'SUPER_ADMIN',
  admin: 'ADMIN', corporate_admin: 'ADMIN', finance: 'ADMIN',
  regional_cl: 'MANAGER', network_cl: 'MANAGER', manager: 'MANAGER', ops_manager: 'MANAGER', recruiter: 'MANAGER',
  dispatcher: 'DISPATCHER',
  driver: 'DRIVER', employee: 'DRIVER',
  customer_admin: 'CUSTOMER_ADMIN', dealer_cl: 'CUSTOMER_ADMIN', certification_liaison: 'CUSTOMER_ADMIN',
};

router.get('/sso/users', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db.select({
      id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName,
      role: users.role, status: users.status, orgId: users.orgId,
      ssoRole: users.ssoRole, ssoSubjectId: users.ssoSubjectId,
      hasDriverHubAccess: users.hasDriverHubAccess,
      hasDriverConnectAccess: users.hasDriverConnectAccess,
      lastLoginAt: users.lastLoginAt,
    }).from(users).orderBy(users.email);

    // Pull entitlements for all users in batch
    const userIds = rows.map(r => r.id);
    let entitlementRows: any[] = [];
    if (userIds.length > 0) {
      entitlementRows = await db.select().from(userAppEntitlements)
        .where(inArray(userAppEntitlements.userId, userIds));
    }
    const entitlementsByUser: Record<string, any[]> = {};
    for (const e of entitlementRows) {
      if (!entitlementsByUser[e.userId]) entitlementsByUser[e.userId] = [];
      entitlementsByUser[e.userId].push(e);
    }

    const data = rows.map(u => {
      const ents = entitlementsByUser[u.id] ?? [];
      const dhEnt = ents.find((e: any) => e.appCode === 'DRIVERHUB');
      const dcEnt = ents.find((e: any) => e.appCode === 'DRIVERCONNECT');
      return {
        ...u,
        effectiveSsoRole: u.ssoRole ?? (ROLE_MAP[u.role || ''] ?? 'READ_ONLY'),
        appEntitlements: [
          { appCode: 'DRIVERHUB', accessGranted: dhEnt ? dhEnt.accessGranted : (u.hasDriverHubAccess ?? true), grantedAt: dhEnt?.grantedAt ?? null, revokedAt: dhEnt?.revokedAt ?? null, entitlementId: dhEnt?.id ?? null },
          { appCode: 'DRIVERCONNECT', accessGranted: dcEnt ? dcEnt.accessGranted : (u.hasDriverConnectAccess ?? false), grantedAt: dcEnt?.grantedAt ?? null, revokedAt: dcEnt?.revokedAt ?? null, entitlementId: dcEnt?.id ?? null },
        ],
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('[SSO admin] list error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to list users.' });
  }
});

router.get('/sso/users/:id', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db.select({
      id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName,
      role: users.role, status: users.status, orgId: users.orgId,
      ssoRole: users.ssoRole, ssoSubjectId: users.ssoSubjectId,
      hasDriverHubAccess: users.hasDriverHubAccess,
      hasDriverConnectAccess: users.hasDriverConnectAccess,
      lastLoginAt: users.lastLoginAt,
    }).from(users).where(eq(users.id, req.params.id)).limit(1);
    const u = rows[0];
    if (!u) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.' });
    res.json({ success: true, data: { ...u, effectiveSsoRole: u.ssoRole ?? (ROLE_MAP[u.role || ''] ?? 'READ_ONLY') } });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch user SSO config.' });
  }
});

router.patch('/sso/users/:id', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const { ssoRole, ssoSubjectId } = req.body;
    if (ssoRole !== undefined && ssoRole !== null && !SSO_ROLES.includes(ssoRole)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: `ssoRole must be one of: ${SSO_ROLES.join(', ')}` });
    }
    const updates: Record<string, any> = {};
    if (ssoRole !== undefined) updates.ssoRole = ssoRole || null;
    if (ssoSubjectId !== undefined) updates.ssoSubjectId = ssoSubjectId || null;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'No valid fields provided. Use /sso/users/:id/entitlements to manage app access.' });
    }
    await db.update(users).set(updates).where(eq(users.id, req.params.id));
    const rows = await db.select({
      id: users.id, email: users.email, ssoRole: users.ssoRole, ssoSubjectId: users.ssoSubjectId,
    }).from(users).where(eq(users.id, req.params.id)).limit(1);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[SSO admin] patch error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update SSO config.' });
  }
});

// ─── GET  /api/admin/v1/sso/users/:id/entitlements ─────────────────────────
router.get('/sso/users/:id/entitlements', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(userAppEntitlements)
      .where(eq(userAppEntitlements.userId, req.params.id));
    // Fill in any missing app codes
    const existing = new Set(rows.map((r: any) => r.appCode));
    const userRows = await db.select({ id: users.id, hasDriverHubAccess: users.hasDriverHubAccess, hasDriverConnectAccess: users.hasDriverConnectAccess })
      .from(users).where(eq(users.id, req.params.id)).limit(1);
    const user = userRows[0];
    const result = [...rows];
    if (!existing.has('DRIVERHUB')) result.push({ userId: req.params.id, appCode: 'DRIVERHUB', accessGranted: user?.hasDriverHubAccess ?? true, grantedAt: null, revokedAt: null, grantedByUserId: null, notes: null, id: null, createdAt: null, updatedAt: null } as any);
    if (!existing.has('DRIVERCONNECT')) result.push({ userId: req.params.id, appCode: 'DRIVERCONNECT', accessGranted: user?.hasDriverConnectAccess ?? false, grantedAt: null, revokedAt: null, grantedByUserId: null, notes: null, id: null, createdAt: null, updatedAt: null } as any);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch entitlements.' });
  }
});

// ─── GET /api/admin/v1/sso/provisioned ─────────────────────────────────────
// List all DriverConnect provisioned users
router.get('/sso/provisioned', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(dcProvisionedUsers)
      .orderBy(desc(dcProvisionedUsers.lastLoginAt));
    res.json({ success: true, data: rows, meta: { total: rows.length } });
  } catch (err) {
    console.error('[SSO admin] provisioned list error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to list provisioned users.' });
  }
});

// ─── GET /api/admin/v1/sso/audit-log ───────────────────────────────────────
// List recent SSO audit events (admin session only)
router.get('/sso/audit-log', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(parseInt((req.query.limit as string) || '100'), 500);
    const offset = parseInt((req.query.offset as string) || '0');
    const rows = await db.select().from(ssoAuditLog)
      .orderBy(desc(ssoAuditLog.createdAt))
      .limit(limit).offset(offset);
    res.json({ success: true, data: rows, meta: { limit, offset, total: rows.length } });
  } catch (err) {
    console.error('[SSO admin] audit-log error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch SSO audit log.' });
  }
});

// ─── POST /api/admin/v1/sso/users/:id/entitlements ─────────────────────────
// Grant or revoke a specific app entitlement for a user.
// Body: { appCode: "DRIVERHUB"|"DRIVERCONNECT", accessGranted: boolean, notes?: string }
router.post('/sso/users/:id/entitlements', requireCorporateAuth, async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).dbUser?.id ?? null;
    const { appCode, accessGranted, notes } = req.body;
    if (!appCode || !APP_CODES.includes(appCode)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: `appCode must be one of: ${APP_CODES.join(', ')}` });
    }
    if (typeof accessGranted !== 'boolean') {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'accessGranted (boolean) is required.' });
    }

    const now = new Date();
    // Upsert: update if exists, insert if not
    const existing = await db.select({ id: userAppEntitlements.id })
      .from(userAppEntitlements)
      .where(and(eq(userAppEntitlements.userId, req.params.id), eq(userAppEntitlements.appCode, appCode)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(userAppEntitlements).set({
        accessGranted,
        grantedAt: accessGranted ? now : null,
        revokedAt: accessGranted ? null : now,
        grantedByUserId: actorId,
        notes: notes ?? null,
        updatedAt: now,
      }).where(eq(userAppEntitlements.id, existing[0].id));
    } else {
      await db.insert(userAppEntitlements).values({
        userId: req.params.id,
        appCode,
        accessGranted,
        grantedAt: accessGranted ? now : null,
        revokedAt: accessGranted ? null : now,
        grantedByUserId: actorId,
        notes: notes ?? null,
      });
    }

    // Keep boolean columns in sync for backward compat
    if (appCode === 'DRIVERHUB') await db.update(users).set({ hasDriverHubAccess: accessGranted }).where(eq(users.id, req.params.id));
    if (appCode === 'DRIVERCONNECT') await db.update(users).set({ hasDriverConnectAccess: accessGranted }).where(eq(users.id, req.params.id));

    const rows = await db.select().from(userAppEntitlements)
      .where(and(eq(userAppEntitlements.userId, req.params.id), eq(userAppEntitlements.appCode, appCode)))
      .limit(1);
    res.json({ success: true, data: rows[0], action: accessGranted ? 'granted' : 'revoked' });
  } catch (err) {
    console.error('[SSO admin] entitlement error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update entitlement.' });
  }
});

export default router;
