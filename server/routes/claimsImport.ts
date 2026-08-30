import { snapshotUserCount, assertUserCountUnchanged } from "../services/importUserGuard";
import { Router, Response } from "express";
import { db } from "../db";
import {
  users,
  drivers,
  accidents,
  customers,
  importBatches,
  importStagingRows,
  importAuditLog,
  claimImportProfiles,
  type ImportStagingRow,
} from "@shared/schema";
import { eq, and, desc, ilike, or, inArray, isNotNull, sql } from "drizzle-orm";
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
        targetEntityType: "claims_import",
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
// Claims Field Catalog
// ---------------------------------------------------------------------------
export const CLAIMS_FIELD_CATALOG = [
  { key: "redcapId",             label: "RC ID / Claim ID",             group: "Core",       type: "text",    required: false, aliases: ["rc id", "rcid", "rc_id", "claim id", "claimid", "claim_id", "id"] },
  { key: "_driverLookup",        label: "Driver Name / Number / Email", group: "Core",       type: "text",    required: false, aliases: ["driver", "driver name", "driver_name", "driver number", "driver_number", "driver email"] },
  { key: "accidentDate",         label: "Incident Date",                group: "Core",       type: "date",    required: false, aliases: ["date", "incident date", "incident_date", "accident date", "accident_date", "loss date"] },
  { key: "location",             label: "Location / Dealer",            group: "Core",       type: "text",    required: false, aliases: ["location", "site", "market", "city"] },
  { key: "incidentType",         label: "Incident Type",                group: "Core",       type: "text",    required: false, aliases: ["incident type", "incident_type", "type", "claim type", "claim_type"] },
  { key: "status",               label: "Legacy Status",                group: "Core",       type: "text",    required: false, aliases: ["status", "claim status"] },
  { key: "claimStatus",          label: "Claim Lifecycle Status",       group: "Core",       type: "text",    required: false, aliases: ["lifecycle status", "lifecycle_status", "canonical status"] },
  { key: "description",          label: "Description / Notes",          group: "Core",       type: "text",    required: false, aliases: ["description", "notes", "comments", "details", "narrative"] },
  { key: "damageEst1",           label: "Damage Estimate 1",            group: "Financials", type: "decimal", required: false, aliases: ["damage est 1", "damage_est_1", "estimate 1", "est 1", "damage estimate"] },
  { key: "damageEst2",           label: "Damage Estimate 2",            group: "Financials", type: "decimal", required: false, aliases: ["damage est 2", "damage_est_2", "estimate 2", "est 2"] },
  { key: "propertyDamage",       label: "Property Damage",              group: "Financials", type: "decimal", required: false, aliases: ["property damage", "property_damage", "prop damage", "pd"] },
  { key: "totalEstimate",        label: "Total Estimate",               group: "Financials", type: "decimal", required: false, aliases: ["total estimate", "total_estimate", "total est", "total"] },
  { key: "probableCost",         label: "Probable Cost",                group: "Financials", type: "decimal", required: false, aliases: ["probable cost", "probable_cost", "probable"] },
  { key: "actualCost",           label: "Actual Cost",                  group: "Financials", type: "decimal", required: false, aliases: ["actual cost", "actual_cost", "actual", "final cost"] },
  { key: "repairCost",           label: "Repair Cost",                  group: "Financials", type: "decimal", required: false, aliases: ["repair cost", "repair_cost", "repair"] },
  { key: "payoutAmount",         label: "Payout Amount",                group: "Financials", type: "decimal", required: false, aliases: ["payout", "payout amount", "payout_amount", "paid amount"] },
  { key: "recoveredAmount",      label: "Recovered Amount",             group: "Financials", type: "decimal", required: false, aliases: ["recovered", "recovered amount", "recovered_amount", "subro amount"] },
  { key: "insuranceReserve",     label: "Insurance Reserve",            group: "Insurance",  type: "decimal", required: false, aliases: ["reserve", "insurance reserve", "insurance_reserve"] },
  { key: "insurancePaid",        label: "Insurance Paid",               group: "Insurance",  type: "decimal", required: false, aliases: ["insurance paid", "insurance_paid", "ins paid"] },
  { key: "insuranceClaimNumber", label: "Insurance Claim Number",       group: "Insurance",  type: "text",    required: false, aliases: ["insurance claim #", "insurance claim number", "ins claim number", "claim number"] },
  { key: "insuranceFault",       label: "Insurance Fault",              group: "Insurance",  type: "text",    required: false, aliases: ["insurance fault", "insurance_fault", "ins fault", "fault"] },
  { key: "dodAtFault",           label: "DOD At Fault",                 group: "Incident",   type: "text",    required: false, aliases: ["dod at fault", "dod_at_fault", "at fault", "fault determination"] },
  { key: "injuries",             label: "Injuries",                     group: "Incident",   type: "text",    required: false, aliases: ["injuries", "injury description", "injury"] },
  { key: "injuryFlag",           label: "Injury Flag",                  group: "Incident",   type: "boolean", required: false, aliases: ["injury flag", "injury_flag", "has injury"] },
  { key: "vehicleInvolved",      label: "Vehicle Involved",             group: "Incident",   type: "text",    required: false, aliases: ["vehicle", "vehicle involved", "vehicle_involved"] },
  { key: "policeReportFiled",    label: "Police Report Filed",          group: "Incident",   type: "boolean", required: false, aliases: ["police report", "police_report_filed", "police report filed"] },
  { key: "policeReportNumber",   label: "Police Report Number",         group: "Incident",   type: "text",    required: false, aliases: ["police report number", "police_report_number", "report number"] },
  { key: "zendeskTicketNumber",  label: "Zendesk Ticket",               group: "Incident",   type: "text",    required: false, aliases: ["zendesk", "zendesk ticket", "zendesk_ticket_number", "ticket number"] },
  { key: "subrogationClaim",     label: "Subrogation Claim",            group: "Insurance",  type: "text",    required: false, aliases: ["subrogation", "subro", "subrogation claim", "subrogation_claim"] },
  { key: "claimType",            label: "Claim Type",                   group: "Core",       type: "text",    required: false, aliases: ["claim type", "claim_type", "type of claim"] },
  { key: "claimSeverity",        label: "Claim Severity",               group: "Core",       type: "text",    required: false, aliases: ["severity", "claim severity", "claim_severity"] },
  { key: "driverClassification", label: "Driver Classification",        group: "Driver",     type: "text",    required: false, aliases: ["driver classification", "driver_classification", "classification"] },
  { key: "resolutionNotes",      label: "Resolution Notes",             group: "Core",       type: "text",    required: false, aliases: ["resolution", "resolution notes", "resolution_notes"] },
];

const MATCH_KEY_OPTIONS = [
  { key: "redcapId", label: "RC ID / Claim ID", description: "Skip rows whose RC ID already exists in the database" },
  { key: "driverLookup", label: "Driver Lookup", description: "Match existing claims by driver information" },
  { key: "none",     label: "No dedup — always create", description: "Always create a new claim regardless of duplicates" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function excelSerialToDate(serial: number): string | null {
  try {
    if (serial < 1 || serial > 2958465) return null;
    const epoch = new Date(Date.UTC(1899, 11, 31)); // Dec 31, 1899 — serial 1 = Jan 1, 1900
    const adjusted = serial > 60 ? serial - 1 : serial;
    const ms = epoch.getTime() + adjusted * 86400000;
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

function parseDate(val: any): string | null {
  if (val === null || val === undefined || val === "") return null;
  try {
    if (typeof val === "number") {
      return excelSerialToDate(val);
    }
    const str = String(val).trim();
    if (!str) return null;
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      return `${isoMatch[1]}-${String(isoMatch[2]).padStart(2, "0")}-${String(isoMatch[3]).padStart(2, "0")}`;
    }
    const usSlash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usSlash) {
      return `${usSlash[3]}-${String(usSlash[1]).padStart(2, "0")}-${String(usSlash[2]).padStart(2, "0")}`;
    }
    const usDash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (usDash) {
      return `${usDash[3]}-${String(usDash[1]).padStart(2, "0")}-${String(usDash[2]).padStart(2, "0")}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
    return null;
  } catch {
    return null;
  }
}

function parseDecimal(val: any): string | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseFloat(String(val).trim().replace(/[$,]/g, ""));
  return isNaN(n) ? null : n.toFixed(2);
}

function parseBoolean(val: any): boolean {
  if (typeof val === "boolean") return val;
  return ["yes", "true", "1", "y", "x"].includes(String(val).toLowerCase().trim());
}

// autoMapHeaders: returns { "Column Header": "fieldKey" }
function autoMapHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedFields = new Set<string>();
  for (const header of headers) {
    const lh = header.toLowerCase().trim().replace(/[_\-]+/g, " ");
    for (const field of CLAIMS_FIELD_CATALOG) {
      if (usedFields.has(field.key)) continue;
      if (field.aliases.some(a => a.toLowerCase() === lh) || lh === field.key.toLowerCase() || lh === field.label.toLowerCase()) {
        mapping[header] = field.key;
        usedFields.add(field.key);
        break;
      }
    }
  }
  return mapping;
}

// applyMapping: mapping is { "columnHeader": "fieldKey" }
function applyMapping(rawRow: Record<string, any>, mapping: Record<string, string>): Record<string, any> {
  const mapped: Record<string, any> = {};
  for (const [col, fieldKey] of Object.entries(mapping)) {
    if (!fieldKey || fieldKey === "__skip__" || fieldKey === "_ignore") continue;
    const rawVal = rawRow[col];
    if (rawVal === undefined || rawVal === null || rawVal === "") continue;
    const fieldDef = CLAIMS_FIELD_CATALOG.find(f => f.key === fieldKey);
    if (!fieldDef) { mapped[fieldKey] = rawVal; continue; }
    if (fieldDef.type === "date") mapped[fieldKey] = parseDate(rawVal);
    else if (fieldDef.type === "decimal") mapped[fieldKey] = parseDecimal(rawVal);
    else if (fieldDef.type === "boolean") mapped[fieldKey] = parseBoolean(rawVal);
    else mapped[fieldKey] = String(rawVal).trim();
  }
  return mapped;
}

async function lookupDriver(value: string): Promise<string | null> {
  if (!value || !value.trim()) return null;
  const v = value.trim();

  const [byNumber] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.driverNumber, v)).limit(1);
  if (byNumber) return byNumber.id;

  const parts = v.split(/\s+/);
  if (parts.length >= 2) {
    const [first, ...rest] = parts;
    const [byName] = await db.select({ id: drivers.id }).from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(and(ilike(users.firstName, first), ilike(users.lastName, rest.join(" "))))
      .limit(1);
    if (byName) return byName.id;
  }

  const [byEmail] = await db.select({ id: drivers.id }).from(drivers)
    .innerJoin(users, eq(drivers.userId, users.id))
    .where(ilike(users.email, `%${v}%`)).limit(1);
  if (byEmail) return byEmail.id;

  const [byFull] = await db.select({ id: drivers.id }).from(drivers)
    .innerJoin(users, eq(drivers.userId, users.id))
    .where(or(ilike(users.firstName, `%${v}%`), ilike(users.lastName, `%${v}%`)))
    .limit(1);
  return byFull?.id || null;
}

async function lookupAccount(value: string): Promise<string | null> {
  if (!value || !value.trim()) return null;
  const v = value.trim();
  const [byNumber] = await db.select({ id: customers.id }).from(customers).where(eq(customers.customerNumber, v)).limit(1);
  if (byNumber) return byNumber.id;
  const [byName] = await db.select({ id: customers.id }).from(customers).where(ilike(customers.customerName, `%${v}%`)).limit(1);
  return byName?.id || null;
}

async function mapRowToAccident(
  mapped: Record<string, any>,
  initialLoadMode = false
): Promise<{ data: Record<string, any>; errors: string[]; warnings: string[]; warningFields: string[]; rawIdentifier: string }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const warningFields: string[] = [];
  const data: Record<string, any> = {};

  const rawIdentifier = mapped._driverLookup || mapped.redcapId || mapped._accountLookup || "(no identifier)";

  if (mapped._driverLookup) {
    const driverId = await lookupDriver(mapped._driverLookup);
    if (driverId) {
      data.driverId = driverId;
    } else {
      const msg = `Driver not found: "${mapped._driverLookup}"`;
      if (initialLoadMode) { warnings.push(msg + " — imported without driver link (needs follow-up)"); warningFields.push("driverId"); }
      else errors.push(msg);
    }
  } else {
    const msg = "No driver identifier provided";
    if (initialLoadMode) { warnings.push(msg + " — imported without driver link (needs follow-up)"); warningFields.push("driverId"); }
    else errors.push(msg + " — row cannot be imported");
  }

  if (mapped._accountLookup) {
    const customerId = await lookupAccount(mapped._accountLookup);
    if (customerId) data.customerId = customerId;
    else { warnings.push(`Account not found: "${mapped._accountLookup}" — will import without account link`); warningFields.push("customerId"); }
  }

  const dateStr = mapped.accidentDate;
  if (dateStr) {
    const d = new Date(dateStr + "T12:00:00Z");
    if (!isNaN(d.getTime())) {
      data.accidentDate = d;
      data.incidentDate = d;
      data.monthOfIncident = String(d.getUTCMonth() + 1).padStart(2, "0");
      data.yearOfIncident = String(d.getUTCFullYear());
    } else {
      warnings.push(`Invalid date "${mapped.accidentDate}" — will use today`);
      warningFields.push("accidentDate");
    }
  } else {
    warnings.push("No incident date provided — will use today as default");
    warningFields.push("accidentDate");
  }
  if (!data.accidentDate) {
    const today = new Date();
    data.accidentDate = today;
    data.incidentDate = today;
  }

  data.location = mapped.location || "Unknown";
  if (!mapped.location) { warnings.push("No location provided — defaulting to 'Unknown'"); warningFields.push("location"); }

  const textFields = ["redcapId", "incidentType", "status", "claimStatus", "description", "injuries",
    "dodAtFault", "atFault", "driverClassification", "policeReportNumber", "zendeskTicketNumber",
    "vehicleInvolved", "claimSeverity", "claimType", "subrogationClaim", "resolutionNotes",
    "insuranceClaimNumber", "insuranceFault", "insuranceComments"];
  for (const f of textFields) {
    if (mapped[f] !== undefined && mapped[f] !== null && mapped[f] !== "") data[f] = mapped[f];
  }

  const decFields = ["damageEst1", "damageEst2", "propertyDamage", "totalEstimate", "probableCost",
    "actualCost", "repairCost", "payoutAmount", "recoveredAmount", "insuranceReserve", "insurancePaid"];
  for (const f of decFields) {
    if (mapped[f] !== undefined && mapped[f] !== null && mapped[f] !== "") data[f] = mapped[f];
  }

  if (mapped.injuryFlag !== undefined) data.injuryFlag = mapped.injuryFlag;
  if (mapped.policeReportFiled !== undefined) data.policeReportFiled = mapped.policeReportFiled;

  if (mapped.insuranceDate) {
    const d = new Date(mapped.insuranceDate + "T12:00:00Z");
    if (!isNaN(d.getTime())) data.insuranceDate = d;
  }

  if (data.injuryFlag === true) data.carrierNotificationRequired = true;

  return { data, errors, warnings, warningFields, rawIdentifier };
}

// ---------------------------------------------------------------------------
// Background: Validate all staging rows
// ---------------------------------------------------------------------------
async function runValidateBackground(batchId: string, initialLoadMode: boolean, matchKey: string | null | undefined) {
  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
    if (!batch) return;

    const columnMapping = (batch.columnMapping || {}) as Record<string, string>;
    const stagingRows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batchId))
      .orderBy(importStagingRows.rowIndex);

    let validCount = 0, warningCount = 0, errorCount = 0, createCount = 0, skipCount = 0;
    const seenRedcapIds = new Set<string>();
    const batchUpdates: { id: string; update: Record<string, any> }[] = [];

    for (const row of stagingRows) {
      const [currentBatch] = await db.select({ status: importBatches.status }).from(importBatches)
        .where(eq(importBatches.id, batchId)).limit(1);
      if (currentBatch?.status === "cancelling") break;

      const rawRow = row.rawJson as Record<string, any>;
      const mapped = applyMapping(rawRow, columnMapping);
      const { data, errors, warnings, warningFields, rawIdentifier } = await mapRowToAccident(mapped, initialLoadMode);

      const rowErrors = [...errors];
      const rowWarnings = [...warnings];

      // Intra-file duplicate detection on redcapId
      const rcId = mapped.redcapId ? String(mapped.redcapId).trim() : "";
      if (rcId) {
        if (seenRedcapIds.has(rcId)) {
          rowErrors.push(`Duplicate RC ID in file: ${rcId}`);
        } else {
          seenRedcapIds.add(rcId);
        }
      }

      // DB-level dedup: if matchKey=redcapId and rcId exists in DB, mark as skip
      let matchAction: "create" | "skip" | "error" = "create";
      let existingClaimId: string | null = null;
      if (matchKey === "redcapId" && rcId) {
        const [existing] = await db.select({ id: accidents.id }).from(accidents).where(eq(accidents.redcapId, rcId)).limit(1);
        if (existing) {
          matchAction = "skip";
          existingClaimId = existing.id;
        }
      } else if (matchKey === "driverLookup" && data.driverId && data.accidentDate) {
        // Simple heuristic: same driver + same day = probable duplicate
        const [existing] = await db.select({ id: accidents.id }).from(accidents)
          .where(and(
            eq(accidents.driverId, data.driverId),
            eq(accidents.accidentDate, data.accidentDate)
          )).limit(1);
        if (existing) {
          matchAction = "skip";
          existingClaimId = existing.id;
        }
      }

      const hasErrors = rowErrors.length > 0;
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
      } else if (hasWarnings) {
        rowStatus = "warning";
        warningCount++;
        if (matchAction === "create") createCount++;
        else if (matchAction === "skip") skipCount++;
      } else if (matchAction === "skip") {
        rowStatus = "valid";
        skipCount++;
      } else {
        rowStatus = "valid";
        validCount++;
        createCount++;
      }

      batchUpdates.push({
        id: row.id,
        update: {
          mappedJson: data,
          validationErrors: rowErrors,
          validationWarnings: rowWarnings,
          status: rowStatus,
          matchAction: matchAction === "error" ? "create" : matchAction,
          matchedDriverId: existingClaimId,
        },
      });
    }

    // Flush in chunks
    const CHUNK = 50;
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
      validRows: validCount,
      warningRows: warningCount,
      errorRows: errorCount,
      createdRows: createCount,
      skippedRows: skipCount,
      processedRows: batchUpdates.length,
    }).where(eq(importBatches.id, batchId));

  } catch (err: any) {
    console.error("[ClaimsImport] runValidateBackground error:", err);
    await db.update(importBatches).set({ status: "failed", errorMessage: err.message }).where(eq(importBatches.id, batchId)).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Background: Commit valid/warning rows
// ---------------------------------------------------------------------------
async function runCommitBackground(batchId: string, userId: string, userEmail: string) {
  const _userCountBefore = await snapshotUserCount();
  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
    if (!batch) return;

    const initialLoadMode = batch.initialLoadMode || false;

    const validRows = await db.select().from(importStagingRows)
      .where(and(eq(importStagingRows.batchId, batchId), inArray(importStagingRows.status, ["valid", "warning"])))
      .orderBy(importStagingRows.rowIndex);

    let created = 0, skipped = 0, failed = 0, needsUpdateCount = 0;

    for (const row of validRows) {
      const [currentBatch] = await db.select({ status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
      if (currentBatch?.status === "cancelling") break;

      if (row.matchAction === "skip") {
        await db.update(importStagingRows).set({ status: "skipped" }).where(eq(importStagingRows.id, row.id));
        skipped++;
        continue;
      }

      const data = (row.mappedJson || {}) as Record<string, any>;
      const hasWarnings = ((row.validationWarnings || []) as string[]).length > 0;
      const isNeedsUpdate = initialLoadMode && hasWarnings;

      if (!data.driverId && !initialLoadMode) {
        await db.update(importStagingRows).set({ status: "error", validationErrors: ["No driver resolved"] }).where(eq(importStagingRows.id, row.id));
        failed++;
        continue;
      }

      // Fallback driverId in ILM
      if (!data.driverId && initialLoadMode) {
        const [sysDriver] = await db.select({ id: drivers.id }).from(drivers)
          .innerJoin(users, eq(drivers.userId, users.id))
          .where(eq(users.id, userId)).limit(1);
        if (sysDriver) data.driverId = sysDriver.id;
        if (!data.driverId) {
          const [anyDriver] = await db.select({ id: drivers.id }).from(drivers).limit(1);
          if (anyDriver) data.driverId = anyDriver.id;
        }
        if (!data.driverId) {
          await db.update(importStagingRows).set({ status: "error", validationErrors: ["No driver available as fallback"] }).where(eq(importStagingRows.id, row.id));
          failed++;
          continue;
        }
      }

      try {
        const insertData: Record<string, any> = { ...data };
        if (isNeedsUpdate) {
          insertData.needsUpdate = true;
          insertData.needsUpdateFields = (row.validationWarnings as string[] || []);
          insertData.needsUpdateReasons = (row.validationWarnings as string[] || []);
        }

        // reportedBy is NOT NULL — always set to the importing user
        if (!insertData.reportedBy) {
          insertData.reportedBy = userId;
        }

        // location is NOT NULL — default to empty string if missing
        if (!insertData.location) {
          insertData.location = "";
        }

        // Drizzle PgTimestamp.mapToDriverValue calls .toISOString() — must pass Date objects,
        // not strings (which is what JSON deserialization produces).
        const DATE_FIELDS = ["accidentDate", "incidentDate", "insuranceDate"];
        for (const f of DATE_FIELDS) {
          if (insertData[f] !== undefined && insertData[f] !== null) {
            if (typeof insertData[f] === "string") {
              const d = new Date(insertData[f]);
              insertData[f] = isNaN(d.getTime()) ? new Date() : d;
            } else if (!(insertData[f] instanceof Date)) {
              insertData[f] = new Date();
            }
          }
        }
        // accidentDate is NOT NULL — ensure it always has a value
        if (!insertData.accidentDate || !(insertData.accidentDate instanceof Date)) {
          insertData.accidentDate = new Date();
        }
        if (!insertData.incidentDate || !(insertData.incidentDate instanceof Date)) {
          insertData.incidentDate = insertData.accidentDate;
        }
        // displayClaimId: use redcapId (Move ID) when available — this is the user-facing Claim ID
        if (!insertData.displayClaimId) {
          insertData.displayClaimId = insertData.redcapId ? String(insertData.redcapId).trim() : null;
        }

        const [newClaim] = await db.insert(accidents).values(insertData).returning();
        // Fallback: if no redcapId, stamp UUID prefix after we have the generated ID
        if (!newClaim.displayClaimId) {
          await db.update(accidents).set({ displayClaimId: newClaim.id.substring(0, 8).toUpperCase() }).where(eq(accidents.id, newClaim.id));
        }
        await db.update(importStagingRows).set({ status: "committed", createdClaimId: newClaim.id }).where(eq(importStagingRows.id, row.id));
        await db.insert(importAuditLog).values({
          batchId,
          rowId: row.id,
          action: "created",
          message: `Claim ${newClaim.id} created${isNeedsUpdate ? " [needs-update]" : ""}`,
        });
        created++;
        if (isNeedsUpdate) needsUpdateCount++;
      } catch (insertErr: any) {
        console.error(`[ClaimsImport] Row ${row.rowIndex} insert error:`, insertErr.message);
        await db.update(importStagingRows).set({ status: "error", validationErrors: [insertErr.message] }).where(eq(importStagingRows.id, row.id));
        failed++;
      }
    }

    const [currentBatch] = await db.select({ status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
    if (currentBatch?.status === "cancelling") {
      await db.update(importBatches).set({ status: "cancelled" }).where(eq(importBatches.id, batchId));
      return;
    }

    await assertUserCountUnchanged(batchId, "Claims", _userCountBefore);

    await db.update(importBatches).set({
      status: "committed",
      committedAt: new Date(),
      createdRows: created,
      skippedRows: skipped,
      failedRows: failed,
      processedRows: created + skipped + failed,
    }).where(eq(importBatches.id, batchId));

    await db.insert(importAuditLog).values({
      batchId,
      rowId: null,
      action: "committed",
      message: `Batch committed: ${created} created, ${skipped} skipped, ${failed} failed, ${needsUpdateCount} needs-update`,
    });

    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "claims_import.committed",
        actorUserId: userId,
        actorUserEmail: userEmail,
        targetEntityType: "accidents",
        targetEntityId: batchId,
        metadata: { created, skipped, failed, needsUpdateCount },
      });
    } catch (_) {}

  } catch (err: any) {
    console.error("[ClaimsImport] runCommitBackground error:", err);
    await db.update(importBatches).set({ status: "failed", errorMessage: err.message }).where(eq(importBatches.id, batchId)).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Routes — static paths BEFORE /:batchId
// ---------------------------------------------------------------------------

// GET /fields
router.get("/fields", isAuthenticated, (_req: any, res: Response) => {
  res.json({ fields: CLAIMS_FIELD_CATALOG, matchKeys: MATCH_KEY_OPTIONS });
});

// GET /batches/list
router.get("/batches/list", isAuthenticated, async (_req: any, res: Response) => {
  try {
    const list = await db.select().from(importBatches)
      .where(eq(importBatches.moduleType, "claims"))
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
    const headers = CLAIMS_FIELD_CATALOG.map(f => f.label);
    const sampleRow: Record<string, string> = {};
    for (const f of CLAIMS_FIELD_CATALOG) {
      if (f.type === "date") sampleRow[f.label] = "2024-01-15";
      else if (f.type === "decimal") sampleRow[f.label] = "0.00";
      else if (f.type === "boolean") sampleRow[f.label] = "No";
      else if (f.key === "location") sampleRow[f.label] = "Downtown Dealer";
      else if (f.key === "_driverLookup") sampleRow[f.label] = "John Smith";
      else if (f.key === "incidentType") sampleRow[f.label] = "collision";
      else if (f.key === "status") sampleRow[f.label] = "open";
      else sampleRow[f.label] = "";
    }
    const ws = XLSX.utils.json_to_sheet([sampleRow], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Claims");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=\"claims_import_template.xlsx\"");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// GET /profiles
router.get("/profiles", isAuthenticated, requireSuperAdmin, async (_req: any, res: Response) => {
  try {
    const profiles = await db.select().from(claimImportProfiles).orderBy(desc(claimImportProfiles.createdAt));
    res.json(profiles);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// POST /upload — dual: multer multipart OR raw octet-stream
router.post("/upload", requireSuperAdmin, upload.single("file"), async (req: any, res: Response) => {
  try {
    let buffer: Buffer;
    let fileName: string;

    if (req.file) {
      buffer = req.file.buffer;
      fileName = req.file.originalname || String(req.headers["x-file-name"] || "import.csv");
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
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
      moduleType: "claims",
      fileHeaders: headers,
      columnMapping: autoMapping,
      updateMode: "skip",
      matchKey: "redcapId",
      createdByUserId: user.id,
      createdByUsername: user.displayName,
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
    console.error("[ClaimsImport] Upload error:", err);
    res.status(500).json({ error: "UPLOAD_FAILED", message: err.message });
  }
});

// GET /:batchId — batch status (polled by ImportWizard)
router.get("/:batchId", isAuthenticated, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "claims")))
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
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "claims")))
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
      .where(and(eq(importBatches.id, batchId), eq(importBatches.moduleType, "claims")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.status === "validating") return res.status(400).json({ error: "ALREADY_PROCESSING" });
    if (!["uploaded", "mapped", "validated", "error", "failed"].includes(batch.status || "")) {
      return res.status(400).json({ error: "INVALID_STATUS", message: "Batch must be mapped before validation" });
    }

    const totalRowsResult = await db.select({ count: sql<number>`count(*)` }).from(importStagingRows).where(eq(importStagingRows.batchId, batchId));
    const rowCount = Number(totalRowsResult[0]?.count || 0);
    const initialLoadMode = req.body?.initialLoadMode === true || req.body?.initialLoadMode === "true";

    await db.update(importBatches).set({ status: "validating", processedRows: 0, startedAt: new Date(), initialLoadMode }).where(eq(importBatches.id, batchId));
    res.json({ status: "validating", batchId, totalRows: rowCount });

    runValidateBackground(batchId, initialLoadMode, batch.matchKey).catch(err => {
      console.error("[ClaimsImport] runValidateBackground uncaught:", err);
    });
  } catch (err: any) {
    console.error("[ClaimsImport] Validate error:", err);
    res.status(500).json({ error: "VALIDATE_FAILED", message: err.message });
  }
});

// GET /:batchId/rows — paginated staging rows
router.get("/:batchId/rows", isAuthenticated, async (req: any, res: Response) => {
  try {
    const batchId = req.params.batchId;
    const limit  = Math.min(parseInt(String(req.query.limit  || "100"), 10), 500);
    const offset = parseInt(String(req.query.offset || "0"), 10);

    const [batch] = await db.select({ id: importBatches.id }).from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.moduleType, "claims"))).limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });

    const rows = await db.select().from(importStagingRows)
      .where(eq(importStagingRows.batchId, batchId))
      .orderBy(importStagingRows.rowIndex)
      .limit(limit)
      .offset(offset);
    res.json(rows);
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
      .where(and(eq(importBatches.id, batchId), eq(importBatches.moduleType, "claims")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.status === "committing") return res.status(400).json({ error: "ALREADY_PROCESSING" });
    if (batch.status === "validating") return res.status(409).json({ error: "VALIDATION_IN_PROGRESS" });
    if (batch.status !== "validated") return res.status(400).json({ error: "INVALID_STATUS", message: "Batch must be validated before commit" });
    if (batch.committedAt) return res.status(400).json({ error: "ALREADY_COMMITTED" });
    if (batch.rolledBackAt) return res.status(400).json({ error: "ROLLED_BACK" });

    const totalRowsResult = await db.select({ count: sql<number>`count(*)` }).from(importStagingRows)
      .where(and(eq(importStagingRows.batchId, batchId), inArray(importStagingRows.status, ["valid", "warning"])));
    const rowCount = Number(totalRowsResult[0]?.count || 0);

    await db.update(importBatches).set({ status: "committing", processedRows: 0, startedAt: new Date() }).where(eq(importBatches.id, batchId));
    res.json({ status: "committing", batchId, totalRows: rowCount });

    runCommitBackground(batchId, user.id, user.email).catch(err => {
      console.error("[ClaimsImport] runCommitBackground uncaught:", err);
    });
  } catch (err: any) {
    console.error("[ClaimsImport] Commit error:", err);
    res.status(500).json({ error: "COMMIT_FAILED", message: err.message });
  }
});

// POST /:batchId/rollback
router.post("/:batchId/rollback", requireSuperAdmin, async (req: any, res: Response) => {
  const user = (req as any).resolvedUser;
  try {
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "claims")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND", message: "Batch not found" });
    if (!batch.committedAt) return res.status(400).json({ error: "NOT_COMMITTED", message: "Batch has not been committed yet" });
    if (batch.rolledBackAt) return res.status(400).json({ error: "ALREADY_ROLLED_BACK", message: "Batch already rolled back" });

    const deadline = new Date(new Date(batch.committedAt).getTime() + 24 * 3600 * 1000);
    if (new Date() > deadline) return res.status(400).json({ error: "ROLLBACK_WINDOW_EXPIRED", message: "24-hour rollback window has expired" });

    const committed = await db.select({ id: importStagingRows.id, createdClaimId: importStagingRows.createdClaimId })
      .from(importStagingRows)
      .where(and(eq(importStagingRows.batchId, batch.id), eq(importStagingRows.status, "committed"), isNotNull(importStagingRows.createdClaimId)));

    let deletedCount = 0;
    for (const row of committed) {
      if (row.createdClaimId) {
        try {
          await db.delete(accidents).where(eq(accidents.id, row.createdClaimId));
          await db.update(importStagingRows).set({ status: "rolledback" as any }).where(eq(importStagingRows.id, row.id));
          deletedCount++;
        } catch (e) {
          console.error(`[ClaimsImport] Rollback: could not delete claim ${row.createdClaimId}`, e);
        }
      }
    }

    await db.update(importBatches).set({ rolledBackAt: new Date(), rollbackByUserId: user.id, status: "rolled_back" }).where(eq(importBatches.id, batch.id));
    await db.insert(importAuditLog).values({ batchId: batch.id, rowId: null, action: "rolled_back", message: `Rolled back by ${user.displayName}: ${deletedCount} claims deleted` });

    res.json({ ok: true, deletedCount, message: `${deletedCount} claim(s) deleted` });
  } catch (err: any) {
    console.error("[ClaimsImport] Rollback error:", err);
    res.status(500).json({ error: "ROLLBACK_FAILED", message: err.message });
  }
});

// POST /:batchId/cancel
router.post("/:batchId/cancel", requireSuperAdmin, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "claims")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });

    if (["validating", "committing"].includes(batch.status || "")) {
      await db.update(importBatches).set({ status: "cancelling" }).where(eq(importBatches.id, batch.id));
      return res.json({ ok: true, message: "Cancel signal sent" });
    }

    await db.update(importBatches).set({ status: "cancelled" }).where(eq(importBatches.id, batch.id));
    res.json({ ok: true, message: "Batch cancelled" });
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

// GET /:batchId/export-errors — XLSX download of error/warning rows
router.get("/:batchId/export-errors", isAuthenticated, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "claims")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });

    const errorRows = await db.select().from(importStagingRows)
      .where(and(eq(importStagingRows.batchId, batch.id), inArray(importStagingRows.status, ["error", "warning"])))
      .orderBy(importStagingRows.rowIndex);

    const csvRows = errorRows.map(r => {
      const raw = (r.rawJson || {}) as Record<string, any>;
      const errors = (r.validationErrors || []) as string[];
      const warnings = (r.validationWarnings || []) as string[];
      return { Row: r.rowIndex, Status: r.status, Errors: errors.join("; "), Warnings: warnings.join("; "), ...raw };
    });

    const ws = XLSX.utils.json_to_sheet(csvRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errors");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", `attachment; filename="claims_import_errors_${batch.id.slice(0, 8)}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
  }
});

export default router;
