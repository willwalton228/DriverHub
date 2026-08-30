/**
 * DriverHub SSO Identity API  —  v3  (Cross-App SSO Architecture)
 * Mounted at /api/v1/sso
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  DESIGN RULES                                                           │
 * │  1. Authentication is centralized — DriverHub is the identity authority │
 * │  2. Authorization is app-specific — DriverConnect enforces its own RBAC │
 * │  3. DriverHub owns: identity, app access, high-level role classification │
 * │  4. DriverConnect owns: local roles, permissions, scope enforcement      │
 * │  5. Normal users auto-provisioned in DriverConnect on first login        │
 * │  6. Deactivation in DriverHub immediately blocks DriverConnect access    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Endpoints:
 *   GET  /sso/me              — Session auth; current user's full identity payload
 *   GET  /sso/identity        — API key auth; lookup user by ?userId= or ?email=
 *   POST /sso/token           — Session auth; issue short-lived (5 min) one-time SSO token
 *   POST /sso/token/exchange  — API key auth; exchange SSO token → identity payload
 *   POST /sso/provision       — API key auth; JIT provision/update DriverConnect user record
 *   GET  /sso/provision/:id   — API key auth; get provisioning record for a driverHubUserId
 *   GET  /sso/role-mapping    — Public; get role classification → DriverConnect role mapping table
 *
 * Identity Payload Contract (stable, backward-compatible):
 *   driverHubUserId  — permanent cross-system identifier (NEVER changes)
 *   userId           — backward compat alias
 *   email, firstName, lastName, fullName, displayName
 *   active           — false when status != ACTIVE
 *   ssoSubjectId     — external identity reference (opaque string)
 *   roleClassification — high-level role for DriverConnect role mapping
 *   ssoRole          — backward compat alias for roleClassification
 *   company          — { orgId, orgName }
 *   homeMarket       — driver's home market (if applicable)
 *   homeNetwork      — driver's home network (if applicable)
 *   branchId         — branch/location id (if applicable)
 *   companyId        — customer/account id (if applicable)
 *   appEntitlements  — array of { appCode, accessGranted, grantedAt, revokedAt }
 *   entitlements     — convenience object { hasDriverHubAccess, hasDriverConnectAccess }
 *   issuedAt         — ISO timestamp
 *   expiresAt        — ISO timestamp (for token-backed payloads only)
 *
 * SSO Role Classification Values:
 *   SUPER_ADMIN | ADMIN | MANAGER | DISPATCHER | DRIVER | READ_ONLY | CUSTOMER_ADMIN
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../../db';
import { users, ssoTokens, organizations, userAppEntitlements, drivers, dcProvisionedUsers, ssoAuditLog } from '@shared/schema';
import { eq, and, gt, inArray, desc } from 'drizzle-orm';
import { requireV1ApiKey, requireScope } from '../../middleware/v1ApiKeyAuth';

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────

export const SSO_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DISPATCHER', 'DRIVER', 'READ_ONLY', 'CUSTOMER_ADMIN'] as const;
export type SsoRole = typeof SSO_ROLES[number];

const SSO_ROLE_MAP: Record<string, SsoRole> = {
  super_user:              'SUPER_ADMIN',
  root_super_admin:        'SUPER_ADMIN',
  super_admin:             'SUPER_ADMIN',
  admin:                   'ADMIN',
  corporate_admin:         'ADMIN',
  finance:                 'ADMIN',
  regional_cl:             'MANAGER',
  network_cl:              'MANAGER',
  manager:                 'MANAGER',
  ops_manager:             'MANAGER',
  recruiter:               'MANAGER',
  dispatcher:              'DISPATCHER',
  driver:                  'DRIVER',
  employee:                'DRIVER',
  customer_admin:          'CUSTOMER_ADMIN',
  dealer_cl:               'CUSTOMER_ADMIN',
  certification_liaison:   'CUSTOMER_ADMIN',
};

/**
 * DriverConnect Role Mapping
 * Maps DriverHub role classification → suggested DriverConnect local role.
 * DriverConnect must maintain this as configurable; this table is the default seed.
 * Unmapped roles fail safely (do not grant broad access).
 */
export const DC_ROLE_MAPPING: Record<SsoRole, { dcRole: string; description: string; failSafe: boolean }> = {
  SUPER_ADMIN:    { dcRole: 'super_admin',     description: 'Full DriverConnect platform access',          failSafe: false },
  ADMIN:          { dcRole: 'ops_admin',        description: 'Operations administration',                   failSafe: false },
  MANAGER:        { dcRole: 'ops_admin',        description: 'Ops admin or account manager (configurable)', failSafe: false },
  DISPATCHER:     { dcRole: 'dispatcher',       description: 'Trip assignment and dispatch',                failSafe: false },
  DRIVER:         { dcRole: 'driver',           description: 'Field operations and trip execution',         failSafe: false },
  CUSTOMER_ADMIN: { dcRole: 'customer_admin',   description: 'Customer-side administration',               failSafe: false },
  READ_ONLY:      { dcRole: 'read_only',        description: 'View-only access',                           failSafe: true  },
};

export const APP_CODES = ['DRIVERHUB', 'DRIVERCONNECT'] as const;
export type AppCode = typeof APP_CODES[number];

// Token lifetime for SSO tokens
const SSO_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

function deriveRoleClassification(dbRole: string | null | undefined): SsoRole {
  if (!dbRole) return 'READ_ONLY';
  return SSO_ROLE_MAP[dbRole] ?? 'READ_ONLY';
}

// ─── SSO Audit Logger ─────────────────────────────────────────────────────────
async function auditLog(params: {
  userId?: string | null;
  email?: string | null;
  app: string;
  event: string;
  success: boolean;
  denialReason?: string | null;
  roleClassification?: string | null;
  dcLocalRole?: string | null;
  details?: Record<string, any>;
  req?: Request;
}) {
  try {
    await db.insert(ssoAuditLog).values({
      userId:             params.userId ?? null,
      email:              params.email ?? null,
      app:                params.app,
      event:              params.event,
      success:            params.success,
      denialReason:       params.denialReason ?? null,
      roleClassification: params.roleClassification ?? null,
      dcLocalRole:        params.dcLocalRole ?? null,
      details:            params.details ?? null,
      ipAddress:          params.req ? (params.req.headers['x-forwarded-for'] as string || params.req.socket?.remoteAddress || null) : null,
      userAgent:          params.req ? (params.req.headers['user-agent'] || null) : null,
      requestId:          params.req ? (params.req.headers['x-request-id'] as string || null) : null,
    });
  } catch (err) {
    // Audit failures must never block the main request
    console.error('[SSO Audit] Failed to write audit log:', err);
  }
}

// ─── Identity Payload Builder ─────────────────────────────────────────────────
async function buildIdentityPayload(user: any, opts?: {
  org?: any;
  entitlements?: any[];
  driverProfile?: any;
  expiresAt?: Date;
}) {
  // Fetch entitlements from table if not provided
  let entRows = opts?.entitlements;
  if (!entRows) {
    entRows = await db.select().from(userAppEntitlements).where(eq(userAppEntitlements.userId, user.id));
  }

  // Fetch org if not provided
  let org = opts?.org;
  if (!org && user.orgId) {
    const orgRows = await db.select({ id: organizations.id, name: organizations.name })
      .from(organizations).where(eq(organizations.id, user.orgId)).limit(1);
    org = orgRows[0] ?? null;
  }

  // Fetch driver profile for homeMarket, homeNetwork, branchId
  let driverProfile = opts?.driverProfile;
  if (!driverProfile) {
    const driverRows = await db.select({
      market: drivers.market,
      network: drivers.network,
      drivershiftCustomerId: drivers.drivershiftCustomerId,
    }).from(drivers).where(eq(drivers.userId, user.id)).limit(1);
    driverProfile = driverRows[0] ?? null;
  }

  // Build entitlements map — table is authoritative; boolean columns are fallback
  const entMap: Record<string, { accessGranted: boolean; grantedAt: string | null; revokedAt: string | null }> = {};
  for (const row of (entRows ?? [])) {
    entMap[(row as any).appCode] = {
      accessGranted: (row as any).accessGranted,
      grantedAt:     (row as any).grantedAt?.toISOString?.() ?? null,
      revokedAt:     (row as any).revokedAt?.toISOString?.() ?? null,
    };
  }
  if (!entMap['DRIVERHUB'])      entMap['DRIVERHUB']      = { accessGranted: user.hasDriverHubAccess ?? true,  grantedAt: null, revokedAt: null };
  if (!entMap['DRIVERCONNECT'])  entMap['DRIVERCONNECT']  = { accessGranted: user.hasDriverConnectAccess ?? false, grantedAt: null, revokedAt: null };

  const appEntitlements = Object.entries(entMap).map(([appCode, v]) => ({ appCode, ...v }));
  const roleClassification: SsoRole = (user.ssoRole as SsoRole) ?? deriveRoleClassification(user.role);
  const dcRoleMapping = DC_ROLE_MAPPING[roleClassification];
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;

  const payload: Record<string, any> = {
    // Stable identity (permanent fields — DriverConnect must store driverHubUserId)
    driverHubUserId:       user.id,
    userId:                user.id,  // backward compat alias
    email:                 user.email ?? null,
    firstName:             user.firstName ?? null,
    lastName:              user.lastName ?? null,
    fullName,
    displayName:           fullName || user.email || user.id,
    active:                user.status === 'ACTIVE',
    ssoSubjectId:          user.ssoSubjectId ?? null,

    // Role
    roleClassification,
    ssoRole: roleClassification,     // backward compat alias
    suggestedDcRole: dcRoleMapping?.dcRole ?? null, // Suggested DriverConnect local role

    // Organization
    company: org ? { orgId: org.id, orgName: org.name } : { orgId: user.orgId ?? null, orgName: null },
    companyId: org?.id ?? user.orgId ?? null,

    // Scope hints (DriverConnect may use these for initial scope seeding)
    homeMarket:  driverProfile?.market ?? null,
    homeNetwork: driverProfile?.network ?? null,
    branchId:    null, // Populated when branch data is available
    parentAccountId: driverProfile?.drivershiftCustomerId ?? null,

    // App entitlements
    appEntitlements,
    entitlements: {
      hasDriverHubAccess:     entMap['DRIVERHUB']?.accessGranted     ?? true,
      hasDriverConnectAccess: entMap['DRIVERCONNECT']?.accessGranted ?? false,
    },

    // Timing
    issuedAt: new Date().toISOString(),
  };

  if (opts?.expiresAt) {
    payload.expiresAt = opts.expiresAt.toISOString();
  }

  return payload;
}

// ─── Access Helpers ────────────────────────────────────────────────────────────
async function hasDriverConnectAccess(userId: string, userRow?: any): Promise<boolean> {
  const rows = await db.select({ accessGranted: userAppEntitlements.accessGranted })
    .from(userAppEntitlements)
    .where(and(eq(userAppEntitlements.userId, userId), eq(userAppEntitlements.appCode, 'DRIVERCONNECT')))
    .limit(1);
  if (rows.length > 0) return rows[0].accessGranted;
  return userRow?.hasDriverConnectAccess ?? false;
}

// ─── GET /sso/me ─────────────────────────────────────────────────────────────
router.get('/me', async (req: Request, res: Response) => {
  const sessionUser = (req as any).user;
  const userId = (req as any).session?.userId || sessionUser?.claims?.sub;
  if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Session authentication required.' } });
  try {
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    if (user.status !== 'ACTIVE') {
      await auditLog({ userId: user.id, email: user.email, app: 'DRIVERHUB', event: 'INACTIVE_DENIED', success: false, denialReason: 'INACTIVE', req });
      return res.status(403).json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'Account is not active.' } });
    }
    await auditLog({ userId: user.id, email: user.email, app: 'DRIVERHUB', event: 'LOGIN_SUCCESS', success: true, roleClassification: user.ssoRole ?? deriveRoleClassification(user.role), req });
    return res.json({ success: true, data: await buildIdentityPayload(user) });
  } catch (err) {
    console.error('[SSO] /me error:', err);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve identity.' } });
  }
});

// ─── GET /sso/identity ────────────────────────────────────────────────────────
router.get('/identity', requireV1ApiKey, requireScope('read:sso-identity'), async (req: Request, res: Response) => {
  const { userId, email, requireDriverConnectAccess } = req.query as Record<string, string>;
  if (!userId && !email) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide ?userId= or ?email=' } });
  try {
    const condition = userId ? eq(users.id, userId) : eq(users.email, email!.toLowerCase());
    const rows = await db.select().from(users).where(condition).limit(1);
    const user = rows[0];
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    if (user.status !== 'ACTIVE') {
      await auditLog({ userId: user.id, email: user.email, app: 'DRIVERHUB', event: 'INACTIVE_DENIED', success: false, denialReason: 'INACTIVE', req });
      return res.status(403).json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'Account is not active.' } });
    }
    if (requireDriverConnectAccess === 'true') {
      const hasAccess = await hasDriverConnectAccess(user.id, user);
      if (!hasAccess) {
        await auditLog({ userId: user.id, email: user.email, app: 'DRIVERHUB', event: 'ENTITLEMENT_DENIED', success: false, denialReason: 'NO_ENTITLEMENT', req });
        return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'User does not have DriverConnect access.' } });
      }
    }
    return res.json({ success: true, data: await buildIdentityPayload(user) });
  } catch (err) {
    console.error('[SSO] /identity error:', err);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve identity.' } });
  }
});

// ─── POST /sso/token ──────────────────────────────────────────────────────────
// Issues a short-lived (5 min) one-time SSO token for DriverConnect handoff.
// Enforces that the user has DriverConnect access before issuing.
router.post('/token', async (req: Request, res: Response) => {
  const sessionUser = (req as any).user;
  const userId = (req as any).session?.userId || sessionUser?.claims?.sub;
  if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Session authentication required.' } });
  try {
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    if (user.status !== 'ACTIVE') {
      await auditLog({ userId: user.id, email: user.email, app: 'DRIVERHUB', event: 'INACTIVE_DENIED', success: false, denialReason: 'INACTIVE', req });
      return res.status(403).json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'Account is not active.' } });
    }

    const targetApp = ((req.body?.targetApp as string) || 'driverconnect').toUpperCase();
    if (targetApp === 'DRIVERCONNECT') {
      const hasAccess = await hasDriverConnectAccess(userId, user);
      if (!hasAccess) {
        await auditLog({ userId: user.id, email: user.email, app: 'DRIVERHUB', event: 'ENTITLEMENT_DENIED', success: false, denialReason: 'NO_ENTITLEMENT', req });
        return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'User does not have DriverConnect access. Grant access in User Management → SSO Identity.' } });
      }
    }

    const rawToken  = `sso_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + SSO_TOKEN_TTL_MS);

    await db.insert(ssoTokens).values({ userId, tokenHash, targetApp: targetApp.toLowerCase(), expiresAt });
    await auditLog({ userId: user.id, email: user.email, app: 'DRIVERHUB', event: 'TOKEN_ISSUED', success: true, roleClassification: user.ssoRole ?? deriveRoleClassification(user.role), details: { targetApp }, req });

    return res.status(201).json({
      success: true,
      data: {
        token:     rawToken,
        expiresAt: expiresAt.toISOString(),
        targetApp: targetApp.toLowerCase(),
        ttlSeconds: SSO_TOKEN_TTL_MS / 1000,
        note: 'One-time use. Exchange within 5 minutes via POST /api/v1/sso/token/exchange.',
      },
    });
  } catch (err) {
    console.error('[SSO] /token issue error:', err);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to issue SSO token.' } });
  }
});

// ─── POST /sso/token/exchange ──────────────────────────────────────────────────
// Exchange a one-time SSO token for the user's full identity payload.
// DriverConnect calls this after receiving the handoff token from DriverHub.
router.post('/token/exchange', requireV1ApiKey, requireScope('read:sso-identity'), async (req: Request, res: Response) => {
  const { token, requireDriverConnectAccess } = req.body ?? {};
  if (!token) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'token is required.' } });
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();

    const tokenRows = await db.select().from(ssoTokens)
      .where(and(eq(ssoTokens.tokenHash, tokenHash), gt(ssoTokens.expiresAt, now)))
      .limit(1);
    const ssoToken = tokenRows[0];

    if (!ssoToken) {
      await auditLog({ app: 'DRIVERHUB', event: 'TOKEN_INVALID', success: false, denialReason: 'INVALID_TOKEN', req });
      return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Token is invalid, expired, or already used.' } });
    }
    if (ssoToken.usedAt) {
      await auditLog({ userId: ssoToken.userId, app: 'DRIVERHUB', event: 'TOKEN_ALREADY_USED', success: false, denialReason: 'TOKEN_ALREADY_USED', req });
      return res.status(401).json({ success: false, error: { code: 'TOKEN_ALREADY_USED', message: 'This token has already been exchanged. Issue a new one.' } });
    }

    // Mark as used immediately (one-time guarantee)
    await db.update(ssoTokens).set({ usedAt: now }).where(eq(ssoTokens.id, ssoToken.id));

    const userRows = await db.select().from(users).where(eq(users.id, ssoToken.userId)).limit(1);
    const user = userRows[0];
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    if (user.status !== 'ACTIVE') {
      await auditLog({ userId: user.id, email: user.email, app: 'DRIVERHUB', event: 'INACTIVE_DENIED', success: false, denialReason: 'INACTIVE', req });
      return res.status(403).json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'Account is not active.' } });
    }

    if (requireDriverConnectAccess) {
      const hasAccess = await hasDriverConnectAccess(user.id, user);
      if (!hasAccess) {
        await auditLog({ userId: user.id, email: user.email, app: 'DRIVERHUB', event: 'ENTITLEMENT_DENIED', success: false, denialReason: 'NO_ENTITLEMENT', req });
        return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'User does not have DriverConnect access.' } });
      }
    }

    const roleClassification = (user.ssoRole as SsoRole) ?? deriveRoleClassification(user.role);
    const expiresAt = ssoToken.expiresAt;
    const payload = await buildIdentityPayload(user, { expiresAt });

    await auditLog({ userId: user.id, email: user.email, app: 'DRIVERHUB', event: 'TOKEN_EXCHANGED', success: true, roleClassification, req });

    return res.json({ success: true, data: payload });
  } catch (err) {
    console.error('[SSO] /token/exchange error:', err);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to exchange SSO token.' } });
  }
});

// ─── POST /sso/provision ──────────────────────────────────────────────────────
// JIT provisioning endpoint — DriverConnect calls this after a successful token exchange.
//
// On FIRST login:  creates dc_provisioned_users record, seeds scope from identity payload
// On LATER login:  updates mutable fields (email, name, active, role classification);
//                  preserves local scope and role assignments unless forceSync=true
//
// Required body: { driverHubUserId, dcLocalRole, ...optional fields }
router.post('/provision', requireV1ApiKey, requireScope('read:sso-identity'), async (req: Request, res: Response) => {
  const {
    driverHubUserId, dcLocalRole, email, firstName, lastName,
    homeMarket, homeNetwork, branchId, companyId,
    scopeMarkets, scopeNetworks, scopeAccounts,
    provisioningTrigger, forceSync,
  } = req.body ?? {};

  if (!driverHubUserId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'driverHubUserId is required.' } });
  if (!dcLocalRole)     return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'dcLocalRole is required.' } });

  try {
    // Validate the driverHubUserId maps to a real, active user
    const userRows = await db.select().from(users).where(eq(users.id, driverHubUserId)).limit(1);
    const user = userRows[0];
    if (!user) {
      await auditLog({ app: 'DRIVERCONNECT', event: 'FIRST_PROVISION', success: false, denialReason: 'INVALID_TOKEN', details: { driverHubUserId }, req });
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'driverHubUserId does not match any user.' } });
    }
    if (user.status !== 'ACTIVE') {
      await auditLog({ userId: user.id, email: user.email, app: 'DRIVERCONNECT', event: 'ACCESS_DENIED_INACTIVE', success: false, denialReason: 'INACTIVE', req });
      return res.status(403).json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'User account is not active.' } });
    }

    // Check DriverConnect entitlement
    const hasAccess = await hasDriverConnectAccess(driverHubUserId, user);
    if (!hasAccess) {
      await auditLog({ userId: user.id, email: user.email, app: 'DRIVERCONNECT', event: 'ENTITLEMENT_DENIED', success: false, denialReason: 'NO_ENTITLEMENT', req });
      return res.status(403).json({ success: false, error: { code: 'ACCESS_DENIED', message: 'User does not have DriverConnect entitlement.' } });
    }

    const roleClassification = (user.ssoRole as SsoRole) ?? deriveRoleClassification(user.role);
    const now = new Date();

    // Upsert provisioning record
    const existing = await db.select().from(dcProvisionedUsers)
      .where(eq(dcProvisionedUsers.driverHubUserId, driverHubUserId)).limit(1);

    const isFirstProvision = existing.length === 0;

    if (isFirstProvision) {
      await db.insert(dcProvisionedUsers).values({
        driverHubUserId,
        email:                     email ?? user.email ?? null,
        firstName:                 firstName ?? user.firstName ?? null,
        lastName:                  lastName ?? user.lastName ?? null,
        dcLocalRole,
        driverHubRoleClassification: roleClassification,
        orgId:                     user.orgId ?? null,
        homeMarket:                homeMarket ?? null,
        homeNetwork:               homeNetwork ?? null,
        branchId:                  branchId ?? null,
        companyId:                 companyId ?? null,
        scopeMarkets:              scopeMarkets ?? null,
        scopeNetworks:             scopeNetworks ?? null,
        scopeAccounts:             scopeAccounts ?? null,
        status:                    'ACTIVE',
        provisionedAt:             now,
        lastSyncAt:                now,
        lastLoginAt:               now,
        provisioningTrigger:       provisioningTrigger ?? 'FIRST_LOGIN',
      });
      await auditLog({ userId: user.id, email: user.email, app: 'DRIVERCONNECT', event: 'FIRST_PROVISION', success: true, roleClassification, dcLocalRole, details: { driverHubUserId, scopeMarkets, scopeNetworks }, req });
      await auditLog({ userId: user.id, email: user.email, app: 'DRIVERCONNECT', event: 'ROLE_MAPPED', success: true, roleClassification, dcLocalRole, req });
      if (scopeMarkets?.length || scopeNetworks?.length) {
        await auditLog({ userId: user.id, email: user.email, app: 'DRIVERCONNECT', event: 'SCOPE_SEEDED', success: true, details: { scopeMarkets, scopeNetworks, scopeAccounts }, req });
      }
    } else {
      // Repeat login — refresh mutable identity fields; preserve scope unless forceSync
      const updates: Record<string, any> = {
        email:                       email ?? user.email ?? existing[0].email,
        firstName:                   firstName ?? user.firstName ?? existing[0].firstName,
        lastName:                    lastName ?? user.lastName ?? existing[0].lastName,
        driverHubRoleClassification: roleClassification,
        lastLoginAt:                 now,
        lastSyncAt:                  now,
        status:                      user.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        updatedAt:                   now,
      };
      // Only override scope if forceSync is requested
      if (forceSync) {
        if (scopeMarkets !== undefined)  updates.scopeMarkets  = scopeMarkets;
        if (scopeNetworks !== undefined) updates.scopeNetworks = scopeNetworks;
        if (scopeAccounts !== undefined) updates.scopeAccounts = scopeAccounts;
        updates.dcLocalRole = dcLocalRole;
        updates.homeMarket  = homeMarket ?? existing[0].homeMarket;
        updates.homeNetwork = homeNetwork ?? existing[0].homeNetwork;
        updates.branchId    = branchId ?? existing[0].branchId;
        updates.companyId   = companyId ?? existing[0].companyId;
      }
      await db.update(dcProvisionedUsers).set(updates)
        .where(eq(dcProvisionedUsers.driverHubUserId, driverHubUserId));
      await auditLog({ userId: user.id, email: user.email, app: 'DRIVERCONNECT', event: 'REPEAT_LOGIN', success: true, roleClassification, dcLocalRole: existing[0].dcLocalRole, details: { forceSync: !!forceSync }, req });
    }

    const finalRecord = await db.select().from(dcProvisionedUsers)
      .where(eq(dcProvisionedUsers.driverHubUserId, driverHubUserId)).limit(1);

    return res.status(isFirstProvision ? 201 : 200).json({
      success: true,
      data: finalRecord[0],
      isFirstProvision,
      action: isFirstProvision ? 'provisioned' : 'updated',
    });
  } catch (err) {
    console.error('[SSO] /provision error:', err);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Provisioning failed.' } });
  }
});

// ─── GET /sso/provision/:driverHubUserId ─────────────────────────────────────
// Get the provisioning record for a DriverHub user in DriverConnect.
router.get('/provision/:driverHubUserId', requireV1ApiKey, requireScope('read:sso-identity'), async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(dcProvisionedUsers)
      .where(eq(dcProvisionedUsers.driverHubUserId, req.params.driverHubUserId)).limit(1);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: { code: 'NOT_PROVISIONED', message: 'User has not been provisioned in DriverConnect yet.' } });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch provisioning record.' } });
  }
});

// ─── GET /sso/role-mapping ────────────────────────────────────────────────────
// Returns the canonical DriverHub→DriverConnect role mapping table.
// DriverConnect uses this as the default mapping seed at startup.
router.get('/role-mapping', async (_req: Request, res: Response) => {
  const mapping = Object.entries(DC_ROLE_MAPPING).map(([classification, v]) => ({
    driverHubClassification: classification,
    dcLocalRole:             v.dcRole,
    description:             v.description,
    failSafe:                v.failSafe,
  }));
  return res.json({
    success: true,
    data: { mapping, appCodes: [...APP_CODES], ssoRoles: [...SSO_ROLES] },
    meta: { note: 'DriverConnect should use this as the default role mapping seed. Configure locally for overrides.' },
  });
});

// ─── GET /sso/audit-log ────────────────────────────────────────────────────────
// Returns recent SSO audit events (API-key auth, read:sso-identity scope).
router.get('/audit-log', requireV1ApiKey, requireScope('read:sso-identity'), async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(parseInt((req.query.limit as string) || '50'), 200);
    const offset = parseInt((req.query.offset as string) || '0');
    const app    = req.query.app as string | undefined;
    const userId = req.query.userId as string | undefined;

    let query = db.select().from(ssoAuditLog).orderBy(desc(ssoAuditLog.createdAt)).limit(limit).offset(offset);
    const rows = await query;
    return res.json({ success: true, data: rows, meta: { limit, offset } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch audit log.' } });
  }
});

export { buildIdentityPayload, deriveRoleClassification, auditLog };
export default router;
