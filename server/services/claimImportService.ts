import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import { eq, and, or, ilike } from "drizzle-orm";
import { db } from "../db";
import {
  accidents,
  drivers,
  customers,
  users,
  importBatches,
  importStagingRows,
  claimImportProfiles,
  type ClaimImportProfile,
  type ImportBatch,
  type ImportStagingRow,
} from "@shared/schema";

// ============================================================
// CLAIM FIELD DEFINITIONS (target fields available for mapping)
// ============================================================
export interface ClaimFieldDef {
  key: string;
  label: string;
  type: "text" | "date" | "decimal" | "enum" | "boolean" | "lookup_driver" | "lookup_account";
  enumValues?: string[];
  required?: boolean;
  description?: string;
}

export const CLAIM_FIELDS: ClaimFieldDef[] = [
  { key: "account_name", label: "Account (Dealer)", type: "lookup_account", description: "Matched to customer accounts" },
  { key: "driver_name", label: "Driver", type: "lookup_driver", required: true, description: "Matched to driver records" },
  { key: "date_of_incident", label: "Date of Incident", type: "date", required: true },
  { key: "claim_status", label: "Claim Status", type: "enum", enumValues: ["DRAFT","SUBMITTED","UNDER_REVIEW","ADDITIONAL_INFO_REQUESTED","SENT_TO_CARRIER","APPROVED","DENIED","PAID","CLOSED"] },
  { key: "incident_type", label: "Incident Type", type: "enum", enumValues: ["collision","property_damage","injury","theft","vandalism","other"] },
  { key: "at_fault", label: "At Fault (DNS)", type: "enum", enumValues: ["yes","no","pending","partial"] },
  { key: "probable_cost", label: "Probable Cost", type: "decimal" },
  { key: "actual_cost", label: "Actual Cost", type: "decimal" },
  { key: "notes", label: "Notes / Received", type: "text" },
  { key: "vehicle_involved", label: "Vehicle Involved", type: "text" },
  { key: "trip_id", label: "Trip ID", type: "text" },
  { key: "rc_id", label: "RC ID (RedCap)", type: "text" },
  { key: "zendesk_ticket_number", label: "ZD Ticket #", type: "text" },
  { key: "insurance_claim_number", label: "Ins Claim #", type: "text" },
  { key: "insurance_reserve", label: "Ins Reserve", type: "decimal" },
  { key: "insurance_paid", label: "Ins Paid", type: "decimal" },
  { key: "insurance_total", label: "Ins Total", type: "decimal" },
  { key: "insurance_date", label: "Ins Date", type: "date" },
  { key: "insurance_fault", label: "Ins Fault", type: "text" },
  { key: "insurance_comments", label: "Ins Comments", type: "text" },
  { key: "location", label: "Location", type: "text" },
];

// Default column-to-field auto-mapping suggestions (column name → field key, case-insensitive)
const DEFAULT_MAPPING_HINTS: Record<string, string> = {
  "dealer": "account_name",
  "trip id": "trip_id",
  "trip_id": "trip_id",
  "rc id": "rc_id",
  "rc_id": "rc_id",
  "date": "date_of_incident",
  "status": "claim_status",
  "driver": "driver_name",
  "dns at fault": "at_fault",
  "at fault": "at_fault",
  "probable": "probable_cost",
  "actual": "actual_cost",
  "notes/received": "notes",
  "notes": "notes",
  "received": "notes",
  "vehicle_involved": "vehicle_involved",
  "vehicle involved": "vehicle_involved",
  "incident type": "incident_type",
  "incident_type": "incident_type",
  "zd ticket #": "zendesk_ticket_number",
  "zd ticket": "zendesk_ticket_number",
  "zendesk": "zendesk_ticket_number",
  "ins claim #": "insurance_claim_number",
  "ins reserve": "insurance_reserve",
  "ins paid": "insurance_paid",
  "ins total": "insurance_total",
  "ins date": "insurance_date",
  "ins fault": "insurance_fault",
  "ins comments": "insurance_comments",
  "location": "location",
};

// ============================================================
// EXCEL PARSING
// ============================================================
export interface ParsedSheet {
  name: string;
  headers: string[];
  sampleRows: Record<string, any>[];
  totalRows: number;
}

export interface ParseResult {
  sheets: ParsedSheet[];
  suggestedMapping: Record<string, string | null>;
}

export function parseExcelBuffer(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets: ParsedSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws || !ws["!ref"]) continue;

    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
      raw: false,
      dateNF: "YYYY-MM-DD",
      defval: null,
    });

    if (rows.length === 0) continue;

    const headers = Object.keys(rows[0] || {});
    const sampleRows = rows.slice(0, 5);

    sheets.push({
      name: sheetName,
      headers,
      sampleRows,
      totalRows: rows.length,
    });
  }

  // Auto-suggest mapping based on first sheet's headers
  const suggestedMapping: Record<string, string | null> = {};
  if (sheets.length > 0) {
    for (const h of sheets[0].headers) {
      const normalized = h.trim().toLowerCase();
      suggestedMapping[h] = DEFAULT_MAPPING_HINTS[normalized] || null;
    }
  }

  return { sheets, suggestedMapping };
}

export function getSheetRows(buffer: Buffer, sheetName: string): Record<string, any>[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
    raw: false,
    dateNF: "YYYY-MM-DD",
    defval: null,
  });
}

// ============================================================
// TRANSFORMATIONS
// ============================================================
function normalizeEnum(value: string | null | undefined, validValues: string[]): string | null {
  if (!value) return null;
  const v = value.toString().trim().toLowerCase().replace(/[\s_-]+/g, "_");
  // Direct match
  const direct = validValues.find(e => e.toLowerCase() === v || e.toLowerCase().replace(/[\s_-]+/g, "_") === v);
  if (direct) return direct;
  // Fuzzy: starts with
  const fuzzy = validValues.find(e => e.toLowerCase().startsWith(v.slice(0, 3)));
  return fuzzy || null;
}

function parseDecimal(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = value.toString().replace(/[$,\s]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.toString().trim();
  if (!s) return null;

  // Try ISO format (YYYY-MM-DD) — already from xlsx with dateNF
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10); // strip time component
  }

  // Try MM/DD/YYYY or M/D/YYYY
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdyMatch) {
    const m = mdyMatch[1].padStart(2, "0");
    const d = mdyMatch[2].padStart(2, "0");
    let y = mdyMatch[3];
    if (y.length === 2) y = parseInt(y) > 50 ? `19${y}` : `20${y}`;
    return `${y}-${m}-${d}`;
  }

  // Try Excel serial number
  const serial = parseInt(s);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    try {
      const epoch = new Date(Date.UTC(1899, 11, 31)); // Dec 31, 1899 — serial 1 = Jan 1, 1900
      const adjusted = serial > 60 ? serial - 1 : serial;
      const date = new Date(epoch.getTime() + adjusted * 86400000);
      if (!isNaN(date.getTime())) {
        const m = String(date.getUTCMonth() + 1).padStart(2, "0");
        const d = String(date.getUTCDate()).padStart(2, "0");
        return `${date.getUTCFullYear()}-${m}-${d}`;
      }
    } catch {
      // fall through
    }
  }

  return null;
}

function normalizeAtFault(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.toString().trim().toLowerCase();
  if (v === "yes" || v === "y" || v === "true" || v === "1") return "yes";
  if (v === "no" || v === "n" || v === "false" || v === "0") return "no";
  if (v === "pending" || v === "tbd" || v === "unknown") return "pending";
  if (v === "partial") return "partial";
  return "pending";
}

function normalizeText(value: string | null | undefined, maxLength?: number): string | null {
  if (value === null || value === undefined) return null;
  const s = value.toString().trim();
  if (!s) return null;
  if (maxLength && s.length > maxLength) return s.slice(0, maxLength);
  return s;
}

// ============================================================
// LOOKUP / MATCHING
// ============================================================
function normalizeName(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

export interface MatchResult {
  id: string;
  name: string;
  score: "exact" | "normalized" | "partial";
}

export interface LookupResults {
  matchedDrivers: Record<string, MatchResult | null>;
  matchedAccounts: Record<string, MatchResult | null>;
  unmatchedDriverNames: string[];
  unmatchedAccountNames: string[];
}

export async function buildLookups(driverNames: string[], accountNames: string[]): Promise<LookupResults> {
  const matchedDrivers: Record<string, MatchResult | null> = {};
  const matchedAccounts: Record<string, MatchResult | null> = {};

  // Load all drivers with their user display info
  const allDrivers = await db
    .select({
      id: drivers.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(drivers)
    .leftJoin(users, eq(drivers.userId, users.id));

  // Load all customers
  const allCustomers = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.isDeleted, false));

  // Match drivers
  const uniqueDriverNames = [...new Set(driverNames.filter(Boolean))];
  for (const rawName of uniqueDriverNames) {
    const normRaw = normalizeName(rawName);
    let found: MatchResult | null = null;

    for (const d of allDrivers) {
      const fullName = `${d.firstName || ""} ${d.lastName || ""}`.trim();
      if (!fullName) continue;
      const normFull = normalizeName(fullName);

      if (fullName.toLowerCase() === rawName.trim().toLowerCase()) {
        found = { id: d.id, name: fullName, score: "exact" };
        break;
      }
      if (normFull === normRaw) {
        found = { id: d.id, name: fullName, score: "normalized" };
        break;
      }
    }

    matchedDrivers[rawName] = found;
  }

  // Match accounts
  const uniqueAccountNames = [...new Set(accountNames.filter(Boolean))];
  for (const rawName of uniqueAccountNames) {
    const normRaw = normalizeName(rawName);
    let found: MatchResult | null = null;

    for (const c of allCustomers) {
      const normCustomer = normalizeName(c.name);
      if (c.name.toLowerCase() === rawName.trim().toLowerCase()) {
        found = { id: c.id, name: c.name, score: "exact" };
        break;
      }
      if (normCustomer === normRaw) {
        found = { id: c.id, name: c.name, score: "normalized" };
        break;
      }
    }

    if (!found) {
      // Partial match: does the customer name start with or contain the raw name?
      const partial = allCustomers.find(c =>
        c.name.toLowerCase().includes(rawName.trim().toLowerCase()) ||
        rawName.trim().toLowerCase().includes(c.name.toLowerCase())
      );
      if (partial) {
        found = { id: partial.id, name: partial.name, score: "partial" };
      }
    }

    matchedAccounts[rawName] = found;
  }

  const unmatchedDriverNames = uniqueDriverNames.filter(n => !matchedDrivers[n]);
  const unmatchedAccountNames = uniqueAccountNames.filter(n => !matchedAccounts[n]);

  return { matchedDrivers, matchedAccounts, unmatchedDriverNames, unmatchedAccountNames };
}

// ============================================================
// ROW MAPPING + TRANSFORM
// ============================================================
export interface TransformRules {
  dateFormat?: string; // unused for now — xlsx handles it
  statusMap?: Record<string, string>; // raw value → canonical claim_status
  incidentTypeMap?: Record<string, string>;
  notesMaxLength?: number;
}

export interface MappedRow {
  rowIndex: number;
  rawRow: Record<string, any>;
  mapped: Record<string, any>;
  errors: string[];
  warnings: string[];
}

export function mapAndTransformRow(
  rawRow: Record<string, any>,
  rowIndex: number,
  columnMapping: Record<string, string | null>,
  transformRules: TransformRules,
  matchedDrivers: Record<string, MatchResult | null>,
  matchedAccounts: Record<string, MatchResult | null>,
  manualDriverOverrides: Record<string, string> = {},
  manualAccountOverrides: Record<string, string> = {},
  skipUnmatchedDriver = false,
  skipUnmatchedAccount = false,
  deduplicationRule = "rc_id",
  duplicateAction = "skip"
): MappedRow {
  const mapped: Record<string, any> = {};
  const errors: string[] = [];
  const warnings: string[] = [];

  // Apply column mapping
  for (const [excelCol, claimField] of Object.entries(columnMapping)) {
    if (!claimField) continue; // ignored column
    const rawValue = rawRow[excelCol];
    const fieldDef = CLAIM_FIELDS.find(f => f.key === claimField);
    if (!fieldDef) continue;

    let value: any = null;

    switch (fieldDef.type) {
      case "date":
        value = parseDate(rawValue);
        if (rawValue && !value) warnings.push(`Row ${rowIndex}: Could not parse date in column "${excelCol}": "${rawValue}"`);
        break;
      case "decimal":
        value = parseDecimal(rawValue);
        if (rawValue && value === null) warnings.push(`Row ${rowIndex}: Could not parse number in "${excelCol}": "${rawValue}"`);
        break;
      case "enum":
        if (claimField === "at_fault") {
          value = normalizeAtFault(rawValue);
        } else if (claimField === "claim_status") {
          const customMap = transformRules.statusMap || {};
          value = customMap[String(rawValue)] || normalizeEnum(rawValue, fieldDef.enumValues || []);
          if (!value) value = "DRAFT";
        } else if (claimField === "incident_type") {
          const customMap = transformRules.incidentTypeMap || {};
          value = customMap[String(rawValue)] || normalizeEnum(rawValue, fieldDef.enumValues || []);
          if (rawValue && !value) warnings.push(`Row ${rowIndex}: Unknown incident type "${rawValue}", will be stored as-is`);
          if (!value && rawValue) value = String(rawValue).toLowerCase().trim();
        } else {
          value = normalizeEnum(rawValue, fieldDef.enumValues || []);
        }
        break;
      case "lookup_driver": {
        const name = normalizeText(rawValue);
        if (name) {
          const override = manualDriverOverrides[name];
          if (override) {
            mapped["__driverName"] = name;
            mapped["driverId"] = override;
          } else {
            const match = matchedDrivers[name];
            if (match) {
              mapped["__driverName"] = name;
              mapped["driverId"] = match.id;
            } else {
              mapped["__driverName"] = name;
              mapped["driverId"] = null;
              if (!skipUnmatchedDriver) {
                errors.push(`Row ${rowIndex}: Driver "${name}" could not be matched`);
              } else {
                warnings.push(`Row ${rowIndex}: Skipping — driver "${name}" unmatched`);
              }
            }
          }
        } else {
          errors.push(`Row ${rowIndex}: Driver column is blank (required)`);
        }
        continue; // handled above
      }
      case "lookup_account": {
        const name = normalizeText(rawValue);
        if (name) {
          const override = manualAccountOverrides[name];
          if (override) {
            mapped["__accountName"] = name;
            mapped["customerId"] = override;
          } else {
            const match = matchedAccounts[name];
            if (match) {
              mapped["__accountName"] = name;
              mapped["customerId"] = match.id;
            } else {
              mapped["__accountName"] = name;
              mapped["customerId"] = null;
              if (!skipUnmatchedAccount) {
                warnings.push(`Row ${rowIndex}: Account "${name}" not matched — claim will have no account`);
              }
            }
          }
        }
        continue; // handled above
      }
      case "boolean":
        value = rawValue ? ["yes","true","1","y"].includes(String(rawValue).toLowerCase().trim()) : null;
        break;
      default:
        value = normalizeText(
          rawValue,
          claimField === "notes" ? (transformRules.notesMaxLength || undefined) : undefined
        );
    }

    mapped[claimField] = value ?? null;
  }

  return { rowIndex, rawRow, mapped, errors, warnings };
}

// ============================================================
// DEDUPLICATION CHECK
// ============================================================
export interface DedupeCheckResult {
  existingId: string | null;
  matchedOn: string | null;
}

export async function checkDuplicate(mapped: Record<string, any>, deduplicationRule: string): Promise<DedupeCheckResult> {
  let existing = null;

  // RC ID check
  if (deduplicationRule === "rc_id" || !deduplicationRule) {
    const rcId = mapped["rc_id"] || null;
    if (rcId) {
      const [found] = await db.select({ id: accidents.id }).from(accidents).where(eq(accidents.redcapId, rcId)).limit(1);
      if (found) return { existingId: found.id, matchedOn: "rc_id" };
    }
  }

  // Trip ID
  if (deduplicationRule === "trip_id" || (deduplicationRule === "rc_id" && !mapped["rc_id"])) {
    const tripId = mapped["trip_id"] || null;
    if (tripId) {
      const [found] = await db.select({ id: accidents.id }).from(accidents).where(eq(accidents.redcapId, tripId)).limit(1);
      if (found) return { existingId: found.id, matchedOn: "trip_id" };
    }
  }

  // Zendesk ticket
  const zdTicket = mapped["zendesk_ticket_number"] || null;
  if (zdTicket && (deduplicationRule === "zendesk" || !mapped["rc_id"])) {
    const [found] = await db.select({ id: accidents.id }).from(accidents).where(eq(accidents.zendeskTicketNumber, zdTicket)).limit(1);
    if (found) return { existingId: found.id, matchedOn: "zendesk" };
  }

  return { existingId: null, matchedOn: null };
}

// ============================================================
// DRY RUN
// ============================================================
export interface DryRunRowResult {
  rowIndex: number;
  action: "create" | "update" | "skip" | "error";
  errors: string[];
  warnings: string[];
  matchedDriverId: string | null;
  matchedCustomerId: string | null;
  existingClaimId: string | null;
  dedupeMatchedOn: string | null;
  preview: Record<string, any>;
}

export interface DryRunResult {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  skipRows: number;
  rows: DryRunRowResult[];
}

export async function runDryRun(
  batchId: string,
  allRows: MappedRow[],
  deduplicationRule: string,
  duplicateAction: string
): Promise<DryRunResult> {
  const results: DryRunRowResult[] = [];

  for (const row of allRows) {
    const errors = [...row.errors];
    const warnings = [...row.warnings];
    let action: "create" | "update" | "skip" | "error" = "create";
    let existingClaimId: string | null = null;
    let dedupeMatchedOn: string | null = null;

    // Check duplicate
    const dedupe = await checkDuplicate(row.mapped, deduplicationRule);
    if (dedupe.existingId) {
      existingClaimId = dedupe.existingId;
      dedupeMatchedOn = dedupe.matchedOn;
      if (duplicateAction === "skip") {
        action = "skip";
        warnings.push(`Row ${row.rowIndex}: Duplicate found (matched on ${dedupe.matchedOn}) — will skip`);
      } else if (duplicateAction === "update") {
        action = "update";
        warnings.push(`Row ${row.rowIndex}: Duplicate found (matched on ${dedupe.matchedOn}) — will update existing`);
      } else {
        // create_duplicate
        warnings.push(`Row ${row.rowIndex}: Duplicate found — will create new record anyway`);
      }
    }

    // Validate required fields
    if (!row.mapped["driverId"] && !errors.some(e => e.includes("Driver"))) {
      errors.push(`Row ${row.rowIndex}: Driver is required but missing`);
    }
    if (!row.mapped["date_of_incident"]) {
      errors.push(`Row ${row.rowIndex}: Date of Incident is required but missing or unparseable`);
    }

    if (errors.length > 0 && action !== "skip") {
      action = "error";
    }

    results.push({
      rowIndex: row.rowIndex,
      action,
      errors,
      warnings,
      matchedDriverId: row.mapped["driverId"] || null,
      matchedCustomerId: row.mapped["customerId"] || null,
      existingClaimId,
      dedupeMatchedOn,
      preview: row.mapped,
    });
  }

  return {
    totalRows: results.length,
    validRows: results.filter(r => r.action === "create" || r.action === "update").length,
    warningRows: results.filter(r => r.warnings.length > 0 && r.action !== "error").length,
    errorRows: results.filter(r => r.action === "error").length,
    skipRows: results.filter(r => r.action === "skip").length,
    rows: results,
  };
}

// ============================================================
// COMMIT
// ============================================================
export async function commitImport(
  batchId: string,
  dryRunRows: DryRunRowResult[],
  mappedRows: MappedRow[],
  userId: string,
  duplicateAction: string
): Promise<{ imported: number; updated: number; skipped: number; errors: number }> {
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const result of dryRunRows) {
    if (result.action === "skip") {
      skipped++;
      await db.update(importStagingRows).set({
        status: "skipped",
        matchAction: "skip",
        dedupeAction: result.dedupeMatchedOn || undefined,
        existingClaimId: result.existingClaimId || undefined,
      }).where(and(eq(importStagingRows.batchId, batchId), eq(importStagingRows.rowIndex, result.rowIndex)));
      continue;
    }

    if (result.action === "error") {
      errors++;
      await db.update(importStagingRows).set({ status: "error", matchAction: "error" })
        .where(and(eq(importStagingRows.batchId, batchId), eq(importStagingRows.rowIndex, result.rowIndex)));
      continue;
    }

    const row = mappedRows.find(r => r.rowIndex === result.rowIndex);
    if (!row || !result.matchedDriverId) {
      errors++;
      continue;
    }

    const m = row.mapped;
    const incidentDateStr = m["date_of_incident"];
    const incidentDate = incidentDateStr ? new Date(incidentDateStr + "T00:00:00") : new Date();

    try {
      if (result.action === "update" && result.existingClaimId) {
        // Update existing claim
        await db.update(accidents).set({
          claimStatus: m["claim_status"] || undefined,
          incidentType: m["incident_type"] || undefined,
          dodAtFault: m["at_fault"] || undefined,
          probableCost: m["probable_cost"] != null ? String(m["probable_cost"]) : undefined,
          actualCost: m["actual_cost"] != null ? String(m["actual_cost"]) : undefined,
          notesReceived: m["notes"] || undefined,
          vehicleInvolved: m["vehicle_involved"] || undefined,
          zendeskTicketNumber: m["zendesk_ticket_number"] || undefined,
          insuranceClaimNumber: m["insurance_claim_number"] || undefined,
          insuranceReserve: m["insurance_reserve"] != null ? String(m["insurance_reserve"]) : undefined,
          insurancePaid: m["insurance_paid"] != null ? String(m["insurance_paid"]) : undefined,
          insuranceTotal: m["insurance_total"] != null ? String(m["insurance_total"]) : undefined,
          insuranceDate: m["insurance_date"] ? new Date(m["insurance_date"] + "T00:00:00") : undefined,
          insuranceFault: m["insurance_fault"] || undefined,
          insuranceComments: m["insurance_comments"] || undefined,
          customerId: result.matchedCustomerId || undefined,
        }).where(eq(accidents.id, result.existingClaimId));

        await db.update(importStagingRows).set({
          status: "committed",
          matchAction: "update",
          existingClaimId: result.existingClaimId,
          matchedDriverId: result.matchedDriverId,
          matchedCustomerId: result.matchedCustomerId || undefined,
        }).where(and(eq(importStagingRows.batchId, batchId), eq(importStagingRows.rowIndex, result.rowIndex)));
        updated++;
      } else {
        // Create new claim
        const [newClaim] = await db.insert(accidents).values({
          driverId: result.matchedDriverId,
          customerId: result.matchedCustomerId || undefined,
          accidentDate: incidentDate,
          incidentDate,
          location: m["location"] || "Unknown",
          claimStatus: m["claim_status"] || "DRAFT",
          incidentType: m["incident_type"] || undefined,
          dodAtFault: m["at_fault"] || undefined,
          probableCost: m["probable_cost"] != null ? String(m["probable_cost"]) : undefined,
          actualCost: m["actual_cost"] != null ? String(m["actual_cost"]) : undefined,
          notesReceived: m["notes"] || undefined,
          vehicleInvolved: m["vehicle_involved"] || undefined,
          redcapId: m["rc_id"] || undefined,
          zendeskTicketNumber: m["zendesk_ticket_number"] || undefined,
          insuranceClaimNumber: m["insurance_claim_number"] || undefined,
          insuranceReserve: m["insurance_reserve"] != null ? String(m["insurance_reserve"]) : undefined,
          insurancePaid: m["insurance_paid"] != null ? String(m["insurance_paid"]) : undefined,
          insuranceTotal: m["insurance_total"] != null ? String(m["insurance_total"]) : undefined,
          insuranceDate: m["insurance_date"] ? new Date(m["insurance_date"] + "T00:00:00") : undefined,
          insuranceFault: m["insurance_fault"] || undefined,
          insuranceComments: m["insurance_comments"] || undefined,
        }).returning({ id: accidents.id });

        await db.update(importStagingRows).set({
          status: "committed",
          matchAction: "create",
          matchedDriverId: result.matchedDriverId,
          matchedCustomerId: result.matchedCustomerId || undefined,
          createdClaimId: newClaim.id,
        }).where(and(eq(importStagingRows.batchId, batchId), eq(importStagingRows.rowIndex, result.rowIndex)));
        imported++;
      }
    } catch (err: any) {
      console.error(`[ClaimImport] Error committing row ${result.rowIndex}:`, err.message);
      errors++;
      await db.update(importStagingRows).set({ status: "error", matchAction: "error" })
        .where(and(eq(importStagingRows.batchId, batchId), eq(importStagingRows.rowIndex, result.rowIndex)));
    }
  }

  // Update batch totals
  await db.update(importBatches).set({
    status: "committed",
    createdRows: imported,
    updatedRows: updated,
    skippedRows: skipped,
    failedRows: errors,
    committedAt: new Date(),
  }).where(eq(importBatches.id, batchId));

  return { imported, updated, skipped, errors };
}

// ============================================================
// EXCEPTION REPORT (CSV)
// ============================================================
export function generateExceptionReportCsv(rows: DryRunRowResult[]): string {
  const header = ["Row #", "Action", "Errors", "Warnings", "Driver ID", "Account ID", "Existing Claim ID"];
  const lines = [header.join(",")];

  for (const row of rows) {
    const errs = row.errors.join("; ").replace(/,/g, ";");
    const warns = row.warnings.join("; ").replace(/,/g, ";");
    lines.push([
      row.rowIndex,
      row.action,
      `"${errs}"`,
      `"${warns}"`,
      row.matchedDriverId || "",
      row.matchedCustomerId || "",
      row.existingClaimId || "",
    ].join(","));
  }

  return lines.join("\n");
}
