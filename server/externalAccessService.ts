import { db } from "./db";
import { 
  externalAccessGrants, 
  externalAccessLogs,
  type ExternalAccessGrant,
  type InsertExternalAccessGrant,
  type ExternalAccessScope,
  externalAccessScopes
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import crypto from "crypto";

export interface CreateGrantInput {
  role: 'carrier_viewer' | 'broker_viewer' | 'auditor_viewer' | 'oem_viewer' | 'partner_viewer';
  grantedToEmail: string;
  grantedToName?: string;
  grantedToOrg?: string;
  allowedScopes: ExternalAccessScope[];
  customerId?: string;
  claimId?: string;
  expiresAt: Date;
  notes?: string;
  createdBy: string;
  orgId?: string;
}

export interface AccessContext {
  grant: ExternalAccessGrant;
  accessedResource: string;
  resourceScope?: string;
  requestMethod?: string;
  requestPath?: string;
  ipAddress?: string;
  userAgent?: string;
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createAccessGrant(input: CreateGrantInput): Promise<ExternalAccessGrant> {
  const accessToken = generateSecureToken();
  
  const [grant] = await db
    .insert(externalAccessGrants)
    .values({
      role: input.role,
      grantedToEmail: input.grantedToEmail,
      grantedToName: input.grantedToName || null,
      grantedToOrg: input.grantedToOrg || null,
      allowedScopes: input.allowedScopes,
      customerId: input.customerId || null,
      claimId: input.claimId || null,
      expiresAt: input.expiresAt,
      accessToken,
      isActive: true,
      createdBy: input.createdBy,
      notes: input.notes || null,
    })
    .returning();

  return grant;
}

export async function validateAccessToken(token: string): Promise<ExternalAccessGrant | null> {
  const now = new Date();
  
  const [grant] = await db
    .select()
    .from(externalAccessGrants)
    .where(
      and(
        eq(externalAccessGrants.accessToken, token),
        eq(externalAccessGrants.isActive, true),
        gte(externalAccessGrants.expiresAt, now)
      )
    )
    .limit(1);

  return grant || null;
}

export function checkScopeAccess(
  grant: ExternalAccessGrant, 
  requestedScope: ExternalAccessScope
): boolean {
  const allowedScopes = grant.allowedScopes as string[];
  return allowedScopes.includes(requestedScope);
}

export async function getGrantOrgContext(grant: ExternalAccessGrant): Promise<string | null> {
  const { users } = await import("@shared/schema");
  const creator = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, grant.createdBy),
  });
  return creator?.orgId || null;
}

export async function logExternalAccess(
  context: AccessContext,
  responseStatus: number
): Promise<void> {
  await db.insert(externalAccessLogs).values({
    grantId: context.grant.id,
    accessedResource: context.accessedResource,
    resourceScope: context.resourceScope || null,
    requestMethod: context.requestMethod || null,
    requestPath: context.requestPath || null,
    ipAddress: context.ipAddress || null,
    userAgent: context.userAgent || null,
    responseStatus,
  });
}

export async function revokeGrant(
  grantId: string,
  revokedBy: string,
  reason?: string
): Promise<ExternalAccessGrant | null> {
  const [updated] = await db
    .update(externalAccessGrants)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedBy,
      revokedReason: reason || null,
    })
    .where(eq(externalAccessGrants.id, grantId))
    .returning();

  return updated || null;
}

export async function listActiveGrants(filters?: {
  role?: string;
  email?: string;
}): Promise<ExternalAccessGrant[]> {
  const now = new Date();
  
  let query = db
    .select()
    .from(externalAccessGrants)
    .where(
      and(
        eq(externalAccessGrants.isActive, true),
        gte(externalAccessGrants.expiresAt, now)
      )
    )
    .orderBy(desc(externalAccessGrants.createdAt));

  const grants = await query;
  
  let filtered = grants;
  if (filters?.role) {
    filtered = filtered.filter(g => g.role === filters.role);
  }
  if (filters?.email) {
    filtered = filtered.filter(g => 
      g.grantedToEmail.toLowerCase().includes(filters.email!.toLowerCase())
    );
  }
  
  return filtered;
}

export async function listAllGrants(includeExpired = false): Promise<ExternalAccessGrant[]> {
  const now = new Date();
  
  if (includeExpired) {
    return db
      .select()
      .from(externalAccessGrants)
      .orderBy(desc(externalAccessGrants.createdAt));
  }
  
  return db
    .select()
    .from(externalAccessGrants)
    .where(
      and(
        eq(externalAccessGrants.isActive, true),
        gte(externalAccessGrants.expiresAt, now)
      )
    )
    .orderBy(desc(externalAccessGrants.createdAt));
}

export async function getGrantById(grantId: string): Promise<ExternalAccessGrant | null> {
  const [grant] = await db
    .select()
    .from(externalAccessGrants)
    .where(eq(externalAccessGrants.id, grantId))
    .limit(1);

  return grant || null;
}

export async function getAccessLogs(grantId: string, limit = 100): Promise<typeof externalAccessLogs.$inferSelect[]> {
  return db
    .select()
    .from(externalAccessLogs)
    .where(eq(externalAccessLogs.grantId, grantId))
    .orderBy(desc(externalAccessLogs.occurredAt))
    .limit(limit);
}

export async function getAllAccessLogs(filters?: {
  startDate?: Date;
  endDate?: Date;
  resource?: string;
}, limit = 500): Promise<typeof externalAccessLogs.$inferSelect[]> {
  let conditions = [];
  
  if (filters?.startDate) {
    conditions.push(gte(externalAccessLogs.occurredAt, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(externalAccessLogs.occurredAt, filters.endDate));
  }
  if (filters?.resource) {
    conditions.push(eq(externalAccessLogs.accessedResource, filters.resource));
  }
  
  if (conditions.length > 0) {
    return db
      .select()
      .from(externalAccessLogs)
      .where(and(...conditions))
      .orderBy(desc(externalAccessLogs.occurredAt))
      .limit(limit);
  }
  
  return db
    .select()
    .from(externalAccessLogs)
    .orderBy(desc(externalAccessLogs.occurredAt))
    .limit(limit);
}

export function cleanupExpiredGrants(): Promise<void> {
  return db
    .update(externalAccessGrants)
    .set({ isActive: false })
    .where(
      and(
        eq(externalAccessGrants.isActive, true),
        lte(externalAccessGrants.expiresAt, new Date())
      )
    )
    .then(() => {});
}

export { externalAccessScopes };
