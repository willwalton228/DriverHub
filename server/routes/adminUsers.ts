import { Router, Response } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { buildInviteUrl } from "../appConfig";
import { z } from "zod";
import { db } from "../db";
import { 
  users, organizations, userAccessRequests, userProvisioningAuditLog,
  superAdminAuditLog, employees,
  ROLE_HIERARCHY, SENSITIVE_FIELDS, notifications
} from "@shared/schema";
import { eq, and, desc, inArray, or, isNull, sql } from "drizzle-orm";
import { sendUserInviteEmail } from "../emailService";
import { withExplicitFullDriverSsnAccess } from "../services/driverSsnAccess";
import { scanActiveCorporateIdentities } from "../services/userIdentityIntegrityService";

const router = Router();

const CORPORATE_ROLES = ['super_user', 'super_admin', 'admin', 'corporate_admin', 'corporate', 'ops_manager', 'finance', 'recruiter', 'regional_cl', 'network_cl', 'dealer_cl', 'certification_liaison'];
const SENSITIVE_FIELD_LIST = [...SENSITIVE_FIELDS];

function getRoleLevel(role: string): number {
  return ROLE_HIERARCHY[role] ?? 0;
}

function canGrantRole(grantorRole: string, targetRole: string): boolean {
  if (grantorRole === 'super_user' || grantorRole === 'super_admin') return true;
  if (targetRole === 'super_user') return false;
  if (targetRole === 'integration_user') return false; // Super Admin only
  return getRoleLevel(grantorRole) >= getRoleLevel(targetRole);
}

function canProvisionUsers(user: any): boolean {
  if (['super_user', 'super_admin', 'admin', 'corporate_admin'].includes(user.role)) return true;
  if (user.corporateAccessAdmin) return true;
  return false;
}

function requiresSuperAdminApproval(grantor: any, requestedRole: string, sensitiveFields: string[]): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  if (grantor.role === 'super_user' || grantor.role === 'super_admin') return { required: false, reasons };
  
  if (!canGrantRole(grantor.role, requestedRole)) {
    reasons.push(`Role "${requestedRole}" exceeds your access level`);
  }
  
  if (sensitiveFields.length > 0) {
    if (!grantor.canGrantSensitiveDataAccess) {
      const blocked = sensitiveFields.filter(f => ['ssn', 'banking_ach', 'pay_rate', 'background_check', 'internal_risk_notes'].includes(f));
      if (blocked.length > 0) {
        reasons.push(`Sensitive field access requested: ${blocked.join(', ')}`);
      }
    }
    if (!grantor.canGrantExports && sensitiveFields.includes('data_export')) {
      reasons.push('Data export access requires Super Admin approval');
    }
  }
  
  return { required: reasons.length > 0, reasons };
}

function computeLocalEffectivePermissions(user: any): {
  maxGrantableRoleLevel: number;
  canGrantSensitive: boolean;
  canGrantExport: boolean;
  grantableRoles: string[];
} {
  const level = getRoleLevel(user.role);
  const isSA = isSuperAdmin(user.role);
  const grantableRoles = Object.entries(ROLE_HIERARCHY)
    .filter(([role, lvl]) => {
      if (isSA) return true;
      if (role === 'super_user' || role === 'super_admin') return false;
      if (role === 'integration_user') return false; // Super Admin only
      return lvl <= level;
    })
    .map(([role]) => role);
  
  return {
    maxGrantableRoleLevel: isSA ? 100 : level,
    canGrantSensitive: isSA || (user.canGrantSensitiveDataAccess ?? false),
    canGrantExport: isSA || (user.canGrantExports ?? false),
    grantableRoles,
  };
}

async function logProvisioningAction(orgId: string, actorId: string, actorRole: string, action: string, details: any, targetUserId?: string, targetEmail?: string, accessRequestId?: string) {
  try {
    await db.insert(userProvisioningAuditLog).values({
      orgId,
      actorId,
      actorRole,
      action,
      targetUserId: targetUserId ?? null,
      targetEmail: targetEmail ?? null,
      details,
      accessRequestId: accessRequestId ?? null,
    });
  } catch (err) {
    console.error("[Provisioning Audit] Failed to log:", err);
  }
}

async function notifySuperAdmins(orgId: string, title: string, message: string) {
  try {
    const admins = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.orgId, orgId), or(eq(users.role, 'super_user'), eq(users.role, 'super_admin'))));
    
    for (const admin of admins) {
      await db.insert(notifications).values({
        userId: admin.id,
        type: 'access_request',
        title,
        message,
        isRead: false,
      });
    }
  } catch (err) {
    console.error("[Provisioning] Failed to notify super admins:", err);
  }
}

// Canonical allowed roles for user invitation.
// "Super Admin User" (super_user) can only be assigned by will@driverondemand.co — enforced below.
const ALLOWED_INVITE_ROLES = ['driver', 'corporate', 'corporate_admin', 'super_user'] as const;

const inviteUserSchema = z.object({
  email: z.string().email("Valid email required"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(ALLOWED_INVITE_ROLES, {
    errorMap: () => ({ message: "Invalid role. Must be one of: Driver, Corporate User, Corporate Admin User, or Super Admin User." }),
  }),
  permissionPack: z.string().optional(),
  sensitiveFields: z.array(z.string()).optional().default([]),
  justification: z.string().optional(),
});

const updateUserSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  role: z.string().optional(),
  isProvisioned: z.boolean().optional(),
  corporateAccessAdmin: z.boolean().optional(),
  canGrantSensitiveDataAccess: z.boolean().optional(),
  canGrantExports: z.boolean().optional(),
});

function requireCorporateAccess(req: any, res: Response, next: Function) {
  const userRole = req.userRole;
  if (!CORPORATE_ROLES.includes(userRole)) {
    return res.status(403).json({ error: "FORBIDDEN", message: "Corporate access required" });
  }
  next();
}

function requireCanProvision(req: any, res: Response, next: Function) {
  if (!canProvisionUsers(req.currentUser)) {
    return res.status(403).json({ error: "FORBIDDEN", message: "You do not have permission to provision users. Contact a Super Admin or Corporate Access Admin." });
  }
  next();
}

function isSuperAdmin(role: string): boolean {
  return role === 'super_user' || role === 'super_admin';
}

function isRootSuperAdmin(user: any): boolean {
  return !!user.isRootSuperAdmin;
}

async function logSuperAdminAction(
  actorId: string,
  actorEmail: string,
  action: string,
  category: string,
  opts: { targetType?: string; targetId?: string; targetLabel?: string; details?: any; ipAddress?: string } = {}
): Promise<void> {
  try {
    await db.insert(superAdminAuditLog).values({
      actorId,
      actorEmail: actorEmail || "",
      action,
      category,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      targetLabel: opts.targetLabel ?? null,
      details: opts.details ?? null,
      ipAddress: opts.ipAddress ?? null,
    });
  } catch (err) {
    console.error("[SuperAdminAudit] Failed to log:", err);
  }
}

function requireSuperAdmin(req: any, res: Response, next: Function) {
  if (!isSuperAdmin(req.currentUser.role)) {
    return res.status(403).json({ error: "FORBIDDEN", message: "Super Admin access required" });
  }
  next();
}

async function getUserFromSession(req: any): Promise<any> {
  let userId: string | null = null;
  let claimsEmail: string | null = null;
  if ((req.session as any)?.userId) {
    userId = (req.session as any).userId;
  } else if (req.isAuthenticated?.() && req.user?.claims?.sub) {
    userId = req.user.claims.sub;
    claimsEmail = req.user.claims.email || null;
  }
  if (!userId) return null;
  let [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  // Email fallback: OIDC sub may differ from the stored user ID (e.g. Replit vs password auth paths)
  if (!user && claimsEmail) {
    [user] = await db.select().from(users).where(eq(users.email, claimsEmail)).limit(1);
  }
  return user || null;
}

router.use(async (req: any, res: Response, next: Function) => {
  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
  }
  req.currentUser = user;
  req.userRole = user.role;
  next();
});

router.get("/", requireCorporateAccess, async (req: any, res: Response) => {
  try {
    const currentUser = req.currentUser;
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
      actionPermissions: users.actionPermissions,
      driverId: users.driverId,
      employeeId: users.employeeId,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      isRootSuperAdmin: users.isRootSuperAdmin,
      forcePasswordReset: users.forcePasswordReset,
      inviteTokenExpiresAt: users.inviteTokenExpiresAt,
    })
    .from(users)
    .where(eq(users.orgId, currentUser.orgId))
    .orderBy(desc(users.createdAt));
    
    res.json(usersList);
  } catch (error) {
    console.error("[Admin] List users error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list users" });
  }
});

router.get("/effective-permissions", requireCorporateAccess, async (req: any, res: Response) => {
  try {
    const localPerms = computeLocalEffectivePermissions(req.currentUser);
    const { computeEffectivePermissions } = await import("../services/corporatePermissions");
    const enginePerms = computeEffectivePermissions(req.currentUser);
    res.json({
      ...localPerms,
      canProvision: canProvisionUsers(req.currentUser),
      isSuperAdmin: isSuperAdmin(req.currentUser.role),
      isCorporateAccessAdmin: req.currentUser.corporateAccessAdmin ?? false,
      sensitiveFields: SENSITIVE_FIELD_LIST,
      engine: enginePerms,
    });
  } catch (error) {
    console.error("[Admin] Effective permissions error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch permissions" });
  }
});

router.post("/invite", requireCorporateAccess, requireCanProvision, async (req: any, res: Response) => {
  try {
    const validation = inviteUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: "VALIDATION_ERROR", 
        message: validation.error.errors[0]?.message 
      });
    }

    const { email, firstName, lastName, role, permissionPack, sensitiveFields, justification } = validation.data;
    const currentUser = req.currentUser;

    // Org is always derived from the inviting user's session — never from the client.
    let orgId = currentUser.orgId;
    // Any corporate user without an org is automatically linked to the primary platform org.
    // This handles both super admins and regular corporate users whose org wasn't set during OIDC upsert.
    if (!orgId && CORPORATE_ROLES.includes(currentUser.role)) {
      const PRIMARY_ORG_ID = 'dod-primary-org';
      orgId = PRIMARY_ORG_ID;
      await db.update(users).set({ orgId: PRIMARY_ORG_ID, isProvisioned: true }).where(eq(users.id, currentUser.id));
    }
    if (!orgId) {
      return res.status(400).json({ error: "NO_ORG", message: "Your account is not linked to an organization. Contact a Super Admin." });
    }

    // Super Admin role can only be assigned by the root super admin (will@driverondemand.co)
    if (role === 'super_user' && currentUser.email !== 'will@driverondemand.co') {
      return res.status(403).json({
        error: "SUPER_ADMIN_ROLE_FORBIDDEN",
        message: "Only the root super administrator may assign the Super Admin User role.",
      });
    }

    const [existingUser] = await db.select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return res.status(409).json({ error: "USER_EXISTS", message: "A user with this email already exists" });
    }

    const approval = requiresSuperAdminApproval(currentUser, role, sensitiveFields ?? []);
    
    if (approval.required) {
      const [request] = await db.insert(userAccessRequests).values({
        orgId,
        requestorId: currentUser.id,
        requestedEmail: email.toLowerCase(),
        requestedFirstName: firstName ?? null,
        requestedLastName: lastName ?? null,
        requestedRole: role,
        requestedPermissionPack: permissionPack ?? null,
        requestedSensitiveFields: sensitiveFields ?? [],
        justification: justification ?? null,
        cappedDiff: { reasons: approval.reasons },
        status: 'pending',
      }).returning();

      await logProvisioningAction(
        orgId, currentUser.id, currentUser.role,
        'access_request_created',
        { requestedRole: role, sensitiveFields, reasons: approval.reasons },
        undefined, email, request.id
      );

      await notifySuperAdmins(orgId, 
        'New Access Request',
        `${currentUser.firstName || currentUser.email} requested access for ${email} with role "${role}". Approval required.`
      );

      return res.status(202).json({
        success: true,
        requiresApproval: true,
        message: "Request has been submitted to Super Admin for approval",
        requestId: request.id,
        reasons: approval.reasons,
      });
    }

    const [org] = await db.select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) {
      return res.status(404).json({ error: "ORG_NOT_FOUND", message: "Organization not found" });
    }

    const inviteToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [newUser] = await db.insert(users).values({
      email: email.toLowerCase(),
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      role,
      orgId,
      status: "INVITED",
      inviteToken,
      inviteTokenExpiresAt: expiresAt,
      isProvisioned: false,
      forcePasswordReset: true,
    }).returning();

    await logProvisioningAction(
      orgId, currentUser.id, currentUser.role,
      'user_invited',
      { role, permissionPack },
      newUser.id, email
    );

    const inviteUrl = buildInviteUrl(inviteToken);
    try {
      await sendUserInviteEmail({
        to: email,
        organizationName: org.name,
        inviteUrl,
        role,
      });
    } catch (emailError) {
      console.error("[Admin] Failed to send invite email:", emailError);
    }

    res.status(201).json({
      success: true,
      requiresApproval: false,
      message: "Invitation sent successfully",
      inviteUrl,
      inviteTokenExpiresAt: expiresAt,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
        orgId: newUser.orgId,
      },
    });
  } catch (error) {
    console.error("[Admin] Invite user error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to invite user" });
  }
});

// ─── Direct User Creation (no invitation required) ────────────────────────────
const createDirectUserSchema = z.object({
  email: z.string().email("Valid email required"),
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
  temporaryPassword: z.string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one number"),
  role: z.string().min(1, "Role required"),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
});

router.post("/create-direct", requireCorporateAccess, requireCanProvision, async (req: any, res: Response) => {
  try {
    const validation = createDirectUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: validation.error.errors[0]?.message,
        details: validation.error.errors,
      });
    }

    const { email, firstName, lastName, temporaryPassword, role, status } = validation.data;
    const currentUser = req.currentUser;

    // Only super_user may assign super_user role
    if (role === "super_user" && currentUser.email !== "will@driverondemand.co") {
      return res.status(403).json({
        error: "SUPER_ADMIN_ROLE_FORBIDDEN",
        message: "Only the root super administrator may assign the Super Admin User role.",
      });
    }

    // Only Super Admins may create Integration User accounts (service accounts)
    if (role === "integration_user" && !isSuperAdmin(currentUser.role)) {
      return res.status(403).json({
        error: "INTEGRATION_ROLE_FORBIDDEN",
        message: "Only Super Admins may create Integration User (service) accounts.",
      });
    }

    // Actor must be able to grant the requested role
    if (!canGrantRole(currentUser.role, role)) {
      return res.status(403).json({
        error: "ROLE_EXCEEDS_LEVEL",
        message: `You cannot assign the "${role}" role — it exceeds your own access level.`,
      });
    }

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return res.status(409).json({ error: "USER_EXISTS", message: "A user with this email already exists." });
    }

    // Resolve org from actor session
    let orgId = currentUser.orgId;
    if (!orgId && CORPORATE_ROLES.includes(currentUser.role)) {
      orgId = "dod-primary-org";
      await db.update(users).set({ orgId, isProvisioned: true }).where(eq(users.id, currentUser.id));
    }
    if (!orgId) {
      return res.status(400).json({ error: "NO_ORG", message: "Your account is not linked to an organization." });
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const [newUser] = await db.insert(users).values({
      email: email.toLowerCase(),
      firstName,
      lastName,
      role,
      orgId,
      status,
      passwordHash,
      forcePasswordReset: true,
      isProvisioned: true,
      inviteToken: null,
      inviteTokenExpiresAt: null,
    }).returning();

    await logProvisioningAction(
      orgId,
      currentUser.id,
      currentUser.role,
      "user_created_direct",
      { role, status, createdBy: currentUser.email },
      newUser.id,
      email,
    );

    console.log(`[AdminUsers] Direct user creation: ${email} (role=${role}) by ${currentUser.email}`);

    return res.status(201).json({
      success: true,
      message: "User created successfully. They must reset their password on first login.",
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        status: newUser.status,
        orgId: newUser.orgId,
        forcePasswordReset: true,
      },
    });
  } catch (error) {
    console.error("[AdminUsers] Direct user creation error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create user." });
  }
});

router.patch("/:userId", requireCorporateAccess, async (req: any, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUser = req.currentUser;

    const validation = updateUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: "VALIDATION_ERROR", 
        message: validation.error.errors[0]?.message 
      });
    }

    const [targetUser] = await db.select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, currentUser.orgId)))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    if (userId === currentUser.id) {
      return res.status(400).json({ error: "SELF_MODIFICATION", message: "Cannot modify your own account" });
    }

    // Root Super Admin protection — non-root users cannot modify the root account
    if (targetUser.isRootSuperAdmin && !currentUser.isRootSuperAdmin) {
      return res.status(403).json({
        error: "ROOT_SUPER_ADMIN_PROTECTED",
        message: "The Root Super Admin account cannot be modified by non-root users",
      });
    }

    // Cannot demote root super admin under any circumstance
    if (targetUser.isRootSuperAdmin && validation.data.role && !isSuperAdmin(validation.data.role)) {
      return res.status(403).json({
        error: "ROOT_DEMOTION_FORBIDDEN",
        message: "The Root Super Admin role cannot be removed",
      });
    }

    // Cannot disable/suspend root super admin
    if (targetUser.isRootSuperAdmin && validation.data.status === "DISABLED") {
      return res.status(403).json({
        error: "ROOT_SUSPENSION_FORBIDDEN",
        message: "The Root Super Admin account cannot be suspended",
      });
    }

    // Only super admins can grant the super_user role
    if (validation.data.role && isSuperAdmin(validation.data.role) && !isSuperAdmin(currentUser.role)) {
      return res.status(403).json({
        error: "PERMISSION_EXCEEDED",
        message: "Only a Super Admin can grant the Super Admin role",
      });
    }

    if (isSuperAdmin(targetUser.role || '') && !isSuperAdmin(currentUser.role)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Cannot modify Super Admin users" });
    }

    if (validation.data.corporateAccessAdmin !== undefined || 
        validation.data.canGrantSensitiveDataAccess !== undefined ||
        validation.data.canGrantExports !== undefined) {
      if (!isSuperAdmin(currentUser.role)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Only Super Admin can modify delegation permissions" });
      }
    }

    if (validation.data.role && !canGrantRole(currentUser.role, validation.data.role)) {
      return res.status(403).json({ error: "PERMISSION_EXCEEDED", message: `Cannot assign role "${validation.data.role}" — it exceeds your access level` });
    }

    const updateData: any = { updatedAt: new Date() };

    if (validation.data.status !== undefined) updateData.status = validation.data.status;
    if (validation.data.role !== undefined) updateData.role = validation.data.role;
    if (validation.data.isProvisioned !== undefined) updateData.isProvisioned = validation.data.isProvisioned;
    if (validation.data.corporateAccessAdmin !== undefined) updateData.corporateAccessAdmin = validation.data.corporateAccessAdmin;
    if (validation.data.canGrantSensitiveDataAccess !== undefined) updateData.canGrantSensitiveDataAccess = validation.data.canGrantSensitiveDataAccess;
    if (validation.data.canGrantExports !== undefined) updateData.canGrantExports = validation.data.canGrantExports;

    const [updatedUser] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        status: users.status,
        isProvisioned: users.isProvisioned,
        corporateAccessAdmin: users.corporateAccessAdmin,
        canGrantSensitiveDataAccess: users.canGrantSensitiveDataAccess,
        canGrantExports: users.canGrantExports,
        isRootSuperAdmin: users.isRootSuperAdmin,
        forcePasswordReset: users.forcePasswordReset,
      });

    await logProvisioningAction(
      currentUser.orgId, currentUser.id, currentUser.role,
      'user_updated',
      { changes: validation.data },
      userId, targetUser.email ?? undefined
    );

    // Log to super admin audit trail when super_user role is granted or revoked
    if (validation.data.role) {
      const wasSuper = isSuperAdmin(targetUser.role || '');
      const isNowSuper = isSuperAdmin(validation.data.role);
      if (!wasSuper && isNowSuper) {
        await logSuperAdminAction(
          currentUser.id, currentUser.email || "",
          "super_admin_role_granted", "permission_change",
          { targetType: "user", targetId: userId, targetLabel: targetUser.email || userId,
            details: { previousRole: targetUser.role, newRole: validation.data.role }, ipAddress: (req as any).ip }
        );
      } else if (wasSuper && !isNowSuper) {
        await logSuperAdminAction(
          currentUser.id, currentUser.email || "",
          "super_admin_role_revoked", "permission_change",
          { targetType: "user", targetId: userId, targetLabel: targetUser.email || userId,
            details: { previousRole: targetUser.role, newRole: validation.data.role }, ipAddress: (req as any).ip }
        );
      }
    }

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("[Admin] Update user error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update user" });
  }
});

router.post("/:userId/resend-invite", requireCorporateAccess, async (req: any, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUser = req.currentUser;

    const [targetUser] = await db.select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, currentUser.orgId)))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    if ((targetUser as any).status !== "INVITED") {
      return res.status(400).json({ error: "NOT_INVITED", message: "User is not in invited status" });
    }

    const inviteToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.update(users)
      .set({ inviteToken, inviteTokenExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(users.id, userId));

    const [org] = await db.select()
      .from(organizations)
      .where(eq(organizations.id, currentUser.orgId))
      .limit(1);

    const inviteUrl = buildInviteUrl(inviteToken);

    if (targetUser.email && org) {
      try {
        await sendUserInviteEmail({
          to: targetUser.email,
          organizationName: org.name,
          inviteUrl,
          role: targetUser.role,
        });
      } catch (emailError) {
        console.error("[Admin] Failed to resend invite email:", emailError);
      }
    }

    res.json({ success: true, message: "Invitation regenerated successfully", inviteUrl, inviteTokenExpiresAt: expiresAt });
  } catch (error) {
    console.error("[Admin] Resend invite error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to resend invitation" });
  }
});

router.get("/count", requireCorporateAccess, async (req: any, res: Response) => {
  try {
    const currentUser = req.currentUser;
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(users)
      .where(and(eq(users.orgId, currentUser.orgId), sql`upper(${users.status}) = 'ACTIVE'`));
    res.json({ count: row?.count ?? 0 });
  } catch (error) {
    console.error("[Admin] Count users error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to count users" });
  }
});

router.get("/:userId/invite-link", requireCorporateAccess, requireCanProvision, async (req: any, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUser = req.currentUser;

    const [targetUser] = await db.select({
      id: users.id,
      email: users.email,
      status: users.status,
      role: users.role,
      inviteToken: users.inviteToken,
      inviteTokenExpiresAt: users.inviteTokenExpiresAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, currentUser.orgId)))
    .limit(1);

    if (!targetUser) return res.status(404).json({ error: "USER_NOT_FOUND" });
    if (targetUser.status !== "INVITED") return res.status(400).json({ error: "NOT_INVITED", message: "User is not in invited status" });
    if (!targetUser.inviteToken) return res.status(400).json({ error: "NO_TOKEN", message: "No active invite token" });

    const inviteUrl = buildInviteUrl(targetUser.inviteToken!);
    res.json({ inviteUrl, inviteTokenExpiresAt: targetUser.inviteTokenExpiresAt });
  } catch (error) {
    console.error("[Admin] Get invite link error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to retrieve invite link" });
  }
});

router.get("/access-requests", requireCorporateAccess, async (req: any, res: Response) => {
  try {
    const currentUser = req.currentUser;
    const { status } = req.query;
    
    const conditions = [eq(userAccessRequests.orgId, currentUser.orgId)];
    if (status) {
      conditions.push(eq(userAccessRequests.status, status as string));
    }
    
    if (!isSuperAdmin(currentUser.role)) {
      conditions.push(eq(userAccessRequests.requestorId, currentUser.id));
    }

    const requests = await db.select()
      .from(userAccessRequests)
      .where(and(...conditions))
      .orderBy(desc(userAccessRequests.createdAt));

    const requestorIds = Array.from(new Set(requests.map(r => r.requestorId)));
    let requestorMap: Record<string, any> = {};
    if (requestorIds.length > 0) {
      const requestors = await db.select({
        id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role
      }).from(users).where(inArray(users.id, requestorIds));
      requestorMap = Object.fromEntries(requestors.map(r => [r.id, r]));
    }

    const enriched = requests.map(r => ({
      ...r,
      requestor: requestorMap[r.requestorId] || null,
    }));

    res.json(enriched);
  } catch (error) {
    console.error("[Admin] Access requests error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch access requests" });
  }
});

router.get("/access-requests/:requestId", requireCorporateAccess, async (req: any, res: Response) => {
  try {
    const currentUser = req.currentUser;
    const [request] = await db.select()
      .from(userAccessRequests)
      .where(and(eq(userAccessRequests.id, req.params.requestId), eq(userAccessRequests.orgId, currentUser.orgId)))
      .limit(1);

    if (!request) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Access request not found" });
    }

    if (!isSuperAdmin(currentUser.role) && request.requestorId !== currentUser.id) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Not authorized to view this request" });
    }

    res.json(request);
  } catch (error) {
    console.error("[Admin] Access request detail error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch access request" });
  }
});

const reviewSchema = z.object({
  action: z.enum(['approve', 'approve_with_changes', 'deny', 'request_more_info']),
  reviewerNotes: z.string().optional(),
  approvedRole: z.string().optional(),
  approvedModules: z.array(z.string()).optional(),
  approvedSensitiveFields: z.array(z.string()).optional(),
});

router.post("/access-requests/:requestId/review", requireCorporateAccess, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const currentUser = req.currentUser;
    const validation = reviewSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: validation.error.errors[0]?.message });
    }

    const { action, reviewerNotes, approvedRole, approvedModules, approvedSensitiveFields } = validation.data;

    const [request] = await db.select()
      .from(userAccessRequests)
      .where(and(eq(userAccessRequests.id, req.params.requestId), eq(userAccessRequests.orgId, currentUser.orgId)))
      .limit(1);

    if (!request) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Access request not found" });
    }

    if (request.status !== 'pending' && request.status !== 'more_info_requested') {
      return res.status(400).json({ error: "ALREADY_REVIEWED", message: "This request has already been processed" });
    }

    let newStatus: string;
    let resultingUserId: string | null = null;

    if (action === 'approve' || action === 'approve_with_changes') {
      const finalRole = action === 'approve_with_changes' && approvedRole ? approvedRole : request.requestedRole;
      
      const [existingUser] = await db.select()
        .from(users)
        .where(eq(users.email, request.requestedEmail.toLowerCase()))
        .limit(1);

      if (existingUser) {
        return res.status(409).json({ error: "USER_EXISTS", message: "A user with this email already exists" });
      }

      const [org] = await db.select()
        .from(organizations)
        .where(eq(organizations.id, request.orgId))
        .limit(1);

      const inviteToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [newUser] = await db.insert(users).values({
        email: request.requestedEmail.toLowerCase(),
        firstName: request.requestedFirstName ?? null,
        lastName: request.requestedLastName ?? null,
        role: finalRole,
        orgId: request.orgId,
        status: "INVITED",
        inviteToken,
        inviteTokenExpiresAt: expiresAt,
        isProvisioned: false,
      }).returning();

      resultingUserId = newUser.id;
      newStatus = action === 'approve' ? 'approved' : 'approved_with_changes';

      if (org && request.requestedEmail) {
        try {
          const inviteUrl = buildInviteUrl(inviteToken);
          await sendUserInviteEmail({
            to: request.requestedEmail,
            organizationName: org.name,
            inviteUrl,
            role: finalRole,
          });
        } catch (emailError) {
          console.error("[Admin] Failed to send invite email on approval:", emailError);
        }
      }
    } else if (action === 'deny') {
      newStatus = 'denied';
    } else {
      newStatus = 'more_info_requested';
    }

    await db.update(userAccessRequests)
      .set({
        status: newStatus,
        reviewerId: currentUser.id,
        reviewerNotes: reviewerNotes ?? null,
        approvedRole: approvedRole ?? null,
        approvedModules: approvedModules ?? null,
        approvedSensitiveFields: approvedSensitiveFields ?? null,
        resultingUserId,
        resolvedAt: (action === 'approve' || action === 'approve_with_changes' || action === 'deny') ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(userAccessRequests.id, request.id));

    await logProvisioningAction(
      currentUser.orgId, currentUser.id, currentUser.role,
      `access_request_${action}`,
      { requestId: request.id, requestedEmail: request.requestedEmail, action, reviewerNotes, approvedRole },
      resultingUserId ?? undefined, request.requestedEmail, request.id
    );

    try {
      await db.insert(notifications).values({
        userId: request.requestorId,
        type: 'access_request_update',
        title: `Access Request ${action === 'approve' ? 'Approved' : action === 'deny' ? 'Denied' : action === 'approve_with_changes' ? 'Approved with Changes' : 'More Info Requested'}`,
        message: `Your access request for ${request.requestedEmail} has been ${action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : action === 'approve_with_changes' ? 'approved with changes' : 'returned for more information'}. ${reviewerNotes ? `Notes: ${reviewerNotes}` : ''}`,
        isRead: false,
      });
    } catch (notifErr) {
      console.error("[Admin] Failed to notify requestor:", notifErr);
    }

    res.json({
      success: true,
      status: newStatus,
      resultingUserId,
      message: `Request ${action === 'approve' ? 'approved and user invited' : action === 'deny' ? 'denied' : action === 'approve_with_changes' ? 'approved with changes and user invited' : 'returned for more information'}`,
    });
  } catch (error) {
    console.error("[Admin] Review access request error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to review access request" });
  }
});

router.get("/provisioning-audit", requireCorporateAccess, async (req: any, res: Response) => {
  try {
    const currentUser = req.currentUser;
    
    if (!isSuperAdmin(currentUser.role) && currentUser.role !== 'admin') {
      return res.status(403).json({ error: "FORBIDDEN", message: "Admin access required to view audit logs" });
    }

    const { limit: limitParam } = req.query;
    const limit = Math.min(parseInt(limitParam as string) || 50, 200);

    const logs = await db.select()
      .from(userProvisioningAuditLog)
      .where(eq(userProvisioningAuditLog.orgId, currentUser.orgId))
      .orderBy(desc(userProvisioningAuditLog.createdAt))
      .limit(limit);

    const actorIds = Array.from(new Set(logs.map(l => l.actorId)));
    let actorMap: Record<string, any> = {};
    if (actorIds.length > 0) {
      const actors = await db.select({
        id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName
      }).from(users).where(inArray(users.id, actorIds));
      actorMap = Object.fromEntries(actors.map(a => [a.id, a]));
    }

    res.json(logs.map(l => ({ ...l, actor: actorMap[l.actorId] || null })));
  } catch (error) {
    console.error("[Admin] Audit log error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch audit logs" });
  }
});

// Read-only integrity report for active corporate identities. This reports
// anomalies rather than silently repairing unknown identities.
router.get("/identity-integrity/scan", requireCorporateAccess, async (req: any, res: Response) => {
  try {
    if (!["super_user", "super_admin", "admin", "corporate_admin"].includes(req.currentUser.role)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Admin access required to scan user identities" });
    }
    res.json(await scanActiveCorporateIdentities());
  } catch (error) {
    console.error("[Admin] Identity integrity scan error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to scan user identities" });
  }
});

router.get("/identity-integrity/audit", requireCorporateAccess, async (req: any, res: Response) => {
  try {
    if (!["super_user", "super_admin", "admin", "corporate_admin"].includes(req.currentUser.role)) {
      return res.status(403).json({ error: "FORBIDDEN", message: "Admin access required to view identity audit" });
    }
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "100"), 10) || 100, 1), 500);
    const result = await db.execute(sql`
      SELECT id, user_id, user_email, field, action, old_value, new_value,
             actor_user_id, actor_email, source, reason, metadata, created_at
        FROM user_identity_audit_log
       ORDER BY created_at DESC
       LIMIT ${limit}
    `);
    res.json((result as any).rows ?? result);
  } catch (error) {
    console.error("[Admin] Identity audit error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch identity audit" });
  }
});

router.patch("/:userId/caa", requireCorporateAccess, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUser = req.currentUser;
    const { corporateAccessAdmin, canGrantSensitiveDataAccess, canGrantExports } = req.body;

    const [targetUser] = await db.select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, currentUser.orgId)))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    if (targetUser.role === 'driver' || targetUser.role === 'employee') {
      return res.status(400).json({ error: "INVALID_TARGET", message: "Cannot designate drivers or basic employees as Corporate Access Admin" });
    }

    const updateData: any = { updatedAt: new Date() };
    if (corporateAccessAdmin !== undefined) updateData.corporateAccessAdmin = corporateAccessAdmin;
    if (canGrantSensitiveDataAccess !== undefined) updateData.canGrantSensitiveDataAccess = canGrantSensitiveDataAccess;
    if (canGrantExports !== undefined) updateData.canGrantExports = canGrantExports;

    const [updated] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    await logProvisioningAction(
      currentUser.orgId, currentUser.id, currentUser.role,
      'caa_designation_changed',
      { changes: { corporateAccessAdmin, canGrantSensitiveDataAccess, canGrantExports } },
      userId, targetUser.email ?? undefined
    );

    res.json({ success: true, user: { id: updated.id, corporateAccessAdmin: updated.corporateAccessAdmin, canGrantSensitiveDataAccess: updated.canGrantSensitiveDataAccess, canGrantExports: updated.canGrantExports } });
  } catch (error) {
    console.error("[Admin] CAA designation error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update CAA designation" });
  }
});

// Explicit Driver Detail permission for revealing a full SSN/EIN.
// This is intentionally separate from broad sensitive-data and role permissions.
router.patch("/:userId/driver-permission", requireCorporateAccess, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUser = req.currentUser;
    const enabled = req.body?.viewFullDriverSsn;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "INVALID_PERMISSION", message: "viewFullDriverSsn must be a boolean" });
    }

    const [targetUser] = await db.select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, currentUser.orgId)))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }
    if (targetUser.role === "driver" || targetUser.role === "employee") {
      return res.status(400).json({ error: "INVALID_TARGET", message: "Full Driver SSN access can only be granted to corporate users" });
    }

    const actionPermissions = withExplicitFullDriverSsnAccess(targetUser.actionPermissions, enabled);

    const [updated] = await db.update(users)
      .set({ actionPermissions, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        actionPermissions: users.actionPermissions,
      });

    await logProvisioningAction(
      currentUser.orgId,
      currentUser.id,
      currentUser.role,
      "driver_full_ssn_permission_changed",
      { viewFullDriverSsn: enabled },
      userId,
      targetUser.email ?? undefined,
    );

    res.json({
      success: true,
      user: {
        id: updated.id,
        viewFullDriverSsn: (updated.actionPermissions as Record<string, boolean> | null)?.view_full_driver_ssn === true,
      },
    });
  } catch (error) {
    console.error("[Admin] Driver full SSN permission error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update Driver SSN permission" });
  }
});

// ─── Hiring Manager Request ──────────────────────────────────────────────────
const hmRequestSchema = z.object({
  employeeId: z.string().min(1, "Employee ID required"),
  requestedRole: z.string().min(1, "Role required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD").optional(),
  justification: z.string().optional(),
  requestedPermissionPack: z.string().optional(),
  requestedSensitiveFields: z.array(z.string()).optional().default([]),
});

router.post("/access-requests/hiring-manager", requireCorporateAccess, async (req: any, res: Response) => {
  try {
    const currentUser = req.currentUser;
    const validation = hmRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: validation.error.errors[0]?.message });
    }
    const { employeeId, requestedRole, startDate, justification, requestedPermissionPack, requestedSensitiveFields } = validation.data;

    const [employee] = await db.select().from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.status, "active")))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ error: "EMPLOYEE_NOT_FOUND", message: "Employee not found or inactive" });
    }

    const emailToUse = (employee as any).workEmail || employee.email;
    if (!emailToUse) {
      return res.status(400).json({ error: "NO_EMAIL", message: "Employee has no email address on file" });
    }

    const [existingUser] = await db.select().from(users).where(eq(users.email, emailToUse.toLowerCase())).limit(1);
    if (existingUser) {
      return res.status(409).json({ error: "USER_EXISTS", message: "A user account already exists for this employee" });
    }

    const [existingPending] = await db.select().from(userAccessRequests)
      .where(and(eq(userAccessRequests.requestedEmail, emailToUse.toLowerCase()), eq(userAccessRequests.status, "pending")))
      .limit(1);
    if (existingPending) {
      return res.status(409).json({ error: "PENDING_REQUEST", message: "An access request for this employee is already pending approval" });
    }

    const [request] = await db.insert(userAccessRequests).values({
      orgId: currentUser.orgId,
      requestorId: currentUser.id,
      requestedEmail: emailToUse.toLowerCase(),
      requestedFirstName: employee.firstName,
      requestedLastName: employee.lastName,
      requestedRole,
      requestedPermissionPack: requestedPermissionPack ?? null,
      requestedSensitiveFields: requestedSensitiveFields ?? [],
      justification: justification ?? null,
      cappedDiff: null,
      status: "pending",
      requestType: "hiring_manager_request",
      employeeId,
      hiringManagerId: currentUser.id,
      startDate: startDate ?? null,
    }).returning();

    await logProvisioningAction(
      currentUser.orgId, currentUser.id, currentUser.role,
      "hm_access_request_created",
      { employeeId, requestedRole, startDate, requestedEmail: emailToUse },
      undefined, emailToUse, request.id
    );

    await notifySuperAdmins(currentUser.orgId,
      "New Hiring Manager Access Request",
      `${currentUser.firstName || currentUser.email} submitted an access request for employee ${employee.firstName} ${employee.lastName} (${emailToUse}) with role "${requestedRole}"${startDate ? `, starting ${startDate}` : ""}. Approval required.`
    );

    res.status(202).json({
      success: true,
      message: "Access request submitted for Super Admin approval",
      requestId: request.id,
    });
  } catch (error) {
    console.error("[Admin] HM access request error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to submit access request" });
  }
});

// ─── SA: Provision User from Access Request (Pending Activation if future start date) ─
const provisionSchema = z.object({
  approvedRole: z.string().optional(),
  reviewerNotes: z.string().optional(),
});

router.post("/access-requests/:requestId/provision", requireCorporateAccess, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const currentUser = req.currentUser;
    const validation = provisionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: validation.error.errors[0]?.message });
    }

    const [request] = await db.select().from(userAccessRequests)
      .where(and(eq(userAccessRequests.id, req.params.requestId), eq(userAccessRequests.orgId, currentUser.orgId)))
      .limit(1);

    if (!request) return res.status(404).json({ error: "NOT_FOUND", message: "Access request not found" });
    if (!["pending", "more_info_requested"].includes(request.status)) {
      return res.status(400).json({ error: "ALREADY_PROCESSED", message: "This request has already been processed" });
    }

    const [existingUser] = await db.select().from(users).where(eq(users.email, request.requestedEmail)).limit(1);
    if (existingUser) {
      return res.status(409).json({ error: "USER_EXISTS", message: "A user with this email already exists" });
    }

    const finalRole = validation.data.approvedRole || request.requestedRole;
    const today = new Date().toISOString().split("T")[0];
    const isFutureStart = request.startDate && request.startDate > today;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, request.orgId)).limit(1);

    let inviteToken: string | null = null;
    let inviteTokenExpiresAt: Date | null = null;
    let userStatus = "INVITED";

    if (!isFutureStart) {
      inviteToken = randomBytes(32).toString("hex");
      inviteTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const [newUser] = await db.insert(users).values({
      email: request.requestedEmail.toLowerCase(),
      firstName: request.requestedFirstName ?? null,
      lastName: request.requestedLastName ?? null,
      role: finalRole,
      orgId: request.orgId,
      status: userStatus as any,
      inviteToken: inviteToken ?? undefined,
      inviteTokenExpiresAt: inviteTokenExpiresAt ?? undefined,
      isProvisioned: false,
      forcePasswordReset: true,
      pendingActivation: !!isFutureStart,
    }).returning();

    const finalStatus = isFutureStart ? "approved_pending_activation" : "approved";

    await db.update(userAccessRequests).set({
      status: finalStatus,
      reviewerId: currentUser.id,
      reviewerNotes: validation.data.reviewerNotes ?? null,
      approvedRole: finalRole,
      resultingUserId: newUser.id,
      resolvedAt: new Date(),
      activationSentAt: isFutureStart ? null : new Date(),
      updatedAt: new Date(),
    }).where(eq(userAccessRequests.id, request.id));

    await logProvisioningAction(
      currentUser.orgId, currentUser.id, currentUser.role,
      isFutureStart ? "user_provisioned_pending_activation" : "user_provisioned_and_invited",
      { requestId: request.id, finalRole, startDate: request.startDate, isFutureStart },
      newUser.id, request.requestedEmail, request.id
    );

    if (!isFutureStart && org && inviteToken) {
      try {
        const inviteUrl = buildInviteUrl(inviteToken);
        await sendUserInviteEmail({ to: request.requestedEmail, organizationName: org.name, inviteUrl, role: finalRole });
      } catch (err) {
        console.error("[Admin] Failed to send provisioning invite:", err);
      }
    }

    try {
      await db.insert(notifications as any).values({
        userId: request.requestorId,
        type: "access_request_update",
        title: isFutureStart ? "Access Request Approved — Pending Activation" : "Access Request Approved",
        message: isFutureStart
          ? `Your request for ${request.requestedEmail} was approved. Their account will be activated on ${request.startDate}.`
          : `Your request for ${request.requestedEmail} was approved and their invitation has been sent.`,
        isRead: false,
      });
    } catch (_) {}

    res.json({
      success: true,
      userId: newUser.id,
      pendingActivation: !!isFutureStart,
      startDate: request.startDate ?? null,
      message: isFutureStart
        ? `User created and will be activated on ${request.startDate}`
        : "User created and invitation sent",
    });
  } catch (error) {
    console.error("[Admin] Provision user error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to provision user" });
  }
});

// ─── SA: Manual Invite (SA-only, requires reason) ────────────────────────────
const manualInviteSchema = z.object({
  email: z.string().email("Valid email required"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.string().min(1, "Role required"),
  reason: z.string().min(10, "A reason of at least 10 characters is required for manual invitations"),
  permissionPack: z.string().optional(),
  sensitiveFields: z.array(z.string()).optional().default([]),
});

router.post("/manual-invite", requireCorporateAccess, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const currentUser = req.currentUser;
    const validation = manualInviteSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: validation.error.errors[0]?.message });
    }
    const { email, firstName, lastName, role, reason, permissionPack, sensitiveFields } = validation.data;

    if (email.toLowerCase() === currentUser.email?.toLowerCase()) {
      return res.status(400).json({ error: "SELF_INVITE", message: "Cannot invite yourself" });
    }

    const [existingUser] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existingUser) {
      return res.status(409).json({ error: "USER_EXISTS", message: "A user with this email already exists" });
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, currentUser.orgId)).limit(1);
    if (!org) return res.status(404).json({ error: "ORG_NOT_FOUND", message: "Organization not found" });

    const inviteToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [newUser] = await db.insert(users).values({
      email: email.toLowerCase(),
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      role,
      orgId: currentUser.orgId,
      status: "INVITED",
      inviteToken,
      inviteTokenExpiresAt: expiresAt,
      isProvisioned: false,
      forcePasswordReset: true,
    }).returning();

    const [request] = await db.insert(userAccessRequests).values({
      orgId: currentUser.orgId,
      requestorId: currentUser.id,
      requestedEmail: email.toLowerCase(),
      requestedFirstName: firstName ?? null,
      requestedLastName: lastName ?? null,
      requestedRole: role,
      requestedPermissionPack: permissionPack ?? null,
      requestedSensitiveFields: sensitiveFields ?? [],
      justification: reason,
      cappedDiff: null,
      status: "approved",
      requestType: "manual_invite",
      manualInviteReason: reason,
      resultingUserId: newUser.id,
      reviewerId: currentUser.id,
      reviewerNotes: `Manual invite issued by Super Admin: ${reason}`,
      resolvedAt: new Date(),
      activationSentAt: new Date(),
    }).returning();

    await logProvisioningAction(
      currentUser.orgId, currentUser.id, currentUser.role,
      "manual_invite_issued",
      { role, reason, permissionPack },
      newUser.id, email, request.id
    );

    if (isRootSuperAdmin(currentUser)) {
      await logSuperAdminAction(
        currentUser.id, currentUser.email || "",
        "manual_invite_issued", "user_management",
        { targetType: "user", targetId: newUser.id, targetLabel: email,
          details: { role, reason }, ipAddress: (req as any).ip }
      );
    }

    try {
      const inviteUrl = buildInviteUrl(inviteToken);
      await sendUserInviteEmail({ to: email, organizationName: org.name, inviteUrl, role });
    } catch (err) {
      console.error("[Admin] Failed to send manual invite email:", err);
    }

    res.status(201).json({
      success: true,
      message: "Manual invitation sent successfully",
      userId: newUser.id,
      requestId: request.id,
    });
  } catch (error) {
    console.error("[Admin] Manual invite error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to issue manual invitation" });
  }
});

// ─── List Pending Activations (SA only) ──────────────────────────────────────
router.get("/provisioning/pending-activations", requireCorporateAccess, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const currentUser = req.currentUser;
    const pendingRequests = await db.select().from(userAccessRequests)
      .where(and(
        eq(userAccessRequests.orgId, currentUser.orgId),
        eq(userAccessRequests.status, "approved_pending_activation"),
      ))
      .orderBy(desc(userAccessRequests.startDate ?? userAccessRequests.createdAt));

    const userIds = pendingRequests.map(r => r.resultingUserId).filter(Boolean) as string[];
    let userMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const usersData = await db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, pendingActivation: users.pendingActivation, status: users.status }).from(users).where(inArray(users.id, userIds));
      userMap = Object.fromEntries(usersData.map(u => [u.id, u]));
    }

    res.json(pendingRequests.map(r => ({
      ...r,
      user: r.resultingUserId ? userMap[r.resultingUserId] : null,
    })));
  } catch (error) {
    console.error("[Admin] Pending activations error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch pending activations" });
  }
});

// ─── Trigger Immediate Activation for a Pending User (SA only) ───────────────
router.post("/provisioning/activate/:userId", requireCorporateAccess, requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const currentUser = req.currentUser;
    const { userId } = req.params;

    const [targetUser] = await db.select().from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, currentUser.orgId)))
      .limit(1);

    if (!targetUser) return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    if (!targetUser.pendingActivation) {
      return res.status(400).json({ error: "NOT_PENDING", message: "User is not in pending activation state" });
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, currentUser.orgId)).limit(1);

    const inviteToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.update(users).set({
      pendingActivation: false,
      inviteToken,
      inviteTokenExpiresAt: expiresAt,
      status: "INVITED",
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    const [matchingRequest] = await db.select().from(userAccessRequests)
      .where(and(eq(userAccessRequests.resultingUserId, userId), eq(userAccessRequests.status, "approved_pending_activation")))
      .limit(1);

    if (matchingRequest) {
      await db.update(userAccessRequests).set({
        status: "approved",
        activationSentAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(userAccessRequests.id, matchingRequest.id));
    }

    await logProvisioningAction(
      currentUser.orgId, currentUser.id, currentUser.role,
      "user_activation_triggered_manually",
      { triggeredBy: "super_admin" },
      userId, targetUser.email ?? undefined
    );

    if (targetUser.email && org) {
      try {
        const inviteUrl = buildInviteUrl(inviteToken);
        await sendUserInviteEmail({ to: targetUser.email, organizationName: org.name, inviteUrl, role: targetUser.role });
      } catch (err) {
        console.error("[Admin] Failed to send activation email:", err);
      }
    }

    res.json({ success: true, message: "User activated and invitation sent" });
  } catch (error) {
    console.error("[Admin] Activate user error:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to activate user" });
  }
});

export default router;

