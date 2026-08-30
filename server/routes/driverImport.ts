import { snapshotUserCount, assertUserCountUnchanged } from "../services/importUserGuard";
import { parseFullName } from "../services/nameParsingService";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { db, pool } from "../db";
import {
  users,
  drivers,
  driverNotes,
  importBatches,
  importStagingRows,
  importAuditLog,
  NETWORK_VALUES,
  RECRUITER_VALUES,
  CERTIFIED_BY_VALUES,
  EMERGENCY_CONTACT_RELATIONSHIP_VALUES,
  DRIVER_NOTE_TYPES,
  type ImportBatch,
  type ImportStagingRow,
} from "@shared/schema";
import { eq, and, desc, sql, or, ilike, inArray } from "drizzle-orm";
import * as XLSX from "xlsx";
import multer from "multer";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

async function resolveUser(req: any): Promise<{ id: string; role: string; isRootSuperAdmin: boolean; firstName: string; lastName: string; email: string } | null> {
  const userId = (req.session as any)?.userId || req.user?.claims?.sub;
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  return {
    id: user.id,
    role: user.role || "",
    isRootSuperAdmin: !!(user as any).isRootSuperAdmin,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    email: user.email || "",
  };
}

function isSuperAdminUser(user: { role: string; isRootSuperAdmin: boolean }): boolean {
  return user.role === "super_user" || user.isRootSuperAdmin === true;
}

async function requireSuperAdminForImport(req: any, res: Response, next: Function) {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!isSuperAdminUser(user)) {
    // Log the blocked attempt
    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "import_blocked",
        actorUserId: user.id,
        actorUserEmail: user.email,
        targetEntityType: "driver_import",
        targetEntityId: req.path,
        reason: "not_super_admin",
        metadata: { route: req.path, userRole: user.role },
      });
    } catch (_) { /* non-blocking */ }
    return res.status(403).json({
      error: "IMPORT_FORBIDDEN",
      message: "Super Admin access required for data imports.",
    });
  }
  (req as any).resolvedUser = user;
  next();
}

// Keep legacy alias for commit route (now requires super admin)
const requireAdminForCommit = requireSuperAdminForImport;

const DRIVER_FIELD_CATALOG = [
  { key: "firstName", label: "First Name", group: "Identity", type: "text", required: false, aliases: ["first name", "first_name", "fname", "given name"] },
  { key: "lastName", label: "Last Name", group: "Identity", type: "text", required: false, aliases: ["last name", "last_name", "lname", "surname", "family name"] },
  { key: "fullName", label: "Full Name", group: "Identity", type: "text", required: false, aliases: ["full name", "full_name", "name", "driver name", "driver_name"] },
  { key: "email", label: "Email", group: "Identity", type: "email", required: true, aliases: ["email", "email address", "e-mail"] },
  { key: "driverNumber", label: "Driver Number", group: "Identity", type: "text", required: false, aliases: ["driver number", "driver_number", "driver #", "driver id", "driverid", "driver_id"] },
  { key: "phoneNumber", label: "Phone Number", group: "Contact", type: "text", required: false, aliases: ["phone", "phone number", "phone_number", "mobile", "cell", "telephone"] },
  { key: "address", label: "Address", group: "Contact", type: "text", required: false, aliases: ["address", "street", "street address", "address line 1"] },
  { key: "city", label: "City", group: "Contact", type: "text", required: false, aliases: ["city"] },
  { key: "state", label: "State", group: "Contact", type: "text", required: false, aliases: ["state", "province"] },
  { key: "zipCode", label: "Zip Code", group: "Contact", type: "text", required: false, aliases: ["zip", "zip code", "zip_code", "zipcode", "postal code", "postal_code"] },
  { key: "dateOfBirth", label: "Date of Birth", group: "Personal", type: "date", required: false, aliases: ["dob", "date of birth", "date_of_birth", "birthdate", "birth date", "birthday"] },
  { key: "gender", label: "Gender", group: "Personal", type: "text", required: false, aliases: ["gender", "sex"] },
  { key: "licenseNumber", label: "License Number", group: "License", type: "text", required: false, aliases: ["license", "license number", "license_number", "dl number", "dl_number", "drivers license"] },
  { key: "licenseState", label: "License State", group: "License", type: "text", required: false, aliases: ["license state", "license_state", "dl state", "dl_state"] },
  { key: "licenseExpiration", label: "License Expiration", group: "License", type: "date", required: false, aliases: ["license expiration", "license_expiration", "license exp", "dl expiration", "dl exp"] },
  { key: "cdlCertified", label: "CDL Certified", group: "License", type: "text", required: false, aliases: ["cdl certified", "cdl_certified", "cdl", "commercial driver license", "commercial license"] },
  { key: "driverType", label: "Driver Type", group: "Classification", type: "text", required: false, aliases: ["driver type", "driver_type", "type"] },
  { key: "driverClassification", label: "Driver Classification", group: "Classification", type: "text", required: false, aliases: ["classification", "driver classification", "driver_classification", "worker type"] },
  { key: "employeeId", label: "Employee ID", group: "Classification", type: "text", required: false, aliases: ["employee id", "employee_id", "emp id", "emp_id", "employee number"] },
  { key: "independentContractorId", label: "Independent Contractor ID", group: "Classification", type: "text", required: false, aliases: ["ic id", "ic_id", "contractor id", "contractor_id", "independent contractor id", "ic number"] },
  { key: "directManagerId", label: "Direct Manager", group: "Classification", type: "text", required: false, aliases: ["direct manager", "direct_manager", "manager", "manager id", "supervisor"] },
  { key: "driverAdvocateId", label: "Driver Advocate", group: "Classification", type: "text", required: false, aliases: ["driver advocate", "driver_advocate", "advocate", "advocate id"] },
  { key: "icAgreementSigned", label: "IC Agreement Signed", group: "Classification", type: "text", required: false, aliases: ["ic agreement signed", "ic_agreement_signed", "ic agreement", "agreement signed", "ic signed"] },
  { key: "icAgreementUrl", label: "IC Agreement URL", group: "Classification", type: "text", required: false, aliases: ["ic agreement url", "ic_agreement_url", "agreement url", "ic url"] },
  { key: "market", label: "Market", group: "Operations", type: "text", required: false, aliases: ["market", "region", "location", "area"] },
  { key: "hireDate", label: "Hire Date", group: "Operations", type: "date", required: false, aliases: ["hire date", "hire_date", "start date", "start_date", "date hired"] },
  { key: "status", label: "Status", group: "Operations", type: "text", required: false, aliases: ["status", "driver status", "driver_status", "employment status"] },
  { key: "recruiter", label: "Recruiter", group: "Operations", type: "picklist", required: false, aliases: ["recruiter", "recruited by"] },
  { key: "network", label: "Network", group: "Operations", type: "picklist", required: false, aliases: ["network", "network city", "network_city", "driver network"] },
  { key: "terminationDate", label: "Termination Date", group: "Termination", type: "date", required: false, aliases: ["termination date", "termination_date", "terminated date", "term date"] },
  { key: "contractCancelledDate", label: "Contract Cancelled Date", group: "Termination", type: "date", required: false, aliases: ["contract cancelled", "contract_cancelled_date", "contract canceled", "contract cancel date"] },
  { key: "terminationReason", label: "Termination Reason", group: "Termination", type: "text", required: false, aliases: ["termination reason", "termination_reason", "term reason", "reason for termination"] },
  { key: "terminationEligibleForRehire", label: "Eligible for Rehire", group: "Termination", type: "text", required: false, aliases: ["eligible for rehire", "eligible_for_rehire", "rehire", "rehire eligible", "rehirable"] },
  { key: "reactivationDate", label: "Reactivation Date", group: "Termination", type: "date", required: false, aliases: ["reactivation date", "reactivation_date", "reactivated date", "rehire date", "reinstate date"] },
  { key: "inactiveDate", label: "Inactive Date", group: "Termination", type: "date", required: false, aliases: ["inactive date", "inactive_date", "deactivation date"] },
  { key: "inactiveReason", label: "Inactive Reason", group: "Termination", type: "text", required: false, aliases: ["inactive reason", "inactive_reason", "deactivation reason"] },
  { key: "emergencyContactName", label: "Emergency Contact Name", group: "Emergency", type: "text", required: false, aliases: ["emergency contact", "emergency contact name", "emergency_contact_name", "ice name"] },
  { key: "emergencyContactPhone", label: "Emergency Contact Phone", group: "Emergency", type: "text", required: false, aliases: ["emergency phone", "emergency contact phone", "emergency_contact_phone", "ice phone"] },
  { key: "emergencyContactRelationship", label: "Emergency Contact Relationship", group: "Emergency", type: "picklist", required: false, aliases: ["emergency relationship", "emergency_contact_relationship", "ice relationship"] },
  { key: "emergencyContactEmail", label: "Emergency Contact Email", group: "Emergency", type: "text", required: false, aliases: ["emergency email", "emergency_contact_email"] },
  { key: "basePayPerMile", label: "Hourly Pay Rate", group: "Pay", type: "decimal", required: false, aliases: ["pay rate", "hourly rate", "hourly pay", "rate", "pay", "hourly_rate"] },
  { key: "fuelSurchargeRate", label: "Fuel Surcharge Rate", group: "Pay", type: "decimal", required: false, aliases: ["fuel surcharge", "fuel surcharge rate", "fuel_surcharge_rate", "dash pay rate"] },
  { key: "shiftPayRate", label: "Shift Pay Rate", group: "Pay", type: "decimal", required: false, aliases: ["shift pay rate", "shift_pay_rate", "shift rate"] },
  { key: "networkPayRate", label: "Network Pay Rate", group: "Pay", type: "decimal", required: false, aliases: ["network pay rate", "network_pay_rate", "network rate"] },
  { key: "lastPayDate", label: "Last Pay Date", group: "Pay", type: "date", required: false, aliases: ["last pay date", "last_pay_date", "last paid"] },
  { key: "firstMoveDate", label: "First Trip Date", group: "History", type: "date", required: false, aliases: ["first trip date", "first_trip_date", "first move date", "first_move_date"] },
  { key: "lastMoveDate", label: "Last Trip Date", group: "History", type: "date", required: false, aliases: ["last trip date", "last_trip_date", "last move date", "last_move_date"] },
  { key: "ssnOrEinEncrypted", label: "SSN/EIN", group: "Pay", type: "ssn", required: false, aliases: ["ssn", "ein", "ssn/ein", "tax id", "tax_id", "social security"] },
  { key: "paymentId", label: "Payment ID", group: "Pay", type: "text", required: false, aliases: ["payment id", "payment_id"] },
  { key: "openforceId", label: "OpenForce ID", group: "Pay", type: "text", required: false, aliases: ["openforce id", "openforce_id", "openforce"] },
  { key: "adpMarketplaceId", label: "ADP Marketplace ID", group: "Pay", type: "text", required: false, aliases: ["adp id", "adp_marketplace_id", "adp marketplace"] },
  { key: "drugTestDate", label: "Drug Test Date", group: "Compliance", type: "date", required: false, aliases: ["drug test", "drug test date", "drug_test_date"] },
  { key: "backgroundCheckDate", label: "Background Check Date", group: "Compliance", type: "date", required: false, aliases: ["background check", "background check date", "background_check_date", "bg check"] },
  { key: "mvrDate", label: "MVR Date", group: "Compliance", type: "date", required: false, aliases: ["mvr", "mvr date", "mvr_date", "motor vehicle record"] },
  { key: "dateCertified", label: "Date Certified", group: "Compliance", type: "date", required: false, aliases: ["date certified", "date_certified", "certified date", "certification date"] },
  { key: "certifiedBy", label: "Certified By", group: "Compliance", type: "text", required: false, aliases: ["certified by", "certified_by"] },
  { key: "safetyScore", label: "Safety Score", group: "Compliance", type: "text", required: false, aliases: ["safety score", "safety_score"] },
  { key: "createdAt", label: "Create Date", group: "System", type: "date", required: false, aliases: ["create date", "created date", "created_at", "create_date", "date created", "entry date", "record date"] },
  { key: "internalNoteText", label: "Internal Note Text", group: "Notes", type: "text", required: false, aliases: ["note", "notes", "internal note", "internal note text", "note text", "staff note", "comment", "comments", "internal comment"] },
  { key: "internalNoteType", label: "Internal Note Type", group: "Notes", type: "text", required: false, aliases: ["note type", "internal note type", "note category", "note_type"] },
  { key: "internalNoteAuthor", label: "Internal Note Author", group: "Notes", type: "text", required: false, aliases: ["note author", "note by", "internal note author", "note created by", "note author name", "author"] },
  { key: "internalNoteCreatedAt", label: "Internal Note Date", group: "Notes", type: "date", required: false, aliases: ["note date", "note created", "note created at", "note created date", "note timestamp", "note_created_at", "note date time"] },
];

const NOTE_KEYS = ["internalNoteText", "internalNoteType", "internalNoteAuthor", "internalNoteCreatedAt"] as const;

const MATCH_KEY_OPTIONS = [
  { key: "driverNumber", label: "Driver Number", description: "Match existing drivers by their unique driver number" },
  { key: "email", label: "Email Address", description: "Match existing drivers by their email address" },
  { key: "phoneNumber", label: "Phone Number", description: "Match existing drivers by phone number" },
];

function autoMapHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const normalized = header.toLowerCase().trim().replace(/[_\-\s]+/g, " ");
    for (const field of DRIVER_FIELD_CATALOG) {
      if (field.aliases.some(alias => alias === normalized || normalized.includes(alias))) {
        if (!Object.values(mapping).includes(field.key)) {
          mapping[header] = field.key;
          break;
        }
      }
    }
  }
  return mapping;
}

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

function parseDate(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    if (typeof value === "number") {
      return excelSerialToDate(value);
    }
    const str = String(value).trim();
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

const DATA_QUALITY_FIELDS = ["firstName", "lastName", "phoneNumber", "market", "driverType"];

// Parse a date/datetime string as EST (UTC-5) and return a Date object
function parseNoteDateTimeAsEST(value: any): Date | null {
  if (value === null || value === undefined || value === '') return null;
  try {
    // JavaScript Date objects (e.g. from XLSX with cellDates: true)
    if (value instanceof Date) {
      if (!isNaN(value.getTime())) return value;
      return null;
    }

    // Numeric Excel serial — MUST check before String() conversion
    if (typeof value === 'number' && isFinite(value) && value > 0 && value < 2958466) {
      const adjusted = value > 60 ? value - 1 : value;
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const serialDate = new Date(epoch.getTime() + adjusted * 86400000);
      if (isNaN(serialDate.getTime())) return null;
      // Serial encodes local "Excel time" (assumed EST) → +5h to get UTC
      return new Date(serialDate.getTime() + 5 * 3600000);
    }

    const str = String(value).trim();
    if (!str) return null;

    // ISO 8601 with explicit timezone (Z or ±HH:MM) — use as-is, no EST offset applied
    if (/Z$|[+-]\d{2}:\d{2}$/.test(str)) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d;
    }

    // "MM/DD/YYYY - HH:MM[:SS]" — dash-separated (24hr)
    const dtSlashDash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (dtSlashDash) {
      const y = +dtSlashDash[3], mo = +dtSlashDash[1] - 1, d = +dtSlashDash[2];
      const h = +dtSlashDash[4], mi = +dtSlashDash[5], s = +(dtSlashDash[6] || '0');
      return new Date(Date.UTC(y, mo, d, h + 5, mi, s));
    }

    // "M/D/YYYY H:MM[:SS] AM/PM" — 12-hour XLSX-formatted output
    const dtSlashAMPM = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (dtSlashAMPM) {
      const y = +dtSlashAMPM[3], mo = +dtSlashAMPM[1] - 1, d = +dtSlashAMPM[2];
      let h = +dtSlashAMPM[4]; const mi = +dtSlashAMPM[5], s = +(dtSlashAMPM[6] || '0');
      const ampm = dtSlashAMPM[7].toUpperCase();
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      return new Date(Date.UTC(y, mo, d, h + 5, mi, s));
    }

    // "MM/DD/YYYY HH:MM[:SS]" — 24hr, space-separated
    const dtSlash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (dtSlash) {
      const y = +dtSlash[3], mo = +dtSlash[1] - 1, d = +dtSlash[2];
      const h = +dtSlash[4], mi = +dtSlash[5], s = +(dtSlash[6] || '0');
      return new Date(Date.UTC(y, mo, d, h + 5, mi, s));
    }

    // "YYYY-MM-DD HH:MM[:SS]" or "YYYY-MM-DDTHH:MM[:SS]"
    const dtIso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (dtIso) {
      const y = +dtIso[1], mo = +dtIso[2] - 1, d = +dtIso[3];
      const h = +dtIso[4], mi = +dtIso[5], s = +(dtIso[6] || '0');
      return new Date(Date.UTC(y, mo, d, h + 5, mi, s));
    }

    // Date-only fallback: midnight EST (05:00 UTC)
    const dateOnly = parseDate(str);
    if (dateOnly) return new Date(dateOnly + 'T05:00:00.000Z');

    return null;
  } catch {
    return null;
  }
}

// Notes-only import mode: all rows contain ONLY note fields + email (no driver-record fields)
const NOTES_IDENTITY_KEYS = new Set(['email', 'firstName', 'lastName']);
const NOTE_KEY_SET = new Set<string>(NOTE_KEYS);

function isNotesOnlyImport(stagingRows: ImportStagingRow[]): boolean {
  if (stagingRows.length === 0) return false;
  const hasNoteText = stagingRows.some(r => {
    const m = r.mappedJson as Record<string, any> | null;
    return m && Boolean(m.internalNoteText);
  });
  if (!hasNoteText) return false;
  return stagingRows.every(r => {
    const m = r.mappedJson as Record<string, any> | null;
    if (!m) return true;
    return Object.keys(m).every(k => NOTE_KEY_SET.has(k) || NOTES_IDENTITY_KEYS.has(k));
  });
}

function validateRow(mapped: Record<string, any>, matchAction?: string, initialLoadMode = false): { errors: string[]; warnings: string[]; warningFields: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const warningFields: string[] = [];
  const isUpdate = matchAction === "update";

  // Full Name → First + Last Name parsing (if source provides fullName instead of split fields)
  if (mapped.fullName && (!mapped.firstName || !mapped.lastName)) {
    const parsed = parseFullName(String(mapped.fullName));
    if (!mapped.firstName) mapped.firstName = parsed.firstName;
    if (!mapped.lastName) mapped.lastName = parsed.lastName;
    mapped.sourceFullNameRaw = parsed.sourceFullNameRaw;
    if (parsed.nameParseReviewRequired) {
      warnings.push(`Full name parse flagged for review (${parsed.parseEdgeCaseReason || "edge case detected"}): "${mapped.fullName}"`);
      warningFields.push("fullName");
      mapped.nameParseReviewRequired = true;
    }
  }

  // Require either (firstName + lastName) OR fullName for new records
  if (!isUpdate) {
    if (!mapped.firstName && !mapped.lastName && !mapped.fullName) {
      errors.push("First Name and Last Name (or Full Name) are required");
    } else if (!mapped.firstName || !mapped.lastName) {
      if (!mapped.fullName) {
        errors.push("Both First Name and Last Name are required (or provide Full Name)");
      }
    }
  }

  // Email required check — hard error normally, warning in Initial Load Mode
  if (!isUpdate) {
    if (!mapped.email || String(mapped.email).trim() === "") {
      if (initialLoadMode) {
        warnings.push("Email not provided — driver will need email assigned before activation");
        warningFields.push("email");
      } else {
        errors.push("Email is required to create a new driver");
      }
    }
  }

  // Email format validation — hard error normally, warning in Initial Load Mode
  if (mapped.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(mapped.email))) {
    if (initialLoadMode) {
      warnings.push("Invalid email format — field will be skipped");
      warningFields.push("email");
      mapped.email = undefined;
    } else {
      errors.push("Invalid email format — cannot process row");
    }
  }

  for (const fieldKey of DATA_QUALITY_FIELDS) {
    const field = DRIVER_FIELD_CATALOG.find(f => f.key === fieldKey);
    if (!mapped[fieldKey] || String(mapped[fieldKey]).trim() === "") {
      warnings.push(`Missing ${field?.label || fieldKey}`);
      warningFields.push(fieldKey);
    }
  }

  const dateFields = DRIVER_FIELD_CATALOG.filter(f => f.type === "date");
  for (const field of dateFields) {
    if (mapped[field.key]) {
      const parsed = parseDate(mapped[field.key]);
      if (!parsed) {
        warnings.push(`Invalid date format for ${field.label} — value will be skipped`);
        warningFields.push(field.key);
      }
    }
  }

  if (mapped.driverClassification) {
    const valid = ["employee", "independent contractor", "ic"];
    if (!valid.includes(String(mapped.driverClassification).toLowerCase())) {
      warnings.push("Driver Classification not recognized — value will be skipped");
      warningFields.push("driverClassification");
    }
  }

  if (mapped.status) {
    const validStatuses = ["active", "inactive", "suspended", "terminated"];
    if (!validStatuses.includes(String(mapped.status).toLowerCase())) {
      warnings.push(`Status "${mapped.status}" not recognized — value will be skipped`);
      warningFields.push("status");
    }
  }

  // Picklist fields — hard errors normally, warnings in Initial Load Mode
  if (mapped.network) {
    const normalizedNetwork = String(mapped.network).trim().toUpperCase();
    if (!NETWORK_VALUES.includes(normalizedNetwork as any)) {
      if (initialLoadMode) {
        warnings.push(`Network "${mapped.network}" is not a recognized value — field will be skipped`);
        warningFields.push("network");
        mapped.network = undefined;
      } else {
        errors.push(`Network "${mapped.network}" is not a valid network value`);
      }
    }
  }

  if (mapped.recruiter) {
    const recruiterVal = String(mapped.recruiter).trim();
    if (!(RECRUITER_VALUES as readonly string[]).includes(recruiterVal)) {
      if (initialLoadMode) {
        warnings.push(`Recruiter "${mapped.recruiter}" is not recognized — field will be skipped`);
        warningFields.push("recruiter");
        mapped.recruiter = undefined;
      } else {
        errors.push(`Recruiter "${mapped.recruiter}" is not a valid recruiter. Must be one of: ${RECRUITER_VALUES.join(", ")}`);
      }
    }
  }

  if (mapped.certifiedBy) {
    const certifiedByVal = String(mapped.certifiedBy).trim();
    if (!(CERTIFIED_BY_VALUES as readonly string[]).includes(certifiedByVal)) {
      if (initialLoadMode) {
        warnings.push(`Certified By "${mapped.certifiedBy}" is not recognized — field will be skipped`);
        warningFields.push("certifiedBy");
        mapped.certifiedBy = undefined;
      } else {
        errors.push(`Certified By "${mapped.certifiedBy}" is not valid. Must be one of: ${CERTIFIED_BY_VALUES.join(", ")}`);
      }
    }
  }

  if (mapped.emergencyContactRelationship) {
    const relVal = String(mapped.emergencyContactRelationship).trim();
    if (!(EMERGENCY_CONTACT_RELATIONSHIP_VALUES as readonly string[]).includes(relVal)) {
      if (initialLoadMode) {
        warnings.push(`Emergency Contact Relationship "${relVal}" is not recognized — field will be skipped`);
        warningFields.push("emergencyContactRelationship");
        mapped.emergencyContactRelationship = undefined;
      } else {
        errors.push(`Emergency Contact Relationship "${relVal}" is not valid. Must be one of: ${EMERGENCY_CONTACT_RELATIONSHIP_VALUES.join(", ")}`);
      }
    }
  }

  const effectiveStatus = mapped.status ? String(mapped.status).toLowerCase() : null;
  if (effectiveStatus === "terminated" || effectiveStatus === "inactive") {
    if (!mapped.terminationDate && !mapped.contractCancelledDate && !mapped.inactiveDate) {
      warnings.push("Terminated/inactive status set but no termination or inactive date provided");
    }
  }

  if ((mapped.terminationDate || mapped.contractCancelledDate || mapped.terminationReason) && effectiveStatus && effectiveStatus !== "terminated" && effectiveStatus !== "inactive") {
    warnings.push("Termination fields mapped but status is not terminated/inactive — termination fields will be stored but status unchanged");
  }

  if (mapped.terminationReason && String(mapped.terminationReason).length > 50) {
    warnings.push("Termination Reason exceeds 50 characters — will be truncated");
    warningFields.push("terminationReason");
  }

  return { errors, warnings, warningFields };
}

router.get("/fields", isAuthenticated, (_req: any, res: Response) => {
  res.json({
    fields: DRIVER_FIELD_CATALOG,
    matchKeys: MATCH_KEY_OPTIONS,
  });
});

router.post("/upload", requireSuperAdminForImport, upload.single("file"), async (req: any, res: Response) => {
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
      fileName = req.headers["x-file-name"] || "import.csv";
    }

    if (buffer.length === 0) {
      return res.status(400).json({ error: "EMPTY_FILE", message: "Uploaded file is empty" });
    }
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "FILE_TOO_LARGE", message: "File must be under 10MB" });
    }

    const ext = String(fileName).split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext || "")) {
      return res.status(400).json({ error: "INVALID_FILE_TYPE", message: "Only CSV and XLSX files are accepted" });
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
    } catch (e) {
      return res.status(400).json({ error: "PARSE_ERROR", message: "Could not parse file. Ensure it is a valid CSV or XLSX." });
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ error: "EMPTY_WORKBOOK", message: "No sheets found in file" });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) {
      return res.status(400).json({ error: "NO_DATA", message: "File contains no data rows" });
    }
    if (rows.length > 20000) {
      return res.status(400).json({ error: "TOO_MANY_ROWS", message: "Maximum 20000 rows per import" });
    }

    const headers = Object.keys(rows[0]);
    const autoMapping = autoMapHeaders(headers);
    const resolved = await resolveUser(req);
    const userId = resolved?.id;
    const username = resolved ? `${resolved.firstName} ${resolved.lastName}`.trim() || resolved.email || "Unknown" : "Unknown";

    const [batch] = await db.insert(importBatches).values({
      sourceFileName: fileName,
      status: "uploaded",
      totalRows: rows.length,
      fileHeaders: headers,
      createdByUserId: userId || "unknown",
      createdByUsername: username,
    }).returning();

    const stagingValues = rows.map((row, idx) => ({
      batchId: batch.id,
      rowIndex: idx + 1,
      rawJson: row,
      status: "pending" as const,
    }));

    const CHUNK_SIZE = 500;
    for (let i = 0; i < stagingValues.length; i += CHUNK_SIZE) {
      await db.insert(importStagingRows).values(stagingValues.slice(i, i + CHUNK_SIZE));
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
    console.error("[DriverImport] Upload error:", err);
    res.status(500).json({ error: "UPLOAD_FAILED", message: err.message || "Upload failed" });
  }
});

router.get("/:batchId", isAuthenticated, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, req.params.batchId));
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    res.json(batch);
  } catch (err: any) {
    res.status(500).json({ error: "FETCH_FAILED", message: err.message });
  }
});

const mapSchema = z.object({
  mapping: z.record(z.string(), z.string()),
  matchKey: z.string().optional(),
  updateMode: z.string().optional(),
});

router.post("/:batchId/map", requireSuperAdminForImport, async (req: any, res: Response) => {
  try {
    const { mapping, matchKey, updateMode } = mapSchema.parse(req.body);
    const batchId = req.params.batchId;

    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (!["uploaded", "mapped", "validated"].includes(batch.status as string)) {
      return res.status(400).json({ error: "INVALID_STATUS", message: `Re-mapping is not allowed when batch is in "${batch.status}" state. Only uploaded, mapped, or validated batches can be re-mapped.` });
    }

    const stagingRows = await db.select().from(importStagingRows).where(eq(importStagingRows.batchId, batchId));
    const reverseMapping: Record<string, string> = {};
    for (const [sourceHeader, fieldKey] of Object.entries(mapping)) {
      reverseMapping[sourceHeader] = fieldKey;
    }

    // Phase 1: compute all mappings in memory — no DB I/O per row
    const fieldDefCache = new Map(DRIVER_FIELD_CATALOG.map(f => [f.key, f]));
    const rowIds: string[] = [];
    const rowMappedJsons: string[] = [];
    for (const row of stagingRows) {
      const rawData = row.rawJson as Record<string, any>;
      const mapped: Record<string, any> = {};
      for (const [sourceHeader, fieldKey] of Object.entries(reverseMapping)) {
        if (rawData[sourceHeader] !== undefined && rawData[sourceHeader] !== "") {
          const fieldDef = fieldDefCache.get(fieldKey);
          let value = rawData[sourceHeader];
          if (fieldDef?.type === "date") {
            value = parseDate(value) || value;
          }
          mapped[fieldKey] = value;
        }
      }
      rowIds.push(row.id);
      rowMappedJsons.push(JSON.stringify(mapped));
    }

    // Phase 2: single bulk UPDATE using unnest — 1 round-trip regardless of row count
    if (rowIds.length > 0) {
      await pool.query(
        `UPDATE import_staging_rows AS isr
         SET mapped_json = t.mapped_json::jsonb, status = 'pending'
         FROM (SELECT unnest($1::text[]) AS id, unnest($2::text[]) AS mapped_json) AS t
         WHERE isr.id = t.id`,
        [rowIds, rowMappedJsons]
      );
    }

    await db.update(importBatches)
      .set({
        status: "mapped",
        columnMapping: mapping,
        matchKey: matchKey || null,
        updateMode: updateMode || "overwrite_mapped",
      })
      .where(eq(importBatches.id, batchId));

    res.json({ success: true, rowsMapped: stagingRows.length });
  } catch (err: any) {
    console.error("[DriverImport] Map error:", err);
    res.status(500).json({ error: "MAP_FAILED", message: err.message });
  }
});

async function runValidateBackground(batchId: string, stagingRows: ImportStagingRow[], matchKey: string | null | undefined, initialLoadMode = false, updateMode = "overwrite_mapped") {
  try {
    // --- Bulk pre-fetch all lookup data upfront (eliminates per-row DB queries) ---
    const allEmails = [...new Set(
      stagingRows.map(r => { const m = r.mappedJson as Record<string,any>|null; return m?.email ? String(m.email).toLowerCase().trim() : null; }).filter(Boolean) as string[]
    )];
    const allDriverNums = [...new Set(
      stagingRows.map(r => { const m = r.mappedJson as Record<string,any>|null; return m?.driverNumber ? String(m.driverNumber).trim() : null; }).filter(Boolean) as string[]
    )];
    const allPhones = [...new Set(
      stagingRows.map(r => { const m = r.mappedJson as Record<string,any>|null; return m?.phoneNumber ? String(m.phoneNumber).trim() : null; }).filter(Boolean) as string[]
    )];

    const [existingUsersArr, driversByNumArr, driversByPhoneArr] = await Promise.all([
      allEmails.length > 0
        ? db.select({ id: users.id, email: users.email }).from(users).where(inArray(sql`LOWER(${users.email})`, allEmails))
        : Promise.resolve([]),
      allDriverNums.length > 0
        ? db.select({ id: drivers.id, userId: drivers.userId, driverNumber: drivers.driverNumber }).from(drivers).where(inArray(drivers.driverNumber, allDriverNums))
        : Promise.resolve([]),
      allPhones.length > 0
        ? db.select({ id: drivers.id, userId: drivers.userId, phoneNumber: drivers.phoneNumber }).from(drivers).where(inArray(drivers.phoneNumber, allPhones))
        : Promise.resolve([]),
    ]);

    // Build driver-by-userId map for email match key
    const existingUserIds = existingUsersArr.map(u => u.id);
    const driversByUserIdArr = existingUserIds.length > 0
      ? await db.select({ id: drivers.id, userId: drivers.userId }).from(drivers).where(inArray(drivers.userId, existingUserIds))
      : [];

    const userByEmail    = new Map(existingUsersArr.map(u  => [u.email?.toLowerCase().trim() || '', u]));
    const driverByUserId = new Map(driversByUserIdArr.map(d => [d.userId, d]));
    const driverByNumber = new Map(driversByNumArr.map(d    => [d.driverNumber || '', d]));
    const driverByPhone  = new Map(driversByPhoneArr.map(d  => [d.phoneNumber  || '', d]));

    let validCount = 0, warningCount = 0, errorCount = 0, createCount = 0, updateCount = 0, skippedCount = 0;
    const stagingUpdates: { id: string; data: Record<string, any> }[] = [];

    // --- Notes-only mode detection ---
    const notesOnlyMode = isNotesOnlyImport(stagingRows);

    // Pre-fetch existing notes for all matched drivers (for full-row de-dupe in notes-only mode)
    const existingNotesByDriverId = new Map<string, Array<{ noteText: string; noteType: string | null; createdAt: Date | null }>>();
    if (notesOnlyMode) {
      const allMatchedDriverIds = [...driverByUserId.values()].map(d => d.id);
      if (allMatchedDriverIds.length > 0) {
        const existingNotes = await db.select({
          driverId: driverNotes.driverId,
          noteText: driverNotes.noteText,
          noteType: driverNotes.noteType,
          createdAt: driverNotes.createdAt,
        }).from(driverNotes).where(inArray(driverNotes.driverId, allMatchedDriverIds));
        for (const n of existingNotes) {
          if (!existingNotesByDriverId.has(n.driverId)) existingNotesByDriverId.set(n.driverId, []);
          existingNotesByDriverId.get(n.driverId)!.push({ noteText: n.noteText || '', noteType: n.noteType, createdAt: n.createdAt });
        }
      }
    }

    // --- Intra-file duplicate tracking ---
    const seenInFileEmails     = new Set<string>();
    const seenInFileDriverNums = new Set<string>();
    const seenInFilePhones     = new Set<string>();

    for (let i = 0; i < stagingRows.length; i++) {
      const row    = stagingRows[i];
      const mapped = (row.mappedJson || {}) as Record<string, any>;

      let matchAction: "create" | "update" | "error" = "create";
      let matchedDriverId: string | null = null;
      let matchedUserId:   string | null = null;

      if (matchKey) {
        const matchValue = mapped[matchKey];
        if (matchValue) {
          if (matchKey === "email") {
            const existingUser = userByEmail.get(String(matchValue).toLowerCase().trim());
            if (existingUser) {
              matchedUserId = existingUser.id;
              const d = driverByUserId.get(existingUser.id);
              if (d) { matchedDriverId = d.id; matchAction = "update"; }
            }
          } else if (matchKey === "driverNumber") {
            const d = driverByNumber.get(String(matchValue).trim());
            if (d) { matchedDriverId = d.id; matchedUserId = d.userId; matchAction = "update"; }
          } else if (matchKey === "phoneNumber") {
            const d = driverByPhone.get(String(matchValue).trim());
            if (d) { matchedDriverId = d.id; matchedUserId = d.userId; matchAction = "update"; }
          }
        }
      }

      // --- Row identifier extraction (used in both update_only check and duplicate detection) ---
      const rowEmail     = mapped.email       ? String(mapped.email).toLowerCase().trim()  : null;
      const rowDriverNum = mapped.driverNumber ? String(mapped.driverNumber).trim()         : null;
      const rowPhone     = mapped.phoneNumber  ? String(mapped.phoneNumber).trim()          : null;

      // --- "Update Existing Only" enforcement ---
      // In this mode: rows with no match are hard errors, never creates.
      if (updateMode === "update_only" && matchAction === "create") {
        const matchVal = matchKey ? (mapped[matchKey] ?? "") : "";
        errorCount++;
        stagingUpdates.push({
          id: row.id,
          data: {
            validationErrors: [`DRIVER_NOT_FOUND — No existing driver matched ${matchKey ?? "match key"} "${matchVal}". In Update Existing Only mode, new drivers cannot be created.`],
            validationWarnings: null,
            validationWarningFields: null,
            matchAction: "error",
            matchedDriverId: null,
            matchedUserId: null,
            status: "error",
          },
        });
        if (rowEmail)     seenInFileEmails.add(rowEmail);
        if (rowDriverNum) seenInFileDriverNums.add(rowDriverNum);
        if (rowPhone)     seenInFilePhones.add(rowPhone);
        continue;
      }

      // --- Duplicate detection ---
      let duplicateLabel: string | null = null;
      let skipExisting = false;

      // 1. Intra-file: same identifier already seen in this import file
      // Notes-only mode: repeated emails are valid (each row = one note), skip email duplicate check
      // initialLoadMode: warn but still create — do not skip intra-file duplicates
      let intraFileDuplicateWarning: string | null = null;
      if (!notesOnlyMode && rowEmail && seenInFileEmails.has(rowEmail)) {
        if (initialLoadMode) { intraFileDuplicateWarning = `email "${rowEmail}" already appears in this import file`; } else { duplicateLabel = `email "${rowEmail}" already appears in this import file`; }
      } else if (rowDriverNum && seenInFileDriverNums.has(rowDriverNum)) {
        if (initialLoadMode) { intraFileDuplicateWarning = `driver number "${rowDriverNum}" already appears in this import file`; } else { duplicateLabel = `driver number "${rowDriverNum}" already appears in this import file`; }
      } else if (rowPhone && seenInFilePhones.has(rowPhone)) {
        if (initialLoadMode) { intraFileDuplicateWarning = `phone "${rowPhone}" already appears in this import file`; } else { duplicateLabel = `phone "${rowPhone}" already appears in this import file`; }
      }

      // 2. DB-level: create-only rows (no matchKey) against existing records
      //    In initialLoadMode: silently skip existing records instead of blocking with an error
      if (!duplicateLabel && matchAction === "create" && !matchKey) {
        if (rowEmail && userByEmail.has(rowEmail)) {
          if (initialLoadMode) {
            skipExisting = true;
          } else {
            duplicateLabel = `email "${rowEmail}" already exists — set a Match Key to update existing records`;
          }
        } else if (rowDriverNum && driverByNumber.has(rowDriverNum)) {
          if (initialLoadMode) {
            skipExisting = true;
          } else {
            duplicateLabel = `driver number "${rowDriverNum}" already exists — set a Match Key to update existing records`;
          }
        } else if (rowPhone && driverByPhone.has(rowPhone)) {
          if (initialLoadMode) {
            skipExisting = true;
          } else {
            duplicateLabel = `phone "${rowPhone}" already exists — set a Match Key to update existing records`;
          }
        }
      }

      // Mark identifiers as seen (regardless of outcome so subsequent rows detect duplicates too)
      if (rowEmail)     seenInFileEmails.add(rowEmail);
      if (rowDriverNum) seenInFileDriverNums.add(rowDriverNum);
      if (rowPhone)     seenInFilePhones.add(rowPhone);

      // Initial load mode: skip existing-email rows silently (count as skipped, not error)
      if (skipExisting) {
        skippedCount++;
        stagingUpdates.push({
          id: row.id,
          data: {
            validationErrors: null,
            validationWarnings: null,
            validationWarningFields: null,
            matchAction: "skip",
            matchedDriverId: null,
            matchedUserId: null,
            status: "skipped",
          },
        });
        continue;
      }

      if (duplicateLabel) {
        errorCount++;
        stagingUpdates.push({
          id: row.id,
          data: {
            validationErrors: [`Duplicate record — ${duplicateLabel}`],
            validationWarnings: null,
            validationWarningFields: null,
            matchAction: "error",
            matchedDriverId: null,
            matchedUserId: null,
            status: "error",
          },
        });
        continue;
      }
      // --- End duplicate detection ---

      // --- Notes-only mode: per-row validation ---
      if (notesOnlyMode) {
        const markNotesError = (errorMsg: string) => {
          errorCount++;
          stagingUpdates.push({
            id: row.id,
            data: {
              validationErrors: [errorMsg],
              validationWarnings: null,
              validationWarningFields: null,
              matchAction: 'error',
              matchedDriverId: null,
              matchedUserId: null,
              status: 'error',
            },
          });
          if (rowEmail)     seenInFileEmails.add(rowEmail);
          if (rowDriverNum) seenInFileDriverNums.add(rowDriverNum);
          if (rowPhone)     seenInFilePhones.add(rowPhone);
        };

        // Driver must exist — email must match a driver on file
        // Auto-fallback: in notes-only mode, try email lookup even if matchKey was not explicitly set
        if (!matchedDriverId && rowEmail) {
          const existingUser = userByEmail.get(rowEmail);
          if (existingUser) {
            const d = driverByUserId.get(existingUser.id);
            if (d) { matchedDriverId = d.id; matchedUserId = existingUser.id; }
          }
        }
        if (!matchedDriverId) {
          markNotesError('DRIVER_NOT_FOUND — No driver with this email exists in the system');
          continue;
        }

        // Note text is required
        const rawNoteText = mapped.internalNoteText ? String(mapped.internalNoteText).trim() : '';
        if (!rawNoteText) {
          markNotesError('MISSING_REQUIRED_FIELD — Note Text is required');
          continue;
        }

        // Date validation — if provided, must parse as a valid date
        let computedCreatedAt: Date | null = null;
        if (mapped.internalNoteCreatedAt) {
          computedCreatedAt = parseNoteDateTimeAsEST(mapped.internalNoteCreatedAt);
          if (!computedCreatedAt) {
            const rawVal = String(mapped.internalNoteCreatedAt ?? '').trim();
            markNotesError(`INVALID_DATE — Note Created Date/Time is not a valid date; raw="${rawVal}"`);
            continue;
          }
        }

        // Full-row de-dupe: compare raw note text (no prefix — prefix was removed in enhancement)
        const computedNoteText = rawNoteText;
        const rawNoteType = mapped.internalNoteType ? String(mapped.internalNoteType).trim() : '';
        const validNoteTypes: readonly string[] = DRIVER_NOTE_TYPES;
        const computedNoteType = validNoteTypes.includes(rawNoteType) ? rawNoteType : 'Driver Comments';

        const driverNotesList = existingNotesByDriverId.get(matchedDriverId) || [];
        const isDuplicate = driverNotesList.some(existing => {
          const textMatch = existing.noteText === computedNoteText;
          const typeMatch = existing.noteType === computedNoteType;
          const dateMatch = computedCreatedAt === null
            ? existing.createdAt === null
            : existing.createdAt !== null && Math.abs(new Date(existing.createdAt).getTime() - computedCreatedAt.getTime()) < 1000;
          return textMatch && typeMatch && dateMatch;
        });

        if (isDuplicate) {
          markNotesError('DUPLICATE_NOTE_FULL_MATCH — This exact note already exists for this driver');
          continue;
        }

        // Valid notes-only row
        validCount++;
        createCount++;
        stagingUpdates.push({
          id: row.id,
          data: {
            validationErrors: null,
            validationWarnings: null,
            validationWarningFields: null,
            matchAction: 'create_note',
            matchedDriverId,
            matchedUserId,
            status: 'valid',
          },
        });
        if (rowEmail)     seenInFileEmails.add(rowEmail);
        if (rowDriverNum) seenInFileDriverNums.add(rowDriverNum);
        if (rowPhone)     seenInFilePhones.add(rowPhone);
        continue;
      }
      // --- End notes-only validation ---

      // Initial load mode: bypass ALL field validation — just load the record as-is
      if (initialLoadMode) {
        validCount++;
        if (intraFileDuplicateWarning) warningCount++;
        if (matchAction === "update") updateCount++;
        else createCount++;
        stagingUpdates.push({
          id: row.id,
          data: {
            validationErrors: null,
            validationWarnings: intraFileDuplicateWarning ? [intraFileDuplicateWarning] : null,
            validationWarningFields: null,
            matchAction,
            matchedDriverId,
            matchedUserId,
            status: "valid",
          },
        });
      } else {
        const { errors, warnings, warningFields } = validateRow(mapped, matchAction, initialLoadMode);
        const status = errors.length > 0 ? "error" as const : "valid" as const;
        if (status === "valid") {
          validCount++;
          if (warnings.length > 0) warningCount++;
          if (matchAction === "update") updateCount++;
          else createCount++;
        } else {
          errorCount++;
          matchAction = "error";
        }
        stagingUpdates.push({
          id: row.id,
          data: {
            validationErrors:        errors.length     > 0 ? errors       : null,
            validationWarnings:      warnings.length   > 0 ? warnings     : null,
            validationWarningFields: warningFields.length > 0 ? warningFields : null,
            matchAction,
            matchedDriverId,
            matchedUserId,
            status,
          },
        });
      }

      // Update progress + check cancellation every 100 rows
      if ((i + 1) % 100 === 0) {
        const [batchCheck] = await db.select({ status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
        await db.update(importBatches).set({ processedRows: i + 1 }).where(eq(importBatches.id, batchId));
        if (batchCheck?.status === "cancelling") {
          await db.update(importBatches).set({ status: "cancelled", processedRows: i + 1 }).where(eq(importBatches.id, batchId));
          console.log(`[DriverImport] Validation cancelled at row ${i + 1} for batch ${batchId}`);
          return;
        }
      }
    }

    // Batch-update staging rows in parallel chunks of 200
    const CHUNK = 200;
    for (let i = 0; i < stagingUpdates.length; i += CHUNK) {
      await Promise.all(stagingUpdates.slice(i, i + CHUNK).map(u =>
        db.update(importStagingRows).set(u.data).where(eq(importStagingRows.id, u.id))
      ));
    }

    await db.update(importBatches)
      .set({ status: "validated", validRows: validCount, errorRows: errorCount, warningRows: warningCount, skippedRows: skippedCount, processedRows: stagingRows.length, createdRows: createCount, updatedRows: updateCount, validatedAt: new Date() })
      .where(eq(importBatches.id, batchId));

    console.log(`[DriverImport] Validation complete — batch ${batchId}: ${validCount} valid, ${errorCount} errors`);
  } catch (err: any) {
    console.error("[DriverImport] Background validate failed:", err);
    const msg = err?.message || "Unknown validation error";
    await db.update(importBatches).set({ status: "failed", errorMessage: msg }).where(eq(importBatches.id, batchId)).catch(() => {});
  }
}

router.post("/:batchId/validate", requireSuperAdminForImport, async (req: any, res: Response) => {
  try {
    const batchId = req.params.batchId;
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.status === "validating") {
      return res.status(400).json({ error: "ALREADY_PROCESSING", message: "Validation is already in progress" });
    }
    if (batch.status !== "mapped" && batch.status !== "validated") {
      return res.status(400).json({ error: "INVALID_STATUS", message: "Batch must be mapped before validation" });
    }

    const stagingRows = await db.select().from(importStagingRows).where(eq(importStagingRows.batchId, batchId));
    const initialLoadMode = req.body?.initialLoadMode === true || req.body?.initialLoadMode === "true";

    // Save initialLoadMode to batch, set status immediately so UI can start polling, then respond without waiting
    await db.update(importBatches)
      .set({ status: "validating", processedRows: 0, startedAt: new Date(), initialLoadMode })
      .where(eq(importBatches.id, batchId));
    res.json({ status: "validating", batchId, totalRows: stagingRows.length });

    // Fire-and-forget background processing (response already sent)
    runValidateBackground(batchId, stagingRows, batch.matchKey, initialLoadMode, batch.updateMode ?? "overwrite_mapped").catch(err => {
      console.error("[DriverImport] runValidateBackground uncaught:", err);
    });
  } catch (err: any) {
    console.error("[DriverImport] Validate error:", err);
    res.status(500).json({ error: "VALIDATE_FAILED", message: err.message });
  }
});

router.get("/:batchId/rows", isAuthenticated, async (req: any, res: Response) => {
  try {
    const batchId = req.params.batchId;
    const statusFilter = req.query.status as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = (page - 1) * limit;

    let query = db.select().from(importStagingRows)
      .where(
        statusFilter
          ? and(eq(importStagingRows.batchId, batchId), eq(importStagingRows.status, statusFilter as any))
          : eq(importStagingRows.batchId, batchId)
      )
      .orderBy(importStagingRows.rowIndex)
      .limit(limit)
      .offset(offset);

    const rows = await query;
    res.json({ rows, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: "FETCH_FAILED", message: err.message });
  }
});

async function insertImportNote(
  driverId: string,
  mapped: Record<string, any>,
  commitUserId: string,
  batchId: string,
  commitUserName: string
) {
  const rawText = mapped.internalNoteText ? String(mapped.internalNoteText).trim() : '';
  if (!rawText) return;

  const rawType = mapped.internalNoteType ? String(mapped.internalNoteType).trim() : '';
  const validTypes: readonly string[] = DRIVER_NOTE_TYPES;
  const noteType = validTypes.includes(rawType) ? rawType : 'Driver Comments';

  // Author: use file-provided author if present, otherwise fall back to the importer's name
  const sourceAuthorRaw = mapped.internalNoteAuthor ? String(mapped.internalNoteAuthor).trim() : '';
  const authorName = sourceAuthorRaw || commitUserName;

  const noteValues: Record<string, any> = {
    driverId,
    corporateUserId: commitUserId,
    noteText: rawText,        // Clean body — no "[Imported from: ...]" prefix
    noteType,
    authorName,               // Display name (file author or importer)
    isImported: true,
    importBatchId: batchId,
    importedBy: commitUserId,
    importedAt: new Date(),
    sourceAuthorRaw: sourceAuthorRaw || null,
  };

  if (mapped.internalNoteCreatedAt) {
    const parsed = parseNoteDateTimeAsEST(mapped.internalNoteCreatedAt);
    if (parsed) noteValues.createdAt = parsed;
  }

  await db.insert(driverNotes).values(noteValues as any);
}

async function runCommitBackground(batchId: string, commitUserId: string, commitUserEmail: string, commitUserRole: string) {
  const _userCountBefore = await snapshotUserCount();
  const dateFields = DRIVER_FIELD_CATALOG.filter(f => f.type === 'date').map(f => f.key);
  const decimalFields = DRIVER_FIELD_CATALOG.filter(f => f.type === 'decimal').map(f => f.key);
  const classificationValid = ['employee', 'independent contractor', 'ic'];

  // Resolve commit user's display name once — used as fallback author on imported notes
  let commitUserName = commitUserEmail;
  try {
    const [commitUserRow] = await db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users).where(eq(users.id, commitUserId)).limit(1);
    if (commitUserRow) {
      const fullName = `${commitUserRow.firstName || ''} ${commitUserRow.lastName || ''}`.trim();
      commitUserName = fullName || commitUserRow.email || commitUserEmail;
    }
  } catch { /* fallback to email */ }

  try {
    // Count rows already committed in a previous (interrupted) attempt — used for correct progress tracking.
    const { rows: [prevRow] } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM import_staging_rows WHERE batch_id = $1 AND status = 'committed'`,
      [batchId]
    );
    const alreadyCommitted = parseInt(prevRow?.cnt ?? '0');

    let created = 0, updated = 0, failed = 0, flaggedForUpdate = 0, skipped = 0;
    let processedInThisRun = 0;

    // Process in chunks of 500 uncommitted rows.
    // Selecting only non-committed rows means each chunk naturally advances as rows get marked committed.
    // If the server restarts mid-import, the next run skips already-committed rows and picks up from where it left off.
    const COMMIT_CHUNK = 500;
    while (true) {
      const chunk = await db.select().from(importStagingRows)
        .where(and(
          eq(importStagingRows.batchId, batchId),
          sql`${importStagingRows.status} != 'committed'`,
        ))
        .orderBy(importStagingRows.rowIndex)
        .limit(COMMIT_CHUNK);

      if (chunk.length === 0) break;  // All rows processed

      // Flush audit entries after every chunk — avoids accumulating a 19k-entry array in memory
      const auditEntries: { batchId: string; rowId: string; action: string; driverId?: string; message: string }[] = [];

      for (const row of chunk) {
      try {
        const mapped = (row.mappedJson || {}) as Record<string, any>;
        const action = row.matchAction || 'create';

        if (row.status === 'error') {
          const reason = ((row.validationErrors as string[]) || []).join('; ') || 'Cannot process row';
          failed++;
          auditEntries.push({ batchId, rowId: row.id, action: 'skip_blocked', message: `Row ${row.rowIndex} skipped: ${reason}` });
          await db.update(importStagingRows).set({ status: 'committed' }).where(eq(importStagingRows.id, row.id));
          continue;
        }

        // Initial load mode: silently skip rows where email already existed
        if (row.status === 'skipped' || action === 'skip') {
          skipped++;
          await db.update(importStagingRows).set({ status: 'committed' }).where(eq(importStagingRows.id, row.id));
          continue;
        }

        // --- Notes-only commit path: insert note directly, skip driver record processing ---
        if (action === 'create_note' && row.matchedDriverId) {
          await insertImportNote(row.matchedDriverId, mapped, commitUserId, batchId, commitUserName);
          auditEntries.push({ batchId, rowId: row.id, action: 'note_create', driverId: row.matchedDriverId, message: `Created note for driver ${row.matchedDriverId} from row ${row.rowIndex}` });
          await db.update(importStagingRows).set({ status: 'committed' }).where(eq(importStagingRows.id, row.id));
          created++;
          continue;
        }

        const qualityWarnings: string[] = [];
        const qualityFields: string[] = [];
        for (const fieldKey of DATA_QUALITY_FIELDS) {
          const field = DRIVER_FIELD_CATALOG.find(f => f.key === fieldKey);
          if (!mapped[fieldKey] || String(mapped[fieldKey]).trim() === '') {
            qualityWarnings.push(`Missing ${field?.label || fieldKey}`);
            qualityFields.push(fieldKey);
          }
        }

        if (action === 'update' && row.matchedDriverId) {
          const driverUpdate: Record<string, any> = {};
          for (const [key, value] of Object.entries(mapped)) {
            if (['firstName', 'lastName', 'email', ...NOTE_KEYS].includes(key)) continue;
            if (key === 'ssnOrEinEncrypted') {
              driverUpdate[key] = value;
            } else if (key === 'createdAt') {
              // Allow spreadsheet-provided Created Date to overwrite the stored value on re-import.
              // Use noon UTC so the timestamp never crosses a date boundary in any US timezone.
              const parsed = parseDate(value);
              if (parsed) { driverUpdate[key] = new Date(parsed + 'T12:00:00.000Z'); }
            } else if (dateFields.includes(key)) {
              const parsed = parseDate(value);
              // Pass the YYYY-MM-DD string directly — PostgreSQL DATE columns accept ISO date strings
              // without timezone interpretation, preventing the UTC-midnight shift that causes off-by-one days.
              if (parsed) { driverUpdate[key] = parsed; }
              else { qualityWarnings.push(`Invalid date for ${key} — skipped`); if (!qualityFields.includes(key)) qualityFields.push(key); }
            } else if (key === 'driverClassification') {
              if (classificationValid.includes(String(value).toLowerCase())) { driverUpdate[key] = value; }
              else { qualityWarnings.push('Driver Classification not recognized — skipped'); if (!qualityFields.includes(key)) qualityFields.push(key); }
            } else if (key === 'terminationReason') {
              driverUpdate[key] = String(value).substring(0, 50);
            } else if (key === 'status') {
              const validStatuses = ['active', 'inactive', 'suspended', 'terminated'];
              const normalized = String(value).toLowerCase();
              if (validStatuses.includes(normalized)) { driverUpdate[key] = normalized; }
              else { qualityWarnings.push(`Status "${value}" not recognized — skipped`); if (!qualityFields.includes(key)) qualityFields.push(key); }
            } else if (decimalFields.includes(key)) {
              driverUpdate[key] = String(value);
            } else {
              driverUpdate[key] = value;
            }
          }

          const [existingDriverRow] = await db.select({ status: drivers.status, driverClassification: drivers.driverClassification })
            .from(drivers).where(eq(drivers.id, row.matchedDriverId));

          const effectiveClassification = String(driverUpdate.driverClassification || existingDriverRow?.driverClassification || '').toLowerCase();
          if (effectiveClassification === 'employee' && (driverUpdate.independentContractorId !== undefined || driverUpdate.driverClassification)) driverUpdate.independentContractorId = null;
          else if ((effectiveClassification === 'independent contractor' || effectiveClassification === 'ic') && (driverUpdate.employeeId !== undefined || driverUpdate.driverClassification)) driverUpdate.employeeId = null;

          const effectiveStatus = driverUpdate.status || existingDriverRow?.status || 'active';
          const hasQualityIssues = qualityWarnings.length > 0;
          if (hasQualityIssues && effectiveStatus === 'active') {
            driverUpdate.needsUpdate = true; driverUpdate.needsUpdateReasons = qualityWarnings; driverUpdate.needsUpdateFields = qualityFields;
            driverUpdate.needsUpdateSetAt = new Date(); driverUpdate.needsUpdateSetBy = 'system'; driverUpdate.needsUpdateImportBatchId = batchId;
            flaggedForUpdate++;
          } else if (effectiveStatus !== 'active') {
            driverUpdate.needsUpdate = false; driverUpdate.needsUpdateReasons = null; driverUpdate.needsUpdateFields = null;
            driverUpdate.needsUpdateSetAt = null; driverUpdate.needsUpdateSetBy = null; driverUpdate.needsUpdateImportBatchId = null;
          }

          if (Object.keys(driverUpdate).length > 0) {
            driverUpdate.updatedAt = new Date();
            await db.update(drivers).set(driverUpdate).where(eq(drivers.id, row.matchedDriverId));
          }
          if (row.matchedUserId && (mapped.firstName || mapped.lastName)) {
            await storage.updateUser(row.matchedUserId, {
              ...(mapped.firstName ? { firstName: mapped.firstName } : {}),
              ...(mapped.lastName ? { lastName: mapped.lastName } : {}),
            }, {
              source: "driver_import",
              actorUserId: commitUserId,
              actorEmail: commitUserName,
              reason: `Identity fields synchronized from import batch ${batchId}.`,
              metadata: { batchId, rowId: row.id },
            });
          }
          auditEntries.push({ batchId, rowId: row.id, action: hasQualityIssues ? 'driver_update_with_warnings' : 'driver_update', driverId: row.matchedDriverId, message: hasQualityIssues ? `Updated driver from row ${row.rowIndex} (flagged: ${qualityWarnings.join(', ')})` : `Updated driver from row ${row.rowIndex}` });
          await insertImportNote(row.matchedDriverId, mapped, commitUserId, batchId, commitUserName);
          await db.update(importStagingRows).set({ status: 'committed' }).where(eq(importStagingRows.id, row.id));
          updated++;
        } else {
          // POLICY: Driver import never creates User accounts.
          // Users are only provisioned via the explicit "Invite New User" flow.
          // drivers.user_id is nullable — imported drivers have no login account.
          const driverData: Record<string, any> = {};
          for (const [key, value] of Object.entries(mapped)) {
            if (['firstName', 'lastName', 'email', ...NOTE_KEYS].includes(key)) continue;
            if (key === 'ssnOrEinEncrypted') { driverData[key] = value; }
            else if (key === 'createdAt') {
              // createdAt is a timestamp column — use noon UTC to avoid date boundary crossing
              // regardless of server or client timezone offset.
              const parsed = parseDate(value);
              if (parsed) { driverData[key] = new Date(parsed + 'T12:00:00.000Z'); }
            }
            else if (dateFields.includes(key)) {
              const parsed = parseDate(value);
              // Pass the YYYY-MM-DD string directly — PostgreSQL DATE columns accept ISO date strings
              // without timezone interpretation, preventing the UTC-midnight shift that causes off-by-one days.
              if (parsed) { driverData[key] = parsed; }
              else { qualityWarnings.push(`Invalid date for ${key} — skipped`); if (!qualityFields.includes(key)) qualityFields.push(key); }
            } else if (key === 'driverClassification') {
              if (classificationValid.includes(String(value).toLowerCase())) { driverData[key] = value; }
              else { qualityWarnings.push('Driver Classification not recognized — skipped'); if (!qualityFields.includes(key)) qualityFields.push(key); }
            } else if (key === 'terminationReason') { driverData[key] = String(value).substring(0, 50); }
            else if (key === 'status') {
              const validStatuses = ['active', 'inactive', 'suspended', 'terminated'];
              const normalized = String(value).toLowerCase();
              if (validStatuses.includes(normalized)) { driverData[key] = normalized; }
              else { qualityWarnings.push(`Status "${value}" not recognized — skipped`); if (!qualityFields.includes(key)) qualityFields.push(key); }
            } else if (decimalFields.includes(key)) { driverData[key] = String(value); }
            else { driverData[key] = value; }
          }

          const createClassification = String(driverData.driverClassification || '').toLowerCase();
          if (createClassification === 'employee') driverData.independentContractorId = null;
          else if (createClassification === 'independent contractor' || createClassification === 'ic') driverData.employeeId = null;

          const hasQualityIssues = qualityWarnings.length > 0;
          if (hasQualityIssues && (driverData.status || 'active') === 'active') {
            driverData.needsUpdate = true; driverData.needsUpdateReasons = qualityWarnings; driverData.needsUpdateFields = qualityFields;
            driverData.needsUpdateSetAt = new Date(); driverData.needsUpdateSetBy = 'system'; driverData.needsUpdateImportBatchId = batchId;
            flaggedForUpdate++;
          }

          const [newDriver] = await db.insert(drivers).values(driverData as any).returning();
          auditEntries.push({ batchId, rowId: row.id, action: hasQualityIssues ? 'driver_create_with_warnings' : 'driver_create', driverId: newDriver.id, message: hasQualityIssues ? `Created driver from row ${row.rowIndex} (flagged: ${qualityWarnings.join(', ')})` : `Created driver from row ${row.rowIndex}` });
          await insertImportNote(newDriver.id, mapped, commitUserId, batchId, commitUserName);
          await db.update(importStagingRows).set({ status: 'committed' }).where(eq(importStagingRows.id, row.id));
          created++;
        }
      } catch (rowErr: any) {
        console.error(`[DriverImport] Row ${row.rowIndex} commit error:`, rowErr);
        failed++;
        auditEntries.push({ batchId, rowId: row.id, action: 'error', message: `Row ${row.rowIndex}: ${rowErr.message || 'Unknown error'}` });
        await db.update(importStagingRows).set({ status: 'error', validationErrors: [rowErr.message || 'Commit failed'] }).where(eq(importStagingRows.id, row.id));
      }
      } // end for (const row of chunk)

      processedInThisRun += chunk.length;

      // Flush audit entries for this chunk — keeps memory bounded regardless of total row count
      if (auditEntries.length > 0) {
        const AUDIT_CHUNK = 200;
        for (let ai = 0; ai < auditEntries.length; ai += AUDIT_CHUNK) {
          await db.insert(importAuditLog).values(auditEntries.slice(ai, ai + AUDIT_CHUNK) as any[]);
        }
      }

      // Progress update + cancellation check after each chunk
      const totalProcessed = alreadyCommitted + processedInThisRun;
      const [batchCheck] = await db.select({ status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
      await db.update(importBatches).set({ processedRows: totalProcessed }).where(eq(importBatches.id, batchId));
      if (batchCheck?.status === "cancelling") {
        await db.update(importBatches).set({ status: "cancelled", processedRows: totalProcessed, createdRows: created, updatedRows: updated, failedRows: failed, skippedRows: skipped }).where(eq(importBatches.id, batchId));
        console.log(`[DriverImport] Commit cancelled at row ${totalProcessed} for batch ${batchId}`);
        return;
      }
    } // end while (true) chunk loop

    const totalRows = alreadyCommitted + processedInThisRun;
    await assertUserCountUnchanged(batchId, "Drivers", _userCountBefore);

    // Compute final stats from staging rows — in-memory counters only reflect the current
    // run and undercount if the server restarted mid-commit and this is a resume.
    const { rows: [finalStats] } = await pool.query<{
      total_created: string; total_updated: string; total_skipped: string; total_failed: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE match_action = 'create')::text       AS total_created,
        COUNT(*) FILTER (WHERE match_action = 'update')::text       AS total_updated,
        COUNT(*) FILTER (WHERE match_action = 'skip')::text         AS total_skipped,
        COUNT(*) FILTER (
          WHERE validation_errors IS NOT NULL
            AND jsonb_array_length(validation_errors) > 0
        )::text AS total_failed
      FROM import_staging_rows
      WHERE batch_id = $1
    `, [batchId]);

    const totalCreated   = parseInt(finalStats?.total_created  ?? '0');
    const totalUpdated   = parseInt(finalStats?.total_updated  ?? '0');
    const totalSkipped   = parseInt(finalStats?.total_skipped  ?? '0');
    const totalFailed    = parseInt(finalStats?.total_failed   ?? '0');

    await db.update(importBatches)
      .set({ status: 'committed', createdRows: totalCreated, updatedRows: totalUpdated, skippedRows: totalSkipped, failedRows: totalFailed, warningRows: flaggedForUpdate, processedRows: totalRows, committedAt: new Date() })
      .where(eq(importBatches.id, batchId));

    // System audit log
    try {
      const { writeSystemAuditEvent } = await import('../services/systemAuditLogService');
      await writeSystemAuditEvent({
        eventType: 'import_committed', actorUserId: commitUserId, actorUserEmail: commitUserEmail,
        targetEntityType: 'driver_import', targetEntityId: batchId,
        metadata: { module: 'drivers', batchId, userRole: commitUserRole, rowsProcessed: totalRows, rowsImported: totalCreated, rowsUpdated: totalUpdated, rowsSkipped: totalSkipped, rowsErrored: totalFailed },
      });
    } catch (_) { /* non-blocking */ }

    console.log(`[DriverImport] Commit complete — batch ${batchId}: ${totalCreated} created, ${totalUpdated} updated, ${totalFailed} failed (${alreadyCommitted} pre-committed from prior attempt)`);
  } catch (err: any) {
    console.error('[DriverImport] Background commit failed:', err);
    const msg = err?.message || "Unknown commit error";
    await db.update(importBatches).set({ status: 'failed', errorMessage: msg }).where(eq(importBatches.id, batchId)).catch(() => {});
  }
}

// ===== PRE-COMMIT PREFLIGHT CHECK =====
router.get("/:batchId/preflight", isAuthenticated, async (req: any, res: Response) => {
  try {
    const { batchId } = req.params;
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND" });
    if (batch.status !== "validated") {
      return res.status(400).json({
        error: "INVALID_STATUS",
        message: `Preflight requires a validated batch (current: "${batch.status}")`,
      });
    }

    // Aggregate staging row counts in a single SQL pass
    const { rows: [agg] } = await pool.query<{
      creates: string; updates: string; skips: string; errors: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE match_action = 'create' AND status IN ('valid','warning')) AS creates,
        COUNT(*) FILTER (WHERE match_action = 'update' AND status IN ('valid','warning')) AS updates,
        COUNT(*) FILTER (WHERE status = 'skipped')                                       AS skips,
        COUNT(*) FILTER (WHERE status = 'error')                                         AS errors
      FROM import_staging_rows
      WHERE batch_id = $1
    `, [batchId]);

    const creates = parseInt(agg.creates ?? "0");
    const updates = parseInt(agg.updates ?? "0");
    const skips   = parseInt(agg.skips   ?? "0");
    const errors  = parseInt(agg.errors  ?? "0");

    // Re-check for email conflicts: CREATE rows whose email now exists in the DB
    const { rows: [emailConflictRow] } = await pool.query<{ cnt: string }>(`
      SELECT COUNT(*)::text AS cnt
      FROM import_staging_rows sr
      JOIN users u ON LOWER(u.email) = LOWER((sr.mapped_json->>'email'))
      WHERE sr.batch_id = $1
        AND sr.match_action = 'create'
        AND sr.status IN ('valid','warning')
        AND (sr.mapped_json->>'email') IS NOT NULL
    `, [batchId]);

    // Re-check for driverNumber conflicts: CREATE rows whose driverNumber now exists
    const { rows: [numConflictRow] } = await pool.query<{ cnt: string }>(`
      SELECT COUNT(*)::text AS cnt
      FROM import_staging_rows sr
      JOIN drivers d ON d.driver_number = (sr.mapped_json->>'driverNumber')
      WHERE sr.batch_id = $1
        AND sr.match_action = 'create'
        AND sr.status IN ('valid','warning')
        AND (sr.mapped_json->>'driverNumber') IS NOT NULL
    `, [batchId]);

    const conflicts = Math.max(
      parseInt(emailConflictRow?.cnt ?? "0"),
      parseInt(numConflictRow?.cnt  ?? "0"),
    );

    // Total active drivers in DB
    const { rows: [driverCountRow] } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM drivers WHERE archived_at IS NULL`
    );
    const totalDriversInDb = parseInt(driverCountRow?.cnt ?? "0");

    // Staleness — how long since validation ran
    const validatedAt  = batch.validatedAt ? new Date(batch.validatedAt as string) : null;
    const hoursStale   = validatedAt ? (Date.now() - validatedAt.getTime()) / 3600000 : 0;

    // Impact %
    const affected      = creates + updates;
    const impactPercent = totalDriversInDb > 0 ? Math.round((affected / totalDriversInDb) * 100) : 0;

    // Build blockers (hard stops) and advisories (soft warnings)
    const blockers:   string[] = [];
    const advisories: string[] = [];

    if (conflicts > 0) {
      blockers.push(
        `${conflicts} row${conflicts !== 1 ? "s" : ""} marked for creation now conflict with existing records in the database. Re-validate this batch to resolve before committing.`
      );
    }

    const errorRate = batch.totalRows > 0 ? errors / batch.totalRows : 0;
    if (errorRate > 0.25) {
      blockers.push(
        `${errors} of ${batch.totalRows} rows have errors (${Math.round(errorRate * 100)}%). Error rate exceeds 25% — review the file and re-upload.`
      );
    }

    if (hoursStale >= 2) {
      advisories.push(
        `Validation ran ${Math.round(hoursStale)} hour${Math.round(hoursStale) !== 1 ? "s" : ""} ago. Database records may have changed since this batch was validated.`
      );
    }

    if (impactPercent >= 80 && affected > 100) {
      advisories.push(
        `This import will affect ${impactPercent}% of active driver records (${affected.toLocaleString()} of ${totalDriversInDb.toLocaleString()}).`
      );
    }

    if (errorRate > 0.10 && errorRate <= 0.25) {
      advisories.push(
        `${errors} rows have validation errors (${Math.round(errorRate * 100)}% of total). These rows will be skipped during commit.`
      );
    }

    return res.json({
      creates, updates, skips, errors, conflicts,
      totalDriversInDb, impactPercent,
      blockers, advisories,
      safe: blockers.length === 0,
      hoursStale: Math.round(hoursStale * 10) / 10,
      validatedAt: batch.validatedAt,
    });
  } catch (err: any) {
    console.error("[DriverImport] Preflight error:", err);
    return res.status(500).json({ error: "PREFLIGHT_ERROR", message: err.message });
  }
});

router.post('/:batchId/commit', requireAdminForCommit, async (req: any, res: Response) => {
  try {
    const batchId = req.params.batchId;
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    if (!batch) return res.status(404).json({ error: 'NOT_FOUND' });
    if (batch.status === 'committing') return res.status(400).json({ error: 'ALREADY_PROCESSING', message: 'Commit is already in progress' });
    if (batch.status === 'validating') return res.status(409).json({ error: 'VALIDATION_IN_PROGRESS', message: 'Validation is still running. Please wait for it to complete before committing.' });
    if (batch.status !== 'validated') return res.status(400).json({ error: 'INVALID_STATUS', message: `Batch cannot be committed in its current state (status: "${batch.status}"). Complete validation first.` });

    const commitUser = (req as any).resolvedUser;

    // Store committing user identity so the server can auto-resume if it restarts mid-commit
    await db.update(importBatches).set({
      status: 'committing',
      processedRows: 0,
      startedAt: new Date(),
      committedByUserId: commitUser?.id ?? null,
      committedByEmail: commitUser?.email ?? null,
      committedByRole: commitUser?.role ?? null,
    }).where(eq(importBatches.id, batchId));
    const totalRows = batch.totalRows || 0;
    res.json({ status: 'committing', batchId, totalRows });

    runCommitBackground(batchId, commitUser?.id, commitUser?.email, commitUser?.role).catch(err => {
      console.error('[DriverImport] runCommitBackground uncaught:', err);
    });
  } catch (err: any) {
    console.error('[DriverImport] Commit error:', err);
    await db.update(importBatches).set({ status: 'failed' }).where(eq(importBatches.id, req.params.batchId)).catch(() => {});
    res.status(500).json({ error: 'COMMIT_FAILED', message: err.message });
  }
});



router.post("/:batchId/rollback", requireSuperAdminForImport, async (req: any, res: Response) => {
  const batchId = req.params.batchId;
  const user = (req as any).resolvedUser;
  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    if (!batch) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Import batch not found." });
    }
    if (batch.rolledBackAt) {
      return res.status(400).json({ error: "ALREADY_ROLLED_BACK", message: "This batch has already been rolled back." });
    }
    if (batch.status !== "committed") {
      return res.status(400).json({ error: "INVALID_STATUS", message: `Batch cannot be rolled back in its current state (status: "${batch.status}"). Only committed batches can be rolled back.` });
    }
    if (!batch.committedAt) {
      return res.status(400).json({ error: "INVALID_STATE", message: "Batch has no committedAt timestamp — cannot determine rollback window." });
    }
    const hoursSinceCommit = (Date.now() - new Date(batch.committedAt).getTime()) / 3600000;
    if (hoursSinceCommit > 24) {
      return res.status(400).json({ error: "ROLLBACK_WINDOW_EXPIRED", message: "The 24-hour rollback window has expired. Manual intervention required." });
    }

    const auditEntries = await db.select({
      driverId: importAuditLog.driverId,
      action: importAuditLog.action,
    }).from(importAuditLog)
      .where(and(eq(importAuditLog.batchId, batchId), or(
        eq(importAuditLog.action, "driver_create"),
        eq(importAuditLog.action, "driver_create_with_warnings"),
      )));

    const createdDriverIds = [...new Set(
      auditEntries
        .filter(e => e.driverId && (e.action === "driver_create" || e.action === "driver_create_with_warnings"))
        .map(e => e.driverId as string)
    )];

    let deactivated = 0;
    let updateOnlyRows = 0;

    if (createdDriverIds.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < createdDriverIds.length; i += CHUNK) {
        const chunk = createdDriverIds.slice(i, i + CHUNK);
        await db.update(drivers)
          .set({ status: "inactive", updatedAt: new Date() } as any)
          .where(inArray(drivers.id, chunk));
      }
      deactivated = createdDriverIds.length;
    }

    const allAuditEntries = await db.select({ action: importAuditLog.action })
      .from(importAuditLog).where(eq(importAuditLog.batchId, batchId));
    updateOnlyRows = allAuditEntries.filter(e => e.action === "driver_update" || e.action === "driver_update_with_warnings").length;

    await db.update(importBatches)
      .set({ status: "rolled_back" as any, rolledBackAt: new Date(), rollbackByUserId: user?.id })
      .where(eq(importBatches.id, batchId));

    await db.insert(importAuditLog).values({
      batchId,
      action: "rollback",
      message: `Rollback by ${user?.email || user?.id || "unknown"}: ${deactivated} driver(s) deactivated. ${updateOnlyRows} update-only row(s) not reverted (no pre-import snapshot available).`,
    } as any);

    console.log(`[DriverImport] Rollback complete — batch ${batchId}: ${deactivated} drivers deactivated, ${updateOnlyRows} updates not reverted. User: ${user?.email}`);

    try {
      const { writeSystemAuditEvent } = await import("../services/systemAuditLogService");
      await writeSystemAuditEvent({
        eventType: "import_rolled_back",
        actorUserId: user?.id,
        actorUserEmail: user?.email,
        targetEntityType: "driver_import",
        targetEntityId: batchId,
        metadata: { module: "drivers", batchId, driversDeactivated: deactivated, updateRowsNotReverted: updateOnlyRows },
      });
    } catch (_) {}

    return res.json({
      ok: true,
      batchId,
      driversDeactivated: deactivated,
      updateRowsNotReverted: updateOnlyRows,
      message: updateOnlyRows > 0
        ? `${deactivated} driver(s) deactivated. ${updateOnlyRows} update-only row(s) cannot be automatically reverted (no pre-import snapshot was saved).`
        : `${deactivated} driver(s) deactivated successfully.`,
    });
  } catch (err: any) {
    console.error(`[DriverImport] Rollback failed — batch ${batchId}, user ${user?.id}:`, err);
    return res.status(500).json({ error: "ROLLBACK_FAILED", message: err.message || "An unexpected error occurred during rollback." });
  }
});

// POST /:batchId/cancel — stop an active or stuck import
router.post("/:batchId/cancel", requireSuperAdminForImport, async (req: any, res: Response) => {
  try {
    const [batch] = await db.select().from(importBatches)
      .where(and(eq(importBatches.id, req.params.batchId), eq(importBatches.moduleType, "drivers")))
      .limit(1);
    if (!batch) return res.status(404).json({ error: "NOT_FOUND", message: "Batch not found" });

    const finalStatuses = ["committed", "cancelled", "rolled_back"];
    if (finalStatuses.includes(batch.status || "")) {
      return res.status(400).json({ error: "ALREADY_FINAL", message: `Cannot cancel a batch with status: ${batch.status}` });
    }

    // Actively processing: signal the background job to stop after the current row
    if (batch.status === "validating" || batch.status === "committing") {
      await db.update(importBatches).set({ status: "cancelling" }).where(eq(importBatches.id, batch.id));
      return res.json({ ok: true, status: "cancelling", message: "Cancel signal sent — will stop after the current row completes." });
    }

    // Stuck in any other non-final state (mapped, uploaded, validated, error, cancelling): force cancel immediately
    await db.update(importBatches).set({ status: "cancelled" }).where(eq(importBatches.id, batch.id));
    res.json({ ok: true, status: "cancelled", message: "Batch cancelled." });
  } catch (err: any) {
    console.error("[DriverImport] Cancel error:", err);
    res.status(500).json({ error: "CANCEL_FAILED", message: err.message });
  }
});

router.get("/:batchId/audit", isAuthenticated, async (req: any, res: Response) => {
  try {
    const logs = await db.select().from(importAuditLog)
      .where(eq(importAuditLog.batchId, req.params.batchId))
      .orderBy(importAuditLog.createdAt);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: "FETCH_FAILED", message: err.message });
  }
});

router.get("/:batchId/export-errors", isAuthenticated, async (req: any, res: Response) => {
  try {
    const batchId = req.params.batchId;
    const errorRows = await db.select().from(importStagingRows)
      .where(and(eq(importStagingRows.batchId, batchId), eq(importStagingRows.status, "error")))
      .orderBy(importStagingRows.rowIndex);

    if (errorRows.length === 0) {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="import-errors-${batchId.slice(0, 8)}.csv"`);
      return res.send("No failed rows");
    }

    const csvRows = errorRows.map(row => {
      const rawData = row.rawJson as Record<string, any>;
      const errors = (row.validationErrors as string[]) || [];
      return {
        Row: row.rowIndex,
        Status: "Failed",
        Reason: errors.join("; "),
        ...rawData,
      };
    });

    const ws = XLSX.utils.json_to_sheet(csvRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Failed Rows");
    const csvBuffer = XLSX.write(wb, { type: "buffer", bookType: "csv" });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="import-failed-rows-${batchId.slice(0, 8)}.csv"`);
    res.send(csvBuffer);
  } catch (err: any) {
    res.status(500).json({ error: "EXPORT_FAILED", message: err.message });
  }
});

router.get("/template/download", isAuthenticated, (_req: any, res: Response) => {
  try {
    const headers = DRIVER_FIELD_CATALOG.map(f => f.label);
    const sampleRow: Record<string, string> = {};
    DRIVER_FIELD_CATALOG.forEach(f => {
      if (f.key === "firstName") sampleRow[f.label] = "John";
      else if (f.key === "lastName") sampleRow[f.label] = "Doe";
      else if (f.key === "fullName") sampleRow[f.label] = "(optional — use instead of First/Last Name)";
      else if (f.key === "email") sampleRow[f.label] = "john.doe@example.com";
      else if (f.key === "driverNumber") sampleRow[f.label] = "DRV-001";
      else if (f.key === "phoneNumber") sampleRow[f.label] = "555-123-4567";
      else if (f.key === "dateOfBirth") sampleRow[f.label] = "1990-01-15";
      else if (f.key === "hireDate") sampleRow[f.label] = "2024-06-01";
      else if (f.key === "driverClassification") sampleRow[f.label] = "Employee";
      else if (f.key === "employeeId") sampleRow[f.label] = "EMP-001";
      else if (f.key === "independentContractorId") sampleRow[f.label] = "";
      else if (f.key === "status") sampleRow[f.label] = "active";
      else if (f.key === "terminationDate") sampleRow[f.label] = "";
      else if (f.key === "terminationReason") sampleRow[f.label] = "";
      else if (f.key === "terminationEligibleForRehire") sampleRow[f.label] = "";
      else if (f.key === "network") sampleRow[f.label] = "AUSTIN";
      else if (f.key === "market") sampleRow[f.label] = "Austin";
      else if (f.key === "basePayPerMile") sampleRow[f.label] = "25.00";
      else if (f.key === "fuelSurchargeRate") sampleRow[f.label] = "1.50";
      else if (f.key === "shiftPayRate") sampleRow[f.label] = "18.50";
      else if (f.key === "networkPayRate") sampleRow[f.label] = "22.00";
      else if (f.key === "lastPayDate") sampleRow[f.label] = "2024-12-15";
      else if (f.key === "drugTestDate") sampleRow[f.label] = "2024-05-01";
      else if (f.key === "backgroundCheckDate") sampleRow[f.label] = "2024-04-15";
      else if (f.key === "mvrDate") sampleRow[f.label] = "2024-03-20";
      else sampleRow[f.label] = "";
    });

    const ws = XLSX.utils.json_to_sheet([sampleRow], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Driver Import Template");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="driver-import-template.xlsx"');
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: "TEMPLATE_FAILED", message: err.message });
  }
});

router.get("/batches/list", isAuthenticated, async (req: any, res: Response) => {
  try {
    const batches = await db.select().from(importBatches)
      .orderBy(desc(importBatches.createdAt))
      .limit(50);
    res.json(batches);
  } catch (err: any) {
    res.status(500).json({ error: "FETCH_FAILED", message: err.message });
  }
});

/**
 * Called during server startup to automatically re-launch any commit that was
 * in-flight when the server previously restarted. Because runCommitBackground
 * skips already-committed staging rows, this is safe to call unconditionally —
 * it will pick up exactly where the last run left off.
 */
export async function resumeInFlightCommits(): Promise<void> {
  try {
    const inFlight = await db.select({
      id: importBatches.id,
      committedByUserId: importBatches.committedByUserId,
      committedByEmail: importBatches.committedByEmail,
      committedByRole: importBatches.committedByRole,
      startedAt: importBatches.startedAt,
    }).from(importBatches)
      .where(and(
        sql`${importBatches.status} = 'committing'`,
        sql`${importBatches.startedAt} < NOW() - INTERVAL '2 minutes'`,
        sql`${importBatches.committedByUserId} IS NOT NULL`,
      ));

    if (inFlight.length === 0) return;

    for (const batch of inFlight) {
      console.warn(`[ImportRecovery] Auto-resuming commit for batch ${batch.id} (originally started by ${batch.committedByEmail})`);
      // Reset startedAt so the next potential restart's 2-min window is accurate
      await db.update(importBatches).set({ startedAt: new Date() }).where(eq(importBatches.id, batch.id));
      runCommitBackground(batch.id, batch.committedByUserId!, batch.committedByEmail!, batch.committedByRole!).catch(err => {
        console.error(`[ImportRecovery] Auto-resume failed for batch ${batch.id}:`, err);
      });
    }
  } catch (err: any) {
    console.warn('[ImportRecovery] Could not auto-resume in-flight commits:', err?.message);
  }
}

export default router;
