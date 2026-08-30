import { parseFullName } from "../services/nameParsingService";
import { snapshotUserCount, assertUserCountUnchanged } from "../services/importUserGuard";
import { Router, Response } from "express";
import { db } from "../db";
import {
  users,
  employees,
  importBatches,
  importStagingRows,
  importAuditLog,
  type ImportStagingRow,
} from "@shared/schema";
import { eq, and, desc, ilike, inArray, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import multer from "multer";
import { isAuthenticated } from "../replitAuth";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const router = Router();

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
async function resolveUser(req: any) {
  const userId = (req.session as any)?.userId || req.user?.claims?.sub;
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  return {
    id: user.id,
    role: user.role || "",
    isRootSuperAdmin: !!(user as any).isRootSuperAdmin,
    email: user.email || "",
    displayName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || user.id,
  };
}

function isSuperAdminUser(u: { role: string; isRootSuperAdmin: boolean }) {
  return u.role === "super_user" || u.isRootSuperAdmin === true;
}

async function requireSuperAdmin(req: any, res: Response, next: Function) {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!isSuperAdminUser(user)) {
    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "import_blocked",
        actorUserId: user.id,
        actorUserEmail: user.email,
        targetEntityType: "employee_import",
        targetEntityId: req.path,
        reason: "not_super_admin",
        metadata: { route: req.path, userRole: user.role },
      });
    } catch (_) {}
    return res.status(403).json({ error: "IMPORT_FORBIDDEN", message: "Super Admin access required for data imports." });
  }
  (req as any).resolvedUser = user;
  next();
}

// ---------------------------------------------------------------------------
// Field Catalog
// ---------------------------------------------------------------------------
export const EMPLOYEE_FIELD_CATALOG = [
  { key: "firstName",               label: "First Name",                group: "Personal",     type: "text",    required: false, aliases: ["first name", "firstname", "first", "given name"] },
  { key: "lastName",                label: "Last Name",                 group: "Personal",     type: "text",    required: false, aliases: ["last name", "lastname", "last", "surname", "family name"] },
  { key: "fullName",                 label: "Full Name",                 group: "Personal",     type: "text",    required: false, aliases: ["full name", "full_name", "name", "employee name"] },
  { key: "email",                   label: "Personal Email",            group: "Personal",     type: "email",   required: true,  aliases: ["email", "personal email", "email address", "e-mail"] },
  { key: "workEmail",               label: "Work Email",                group: "Personal",     type: "text",    required: false, aliases: ["work email", "workemail", "corporate email", "company email"] },
  { key: "phoneNumber",             label: "Phone Number",              group: "Personal",     type: "text",    required: false, aliases: ["phone", "phone number", "mobile", "cell", "telephone"] },
  { key: "address",                 label: "Address",                   group: "Personal",     type: "text",    required: false, aliases: ["address", "street", "street address", "address line 1"] },
  { key: "city",                    label: "City",                      group: "Personal",     type: "text",    required: false, aliases: ["city"] },
  { key: "state",                   label: "State",                     group: "Personal",     type: "text",    required: false, aliases: ["state", "province"] },
  { key: "zipCode",                 label: "Zip Code",                  group: "Personal",     type: "text",    required: false, aliases: ["zip", "zip code", "zipcode", "postal code"] },
  { key: "dateOfBirth",             label: "Date of Birth",             group: "Personal",     type: "date",    required: false, aliases: ["dob", "date of birth", "birthdate", "birth date"] },
  { key: "employeeId",              label: "Employee ID",               group: "Employment",   type: "text",    required: false, aliases: ["employee id", "emp id", "employeeid", "id number", "badge"] },
  { key: "title",                   label: "Job Title",                 group: "Employment",   type: "text",    required: false, aliases: ["title", "job title", "position title"] },
  { key: "department",              label: "Department",                group: "Employment",   type: "text",    required: false, aliases: ["department", "dept"] },
  { key: "position",                label: "Position",                  group: "Employment",   type: "text",    required: false, aliases: ["position", "role"] },
  { key: "manager",                 label: "Manager",                   group: "Employment",   type: "text",    required: false, aliases: ["manager", "supervisor", "reports to"] },
  { key: "employeeType",            label: "Employee Type",             group: "Employment",   type: "text",    required: false, aliases: ["employee type", "flsa", "exempt status", "exempt/non-exempt"] },
  { key: "employmentType",          label: "Employment Type",           group: "Employment",   type: "text",    required: false, aliases: ["employment type", "full time/part time", "ft/pt", "part time", "full time"] },
  { key: "hireDate",                label: "Hire Date",                 group: "Dates",        type: "date",    required: false, aliases: ["hire date", "hired", "hired date", "start date", "date hired"] },
  { key: "startDate",               label: "Start Date",                group: "Dates",        type: "date",    required: false, aliases: ["startdate", "effective date"] },
  { key: "termDate",                label: "Termination Date",          group: "Dates",        type: "date",    required: false, aliases: ["term date", "termination date", "end date", "separation date"] },
  { key: "status",                  label: "Status",                    group: "Employment",   type: "text",    required: false, aliases: ["status", "employment status"] },
  { key: "eligibleForRehire",       label: "Eligible for Rehire",       group: "Employment",   type: "text",    required: false, aliases: ["eligible for rehire", "rehire eligible", "rehireable", "rehire"] },
  { key: "annualSalary",            label: "Annual Salary",             group: "Compensation", type: "decimal", required: false, aliases: ["annual salary", "salary", "base salary", "annual pay"] },
  { key: "hourlyRate",              label: "Hourly Rate",               group: "Compensation", type: "decimal", required: false, aliases: ["hourly rate", "hourly pay", "rate", "pay rate", "hour rate"] },
  { key: "bonusEligible",           label: "Bonus Eligible",            group: "Compensation", type: "text",    required: false, aliases: ["bonus eligible", "bonus", "bonus eligibility"] },
  { key: "ptoPolicy",               label: "PTO Policy",                group: "Benefits",     type: "text",    required: false, aliases: ["pto policy", "pto", "vacation policy"] },
  { key: "sickTimePolicy",          label: "Sick Time Policy",          group: "Benefits",     type: "text",    required: false, aliases: ["sick time policy", "sick time", "sick policy"] },
  { key: "benefitsEligible",        label: "Benefits Eligible",         group: "Benefits",     type: "text",    required: false, aliases: ["benefits eligible", "benefits", "benefits eligibility"] },
  { key: "emergencyContactName",    label: "Emergency Contact Name",    group: "Emergency",    type: "text",    required: false, aliases: ["emergency contact", "emergency name", "emergency contact name"] },
  { key: "emergencyContactPhone",   label: "Emergency Contact Phone",   group: "Emergency",    type: "text",    required: false, aliases: ["emergency phone", "emergency contact phone"] },
];

const MATCH_KEY_OPTIONS = [
  { key: "email",      label: "Email (default — most reliable)", description: "Match existing employees by personal email address" },
  { key: "employeeId", label: "Employee ID",                     description: "Match existing employees by Employee ID badge number" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeText(v: any): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function normalizeEmail(v: any): string {
  return String(v || "").toLowerCase().trim();
}

function excelSerialToDate(serial: number): string | null {
  // Excel stores dates as a count of days since 1899-12-30 (UTC).
  // Return a plain "YYYY-MM-DD" string so we never introduce a tz shift.
  try {
    if (serial < 1 || serial > 2958465) return null;
    const epoch = Date.UTC(1899, 11, 30);
    const adjusted = serial > 60 ? serial - 1 : serial;
    const ms = epoch + adjusted * 86400000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
}

/**
 * Parse a raw import value into a "YYYY-MM-DD" string.
 *
 * Previously this returned a JavaScript Date object (constructed as UTC midnight
 * via `new Date("YYYY-MM-DDT00:00:00.000Z")`).  When that Date was serialized
 * or rendered in a US timezone (UTC-5/6) it appeared as the prior day.  We now
 * return a plain date string, which Drizzle correctly stores as a PostgreSQL
 * `date` value without any timezone conversion.
 */
function parseDate(v: any): string | undefined {
  if (!v) return undefined;
  try {
    if (typeof v === "number") {
      return excelSerialToDate(v) ?? undefined;
    }
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return undefined;
      // Extract UTC date components to keep the date the spreadsheet intended.
      const y = v.getUTCFullYear();
      const m = String(v.getUTCMonth() + 1).padStart(2, "0");
      const d = String(v.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const s = String(v).trim();
    if (!s) return undefined;
    const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      return `${isoMatch[1]}-${String(isoMatch[2]).padStart(2, "0")}-${String(isoMatch[3]).padStart(2, "0")}`;
    }
    const usSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usSlash) {
      return `${usSlash[3]}-${String(usSlash[1]).padStart(2, "0")}-${String(usSlash[2]).padStart(2, "0")}`;
    }
    const usDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (usDash) {
      return `${usDash[3]}-${String(usDash[1]).padStart(2, "0")}-${String(usDash[2]).padStart(2, "0")}`;
    }
    // Last resort: parse and extract UTC date — avoids local-time shift
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function parseDecimal(v: any): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = parseFloat(String(v).replace(/[,$]/g, ""));
  return isNaN(n) ? undefined : n.toFixed(2);
}

function autoMapHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedFields = new Set<string>();
  for (const hdr of headers) {
    const lower = hdr.toLowerCase().trim().replace(/[_\-]+/g, " ");
    for (const field of EMPLOYEE_FIELD_CATALOG) {
      if (usedFields.has(field.key)) continue;
      if (lower === field.key.toLowerCase() || lower === field.label.toLowerCase() || field.aliases.includes(lower)) {
        mapping[hdr] = field.key;
        usedFields.add(field.key);
        break;
      }
    }
  }
  return mapping;
}

function applyMapping(raw: Record<string, any>, mapping: Record<string, string>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [colName, fieldKey] of Object.entries(mapping)) {
    if (!fieldKey || fieldKey === "__skip__") continue;
    if (raw[colName] !== undefined && raw[colName] !== null && raw[colName] !== "") {
      out[fieldKey] = raw[colName];
    }
  }
  return out;
}

function validateAndTransform(mapped: Record<string, any>, initialLoadMode = false): {
  data: Record<string, any>;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: Record<string, any> = {};

  // Full Name → First + Last Name parsing (if source provides fullName instead of split fields)
  if (mapped.fullName && (!mapped.firstName || !mapped.lastName)) {
    const parsed = parseFullName(String(mapped.fullName));
    if (!mapped.firstName) mapped.firstName = parsed.firstName;
    if (!mapped.lastName) mapped.lastName = parsed.lastName;
    data.sourceFullNameRaw = parsed.sourceFullNameRaw;
    if (parsed.nameParseReviewRequired) {
      warnings.push(`Full name parse flagged for review (${parsed.parseEdgeCaseReason || "edge case detected"}): "${mapped.fullName}"`);
    }
  }

  const firstName = normalizeText(mapped.firstName);
  const lastName = normalizeText(mapped.lastName);
  const rawEmail = normalizeText(mapped.email);
  const email = rawEmail ? normalizeEmail(rawEmail) : undefined;

  if (!firstName) {
    if (initialLoadMode) warnings.push("First Name is missing");
    else if (!mapped.fullName) errors.push("First Name is required (or provide Full Name)");
  } else {
    data.firstName = firstName;
  }

  if (!lastName) {
    if (initialLoadMode) warnings.push("Last Name is missing");
    else if (!mapped.fullName) errors.push("Last Name is required (or provide Full Name)");
  } else {
    data.lastName = lastName;
  }

  if (!email) {
    if (initialLoadMode) warnings.push("Email is missing");
    else errors.push("Email is required");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (initialLoadMode) warnings.push(`Invalid email format: ${email}`);
    else errors.push(`Invalid email: ${email}`);
  } else {
    data.email = email;
  }

  if (mapped.workEmail) data.workEmail = normalizeText(mapped.workEmail);
  if (mapped.phoneNumber) data.phoneNumber = normalizeText(mapped.phoneNumber);
  if (mapped.address) data.address = normalizeText(mapped.address);
  if (mapped.city) data.city = normalizeText(mapped.city);
  if (mapped.state) data.state = normalizeText(mapped.state);
  if (mapped.zipCode) data.zipCode = normalizeText(mapped.zipCode);
  if (mapped.employeeId) data.employeeId = normalizeText(mapped.employeeId);
  if (mapped.title) data.title = normalizeText(mapped.title);
  if (mapped.department) data.department = normalizeText(mapped.department);
  if (mapped.position) data.position = normalizeText(mapped.position);
  if (mapped.manager) data.manager = normalizeText(mapped.manager);
  if (mapped.employeeType) data.employeeType = normalizeText(mapped.employeeType);
  if (mapped.employmentType) data.employmentType = normalizeText(mapped.employmentType);
  if (mapped.eligibleForRehire) data.eligibleForRehire = normalizeText(mapped.eligibleForRehire);
  if (mapped.bonusEligible) data.bonusEligible = normalizeText(mapped.bonusEligible);
  if (mapped.ptoPolicy) data.ptoPolicy = normalizeText(mapped.ptoPolicy);
  if (mapped.sickTimePolicy) data.sickTimePolicy = normalizeText(mapped.sickTimePolicy);
  if (mapped.benefitsEligible) data.benefitsEligible = normalizeText(mapped.benefitsEligible);
  if (mapped.emergencyContactName) data.emergencyContactName = normalizeText(mapped.emergencyContactName);
  if (mapped.emergencyContactPhone) data.emergencyContactPhone = normalizeText(mapped.emergencyContactPhone);

  const dobDate = parseDate(mapped.dateOfBirth);
  if (dobDate) data.dateOfBirth = dobDate;

  const hireDateParsed = parseDate(mapped.hireDate);
  if (hireDateParsed) data.hireDate = hireDateParsed;

  const startDateParsed = parseDate(mapped.startDate);
  if (startDateParsed) data.startDate = startDateParsed;

  const termDateParsed = parseDate(mapped.termDate);
  if (termDateParsed) data.termDate = termDateParsed;

  if (mapped.annualSalary) data.annualSalary = parseDecimal(mapped.annualSalary);
  if (mapped.hourlyRate) data.hourlyRate = parseDecimal(mapped.hourlyRate);

  const rawStatus = normalizeText(mapped.status);
  data.status = rawStatus || "active";

  return { data, errors, warnings };
}

// ---------------------------------------------------------------------------
// Background: Validate all staging rows for a batch
// ---------------------------------------------------------------------------
async function runValidateBackground(batchId: string, stagingRows: ImportStagingRow[], matchKey: string | null | undefined, initialLoadMode = false) {
  try {
    const columnMapping = (await db.select({ columnMapping: importBatches.columnMapping })
      .from(importBatches).where(eq(importBatches.id, batchId)).limit(1))[0]?.columnMapping as Record<string, string> || {};

    // Pre-fetch existing employee emails for DB-level dedup
    const allEmails: string[] = [];
    const allEmployeeIds: string[] = [];
    for (const row of stagingRows) {
      const raw = row.rawJson as Record<string, any>;
      const mapped = applyMapping(raw, columnMapping);
      const em = normalizeText(mapped.email);
      if (em) allEmails.push(normalizeEmail(em));
      const eid = normalizeText(mapped.employeeId);
      if (eid) allEmployeeIds.push(eid);
    }

    const existingByEmail = allEmails.length > 0
      ? await db.select({ id: employees.id, email: employees.email, firstName: employees.firstName, lastName: employees.lastName, employeeId: employees.employeeId })
          .from(employees).where(inArray(sql`LOWER(${employees.email})`, allEmails))
      : [];
    const existingByEmpId = allEmployeeIds.length > 0
      ? await db.select({ id: employees.id, employeeId: employees.employeeId, firstName: employees.firstName, lastName: employees.lastName })
          .from(employees).where(inArray(employees.employeeId, allEmployeeIds))
      : [];

    const empByEmail   = new Map(existingByEmail.map(e => [e.email?.toLowerCase().trim() || "", e]));
    const empByEmpId   = new Map(existingByEmpId.map(e => [e.employeeId || "", e]));

    const seenEmails   = new Set<string>();
    const seenEmpIds   = new Set<string>();

    let validCount = 0, warningCount = 0, errorCount = 0, createCount = 0, updateCount = 0, skippedCount = 0;
    const batchUpdates: { id: string; update: Record<string, any> }[] = [];

    for (const row of stagingRows) {
      // Check cancelling flag
      const [currentBatch] = await db.select({ status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
      if (currentBatch?.status === "cancelling") break;

      const raw = row.rawJson as Record<string, any>;
      const mapped = applyMapping(raw, columnMapping);
      const { data, errors, warnings } = validateAndTransform(mapped, initialLoadMode);

      let matchAction: "create" | "update" | "error" | "skip" = "create";
      let matchedId: string | null = null;
      const rowErrors = [...errors];
      const rowWarnings = [...warnings];

      // Intra-file duplicate detection
      const emailKey = data.email ? data.email.toLowerCase().trim() : "";
      const empIdKey = data.employeeId || "";

      if (emailKey) {
        if (seenEmails.has(emailKey)) {
          rowErrors.push(`Duplicate email in file: ${emailKey}`);
        } else {
          seenEmails.add(emailKey);
        }
      }
      if (empIdKey) {
        if (seenEmpIds.has(empIdKey)) {
          rowWarnings.push(`Duplicate Employee ID in file: ${empIdKey}`);
        } else {
          seenEmpIds.add(empIdKey);
        }
      }

      // DB match based on matchKey
      if (rowErrors.length === 0 || initialLoadMode) {
        if (matchKey === "employeeId" && empIdKey) {
          const existing = empByEmpId.get(empIdKey);
          if (existing) {
            matchAction = "update";
            matchedId = existing.id;
          }
        } else if (emailKey) {
          const existing = empByEmail.get(emailKey);
          if (existing) {
            matchAction = "update";
            matchedId = existing.id;
          }
        }
      }

      const hasErrors   = rowErrors.length > 0;
      const hasWarnings = rowWarnings.length > 0;
      let rowStatus: "valid" | "warning" | "error";

      if (hasErrors && !initialLoadMode) {
        rowStatus = "error";
        matchAction = "error";
        errorCount++;
      } else if (hasErrors && initialLoadMode) {
        rowStatus = "warning";
        warningCount++;
        if (matchAction === "create") createCount++;
        else if (matchAction === "update") updateCount++;
      } else if (hasWarnings) {
        rowStatus = "warning";
        warningCount++;
        if (matchAction === "create") createCount++;
        else if (matchAction === "update") updateCount++;
      } else {
        rowStatus = "valid";
        validCount++;
        if (matchAction === "create") createCount++;
        else if (matchAction === "update") updateCount++;
      }

      batchUpdates.push({
        id: row.id,
        update: {
          mappedJson: data,
          validationErrors: rowErrors,
          validationWarnings: rowWarnings,
          status: rowStatus,
          matchAction: matchAction === "error" ? "create" : matchAction,
          matchedDriverId: matchedId,
        },
      });
    }

    // Flush staging row updates in chunks
    const CHUNK = 100;
    for (let i = 0; i < batchUpdates.length; i += CHUNK) {
      const slice = batchUpdates.slice(i, i + CHUNK);
      await Promise.all(slice.map(u =>
        db.update(importStagingRows).set(u.update).where(eq(importStagingRows.id, u.id))
      ));
    }

    const [currentBatch] = await db.select({ status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
    if (currentBatch?.status === "cancelling") {
      await db.update(importBatches).set({ status: "cancelled" }).where(eq(importBatches.id, batchId));
      return;
    }

    await db.update(importBatches).set({
      status: "validated",
      validatedAt: new Date(),
      validRows: validCount,
      warningRows: warningCount,
      errorRows: errorCount,
      createdRows: createCount,
      updatedRows: updateCount,
      skippedRows: skippedCount,
      processedRows: stagingRows.length,
    }).where(eq(importBatches.id, batchId));

  } catch (err: any) {
    console.error("[EmployeeImport] runValidateBackground error:", err);
    await db.update(importBatches).set({ status: "failed", errorMessage: err.message }).where(eq(importBatches.id, batchId)).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Background: Commit all valid/warning staging rows
// ---------------------------------------------------------------------------
async function runCommitBackground(batchId: string, userId: string, userEmail: string) {
  const _userCountBefore = await snapshotUserCount();
  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
    if (!batch) return;

    const allRows = await db.select().from(importStagingRows)
      .where(and(eq(importStagingRows.batchId, batchId), inArray(importStagingRows.status, ["valid", "warning"])))
      .orderBy(importStagingRows.rowIndex);

    let created = 0, updated = 0, skipped = 0, failed = 0;

    for (const row of allRows) {
      const [currentBatch] = await db.select({ status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
      if (currentBatch?.status === "cancelling") break;

      const data = { ...((row.mappedJson || {}) as Record<string, any>) };

      // DRIZZLE DATE BUG fix: Ensure all date fields are Date objects
      for (const field of EMPLOYEE_FIELD_CATALOG) {
        if (field.type === "date" && data[field.key]) {
          data[field.key] = new Date(data[field.key]);
        }
      }

      try {
        if (row.matchAction === "update" && row.matchedDriverId) {
          await db.update(employees).set({ ...data, updatedAt: new Date() }).where(eq(employees.id, row.matchedDriverId));
          await db.update(importStagingRows).set({ status: "imported" }).where(eq(importStagingRows.id, row.id));
          await db.insert(importAuditLog).values({
            batchId,
            rowId: row.id,
            action: "employee_updated",
            driverId: row.matchedDriverId,
            message: `Updated: ${data.firstName} ${data.lastName} <${data.email}>`,
          });
          updated++;
        } else {
          if (!data.firstName || !data.lastName || !data.email) {
            await db.update(importStagingRows).set({ status: "error", validationErrors: ["Missing required fields for create"] }).where(eq(importStagingRows.id, row.id));
            failed++;
            continue;
          }
          const [newEmp] = await db.insert(employees).values(data).returning();
          await db.update(importStagingRows).set({ status: "imported", matchedDriverId: newEmp.id }).where(eq(importStagingRows.id, row.id));
          await db.insert(importAuditLog).values({
            batchId,
            rowId: row.id,
            action: "employee_created",
            driverId: newEmp.id,
            message: `Created: ${newEmp.firstName} ${newEmp.lastName} <${newEmp.email}>`,
          });
          created++;
        }
      } catch (rowErr: any) {
        console.error("[EmployeeImport] Commit row error:", rowErr.message);
        await db.update(importStagingRows).set({ status: "error", validationErrors: [rowErr.message || "Insert failed"] }).where(eq(importStagingRows.id, row.id));
        failed++;
      }
    }

    const [currentBatch] = await db.select({ status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
    if (currentBatch?.status === "cancelling") {
      await db.update(importBatches).set({ status: "cancelled" }).where(eq(importBatches.id, batchId));
      return;
    }

    await assertUserCountUnchanged(batchId, "Employees", _userCountBefore);

    await db.update(importBatches).set({
      status: "committed",
      committedAt: new Date(),
      createdRows: created,
      updatedRows: updated,
      skippedRows: skipped,
      failedRows: failed,
    }).where(eq(importBatches.id, batchId));

    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "employee_import.committed",
        actorUserId: userId,
        actorUserEmail: userEmail,
        targetEntityType: "employees",
        targetEntityId: batchId,
        metadata: { created, updated, skipped, failed },
      });
    } catch (_) {}

  } catch (err: any) {
    console.error("[EmployeeImport] runCommitBackground error:", err);
    await db.update(importBatches).set({ status: "failed", errorMessage: err.message }).where(eq(importBatches.id, batchId)).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Routes (static paths must be declared BEFORE /:batchId to avoid conflicts)
// ---------------------------------------------------------------------------

// GET /fields
router.get("/fields", isAuthenticated, (_req: any, res: Response) => {
  res.json({ fields: EMPLOYEE_FIELD_CATALOG, matchKeys: MATCH_KEY_OPTIONS });
});

// GET /batches/list
router.get("/batches/list", isAuthenticated, async (req: any, res: Response) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
    const list = await db.select().from(importBatches)
      .where(eq(importBatches.moduleType, "employees"))
      .orderBy(desc(importBatches.createdAt))
      .limit(50);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// GET /template/download
router.get("/template/download", isAuthenticated, (_req: any, res: Response) => {
  try {
    const headers = EMPLOYEE_FIELD_CATALOG.map(f => f.label);
    const sampleRow: Record<string, string> = {};
    for (const f of EMPLOYEE_FIELD_CATALOG) {
      if (f.type === "date") sampleRow[f.label] = "2024-01-15";
      else if (f.type === "decimal") sampleRow[f.label] = "0.00";
      else if (f.key === "status") sampleRow[f.label] = "active";
      else if (f.key === "email" || f.key === "workEmail") sampleRow[f.label] = "example@company.com";
      else sampleRow[f.label] = "";
    }
    const ws = XLSX.utils.json_to_sheet([sampleRow], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=\"employee_import_template.xlsx\"");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// POST /upload — handles both multer multipart AND raw octet-stream
router.post("/upload", requireSuperAdmin, upload.single("file"), async (req: any, res: Response) => {
  try {
    let buffer: Buffer;
    let fileName: string;

    if (req.file) {
      buffer = req.file.buffer;
      fileName = req.file.originalname || req.headers["x-file-name"] || "import.csv";
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      buffer = Buffer.concat(chunks);
      fileName = String(req.headers["x-file-name"] || "import.csv");
    }

    if (!buffer || buffer.length === 0) return res.status(400).json({ error: "EMPTY_FILE", message: "Uploaded file is empty" });
    if (buffer.length > 25 * 1024 * 1024) return res.status(400).json({ error: "FILE_TOO_LARGE", message: "File must be under 25MB" });

    const ext = fileName.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext || "")) {
      return res.status(400).json({ error: "INVALID_FILE_TYPE", message: "Only CSV and XLSX files are accepted" });
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
    } catch {
      return res.status(400).json({ error: "PARSE_ERROR", message: "Could not parse file" });
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) return res.status(400).json({ error: "NO_DATA", message: "File contains no data rows" });
    if (rows.length > 5000) return res.status(400).json({ error: "TOO_MANY_ROWS", message: "Maximum 5000 rows per import" });

    const headers = Object.keys(rows[0]);
    const autoMapping = autoMapHeaders(headers);

    const user = (req as any).resolvedUser;
    const [batch] = await db.insert(importBatches).values({
      sourceFileName: fileName,
      status: "uploaded",
      totalRows: rows.length,
      moduleType: "employees",
      fileHeaders: headers,
      columnMapping: autoMapping,
      createdByUserId: user.id,
      createdByUsername: user.displayName,
      startedAt: new Date(),
    }).returning();

    const stagingValues = rows.map((row, idx) => ({
      batchId: batch.id,
      rowIndex: idx + 1,
      rawJson: row,
      status: "pending" as const,
    }));

    const CHUNK = 500;
    for (let i = 0; i < stagingValues.length; i += CHUNK) {
      await db.insert(importStagingRows).values(stagingValues.slice(i, i + CHUNK));
    }

    res.json({
      batchId: batch.id,
      fileName,
      totalRows: rows.length,
      headers,
      autoMapping,
      sampleRows: rows.slice(0, 5),
    });
  } catch (err: any) {
    console.error("[EmployeeImport] Upload error:", err);
    res.status(500).json({ error: "UPLOAD_FAILED", message: err.message });
  }
});

// GET /:batchId — batch status (polled by ImportWizard)
router.get("/:batchId", isAuthenticated, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "employees")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    res.json(batch);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// POST /:batchId/map
router.post("/:batchId/map", requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const { mapping, matchKey, updateMode } = req.body;
    if (!mapping || typeof mapping !== "object") return res.status(400).json({ error: "INVALID_MAPPING" });

    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "employees")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.committedAt) return res.status(400).json({ error: "ALREADY_COMMITTED" });

    await db.update(importBatches).set({
      columnMapping: mapping,
      matchKey: matchKey || null,
      updateMode: updateMode || null,
      status: "mapped",
    }).where(eq(importBatches.id, batch.id));

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// POST /:batchId/validate — starts async background job
router.post("/:batchId/validate", requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const batchId = req.params.batchId;
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.moduleType, "employees")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.status === "validating") return res.status(400).json({ error: "ALREADY_PROCESSING", message: "Validation already in progress" });
    if (!["uploaded", "mapped", "validated", "error", "failed"].includes(batch.status || "")) {
      return res.status(400).json({ error: "INVALID_STATUS", message: "Batch must be mapped before validation" });
    }

    const stagingRows = await db.select().from(importStagingRows).where(eq(importStagingRows.batchId, batchId));
    const initialLoadMode = req.body?.initialLoadMode === true || req.body?.initialLoadMode === "true";

    await db.update(importBatches).set({ status: "validating", processedRows: 0, validatedAt: null, startedAt: new Date(), initialLoadMode }).where(eq(importBatches.id, batchId));
    res.json({ status: "validating", batchId, totalRows: stagingRows.length });

    runValidateBackground(batchId, stagingRows, batch.matchKey, initialLoadMode).catch(err => {
      console.error("[EmployeeImport] runValidateBackground uncaught:", err);
    });
  } catch (err: any) {
    console.error("[EmployeeImport] Validate error:", err);
    res.status(500).json({ error: "VALIDATE_FAILED", message: err.message });
  }
});

// GET /:batchId/rows — paginated staging rows
router.get("/:batchId/rows", isAuthenticated, async (req: any, res: Response) => {
  try {
    const batchId = req.params.batchId;
    const limit  = Math.min(parseInt(String(req.query.limit  || "100"), 10), 500);
    const offset = parseInt(String(req.query.offset || "0"), 10);
    const statusFilter = req.query.status as string | undefined;

    const [batch] = await db.select({ id: importBatches.id }).from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.moduleType, "employees"))).limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });

    let query = db.select().from(importStagingRows).where(eq(importStagingRows.batchId, batchId));
    const rows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batchId))
      .orderBy(importStagingRows.rowIndex)
      .limit(limit)
      .offset(offset);

    const filtered = statusFilter ? rows.filter(r => r.status === statusFilter) : rows;
    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// POST /:batchId/commit — starts async background job
router.post("/:batchId/commit", requireSuperAdmin, async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  try {
    const batchId = req.params.batchId;
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.moduleType, "employees")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.status === "committing") return res.status(400).json({ error: "ALREADY_PROCESSING", message: "Commit already in progress" });
    if (batch.status === "validating") return res.status(409).json({ error: "VALIDATION_IN_PROGRESS", message: "Wait for validation to complete" });
    if (batch.status !== "validated") return res.status(400).json({ error: "INVALID_STATUS", message: "Batch must be validated before commit" });
    if (batch.committedAt) return res.status(400).json({ error: "ALREADY_COMMITTED" });
    if (batch.rolledBackAt) return res.status(400).json({ error: "ROLLED_BACK" });

    const totalRows = await db.select({ count: sql<number>`count(*)` }).from(importStagingRows)
      .where(and(eq(importStagingRows.batchId, batchId), inArray(importStagingRows.status, ["valid", "warning"])));
    const rowCount = Number(totalRows[0]?.count || 0);

    await db.update(importBatches).set({ status: "committing", processedRows: 0, startedAt: new Date() }).where(eq(importBatches.id, batchId));
    res.json({ status: "committing", batchId, totalRows: rowCount });

    runCommitBackground(batchId, user.id, user.email).catch(err => {
      console.error("[EmployeeImport] runCommitBackground uncaught:", err);
    });
  } catch (err: any) {
    console.error("[EmployeeImport] Commit error:", err);
    res.status(500).json({ error: "COMMIT_FAILED", message: err.message });
  }
});

// POST /:batchId/rollback — archive employees created by this batch
router.post("/:batchId/rollback", requireSuperAdmin, async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  try {
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "employees")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND", message: "Batch not found" });
    if (!batch.committedAt) return res.status(400).json({ error: "NOT_COMMITTED", message: "Batch has not been committed" });
    if (batch.rolledBackAt) return res.status(400).json({ error: "ALREADY_ROLLED_BACK", message: "Batch already rolled back" });

    const hoursSince = (Date.now() - new Date(batch.committedAt).getTime()) / 3600000;
    if (hoursSince > 24) return res.status(400).json({ error: "ROLLBACK_WINDOW_EXPIRED", message: "The 24-hour rollback window has expired" });

    const auditEntries = await db.select({ driverId: importAuditLog.driverId })
      .from(importAuditLog)
      .where(and(eq(importAuditLog.batchId, batch.id), eq(importAuditLog.action, "employee_created")));
    const employeeIds = auditEntries.map(e => e.driverId).filter(Boolean) as string[];

    let archived = 0;
    if (employeeIds.length > 0) {
      await db.update(employees).set({ status: "archived" }).where(inArray(employees.id, employeeIds));
      archived = employeeIds.length;
    }

    await db.update(importBatches).set({ status: "rolled_back", rolledBackAt: new Date(), rollbackByUserId: user.id }).where(eq(importBatches.id, batch.id));

    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "employee_import.rolled_back",
        actorUserId: user.id,
        actorUserEmail: user.email,
        targetEntityType: "employees",
        targetEntityId: batch.id,
        metadata: { archived },
      });
    } catch (_) {}

    res.json({ ok: true, archived, message: `${archived} employee(s) archived` });
  } catch (err: any) {
    console.error("[EmployeeImport] Rollback error:", err);
    res.status(500).json({ error: "ROLLBACK_FAILED", message: err.message });
  }
});

// POST /:batchId/cancel
router.post("/:batchId/cancel", requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "employees")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });

    if (["validating", "committing"].includes(batch.status || "")) {
      await db.update(importBatches).set({ status: "cancelling" }).where(eq(importBatches.id, batch.id));
      return res.json({ ok: true, message: "Cancel signal sent — will stop after current row" });
    }

    await db.update(importBatches).set({ status: "cancelled" }).where(eq(importBatches.id, batch.id));
    res.json({ ok: true, message: "Batch cancelled" });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// GET /:batchId/export-errors — CSV download of all error/warning rows
router.get("/:batchId/export-errors", isAuthenticated, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "employees")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });

    const errorRows = await db.select().from(importStagingRows)
      .where(and(eq(importStagingRows.batchId, batch.id), inArray(importStagingRows.status, ["error", "warning"])))
      .orderBy(importStagingRows.rowIndex);

    const csvRows: Record<string, any>[] = errorRows.map(r => {
      const raw = (r.rawJson || {}) as Record<string, any>;
      const errors = (r.validationErrors || []) as string[];
      const warnings = (r.validationWarnings || []) as string[];
      return {
        Row: r.rowIndex,
        Status: r.status,
        Errors: errors.join("; "),
        Warnings: warnings.join("; "),
        ...raw,
      };
    });

    const ws = XLSX.utils.json_to_sheet(csvRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errors");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", `attachment; filename="employee_import_errors_${batch.id.slice(0, 8)}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

export default router;
