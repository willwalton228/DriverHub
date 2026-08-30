import { db, pool } from "../db";
import { userIdentityAuditLog, type User } from "@shared/schema";

export const CORPORATE_USER_ROLES = [
  "super_user",
  "super_admin",
  "admin",
  "corporate_admin",
  "corporate",
  "ops_manager",
  "finance",
  "recruiter",
  "regional_cl",
  "network_cl",
  "dealer_cl",
  "certification_liaison",
] as const;

export type IdentityField = "firstName" | "lastName" | "email";
export type IdentityAuditAction = "changed" | "clear_blocked" | "repaired" | "detected";

export interface IdentityUpdateContext {
  source: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface IdentityAuditDraft {
  field: IdentityField;
  action: IdentityAuditAction;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
}

export interface IdentityUpdateDecision {
  patch: Partial<Pick<User, "firstName" | "lastName" | "email">>;
  audits: IdentityAuditDraft[];
}

const identityFields: IdentityField[] = ["firstName", "lastName", "email"];

function hasOwn(value: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function oldValueFor(user: Pick<User, IdentityField>, field: IdentityField): string | null {
  const value = user[field];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function isActiveHumanUser(user: Pick<User, "status" | "role">): boolean {
  return user.status === "ACTIVE" && user.role !== "integration_user";
}

export function findBlankIdentityUsers(rows: Array<{
  id: string;
  email: string | null;
  role: string;
  first_name?: unknown;
  last_name?: unknown;
  firstName?: unknown;
  lastName?: unknown;
}>): Array<Record<string, unknown>> {
  return rows
    .filter((row) => !normalizeName(row.first_name ?? row.firstName) || !normalizeName(row.last_name ?? row.lastName))
    .map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      missingFields: [
        ...(!normalizeName(row.first_name ?? row.firstName) ? ["firstName"] : []),
        ...(!normalizeName(row.last_name ?? row.lastName) ? ["lastName"] : []),
      ],
    }));
}

/**
 * Build a safe identity patch without allowing sparse or blank values to
 * clear an active human's stored identity. The function is pure so it can be
 * regression-tested without mutating the database.
 */
export function prepareIdentityUpdate(
  existing: Pick<User, IdentityField | "status" | "role">,
  incoming: Partial<Record<IdentityField, unknown>>,
  context: IdentityUpdateContext,
): IdentityUpdateDecision {
  const patch: IdentityUpdateDecision["patch"] = {};
  const audits: IdentityAuditDraft[] = [];
  const isHuman = isActiveHumanUser(existing);

  for (const field of identityFields) {
    if (!hasOwn(incoming, field)) continue;

    const oldValue = oldValueFor(existing, field);
    const nextValue = field === "email"
      ? normalizeEmail(incoming[field])
      : normalizeName(incoming[field]);

    if (!nextValue) {
      if (isHuman) {
        audits.push({
          field,
          action: "clear_blocked",
          oldValue,
          newValue: null,
          reason: context.reason ?? `Blocked blank ${field} update for an active human user.`,
        });
        continue;
      }
      patch[field] = null;
      if (oldValue !== null) {
        audits.push({
          field,
          action: "changed",
          oldValue,
          newValue: null,
          reason: context.reason ?? `Explicit ${field} clear for a non-human or inactive account.`,
        });
      }
      continue;
    }

    if (nextValue !== oldValue) {
      patch[field] = nextValue;
      audits.push({
        field,
        action: "changed",
        oldValue,
        newValue: nextValue,
        reason: context.reason ?? `Explicit ${field} update.`,
      });
    }
  }

  return { patch, audits };
}

export async function writeIdentityAudits(
  user: Pick<User, "id" | "email">,
  audits: IdentityAuditDraft[],
  context: IdentityUpdateContext,
): Promise<void> {
  if (audits.length === 0) return;
  try {
    await db.insert(userIdentityAuditLog).values(audits.map((audit) => ({
      userId: user.id,
      userEmail: user.email ?? null,
      field: audit.field,
      action: audit.action,
      oldValue: audit.oldValue,
      newValue: audit.newValue,
      actorUserId: context.actorUserId ?? null,
      actorEmail: context.actorEmail ?? null,
      source: context.source,
      reason: audit.reason,
      metadata: context.metadata ?? null,
    })));
  } catch (error) {
    // Identity audit failure must not turn a successful login/update into a
    // failed request, but it must be visible to operators.
    console.error("[IdentityIntegrity] Failed to write identity audit:", error);
  }
}

export async function scanActiveCorporateIdentities(): Promise<{
  scannedAt: string;
  totalActiveCorporateUsers: number;
  blankIdentityUsers: Array<Record<string, unknown>>;
  duplicateEmails: Array<Record<string, unknown>>;
  duplicateSsoSubjects: Array<Record<string, unknown>>;
  duplicateInternalLinks: Array<Record<string, unknown>>;
  brokenAuthenticationLinkage: Array<Record<string, unknown>>;
  historicalAmrAnomalies: Array<Record<string, unknown>>;
}> {
  const roles = [...CORPORATE_USER_ROLES];
  const [usersResult, duplicateEmails, duplicateSsoSubjects, duplicateInternalLinks, brokenAuth, historicalAmr] =
    await Promise.all([
      pool.query(
        `SELECT id, email, first_name, last_name, role, status, org_id,
                is_provisioned, sso_subject_id, driver_id, employee_id,
                (password_hash IS NOT NULL AND trim(password_hash) <> '') AS has_password
           FROM users
          WHERE status = 'ACTIVE' AND role = ANY($1::text[])
          ORDER BY lower(trim(email)), id`,
        [roles],
      ),
      pool.query(
        `SELECT lower(trim(email)) AS normalized_email, count(*)::int AS user_count,
                array_agg(id ORDER BY id) AS user_ids
           FROM users
          WHERE email IS NOT NULL AND trim(email) <> ''
          GROUP BY lower(trim(email))
         HAVING count(*) > 1
          ORDER BY normalized_email`,
      ),
      pool.query(
        `SELECT lower(trim(sso_subject_id)) AS normalized_subject, count(*)::int AS user_count,
                array_agg(id ORDER BY id) AS user_ids
           FROM users
          WHERE status = 'ACTIVE' AND role = ANY($1::text[])
            AND sso_subject_id IS NOT NULL AND trim(sso_subject_id) <> ''
          GROUP BY lower(trim(sso_subject_id))
         HAVING count(*) > 1
          ORDER BY normalized_subject`,
        [roles],
      ),
      pool.query(
        `SELECT link_type, link_value, count(*)::int AS user_count,
                array_agg(id ORDER BY id) AS user_ids
           FROM (
             SELECT id, 'driver_id' AS link_type, driver_id AS link_value
               FROM users
              WHERE status = 'ACTIVE' AND role = ANY($1::text[])
                AND driver_id IS NOT NULL AND trim(driver_id) <> ''
             UNION ALL
             SELECT id, 'employee_id', employee_id
               FROM users
              WHERE status = 'ACTIVE' AND role = ANY($1::text[])
                AND employee_id IS NOT NULL AND trim(employee_id) <> ''
           ) links
          GROUP BY link_type, link_value
         HAVING count(*) > 1
          ORDER BY link_type, link_value`,
        [roles],
      ),
      pool.query(
        `SELECT id, email, role, status, password_hash IS NOT NULL
                  AND trim(password_hash) <> '' AS has_password,
                sso_subject_id IS NOT NULL
                  AND trim(sso_subject_id) <> '' AS has_sso_subject
           FROM users
          WHERE status = 'ACTIVE' AND role = ANY($1::text[])
            AND (password_hash IS NULL OR trim(password_hash) = '')
            AND (sso_subject_id IS NULL OR trim(sso_subject_id) = '')
          ORDER BY lower(trim(email)), id`,
        [roles],
      ),
      pool.query(
        `SELECT t.id, t.ticket_number, t.submitted_by_user_id AS referenced_user_id,
                'submitted_by_user_id' AS reference_type
           FROM tickets t
           LEFT JOIN users u ON u.id = t.submitted_by_user_id
          WHERE u.id IS NULL
         UNION ALL
         SELECT t.id, t.ticket_number, t.assigned_to_user_id, 'assigned_to_user_id'
           FROM tickets t
           LEFT JOIN users u ON u.id = t.assigned_to_user_id
          WHERE t.assigned_to_user_id IS NOT NULL AND u.id IS NULL
         UNION ALL
         SELECT t.id, t.ticket_number, t.product_owner_user_id, 'product_owner_user_id'
           FROM tickets t
           LEFT JOIN users u ON u.id = t.product_owner_user_id
          WHERE t.product_owner_user_id IS NOT NULL AND u.id IS NULL
         UNION ALL
         SELECT t.id, t.ticket_number, t.developer_user_id, 'developer_user_id'
           FROM tickets t
           LEFT JOIN users u ON u.id = t.developer_user_id
          WHERE t.developer_user_id IS NOT NULL AND u.id IS NULL
          ORDER BY ticket_number, reference_type`,
      ),
    ]);

  const blankIdentityUsers = findBlankIdentityUsers(usersResult.rows);

  return {
    scannedAt: new Date().toISOString(),
    totalActiveCorporateUsers: usersResult.rows.length,
    blankIdentityUsers,
    duplicateEmails: duplicateEmails.rows,
    duplicateSsoSubjects: duplicateSsoSubjects.rows,
    duplicateInternalLinks: duplicateInternalLinks.rows,
    brokenAuthenticationLinkage: brokenAuth.rows,
    historicalAmrAnomalies: historicalAmr.rows,
  };
}