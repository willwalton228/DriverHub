/**
 * nameParsingService.ts
 *
 * DriverHub Name Mapping & Record Matching Standard
 * Implements the canonical name transformation rules defined in the platform spec:
 *   - Full name → first + last name parsing
 *   - Edge case detection and review flagging
 *   - Name normalization for matching (not for storage)
 */

export interface ParsedName {
  firstName: string;
  lastName: string;
  sourceFullNameRaw: string;
  nameParseReviewRequired: boolean;
  parseEdgeCaseReason?: string;
}

/** Suffixes that indicate a name review is needed */
const SUFFIX_TOKENS = new Set(["jr", "sr", "ii", "iii", "iv", "v", "esq", "phd", "md", "dds", "jd"]);

/** Common multi-part surname prefixes */
const MULTI_PART_PREFIXES = new Set([
  "de", "del", "dela", "di", "du", "da", "do",
  "van", "von", "der", "den", "le", "la", "los", "las",
  "mc", "mac", "o'", "st", "st.",
]);

/**
 * Parse a full name string into structured first + last name fields.
 * Uses the canonical rule: last token = last_name, everything else = first_name.
 * Flags records for review when edge cases are detected.
 */
export function parseFullName(rawName: string): ParsedName {
  const sourceFullNameRaw = rawName;

  // Trim and collapse internal spaces
  const cleaned = rawName.trim().replace(/\s+/g, " ");

  if (!cleaned) {
    return {
      firstName: "",
      lastName: "",
      sourceFullNameRaw,
      nameParseReviewRequired: true,
      parseEdgeCaseReason: "BLANK_NAME",
    };
  }

  // Flag: contains comma (likely "Last, First" format)
  if (cleaned.includes(",")) {
    // Attempt "Last, First" parse
    const parts = cleaned.split(",").map((p) => p.trim());
    const lastName = parts[0] || "";
    const firstName = parts[1] || "";
    return {
      firstName,
      lastName,
      sourceFullNameRaw,
      nameParseReviewRequired: true,
      parseEdgeCaseReason: "COMMA_SEPARATED_FORMAT",
    };
  }

  const tokens = cleaned.split(" ");

  // Single token — can't determine first vs last
  if (tokens.length === 1) {
    return {
      firstName: cleaned,
      lastName: "",
      sourceFullNameRaw,
      nameParseReviewRequired: true,
      parseEdgeCaseReason: "SINGLE_TOKEN_NAME",
    };
  }

  // Detect unusual punctuation (beyond apostrophes and hyphens, which are normal)
  if (/[^a-zA-Z\s'\-\.]/u.test(cleaned)) {
    // Still attempt parse but flag
    const lastName = tokens[tokens.length - 1];
    const firstName = tokens.slice(0, tokens.length - 1).join(" ");
    return {
      firstName,
      lastName,
      sourceFullNameRaw,
      nameParseReviewRequired: true,
      parseEdgeCaseReason: "UNUSUAL_PUNCTUATION",
    };
  }

  // Detect excessive tokens (6+)
  if (tokens.length >= 6) {
    const lastName = tokens[tokens.length - 1];
    const firstName = tokens.slice(0, tokens.length - 1).join(" ");
    return {
      firstName,
      lastName,
      sourceFullNameRaw,
      nameParseReviewRequired: true,
      parseEdgeCaseReason: "EXCESSIVE_TOKENS",
    };
  }

  // Detect trailing suffix tokens (Jr, Sr, II, III, etc.)
  const lastToken = tokens[tokens.length - 1].toLowerCase().replace(/\.$/, "");
  if (SUFFIX_TOKENS.has(lastToken)) {
    // The actual last_name is the second-to-last token; suffix is preserved in first_name block
    const lastName = tokens.length >= 3 ? tokens[tokens.length - 2] : tokens[0];
    const firstName = tokens.length >= 3
      ? tokens.slice(0, tokens.length - 2).join(" ") + " " + tokens[tokens.length - 1]
      : tokens.slice(0, tokens.length - 1).join(" ");
    return {
      firstName: firstName.trim(),
      lastName,
      sourceFullNameRaw,
      nameParseReviewRequired: true,
      parseEdgeCaseReason: "NAME_SUFFIX_DETECTED",
    };
  }

  // Detect likely multi-part surname prefix (De La Cruz, Van Houten, etc.)
  if (tokens.length >= 3) {
    const secondToLast = tokens[tokens.length - 2].toLowerCase();
    if (MULTI_PART_PREFIXES.has(secondToLast)) {
      const lastName = tokens.slice(tokens.length - 2).join(" ");
      const firstName = tokens.slice(0, tokens.length - 2).join(" ");
      return {
        firstName,
        lastName,
        sourceFullNameRaw,
        nameParseReviewRequired: true,
        parseEdgeCaseReason: "MULTI_PART_SURNAME",
      };
    }
  }

  // Standard rule: last token = last_name, everything before = first_name
  const lastName = tokens[tokens.length - 1];
  const firstName = tokens.slice(0, tokens.length - 1).join(" ");
  return {
    firstName,
    lastName,
    sourceFullNameRaw,
    nameParseReviewRequired: false,
  };
}

/**
 * Normalize a name string for comparison purposes ONLY.
 * DO NOT store normalized values — use only for matching.
 */
export function normalizeNameForMatching(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")            // collapse spaces
    .replace(/[''`]/g, "'")          // normalize apostrophes
    .replace(/\./g, "")              // remove dots (St. → St)
    .replace(/\bjr\.?\b/g, "")       // strip common suffixes
    .replace(/\bsr\.?\b/g, "")
    .replace(/\b(ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")            // collapse again after removals
    .trim();
}

/**
 * Compare two name strings using normalization.
 * Returns true if they are considered equivalent.
 */
export function namesMatch(a: string, b: string): boolean {
  return normalizeNameForMatching(a) === normalizeNameForMatching(b);
}

/**
 * Build a display full name from structured first + last.
 */
export function buildFullName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}
