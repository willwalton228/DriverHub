/**
 * Rideshare Import Parser
 *
 * Provider-agnostic engine that:
 *   1. Parses CSV/XLSX uploads row-by-row
 *   2. Preserves every source column verbatim in rideshare_import_raw_rows.raw_row_json
 *   3. Maps provider-specific columns into rideshare_transactions (normalized)
 *   4. Delegates address matching to rideshareMatchingEngine (loaded once per batch)
 *   5. Writes audit metadata to rideshare_import_batches
 *   6. Flags bad rows individually — never aborts the whole batch on one failure
 *
 * ── Provider-specific format notes ───────────────────────────────────────────
 * UBER for Business exports:
 *   - 4 non-data lines precede the real column header row:
 *       Line 1: Company name
 *       Line 2: Administrator name
 *       Line 3: Report date
 *       Line 4: blank
 *   - Actual header starts with "Request Date (UTC), Request Time (UTC)..."
 *   - Missing values are represented by "--" — treated as null throughout.
 *
 * LYFT Business exports:
 *   - Standard CSV with header on the first row.
 *
 * To adjust for changed Uber/Lyft export formats, edit UBER_FIELD_MAP or
 * LYFT_FIELD_MAP — no other code changes required.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as XLSX from "xlsx";
import Papa from "papaparse";
import { db } from "../db";
import {
  rideshareImportBatches,
  rideshareImportRawRows,
  rideshareTransactions,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  matchRideAddresses,
  loadAddressRefs,
  normalizeAddress,
  type AddressRefAccount,
} from "./rideshareMatchingEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

/** One or more column header aliases to try (case-insensitive, trimmed). */
type FieldVariants = string[];

/**
 * Full provider field map.  Every field is optional — if a provider does not
 * expose a column, leave the field undefined and null will be stored.
 *
 * Add aliases to any array when a provider changes their export column names;
 * no logic changes are required.
 *
 * headerContains — strings that uniquely identify the real column-header row.
 * Used to skip provider-specific pre-header metadata lines (e.g. Uber Business
 * exports emit 4 non-data lines before the actual header).
 */
export interface ProviderFieldMap {
  headerContains?: string[];       // substring(s) that appear only in the real header row

  // Provider / trip identity
  providerTripId?: FieldVariants;
  providerStatementId?: FieldVariants;
  serviceType?: FieldVariants;
  rideStatus?: FieldVariants;
  programName?: FieldVariants;
  groupName?: FieldVariants;
  country?: FieldVariants;
  city?: FieldVariants;

  // Date / time — individual date+time columns (will be combined)
  rideDateCol?: FieldVariants;           // primary date  e.g. "Request Date (UTC)"
  rideTimeCol?: FieldVariants;           // primary time  e.g. "Request Time (UTC)"
  rideDatetimeCol?: FieldVariants;       // combined ISO / human-readable (if provider uses one col)
  transactionTimestampCol?: FieldVariants;
  requestDateLocalCol?: FieldVariants;
  requestTimeLocalCol?: FieldVariants;
  pickupDatetimeCol?: FieldVariants;
  dropoffDateCol?: FieldVariants;
  dropoffTimeCol?: FieldVariants;
  dropoffDatetimeCol?: FieldVariants;    // combined dropoff datetime (if provider uses one col)
  dropoffDateLocalCol?: FieldVariants;
  dropoffTimeLocalCol?: FieldVariants;
  timezoneOffsetCol?: FieldVariants;

  // People
  riderFirstName?: FieldVariants;
  riderLastName?: FieldVariants;
  riderName?: FieldVariants;             // pre-combined full name (Lyft-style)
  riderEmail?: FieldVariants;
  riderEmployeeReference?: FieldVariants;
  guestFirstName?: FieldVariants;
  guestLastName?: FieldVariants;

  // Addresses
  pickupAddressRaw?: FieldVariants;
  dropoffAddressRaw?: FieldVariants;
  stopDetailsRaw?: FieldVariants;
  hasMultipleStopsCol?: FieldVariants;

  // Trip metrics
  distanceMiles?: FieldVariants;
  durationMinutes?: FieldVariants;

  // Financial — canonical USD (maps to legacy billing fields shared across providers)
  totalFare?: FieldVariants;             // → totalFare  (Total Fare USD)
  baseFare?: FieldVariants;              // → baseFare
  tolls?: FieldVariants;
  fees?: FieldVariants;
  tips?: FieldVariants;                  // → tips (USD)
  taxes?: FieldVariants;
  currencyCode?: FieldVariants;

  // Financial — local currency
  transactionAmountLocal?: FieldVariants;
  baseFareLocal?: FieldVariants;
  bookingFeeLocal?: FieldVariants;
  airportFeeLocal?: FieldVariants;
  cityFeeLocal?: FieldVariants;
  tollFeeLocal?: FieldVariants;
  deliveryFeeLocal?: FieldVariants;
  discountsLocal?: FieldVariants;
  tipLocal?: FieldVariants;
  otherChargesLocal?: FieldVariants;
  totalFareLocal?: FieldVariants;
  totalTaxesLocal?: FieldVariants;
  employeeGuestPaymentLocal?: FieldVariants;
  membershipSavingsLocal?: FieldVariants;
  localCurrencyCode?: FieldVariants;

  // Financial — USD line items
  transactionAmountUsd?: FieldVariants;
  tipUsd?: FieldVariants;
  totalTaxesUsd?: FieldVariants;
  employeeGuestPaymentUsd?: FieldVariants;
  estimatedServiceTechFeeUsd?: FieldVariants;
  estimatedIntegrationFeeUsd?: FieldVariants;

  // Billing / reference
  expenseCode?: FieldVariants;
  expenseMemo?: FieldVariants;
  paymentMethod?: FieldVariants;
  invoicesReference?: FieldVariants;
  providerInvoiceNumber?: FieldVariants;
  voucherProgram?: FieldVariants;
  voucherProgramExpenseMemo?: FieldVariants;
  voucherLink?: FieldVariants;
  voucherPolicy?: FieldVariants;
  voucherCampaignId?: FieldVariants;
  integrationPartner?: FieldVariants;

  // Additional source preservation
  fulfillmentType?: FieldVariants;
  cancellationType?: FieldVariants;
  isGroupOrderCol?: FieldVariants;
  storeName?: FieldVariants;
  orderItemsRaw?: FieldVariants;

  // Column AB — trip/move reference (primary operational linkage field)
  tripMoveRef?: FieldVariants;
}

export interface ParsedRow {
  // Identity
  providerTripId: string | null;
  providerStatementId: string | null;
  serviceType: string | null;
  rideStatus: string | null;
  programName: string | null;
  groupName: string | null;
  country: string | null;
  city: string | null;

  // Date / time
  rideDate: string | null;             // YYYY-MM-DD derived from rideDatetime
  rideDatetime: Date | null;           // UTC canonical request time
  transactionTimestampUtc: Date | null;
  requestDatetimeLocal: Date | null;
  pickupDatetime: Date | null;
  dropoffDatetime: Date | null;        // UTC
  dropoffDatetimeLocal: Date | null;
  timezoneOffset: string | null;

  // People
  riderFirstName: string | null;
  riderLastName: string | null;
  riderName: string | null;
  riderEmail: string | null;
  riderEmployeeReference: string | null;
  guestName: string | null;

  // Addresses
  pickupAddressRaw: string | null;
  dropoffAddressRaw: string | null;
  stopDetailsRaw: string | null;
  hasMultipleStops: boolean | null;

  // Trip metrics
  distanceMiles: string | null;
  durationMinutes: number | null;

  // Financial — canonical USD
  totalFare: string | null;
  baseFare: string | null;
  tolls: string | null;
  fees: string | null;
  tips: string | null;
  taxes: string | null;
  currencyCode: string | null;

  // Financial — local currency
  transactionAmountLocal: string | null;
  baseFareLocal: string | null;
  bookingFeeLocal: string | null;
  airportFeeLocal: string | null;
  cityFeeLocal: string | null;
  tollFeeLocal: string | null;
  deliveryFeeLocal: string | null;
  discountsLocal: string | null;
  tipLocal: string | null;
  otherChargesLocal: string | null;
  totalFareLocal: string | null;
  totalTaxesLocal: string | null;
  employeeGuestPaymentLocal: string | null;
  membershipSavingsLocal: string | null;
  localCurrencyCode: string | null;

  // Financial — USD
  transactionAmountUsd: string | null;
  tipUsd: string | null;
  totalTaxesUsd: string | null;
  employeeGuestPaymentUsd: string | null;
  estimatedServiceTechFeeUsd: string | null;
  estimatedIntegrationFeeUsd: string | null;

  // Billing / reference
  expenseCode: string | null;
  expenseMemo: string | null;
  paymentMethod: string | null;
  invoicesReference: string | null;
  providerInvoiceNumber: string | null;
  voucherProgram: string | null;
  voucherProgramExpenseMemo: string | null;
  voucherLink: string | null;
  voucherPolicy: string | null;
  voucherCampaignId: string | null;
  integrationPartner: string | null;

  // Additional source preservation
  fulfillmentType: string | null;
  cancellationType: string | null;
  isGroupOrder: boolean | null;
  storeName: string | null;
  orderItemsRaw: string | null;

  // Column AB — trip/move reference
  tripMoveRef: string | null;
}

export interface ImportBatchResult {
  batchId: string;
  provider: string;
  totalRows: number;
  parsedRows: number;
  matchedRows: number;
  exceptionRows: number;
  failedRows: number;
  transactionIds: string[];
  rowErrors: Array<{ rowNumber: number; reason: string }>;
}

// ─── Provider Field Maps ──────────────────────────────────────────────────────

/**
 * Uber for Business CSV / XLSX export.
 *
 * Column headers match the exact strings from the Uber Business export spec.
 * Multiple aliases are listed for resilience against minor format changes.
 *
 * headerContains: Uber Business files have 4 non-data lines before the real
 * header.  These strings uniquely identify the actual header row so the parser
 * can skip the preamble automatically.
 */
export const UBER_FIELD_MAP: ProviderFieldMap = {
  headerContains: ["request date (utc)", "trip/eats id"],

  // ── Provider / trip identity ────────────────────────────────────────────────
  providerTripId:         ["trip/eats id", "trip uuid", "trip id"],
  providerStatementId:    ["network transaction id", "network_transaction_id"],
  serviceType:            ["service"],
  rideStatus:             ["transaction type"],
  programName:            ["program"],
  groupName:              ["group"],
  country:                ["country"],
  city:                   ["city"],

  // ── Date / time ─────────────────────────────────────────────────────────────
  // Request Date (UTC) + Request Time (UTC) → rideDatetime (UTC canonical)
  rideDateCol:            ["request date (utc)"],
  rideTimeCol:            ["request time (utc)"],
  transactionTimestampCol: ["transaction timestamp (utc)"],
  requestDateLocalCol:    ["request date (local)"],
  requestTimeLocalCol:    ["request time (local)"],
  dropoffDateCol:         ["drop-off date (utc)"],
  dropoffTimeCol:         ["drop-off time (utc)"],
  dropoffDateLocalCol:    ["drop-off date (local)"],
  dropoffTimeLocalCol:    ["drop-off time (local)"],
  timezoneOffsetCol:      ["request timezone offset from utc"],

  // ── People ───────────────────────────────────────────────────────────────────
  riderFirstName:         ["first name"],
  riderLastName:          ["last name"],
  // riderName is computed from first + last in parseProviderRow
  riderEmail:             ["email"],
  riderEmployeeReference: ["employee id"],
  guestFirstName:         ["guest first name"],
  guestLastName:          ["guest last name"],

  // ── Addresses ────────────────────────────────────────────────────────────────
  pickupAddressRaw:       ["pickup address"],
  dropoffAddressRaw:      ["drop-off address"],
  stopDetailsRaw:         ["stop details"],
  hasMultipleStopsCol:    ["multiple stops"],

  // ── Trip metrics ─────────────────────────────────────────────────────────────
  distanceMiles:          ["distance (mi)"],
  durationMinutes:        ["duration (min)"],

  // ── Financial — canonical USD ─────────────────────────────────────────────────
  // These map to the shared cross-provider financial fields.
  totalFare:              ["total fare usd"],
  baseFare:               ["trip/meal fare (local currency)"],  // best proxy for base fare
  tips:                   ["tip in usd"],
  taxes:                  ["total taxes usd"],
  currencyCode:           ["local currency code"],

  // ── Financial — local currency ────────────────────────────────────────────────
  transactionAmountLocal:       ["transaction amount (local currency)"],
  baseFareLocal:                ["trip/meal fare (local currency)"],
  bookingFeeLocal:              ["booking fee/service fee (local currency)"],
  airportFeeLocal:              ["airport fee (local currency)"],
  cityFeeLocal:                 ["city fee (local currency)"],
  tollFeeLocal:                 ["toll fee (local currency)"],
  deliveryFeeLocal:             ["delivery fee (local currency)"],
  discountsLocal:               ["promotions/discounts (local currency)"],
  tipLocal:                     ["tip in local currency"],
  otherChargesLocal:            ["other charges(local currency)", "other charges (local currency)"],
  totalFareLocal:               ["total fare (local currency)"],
  totalTaxesLocal:              ["total taxes (local currency)"],
  employeeGuestPaymentLocal:    ["payments made by employees/guests (local currency)"],
  membershipSavingsLocal:       ["membership savings(local currency)", "membership savings (local currency)"],
  localCurrencyCode:            ["local currency code"],

  // ── Financial — USD line items ────────────────────────────────────────────────
  transactionAmountUsd:         ["transaction amount usd"],
  tipUsd:                       ["tip in usd"],
  totalTaxesUsd:                ["total taxes usd"],
  employeeGuestPaymentUsd:      ["payments made by employees/guests (usd currency)"],
  estimatedServiceTechFeeUsd:   ["estimated service and technology fee (incl. taxes, if any) in usd"],
  estimatedIntegrationFeeUsd:   ["estimated integration fee (incl. taxes, if any) in usd"],

  // ── Billing / reference ───────────────────────────────────────────────────────
  expenseCode:              ["expense code"],
  expenseMemo:              ["expense memo"],
  paymentMethod:            ["payment method"],
  invoicesReference:        ["invoices"],
  providerInvoiceNumber:    ["invoice number"],
  voucherProgram:           ["voucher program"],
  voucherProgramExpenseMemo:["voucher program expense memo"],
  voucherLink:              ["voucher link"],
  voucherPolicy:            ["voucher policy"],
  voucherCampaignId:        ["voucher campaign id"],
  integrationPartner:       ["integration partner"],

  // ── Additional source fields ──────────────────────────────────────────────────
  fulfillmentType:    ["fulfilment type", "fulfillment type"],
  cancellationType:   ["cancellation type"],
  isGroupOrderCol:    ["isgrouporder", "is group order", "is_group_order"],
  storeName:          ["store name"],
  orderItemsRaw:      ["order items"],

  // ── Column AB — trip/move reference (primary operational linkage field) ───────
  // Uber for Business exposes this as a custom cost center, project code, or
  // internal reference field. Multiple aliases listed for resilience.
  tripMoveRef:        ["cost center", "cost_center", "trip reference", "move reference",
                       "trip/move reference", "trip move reference", "internal reference",
                       "internal_reference", "project code", "project_code",
                       "rider reference", "rider_reference", "custom field",
                       "external id", "external_id"],
};

/**
 * Lyft Business CSV / XLSX export — standard header on row 1.
 */
export const LYFT_FIELD_MAP: ProviderFieldMap = {
  // No headerContains needed — Lyft has no pre-header lines

  providerTripId:         ["trip id", "uuid", "ride id", "id"],
  providerStatementId:    ["statement id", "invoice id", "statement_id"],
  serviceType:            ["ride type", "product", "type", "ride_type"],
  rideStatus:             ["status", "ride status"],

  rideDateCol:            ["date", "ride date"],
  rideTimeCol:            ["time", "pickup time"],
  rideDatetimeCol:        ["requested at", "request time", "ride datetime"],
  pickupDatetimeCol:      ["pickup time", "pickup_time"],
  dropoffDatetimeCol:     ["dropoff time", "drop-off time"],

  riderName:              ["passenger name", "passenger", "rider name", "rider"],
  riderEmail:             ["passenger email", "email", "rider email"],
  riderEmployeeReference: ["employee id", "cost center", "employee number"],

  pickupAddressRaw:       ["pickup location", "pickup address", "pickup", "from", "origin"],
  dropoffAddressRaw:      ["drop-off location", "dropoff location", "drop-off address", "dropoff address", "to", "destination"],

  totalFare:              ["amount", "payment", "total", "amount charged", "trip cost"],
  baseFare:               ["requested", "base fare", "subtotal", "base amount"],
  tolls:                  ["tolls"],
  fees:                   ["fees", "service fee"],
  tips:                   ["tip", "tip amount"],
  taxes:                  ["taxes", "tax"],
  currencyCode:           ["currency", "currency code"],
};

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Resolve a value from a raw row using the first matching alias (case-insensitive). */
function pick(raw: Record<string, string>, variants?: FieldVariants): string | null {
  if (!variants || variants.length === 0) return null;
  const keys = Object.keys(raw);
  for (const v of variants) {
    const found = keys.find(k => k.toLowerCase().trim() === v.toLowerCase());
    if (found !== undefined) {
      const val = raw[found]?.trim();
      return val || null;
    }
  }
  return null;
}

/**
 * Return null for blank values or Uber's "--" sentinel.
 * Used to ensure missing provider values are stored as NULL, not as "--".
 */
function clean(val: string | null | undefined): string | null {
  if (!val) return null;
  const t = val.trim();
  if (t === "" || t === "--" || t === "-" || t.toLowerCase() === "n/a") return null;
  return t;
}

/** Wrap pick() + clean() for a single call. */
function get(raw: Record<string, string>, variants?: FieldVariants): string | null {
  return clean(pick(raw, variants));
}

/** Strip currency symbols, commas, and leading +; return 2-decimal string or null. */
function parseMoney(val: string | null): string | null {
  if (!val) return null;
  const n = parseFloat(val.replace(/[$,+\s]/g, ""));
  return isNaN(n) ? null : n.toFixed(2);
}

/**
 * Build a Date from one or two strings (date-only, or date + time).
 * Returns null when the result is not a valid date.
 */
function buildDatetime(dateStr: string | null, timeStr?: string | null): Date | null {
  const ds = clean(dateStr);
  if (!ds) return null;
  const combined = timeStr ? `${ds} ${timeStr.trim()}` : ds;
  const d = new Date(combined);
  return isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD string from a Date, or null. */
function toDateStr(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Join non-empty name parts with a space; return null when both are empty. */
function joinNames(...parts: (string | null | undefined)[]): string | null {
  const joined = parts.map(p => clean(p ?? null)).filter(Boolean).join(" ");
  return joined || null;
}

/** Parse a boolean from provider string values: true/yes/1 → true, false/no/0 → false. */
function parseBoolean(val: string | null): boolean | null {
  if (!val) return null;
  const v = val.trim().toLowerCase();
  if (v === "true" || v === "yes" || v === "1") return true;
  if (v === "false" || v === "no" || v === "0") return false;
  return null;
}

/** Parse integer; return null on failure. */
function parseInteger(val: string | null): number | null {
  if (!val) return null;
  const n = parseInt(val.trim(), 10);
  return isNaN(n) ? null : n;
}

// ─── Row Parser ───────────────────────────────────────────────────────────────

/**
 * Map one raw provider row into the normalized ParsedRow shape.
 *
 * Never throws — returns null fields for anything it cannot parse.
 * Missing Uber values ("--") are converted to null via clean().
 */
export function parseProviderRow(
  provider: "uber" | "lyft",
  raw: Record<string, string>
): ParsedRow {
  const map = provider === "uber" ? UBER_FIELD_MAP : LYFT_FIELD_MAP;
  const g = (variants?: FieldVariants) => get(raw, variants);
  const m = (variants?: FieldVariants) => parseMoney(g(variants));

  // ── Date / time ────────────────────────────────────────────────────────────

  // rideDatetime: prefer combined column, else build from date+time split
  const rideDateStr  = g(map.rideDateCol);
  const rideTimeStr  = g(map.rideTimeCol);
  const combinedStr  = g(map.rideDatetimeCol);
  const rideDatetime = buildDatetime(combinedStr) ?? buildDatetime(rideDateStr, rideTimeStr);

  const transactionTimestampUtc = buildDatetime(g(map.transactionTimestampCol));
  const requestDatetimeLocal    = buildDatetime(g(map.requestDateLocalCol), g(map.requestTimeLocalCol));
  const pickupDatetime          = buildDatetime(g(map.pickupDatetimeCol));

  // dropoffDatetime: prefer combined, else split UTC; Lyft may use rideDatetimeCol for dropoff
  const dropoffCombined    = g(map.dropoffDatetimeCol);
  const dropoffDatetime    = buildDatetime(dropoffCombined)
    ?? buildDatetime(g(map.dropoffDateCol), g(map.dropoffTimeCol));
  const dropoffDatetimeLocal = buildDatetime(g(map.dropoffDateLocalCol), g(map.dropoffTimeLocalCol));

  // ── People ────────────────────────────────────────────────────────────────

  const riderFirstName = g(map.riderFirstName);
  const riderLastName  = g(map.riderLastName);

  // riderName: use explicit combined field (Lyft) or build from first+last (Uber)
  const riderName =
    g(map.riderName) ??
    joinNames(riderFirstName, riderLastName);

  const guestName = joinNames(g(map.guestFirstName), g(map.guestLastName));

  // ── Booleans ──────────────────────────────────────────────────────────────

  const hasMultipleStops = parseBoolean(g(map.hasMultipleStopsCol));
  const isGroupOrder     = parseBoolean(g(map.isGroupOrderCol));

  return {
    // Identity
    providerTripId:         g(map.providerTripId),
    providerStatementId:    g(map.providerStatementId),
    serviceType:            g(map.serviceType),
    rideStatus:             g(map.rideStatus),
    programName:            g(map.programName),
    groupName:              g(map.groupName),
    country:                g(map.country),
    city:                   g(map.city),

    // Date / time
    rideDate:               toDateStr(rideDatetime ?? pickupDatetime),
    rideDatetime,
    transactionTimestampUtc,
    requestDatetimeLocal,
    pickupDatetime,
    dropoffDatetime,
    dropoffDatetimeLocal,
    timezoneOffset:         g(map.timezoneOffsetCol),

    // People
    riderFirstName,
    riderLastName,
    riderName,
    riderEmail:             g(map.riderEmail),
    riderEmployeeReference: g(map.riderEmployeeReference),
    guestName,

    // Addresses
    pickupAddressRaw:   g(map.pickupAddressRaw),
    dropoffAddressRaw:  g(map.dropoffAddressRaw),
    stopDetailsRaw:     g(map.stopDetailsRaw),
    hasMultipleStops,

    // Trip metrics
    distanceMiles:   m(map.distanceMiles) ? parseMoney(g(map.distanceMiles)) : null,
    durationMinutes: parseInteger(g(map.durationMinutes)),

    // Financial — canonical USD
    totalFare:   m(map.totalFare),
    baseFare:    m(map.baseFare),
    tolls:       m(map.tolls),
    fees:        m(map.fees),
    tips:        m(map.tips),
    taxes:       m(map.taxes),
    currencyCode: g(map.currencyCode) ?? "USD",

    // Financial — local currency
    transactionAmountLocal:    m(map.transactionAmountLocal),
    baseFareLocal:             m(map.baseFareLocal),
    bookingFeeLocal:           m(map.bookingFeeLocal),
    airportFeeLocal:           m(map.airportFeeLocal),
    cityFeeLocal:              m(map.cityFeeLocal),
    tollFeeLocal:              m(map.tollFeeLocal),
    deliveryFeeLocal:          m(map.deliveryFeeLocal),
    discountsLocal:            m(map.discountsLocal),
    tipLocal:                  m(map.tipLocal),
    otherChargesLocal:         m(map.otherChargesLocal),
    totalFareLocal:            m(map.totalFareLocal),
    totalTaxesLocal:           m(map.totalTaxesLocal),
    employeeGuestPaymentLocal: m(map.employeeGuestPaymentLocal),
    membershipSavingsLocal:    m(map.membershipSavingsLocal),
    localCurrencyCode:         g(map.localCurrencyCode),

    // Financial — USD
    transactionAmountUsd:        m(map.transactionAmountUsd),
    tipUsd:                      m(map.tipUsd),
    totalTaxesUsd:               m(map.totalTaxesUsd),
    employeeGuestPaymentUsd:     m(map.employeeGuestPaymentUsd),
    estimatedServiceTechFeeUsd:  m(map.estimatedServiceTechFeeUsd),
    estimatedIntegrationFeeUsd:  m(map.estimatedIntegrationFeeUsd),

    // Billing / reference
    expenseCode:               g(map.expenseCode),
    expenseMemo:               g(map.expenseMemo),
    paymentMethod:             g(map.paymentMethod),
    invoicesReference:         g(map.invoicesReference),
    providerInvoiceNumber:     g(map.providerInvoiceNumber),
    voucherProgram:            g(map.voucherProgram),
    voucherProgramExpenseMemo: g(map.voucherProgramExpenseMemo),
    voucherLink:               g(map.voucherLink),
    voucherPolicy:             g(map.voucherPolicy),
    voucherCampaignId:         g(map.voucherCampaignId),
    integrationPartner:        g(map.integrationPartner),

    // Additional source preservation
    fulfillmentType:  g(map.fulfillmentType),
    cancellationType: g(map.cancellationType),
    isGroupOrder,
    storeName:        g(map.storeName),
    orderItemsRaw:    g(map.orderItemsRaw),

    // Column AB — trip/move reference
    tripMoveRef:      g(map.tripMoveRef),
  };
}

// ─── File Parser ──────────────────────────────────────────────────────────────

/**
 * Scan rows (as 2-D arrays) to find the first row whose cells contain one of
 * the headerContains signals.  Returns the 0-based row index, or 0 if not found.
 */
function findHeaderRowIndex(rows: string[][], signals: string[]): number {
  const lower = signals.map(s => s.toLowerCase());
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const rowLower = rows[i].map(c => String(c ?? "").toLowerCase().trim());
    if (lower.some(sig => rowLower.some(cell => cell.includes(sig)))) {
      return i;
    }
  }
  return 0;
}

/**
 * Parse a buffer (CSV or XLSX) into an array of raw string-keyed objects.
 *
 * When headerContains is provided the parser auto-detects the real header row
 * and discards any preamble lines before it (e.g. Uber Business metadata).
 *
 * Every source column is preserved — unknown columns are passed through
 * automatically, satisfying the raw-preservation requirement.
 */
function parseFileBuffer(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  headerContains?: string[]
): Record<string, string>[] {
  const isXlsx =
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    originalName.toLowerCase().endsWith(".xlsx") ||
    originalName.toLowerCase().endsWith(".xls");

  if (isXlsx) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];

    if (headerContains && headerContains.length > 0) {
      // Read as 2-D array to locate the real header row
      const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
      const headerIdx = findHeaderRowIndex(matrix, headerContains);
      return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
        defval: "",
        range: headerIdx,  // row headerIdx becomes the column header
      });
    }

    return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
  }

  // ── CSV ──────────────────────────────────────────────────────────────────
  const csvText = buffer.toString("utf-8");

  if (headerContains && headerContains.length > 0) {
    const lines = csvText.split("\n");
    const signals = headerContains.map(s => s.toLowerCase());
    let headerIdx = 0;
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const lineLower = lines[i].toLowerCase();
      if (signals.some(s => lineLower.includes(s))) {
        headerIdx = i;
        break;
      }
    }
    const relevantCsv = lines.slice(headerIdx).join("\n");
    const parsed = Papa.parse<Record<string, string>>(relevantCsv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });
    return parsed.data;
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });
  return parsed.data;
}

// ─── Main Import Function ─────────────────────────────────────────────────────

export interface RunImportOptions {
  provider: "uber" | "lyft";
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  uploadedByUserId?: string | null;
}

/**
 * Full import pipeline:
 *   1. Create rideshare_import_batches record (status: parsing)
 *   2. Load active account address references once for the whole batch
 *   3. Parse file into raw rows (skipping provider pre-header if needed)
 *   4. For each row:
 *      a. Insert rideshare_import_raw_rows (full verbatim JSON — every column)
 *      b. Parse into normalized fields
 *      c. Run matching engine (uses pre-loaded refs — no per-row DB query)
 *      d. Insert rideshare_transactions with all match + extended fields
 *      e. On any row-level error: mark row as failed, continue
 *   5. Update batch counters and set final status
 *
 * Batch counts returned:
 *   totalRows / parsedRows / matchedRows / exceptionRows / failedRows
 *
 * Never throws for row-level failures.  Only throws for fatal errors
 * (file unparseable, DB unreachable).
 */
export async function runRideshareImport(opts: RunImportOptions): Promise<ImportBatchResult> {
  const { provider, buffer, originalName, mimeType, uploadedByUserId } = opts;

  const fileType = originalName.toLowerCase().endsWith(".xlsx") ? "xlsx"
    : originalName.toLowerCase().endsWith(".xls") ? "xls"
    : "csv";

  // ── 1. Create batch record ──────────────────────────────────────────────────
  const [batch] = await db.insert(rideshareImportBatches).values({
    provider,
    sourceFileName: originalName,
    sourceFileType: fileType,
    uploadedByUserId: uploadedByUserId ?? null,
    processingStatus: "parsing",
    uploadedAt: new Date(),
  }).returning();

  const batchId = batch.id;

  // ── 2. Pre-load account address references (once for the whole batch) ───────
  let addressRefs: AddressRefAccount[] = [];
  try {
    addressRefs = await loadAddressRefs();
    console.log(`[RideshareParser] Batch ${batchId}: loaded ${addressRefs.length} account address refs`);
  } catch (err: any) {
    console.warn(`[RideshareParser] Batch ${batchId}: could not load address refs (matching disabled): ${err.message}`);
  }

  // ── 3. Parse file ──────────────────────────────────────────────────────────
  const fieldMap = provider === "uber" ? UBER_FIELD_MAP : LYFT_FIELD_MAP;
  let rawRows: Record<string, string>[];
  try {
    rawRows = parseFileBuffer(buffer, originalName, mimeType, fieldMap.headerContains);
  } catch (err: any) {
    await db.update(rideshareImportBatches)
      .set({ processingStatus: "failed", notes: `File parse error: ${err.message}`, updatedAt: new Date() })
      .where(eq(rideshareImportBatches.id, batchId));
    throw new Error(`File parse error: ${err.message}`);
  }

  if (rawRows.length === 0) {
    await db.update(rideshareImportBatches)
      .set({ processingStatus: "failed", notes: "File contained no data rows", updatedAt: new Date() })
      .where(eq(rideshareImportBatches.id, batchId));
    throw new Error("File contained no data rows");
  }

  await db.update(rideshareImportBatches)
    .set({ totalRows: rawRows.length, processingStatus: "parsed", updatedAt: new Date() })
    .where(eq(rideshareImportBatches.id, batchId));

  // ── 4. Process each row ────────────────────────────────────────────────────
  let parsedCount    = 0;
  let matchedCount   = 0;
  let exceptionCount = 0;
  let failedCount    = 0;
  const transactionIds: string[] = [];
  const rowErrors: Array<{ rowNumber: number; reason: string }> = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 1;
    const rawRow = rawRows[i];

    // ── 4a. Save verbatim raw row (every source column preserved) ─────────────
    let rawRowRecord: { id: string } | null = null;
    try {
      const [inserted] = await db.insert(rideshareImportRawRows).values({
        importBatchId: batchId,
        rowNumber,
        provider,
        rawRowJson: rawRow as any,
        processingStatus: "new",
      }).returning({ id: rideshareImportRawRows.id });
      rawRowRecord = inserted;
    } catch (err: any) {
      const reason = `Raw row insert failed: ${err.message}`;
      console.error(`[RideshareParser] Batch ${batchId} row ${rowNumber}: ${reason}`);
      rowErrors.push({ rowNumber, reason });
      failedCount++;
      continue;
    }

    // ── 4b. Parse normalized fields ───────────────────────────────────────────
    let parsed: ParsedRow;
    try {
      parsed = parseProviderRow(provider, rawRow);
    } catch (err: any) {
      const reason = `Field mapping failed: ${err.message}`;
      console.error(`[RideshareParser] Batch ${batchId} row ${rowNumber}: ${reason}`);
      rowErrors.push({ rowNumber, reason });
      await db.update(rideshareImportRawRows)
        .set({ processingStatus: "failed", failureReason: reason, updatedAt: new Date() })
        .where(eq(rideshareImportRawRows.id, rawRowRecord.id));
      failedCount++;
      continue;
    }

    // ── 4c. Run matching engine (pre-loaded refs, no per-row DB query) ─────────
    let match: Awaited<ReturnType<typeof matchRideAddresses>>;
    try {
      match = await matchRideAddresses(
        { pickupAddressRaw: parsed.pickupAddressRaw, dropoffAddressRaw: parsed.dropoffAddressRaw },
        addressRefs,
      );
    } catch (err: any) {
      console.warn(`[RideshareParser] Batch ${batchId} row ${rowNumber}: match error (continuing): ${err.message}`);
      match = {
        pickupAccountId: null, pickupAccountNumber: null,
        dropoffAccountId: null, dropoffAccountNumber: null,
        matchedAccountId: null, matchedAccountNumber: null,
        matchMethod: null, matchConfidence: null,
        matchStatus: "unmatched",
        exceptionReason: `Matching engine error: ${err.message}`,
      };
    }

    // ── 4d. Insert rideshare_transactions (all fields) ────────────────────────
    try {
      const [tx] = await db.insert(rideshareTransactions).values({
        importBatchId: batchId,
        rawRowId: rawRowRecord.id,
        provider,
        recordSource: provider === "uber" ? "uber_import" : "lyft_import",

        // Identity
        providerTripId:         parsed.providerTripId         ?? undefined,
        providerStatementId:    parsed.providerStatementId    ?? undefined,
        serviceType:            parsed.serviceType            ?? undefined,
        rideStatus:             parsed.rideStatus             ?? undefined,
        programName:            parsed.programName            ?? undefined,
        groupName:              parsed.groupName              ?? undefined,
        country:                parsed.country                ?? undefined,
        city:                   parsed.city                   ?? undefined,

        // Date / time
        rideDate:                    parsed.rideDate                    ?? undefined,
        rideDatetime:                parsed.rideDatetime                ?? undefined,
        transactionTimestampUtc:     parsed.transactionTimestampUtc     ?? undefined,
        requestDatetimeLocal:        parsed.requestDatetimeLocal        ?? undefined,
        pickupDatetime:              parsed.pickupDatetime              ?? undefined,
        dropoffDatetime:             parsed.dropoffDatetime             ?? undefined,
        dropoffDatetimeLocal:        parsed.dropoffDatetimeLocal        ?? undefined,
        timezoneOffset:              parsed.timezoneOffset              ?? undefined,

        // People
        riderFirstName:         parsed.riderFirstName         ?? undefined,
        riderLastName:          parsed.riderLastName          ?? undefined,
        riderName:              parsed.riderName              ?? undefined,
        riderEmail:             parsed.riderEmail             ?? undefined,
        riderEmployeeReference: parsed.riderEmployeeReference ?? undefined,
        guestName:              parsed.guestName              ?? undefined,

        // Addresses
        pickupAddressRaw:  parsed.pickupAddressRaw  ?? undefined,
        dropoffAddressRaw: parsed.dropoffAddressRaw ?? undefined,
        stopDetailsRaw:    parsed.stopDetailsRaw    ?? undefined,
        hasMultipleStops:  parsed.hasMultipleStops  ?? undefined,
        pickupAddressNormalized:  parsed.pickupAddressRaw  ? normalizeAddress(parsed.pickupAddressRaw)  : undefined,
        dropoffAddressNormalized: parsed.dropoffAddressRaw ? normalizeAddress(parsed.dropoffAddressRaw) : undefined,

        // Trip metrics
        distanceMiles:   parsed.distanceMiles  ?? undefined,
        durationMinutes: parsed.durationMinutes ?? undefined,

        // Per-side match results
        pickupAccountId:      match.pickupAccountId      ?? undefined,
        pickupAccountNumber:  match.pickupAccountNumber  ?? undefined,
        dropoffAccountId:     match.dropoffAccountId     ?? undefined,
        dropoffAccountNumber: match.dropoffAccountNumber ?? undefined,

        // Billing winner
        matchedAccountId:     match.matchedAccountId     ?? undefined,
        matchedAccountNumber: match.matchedAccountNumber ?? undefined,
        matchMethod:          match.matchMethod          ?? undefined,
        matchConfidence:      match.matchConfidence      ?? undefined,
        matchStatus:          match.matchStatus,
        exceptionReason:      match.exceptionReason      ?? undefined,

        // Financial — canonical USD
        totalFare:   parsed.totalFare   ?? undefined,
        baseFare:    parsed.baseFare    ?? undefined,
        tolls:       parsed.tolls       ?? undefined,
        fees:        parsed.fees        ?? undefined,
        tips:        parsed.tips        ?? undefined,
        taxes:       parsed.taxes       ?? undefined,
        currencyCode: parsed.currencyCode ?? "USD",

        // Financial — local currency
        transactionAmountLocal:    parsed.transactionAmountLocal    ?? undefined,
        baseFareLocal:             parsed.baseFareLocal             ?? undefined,
        bookingFeeLocal:           parsed.bookingFeeLocal           ?? undefined,
        airportFeeLocal:           parsed.airportFeeLocal           ?? undefined,
        cityFeeLocal:              parsed.cityFeeLocal              ?? undefined,
        tollFeeLocal:              parsed.tollFeeLocal              ?? undefined,
        deliveryFeeLocal:          parsed.deliveryFeeLocal          ?? undefined,
        discountsLocal:            parsed.discountsLocal            ?? undefined,
        tipLocal:                  parsed.tipLocal                  ?? undefined,
        otherChargesLocal:         parsed.otherChargesLocal         ?? undefined,
        totalFareLocal:            parsed.totalFareLocal            ?? undefined,
        totalTaxesLocal:           parsed.totalTaxesLocal           ?? undefined,
        employeeGuestPaymentLocal: parsed.employeeGuestPaymentLocal ?? undefined,
        membershipSavingsLocal:    parsed.membershipSavingsLocal    ?? undefined,
        localCurrencyCode:         parsed.localCurrencyCode         ?? undefined,

        // Financial — USD
        transactionAmountUsd:       parsed.transactionAmountUsd       ?? undefined,
        tipUsd:                     parsed.tipUsd                     ?? undefined,
        totalTaxesUsd:              parsed.totalTaxesUsd              ?? undefined,
        employeeGuestPaymentUsd:    parsed.employeeGuestPaymentUsd    ?? undefined,
        estimatedServiceTechFeeUsd: parsed.estimatedServiceTechFeeUsd ?? undefined,
        estimatedIntegrationFeeUsd: parsed.estimatedIntegrationFeeUsd ?? undefined,

        // Billing / reference
        expenseCode:               parsed.expenseCode               ?? undefined,
        expenseMemo:               parsed.expenseMemo               ?? undefined,
        paymentMethod:             parsed.paymentMethod             ?? undefined,
        invoicesReference:         parsed.invoicesReference         ?? undefined,
        providerInvoiceNumber:     parsed.providerInvoiceNumber     ?? undefined,
        voucherProgram:            parsed.voucherProgram            ?? undefined,
        voucherProgramExpenseMemo: parsed.voucherProgramExpenseMemo ?? undefined,
        voucherLink:               parsed.voucherLink               ?? undefined,
        voucherPolicy:             parsed.voucherPolicy             ?? undefined,
        voucherCampaignId:         parsed.voucherCampaignId         ?? undefined,
        integrationPartner:        parsed.integrationPartner        ?? undefined,

        // Additional source preservation
        fulfillmentType:  parsed.fulfillmentType  ?? undefined,
        cancellationType: parsed.cancellationType ?? undefined,
        isGroupOrder:     parsed.isGroupOrder     ?? undefined,
        storeName:        parsed.storeName        ?? undefined,
        orderItemsRaw:    parsed.orderItemsRaw    ?? undefined,

        billingStatus: "unreviewed",
      }).returning({ id: rideshareTransactions.id });

      transactionIds.push(tx.id);
      parsedCount++;

      // Update raw row status to reflect match outcome
      const rawStatus = match.matchStatus === "auto_matched" ? "matched"
        : match.matchStatus === "exception" ? "exception"
        : "parsed";

      await db.update(rideshareImportRawRows)
        .set({ processingStatus: rawStatus, updatedAt: new Date() })
        .where(eq(rideshareImportRawRows.id, rawRowRecord.id));

      if (match.matchStatus === "auto_matched") matchedCount++;
      else exceptionCount++;

    } catch (err: any) {
      const reason = `Transaction insert failed: ${err.message}`;
      console.error(`[RideshareParser] Batch ${batchId} row ${rowNumber}: ${reason}`);
      rowErrors.push({ rowNumber, reason });
      await db.update(rideshareImportRawRows)
        .set({ processingStatus: "failed", failureReason: reason, updatedAt: new Date() })
        .where(eq(rideshareImportRawRows.id, rawRowRecord.id));
      failedCount++;
    }
  }

  // ── 5. Finalize batch ──────────────────────────────────────────────────────
  const finalStatus = failedCount === rawRows.length ? "failed"
    : exceptionCount === 0 ? "completed"
    : "matched";

  await db.update(rideshareImportBatches).set({
    processingStatus: finalStatus,
    totalRows:     rawRows.length,
    parsedRows:    parsedCount,
    matchedRows:   matchedCount,
    exceptionRows: exceptionCount,
    failedRows:    failedCount,
    updatedAt:     new Date(),
  }).where(eq(rideshareImportBatches.id, batchId));

  console.log(
    `[RideshareParser] Batch ${batchId} complete: ` +
    `total=${rawRows.length} parsed=${parsedCount} matched=${matchedCount} ` +
    `exceptions=${exceptionCount} failed=${failedCount}`
  );

  return {
    batchId,
    provider,
    totalRows:     rawRows.length,
    parsedRows:    parsedCount,
    matchedRows:   matchedCount,
    exceptionRows: exceptionCount,
    failedRows:    failedCount,
    transactionIds,
    rowErrors,
  };
}
