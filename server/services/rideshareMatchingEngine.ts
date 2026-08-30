/**
 * Rideshare Account Matching Engine — Phase 1
 *
 * Extensible pipeline that matches ride pickup/dropoff addresses against
 * known account address references.
 *
 * Phase 1 implements: exact_normalized (Jaccard token-overlap)
 * Future phases: alias, future_fuzzy, future_geo
 *
 * Default billing rule:
 *   matched_account_id = dropoff account when available,
 *   else pickup account,
 *   else exception.
 *
 * Ambiguity rule:
 *   If 2+ different accounts score within AMBIGUITY_EPSILON of the top
 *   score AND that score is above MIN_EXCEPTION_THRESHOLD, the side is
 *   flagged ambiguous and the overall result is sent to exception status.
 */

import { db } from "../db";
import { accountAddressReference, customers } from "@shared/schema";
import { eq } from "drizzle-orm";

// ─── Thresholds (adjust without touching logic) ───────────────────────────────

/** Score at or above this → auto_matched */
const AUTO_MATCH_THRESHOLD   = 0.60;
/** Score at or above this but below AUTO_MATCH_THRESHOLD → exception */
const MIN_EXCEPTION_THRESHOLD = 0.40;
/** Two accounts within this delta of each other's top score → ambiguous */
const AMBIGUITY_EPSILON       = 0.02;

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchMethod =
  | "exact_normalized"  // Phase 1 — Jaccard token-overlap on normalized strings
  | "alias"             // Phase 2 (future) — known account aliases / alternate names
  | "future_fuzzy"      // Phase 3 (future) — edit-distance / n-gram fuzzy match
  | "future_geo";       // Phase 4 (future) — geospatial radius match

export type MatchStatus = "auto_matched" | "manual_matched" | "exception" | "unmatched";

/** One address entry from the account_address_reference table */
export interface AddressRefEntry {
  accountId: string;
  accountNumber: string | null;
  normalized: string;          // ready-to-compare string
  isBillingEligible: boolean;
}

/** Grouped view of all address entries for one account */
interface AddressRefAccount {
  accountId: string;
  accountNumber: string | null;
  entries: AddressRefEntry[];
}

/** Result of matching one side (pickup or dropoff) */
interface SideMatchResult {
  accountId: string | null;
  accountNumber: string | null;
  confidence: number;           // 0.0 – 1.0
  method: MatchMethod | null;
  isAmbiguous: boolean;         // true when 2+ accounts tie at top score
}

/** Full result returned by matchRideAddresses */
export interface MatchEngineResult {
  pickupAccountId: string | null;
  pickupAccountNumber: string | null;
  dropoffAccountId: string | null;
  dropoffAccountNumber: string | null;
  matchedAccountId: string | null;      // billing winner per default rule
  matchedAccountNumber: string | null;
  matchMethod: MatchMethod | null;
  matchConfidence: string | null;       // 4-decimal string e.g. "0.9200"
  matchStatus: MatchStatus;
  exceptionReason: string | null;
}

// ─── Phase definition (extensible) ───────────────────────────────────────────

/**
 * A matching phase takes one normalized ride address string and the full
 * account reference list, and returns the best SideMatchResult it can find.
 *
 * To add a new phase:
 *   1. Add its method name to MatchMethod above
 *   2. Implement a function with this signature
 *   3. Push it into MATCH_PHASES in order of priority
 */
type MatchPhaseFn = (
  normalizedRideAddress: string,
  accounts: AddressRefAccount[]
) => SideMatchResult;

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Canonical address normalizer shared by the engine and the parser.
 * Exported so callers can pre-normalize before storing.
 *
 * Normalization order matters:
 *  1. Strip known provider suffixes (", US", "United States")
 *  2. Lowercase
 *  3. Expand road-type abbreviations (consistent short form)
 *  4. Expand directional abbreviations (consistent short form)
 *  5. Strip punctuation and collapse whitespace
 */
export function normalizeAddress(s: string | null | undefined): string {
  if (!s) return "";
  return s
    // Strip trailing provider country suffix Uber/Lyft append
    .replace(/,?\s*(united states|usa|us)\s*$/i, "")
    // Lowercase everything
    .toLowerCase()
    // ── Road type abbreviations ───────────────────────────────────────────
    .replace(/\bstreet\b/g,    "st")
    .replace(/\bavenue\b/g,    "ave")
    .replace(/\broad\b/g,      "rd")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bdrive\b/g,     "dr")
    .replace(/\blane\b/g,      "ln")
    .replace(/\bcourt\b/g,     "ct")
    .replace(/\bplace\b/g,     "pl")
    .replace(/\bparkway\b/g,   "pkwy")
    .replace(/\bhighway\b/g,   "hwy")
    .replace(/\bcircle\b/g,    "cir")
    .replace(/\bterrace\b/g,   "ter")
    .replace(/\btrail\b/g,     "trl")
    .replace(/\bsquare\b/g,    "sq")
    // ── Cardinal direction normalization (compound first, then simple) ────
    .replace(/\bnortheast\b/g, "ne")
    .replace(/\bnorthwest\b/g, "nw")
    .replace(/\bsoutheast\b/g, "se")
    .replace(/\bsouthwest\b/g, "sw")
    .replace(/\bnorth\b/g, "n")
    .replace(/\bsouth\b/g, "s")
    .replace(/\beast\b/g,  "e")
    .replace(/\bwest\b/g,  "w")
    // ── Strip punctuation and collapse whitespace ─────────────────────────
    .replace(/[,.\-#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Phase 1: exact_normalized ────────────────────────────────────────────────

/**
 * Jaccard token-overlap similarity between two pre-normalized strings.
 * Returns 1.0 for exact string matches, 0.0 for completely disjoint sets.
 */
function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  let overlap = 0;
  for (const w of setA) { if (setB.has(w)) overlap++; }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : overlap / union;
}

/**
 * Phase 1 matcher.
 * Scores every address entry for every account, picks the top score per
 * account, then finds the winner and checks for ambiguity.
 */
const exactNormalizedPhase: MatchPhaseFn = (normalizedRideAddr, accounts) => {
  if (!normalizedRideAddr || accounts.length === 0) {
    return { accountId: null, accountNumber: null, confidence: 0, method: null, isAmbiguous: false };
  }

  // Score each account (best score across all its address entries)
  const scored: Array<{ acct: AddressRefAccount; score: number }> = [];

  for (const acct of accounts) {
    let bestForAccount = 0;
    for (const entry of acct.entries) {
      const s = jaccardSimilarity(normalizedRideAddr, entry.normalized);
      if (s > bestForAccount) bestForAccount = s;
    }
    if (bestForAccount > 0) {
      scored.push({ acct, score: bestForAccount });
    }
  }

  if (scored.length === 0) {
    return { accountId: null, accountNumber: null, confidence: 0, method: null, isAmbiguous: false };
  }

  // Sort descending
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];

  // Ambiguity check: are multiple accounts within AMBIGUITY_EPSILON of the top?
  const tied = scored.filter(s => top.score - s.score <= AMBIGUITY_EPSILON && s.acct.accountId !== top.acct.accountId);
  const isAmbiguous = tied.length > 0 && top.score >= MIN_EXCEPTION_THRESHOLD;

  return {
    accountId: top.acct.accountId,
    accountNumber: top.acct.accountNumber,
    confidence: top.score,
    method: "exact_normalized",
    isAmbiguous,
  };
};

/**
 * Ordered list of matching phases.  Engine runs phases in this order,
 * stopping at the first phase that produces a result above MIN_EXCEPTION_THRESHOLD.
 * Add future phases here — they must implement MatchPhaseFn.
 */
const MATCH_PHASES: Array<{ name: MatchMethod; fn: MatchPhaseFn }> = [
  { name: "exact_normalized", fn: exactNormalizedPhase },
  // { name: "alias",        fn: aliasPhase },       // Phase 2 placeholder
  // { name: "future_fuzzy", fn: fuzzyPhase },       // Phase 3 placeholder
  // { name: "future_geo",   fn: geoPhase },         // Phase 4 placeholder
];

// ─── Address Reference Loader ─────────────────────────────────────────────────

/**
 * Load all active account_address_reference rows and group them by account.
 * Falls back to customer primary address if the reference table is empty.
 *
 * Pass a pre-loaded list to avoid redundant DB calls when processing batches.
 */
export async function loadAddressRefs(): Promise<AddressRefAccount[]> {
  const refs = await db
    .select({
      accountId: accountAddressReference.accountId,
      accountNumber: accountAddressReference.accountNumber,
      addressNormalized: accountAddressReference.addressNormalized,
      addressRaw: accountAddressReference.addressRaw,
      isBillingEligible: accountAddressReference.isBillingEligible,
    })
    .from(accountAddressReference)
    .where(eq(accountAddressReference.isActive, true));

  if (refs.length > 0) {
    const byAccount = new Map<string, AddressRefAccount>();
    for (const r of refs) {
      if (!byAccount.has(r.accountId)) {
        byAccount.set(r.accountId, {
          accountId: r.accountId,
          accountNumber: r.accountNumber,
          entries: [],
        });
      }
      // Use stored normalized string; fall back to normalizing raw on-the-fly
      const normalized = r.addressNormalized
        ? r.addressNormalized.toLowerCase().trim()
        : normalizeAddress(r.addressRaw);
      if (normalized) {
        byAccount.get(r.accountId)!.entries.push({
          accountId: r.accountId,
          accountNumber: r.accountNumber,
          normalized,
          isBillingEligible: r.isBillingEligible ?? false,
        });
      }
    }
    return Array.from(byAccount.values());
  }

  // Fallback: derive address entries from the customer primary address fields.
  // We build up to THREE entries per account so both short (street-only) and
  // full (street+city+state+zip) ride addresses have a chance to match.
  const cust = await db
    .select({
      id: customers.id,
      customerNumber: customers.customerNumber,
      customerAddress: customers.customerAddress,
      customerCity: customers.customerCity,
      customerState: customers.customerState,
      customerZip: customers.customerZip,
    })
    .from(customers);

  return cust
    .filter(c => c.customerAddress)
    .map(c => {
      const street = c.customerAddress!;
      const parts = {
        full:        [street, c.customerCity, c.customerState, c.customerZip].filter(Boolean).join(", "),
        streetCity:  [street, c.customerCity].filter(Boolean).join(", "),
        streetOnly:  street,
      };

      const entries: AddressRefEntry[] = [];
      const seen = new Set<string>();

      for (const raw of [parts.full, parts.streetCity, parts.streetOnly]) {
        const normalized = normalizeAddress(raw);
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          entries.push({ accountId: c.id, accountNumber: c.customerNumber, normalized, isBillingEligible: false });
        }
      }

      return { accountId: c.id, accountNumber: c.customerNumber, entries };
    })
    .filter(a => a.entries.length > 0);
}

// ─── Side matcher ─────────────────────────────────────────────────────────────

/**
 * Run all phases against one side (pickup or dropoff) and return the first
 * result that clears MIN_EXCEPTION_THRESHOLD.
 */
function matchOneSide(
  rawAddress: string | null,
  accounts: AddressRefAccount[]
): SideMatchResult {
  if (!rawAddress) {
    return { accountId: null, accountNumber: null, confidence: 0, method: null, isAmbiguous: false };
  }

  const normalized = normalizeAddress(rawAddress);
  if (!normalized) {
    return { accountId: null, accountNumber: null, confidence: 0, method: null, isAmbiguous: false };
  }

  for (const phase of MATCH_PHASES) {
    const result = phase.fn(normalized, accounts);
    if (result.confidence >= MIN_EXCEPTION_THRESHOLD) {
      return result;
    }
  }

  return { accountId: null, accountNumber: null, confidence: 0, method: null, isAmbiguous: false };
}

// ─── Default billing rule ─────────────────────────────────────────────────────

/**
 * Determine the canonical matched_account_id from pickup and dropoff side results.
 *
 * Rule (Phase 1):
 *   1. Prefer dropoff when it has a confident auto-match (not ambiguous)
 *   2. Fall back to pickup when dropoff is absent but pickup is confident
 *   3. If the winning side is ambiguous → exception
 *   4. If neither side reaches AUTO_MATCH_THRESHOLD → exception or unmatched
 */
function applyBillingRule(
  pickup: SideMatchResult,
  dropoff: SideMatchResult
): {
  matchedAccountId: string | null;
  matchedAccountNumber: string | null;
  matchMethod: MatchMethod | null;
  matchConfidence: number;
  matchStatus: MatchStatus;
  exceptionReason: string | null;
} {
  const noResult = {
    matchedAccountId: null,
    matchedAccountNumber: null,
    matchMethod: null as MatchMethod | null,
    matchConfidence: 0,
    matchStatus: "unmatched" as MatchStatus,
    exceptionReason: null as string | null,
  };

  // Both below MIN threshold → unmatched
  if (pickup.confidence < MIN_EXCEPTION_THRESHOLD && dropoff.confidence < MIN_EXCEPTION_THRESHOLD) {
    return noResult;
  }

  // Prefer dropoff
  const winner = dropoff.confidence >= MIN_EXCEPTION_THRESHOLD ? dropoff : pickup;

  // Ambiguity on the winning side → exception
  if (winner.isAmbiguous) {
    return {
      ...noResult,
      matchStatus: "exception",
      exceptionReason: "Multiple accounts matched the same address with equal confidence — manual review required",
    };
  }

  // Winner exists but is below AUTO threshold → low-confidence exception
  if (winner.confidence < AUTO_MATCH_THRESHOLD) {
    return {
      matchedAccountId: winner.accountId,
      matchedAccountNumber: winner.accountNumber,
      matchMethod: winner.method,
      matchConfidence: winner.confidence,
      matchStatus: "exception",
      exceptionReason: `Match confidence too low (${(winner.confidence * 100).toFixed(0)}%) — address could not be reliably matched`,
    };
  }

  // Confident auto-match
  return {
    matchedAccountId: winner.accountId,
    matchedAccountNumber: winner.accountNumber,
    matchMethod: winner.method,
    matchConfidence: winner.confidence,
    matchStatus: "auto_matched",
    exceptionReason: null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface MatchRequest {
  pickupAddressRaw: string | null;
  dropoffAddressRaw: string | null;
}

/**
 * Match a single ride's pickup and dropoff addresses against active account
 * address references.
 *
 * @param request         Pickup and dropoff raw strings from the provider file
 * @param preloadedRefs   Optional pre-loaded account refs (use for batch imports
 *                        to avoid a DB query per row).  If omitted, the engine
 *                        loads refs from the database automatically.
 */
export async function matchRideAddresses(
  request: MatchRequest,
  preloadedRefs?: AddressRefAccount[]
): Promise<MatchEngineResult> {
  const { pickupAddressRaw, dropoffAddressRaw } = request;

  // Nothing to match at all
  if (!pickupAddressRaw && !dropoffAddressRaw) {
    return {
      pickupAccountId: null, pickupAccountNumber: null,
      dropoffAccountId: null, dropoffAccountNumber: null,
      matchedAccountId: null, matchedAccountNumber: null,
      matchMethod: null, matchConfidence: null,
      matchStatus: "unmatched",
      exceptionReason: "No address data in source row",
    };
  }

  // Load reference data once (caller can pass pre-loaded for batch efficiency)
  const accounts = preloadedRefs ?? await loadAddressRefs();

  // Match each side independently
  const pickupResult  = matchOneSide(pickupAddressRaw,  accounts);
  const dropoffResult = matchOneSide(dropoffAddressRaw, accounts);

  // Apply billing rule to determine the canonical matched account
  const billing = applyBillingRule(pickupResult, dropoffResult);

  // Populate per-side fields (only when above MIN_EXCEPTION_THRESHOLD)
  const pickupAccountId     = pickupResult.confidence  >= MIN_EXCEPTION_THRESHOLD ? pickupResult.accountId  : null;
  const pickupAccountNumber = pickupResult.confidence  >= MIN_EXCEPTION_THRESHOLD ? pickupResult.accountNumber : null;
  const dropoffAccountId    = dropoffResult.confidence >= MIN_EXCEPTION_THRESHOLD ? dropoffResult.accountId  : null;
  const dropoffAccountNumber= dropoffResult.confidence >= MIN_EXCEPTION_THRESHOLD ? dropoffResult.accountNumber : null;

  return {
    pickupAccountId,
    pickupAccountNumber,
    dropoffAccountId,
    dropoffAccountNumber,
    matchedAccountId:     billing.matchedAccountId,
    matchedAccountNumber: billing.matchedAccountNumber,
    matchMethod:          billing.matchMethod,
    matchConfidence:      billing.matchConfidence > 0
                            ? billing.matchConfidence.toFixed(4)
                            : null,
    matchStatus:          billing.matchStatus,
    exceptionReason:      billing.exceptionReason,
  };
}
