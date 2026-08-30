import { Router, Request, Response } from "express";
import { db } from "../db";
import { drivers, customers, mergeHistory, users } from "../../shared/schema";
import { eq, ilike, or, and, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

/** Resolve the DB user record from the request (handles both session-based and OIDC auth). */
async function getDbUser(req: Request): Promise<any | null> {
  const reqUser = (req as any).user;
  const userId: string | undefined =
    reqUser?.claims?.sub ||
    (req.session as any)?.userId ||
    reqUser?.id;
  if (!userId) return null;
  // If the user object already has role/isRootSuperAdmin populated (OIDC path), use it directly
  if (reqUser?.role !== undefined || reqUser?.isRootSuperAdmin !== undefined) return reqUser;
  // Session-based auth only populates claims.sub — fetch the full record from the DB
  const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return dbUser ?? null;
}

async function requireSuperAdmin(req: Request, res: Response): Promise<boolean> {
  try {
    const dbUser = await getDbUser(req);
    if (!dbUser || (!dbUser.isRootSuperAdmin && dbUser.role !== "super_user")) {
      res.status(403).json({ error: "FORBIDDEN", message: "Super Admin access required to perform merge operations." });
      return false;
    }
    return true;
  } catch (e: any) {
    res.status(500).json({ error: "Failed to verify permissions", message: e.message });
    return false;
  }
}

async function getAccountOperationalCounts(id: string): Promise<Record<string, number>> {
  const tables = [
    { label: "Moves", table: "moves", col: "customer_id" },
    { label: "Claims", table: "claims", col: "customer_id" },
    { label: "Invoices", table: "invoices", col: "customer_id" },
    { label: "Payments", table: "payments", col: "customer_id" },
    { label: "Tasks", table: "tasks", col: "customer_id" },
    { label: "Notes", table: "account_notes", col: "customer_id" },
    { label: "Documents", table: "customer_documents", col: "customer_id" },
  ];
  const counts: Record<string, number> = {};
  for (const { label, table, col } of tables) {
    try {
      const r = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${col} = '${id}'`));
      counts[label] = parseInt(((r as any).rows ?? r)[0]?.cnt ?? "0", 10);
    } catch {
      counts[label] = 0;
    }
  }
  return counts;
}

async function getDriverOperationalCounts(id: string): Promise<Record<string, number>> {
  const tables = [
    { label: "Moves", table: "moves", col: "driver_id" },
    { label: "Claims", table: "claims", col: "driver_id" },
    { label: "Tasks", table: "tasks", col: "driver_id" },
    { label: "Notes", table: "driver_notes", col: "driver_id" },
    { label: "Documents", table: "driver_documents", col: "driver_id" },
    { label: "Pay Records", table: "pay_records", col: "driver_id" },
    { label: "Account Assignments", table: "driver_accounts", col: "driver_id" },
  ];
  const counts: Record<string, number> = {};
  for (const { label, table, col } of tables) {
    try {
      const r = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${col} = '${id}'`));
      counts[label] = parseInt(((r as any).rows ?? r)[0]?.cnt ?? "0", 10);
    } catch {
      counts[label] = 0;
    }
  }
  return counts;
}

// ── ACCOUNT MERGE ROUTES ──────────────────────────────────────────────────────

// Normalize a string for fuzzy name comparison: lowercase, strip punctuation, collapse whitespace
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

// Search accounts (exclude already-merged ones)
// Supports:
//  - empty q  → auto-suggest by normalized primary account name + dealerId
//  - q provided → normalized name match OR customerNumber OR dealerId match
router.get("/accounts/search", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const q = String(req.query.q || "").trim();
  const excludeId = req.query.excludeId as string | undefined;

  try {
    // Base conditions always applied
    const baseConditions: any[] = [
      isNull(customers.mergedIntoId),
      eq(customers.isDeleted, false),
      ...(excludeId ? [sql`${customers.id} != ${excludeId}`] : []),
    ];

    let matchCondition: any = undefined;

    if (q) {
      // User typed a search term — match on name (normalized), customerNumber, or dealerId
      const normalizedQ = normalizeName(q);
      matchCondition = or(
        // Standard ILIKE (fast, uses index)
        ilike(customers.customerName, `%${q}%`),
        ilike(customers.customerNumber, `%${q}%`),
        ilike(customers.dealerId, `%${q}%`),
        // Normalized name match: strip punctuation/case on both sides
        sql`LOWER(REGEXP_REPLACE(customer_name, '[^a-zA-Z0-9 ]', '', 'g')) ILIKE ${`%${normalizedQ}%`}`,
      );
    } else if (excludeId) {
      // No search term — auto-suggest based on the primary record's name + dealerId
      const [primary] = await db
        .select({ customerName: customers.customerName, dealerId: customers.dealerId, customerNumber: customers.customerNumber })
        .from(customers)
        .where(eq(customers.id, excludeId));

      if (primary) {
        const normalizedPrimary = normalizeName(primary.customerName);
        const suggestions: any[] = [
          // Normalized name match (the core improvement)
          sql`LOWER(REGEXP_REPLACE(customer_name, '[^a-zA-Z0-9 ]', '', 'g')) ILIKE ${`%${normalizedPrimary}%`}`,
        ];
        if (primary.dealerId) {
          suggestions.push(sql`dealer_id = ${primary.dealerId}`);
        }
        if (primary.customerNumber) {
          suggestions.push(ilike(customers.customerNumber, primary.customerNumber));
        }
        matchCondition = or(...suggestions);
      }
    }

    const rows = await db
      .select({
        id: customers.id,
        customerName: customers.customerName,
        status: customers.status,
        customerType: customers.customerType,
        customerNumber: customers.customerNumber,
        dealerId: customers.dealerId,
      })
      .from(customers)
      .where(and(...baseConditions, matchCondition) as any)
      .limit(25);

    if (!Array.isArray(rows)) {
      return res.json([]);
    }
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get field diff between two accounts
router.get("/accounts/diff", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const { primaryId, duplicateId } = req.query as { primaryId: string; duplicateId: string };
  if (!primaryId || !duplicateId) return res.status(400).json({ error: "primaryId and duplicateId required" });
  try {
    const [primary] = await db.select().from(customers).where(eq(customers.id, primaryId));
    const [duplicate] = await db.select().from(customers).where(eq(customers.id, duplicateId));
    if (!primary || !duplicate) return res.status(404).json({ error: "Record not found" });

    const DISPLAY_FIELDS = [
      { key: "customerName", label: "Account Name" },
      { key: "id", label: "Record ID" },
      { key: "status", label: "Status" },
      { key: "customerType", label: "Account Type" },
      { key: "region", label: "Region" },
      { key: "program", label: "Program" },
      { key: "driverModel", label: "Driver Model" },
      { key: "customerLegalName", label: "Legal Name" },
      { key: "customerGroup", label: "Group" },
      { key: "customerAddress", label: "Address" },
      { key: "customerCity", label: "City" },
      { key: "customerState", label: "State" },
      { key: "customerZip", label: "ZIP" },
      { key: "primaryContactName", label: "Primary Contact" },
      { key: "primaryContactEmail", label: "Primary Email" },
      { key: "primaryContactNumber", label: "Primary Phone" },
      { key: "arStatus", label: "A/R Status" },
      { key: "createdAt", label: "Created Date" },
      { key: "lastActivityDate", label: "Last Activity Date" },
    ];

    const allFields = DISPLAY_FIELDS.map(f => ({
      key: f.key,
      label: f.label,
      primaryValue: (primary as any)[f.key],
      duplicateValue: (duplicate as any)[f.key],
      hasConflict: (primary as any)[f.key] !== (duplicate as any)[f.key] && ((primary as any)[f.key] || (duplicate as any)[f.key]),
      readonly: f.key === "id" || f.key === "createdAt" || f.key === "lastActivityDate",
    }));

    const conflicts = allFields.filter(f => f.hasConflict && !f.readonly);

    const [primaryCounts, duplicateCounts] = await Promise.all([
      getAccountOperationalCounts(primaryId),
      getAccountOperationalCounts(duplicateId),
    ]);

    res.json({ primary, duplicate, allFields, conflicts, operationalCounts: { primary: primaryCounts, duplicate: duplicateCounts } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Execute account merge
router.post("/accounts", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const user = (req as any).user;
  const userId = user?.claims?.sub || (req.session as any)?.userId || user?.id;
  const { primaryId, duplicateId, mergeReason, fieldResolutions } = req.body;
  if (!primaryId || !duplicateId) return res.status(400).json({ error: "primaryId and duplicateId required" });
  if (primaryId === duplicateId) return res.status(400).json({ error: "Primary and duplicate cannot be the same record" });

  const reassignments: Array<{ table: string; col: string }> = [
    { table: "moves", col: "customer_id" },
    { table: "account_notes", col: "customer_id" },
    { table: "driver_accounts", col: "account_id" },
    { table: "invoices", col: "customer_id" },
    { table: "payments", col: "customer_id" },
    { table: "tasks", col: "customer_id" },
    { table: "claims", col: "customer_id" },
    { table: "customer_documents", col: "customer_id" },
    { table: "account_decisions", col: "customer_id" },
    { table: "account_sla_config", col: "customer_id" },
    { table: "playbooks", col: "customer_id" },
    { table: "expansion_signals", col: "customer_id" },
    { table: "rideshare_transactions", col: "customer_id" },
    { table: "activity_log", col: "customer_id" },
    { table: "account_contacts", col: "customer_id" },
  ];

  try {
    // Pre-flight checks outside transaction
    const [primary] = await db.select().from(customers).where(eq(customers.id, primaryId));
    const [duplicate] = await db.select().from(customers).where(eq(customers.id, duplicateId));
    if (!primary) return res.status(404).json({ error: "Primary account not found" });
    if (!duplicate) return res.status(404).json({ error: "Duplicate account not found" });
    if (duplicate.mergedIntoId) return res.status(400).json({ error: "Duplicate account is already merged" });
    if (primary.mergedIntoId) return res.status(400).json({ error: "Primary account is itself already merged into another record" });

    const fieldUpdates: Record<string, any> = {};
    if (fieldResolutions) {
      for (const [key, choice] of Object.entries(fieldResolutions)) {
        if (choice === "duplicate") {
          fieldUpdates[key] = (duplicate as any)[key];
        }
      }
    }

    // Phase 1: Reassign child records — run individually with try/catch (some tables may not exist)
    const moved: Record<string, number> = {};
    console.log(`[Merge:Account] BEGIN — reassigning child records from ${duplicateId} → ${primaryId}`);

    for (const { table, col } of reassignments) {
      try {
        const result = await db.execute(
          sql.raw(`UPDATE ${table} SET ${col} = '${primaryId}' WHERE ${col} = '${duplicateId}'`)
        );
        const rowCount = (result as any).rowCount ?? 0;
        moved[table] = rowCount;
        if (rowCount > 0) {
          console.log(`[Merge:Account] Reassigned ${rowCount} rows in ${table}.${col}`);
        }
      } catch (tableErr: any) {
        // Table does not exist or column name differs — skip, log, and continue
        console.warn(`[Merge:Account] Skipped ${table}.${col}: ${tableErr.message}`);
        moved[table] = 0;
      }
    }

    // Phase 2: Atomic finalization — mark duplicate as Merged + write audit record in one transaction
    console.log(`[Merge:Account] Finalizing: marking duplicate ${duplicateId} as Merged`);
    await db.transaction(async (tx) => {
      // Apply any field resolutions to the primary account
      if (Object.keys(fieldUpdates).length > 0) {
        console.log(`[Merge:Account] Applying ${Object.keys(fieldUpdates).length} field resolution(s) to primary ${primaryId}`);
        await tx.update(customers)
          .set({ ...fieldUpdates, updatedAt: new Date() })
          .where(eq(customers.id, primaryId));
      }

      // Mark duplicate as Merged — the critical persistence step
      await tx.update(customers).set({
        mergedIntoId: primaryId,
        mergedAt: new Date(),
        mergedById: userId,
        mergeReason: mergeReason || null,
        status: "Merged",
        isDeleted: false,   // retain the record for audit purposes
        updatedAt: new Date(),
      }).where(eq(customers.id, duplicateId));

      // Write immutable audit record
      await tx.insert(mergeHistory).values({
        entityType: "account",
        primaryId,
        duplicateId,
        mergedBy: userId,
        mergeReason: mergeReason || null,
        fieldResolutions: JSON.stringify(fieldResolutions || {}),
        childRecordsMoved: JSON.stringify(moved),
      });
    });

    // Post-transaction verification
    const [verifyDup] = await db.select({ status: customers.status, mergedIntoId: customers.mergedIntoId })
      .from(customers).where(eq(customers.id, duplicateId));
    if (!verifyDup || verifyDup.mergedIntoId !== primaryId) {
      throw new Error(`Merge verification failed: duplicate ${duplicateId} did not persist merged_into_id after commit`);
    }

    console.log(`[Merge:Account] SUCCESS — ${duplicateId} merged into ${primaryId}. Records moved: ${JSON.stringify(moved)}`);
    res.json({ success: true, primaryId, duplicateId, moved });
  } catch (e: any) {
    console.error("[Merge:Account] FAILED — transaction rolled back:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── DRIVER MERGE ROUTES ───────────────────────────────────────────────────────

// Search drivers (exclude merged)
router.get("/drivers/search", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const q = String(req.query.q || "").trim();
  const excludeId = req.query.excludeId as string | undefined;
  try {
    const rows = await db.execute(sql.raw(`
      SELECT d.id,
             COALESCE(u.first_name || ' ' || u.last_name, d.driver_number, d.id) as display_name,
             u.first_name as first_name, u.last_name as last_name,
             d.driver_number, d.status, d.driver_type, d.market
      FROM drivers d
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.merged_into_id IS NULL
        AND (d.is_deleted IS NULL OR d.is_deleted = false)
        ${q ? `AND (u.first_name ILIKE '%${q.replace(/'/g, "''")}%' OR u.last_name ILIKE '%${q.replace(/'/g, "''")}%' OR d.driver_number ILIKE '%${q.replace(/'/g, "''")}%')` : ""}
        ${excludeId ? `AND d.id != '${excludeId.replace(/'/g, "''")}'` : ""}
      LIMIT 20
    `));
    res.json((rows as any).rows ?? rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get field diff between two drivers
router.get("/drivers/diff", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const { primaryId, duplicateId } = req.query as { primaryId: string; duplicateId: string };
  if (!primaryId || !duplicateId) return res.status(400).json({ error: "primaryId and duplicateId required" });
  try {
    const result = await db.execute(sql.raw(`
      SELECT d.id, d.driver_number, d.driver_type, d.market, d.status,
             d.license_number, d.license_state, d.license_expiration,
             d.hire_date, d.driver_classification, d.network, d.recruiter,
             d.direct_manager, d.phone_number, d.created_at,
             d.last_access_at,
             u.first_name, u.last_name, u.email,
             d.merged_into_id
      FROM drivers d
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.id IN ('${primaryId}', '${duplicateId}')
    `));
    const rows = ((result as any).rows ?? result) as any[];
    const primary = rows.find(r => r.id === primaryId);
    const duplicate = rows.find(r => r.id === duplicateId);
    if (!primary || !duplicate) return res.status(404).json({ error: "Record not found" });

    const DISPLAY_FIELDS = [
      { key: "first_name", label: "First Name" },
      { key: "last_name", label: "Last Name" },
      { key: "id", label: "Record ID" },
      { key: "status", label: "Status" },
      { key: "phone_number", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "driver_number", label: "Driver Number" },
      { key: "driver_type", label: "Driver Type" },
      { key: "driver_classification", label: "Classification" },
      { key: "market", label: "Market" },
      { key: "license_number", label: "License #" },
      { key: "license_state", label: "License State" },
      { key: "hire_date", label: "Hire Date" },
      { key: "network", label: "Network" },
      { key: "direct_manager", label: "Direct Manager" },
      { key: "recruiter", label: "Recruiter" },
      { key: "created_at", label: "Created Date" },
      { key: "last_access_at", label: "Last Activity" },
    ];

    const allFields = DISPLAY_FIELDS.map(f => ({
      key: f.key,
      label: f.label,
      primaryValue: primary[f.key],
      duplicateValue: duplicate[f.key],
      hasConflict: primary[f.key] !== duplicate[f.key] && (primary[f.key] || duplicate[f.key]),
      readonly: f.key === "id" || f.key === "created_at" || f.key === "last_access_at",
    }));

    const conflicts = allFields.filter(f => f.hasConflict && !f.readonly);

    const [primaryCounts, duplicateCounts] = await Promise.all([
      getDriverOperationalCounts(primaryId),
      getDriverOperationalCounts(duplicateId),
    ]);

    res.json({ primary, duplicate, allFields, conflicts, operationalCounts: { primary: primaryCounts, duplicate: duplicateCounts } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Execute driver merge
router.post("/drivers", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const user = (req as any).user;
  const userId = user?.claims?.sub || (req.session as any)?.userId || user?.id;
  const { primaryId, duplicateId, mergeReason, fieldResolutions } = req.body;
  if (!primaryId || !duplicateId) return res.status(400).json({ error: "primaryId and duplicateId required" });
  if (primaryId === duplicateId) return res.status(400).json({ error: "Primary and duplicate cannot be the same record" });

  try {
    const [[primary], [duplicate]] = await Promise.all([
      db.select().from(drivers).where(eq(drivers.id, primaryId)),
      db.select().from(drivers).where(eq(drivers.id, duplicateId)),
    ]);
    if (!primary) return res.status(404).json({ error: "Primary driver not found" });
    if (!duplicate) return res.status(404).json({ error: "Duplicate driver not found" });
    if (duplicate.mergedIntoId) return res.status(400).json({ error: "Duplicate driver is already merged" });

    const reassignments: Array<{ table: string; col: string }> = [
      { table: "moves", col: "driver_id" },
      { table: "driver_accounts", col: "driver_id" },
      { table: "pay_records", col: "driver_id" },
      { table: "driver_notes", col: "driver_id" },
      { table: "driver_documents", col: "driver_id" },
      { table: "claims", col: "driver_id" },
      { table: "tasks", col: "driver_id" },
      { table: "driver_compliance_items", col: "driver_id" },
    ];

    const moved: Record<string, number> = {};
    for (const { table, col } of reassignments) {
      try {
        const result = await db.execute(sql.raw(`UPDATE ${table} SET ${col} = '${primaryId}' WHERE ${col} = '${duplicateId}'`));
        moved[table] = (result as any).rowCount ?? 0;
      } catch {
        // Skip if table/column doesn't exist
      }
    }

    await db.update(drivers).set({
      mergedIntoId: primaryId,
      mergedAt: new Date(),
      mergedById: userId,
      mergeReason: mergeReason || null,
      status: "merged",
      updatedAt: new Date(),
    }).where(eq(drivers.id, duplicateId));

    await db.insert(mergeHistory).values({
      entityType: "driver",
      primaryId,
      duplicateId,
      mergedBy: userId,
      mergeReason: mergeReason || null,
      fieldResolutions: JSON.stringify(fieldResolutions || {}),
      childRecordsMoved: JSON.stringify(moved),
    });

    res.json({ success: true, primaryId, duplicateId, moved });
  } catch (e: any) {
    console.error("Driver merge error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── MERGE HISTORY ─────────────────────────────────────────────────────────────

router.get("/history/:entityType/:entityId", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const { entityType, entityId } = req.params;
  try {
    const rows = await db.execute(sql.raw(`
      SELECT mh.*, u.first_name || ' ' || u.last_name as merged_by_name
      FROM merge_history mh
      LEFT JOIN users u ON u.id = mh.merged_by
      WHERE mh.entity_type = '${entityType}'
        AND (mh.primary_id = '${entityId}' OR mh.duplicate_id = '${entityId}')
      ORDER BY mh.merged_at DESC
    `));
    res.json((rows as any).rows ?? rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
